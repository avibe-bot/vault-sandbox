import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument, FakeElement } from "./testDom"
import { collectProtectedHdInput, makeHdQuiz } from "./protectedHdUi"
import { deriveHdAccounts, hdPayloadFromWords } from "./protectedHd"
import type { HdAuthorizationRequest, HdConfirmedInput } from "./protectedHdCeremony"

// PUBLIC NEVER-FUND corpus only.
const vector = vectors.cases[0]
const withPassphrase = vectors.cases[1]
const tableFor = (words: string, passphrase: string) => deriveHdAccounts(hdPayloadFromWords(words, passphrase).seed)

type ValueElement = FakeElement & { value: string; hidden?: boolean }
const valueOf = (element: FakeElement): ValueElement => element as ValueElement
function buttonWithText(root: FakeElement, text: string): FakeElement {
  const found = root.querySelectorAll("button").find((candidate) => candidate.textContent === text)
  if (!found) throw new Error(`button not found: ${text} in [${root.querySelectorAll("button").map((b) => b.textContent).join(" | ")}]`)
  return found
}
function type(element: FakeElement, value: string): void {
  valueOf(element).value = value
  element.dispatch("input")
}
function request(mode: "create" | "import"): HdAuthorizationRequest {
  return { kind: "protected-hd-wallet", name: "PUBLIC_HD", mode, wrapMeta: "PUBLIC_ROOT", deadlineAt: Date.now() + 300_000 }
}
/** Fixed entropy for the words; a counter for the quiz, so positions vary. */
function stubRandom(entropyHex: string) {
  const entropy = Uint8Array.from(entropyHex.match(/../g)!, (pair) => Number.parseInt(pair, 16))
  let counter = 0
  return vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
    if (array instanceof Uint8Array && array.length === entropy.length) array.set(entropy)
    else (array as Uint32Array)[0] = (counter++ * 0x9e3779b9) >>> 0
    return array
  })
}

let body: FakeElement
let clipboard: { writeText: ReturnType<typeof vi.fn> }
beforeEach(() => {
  ;({ body } = installCardDocument(vi.stubGlobal))
  for (const name of ["Element", "Node", "HTMLInputElement", "HTMLTextAreaElement", "HTMLButtonElement"]) vi.stubGlobal(name, FakeElement)
  clipboard = { writeText: vi.fn(async () => {}) }
  vi.stubGlobal("navigator", { clipboard })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("protected HD create: Set up → Write it down → Check, as the standard dialog", () => {
  it("takes the optional passphrase BEFORE the words, then hides, reveals, copies and checks them", async () => {
    stubRandom(vector.entropy_hex)
    const created = { words: vector.words, passphrase: " PUBLIC café " }
    const finalize = vi.fn((_input: HdConfirmedInput) => Promise.resolve())
    const pending = collectProtectedHdInput(request("create"), new AbortController().signal, finalize)
    const words = created.words.split(" ")

    // Step 1: no words exist yet; the passphrase is folded and optional.
    expect(body.querySelector(".hd-stepper")!.querySelectorAll("li").map((item) => item.className)).toEqual(["current", "", ""])
    expect(body.textContent).toContain("Most people don’t need one")
    expect(body.querySelector(".hd-fold-header")!.getAttribute("aria-expanded")).toBe("false")
    expect(body.querySelectorAll(".hd-words")).toHaveLength(0)
    const generate = buttonWithText(body, "Generate the words")
    expect(generate.disabled).toBe(false)
    body.querySelector(".hd-fold-header")!.click()
    const [first, again] = body.querySelectorAll("input")
    expect([first.type, again.type]).toEqual(["password", "password"])
    type(first, created.passphrase)
    expect(generate.disabled).toBe(true)
    expect(body.textContent).toContain("The two entries don’t match.")
    type(again, created.passphrase)
    expect(generate.disabled).toBe(false)
    expect(body.textContent).toContain("They match.")
    generate.click()

    // Step 2: hidden until asked for — the words are not in the DOM.
    expect(first.value).toBe("")
    expect(body.textContent).not.toContain(words[0])
    expect(body.textContent).toContain(`Write these ${words.length} words down, in order`)
    expect(body.textContent).toContain("This wallet also has a passphrase.")
    buttonWithText(body, `Show the ${words.length} words`).click()
    expect(body.querySelector(".hd-words")!.querySelectorAll("li").map((item) => item.children[1].textContent).join(" ")).toBe(created.words)
    expect(body.textContent).toContain("Other apps can read the clipboard; paper is safer.")
    const copy = buttonWithText(body, "Copy")
    copy.click()
    expect(clipboard.writeText).toHaveBeenCalledWith(created.words)
    expect(copy.textContent).toBe("Copy")
    await Promise.resolve()
    await Promise.resolve()
    expect(copy.textContent).toBe("Copied")
    buttonWithText(body, "Hide").click()
    expect(body.textContent).not.toContain(words[0])

    // Back keeps the same words and the passphrase, like the standard dialog.
    buttonWithText(body, "Back").click()
    const kept = body.querySelectorAll("input")
    expect([kept[0].value, kept[1].value]).toEqual([created.passphrase, created.passphrase])
    buttonWithText(body, "Generate the words").click()
    buttonWithText(body, `Show the ${words.length} words`).click()
    expect(body.querySelector(".hd-words")!.querySelectorAll("li").map((item) => item.children[1].textContent).join(" ")).toBe(created.words)
    buttonWithText(body, "I wrote them down").click()

    // Step 3: Create opens only once all three picks are right; a wrong pick is named.
    const create = buttonWithText(body, "Create wallet")
    expect(create.disabled).toBe(true)
    const rows = body.querySelectorAll(".hd-quiz")
    const position = (row: FakeElement) => Number(row.querySelector("span")!.textContent.match(/\d+/)![0])
    const wrong = rows[0].querySelectorAll(".hd-option").find((option) => option.textContent !== words[position(rows[0]) - 1])!
    wrong.click()
    expect(wrong.classList.contains("wrong")).toBe(true)
    expect(body.textContent).toContain(`Word #${position(rows[0])} doesn’t match.`)
    expect(body.textContent).toContain("Tap “See the words”")
    for (const row of rows) buttonWithText(row, words[position(row) - 1]).click()
    expect(create.disabled).toBe(false)
    expect(body.textContent).not.toContain("doesn’t match")
    create.click()
    // The final click itself hands over, so the passkey keeps its user activation.
    expect(finalize).toHaveBeenCalledTimes(1)
    const final = finalize.mock.calls[0][0]
    expect(final.words).toBe(created.words)
    expect(final.passphrase).toBe(created.passphrase)
    expect(final.reviewedAccounts).toEqual(tableFor(created.words, created.passphrase))
    expect(create.disabled).toBe(true)
    await pending
    expect(body.querySelectorAll(".dynamic")).toHaveLength(0)
  })

  it("never claims Copied when the clipboard write fails, and See the words clears the picks", async () => {
    stubRandom(vector.entropy_hex)
    clipboard.writeText.mockRejectedValueOnce(new Error("denied"))
    const pending = collectProtectedHdInput(request("create"), new AbortController().signal, async () => {})
    buttonWithText(body, "Generate the words").click()
    expect(body.textContent).not.toContain("This wallet also has a passphrase.")
    buttonWithText(body, "Show the 12 words").click()
    const copy = buttonWithText(body, "Copy")
    copy.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(copy.textContent).toBe("Copy")
    buttonWithText(body, "I wrote them down").click()
    const words = vector.words.split(" ")
    const rows = body.querySelectorAll(".hd-quiz")
    const position = (row: FakeElement) => Number(row.querySelector("span")!.textContent.match(/\d+/)![0])
    for (const row of rows) buttonWithText(row, words[position(row) - 1]).click()
    expect(buttonWithText(body, "Create wallet").disabled).toBe(false)
    buttonWithText(body, "See the words").click()
    buttonWithText(body, "I wrote them down").click()
    expect(buttonWithText(body, "Create wallet").disabled).toBe(true)
    buttonWithText(body, "Cancel").click()
    await expect(pending).rejects.toThrow("operation-cancelled")
  })

  it("draws the shared quiz from this window's CSPRNG", () => {
    const spy = vi.spyOn(crypto, "getRandomValues")
    makeHdQuiz(vector.words.split(" "))
    expect(spy).toHaveBeenCalled()
  })
})

describe("protected HD import: one panel with live per-word checks and a live #0", () => {
  it("names a bad word with suggestions, then checksum/count, then offers the folded passphrase and #0", async () => {
    vi.useFakeTimers()
    const finalize = vi.fn((_input: HdConfirmedInput) => Promise.resolve())
    const pending = collectProtectedHdInput(request("import"), new AbortController().signal, finalize)
    const phrase = body.querySelector("textarea")!
    const save = buttonWithText(body, "Import wallet")
    expect(save.disabled).toBe(true)
    expect(body.textContent).toContain("The phrase stays on this computer")
    const words = withPassphrase.words.split(" ")
    const typo = [...words]
    typo[1] = typo[1].slice(0, -1) + "q"
    type(phrase, typo.join(" "))
    expect(body.textContent).toContain(`Word #2, “${typo[1]}”, is not a seed phrase word.`)
    expect(body.querySelector(".hd-words")!.querySelectorAll("li")[1].className).toBe("bad")
    const suggestion = body.querySelectorAll("button").find((candidate) => candidate.textContent === `Use ${words[1]}`)
    expect(suggestion).toBeDefined()
    suggestion!.click()
    expect(phrase.value).toBe(withPassphrase.words)
    expect(body.textContent).toContain(`${words.length} words · checksum OK`)
    type(phrase, words.slice(0, 11).join(" "))
    expect(body.textContent).toContain("this one has 11")
    type(phrase, [...words.slice(0, -1), words[words.length - 1] === "zoo" ? "abandon" : "zoo"].join(" "))
    expect(body.textContent).toContain("fail the checksum")
    expect(valueOf(body.querySelector(".hd-import-passphrase")!).hidden).toBe(true)

    type(phrase, withPassphrase.words)
    expect(valueOf(body.querySelector(".hd-import-passphrase")!).hidden).toBe(false)
    // No #0 and no save until this exact phrase's table exists.
    expect(save.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(300)
    const without = tableFor(withPassphrase.words, "")
    expect(save.disabled).toBe(false)
    expect(body.querySelector(".hd-preview")!.textContent).toContain("Compare with your old wallet’s first account")

    // The original passphrase: folded; changing it withdraws the old #0 at once.
    body.querySelector(".hd-import-passphrase")!.querySelector(".hd-fold-header")!.click()
    const passphrase = body.querySelector(".hd-import-passphrase")!.querySelector("input")!
    expect(passphrase.type).toBe("password")
    type(passphrase, withPassphrase.passphrase)
    expect(save.disabled).toBe(true)
    expect(body.querySelector(".hd-preview")!.textContent).toBe("")
    save.click()
    expect(finalize).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(save.disabled).toBe(false)
    save.click()
    expect(finalize).toHaveBeenCalledTimes(1)
    const final = finalize.mock.calls[0][0]
    expect(final.words).toBe(withPassphrase.words)
    expect(final.passphrase).toBe(withPassphrase.passphrase)
    const table = tableFor(withPassphrase.words, withPassphrase.passphrase)
    expect(final.reviewedAccounts).toEqual(table)
    expect(final.reviewedAccounts).not.toEqual(without)
    await pending
    expect(body.textContent).not.toContain(words[0])
  })

  it("never lets a superseded preview enable saving the old inputs", async () => {
    vi.useFakeTimers()
    const finalize = vi.fn(async () => {})
    const pending = collectProtectedHdInput(request("import"), new AbortController().signal, finalize)
    const phrase = body.querySelector("textarea")!
    type(phrase, vector.words)
    await vi.advanceTimersByTimeAsync(100)
    type(phrase, withPassphrase.words)
    await vi.advanceTimersByTimeAsync(200)
    expect(buttonWithText(body, "Import wallet").disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(100)
    buttonWithText(body, "Import wallet").click()
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ words: withPassphrase.words }))
    await pending
  })

  it("allows cancellation after the final click and cannot resurrect from a late custody completion", async () => {
    vi.useFakeTimers()
    let resolveFinalize!: () => void
    const pending = collectProtectedHdInput(request("import"), new AbortController().signal, () => new Promise<void>((resolve) => { resolveFinalize = resolve }))
    type(body.querySelector("textarea")!, vector.words)
    await vi.advanceTimersByTimeAsync(300)
    buttonWithText(body, "Import wallet").click()
    buttonWithText(body, "Cancel").click()
    await expect(pending).rejects.toThrow("operation-cancelled")
    resolveFinalize()
    await Promise.resolve()
    expect(body.querySelectorAll(".dynamic")).toHaveLength(0)
  })

  it("cancels before custody, clears the phrase and leaves no preview timer behind", async () => {
    vi.useFakeTimers()
    const finalize = vi.fn(async () => {})
    const pending = collectProtectedHdInput(request("import"), new AbortController().signal, finalize)
    const phrase = body.querySelector("textarea")!
    type(phrase, vector.words)
    buttonWithText(body, "Cancel").click()
    await expect(pending).rejects.toThrow("operation-cancelled")
    expect(phrase.value).toBe("")
    expect(vi.getTimerCount()).toBe(0)
    expect(finalize).not.toHaveBeenCalled()
    expect(body.textContent).not.toContain(vector.words.split(" ")[0])
  })

  it("settles a synchronous custody error and an abort from the ceremony", async () => {
    vi.useFakeTimers()
    const failing = collectProtectedHdInput(request("import"), new AbortController().signal, () => { throw new Error("public synchronous failure") })
    type(body.querySelector("textarea")!, vector.words)
    await vi.advanceTimersByTimeAsync(300)
    buttonWithText(body, "Import wallet").click()
    await expect(failing).rejects.toThrow("public synchronous failure")
    expect(body.querySelectorAll(".dynamic")).toHaveLength(0)

    const controller = new AbortController()
    const aborted = collectProtectedHdInput(request("import"), controller.signal, async () => {})
    type(body.querySelector("textarea")!, vector.words)
    controller.abort(new Error("public abort"))
    await expect(aborted).rejects.toThrow("public abort")
    expect(vi.getTimerCount()).toBe(0)
  })
})
