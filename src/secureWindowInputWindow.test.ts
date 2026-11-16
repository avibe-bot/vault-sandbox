import { afterEach, describe, expect, it, vi } from "vitest"
import { FakeElement, installCardDocument } from "./testDom"

// The REAL top-level authorization window (main.ts in #mode=authorize) taking a
// protected secret's values, driven by a fake requesting frame. Only the DOM,
// clipboard and timers are stand-ins; every value is public synthetic test data
// and no passkey is ever requested.
const origin = "https://sandbox.avibe.bot"
const id = "window-input-1234567890ab"
type Message = { type: string; id: string; build?: unknown; result?: unknown; code?: string }
const PASSWORD = { type: "password", length: 24, digits: true, symbols: true, noLookalikes: false }

async function windowRuntime() {
  vi.resetModules()
  const events = new EventTarget()
  const toRequester: Message[] = []
  const toStranger: Message[] = []
  const requester = { postMessage: vi.fn((message: Message) => { toRequester.push(structuredClone(message)) }), frames: { length: 0 } }
  const stranger = { postMessage: vi.fn((message: Message) => { toStranger.push(structuredClone(message)) }) }
  const clipboard = { writeText: vi.fn(async (_text: string) => {}) }
  const credentials = { get: vi.fn(async () => { throw new Error("no passkey in this test") }), create: vi.fn() }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=authorize&id=${id}&locale=en&theme=dark`, hash: `#mode=authorize&id=${id}&locale=en&theme=dark`, search: "" }
  const close = vi.fn()
  const window = {
    location, self: {}, top: {}, parent: { postMessage: vi.fn() }, opener: requester,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    open: vi.fn(), close,
  }
  window.top = window.self
  vi.stubGlobal("window", window)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() })
  const dom = installCardDocument(vi.stubGlobal)
  for (const name of ["HTMLInputElement", "HTMLTextAreaElement"]) vi.stubGlobal(name, FakeElement)
  vi.stubGlobal("navigator", { clipboard, credentials, userAgent: "test", platform: "test", maxTouchPoints: 0 })
  const { BUILD } = await import("./rpc")
  await import("./main")
  const send = (source: unknown, data: Record<string, unknown>): void => {
    const event = new Event("message")
    Object.assign(event, { origin, source, data: { build: BUILD, id, ...data } })
    events.dispatchEvent(event)
  }
  const buttons = (): FakeElement[] => dom.body.querySelectorAll("button")
  const buttonWithText = (text: string): FakeElement => {
    const found = buttons().find((node) => node.textContent === text)
    if (!found) throw new Error(`button not found: ${text} in [${buttons().map((node) => node.textContent).join(" | ")}]`)
    return found
  }
  const inputs = (): FakeElement[] => dom.body.querySelectorAll("input")
  const type = (index: number, value: string): void => { inputs()[index].value = value; inputs()[index].dispatch("input") }
  const input = (overrides: Record<string, unknown> = {}) => ({
    kind: "protected-input", name: "PUBLIC_LOGIN", mode: "create",
    rows: [{ label: "password", required: true, isDefault: true, generate: PASSWORD }, { label: "username", required: true, isDefault: false }],
    ...overrides,
  })
  const keepOpenApproval = async (): Promise<void> => {
    send(requester, { type: "authorization-request", request: {
      prompt: { title: { text: "Unlock vault" }, subtitle: { text: "PUBLIC_LOGIN" }, label: { text: "Approve" } },
      wrapMeta: JSON.stringify({ v: 1, copies: [] }), passkey: "none", keepOpen: true,
    } })
    // A card that only says something is compact in a top-level window.
    await vi.waitFor(() => expect(buttonWithText("Approve").disabled).toBe(false), { timeout: 2_000, interval: 20 })
    expect(dom.body.classList.contains("compact")).toBe(true)
    buttonWithText("Approve").click()
    await vi.waitFor(() => expect(dom.body.textContent).toContain("Checking the request."))
  }
  const last = (): Message | undefined => toRequester.filter((message) => message.type !== "authorization-ready").at(-1)
  return { requester, stranger, toRequester, toStranger, close, dom, send, buttons, buttonWithText, inputs, type, input, keepOpenApproval, last, window, events }
}

afterEach(async () => {
  vi.useRealTimers()
  await new Promise((resolve) => setTimeout(resolve, 300))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("the secure window takes a protected secret's values", () => {
  it("W1 as its first request: the values go to the requester only, the inputs are cleared and the window closes", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.input() })
    await vi.waitFor(() => expect(w.inputs()).toHaveLength(2))
    expect(w.dom.body.textContent).toContain("Enter secret")
    expect(w.dom.body.classList.contains("compact")).toBe(true)
    expect(w.buttonWithText("Save").disabled).toBe(true)
    w.buttonWithText("Generate").click()
    w.type(1, "public-user")
    const generated = w.inputs()[0].value
    expect(generated).toHaveLength(24)
    w.buttonWithText("Save").click()
    await vi.waitFor(() => expect(w.last()?.type).toBe("authorization-approved"))
    expect(w.last()?.result).toEqual({ kind: "entered", values: [{ value: generated, generated: true }, { value: "public-user", generated: false }] })
    expect(w.inputs().every((node) => node.value === "")).toBe(true)
    expect(w.toStranger).toHaveLength(0)
    await vi.waitFor(() => expect(w.close).toHaveBeenCalled())
  })

  it("W2 as the one follow-up of a kept-open approval (unlock, then the values)", async () => {
    const w = await windowRuntime()
    await w.keepOpenApproval()
    w.send(w.requester, { type: "authorization-request", request: w.input({ mode: "edit", rows: [
      { label: "password", required: false, isDefault: true }, { label: "totp", required: true, isDefault: false },
    ] }) })
    await vi.waitFor(() => expect(w.inputs()).toHaveLength(2))
    expect(w.dom.body.textContent).toContain("Change secret")
    expect(w.inputs()[0].placeholder).toBe("Saved")
    w.type(1, "public-otp")
    const approvals = (): number => w.toRequester.filter((message) => message.type === "authorization-approved").length
    expect(approvals()).toBe(1)
    w.buttonWithText("Save").click()
    await vi.waitFor(() => expect(approvals()).toBe(2))
    expect(w.last()?.result).toEqual({ kind: "entered", values: [{ value: null, generated: false }, { value: "public-otp", generated: false }] })
    // A stranger never got a word, and cannot send this window a request.
    expect(w.toStranger).toHaveLength(0)
  })

  it("W3 Cancel, hiding the page and the window's own clock end it with distinct errors and clear what was typed", async () => {
    for (const ending of ["cancel", "pagehide", "clock"] as const) {
      if (ending === "clock") vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
      const w = await windowRuntime()
      w.send(w.requester, { type: "authorization-request", request: w.input(ending === "clock" ? { notAfter: Date.now() + 60_000 } : {}) })
      if (ending === "clock") await vi.advanceTimersByTimeAsync(10)
      else await vi.waitFor(() => expect(w.inputs()).toHaveLength(2))
      w.type(0, "public-typed-secret")
      if (ending === "cancel") w.buttonWithText("Cancel").click()
      else if (ending === "pagehide") w.events.dispatchEvent(new Event("pagehide"))
      // Its own clock: the unlocked session ends at notAfter, before the 5-minute limit.
      else await vi.advanceTimersByTimeAsync(60_001)
      const expected = { cancel: "authorization_cancelled", pagehide: "authorization_window_closed", clock: "authorization_window_timeout" }[ending]
      if (ending === "clock") await vi.advanceTimersByTimeAsync(10)
      else await vi.waitFor(() => expect(w.last()?.type).toBe("authorization-error"))
      expect(w.last(), ending).toMatchObject({ type: "authorization-error", code: expected })
      expect(JSON.stringify(w.toRequester), ending).not.toContain("public-typed-secret")
      expect(w.inputs().length, ending).toBe(0)
      expect(w.dom.body.textContent, ending).not.toContain("public-typed-secret")
      vi.useRealTimers()
      await new Promise((resolve) => setTimeout(resolve, 300))
      vi.unstubAllGlobals()
    }
  })

  it("W4 takes nothing once the unlocked session has ended, and refuses a malformed request without drawing a row", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.input({ notAfter: Date.now() - 1 }) })
    await vi.waitFor(() => expect(w.last()).toMatchObject({ type: "authorization-error", code: "authorization_window_timeout" }))
    expect(w.inputs()).toHaveLength(0)
    for (const request of [
      w.input({ rows: [{ label: "password", required: true, isDefault: true, value: "public-prefill" }] }),
      w.input({ rows: Array.from({ length: 33 }, (_unused, index) => ({ label: `f${index}`, required: true, isDefault: false })) }),
      w.input({ rows: [{ label: "password", required: true, isDefault: false, generate: { ...PASSWORD, length: 101 } }] }),
      w.input({ wrapMeta: "{}" }),
    ]) {
      const other = await windowRuntime()
      other.send(other.requester, { type: "authorization-request", request })
      await vi.waitFor(() => expect(other.last()).toMatchObject({ type: "authorization-error", code: "invalid_payload" }))
      expect(other.inputs()).toHaveLength(0)
      expect(other.dom.body.textContent).not.toContain("public-prefill")
    }
  })
})
