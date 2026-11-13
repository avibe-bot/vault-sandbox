import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { decodeHdPayload, hdEnvelopeFingerprint, hdPath, parseHdDerivation, wipeHdPayload, withHdSigningKey, type HdDerivation, type HdRecordMetadata } from "./protectedHd"
import { openProtected, signDigest, signEd25519Message, type ProtectedRecordContext, type ProtectedSealed, type SignatureResult } from "./vaultCrypto"
import { RpcError } from "./rpc"
import type { SignRequest } from "./signRequest"

export type HdSigningIdentity = { selection: HdDerivation; publicKey: string; path: string }
export function hdSigningIdentity(request: SignRequest, record: HdRecordMetadata): HdSigningIdentity {
  try {
    const selection = parseHdDerivation(request.context.release?.derivation)
    const publicKey = record.accounts[selection.account][selection.chain]
    const kind = request.signingContext.kind
    if (selection.chain === "bitcoin" ? request.scheme !== "schnorr-secp256k1-bip341-keypath" || kind !== "bitcoin-taproot-keypath-v1"
      : selection.chain === "solana" ? request.scheme !== "ed25519" || kind !== "solana-transaction-v1"
      : request.scheme !== "ecdsa-secp256k1-recoverable" || (kind !== "evm-transaction" && kind !== "eip-712-typed-data")) throw new Error("protected HD chain/scheme/context mismatch")
    const key = request.context.release?.signingKey
    if (!key || typeof key !== "object" || Array.isArray(key)) throw new Error("missing protected HD signing key binding")
    const binding = key as Record<string, unknown>
    if (Object.keys(binding).length !== 3 || typeof binding.secret_id !== "string" || binding.secret_id.length === 0
      || binding.public_key !== publicKey || request.context.release?.publicKey !== publicKey
      || typeof binding.envelope_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(binding.envelope_sha256)
      || binding.envelope_sha256 !== hdEnvelopeFingerprint(request.material.envelope)) throw new Error("protected HD signing identity mismatch")
    return { selection, publicKey, path: hdPath(selection.chain, selection.account) }
  } catch {
    throw new RpcError("invalid_sign_binding", "protected HD signing requires the exact signed selection/key/envelope binding")
  }
}
/** Authenticates payload and derives the actual selected key; secret bytes never escape. */
export async function withVerifiedHdKey<T>(input: {
  sealed: ProtectedSealed; vmk: Uint8Array; context: ProtectedRecordContext; identity: HdSigningIdentity;
}, operation: (key: Uint8Array) => T): Promise<T> {
  if (input.context.kind !== "hd-seed") throw new Error("protected HD custody requires HD metadata")
  const opened = await openProtected(input.sealed, input.vmk, input.context)
  let payload: ReturnType<typeof decodeHdPayload> | undefined
  try {
    payload = decodeHdPayload(opened)
    return withHdSigningKey(payload.seed, input.identity.selection, (key) => {
      const actual = bytesToHex(input.identity.selection.chain === "solana" ? ed25519.getPublicKey(key) : secp256k1.getPublicKey(key, true))
      if (actual !== input.identity.publicKey) throw new RpcError("invalid_sign_binding", "protected HD seed does not match the selected authenticated public key")
      return operation(key)
    })
  } finally { opened.fill(0); wipeHdPayload(payload) }
}
export async function signHdRequest(input: {
  request: SignRequest; sealed: ProtectedSealed; vmk: Uint8Array; context: ProtectedRecordContext; identity: HdSigningIdentity;
  payload: { kind: "digest"; digest: string } | { kind: "message"; messageHex: string };
}): Promise<SignatureResult> {
  return withVerifiedHdKey(input, (key) => input.payload.kind === "message"
    ? signEd25519Message(key, input.payload.messageHex)
    : signDigest(key, input.payload.digest, input.request.scheme))
}
