// Typed postMessage RPC boundary between the Avibe main app (parent) and this
// cross-origin crypto sandbox. This boundary IS the security perimeter:
//  - only messages from an allow-listed parent origin are accepted;
//  - the first accepted parent origin is pinned for the frame session;
//  - every request has an unguessable id and exactly one terminal response;
//  - responses never carry secrets (VMK / PRF output / DEKs / private keys /
//    plaintext) or raw exception detail.
//
export const CHANNEL = "avibe.vault.crypto"
export const VERSION = 2 as const

export const BUILD = {
  sandboxVersion: "0.1.0",
  // Filled by the reproducible-build step in a later phase; pinned + verified
  // by the Avibe local install before it trusts this sandbox.
  buildHash: "dev",
} as const

export type SandboxOperation =
  | "handshake"
  | "set-appearance"
  | "status"
  | "setup"
  | "unlock"
  | "lock"
  | "seal"
  | "reveal"
  | "sign"
  | "approveRelease"
  | "deleteAuthzAssertion"

export type AppearanceLocale = "en" | "zh"
export type AppearanceTheme = "light" | "dark"
export type Appearance = {
  locale: AppearanceLocale
  theme: AppearanceTheme
}

export interface RpcRequest {
  channel: typeof CHANNEL
  version: typeof VERSION
  id: string
  op: SandboxOperation
  payload: unknown
  surface?: unknown
}

interface RpcSuccess {
  channel: typeof CHANNEL
  version: typeof VERSION
  id: string
  ok: true
  result: unknown
}

interface RpcFailure {
  channel: typeof CHANNEL
  version: typeof VERSION
  id: string
  ok: false
  error: { code: string; message?: string; retryable?: boolean }
}

interface RpcEvent {
  channel: typeof CHANNEL
  version: typeof VERSION
  kind: "event"
  event: "vault.state" | "ui.show" | "ui.hide"
  payload?: unknown
}

export class RpcError extends Error {
  code: string
  retryable: boolean
  constructor(code: string, message?: string, retryable = false) {
    super(message ?? code)
    this.code = code
    this.retryable = retryable
  }
}

export type RpcParentSurface = {
  value: unknown
  receivedAt: number
}

export type RpcRequestContext = {
  surface?: RpcParentSurface
  latestSurface: () => RpcParentSurface | undefined
}
export type OperationHandler = (payload: unknown, context: RpcRequestContext) => Promise<unknown> | unknown

/** Origin allow-list for parents that may embed / drive this sandbox. */
export function isAllowedParentOrigin(origin: string): boolean {
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  const host = url.hostname.toLowerCase()
  // Local development hosts (any scheme/port a local Avibe install serves on).
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return url.protocol === "http:" || url.protocol === "https:"
  }
  // Avibe tunnel / control-plane origins, HTTPS only.
  if (url.protocol === "https:" && (host === "avibe.bot" || host.endsWith(".avibe.bot"))) {
    return true
  }
  return false
}

function isRpcRequest(data: unknown): data is RpcRequest {
  if (typeof data !== "object" || data === null) return false
  const d = data as Record<string, unknown>
  return (
    d.channel === CHANNEL &&
    d.version === VERSION &&
    typeof d.id === "string" &&
    d.id.length > 0 &&
    typeof d.op === "string"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isParentSurfaceEvent(data: unknown): data is { id?: unknown; requestId?: unknown; surface?: unknown; payload?: unknown } {
  if (!isRecord(data)) return false
  return data.channel === CHANNEL && data.version === VERSION && data.kind === "event" && data.event === "confirm.surface"
}

type RequestSurfaceSlot = {
  surface?: RpcParentSurface
}

export class RpcServer {
  private handlers = new Map<SandboxOperation, OperationHandler>()
  private pinnedParentOrigin: string | null = null
  private pinnedSource: MessageEventSource | null = null
  private handshakeNonce: string | null = null
  private activeSurfaceSlots = new Map<string, RequestSurfaceSlot>()

  register(op: SandboxOperation, handler: OperationHandler): void {
    this.handlers.set(op, handler)
  }

  emit(event: RpcEvent["event"], payload?: unknown): void {
    if (!this.pinnedSource || this.pinnedParentOrigin === null) return
    ;(this.pinnedSource as Window).postMessage(
      {
        channel: CHANNEL,
        version: VERSION,
        kind: "event",
        event,
        ...(payload !== undefined ? { payload } : {}),
      } satisfies RpcEvent,
      this.pinnedParentOrigin,
    )
  }

  /** Start listening + announce readiness to the embedder. */
  start(): void {
    window.addEventListener("message", (e) => void this.onMessage(e))
    if (window.parent !== window) this.announceReady()
  }

  private announceReady(): void {
    // Broadcast readiness. The parent validates our origin on its side; we do
    // not yet know (or trust) the parent origin until the first accepted message.
    this.postToParent(window.parent, {
      type: "ready",
      channel: CHANNEL,
      version: VERSION,
      build: BUILD,
      capabilities: {
        operations: Array.from(this.handlers.keys()),
      },
    })
  }

  private async onMessage(event: MessageEvent): Promise<void> {
    // 1. Origin and envelope gate. The first accepted message must be a valid
    //    handshake whose declared parent origin matches the actual event origin;
    //    only then do we pin origin/source for the frame session.
    if (!isAllowedParentOrigin(event.origin)) return
    if (isParentSurfaceEvent(event.data)) {
      if (event.origin === this.pinnedParentOrigin && event.source === this.pinnedSource) {
        const value = event.data.surface ?? event.data.payload
        if (value !== undefined) this.recordParentSurfaceEvent(event.data, value)
      }
      return
    }
    if (!isRpcRequest(event.data)) return
    const req = event.data
    const initialHandshake = this.pinnedParentOrigin === null

    if (initialHandshake) {
      const nonce = this.validateInitialHandshake(req, event.origin)
      if (!nonce) return
      this.pinnedParentOrigin = event.origin
      this.pinnedSource = event.source
      this.handshakeNonce = nonce
    } else if (event.origin !== this.pinnedParentOrigin || event.source !== this.pinnedSource || this.handshakeNonce === null) {
      return
    }
    // 2. Dispatch to a registered handler; produce exactly one terminal reply.
    const handler = this.handlers.get(req.op)
    if (!handler) {
      this.reply(event.source, this.fail(req.id, "unknown_operation"))
      if (initialHandshake) this.clearPin()
      return
    }
    const surfaceSlot: RequestSurfaceSlot = {
      ...(req.surface !== undefined ? { surface: this.parentSurface(req.surface) } : {}),
    }
    this.activeSurfaceSlots.set(req.id, surfaceSlot)
    const context: RpcRequestContext = {
      ...(surfaceSlot.surface ? { surface: surfaceSlot.surface } : {}),
      latestSurface: () => surfaceSlot.surface,
    }
    try {
      const result = await handler(req.payload, context)
      this.reply(event.source, {
        channel: CHANNEL,
        version: VERSION,
        id: req.id,
        ok: true,
        result,
      })
    } catch (err) {
      // Never leak stack traces / exception objects across the boundary.
      const code = err instanceof RpcError ? err.code : "internal_error"
      const retryable = err instanceof RpcError ? err.retryable : false
      const message = err instanceof RpcError ? err.message : undefined
      this.reply(event.source, this.fail(req.id, code, message, retryable))
      if (initialHandshake) this.clearPin()
    } finally {
      this.activeSurfaceSlots.delete(req.id)
    }
  }

  private validateInitialHandshake(req: RpcRequest, eventOrigin: string): string | null {
    if (req.op !== "handshake") return null
    if (!isRecord(req.payload)) return null
    const parentOrigin = req.payload.parentOrigin
    const nonce = req.payload.nonce
    if (typeof parentOrigin !== "string" || parentOrigin !== eventOrigin || !isAllowedParentOrigin(parentOrigin)) {
      return null
    }
    if (typeof nonce !== "string" || nonce.length < 16 || nonce.length > 256) {
      return null
    }
    return nonce
  }

  private clearPin(): void {
    this.pinnedParentOrigin = null
    this.pinnedSource = null
    this.handshakeNonce = null
    this.activeSurfaceSlots.clear()
  }

  private parentSurface(value: unknown): RpcParentSurface {
    return { value, receivedAt: Date.now() }
  }

  private recordParentSurfaceEvent(data: { id?: unknown; requestId?: unknown }, value: unknown): void {
    const requestId = typeof data.id === "string" ? data.id : typeof data.requestId === "string" ? data.requestId : null
    if (requestId) {
      const slot = this.activeSurfaceSlots.get(requestId)
      if (slot) slot.surface = this.parentSurface(value)
      return
    }
    if (this.activeSurfaceSlots.size !== 1) return
    const [slot] = this.activeSurfaceSlots.values()
    if (slot) slot.surface = this.parentSurface(value)
  }

  private fail(id: string, code: string, message?: string, retryable = false): RpcFailure {
    return { channel: CHANNEL, version: VERSION, id, ok: false, error: { code, message, retryable } }
  }

  private reply(source: MessageEventSource | null, msg: RpcSuccess | RpcFailure): void {
    if (!source || this.pinnedParentOrigin === null) return
    ;(source as Window).postMessage(msg, this.pinnedParentOrigin)
  }

  private postToParent(target: Window, msg: unknown): void {
    // Ready is broadcast with "*": it carries no secrets and the parent
    // validates our (sandbox) origin. All later replies are origin-pinned.
    target.postMessage(msg, "*")
  }
}
