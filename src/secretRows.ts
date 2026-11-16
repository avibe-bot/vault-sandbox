import { t } from "./i18n"
import { appendDynamic, button, hideCard, i18nText, rawText, runExclusiveOperation, setElementText, showCard, status } from "./operationUi"

/** One field of a protected secret, shown in the secure window. */
export type SecretRow = {
  /** The field name; undefined for an unlabelled default field. */
  label: string | undefined
  value: Uint8Array
  /** Strict: a passkey check before this row's Copy. */
  prepareCopy?: (signal: AbortSignal) => Promise<void>
}

const MASK = "••••••••"

function abortReason(signal: AbortSignal): Error {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason
  return reason instanceof Error ? reason : new Error("operation-superseded")
}

/**
 * The whole secret in this window: one row per field, each with Copy. A single
 * value is shown at once; several are hidden until that row's Show. A hidden
 * value is never in the DOM, and Copy works without showing it. Resolves on
 * Done; every value buffer is wiped when the window settles.
 */
export function presentSecretRows(input: { name: string; rows: SecretRow[]; abortSignal?: AbortSignal; clipboard?: (text: string) => Promise<void> }): Promise<void> {
  return runExclusiveOperation(async (signal) => {
    try {
      if (signal.aborted) throw abortReason(signal)
      if (input.abortSignal?.aborted) throw abortReason(input.abortSignal)
      const single = input.rows.length === 1
      const r = showCard(single ? "plaintext.title" : "plaintext.secretTitle", rawText(input.name), "plaintext.body")
      const list = document.createElement("div")
      list.className = "secret-rows"
      const warning = status("plaintext.copyWarning")
      warning.setAttribute("role", "status")
      const write = input.clipboard ?? ((text: string) => navigator.clipboard.writeText(text))
      const copyButtons: Array<{ node: HTMLButtonElement; reset: () => void }> = []
      let settled = false
      let busy = false
      const controllers = new Set<AbortController>()
      const decode = (row: SecretRow): string => new TextDecoder().decode(row.value)

      for (const row of input.rows) {
        const item = document.createElement("div")
        item.className = "secret-row"
        const name = row.label ?? t("plaintext.valueLabel")
        const label = document.createElement("span")
        label.className = "secret-row-label"
        label.textContent = name
        const value = document.createElement("pre")
        value.className = "secret-row-value plaintext"
        let shown = single
        const render = (): void => {
          value.textContent = ""
          if (shown) {
            value.textContent = decode(row)
            value.classList.remove("secret-row-hidden")
            return
          }
          // The bullets are decoration; assistive technology reads "Hidden".
          const mask = document.createElement("span")
          mask.setAttribute("aria-hidden", "true")
          mask.textContent = MASK
          const spoken = document.createElement("span")
          spoken.className = "secret-row-spoken"
          spoken.textContent = t("plaintext.hiddenValue")
          value.append(mask, spoken)
          value.classList.add("secret-row-hidden")
        }
        render()
        const actions = document.createElement("div")
        actions.className = "secret-row-actions"
        if (!single) {
          const toggle = button("plaintext.show")
          toggle.classList.add("secondary", "secret-row-button")
          toggle.setAttribute("aria-label", t("plaintext.showRow", { label: name }))
          toggle.addEventListener("click", () => {
            if (settled) return
            shown = !shown
            render()
            setElementText(toggle, shown ? "plaintext.hide" : "plaintext.show")
            toggle.setAttribute("aria-label", t(shown ? "plaintext.hideRow" : "plaintext.showRow", { label: name }))
          })
          actions.append(toggle)
        }
        const copy = button("plaintext.copy")
        copy.classList.add("secondary", "secret-row-button")
        copy.setAttribute("aria-label", t("plaintext.copyRow", { label: name }))
        let prepared = !row.prepareCopy
        copyButtons.push({ node: copy, reset: () => setElementText(copy, "plaintext.copy") })
        copy.addEventListener("click", () => {
          if (settled || busy) return
          busy = true
          copy.disabled = true
          const controller = new AbortController()
          controllers.add(controller)
          const attempt = row.prepareCopy && !prepared
            ? row.prepareCopy(controller.signal).then(() => {
                if (controller.signal.aborted || settled) return
                prepared = true
                setElementText(warning, single ? "plaintext.copyReady" : i18nText("plaintext.copyReadyRow", { label: name }))
              })
            : write(decode(row)).then(() => {
                if (controller.signal.aborted || settled) return
                if (row.prepareCopy) prepared = false
                for (const other of copyButtons) other.reset()
                setElementText(copy, "plaintext.copied")
                setElementText(warning, "plaintext.copiedBody")
              })
          void attempt.then(
            () => undefined,
            () => { if (!controller.signal.aborted && !settled) setElementText(warning, "plaintext.copyFailed") },
          ).finally(() => {
            controllers.delete(controller)
            busy = false
            if (!settled) copy.disabled = false
          })
        })
        actions.append(copy)
        item.append(label, value, actions)
        list.append(item)
      }
      const done = button("common.done")
      appendDynamic(r.card, list)
      appendDynamic(r.card, warning)
      appendDynamic(r.card, done)

      await new Promise<void>((resolve, reject) => {
        const settle = (callback: () => void): void => {
          if (settled) return
          settled = true
          for (const controller of controllers) controller.abort(new Error("operation-superseded"))
          signal.removeEventListener("abort", onAbort)
          input.abortSignal?.removeEventListener("abort", onExternalAbort)
          callback()
        }
        const onAbort = (): void => settle(() => reject(abortReason(signal)))
        const onExternalAbort = (): void => settle(() => reject(abortReason(input.abortSignal!)))
        signal.addEventListener("abort", onAbort, { once: true })
        input.abortSignal?.addEventListener("abort", onExternalAbort, { once: true })
        done.addEventListener("click", () => settle(resolve), { once: true })
      })
    } finally {
      for (const row of input.rows) row.value.fill(0)
      hideCard()
    }
  })
}
