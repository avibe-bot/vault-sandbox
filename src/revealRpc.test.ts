import { afterEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument } from "./testDom"
import { buildWrapMeta } from "./vaultCrypto"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { revealEnvelopeHash } from "./revealRequest"
import { CHANNEL, VERSION } from "./rpc"

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const vector = vectors.cases[0]

type Reply = { id: string; ok: boolean; result?: unknown; error?: { code: string; message?: string; retryable?: boolean } }

async function runtime() {
  vi.resetModules()
  const events = new EventTarget()
  const replies = new Map<string, (reply: Reply) => void>()
  const parent = { postMessage: vi.fn((value: Reply) => { if (value?.id) replies.get(value.id)?.(value) }) }
  const nav = { credentials: { get: vi.fn(), create: vi.fn() }, userAgent: "test", platform: "test", maxTouchPoints: 0 }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=test`, hash: "#mode=test", search: "" }
  const top = {}
  const window = {
    location, navigator: nav, self: {}, top, parent, opener: null,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open: vi.fn(), close: vi.fn(),
  }
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  installCardDocument(vi.stubGlobal)

  const vmk = new Uint8Array(32).fill(0x44)
  const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }])
  const sealed = await sealHdWalletLocally({ name: "PUBLIC_HD", words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {} })
  function dispatch(source: unknown, data: unknown, eventOrigin = origin): void {
    const event = new Event("message")
    Object.assign(event, { origin: eventOrigin, source, data })
    events.dispatchEvent(event)
  }
  const rpc = (op: string, payload: unknown): Promise<Reply> => {
    const id = crypto.randomUUID()
    const reply = new Promise<Reply>((resolve) => replies.set(id, resolve))
    dispatch(parent, { channel: CHANNEL, version: VERSION, id, op, payload }, parentOrigin)
    return reply.finally(() => replies.delete(id))
  }
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-reveal-rpc-handshake-123456" })).ok).toBe(true)
  return { rpc, nav, vmk, envelope: sealed.envelope }
}

function context(name: string, envelope: { ciphertext: string; nonce: string; wrap_meta: string }) {
  return {
    v: 2 as const, purpose: "reveal" as const, requestId: "public-reveal-rpc", display: { secrets: [{ name, kind: "static" as const }] },
    release: { name, envelopeHash: { alg: "sha256", digest: revealEnvelopeHash(envelope) } },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    signature: { alg: "ed25519" as const, keyId: "public", value: "public" },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("F4 reveal binding at the real RPC boundary", () => {
  it("refuses genuine protected HD material before any plaintext or authorization attempt", async () => {
    const r = await runtime()
    try {
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_HD", envelope: r.envelope }, context: context("PUBLIC_HD", r.envelope) })
      expect(reply).toMatchObject({ ok: false, error: { code: "reveal_failed" } })
      expect(reply.error?.message).toMatch(/only static protected records/)
      expect(r.nav.credentials.get).not.toHaveBeenCalled()
    } finally {
      r.vmk.fill(0)
    }
  })

  it.each(["ciphertext", "nonce", "wrap_meta"] as const)("refuses a caller-mutated %s before authorization", async (field) => {
    const r = await runtime()
    try {
      const original = { ...r.envelope }
      const changed = { ...original, [field]: `${original[field]}-changed` }
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_HD", envelope: changed }, context: context("PUBLIC_HD", original) })
      expect(reply).toMatchObject({ ok: false, error: { code: "invalid_reveal_binding" } })
      expect(r.nav.credentials.get).not.toHaveBeenCalled()
    } finally {
      r.vmk.fill(0)
    }
  })
})
