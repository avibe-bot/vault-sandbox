import { RpcError } from "./rpc"
export const BITCOIN_PARENT_MAX_BYTES = 1_048_576
export const BITCOIN_ECDSA_KINDS = ["bitcoin-p2pkh-v1", "bitcoin-p2wpkh-v1"] as const

/** Check the bound BEFORE scanning or decoding attacker-sized text. */
export function bitcoinHex(value: unknown, maxBytes: number, label: string, exactBytes?: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxBytes * 2 || value.length % 2
    || (exactBytes !== undefined && value.length !== exactBytes * 2)) throw new RpcError("invalid_payload", `${label} has an invalid hexadecimal size`)
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    if (!(c >= 48 && c <= 57) && !(c >= 97 && c <= 102)) throw new RpcError("invalid_payload", `${label} must be lowercase hexadecimal`)
  }
  return value
}

const NON_PROOF_BYTES = 524_288
const FULL_OPERATION_BYTES = 4_718_592
const CONTEXT_BYTES = 2_162_688

function fail(message: string): never { throw new RpcError("invalid_payload", `Bitcoin resource limit: ${message}`) }
/** Inspect fixed locations without invoking accessors or recursively walking an unbounded object. */
function own(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined
  return Object.getOwnPropertyDescriptor(value, key)?.value
}
function has(value: unknown, key: string): boolean {
  return !!value && typeof value === "object" && Object.hasOwn(value, key)
}
function newOrProof(context: unknown): boolean {
  return (BITCOIN_ECDSA_KINDS as readonly unknown[]).includes(own(context, "kind")) || has(own(context, "prevout"), "parentTransaction")
}
type ProofOwners = Map<object, string>
function inspectContext(context: unknown, proofOwners: ProofOwners): void {
  if (!context || typeof context !== "object") return
  const prevout = own(context, "prevout")
  if (has(prevout, "parentTransaction")) {
    bitcoinHex(own(prevout, "parentTransaction"), BITCOIN_PARENT_MAX_BYTES, "parentTransaction")
    proofOwners.set(prevout as object, "parentTransaction")
  }
  const spend = own(context, "unsignedTransaction")
  if (spend !== undefined) bitcoinHex(spend, 137, "unsignedTransaction")
  const digest = own(context, "digest")
  if (digest !== undefined) bitcoinHex(digest, 32, "digest", 32)
  const txid = own(prevout, "txid")
  if (txid !== undefined) bitcoinHex(txid, 32, "parent txid", 32)
  const script = own(prevout, "scriptPubKey")
  if (script !== undefined) bitcoinHex(script, 25, "prevout script")
}

/** Count exact compact JSON UTF-8 bytes without JSON.stringify/encoding/canonical copies. */
function boundedJson(root: unknown, proofOwners: ProofOwners, maxBytes: number, maxProofCopies = 2): void {
  let bytes = 0, nonProof = 0, nodes = 0, proofCopies = 0, proofCharacters = 0
  const ancestors = new Set<object>()
  function add(count: number, proof = false): void {
    bytes += count
    if (!proof) nonProof += count
    if (bytes > maxBytes || nonProof > NON_PROOF_BYTES) fail("canonical byte budget exceeded")
  }
  function text(value: string, proof = false): void {
    if (value.length > (proof ? BITCOIN_PARENT_MAX_BYTES * 2 : NON_PROOF_BYTES)) fail("string size exceeded")
    add(2)
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i)
      let size: number
      if (code === 34 || code === 92 || code === 8 || code === 9 || code === 10 || code === 12 || code === 13) size = 2
      else if (code < 32) size = 6
      else if (code < 128) size = 1
      else if (code < 2048) size = 2
      else if (code >= 0xd800 && code <= 0xdbff) {
        const low = value.charCodeAt(++i)
        if (!(low >= 0xdc00 && low <= 0xdfff)) fail("unpaired Unicode surrogate")
        size = 4
      } else {
        if (code >= 0xdc00 && code <= 0xdfff) fail("unpaired Unicode surrogate")
        size = 3
      }
      add(size, proof)
    }
  }
  type Work = { value: unknown; depth: number; proof?: boolean } | { exit: object }
  const stack: Work[] = [{ value: root, depth: 0 }]
  while (stack.length) {
    const next = stack.pop()!
    if ("exit" in next) { ancestors.delete(next.exit); continue }
    if (++nodes > 4096 || next.depth > 16) fail("node/depth budget exceeded")
    const value = next.value
    if (value === null) { add(4); continue }
    if (typeof value === "boolean") { add(value ? 4 : 5); continue }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value)) fail("numbers must be safe integers")
      add(String(value).length); continue
    }
    if (typeof value === "string") {
      if (next.proof) {
        if (++proofCopies > maxProofCopies || (proofCharacters += value.length) > 4_194_304) fail("proof-copy budget exceeded")
      }
      text(value, next.proof); continue
    }
    if (!value || typeof value !== "object") fail("only JSON values are permitted")
    if (ancestors.has(value)) fail("cyclic structure")
    const array = Array.isArray(value)
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail("only plain JSON objects are permitted")
    ancestors.add(value)
    stack.push({ exit: value })
    const keys = Reflect.ownKeys(value)
    if (array) {
      if (value.length > 2048 || keys.length !== value.length + 1) fail("array size/shape exceeded")
      add(2 + Math.max(0, value.length - 1))
      for (let i = value.length - 1; i >= 0; i--) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("array accessors/holes are not JSON")
        stack.push({ value: descriptor.value, depth: next.depth + 1 })
      }
    } else {
      if (keys.length > 128) fail("object field budget exceeded")
      const entries: Array<[string, unknown]> = []
      for (const key of keys) {
        if (typeof key !== "string") fail("symbol fields are not JSON")
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!("value" in descriptor) || !descriptor.enumerable) fail("accessor/nonenumerable fields are not JSON")
        // Like JSON serialization, an undefined property is absent.
        if (descriptor.value !== undefined) entries.push([key, descriptor.value])
      }
      add(2 + Math.max(0, entries.length - 1))
      for (const [key, child] of entries) {
        text(key); add(1)
        if (key === "parentTransaction" && proofOwners.get(value) !== key) fail("additional embedded proof copy")
        const proof = proofOwners.get(value) === key
        if (proof && typeof child !== "string") fail("proof must be a string")
        stack.push({ value: child, depth: next.depth + 1, proof })
      }
    }
  }
}

export function assertBitcoinContextLimits(context: unknown): void {
  const proofs: ProofOwners = new Map()
  inspectContext(context, proofs)
  boundedJson(context, proofs, own(context, "kind") === "bitcoin-p2wpkh-v1" ? 4096 : CONTEXT_BYTES)
}

/** NEW kinds only. Legacy/EVM/Solana request limits and error precedence are unchanged. */
export function assertBitcoinSignRequestLimits(value: unknown): void {
  const release = own(own(value, "context"), "release")
  const delivery = own(value, "delivery")
  const persistedRelease = own(own(delivery, "operation_context"), "release")
  const contexts = [own(value, "signingContext"), own(value, "signing_context"), own(release, "signingContext"), own(delivery, "signing_context"), own(persistedRelease, "signingContext")]
  if (!contexts.some(newOrProof)) return
  if (has(value, "signingContext") && has(value, "signing_context")) fail("multiple direct context aliases")
  const proofs: ProofOwners = new Map()
  for (const context of contexts) inspectContext(context, proofs)
  const envelope = own(own(value, "material"), "envelope")
  for (const key of ["ciphertext", "nonce", "wrap_meta"]) {
    const item = own(envelope, key)
    if (typeof item === "string" && item.length > 262_144) fail("material envelope string exceeded")
  }
  boundedJson(value, proofs, FULL_OPERATION_BYTES)
  for (const context of contexts) if (context !== undefined) assertBitcoinContextLimits(context)
}

const NEW_REVIEW_KINDS = ["review.kind.bitcoinLegacyTransfer", "review.kind.bitcoinNativeTransfer"]
const PROMPT_BYTES = 2_621_440

/**
 * Sender and receiver preflight for a paired authorization prompt carrying a NEW
 * Bitcoin review: ONE complete raw funding transaction in Details, everything else
 * within 512 KiB, before parseSigningReview walks or the prompt is posted. The
 * browser's own structured clone of a received message is outside this bound.
 */
export function assertBitcoinPromptLimits(prompt: unknown): void {
  const review = own(prompt, "review")
  if (!NEW_REVIEW_KINDS.includes(own(review, "kind") as string)) return
  const details = own(review, "details")
  const proofs: ProofOwners = new Map()
  if (Array.isArray(details) && details.length <= 16) {
    for (let g = 0; g < details.length; g++) {
      const fields = own(own(details, String(g)), "fields")
      if (!Array.isArray(fields) || fields.length > 512) continue
      for (let f = 0; f < fields.length; f++) {
        const field = own(fields, String(f))
        if (own(field, "label") !== "review.field.parentTransaction") continue
        bitcoinHex(own(field, "value"), BITCOIN_PARENT_MAX_BYTES, "parentTransaction")
        proofs.set(field as object, "value")
      }
    }
  }
  boundedJson(prompt, proofs, PROMPT_BYTES, 1)
}
