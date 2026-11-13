import { afterEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument } from "./testDom"
import { buildWrapMeta } from "./vaultCrypto"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { BUILD, CHANNEL, VERSION } from "./rpc"

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const vector = vectors.cases[0]
const authWindowId = "authorization-window-12345678"

type Reply = { id: string; ok: boolean; result?: unknown; error?: { code: string; message?: string; retryable?: boolean } }
type Runtime = {
  rpc: (op: string, payload: unknown, authorizationWindow?: string) => Promise<Reply>
  dispatch: (source: unknown, data: unknown, eventOrigin?: string) => void
  popup: { postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; closed: boolean }
  getAuthorizationRequest: () => Record<string, unknown> | undefined
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
  return { rpc, dispatch, popup, getAuthorizationRequest: () => authorizationRequest, root: { vmk, wrapMeta }, result }
}

async function pair(r: Runtime): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  r.dispatch(r.popup, { type: "authorization-ready", build: BUILD, id: authWindowId })
}

afterEach(() => {
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
      expect(r.getAuthorizationRequest()!.deadlineAt).toBeLessThanOrEqual(Date.now() + 300_000)
    } finally {
      r.root.vmk.fill(0)
    }
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
