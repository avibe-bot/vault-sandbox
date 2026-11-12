import { sha256 } from "@noble/hashes/sha2.js"
import {
  decodeAbiParameters,
  encodeAbiParameters,
  getSerializedTransactionType,
  hashTypedData,
  keccak256,
  parseAbi,
  serializeTransaction,
  toFunctionSelector,
  type AbiFunction,
} from "viem"

import { bytesFromHex, bytesToHexString } from "./vaultCrypto"
import { assertCanonicalJson } from "./canonicalJson"
import { verifyBitcoinSigningContext, type BitcoinSigningContext } from "./bitcoin"
import { t } from "./i18n"

export const AGENT_OPERATION_DOMAIN = "avault-agent-operation:v1\n"

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
  | BitcoinSigningContext

export type VerifiedSigningContext = {
  digest: string
  challenge: Uint8Array
  display: string
  /** Structured EVM transaction review; present only for evm-transaction. */
  evm?: EvmTransactionReview
  /** The typed data exactly as hashed to `digest`; present only for eip-712-typed-data. */
  typedData?: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("signing context is malformed")
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
  return stableJson(value)
}

function stableJson(value: unknown): string {
  if (typeof value === "bigint") return JSON.stringify(value.toString())
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

// Built-in calls only. Matching one is a structural ABI decode of these bytes,
// not verification of the contract's actual behavior.
const knownTokenAbi = parseAbi([
  "function approve(address spender,uint256 amount)",
  // A common extension, not an EIP-20 method: the amount is added to the current allowance.
  "function increaseAllowance(address spender,uint256 addedValue)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)",
])

/** Stable identifiers for the built-in calls; consumers localize them. */
export type EvmKnownCall =
  | "approve"
  | "increaseAllowance"
  | "transfer"
  | "transferFrom"
  | "permit"
  | "setApprovalForAll"
  | "safeTransferFrom"
  | "safeTransferFromWithData"

export type EvmDecodedArgument = {
  /** ABI parameter name from the built-in signature, e.g. "spender". */
  name: string
  /** ABI type, e.g. "uint256". */
  type: string
  value: string
}

export type EvmDecodedCall = {
  call: EvmKnownCall
  /** Canonical ABI signature, e.g. "approve(address,uint256)". */
  signature: string
  /** Every argument, in ABI order; nothing is omitted. */
  arguments: EvmDecodedArgument[]
}

/** Structured EVM review: every serialized field, plus complete calldata. */
export type EvmTransactionReview = {
  chainId: string
  type: "legacy" | "eip1559"
  /** Checksummed as supplied; null means contract creation. */
  to: string | null
  /** Decimal integers. Absent fields are shown as the "0" they serialize to. */
  value: string
  nonce: string
  gas: string
  gasPrice?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  /** 0x + up to 4 leading calldata bytes; null when calldata is empty. */
  selector: string | null
  /** Exact unsigned serialized transaction whose keccak256 is the signed digest. */
  unsignedTransactionHex: string
  /** Complete lowercase calldata, never truncated; "0x" when empty. */
  calldata: string
  calldataBytes: number
  /**
   * Present only when the transaction calls an address and the calldata
   * re-encodes byte-for-byte under a built-in ABI. Contract creation init code
   * is never ABI-interpreted.
   */
  decoded: EvmDecodedCall | null
  /** Nonempty calldata that is not decoded: approval is blind signing. */
  blindSigning: boolean
}

const knownCallLabels: Record<EvmKnownCall, string> = {
  approve: "ERC-20/ERC-721 approve",
  increaseAllowance: "ERC-20 increaseAllowance (extension)",
  transfer: "ERC-20 transfer",
  transferFrom: "ERC-20/ERC-721 transferFrom",
  permit: "ERC-20 permit",
  setApprovalForAll: "ERC-721 setApprovalForAll",
  safeTransferFrom: "ERC-721 safeTransferFrom",
  safeTransferFromWithData: "ERC-721 safeTransferFrom",
}

const knownCalls: ReadonlyMap<string, { call: EvmKnownCall; item: AbiFunction }> = new Map(
  knownTokenAbi.map((item) => {
    const call: EvmKnownCall = item.name === "safeTransferFrom" && item.inputs.length === 4 ? "safeTransferFromWithData" : item.name
    return [toFunctionSelector(item), { call, item }] as const
  }),
)

function abiSignature(item: AbiFunction): string {
  return `${item.name}(${item.inputs.map((input) => input.type).join(",")})`
}

function asHexData(value: unknown): `0x${string}` {
  if (value === undefined || value === null || value === "" || value === "0x") return "0x"
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error("EVM transaction calldata is malformed")
  }
  return value.toLowerCase() as `0x${string}`
}

const allowedEvmTxFields = new Set([
  "chainId",
  "type",
  "to",
  "value",
  "nonce",
  "gas",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "data",
])

const allowedEip712Fields = new Set(["domain", "types", "primaryType", "message"])

function assertAllowedKeys(record: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const unsupported = Object.keys(record).filter((key) => !allowed.has(key))
  if (unsupported.length > 0) {
    throw new Error(`${label} carries unsupported field: ${unsupported.sort().join(", ")}`)
  }
}

function requireSupportedEvmType(tx: Record<string, unknown>): "legacy" | "eip1559" {
  if (tx.type !== undefined && tx.type !== "legacy" && tx.type !== "eip1559") {
    throw new Error("unsupported EVM transaction type")
  }
  const hasEip1559Fees = tx.maxFeePerGas !== undefined || tx.maxPriorityFeePerGas !== undefined
  // Field presence, not value: viem's legacy check is truthy, so zero-valued
  // EIP-1559 fees would otherwise serialize as legacy yet review as EIP-1559.
  if (tx.type === "legacy" && hasEip1559Fees) {
    throw new Error("EVM legacy transaction cannot carry maxFeePerGas or maxPriorityFeePerGas")
  }
  if (tx.type === "eip1559" || hasEip1559Fees) {
    // An EIP-1559 envelope does not serialize gasPrice: refuse it rather than
    // display a fee that the signature does not cover.
    if (tx.gasPrice !== undefined) throw new Error("EVM EIP-1559 transaction cannot carry gasPrice")
    return "eip1559"
  }
  return "legacy"
}

function requireBoundChainId(context: Extract<VerifiableSigningContext, { kind: "evm-transaction" }>, tx: Record<string, unknown>): void {
  if (tx.chainId === undefined || tx.chainId === null || tx.chainId === "") {
    throw new Error("EVM transaction chain id is required")
  }
  if (String(tx.chainId) !== String(context.chainId)) {
    throw new Error("EVM transaction chain id mismatch")
  }
}

function normalizeEvmQuantities(tx: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...tx }
  for (const field of ["chainId", "nonce", "value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]) {
    const value = tx[field]
    if (value === undefined) continue
    if (!((typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
      || (typeof value === "string" && /^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(value)))) {
      throw new Error(`EVM transaction ${field} must be an unsigned integer or integer string`)
    }
    const integer = BigInt(value)
    if (integer >= (1n << 256n)) throw new Error(`EVM transaction ${field} is out of range`)
    normalized[field] = integer
  }
  return normalized
}

/**
 * Decode only calldata that is exactly the canonical ABI encoding of a
 * built-in call. Trailing bytes, dirty padding, noncanonical offsets or short
 * arguments return null so they are reviewed raw instead of disappearing
 * behind a decoded summary.
 */
function decodeKnownCalldata(data: `0x${string}`): EvmDecodedCall | null {
  if (data.length < 10) return null
  const known = knownCalls.get(data.slice(0, 10))
  if (!known) return null
  let values: readonly unknown[]
  try {
    values = decodeAbiParameters(known.item.inputs, `0x${data.slice(10)}`)
    if (encodeAbiParameters(known.item.inputs, values).toLowerCase() !== `0x${data.slice(10)}`) return null
  } catch {
    return null
  }
  return {
    call: known.call,
    signature: abiSignature(known.item),
    arguments: known.item.inputs.map((input, index) => ({
      name: input.name ?? `arg${index}`,
      type: input.type,
      value: formatValue(values[index]),
    })),
  }
}

function evmReview(tx: Record<string, unknown>, normalized: Record<string, unknown>, serialized: string): EvmTransactionReview {
  const type = requireSupportedEvmType(tx)
  const calldata = asHexData(tx.data)
  const quantity = (field: string) => (normalized[field] === undefined ? 0n : (normalized[field] as bigint)).toString()
  const to = tx.to === undefined || tx.to === null || tx.to === "" ? null : String(tx.to)
  const decoded = to === null ? null : decodeKnownCalldata(calldata)
  return {
    chainId: quantity("chainId"),
    type,
    to,
    value: quantity("value"),
    nonce: quantity("nonce"),
    gas: quantity("gas"),
    ...(type === "legacy"
      ? { gasPrice: quantity("gasPrice") }
      : { maxFeePerGas: quantity("maxFeePerGas"), maxPriorityFeePerGas: quantity("maxPriorityFeePerGas") }),
    selector: calldata === "0x" ? null : calldata.slice(0, 10),
    unsignedTransactionHex: serialized,
    calldata,
    calldataBytes: (calldata.length - 2) / 2,
    decoded,
    blindSigning: calldata !== "0x" && decoded === null,
  }
}

function evmDisplay(review: EvmTransactionReview): string {
  const lines = [t("evm.title", { chainId: review.chainId })]
  if (review.blindSigning) lines.push(t("sign.blindNotice"))
  lines.push(
    t("evm.type", { type: review.type }),
    review.to === null ? t("evm.contractCreation") : t("evm.to", { to: review.to }),
    t("evm.value", { value: review.value }),
    t("evm.nonce", { value: review.nonce }),
    t("evm.gas", { value: review.gas }),
  )
  if (review.gasPrice !== undefined) lines.push(t("evm.gasPrice", { value: review.gasPrice }))
  if (review.maxFeePerGas !== undefined) lines.push(t("evm.maxFeePerGas", { value: review.maxFeePerGas }))
  if (review.maxPriorityFeePerGas !== undefined) lines.push(t("evm.maxPriorityFeePerGas", { value: review.maxPriorityFeePerGas }))
  if (review.decoded) {
    lines.push(t("evm.call", { call: `${knownCallLabels[review.decoded.call]} ${review.decoded.signature}` }))
    // Indented so a decoded argument such as `to` cannot read as the destination.
    for (const argument of review.decoded.arguments) lines.push(`  ${argument.name} (${argument.type}): ${argument.value}`)
  }
  lines.push(
    review.selector === null ? t("evm.selectorNone") : t("evm.selector", { selector: review.selector }),
    review.calldata === "0x" ? t("evm.calldataNone") : t("evm.calldata", { bytes: review.calldataBytes, calldata: review.calldata }),
  )
  return lines.join("\n")
}

export function verifySigningContext(context: VerifiableSigningContext): VerifiedSigningContext {
  assertCanonicalJson(context)
  const record = asRecord(context)
  const fields: Record<string, string[]> = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"],
  }
  const allowed = Object.hasOwn(fields, context.kind) ? fields[context.kind] : undefined
  if (!allowed) throw new Error("unsupported signing context")
  assertAllowedKeys(record, new Set(allowed), "signing context")
  if (typeof context.digest !== "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(context.digest)) {
    throw new Error("signing context digest must be 32 bytes")
  }
  switch (context.kind) {
    case "evm-transaction": {
      if (context.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm")
      const tx = asRecord(context.unsignedTransaction)
      assertAllowedKeys(tx, allowedEvmTxFields, "EVM transaction")
      requireBoundChainId(context, tx)
      requireSupportedEvmType(tx)
      // Normalize JSON quantity strings before viem's truthiness checks: "0"
      // must encode exactly like integer zero, not as a nonempty RLP value.
      const normalized = normalizeEvmQuantities(tx)
      const serialized = serializeTransaction(normalized as Parameters<typeof serializeTransaction>[0])
      const computed = assertDigest(context.digest, keccak256(serialized))
      const evm = evmReview(tx, normalized, serialized)
      // The reviewed envelope must be the one actually serialized and signed.
      if (getSerializedTransactionType(serialized) !== evm.type) throw new Error("EVM transaction type does not match its serialization")
      return {
        digest: computed,
        challenge: bytesFromHex(computed),
        display: evmDisplay(evm),
        evm,
      }
    }
    case "eip-712-typed-data": {
      if (context.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm")
      const typed = asRecord(context.typedData)
      assertAllowedKeys(typed, allowedEip712Fields, "EIP-712 typed data")
      const domain = asRecord(typed.domain)
      if (domain.chainId === undefined || domain.verifyingContract === undefined) {
        throw new Error("EIP-712 domain must include chainId and verifyingContract")
      }
      const computed = assertDigest(context.digest, hashTypedData(typed as Parameters<typeof hashTypedData>[0]))
      return {
        digest: computed,
        challenge: bytesFromHex(computed),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${formatValue(domain.chainId)}`,
          `domain.verifyingContract: ${formatValue(domain.verifyingContract)}`,
          `domain: ${stableJson(domain)}`,
          `types: ${stableJson(asRecord(typed.types))}`,
          `primaryType: ${formatValue(typed.primaryType)}`,
          `message: ${stableJson(asRecord(typed.message))}`,
        ].join("\n"),
        typedData: typed,
      }
    }
    case "avault-agent-operation": {
      if (context.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm")
      if (typeof context.canonicalPreimage !== "string" || !context.canonicalPreimage.startsWith(AGENT_OPERATION_DOMAIN)
        || context.canonicalPreimage.slice(AGENT_OPERATION_DOMAIN.length).trim().length === 0) {
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request")
      }
      const computed = assertDigest(context.digest, bytesToHexString(sha256(new TextEncoder().encode(context.canonicalPreimage))))
      return {
        digest: computed,
        challenge: bytesFromHex(computed),
        display: ["Avault agent operation", context.canonicalPreimage].join("\n"),
      }
    }
    case "bitcoin-taproot-keypath-v1": {
      const verified = verifyBitcoinSigningContext(context, context.digest)
      return {
        digest: verified.digest,
        challenge: bytesFromHex(verified.digest),
        display: verified.display,
      }
    }
    default:
      throw new Error("unsupported signing context")
  }
}
