// Protected-HD v1: fixed public identity and secret codec. Never a value/export RPC.
import { HDKey } from "@scure/bip32"
import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync } from "@scure/bip39"
import { wordlist } from "@scure/bip39/wordlists/english"
import { base58, base58check, bech32, bech32m } from "@scure/base"
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1, schnorr } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import { hmac } from "@noble/hashes/hmac.js"
import { sha256, sha512 } from "@noble/hashes/sha2.js"
import { ripemd160 } from "@noble/hashes/legacy.js"
import { keccak_256 } from "@noble/hashes/sha3.js"

export const HD_PROFILE = "bitcoin-address-types-v1" as const
export const HD_ACCOUNT_LIMIT = 20
const MARKER = new TextEncoder().encode("avibe:protected-hd-wallet:v1\n")
const ENTROPY_LENGTHS = [16, 20, 24, 28, 32]
const ROW_FIELDS = ["account", "evm", "bitcoin", "bitcoin_p2pkh", "bitcoin_p2wpkh", "solana"]
export type HdPublicRow = { account: number; evm: string; bitcoin: string; bitcoin_p2pkh: string; bitcoin_p2wpkh: string; solana: string }
export type HdRecordMetadata = { kind: "hd-seed"; profile: typeof HD_PROFILE; accounts: HdPublicRow[] }
export type HdChain = "evm" | "bitcoin" | "solana"
export type HdDerivation = { chain: "bitcoin"; account: number; address_type: "p2tr" } | { chain: "evm" | "solana"; account: number }
export type HdAccount0 = { eth: string; btc_legacy: string; btc_segwit: string; btc_taproot: string; solana: string }
export type HdPayload = { entropy: Uint8Array; seed: Uint8Array; passphraseRequired: boolean }

export function hdObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid protected HD object")
  return value as Record<string, unknown>
}
export function exactHdFields(value: Record<string, unknown>, fields: readonly string[]): void {
  if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field))) throw new Error("invalid protected HD fields")
}
export function hdAccount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value >= HD_ACCOUNT_LIMIT) throw new Error("invalid protected HD account")
  return value
}
export function parseHdDerivation(value: unknown): HdDerivation {
  const row = hdObject(value)
  const account = hdAccount(row.account)
  if (row.chain === "bitcoin") {
    exactHdFields(row, ["chain", "account", "address_type"])
    if (row.address_type !== "p2tr") throw new Error("protected HD Bitcoin only supports explicit p2tr")
    return { chain: "bitcoin", account, address_type: "p2tr" }
  }
  exactHdFields(row, ["chain", "account"])
  if (row.chain !== "evm" && row.chain !== "solana") throw new Error("invalid protected HD chain")
  return { chain: row.chain, account }
}
export function hdPath(chain: HdChain, account: number): string {
  hdAccount(account)
  if (chain === "evm") return `m/44'/60'/0'/0/${account}`
  if (chain === "bitcoin") return `m/86'/0'/0'/0/${account}`
  if (chain === "solana") return `m/44'/501'/${account}'/0'`
  throw new Error("invalid protected HD chain")
}
function publicKey(value: unknown, solana = false): string {
  if (typeof value !== "string" || !(solana ? /^[0-9a-f]{64}$/ : /^(02|03)[0-9a-f]{64}$/).test(value)) throw new Error("invalid protected HD public key")
  const bytes = hexToBytes(value)
  if (solana ? !ed25519.utils.isValidPublicKey(bytes, false) : !secp256k1.utils.isValidPublicKey(bytes)) throw new Error("invalid protected HD public key")
  return value
}
export function parseHdRecordMetadata(value: unknown): HdRecordMetadata {
  const record = hdObject(value)
  exactHdFields(record, ["kind", "profile", "accounts"])
  if (record.kind !== "hd-seed" || record.profile !== HD_PROFILE || !Array.isArray(record.accounts) || record.accounts.length !== HD_ACCOUNT_LIMIT) throw new Error("invalid protected HD profile/table")
  return { kind: "hd-seed", profile: HD_PROFILE, accounts: record.accounts.map((value, i) => {
    const row = hdObject(value)
    exactHdFields(row, ROW_FIELDS)
    if (hdAccount(row.account) !== i) throw new Error("protected HD accounts must be ordered 0..19")
    return { account: i, evm: publicKey(row.evm), bitcoin: publicKey(row.bitcoin), solana: publicKey(row.solana, true), bitcoin_p2pkh: publicKey(row.bitcoin_p2pkh), bitcoin_p2wpkh: publicKey(row.bitcoin_p2wpkh) }
  }) }
}
export function encodeHdPayload(payload: HdPayload): Uint8Array {
  if (!ENTROPY_LENGTHS.includes(payload.entropy.length) || payload.seed.length !== 64 || typeof payload.passphraseRequired !== "boolean") throw new Error("invalid protected HD payload")
  const bytes = new Uint8Array(95 + payload.entropy.length)
  bytes.set(MARKER)
  bytes[29] = payload.entropy.length
  bytes.set(payload.entropy, 30)
  bytes.set(payload.seed, 30 + payload.entropy.length)
  bytes[bytes.length - 1] = Number(payload.passphraseRequired)
  return bytes
}
/** Copies only after exact bounds validation; caller wipes both output buffers. */
export function decodeHdPayload(bytes: Uint8Array): HdPayload {
  const length = bytes[29]
  if (!ENTROPY_LENGTHS.includes(length) || bytes.length !== 95 + length || MARKER.some((byte, i) => byte !== bytes[i]) || ![0, 1].includes(bytes[bytes.length - 1])) throw new Error("invalid protected HD payload")
  return { entropy: bytes.slice(30, 30 + length), seed: bytes.slice(30 + length, 94 + length), passphraseRequired: bytes[bytes.length - 1] === 1 }
}
export function wipeHdPayload(payload: HdPayload | undefined): void {
  payload?.entropy.fill(0)
  payload?.seed.fill(0)
}
export function normalizeHdWords(value: string): string {
  return value.normalize("NFKD").toLowerCase().trim().split(/\s+/u).filter(Boolean).join(" ")
}
/** UI owns the returned immutable strings and clears them at every terminal path. */
export function hdWords(entropy: Uint8Array): string { return entropyToMnemonic(entropy, wordlist) }
export function hdPayloadFromWords(words: string, passphrase: string): HdPayload {
  const normalized = normalizeHdWords(words)
  const entropy = mnemonicToEntropy(normalized, wordlist)
  try {
    return { entropy, seed: mnemonicToSeedSync(normalized, passphrase), passphraseRequired: passphrase.normalize("NFKD").length > 0 }
  } catch (error) {
    entropy.fill(0)
    throw error
  }
}
function slip10(seed: Uint8Array, account: number): Uint8Array {
  let material = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed)
  try {
    for (const index of [44, 501, account, 0]) {
      const input = new Uint8Array(37)
      input.set(material.subarray(0, 32), 1)
      new DataView(input.buffer).setUint32(33, 0x80000000 + index, false)
      let next: Uint8Array
      try { next = hmac(sha512, material.subarray(32), input) } finally { input.fill(0) }
      material.fill(0)
      material = next
    }
    return material.slice(0, 32)
  } finally { material.fill(0) }
}
function withPathKey<T>(seed: Uint8Array, path: string, operation: (key: Uint8Array) => T): T {
  if (seed.length !== 64) throw new Error("protected HD seed must be 64 bytes")
  const root = HDKey.fromMasterSeed(seed)
  let child: HDKey | undefined
  let key: Uint8Array | undefined
  try {
    child = root.derive(path)
    if (!child.privateKey) throw new Error("protected HD derivation failed")
    key = new Uint8Array(child.privateKey)
    return operation(key)
  } finally {
    key?.fill(0)
    child?.wipePrivateData()
    root.wipePrivateData()
  }
}
/** Synchronous custody callback only; never expose its key through RPC or persist it. */
export function withHdSigningKey<T>(seed: Uint8Array, selection: HdDerivation, operation: (key: Uint8Array) => T): T {
  const checked = parseHdDerivation(selection)
  if (seed.length !== 64) throw new Error("protected HD seed must be 64 bytes")
  if (checked.chain !== "solana") return withPathKey(seed, hdPath(checked.chain, checked.account), operation)
  const key = slip10(seed, checked.account)
  try { return operation(key) } finally { key.fill(0) }
}
export function deriveHdAccounts(seed: Uint8Array): HdPublicRow[] {
  if (seed.length !== 64) throw new Error("protected HD seed must be 64 bytes")
  const root = HDKey.fromMasterSeed(seed)
  try {
    return Array.from({ length: HD_ACCOUNT_LIMIT }, (_, account) => {
      const point = (path: string): string => {
        const child = root.derive(path)
        try {
          if (!child.publicKey) throw new Error("protected HD derivation failed")
          return bytesToHex(child.publicKey)
        } finally { child.wipePrivateData() }
      }
      const solKey = slip10(seed, account)
      try {
        return { account, evm: point(hdPath("evm", account)), bitcoin: point(hdPath("bitcoin", account)), solana: bytesToHex(ed25519.getPublicKey(solKey)), bitcoin_p2pkh: point(`m/44'/0'/0'/0/${account}`), bitcoin_p2wpkh: point(`m/84'/0'/0'/0/${account}`) }
      } finally { solKey.fill(0) }
    })
  } finally { root.wipePrivateData() }
}
export function hdAccount0Addresses(row: HdPublicRow): HdAccount0 {
  const key = hexToBytes(publicKey(row.evm))
  const lower = bytesToHex(keccak_256(secp256k1.Point.fromBytes(key).toBytes(false).slice(1)).slice(-20))
  const checksum = bytesToHex(keccak_256(new TextEncoder().encode(lower)))
  const hash160 = (key: string) => ripemd160(sha256(hexToBytes(publicKey(key))))
  const internalX = hexToBytes(publicKey(row.bitcoin)).slice(1)
  const tweak = BigInt(`0x${bytesToHex(schnorr.utils.taggedHash("TapTweak", internalX))}`)
  if (tweak >= secp256k1.Point.Fn.ORDER) throw new Error("invalid protected HD Taproot tweak")
  const point = secp256k1.Point.fromBytes(new Uint8Array([2, ...internalX]))
  const output = tweak === 0n ? point : point.add(secp256k1.Point.BASE.multiply(tweak))
  if (output.equals(secp256k1.Point.ZERO)) throw new Error("invalid protected HD Taproot output")
  return {
    eth: "0x" + [...lower].map((c, i) => parseInt(checksum[i], 16) >= 8 ? c.toUpperCase() : c).join(""),
    btc_legacy: base58check(sha256).encode(new Uint8Array([0, ...hash160(row.bitcoin_p2pkh)])),
    btc_segwit: bech32.encode("bc", [0, ...bech32.toWords(hash160(row.bitcoin_p2wpkh))]),
    btc_taproot: bech32m.encode("bc", [1, ...bech32m.toWords(output.toBytes(true).slice(1))]),
    solana: base58.encode(hexToBytes(publicKey(row.solana, true))),
  }
}
/** Existing Python ensure_ascii STRING-ARRAY fingerprint; preserve the raw wrap. */
export function hdEnvelopeFingerprint(envelope: { ciphertext: string; nonce: string; wrap_meta: string }): string {
  const text = JSON.stringify([envelope.ciphertext, envelope.nonce, envelope.wrap_meta]).replace(/[\u007f-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
  return bytesToHex(sha256(new TextEncoder().encode(text)))
}

/** Bounded scalar-valid JSON, allowing finite legacy root extension numbers. */
export function parseHdWrapJson(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 65_536 || new TextEncoder().encode(raw).length > 65_536) throw new Error("invalid protected HD wrap_meta size/type")
  const parsed: unknown = JSON.parse(raw)
  const scalarString = (value: string): void => {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i)
      if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("invalid protected HD Unicode") }
      else if (code >= 0xdc00 && code <= 0xdfff) throw new Error("invalid protected HD Unicode")
    }
  }
  const visit = (value: unknown, depth: number): void => {
    if (typeof value === "string") scalarString(value)
    else if (typeof value === "number" && !Number.isFinite(value)) throw new Error("invalid protected HD JSON number")
    else if (value && typeof value === "object") {
      if (depth > 64) throw new Error("protected HD JSON is too deep")
      for (const [key, child] of Object.entries(value)) { scalarString(key); visit(child, depth + 1) }
    }
  }
  visit(parsed, 1)
  return hdObject(parsed)
}
export function strictHdBase64(value: unknown, sizes: readonly number[]): Uint8Array {
  if (typeof value !== "string" || value.length > Math.ceil(Math.max(...sizes) / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("invalid protected HD base64")
  const decoded = Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
  if (!sizes.includes(decoded.length) || btoa(String.fromCharCode(...decoded)) !== value) throw new Error("invalid protected HD field length/encoding")
  return decoded
}
export function validateHdEnvelopeFields(envelope: { ciphertext: string; nonce: string; wrap_meta: string }, wrap: Record<string, unknown>): void {
  if (wrap.v !== 1 || wrap.scheme !== "machine-aesgcm-v1") throw new Error("invalid protected HD envelope version/scheme")
  strictHdBase64(envelope.nonce, [12])
  strictHdBase64(envelope.ciphertext, [127, 131, 135, 139, 143])
  strictHdBase64(wrap.dek_nonce, [12])
  strictHdBase64(wrap.wrapped_dek, [48])
}
