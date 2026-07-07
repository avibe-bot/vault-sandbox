import { sha256 } from "@noble/hashes/sha2.js"
import { hashTypedData, keccak256, serializeTransaction } from "viem"

import { bytesFromHex, bytesToHexString } from "./vaultCrypto"

export type VerifiableSigningContext =
  | {
      kind: "evm-transaction"
      chainId: string
      unsignedTransaction: unknown
      digestAlgorithm: "keccak256"
      digest: string
    }
  | {
      kind: "eip-712-typed-data"
      typedData: unknown
      digestAlgorithm: "eip712"
      digest: string
    }
  | {
      kind: "avault-agent-operation"
      canonicalPreimage: string
      digestAlgorithm: "avault-operation-hash-v1"
      digest: string
    }

export type VerifiedSigningContext = {
  digest: string
  challenge: Uint8Array
  display: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("signing context is malformed")
  return value as Record<string, unknown>
}

function normalizeHex(value: string): string {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`
}

function assertDigest(expected: string, computed: string): string {
  const normalizedExpected = normalizeHex(expected)
  const normalizedComputed = normalizeHex(computed)
  if (normalizedExpected !== normalizedComputed) {
    throw new Error("signing digest does not match verified context")
  }
  return normalizedComputed.slice(2)
}

function formatValue(value: unknown): string {
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === undefined || value === null) return ""
  return JSON.stringify(value)
}

export function verifySigningContext(context: VerifiableSigningContext): VerifiedSigningContext {
  switch (context.kind) {
    case "evm-transaction": {
      if (context.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm")
      const tx = asRecord(context.unsignedTransaction)
      const serialized = serializeTransaction(tx as Parameters<typeof serializeTransaction>[0])
      const computed = assertDigest(context.digest, keccak256(serialized))
      if (tx.chainId !== undefined && String(tx.chainId) !== String(context.chainId)) {
        throw new Error("EVM transaction chain id mismatch")
      }
      return {
        digest: computed,
        challenge: bytesFromHex(computed),
        display: [
          `EVM transaction on chain ${context.chainId}`,
          `to: ${formatValue(tx.to) || "(contract creation)"}`,
          `value: ${formatValue(tx.value) || "0"}`,
          `nonce: ${formatValue(tx.nonce)}`,
        ].join("\n"),
      }
    }
    case "eip-712-typed-data": {
      if (context.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm")
      const typed = asRecord(context.typedData)
      const computed = assertDigest(context.digest, hashTypedData(typed as Parameters<typeof hashTypedData>[0]))
      return {
        digest: computed,
        challenge: bytesFromHex(computed),
        display: [
          "EIP-712 typed data",
          `domain: ${JSON.stringify(typed.domain ?? {})}`,
          `primaryType: ${formatValue(typed.primaryType)}`,
        ].join("\n"),
      }
    }
    case "avault-agent-operation": {
      if (context.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm")
      if (typeof context.canonicalPreimage !== "string" || context.canonicalPreimage.length === 0) {
        throw new Error("canonical preimage is required")
      }
      const computed = assertDigest(context.digest, bytesToHexString(sha256(new TextEncoder().encode(context.canonicalPreimage))))
      return {
        digest: computed,
        challenge: bytesFromHex(computed),
        display: ["Avault agent operation", context.canonicalPreimage].join("\n"),
      }
    }
    default:
      throw new Error("unsupported signing context")
  }
}
