import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { schnorr } from "@noble/curves/secp256k1.js"
import { hexToBytes } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { signFixture } from "./signTestFixtures"
import attack from "./fixtures/bip143-agent-op-hit.json"
import { resetSignedContextReplayCacheForTests, signedOperationContextMessage } from "./operationContext"
import { commitUnlockedVmk, lockVault } from "./vaultLifecycle"
import { CHANNEL, VERSION } from "./rpc"
import { bytesToBase64, SIGN_SCHEME_SCHNORR_SECP256K1_BIP340 as RAW, SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH as TAP, type SignatureScheme } from "./vaultCrypto"

// Only simulate the user-click DOM surface and same-origin authorization-window
// ceremony. Crypto, real main.ts RPC handlers, policy, VMK, context verification,
// replay storage and signature return path all run unchanged.
vi.mock("./operationUi", async (original) => {
  const actual = await original<typeof import("./operationUi")>()
  return {
    ...actual,
    runExclusiveOperation: async (operation: (signal: AbortSignal) => unknown) => operation(new AbortController().signal),
    confirmOperationInActiveSlot: async (_prompt: unknown, _signal: unknown, _surface: unknown, activate: () => Promise<void>) => activate(),
  }
})

type Reply = { id: string; ok: boolean; result?: { scheme: string; signature: string }; error?: { code: string } }
const messages = new EventTarget()
const replies = new Map<string, (value: Reply) => void>()
const ceremonies: Array<{ passkey: string; prompt: { challenge: string; body: { text: string } } }> = []
let refuseCeremony = false
let duringCeremony: (() => Promise<void>) | undefined
const parent = {
  postMessage(value: Reply) { replies.get(value.id)?.(value) },
}
function dispatch(origin: string, source: unknown, data: unknown) {
  const event = new Event("message")
  Object.assign(event, { origin, source, data })
  messages.dispatchEvent(event)
}
const sandboxOrigin = "https://sandbox.avibe.bot"
const fakeWindow = {
  location: { origin: sandboxOrigin, href: sandboxOrigin, search: "" },
  self: {}, top: {}, parent,
  addEventListener: messages.addEventListener.bind(messages),
  removeEventListener: messages.removeEventListener.bind(messages),
  open(url: string) {
    const id = new URL(url).searchParams.get("id")!
    const popup = {
      closed: false, close: vi.fn(), focus: vi.fn(),
      postMessage: (message: { request: { passkey: string; prompt: { challenge: string; body: { text: string } } } }) => {
        ceremonies.push(message.request)
        void (async () => {
          await duringCeremony?.()
          dispatch(sandboxOrigin, popup, refuseCeremony
            ? { type: "authorization-error", id, code: "passkey_cancelled" }
            : { type: "authorization-approved", id, result: { kind: "confirmed" } })
        })()
      },
    }
    queueMicrotask(() => dispatch(sandboxOrigin, popup, { type: "authorization-ready", id }))
    return popup
  },
}

async function rpc(op: string, payload: unknown): Promise<Reply> {
  const id = crypto.randomUUID()
  const result = new Promise<Reply>((resolve) => replies.set(id, resolve))
  dispatch("https://app.avibe.bot", parent, { channel: CHANNEL, version: VERSION, id, op, payload })
  return result.finally(() => replies.delete(id))
}

beforeAll(async () => {
  const store = new Map<string, string>()
  vi.stubGlobal("window", fakeWindow)
  vi.stubGlobal("document", { body: { classList: { add: vi.fn() } }, documentElement: { getAttribute: () => "dark" } })
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() } })
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) })
  await import("./main")
  expect((await rpc("handshake", { parentOrigin: "https://app.avibe.bot", nonce: "public-test-nonce-123456" })).ok).toBe(true)
})
beforeEach(() => { ceremonies.length = 0; refuseCeremony = false; duringCeremony = undefined })
afterEach(() => { lockVault(); resetSignedContextReplayCacheForTests() })
afterAll(() => { vi.unstubAllGlobals() })

async function fixture(scheme: SignatureScheme = RAW) {
  const f = await signFixture(scheme)
  commitUnlockedVmk({ vmk: new Uint8Array(f.vmk), wrapMeta: f.wrapMeta, scopeId: "test-only-sign-rpc", freshSetup: false })
  return f
}

describe("actual main.ts signing RPC", () => {
  it("returns a valid raw signature only after fresh UV, binds the full request and consumes replay ID", async () => {
    const f = await fixture(RAW)
    const first = await rpc("sign", f.request)
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true })
    expect(ceremonies).toHaveLength(1)
    expect(ceremonies[0].passkey).toBe("uv")
    expect(ceremonies[0].prompt.challenge).toBe(bytesToBase64(sha256(new TextEncoder().encode(signedOperationContextMessage(f.request.context)))))
    expect(schnorr.verify(hexToBytes(first.result!.signature), hexToBytes(f.request.signingContext.digest), schnorr.getPublicKey(f.key))).toBe(true)
    const second = await rpc("sign", f.request)
    expect(second).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(ceremonies).toHaveLength(1)
  })

  it("rejects keypath scheme before passkey instead of advertising unsupported protected Bitcoin signing", async () => {
    const f = await fixture()
    const result = await rpc("sign", { ...f.request, scheme: TAP })
    expect(result).toMatchObject({ ok: false, error: { code: "unsupported_protected_signing_scheme" } })
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })

  it("rejects the concrete unprefixed Bitcoin preimage before passkey", async () => {
    const f = await fixture("ecdsa-secp256k1-der")
    const result = await rpc("sign", { ...f.request, signingContext: attack.signing_context })
    expect(result.ok).toBe(false)
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })

  it("returns no signature when the fresh-passkey ceremony is cancelled", async () => {
    const f = await fixture()
    refuseCeremony = true
    const result = await rpc("sign", f.request)
    expect(result).toMatchObject({ ok: false, error: { code: "passkey_cancelled" } })
    expect(result.result).toBeUndefined()
  })

  it("rechecks expiry after approval and returns no signature", async () => {
    const f = await fixture()
    duringCeremony = async () => {
      const now = Date.now()
      vi.spyOn(Date, "now").mockReturnValue(now + 120_000)
    }
    try {
      const result = await rpc("sign", f.request)
      expect(result).toMatchObject({ ok: false, error: { code: "context_expired" } })
      expect(result.result).toBeUndefined()
    } finally { vi.restoreAllMocks() }
  })

  it.each(["scheme", "digest", "publicKey", "signingContext", "missingBinding"])("never returns a signature for parent-tampered %s", async (field) => {
    const f = await fixture()
    if (field === "scheme") f.request.scheme = "ecdsa-secp256k1-der"
    if (field === "digest") f.request.signingContext.digest = "11".repeat(32)
    if (field === "publicKey") f.request.context.release!.publicKey = `02${"11".repeat(32)}`
    if (field === "signingContext") f.request.signingContext = { ...f.request.signingContext, canonicalPreimage: "attack" } as never
    if (field === "missingBinding") delete f.request.context.release
    const result = await rpc("sign", f.request)
    expect(result.ok).toBe(false)
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })

  it("rejects forged matching release before fresh UV", async () => {
    const f = await fixture()
    f.request.scheme = "ecdsa-secp256k1-der"
    f.request.context.release!.scheme = "ecdsa-secp256k1-der"
    const result = await rpc("sign", f.request)
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_context_signature" } })
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })
})
