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
/**
 * Three distinct positions, each offering its word and two distractors, shuffled.
 * No distractor is any question's answer, and none appears twice in the quiz,
 * so no row's pick is hinted by another row. Distractors come from the phrase's
 * other words first (that tests the position, not just membership), then from
 * the BIP39 list when a phrase repeats words.
 */
export function makeHdQuiz(words: string[], random: (limit: number) => number = randomIndex): HdQuizQuestion[] {
  const positions = new Set<number>()
  while (positions.size < 3) positions.add(1 + random(words.length))
  const sorted = [...positions].sort((a, b) => a - b)
  const answers = new Set(sorted.map((position) => words[position - 1]))
  const fromPhrase = [...new Set(words)].filter((word) => !answers.has(word))
  const used = new Set<string>()
  const distractor = (): string => {
    const pool = fromPhrase.length > 0 ? fromPhrase : wordlist.filter((word) => !answers.has(word) && !used.has(word))
    const word = pool.splice(random(pool.length), 1)[0]
    used.add(word)
    return word
  }
  return sorted.map((position) => {
    const answer = words[position - 1]
    const options = [answer, distractor(), distractor()]
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

function secretInput<K extends "input" | "textarea">(kind: K): HTMLElementTagNameMap[K] {
  const input = document.createElement(kind)
  input.className = kind === "textarea" ? "field textarea" : "field"
  input.setAttribute("autocomplete", "off")
  input.setAttribute("autocapitalize", "off")
  input.setAttribute("autocorrect", "off")
  input.setAttribute("spellcheck", "false")
  if (input instanceof HTMLInputElement) input.type = "password"
  return input
}

function field(kind: "input" | "textarea", label: I18nKey): { wrap: HTMLElement; input: HTMLInputElement | HTMLTextAreaElement } {
  const wrap = element("label", "hd-field")
  const caption = element("span", "hd-field-label", label)
  const input = secretInput(kind)
  wrap.append(caption, input)
  return { wrap, input }
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
// lucide Eye / EyeOff, matching the show/hide control of the Web secret inputs.
const EYE = ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"]
const EYE_OFF = [
  "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
  "M14.084 14.158a3 3 0 0 1-4.242-4.242",
  "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
  "m2 2 20 20",
]

function eyeIcon(shown: boolean): SVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg")
  const attributes: Record<string, string> = {
    viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2",
    "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true",
  }
  for (const [key, value] of Object.entries(attributes)) icon.setAttribute(key, value)
  for (const d of shown ? EYE_OFF : EYE) {
    const path = document.createElementNS(SVG_NAMESPACE, "path")
    path.setAttribute("d", d)
    icon.append(path)
  }
  return icon
}

let passphraseFieldCount = 0

/**
 * A passphrase input with its own show/hide control: a typo here silently
 * yields a different wallet. Hidden by default; `hide` restores that state.
 */
function passphraseField(label: I18nKey): { wrap: HTMLElement; input: HTMLInputElement; toggle: HTMLButtonElement; hide: () => void } {
  const wrap = element("div", "hd-field")
  const id = `hd-passphrase-${++passphraseFieldCount}`
  const caption = element("label", "hd-field-label", label)
  caption.htmlFor = id
  const row = element("div", "hd-secret-row")
  const input = secretInput("input")
  input.id = id
  const toggle = document.createElement("button")
  toggle.type = "button"
  toggle.className = "hd-reveal"
  toggle.setAttribute("aria-controls", id)
  const name = element("span", "hd-reveal-label")
  const render = (shown: boolean): void => {
    input.type = shown ? "text" : "password"
    toggle.setAttribute("aria-pressed", String(shown))
    setElementText(name, shown ? "hd.hidePassphrase" : "hd.showPassphrase")
    toggle.textContent = ""
    toggle.append(eyeIcon(shown), name)
  }
  toggle.addEventListener("click", () => render(input.type === "password"))
  render(false)
  row.append(input, toggle)
  wrap.append(caption, row)
  return { wrap, input, toggle, hide: () => render(false) }
}

function addressRows(row: HdPublicRow): HTMLElement {
  const addresses = hdAccount0Addresses(row)
  const list = element("div", "hd-addresses")
  const rows: Array<[I18nKey, string, string]> = [
    ["hd.reviewEvm", addresses.eth, hdPath("evm", 0)],
    ["hd.reviewBitcoin", addresses.btc_taproot, hdPath("bitcoin", 0)],
    ["hd.reviewSolana", addresses.solana, hdPath("solana", 0)],
  ]
  for (const [label, address, path] of rows) {
    const item = document.createElement("div")
    item.className = "hd-address"
    const name = document.createElement("span")
    name.className = "hd-address-label"
    setElementText(name, label)
    const mono = document.createElement("span")
    mono.className = "hd-address-value"
    mono.textContent = address
    const sub = document.createElement("span")
    sub.className = "hd-path"
    sub.textContent = path
    item.append(name, mono, sub)
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
    let step = 0
    const cleanStep = (): void => { for (const cleanup of cleanups.splice(0)) cleanup() }
    const showStep: typeof showCard = (...args) => { cleanStep(); step += 1; return showCard(...args) }
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      cleanStep()
      words = []
      passphrase = ""
      hideCard()
      callback()
    }
    const onAbort = (): void => settle(() => reject(signal.reason instanceof Error ? signal.reason : new Error("operation-cancelled")))
    if (signal.aborted) { onAbort(); return }
    signal.addEventListener("abort", onAbort, { once: true })
    const total = request.mode === "create" ? 4 : 3
    const stepLabel = (position: number): TextSpec => rawText(`${request.name} · ${position}/${total}`)
    const onClick = (node: HTMLElement, action: () => void, once = false): void => {
      const generation = step
      node.addEventListener("click", () => {
        if (settled || generation !== step) return
        try { action() } catch (error) { settle(() => reject(error)) }
      }, { once })
    }
    const cancel = (): HTMLButtonElement => {
      const node = button("common.cancel")
      node.classList.add("secondary")
      onClick(node, () => settle(() => reject(new Error("operation-cancelled"))), true)
      return node
    }
    const clearInput = (input: HTMLInputElement | HTMLTextAreaElement): void => { cleanups.push(() => { input.value = "" }) }

    const showReview = (back: () => void): void => {
      let accounts: HdPublicRow[]
      const payload = hdPayloadFromWords(words.join(" "), passphrase)
      try { accounts = deriveHdAccounts(payload.seed) } finally { wipeHdPayload(payload) }
      const r = showStep(request.mode === "create" ? "hd.reviewTitleCreate" : "hd.reviewTitleImport", stepLabel(total),
        request.mode === "create" ? "hd.reviewBodyCreate" : "hd.reviewBodyImport")
      appendDynamic(r.card, addressRows(accounts[0]))
      appendDynamic(r.card, element("p", "setup-status", "hd.passkeyNote"))
      const progress = status()
      const confirm = button("hd.saveCta")
      const previous = button("hd.back")
      previous.classList.add("secondary")
      onClick(previous, back, true)
      const cancelButton = cancel()
      onClick(confirm, () => {
        if (confirm.disabled) return
        confirm.disabled = true
        previous.disabled = true
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
      const r = showStep("hd.passphraseTitle", stepLabel(confirmTwice ? 3 : 2), confirmTwice ? "hd.passphraseBody" : "hd.importPassphraseHint")
      const first = passphraseField("hd.passphrase")
      const second = confirmTwice ? passphraseField("hd.passphraseConfirm") : undefined
      first.input.value = passphrase
      // Never prefill the confirmation: Back must not turn one typed value
      // into an automatically confirmed passphrase.
      if (second) second.input.value = ""
      for (const entry of second ? [first, second] : [first]) {
        clearInput(entry.input)
        cleanups.push(entry.hide)
      }
      const problem = status()
      problem.classList.add("hd-error")
      const proceed = button(passphrase ? "hd.next" : "hd.skipNext")
      first.input.addEventListener("input", () => setElementText(proceed, first.input.value ? "hd.next" : "hd.skipNext"))
      const previous = button("hd.back")
      previous.classList.add("secondary")
      onClick(previous, () => { passphrase = first.input.value; back() }, true)
      onClick(proceed, () => {
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
      const r = showStep("hd.quizTitle", stepLabel(2), "hd.quizBody")
      const problem = status()
      problem.classList.add("hd-error")
      const optionGroups = new Map<number, HTMLButtonElement[]>()
      const proceed = button("hd.next")
      // Next opens only once every pick is right; a wrong pick is marked as it is made.
      proceed.classList.add("hd-gated")
      proceed.disabled = true
      const refresh = (): void => {
        const wrong = quiz.find((question) => chosen.has(question.position) && chosen.get(question.position) !== question.answer)
        setElementText(problem, wrong ? i18nText("hd.quizWrong", { position: wrong.position }) : rawText(""))
        proceed.disabled = !quiz.every((question) => chosen.get(question.position) === question.answer)
      }
      for (const question of quiz) {
        const group = element("div", "hd-quiz")
        group.setAttribute("role", "radiogroup")
        const label = element("span", "hd-field-label", i18nText("hd.quizPosition", { position: question.position }))
        label.id = `hd-quiz-${question.position}`
        group.setAttribute("aria-labelledby", label.id)
        group.append(label)
        const options = question.options.map((word) => {
          const option = document.createElement("button")
          option.type = "button"
          option.className = "hd-option"
          option.setAttribute("role", "radio")
          option.setAttribute("aria-checked", "false")
          option.textContent = word
          onClick(option, () => {
            chosen.set(question.position, word)
            options.forEach((other) => {
              const picked = other === option
              other.setAttribute("aria-checked", String(picked))
              other.classList.remove("selected", "wrong")
              if (picked) other.classList.add(word === question.answer ? "selected" : "wrong")
            })
            refresh()
          })
          return option
        })
        group.append(...options)
        optionGroups.set(question.position, options)
        cleanups.push(() => { group.textContent = ""; question.answer = ""; question.options.fill(""); chosen.clear(); optionGroups.clear() })
        appendDynamic(r.card, group)
      }
      const previous = button("hd.back")
      previous.classList.add("secondary")
      onClick(previous, back, true)
      onClick(proceed, () => {
        if (proceed.disabled || !quiz.every((question) => chosen.get(question.position) === question.answer)) return
        next()
      })
      appendDynamic(r.card, problem)
      appendDynamic(r.card, proceed)
      appendDynamic(r.card, previous)
      appendDynamic(r.card, cancel())
    }

    const showWords = (): void => {
      const r = showStep("hd.wordsTitle", stepLabel(1), "hd.wordsBody")
      const grid = element("ol", "hd-words")
      words.forEach((word, index) => {
        const item = document.createElement("li")
        const number = document.createElement("span")
        number.className = "hd-word-index"
        number.textContent = String(index + 1)
        const text = document.createElement("span")
        text.textContent = word
        item.append(number, text)
        grid.append(item)
      })
      cleanups.push(() => { grid.textContent = "" })
      const proceed = button("hd.wordsWritten")
      onClick(proceed, createQuiz, true)
      appendDynamic(r.card, grid)
      appendDynamic(r.card, proceed)
      appendDynamic(r.card, cancel())
    }

    const showImport = (): void => {
      const r = showStep("hd.importTitle", stepLabel(1), "hd.importBody")
      const phrase = field("textarea", "hd.importWords")
      phrase.input.value = words.join(" ")
      clearInput(phrase.input)
      const problem = status()
      problem.classList.add("hd-error")
      const proceed = button("hd.next")
      onClick(proceed, () => {
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
    function createPassphrase(): void { showPassphrase(true, createQuiz, () => showReview(createPassphrase)) }
    function createQuiz(): void { showQuiz(showWords, createPassphrase) }
    function importPassphrase(): void { showPassphrase(false, showImport, () => showReview(importPassphrase)) }

    try {
      if (request.mode === "create") {
        const entropy = new Uint8Array(16)
        try { crypto.getRandomValues(entropy); words = hdWords(entropy).split(" ") } finally { entropy.fill(0) }
        showWords()
      } else {
        showImport()
      }
    } catch (error) { settle(() => reject(error)) }
  })

export type { HdAuthorizationRequest, HdFinalize }
