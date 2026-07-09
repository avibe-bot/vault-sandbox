import {
  deriveSigningAddresses,
  generateSigningKey,
  importSigningKey,
  type SigningAddresses,
} from "./vaultCrypto"
import {
  bindPlaceholder,
  bindText,
  setRawPlaceholder,
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

function setElementPlaceholder(element: HTMLInputElement | HTMLTextAreaElement, value: TextSpec): void {
  if (typeof value === "string") {
    bindPlaceholder(element, value)
    return
  }
  if ("text" in value) {
    setRawPlaceholder(element, value.text)
    return
  }
  bindPlaceholder(element, value.key, value.params)
}

export function showCard(titleText: TextSpec, subtitleText: TextSpec, bodyText: TextSpec): CardRefs {
  const r = refs()
  document.body.classList.add("interactive")
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

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
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

export type SealInput =
  | { kind: "static"; value: Uint8Array }
  | { kind: "keypair"; value: Uint8Array; publicKey: string; addresses: SigningAddresses }

export function promptSealInput(input: { name: string; kind: "static" | "keypair" }): Promise<SealInput> {
  return runExclusiveOperation((signal) => {
    const r = showCard(
      input.kind === "keypair" ? "seal.keypairTitle" : "seal.staticTitle",
      "seal.subtitle",
      input.kind === "keypair" ? "seal.keypairBody" : "seal.staticBody",
    )
    const message = status()
    appendDynamic(r.card, message)

    return new Promise<SealInput>((resolve, reject) => {
      const cancelPending = (): void => {
        hideCard()
        reject(abortReason(signal))
      }
      if (signal.aborted) {
        cancelPending()
        return
      }
      signal.addEventListener("abort", cancelPending, { once: true })
      const settle = (callback: () => void): void => {
        signal.removeEventListener("abort", cancelPending)
        callback()
      }

      if (input.kind === "keypair") {
        const privateKey = document.createElement("input")
        privateKey.className = "field dynamic"
        privateKey.type = "password"
        privateKey.autocomplete = "off"
        setElementPlaceholder(privateKey, "seal.privateKeyPlaceholder")
        const generate = button("seal.generateAndSealKey")
        const sealImported = button("seal.sealPastedKey")
        appendDynamic(r.card, privateKey)
        appendDynamic(r.card, generate)
        appendDynamic(r.card, sealImported)

        const finish = (key: ReturnType<typeof generateSigningKey>) => {
          privateKey.value = ""
          settle(() => {
            hideCard()
            resolve({ kind: "keypair", value: key.privateKey, publicKey: key.publicKey, addresses: deriveSigningAddresses(key.publicKey) })
          })
        }
        generate.addEventListener("click", () => finish(generateSigningKey()))
        sealImported.addEventListener("click", () => {
          try {
            const key = importSigningKey(privateKey.value.trim())
            finish(key)
          } catch {
            setElementText(message, "seal.invalidPrivateKey")
          }
        })
        return
      }

      const area = document.createElement("textarea")
      area.className = "field textarea dynamic"
      area.autocomplete = "off"
      area.spellcheck = false
      setElementPlaceholder(area, rawText(input.name))
      const seal = button("seal.sealValue")
      const cancel = button("common.cancel")
      cancel.classList.add("secondary")
      appendDynamic(r.card, area)
      appendDynamic(r.card, seal)
      appendDynamic(r.card, cancel)
      seal.addEventListener("click", () => {
        const value = utf8(area.value)
        area.value = ""
        settle(() => {
          hideCard()
          resolve({ kind: "static", value })
        })
      })
      cancel.addEventListener("click", () => {
        settle(() => {
          hideCard()
          reject(new Error("operation-cancelled"))
        })
      })
    })
  })
}

export async function presentPlaintext(input: { name: string; plaintext: Uint8Array; mode: "sandbox-display" | "sandbox-copy" }): Promise<void> {
  return runExclusiveOperation(async (signal) => {
    const text = new TextDecoder().decode(input.plaintext)
    const r = showCard(input.mode === "sandbox-copy" ? "plaintext.copyTitle" : "plaintext.title", rawText(input.name), "plaintext.body")
    const output = document.createElement("pre")
    output.className = "plaintext dynamic"
    output.textContent = text
    const done = button("common.done")
    appendDynamic(r.card, output)
    if (input.mode === "sandbox-copy") {
      await navigator.clipboard.writeText(text)
      setElementText(r.body, "plaintext.copiedBody")
    }
    appendDynamic(r.card, done)
    await new Promise<void>((resolve, reject) => {
      const cancelPending = (): void => {
        hideCard()
        reject(abortReason(signal))
      }
      if (signal.aborted) {
        cancelPending()
        return
      }
      signal.addEventListener("abort", cancelPending, { once: true })
      done.addEventListener(
        "click",
        () => {
          signal.removeEventListener("abort", cancelPending)
          resolve()
        },
        { once: true },
      )
    })
    hideCard()
  })
}

export function confirmOperationInActiveSlot(
  input: { title: TextSpec; subtitle: TextSpec; body: TextSpec; confirmLabel: TextSpec },
  signal: AbortSignal,
): Promise<void> {
  const r = showCard(input.title, input.subtitle, input.body)
  const confirm = button(input.confirmLabel)
  const cancel = button("common.cancel")
  cancel.classList.add("secondary")
  appendDynamic(r.card, confirm)
  appendDynamic(r.card, cancel)
  return new Promise((resolve, reject) => {
    const cancelPending = (): void => {
      hideCard()
      reject(abortReason(signal))
    }
    if (signal.aborted) {
      cancelPending()
      return
    }
    signal.addEventListener("abort", cancelPending, { once: true })
    const settle = (callback: () => void): void => {
      signal.removeEventListener("abort", cancelPending)
      hideCard()
      callback()
    }
    confirm.addEventListener(
      "click",
      () => {
        settle(resolve)
      },
      { once: true },
    )
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
