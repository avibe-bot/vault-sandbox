import { taprootOutputKeyXOnly } from "./vaultCrypto"
import { ripemd160 } from "@noble/hashes/legacy.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { RpcError } from "./rpc"
import { t } from "./i18n"

export const BITCOIN_CONTEXT_KIND = "bitcoin-taproot-keypath-v1" as const
export const BITCOIN_DIGEST_ALGORITHM = "bip341-sighash-default-keypath" as const
export const BITCOIN_SCHEME = "schnorr-secp256k1-bip341-keypath" as const
export const BITCOIN_NETWORKS = ["bitcoin", "testnet", "signet", "regtest"] as const
export type BitcoinNetwork = typeof BITCOIN_NETWORKS[number]

const MONEY_RANGE_SATS = 21_000_000n * 100_000_000n
const MAX_TRANSACTION_BYTES = 137
const HEX_RE = /^[0-9a-f]+$/
const CHARSET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
const BECH32M_CONST = 0x2bc830a3
const BECH32_CONST = 1

export type BitcoinSigningContext = {
  kind: typeof BITCOIN_CONTEXT_KIND
  network: BitcoinNetwork
  unsignedTransaction: string
  prevout: { amountSats: number; scriptPubKey: string }
  digestAlgorithm: typeof BITCOIN_DIGEST_ALGORITHM
  digest: string
}

type BitcoinOutput = { amountSats: bigint; scriptPubKey: Uint8Array; kind: OutputKind }
type OutputKind = "p2pkh" | "p2sh" | "p2wpkh" | "p2wsh" | "p2tr"
type BitcoinTransaction = {
  raw: Uint8Array
  prevoutHashLe: Uint8Array
  prevoutIndex: number
  sequence: number
  outputs: BitcoinOutput[]
  locktime: number
}

export type VerifiedBitcoinContext = {
  digest: string
  display: string
  transaction: BitcoinTransaction
  outputKeyXOnly: Uint8Array
}

function fail(message: string): never {
  throw new RpcError("invalid_payload", message)
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`)
  return value as Record<string, unknown>
}

function exactFields(value: Record<string, unknown>, allowed: string[], field: string): void {
  const extra = Object.keys(value).filter((key) => !allowed.includes(key))
  if (extra.length > 0) fail(`${field} carries unsupported fields: ${extra.sort().join(", ")}`)
  const missing = allowed.filter((key) => !(key in value))
  if (missing.length > 0) fail(`${field} is missing required fields: ${missing.join(", ")}`)
}

function lowerHex(value: unknown, field: string, length?: number): string {
  if (typeof value !== "string" || (length !== undefined && value.length !== length) || value.length === 0 || !HEX_RE.test(value)) {
    fail(`${field} must be lowercase hexadecimal${length === undefined ? "" : ` of length ${length}`}`)
  }
  return value
}

function safeInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    fail(`${field} must be an integer in ${min}..${max}`)
  }
  return value
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function readBytes(raw: Uint8Array, offset: number, length: number, field: string): [Uint8Array, number] {
  if (offset + length > raw.length) fail(`transaction is truncated while reading ${field}`)
  return [raw.slice(offset, offset + length), offset + length]
}

function compactSize(raw: Uint8Array, offset: number, field: string): [number, number] {
  if (offset >= raw.length) fail(`transaction is truncated before ${field}`)
  const value = raw[offset]
  if (value >= 0xfd) fail(`${field} must use a single-byte CompactSize`)
  return [value, offset + 1]
}

function u32le(bytes: Uint8Array): number {
  return ((bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24)) >>> 0
}

function u64le(bytes: Uint8Array): bigint {
  let result = 0n
  for (let index = 0; index < 8; index += 1) result |= BigInt(bytes[index] ?? 0) << BigInt(index * 8)
  return result
}

function u32Bytes(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff])
}

function u64Bytes(value: bigint): Uint8Array {
  const out = new Uint8Array(8)
  let remaining = value
  for (let index = 0; index < 8; index += 1) {
    out[index] = Number(remaining & 0xffn)
    remaining >>= 8n
  }
  return out
}

function scriptKind(script: Uint8Array): OutputKind {
  if (script.length === 25 && script[0] === 0x76 && script[1] === 0xa9 && script[2] === 0x14 && script[23] === 0x88 && script[24] === 0xac) return "p2pkh"
  if (script.length === 23 && script[0] === 0xa9 && script[1] === 0x14 && script[22] === 0x87) return "p2sh"
  if (script.length === 22 && script[0] === 0x00 && script[1] === 0x14) return "p2wpkh"
  if (script.length === 34 && script[0] === 0x00 && script[1] === 0x20) return "p2wsh"
  if (script.length === 34 && script[0] === 0x51 && script[1] === 0x20) return "p2tr"
  fail("transaction output uses an unsupported script template")
}

function parseTransaction(unsignedTransaction: string): BitcoinTransaction {
  if (unsignedTransaction.length === 0 || unsignedTransaction.length % 2 || unsignedTransaction.length > MAX_TRANSACTION_BYTES * 2 || !HEX_RE.test(unsignedTransaction)) {
    fail("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes")
  }
  const raw = Uint8Array.from(unsignedTransaction.match(/../g)!, (pair) => Number.parseInt(pair, 16))
  if (raw.length < 4 || raw[0] !== 2 || raw[1] !== 0 || raw[2] !== 0 || raw[3] !== 0) fail("transaction version must be exactly 2")
  let offset = 4
  const [inputCount, afterInputCount] = compactSize(raw, offset, "input count")
  offset = afterInputCount
  if (inputCount !== 1) fail("transaction must contain exactly one input")
  const [prevoutHashLe, afterHash] = readBytes(raw, offset, 32, "outpoint hash")
  offset = afterHash
  if (prevoutHashLe.every((byte) => byte === 0)) fail("outpoint hash must not be null")
  const [prevoutIndexBytes, afterIndex] = readBytes(raw, offset, 4, "outpoint index")
  offset = afterIndex
  const prevoutIndex = u32le(prevoutIndexBytes)
  const [scriptSigLength, afterScriptLength] = compactSize(raw, offset, "scriptSig length")
  offset = afterScriptLength
  if (scriptSigLength !== 0) fail("scriptSig must be empty")
  const [sequenceBytes, afterSequence] = readBytes(raw, offset, 4, "sequence")
  offset = afterSequence
  const sequence = u32le(sequenceBytes)
  if (sequence !== 0xfffffffd && sequence !== 0xfffffffe && sequence !== 0xffffffff) fail("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff")
  const [outputCount, afterOutputCount] = compactSize(raw, offset, "output count")
  offset = afterOutputCount
  if (outputCount !== 1 && outputCount !== 2) fail("transaction must contain one or two outputs")
  const outputs: BitcoinOutput[] = []
  const dust: Record<OutputKind, bigint> = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n }
  for (let index = 0; index < outputCount; index += 1) {
    const [amountBytes, afterAmount] = readBytes(raw, offset, 8, `output ${index} amount`)
    offset = afterAmount
    const amountSats = u64le(amountBytes)
    if (amountSats < 1n || amountSats > MONEY_RANGE_SATS) fail(`output ${index} amount is outside the Bitcoin money range`)
    const [scriptLength, afterScriptLength2] = compactSize(raw, offset, `output ${index} script length`)
    offset = afterScriptLength2
    const [scriptPubKey, afterScript] = readBytes(raw, offset, scriptLength, `output ${index} script`)
    offset = afterScript
    const kind = scriptKind(scriptPubKey)
    const expectedLength: Record<OutputKind, number> = { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }
    if (scriptLength !== expectedLength[kind]) fail(`output ${index} script length is not canonical for ${kind}`)
    if (amountSats < dust[kind]) fail(`output ${index} is below the V1 ${kind} dust floor`)
    outputs.push({ amountSats, scriptPubKey, kind })
  }
  const [locktimeBytes, afterLocktime] = readBytes(raw, offset, 4, "locktime")
  offset = afterLocktime
  const locktime = u32le(locktimeBytes)
  if (locktime !== 0) fail("locktime must be exactly zero")
  if (offset !== raw.length) fail("transaction has trailing bytes")
  const outputTotal = outputs.reduce((sum, output) => sum + output.amountSats, 0n)
  if (outputTotal < 1n || outputTotal > MONEY_RANGE_SATS) fail("output total is outside the Bitcoin money range")
  return { raw, prevoutHashLe, prevoutIndex, sequence, outputs, locktime }
}

function taggedHash(tag: string, payload: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag))
  return sha256(concat(tagHash, tagHash, payload))
}

function taprootSighash(tx: BitcoinTransaction, amountSats: bigint, scriptPubKey: Uint8Array): Uint8Array {
  const prevout = concat(tx.prevoutHashLe, u32Bytes(tx.prevoutIndex))
  const script = concat(new Uint8Array([scriptPubKey.length]), scriptPubKey)
  const outputs = tx.outputs.map((output) => concat(u64Bytes(output.amountSats), new Uint8Array([output.scriptPubKey.length]), output.scriptPubKey))
  const message = concat(
    new Uint8Array([0x00, 0x00]),
    u32Bytes(2),
    u32Bytes(tx.locktime),
    sha256(prevout),
    sha256(u64Bytes(amountSats)),
    sha256(script),
    sha256(u32Bytes(tx.sequence)),
    sha256(concat(...outputs)),
    new Uint8Array([0x00]),
    u32Bytes(0),
  )
  return taggedHash("TapSighash", message)
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(bytes)}`)
}

function hash160(value: Uint8Array): Uint8Array {
  return ripemd160(sha256(value))
}

function base58Check(version: number, payload: Uint8Array): string {
  const data = concat(new Uint8Array([version]), payload)
  const checksum = sha256(sha256(data)).slice(0, 4)
  const full = concat(data, checksum)
  let value = bytesToBigInt(full)
  let output = ""
  while (value > 0n) {
    const remainder = Number(value % 58n)
    output = CHARSET[remainder] + output
    value /= 58n
  }
  for (const byte of full) {
    if (byte !== 0) break
    output = `1${output}`
  }
  return output
}

function convertBits(data: Uint8Array, fromBits: number, toBits: number): number[] {
  let accumulator = 0
  let bits = 0
  const result: number[] = []
  const maxValue = (1 << toBits) - 1
  for (const value of data) {
    accumulator = (accumulator << fromBits) | value
    bits += fromBits
    while (bits >= toBits) {
      bits -= toBits
      result.push((accumulator >> bits) & maxValue)
    }
  }
  if (bits > 0) result.push((accumulator << (toBits - bits)) & maxValue)
  return result
}

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let checksum = 1
  for (const value of values) {
    const top = checksum >>> 25
    checksum = ((checksum & 0x1ffffff) << 5) ^ value
    for (let index = 0; index < 5; index += 1) if ((top >>> index) & 1) checksum ^= generators[index]
  }
  return checksum >>> 0
}

function bech32Address(network: BitcoinNetwork, version: number, program: Uint8Array): string {
  const hrp = network === "bitcoin" ? "bc" : network === "regtest" ? "bcrt" : "tb"
  const data = [version, ...convertBits(program, 8, 5)]
  const hrpExpanded = [...hrp].map((char) => char.charCodeAt(0) >> 5).concat([0], [...hrp].map((char) => char.charCodeAt(0) & 31))
  const constant = version === 0 ? BECH32_CONST : BECH32M_CONST
  const polymod = bech32Polymod(hrpExpanded.concat(data, [0, 0, 0, 0, 0, 0])) ^ constant
  const checksum = Array.from({ length: 6 }, (_, index) => (polymod >>> (5 * (5 - index))) & 31)
  return `${hrp}1${data.concat(checksum).map((value) => BECH32_CHARSET[value]).join("")}`
}

function outputAddress(network: BitcoinNetwork, script: Uint8Array): string {
  const kind = scriptKind(script)
  const isMainnet = network === "bitcoin"
  if (kind === "p2pkh") return base58Check(isMainnet ? 0x00 : 0x6f, script.slice(3, 23))
  if (kind === "p2sh") return base58Check(isMainnet ? 0x05 : 0xc4, script.slice(2, 22))
  if (kind === "p2wpkh") return bech32Address(network, 0, script.slice(2))
  if (kind === "p2wsh") return bech32Address(network, 0, script.slice(2))
  return bech32Address(network, 1, script.slice(2))
}

function sameKeyLegacyScripts(publicKey: Uint8Array): Uint8Array[] {
  const keyHash = hash160(publicKey)
  const redeem = concat(new Uint8Array([0x00, 0x14]), keyHash)
  return [
    concat(new Uint8Array([0x76, 0xa9, 0x14]), keyHash, new Uint8Array([0x88, 0xac])),
    redeem,
    concat(new Uint8Array([0xa9, 0x14]), hash160(redeem), new Uint8Array([0x87])),
  ]
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index])
}

function satsToBtc(value: bigint): string {
  const whole = value / 100_000_000n
  const fraction = value % 100_000_000n
  if (fraction === 0n) return `${whole}.00000000`
  return `${whole}.${fraction.toString().padStart(8, "0")}`
}

function rateText(fee: bigint, vsize: number): string {
  const whole = fee / BigInt(vsize)
  const remainder = fee % BigInt(vsize)
  if (remainder === 0n) return `${whole.toString()} sat/vB`
  const fractional = ((remainder * 10_000n) / BigInt(vsize)).toString().padStart(4, "0").replace(/0+$/, "")
  return `${whole.toString()}.${fractional} sat/vB`
}

function txid(tx: BitcoinTransaction): string {
  return bytesToHex(sha256(sha256(tx.raw)).slice().reverse())
}

function displayBitcoinContext(context: BitcoinSigningContext, verified: {
  transaction: BitcoinTransaction
  outputKeyXOnly: Uint8Array
  feeSats: bigint
  signedVsize: number
  sameKeyOutputIndexes: number[]
  highFeeWarning: boolean
  netLeavingSats: bigint
}): string {
  const tx = verified.transaction
  const network = t("bitcoin.network", { network: context.network })
  const lines = [
    t("bitcoin.title"),
    ...(verified.highFeeWarning ? [t("bitcoin.highFeeWarning"), ""] : []),
    network,
    t("bitcoin.networkWarning"),
    t("bitcoin.input", { txid: bytesToHex(tx.prevoutHashLe.slice().reverse()), vout: tx.prevoutIndex }),
    t("bitcoin.inputAmount", { sats: context.prevout.amountSats, btc: satsToBtc(BigInt(context.prevout.amountSats)) }),
    t("bitcoin.outputs"),
  ]
  tx.outputs.forEach((output, index) => {
    const sameKey = verified.sameKeyOutputIndexes.includes(index)
    lines.push(t("bitcoin.output", {
      index: index + 1,
      address: outputAddress(context.network, output.scriptPubKey),
      sats: output.amountSats.toString(),
      btc: satsToBtc(output.amountSats),
      role: sameKey ? t("bitcoin.sameKeyReturn") : t("bitcoin.recipient"),
    }))
  })
  lines.push(
    t("bitcoin.fee", { sats: verified.feeSats.toString(), btc: satsToBtc(verified.feeSats), rate: rateText(verified.feeSats, verified.signedVsize) }),
    t("bitcoin.vsize", { vsize: verified.signedVsize }),
    t(tx.sequence === 0xfffffffd ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    t("bitcoin.netLeaving", { sats: verified.netLeavingSats.toString(), btc: satsToBtc(verified.netLeavingSats) }),
    t("bitcoin.unsignedTxid", { txid: txid(tx) }),
    t("bitcoin.outputKey", { key: bytesToHex(verified.outputKeyXOnly) }),
  )
  return lines.join("\n")
}

export function parseBitcoinSigningContext(value: unknown, expectedDigest: string): BitcoinSigningContext {
  const context = record(value, "signingContext")
  exactFields(context, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext")
  if (context.kind !== BITCOIN_CONTEXT_KIND) fail("unsupported Bitcoin signing_context kind")
  if (typeof context.network !== "string" || !(BITCOIN_NETWORKS as readonly string[]).includes(context.network)) fail("bitcoin signing_context network is invalid")
  const unsignedTransaction = lowerHex(context.unsignedTransaction, "unsignedTransaction")
  if (unsignedTransaction.length > MAX_TRANSACTION_BYTES * 2) fail("unsignedTransaction exceeds the 137-byte V1 limit")
  const prevout = record(context.prevout, "signingContext.prevout")
  exactFields(prevout, ["amountSats", "scriptPubKey"], "signingContext.prevout")
  const amountSats = safeInteger(prevout.amountSats, "prevout.amountSats", 1, Number(MONEY_RANGE_SATS))
  const scriptPubKey = lowerHex(prevout.scriptPubKey, "prevout.scriptPubKey", 68)
  if (!scriptPubKey.startsWith("5120")) fail("prevout.scriptPubKey must be a lowercase P2TR output key script")
  if (context.digestAlgorithm !== BITCOIN_DIGEST_ALGORITHM) fail("unsupported Bitcoin digest algorithm")
  const digest = lowerHex(context.digest, "signingContext.digest", 64)
  if (digest !== expectedDigest) fail("Bitcoin signing_context digest must match the sign request digest exactly")
  return {
    kind: BITCOIN_CONTEXT_KIND,
    network: context.network as BitcoinNetwork,
    unsignedTransaction,
    prevout: { amountSats, scriptPubKey },
    digestAlgorithm: BITCOIN_DIGEST_ALGORITHM,
    digest,
  }
}

export function verifyBitcoinSigningContext(value: unknown, expectedDigest: string, publicKey?: string): VerifiedBitcoinContext {
  const context = parseBitcoinSigningContext(value, expectedDigest)
  const tx = parseTransaction(context.unsignedTransaction)
  const prevoutScript = Uint8Array.from(context.prevout.scriptPubKey.match(/../g)!, (pair) => Number.parseInt(pair, 16))
  const outputKeyXOnly = prevoutScript.slice(2)
  let publicKeyBytes: Uint8Array | undefined
  if (publicKey !== undefined) {
    const compressedPublicKey = lowerHex(publicKey, "signing public key", 66)
    publicKeyBytes = Uint8Array.from(compressedPublicKey.match(/../g)!, (pair) => Number.parseInt(pair, 16))
    if (publicKeyBytes[0] !== 2 && publicKeyBytes[0] !== 3) fail("signing public key must be compressed secp256k1")
    const derivedOutputKeyXOnly = taprootOutputKeyXOnly(compressedPublicKey)
    if (!equalBytes(outputKeyXOnly, derivedOutputKeyXOnly)) fail("prevout.scriptPubKey does not bind to the signing key's BIP86 output key")
  }
  if (publicKeyBytes) {
    for (const output of tx.outputs) {
      if (sameKeyLegacyScripts(publicKeyBytes).some((script) => equalBytes(script, output.scriptPubKey))) fail("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend")
    }
  }
  const sameKeyOutputIndexes = tx.outputs.flatMap((output, index) => equalBytes(output.scriptPubKey, prevoutScript) ? [index] : [])
  if (sameKeyOutputIndexes.length > 1) fail("transaction may contain at most one same-key P2TR return output")
  const total = tx.outputs.reduce((sum, output) => sum + output.amountSats, 0n)
  const feeSats = BigInt(context.prevout.amountSats) - total
  if (feeSats <= 0n) fail("transaction fee must be positive")
  const signedWeight = tx.raw.length * 4 + 68
  const signedVsize = Math.ceil(signedWeight / 4)
  if (feeSats > 10_000n * BigInt(signedVsize)) fail("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling")
  const digest = bytesToHex(taprootSighash(tx, BigInt(context.prevout.amountSats), prevoutScript))
  if (digest !== context.digest) fail("Bitcoin signing_context digest does not match the independently computed BIP341 digest")
  const returned = sameKeyOutputIndexes.reduce((sum, index) => sum + tx.outputs[index].amountSats, 0n)
  return {
    digest,
    display: displayBitcoinContext(context, {
      transaction: tx,
      outputKeyXOnly,
      feeSats,
      signedVsize,
      sameKeyOutputIndexes,
      highFeeWarning: feeSats > 100n * BigInt(signedVsize) || feeSats * 100n > BigInt(context.prevout.amountSats) * 2n,
      netLeavingSats: BigInt(context.prevout.amountSats) - returned,
    }),
    transaction: tx,
    outputKeyXOnly,
  }
}
