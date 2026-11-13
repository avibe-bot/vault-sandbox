import { sha256 } from "@noble/hashes/sha2.js"
import { assertCanonicalJson } from "./canonicalJson"
import { stableJson } from "./operationContext"
import { RpcError } from "./rpc"
import { base58Encode } from "./solana/base58"
import { b58check, base64ToBytes, bytesToBase64, eip55, segwitEncode } from "./vaultCrypto"
import { serializeAssertionCredential, type SerializedCredential } from "./webauthn"

// Frozen producer/consumer contract v1.1. These are server-asserted public facts,
// not signing material or sandbox-derived identity. The server verifies the
// stored target/revision, factor signature and single use when committing.
export const SIGNING_POLICY_PURPOSE = "vault-signing-policy-downgrade" as const
export const SIGNING_POLICY_DOMAIN = "avibe:vault:signing-policy-downgrade:v1\n"
export const MAX_POLICY_CONTEXT_BYTES = 65_536
const ID = /^[A-Za-z0-9_-]{1,80}$/
const ADDRESS_FIELDS = ["eth", "btc_legacy", "btc_segwit", "btc_taproot", "solana"] as const
export type PolicyAddresses = Record<typeof ADDRESS_FIELDS[number], string | null>
export type PolicyDowngradeContext = {
  v: 1
  purpose: typeof SIGNING_POLICY_PURPOSE
  challengeId: string
  nonce: string
  expiresAt: string
  rpId: string
  origin: string
  target: {
    secretId: string
    name: string
    protection: "standard" | "protected"
    signerKind: "local" | "hd-seed"
    account: number | null
    accountName: string | null
    addresses: PolicyAddresses
    identitySha256: string
  }
  change: { field: "always_ask"; from: true; to: false; revision: string }
  factors: Array<{ factorId: string; credentialId: string }>
}
export type PolicyLocation = Pick<Location, "origin" | "hostname">

function invalid(detail: string): never {
  throw new RpcError("policy_context_invalid", detail)
}

function exact(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) invalid(`${path} must be an object`)
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || !keys.every((key) => Object.hasOwn(record, key))) invalid(`${path} has missing or unknown fields`)
  return record
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) invalid(`${path} must be a nonempty string`)
  return value
}

function id(value: unknown, path: string): string {
  if (typeof value !== "string" || !ID.test(value)) invalid(`${path} is not a valid ID`)
  return value
}

/** Strict only on this new context; do not change the existing assertion/userHandle compatibility decoders. */
export function policyBase64(value: unknown, min: number, max: number): Uint8Array {
  if (typeof value !== "string" || value.length > 4 * Math.ceil(max / 3)
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) invalid("noncanonical policy base64")
  const bytes = base64ToBytes(value)
  if (bytes.length < min || bytes.length > max || bytesToBase64(bytes) !== value) invalid("policy base64 length or padding is invalid")
  return bytes
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
function decodeBase58(value: string): Uint8Array {
  let n = 0n
  for (const char of value) {
    const digit = B58.indexOf(char)
    if (digit < 0) invalid("invalid Base58 address")
    n = n * 58n + BigInt(digit)
  }
  const bytes: number[] = []
  while (n > 0n) { bytes.push(Number(n & 255n)); n >>= 8n }
  const zeros = /^1*/.exec(value)![0].length
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()])
}

const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
function witnessProgram(value: string, version: 0 | 1, size: 20 | 32): Uint8Array {
  if (!value.startsWith(`bc1${BECH32[version]}`) || value.length !== (size === 20 ? 42 : 62)) invalid("invalid mainnet witness address")
  const words = [...value.slice(4, -6)].map((char) => {
    const word = BECH32.indexOf(char)
    if (word < 0) invalid("invalid Bech32 address character")
    return word
  })
  let acc = 0
  let bits = 0
  const bytes: number[] = []
  for (const word of words) {
    acc = ((acc << 5) | word) & 0xffff
    bits += 5
    if (bits >= 8) { bits -= 8; bytes.push((acc >>> bits) & 255) }
  }
  if (bits >= 5 || (acc & ((1 << bits) - 1)) !== 0 || bytes.length !== size) invalid("noncanonical witness address padding")
  const program = Uint8Array.from(bytes)
  // Re-encoding verifies the variant-specific checksum, HRP, case and padding.
  if (segwitEncode("bc", version, program) !== value) invalid("invalid witness address checksum")
  return program
}

function address(value: unknown, field: typeof ADDRESS_FIELDS[number]): string | null {
  if (value === null) return null
  const encoded = text(value, `addresses.${field}`)
  if (encoded.length > 128) invalid("policy address is too long")
  if (field === "eth") {
    if (!/^0x[0-9a-fA-F]{40}$/.test(encoded) || `0x${eip55(encoded.slice(2))}` !== encoded) invalid("noncanonical EIP-55 address")
  } else if (field === "btc_segwit") witnessProgram(encoded, 0, 20)
  else if (field === "btc_taproot") witnessProgram(encoded, 1, 32)
  else {
    const bytes = decodeBase58(encoded)
    if (field === "solana") {
      if (bytes.length !== 32 || base58Encode(bytes) !== encoded) invalid("noncanonical Solana address")
    } else if (bytes.length !== 25 || bytes[0] !== 0 || b58check(bytes.slice(0, 21)) !== encoded) invalid("invalid mainnet P2PKH address")
  }
  return encoded
}

export function policyContextMessage(context: PolicyDowngradeContext): string {
  return SIGNING_POLICY_DOMAIN + stableJson(context)
}

export function policyChallenge(context: PolicyDowngradeContext): Uint8Array {
  return sha256(new TextEncoder().encode(policyContextMessage(context)))
}

/** Expiry gates are local fail-closed hints; the server's exact 120-second expiry is final. */
export function policyRemainingMs(context: PolicyDowngradeContext, now = Date.now()): number {
  const remaining = Date.parse(context.expiresAt) - now
  if (!Number.isFinite(remaining)) invalid("invalid policy expiry")
  if (remaining <= 0) throw new RpcError("policy_context_expired", "policy context has expired", true)
  if (remaining > 150_000) throw new RpcError("policy_context_clock_skew", "check this device's clock and retry", true)
  return remaining
}

/** Parse and reconstruct every field. No aliases, inferred identity or adjacent requester labels. */
export function parsePolicyDowngradeContext(value: unknown, location: PolicyLocation, now = Date.now()): PolicyDowngradeContext {
  try {
    // A cheap upper bound before walking factors, followed by the canonical UTF-8 limit.
    const json = JSON.stringify(value)
    if (json === undefined || json.length > MAX_POLICY_CONTEXT_BYTES) invalid("policy context exceeds its size bound")
    assertCanonicalJson(value)
    const c = exact(value, ["v", "purpose", "challengeId", "nonce", "expiresAt", "rpId", "origin", "target", "change", "factors"], "context")
    if (c.v !== 1 || c.purpose !== SIGNING_POLICY_PURPOSE) invalid("unsupported policy context version or purpose")
    if (c.origin !== location.origin || c.rpId !== location.hostname) invalid("policy origin or RP does not match this sandbox")
    const expiresAt = text(c.expiresAt, "expiresAt")
    const expiry = Date.parse(expiresAt)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiresAt)
      || !Number.isFinite(expiry) || new Date(expiry).toISOString() !== expiresAt) invalid("policy expiry must be an exact UTC millisecond date")
    policyBase64(c.nonce, 32, 32)
    const target = exact(c.target, ["secretId", "name", "protection", "signerKind", "account", "accountName", "addresses", "identitySha256"], "target")
    if (target.protection !== "standard" && target.protection !== "protected") invalid("invalid protection tier")
    if (target.signerKind !== "local" && target.signerKind !== "hd-seed") invalid("unsupported signer kind")
    if (typeof target.identitySha256 !== "string" || !/^[0-9a-f]{64}$/.test(target.identitySha256)) invalid("invalid identity digest")
    const addresses = exact(target.addresses, ADDRESS_FIELDS, "addresses")
    const parsedAddresses = Object.fromEntries(ADDRESS_FIELDS.map((key) => [key, address(addresses[key], key)])) as PolicyAddresses
    if (target.signerKind === "hd-seed") {
      if (target.protection !== "standard" || typeof target.account !== "number" || !Number.isSafeInteger(target.account)
        || target.account < 0 || target.account > 19) invalid("invalid shared HD account")
      if (target.accountName !== null && (typeof target.accountName !== "string" || [...target.accountName].length < 1 || [...target.accountName].length > 80)) invalid("invalid HD account name")
      if (parsedAddresses.eth === null || parsedAddresses.btc_taproot === null || parsedAddresses.solana === null
        || parsedAddresses.btc_legacy !== null || parsedAddresses.btc_segwit !== null) invalid("invalid shared HD address set")
    } else {
      if (target.account !== null || target.accountName !== null) invalid("ordinary keys cannot carry an HD account")
      const secp = parsedAddresses.eth !== null && parsedAddresses.btc_legacy !== null && parsedAddresses.btc_segwit !== null && parsedAddresses.btc_taproot !== null && parsedAddresses.solana === null
      const solana = parsedAddresses.solana !== null && parsedAddresses.eth === null && parsedAddresses.btc_legacy === null && parsedAddresses.btc_segwit === null && parsedAddresses.btc_taproot === null
      if (!secp && !solana) invalid("invalid ordinary key address set")
    }
    const change = exact(c.change, ["field", "from", "to", "revision"], "change")
    if (change.field !== "always_ask" || change.from !== true || change.to !== false
      || typeof change.revision !== "string" || !/^(?:legacy|[0-9a-f]{32})$/.test(change.revision)) invalid("only true-to-false always_ask changes are supported")
    if (!Array.isArray(c.factors) || c.factors.length === 0) invalid("policy factors must be nonempty")
    const seen = new Set<string>()
    let previous = ""
    const factors = c.factors.map((value) => {
      const f = exact(value, ["factorId", "credentialId"], "factor")
      const factorId = id(f.factorId, "factorId")
      policyBase64(f.credentialId, 1, 1023)
      const credentialId = f.credentialId as string
      if (factorId <= previous || seen.has(credentialId)) invalid("policy factors must have unique credentials and sorted unique IDs")
      previous = factorId
      seen.add(credentialId)
      return { factorId, credentialId }
    })
    const context: PolicyDowngradeContext = {
      v: 1, purpose: SIGNING_POLICY_PURPOSE, challengeId: id(c.challengeId, "challengeId"),
      nonce: c.nonce as string, expiresAt, rpId: c.rpId as string, origin: c.origin as string,
      target: {
        secretId: id(target.secretId, "secretId"), name: text(target.name, "name"), protection: target.protection,
        signerKind: target.signerKind, account: target.account as number | null, accountName: target.accountName as string | null,
        addresses: parsedAddresses, identitySha256: target.identitySha256,
      },
      change: { field: "always_ask", from: true, to: false, revision: change.revision }, factors,
    }
    if (new TextEncoder().encode(stableJson(context)).length > MAX_POLICY_CONTEXT_BYTES) invalid("policy context exceeds its UTF-8 size bound")
    policyRemainingMs(context, now)
    return context
  } catch (error) {
    if (error instanceof RpcError) throw error
    invalid("policy context is not canonical JSON")
  }
}

export function parsePolicyDowngradePayload(value: unknown, location: PolicyLocation): PolicyDowngradeContext {
  return parsePolicyDowngradeContext(exact(value, ["context"], "payload").context, location)
}

/** Exact options, produced immediately in the click activation: no PRF or VMK state. */
export function policyAssertionOptions(context: PolicyDowngradeContext): PublicKeyCredentialRequestOptions {
  const remaining = policyRemainingMs(context)
  const timeout = Math.min(120_000, Math.floor(remaining))
  if (timeout <= 0) throw new RpcError("policy_context_expired", "policy context has expired", true)
  return {
    challenge: new Uint8Array(policyChallenge(context)).buffer,
    rpId: context.rpId, userVerification: "required", timeout,
    allowCredentials: context.factors.map((factor) => ({ type: "public-key", id: new Uint8Array(policyBase64(factor.credentialId, 1, 1023)).buffer })),
  }
}

function base64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Validate only this operation's serialized result. Signature/counter/target CAS
 * remain the server's job; this catches wrong-result variants, factor swaps,
 * opaque-challenge substitutions and lost UV before returning across RPC.
 */
export function validatePolicyAssertion(value: unknown, context: PolicyDowngradeContext): SerializedCredential {
  try {
    const c = exact(value, ["id", "rawId", "type", "response"], "assertion")
    const rawId = policyBase64(c.rawId, 1, 1023)
    if (c.type !== "public-key" || c.id !== base64url(rawId) || !context.factors.some((factor) => factor.credentialId === c.rawId)) invalid("assertion does not identify a frozen factor")
    const response = exact(c.response, ["clientDataJSON", "authenticatorData", "signature", "userHandle"], "assertion.response")
    const clientBytes = policyBase64(response.clientDataJSON, 1, MAX_POLICY_CONTEXT_BYTES)
    const client = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(clientBytes)) as Record<string, unknown>
    if (client.type !== "webauthn.get" || client.challenge !== base64url(policyChallenge(context)) || client.origin !== context.origin
      || (client.crossOrigin !== undefined && client.crossOrigin !== false)) invalid("assertion client data does not bind this policy context")
    const auth = policyBase64(response.authenticatorData, 37, MAX_POLICY_CONTEXT_BYTES)
    const expectedRpHash = sha256(new TextEncoder().encode(context.rpId))
    if ((auth[32] & 5) !== 5 || !auth.slice(0, 32).every((byte, index) => byte === expectedRpHash[index])) invalid("assertion RP or UP/UV flags are invalid")
    policyBase64(response.signature, 1, MAX_POLICY_CONTEXT_BYTES)
    if (response.userHandle !== null) policyBase64(response.userHandle, 0, MAX_POLICY_CONTEXT_BYTES)
    policyRemainingMs(context)
    // The object was reconstructed by the existing serializer in the popup; no
    // global assertion parser is tightened, and the nullable userHandle stays so.
    return { id: c.id as string, rawId: c.rawId as string, type: "public-key", response: { ...response } }
  } catch (error) {
    if (error instanceof RpcError && error.code !== "policy_context_invalid") throw error
    throw new RpcError("authorization_result_invalid", "invalid policy assertion")
  }
}

/** Direct call before the first await preserves the user activation for WebAuthn. */
export async function requestPolicyAssertion(context: PolicyDowngradeContext, signal: AbortSignal): Promise<SerializedCredential> {
  if (signal.aborted) throw signal.reason
  const assertion = await navigator.credentials.get({ publicKey: policyAssertionOptions(context), signal }) as PublicKeyCredential | null
  if (signal.aborted) throw signal.reason
  if (!assertion) throw new Error("passkey-cancelled")
  return validatePolicyAssertion(serializeAssertionCredential(assertion), context)
}
