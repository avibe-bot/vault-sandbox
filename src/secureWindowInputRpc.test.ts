// Sealing a whole protected secret from values typed in the secure window, at
// the REAL main.ts frame (RPC, lifecycle, operationUi) against scripted windows.
// Pure Node: no browser, no passkey (credentials.get throws), no clipboard.
// Every key, root, secret and value is public synthetic test data.
import { afterEach, describe, expect, it, vi } from "vitest"
import { installCardDocument } from "./testDom"
import {
  buildWrapMeta, bytesToBase64, openProtected, protectedRecordContextFromMetadata, unpackProtectedRecord,
  withWrapMetaMetadata, type ProtectedRecordEnvelope,
} from "./vaultCrypto"
import { CHANNEL, VERSION } from "./rpc"

vi.setConfig({ testTimeout: 30_000 })

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const realSetTimeout = globalThis.setTimeout
const tick = (ms = 5): Promise<void> => new Promise((resolve) => { realSetTimeout(resolve, ms) })
const UNLOCK = { kind: "unlock", prfOutput: bytesToBase64(new Uint8Array(32).fill(0x22)), prfSalt: bytesToBase64(new Uint8Array(32).fill(0x33)) }
const PASSWORD = { type: "password", length: 24, digits: true, symbols: true, noLookalikes: false }
type Field = { record: string; envelope?: ProtectedRecordEnvelope; generated: boolean; recipe?: unknown }
type Reply = { id: string; ok: boolean; result?: { fields?: Field[]; establishingVmk?: boolean } & Record<string, unknown>; error?: { code: string; message?: string; retryable?: boolean } }
type AuthRequest = { passkey?: string; keepOpen?: true; kind?: string; name?: string; mode?: string; notAfter?: number
  rows?: Array<{ label: string; required: boolean; isDefault: boolean; generate?: unknown }>; prompt?: unknown }

async function runtime() {
  vi.resetModules()
  const events = new EventTarget()
  const replies = new Map<string, (reply: Reply) => void>()
  const toParent: unknown[] = []
  const parent = { postMessage: vi.fn((value: Reply) => { toParent.push(structuredClone(value)); if (value?.id) replies.get(value.id)?.(value) }) }
  const nav = {
    credentials: { get: vi.fn(async () => { throw new Error("passkey calls are forbidden in this test") }), create: vi.fn() },
    userAgent: "test", platform: "test", maxTouchPoints: 0,
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=test`, hash: "#mode=test", search: "" }
  let build: unknown
  function dispatch(source: unknown, data: unknown, eventOrigin = origin): void {
    const event = new Event("message")
    Object.assign(event, { origin: eventOrigin, source, data })
    events.dispatchEvent(event)
  }
  /** A scripted top-level window. Nothing happens in it unless the test says so. */
  const makeWindow = (id = `input-window-${crypto.randomUUID()}`) => {
    const posted: Array<{ message: { type: string; request?: AuthRequest }; target: string }> = []
    const popup = {
      id, closed: false,
      close: vi.fn(() => { popup.closed = true }),
      focus: vi.fn(),
      postMessage: vi.fn((message: { type: string; request?: AuthRequest }, target: string) => { posted.push({ message: structuredClone(message), target }) }),
    }
    const requests = (): AuthRequest[] => posted.filter((entry) => entry.message.type === "authorization-request").map((entry) => entry.message.request!)
    const ready = (overrides: { build?: unknown; origin?: string } = {}): void =>
      dispatch(popup, { type: "authorization-ready", build: "build" in overrides ? overrides.build : build, id }, overrides.origin ?? origin)
    return {
      id, popup, posted, requests, ready,
      dismissed: (): boolean => posted.some((entry) => entry.message.type === "authorization-dismiss"),
      approve: (result: unknown): void => dispatch(popup, { type: "authorization-approved", build, id, result }),
      fail: (code: string): void => dispatch(popup, { type: "authorization-error", build, id, code, message: "public mock", retryable: true }),
      failAs: (code: string, message: string, retryable: boolean): void => dispatch(popup, { type: "authorization-error", build, id, code, message, retryable }),
      async next(limitMs = 3_000): Promise<AuthRequest> {
        const before = requests().length
        const until = performance.now() + limitMs
        while (performance.now() < until) {
          if (!popup.closed) ready()
          if (requests().length > before) return requests().at(-1)!
          await tick()
        }
        throw new Error(`frame sent no authorization-request to window ${id}`)
      },
    }
  }
  const opened: Array<ReturnType<typeof makeWindow>> = []
  const window = {
    location, navigator: nav, self: {}, top: {}, parent, opener: null,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open: vi.fn((url: string) => {
      const scripted = makeWindow(new URLSearchParams(new URL(url).hash.slice(1)).get("id")!)
      opened.push(scripted)
      return scripted.popup
    }),
    close: vi.fn(),
  }
  const storage = new Map<string, string>()
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  const dom = installCardDocument(vi.stubGlobal)
  vi.stubGlobal("navigator", nav)

  const vmk = new Uint8Array(32).fill(0x44)
  const wrapMeta = withWrapMetaMetadata(await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }]), { rpId: "sandbox.avibe.bot", vaultUserHandle: "public-input" })
  const rpc = (op: string, payload: unknown, authorizationWindow?: string): Promise<Reply> & { settled: () => boolean } => {
    const id = crypto.randomUUID()
    let done = false
    const reply = new Promise<Reply>((resolve) => replies.set(id, resolve))
    dispatch(parent, { channel: CHANNEL, version: VERSION, id, op, payload, ...(authorizationWindow ? { authorizationWindow } : {}) }, parentOrigin)
    const result = reply.finally(() => { done = true; replies.delete(id) }) as Promise<Reply> & { settled: () => boolean }
    result.settled = () => done
    return result
  }
  build = (await import("./rpc")).BUILD
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-input-handshake-1234567890" })).ok).toBe(true)
  const lifecycle = await import("./vaultLifecycle")
  const policy = await import("./policy")
  const setPolicy = (input: { strictApprovals?: boolean; windowSeconds?: 300 | 600; parentValueSealAllowed?: boolean } = {}): void => {
    policy.setVaultSessionPolicy({ windowSeconds: input.windowSeconds ?? 300, strictApprovals: input.strictApprovals ?? false, parentValueSealAllowed: input.parentValueSealAllowed ?? true })
  }
  setPolicy()
  const unlock = (): void => {
    lifecycle.commitUnlockedVmk({ vmk: new Uint8Array(vmk), wrapMeta, scopeId: "public-input", freshSetup: false, policy: policy.currentVaultSessionPolicy() })
  }
  const frameSurface = (): string => JSON.stringify(toParent) + dom.body.textContent
  const uiShows = (): number => toParent.filter((message) => (message as { event?: string }).event === "ui.show").length
  type CardButton = { click(): void; disabled: boolean; textContent: string; classList: { contains(name: string): boolean } }
  const cardButtons = (): CardButton[] => dom.body.querySelectorAll("button") as unknown as CardButton[]
  const clickFrameCard = async (): Promise<string> => {
    const until = performance.now() + 4_000
    while (performance.now() < until) {
      const confirm = cardButtons().filter((node) => !node.classList.contains("secondary")).at(-1)
      if (confirm && !confirm.disabled) { const label = confirm.textContent; confirm.click(); return label }
      await tick(10)
    }
    throw new Error("the frame shows no enabled card button")
  }
  /** What a value sealed for `record` opens to, with that record's own context. */
  const open = async (record: string, envelope: ProtectedRecordEnvelope | undefined): Promise<string> => {
    const unpacked = unpackProtectedRecord(envelope!)
    return new TextDecoder().decode(await openProtected(unpacked.sealed, vmk, protectedRecordContextFromMetadata(record, unpacked.recordMetadata)))
  }
  return { rpc, makeWindow, opened, lifecycle, setPolicy, unlock, wrapMeta, nav, dom, frameSurface, uiShows, window, clickFrameCard, cardButtons, open, toParent }
}
type R = Awaited<ReturnType<typeof runtime>>

const login = (r: R, mode: "create" | "edit", fields?: unknown[]) => ({
  kind: "static", inputMode: "secure-window", secret: "PUBLIC_LOGIN", mode, wrapMeta: r.wrapMeta,
  fields: fields ?? (mode === "create"
    ? [
        { record: "PUBLIC_LOGIN", label: "password", required: true, generate: PASSWORD },
        { record: "PUBLIC_LOGIN.username", label: "username", required: true },
      ]
    : [
        { record: "PUBLIC_LOGIN", label: "password", required: false, generate: PASSWORD },
        { record: "PUBLIC_LOGIN.username", label: "username", required: false },
        { record: "PUBLIC_LOGIN.totp", label: "totp", required: true },
      ]),
})
const entered = (...values: Array<string | null | [string, "generated"]>) => ({
  kind: "entered",
  values: values.map((value) => Array.isArray(value) ? { value: value[0], generated: true } : { value, generated: false }),
})

afterEach(async () => {
  vi.useRealTimers()
  const lifecycle = await import("./vaultLifecycle")
  lifecycle.resetVaultSessionForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("seal with values typed in the secure window", () => {
  it("I1 unlocked create: the parent's window takes the values; the page gets envelopes only, each bound to its record", async () => {
    const r = await runtime()
    r.unlock()
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    const asked = await w.next()
    expect(asked).toEqual({
      kind: "protected-input", name: "PUBLIC_LOGIN", mode: "create", notAfter: r.lifecycle.vaultStatus().expiresAt,
      rows: [{ label: "password", required: true, isDefault: true, generate: PASSWORD }, { label: "username", required: true, isDefault: false }],
    })
    expect(w.posted.every((entry) => entry.target === origin)).toBe(true)
    w.approve(entered(["public-generated-password", "generated"], "public-user"))
    const reply = await pending
    expect(reply.ok, JSON.stringify(reply.error)).toBe(true)
    expect(Object.keys(reply.result!).sort()).toEqual(["establishingVmk", "fields"])
    expect(reply.result!.establishingVmk).toBe(false)
    const [password, username] = reply.result!.fields!
    expect(password).toMatchObject({ record: "PUBLIC_LOGIN", generated: true, recipe: PASSWORD })
    expect(username).toMatchObject({ record: "PUBLIC_LOGIN.username", generated: false })
    expect("recipe" in username).toBe(false)
    expect(await r.open("PUBLIC_LOGIN", password.envelope)).toBe("public-generated-password")
    expect(await r.open("PUBLIC_LOGIN.username", username.envelope)).toBe("public-user")
    // Bound to its record: under another record's context it does not open.
    await expect(r.open("PUBLIC_LOGIN.username", password.envelope)).rejects.toThrow()
    // The same protected record a parent-value seal makes for that record.
    const parentValue = await r.rpc("seal", { kind: "static", inputMode: "parent-value", name: "PUBLIC_LOGIN.username", value: "public-user", wrapMeta: r.wrapMeta })
    expect(unpackProtectedRecord(username.envelope!).recordMetadata).toEqual(unpackProtectedRecord(parentValue.result!.envelope as ProtectedRecordEnvelope).recordMetadata)
    // No value ever went to the page or into this frame's own document.
    for (const value of ["public-generated-password", "public-user"]) expect(r.frameSurface()).not.toContain(value)
    expect(r.uiShows()).toBe(0)
    expect(r.window.open).not.toHaveBeenCalled()
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
  })

  it("I2 edit: a saved field left empty gets no envelope at all (keep), never an empty or deleted value; filled and new fields are sealed", async () => {
    const r = await runtime()
    r.unlock()
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "edit"), w.id)
    const asked = await w.next()
    expect(asked.rows?.map((row) => [row.label, row.required, row.isDefault])).toEqual([["password", false, true], ["username", false, false], ["totp", true, false]])
    w.approve(entered("public-new-password", null, "public-otp-seed"))
    const reply = await pending
    expect(reply.ok, JSON.stringify(reply.error)).toBe(true)
    const [password, username, totp] = reply.result!.fields!
    expect(username).toEqual({ record: "PUBLIC_LOGIN.username", generated: false })
    expect(await r.open("PUBLIC_LOGIN", password.envelope)).toBe("public-new-password")
    expect(await r.open("PUBLIC_LOGIN.totp", totp.envelope)).toBe("public-otp-seed")
    expect(reply.result!.fields!.map((field) => field.record)).toEqual(["PUBLIC_LOGIN", "PUBLIC_LOGIN.username", "PUBLIC_LOGIN.totp"])

    // An answer that would leave a required field empty, or save nothing, seals nothing. The real
    // window cannot send one, so the frame fails closed, as for any non-retryable fault.
    const saved = [{ record: "PUBLIC_LOGIN", label: "password", required: false }, { record: "PUBLIC_LOGIN.username", label: "username", required: false }]
    for (const [fields, answer] of [[undefined, entered("public-x", null, null)], [saved, entered(null, null)]] as const) {
      r.unlock()
      const again = r.makeWindow()
      const refused = r.rpc("seal", login(r, "edit", fields as unknown[] | undefined), again.id)
      await again.next()
      again.approve(answer)
      const failure = await refused
      expect(failure).toMatchObject({ ok: false, error: { code: "authorization_result_invalid" } })
      expect(failure.result).toBeUndefined()
      expect(r.lifecycle.vaultStatus().state).toBe("locked")
    }
  })

  it("I3 locked: the same window unlocks, stays open, then takes the values; one passkey, in that window", async () => {
    const r = await runtime()
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    const unlock = await w.next()
    expect(unlock).toMatchObject({ passkey: "unlock", keepOpen: true })
    expect(JSON.stringify(unlock.prompt)).toContain("PUBLIC_LOGIN")
    w.approve(UNLOCK)
    const asked = await w.next()
    expect(asked.kind).toBe("protected-input")
    expect(asked.notAfter).toBe(r.lifecycle.vaultStatus().expiresAt)
    expect(w.popup.close).not.toHaveBeenCalled()
    w.approve(entered("public-password", "public-user"))
    const reply = await pending
    expect(reply.ok, JSON.stringify(reply.error)).toBe(true)
    expect(await r.open("PUBLIC_LOGIN", reply.result!.fields![0].envelope)).toBe("public-password")
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
    expect(r.window.open).not.toHaveBeenCalled()
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
  })

  it("I4 a page frozen behind its window: a frame card with no value, then a window this frame opens takes the values", async () => {
    const r = await runtime()
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    await w.next()
    w.approve(UNLOCK)
    w.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
    expect(r.window.open).not.toHaveBeenCalled()
    expect(r.dom.body.textContent).toContain("Unlocked")
    expect(await r.clickFrameCard()).toBe("Open window")
    const fresh = r.opened[0]
    expect(fresh.id).not.toBe(w.id)
    const asked = await fresh.next()
    expect(asked.kind).toBe("protected-input")
    expect(w.requests()).toHaveLength(1)
    fresh.approve(entered("public-password", "public-user"))
    const reply = await pending
    expect(reply.ok, JSON.stringify(reply.error)).toBe(true)
    expect(await r.open("PUBLIC_LOGIN.username", reply.result!.fields![1].envelope)).toBe("public-user")
    expect(r.frameSurface()).not.toContain("public-password")
  })

  it("I5 refuses a seal without the parent's window, and the 32-field rule, before any window", async () => {
    const r = await runtime()
    r.unlock()
    expect(await r.rpc("seal", login(r, "create"))).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    const fields = Array.from({ length: 33 }, (_unused, index) => index === 0
      ? { record: "PUBLIC_LOGIN", label: "value", required: true }
      : { record: `PUBLIC_LOGIN.f${index}`, label: `f${index}`, required: true })
    const w = r.makeWindow()
    expect(await r.rpc("seal", login(r, "create", fields), w.id)).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    for (let attempt = 0; attempt < 20; attempt += 1) { w.ready(); await tick() }
    expect(w.requests()).toHaveLength(0)
    expect(r.window.open).not.toHaveBeenCalled()
    // 32 is fine: one window, 32 rows, 32 envelopes.
    const most = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create", fields.slice(0, 32)), most.id)
    expect((await most.next()).rows).toHaveLength(32)
    most.approve(entered(...fields.slice(0, 32).map((_unused, index) => `public-${index}`)))
    const reply = await pending
    expect(reply.result?.fields).toHaveLength(32)
    expect(await r.open("PUBLIC_LOGIN.f31", reply.result!.fields![31].envelope)).toBe("public-31")
  })

  it("I6 the parent-value policy does not apply: no value ever crosses the page here", async () => {
    const r = await runtime()
    r.setPolicy({ parentValueSealAllowed: false })
    r.unlock()
    expect(await r.rpc("seal", { kind: "static", inputMode: "parent-value", name: "PUBLIC_LOGIN", value: "public", wrapMeta: r.wrapMeta }))
      .toMatchObject({ ok: false, error: { code: "parent_value_seal_disabled" } })
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    await w.next()
    w.approve(entered("public-password", "public-user"))
    expect((await pending).ok).toBe(true)
  })

  it("I7 only the paired window's answer counts: a twin with the same id gets nothing and its values are ignored", async () => {
    const r = await runtime()
    r.unlock()
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    await w.next()
    const twin = r.makeWindow(w.id)
    for (let attempt = 0; attempt < 30; attempt += 1) { twin.ready(); await tick() }
    expect(twin.posted).toHaveLength(0)
    twin.approve(entered("public-forged", "public-forged-user"))
    await tick(30)
    expect(pending.settled()).toBe(false)
    w.approve(entered("public-password", "public-user"))
    const reply = await pending
    expect(await r.open("PUBLIC_LOGIN", reply.result!.fields![0].envelope)).toBe("public-password")
  })
})

describe("what ends a secure-window seal, and what the parent is told", () => {
  it("E1 Cancel, a closed window and the window's own limit are three distinct errors, with no envelopes", async () => {
    for (const [ending, expected] of [
      ["cancel", "authorization_cancelled"], ["limit", "authorization_window_timeout"], ["closed", "authorization_window_closed"],
    ] as const) {
      const r = await runtime()
      r.unlock()
      const w = r.makeWindow()
      const pending = r.rpc("seal", login(r, "create"), w.id)
      await w.next()
      if (ending === "closed") w.popup.closed = true
      // Exactly what the real window sends for its Cancel button.
      else if (ending === "cancel") w.failAs("authorization_cancelled", "operation-cancelled", false)
      else w.fail(expected)
      const reply = await pending
      expect(reply, ending).toMatchObject({ ok: false, error: { code: expected } })
      expect(reply.result, ending).toBeUndefined()
      // Not a fault: the vault stays unlocked for the next try.
      expect(r.lifecycle.vaultStatus().state, ending).toBe("unlocked")
      r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()
    }
  })

  it("E2 the frame's own 5-minute limit closes the window", async () => {
    const r = await runtime()
    r.setPolicy({ windowSeconds: 600 })
    r.unlock()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    for (let step = 0; step < 300 && w.requests().length === 0; step += 1) { w.ready(); await tick() }
    expect(w.requests()[0]?.kind).toBe("protected-input")
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100)
    for (let step = 0; step < 300 && !pending.settled(); step += 1) await tick()
    expect(await pending).toMatchObject({ ok: false, error: { code: "authorization_window_timeout" } })
    expect(w.popup.close).toHaveBeenCalled()
  })

  it("E3 a lock, or a newer operation, while typing closes the window and seals nothing", async () => {
    for (const ending of ["lock", "newer"] as const) {
      const r = await runtime()
      r.unlock()
      const w = r.makeWindow()
      const pending = r.rpc("seal", login(r, "create"), w.id)
      await w.next()
      let newer: ReturnType<R["rpc"]> | undefined
      const other = r.makeWindow()
      if (ending === "lock") expect((await r.rpc("lock", {})).ok).toBe(true)
      else newer = r.rpc("seal", login(r, "create"), other.id)
      const reply = await pending
      expect(reply, ending).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
      expect(w.popup.close, ending).toHaveBeenCalled()
      // A late answer from the closed window changes nothing.
      w.approve(entered("public-late", "public-late-user"))
      if (newer) {
        expect((await other.next()).kind).toBe("protected-input")
        other.fail("authorization_cancelled")
        expect((await newer).ok).toBe(false)
      }
      r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()
    }
  })

  it("E5 a failure between the unlock and the values dismisses the kept window and locks again", async () => {
    const r = await runtime()
    const w = r.makeWindow()
    const pending = r.rpc("seal", login(r, "create"), w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    r.lifecycle.lockVault({ broadcast: false, reason: "manual-lock" })
    const reply = await pending
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(w.requests()).toHaveLength(1)
    expect(w.dismissed()).toBe(true)
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
  })

  it("E4 locked: a cancelled unlock or a cancelled input leaves the vault locked; the frame card's Cancel is a cancel too", async () => {
    for (const ending of ["unlock", "input", "card"] as const) {
      const r = await runtime()
      const w = r.makeWindow()
      const pending = r.rpc("seal", login(r, "create"), w.id)
      await w.next()
      if (ending === "unlock") w.fail("authorization_cancelled")
      else {
        w.approve(UNLOCK)
        if (ending === "input") {
          expect((await w.next()).kind).toBe("protected-input")
          w.fail("authorization_cancelled")
        } else {
          w.popup.closed = true
          await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
          r.cardButtons().filter((node) => node.classList.contains("secondary")).at(-1)!.click()
        }
      }
      const reply = await pending
      expect(reply, ending).toMatchObject({ ok: false, error: { code: "authorization_cancelled" } })
      expect(r.lifecycle.vaultStatus().state, ending).toBe("locked")
      expect(r.window.open, ending).not.toHaveBeenCalled()
      r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()
    }
  })
})
