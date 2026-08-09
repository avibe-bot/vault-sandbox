import { RpcError } from "./rpc"

export type ConfirmSurfaceSnapshot = {
  documentVisible: boolean
  documentFocused: boolean
  frameWidth: number
  frameHeight: number
  intersectionRatio: number
  visibleByIntersectionObserver: boolean
  uiShowPending: boolean
  embedded: boolean
  parent?: ParentConfirmSurfaceSnapshot
}

export type ParentConfirmSurfaceSnapshot = {
  frameWidth: number
  frameHeight: number
  intersectionRatio: number
  visibleByIntersectionObserver: boolean
  opacity: number
  pointerEvents: boolean
  ageMs: number
}

export type ParentConfirmSurfaceInput = {
  value: unknown
  receivedAt: number
}

export type ConfirmSurfaceGuardLease = {
  ready: Promise<void>
  assertCurrent: () => void
  dispose: () => void
}

export type ConfirmSurfaceDecision =
  | { ok: true; warnings?: string[] }
  | { ok: false; code: "sandbox_not_visible"; detail: string }

const MIN_CONFIRM_WIDTH = 320
const MIN_CONFIRM_HEIGHT = 220
const MAX_PARENT_SURFACE_AGE_MS = 60_000
const MAX_PARENT_SURFACE_FUTURE_SKEW_MS = 1_000

export function evaluateConfirmSurface(
  snapshot: ConfirmSurfaceSnapshot,
  options: { requireFocus?: boolean } = {},
): ConfirmSurfaceDecision {
  if (snapshot.uiShowPending) return { ok: false, code: "sandbox_not_visible", detail: "ui show is still pending" }
  if (!snapshot.documentVisible) return { ok: false, code: "sandbox_not_visible", detail: "document is not visible" }
  if ((options.requireFocus ?? true) && !snapshot.documentFocused) {
    return { ok: false, code: "sandbox_not_visible", detail: "document is not focused" }
  }
  if (snapshot.frameWidth < MIN_CONFIRM_WIDTH || snapshot.frameHeight < MIN_CONFIRM_HEIGHT) {
    return { ok: false, code: "sandbox_not_visible", detail: "sandbox frame is too small" }
  }
  if (!snapshot.visibleByIntersectionObserver || snapshot.intersectionRatio < 0.99) {
    return { ok: false, code: "sandbox_not_visible", detail: "sandbox frame is not fully visible" }
  }
  const warnings: string[] = []
  if (snapshot.embedded) {
    const parent = snapshot.parent
    if (!parent) {
      warnings.push("parent frame visibility is not attested")
    } else {
      if (parent.ageMs > MAX_PARENT_SURFACE_AGE_MS) warnings.push("parent frame visibility is stale")
      if (parent.frameWidth < MIN_CONFIRM_WIDTH || parent.frameHeight < MIN_CONFIRM_HEIGHT) {
        warnings.push("parent frame is too small")
      }
      if (!parent.visibleByIntersectionObserver || parent.intersectionRatio < 0.99) {
        warnings.push("parent frame is not fully visible")
      }
      if (parent.opacity < 0.99 || !parent.pointerEvents) warnings.push("parent frame is visually occluded")
    }
  }
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function timestampMs(value: unknown): number | undefined {
  const numeric = finiteNumber(value)
  if (numeric !== undefined) return numeric
  if (typeof value !== "string" || value.trim() === "") return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function pointerEventsValue(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return undefined
  return value.toLowerCase() !== "none"
}

export function parseParentConfirmSurface(input?: ParentConfirmSurfaceInput): ParentConfirmSurfaceSnapshot | undefined {
  if (!input) return undefined
  const record = asRecord(input.value)
  if (!record) return undefined
  const frame = asRecord(record.frame) ?? record
  const frameWidth = finiteNumber(frame.frameWidth) ?? finiteNumber(frame.width)
  const frameHeight = finiteNumber(frame.frameHeight) ?? finiteNumber(frame.height)
  const intersectionRatio = finiteNumber(frame.intersectionRatio)
  const visibleByIntersectionObserver =
    booleanValue(frame.visibleByIntersectionObserver) ?? booleanValue(frame.isVisible) ?? booleanValue(frame.visible)
  const opacity = finiteNumber(frame.opacity)
  const pointerEvents = pointerEventsValue(frame.pointerEvents)
  const sampledAt =
    timestampMs(record.sampledAt) ??
    timestampMs(record.measuredAt) ??
    timestampMs(record.timestamp) ??
    timestampMs(frame.sampledAt) ??
    timestampMs(frame.measuredAt) ??
    timestampMs(frame.timestamp)
  if (
    frameWidth === undefined ||
    frameHeight === undefined ||
    intersectionRatio === undefined ||
    visibleByIntersectionObserver === undefined ||
    opacity === undefined ||
    pointerEvents === undefined ||
    sampledAt === undefined
  ) {
    return undefined
  }
  const now = Date.now()
  if (sampledAt > now + MAX_PARENT_SURFACE_FUTURE_SKEW_MS) return undefined
  return {
    frameWidth,
    frameHeight,
    intersectionRatio,
    visibleByIntersectionObserver,
    opacity,
    pointerEvents,
    ageMs: Math.max(0, now - sampledAt),
  }
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

export async function readConfirmSurfaceSnapshot(input: {
  uiShowPending: boolean
  parentSurface?: ParentConfirmSurfaceInput
  visibilityTarget?: Element
}): Promise<ConfirmSurfaceSnapshot> {
  const target = input.visibilityTarget ?? document.body ?? document.documentElement
  const observed = await intersectionVisible(target)
  return {
    documentVisible: document.visibilityState === "visible",
    documentFocused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
    frameWidth: window.innerWidth,
    frameHeight: window.innerHeight,
    intersectionRatio: observed.ratio,
    visibleByIntersectionObserver: observed.visible,
    uiShowPending: input.uiShowPending,
    embedded: window.parent !== window,
    parent: parseParentConfirmSurface(input.parentSurface),
  }
}

export async function assertConfirmSurfaceReady(input: {
  uiShowPending: boolean
  parentSurface?: ParentConfirmSurfaceInput
  visibilityTarget?: Element
}): Promise<void> {
  const decision = evaluateConfirmSurface(await readConfirmSurfaceSnapshot(input))
  if (!decision.ok) throw new RpcError(decision.code, decision.detail, true)
  for (const warning of decision.warnings ?? []) console.warn(`[vault-sandbox] Confirm surface advisory: ${warning}`)
}

export function monitorConfirmSurface(input: {
  uiShowPending: () => boolean
  parentSurface?: () => ParentConfirmSurfaceInput | undefined
  visibilityTarget?: Element
}): ConfirmSurfaceGuardLease {
  const target = input.visibilityTarget ?? document.body ?? document.documentElement
  let observed = { ratio: 0, visible: false }
  let disposed = false
  let readySettled = false
  let resolveReady!: () => void
  let rejectReady!: (error: unknown) => void

  const snapshot = (): ConfirmSurfaceSnapshot => ({
    documentVisible: document.visibilityState === "visible",
    documentFocused: typeof document.hasFocus === "function" ? document.hasFocus() : false,
    frameWidth: window.innerWidth,
    frameHeight: window.innerHeight,
    intersectionRatio: observed.ratio,
    visibleByIntersectionObserver: observed.visible,
    uiShowPending: input.uiShowPending(),
    embedded: window.parent !== window,
    parent: parseParentConfirmSurface(input.parentSurface?.()),
  })

  const assertSurface = (requireFocus: boolean): void => {
    const decision = evaluateConfirmSurface(snapshot(), { requireFocus })
    if (!decision.ok) throw new RpcError(decision.code, decision.detail, true)
    for (const warning of decision.warnings ?? []) console.warn(`[vault-sandbox] Confirm surface advisory: ${warning}`)
  }

  const assertCurrent = (): void => assertSurface(true)

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve
    rejectReady = reject
  })

  const markReady = (): void => {
    if (readySettled || disposed) return
    readySettled = true
    try {
      // An embedded document only gains focus after the user taps inside it.
      // Visibility can enable the button; the click path re-checks focus
      // synchronously before starting WebAuthn.
      assertSurface(false)
      resolveReady()
    } catch (error) {
      rejectReady(error)
    }
  }

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            const entry = entries[0]
            const maybeVisible = (entry as IntersectionObserverEntry & { isVisible?: boolean } | undefined)?.isVisible
            observed = entry
              ? {
                  ratio: entry.intersectionRatio,
                  visible: maybeVisible === undefined ? entry.intersectionRatio >= 0.99 : maybeVisible === true,
                }
              : { ratio: 0, visible: false }
            markReady()
          },
          {
            threshold: [0, 0.99, 1],
            trackVisibility: true,
            delay: 100,
          } as IntersectionObserverInit,
        )

  observer?.observe(target)
  const readyTimer = setTimeout(markReady, 250)

  return {
    ready,
    assertCurrent,
    dispose: () => {
      if (disposed) return
      disposed = true
      clearTimeout(readyTimer)
      observer?.disconnect()
    },
  }
}
