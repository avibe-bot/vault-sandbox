import { sha256 } from "@noble/hashes/sha2.js"
import { RpcError } from "./rpc"
import { t } from "./i18n"
import { assertCanonicalJson } from "./canonicalJson"
import {
  assertSignedOperationContextPreview, assertSignedOperationContextsConsumable,
  parseSignedOperationContext, signedOperationContextMessage, stableJson, verifySignedOperationContext,
  type SignedOperationContext,
} from "./operationContext"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"
import { verifyBitcoinSigningContext } from "./bitcoin"
import {
  openRootMetadata, parseSignatureScheme, protectedRecordContextFromMetadata,
  signProtectedDigest, unpackProtectedRecord,
  SIGN_SCHEME_ECDSA_SECP256K1_DER, SIGN_SCHEME_ECDSA_SECP256K1_RECOVERABLE,
  SIGN_SCHEME_SCHNORR_SECP256K1_BIP340, SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH,
  type ProtectedRecordEnvelope, type SignatureScheme,
} from "./vaultCrypto"

export type SignRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  scheme: SignatureScheme
  signingContext: VerifiableSigningContext
  context: SignedOperationContext
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RpcError("invalid_payload", `${field} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new RpcError("invalid_payload", `${field} must be a non-empty string`)
  return value
}

function fields(value: Record<string, unknown>, allowed: string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new RpcError("invalid_payload", `${label} carries unsupported fields; script trees are not supported`)
  }
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

export function parseSignRequest(payload: unknown): SignRequest {
  // Own one immutable snapshot across async authorization. Never authenticate
  // one object and later sign a mutable caller-owned replacement.
  const source = record(payload, "sign request")
  assertCanonicalJson(source)
  const input = record(structuredClone(source), "sign request")
  fields(input, ["material", "scheme", "signingContext", "context"], "sign request")
  const material = record(input.material, "material")
  fields(material, ["name", "envelope"], "material")
  const envelope = record(material.envelope, "envelope")
  fields(envelope, ["ciphertext", "nonce", "wrap_meta"], "envelope")
  const context = parseSignedOperationContext(input.context)
  fields(record(context, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context")
  let scheme: SignatureScheme
  try { scheme = parseSignatureScheme(input.scheme) } catch { throw new RpcError("invalid_payload", "unsupported signing scheme") }
  return freeze({
    material: {
      name: string(material.name, "material.name"),
      envelope: {
        ciphertext: string(envelope.ciphertext, "envelope.ciphertext"),
        nonce: string(envelope.nonce, "envelope.nonce"),
        wrap_meta: string(envelope.wrap_meta, "envelope.wrap_meta"),
      },
    },
    scheme,
    signingContext: record(input.signingContext, "signingContext") as VerifiableSigningContext,
    context,
  })
}

function invalidBinding(): never {
  throw new RpcError("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request")
}

function assertSignBinding(request: SignRequest, digest: string, publicKey: string): void {
  assertSignedOperationContextPreview({ context: request.context, expectedPurpose: "sign", secret: { name: request.material.name, kind: "keypair" } })
  const release = request.context.release
  if (!release || Array.isArray(release)) invalidBinding()
  fields(release, ["name", "scheme", "digest", "publicKey", "signingContext"], "sign context.release")
  if (release.name !== request.material.name || release.scheme !== request.scheme
    || release.digest !== digest || typeof release.publicKey !== "string"
    || release.publicKey.toLowerCase() !== publicKey.toLowerCase()
    || !release.signingContext || stableJson(release.signingContext) !== stableJson(request.signingContext)) {
    invalidBinding()
  }
}

/** Labels are computed locally from the actual scheme and record key, not parent display text. */
export function signingSchemeDescription(scheme: SignatureScheme, publicKey: string): string {
  parseSignatureScheme(scheme)
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(publicKey)) throw new Error("signing public key must be compressed secp256k1")
  if (scheme === SIGN_SCHEME_SCHNORR_SECP256K1_BIP340) {
    return `BIP340 raw Schnorr (untweaked internal key)\ninternal key: ${publicKey.slice(2).toLowerCase()}`
  }
  if (scheme === SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH) {
    return t("bitcoin.signingIdentity", { key: publicKey.slice(2).toLowerCase() })
  }
  const label = scheme === SIGN_SCHEME_ECDSA_SECP256K1_RECOVERABLE ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"
  return `${label}\npublic key: ${publicKey.toLowerCase()}`
}

export function prepareSignRequest(payload: unknown) {
  const request = parseSignRequest(payload)
  let verified = verifySigningContext(request.signingContext)
  if (request.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    if (request.scheme !== SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH) {
      throw new RpcError("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme")
    }
  } else if (request.scheme === SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH) {
    throw new RpcError("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context")
  } else if (request.signingContext.kind !== "avault-agent-operation"
    && request.scheme !== SIGN_SCHEME_ECDSA_SECP256K1_RECOVERABLE
    && request.scheme !== SIGN_SCHEME_ECDSA_SECP256K1_DER) {
    throw new RpcError("invalid_payload", "EVM signing contexts require an ECDSA scheme")
  }
  const unpacked = unpackProtectedRecord(request.material.envelope)
  const recordContext = protectedRecordContextFromMetadata(request.material.name, unpacked.recordMetadata)
  if (recordContext.kind !== "keypair" || !recordContext.publicKey) throw new Error("protected signing requires a keypair protected record")
  if (request.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const bitcoin = verifyBitcoinSigningContext(request.signingContext, verified.digest, recordContext.publicKey)
    verified = { digest: bitcoin.digest, challenge: verified.challenge, display: bitcoin.display }
  }
  assertSignBinding(request, verified.digest, recordContext.publicKey)
  const display = `${signingSchemeDescription(request.scheme, recordContext.publicKey)}\nscheme: ${request.scheme}\n${verified.display}`
  // A fresh passkey binds the complete daemon-approved request, not only a
  // digest which could be shared by two schemes or keys.
  const challenge = sha256(new TextEncoder().encode(signedOperationContextMessage(request.context)))
  return freeze({ request, verified: { digest: verified.digest, display }, unpacked, recordContext, challenge: [...challenge] })
}

export type PreparedSignRequest = ReturnType<typeof prepareSignRequest>

export async function verifyPreparedSignRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string): Promise<void> {
  const rootMetadata = await openRootMetadata(wrapMeta, vmk)
  verifySignedOperationContext({ context: prepared.request.context, rootMetadata, expectedPurpose: "sign" })
  assertSignBinding(prepared.request, prepared.verified.digest, prepared.recordContext.publicKey!)
  assertSignedOperationContextsConsumable([prepared.request.context])
}

/** Called only inside main.ts's fresh-passkey R3 authorization callback. */
export async function signPreparedRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string) {
  // Revalidate at the use boundary after the asynchronous approval ceremony.
  await verifyPreparedSignRequest(prepared, vmk, wrapMeta)
  return signProtectedDigest(prepared.unpacked.sealed, vmk, prepared.recordContext, prepared.verified.digest, prepared.request.scheme)
}
