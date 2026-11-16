import { t } from "./i18n"
import { eyeIcon, secretInput } from "./protectedHdUi"
import { appendDynamic, appendFooterDynamic, button, hideCard, rawText, runExclusiveOperation, setElementText, showCard, status } from "./operationUi"
import { generateSecretValue, type GenerateRecipe } from "./secretGenerate"

/** One field of the secret being entered. Everything here is display or input, never authority. */
export type SecretInputRow = {
  /** The field name, shown as plain text ("value" reads as Value). */
  label: string
  /** The secret's default field (its record is the secret's own name). */
  isDefault?: boolean
  /** Empty is refused. A non-required row left empty keeps the current value (edit). */
  required: boolean
  /** Offers Generate in this window with exactly this recipe. */
  generate?: GenerateRecipe
}

/** What the person entered for one row: null only for a non-required row left empty. */
export type SecretInputValue = { value: string | null; generated: boolean }

function abortReason(signal: AbortSignal): Error {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason
  return reason instanceof Error ? reason : new Error("operation-superseded")
}

/**
 * The values of one protected secret, typed or generated in this secure window
 * and handed only to this window's own sandbox. Save stays closed, with the
 * reason shown, until every required row has a value. Every input is cleared
 * whenever the card settles.
 */
export function collectSecretValues(input: { name: string; mode: "create" | "edit"; rows: SecretInputRow[]; abortSignal?: AbortSignal; random?: (bytes: Uint8Array) => void }): Promise<SecretInputValue[]> {
  return runExclusiveOperation(async (signal) => {
    const fields: Array<{ input: HTMLInputElement; generated: boolean }> = []
    try {
      if (signal.aborted) throw abortReason(signal)
      if (input.abortSignal?.aborted) throw abortReason(input.abortSignal)
      const r = showCard(input.mode === "create" ? "input.createTitle" : "input.editTitle", rawText(input.name), input.mode === "create" ? "input.body" : "input.editBody")
      r.card.classList.add("confirm-card")
      const list = document.createElement("div")
      list.className = "secret-input-rows"
      const save = button("input.save")
      const cancel = button("common.cancel")
      cancel.classList.add("secondary")
      const reason = status()
      reason.classList.add("secret-status")
      reason.setAttribute("role", "status")
      const refresh = (): void => {
        const missing = input.rows.some((row, index) => row.required && fields[index].input.value === "")
        save.disabled = missing
        if (missing) setElementText(reason, "input.fillAll")
        else reason.textContent = ""
      }
      for (const [index, row] of input.rows.entries()) {
        const id = `secret-input-${index}`
        const wrap = document.createElement("div")
        wrap.className = "hd-field secret-input-row"
        const head = document.createElement("div")
        head.className = "secret-input-head"
        const caption = document.createElement("label")
        caption.className = "hd-field-label"
        caption.htmlFor = id
        caption.textContent = row.label === "value" ? t("plaintext.valueLabel") : row.label
        if (row.isDefault && input.rows.length > 1) {
          const tag = document.createElement("span")
          tag.className = "secret-input-default"
          setElementText(tag, "input.defaultTag")
          caption.append(" ", tag)
        }
        const badge = document.createElement("span")
        badge.className = "secret-input-generated"
        badge.hidden = true
        setElementText(badge, "input.generated")
        head.append(caption, badge)
        const line = document.createElement("div")
        line.className = "hd-secret-row"
        const field = secretInput("input")
        field.id = id
        // A new value for this secret: no saved credential is ever filled in here.
        field.setAttribute("autocomplete", "new-password")
        field.setAttribute("aria-required", String(row.required))
        if (!row.required) field.placeholder = t("input.keepPlaceholder")
        const entry = { input: field, generated: false }
        fields.push(entry)
        const toggle = document.createElement("button")
        toggle.type = "button"
        toggle.className = "hd-reveal"
        toggle.setAttribute("aria-controls", id)
        const toggleName = document.createElement("span")
        toggleName.className = "hd-reveal-label"
        const render = (shown: boolean): void => {
          field.type = shown ? "text" : "password"
          toggle.setAttribute("aria-pressed", String(shown))
          setElementText(toggleName, shown ? "hd.hideValue" : "hd.showValue")
          toggle.textContent = ""
          toggle.append(eyeIcon(shown), toggleName)
        }
        render(false)
        toggle.addEventListener("click", () => render(field.type === "password"))
        field.addEventListener("input", () => {
          // Typing over a generated value makes it the person's own.
          entry.generated = false
          badge.hidden = true
          refresh()
        })
        line.append(field, toggle)
        if (row.generate) {
          const recipe = row.generate
          const generate = button("input.generate")
          generate.classList.add("secondary", "secret-row-button")
          generate.setAttribute("aria-label", t("input.generateRow", { label: caption.textContent ?? row.label }))
          generate.addEventListener("click", () => {
            field.value = generateSecretValue(recipe, input.random)
            entry.generated = true
            badge.hidden = false
            refresh()
          })
          line.append(generate)
        }
        wrap.append(head, line)
        list.append(wrap)
      }
      appendDynamic(r.card, list)
      appendDynamic(r.card, reason)
      appendFooterDynamic(r.card, cancel)
      appendFooterDynamic(r.card, save)
      refresh()

      return await new Promise<SecretInputValue[]>((resolve, reject) => {
        let settled = false
        const settle = (callback: () => void): void => {
          if (settled) return
          settled = true
          signal.removeEventListener("abort", onAbort)
          input.abortSignal?.removeEventListener("abort", onExternalAbort)
          callback()
        }
        const onAbort = (): void => settle(() => reject(abortReason(signal)))
        const onExternalAbort = (): void => settle(() => reject(abortReason(input.abortSignal!)))
        signal.addEventListener("abort", onAbort, { once: true })
        input.abortSignal?.addEventListener("abort", onExternalAbort, { once: true })
        cancel.addEventListener("click", () => settle(() => reject(new Error("operation-cancelled"))), { once: true })
        save.addEventListener("click", () => {
          if (save.disabled || settled) return
          const values = fields.map((entry, index) => {
            const value = entry.input.value
            if (value === "" && input.rows[index].required) return undefined
            return { value: value === "" ? null : value, generated: value !== "" && entry.generated }
          })
          if (values.some((value) => value === undefined)) { refresh(); return }
          settle(() => resolve(values as SecretInputValue[]))
        })
      })
    } finally {
      for (const entry of fields) entry.input.value = ""
      hideCard()
    }
  })
}

