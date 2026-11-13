import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument, FakeElement } from "./testDom"
import { collectProtectedHdInput, makeHdQuiz, phraseProblem } from "./protectedHdUi"
import type { HdAuthorizationRequest } from "./protectedHdCeremony"

const vector = vectors.cases[0]

type ValueElement = FakeElement & { value: string }

function valueOf(element: FakeElement): ValueElement {
  return element as ValueElement
}
function buttonWithText(root: FakeElement, text: string): FakeElement {
  const button = root.querySelectorAll("button").find((candidate) => candidate.textContent === text)
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

beforeEach(() => {
  installCardDocument(vi.stubGlobal)
  vi.stubGlobal("HTMLElement", FakeElement)
  vi.stubGlobal("Element", FakeElement)
  vi.stubGlobal("Node", FakeElement)
  vi.stubGlobal("HTMLInputElement", FakeElement)
  vi.stubGlobal("HTMLTextAreaElement", FakeElement)
  vi.stubGlobal("HTMLButtonElement", FakeElement)
})
afterEach(() => vi.unstubAllGlobals())

describe("protected HD phrase and backup UI", () => {
  it("validates standard phrase counts, words and checksum", () => {
    expect(phraseProblem("")).toMatchObject({ key: "hd.phraseEmpty" })
    expect(phraseProblem("not-a-word ".repeat(12))).toMatchObject({ key: "hd.phraseUnknown" })
    expect(phraseProblem(vector.words.split(" ").slice(0, 11).join(" "))).toMatchObject({ key: "hd.phraseCount" })
    const invalidChecksum = [...vector.words.split(" ").slice(0, 11), "zoo"].join(" ")
    expect(phraseProblem(invalidChecksum)).toMatchObject({ key: "hd.phraseChecksum" })
    expect(phraseProblem(vector.words)).toBeNull()
  })

  it("makes three distinct quiz positions with three options", () => {
    let randomCalls = 0
    const questions = makeHdQuiz(vector.words.split(" "), (limit) => (randomCalls++ % limit))
    expect(questions).toHaveLength(3)
    expect(new Set(questions.map((question) => question.position)).size).toBe(3)
    for (const question of questions) {
      expect(question.options).toHaveLength(3)
      expect(question.options).toContain(question.answer)
    }
  })

  it("keeps the phrase local through import, address review and final-click custody", async () => {
    const { document, body } = installCardDocument(vi.stubGlobal)
    vi.stubGlobal("HTMLElement", FakeElement)
    vi.stubGlobal("Element", FakeElement)
    vi.stubGlobal("Node", FakeElement)
    vi.stubGlobal("HTMLInputElement", FakeElement)
    vi.stubGlobal("HTMLTextAreaElement", FakeElement)
    vi.stubGlobal("HTMLButtonElement", FakeElement)
    const request: HdAuthorizationRequest = {
      kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "import", wrapMeta: "PUBLIC_ROOT", deadlineAt: Date.now() + 300_000,
    }
    const controller = new AbortController()
    let finalInput: unknown
    let finishFinalize!: () => void
    const finalize = vi.fn((input: unknown) => {
      finalInput = input
      return new Promise<void>((resolve) => { finishFinalize = resolve })
    })

    const pending = collectProtectedHdInput(request, controller.signal, finalize)
    const phrase = body.querySelector("textarea")!
    valueOf(phrase).value = vector.words
    buttonWithText(body, "Next").click()
    const passphrase = body.querySelector("input")!
    valueOf(passphrase).value = vector.passphrase
    buttonWithText(body, "Next").click()

    expect(body.textContent).toContain("bc1p")
    const reviewButtons = body.querySelectorAll("button")
    const confirm = reviewButtons.find((candidate) => candidate.textContent === "Encrypt and import")!
    const cancel = reviewButtons[reviewButtons.length - 1]
    confirm.click()
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(finalInput).toMatchObject({ words: vector.words, passphrase: vector.passphrase })
    expect(cancel.disabled).toBe(true)
    cancel.click()
    expect(finalize).toHaveBeenCalledTimes(1)

    finishFinalize()
    await expect(pending).resolves.toBeUndefined()
    expect(body.textContent).not.toContain(vector.words)
    expect(document.getElementById("page")!.querySelector(".card")!.querySelectorAll(".dynamic")).toHaveLength(0)
  })

  it("cancels before custody and clears the visible phrase", async () => {
    const { body } = installCardDocument(vi.stubGlobal)
    vi.stubGlobal("HTMLElement", FakeElement)
    vi.stubGlobal("Element", FakeElement)
    vi.stubGlobal("Node", FakeElement)
    vi.stubGlobal("HTMLInputElement", FakeElement)
    vi.stubGlobal("HTMLTextAreaElement", FakeElement)
    vi.stubGlobal("HTMLButtonElement", FakeElement)
    const request: HdAuthorizationRequest = {
      kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "import", wrapMeta: "PUBLIC_ROOT", deadlineAt: Date.now() + 300_000,
    }
    const controller = new AbortController()
    const finalize = vi.fn(async () => {})
    const pending = collectProtectedHdInput(request, controller.signal, finalize)
    const phrase = body.querySelector("textarea")!
    valueOf(phrase).value = vector.words
    const cancel = body.querySelectorAll("button").find((candidate) => candidate.textContent === "Cancel")!
    cancel.click()
    await expect(pending).rejects.toThrow("operation-cancelled")
    expect(finalize).not.toHaveBeenCalled()
    expect(body.textContent).not.toContain(vector.words)
  })
})
