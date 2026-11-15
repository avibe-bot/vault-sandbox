import { afterEach, describe, expect, it, vi } from "vitest"
import { installCardDocument } from "./testDom"
import { buildWrapMeta, openProtected, unpackProtectedRecord, type ProtectedRecordEnvelope } from "./vaultCrypto"
import { CHANNEL, VERSION } from "./rpc"

// Real main.ts seal RPC and lifecycle. Only the parent window and the browser
// WebAuthn surface are simulated; every key and wrap_meta here is public synthetic data.
const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
type Reply = { id: string; ok: boolean; result?: { envelope?: ProtectedRecordEnvelope }; error?: { code: string } }

async function root(fill: number) {
  const vmk = new Uint8Array(32).fill(fill)
  const prfOutput = new Uint8Array(32).fill(fill + 1)
  const prfSalt = new Uint8Array(32).fill(fill + 2)
  const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])
  return { vmk, prfOutput, wrapMeta }
}

async function runtime() {
  vi.resetModules()
  const events = new EventTarget()
  const replies = new Map<string, (reply: Reply) => void>()
  const parent = { postMessage: vi.fn((value: Reply) => { if (value?.id) replies.get(value.id)?.(value) }) }
  // null is the browser's cancelled-assertion answer; a test can install a PRF result instead.
  let assertion: unknown = null
  const get = vi.fn(async () => assertion)
  const nav = { credentials: { get, create: vi.fn() }, userAgent: "test", platform: "test", maxTouchPoints: 0 }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=test`, hash: "#mode=test", search: "" }
  const window = {
    location, navigator: nav, self: {}, top: {}, parent, opener: { postMessage: vi.fn() },
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open: vi.fn(), close: vi.fn(),
  }
  const storage = new Map<string, string>()
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  installCardDocument(vi.stubGlobal)
  const rpc = (op: string, payload: unknown): Promise<Reply> => {
    const id = crypto.randomUUID()
    const reply = new Promise<Reply>((resolve) => replies.set(id, resolve))
    const event = new Event("message")
    Object.assign(event, { origin: parentOrigin, source: parent, data: { channel: CHANNEL, version: VERSION, id, op, payload } })
    events.dispatchEvent(event)
    return reply.finally(() => replies.delete(id))
  }
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-seal-root-handshake-123456" })).ok).toBe(true)
  const lifecycle = await import("./vaultLifecycle")
  const crypto_ = await import("./vaultCrypto")
  return {
    rpc, get, lifecycle, crypto: crypto_,
    answerWith(prfOutput: Uint8Array) {
      assertion = { rawId: new Uint8Array([1, 2, 3]).buffer, getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(prfOutput) } } }) }
    },
  }
}

// The sandbox and server compare roots without record fields; packing adds the scheme.
function rootOf(wrapMeta: string): Record<string, unknown> {
  const { scheme: _scheme, record_meta: _record, wrapped_dek: _dek, dek_nonce: _nonce, ...base } = JSON.parse(wrapMeta)
  return base
}

const seals = [
  ["static", { name: "PUBLIC_STATIC", kind: "static", inputMode: "parent-value", value: "public synthetic value" }],
  ["keypair", { name: "PUBLIC_KEYPAIR", kind: "keypair" }],
] as const

afterEach(async () => {
  const lifecycle = await import("./vaultLifecycle")
  lifecycle.resetVaultSessionForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("seal binds the held VMK to the requested root", () => {
  it.each(seals)("fails closed with no record when a %s seal names a different root than the unlocked VMK", async (_kind, request) => {
    const r = await runtime()
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = new Uint8Array(a.vmk)
    r.lifecycle.commitUnlockedVmk({ vmk: sessionVmk, wrapMeta: a.wrapMeta, scopeId: "public-seal-root", freshSetup: false })
    const reply = await r.rpc("seal", { ...request, wrapMeta: b.wrapMeta })
    expect(reply).toMatchObject({ ok: false, error: { code: "passkey_cancelled" } })
    expect(reply.result).toBeUndefined()
    // The other root's VMK is wiped; the sandbox asked to unlock the named root instead.
    expect(sessionVmk).toEqual(new Uint8Array(32))
    expect(r.get).toHaveBeenCalledOnce()
    expect(r.lifecycle.vaultStatus()).toEqual({ state: "locked" })
    expect(rootOf(r.lifecycle.currentWrapMeta()!)).toEqual(rootOf(b.wrapMeta))
    await expect(r.lifecycle.withUnlockedVmk(() => "forbidden")).rejects.toThrow("vault-locked")
  })

  it.each(seals)("re-unlocks the named root and seals a %s record only under its own VMK", async (_kind, request) => {
    const r = await runtime()
    const a = await root(0x10)
    const b = await root(0x40)
    r.lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(a.vmk), wrapMeta: a.wrapMeta, scopeId: "public-seal-root", freshSetup: false })
    r.answerWith(b.prfOutput)
    const reply = await r.rpc("seal", { ...request, wrapMeta: b.wrapMeta })
    expect(reply.ok).toBe(true)
    const unpacked = unpackProtectedRecord(reply.result!.envelope!)
    expect(rootOf(unpacked.vmkWrapMeta)).toEqual(rootOf(b.wrapMeta))
    const context = r.crypto.protectedRecordContextFromMetadata(request.name, unpacked.recordMetadata)
    const opened = await openProtected(unpacked.sealed, b.vmk, context)
    opened.fill(0)
    await expect(openProtected(unpacked.sealed, a.vmk, context)).rejects.toThrow()
    expect(r.get).toHaveBeenCalledOnce()
  })

  it.each(seals)("keeps a same-root %s seal silent and under the unchanged session", async (_kind, request) => {
    const r = await runtime()
    const a = await root(0x10)
    const sessionVmk = new Uint8Array(a.vmk)
    r.lifecycle.commitUnlockedVmk({ vmk: sessionVmk, wrapMeta: a.wrapMeta, scopeId: "public-seal-root", freshSetup: false })
    // A record-bearing projection of the same root is still the same root.
    const projected = JSON.stringify({ ...JSON.parse(a.wrapMeta), scheme: "machine-aesgcm-v1", wrapped_dek: "public", dek_nonce: "public", record_meta: { kind: "static" } })
    const reply = await r.rpc("seal", { ...request, wrapMeta: projected })
    expect(reply.ok).toBe(true)
    expect(r.get).not.toHaveBeenCalled()
    expect(sessionVmk).toEqual(a.vmk)
    expect(r.lifecycle.vaultStatus()).toMatchObject({ state: "unlocked" })
    const unpacked = unpackProtectedRecord(reply.result!.envelope!)
    const opened = await openProtected(unpacked.sealed, a.vmk, r.crypto.protectedRecordContextFromMetadata(request.name, unpacked.recordMetadata))
    opened.fill(0)
  })

  it("keeps a seal without wrapMeta on the remembered unlocked root", async () => {
    const r = await runtime()
    const a = await root(0x10)
    r.lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(a.vmk), wrapMeta: a.wrapMeta, scopeId: "public-seal-root", freshSetup: false })
    const reply = await r.rpc("seal", { name: "PUBLIC_STATIC", kind: "static", inputMode: "parent-value", value: "public synthetic value" })
    expect(reply.ok).toBe(true)
    expect(rootOf(unpackProtectedRecord(reply.result!.envelope!).vmkWrapMeta)).toEqual(rootOf(a.wrapMeta))
    expect(r.get).not.toHaveBeenCalled()
  })

  it("binds the seal operation to its requested root while it runs", async () => {
    const r = await runtime()
    const a = await root(0x10)
    const b = await root(0x40)
    r.lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(a.vmk), wrapMeta: a.wrapMeta, scopeId: "public-seal-root", freshSetup: false })
    const original = r.crypto.sealProtected
    vi.spyOn(r.crypto, "sealProtected").mockImplementationOnce(async (...args) => {
      // A parent observing another root mid-seal must abort a root-bound seal.
      r.lifecycle.vaultStatus(b.wrapMeta)
      return original(...args)
    })
    const reply = await r.rpc("seal", { name: "PUBLIC_STATIC", kind: "static", inputMode: "parent-value", value: "public synthetic value", wrapMeta: a.wrapMeta })
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(reply.result).toBeUndefined()
    // Status reporting itself is unchanged: the same-root session stays unlocked.
    expect(r.lifecycle.vaultStatus()).toMatchObject({ state: "unlocked" })
  })

  it("lets a newer bound operation supersede an in-flight root-bound seal without locking it", async () => {
    const r = await runtime()
    const a = await root(0x10)
    r.lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(a.vmk), wrapMeta: a.wrapMeta, scopeId: "public-seal-root", freshSetup: false })
    const original = r.crypto.sealProtected
    let newer: { release: () => void; assertCurrent: () => void } | undefined
    vi.spyOn(r.crypto, "sealProtected").mockImplementationOnce(async (...args) => {
      newer = r.lifecycle.beginVaultOperationSnapshot(a.wrapMeta)
      return original(...args)
    })
    const reply = await r.rpc("seal", { name: "PUBLIC_KEYPAIR", kind: "keypair", wrapMeta: a.wrapMeta })
    try {
      expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      expect(reply.result).toBeUndefined()
      expect(() => newer!.assertCurrent()).not.toThrow()
      expect(r.lifecycle.vaultStatus()).toMatchObject({ state: "unlocked" })
    } finally { newer?.release() }
  })
})
