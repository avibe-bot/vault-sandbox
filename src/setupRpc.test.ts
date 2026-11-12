import { afterEach, describe, expect, it, vi } from "vitest"
import { installCardDocument } from "./testDom"

// Exercise main.ts callers and the public JSON/fragment transport, stopping at
// mocked create(). No PRF assertion, VMK creation, enrollment or real ceremony.
const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const legacyId = "YXZpYmUtdmF1bHQ="
// Python base64.b64encode(bytes(range(32))).decode('ascii'), daemon wire encoding.
const instanceId = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
const stop = new Error("public-options-observed")
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
function setupPayload(id: unknown = instanceId) {
  return {
    vaultUserHandle: "avibe-vault", displayName: "Avibe Vault", existingProtectedVault: false,
    authzCreationOptions: {
      ok: true, challenge_id: "public-challenge-id", expires_at: "2099-01-01T00:00:00Z",
      webauthn: {
        rp: { id: "sandbox.avibe.bot", name: "Avibe Vault" },
        user: { id, name: "avibe-vault", displayName: "Avibe Vault" },
        challenge: "AQIDBA==", pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: { residentKey: "required", userVerification: "required" }, extensions: { prf: {} },
      },
    },
  }
}
type Reply = { id: string; ok: boolean; error?: { code: string; message: string } }

async function runtime(mode: "iframe" | "direct" | "popup", popupRequest = setupPayload()) {
  vi.resetModules()
  const events = new EventTarget()
  const listeners = new Map<string, (reply: Reply) => void>()
  const parent = { postMessage: (reply: Reply) => listeners.get(reply.id)?.(reply) }
  const opener = { postMessage: vi.fn() }
  const create = vi.fn().mockRejectedValue(stop)
  const get = vi.fn().mockRejectedValue(new Error("PRF must not run"))
  const nav = { credentials: { create, get }, userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 1 }
  const hash = mode === "popup" ? `#mode=setup&id=public-setup-id&req=${encode(popupRequest)}` : "#mode=test"
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html${hash}`, hash, search: "" }
  const top = {}
  const open = vi.fn()
  const window = {
    location, navigator: nav, self: mode === "iframe" ? {} : top, top, parent, opener,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open, close: vi.fn(),
  }
  const storage = new Map<string, string>()
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  const dom = installCardDocument(vi.stubGlobal)
  const cryptoModule = await import("./vaultCrypto")
  const newVmk = vi.spyOn(cryptoModule, "newVmk").mockImplementation(() => { throw new Error("VMK must not be created") })
  const { BUILD, CHANNEL, VERSION } = await import("./rpc")
  function dispatch(source: unknown, data: unknown, eventOrigin = origin) {
    const event = new Event("message")
    Object.assign(event, { origin: eventOrigin, source, data })
    events.dispatchEvent(event)
  }
  const rpc = (op: string, payload: unknown) => {
    const id = crypto.randomUUID()
    const result = new Promise<Reply>((resolve) => listeners.set(id, resolve))
    dispatch(parent, { channel: CHANNEL, version: VERSION, id, op, payload }, parentOrigin)
    return result.finally(() => listeners.delete(id))
  }
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-test-nonce-123456" })).ok).toBe(true)
  return { ...dom, create, get, newVmk, rpc, open, opener, dispatch, BUILD }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

for (const mode of ["direct", "iframe", "popup"] as const) {
  describe(`main.ts ${mode} supplied registration options`, () => {
    it.each([legacyId, instanceId])("preserves wire ID %s separately from the legacy scope", async (id) => {
      const request = setupPayload(id)
      const r = await runtime(mode, request)
      if (mode === "popup") {
        r.card.querySelector("button")!.click()
        await vi.waitFor(() => expect(r.opener.postMessage).toHaveBeenCalled())
        expect(r.opener.postMessage.mock.calls[0][0]).toMatchObject({ type: "setup-error", code: "setup_create_failed", message: stop.message })
      } else {
        const reply = r.rpc("setup", request)
        if (mode === "iframe") {
          await vi.waitFor(() => expect(r.card.querySelector("button")).not.toBeNull())
          r.card.querySelector("button")!.click()
        }
        expect(await reply).toMatchObject({ ok: false, error: { code: "setup_failed", message: stop.message } })
      }
      expect(r.create).toHaveBeenCalledOnce()
      const options = r.create.mock.calls[0][0].publicKey as PublicKeyCredentialCreationOptions
      const expected = id === legacyId ? new TextEncoder().encode("avibe-vault") : Uint8Array.from({ length: 32 }, (_, i) => i)
      expect(new Uint8Array(options.user.id as ArrayBuffer)).toEqual(expected)
      expect(options.user.name).toBe("avibe-vault")
      expect(request.vaultUserHandle).toBe("avibe-vault")
      expect(r.get).not.toHaveBeenCalled()
      expect(r.newVmk).not.toHaveBeenCalled()
      expect(r.open).not.toHaveBeenCalled()
    })

    it("rejects malformed supplied IDs before create, PRF or popup fallback", async () => {
      const request = setupPayload("not an encoded ID!")
      const r = await runtime(mode, request)
      if (mode === "popup") {
        r.card.querySelector("button")!.click()
        expect(r.opener.postMessage.mock.calls[0][0]).toMatchObject({ type: "setup-error", code: "setup_create_failed", message: "invalid webauthn user.id encoding" })
      } else {
        const reply = r.rpc("setup", request)
        if (mode === "iframe") {
          await vi.waitFor(() => expect(r.card.querySelector("button")).not.toBeNull())
          r.card.querySelector("button")!.click()
        }
        expect(await reply).toMatchObject({ ok: false, error: { code: "setup_failed", message: "invalid webauthn user.id encoding" } })
      }
      expect(r.create).not.toHaveBeenCalled()
      expect(r.get).not.toHaveBeenCalled()
      expect(r.newVmk).not.toHaveBeenCalled()
      expect(r.open).not.toHaveBeenCalled()
    })
  })
}

it("iframe ancestor-error fallback transports exact options and unchanged scope in the popup fragment", async () => {
  const r = await runtime("iframe")
  const request = setupPayload()
  r.create.mockRejectedValue(new DOMException("cross-origin ancestor", "SecurityError"))
  r.open.mockImplementation((value: string) => {
    const url = new URL(value)
    expect(url.search).toBe("")
    const params = new URLSearchParams(url.hash.slice(1))
    expect(params.get("mode")).toBe("setup")
    const encoded = params.get("req")!.replace(/-/g, "+").replace(/_/g, "/")
    expect(JSON.parse(atob(encoded))).toEqual(request)
    const popup = { closed: false, focus: vi.fn(), close: vi.fn() }
    queueMicrotask(() => r.dispatch(popup, { type: "setup-error", build: r.BUILD, id: params.get("id"), code: "mock_popup_stop" }))
    return popup
  })
  const reply = r.rpc("setup", request)
  await vi.waitFor(() => expect(r.card.querySelector("button")).not.toBeNull())
  r.card.querySelector("button")!.click()
  expect(await reply).toMatchObject({ ok: false, error: { code: "mock_popup_stop" } })
  expect(r.open).toHaveBeenCalledOnce()
  expect(r.get).not.toHaveBeenCalled()
  expect(r.newVmk).not.toHaveBeenCalled()
})
