// Trusted popup UI for protected HD create/import. Words, passphrase and quiz
// exist only in this top-level sandbox window; nothing here is sent to Avibe.
import { validateMnemonic } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"
import {
  deriveHdAccounts, hdAccount0Addresses, hdPath, hdPayloadFromWords, hdWords, normalizeHdWords, wipeHdPayload,
  type HdPublicRow,
} from "./protectedHd"
import type { CollectHdInput, HdAuthorizationRequest, HdFinalize } from "./protectedHdCeremony"
import { appendDynamic, button, hideCard, i18nText, rawText, setElementText, showCard, status, type TextSpec } from "./operationUi"
import type { I18nKey } from "./i18n"

const WORD_COUNTS = [12, 15, 18, 21, 24]
const WORDS = new Set(wordlist)

type PhraseProblem = { key: I18nKey; params?: Record<string, string | number> } | null

/** First problem in a typed phrase, named so the user can fix it. */
export function phraseProblem(input: string): PhraseProblem {
  const words = normalizeHdWords(input).split(" ").filter(Boolean)
  if (words.length === 0) return { key: "hd.phraseEmpty" }
  const unknown = words.findIndex((word) => !WORDS.has(word))
  if (unknown >= 0) return { key: "hd.phraseUnknown", params: { position: unknown + 1 } }
  if (!WORD_COUNTS.includes(words.length)) return { key: "hd.phraseCount", params: { count: words.length } }
  if (!validateMnemonic(words.join(" "), wordlist)) return { key: "hd.phraseChecksum" }
  return null
}

function randomIndex(limit: number): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] % limit
}

export type HdQuizQuestion = { position: number; options: string[]; answer: string }
/** Three positions, each with its word and two other words of the phrase, shuffled. */
export function makeHdQuiz(words: string[], random: (limit: number) => number = randomIndex): HdQuizQuestion[] {
  const positions = new Set<number>()
  while (positions.size < 3) positions.add(1 + random(words.length))
  return [...positions].sort((a, b) => a - b).map((position) => {
    const answer = words[position - 1]
    const others = [...new Set(words.filter((word) => word !== answer))]
    const options = [answer]
    while (options.length < 3 && others.length > 0) options.push(others.splice(random(others.length), 1)[0])
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = random(i + 1)
      ;[options[i], options[j]] = [options[j], options[i]]
    }
    return { position, options, answer }
  })
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: TextSpec): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = `${className} dynamic`
  if (text !== undefined) setElementText(node, text)
  return node
}

function field(kind: "input" | "textarea", label: I18nKey): { wrap: HTMLElement; input: HTMLInputElement | HTMLTextAreaElement } {
  const wrap = element("label", "hd-field")
  const caption = element("span", "hd-field-label", label)
  const input = document.createElement(kind)
  input.className = kind === "textarea" ? "field textarea" : "field"
  input.setAttribute("autocomplete", "off")
  input.setAttribute("autocapitalize", "off")
  input.setAttribute("autocorrect", "off")
  input.setAttribute("spellcheck", "false")
  if (input instanceof HTMLInputElement) input.type = "password"
  wrap.append(caption, input)
  return { wrap, input }
}

function addressRows(row: HdPublicRow): HTMLElement {
  const addresses = hdAccount0Addresses(row)
  const list = element("div", "confirmation-details")
  const rows: Array<[I18nKey, string, string]> = [
    ["hd.reviewEvm", addresses.eth, hdPath("evm", 0)],
    ["hd.reviewBitcoin", addresses.btc_taproot, hdPath("bitcoin", 0)],
    ["hd.reviewSolana", addresses.solana, hdPath("solana", 0)],
  ]
  for (const [label, address, path] of rows) {
    const item = document.createElement("div")
    item.className = "detail-row"
    const name = document.createElement("span")
    name.className = "detail-label"
    setElementText(name, label)
    const value = document.createElement("div")
    value.className = "detail-value"
    const mono = document.createElement("span")
    mono.className = "detail-mono"
    mono.textContent = address
    const sub = document.createElement("span")
    sub.className = "detail-text hd-path"
    sub.textContent = path
    value.append(mono, sub)
    item.append(name, value)
    list.append(item)
  }
  return list
}

/**
 * Runs the whole create/import flow in this popup. Resolves only after
 * `finalize` (late passkey PRF, seal and reopen) completes from the final click.
 */
export const collectProtectedHdInput: CollectHdInput = (request, signal, finalize) =>
  new Promise<void>((resolve, reject) => {
    const cleanups: Array<() => void> = []
    let words: string[] = []
    let passphrase = ""
    let settled = false
    let finalizing = false
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      for (const cleanup of cleanups.splice(0)) cleanup()
      words = []
      passphrase = ""
      hideCard()
      callback()
    }
    const onAbort = (): void => settle(() => reject(signal.reason instanceof Error ? signal.reason : new Error("operation-cancelled")))
    if (signal.aborted) { onAbort(); return }
    signal.addEventListener("abort", onAbort, { once: true })
    const title: I18nKey = request.mode === "create" ? "hd.createTitle" : "hd.importTitle"
    const subtitle = rawText(request.name)
    const cancel = (): HTMLButtonElement => {
      const node = button("common.cancel")
      node.classList.add("secondary")
      node.addEventListener("click", () => {
        if (finalizing) return
        settle(() => reject(new Error("operation-cancelled")))
      }, { once: true })
      return node
    }
    const clearInput = (input: HTMLInputElement | HTMLTextAreaElement): void => { cleanups.push(() => { input.value = "" }) }

    const showReview = (back: () => void): void => {
      let accounts: HdPublicRow[]
      const payload = hdPayloadFromWords(words.join(" "), passphrase)
      try { accounts = deriveHdAccounts(payload.seed) } finally { wipeHdPayload(payload) }
      const r = showCard("hd.reviewTitle", subtitle, "hd.reviewBody")
      appendDynamic(r.card, addressRows(accounts[0]))
      appendDynamic(r.card, element("p", "setup-status", "hd.recoveryNote"))
      appendDynamic(r.card, element("p", "setup-status", "hd.passkeyNote"))
      const progress = status()
      const confirm = button(request.mode === "create" ? "hd.createCta" : "hd.importCta")
      const previous = button("hd.back")
      previous.classList.add("secondary")
      previous.addEventListener("click", back, { once: true })
      const cancelButton = cancel()
      confirm.addEventListener("click", () => {
        if (confirm.disabled) return
        confirm.disabled = true
        previous.disabled = true
        cancelButton.disabled = true
        finalizing = true
        setElementText(progress, "hd.working")
        // Called synchronously in the click so WebAuthn keeps the user activation.
        const sealing: Promise<void> = finalize({ words: words.join(" "), passphrase, reviewedAccounts: accounts })
        void sealing.then(() => settle(resolve), (error: unknown) => settle(() => reject(error)))
      })
      appendDynamic(r.card, progress)
      appendDynamic(r.card, confirm)
      appendDynamic(r.card, previous)
      appendDynamic(r.card, cancelButton)
    }

    const showPassphrase = (confirmTwice: boolean, back: () => void, next: () => void): void => {
      const r = showCard(title, subtitle, confirmTwice ? "hd.passphraseBody" : "hd.importPassphraseHint")
      const first = field("input", "hd.passphrase")
      const second = confirmTwice ? field("input", "hd.passphraseConfirm") : undefined
      first.input.value = passphrase
      if (second) second.input.value = passphrase
      clearInput(first.input)
      if (second) clearInput(second.input)
      const problem = status()
      const proceed = button("hd.next")
      const previous = button("hd.back")
      previous.classList.add("secondary")
      previous.addEventListener("click", () => { passphrase = first.input.value; back() }, { once: true })
      proceed.addEventListener("click", () => {
        // Whitespace and case are significant; BIP39 applies NFKD itself.
        if (second && first.input.value !== second.input.value) { setElementText(problem, "hd.passphraseMismatch"); return }
        passphrase = first.input.value
        first.input.value = ""
        if (second) second.input.value = ""
        next()
      })
      appendDynamic(r.card, first.wrap)
      if (second) appendDynamic(r.card, second.wrap)
      appendDynamic(r.card, element("p", "setup-status", "hd.passphraseNotStored"))
      appendDynamic(r.card, problem)
      appendDynamic(r.card, proceed)
      appendDynamic(r.card, previous)
      appendDynamic(r.card, cancel())
    }

    const showQuiz = (back: () => void, next: () => void): void => {
      const quiz = makeHdQuiz(words)
      const chosen = new Map<number, string>()
      const r = showCard(title, subtitle, "hd.quizBody")
      const problem = status()
      const proceed = button("hd.next")
      proceed.disabled = true
      for (const question of quiz) {
        const group = element("div", "hd-quiz")
        group.append(element("span", "hd-field-label", i18nText("hd.quizPosition", { position: question.position })))
        const options = question.options.map((word) => {
          const option = document.createElement("button")
          option.type = "button"
          option.className = "hd-option"
          option.textContent = word
          option.addEventListener("click", () => {
            chosen.set(question.position, word)
            options.forEach((other) => other.classList.toggle("selected", other === option))
            setElementText(problem, rawText(""))
            proceed.disabled = chosen.size !== quiz.length
          })
          return option
        })
        group.append(...options)
        appendDynamic(r.card, group)
      }
      const previous = button("hd.back")
      previous.classList.add("secondary")
      previous.addEventListener("click", back, { once: true })
      proceed.addEventListener("click", () => {
        if (!quiz.every((question) => chosen.get(question.position) === question.answer)) { setElementText(problem, "hd.quizWrong"); return }
        next()
      })
      appendDynamic(r.card, problem)
      appendDynamic(r.card, proceed)
      appendDynamic(r.card, previous)
      appendDynamic(r.card, cancel())
    }

    const showWords = (): void => {
      const r = showCard(title, subtitle, "hd.wordsBody")
      const grid = element("ol", "hd-words")
      words.forEach((word) => {
        const item = document.createElement("li")
        item.textContent = word
        grid.append(item)
      })
      cleanups.push(() => { grid.textContent = "" })
      const proceed = button("hd.wordsWritten")
      proceed.addEventListener("click", createPassphrase, { once: true })
      appendDynamic(r.card, grid)
      appendDynamic(r.card, element("p", "setup-status", "hd.recoveryNote"))
      appendDynamic(r.card, proceed)
      appendDynamic(r.card, cancel())
    }

    const showImport = (): void => {
      const r = showCard(title, subtitle, "hd.importBody")
      const phrase = field("textarea", "hd.importWords")
      phrase.input.value = words.join(" ")
      clearInput(phrase.input)
      const problem = status()
      const proceed = button("hd.next")
      proceed.addEventListener("click", () => {
        const issue = phraseProblem(phrase.input.value)
        if (issue) { setElementText(problem, i18nText(issue.key, issue.params)); return }
        words = normalizeHdWords(phrase.input.value).split(" ")
        phrase.input.value = ""
        importPassphrase()
      })
      appendDynamic(r.card, phrase.wrap)
      appendDynamic(r.card, problem)
      appendDynamic(r.card, proceed)
      appendDynamic(r.card, cancel())
    }

    // Named steps so Back always returns to a step whose Next continues the same flow.
    function createPassphrase(): void { showPassphrase(true, showWords, createQuiz) }
    function createQuiz(): void { showQuiz(createPassphrase, () => showReview(createQuiz)) }
    function importPassphrase(): void { showPassphrase(false, showImport, () => showReview(importPassphrase)) }

    if (request.mode === "create") {
      const entropy = new Uint8Array(16)
      crypto.getRandomValues(entropy)
      try { words = hdWords(entropy).split(" ") } finally { entropy.fill(0) }
      showWords()
    } else {
      showImport()
    }
  })

export type { HdAuthorizationRequest, HdFinalize }
