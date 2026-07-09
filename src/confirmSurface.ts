import { RpcError } from "./rpc"

export type ConfirmSurfaceSnapshot = {
  documentVisible: boolean
  documentFocused: boolean
  frameWidth: number
  frameHeight: number
  intersectionRatio: number
  visibleByIntersectionObserver: boolean
  uiShowPending: boolean
}

export type ConfirmSurfaceDecision = { ok: true } | { ok: false; code: "sandbox_not_visible"; detail: string }

const MIN_CONFIRM_WIDTH = 320
const MIN_CONFIRM_HEIGHT = 220

export function evaluateConfirmSurface(snapshot: ConfirmSurfaceSnapshot): ConfirmSurfaceDecision {
  if (snapshot.uiShowPending) return { ok: false, code: "sandbox_not_visible", detail: "ui show is still pending" }
  if (!snapshot.documentVisible) return { ok: false, code: "sandbox_not_visible", detail: "document is not visible" }
  if (!snapshot.documentFocused) return { ok: false, code: "sandbox_not_visible", detail: "document is not focused" }
  if (snapshot.frameWidth < MIN_CONFIRM_WIDTH || snapshot.frameHeight < MIN_CONFIRM_HEIGHT) {
    return { ok: false, code: "sandbox_not_visible", detail: "sandbox frame is too small" }
  }
  if (!snapshot.visibleByIntersectionObserver || snapshot.intersectionRatio < 0.99) {
    return { ok: false, code: "sandbox_not_visible", detail: "sandbox frame is not fully visible" }
  }
  return { ok: true }
}

function intersectionVisible(target: Element): Promise<{ ratio: number; visible: boolean }> {
  if (typeof IntersectionObserver === "undefined") return Promise.resolve({ ratio: 0, visible: false })

  return new Promise((resolve) => {
    let settled = false
    const finish = (entry?: IntersectionObserverEntry): void => {
      if (settled) return
      settled = true
      observer.disconnect()
      if (!entry) {
        resolve({ ratio: 0, visible: false })
        return
      }
      const maybeVisible = (entry as IntersectionObserverEntry & { isVisible?: boolean }).isVisible
      resolve({
        ratio: entry.intersectionRatio,
        visible: maybeVisible === undefined ? entry.intersectionRatio >= 0.99 : maybeVisible === true,
      })
    }
    const observer = new IntersectionObserver(
      (entries) => finish(entries[0]),
      {
        threshold: [0, 0.99, 1],
        trackVisibility: true,
        delay: 100,
      } as IntersectionObserverInit,
    )
    observer.observe(target)
    setTimeout(() => finish(), 250)
  })
}

export async function readConfirmSurfaceSnapshot(input: { uiShowPending: boolean }): Promise<ConfirmSurfaceSnapshot> {
  const target = document.documentElement
  const observed = await intersectionVisible(target)
  return {
    documentVisible: document.visibilityState === "visible",
    documentFocused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
    frameWidth: window.innerWidth,
    frameHeight: window.innerHeight,
    intersectionRatio: observed.ratio,
    visibleByIntersectionObserver: observed.visible,
    uiShowPending: input.uiShowPending,
  }
}

export async function assertConfirmSurfaceReady(input: { uiShowPending: boolean }): Promise<void> {
  const decision = evaluateConfirmSurface(await readConfirmSurfaceSnapshot(input))
  if (!decision.ok) throw new RpcError(decision.code, decision.detail, true)
}
