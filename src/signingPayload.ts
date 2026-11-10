import { assertCanonicalJson } from "./canonicalJson"
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

/** Wire validation ONLY. Does not parse or approve Solana structure or instruction content. */
export function parseSolanaSigningContext(value: unknown): SolanaTransactionSigningContext {
  assertCanonicalJson(value)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RpcError("invalid_payload", "Solana signing context must be an object")
  const record = value as Record<string, unknown>
  if (record.kind !== "solana-transaction-v1"
    || Object.keys(record).some((key) => key !== "kind" && key !== "messageHex")
    || typeof record.messageHex !== "string" || !/^(?:[0-9a-f]{2})+$/.test(record.messageHex)) {
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

/** Remove only when a real structural verifier AND trusted review are connected. */
export function assertProductionSigningEnabled(scheme: SignatureScheme, context: SigningContext): asserts context is VerifiableSigningContext {
  if (scheme === SIGN_SCHEME_ED25519 || context.kind === "solana-transaction-v1") {
    throw new RpcError("unsupported_signing_context", "protected Solana signing is not enabled in this sandbox release")
  }
}
