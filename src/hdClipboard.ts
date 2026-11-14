// Explicit user-requested seed-word copy, with the standard dialog's native →
// legacy fallback. Never start a fallback after the owning view was left. The
// temporary plaintext field is cleared and detached on every path.
export async function copyHdWords(text: string, isCurrent: () => boolean): Promise<boolean> {
  if (!isCurrent()) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* Permission/API failure: try the standard legacy path below. */ }
  if (!isCurrent()) return false

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none"
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const selection = document.getSelection?.()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
  try {
    document.body.append(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    return document.execCommand("copy") === true
  } catch {
    return false
  } finally {
    textarea.value = ""
    textarea.remove()
    // Focus restoration is cosmetic; it must not turn a successful copy into an
    // unhandled rejection or resurrect a view that has already been left.
    if (isCurrent()) {
      try {
        selection?.removeAllRanges()
        if (range) selection?.addRange(range)
        active?.focus()
      } catch { /* A detached selection/focus target needs no recovery. */ }
    }
  }
}
