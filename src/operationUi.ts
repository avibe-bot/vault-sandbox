import {
  bindText,
  setRawText,
  type I18nKey,
  type I18nParams,
} from "./i18n"
import { renderPolicyDowngradeReview } from "./signingPolicyUi"
import { renderSigningReview, type SigningReview } from "./signingReview"
import type { PolicyDowngradeContext } from "./signingPolicyDowngrade"

export type TextSpec = I18nKey | { key: I18nKey; params?: I18nParams } | { text: string }

export type ConfirmationDetailRow =
  | { label: TextSpec; value: TextSpec; variant?: "text" | "command" | "mono" }
  | { label: TextSpec; values: TextSpec[]; variant: "chips"; tone?: "default" | "warning" }

export type ConfirmationDetails = {
  rows: ConfirmationDetailRow[]
}

export type ConfirmationGuardLease = {
  ready: Promise<void>
  assertCurrent: () => void
  dispose: () => void
}

/** Lets a guard take Confirm back out of the armed state (and give it back) after it first armed. */
export type ConfirmationArming = { setArmed: (armed: boolean) => void }

type CardRefs = {
  title: HTMLElement
  subtitle: HTMLElement
  body: HTMLElement
  card: HTMLElement
  scroll: HTMLElement
  footer: HTMLElement
}

let uiEventSink: ((event: "ui.show" | "ui.hide") => void) | null = null
let uiShowPendingUntil = 0

export function setUiEventSink(sink: ((event: "ui.show" | "ui.hide") => void) | null): void {
  uiEventSink = sink
}

export function hasPendingUiShow(): boolean {
  return Date.now() < uiShowPendingUntil
}

function emitUiShow(): void {
  uiShowPendingUntil = Date.now() + 150
  uiEventSink?.("ui.show")
}

function emitUiHide(): void {
  uiShowPendingUntil = 0
  uiEventSink?.("ui.hide")
}

function refs(): CardRefs {
  const page = document.getElementById("page")
  const card = page?.querySelector(".card")
  const title = page?.querySelector("h1")
  const subtitle = page?.querySelector(".sub")
  const body = page?.querySelector(".body")
  const scroll = page?.querySelector(".card-scroll")
  const footer = page?.querySelector(".card-footer")
  if (!card || !title || !subtitle || !body || !scroll || !footer) {
    throw new Error("sandbox UI is unavailable")
  }
  return {
    card: card as HTMLElement,
    title: title as HTMLElement,
    subtitle: subtitle as HTMLElement,
    body: body as HTMLElement,
    scroll: scroll as HTMLElement,
    footer: footer as HTMLElement,
  }
}

function clearDynamic(card: Element): void {
  card.querySelectorAll(".dynamic").forEach((node) => node.remove())
}

export function rawText(text: string): TextSpec {
  return { text }
}

export function i18nText(key: I18nKey, params?: I18nParams): TextSpec {
  return { key, params }
}

export function setElementText(element: HTMLElement, value: TextSpec): void {
  if (typeof value === "string") {
    bindText(element, value)
    return
  }
  if ("text" in value) {
    setRawText(element, value.text)
    return
  }
  bindText(element, value.key, value.params)
}

export function showCard(titleText: TextSpec, subtitleText: TextSpec, bodyText?: TextSpec): CardRefs {
  const r = refs()
  document.body.classList.add("interactive")
  document.body.classList.remove("confirming")
  emitUiShow()
  r.card.classList.remove("confirm-card")
  setElementText(r.title, titleText)
  setElementText(r.subtitle, subtitleText)
  bodyText ? setElementText(r.body, bodyText) : setRawText(r.body, "")
  clearDynamic(r.card)
  return r
}

export function hideCard(): void {
  document.body.classList.remove("interactive")
  document.body.classList.remove("confirming")
  const card = document.getElementById("page")?.querySelector(".card")
  if (card) {
    card.classList.remove("confirm-card")
    clearDynamic(card)
  }
  emitUiHide()
}

export function appendDynamic(card: Element, node: Node): void {
  node instanceof HTMLElement && node.classList.add("dynamic")
  const target = card.querySelector(".card-scroll") ?? card
  target.append(node)
}

export function appendFooterDynamic(card: Element, node: Node): void {
  node instanceof HTMLElement && node.classList.add("dynamic")
  const footer = card.querySelector(".card-footer")
  if (!footer) throw new Error("sandbox confirmation footer is unavailable")
  footer.append(node)
}

function detailValue(row: ConfirmationDetailRow): HTMLElement {
  const value = document.createElement("div")
  value.className = "detail-value"
  if (row.variant === "chips") {
    value.classList.add("detail-chips")
    for (const item of row.values) {
      const chip = document.createElement("span")
      chip.className = `detail-chip${row.tone === "warning" ? " detail-chip-warning" : ""}`
      setElementText(chip, item)
      value.append(chip)
    }
    return value
  }

  const content = document.createElement(row.variant === "command" ? "code" : "span")
  content.className = row.variant === "command" ? "detail-command" : row.variant === "mono" ? "detail-mono" : "detail-text"
  setElementText(content, row.value)
  if (row.variant === "mono") content.title = content.textContent ?? ""
  value.append(content)
  return value
}

function confirmationDetailRows(details: ConfirmationDetails): HTMLElement {
  const list = document.createElement("div")
  list.className = "confirmation-details"
  for (const detail of details.rows) {
    const row = document.createElement("div")
    row.className = "detail-row"
    const label = document.createElement("span")
    label.className = "detail-label"
    setElementText(label, detail.label)
    row.append(label, detailValue(detail))
    list.append(row)
  }
  return list
}

function renderConfirmationDetails(body: HTMLElement, details: ConfirmationDetails, note?: TextSpec): void {
  setRawText(body, "")
  body.append(confirmationDetailRows(details))
  if (note) {
    const noteElement = document.createElement("p")
    noteElement.className = "confirmation-note"
    setElementText(noteElement, note)
    body.append(noteElement)
  }
}

export function button(label: TextSpec): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "action dynamic"
  setElementText(btn, label)
  return btn
}

export function status(text: TextSpec = rawText("")): HTMLParagraphElement {
  const el = document.createElement("p")
  el.className = "setup-status dynamic"
  setElementText(el, text)
  return el
}

let activeOperation: AbortController | null = null

function operationSupersededError(): Error {
  return new Error("operation-superseded")
}

function abortReason(signal: AbortSignal): Error {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason
  return reason instanceof Error ? reason : operationSupersededError()
}


export function runExclusiveOperation<T>(executor: (signal: AbortSignal) => Promise<T> | T): Promise<T> {
  activeOperation?.abort(operationSupersededError())
  const controller = new AbortController()
  activeOperation = controller
  return Promise.resolve()
    .then(() => executor(controller.signal))
    .finally(() => {
      if (activeOperation === controller) activeOperation = null
    })
}

export function confirmOperationInActiveSlot(
  input: {
    title: TextSpec
    subtitle: TextSpec
    body?: TextSpec
    details?: ConfirmationDetails
    /** Structured policy authorization. It replaces all other body/review content. */
    policyDowngrade?: PolicyDowngradeContext
    /** Structured signing review. It replaces `body`, so a notice is never shown twice. */
    review?: SigningReview
    /** With `review`: the requesting session's label from the signed request context. */
    reviewSession?: string
    confirmLabel: TextSpec
  },
  signal: AbortSignal,
  guard?: (target: HTMLElement, arming: ConfirmationArming) => ConfirmationGuardLease,
  activate?: () => Promise<void>,
): Promise<void> {
  const r = showCard(input.title, input.subtitle, input.review ? undefined : input.body)
  document.body.classList.add("confirming")
  r.card.classList.add("confirm-card")
  if (input.policyDowngrade) {
    renderPolicyDowngradeReview(r.body, input.policyDowngrade)
  } else if (input.review) {
    renderSigningReview(r.body, input.review, {
      session: input.reviewSession,
      rows: input.details && confirmationDetailRows(input.details),
    })
  } else if (input.details) renderConfirmationDetails(r.body, input.details, input.body)
  const confirm = button(input.confirmLabel)
  const cancel = button("common.cancel")
  cancel.classList.add("secondary")
  appendFooterDynamic(r.card, cancel)
  appendFooterDynamic(r.card, confirm)
  confirm.disabled = true
  return new Promise((resolve, reject) => {
    let settled = false
    let guardLease: ConfirmationGuardLease | undefined
    let readyDone = false
    let held = true
    const arming: ConfirmationArming = {
      setArmed: (armed) => {
        held = armed
        if (readyDone && !settled && !signal.aborted) confirm.disabled = !held
      },
    }
    const enableTimer = setTimeout(() => {
      try {
        guardLease = guard?.(r.card, arming)
      } catch (error) {
        settle(() => reject(error))
        return
      }
      const ready = guardLease?.ready ?? Promise.resolve()
      void ready.then(
        () => {
          readyDone = true
          if (!settled && !signal.aborted) confirm.disabled = !held
        },
        (error: unknown) => settle(() => reject(error)),
      )
    }, 500)
    const cancelPending = (): void => {
      settle(() => reject(abortReason(signal)))
    }
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(enableTimer)
      guardLease?.dispose()
      signal.removeEventListener("abort", cancelPending)
      hideCard()
      callback()
    }
    if (signal.aborted) {
      cancelPending()
      return
    }
    signal.addEventListener("abort", cancelPending, { once: true })
    confirm.addEventListener("click", () => {
      if (confirm.disabled) return
      confirm.disabled = true
      cancel.disabled = true
      let activation: Promise<void>
      try {
        guardLease?.assertCurrent()
        // Evaluate activate() directly in the click handler so mobile browsers
        // retain the transient user activation required by WebAuthn.
        activation = activate ? activate() : Promise.resolve()
      } catch (error) {
        settle(() => reject(error))
        return
      }
      void activation.then(
        () => settle(resolve),
        (error: unknown) => settle(() => reject(error)),
      )
    })
    cancel.addEventListener(
      "click",
      () => {
        settle(() => reject(new Error("operation-cancelled")))
      },
      { once: true },
    )
  })
}

export function confirmOperation(input: {
  title: TextSpec
  subtitle: TextSpec
  body?: TextSpec
  details?: ConfirmationDetails
  confirmLabel: TextSpec
}): Promise<void> {
  return runExclusiveOperation((signal) => confirmOperationInActiveSlot(input, signal))
}
