import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { assertCanonicalJson } from "./canonicalJson"
import { RpcError } from "./rpc"
import { assertSignedOperationContextPreview, parseSignedOperationContext, stableJson, type SignedOperationContext } from "./operationContext"
import type { ProtectedRecordEnvelope } from "./vaultCrypto"

export type RevealRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  context: SignedOperationContext
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RpcError("invalid_payload", "reveal material must be an object")
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new RpcError("invalid_payload", "reveal material requires nonempty strings")
  return value
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

/** Producer's canonical envelope OBJECT hash, not the HD ASCII-array fingerprint. */
export function revealEnvelopeHash(envelope: ProtectedRecordEnvelope): string {
  const projection = { ciphertext: envelope.ciphertext, nonce: envelope.nonce, wrap_meta: envelope.wrap_meta }
  assertCanonicalJson(projection)
  return bytesToHex(sha256(new TextEncoder().encode(stableJson(projection))))
}
export function assertRevealBinding(request: RevealRequest): void {
  assertSignedOperationContextPreview({ context: request.context, expectedPurpose: "reveal", secret: { name: request.material.name, kind: "static" } })
  const release = request.context.release
  const hash = release?.envelopeHash
  if (!release || release.name !== request.material.name || !hash || typeof hash !== "object" || Array.isArray(hash)) {
    throw new RpcError("invalid_reveal_binding", "reveal approval does not bind this envelope")
  }
  const bound = hash as Record<string, unknown>
  if (Object.keys(bound).length !== 2 || bound.alg !== "sha256" || typeof bound.digest !== "string"
    || !/^[0-9a-f]{64}$/.test(bound.digest) || bound.digest !== revealEnvelopeHash(request.material.envelope)) {
    throw new RpcError("invalid_reveal_binding", "reveal approval does not bind this envelope")
  }
}
export function parseRevealRequest(payload: unknown): RevealRequest {
  // Own one immutable copy before any asynchronous consent/decryption boundary.
  assertCanonicalJson(payload)
  const source = object(structuredClone(payload))
  const material = object(source.material)
  const envelope = object(material.envelope)
  const request = freeze({
    material: { name: text(material.name), envelope: {
      ciphertext: text(envelope.ciphertext), nonce: text(envelope.nonce), wrap_meta: text(envelope.wrap_meta),
    } },
    context: parseSignedOperationContext(source.context),
  })
  assertRevealBinding(request)
  return request
}

export const REVEAL_MAX_FIELDS = 32
const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const FIELD_NAME = /^[a-z][a-z0-9_]{0,63}$/

/** One row of a whole-secret reveal: its signed record name and the label shown for it. */
export type RevealItem = RevealRequest & { field: string | null }
export type RevealBatch = { secret: string; items: RevealItem[]; defaultFieldLabel?: string }

/** The record name `SECRET` or `SECRET.field`, split; anything else is refused. */
function recordParts(name: string): { secret: string; field: string | null } {
  const dot = name.indexOf(".")
  const secret = dot < 0 ? name : name.slice(0, dot)
  const field = dot < 0 ? null : name.slice(dot + 1)
  if (!SECRET_NAME.test(secret) || (field !== null && !FIELD_NAME.test(field))) {
    throw new RpcError("invalid_payload", "reveal record name is invalid")
  }
  return { secret, field }
}

/**
 * A whole protected secret: one signed reveal per field, all of the same
 * secret, each bound to its own envelope. The single `{material, context}`
 * shape remains a one-row reveal.
 */
export function parseRevealBatch(payload: unknown): RevealBatch {
  assertCanonicalJson(payload)
  const source = object(payload)
  const single = !Object.hasOwn(source, "items")
  if (!single) {
    for (const key of Object.keys(source)) {
      if (key !== "items" && key !== "defaultFieldLabel") throw new RpcError("invalid_payload", "reveal request has unknown fields")
    }
  }
  const rawItems = single ? [source] : source.items
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > REVEAL_MAX_FIELDS) {
    throw new RpcError("invalid_payload", `reveal items must hold 1 to ${REVEAL_MAX_FIELDS} fields`)
  }
  const defaultFieldLabel = single ? undefined : source.defaultFieldLabel
  if (defaultFieldLabel !== undefined && (typeof defaultFieldLabel !== "string" || !FIELD_NAME.test(defaultFieldLabel))) {
    throw new RpcError("invalid_payload", "reveal defaultFieldLabel is invalid")
  }
  const seen = new Set<string>()
  let secret: string | undefined
  const items = rawItems.map((raw) => {
    const item = parseRevealRequest(raw)
    const parts = recordParts(item.material.name)
    if (secret !== undefined && parts.secret !== secret) throw new RpcError("invalid_payload", "reveal items must belong to one secret")
    if (seen.has(item.material.name)) throw new RpcError("invalid_payload", "reveal items must be distinct fields")
    secret = parts.secret
    seen.add(item.material.name)
    return freeze({ ...item, field: parts.field })
  })
  return freeze({ secret: secret!, items, ...(defaultFieldLabel !== undefined ? { defaultFieldLabel } : {}) })
}
