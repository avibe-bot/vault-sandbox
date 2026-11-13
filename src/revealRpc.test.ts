import { afterEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument } from "./testDom"
import { buildWrapMeta, bytesToBase64, packProtectedRecord, protectRootMetadata, sealProtected, withRootMetadata, withWrapMetaMetadata } from "./vaultCrypto"
import { ed25519 } from "@noble/curves/ed25519.js"
import { signedOperationContextMessage } from "./operationContext"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { revealEnvelopeHash } from "./revealRequest"
import { CHANNEL, VERSION } from "./rpc"

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const vector = vectors.cases[0]
const presented: Array<{ name: string; plaintext: Uint8Array; value: string }> = []
let duringConsent: (() => void) | undefined
vi.mock("./operationUi", async (original) => {
  const actual = await original<typeof import("./operationUi")>()
  return {
    ...actual,
    runExclusiveOperation: async (operation: (signal: AbortSignal) => unknown) => operation(new AbortController().signal),
    confirmOperationInActiveSlot: async (_card: unknown, _signal: unknown, _surface: unknown, activate: () => Promise<void>) => activate(),
    presentPlaintext: async (input: { name: string; plaintext: Uint8Array }) => {
      presented.push({ ...input, value: new TextDecoder().decode(input.plaintext) })
    },
  }
})

type Reply = { id: string; ok: boolean; result?: unknown; error?: { code: string; message?: string; retryable?: boolean } }

async function runtime() {
  vi.resetModules()
  const events = new EventTarget()
  const replies = new Map<string, (reply: Reply) => void>()
  const parent = { postMessage: vi.fn((value: Reply) => { if (value?.id) replies.get(value.id)?.(value) }) }
  const nav = {
    credentials: { get: vi.fn(), create: vi.fn() }, userAgent: "test", platform: "test", maxTouchPoints: 0,
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=test`, hash: "#mode=test", search: "" }
  const top = {}
  const window = {
    location, navigator: nav, self: {}, top, parent, opener: null,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open(url: string) {
      const id = new URLSearchParams(new URL(url).hash.slice(1)).get("id")!
      const popup = { closed: false, close: vi.fn(), focus: vi.fn(), postMessage(message: { build: unknown }) {
        duringConsent?.()
        queueMicrotask(() => dispatch(popup, { type: "authorization-approved", build: message.build, id, result: { kind: "confirmed" } }))
      } }
      queueMicrotask(async () => dispatch(popup, { type: "authorization-ready", build: (await import("./rpc")).BUILD, id }))
      return popup
    }, close: vi.fn(),
  }
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  installCardDocument(vi.stubGlobal)

  const vmk = new Uint8Array(32).fill(0x44)
  const daemonKey = new Uint8Array(32).fill(0x11)
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const makeBase = async () => withWrapMetaMetadata(await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }]), { rpId: "sandbox.avibe.bot", vaultUserHandle: "public-reveal-rpc" })
  const base = await makeBase()
  const wrapMeta = withRootMetadata(base, await protectRootMetadata(vmk, rootMetadata, base))
  const staticContext = { name: "PUBLIC_STATIC", kind: "static" as const }
  const staticEnvelope = packProtectedRecord(await sealProtected(new TextEncoder().encode("public synthetic value"), vmk, staticContext), wrapMeta, staticContext)
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
  const lifecycle = await import("./vaultLifecycle")
  return { rpc, nav, vmk, daemonKey, envelope: sealed.envelope, staticEnvelope,
    unlock() { lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(vmk), wrapMeta, scopeId: "public-reveal-rpc", freshSetup: false }) },
    async rememberOtherRoot() {
      const otherBase = await makeBase()
      lifecycle.rememberWrapMeta(withRootMetadata(otherBase, await protectRootMetadata(vmk, rootMetadata, otherBase)))
    },
    cleanup() { lifecycle.resetVaultSessionForTests(); vmk.fill(0); daemonKey.fill(0) },
  }
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
  presented.length = 0
  duringConsent = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("F4 reveal binding at the real RPC boundary", () => {
  it("refuses a different already remembered locked root before observing the reveal root", async () => {
    const r = await runtime()
    try {
      await r.rememberOtherRoot()
      const signed = context("PUBLIC_STATIC", r.staticEnvelope)
      signed.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(signed)), r.daemonKey))
      let consent = false
      duringConsent = () => { consent = true }
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_STATIC", envelope: r.staticEnvelope }, context: signed })
      expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      expect(consent).toBe(false)
      expect(presented).toHaveLength(0)
    } finally { r.cleanup() }
  })

  it("opens only the signed static envelope and wipes plaintext after sandbox-only presentation", async () => {
    const r = await runtime()
    try {
      r.unlock()
      const signed = context("PUBLIC_STATIC", r.staticEnvelope)
      signed.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(signed)), r.daemonKey))
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_STATIC", envelope: r.staticEnvelope }, context: signed })
      expect(reply, JSON.stringify(reply)).toMatchObject({ ok: true, result: { completed: true } })
      expect(presented).toHaveLength(1)
      expect(presented[0].value).toBe("public synthetic value")
      expect(presented[0].plaintext.every((byte) => byte === 0)).toBe(true)
      expect(JSON.stringify(reply)).not.toContain("public synthetic value")
    } finally { r.cleanup() }
  })

  it("owns the original material and context while the caller mutates both during consent", async () => {
    const r = await runtime()
    try {
      r.unlock()
      const signed = context("PUBLIC_STATIC", r.staticEnvelope)
      signed.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(signed)), r.daemonKey))
      const material = { name: "PUBLIC_STATIC", envelope: { ...r.staticEnvelope } }
      duringConsent = () => { material.envelope.ciphertext = "changed"; signed.release.name = "OTHER" }
      const reply = await r.rpc("reveal", { material, context: signed })
      expect(reply, JSON.stringify(reply)).toMatchObject({ ok: true })
      expect(presented[0].value).toBe("public synthetic value")
    } finally { r.cleanup() }
  })

  it("refuses expiry during consent before presenting any plaintext", async () => {
    const r = await runtime()
    try {
      r.unlock()
      const signed = context("PUBLIC_STATIC", r.staticEnvelope)
      signed.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(signed)), r.daemonKey))
      const now = Date.now()
      duringConsent = () => { vi.spyOn(Date, "now").mockReturnValue(now + 61_000) }
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_STATIC", envelope: r.staticEnvelope }, context: signed })
      expect(reply).toMatchObject({ ok: false, error: { code: "context_expired" } })
      expect(presented).toHaveLength(0)
    } finally { r.cleanup() }
  })
  it.each(["lock", "root"] as const)("refuses %s during consent without decrypting/presenting or silently re-unlocking", async (race) => {
    const r = await runtime()
    try {
      r.unlock()
      const signed = context("PUBLIC_STATIC", r.staticEnvelope)
      signed.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(signed)), r.daemonKey))
      duringConsent = () => {
        if (race === "lock") void r.rpc("lock", {})
        else {
          const changed = JSON.parse(r.staticEnvelope.wrap_meta)
          changed.public_extension = "changed-root"
          void r.rpc("status", { wrapMeta: JSON.stringify(changed) })
        }
      }
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_STATIC", envelope: r.staticEnvelope }, context: signed })
      expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      expect(presented).toHaveLength(0)
      expect(r.nav.credentials.get).not.toHaveBeenCalled()
    } finally { r.cleanup() }
  })

  it("refuses genuine protected HD material before any plaintext or authorization attempt", async () => {
    const r = await runtime()
    try {
      const reply = await r.rpc("reveal", { material: { name: "PUBLIC_HD", envelope: r.envelope }, context: context("PUBLIC_HD", r.envelope) })
      expect(reply).toMatchObject({ ok: false, error: { code: "reveal_failed" } })
      expect(reply.error?.message).toMatch(/only static protected records/)
      expect(r.nav.credentials.get).not.toHaveBeenCalled()
    } finally {
      r.cleanup()
    }
  })

  it("refuses genuine HD agent/DEK delivery at approveRelease before a ceremony", async () => {
    const r = await runtime()
    try {
      const delivery = {
        v: 2, purpose: "agent-deliver", requestId: "public-hd-delivery", grantId: "public-grant",
        display: { secrets: [{ name: "PUBLIC_HD", kind: "keypair" }], grantTtlSeconds: 60 },
        release: { name: "PUBLIC_HD", ttlSecs: 60, approvalNonce: new Array<number>(16).fill(1),
          approvalExpiresAtUnix: Math.floor(Date.now() / 1000) + 60, operationHash: "11".repeat(32) },
        expiresAt: new Date(Date.now() + 60_000).toISOString(), signature: { alg: "ed25519", keyId: "public", value: "public" },
      }
      const reply = await r.rpc("approveRelease", { items: [{ material: { name: "PUBLIC_HD", envelope: r.envelope }, context: delivery }] })
      expect(reply).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
      expect(reply.error?.message).toMatch(/only supports static protected records/)
      expect(presented).toHaveLength(0)
      expect(r.nav.credentials.get).not.toHaveBeenCalled()
    } finally { r.cleanup() }
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
      r.cleanup()
    }
  })
})
