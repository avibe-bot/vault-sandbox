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

/**
 * What one traversal found. `omitted` counts hashed subtrees past the depth this
 * review lists; they are signed, and complete in the raw typed data.
 */
type Walk = { covered: CoveredLeaf[]; uncovered: string[]; omitted: number }

const MAX_DEPTH = 32
/** Longer field paths are shown shortened; the complete path is in the raw typed data. */
const MAX_PATH_LABEL = 512
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
function walk(types: Record<string, TypedField[]>, type: string, value: unknown, path: string, depth: number, found: Walk): void {
  if (depth > MAX_DEPTH) {
    // Signed, but deeper than this review lists: not a coverage boundary.
    found.omitted += 1
    return
  }
  const item = arrayItemType(type)
  if (item !== null) {
    if (!Array.isArray(value)) return
    value.forEach((entry, index) => walk(types, item, entry, `${path}[${index}]`, depth + 1, found))
    return
  }
  const fields = types[type]
  if (!fields) {
    found.covered.push({ path, type, value: leafValue(type, value) })
    return
  }
  if (!isRecord(value)) return
  const declared = new Set(fields.map((field) => field.name))
  for (const field of fields) walk(types, field.type, value[field.name], path ? `${path}.${field.name}` : field.name, depth + 1, found)
  for (const key of Object.keys(value)) if (!declared.has(key)) found.uncovered.push(path ? `${path}.${key}` : key)
}

/** The types a primary type references, itself included, as viem's encodeType finds them. */
function referencedTypes(types: Record<string, TypedField[]>, primaryType: string): Set<string> {
  const found = new Set<string>()
  const visit = (type: string): void => {
    const base = /^\w*/.exec(type)![0]
    if (found.has(base) || !types[base]) return
    found.add(base)
    for (const field of types[base]) visit(field.type)
  }
  visit(primaryType)
  return found
}

// Exact hashed structures, compared field by field: the primary type, every
// referenced type, and each type's ordered (name, type) list. Nothing is
// recognized by a name, a field key or a joined type string alone.
type Schema = { primaryType: string; types: Record<string, Array<[string, string]>> }
const PERMIT_DETAILS: Array<[string, string]> = [["token", "address"], ["amount", "uint160"], ["expiration", "uint48"], ["nonce", "uint48"]]
const TOKEN_PERMISSIONS: Array<[string, string]> = [["token", "address"], ["amount", "uint256"]]
const ERC2612_PERMIT: Schema = { primaryType: "Permit", types: { Permit: [["owner", "address"], ["spender", "address"], ["value", "uint256"], ["nonce", "uint256"], ["deadline", "uint256"]] } }
const PERMIT2_SINGLE: Schema = { primaryType: "PermitSingle", types: { PermitSingle: [["details", "PermitDetails"], ["spender", "address"], ["sigDeadline", "uint256"]], PermitDetails: PERMIT_DETAILS } }
const PERMIT2_BATCH: Schema = { primaryType: "PermitBatch", types: { PermitBatch: [["details", "PermitDetails[]"], ["spender", "address"], ["sigDeadline", "uint256"]], PermitDetails: PERMIT_DETAILS } }
const PERMIT2_TRANSFER: Schema = {
  primaryType: "PermitTransferFrom",
  types: { PermitTransferFrom: [["permitted", "TokenPermissions"], ["spender", "address"], ["nonce", "uint256"], ["deadline", "uint256"]], TokenPermissions: TOKEN_PERMISSIONS },
}
const PERMIT2_BATCH_TRANSFER: Schema = {
  primaryType: "PermitBatchTransferFrom",
  types: { PermitBatchTransferFrom: [["permitted", "TokenPermissions[]"], ["spender", "address"], ["nonce", "uint256"], ["deadline", "uint256"]], TokenPermissions: TOKEN_PERMISSIONS },
}

function matches(types: Record<string, TypedField[]>, primaryType: string, schema: Schema): boolean {
  if (primaryType !== schema.primaryType) return false
  const referenced = referencedTypes(types, primaryType)
  const expected = Object.keys(schema.types)
  if (referenced.size !== expected.length || !expected.every((name) => referenced.has(name))) return false
  return expected.every((name) => {
    const fields = types[name]
    const wanted = schema.types[name]
    return Array.isArray(fields) && fields.length === wanted.length
      && fields.every((field, index) => field.name === wanted[index][0] && field.type === wanted[index][1])
  })
}

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
  const warnings: ReviewWarningKey[] = ["review.warning.tokenAuthorization"]
  if (matches(types, primaryType, ERC2612_PERMIT)) {
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
  const single = matches(types, primaryType, PERMIT2_SINGLE)
  if (single || matches(types, primaryType, PERMIT2_BATCH)) {
    const entries = single ? [message.details] : Array.isArray(message.details) ? message.details : []
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
  const singleTransfer = matches(types, primaryType, PERMIT2_TRANSFER)
  if (singleTransfer || matches(types, primaryType, PERMIT2_BATCH_TRANSFER)) {
    const entries = singleTransfer ? [message.permitted] : Array.isArray(message.permitted) ? message.permitted : []
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

/** A field path as a label. A very long one is shortened, and says so; the complete path is in the raw typed data. */
function pathLabel(path: string): { name: string; notes?: ReviewNote[] } {
  if (path.length <= MAX_PATH_LABEL) return { name: path }
  return { name: `${path.slice(0, MAX_PATH_LABEL / 2)} … ${path.slice(-MAX_PATH_LABEL / 4)}`, notes: ["review.note.pathShortened"] }
}

function typedLeafRow(leaf: CoveredLeaf): ReviewField {
  const { name, notes } = pathLabel(`${leaf.path} (${leaf.type})`)
  return { label: "review.field.typedField", name, value: leaf.value, ...(notes ? { notes } : {}) }
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
  const domainWalk: Walk = { covered: [], uncovered: [], omitted: 0 }
  walk(types, "EIP712Domain", domain, "domain", 0, domainWalk)
  const domainCovered = domainWalk.covered
  const uncovered = domainWalk.uncovered
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
  const messageWalk: Walk = { covered: [], uncovered, omitted: 0 }
  if (messageHashed) walk(types, typed.primaryType, message, "", 0, messageWalk)
  else if (typed.message !== undefined) uncovered.push("message")
  const messageCovered = messageWalk.covered
  const omitted = domainWalk.omitted + messageWalk.omitted

  let recognized: Recognized | null = null
  try {
    recognized = messageHashed ? recognize(types, typed.primaryType, message) : null
  } catch {
    recognized = null
  }

  const generic: ReviewField[] = messageCovered.slice(0, SUMMARY_LEAVES).map(typedLeafRow)
  const notListed = Math.max(0, messageCovered.length - SUMMARY_LEAVES) + omitted
  if (notListed > 0) {
    generic.push({ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: notListed }] })
  }

  const detailLeaves = (leaves: CoveredLeaf[], deeper = 0): ReviewField[] => {
    const more = Math.max(0, leaves.length - MAX_DETAIL_LEAVES) + deeper
    return [
      ...leaves.slice(0, MAX_DETAIL_LEAVES).map(typedLeafRow),
      ...(more > 0 ? [{ label: "review.field.moreFields" as const, value: "", notes: [{ key: "review.note.moreInRawData" as const, count: more }] }] : []),
    ]
  }

  const rawTyped = JSON.stringify(typed, null, 2)
  const details: ReviewGroup[] = [
    { title: "review.group.typedDomain", fields: detailLeaves(domainCovered, domainWalk.omitted) },
    ...(messageHashed ? [{ title: "review.group.typedMessage" as const, fields: detailLeaves(messageCovered, messageWalk.omitted) }] : []),
    ...(uncovered.length > 0 ? [{
      title: "review.group.notInTypedHash" as const,
      fields: [
        ...uncovered.slice(0, MAX_DETAIL_LEAVES).map((path): ReviewField => {
          const label = pathLabel(path)
          return { label: "review.field.typedField", name: label.name, value: "", notes: ["review.note.notInTypedHash", ...(label.notes ?? [])] }
        }),
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
