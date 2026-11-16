// The secure window's notAfter bound, from the independent PR50 review probes.
// The REAL top-level authorization window (main.ts in #mode=authorize) driven by fake requesters.
// Pure Node: fake DOM, mocked clipboard (native path) and a stubbed execCommand (fallback path),
// no passkey, no browser. Every value is public synthetic test data.
import { afterEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 30_000 })
import { installCardDocument, type FakeElement } from "./testDom"

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

const FIVE_MINUTES = 5 * 60 * 1000
const errors = (w: W): Message[] => w.of(w.frameA.inbox, "authorization-error")

describe("0e3f: the display's end is min(5 minutes, the session's end)", () => {
  it("N1 no notAfter at all: exactly the window's own 5 minutes", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }]) })
    await vi.advanceTimersByTimeAsync(10)
    await vi.advanceTimersByTimeAsync(FIVE_MINUTES - 500)
    expect(w.text()).toContain("public-api-key")
    await vi.advanceTimersByTimeAsync(600)
    expect(w.text()).not.toContain("public-api-key")
    expect(errors(w).at(-1)).toMatchObject({ code: "authorization_window_timeout" })
  })

  it("N2 an earlier session end wins, with its own timer running and after a freeze with no timer", async () => {
    for (const mode of ["timer", "frozen"] as const) {
      const w = await windowRuntime()
      vi.useFakeTimers()
      await approveKeepOpen(w)
      w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }], { notAfter: Date.now() + 90_000 }) })
      await vi.advanceTimersByTimeAsync(10)
      expect(w.text(), mode).toContain("public-api-key")
      if (mode === "timer") {
        await vi.advanceTimersByTimeAsync(89_000)
        expect(w.text(), mode).toContain("public-api-key")
        await vi.advanceTimersByTimeAsync(1_100)
      } else {
        // Before the session's end a resume changes nothing; after it, with no timer run, a resume ends the display.
        vi.setSystemTime(Date.now() + 80_000)
        w.fire("focus")
        await vi.advanceTimersByTimeAsync(0)
        expect(w.text(), mode).toContain("public-api-key")
        vi.setSystemTime(Date.now() + 20_000)
        w.fire("visibilitychange")
        await vi.advanceTimersByTimeAsync(0)
      }
      expect(w.text(), mode).not.toContain("public-api-key")
      expect(errors(w).at(-1), mode).toMatchObject({ code: "authorization_window_timeout" })
      await vi.advanceTimersByTimeAsync(300)
      expect(w.close, mode).toHaveBeenCalled()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it("N3 a later session end never widens it: one hour, a huge number and the largest safe integer all end at 5 minutes", async () => {
    for (const later of [60 * 60 * 1000, 1e300, Number.MAX_SAFE_INTEGER]) {
      const w = await windowRuntime()
      vi.useFakeTimers()
      w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-api-key" }], { notAfter: later > 1e15 ? later : Date.now() + later }) })
      await vi.advanceTimersByTimeAsync(10)
      await vi.advanceTimersByTimeAsync(FIVE_MINUTES - 500)
      expect(w.text(), String(later)).toContain("public-api-key")
      await vi.advanceTimersByTimeAsync(600)
      expect(w.text(), String(later)).not.toContain("public-api-key")
      // The frozen-clock path uses the same limit.
      vi.useRealTimers()
      vi.unstubAllGlobals()
      const frozen = await windowRuntime()
      vi.useFakeTimers()
      frozen.send(frozen.frameA, { type: "authorization-request", request: frozen.display([{ value: "public-api-key" }], { notAfter: later > 1e15 ? later : Date.now() + later }) })
      await vi.advanceTimersByTimeAsync(10)
      vi.setSystemTime(Date.now() + FIVE_MINUTES + 1_000)
      frozen.fire("pageshow")
      await vi.advanceTimersByTimeAsync(0)
      expect(frozen.text(), String(later)).not.toContain("public-api-key")
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it("N4 a notAfter that is not a finite number is refused and nothing is shown, as a first request and as a follow-up", async () => {
    const malformed: unknown[] = ["1700000000000", null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, {}, [], true]
    for (const mode of ["first-request", "follow-up"] as const) {
      const w = await windowRuntime()
      vi.useFakeTimers()
      if (mode === "follow-up") await approveKeepOpen(w)
      for (const value of malformed) w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-malformed" }], { notAfter: value }) })
      await vi.advanceTimersByTimeAsync(300)
      expect(errors(w), mode).toHaveLength(malformed.length)
      expect(errors(w).every((message) => message.code === "invalid_payload"), mode).toBe(true)
      expect(w.text(), mode).not.toContain("public-malformed")
      // The window is still waiting, and a well-formed request then shows normally.
      w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-wellformed" }], { notAfter: Date.now() + 60_000 }) })
      await vi.advanceTimersByTimeAsync(10)
      expect(w.text(), mode).toContain("public-wellformed")
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it("N5 a session end already in the past shows nothing at all, not even for one task", async () => {
    for (const past of [-1_000, 0, -1e15]) {
      const w = await windowRuntime()
      vi.useFakeTimers()
      const notAfter = past === 0 ? 0 : past === -1e15 ? past : Date.now() + past
      w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-past" }], { notAfter }) })
      expect(w.text(), String(past)).not.toContain("public-past")
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
      expect(w.text(), String(past)).not.toContain("public-past")
      await vi.advanceTimersByTimeAsync(0)
      expect(w.text(), String(past)).not.toContain("public-past")
      expect(errors(w).at(-1), String(past)).toMatchObject({ code: "authorization_window_timeout" })
      await vi.advanceTimersByTimeAsync(300)
      expect(w.close, String(past)).toHaveBeenCalled()
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })

  it("N6 the earlier end also stops a Strict copy that is waiting on its passkey", async () => {
    const w = await windowRuntime()
    vi.useFakeTimers()
    let aborted = false
    w.credentials.get.mockImplementationOnce(((options: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")) })
    })) as never)
    w.send(w.frameA, { type: "authorization-request", request: w.display([{ value: "public-strict", copyChallenge: "AAEC" }], { notAfter: Date.now() + 30_000 }) })
    await vi.advanceTimersByTimeAsync(10)
    w.button("Copy").click()
    await vi.advanceTimersByTimeAsync(10)
    expect(w.credentials.get).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(aborted).toBe(true)
    expect(w.text()).not.toContain("public-strict")
    expect(w.clipboard.writeText).not.toHaveBeenCalled()
  })
})
