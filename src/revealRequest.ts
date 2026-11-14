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
