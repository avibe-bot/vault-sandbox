import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { hexToBytes } from "@noble/curves/utils.js"
import { hashTypedData } from "viem"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument } from "./testDom"
import { bytesToBase64, buildWrapMeta, deriveSigningAddresses, protectRootMetadata, withRootMetadata, withWrapMetaMetadata } from "./vaultCrypto"
import { hdEnvelopeFingerprint } from "./protectedHd"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { signedOperationContextMessage } from "./operationContext"
import { commitUnlockedVmk, lockVault, rememberWrapMeta, resetVaultSessionForTests, vaultStatus, withUnlockedVmk } from "./vaultLifecycle"
import { BUILD, CHANNEL, VERSION } from "./rpc"

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const vector = vectors.cases[0]
const ceremonies: Array<{ passkey: string }> = []
let duringCeremony: ((passkey: string) => void | Promise<void>) | undefined
const prompts: Array<{ body?: { text?: string }; review?: unknown }> = []

vi.mock("./operationUi", async (original) => {
  const actual = await original<typeof import("./operationUi")>()
  return {
    ...actual,
    runExclusiveOperation: async (operation: (signal: AbortSignal) => unknown) => operation(new AbortController().signal),
    confirmOperationInActiveSlot: async (_card: unknown, _signal: unknown, _surface: unknown, activate: () => Promise<void>) => activate(),
  }
})

type Reply = { id: string; ok: boolean; result?: { scheme: string; signature: string; recovery_id: number | null }; error?: { code: string } }
const messages = new EventTarget()
const replies = new Map<string, (reply: Reply) => void>()
const parent = { postMessage: (value: Reply) => { if (value?.id) replies.get(value.id)?.(value) } }
const nav = { locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() } }
const fakeWindow = {
  location: { origin, hostname: "sandbox.avibe.bot", href: origin, search: "", hash: "" },
  self: {}, top: {}, parent,
  addEventListener: messages.addEventListener.bind(messages), removeEventListener: messages.removeEventListener.bind(messages),
  open(url: string) {
    const id = new URLSearchParams(new URL(url).hash.slice(1)).get("id")!
    const popup = {
      closed: false, close: vi.fn(), focus: vi.fn(),
      postMessage(message: { request: { passkey: string; prompt: { body?: { text?: string }; review?: unknown } } }) {
        ceremonies.push({ passkey: message.request.passkey })
        prompts.push(structuredClone(message.request.prompt))
        const result = message.request.passkey === "unlock"
          ? { kind: "unlock", prfOutput: bytesToBase64(new Uint8Array(32).fill(0x22)), prfSalt: bytesToBase64(new Uint8Array(32).fill(0x33)) }
          : { kind: "confirmed" }
        void Promise.resolve(duringCeremony?.(message.request.passkey)).then(() => {
          dispatch(popup, { type: "authorization-approved", build: BUILD, id, result })
        })
      },
    }
    queueMicrotask(() => dispatch(popup, { type: "authorization-ready", build: BUILD, id }))
    return popup
  },
  close: vi.fn(),
}

function dispatch(source: unknown, data: unknown, eventOrigin = origin): void {
  const event = new Event("message")
  Object.assign(event, { origin: eventOrigin, source, data })
  messages.dispatchEvent(event)
}

async function rpc(op: string, payload: unknown): Promise<Reply> {
  const id = crypto.randomUUID()
  const reply = new Promise<Reply>((resolve) => replies.set(id, resolve))
  dispatch(parent, { channel: CHANNEL, version: VERSION, id, op, payload }, parentOrigin)
  return reply.finally(() => replies.delete(id))
}

let fixture: Awaited<ReturnType<typeof makeFixture>>
async function makeFixture() {
  const vmk = new Uint8Array(32).fill(0x44)
  const daemonKey = new Uint8Array(32).fill(0x11)
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public-test-daemon", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const wrapBase = withWrapMetaMetadata(await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }]), { rpId: "sandbox.avibe.bot", vaultUserHandle: "public-hd-sign" })
  const wrapMeta = withRootMetadata(wrapBase, await protectRootMetadata(vmk, rootMetadata, wrapBase))
  const sealed = await sealHdWalletLocally({ name: "PUBLIC_HD", words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {} })
  const publicKey = sealed.accounts[1].evm
  const typedData = {
    domain: { name: "Public HD", version: "1", chainId: 1, verifyingContract: "0x0000000000000000000000000000000000000001" },
    types: { Mail: [{ name: "contents", type: "string" }] },
    primaryType: "Mail",
    message: { contents: "main RPC protected HD" },
  }
  const digest = hashTypedData(typedData as never).slice(2)
  const signingContext = { kind: "eip-712-typed-data", typedData, digestAlgorithm: "eip712", digest }
  const context = {
    v: 2 as const, purpose: "sign" as const, requestId: crypto.randomUUID(),
    display: { secrets: [{ name: "PUBLIC_HD", kind: "keypair" as const }] },
    release: {
      name: "PUBLIC_HD", scheme: "ecdsa-secp256k1-recoverable", digest, publicKey,
      signingContext: structuredClone(signingContext), derivation: { chain: "evm", account: 1 },
      signingKey: { secret_id: "PUBLIC_HD", public_key: publicKey, envelope_sha256: hdEnvelopeFingerprint(sealed.envelope) },
    },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    signature: { alg: "ed25519" as const, keyId: "public-test-daemon", value: "" },
  }
  context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(context)), daemonKey))
  return { vmk, wrapMeta, request: { material: { name: "PUBLIC_HD", envelope: sealed.envelope }, scheme: "ecdsa-secp256k1-recoverable", signingContext, context }, publicKey, digest, daemonKey }
}

beforeAll(async () => {
  vi.stubGlobal("window", fakeWindow)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  installCardDocument(vi.stubGlobal)
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-hd-sign-rpc-handshake-123456" })).ok).toBe(true)
})
beforeEach(async () => {
  resetVaultSessionForTests()
  ceremonies.length = 0
  prompts.length = 0
  duringCeremony = undefined
  fixture = await makeFixture()
})
afterEach(() => {
  lockVault()
  fixture.vmk.fill(0)
  fixture.daemonKey.fill(0)
})
afterAll(() => vi.unstubAllGlobals())

describe("actual main.ts protected HD sign RPC", () => {
  it("refuses an already remembered different locked root before opening any window", async () => {
    const first = await makeFixture()
    try {
      rememberWrapMeta(first.wrapMeta)
      const reply = await rpc("sign", fixture.request)
      expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      expect(ceremonies).toHaveLength(0)
    } finally { first.vmk.fill(0); first.daemonKey.fill(0) }
  })

  it("preserves authenticated HD account, path and address in a valid typed-data prose fallback", async () => {
    commitUnlockedVmk({ vmk: new Uint8Array(fixture.vmk), wrapMeta: fixture.wrapMeta, scopeId: "public-hd-sign", freshSetup: false })
    const typedData = {
      domain: { name: "Public HD", chainId: 1, verifyingContract: "0x0000000000000000000000000000000000000001" },
      types: { Root: [{ name: "nested", type: "S" }], S: [] }, primaryType: "Root", message: { nested: null },
    }
    const digest = hashTypedData(typedData as never).slice(2)
    const signingContext = { kind: "eip-712-typed-data", typedData, digestAlgorithm: "eip712", digest }
    const request = { ...fixture.request, signingContext,
      context: { ...fixture.request.context, release: { ...fixture.request.context.release, digest, signingContext } },
    }
    request.context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(request.context)), fixture.daemonKey))
    const reply = await rpc("sign", request)
    expect(reply, JSON.stringify(reply)).toMatchObject({ ok: true })
    expect(ceremonies.map(({ passkey }) => passkey)).toEqual(["uv"])
    expect(prompts[0].review).toBeUndefined()
    expect(prompts[0].body?.text).toContain("#1 · m/44'/60'/0'/0/1")
    expect(prompts[0].body?.text).toContain(deriveSigningAddresses(fixture.publicKey).eth)
    expect(secp256k1.verify(hexToBytes(reply.result!.signature), hexToBytes(digest), hexToBytes(fixture.publicKey), { prehash: false })).toBe(true)
  })

  it("returns at most one signature for concurrent completion of the same signed request", async () => {
    commitUnlockedVmk({ vmk: new Uint8Array(fixture.vmk), wrapMeta: fixture.wrapMeta, scopeId: "public-hd-sign", freshSetup: false })
    const replies = await Promise.all([rpc("sign", fixture.request), rpc("sign", fixture.request)])
    expect(replies.filter((reply) => reply.ok)).toHaveLength(1)
    expect(replies.find((reply) => !reply.ok)?.error?.code).toBe("context_replayed")
  })

  it("requires fresh UV when the HD vault is already unlocked", async () => {
    commitUnlockedVmk({ vmk: new Uint8Array(fixture.vmk), wrapMeta: fixture.wrapMeta, scopeId: "public-hd-sign", freshSetup: false })
    const reply = await rpc("sign", fixture.request)
    expect(reply.ok, JSON.stringify(reply)).toBe(true)
    expect(secp256k1.verify(hexToBytes(reply.result!.signature), hexToBytes(fixture.digest), hexToBytes(fixture.publicKey), { prehash: false })).toBe(true)
    expect(ceremonies.map(({ passkey }) => passkey)).toEqual(["uv"])
  })

  it("refuses a same-scope root change during fresh UV", async () => {
    commitUnlockedVmk({ vmk: new Uint8Array(fixture.vmk), wrapMeta: fixture.wrapMeta, scopeId: "public-hd-sign", freshSetup: false })
    duringCeremony = async () => {
      const changed = JSON.parse(fixture.wrapMeta)
      changed.extension = "changed-during-UV"
      expect((await rpc("status", { wrapMeta: JSON.stringify(changed) })).ok).toBe(true)
    }
    const reply = await rpc("sign", fixture.request)
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(ceremonies.map(({ passkey }) => passkey)).toEqual(["uv"])
  })

  it("refuses a false-to-false lock while initially unlocking, without a second ceremony", async () => {
    duringCeremony = async () => { expect((await rpc("lock", {})).ok).toBe(true) }
    const reply = await rpc("sign", fixture.request)
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(ceremonies.map(({ passkey }) => passkey)).toEqual(["unlock"])
  })

  it("performs unlock then a separate operation-bound UV when initially locked", async () => {
    const reply = await rpc("sign", fixture.request)
    expect(reply.ok, JSON.stringify(reply)).toBe(true)
    expect(secp256k1.verify(hexToBytes(reply.result!.signature), hexToBytes(fixture.digest), hexToBytes(fixture.publicKey), { prehash: false })).toBe(true)
    expect(ceremonies.map(({ passkey }) => passkey)).toEqual(["unlock", "uv"])
  })

  it("keeps a newer committed session when the old locked HD operation aborts during UV", async () => {
    duringCeremony = async (passkey) => {
      if (passkey === "uv") {
        commitUnlockedVmk({ vmk: new Uint8Array(32).fill(0x55), wrapMeta: fixture.wrapMeta, scopeId: "public-hd-sign", freshSetup: false })
      }
    }
    const reply = await rpc("sign", fixture.request)
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(ceremonies.map(({ passkey }) => passkey)).toEqual(["unlock", "uv"])
    expect(vaultStatus().state).toBe("unlocked")
    await expect(withUnlockedVmk(async (vmk) => vmk[0], { renewOnSuccess: false })).resolves.toBe(0x55)
  })

  it("keeps a newer session when the old locked HD unlock aborts before its commit", async () => {
    duringCeremony = async (passkey) => {
      if (passkey === "unlock") {
        commitUnlockedVmk({ vmk: new Uint8Array(32).fill(0x66), wrapMeta: fixture.wrapMeta, scopeId: "public-hd-sign", freshSetup: false })
      }
    }
    const reply = await rpc("sign", fixture.request)
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(ceremonies).toEqual([{ passkey: "unlock" }])
    expect(vaultStatus().state).toBe("unlocked")
    await expect(withUnlockedVmk(async (vmk) => vmk[0], { renewOnSuccess: false })).resolves.toBe(0x66)
  })

})
