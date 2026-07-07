// Typed postMessage RPC boundary between the Avibe main app (parent) and this
// cross-origin crypto sandbox. This boundary IS the security perimeter:
//  - only messages from an allow-listed parent origin are accepted;
//  - the first accepted parent origin is pinned for the frame session;
//  - every request has an unguessable id and exactly one terminal response;
//  - responses never carry secrets (VMK / PRF output / DEKs / private keys /
//    plaintext) or raw exception detail.
//
// Phase 1: protocol plumbing only. Crypto operations are registered as stubs
// that fail closed with `not_implemented` until later phases land them.

export const CHANNEL = "avibe.vault.crypto"
export const VERSION = 1 as const

export const BUILD = {
  sandboxVersion: "0.1.0",
  // Filled by the reproducible-build step in a later phase; pinned + verified
  // by the Avibe local install before it trusts this sandbox.
  buildHash: "dev",
} as const

export type SandboxOperation =
  | "handshake"
  | "status"
  | "setup"
  | "unlock"
  | "lock"
  | "seal"
  | "unseal"
  | "sign"
  | "releaseDEK"
  | "deleteAuthzAssertion"

export interface RpcRequest {
  channel: typeof CHANNEL
  version: typeof VERSION
  id: string
  op: SandboxOperation
  payload: unknown
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

export class RpcError extends Error {
  code: string
  retryable: boolean
  constructor(code: string, message?: string, retryable = false) {
    super(message ?? code)
    this.code = code
    this.retryable = retryable
  }
}

export type OperationHandler = (payload: unknown) => Promise<unknown> | unknown

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

export class RpcServer {
  private handlers = new Map<SandboxOperation, OperationHandler>()
  private pinnedParentOrigin: string | null = null
  private pinnedSource: MessageEventSource | null = null

  register(op: SandboxOperation, handler: OperationHandler): void {
    this.handlers.set(op, handler)
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
    // 1. Origin gate — reject anything not from an allow-listed parent, and
    //    pin the first accepted origin/source for the rest of the session.
    if (!isAllowedParentOrigin(event.origin)) return
    if (this.pinnedParentOrigin === null) {
      this.pinnedParentOrigin = event.origin
      this.pinnedSource = event.source
    } else if (event.origin !== this.pinnedParentOrigin || event.source !== this.pinnedSource) {
      return
    }

    // 2. Envelope validation.
    if (!isRpcRequest(event.data)) return
    const req = event.data

    // 3. Dispatch to a registered handler; produce exactly one terminal reply.
    const handler = this.handlers.get(req.op)
    if (!handler) {
      this.reply(event.source, this.fail(req.id, "unknown_operation"))
      return
    }
    try {
      const result = await handler(req.payload)
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
    }
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
