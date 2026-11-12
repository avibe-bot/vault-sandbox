import { getTypesForEIP712Domain } from "viem"

import type { ReviewField, ReviewGroup, ReviewNote, ReviewWarningKey, SigningReview } from "./signingReview"
import { deriveSigningAddresses, type SignatureScheme } from "./vaultCrypto"

// The review of EIP-712 typed data that verifySigningContext has already hashed
// and matched against the signed digest. Display only: nothing here changes what
// is accepted, and a shape it cannot describe falls back to the generic review.
//
// Coverage follows viem's hashTypedData exactly. The domain is hashed with the
// explicit EIP712Domain type when the request declares one, otherwise with the
// type viem infers from the domain values (a string chainId is not inferred).
// The message is hashed through the primary type's declared fields, and not at
// all when the primary type is EIP712Domain. Anything else in the JSON is shown
// as outside the typed-data hash: it is still part of the daemon-signed request.

type TypedField = { name: string; type: string }
type TypedData = {
  domain?: Record<string, unknown>
  types: Record<string, TypedField[]>
  primaryType: string
  message?: Record<string, unknown>
}

/** A hash-covered value, by its path in the structure. `value` is shown exactly as encoded. */
type CoveredLeaf = { path: string; type: string; value: string }

const MAX_DEPTH = 16
const MAX_DETAIL_LEAVES = 256
const SUMMARY_LEAVES = 8
const SUMMARY_BATCH = 3

/** Static labels for well-known chain ids. A label describes the encoded id; it does not prove the network. */
const KNOWN_CHAINS: Record<string, string> = {
  "1": "Ethereum",
  "10": "OP Mainnet",
  "56": "BNB Smart Chain",
  "137": "Polygon",
  "8453": "Base",
  "42161": "Arbitrum One",
  "11155111": "Sepolia",
}

export function chainNote(chainId: string): ReviewNote[] {
  return KNOWN_CHAINS[chainId] ? [] : ["review.note.unknownChain"]
}

export function chainLabel(chainId: string): string {
  return KNOWN_CHAINS[chainId] ? `${chainId} · ${KNOWN_CHAINS[chainId]}` : chainId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The integer viem encodes for an int/uint value: `BigInt(value)`, or null when it is not one. */
function encodedInteger(value: unknown): bigint | null {
  if (typeof value === "bigint") return value
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean" && !Array.isArray(value)) return null
  try {
    return BigInt(value as string)
  } catch {
    return null
  }
}

function leafValue(type: string, value: unknown): string {
  if (/^u?int\d*$/.test(type)) {
    const integer = encodedInteger(value)
    return integer === null ? JSON.stringify(value) ?? String(value) : integer.toString()
  }
  if (typeof value === "string") return value
  return JSON.stringify(value) ?? String(value)
}

function arrayItemType(type: string): string | null {
  const match = /^(.*)\[\d*\]$/.exec(type)
  return match ? match[1] : null
}

/** Covered leaves of one struct value, and paths present in the JSON but outside the typed hash. */
function walk(
  types: Record<string, TypedField[]>,
  type: string,
  value: unknown,
  path: string,
  depth: number,
  covered: CoveredLeaf[],
  uncovered: string[],
): void {
  if (depth > MAX_DEPTH) {
    uncovered.push(`${path} …`)
    return
  }
  const item = arrayItemType(type)
  if (item !== null) {
    if (!Array.isArray(value)) return
    value.forEach((entry, index) => walk(types, item, entry, `${path}[${index}]`, depth + 1, covered, uncovered))
    return
  }
  const fields = types[type]
  if (!fields) {
    covered.push({ path, type, value: leafValue(type, value) })
    return
  }
  if (!isRecord(value)) return
  const declared = new Set(fields.map((field) => field.name))
  for (const field of fields) walk(types, field.type, value[field.name], path ? `${path}.${field.name}` : field.name, depth + 1, covered, uncovered)
  for (const key of Object.keys(value)) if (!declared.has(key)) uncovered.push(path ? `${path}.${key}` : key)
}

/** viem's encodeType: the primary type, then its dependencies in sorted order. */
function encodeType(types: Record<string, TypedField[]>, primaryType: string): string | null {
  const dependencies = new Set<string>()
  const visit = (type: string): void => {
    const base = /^\w*/.exec(type)![0]
    if (dependencies.has(base) || !types[base]) return
    dependencies.add(base)
    for (const field of types[base]) visit(field.type)
  }
  visit(primaryType)
  if (!dependencies.has(primaryType)) return null
  dependencies.delete(primaryType)
  return [primaryType, ...[...dependencies].sort()].map((type) => `${type}(${types[type].map((field) => `${field.type} ${field.name}`).join(",")})`).join("")
}

// Exact hashed structures. The type string is what the hash commits to: names,
// order, types and every referenced type. Nothing is recognized by name alone.
const ERC2612_PERMIT = "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
const PERMIT_DETAILS = "PermitDetails(address token,uint160 amount,uint48 expiration,uint48 nonce)"
const PERMIT2_SINGLE = `PermitSingle(PermitDetails details,address spender,uint256 sigDeadline)${PERMIT_DETAILS}`
const PERMIT2_BATCH = `PermitBatch(PermitDetails[] details,address spender,uint256 sigDeadline)${PERMIT_DETAILS}`
const TOKEN_PERMISSIONS = "TokenPermissions(address token,uint256 amount)"
const PERMIT2_TRANSFER = `PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)${TOKEN_PERMISSIONS}`
const PERMIT2_BATCH_TRANSFER = `PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)${TOKEN_PERMISSIONS}`

const MAX_UINT256 = (1n << 256n) - 1n
const MAX_UINT160 = (1n << 160n) - 1n

type Recognized = { kind: SigningReview["kind"]; summary: ReviewField[]; warnings: ReviewWarningKey[] }

function amountField(label: ReviewField["label"], value: unknown, max: bigint, unlimited: ReviewNote, index?: number): { field: ReviewField; isMax: boolean } {
  const integer = encodedInteger(value)
  const isMax = integer === max
  return {
    field: {
      label, ...(index === undefined ? {} : { index }),
      value: integer === null ? leafValue("string", value) : integer.toString(),
      notes: ["review.note.rawTokenUnits", ...(isMax ? [unlimited] : [])],
    },
    isMax,
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value : leafValue("string", value)
}

/** The known authorization structures, or null for everything else. */
function recognize(types: Record<string, TypedField[]>, primaryType: string, message: Record<string, unknown>): Recognized | null {
  const shape = encodeType(types, primaryType)
  const warnings: ReviewWarningKey[] = ["review.warning.tokenAuthorization"]
  if (shape === ERC2612_PERMIT) {
    const amount = amountField("review.field.permitAmount", message.value, MAX_UINT256, "review.note.unlimitedAllowance")
    return {
      kind: "review.kind.erc2612Permit",
      warnings: amount.isMax ? [...warnings, "review.warning.unlimitedAllowance"] : warnings,
      summary: [
        { label: "review.field.spender", value: text(message.spender) },
        amount.field,
        { label: "review.field.permitOwner", value: text(message.owner) },
        { label: "review.field.permitDeadline", value: leafValue("uint256", message.deadline), notes: ["review.note.permitDeadline"] },
        { label: "review.field.permitNonce", value: leafValue("uint256", message.nonce) },
      ],
    }
  }
  if (shape === PERMIT2_SINGLE || shape === PERMIT2_BATCH) {
    const entries = shape === PERMIT2_SINGLE ? [message.details] : Array.isArray(message.details) ? message.details : []
    let anyMax = false
    const rows: ReviewField[] = []
    entries.forEach((entry, index) => {
      const details = isRecord(entry) ? entry : {}
      const amount = amountField("review.field.permitTokenAmount", details.amount, MAX_UINT160, "review.note.unlimitedAllowance", index + 1)
      // Every entry is scanned for the warning; only the first few are listed.
      anyMax ||= amount.isMax
      if (index < SUMMARY_BATCH) {
        rows.push(
          { label: "review.field.permitToken", index: index + 1, value: text(details.token) },
          amount.field,
          { label: "review.field.permitExpiration", index: index + 1, value: leafValue("uint48", details.expiration), notes: ["review.note.permit2Expiration"] },
        )
      }
    })
    if (entries.length > SUMMARY_BATCH) rows.push({ label: "review.field.moreTokens", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: entries.length - SUMMARY_BATCH }] })
    return {
      kind: "review.kind.permit2Allowance",
      warnings: anyMax ? [...warnings, "review.warning.unlimitedAllowance"] : warnings,
      summary: [
        { label: "review.field.spender", value: text(message.spender) },
        ...rows,
        { label: "review.field.signatureDeadline", value: leafValue("uint256", message.sigDeadline), notes: ["review.note.signatureDeadline"] },
      ],
    }
  }
  if (shape === PERMIT2_TRANSFER || shape === PERMIT2_BATCH_TRANSFER) {
    const entries = shape === PERMIT2_TRANSFER ? [message.permitted] : Array.isArray(message.permitted) ? message.permitted : []
    let anyMax = false
    const rows: ReviewField[] = []
    entries.forEach((entry, index) => {
      const permitted = isRecord(entry) ? entry : {}
      const amount = amountField("review.field.permitTokenAmount", permitted.amount, MAX_UINT256, "review.note.maximumOneTime", index + 1)
      anyMax ||= amount.isMax
      if (index < SUMMARY_BATCH) rows.push({ label: "review.field.permitToken", index: index + 1, value: text(permitted.token) }, amount.field)
    })
    if (entries.length > SUMMARY_BATCH) rows.push({ label: "review.field.moreTokens", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: entries.length - SUMMARY_BATCH }] })
    return {
      kind: "review.kind.permit2Transfer",
      warnings: anyMax ? ["review.warning.oneTimeTransfer", "review.warning.maximumOneTimeTransfer"] : ["review.warning.oneTimeTransfer"],
      summary: [
        // The Permit2 contract signs msg.sender as the spender; this is the value in the message.
        { label: "review.field.spender", value: text(message.spender) },
        ...rows,
        { label: "review.field.permitDeadline", value: leafValue("uint256", message.deadline), notes: ["review.note.signatureDeadline"] },
        { label: "review.field.permitNonce", value: leafValue("uint256", message.nonce) },
      ],
    }
  }
  return null
}

function typedLeafRow(leaf: CoveredLeaf): ReviewField {
  return { label: "review.field.typedField", name: `${leaf.path} (${leaf.type})`, value: leaf.value }
}

/**
 * The review of verified EIP-712 typed data. `typed` is the request's typed data
 * after verifySigningContext hashed it to the signed digest; `publicKey` is the
 * protected record's own key, from which the signing address is derived.
 */
export function eip712SigningReview(typedValue: unknown, signing: { publicKey: string; scheme: SignatureScheme; digest: string }): SigningReview {
  const typed = typedValue as TypedData
  const domain = isRecord(typed.domain) ? typed.domain : {}
  const declaredTypes = typed.types
  const types: Record<string, TypedField[]> = {
    EIP712Domain: getTypesForEIP712Domain({ domain }) as TypedField[],
    ...declaredTypes,
  }
  const address = deriveSigningAddresses(signing.publicKey).eth
  if (!address) throw new Error("EIP-712 review requires a secp256k1 signing key")

  // Domain: each hashed field, then whatever else the domain JSON carries.
  const domainCovered: CoveredLeaf[] = []
  const uncovered: string[] = []
  walk(types, "EIP712Domain", domain, "domain", 0, domainCovered, uncovered)
  const domainHashed = new Set(types.EIP712Domain.map((field) => field.name))
  const domainRow = (key: string, label: ReviewField["label"]): ReviewField[] => {
    if (!(key in domain)) return []
    const covered = domainHashed.has(key)
    const field = types.EIP712Domain.find((candidate) => candidate.name === key)
    const value = covered && field ? leafValue(field.type, domain[key]) : text(domain[key])
    return [{
      label, value: key === "chainId" ? chainLabel(value) : value,
      notes: [...(key === "chainId" ? chainNote(value) : []), ...(covered ? [] : ["review.note.notInTypedHash" as const])],
    }]
  }

  const messageHashed = typed.primaryType !== "EIP712Domain"
  const message = isRecord(typed.message) ? typed.message : {}
  const messageCovered: CoveredLeaf[] = []
  if (messageHashed) walk(types, typed.primaryType, message, "", 0, messageCovered, uncovered)
  else if (typed.message !== undefined) uncovered.push("message")

  let recognized: Recognized | null = null
  try {
    recognized = messageHashed ? recognize(types, typed.primaryType, message) : null
  } catch {
    recognized = null
  }

  const generic: ReviewField[] = messageCovered.slice(0, SUMMARY_LEAVES).map(typedLeafRow)
  if (messageCovered.length > SUMMARY_LEAVES) {
    generic.push({ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: messageCovered.length - SUMMARY_LEAVES }] })
  }

  const detailLeaves = (leaves: CoveredLeaf[]): ReviewField[] => [
    ...leaves.slice(0, MAX_DETAIL_LEAVES).map(typedLeafRow),
    ...(leaves.length > MAX_DETAIL_LEAVES ? [{ label: "review.field.moreFields" as const, value: "", notes: [{ key: "review.note.moreInRawData" as const, count: leaves.length - MAX_DETAIL_LEAVES }] }] : []),
  ]

  const rawTyped = JSON.stringify(typed, null, 2)
  const details: ReviewGroup[] = [
    { title: "review.group.typedDomain", fields: detailLeaves(domainCovered) },
    ...(messageHashed ? [{ title: "review.group.typedMessage" as const, fields: detailLeaves(messageCovered) }] : []),
    ...(uncovered.length > 0 ? [{
      title: "review.group.notInTypedHash" as const,
      fields: [
        ...uncovered.slice(0, MAX_DETAIL_LEAVES).map((path): ReviewField => ({ label: "review.field.typedField", name: path, value: "", notes: ["review.note.notInTypedHash"] })),
        ...(uncovered.length > MAX_DETAIL_LEAVES ? [{ label: "review.field.moreFields" as const, value: "", notes: [{ key: "review.note.moreInRawData" as const, count: uncovered.length - MAX_DETAIL_LEAVES }] }] : []),
      ],
    }] : []),
    {
      title: "review.group.transaction",
      fields: [
        { label: "review.field.publicKey", value: signing.publicKey.toLowerCase() },
        { label: "review.field.scheme", value: signing.scheme },
        { label: "review.field.primaryType", value: typed.primaryType },
        { label: "review.field.digest", value: `0x${signing.digest}` },
      ],
    },
    {
      title: "review.group.exact",
      fields: [
        { label: "review.field.typedTypes", value: JSON.stringify(declaredTypes, null, 2), raw: true },
        { label: "review.field.typedData", value: rawTyped, notes: [{ key: "review.note.bytes", count: new TextEncoder().encode(rawTyped).length }], raw: true },
      ],
    },
  ]

  return {
    kind: recognized?.kind ?? "review.kind.eip712",
    signer: { label: "review.field.signingAddress", value: address },
    summary: [
      ...domainRow("chainId", "review.field.chainId"),
      ...domainRow("name", "review.field.domainName"),
      ...domainRow("verifyingContract", "review.field.verifyingContract"),
      { label: "review.field.primaryType", value: typed.primaryType, ...(messageHashed ? {} : { notes: ["review.note.messageNotHashed" as const] }) },
      ...(recognized ? recognized.summary : generic),
      ...(uncovered.length > 0 ? [{ label: "review.field.notInTypedHash" as const, value: "", notes: [{ key: "review.note.fieldsOutsideHash" as const, count: uncovered.length }] }] : []),
    ],
    // Every hashed value is shown; nothing is blind.
    undecoded: false,
    ...(recognized ? { warnings: recognized.warnings } : {}),
    details,
  }
}
