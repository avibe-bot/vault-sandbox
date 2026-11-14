import { afterEach, describe, expect, it, vi } from "vitest"
import { copyHdWords } from "./hdClipboard"

// Hermetic clipboard: no OS API is called. The string is NOT wallet material.
const TEXT = "public clipboard test text"
function setup(native: "ok" | "reject" | "absent", legacy: boolean | "throw" = true) {
  class Node {
    value = ""
    style = { cssText: "" }
    attached = false
    setAttribute = vi.fn()
    focus = vi.fn()
    select = vi.fn()
    setSelectionRange = vi.fn()
    remove = vi.fn(() => { this.attached = false })
  }
  const textarea = new Node()
  const active = new Node()
  const selection = { rangeCount: 1, getRangeAt: vi.fn(() => "range"), removeAllRanges: vi.fn(), addRange: vi.fn() }
  const execCommand = vi.fn(() => {
    expect(textarea.value).toBe(TEXT)
    expect(textarea.attached).toBe(true)
    if (legacy === "throw") throw new Error("public copy failure")
    return legacy
  })
  const document = {
    createElement: vi.fn(() => textarea), activeElement: active,
    getSelection: () => selection,
    body: { append: vi.fn(() => { textarea.attached = true }) }, execCommand,
  }
  const writeText = vi.fn(async (_text: string) => { if (native === "reject") throw new Error("public permission denial") })
  vi.stubGlobal("navigator", native === "absent" ? {} : { clipboard: { writeText } })
  vi.stubGlobal("document", document)
  vi.stubGlobal("HTMLElement", Node)
  return { textarea, active, selection, execCommand, document, writeText }
}
afterEach(() => vi.unstubAllGlobals())

describe("HD explicit clipboard write", () => {
  it("uses the native write without creating a plaintext fallback field", async () => {
    const env = setup("ok")
    await expect(copyHdWords(TEXT, () => true)).resolves.toBe(true)
    expect(env.writeText).toHaveBeenCalledWith(TEXT)
    expect(env.document.createElement).not.toHaveBeenCalled()
    expect(env.execCommand).not.toHaveBeenCalled()
  })
  it.each(["absent", "reject"] as const)("falls back when native is %s, then wipes/removes and restores focus", async (native) => {
    const env = setup(native)
    await expect(copyHdWords(TEXT, () => true)).resolves.toBe(true)
    expect(env.execCommand).toHaveBeenCalledWith("copy")
    expect(env.textarea.value).toBe("")
    expect(env.textarea.attached).toBe(false)
    expect(env.selection.addRange).toHaveBeenCalledWith("range")
    expect(env.active.focus).toHaveBeenCalledOnce()
  })
  it.each([false, "throw"] as const)("reports legacy failure %s without retaining a plaintext field", async (legacy) => {
    const env = setup("absent", legacy)
    await expect(copyHdWords(TEXT, () => true)).resolves.toBe(false)
    expect(env.textarea.value).toBe("")
    expect(env.textarea.attached).toBe(false)
  })
  it("never falls back after the owner cancels during the native attempt", async () => {
    const env = setup("reject")
    let current = true
    const copying = copyHdWords(TEXT, () => current)
    current = false
    await expect(copying).resolves.toBe(false)
    expect(env.document.createElement).not.toHaveBeenCalled()
    expect(env.execCommand).not.toHaveBeenCalled()
  })
  it("never touches either clipboard when the view is already stale", async () => {
    const env = setup("ok")
    await expect(copyHdWords(TEXT, () => false)).resolves.toBe(false)
    expect(env.writeText).not.toHaveBeenCalled()
    expect(env.document.createElement).not.toHaveBeenCalled()
  })
  it("wipes even when selection setup fails", async () => {
    const env = setup("absent")
    env.textarea.select.mockImplementationOnce(() => { throw new Error("public select failure") })
    await expect(copyHdWords(TEXT, () => true)).resolves.toBe(false)
    expect(env.textarea.value).toBe("")
    expect(env.textarea.attached).toBe(false)
    expect(env.execCommand).not.toHaveBeenCalled()
  })
})
