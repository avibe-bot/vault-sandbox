// Trusted popup UI for protected HD create/import. Words, passphrase and quiz
// exist only in this top-level sandbox window; nothing here is sent to Avibe.
//
// The steps, their order, labels and behaviour follow the standard seed-phrase
// dialog (Set up → Write it down → Check; import in one panel with a live #0),
// and the phrase logic itself is the standard dialog's, vendored in hdPhrase.ts.
// What differs is custody only: the wallet is sealed here, behind a Passkey
// requested directly from the final click, and only Taproot is offered at #0.
import {
  deriveHdAccounts, hdAccount0Addresses, hdPayloadFromWords, hdWords, normalizeHdWords, wipeHdPayload,
  type HdPublicRow,
} from "./protectedHd"
import { checkPhrase, makeQuiz, normalizeWords, quizPassed, type HdQuestion, type PhraseCheck } from "./hdPhrase"
import type { CollectHdInput, HdAuthorizationRequest, HdFinalize } from "./protectedHdCeremony"
import { appendDynamic, button, hideCard, i18nText, rawText, setElementText, showCard, status, type TextSpec } from "./operationUi"
import { copyHdWords } from "./hdClipboard"
import type { I18nKey } from "./i18n"

/** A uniform [0, 1) from the platform CSPRNG, for the shared quiz. */
function randomUnit(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] / 2 ** 32
}

/** The standard dialog's backup check, drawn with this window's CSPRNG. */
export function makeHdQuiz(words: string[], random: () => number = randomUnit): HdQuestion[] {
  return makeQuiz(words, random)
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

// lucide ChevronDown / ChevronRight, as the standard folded sections.
function chevronIcon(open: boolean): SVGElement {
  const icon = document.createElementNS(SVG_NAMESPACE, "svg")
  for (const [key, value] of Object.entries({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" })) icon.setAttribute(key, value)
  const path = document.createElementNS(SVG_NAMESPACE, "path")
  path.setAttribute("d", open ? "m6 9 6 6 6-6" : "m9 18 6-6-6-6")
  icon.append(path)
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
    setElementText(name, shown ? "hd.hideValue" : "hd.showValue")
    toggle.textContent = ""
    toggle.append(eyeIcon(shown), name)
  }
  toggle.addEventListener("click", () => render(input.type === "password"))
  render(false)
  row.append(input, toggle)
  wrap.append(caption, row)
  return { wrap, input, toggle, hide: () => render(false) }
}

type Tone = "warning" | "error" | "note"

/** A one-line notice, as the standard dialog's HdNotice. */
function notice(tone: Tone, ...parts: TextSpec[]): HTMLElement {
  const box = element("div", `hd-notice hd-notice-${tone}`)
  box.setAttribute("role", tone === "error" ? "alert" : "note")
  parts.forEach((part, index) => box.append(element("span", index === 0 && parts.length > 1 ? "hd-notice-lead" : "hd-notice-text", part)))
  return box
}

/** Set up → Write it down → Check, as the standard stepper. */
function stepper(current: 1 | 2 | 3): HTMLElement {
  const list = element("ol", "hd-stepper")
  setLabel(list, "hd.stepsLabel")
  ;(["hd.stepSetup", "hd.stepBackup", "hd.stepCheck"] as const).forEach((label, index) => {
    const n = index + 1
    const item = document.createElement("li")
    item.className = n < current ? "done" : n === current ? "current" : ""
    if (n === current) item.setAttribute("aria-current", "step")
    const dot = document.createElement("span")
    dot.className = "hd-step-dot"
    dot.textContent = n < current ? "✓" : String(n)
    const name = document.createElement("span")
    name.className = "hd-step-name"
    setElementText(name, label)
    item.append(dot, name)
    list.append(item)
  })
  return list
}

function setLabel(node: HTMLElement, key: I18nKey): void {
  const probe = document.createElement("span")
  setElementText(probe, key)
  node.setAttribute("aria-label", probe.textContent ?? "")
}

/** A folded section: a header button that opens it, and a hint while folded. */
function fold(title: I18nKey, foldedHint: () => TextSpec, open: boolean): { wrap: HTMLElement; body: HTMLElement; refresh: () => void } {
  const wrap = element("div", "hd-fold")
  const header = document.createElement("button")
  header.type = "button"
  header.className = "hd-fold-header"
  const chevron = element("span", "hd-fold-chevron")
  chevron.setAttribute("aria-hidden", "true")
  const name = element("span", "hd-fold-title", title)
  const hint = element("span", "hd-fold-hint")
  header.append(chevron, name, hint)
  const body = element("div", "hd-fold-body")
  const refresh = (): void => {
    header.setAttribute("aria-expanded", String(open))
    chevron.textContent = ""
    chevron.append(chevronIcon(open))
    body.hidden = !open
    hint.hidden = open
    setElementText(hint, open ? rawText("") : foldedHint())
  }
  header.addEventListener("click", () => { open = !open; refresh() })
  refresh()
  wrap.append(header, body)
  return { wrap, body, refresh }
}

/** The words in order, numbered as a paper backup lists them. */
function wordGrid(words: string[], options: { hidden?: boolean; bad?: number } = {}): HTMLElement {
  const grid = element("ol", "hd-words")
  setLabel(grid, "hd.stepBackup")
  if (options.hidden) {
    grid.classList.add("hd-words-hidden")
    grid.setAttribute("aria-hidden", "true")
  }
  words.forEach((word, index) => {
    const item = document.createElement("li")
    if (options.bad === index) item.className = "bad"
    const number = document.createElement("span")
    number.className = "hd-word-index"
    number.textContent = String(index + 1)
    const text = document.createElement("span")
    if (options.hidden) setElementText(text, "hd.hiddenWord")
    else text.textContent = word
    item.append(number, text)
    grid.append(item)
  })
  return grid
}

/** Account #0 to compare: the addresses this protected wallet signs for (Taproot for Bitcoin). */
function addressRows(row: HdPublicRow): HTMLElement {
  const addresses = hdAccount0Addresses(row)
  const list = element("div", "hd-addresses")
  const rows: Array<[I18nKey, string]> = [
    ["hd.reviewEvm", addresses.eth],
    ["hd.reviewBitcoin", addresses.btc_taproot],
    ["hd.reviewSolana", addresses.solana],
  ]
  for (const [label, address] of rows) {
    const item = document.createElement("div")
    item.className = "hd-address"
    const name = document.createElement("span")
    name.className = "hd-address-label"
    setElementText(name, label)
    const mono = document.createElement("span")
    mono.className = "hd-address-value"
    mono.textContent = address
    item.append(name, mono)
    list.append(item)
  }
  return list
}

/** The full public account table for these exact inputs; the payload is wiped at once. */
function reviewAccounts(words: string, passphrase: string): HdPublicRow[] {
  const payload = hdPayloadFromWords(words, passphrase)
  try { return deriveHdAccounts(payload.seed) } finally { wipeHdPayload(payload) }
}

const PREVIEW_DELAY_MS = 250

/**
 * Runs the whole create/import flow in this popup. Resolves only after
 * `finalize` (late passkey PRF, seal and reopen) completes from the final click.
 */
export const collectProtectedHdInput: CollectHdInput = (request, signal, finalize) =>
  new Promise<void>((resolve, reject) => {
    const cleanups: Array<() => void> = []
    // Secrets of this window. Kept across Back exactly as the standard dialog keeps them.
    let words: string[] = []
    let passphrase = ""
    let passphraseAgain = ""
    let importText = ""
    let quiz: HdQuestion[] = []
    let chosen: Record<number, string> = {}
    let accounts: HdPublicRow[] = []
    let settled = false
    let finalizing = false
    let step = 0
    const cleanStep = (): void => { for (const cleanup of cleanups.splice(0)) cleanup() }
    const showStep = (title: TextSpec, subtitle: TextSpec): ReturnType<typeof showCard> => { cleanStep(); step += 1; return showCard(title, subtitle) }
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      cleanStep()
      words = []
      passphrase = ""
      passphraseAgain = ""
      importText = ""
      for (const question of quiz) { question.answer = ""; question.options.fill("") }
      quiz = []
      chosen = {}
      accounts = []
      hideCard()
      callback()
    }
    const onAbort = (): void => settle(() => reject(signal.reason instanceof Error ? signal.reason : new Error("operation-cancelled")))
    if (signal.aborted) { onAbort(); return }
    signal.addEventListener("abort", onAbort, { once: true })
    const title: TextSpec = "hd.title"
    const subtitle = rawText(request.name)
    /** Handlers belong to the step that made them: a stale or late event does nothing. */
    const onClick = (node: HTMLElement, action: () => void, once = false, allowFinalizing = false): void => {
      const generation = step
      node.addEventListener("click", () => {
        if (settled || generation !== step || (finalizing && !allowFinalizing)) return
        try { action() } catch (error) { settle(() => reject(error)) }
      }, { once })
    }
    const onInput = (node: HTMLElement, action: () => void): void => {
      const generation = step
      node.addEventListener("input", () => {
        if (settled || generation !== step || finalizing) return
        try { action() } catch (error) { settle(() => reject(error)) }
      })
    }
    const secondary = (label: TextSpec): HTMLButtonElement => {
      const node = button(label)
      node.classList.add("secondary")
      return node
    }
    const cancel = (): HTMLButtonElement => {
      const node = secondary("common.cancel")
      onClick(node, () => settle(() => reject(new Error("operation-cancelled"))), true, true)
      return node
    }
    const clearInput = (input: HTMLInputElement | HTMLTextAreaElement): void => { cleanups.push(() => { input.value = "" }) }
    const clearNode = (node: HTMLElement): void => { cleanups.push(() => { node.textContent = "" }) }

    /** The final click: the passkey is requested from inside this click, before any await. */
    const finish = (card: HTMLElement, cancelButton: HTMLButtonElement, progress: HTMLElement, final: { words: string; passphrase: string; reviewedAccounts: HdPublicRow[] }): void => {
      if (finalizing) return
      finalizing = true
      // Freeze the reviewed draft before custody starts. Cancel remains available
      // while the ceremony owns/awaits its in-flight PRF and WebCrypto cleanup.
      for (const selector of ["input", "textarea", "button"] as const) {
        card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(selector).forEach((node) => {
          if (node !== cancelButton) node.disabled = true
        })
      }
      setElementText(progress, "hd.working")
      const sealing: Promise<void> = finalize(final)
      void sealing.then(() => settle(resolve), (error: unknown) => settle(() => reject(error)))
    }

    /** Twice-entered optional passphrase, folded by default (standard HdCreatePassphrase). */
    const createPassphrase = () => {
      const typed = (): boolean => Boolean(passphrase || passphraseAgain)
      const section = fold("hd.passphraseTitle", () => typed() ? "hd.passphraseSet" : "hd.passphraseFolded", typed())
      const first = passphraseField("hd.passphraseLabel")
      const second = passphraseField("hd.passphraseAgain")
      first.input.value = passphrase
      second.input.value = passphraseAgain
      for (const entry of [first, second]) { clearInput(entry.input); cleanups.push(entry.hide) }
      const state = element("p", "hd-hint")
      const refresh = (): void => {
        const mismatch = typed() && passphrase !== passphraseAgain
        state.className = `hd-hint dynamic${mismatch ? " hd-error" : typed() ? " hd-ok" : ""}`
        state.setAttribute("role", mismatch ? "alert" : "status")
        second.input.setAttribute("aria-invalid", String(mismatch))
        setElementText(state, mismatch ? "hd.passphraseMismatch" : typed() ? "hd.passphraseMatch" : "hd.passphraseHint")
      }
      section.body.append(element("p", "hd-hint", "hd.passphraseBody"), first.wrap, second.wrap, state)
      return { wrap: section.wrap, fields: [first, second] as const, refresh }
    }

    // Create, step 1: an optional passphrase, then the words are made here.
    const showSetup = (): void => {
      const r = showStep(title, subtitle)
      appendDynamic(r.card, stepper(1))
      appendDynamic(r.card, element("p", "hd-hint", "hd.generateHint"))
      const section = createPassphrase()
      const generate = button("hd.generateCta")
      const sync = (): void => {
        passphrase = section.fields[0].input.value
        passphraseAgain = section.fields[1].input.value
        section.refresh()
        generate.disabled = passphrase !== passphraseAgain
      }
      section.fields.forEach((entry) => onInput(entry.input, sync))
      section.refresh()
      generate.disabled = passphrase !== passphraseAgain
      onClick(generate, () => {
        if (passphrase !== passphraseAgain) return
        if (words.length === 0) {
          const entropy = new Uint8Array(16)
          try { crypto.getRandomValues(entropy); words = hdWords(entropy).split(" ") } finally { entropy.fill(0) }
        }
        if (quiz.length === 0) quiz = makeHdQuiz(words)
        showBackup()
      })
      appendDynamic(r.card, section.wrap)
      appendDynamic(r.card, generate)
      appendDynamic(r.card, cancel())
    }

    // Create, step 2: the words, hidden until asked for.
    const showBackup = (): void => {
      const r = showStep(title, subtitle)
      appendDynamic(r.card, stepper(2))
      appendDynamic(r.card, element("p", "hd-step-title", i18nText("hd.backupTitle", { count: words.length })))
      appendDynamic(r.card, element("p", "hd-hint", "hd.backupBody"))
      const holder = element("div", "hd-backup")
      clearNode(holder)
      let copied = false
      const render = (hidden: boolean): void => {
        holder.textContent = ""
        const frame = element("div", "hd-words-frame")
        frame.append(wordGrid(words, { hidden }))
        if (hidden) {
          const overlay = element("div", "hd-reveal-overlay")
          const show = secondary(i18nText("hd.backupShow", { count: words.length }))
          show.classList.add("hd-inline")
          onClick(show, () => render(false))
          overlay.append(show, element("span", "hd-reveal-note", "hd.backupScreen"))
          frame.append(overlay)
          holder.append(frame)
          return
        }
        const tools = element("div", "hd-word-tools")
        const copy = secondary(copied ? "hd.backupCopied" : "hd.backupCopy")
        copy.classList.add("hd-inline")
        const generation = step
        onClick(copy, () => {
          // Explicit, user-requested clipboard write in this window; "Copied" only on success.
          void copyHdWords(words.join(" "), () => !settled && generation === step).then((written) => {
            if (!written || settled || generation !== step) return
            copied = true
            setElementText(copy, "hd.backupCopied")
          }, () => undefined)
        })
        const hide = secondary("hd.backupHide")
        hide.classList.add("hd-inline")
        onClick(hide, () => render(true))
        tools.append(copy, hide, element("span", "hd-hint", "hd.backupClipboard"))
        holder.append(frame, tools)
      }
      render(true)
      appendDynamic(r.card, holder)
      if (passphrase) appendDynamic(r.card, notice("warning", "hd.passphraseBackupReminder"))
      appendDynamic(r.card, notice("note", "hd.backupAgentNote"))
      const back = secondary("hd.back")
      onClick(back, () => { chosen = {}; showSetup() }, true)
      const next = button("hd.backupDone")
      onClick(next, () => showCheck(), true)
      appendDynamic(r.card, next)
      appendDynamic(r.card, back)
      appendDynamic(r.card, cancel())
    }

    // Create, step 3: three taps against the paper copy, then the wallet is created.
    const showCheck = (): void => {
      const r = showStep(title, subtitle)
      // The public table for exactly these words and passphrase, ready before the final click.
      accounts = reviewAccounts(words.join(" "), passphrase)
      appendDynamic(r.card, stepper(3))
      appendDynamic(r.card, element("p", "hd-step-title", "hd.checkTitle"))
      appendDynamic(r.card, element("p", "hd-hint", "hd.checkBody"))
      const problem = element("div", "hd-problem")
      const create = button("hd.createCta")
      create.classList.add("hd-gated")
      const refresh = (): void => {
        const wrong = quiz.find((question) => chosen[question.position] && chosen[question.position] !== question.answer)
        problem.textContent = ""
        if (wrong) problem.append(notice("error", i18nText("hd.checkWrong", { position: wrong.position }), i18nText("hd.checkWrongHint", { position: wrong.position })))
        create.disabled = finalizing || !quizPassed(quiz, chosen)
      }
      for (const question of quiz) {
        const group = element("div", "hd-quiz")
        group.setAttribute("role", "radiogroup")
        const label = element("span", "hd-field-label", i18nText("hd.checkWord", { position: question.position }))
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
            chosen = { ...chosen, [question.position]: word }
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
        clearNode(group)
        appendDynamic(r.card, group)
      }
      refresh()
      const progress = status()
      const again = secondary("hd.checkAgain")
      const cancelButton = cancel()
      onClick(again, () => { chosen = {}; accounts = []; showBackup() }, true)
      onClick(create, () => {
        if (create.disabled || !quizPassed(quiz, chosen)) return
        finish(r.card, cancelButton, progress, { words: words.join(" "), passphrase, reviewedAccounts: accounts })
      })
      appendDynamic(r.card, problem)
      appendDynamic(r.card, element("p", "hd-hint", "hd.passkeyNote"))
      appendDynamic(r.card, progress)
      appendDynamic(r.card, create)
      appendDynamic(r.card, again)
      appendDynamic(r.card, cancelButton)
    }

    // Import: one panel — the phrase checked word by word, the folded original passphrase, live #0.
    const showImport = (): void => {
      const r = showStep(title, subtitle)
      appendDynamic(r.card, element("p", "hd-hint", "hd.importHint"))
      const label = element("label", "hd-field")
      const caption = element("span", "hd-field-label", "hd.importLabel")
      const phrase = secretInput("textarea")
      phrase.rows = 3
      const placeholder = document.createElement("span")
      setElementText(placeholder, "hd.importPlaceholder")
      phrase.placeholder = placeholder.textContent ?? ""
      phrase.value = importText
      clearInput(phrase)
      label.append(caption, phrase)
      const words$ = element("div", "hd-import-words")
      const verdict = element("div", "hd-import-verdict")
      const passphraseHolder = element("div", "hd-import-passphrase")
      const preview = element("div", "hd-preview")
      for (const node of [words$, verdict, preview]) clearNode(node)
      const section = fold("hd.importPassphrase", () => "hd.importPassphraseFolded", Boolean(passphrase))
      const field = passphraseField("hd.passphraseLabel")
      field.input.value = passphrase
      clearInput(field.input)
      cleanups.push(field.hide)
      section.body.append(field.wrap, element("p", "hd-hint", "hd.importPassphraseHint"))
      passphraseHolder.append(section.wrap)
      const progress = status()
      const save = button("hd.importCta")
      const cancelButton = cancel()
      save.classList.add("hd-gated")
      let check: PhraseCheck = checkPhrase(importText)
      // The table shown is for exactly these inputs, or there is none: no stale #0 can be saved.
      let ready: { words: string; passphrase: string; accounts: HdPublicRow[] } | null = null
      let timer: ReturnType<typeof setTimeout> | undefined
      let previewGeneration = 0
      cleanups.push(() => { if (timer !== undefined) clearTimeout(timer); timer = undefined; previewGeneration += 1; ready = null })
      const current = (): { words: string; passphrase: string } | null =>
        check.ok ? { words: normalizeHdWords(check.words.join(" ")), passphrase } : null
      const renderVerdict = (): void => {
        verdict.textContent = ""
        const typed = normalizeWords(importText)
        words$.textContent = ""
        if (typed.length > 0) words$.append(wordGrid(typed, { bad: !check.ok && check.reason === "unknown-word" ? check.position - 1 : undefined }))
        else words$.append(element("p", "hd-hint", "hd.importLocal"))
        if (check.ok) {
          verdict.append(element("p", "hd-hint hd-ok", i18nText("hd.importOk", { count: check.words.length })))
        } else if (check.reason === "unknown-word") {
          const box = notice("error", i18nText("hd.importUnknown", { position: check.position, word: check.word }),
            ...(check.suggestions[0] ? [i18nText("hd.importDidYouMean", { word: check.suggestions[0] })] : []))
          if (check.suggestions.length > 0) {
            const row = element("div", "hd-suggestions")
            const position = check.position
            for (const suggestion of check.suggestions) {
              const use = secondary(i18nText("hd.importUse", { word: suggestion }))
              use.classList.add("hd-inline")
              onClick(use, () => {
                importText = normalizeWords(importText).map((word, index) => (index === position - 1 ? suggestion : word)).join(" ")
                phrase.value = importText
                update()
              })
              row.append(use)
            }
            box.append(row)
          }
          verdict.append(box)
        } else if (check.reason === "checksum") {
          verdict.append(notice("error", i18nText("hd.importChecksum", { count: typed.length }), "hd.importChecksumHint"))
        } else if (check.reason === "count") {
          verdict.append(notice("error", i18nText("hd.importCount", { count: check.count })))
        }
        passphraseHolder.hidden = !check.ok
      }
      const renderPreview = (): void => {
        preview.textContent = ""
        const want = current()
        save.disabled = finalizing || !ready || !want || ready.words !== want.words || ready.passphrase !== want.passphrase
        if (!ready || save.disabled) return
        const box = element("div", "hd-preview-box")
        const head = element("p", "hd-preview-title")
        head.append(element("span", "hd-account-index", i18nText("hd.accountIndex", { account: 0 })), element("span", "", "hd.importPreviewTitle"))
        box.append(head, addressRows(ready.accounts[0]), element("p", "hd-hint", "hd.btcTaprootInfo"), element("p", "hd-hint", "hd.importPreviewHint"))
        preview.append(box)
      }
      const schedule = (): void => {
        if (timer !== undefined) clearTimeout(timer)
        timer = undefined
        ready = null
        previewGeneration += 1
        renderPreview()
        const want = current()
        if (!want) return
        const generation = previewGeneration
        const owner = step
        timer = setTimeout(() => {
          timer = undefined
          if (settled || owner !== step || generation !== previewGeneration) return
          try {
            const table = reviewAccounts(want.words, want.passphrase)
            if (settled || owner !== step || generation !== previewGeneration) return
            ready = { ...want, accounts: table }
            renderPreview()
          } catch (error) { settle(() => reject(error)) }
        }, PREVIEW_DELAY_MS)
      }
      const update = (): void => {
        check = checkPhrase(importText)
        renderVerdict()
        schedule()
      }
      onInput(phrase, () => { importText = phrase.value; update() })
      onInput(field.input, () => { passphrase = field.input.value; schedule() })
      onClick(save, () => {
        const want = current()
        if (save.disabled || !want || !ready || ready.words !== want.words || ready.passphrase !== want.passphrase) return
        finish(r.card, cancelButton, progress, { words: want.words, passphrase: want.passphrase, reviewedAccounts: ready.accounts })
      })
      update()
      appendDynamic(r.card, label)
      appendDynamic(r.card, words$)
      appendDynamic(r.card, verdict)
      appendDynamic(r.card, passphraseHolder)
      appendDynamic(r.card, preview)
      appendDynamic(r.card, element("p", "hd-hint", "hd.passkeyNote"))
      appendDynamic(r.card, progress)
      appendDynamic(r.card, save)
      appendDynamic(r.card, cancelButton)
    }

    try {
      if (request.mode === "create") showSetup()
      else showImport()
    } catch (error) { settle(() => reject(error)) }
  })

export type { HdAuthorizationRequest, HdFinalize }
