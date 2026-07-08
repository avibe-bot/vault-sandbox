import {
  deriveSigningAddresses,
  generateSigningKey,
  importSigningKey,
  type SigningAddresses,
} from "./vaultCrypto"

type CardRefs = {
  title: HTMLElement
  subtitle: HTMLElement
  body: HTMLElement
  origin: HTMLElement | null
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
  return { card, title: title as HTMLElement, subtitle: subtitle as HTMLElement, body: body as HTMLElement, origin: document.getElementById("origin") }
}

function clearDynamic(card: Element): void {
  card.querySelectorAll(".dynamic").forEach((node) => node.remove())
}

export function showCard(titleText: string, subtitleText: string, bodyText: string): CardRefs {
  const r = refs()
  document.body.classList.add("interactive")
  r.title.textContent = titleText
  r.subtitle.textContent = subtitleText
  r.body.textContent = bodyText
  clearDynamic(r.card)
  return r
}

export function hideCard(): void {
  document.body.classList.remove("interactive")
  const card = document.getElementById("page")?.querySelector(".card")
  if (card) clearDynamic(card)
}

export function insertBeforeOrigin(card: Element, origin: HTMLElement | null, node: Node): void {
  node instanceof HTMLElement && node.classList.add("dynamic")
  card.insertBefore(node, origin)
}

export function button(label: string): HTMLButtonElement {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "action dynamic"
  btn.textContent = label
  return btn
}

export function status(text = ""): HTMLParagraphElement {
  const el = document.createElement("p")
  el.className = "setup-status dynamic"
  el.textContent = text
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
      input.kind === "keypair" ? "Create signing key" : "Seal protected value",
      "Sandbox-owned input",
      input.kind === "keypair"
        ? "Generate a fresh key here, or paste a private key. The private key never leaves this sandbox."
        : "Enter the protected value here. It will be encrypted before Avibe receives anything.",
    )
    const message = status()
    insertBeforeOrigin(r.card, r.origin, message)

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
        privateKey.placeholder = "Optional 32-byte private key hex"
        const generate = button("Generate and seal key")
        const sealImported = button("Seal pasted key")
        insertBeforeOrigin(r.card, r.origin, privateKey)
        insertBeforeOrigin(r.card, r.origin, generate)
        insertBeforeOrigin(r.card, r.origin, sealImported)

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
          } catch (error) {
            message.textContent = error instanceof Error ? error.message : "invalid private key"
          }
        })
        return
      }

      const area = document.createElement("textarea")
      area.className = "field textarea dynamic"
      area.autocomplete = "off"
      area.spellcheck = false
      area.placeholder = input.name
      const seal = button("Seal value")
      const cancel = button("Cancel")
      cancel.classList.add("secondary")
      insertBeforeOrigin(r.card, r.origin, area)
      insertBeforeOrigin(r.card, r.origin, seal)
      insertBeforeOrigin(r.card, r.origin, cancel)
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
    const r = showCard(input.mode === "sandbox-copy" ? "Copy protected value" : "Protected value", input.name, "The plaintext is visible only in this sandbox frame.")
    const output = document.createElement("pre")
    output.className = "plaintext dynamic"
    output.textContent = text
    const done = button("Done")
    insertBeforeOrigin(r.card, r.origin, output)
    if (input.mode === "sandbox-copy") {
      await navigator.clipboard.writeText(text)
      r.body.textContent = "Copied from the sandbox frame. The plaintext was not returned to Avibe."
    }
    insertBeforeOrigin(r.card, r.origin, done)
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
  input: { title: string; subtitle: string; body: string; confirmLabel: string },
  signal: AbortSignal,
): Promise<void> {
  const r = showCard(input.title, input.subtitle, input.body)
  const confirm = button(input.confirmLabel)
  const cancel = button("Cancel")
  cancel.classList.add("secondary")
  insertBeforeOrigin(r.card, r.origin, confirm)
  insertBeforeOrigin(r.card, r.origin, cancel)
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

export function confirmOperation(input: { title: string; subtitle: string; body: string; confirmLabel: string }): Promise<void> {
  return runExclusiveOperation((signal) => confirmOperationInActiveSlot(input, signal))
}
