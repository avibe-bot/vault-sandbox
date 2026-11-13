import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument, FakeElement } from "./testDom"
import { wordlist } from "@scure/bip39/wordlists/english"
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

  it("never offers an answer as another row's distractor or repeats a distractor, even for repeated-word phrases", () => {
    // A small deterministic generator, so every seed is reproducible.
    const seeded = (seed: number) => (limit: number): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % limit
    }
    const phrases = [
      vector.words,
      `${"abandon ".repeat(11)}about`,
      `${"zoo ".repeat(11)}wrong`,
      `${"legal winner thank year wave sausage worth useful legal winner thank yellow"}`,
    ]
    for (const phrase of phrases) {
      expect(phraseProblem(phrase)).toBeNull()
      const words = phrase.split(" ")
      const distinctWords = new Set(words)
      for (let seed = 0; seed < 400; seed += 1) {
        const quiz = makeHdQuiz(words, seeded(seed))
        expect(new Set(quiz.map((question) => question.position)).size).toBe(3)
        const answers = new Set(quiz.map((question) => question.answer))
        const distractors = quiz.flatMap((question) => question.options.filter((option) => option !== question.answer))
        for (const question of quiz) {
          expect(question.answer).toBe(words[question.position - 1])
          expect(question.options).toHaveLength(3)
          expect(new Set(question.options).size).toBe(3)
          expect(question.options).toContain(question.answer)
        }
        expect(distractors).toHaveLength(6)
        expect(new Set(distractors).size).toBe(6)
        for (const word of distractors) {
          expect(answers.has(word)).toBe(false)
          expect(wordlist).toContain(word)
        }
        // The phrase's own other words come first; the BIP39 list only tops up.
        const phraseDistractors = distractors.filter((word) => distinctWords.has(word)).length
        expect(phraseDistractors).toBe(Math.min(6, [...distinctWords].filter((word) => !answers.has(word)).length))
      }
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
    expect(body.querySelectorAll("li").map((item) => item.children[1].textContent).join(" ")).toBe(vector.words)
    buttonWithText(body, "I wrote them down").click()
    const words = vector.words.split(" ")
    const positionOf = (question: FakeElement) => Number(question.querySelector("span")!.textContent.match(/\d+/)![0])
    const answerQuiz = () => {
      for (const question of body.querySelectorAll(".hd-quiz")) buttonWithText(question, words[positionOf(question) - 1]).click()
      buttonWithText(body, "Next").click()
    }
    // Next stays disabled while any pick is missing or wrong; a wrong pick is named at once.
    const quizNext = buttonWithText(body, "Next")
    expect(quizNext.disabled).toBe(true)
    const rows = body.querySelectorAll(".hd-quiz")
    expect(rows).toHaveLength(3)
    for (const row of rows) {
      const wrong = row.querySelectorAll(".hd-option").find((option) => option.textContent !== words[positionOf(row) - 1])!
      wrong.click()
      expect(wrong.classList.contains("wrong")).toBe(true)
      expect(wrong.getAttribute("aria-checked")).toBe("true")
      expect(quizNext.disabled).toBe(true)
    }
    expect(body.textContent).toContain(`Word #${positionOf(rows[0])} doesn't match`)
    quizNext.click()
    expect(body.querySelectorAll("input")).toHaveLength(0)
    buttonWithText(rows[0], words[positionOf(rows[0]) - 1]).click()
    buttonWithText(rows[1], words[positionOf(rows[1]) - 1]).click()
    expect(quizNext.disabled).toBe(true)
    expect(body.textContent).toContain(`Word #${positionOf(rows[2])} doesn't match`)
    buttonWithText(rows[2], words[positionOf(rows[2]) - 1]).click()
    expect(quizNext.disabled).toBe(false)
    expect(body.textContent).not.toContain("doesn't match")
    expect(rows.flatMap((row) => row.querySelectorAll(".wrong"))).toHaveLength(0)
    quizNext.click()

    let inputs = body.querySelectorAll("input")
    expect(inputs).toHaveLength(2)
    // Each passphrase field has its own show/hide; neither starts revealed.
    const toggles = body.querySelectorAll(".hd-reveal")
    expect(toggles).toHaveLength(2)
    expect(inputs.map((input) => input.type)).toEqual(["password", "password"])
    toggles[0].click()
    expect(inputs.map((input) => input.type)).toEqual(["text", "password"])
    expect(toggles[0].getAttribute("aria-pressed")).toBe("true")
    expect(toggles[0].textContent).toBe("Hide passphrase")
    expect(toggles[1].textContent).toBe("Show passphrase")
    toggles[1].click()
    toggles[0].click()
    expect(inputs.map((input) => input.type)).toEqual(["password", "text"])
    valueOf(inputs[0]).value = "public changed passphrase"
    buttonWithText(body, "Back").click()
    expect(valueOf(inputs[0]).value).toBe("")
    // Leaving the step hides any revealed field again.
    expect(inputs.map((input) => input.type)).toEqual(["password", "password"])
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
    // Import has one passphrase field, with its own show/hide.
    expect(body.querySelectorAll("input")).toHaveLength(1)
    const toggle = body.querySelector(".hd-reveal")!
    expect(toggle.getAttribute("aria-controls")).toBe(passphrase.id)
    toggle.click()
    expect(passphrase.type).toBe("text")
    valueOf(passphrase).value = "public-passphrase"
    buttonWithText(body, "Back").click()
    expect(valueOf(passphrase).value).toBe("")
    expect(passphrase.type).toBe("password")
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
