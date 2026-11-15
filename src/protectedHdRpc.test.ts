import { afterEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument } from "./testDom"
import { buildWrapMeta, packProtectedRecord, sealProtected } from "./vaultCrypto"
import { revealEnvelopeHash } from "./revealRequest"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { HD_OPERATION_MS } from "./protectedHdCeremony"
import { BUILD, CHANNEL, VERSION } from "./rpc"

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const vector = vectors.cases[0]
const authWindowId = "authorization-window-12345678"

type Reply = { id: string; ok: boolean; result?: unknown; error?: { code: string; message?: string; retryable?: boolean } }
type Popup = { postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; closed: boolean }
type Runtime = {
  rpc: (op: string, payload: unknown, authorizationWindow?: string) => Promise<Reply>
  dispatch: (source: unknown, data: unknown, eventOrigin?: string) => void
  popup: Popup
  newPopup: () => Popup
  getAuthorizationRequest: () => Record<string, unknown> | undefined
  revealPayload: () => Promise<unknown>
  credentialGet: ReturnType<typeof vi.fn>
  root: { vmk: Uint8Array; wrapMeta: string }
  result: unknown
}

async function runtime(autoApprove = true): Promise<Runtime> {
  vi.resetModules()
  const events = new EventTarget()
  const replies = new Map<string, (reply: Reply) => void>()
  const parent = { postMessage: vi.fn((value: Reply) => { if (value?.id) replies.get(value.id)?.(value) }) }
  const opener = { postMessage: vi.fn() }
  const nav = { credentials: { get: vi.fn(), create: vi.fn() }, userAgent: "test", platform: "test", maxTouchPoints: 0 }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=test`, hash: "#mode=test", search: "" }
  const top = {}
  let authorizationRequest: Record<string, unknown> | undefined
  let result: unknown
  const makePopup = (): Popup => {
    const popup = {
      closed: false,
      close: vi.fn(() => { popup.closed = true }),
      focus: vi.fn(),
      postMessage: vi.fn((value: Record<string, unknown>) => {
        if (value.type !== "authorization-request") return
        authorizationRequest = value.request as Record<string, unknown>
        if (autoApprove) {
          queueMicrotask(() => dispatch(popup, {
            type: "authorization-approved", build: value.build, id: value.id, result,
          }))
        }
      }),
    }
    return popup
  }
  const popup = makePopup()
  const window = {
    location, navigator: nav, self: {}, top, parent, opener,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open: vi.fn(), close: vi.fn(),
  }
  const storage = new Map<string, string>()
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  installCardDocument(vi.stubGlobal)

  const vmk = new Uint8Array(32).fill(0x44)
  const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }])
  const sealed = await sealHdWalletLocally({
    name: "PUBLIC_HD", words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {},
  })
  result = { kind: "sealed-hd-wallet", ...sealed }

  function dispatch(source: unknown, data: unknown, eventOrigin = origin): void {
    const event = new Event("message")
    Object.assign(event, { origin: eventOrigin, source, data })
    events.dispatchEvent(event)
  }
  const rpc = (op: string, payload: unknown, authorizationWindow?: string): Promise<Reply> => {
    const id = crypto.randomUUID()
    const reply = new Promise<Reply>((resolve) => replies.set(id, resolve))
    dispatch(parent, {
      channel: CHANNEL, version: VERSION, id, op, payload,
      ...(authorizationWindow ? { authorizationWindow } : {}),
    }, parentOrigin)
    return reply.finally(() => replies.delete(id))
  }
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-hd-rpc-handshake-123456" })).ok).toBe(true)
  const revealPayload = async (): Promise<unknown> => {
    const record = { name: "PUBLIC_STATIC", kind: "static" as const }
    const envelope = packProtectedRecord(await sealProtected(new TextEncoder().encode("public synthetic value"), vmk, record), wrapMeta, record)
    return {
      material: { name: record.name, envelope },
      context: {
        v: 2, purpose: "reveal", requestId: crypto.randomUUID(), display: { secrets: [record] },
        release: { name: record.name, envelopeHash: { alg: "sha256", digest: revealEnvelopeHash(envelope) } },
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        // This inert preview is canceled/rejected before unlock or verification.
        signature: { alg: "ed25519", keyId: "public", value: "public" },
      },
    }
  }
  return { rpc, dispatch, popup, newPopup: makePopup, getAuthorizationRequest: () => authorizationRequest,
    revealPayload, credentialGet: nav.credentials.get, root: { vmk, wrapMeta }, result }
}

async function pairPopup(r: Runtime, popup: Popup, id: string): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  r.dispatch(popup, { type: "authorization-ready", build: BUILD, id })
}

async function pair(r: Runtime): Promise<void> {
  await pairPopup(r, r.popup, authWindowId)
}

afterEach(async () => {
  const lifecycle = await import("./vaultLifecycle")
  lifecycle.resetVaultSessionForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("protected HD seal RPC", () => {
  it("uses the exact popup request/result boundary and returns only four public fields", async () => {
    const r = await runtime()
    try {
      const pending = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      await pair(r)
      const reply = await pending
      expect(reply.ok).toBe(true)
      expect(Object.keys(reply.result as Record<string, unknown>).sort()).toEqual(["accounts", "envelope", "establishingVmk", "expectedAccount0"])
      expect(reply.result).toMatchObject({ establishingVmk: false, accounts: vector.record_meta.accounts, expectedAccount0: vector.expected_account0 })
      expect(r.getAuthorizationRequest()).toEqual(expect.objectContaining({ kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }))
      expect(Object.keys(r.getAuthorizationRequest()!).sort()).toEqual(["deadlineAt", "kind", "mode", "name", "wrapMeta"])
      expect(r.getAuthorizationRequest()!.deadlineAt).toBeGreaterThan(Date.now())
      expect(r.getAuthorizationRequest()!.deadlineAt).toBeLessThanOrEqual(Date.now() + HD_OPERATION_MS)
    } finally {
      r.root.vmk.fill(0)
    }
  })

  it("keeps the HD ceremony alive across automatic session lock", async () => {
    const r = await runtime(false)
    const lifecycle = await import("./vaultLifecycle")
    vi.useFakeTimers()
    try {
      lifecycle.commitUnlockedVmk({
        vmk: new Uint8Array(r.root.vmk),
        wrapMeta: r.root.wrapMeta,
        scopeId: "public-hd-rpc",
        freshSetup: true,
        policy: { strictApprovals: false, windowSeconds: 300, parentValueSealAllowed: true },
      })
      const pending = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const pairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await pairing
      await vi.advanceTimersByTimeAsync(300_001)
      expect(lifecycle.vaultStatus()).toMatchObject({ state: "locked" })
      expect(r.popup.postMessage).toHaveBeenCalledOnce()
      r.dispatch(r.popup, { type: "authorization-approved", build: BUILD, id: authWindowId, result: r.result })
      await expect(pending).resolves.toMatchObject({ ok: true, result: { establishingVmk: true } })
    } finally {
      lifecycle.resetVaultSessionForTests()
      vi.useRealTimers()
      r.root.vmk.fill(0)
    }
  })
  it("clears an abandoned fresh root after auto-lock and requires fresh setup for retry", async () => {
    const r = await runtime(false)
    const lifecycle = await import("./vaultLifecycle")
    vi.useFakeTimers()
    try {
      const policy = { strictApprovals: false, windowSeconds: 300 as const, parentValueSealAllowed: true }
      lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(r.root.vmk), wrapMeta: r.root.wrapMeta, scopeId: "public-hd-rpc", freshSetup: true, policy })
      const first = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const firstPairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await firstPairing
      await vi.advanceTimersByTimeAsync(300_001)
      expect(lifecycle.vaultStatus()).toMatchObject({ state: "locked" })
      r.dispatch(r.popup, {
        type: "authorization-error", build: BUILD, id: authWindowId,
        code: "authorization_cancelled", message: "cancelled", retryable: true,
      })
      await expect(first).resolves.toMatchObject({ ok: false })
      expect(lifecycle.vaultStatus().state).toBe("needs-setup")

      // A retry is valid only after a fresh setup commit; it must regain the
      // establishment marker rather than inheriting the abandoned root state.
      lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(r.root.vmk), wrapMeta: r.root.wrapMeta, scopeId: "public-hd-rpc", freshSetup: true, policy })
      const second = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const secondPairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await secondPairing
      r.dispatch(r.popup, { type: "authorization-approved", build: BUILD, id: authWindowId, result: r.result })
      await expect(second).resolves.toMatchObject({ ok: true, result: { establishingVmk: true } })
    } finally {
      lifecycle.resetVaultSessionForTests()
      vi.useRealTimers()
      r.root.vmk.fill(0)
    }
  })
  it("preserves establishment across same-root HD supersession after auto-lock", async () => {
    const r = await runtime(false)
    const lifecycle = await import("./vaultLifecycle")
    vi.useFakeTimers()
    try {
      const policy = { strictApprovals: false, windowSeconds: 300 as const, parentValueSealAllowed: true }
      lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(r.root.vmk), wrapMeta: r.root.wrapMeta, scopeId: "public-hd-rpc", freshSetup: true, policy })
      const first = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const firstPairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await firstPairing
      await vi.advanceTimersByTimeAsync(300_001)

      const secondId = "authorization-window-87654321"
      const secondPopup = r.newPopup()
      const second = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, secondId)
      const secondPairing = pairPopup(r, secondPopup, secondId)
      await vi.advanceTimersByTimeAsync(0)
      await secondPairing
      expect(r.popup.closed).toBe(true)
      let secondSettled = false
      void second.then(() => { secondSettled = true })
      r.dispatch(r.popup, { type: "authorization-approved", build: BUILD, id: authWindowId, result: r.result })
      await vi.advanceTimersByTimeAsync(0)
      expect(secondSettled).toBe(false)
      r.dispatch(secondPopup, { type: "authorization-approved", build: BUILD, id: secondId, result: r.result })
      await expect(second).resolves.toMatchObject({ ok: true, result: { establishingVmk: true } })
      await expect(first).resolves.toMatchObject({ ok: false })
    } finally {
      lifecycle.resetVaultSessionForTests()
      vi.useRealTimers()
      r.root.vmk.fill(0)
    }
  })
  it.each(["cancel", "invalid-result"] as const)("disposes the provisional root after HD to ordinary reveal %s", async (terminal) => {
    const r = await runtime(false)
    const lifecycle = await import("./vaultLifecycle")
    vi.useFakeTimers()
    const sessionVmk = new Uint8Array(r.root.vmk)
    try {
      lifecycle.commitUnlockedVmk({ vmk: sessionVmk, wrapMeta: r.root.wrapMeta, scopeId: "public-hd-rpc", freshSetup: true,
        policy: { strictApprovals: false, windowSeconds: 300, parentValueSealAllowed: true } })
      const first = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const pairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await pairing
      await vi.advanceTimersByTimeAsync(300_001)
      const id = "ordinary-window-87654321"
      const popup = r.newPopup()
      const ordinary = r.rpc("reveal", await r.revealPayload(), id)
      await vi.advanceTimersByTimeAsync(0)
      r.dispatch(popup, { type: "authorization-ready", build: BUILD, id })
      expect(popup.postMessage).toHaveBeenCalledOnce()
      expect(r.getAuthorizationRequest()).toMatchObject({ passkey: "unlock" })
      await expect(first).resolves.toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      r.dispatch(popup, terminal === "cancel"
        ? { type: "authorization-error", build: BUILD, id, code: "authorization_cancelled", retryable: true }
        : { type: "authorization-approved", build: BUILD, id, result: r.result })
      await expect(ordinary).resolves.toMatchObject({ ok: false,
        error: { code: terminal === "cancel" ? "authorization_cancelled" : "authorization_result_invalid" } })
      expect(lifecycle.vaultStatus()).toEqual({ state: "needs-setup" })
      expect(sessionVmk).toEqual(new Uint8Array(32))
      expect(r.credentialGet).not.toHaveBeenCalled()
      await expect(lifecycle.withUnlockedVmk(() => "forbidden")).rejects.toThrow("vault-locked")
    } finally { r.root.vmk.fill(0) }
  })

  it("lets a later HD owner finish after an ordinary successor without inheriting stale approvals", async () => {
    const r = await runtime(false)
    const lifecycle = await import("./vaultLifecycle")
    vi.useFakeTimers()
    try {
      lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(r.root.vmk), wrapMeta: r.root.wrapMeta, scopeId: "public-hd-rpc", freshSetup: true,
        policy: { strictApprovals: false, windowSeconds: 300, parentValueSealAllowed: true } })
      const first = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const pairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await pairing
      await vi.advanceTimersByTimeAsync(300_001)
      const ordinaryId = "ordinary-window-87654321"
      const ordinaryPopup = r.newPopup()
      const ordinary = r.rpc("reveal", await r.revealPayload(), ordinaryId)
      await vi.advanceTimersByTimeAsync(0)
      r.dispatch(ordinaryPopup, { type: "authorization-ready", build: BUILD, id: ordinaryId })
      await expect(first).resolves.toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      const hdId = "authorization-window-55555555"
      const hdPopup = r.newPopup()
      const third = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, hdId)
      await vi.advanceTimersByTimeAsync(0)
      r.dispatch(hdPopup, { type: "authorization-ready", build: BUILD, id: hdId })
      await expect(ordinary).resolves.toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      let settled = false
      void third.then(() => { settled = true })
      r.dispatch(r.popup, { type: "authorization-approved", build: BUILD, id: authWindowId, result: r.result })
      r.dispatch(ordinaryPopup, { type: "authorization-approved", build: BUILD, id: ordinaryId, result: r.result })
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      expect(lifecycle.vaultStatus()).toEqual({ state: "locked" })
      r.dispatch(hdPopup, { type: "authorization-approved", build: BUILD, id: hdId, result: r.result })
      await expect(third).resolves.toMatchObject({ ok: true, result: { establishingVmk: true } })
      expect(lifecycle.vaultStatus()).toEqual({ state: "locked" })
      await expect(lifecycle.withUnlockedVmk(() => "forbidden")).rejects.toThrow("vault-locked")
      expect(r.credentialGet).not.toHaveBeenCalled()
    } finally { r.root.vmk.fill(0) }
  })

  it("disposes the provisional root when a non-snapshot interactive operation supersedes HD", async () => {
    const r = await runtime(false)
    const lifecycle = await import("./vaultLifecycle")
    vi.useFakeTimers()
    try {
      lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(r.root.vmk), wrapMeta: r.root.wrapMeta, scopeId: "public-hd-rpc", freshSetup: true,
        policy: { strictApprovals: false, windowSeconds: 300, parentValueSealAllowed: true } })
      const first = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      const pairing = pair(r)
      await vi.advanceTimersByTimeAsync(0)
      await pairing
      await vi.advanceTimersByTimeAsync(300_001)
      // Unlock owns only the interactive slot, not a bound root snapshot.
      const unlock = r.rpc("unlock", { wrapMeta: r.root.wrapMeta })
      await expect(first).resolves.toMatchObject({ ok: false })
      expect(lifecycle.vaultStatus()).toEqual({ state: "needs-setup" })
      const cancel = (globalThis.document as unknown as { querySelectorAll(selector: string): Array<{ click(): void }> }).querySelectorAll(".secondary")
      cancel.at(-1)?.click()
      await expect(unlock).resolves.toMatchObject({ ok: false })
      expect(r.credentialGet).not.toHaveBeenCalled()
    } finally { r.root.vmk.fill(0) }
  })

  it("requires a parent-opened authorization window and never falls back to ordinary seal", async () => {
    const r = await runtime()
    try {
      const reply = await r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta })
      expect(reply).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
      expect(r.popup.postMessage).not.toHaveBeenCalled()
    } finally {
      r.root.vmk.fill(0)
    }
  })



  it("rejects parent secret material and public-table shortcuts in the exact three-key payload", async () => {
    const r = await runtime()
    try {
      for (const field of ["words", "passphrase", "entropy", "seed", "accounts", "confirmed", "authorizationWindow"]) {
        const reply = await r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "create", wrapMeta: r.root.wrapMeta, [field]: "public-forbidden" }, authWindowId)
        expect(reply).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
      }
      expect(r.popup.postMessage).not.toHaveBeenCalled()
    } finally { r.root.vmk.fill(0) }
  })

  it.each(["confirmed", "unlock", "assertion"])("refuses the wrong channel success kind %s", async (kind) => {
    const r = await runtime()
    try {
      Object.assign(r.result as object, { kind })
      const pending = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      await pair(r)
      expect(await pending).toMatchObject({ ok: false, error: { code: "authorization_result_invalid" } })
    } finally { r.root.vmk.fill(0) }
  })

  it("cannot substitute a different already remembered locked root", async () => {
    const r = await runtime()
    try {
      expect((await r.rpc("status", { wrapMeta: r.root.wrapMeta })).ok).toBe(true)
      const changed = JSON.parse(r.root.wrapMeta)
      changed.extension = "different-root"
      const reply = await r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: JSON.stringify(changed) }, authWindowId)
      expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      expect(r.popup.postMessage).not.toHaveBeenCalled()
    } finally { r.root.vmk.fill(0) }
  })

  it("refuses a late result after the operation snapshot is locked", async () => {
    const r = await runtime(false)
    try {
      const pending = r.rpc("sealHdWallet", { name: "PUBLIC_HD", mode: "import", wrapMeta: r.root.wrapMeta }, authWindowId)
      await pair(r)
      expect(r.popup.postMessage).toHaveBeenCalledOnce()
      const lock = await r.rpc("lock", {})
      expect(lock.ok).toBe(true)
      const reply = await pending
      expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      r.dispatch(r.popup, { type: "authorization-approved", build: BUILD, id: authWindowId, result: r.result })
    } finally {
      r.root.vmk.fill(0)
    }
  })
})
