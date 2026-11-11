import { readFileSync, writeFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { schnorr } from "@noble/curves/secp256k1.js"
import { ed25519 } from "@noble/curves/ed25519.js"
import { hexToBytes, bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { signFixture } from "./signTestFixtures"
import attack from "./fixtures/bip143-agent-op-hit.json"
import { resetSignedContextReplayCacheForTests, signedOperationContextMessage } from "./operationContext"
import { commitUnlockedVmk, lockVault } from "./vaultLifecycle"
import { BUILD, CHANNEL, VERSION } from "./rpc"
import { bytesToBase64, packProtectedRecord, sealProtected, unpackProtectedRecord, openProtected, signDigest, SIGN_SCHEME_SCHNORR_SECP256K1_BIP340 as RAW, SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH as TAP, type SignatureScheme, type ProtectedRecordEnvelope } from "./vaultCrypto"
import { verifyBitcoinSigningContext, type BitcoinSigningContext } from "./bitcoin"
import coreFixture from "./fixtures/vault-protected-bitcoin-core.json"

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
    const id = new URLSearchParams(new URL(url).hash.slice(1)).get("id")!
    const popup = {
      closed: false, close: vi.fn(), focus: vi.fn(),
      postMessage: (message: { request: { passkey: string; prompt: { challenge: string; body: { text: string } } } }) => {
        ceremonies.push(message.request)
        void (async () => {
          await duringCeremony?.()
          dispatch(sandboxOrigin, popup, refuseCeremony
            ? { type: "authorization-error", build: BUILD, id, code: "passkey_cancelled" }
            : { type: "authorization-approved", build: BUILD, id, result: { kind: "confirmed" } })
        })()
      },
    }
    queueMicrotask(() => dispatch(sandboxOrigin, popup, { type: "authorization-ready", build: BUILD, id }))
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

async function fixture(scheme: SignatureScheme = RAW, privateKey?: Uint8Array) {
  const f = await signFixture(scheme, privateKey)
  commitUnlockedVmk({ vmk: new Uint8Array(f.vmk), wrapMeta: f.wrapMeta, scopeId: "test-only-sign-rpc", freshSetup: false })
  return f
}

async function bitcoinFixture(context: BitcoinSigningContext, scalar: string) {
  const f = await fixture(TAP, hexToBytes(scalar))
  f.request.signingContext = structuredClone(context)
  f.request.context.release!.scheme = TAP
  f.request.context.release!.digest = context.digest
  f.request.context.release!.signingContext = structuredClone(context)
  f.resign()
  return f
}

const bitcoinContext = (vector: typeof coreFixture.cases[number]): BitcoinSigningContext => ({
  kind: "bitcoin-taproot-keypath-v1", network: "signet", unsignedTransaction: vector.unsigned_tx_hex,
  prevout: { amountSats: vector.funding.spent_output_value_sats, scriptPubKey: vector.funding.spent_output_script_hex },
  digestAlgorithm: "bip341-sighash-default-keypath", digest: vector.expected.taproot_digest_hex,
})

describe("actual main.ts signing RPC", () => {
  it("generates Ed25519 only inside the sandbox and returns no seed", async () => {
    const f = await fixture()
    const response = await rpc("seal", { name: "PUBLIC_SOLANA_KEY", kind: "keypair", curve: "ed25519", wrapMeta: f.wrapMeta })
    expect(response.ok).toBe(true)
    const result = response.result as unknown as { publicKey: string; envelope: ProtectedRecordEnvelope; addresses: { solana: string } }
    expect(result.publicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(result.addresses.solana).toBeTruthy()
    expect(response.result).not.toHaveProperty("privateKey")
    const unpacked = unpackProtectedRecord(result.envelope)
    expect(unpacked.recordMetadata).toEqual({ kind: "keypair", public_key: result.publicKey, curve: "ed25519" })
    const seed = await openProtected(unpacked.sealed, f.vmk, { name: "PUBLIC_SOLANA_KEY", kind: "keypair", curve: "ed25519", publicKey: result.publicKey })
    try { expect(bytesToHex(ed25519.getPublicKey(seed))).toBe(result.publicKey) } finally { seed.fill(0) }
    expect(ceremonies).toHaveLength(0)
  })

  it("fails closed before UV for Solana exact-message and generic Ed25519 requests", async () => {
    const f = await fixture()
    const seed = new Uint8Array(32).fill(0x12) // Public synthetic test seed, never a real credential.
    const publicKey = bytesToHex(ed25519.getPublicKey(seed))
    const record = { name: f.request.material.name, kind: "keypair" as const, curve: "ed25519" as const, publicKey }
    const signingContext = { kind: "solana-transaction-v1", messageHex: "72" }
    f.request.context.release = { name: record.name, scheme: "ed25519", messageHex: "72", publicKey, signingContext }
    f.resign()
    const request = { ...f.request, scheme: "ed25519", signingContext,
      material: { name: record.name, envelope: packProtectedRecord(await sealProtected(seed, f.vmk, record), f.wrapMeta, record) } }
    seed.fill(0)
    expect(await rpc("sign", request)).toMatchObject({ ok: false, error: { code: "unsupported_signing_context" } })
    expect(await rpc("sign", { ...request, signingContext: f.request.signingContext })).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    expect(await rpc("sign", { ...f.request, scheme: "ed25519" })).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    expect(ceremonies).toHaveLength(0)
  })

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

  it.each(coreFixture.cases)("signs bounded Bitcoin $id through the actual R3 RPC path", async (vector) => {
    const key = coreFixture.keys.find((key) => key.id === vector.signing_key_id)!
    const context = bitcoinContext(vector)
    const f = await bitcoinFixture(context, key.public_secret_scalar_hex)
    const result = await rpc("sign", f.request)
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
    const verified = verifyBitcoinSigningContext(context, context.digest, f.publicKey)
    expect(schnorr.verify(hexToBytes(result.result!.signature), hexToBytes(context.digest), verified.outputKeyXOnly)).toBe(true)
    expect(bytesToHex(verified.outputKeyXOnly)).toBe(key.output_xonly_hex)
    expect(ceremonies).toHaveLength(1)
    expect(ceremonies[0].passkey).toBe("uv")
    expect(ceremonies[0].prompt.body.text).toContain("not chain proof")
    expect(ceremonies[0].prompt.challenge).toBe(bytesToBase64(sha256(new TextEncoder().encode(signedOperationContextMessage(f.request.context)))))
    expect(await rpc("sign", f.request)).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(ceremonies).toHaveLength(1)
  })

  // Optional hermetic Core gate. scripts/core-acceptance.py creates disposable
  // regtest coins and independent digests. Only the actual RPC signs positive
  // and plausible-false-amount requests; the primitive-only negatives are named.
  it.skipIf(!process.env.AVIBE_TEST_CORE_INPUT)("produces actual RPC signatures for isolated Core acceptance", async () => {
    const inputs = JSON.parse(readFileSync(process.env.AVIBE_TEST_CORE_INPUT!, "utf8")) as Array<{
      id: string; publicScalarHex: string; context: BitcoinSigningContext;
      falseAmount: BitcoinSigningContext; falseScript: BitcoinSigningContext;
    }>
    const results = []
    for (const input of inputs) {
      expect([1n, 2n, 6n, 11n]).toContain(BigInt(`0x${input.publicScalarHex}`))
      const f = await bitcoinFixture(input.context, input.publicScalarHex)
      const good = await rpc("sign", f.request)
      expect(good).toMatchObject({ ok: true })
      expect(ceremonies.at(-1)!.passkey).toBe("uv")
      const falseAmount = await bitcoinFixture(input.falseAmount, input.publicScalarHex)
      const wrongAmount = await rpc("sign", falseAmount.request)
      expect(wrongAmount).toMatchObject({ ok: true })
      const falseScript = await bitcoinFixture(input.falseScript, input.publicScalarHex)
      const count = ceremonies.length
      expect(await rpc("sign", falseScript.request)).toMatchObject({ ok: false })
      expect(ceremonies).toHaveLength(count)
      results.push({ id: input.id, rpc: good.result, falseAmountRpc: wrongAmount.result,
        falseScriptPrimitive: signDigest(input.publicScalarHex, input.falseScript.digest, TAP),
        rawPrimitive: signDigest(input.publicScalarHex, input.context.digest, RAW) })
    }
    writeFileSync(process.env.AVIBE_TEST_CORE_OUTPUT!, JSON.stringify(results, null, 2) + "\n")
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
