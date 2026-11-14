import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  BITCOIN_NETWORKS, MONEY_RANGE_SATS, concat, equalBytes, hash160, outputAddress,
  parseTransaction, u32Bytes, u64Bytes, type BitcoinNetwork, type BitcoinTransaction,
} from "./bitcoin"
import { RpcError } from "./rpc"
import { taprootOutputKeyXOnly } from "./vaultCrypto"
import { assertBitcoinContextLimits, BITCOIN_PARENT_MAX_BYTES, bitcoinHex } from "./bitcoinResourceLimits"

export const BITCOIN_ECDSA_SCHEME = "ecdsa-secp256k1-der" as const
export type BitcoinEcdsaType = "p2pkh" | "p2wpkh"
export type BitcoinReturnKeys = { p2pkh: string; p2wpkh: string; p2tr: string }

type CommonContext = {
  network: BitcoinNetwork; unsignedTransaction: string; sighashType: 1; digest: string
}
export type BitcoinLegacyContext = CommonContext & {
  kind: "bitcoin-p2pkh-v1"; addressType: "p2pkh"; digestAlgorithm: "bitcoin-legacy-sighash-all"
  prevout: { parentTransaction: string; txid: string; vout: number; amountSats: number; scriptPubKey: string }
}
export type BitcoinNativeContext = CommonContext & {
  kind: "bitcoin-p2wpkh-v1"; addressType: "p2wpkh"; digestAlgorithm: "bitcoin-bip143-sighash-all"
  prevout: { amountSats: number; scriptPubKey: string }
}
export type BitcoinEcdsaContext = BitcoinLegacyContext | BitcoinNativeContext

function fail(message: string): never { throw new RpcError("invalid_payload", message) }
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`)
  return value as Record<string, unknown>
}
function fields(value: Record<string, unknown>, names: string[], label: string): void {
  if (Object.keys(value).length !== names.length || names.some((key) => !Object.hasOwn(value, key))) fail(`${label} has unsupported or missing fields`)
}
function integer(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${label} is outside its integer range`)
  return value
}
function doubleSha256(bytes: Uint8Array): Uint8Array { return sha256(sha256(bytes)) }
function transactionId(bytes: Uint8Array): string { return bytesToHex(doubleSha256(bytes).reverse()) }
function publicPoint(publicKey: string): Uint8Array {
  bitcoinHex(publicKey, 33, "selected public key", 33)
  if (!/^(02|03)/.test(publicKey)) fail("selected public key must be compressed secp256k1")
  const bytes = hexToBytes(publicKey)
  try { secp256k1.Point.fromBytes(bytes).assertValidity() } catch { fail("selected public key is not a secp256k1 point") }
  return bytes
}
export function bitcoinKeyScripts(publicKey: string) {
  const keyHash = hash160(publicPoint(publicKey))
  return {
    p2pkh: concat(new Uint8Array([0x76, 0xa9, 0x14]), keyHash, new Uint8Array([0x88, 0xac])),
    p2wpkh: concat(new Uint8Array([0x00, 0x14]), keyHash),
    p2tr: concat(new Uint8Array([0x51, 0x20]), taprootOutputKeyXOnly(publicKey)),
  }
}

/** Funding serialization is NOT the spend grammar: opaque scripts and all uint32 bit patterns. */
export function parseBitcoinFundingTransaction(parentTransaction: unknown) {
  const hex = bitcoinHex(parentTransaction, BITCOIN_PARENT_MAX_BYTES, "parentTransaction")
  const raw = hexToBytes(hex)
  let offset = 0
  function take(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > raw.length - offset) fail("funding transaction is truncated")
    const bytes = raw.subarray(offset, offset + length)
    offset += length
    return bytes
  }
  function uint(length: number): bigint {
    const bytes = take(length)
    let result = 0n
    for (let i = 0; i < length; i++) result |= BigInt(bytes[i]) << BigInt(i * 8)
    return result
  }
  function compact(max: number, label: string): number {
    const prefix = take(1)[0]
    const value = prefix < 0xfd ? BigInt(prefix) : uint(prefix === 0xfd ? 2 : prefix === 0xfe ? 4 : 8)
    if ((prefix === 0xfd && value < 253n) || (prefix === 0xfe && value < 65536n)
      || (prefix === 0xff && value < 4294967296n)) fail(`funding ${label} has a nonminimal CompactSize`)
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value > BigInt(max)) fail(`funding ${label} exceeds its bound`)
    return Number(value)
  }
  take(4)
  const inputCount = compact(128, "input count")
  if (inputCount === 0) fail("funding transaction must have 1..128 inputs, without witness serialization")
  for (let i = 0; i < inputCount; i++) {
    take(36)
    take(compact(10_000, "input script length"))
    take(4)
  }
  const outputCount = compact(128, "output count")
  if (outputCount === 0) fail("funding transaction must have 1..128 outputs")
  const outputs: Array<{ amountSats: bigint; scriptPubKey: Uint8Array }> = []
  let total = 0n
  for (let i = 0; i < outputCount; i++) {
    const amountSats = uint(8)
    total += amountSats
    if (amountSats > MONEY_RANGE_SATS || total > MONEY_RANGE_SATS) fail("funding output amount/total exceeds the Bitcoin money range")
    const scriptPubKey = take(compact(10_000, "output script length"))
    outputs.push({ amountSats, scriptPubKey })
  }
  take(4)
  if (offset !== raw.length) fail("funding transaction has trailing bytes or witnesses")
  // Hash only a completely parsed, range-checked parent.
  const hash = doubleSha256(raw)
  return { raw, outputs, hash, txid: bytesToHex(hash.slice().reverse()) }
}

export function parseBitcoinEcdsaContext(value: unknown, expectedDigest: string): BitcoinEcdsaContext {
  assertBitcoinContextLimits(value)
  const c = object(value, "Bitcoin signingContext")
  const p = object(c.prevout, "Bitcoin prevout")
  // Even malformed/native kinds cannot put an unbounded proof through generic validation.
  if (Object.hasOwn(p, "parentTransaction")) bitcoinHex(p.parentTransaction, BITCOIN_PARENT_MAX_BYTES, "parentTransaction")
  fields(c, ["kind", "addressType", "network", "unsignedTransaction", "prevout", "sighashType", "digestAlgorithm", "digest"], "Bitcoin signingContext")
  const legacy = c.kind === "bitcoin-p2pkh-v1"
  if ((!legacy && c.kind !== "bitcoin-p2wpkh-v1") || c.addressType !== (legacy ? "p2pkh" : "p2wpkh")
    || c.digestAlgorithm !== (legacy ? "bitcoin-legacy-sighash-all" : "bitcoin-bip143-sighash-all") || c.sighashType !== 1) fail("Bitcoin context kind/type/algorithm/SIGHASH_ALL mismatch")
  if (!(BITCOIN_NETWORKS as readonly unknown[]).includes(c.network)) fail("Bitcoin network is invalid")
  bitcoinHex(c.unsignedTransaction, 137, "unsignedTransaction")
  bitcoinHex(c.digest, 32, "digest", 32)
  if (c.digest !== expectedDigest) fail("Bitcoin context digest differs from request digest")
  fields(p, legacy ? ["parentTransaction", "txid", "vout", "amountSats", "scriptPubKey"] : ["amountSats", "scriptPubKey"], "Bitcoin prevout")
  integer(p.amountSats, 1, Number(MONEY_RANGE_SATS), "prevout amount")
  bitcoinHex(p.scriptPubKey, legacy ? 25 : 22, "prevout script", legacy ? 25 : 22)
  if (legacy) {
    bitcoinHex(p.txid, 32, "parent txid", 32)
    integer(p.vout, 0, 0xffffffff, "prevout vout")
  }
  return c as unknown as BitcoinEcdsaContext
}

function serializedOutputs(tx: BitcoinTransaction): Uint8Array {
  return concat(...tx.outputs.map((out) => concat(u64Bytes(out.amountSats), new Uint8Array([out.scriptPubKey.length]), out.scriptPubKey)))
}
/** Public-only hashing primitive; NOT sign admission or funding/UTXO validation. */
export function bitcoinEcdsaSighash(tx: BitcoinTransaction, type: BitcoinEcdsaType, amountSats: bigint, scriptCode: Uint8Array): string {
  if (type !== "p2pkh" && type !== "p2wpkh") fail("unsupported ECDSA Bitcoin type")
  const outpoint = concat(tx.prevoutHashLe, u32Bytes(tx.prevoutIndex))
  const script = concat(new Uint8Array([scriptCode.length]), scriptCode)
  const outputs = serializedOutputs(tx)
  const preimage = type === "p2pkh"
    ? concat(u32Bytes(2), new Uint8Array([1]), outpoint, script, u32Bytes(tx.sequence), new Uint8Array([tx.outputs.length]), outputs, u32Bytes(tx.locktime), u32Bytes(1))
    : concat(u32Bytes(2), doubleSha256(outpoint), doubleSha256(u32Bytes(tx.sequence)), outpoint, script, u64Bytes(amountSats), u32Bytes(tx.sequence), doubleSha256(outputs), u32Bytes(tx.locktime), u32Bytes(1))
  return bytesToHex(doubleSha256(preimage))
}

export function bitcoinEcdsaVsizeRange(type: BitcoinEcdsaType, unsignedSize: number) {
  return type === "p2pkh"
    ? { min: unsignedSize + 44, max: unsignedSize + 107 }
    : { min: Math.ceil((4 * unsignedSize + 47) / 4), max: Math.ceil((4 * unsignedSize + 110) / 4) }
}
export function bitcoinFeeRateInterval(fee: bigint, minVsize: number, maxVsize: number) {
  const lo100 = 100n * fee / BigInt(maxVsize)
  const hi100 = (100n * fee + BigInt(minVsize) - 1n) / BigInt(minVsize)
  const decimal = (x: bigint) => `${x / 100n}.${(x % 100n).toString().padStart(2, "0")}`
  return { lo100, hi100, lower: decimal(lo100), upper: decimal(hi100) }
}
function feePolicy(fee: bigint, input: bigint, minVsize: number): boolean {
  if (fee <= 0n) fail("transaction fee must be positive")
  if (fee > 10_000n * BigInt(minVsize)) fail("transaction fee exceeds the conservative 10,000 sat/vB ceiling")
  return fee > 100n * BigInt(minVsize) || 100n * fee > 2n * input
}

/** keys must come from the actual opened key, or the selected seed-proven BTC siblings. */
export function verifyBitcoinEcdsaContext(value: unknown, expectedDigest: string, publicKey: string, keys?: BitcoinReturnKeys) {
  const context = parseBitcoinEcdsaContext(value, expectedDigest)
  const tx = parseTransaction(context.unsignedTransaction)
  const scripts = bitcoinKeyScripts(publicKey)
  const selectedScript = scripts[context.addressType]
  let funding: ReturnType<typeof parseBitcoinFundingTransaction> | undefined
  if (context.kind === "bitcoin-p2pkh-v1") {
    const p = context.prevout
    funding = parseBitcoinFundingTransaction(p.parentTransaction)
    if (!equalBytes(tx.prevoutHashLe, funding.hash) || p.txid !== funding.txid || p.vout !== tx.prevoutIndex || p.vout >= funding.outputs.length) fail("Legacy parent txid/outpoint/vout mismatch")
    const selected = funding.outputs[p.vout]
    if (selected.amountSats <= 0n || selected.amountSats !== BigInt(p.amountSats) || bytesToHex(selected.scriptPubKey) !== p.scriptPubKey) fail("Legacy selected parent amount/script mismatch")
  }
  if (context.prevout.scriptPubKey !== bytesToHex(selectedScript)) fail("prevout script does not match the selected key/type")
  const digest = bitcoinEcdsaSighash(tx, context.addressType, BigInt(context.prevout.amountSats), scripts.p2pkh)
  if (digest !== context.digest) fail("Bitcoin digest differs from independently computed SIGHASH_ALL")
  const returnKeys = keys ?? { p2pkh: publicKey, p2wpkh: publicKey, p2tr: publicKey }
  if (returnKeys[context.addressType] !== publicKey) fail("selected BTC purpose point differs from selected key")
  const returns = keys
    ? [bitcoinKeyScripts(returnKeys.p2pkh).p2pkh, bitcoinKeyScripts(returnKeys.p2wpkh).p2wpkh, bitcoinKeyScripts(returnKeys.p2tr).p2tr]
    : Object.values(scripts)
  const returnIndexes = tx.outputs.flatMap((out, index) => returns.some((script) => equalBytes(script, out.scriptPubKey)) ? [index] : [])
  if (returnIndexes.length > 1) fail("transaction must not have more than one same-key/account return OUTPUT")
  const inputAmount = BigInt(context.prevout.amountSats)
  const feeSats = inputAmount - tx.outputs.reduce((sum, out) => sum + out.amountSats, 0n)
  const vsize = bitcoinEcdsaVsizeRange(context.addressType, tx.raw.length)
  const highFeeWarning = feePolicy(feeSats, inputAmount, vsize.min)
  const returnedSats = returnIndexes.length ? tx.outputs[returnIndexes[0]].amountSats : 0n
  return {
    context, transaction: tx, digest, publicKey,
    facts: {
      network: context.network, addressType: context.addressType,
      spendingAddress: outputAddress(context.network, selectedScript),
      inputTxid: bytesToHex(tx.prevoutHashLe.slice().reverse()), inputVout: tx.prevoutIndex,
      inputAmountSats: inputAmount, prevoutScriptPubKey: context.prevout.scriptPubKey,
      scriptCode: bytesToHex(scripts.p2pkh), serializedScriptCode: `19${bytesToHex(scripts.p2pkh)}`,
      outputs: tx.outputs.map((out, index) => ({ index, address: outputAddress(context.network, out.scriptPubKey), kind: out.kind, amountSats: out.amountSats, scriptPubKey: bytesToHex(out.scriptPubKey), returned: returnIndexes.includes(index) })),
      feeSats, vsize, rate: bitcoinFeeRateInterval(feeSats, vsize.min, vsize.max), highFeeWarning,
      returnedSats, netLeavingSats: inputAmount - returnedSats,
      sequence: tx.sequence, signalsRbf: tx.sequence === 0xfffffffd, locktime: tx.locktime,
      unsignedTransaction: context.unsignedTransaction, unsignedTemplateHash: transactionId(tx.raw),
      ...(funding ? { parent: { transaction: context.kind === "bitcoin-p2pkh-v1" ? context.prevout.parentTransaction : "", txid: funding.txid, byteLength: funding.raw.length } } : {}),
    },
  }
}
export type BitcoinEcdsaReviewFacts = ReturnType<typeof verifyBitcoinEcdsaContext>["facts"]

export function verifyBitcoinDerSignature(signature: unknown, digest: string, publicKey: string): Uint8Array {
  const hex = bitcoinHex(signature, 71, "DER signature")
  if (hex.length < 16) fail("DER signature must be 8..71 bytes")
  bitcoinHex(digest, 32, "digest", 32)
  const point = publicPoint(publicKey)
  const bytes = hexToBytes(hex)
  try {
    const sig = secp256k1.Signature.fromBytes(bytes, "der")
    if (sig.r <= 0n || sig.s <= 0n || sig.hasHighS() || !equalBytes(sig.toBytes("der"), bytes)
      || !secp256k1.verify(bytes, hexToBytes(digest), point, { prehash: false, lowS: true, format: "der" })) fail("invalid strict low-S DER signature for selected point/digest")
  } catch { fail("invalid strict low-S DER signature for selected point/digest") }
  return bytes
}

/** Local public-result closure after ONE signature. Never signs, consumes, or publishes a result. */
export function closeBitcoinEcdsaSignature(value: unknown, digest: string, publicKey: string, signature: unknown, keys?: BitcoinReturnKeys) {
  const verified = verifyBitcoinEcdsaContext(value, digest, publicKey, keys)
  const der = verifyBitcoinDerSignature(signature, verified.digest, publicKey)
  const tx = verified.transaction
  const key = publicPoint(publicKey)
  const derWithSighash = concat(der, new Uint8Array([1]))
  let signed: Uint8Array
  let weight: number
  if (verified.context.addressType === "p2pkh") {
    const scriptSig = concat(new Uint8Array([derWithSighash.length]), derWithSighash, new Uint8Array([33]), key)
    signed = concat(tx.raw.subarray(0, 41), new Uint8Array([scriptSig.length]), scriptSig, tx.raw.subarray(42))
    weight = 4 * signed.length
    if (signed.length !== tx.raw.length + der.length + 36) fail("Legacy signed size closure failed")
  } else {
    const witness = concat(new Uint8Array([2, derWithSighash.length]), derWithSighash, new Uint8Array([33]), key)
    signed = concat(tx.raw.subarray(0, 4), new Uint8Array([0, 1]), tx.raw.subarray(4, tx.raw.length - 4), witness, tx.raw.subarray(tx.raw.length - 4))
    weight = 3 * tx.raw.length + signed.length
    if (weight !== 4 * tx.raw.length + der.length + 39) fail("Native signed weight closure failed")
  }
  const vsize = Math.ceil(weight / 4)
  if (vsize < verified.facts.vsize.min || vsize > verified.facts.vsize.max) fail("signed vsize is outside its conservative range")
  const highFeeWarning = feePolicy(verified.facts.feeSats, verified.facts.inputAmountSats, vsize)
  return {
    signature: bytesToHex(der), signedTransaction: bytesToHex(signed), weight, vsize,
    txid: transactionId(verified.context.addressType === "p2wpkh" ? tx.raw : signed), wtxid: transactionId(signed),
    feeSats: verified.facts.feeSats, rate: bitcoinFeeRateInterval(verified.facts.feeSats, vsize, vsize),
    highFeeWarning: highFeeWarning || verified.facts.highFeeWarning,
  }
}
