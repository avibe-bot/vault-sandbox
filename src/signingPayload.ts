import { assertCanonicalJson } from "./canonicalJson"
import { assertExactMessageHexSize } from "./exactMessage"
import { RpcError } from "./rpc"
import type { VerifiableSigningContext } from "./signingContext"
import { parseSigningCurve, SIGN_SCHEME_ED25519, type ProtectedRecordContext, type SignatureScheme } from "./vaultCrypto"

/** v1 is the Avibe contract version, not the Solana message version. */
export type SolanaTransactionSigningContext = {
  kind: "solana-transaction-v1"
  messageHex: string
}

export type SigningContext = VerifiableSigningContext | SolanaTransactionSigningContext
export type SigningPayload = { kind: "digest"; digest: string } | { kind: "message"; messageHex: string }

/** Cheap preflight for context/release message fields, before canonical scanning or copying. */
export function assertSigningMessageSize(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  const messageHex = (value as Record<string, unknown>).messageHex
  if (typeof messageHex === "string") {
    try { assertExactMessageHexSize(messageHex) } catch {
      throw new RpcError("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit")
    }
  }
}

/** Wire validation ONLY. Structure and signer membership are verified by signRequest.ts with the Solana parser. */
export function parseSolanaSigningContext(value: unknown): SolanaTransactionSigningContext {
  assertSigningMessageSize(value)
  assertCanonicalJson(value)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RpcError("invalid_payload", "Solana signing context must be an object")
  const record = value as Record<string, unknown>
  if (record.kind !== "solana-transaction-v1"
    || Object.keys(record).some((key) => key !== "kind" && key !== "messageHex")
    || typeof record.messageHex !== "string" || record.messageHex.length === 0
    || record.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(record.messageHex)) {
    throw new RpcError("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias")
  }
  return { kind: "solana-transaction-v1", messageHex: record.messageHex }
}

export function assertSigningIdentity(scheme: SignatureScheme, context: SigningContext, record: ProtectedRecordContext): void {
  if (record.kind !== "keypair" || !record.publicKey) throw new Error("protected signing requires a keypair protected record")
  const curve = parseSigningCurve(record.curve)
  if (scheme === SIGN_SCHEME_ED25519 || context.kind === "solana-transaction-v1" || curve === "ed25519") {
    if (scheme !== SIGN_SCHEME_ED25519 || context.kind !== "solana-transaction-v1" || curve !== "ed25519") {
      throw new RpcError("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together")
    }
    parseSolanaSigningContext(context)
  }
}
