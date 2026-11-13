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
  // An empty passphrase step labels its continue button "Skip, next".
  const labels = text === "Next" ? ["Next", "Skip, next"] : [text]
  const button = root.querySelectorAll("button").find((candidate) => labels.includes(candidate.textContent))
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
    const confirm = reviewButtons.find((candidate) => candidate.textContent === "Save with passkey")!
    const cancel = reviewButtons[reviewButtons.length - 1]
    confirm.click()
    expect(finalize).toHaveBeenCalledTimes(1)
    expect(finalInput).toMatchObject({ words: vector.words, passphrase: vector.passphrase })
    expect(cancel.disabled).toBe(false)

    finishFinalize()
    await expect(pending).resolves.toBeUndefined()
    expect(body.textContent).not.toContain(vector.words)
    expect(document.getElementById("page")!.querySelector(".card")!.querySelectorAll(".dynamic")).toHaveLength(0)
  })

  it("creates with words → three-word quiz → a twice-entered final passphrase, never auto-confirming Back", async () => {
    const { body } = installCardDocument(vi.stubGlobal)
    const entropy = Uint8Array.from(vector.entropy_hex.match(/../g)!, (pair) => Number.parseInt(pair, 16))
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
      const bytes = array as Uint8Array
      if (bytes.byteLength === entropy.length) bytes.set(entropy)
      else new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).fill(random.mock.calls.length % 12)
      return array
    })
    // The quiz RNG must visit distinct positions, not hold a constant stub.
    let randomCounter = 0
    random.mockImplementation((array) => {
      if (array instanceof Uint8Array && array.length === 16) array.set(entropy)
      else (array as Uint32Array)[0] = randomCounter++
      return array
    })
    const request: HdAuthorizationRequest = {
      kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "create", wrapMeta: "PUBLIC_ROOT", deadlineAt: Date.now() + 300_000,
    }
    const finalize = vi.fn(async () => {})
    const pending = collectProtectedHdInput(request, new AbortController().signal, finalize)
    expect(body.querySelectorAll("li").map((item) => item.textContent).join(" ")).toBe(vector.words)
    buttonWithText(body, "I wrote them down").click()
    const answerQuiz = () => {
      const words = vector.words.split(" ")
      for (const question of body.querySelectorAll(".hd-quiz")) {
        const position = Number(question.querySelector("span")!.textContent.match(/\d+/)![0])
        buttonWithText(question, words[position - 1]).click()
      }
      buttonWithText(body, "Next").click()
    }
    answerQuiz()
    let inputs = body.querySelectorAll("input")
    expect(inputs).toHaveLength(2)
    valueOf(inputs[0]).value = "public changed passphrase"
    buttonWithText(body, "Back").click()
    expect(valueOf(inputs[0]).value).toBe("")
    answerQuiz()
    inputs = body.querySelectorAll("input")
    expect(valueOf(inputs[0]).value).toBe("public changed passphrase")
    expect(valueOf(inputs[1]).value).toBe("")
    buttonWithText(body, "Next").click()
    expect(body.textContent).toContain("don't match")
    valueOf(inputs[1]).value = "public changed passphrase"
    buttonWithText(body, "Next").click()
    buttonWithText(body, "Save with passkey").click()
    await pending
    expect(finalize).toHaveBeenCalledWith(expect.objectContaining({ words: vector.words, passphrase: "public changed passphrase" }))
    random.mockRestore()
  })

  it("scrubs detached passphrase inputs on Back and settles synchronous custody errors", async () => {
    const { body } = installCardDocument(vi.stubGlobal)
    const request: HdAuthorizationRequest = {
      kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "import", wrapMeta: "PUBLIC_ROOT", deadlineAt: Date.now() + 300_000,
    }
    const finalize = vi.fn(() => { throw new Error("public synchronous failure") })
    const pending = collectProtectedHdInput(request, new AbortController().signal, finalize)
    const phrase = body.querySelector("textarea")!
    valueOf(phrase).value = vector.words
    buttonWithText(body, "Next").click()
    const passphrase = body.querySelector("input")!
    valueOf(passphrase).value = "public-passphrase"
    buttonWithText(body, "Back").click()
    expect(valueOf(passphrase).value).toBe("")
    buttonWithText(body, "Next").click()
    buttonWithText(body, "Next").click()
    buttonWithText(body, "Save with passkey").click()
    await expect(pending).rejects.toThrow("public synchronous failure")
    expect(body.querySelectorAll(".dynamic")).toHaveLength(0)
  })

  it("allows cancellation after the final click and cannot resurrect from a late custody completion", async () => {
    const { body } = installCardDocument(vi.stubGlobal)
    const request: HdAuthorizationRequest = {
      kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "import", wrapMeta: "PUBLIC_ROOT", deadlineAt: Date.now() + 300_000,
    }
    let resolveFinalize!: () => void
    const pending = collectProtectedHdInput(request, new AbortController().signal, () => new Promise<void>((resolve) => { resolveFinalize = resolve }))
    valueOf(body.querySelector("textarea")!).value = vector.words
    buttonWithText(body, "Next").click()
    buttonWithText(body, "Next").click()
    buttonWithText(body, "Save with passkey").click()
    buttonWithText(body, "Cancel").click()
    await expect(pending).rejects.toThrow("operation-cancelled")
    resolveFinalize()
    await Promise.resolve()
    expect(body.querySelectorAll(".dynamic")).toHaveLength(0)
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
