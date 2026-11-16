import { afterEach, describe, expect, it, vi } from "vitest"
import { installCardDocument, type FakeElement } from "./testDom"

// The REAL top-level authorization window (main.ts in #mode=authorize), driven by
// a fake requesting frame. Only the DOM, clipboard and timers are stand-ins; all
// values are public synthetic test data and no passkey is ever requested.
const origin = "https://sandbox.avibe.bot"
const id = "window-1234567890abcdef"
type Message = { type: string; id: string; build?: unknown; result?: unknown; code?: string }

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
  const confirm = async (label: string): Promise<void> => {
    await vi.waitFor(() => expect(buttonWithText(label).disabled).toBe(false), { timeout: 2_000, interval: 20 })
    buttonWithText(label).click()
  }
  const legacy = (passkey: string, extra: Record<string, unknown> = {}) => ({
    prompt: { title: { text: "PUBLIC review" }, subtitle: { text: "PUBLIC_SECRET" }, label: { text: "Approve" } },
    wrapMeta: JSON.stringify({ v: 1, copies: [] }), passkey, ...extra,
  })
  const display = (rows: Array<Record<string, unknown>>) => ({ kind: "protected-display", name: "PUBLIC_LOGIN", wrapMeta: JSON.stringify({ v: 1, copies: [] }), rows })
  const readyCount = (): number => toRequester.filter((message) => message.type === "authorization-ready").length
  return { requester, stranger, toRequester, toStranger, clipboard, credentials, close, dom, send, buttons, buttonWithText, confirm, legacy, display, readyCount }
}

afterEach(async () => {
  vi.useRealTimers()
  // Let a window's own delayed close land on this test's stub, not the next one's.
  await new Promise((resolve) => setTimeout(resolve, 300))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("kept-open authorization window", () => {
  it("stays open after a keepOpen approval and shows a whole secret: hidden rows, Show, Copy while hidden", async () => {
    const w = await windowRuntime()
    expect(w.readyCount()).toBeGreaterThan(0)
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
    await w.confirm("Approve")
    await vi.waitFor(() => expect(w.toRequester.some((message) => message.type === "authorization-approved")).toBe(true))
    expect(w.close).not.toHaveBeenCalled()
    expect(w.dom.body.textContent).toContain("Checking the request. Keep this window open.")
    // It announces itself again, to the same requester only, for its one follow-up.
    const before = w.readyCount()
    await vi.waitFor(() => expect(w.readyCount()).toBeGreaterThan(before))
    w.send(w.requester, { type: "authorization-request", request: w.display([
      { label: "password", value: "public-password" },
      { label: "username", value: "public-user" },
    ]) })
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Protected secret"))
    // Several values: hidden by default, and not in the DOM at all.
    expect(w.dom.body.textContent).not.toContain("public-password")
    expect(w.dom.body.textContent).not.toContain("public-user")
    // Each row's controls are named for that row; the masked value reads as hidden.
    expect(w.buttons().filter((node) => node.textContent === "Copy").map((node) => node.getAttribute("aria-label"))).toEqual(["Copy password", "Copy username"])
    expect(w.buttons().filter((node) => node.textContent === "Show").map((node) => [node.getAttribute("aria-label"), node.getAttribute("aria-pressed")])).toEqual([["Show password", null], ["Show username", null]])
    // The bullets are aria-hidden decoration; the spoken text is "Hidden".
    expect(w.dom.body.querySelectorAll(".secret-row-value").map((node) => node.querySelector(".secret-row-spoken")?.textContent)).toEqual(["Hidden", "Hidden"])
    expect(w.dom.body.querySelectorAll(".secret-row-value").map((node) => node.children[0]?.getAttribute("aria-hidden"))).toEqual(["true", "true"])
    expect(w.dom.body.querySelector(".setup-status")!.getAttribute("role")).toBe("status")
    // Copy works on a hidden row.
    w.buttons().filter((node) => node.textContent === "Copy")[1].click()
    await vi.waitFor(() => expect(w.clipboard.writeText).toHaveBeenCalledWith("public-user"))
    expect(w.dom.body.textContent).not.toContain("public-user")
    await vi.waitFor(() => expect(w.buttons().filter((node) => node.textContent === "Copied")).toHaveLength(1))
    // Show reveals only that row.
    w.buttons().filter((node) => node.textContent === "Show")[0].click()
    expect(w.dom.body.textContent).toContain("public-password")
    expect(w.dom.body.textContent).not.toContain("public-user")
    expect(w.buttonWithText("Hide").getAttribute("aria-label")).toBe("Hide password")
    expect(w.dom.body.querySelectorAll(".secret-row-value").map((node) => node.querySelector(".secret-row-spoken")?.textContent ?? null)).toEqual([null, "Hidden"])
    w.buttonWithText("Done").click()
    await vi.waitFor(() => expect(w.toRequester.filter((message) => message.type === "authorization-approved").at(-1)?.result).toEqual({ kind: "displayed" }))
    await vi.waitFor(() => expect(w.close).toHaveBeenCalled())
    expect(w.dom.body.textContent).not.toContain("public-password")
    expect(w.credentials.get).not.toHaveBeenCalled()
  })

  it("shows a single value at once, with Copy and no Show", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
    await w.confirm("Approve")
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Checking the request."))
    w.send(w.requester, { type: "authorization-request", request: w.display([{ value: "public-api-key" }]) })
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("public-api-key"))
    expect(w.dom.body.textContent).toContain("Protected value")
    expect(w.buttons().map((node) => node.textContent)).not.toContain("Show")
    w.buttonWithText("Copy").click()
    await vi.waitFor(() => expect(w.clipboard.writeText).toHaveBeenCalledWith("public-api-key"))
  })

  it("asks the passkey before each Strict Copy, bound to that row's challenge", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
    await w.confirm("Approve")
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Checking the request."))
    w.send(w.requester, { type: "authorization-request", request: w.display([
      { label: "password", value: "public-password", copyChallenge: "AAEC" },
      { label: "username", value: "public-user", copyChallenge: "AwQF" },
    ]) })
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Protected secret"))
    w.credentials.get.mockResolvedValueOnce({} as never)
    w.buttons().filter((node) => node.textContent === "Copy")[0].click()
    await vi.waitFor(() => expect(w.credentials.get).toHaveBeenCalledOnce())
    const options = (w.credentials.get.mock.calls[0] as unknown as [{ publicKey: { challenge: ArrayBuffer } }])[0]
    expect([...new Uint8Array(options.publicKey.challenge)]).toEqual([0, 1, 2])
    expect(w.clipboard.writeText).not.toHaveBeenCalled()
    // The confirmation names its row.
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Passkey confirmed for password."))
    w.buttons().filter((node) => node.textContent === "Copy")[0].click()
    await vi.waitFor(() => expect(w.clipboard.writeText).toHaveBeenCalledWith("public-password"))
  })

  it("shows a display sent as its first request (the fresh window a frozen page opens from a click)", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.display([{ label: "password", value: "public-password" }, { label: "username", value: "public-user" }]) })
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Protected secret"))
    expect(w.dom.body.textContent).not.toContain("public-password")
    w.buttonWithText("Done").click()
    await vi.waitFor(() => expect(w.close).toHaveBeenCalled())
  })

  it.each([
    ["a passkey follow-up", (w: Awaited<ReturnType<typeof windowRuntime>>) => w.legacy("uv")],
    ["a follow-up that keeps the window open again", (w: Awaited<ReturnType<typeof windowRuntime>>) => w.legacy("none", { keepOpen: true })],
  ] as const)("refuses %s and closes", async (_case, build) => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
    await w.confirm("Approve")
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Checking the request."))
    w.send(w.requester, { type: "authorization-request", request: build(w) })
    await vi.waitFor(() => expect(w.toRequester.at(-1)).toMatchObject({ type: "authorization-error", code: "authorization_request_invalid" }))
    await vi.waitFor(() => expect(w.close).toHaveBeenCalled())
  })

  it("takes its follow-up only from the requester that it approved for", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
    await w.confirm("Approve")
    await vi.waitFor(() => expect(w.dom.body.textContent).toContain("Checking the request."))
    w.send(w.stranger, { type: "authorization-request", request: w.display([{ value: "public-forged" }]) })
    w.send(w.stranger, { type: "authorization-dismiss" })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(w.dom.body.textContent).not.toContain("public-forged")
    expect(w.close).not.toHaveBeenCalled()
    expect(w.toStranger).toHaveLength(0)
    w.send(w.requester, { type: "authorization-dismiss" })
    expect(w.close).toHaveBeenCalled()
  })

  it("closes a window without keepOpen right after its approval, and ignores a later dismiss or display", async () => {
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none") })
    await w.confirm("Approve")
    await vi.waitFor(() => expect(w.close).toHaveBeenCalled())
    const before = w.readyCount()
    w.send(w.requester, { type: "authorization-request", request: w.display([{ value: "public-late" }]) })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(w.dom.body.textContent).not.toContain("public-late")
    expect(w.readyCount()).toBe(before)
  })

  it("closes itself if no follow-up arrives in time", async () => {
    vi.useFakeTimers()
    const w = await windowRuntime()
    w.send(w.requester, { type: "authorization-request", request: w.legacy("none", { keepOpen: true }) })
    await vi.advanceTimersByTimeAsync(600)
    w.buttonWithText("Approve").click()
    await vi.advanceTimersByTimeAsync(10)
    expect(w.dom.body.textContent).toContain("Checking the request.")
    await vi.advanceTimersByTimeAsync(4_900)
    expect(w.close).not.toHaveBeenCalled()
    // A page frozen behind this window cannot answer: say where to continue, then close.
    await vi.advanceTimersByTimeAsync(200)
    expect(w.dom.body.textContent).toContain("Continue in Avibe.")
    expect(w.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_600)
    expect(w.close).toHaveBeenCalled()
    // A late follow-up is not shown.
    w.send(w.requester, { type: "authorization-request", request: w.display([{ value: "public-late" }]) })
    await vi.advanceTimersByTimeAsync(10)
    expect(w.dom.body.textContent).not.toContain("public-late")
  })
})
