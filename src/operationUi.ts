import {
  bindText,
  setRawText,
  type I18nKey,
  type I18nParams,
} from "./i18n"

export type TextSpec = I18nKey | { key: I18nKey; params?: I18nParams } | { text: string }

type CardRefs = {
  title: HTMLElement
  subtitle: HTMLElement
  body: HTMLElement
  card: Element
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
  if (!card || !title || !subtitle || !body) {
    throw new Error("sandbox UI is unavailable")
  }
  return { card, title: title as HTMLElement, subtitle: subtitle as HTMLElement, body: body as HTMLElement }
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

export function showCard(titleText: TextSpec, subtitleText: TextSpec, bodyText: TextSpec): CardRefs {
  const r = refs()
  document.body.classList.add("interactive")
  emitUiShow()
  setElementText(r.title, titleText)
  setElementText(r.subtitle, subtitleText)
  setElementText(r.body, bodyText)
  clearDynamic(r.card)
  return r
}

export function hideCard(): void {
  document.body.classList.remove("interactive")
  const card = document.getElementById("page")?.querySelector(".card")
  if (card) clearDynamic(card)
  emitUiHide()
}

export function appendDynamic(card: Element, node: Node): void {
  node instanceof HTMLElement && node.classList.add("dynamic")
  card.append(node)
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

export async function presentPlaintext(input: {
  name: string
  plaintext: Uint8Array
  onCopy?: (text: string, signal: AbortSignal) => Promise<void>
}): Promise<void> {
  return runExclusiveOperation(async (signal) => {
    const text = new TextDecoder().decode(input.plaintext)
    const r = showCard("plaintext.title", rawText(input.name), "plaintext.body")
    const output = document.createElement("pre")
    output.className = "plaintext dynamic"
    output.textContent = text
    const done = button("common.done")
    const copy = button("plaintext.copy")
    copy.classList.add("secondary")
    const warning = status("plaintext.copyWarning")
    appendDynamic(r.card, output)
    appendDynamic(r.card, warning)
    appendDynamic(r.card, copy)
    appendDynamic(r.card, done)
    try {
      await new Promise<void>((resolve, reject) => {
        const cancelPending = (): void => {
          reject(abortReason(signal))
        }
        if (signal.aborted) {
          cancelPending()
          return
        }
        signal.addEventListener("abort", cancelPending, { once: true })
        copy.addEventListener("click", () => {
          copy.disabled = true
          const copied = input.onCopy ? input.onCopy(text, signal) : navigator.clipboard.writeText(text)
          void copied.then(
            () => {
              setElementText(warning, "plaintext.copiedBody")
              copy.disabled = false
            },
            (error: unknown) => {
              copy.disabled = false
              reject(error)
            },
          )
        })
        done.addEventListener(
          "click",
          () => {
            signal.removeEventListener("abort", cancelPending)
            resolve()
          },
          { once: true },
        )
      })
    } finally {
      hideCard()
    }
  })
}

export function confirmOperationInActiveSlot(
  input: { title: TextSpec; subtitle: TextSpec; body: TextSpec; confirmLabel: TextSpec },
  signal: AbortSignal,
  guard?: () => Promise<void>,
): Promise<void> {
  const r = showCard(input.title, input.subtitle, input.body)
  const confirm = button(input.confirmLabel)
  const cancel = button("common.cancel")
  cancel.classList.add("secondary")
  appendDynamic(r.card, confirm)
  appendDynamic(r.card, cancel)
  confirm.disabled = true
  const enableTimer = setTimeout(() => {
    confirm.disabled = false
  }, 500)
  return new Promise((resolve, reject) => {
    let settled = false
    const cancelPending = (): void => {
      clearTimeout(enableTimer)
      hideCard()
      reject(abortReason(signal))
    }
    if (signal.aborted) {
      cancelPending()
      return
    }
    signal.addEventListener("abort", cancelPending, { once: true })
    const settle = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(enableTimer)
      signal.removeEventListener("abort", cancelPending)
      hideCard()
      callback()
    }
    confirm.addEventListener("click", () => {
      if (confirm.disabled) return
      confirm.disabled = true
      const ready = guard ? guard() : Promise.resolve()
      void ready.then(
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

export function confirmOperation(input: { title: TextSpec; subtitle: TextSpec; body: TextSpec; confirmLabel: TextSpec }): Promise<void> {
  return runExclusiveOperation((signal) => confirmOperationInActiveSlot(input, signal))
}
