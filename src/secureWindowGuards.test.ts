// Guards of the kept-open secure window, from the independent PR50 review probes.
// The REAL top-level authorization window (main.ts in #mode=authorize) driven by fake requesters.
// Pure Node: fake DOM, mocked clipboard (native path) and a stubbed execCommand (fallback path),
// no passkey, no browser. Every value is public synthetic test data.
import { afterEach, describe, expect, it, vi } from "vitest"
import { installCardDocument, type FakeElement } from "./testDom"

// Real-crypto, multi-window flows run long under a parallel full suite.
vi.setConfig({ testTimeout: 30_000 })

const origin = "https://sandbox.avibe.bot"
const id = "window-1234567890abcdef"
type Message = { type: string; id: string; build?: unknown; result?: unknown; code?: string; request?: unknown }

async function windowRuntime() {
  vi.resetModules()
  const events = new EventTarget()
  const sink = (): { inbox: Message[]; postMessage: (message: Message, target: string) => void; targets: string[] } => {
    const inbox: Message[] = []
    const targets: string[] = []
    return { inbox, targets, postMessage: (message, target) => { inbox.push(structuredClone(message)); targets.push(target) } }
  }
  // The parent app opened this window; its sandbox frames are opener.frames[n].
  const frameA = sink()
  const frameB = sink()
  const opener = { ...sink(), frames: { length: 2, 0: frameA, 1: frameB } }
  const stranger = sink()
  const clipboard = { writeText: vi.fn(async (_text: string) => {}) }
  const credentials = { get: vi.fn(async () => { throw new Error("no passkey in this probe") }), create: vi.fn() }
  const hash = `#mode=authorize&id=${id}&locale=en&theme=dark`
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html${hash}`, hash, search: "" }
  const close = vi.fn()
  const window = {
    location, self: {}, top: {}, parent: { postMessage: vi.fn() }, opener,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open: vi.fn(), close,
  }
  window.top = window.self
  vi.stubGlobal("window", window)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  const dom = installCardDocument(vi.stubGlobal)
  vi.stubGlobal("navigator", { clipboard, credentials, userAgent: "test", platform: "test", maxTouchPoints: 0 })
  const { BUILD } = await import("./rpc")
  await import("./main")
  const send = (source: unknown, data: Record<string, unknown>, overrides: { origin?: string; build?: unknown; id?: string } = {}): void => {
    const event = new Event("message")
    Object.assign(event, { origin: overrides.origin ?? origin, source, data: { build: "build" in overrides ? overrides.build : BUILD, id: overrides.id ?? id, ...data } })
    events.dispatchEvent(event)
  }
  const buttons = (): FakeElement[] => dom.body.querySelectorAll("button")
  const button = (text: string): FakeElement => {
    const found = buttons().find((node) => node.textContent === text)
    if (!found) throw new Error(`button not found: ${text} in [${buttons().map((node) => node.textContent).join(" | ")}]`)
    return found
  }
  const legacy = (passkey: string, extra: Record<string, unknown> = {}) => ({
    prompt: { title: { text: "PUBLIC review" }, subtitle: { text: "PUBLIC_SECRET" }, label: { text: "Approve" } },
    wrapMeta: JSON.stringify({ v: 1, copies: [] }), passkey, ...extra,
  })
  const display = (rows: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) =>
    ({ kind: "protected-display", name: "PUBLIC_LOGIN", wrapMeta: JSON.stringify({ v: 1, copies: [] }), rows, ...extra })
  const text = (): string => dom.body.textContent
  const of = (inbox: Message[], type: string): Message[] => inbox.filter((message) => message.type === type)
  const fire = (type: string): void => { events.dispatchEvent(new Event(type)) }
  return { BUILD, opener, frameA, frameB, stranger, clipboard, credentials, close, dom, send, fire, buttons, button, legacy, display, text, of }
}
type W = Awaited<ReturnType<typeof windowRuntime>>

/** A keepOpen approval from frame A under fake timers: the window ends in its follow-up state. */
async function approveKeepOpen(w: W): Promise<void> {
  w.send(w.frameA, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
  await vi.advanceTimersByTimeAsync(600)
  w.button("Approve").click()
  await vi.advanceTimersByTimeAsync(10)
  expect(w.text()).toContain("Checking the request.")
  expect(w.of(w.frameA.inbox, "authorization-approved")).toHaveLength(1)
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("PR50 kept-open window: who can reach it", () => {
  it("W1 pins the follow-up to the exact requester: other frames, the opener, a stranger, a wrong build, id or origin are all ignored", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    await approveKeepOpen(w)
    const forged = w.display([{ value: "public-forged" }])
    w.send(w.frameB, { type: "authorization-request", request: forged })
    w.send(w.opener, { type: "authorization-request", request: forged })
    w.send(w.stranger, { type: "authorization-request", request: forged })
    w.send(w.frameA, { type: "authorization-request", request: forged }, { build: { buildHash: "0".repeat(64), sandboxVersion: "0.1.0" } })
    w.send(w.frameA, { type: "authorization-request", request: forged }, { id: "window-other-0000000000" })
    w.send(w.frameA, { type: "authorization-request", request: forged }, { origin: "https://app.avibe.bot" })
    for (const source of [w.frameB, w.opener, w.stranger]) w.send(source, { type: "authorization-dismiss" })
    w.send(w.frameA, { type: "authorization-dismiss" }, { origin: "https://app.avibe.bot" })
    await vi.advanceTimersByTimeAsync(300)
    expect(w.text()).not.toContain("public-forged")
    expect(w.text()).toContain("Checking the request.")
    expect(w.close).not.toHaveBeenCalled()
    for (const other of [w.frameB, w.opener, w.stranger]) expect(w.of(other.inbox, "authorization-error")).toHaveLength(0)
    // In the follow-up state it announces itself to the pinned requester only, at the sandbox origin.
    const before = [w.frameA, w.frameB, w.opener].map((sinkOf) => w.of(sinkOf.inbox, "authorization-ready").length)
    await vi.advanceTimersByTimeAsync(1_100)
    const after = [w.frameA, w.frameB, w.opener].map((sinkOf) => w.of(sinkOf.inbox, "authorization-ready").length)
    expect(after[0]).toBeGreaterThan(before[0])
    expect(after.slice(1)).toEqual(before.slice(1))
    expect([...w.frameA.targets, ...w.frameB.targets, ...w.opener.targets].every((target) => target === origin)).toBe(true)
    // The genuine follow-up still works afterwards.
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-genuine" }]) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.text()).toContain("public-genuine")
  })

  it("W2 refuses a replayed first request (unlock or none, each with keepOpen) as the follow-up and closes", async () => {
    for (const replay of ["unlock", "none"] as const) {
      const w = await windowRuntime()
      vi.useFakeTimers()
      await approveKeepOpen(w)
      w.send(w.frameA, { type: "authorization-request", request: w.legacy(replay, { keepOpen: true }) })
      await vi.advanceTimersByTimeAsync(300)
      expect(w.frameA.inbox.at(-1)).toMatchObject({ type: "authorization-error", code: "authorization_request_invalid" })
      expect(w.close).toHaveBeenCalled()
      expect(w.credentials.get).not.toHaveBeenCalled()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it("W3 takes exactly one follow-up: during the display a second display, a confirmation and a dismiss do nothing", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    await approveKeepOpen(w)
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-first" }]) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.text()).toContain("public-first")
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-second" }]) })
    w.send(w.frameA, { type: "authorization-request", request: w.legacy("none") })
    w.send(w.frameA, { type: "authorization-dismiss" })
    await vi.advanceTimersByTimeAsync(300)
    expect(w.text()).toContain("public-first")
    expect(w.text()).not.toContain("public-second")
    expect(w.close).not.toHaveBeenCalled()
    w.button("Done").click()
    await vi.advanceTimersByTimeAsync(300)
    expect(w.frameA.inbox.at(-1)).toMatchObject({ type: "authorization-approved", result: { kind: "displayed" } })
    expect(w.close).toHaveBeenCalled()
    expect(w.text()).not.toContain("public-first")
  })

  it("W4 a passkey-free confirmation is the other allowed follow-up; it closes the window and nothing follows it", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    await approveKeepOpen(w)
    w.send(w.frameA, { type: "authorization-request", request: w.legacy("none") })
    await vi.advanceTimersByTimeAsync(600)
    w.button("Approve").click()
    await vi.advanceTimersByTimeAsync(300)
    expect(w.of(w.frameA.inbox, "authorization-approved").at(-1)).toMatchObject({ result: { kind: "confirmed" } })
    expect(w.close).toHaveBeenCalled()
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-late" }]) })
    await vi.advanceTimersByTimeAsync(300)
    expect(w.text()).not.toContain("public-late")
    expect(w.credentials.get).not.toHaveBeenCalled()
  })

  it("W5 a display may now be the first request, but only from a sandbox-origin, same-build, same-id candidate of the opener", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    const rows = w.display([{ label: "password", value: "public-first-request" }, { label: "username", value: "public-user" }])
    w.send(w.stranger, { type: "authorization-request", request: rows })
    w.send(w.frameA, { type: "authorization-request", request: rows }, { origin: "https://app.avibe.bot" })
    w.send(w.frameA, { type: "authorization-request", request: rows }, { build: { buildHash: "0".repeat(64), sandboxVersion: "0.1.0" } })
    w.send(w.frameA, { type: "authorization-request", request: rows }, { id: "window-other-0000000000" })
    await vi.advanceTimersByTimeAsync(300)
    expect(w.text()).not.toContain("View secret")
    expect(w.of(w.stranger.inbox, "authorization-error")).toHaveLength(0)
    w.send(w.frameA, { type: "authorization-request", request: rows })
    await vi.advanceTimersByTimeAsync(10)
    // Shown without any approval in this window; several values start hidden.
    expect(w.text()).toContain("View secret")
    expect(w.text()).not.toContain("public-first-request")
    expect(w.close).not.toHaveBeenCalled()
    // It then takes nothing else.
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-second" }]) })
    w.send(w.frameB, { type: "authorization-request", request: w.display([{ value: "public-second" }]) })
    await vi.advanceTimersByTimeAsync(300)
    expect(w.text()).not.toContain("public-second")
    w.button("Done").click()
    await vi.advanceTimersByTimeAsync(300)
    expect(w.frameA.inbox.at(-1)).toMatchObject({ type: "authorization-approved", result: { kind: "displayed" } })
    expect(w.close).toHaveBeenCalled()
  })

  it("W6 a malformed follow-up is answered with an error and shows nothing; the 5 s wait then ends the window", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    await approveKeepOpen(w)
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-extra" }], { extra: true }) })
    w.send(w.frameA, { type: "authorization-request", request: w.display(Array.from({ length: 33 }, () => ({ value: "public-many" }))) })
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: 7 }]) })
    await vi.advanceTimersByTimeAsync(300)
    expect(w.of(w.frameA.inbox, "authorization-error")).toHaveLength(3)
    expect(w.text()).not.toContain("public-")
    expect(w.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(7_000)
    expect(w.close).toHaveBeenCalled()
  })

  it("W7 shows 32 rows hidden and never puts a hidden value in the DOM, including after Show then Hide", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    await approveKeepOpen(w)
    const rows = Array.from({ length: 32 }, (_unused, index) => ({ label: `field_${index}`, value: `public-value-${index}-end` }))
    w.send(w.frameA, { type: "authorization-request", request: w.display(rows) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.text()).toContain("field_31")
    expect(w.text()).not.toContain("public-value-")
    w.buttons().filter((node) => node.textContent === "Show")[5].click()
    expect(w.text()).toContain("public-value-5-end")
    expect(w.text()).not.toContain("public-value-4-end")
    w.button("Hide").click()
    expect(w.text()).not.toContain("public-value-")
    w.buttons().filter((node) => node.textContent === "Copy")[31].click()
    await vi.advanceTimersByTimeAsync(10)
    expect(w.clipboard.writeText).toHaveBeenCalledExactlyOnceWith("public-value-31-end")
    expect(w.text()).not.toContain("public-value-")
  })
})

describe("PR50 kept-open window: what ends a display", () => {
  it("W8 bounds a shown value itself, 5 minutes, even when its requester is silent (frozen), as a follow-up or as a first request", async () => {
    for (const mode of ["follow-up", "first-request"] as const) {
      const w = await windowRuntime()
      vi.useFakeTimers()
      if (mode === "follow-up") await approveKeepOpen(w)
      w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }]) })
      await vi.advanceTimersByTimeAsync(10)
      expect(w.text(), mode).toContain("public-api-key")
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 - 1_000)
      expect(w.text(), mode).toContain("public-api-key")
      expect(w.close, mode).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(w.text(), mode).not.toContain("public-api-key")
      expect(w.of(w.frameA.inbox, "authorization-error").at(-1), mode).toMatchObject({ code: "authorization_window_timeout" })
      await vi.advanceTimersByTimeAsync(300)
      expect(w.close, mode).toHaveBeenCalled()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it.each(["visibilitychange", "pageshow", "focus"] as const)("W8b re-checks the deadline on %s, for a window whose timers were frozen", async (type) => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }]) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.text()).toContain("public-api-key")
    // The clock moved on while this window was suspended; no timer has run yet.
    vi.setSystemTime(Date.now() + 6 * 60 * 1000)
    w.fire(type)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.text()).not.toContain("public-api-key")
    expect(w.of(w.frameA.inbox, "authorization-error").at(-1)).toMatchObject({ code: "authorization_window_timeout" })
  })

  it("W8d never shows past the unlocked session's end, when that comes before its own 5 minutes", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }], { notAfter: Date.now() + 60_000 }) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.text()).toContain("public-api-key")
    await vi.advanceTimersByTimeAsync(59_000)
    expect(w.text()).toContain("public-api-key")
    await vi.advanceTimersByTimeAsync(1_000)
    expect(w.text()).not.toContain("public-api-key")
    expect(w.of(w.frameA.inbox, "authorization-error").at(-1)).toMatchObject({ code: "authorization_window_timeout" })
  })

  it("W8e a later session end never extends its own 5 minutes", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }], { notAfter: Date.now() + 60 * 60 * 1000 }) })
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 10)
    expect(w.text()).not.toContain("public-api-key")
  })

  it("W8c wipes and ends a display on pagehide", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }]) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.text()).toContain("public-api-key")
    w.fire("pagehide")
    await vi.advanceTimersByTimeAsync(0)
    expect(w.text()).not.toContain("public-api-key")
    expect(w.of(w.frameA.inbox, "authorization-error").at(-1)).toMatchObject({ code: "authorization_window_closed" })
  })

  it("W9 waits 5 s for its follow-up, then says where to continue, takes nothing more and closes", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    await approveKeepOpen(w)
    await vi.advanceTimersByTimeAsync(4_900)
    expect(w.text()).toContain("Checking the request.")
    expect(w.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(w.text()).toContain("Continue in Avibe.")
    const announcedBefore = w.of(w.frameA.inbox, "authorization-ready").length
    // A follow-up or a dismiss that arrives in the closing phase does nothing and gets no answer.
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-late" }]) })
    w.send(w.frameA, { type: "authorization-request", request: w.legacy("none") })
    w.send(w.frameA, { type: "authorization-dismiss" })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(w.text()).not.toContain("public-late")
    expect(w.text()).not.toContain("PUBLIC review")
    expect(w.of(w.frameA.inbox, "authorization-error")).toHaveLength(0)
    expect(w.of(w.frameA.inbox, "authorization-ready")).toHaveLength(announcedBefore)
    expect(w.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(w.close).toHaveBeenCalledOnce()
  })
})
