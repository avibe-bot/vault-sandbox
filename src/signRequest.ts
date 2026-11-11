import { sha256 } from "@noble/hashes/sha2.js"
import { RpcError } from "./rpc"
import { t } from "./i18n"
import { assertCanonicalJson } from "./canonicalJson"
import {
  assertSignedOperationContextPreview, assertSignedOperationContextsConsumable,
  parseSignedOperationContext, signedOperationContextMessage, stableJson, verifySignedOperationContext,
  type SignedOperationContext,
} from "./operationContext"
import { verifySigningContext } from "./signingContext"
import {
  assertSigningIdentity, assertSigningMessageSize, parseSolanaSigningContext,
  type SigningContext, type SigningPayload,
} from "./signingPayload"
import { verifyBitcoinSigningContext } from "./bitcoin"
import { copyExactMessage } from "./exactMessage"
import { evmSigningReview, solanaSigningReview } from "./signingReviewFacts"
import type { SigningReview } from "./signingReview"
import { parseSolanaMessage, SolanaMessageError } from "./solana/message"
import {
  bytesFromHex, openRootMetadata, parseSignatureScheme, protectedRecordContextFromMetadata,
  signProtectedDigest, signProtectedEd25519Message, unpackProtectedRecord,
  SIGN_SCHEME_ECDSA_SECP256K1_DER, SIGN_SCHEME_ECDSA_SECP256K1_RECOVERABLE,
  SIGN_SCHEME_SCHNORR_SECP256K1_BIP340, SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH,
  type ProtectedRecordEnvelope, type SignatureScheme,
} from "./vaultCrypto"

export type SignRequest<C extends SigningContext = SigningContext> = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  scheme: SignatureScheme
  signingContext: C
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

function assertSignRequestMessageSizes(signingContext: unknown, context: unknown): void {
  assertSigningMessageSize(signingContext)
  if (context && typeof context === "object") {
    const release = (context as Record<string, unknown>).release
    assertSigningMessageSize(release)
    if (release && typeof release === "object") assertSigningMessageSize((release as Record<string, unknown>).signingContext)
  }
}

export function parseSignRequest(payload: unknown): SignRequest {
  // Own one immutable snapshot across async authorization. Never authenticate
  // one object and later sign a mutable caller-owned replacement.
  const source = record(payload, "sign request")
  // Bound every exact-message copy before the canonical Unicode walk and the
  // immutable clone. A signed release carries both direct and nested bytes.
  assertSignRequestMessageSizes(source.signingContext, source.context)
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
  const signingContext = record(input.signingContext, "signingContext") as SigningContext
  if (signingContext.kind === "solana-transaction-v1") parseSolanaSigningContext(signingContext)
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
    signingContext,
    context,
  })
}

function invalidBinding(): never {
  throw new RpcError("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request")
}

export function assertSignBinding(request: SignRequest, payload: SigningPayload, publicKey: string): void {
  assertSignRequestMessageSizes(request.signingContext, request.context)
  assertSignedOperationContextPreview({ context: request.context, expectedPurpose: "sign", secret: { name: request.material.name, kind: "keypair" } })
  const release = request.context.release
  if (!release || Array.isArray(release)) invalidBinding()
  const message = payload.kind === "message"
  if (!message && (payload.kind !== "digest" || !/^[0-9a-f]{64}$/.test(payload.digest))) invalidBinding()
  fields(release, ["name", "scheme", message ? "messageHex" : "digest", "publicKey", "signingContext"], "sign context.release")
  if (message) {
    const context = parseSolanaSigningContext(request.signingContext)
    if (payload.messageHex !== context.messageHex || release.messageHex !== payload.messageHex
      || request.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(publicKey) || release.publicKey !== publicKey) invalidBinding()
  } else if (request.scheme === "ed25519" || request.signingContext.kind === "solana-transaction-v1"
    || release.digest !== payload.digest) invalidBinding()
  if (release.name !== request.material.name || release.scheme !== request.scheme
    || typeof release.publicKey !== "string"
    || release.publicKey.toLowerCase() !== publicKey.toLowerCase()
    || !release.signingContext || stableJson(release.signingContext) !== stableJson(request.signingContext)) {
    invalidBinding()
  }
}

/** The UV challenge always binds the whole daemon operation, including the exact message. */
export function signRequestChallenge(request: SignRequest): Uint8Array {
  assertSignRequestMessageSizes(request.signingContext, request.context)
  return sha256(new TextEncoder().encode(signedOperationContextMessage(request.context)))
}

/** Labels are computed locally from the actual scheme and record key, not parent display text. */
export function signingSchemeDescription(scheme: SignatureScheme, publicKey: string): string {
  parseSignatureScheme(scheme)
  if (scheme === "ed25519") throw new Error("Ed25519 exact-message signing is reviewed structurally and has no prose description")
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

/**
 * What one request asks the key to sign, and how it is reviewed. An exact
 * message is always reviewed structurally; a digest keeps its prose display,
 * with a structured review beside it when the verifier provides one.
 */
export type VerifiedSignContent =
  | { payload: Extract<SigningPayload, { kind: "message" }>; review: SigningReview; display?: undefined }
  | { payload: Extract<SigningPayload, { kind: "digest" }>; display: string; review?: SigningReview }

/**
 * Structural verification of a Solana request: the bytes are one canonical
 * legacy or v0 message, the signed transaction fits a packet, and the protected
 * record's own key is one of its required signers. Instruction content is not
 * policed: what is not decoded is reviewed raw.
 */
function verifySolanaContent(request: SignRequest, publicKey: string): VerifiedSignContent {
  const context = parseSolanaSigningContext(request.signingContext)
  // Bind before interpreting: the daemon-signed release names these exact bytes and this key.
  assertSignBinding(request, { kind: "message", messageHex: context.messageHex }, publicKey)
  let facts
  try {
    facts = parseSolanaMessage(copyExactMessage(context.messageHex), bytesFromHex(publicKey))
  } catch (error) {
    if (error instanceof SolanaMessageError) {
      throw new RpcError("invalid_payload", `Solana message cannot be signed (${error.code}): ${error.message}`)
    }
    throw error
  }
  // The parser describes its input and never re-serializes: what was parsed is what is signed.
  if (facts.messageHex !== context.messageHex) invalidBinding()
  return { payload: { kind: "message", messageHex: facts.messageHex }, review: solanaSigningReview(facts) }
}

function verifyDigestContent(request: SignRequest, publicKey: string): VerifiedSignContent {
  const signingContext = request.signingContext
  if (signingContext.kind === "solana-transaction-v1") invalidBinding()
  let verified = verifySigningContext(signingContext)
  if (signingContext.kind === "bitcoin-taproot-keypath-v1") {
    if (request.scheme !== SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH) {
      throw new RpcError("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme")
    }
  } else if (request.scheme === SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH) {
    throw new RpcError("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context")
  } else if (signingContext.kind !== "avault-agent-operation"
    && request.scheme !== SIGN_SCHEME_ECDSA_SECP256K1_RECOVERABLE
    && request.scheme !== SIGN_SCHEME_ECDSA_SECP256K1_DER) {
    throw new RpcError("invalid_payload", "EVM signing contexts require an ECDSA scheme")
  }
  if (signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const bitcoin = verifyBitcoinSigningContext(signingContext, verified.digest, publicKey)
    verified = { digest: bitcoin.digest, challenge: verified.challenge, display: bitcoin.display }
  }
  assertSignBinding(request, { kind: "digest", digest: verified.digest }, publicKey)
  return {
    payload: { kind: "digest", digest: verified.digest },
    display: `${signingSchemeDescription(request.scheme, publicKey)}\nscheme: ${request.scheme}\n${verified.display}`,
    ...(verified.evm ? { review: evmSigningReview(verified.evm, { publicKey, scheme: request.scheme, digest: verified.digest }) } : {}),
  }
}

/**
 * The one route from a request to something signable. It takes nothing on
 * trust but the request and its envelope: the record identity is read from the
 * envelope's authenticated metadata, scheme, context and curve must agree, and
 * the content is verified for that record's own public key.
 */
function verifySignRequest(request: SignRequest) {
  const unpacked = unpackProtectedRecord(request.material.envelope)
  const recordContext = protectedRecordContextFromMetadata(request.material.name, unpacked.recordMetadata)
  assertSigningIdentity(request.scheme, request.signingContext, recordContext)
  const publicKey = recordContext.publicKey!
  const content = request.signingContext.kind === "solana-transaction-v1"
    ? verifySolanaContent(request, publicKey)
    : verifyDigestContent(request, publicKey)
  return { unpacked, recordContext, content }
}

export function prepareSignRequest(payload: unknown) {
  const request = parseSignRequest(payload)
  const { unpacked, recordContext, content } = verifySignRequest(request)
  // A fresh passkey binds the complete daemon-approved request, not only a
  // digest or message which could be shared by two schemes or keys.
  const challenge = signRequestChallenge(request)
  return freeze({ request, verified: content, unpacked, recordContext, challenge: [...challenge] })
}

export type PreparedSignRequest = ReturnType<typeof prepareSignRequest>

/**
 * Re-derive everything from the request itself. A prepared object is a cache
 * for the prompt; its record identity, payload, review and display are not
 * inputs here, so a forged or stale one cannot choose what is signed.
 */
async function revalidateSignRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string) {
  const request = parseSignRequest(prepared.request)
  const current = verifySignRequest(request)
  // What was reviewed is what is about to be signed.
  if (!prepared.verified || stableJson(prepared.verified.payload) !== stableJson(current.content.payload)) invalidBinding()
  const rootMetadata = await openRootMetadata(wrapMeta, vmk)
  verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "sign" })
  assertSignedOperationContextsConsumable([request.context])
  return { request, ...current }
}

/** Returns the freshly verified content the prompt must show; never the cached one. */
export async function verifyPreparedSignRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string): Promise<VerifiedSignContent> {
  return (await revalidateSignRequest(prepared, vmk, wrapMeta)).content
}

/** Called only inside main.ts's fresh-passkey R3 authorization callback. */
export async function signPreparedRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string) {
  // Revalidate at the use boundary after the asynchronous approval ceremony,
  // and sign what that revalidation produced.
  const { request, content, unpacked, recordContext } = await revalidateSignRequest(prepared, vmk, wrapMeta)
  if (content.payload.kind === "message") {
    return signProtectedEd25519Message(unpacked.sealed, vmk, recordContext, content.payload.messageHex)
  }
  return signProtectedDigest(unpacked.sealed, vmk, recordContext, content.payload.digest, request.scheme)
}
