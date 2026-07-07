import { sha256 } from "@noble/hashes/sha2.js"
import { decodeFunctionData, hashTypedData, keccak256, parseAbi, serializeTransaction } from "viem"

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

const knownTokenAbi = parseAbi([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)",
])

function asHexData(value: unknown): `0x${string}` {
  if (value === undefined || value === null || value === "" || value === "0x") return "0x"
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value) || value.length % 2 !== 0) {
    throw new Error("EVM transaction calldata is malformed")
  }
  return value as `0x${string}`
}

function decodeKnownCalldata(data: `0x${string}`): string {
  if (data === "0x") return "calldata: none"
  let decoded: ReturnType<typeof decodeFunctionData<typeof knownTokenAbi>>
  try {
    decoded = decodeFunctionData({ abi: knownTokenAbi, data })
  } catch {
    throw new Error("unsupported EVM calldata selector")
  }

  const args = [...decoded.args]
  switch (decoded.functionName) {
    case "approve":
      return [`call: ERC-20/ERC-721 approve`, `spender/to: ${formatValue(args[0])}`, `amount/tokenId: ${formatValue(args[1])}`].join("\n")
    case "transfer":
      return [`call: ERC-20 transfer`, `to: ${formatValue(args[0])}`, `amount: ${formatValue(args[1])}`].join("\n")
    case "transferFrom":
      return [
        "call: ERC-20/ERC-721 transferFrom",
        `from: ${formatValue(args[0])}`,
        `to: ${formatValue(args[1])}`,
        `amount/tokenId: ${formatValue(args[2])}`,
      ].join("\n")
    case "permit":
      return [
        "call: ERC-20 permit",
        `owner: ${formatValue(args[0])}`,
        `spender: ${formatValue(args[1])}`,
        `amount: ${formatValue(args[2])}`,
        `deadline: ${formatValue(args[3])}`,
      ].join("\n")
    case "setApprovalForAll":
      return [`call: ERC-721 setApprovalForAll`, `operator: ${formatValue(args[0])}`, `approved: ${formatValue(args[1])}`].join("\n")
    case "safeTransferFrom":
      return [
        "call: ERC-721 safeTransferFrom",
        `from: ${formatValue(args[0])}`,
        `to: ${formatValue(args[1])}`,
        `tokenId: ${formatValue(args[2])}`,
        args.length > 3 ? `extraData: ${formatValue(args[3])}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    default:
      throw new Error("unsupported EVM calldata selector")
  }
}

function evmDisplay(context: Extract<VerifiableSigningContext, { kind: "evm-transaction" }>, tx: Record<string, unknown>): string {
  const data = asHexData(tx.data)
  const lines = [
    `EVM transaction on chain ${context.chainId}`,
    `to: ${formatValue(tx.to) || "(contract creation)"}`,
    `value: ${formatValue(tx.value) || "0"}`,
    `gas: ${formatValue(tx.gas ?? tx.gasLimit)}`,
    `gasPrice: ${formatValue(tx.gasPrice)}`,
    `maxFeePerGas: ${formatValue(tx.maxFeePerGas)}`,
    `maxPriorityFeePerGas: ${formatValue(tx.maxPriorityFeePerGas)}`,
    `nonce: ${formatValue(tx.nonce)}`,
    decodeKnownCalldata(data),
  ]
  return lines.filter((line) => !line.endsWith(": ")).join("\n")
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
        display: evmDisplay(context, tx),
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
          `domain: ${stableJson(typed.domain ?? {})}`,
          `primaryType: ${formatValue(typed.primaryType)}`,
          `message: ${stableJson(asRecord(typed.message))}`,
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
