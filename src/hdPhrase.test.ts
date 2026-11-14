import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { wordlist } from "@scure/bip39/wordlists/english"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { checkPhrase, makeQuiz, normalizeWords, quizPassed, suggestWords } from "./hdPhrase"

// The digest of the standard dialog's lines as vendored. Changing them here
// without re-vendoring from upstream (scripts/hd-phrase-parity.mjs) fails.
const UPSTREAM_REGION_SHA256 = "f3552efcc9c79785458cb5a75c68e80ea7a55920ed483d0ffd86bbae83ae7d06"

describe("shared seed-phrase logic, vendored verbatim from the standard dialog", () => {
  it("keeps the pinned upstream region byte-for-byte", () => {
    // Same markers as scripts/hd-phrase-region.mjs.
    const match = readFileSync(new URL("./hdPhrase.ts", import.meta.url), "utf8")
      .match(/\/\/ BEGIN VENDORED vaultHdWallet\.ts sha256:([0-9a-f]{64})\n([\s\S]*?)\/\/ END VENDORED\n$/)
    expect(match).not.toBeNull()
    const [, pinned, region] = match!
    expect(pinned).toBe(UPSTREAM_REGION_SHA256)
    expect(createHash("sha256").update(region).digest("hex")).toBe(UPSTREAM_REGION_SHA256)
  })

  it("pins the literal English wordlist (identical in the standard 2.4.0 and sandbox 1.6.0 locks)", () => {
    expect(wordlist).toHaveLength(2048)
    expect(createHash("sha256").update(wordlist.join("\n") + "\n").digest("hex"))
      .toBe("2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda")
  })

  it("checks word by word, names the first unknown word with suggestions, then count and checksum", () => {
    const words = vectors.cases[0].words.split(" ")
    expect(checkPhrase("")).toEqual({ ok: false, reason: "empty" })
    const typo = [...words]
    typo[2] = "abandn"
    expect(checkPhrase(typo.join(" "))).toEqual({ ok: false, reason: "unknown-word", position: 3, word: "abandn", suggestions: suggestWords("abandn") })
    expect(suggestWords("abandn")).toEqual(["abandon"])
    expect(checkPhrase(words.slice(0, 11).join(" "))).toEqual({ ok: false, reason: "count", count: 11 })
    expect(checkPhrase([...words.slice(0, 11), words[11] === "zoo" ? "abandon" : "zoo"].join(" "))).toEqual({ ok: false, reason: "checksum" })
    for (const vector of vectors.cases) expect(checkPhrase(`  ${vector.words.toUpperCase()}\n`)).toEqual({ ok: true, words: normalizeWords(vector.words) })
  })

  it("makes three positions whose distractors are never an answer and never repeat, phrase words first", () => {
    const seeded = (seed: number) => (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }
    for (const phrase of [vectors.cases[0].words, `${"abandon ".repeat(11)}about`, `${"zoo ".repeat(11)}wrong`]) {
      const words = phrase.split(" ")
      const distinct = new Set(words)
      for (let seed = 0; seed < 300; seed += 1) {
        const quiz = makeQuiz(words, seeded(seed))
        expect(new Set(quiz.map((question) => question.position)).size).toBe(3)
        const answers = new Set(quiz.map((question) => question.answer))
        const distractors = quiz.flatMap((question) => question.options.filter((option) => option !== question.answer))
        for (const question of quiz) {
          expect(question.answer).toBe(words[question.position - 1])
          expect(new Set(question.options).size).toBe(3)
        }
        expect(new Set(distractors).size).toBe(6)
        for (const word of distractors) {
          expect(answers.has(word)).toBe(false)
          expect(wordlist).toContain(word)
        }
        expect(distractors.filter((word) => distinct.has(word)).length).toBe(Math.min(6, [...distinct].filter((word) => !answers.has(word)).length))
        expect(quizPassed(quiz, Object.fromEntries(quiz.map((question) => [question.position, question.answer])))).toBe(true)
        expect(quizPassed(quiz, {})).toBe(false)
      }
    }
  })
})
