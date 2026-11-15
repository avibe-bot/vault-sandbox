import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { decodeHdPayload, hdEnvelopeFingerprint, hdPath, parseHdDerivation, wipeHdPayload, withHdSigningKey, type HdDerivation, type HdRecordMetadata } from "./protectedHd"
import { openProtected, signDigest, signEd25519Message, type ProtectedRecordContext, type ProtectedSealed, type SignatureResult } from "./vaultCrypto"
import { RpcError } from "./rpc"
import type { SignRequest } from "./signRequest"
import type { BitcoinReturnKeys } from "./bitcoinEcdsa"

export type HdSigningIdentity = { selection: HdDerivation; publicKey: string; path: string; bitcoinReturnKeys?: BitcoinReturnKeys }
export function hdSigningIdentity(request: SignRequest, record: HdRecordMetadata): HdSigningIdentity {
  try {
    const selection = parseHdDerivation(request.context.release?.derivation)
    const row = record.accounts[selection.account]
    const bitcoinType = selection.chain === "bitcoin" ? selection.address_type : undefined
    const publicKey = bitcoinType === "p2pkh" ? row.bitcoin_p2pkh : bitcoinType === "p2wpkh" ? row.bitcoin_p2wpkh : row[selection.chain]
    const kind = request.signingContext.kind
    const bitcoinMatches = bitcoinType === "p2tr"
      ? request.scheme === "schnorr-secp256k1-bip341-keypath" && kind === "bitcoin-taproot-keypath-v1"
      : request.scheme === "ecdsa-secp256k1-der" && kind === (bitcoinType === "p2pkh" ? "bitcoin-p2pkh-v1" : "bitcoin-p2wpkh-v1")
    if (selection.chain === "bitcoin" ? !bitcoinMatches
      : selection.chain === "solana" ? request.scheme !== "ed25519" || kind !== "solana-transaction-v1"
      : request.scheme !== "ecdsa-secp256k1-recoverable" || (kind !== "evm-transaction" && kind !== "eip-712-typed-data")) throw new Error("protected HD chain/scheme/context mismatch")
    const key = request.context.release?.signingKey
    if (!key || typeof key !== "object" || Array.isArray(key)) throw new Error("missing protected HD signing key binding")
    const binding = key as Record<string, unknown>
    if (Object.keys(binding).length !== 3 || typeof binding.secret_id !== "string" || binding.secret_id.length === 0
      || binding.public_key !== publicKey || request.context.release?.publicKey !== publicKey
      || typeof binding.envelope_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(binding.envelope_sha256)
      || binding.envelope_sha256 !== hdEnvelopeFingerprint(request.material.envelope)) throw new Error("protected HD signing identity mismatch")
    return { selection, publicKey, path: hdPath(selection.chain, selection.account, bitcoinType),
      ...(bitcoinType && bitcoinType !== "p2tr" ? { bitcoinReturnKeys: { p2pkh: row.bitcoin_p2pkh, p2wpkh: row.bitcoin_p2wpkh, p2tr: row.bitcoin } } : {}),
    }
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
      const selection = input.identity.selection
      const siblings = input.identity.bitcoinReturnKeys
      if (selection.chain === "bitcoin" && selection.address_type !== "p2tr") {
        if (!siblings || siblings[selection.address_type] !== actual) throw new RpcError("invalid_sign_binding", "protected HD Bitcoin return identity is missing")
        // Prove only the selected receiving index's three Bitcoin purposes.
        // No EVM/Solana derivation, whole-table proof or reusable verified cache.
        for (const type of ["p2pkh", "p2wpkh", "p2tr"] as const) {
          if (type === selection.address_type) continue
          withHdSigningKey(payload!.seed, { chain: "bitcoin", account: selection.account, address_type: type }, (sibling) => {
            if (bytesToHex(secp256k1.getPublicKey(sibling, true)) !== siblings[type]) throw new RpcError("invalid_sign_binding", "protected HD seed does not match an authenticated Bitcoin sibling point")
          })
        }
      }
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
