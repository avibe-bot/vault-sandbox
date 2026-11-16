import { t, type I18nKey } from "./i18n"
import { eyeIcon, secretInput } from "./protectedHdUi"
import { appendDynamic, appendFooterDynamic, button, hideCard, rawText, runExclusiveOperation, setElementText, showCard, status } from "./operationUi"
import { generateSecretValue, type GenerateRecipe } from "./secretGenerate"
import { SECRET_INPUT_MAX_CHARS } from "./secretInputChannel"

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

/** A line break, which a single-line input would silently strip from a pasted value. */
const LINE_BREAK = /[\r\n]/

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
      // Sized to its rows, bounded by the window: only the rows scroll, Save stays in view.
      document.body.classList.add("confirming", "compact")
      r.card.classList.add("confirm-card")
      const list = document.createElement("div")
      list.className = "secret-input-rows"
      const save = button("input.save")
      const cancel = button("common.cancel")
      cancel.classList.add("secondary")
      // Beside Save, so the reason it is off stays in view however many rows scroll.
      const reason = status()
      reason.classList.add("secret-status", "secret-input-reason")
      reason.setAttribute("role", "status")
      const newRows = input.rows.filter((row) => row.required).length
      // Save opens once every required row has a value and, in an edit, something
      // was typed at all: an edit never saves nothing. A value with a line break is
      // never saved, and never saved with its line breaks stripped; a value past the
      // frame's bound never leaves this window.
      const blocked = (): I18nKey | null => {
        if (fields.some((entry) => LINE_BREAK.test(entry.input.value))) return "input.multiline"
        if (fields.some((entry) => entry.input.value.length > SECRET_INPUT_MAX_CHARS)) return "input.tooLong"
        if (input.rows.some((row, index) => row.required && fields[index].input.value === "")) {
          return input.mode === "create" ? "input.fillAll" : newRows > 1 ? "input.fillNewMany" : "input.fillNew"
        }
        if (fields.every((entry) => entry.input.value === "")) return "input.fillChange"
        return null
      }
      // A refused multiline paste or drop: said until the next change.
      let refusedMultiline = false
      // The status line is announced when it changes, not again on every keystroke.
      let said: I18nKey | null = null
      const refresh = (): void => {
        const why = blocked()
        save.disabled = why !== null
        const shown = refusedMultiline ? "input.multiline" : why
        if (shown === said) return
        said = shown
        if (shown) setElementText(reason, shown)
        else reason.textContent = ""
      }
      const refuseMultiline = (event: Event): void => {
        event.preventDefault()
        refusedMultiline = true
        refresh()
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
        // The row's name, without its Default tag, for the controls that name the row.
        const name = row.label === "value" ? t("plaintext.valueLabel") : row.label
        caption.textContent = name
        if (row.isDefault && input.rows.length > 1) {
          const tag = document.createElement("span")
          tag.className = "secret-input-default"
          setElementText(tag, "input.defaultTag")
          caption.append(" ", tag)
        }
        const badge = document.createElement("span")
        badge.className = "secret-input-generated"
        badge.id = `${id}-generated`
        badge.hidden = true
        setElementText(badge, "input.generated")
        head.append(caption, badge)
        const line = document.createElement("div")
        line.className = "hd-secret-row"
        const field = secretInput("input")
        field.id = id
        // A new value for this secret: no saved credential is filled in, no
        // password is suggested, and password managers are asked to stay out.
        field.setAttribute("autocomplete", "off")
        for (const ignore of ["data-1p-ignore", "data-lpignore", "data-bwignore"]) field.setAttribute(ignore, "true")
        field.setAttribute("data-form-type", "other")
        field.setAttribute("aria-required", String(row.required))
        if (!row.required) field.placeholder = t("input.keepPlaceholder")
        const entry = { input: field, generated: false }
        fields.push(entry)
        const markGenerated = (generated: boolean): void => {
          entry.generated = generated
          badge.hidden = !generated
          // "Generated" describes the field only while it holds the generated value.
          if (generated) field.setAttribute("aria-describedby", badge.id)
          else field.removeAttribute("aria-describedby")
        }
        const toggle = document.createElement("button")
        toggle.type = "button"
        toggle.className = "hd-reveal"
        toggle.setAttribute("aria-controls", id)
        const toggleName = document.createElement("span")
        toggleName.className = "hd-reveal-label"
        // Named for its row, as the reveal rows are; the name says the action.
        const render = (shown: boolean): void => {
          field.type = shown ? "text" : "password"
          setElementText(toggleName, { key: shown ? "plaintext.hideRow" : "plaintext.showRow", params: { label: name } })
          toggle.textContent = ""
          toggle.append(eyeIcon(shown), toggleName)
        }
        render(false)
        toggle.addEventListener("click", () => render(field.type === "password"))
        // A line break that came in an insertion the browser would not let us cancel
        // (insertCompositionText): the value before it is put back, never the
        // single-line form the input made of it. Only that same insertion is undone.
        let restore: { value: string; inputType: string } | null = null
        field.addEventListener("input", (event) => {
          const undo = restore
          restore = null
          if (undo && (event as InputEvent).inputType === undo.inputType) {
            field.value = undo.value
            refresh()
            return
          }
          // Typing over a generated value makes it the person's own.
          markGenerated(false)
          refusedMultiline = false
          refresh()
        })
        // A single-line input strips the line breaks of pasted or dropped text, so
        // a PEM key would be saved altered. Such text is refused before it lands.
        const carried = (data: DataTransfer | null | undefined): string => data?.getData("text/plain") || data?.getData("text") || ""
        field.addEventListener("paste", (event) => {
          if (LINE_BREAK.test(carried((event as ClipboardEvent).clipboardData))) refuseMultiline(event)
        })
        field.addEventListener("drop", (event) => {
          if (LINE_BREAK.test(carried((event as DragEvent).dataTransfer))) refuseMultiline(event)
        })
        field.addEventListener("beforeinput", (event) => {
          // An insertion's own input event never has another beforeinput before it:
          // a remembered undo that is still here belongs to an abandoned insertion.
          restore = null
          const edit = event as InputEvent
          // Enter: a single-line input inserts nothing, and there is nothing to say.
          if (edit.inputType === "insertLineBreak" || edit.inputType === "insertParagraph") {
            event.preventDefault()
            return
          }
          if (!LINE_BREAK.test(edit.data ?? carried(edit.dataTransfer))) return
          if (edit.cancelable === false) {
            // Its input event follows in this same task; one that never comes (an
            // abandoned composition) must not undo later typing.
            const pending = { value: field.value, inputType: edit.inputType }
            restore = pending
            setTimeout(() => { if (restore === pending) restore = null }, 0)
          }
          refuseMultiline(event)
        })
        line.append(field, toggle)
        if (row.generate) {
          const recipe = row.generate
          const generate = button("input.generate")
          generate.classList.add("secondary", "secret-row-button")
          generate.setAttribute("aria-label", t("input.generateRow", { label: name }))
          generate.addEventListener("click", () => {
            field.value = generateSecretValue(recipe, input.random)
            markGenerated(true)
            refusedMultiline = false
            refresh()
          })
          line.append(generate)
        }
        wrap.append(head, line)
        list.append(wrap)
      }
      appendDynamic(r.card, list)
      appendFooterDynamic(r.card, reason)
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
          if (blocked()) { refresh(); return }
          const values = fields.map((entry): SecretInputValue => {
            const value = entry.input.value
            return { value: value === "" ? null : value, generated: value !== "" && entry.generated }
          })
          settle(() => resolve(values))
        })
      })
    } finally {
      for (const entry of fields) entry.input.value = ""
      hideCard()
    }
  })
}
