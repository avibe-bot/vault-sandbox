import { sha256 } from "@noble/hashes/sha2.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { BUILD, RpcError } from "./rpc"
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
import { verifyBitcoinSigningContext, type BitcoinReviewFacts } from "./bitcoin"
import { assertBitcoinSignRequestLimits } from "./bitcoinResourceLimits"
import { closeBitcoinEcdsaSignature, isBitcoinEcdsaContext, verifyBitcoinEcdsaContext } from "./bitcoinEcdsa"
import { hdEnvelopeFingerprint } from "./protectedHd"
import { COMPILED_BITCOIN_SUPPORT } from "./bitcoinSupport"
import { copyExactMessage } from "./exactMessage"
import { bitcoinEcdsaSigningReview, bitcoinSigningReview, evmSigningReview, solanaSigningReview } from "./signingReviewFacts"
import { eip712SigningReview } from "./eip712Review"
import { parseSigningReview, type SigningReview } from "./signingReview"
import { hdSigningIdentity, signHdRequest, withVerifiedHdKey, type HdSigningIdentity } from "./protectedHdSign"
import { parseSolanaMessage, SolanaMessageError } from "./solana/message"
import {
  base64ToBytes, bytesToBase64, bytesFromHex, deriveSigningAddresses, openProtected, openRootMetadata, parseSignatureScheme, protectedRecordContextFromMetadata,
  signDigest, signProtectedDigest, signProtectedEd25519Message, unpackProtectedRecord,
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
  assertBitcoinSignRequestLimits(source)
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
  const recordMetadata = unpackProtectedRecord(request.material.envelope).recordMetadata
  const hd = recordMetadata?.kind === "hd-seed" ? hdSigningIdentity(request, recordMetadata) : undefined
  if (hd && hd.publicKey !== publicKey) invalidBinding()
  const bitcoinEcdsa = isBitcoinEcdsaContext(request.signingContext)
  fields(release, ["name", "scheme", message ? "messageHex" : "digest", "publicKey", "signingContext", ...(hd || bitcoinEcdsa ? ["signingKey"] : []), ...(hd ? ["derivation"] : []), ...(bitcoinEcdsa ? ["sandboxCohort"] : [])], "sign context.release")
  if (bitcoinEcdsa && isBitcoinEcdsaContext(request.signingContext)) {
    const supported = hd ? COMPILED_BITCOIN_SUPPORT.hdInputTypes : COMPILED_BITCOIN_SUPPORT.ordinaryInputTypes
    if (!(["p2pkh", "p2wpkh", "p2tr"] as const).every((type) => supported.includes(type) && COMPILED_BITCOIN_SUPPORT.ecdsaReturnTypes.includes(type))) invalidBinding()
    const binding = record(release.signingKey, "sign context.release.signingKey")
    fields(binding, ["secret_id", "public_key", "envelope_sha256"], "sign context.release.signingKey")
    const cohort = record(release.sandboxCohort, "sign context.release.sandboxCohort")
    fields(cohort, ["buildHash", "manifestHash"], "sign context.release.sandboxCohort")
    if (Object.keys(binding).length !== 3 || typeof binding.secret_id !== "string" || binding.secret_id.length === 0
      || !/^(02|03)[0-9a-f]{64}$/.test(publicKey) || binding.public_key !== publicKey || release.publicKey !== publicKey
      || binding.envelope_sha256 !== hdEnvelopeFingerprint(request.material.envelope)
      || Object.keys(cohort).length !== 2 || cohort.buildHash !== BUILD.buildHash
      || typeof cohort.manifestHash !== "string" || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(cohort.manifestHash)) invalidBinding()
    const hash = cohort.manifestHash.slice(7)
    if (bytesToBase64(base64ToBytes(hash)) !== hash) invalidBinding()
    if (hd && (hd.selection.chain !== "bitcoin" || hd.selection.address_type !== request.signingContext.addressType)) invalidBinding()
  }
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

function verifyDigestContent(request: SignRequest, publicKey: string, hd?: HdSigningIdentity): VerifiedSignContent {
  const signingContext = request.signingContext
  if (signingContext.kind === "solana-transaction-v1") invalidBinding()
  if (isBitcoinEcdsaContext(signingContext)) {
    if (request.scheme !== SIGN_SCHEME_ECDSA_SECP256K1_DER) throw new RpcError("invalid_payload", "Legacy/Native Bitcoin contexts require the DER ECDSA scheme")
    const verified = verifyBitcoinEcdsaContext(signingContext, signingContext.digest, publicKey, hd?.bitcoinReturnKeys)
    assertSignBinding(request, { kind: "digest", digest: verified.digest }, publicKey)
    return {
      payload: { kind: "digest", digest: verified.digest }, display: signingSchemeDescription(request.scheme, publicKey),
      review: bitcoinEcdsaSigningReview(verified.facts, {
        scheme: request.scheme, digest: verified.digest, publicKey,
        boundary: hd ? { kind: "account", index: hd.selection.account, path: hd.path } : { kind: "key" },
      }),
    }
  }
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
  let bitcoinFacts: BitcoinReviewFacts | undefined
  if (signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const bitcoin = verifyBitcoinSigningContext(signingContext, verified.digest, publicKey)
    verified = { digest: bitcoin.digest, challenge: verified.challenge, display: bitcoin.display }
    bitcoinFacts = bitcoin.facts
  }
  assertSignBinding(request, { kind: "digest", digest: verified.digest }, publicKey)
  return {
    payload: { kind: "digest", digest: verified.digest },
    display: `${signingSchemeDescription(request.scheme, publicKey)}\nscheme: ${request.scheme}\n${verified.display}`,
    ...(verified.evm ? { review: evmSigningReview(verified.evm, { publicKey, scheme: request.scheme, digest: verified.digest }) } : {}),
    ...(bitcoinFacts ? { review: bitcoinSigningReview(bitcoinFacts, { scheme: request.scheme, digest: verified.digest }) } : {}),
    ...typedDataReview(verified.typedData, { publicKey, scheme: request.scheme, digest: verified.digest }),
  }
}

/**
 * The structured review of verified EIP-712 typed data. Display only: a shape the
 * review cannot describe keeps the prose display, and is never refused for it.
 */
function typedDataReview(typedData: unknown, signing: { publicKey: string; scheme: SignatureScheme; digest: string }): { review?: SigningReview } {
  if (typedData === undefined) return {}
  try {
    const review = eip712SigningReview(typedData, signing)
    // Only a review the authorization window will accept, as it will receive it.
    parseSigningReview(JSON.parse(JSON.stringify(review)))
    return { review }
  } catch {
    return {}
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
  const hd = unpacked.recordMetadata?.kind === "hd-seed" ? hdSigningIdentity(request, unpacked.recordMetadata) : undefined
  const identity = hd ? { name: request.material.name, kind: "keypair" as const, publicKey: hd.publicKey,
    ...(hd.selection.chain === "solana" ? { curve: "ed25519" as const } : {}) } : recordContext
  assertSigningIdentity(request.scheme, request.signingContext, identity)
  const publicKey = identity.publicKey!
  const content = request.signingContext.kind === "solana-transaction-v1"
    ? verifySolanaContent(request, publicKey)
    : verifyDigestContent(request, publicKey, hd)
  if (hd && !isBitcoinEcdsaContext(request.signingContext)) {
    // Required HD identity is independent of structured-content coverage. A
    // valid EIP-712 shape may use the existing prose fallback, but it must still
    // show the authenticated account, fixed path and actual signing address.
    const value = `#${hd.selection.account} · ${hd.path}${hd.selection.chain === "bitcoin" ? " · Taproot" : ""}`
    if (content.review) {
      const fields = [{ label: "review.field.walletAccount" as const, value }]
      content.review = { ...content.review, summary: [...content.review.summary, ...fields], details: [{ title: "review.group.hdAccount", fields }, ...content.review.details] }
    } else if (typeof content.display === "string") {
      // Only EVM typed-data can currently reach the supported HD prose fallback.
      const address = deriveSigningAddresses(hd.publicKey).eth
      if (!address || hd.selection.chain !== "evm") invalidBinding()
      content.display = `${t("review.field.walletAccount")}: ${value}\n${t("review.field.signingAddress")}: ${address}\n\n${content.display}`
    }
  }
  return { unpacked, recordContext, content, ...(hd ? { hd } : {}) }
}

export function prepareSignRequest(payload: unknown) {
  const request = parseSignRequest(payload)
  const { unpacked, recordContext, content } = verifySignRequest(request)
  // A fresh passkey binds the complete daemon-approved request, not only a
  // digest or message which could be shared by two schemes or keys.
  const challenge = signRequestChallenge(request)
  return freeze({ request, verified: content, unpacked, recordContext, challenge: [...challenge], ...(unpacked.recordMetadata?.kind === "hd-seed" ? { hd: hdSigningIdentity(request, unpacked.recordMetadata) } : {}) })
}

export type PreparedSignRequest = ReturnType<typeof prepareSignRequest>

/**
 * Re-derive everything from the request itself. A prepared object is a cache
 * for the prompt; its record identity, payload, review and display are not
 * inputs here, so a forged or stale one cannot choose what is signed.
 */
async function revalidateSignRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string, verifyOpenedKey = true) {
  const request = parseSignRequest(prepared.request)
  const current = verifySignRequest(request)
  // What was reviewed is what is about to be signed.
  if (!prepared.verified || stableJson(prepared.verified.payload) !== stableJson(current.content.payload)) invalidBinding()
  const rootMetadata = await openRootMetadata(wrapMeta, vmk)
  verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "sign" })
  assertSignedOperationContextsConsumable([request.context])
  if (verifyOpenedKey) {
    if (current.hd) await withVerifiedHdKey({ sealed: current.unpacked.sealed, vmk, context: current.recordContext, identity: current.hd }, () => undefined)
    else if (isBitcoinEcdsaContext(request.signingContext)) await withVerifiedOrdinaryBitcoinKey(current, vmk, () => undefined)
  }
  return { request, ...current }
}

/** Returns the freshly verified content the prompt must show; never the cached one. */
export async function verifyPreparedSignRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string): Promise<VerifiedSignContent> {
  return (await revalidateSignRequest(prepared, vmk, wrapMeta)).content
}

/** New ordinary Bitcoin facts must be authenticated from the opened scalar before review/UV, not only before signing. */
async function withVerifiedOrdinaryBitcoinKey<T>(current: ReturnType<typeof verifySignRequest>, vmk: Uint8Array, operation: (key: Uint8Array) => T): Promise<T> {
  const { recordContext } = current
  if (recordContext.kind !== "keypair" || !recordContext.publicKey || recordContext.curve === "ed25519") invalidBinding()
  const key = await openProtected(current.unpacked.sealed, vmk, recordContext)
  try {
    if (bytesToHex(secp256k1.getPublicKey(key, true)) !== recordContext.publicKey) invalidBinding()
    return operation(key)
  } finally { key.fill(0) }
}

/** Called only inside main.ts's fresh-passkey R3 authorization callback. */
export async function signPreparedRequest(prepared: PreparedSignRequest, vmk: Uint8Array, wrapMeta: string, assertCurrent?: () => void) {
  // Revalidate at the use boundary after the asynchronous approval ceremony,
  // and sign what that revalidation produced.
  // NEW Bitcoin authenticates the opened scalar/seed in the final synchronous
  // custody callback below; avoid opening it once merely to throw it away here.
  const current = await revalidateSignRequest(prepared, vmk, wrapMeta, !isBitcoinEcdsaContext(prepared.request.signingContext))
  const { request, content, unpacked, recordContext, hd } = current
  if (isBitcoinEcdsaContext(request.signingContext)) {
    if (!assertCurrent || content.payload.kind !== "digest") throw new RpcError("invalid_sign_binding", "new Bitcoin signing requires the current scoped authorization lease")
    const publicKey = hd?.publicKey ?? recordContext.publicKey!
    const digest = content.payload.digest
    const signAndClose = (key: Uint8Array) => {
      // No await from these lease/expiry/replay checks through one signature and
      // complete local public closure. A failure returns nothing and consumes nothing.
      assertCurrent()
      assertSignedOperationContextsConsumable([request.context])
      const result = signDigest(key, digest, request.scheme)
      closeBitcoinEcdsaSignature(request.signingContext, digest, publicKey, result.signature, hd?.bitcoinReturnKeys)
      assertCurrent()
      return result
    }
    return hd
      ? withVerifiedHdKey({ sealed: unpacked.sealed, vmk, context: recordContext, identity: hd }, signAndClose)
      : withVerifiedOrdinaryBitcoinKey(current, vmk, signAndClose)
  }
  if (hd) return signHdRequest({ request, sealed: unpacked.sealed, vmk, context: recordContext, identity: hd, payload: content.payload })
  if (content.payload.kind === "message") {
    return signProtectedEd25519Message(unpacked.sealed, vmk, recordContext, content.payload.messageHex)
  }
  return signProtectedDigest(unpacked.sealed, vmk, recordContext, content.payload.digest, request.scheme)
}
