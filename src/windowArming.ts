import { setElementText, type ConfirmationArming, type ConfirmationGuardLease } from "./operationUi"
import { RpcError } from "./rpc"

/** How long the secure window must have been visible and focused before Confirm works. */
export const WINDOW_ARMING_MS = 500

/** Since when this window has been continuously visible and focused (null: it is not now). */
export type WindowFocusTracker = { since: () => number | null; subscribe: (listener: () => void) => () => void }

export function trackWindowFocus(target: { addEventListener: Window["addEventListener"]; removeEventListener: Window["removeEventListener"] } = window, doc: Document = document): WindowFocusTracker {
  const engaged = (): boolean => doc.visibilityState !== "hidden" && doc.hasFocus()
  let since: number | null = engaged() ? Date.now() : null
  const listeners = new Set<() => void>()
  const refresh = (): void => {
    const now = engaged()
    if (now && since === null) since = Date.now()
    if (!now) since = null
  }
  const update = (): void => {
    refresh()
    for (const listener of [...listeners]) listener()
  }
  target.addEventListener("focus", update)
  target.addEventListener("blur", update)
  doc.addEventListener("visibilitychange", update)
  return {
    since: () => { refresh(); return since },
    subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

/**
 * Confirm in the secure window arms only after the window has been visible and
 * focused for WINDOW_ARMING_MS, and disarms again when it loses either, so a
 * page that picks the moment the card appears cannot land a click on it. While
 * the window is not focused the card says to click it first.
 */
export function windowArmingGuard(tracker: WindowFocusTracker): (target: HTMLElement, arming: ConfirmationArming) => ConfirmationGuardLease {
  return (target, arming) => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let resolveReady!: () => void
    const ready = new Promise<void>((resolve) => { resolveReady = resolve })
    const hint = document.createElement("p")
    hint.className = "setup-status window-focus-hint dynamic"
    hint.setAttribute("role", "status")
    setElementText(hint, "authorize.focusToContinue")
    hint.hidden = true
    ;(target.querySelector(".card-scroll") ?? target).append(hint)
    const check = (): void => {
      if (disposed) return
      if (timer) { clearTimeout(timer); timer = null }
      const since = tracker.since()
      if (since === null) {
        hint.hidden = false
        arming.setArmed(false)
        return
      }
      hint.hidden = true
      const wait = WINDOW_ARMING_MS - (Date.now() - since)
      if (wait > 0) {
        arming.setArmed(false)
        timer = setTimeout(check, wait)
        return
      }
      arming.setArmed(true)
      resolveReady()
    }
    const unsubscribe = tracker.subscribe(check)
    check()
    return {
      ready,
      assertCurrent: () => {
        const since = tracker.since()
        if (since === null || Date.now() - since < WINDOW_ARMING_MS) {
          throw new RpcError("sandbox_not_visible", "the secure window was not in front long enough", true)
        }
      },
      dispose: () => {
        disposed = true
        if (timer) clearTimeout(timer)
        unsubscribe()
        hint.remove()
      },
    }
  }
}
