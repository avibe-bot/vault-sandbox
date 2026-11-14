import { describe, expect, it } from "vitest"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import oracle from "./fixtures/bitcoin-ecdsa-transactions.json"
import { MONEY_RANGE_SATS, concat, parseTransaction, u32Bytes, u64Bytes } from "./bitcoin"
import {
  bitcoinEcdsaSighash, bitcoinEcdsaVsizeRange, bitcoinFeeRateInterval, bitcoinKeyScripts,
  closeBitcoinEcdsaSignature, parseBitcoinEcdsaContext, parseBitcoinFundingTransaction,
  verifyBitcoinDerSignature, verifyBitcoinEcdsaContext,
} from "./bitcoinEcdsa"
import { compact, funding, h256d, legacyContext, legacyVector, nativeContext, nativeVector, rehashNative, vectors } from "./bitcoinEcdsaTestVectors"

describe("Bitcoin ECDSA independent public oracles", () => {
  it.each(vectors)("reproduces $address_type #$account ALL digest and strict DER without seed material", (v) => {
    const tx = parseTransaction(v.unsigned_transaction)
    expect(bitcoinEcdsaSighash(tx, v.address_type as "p2pkh" | "p2wpkh", BigInt(v.prevout_amount_satoshis), hexToBytes(v.script_code))).toBe(v.digest)
    expect(bytesToHex(verifyBitcoinDerSignature(v.der, v.digest, v.public_key))).toBe(v.der)
  })
  it("binds every output amount and their order in both ALL digests", () => {
    for (const c of [legacyContext(), nativeContext()]) {
      const key = c.kind === "bitcoin-p2pkh-v1" ? legacyVector.public_key : nativeVector.public_key
      const tx = parseTransaction(c.unsignedTransaction)
      const scriptCode = bitcoinKeyScripts(key).p2pkh
      const serialize = (outputs: typeof tx.outputs) => bytesToHex(concat(
        tx.raw.subarray(0, 46), new Uint8Array([outputs.length]),
        ...outputs.map((out) => concat(u64Bytes(out.amountSats), new Uint8Array([out.scriptPubKey.length]), out.scriptPubKey)),
        u32Bytes(0),
      ))
      // Start from a valid full context; changing either output is not a fee or
      // script-shape failure and must invalidate the unchanged ALL digest.
      expect(() => verifyBitcoinEcdsaContext(c, c.digest, key)).not.toThrow()
      for (let i = 0; i < tx.outputs.length; i++) {
        const outputs = tx.outputs.map((out, index) => ({ ...out, amountSats: out.amountSats + (index === i ? 1n : 0n) }))
        const changed = { ...c, unsignedTransaction: serialize(outputs) }
        expect(bitcoinEcdsaSighash(parseTransaction(changed.unsignedTransaction), c.addressType, BigInt(c.prevout.amountSats), scriptCode)).not.toBe(c.digest)
        expect(() => verifyBitcoinEcdsaContext(changed, c.digest, key)).toThrow(/digest/)
      }
      const reordered = { ...c, unsignedTransaction: serialize([...tx.outputs].reverse()) }
      expect(() => verifyBitcoinEcdsaContext(reordered, c.digest, key)).toThrow(/digest/)
    }
  })
  it("preserves the published BIP143 preimage/digest and signature anchor without broadening spend grammar", () => {
    const official = oracle.official_bip143
    expect(h256d(hexToBytes(official.published_preimage)).toString("hex")).toBe(official.published_digest)
    expect(() => verifyBitcoinDerSignature(official.published_der_with_sighash_byte.slice(0, -2), official.published_digest, official.public_key)).not.toThrow()
    expect(() => parseTransaction(official.unsigned_transaction)).toThrow()
  })
  it.each(vectors.filter((v) => v.address_type === "p2wpkh"))("closes exact independent Native #$account signed bytes/txid/wtxid", (v) => {
    const context = nativeContext(v)
    const verified = verifyBitcoinEcdsaContext(context, v.digest, v.public_key)
    expect(verified.facts.serializedScriptCode).toBe(`19${v.script_code}`)
    const result = closeBitcoinEcdsaSignature(context, v.digest, v.public_key, v.der)
    expect(result.signedTransaction).toBe(v.signed_transaction)
    expect(result.txid).toBe(v.txid)
    expect(result.wtxid).toBe(v.wtxid)
    expect(result.weight).toBe(4 * (v.unsigned_transaction.length / 2) + v.der.length / 2 + 39)
  })
})

describe("bounded Legacy funding proof, separate opaque grammar", () => {
  it("binds full parent hash/endian/outpoint/value/script and accepts opaque nonselected zero/OP_RETURN", () => {
    const c = legacyContext()
    const verified = verifyBitcoinEcdsaContext(c, c.digest, legacyVector.public_key)
    expect(verified.facts.parent?.txid).toBe(c.prevout.txid)
    expect(verified.facts.feeSats).toBe(1000n)
    expect(verified.facts.returnedSats).toBe(90_000n)
    expect(verified.facts.netLeavingSats).toBe(60_000n)
  })
  it("rejects the SAME-digest Legacy amount lie instead of understating a valid-spend fee", () => {
    const c = legacyContext(legacyVector.public_key, 1_000_000n)
    const unchanged = c.digest
    c.prevout.amountSats = 150_000
    expect(bitcoinEcdsaSighash(parseTransaction(c.unsignedTransaction), "p2pkh", 150_000n, hexToBytes(c.prevout.scriptPubKey))).toBe(unchanged)
    expect(() => verifyBitcoinEcdsaContext(c, unchanged, legacyVector.public_key)).toThrow(/parent amount\/script/)
  })
  it.each(["txid", "txid-byte-order", "vout", "amount", "script", "trailing", "witness", "wrong-outpoint", "outpoint-byte-order"])("refuses parent %s mismatch", (mutation) => {
    const c = legacyContext()
    if (mutation === "txid") c.prevout.txid = "00".repeat(32)
    if (mutation === "txid-byte-order") c.prevout.txid = bytesToHex(hexToBytes(c.prevout.txid).reverse())
    if (mutation === "vout") c.prevout.vout = 1
    if (mutation === "amount") c.prevout.amountSats--
    if (mutation === "script") c.prevout.scriptPubKey = "76a914" + "00".repeat(20) + "88ac"
    if (mutation === "trailing") c.prevout.parentTransaction += "00"
    if (mutation === "witness") c.prevout.parentTransaction = c.prevout.parentTransaction.slice(0, 8) + "0001" + c.prevout.parentTransaction.slice(8)
    if (mutation === "wrong-outpoint") c.unsignedTransaction = c.unsignedTransaction.slice(0, 10) + "11".repeat(32) + c.unsignedTransaction.slice(74)
    if (mutation === "outpoint-byte-order") c.unsignedTransaction = c.unsignedTransaction.slice(0, 10) + c.prevout.txid + c.unsignedTransaction.slice(74)
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, legacyVector.public_key)).toThrow()
  })
  it("accepts empty/nonstandard nonselected scripts and 10000-byte opaque scripts, rejects 10001", () => {
    const allowed = funding([{ amount: 0n, script: new Uint8Array() }, { amount: 1n, script: new Uint8Array(10_000) }], new Uint8Array(10_000))
    expect(parseBitcoinFundingTransaction(allowed).outputs).toHaveLength(2)
    expect(() => parseBitcoinFundingTransaction(funding([{ amount: 1n, script: new Uint8Array(10_001) }]))).toThrow(/bound/)
    expect(() => parseBitcoinFundingTransaction(funding([{ amount: 1n, script: new Uint8Array() }], new Uint8Array(10_001)))).toThrow(/bound/)
  })
  it("accepts inclusive 128 outputs and rejects 129 or zero", () => {
    const outputs = Array.from({ length: 128 }, () => ({ amount: 0n, script: new Uint8Array() }))
    expect(parseBitcoinFundingTransaction(funding(outputs)).outputs).toHaveLength(128)
    expect(() => parseBitcoinFundingTransaction(funding([...outputs, outputs[0]]))).toThrow(/bound/)
    expect(() => parseBitcoinFundingTransaction(funding([]))).toThrow(/1\.\.128/)
  })
  it.each(["fd0100", "fe01000000", "ff0100000000000000", "ff0000000000002000"])("rejects nonminimal/unsafe input count %s before allocation", (count) => {
    const raw = funding([{ amount: 0n, script: new Uint8Array() }])
    expect(() => parseBitcoinFundingTransaction(raw.slice(0, 8) + count + raw.slice(10))).toThrow(/CompactSize|bound/)
  })
  it("accepts the exact 1048576-byte legal parent and rejects cap+1 before decoding", () => {
    const outputs = Array.from({ length: 104 }, () => ({ amount: 1n, script: new Uint8Array(10_000) }))
    outputs.push({ amount: 1n, script: new Uint8Array(7370) })
    const raw = funding(outputs, new Uint8Array())
    expect(raw.length / 2).toBe(1_048_576)
    expect(parseBitcoinFundingTransaction(raw).outputs).toHaveLength(105)
    expect(() => parseBitcoinFundingTransaction(raw + "00")).toThrow(/size/)
  })
  it("accepts 128 opaque null-shaped inputs and rejects 129 or zero", () => {
    const input = concat(new Uint8Array(32), u32Bytes(0xffffffff), new Uint8Array([0]), u32Bytes(0))
    const make = (count: number) => bytesToHex(concat(u32Bytes(0), compact(count), ...Array.from({ length: count }, () => input), new Uint8Array([1]), u64Bytes(0n), new Uint8Array([0]), u32Bytes(0)))
    expect(parseBitcoinFundingTransaction(make(128)).outputs).toHaveLength(1)
    expect(() => parseBitcoinFundingTransaction(make(129))).toThrow(/bound/)
    expect(() => parseBitcoinFundingTransaction(make(0))).toThrow(/1\.\.128/)
  })
  it("rejects individual/aggregate out-of-range money, truncation and malformed hex", () => {
    expect(() => parseBitcoinFundingTransaction(funding([{ amount: MONEY_RANGE_SATS + 1n, script: new Uint8Array() }]))).toThrow(/money/)
    expect(() => parseBitcoinFundingTransaction(funding([{ amount: MONEY_RANGE_SATS, script: new Uint8Array() }, { amount: 1n, script: new Uint8Array() }]))).toThrow(/money/)
    const raw = funding([{ amount: 0n, script: new Uint8Array() }])
    expect(() => parseBitcoinFundingTransaction(raw.slice(0, -2))).toThrow(/truncated/)
    expect(() => parseBitcoinFundingTransaction("00".repeat(1_048_577))).toThrow(/size/)
    expect(() => parseBitcoinFundingTransaction("A0")).toThrow(/lowercase/)
    expect(() => parseBitcoinFundingTransaction("0")).toThrow(/size/)
  })
})

describe("Native amount binding, exact returns and numeric fees", () => {
  it("forbids parent proof/txid/vout fields without treating supplied amount as a funding proof", () => {
    for (const extra of [{ parentTransaction: "00" }, { txid: "00".repeat(32) }, { vout: 0 }]) {
      const c = nativeContext()
      Object.assign(c.prevout, extra)
      expect(() => parseBitcoinEcdsaContext(c, c.digest)).toThrow()
    }
    const c = nativeContext()
    c.prevout.amountSats++
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key)).toThrow(/digest/)
    rehashNative(c)
    expect(() => verifyBitcoinDerSignature(nativeVector.der, c.digest, nativeVector.public_key)).toThrow(/DER/)
  })
  it.each(["kind", "addressType", "digestAlgorithm", "sighashType", "scheme-like-extra"])("refuses exact context pairing mutation %s", (key) => {
    const c = nativeContext() as unknown as Record<string, unknown>
    c[key] = key === "sighashType" ? 2 : "unsupported"
    expect(() => parseBitcoinEcdsaContext(c, nativeVector.digest)).toThrow()
  })
  it("refuses a different point, compressed parity substitution and two return OUTPUTS", () => {
    const c = nativeContext()
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, legacyVector.public_key)).toThrow(/selected key/)
    const otherParity = (nativeVector.public_key.startsWith("02") ? "03" : "02") + nativeVector.public_key.slice(2)
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, otherParity)).toThrow(/selected key/)
    const tx = parseTransaction(c.unsignedTransaction)
    const same = bitcoinKeyScripts(nativeVector.public_key).p2wpkh
    c.unsignedTransaction = bytesToHex(concat(tx.raw.subarray(0, 46), new Uint8Array([2]), ...[90_000n, 59_000n].map((n) => concat(u64Bytes(n), new Uint8Array([same.length]), same)), u32Bytes(0)))
    rehashNative(c)
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key)).toThrow(/return OUTPUT/)
  })
  it.each(["p2pkh", "p2wpkh", "p2tr"] as const)("classifies ONE cross-format %s same-key return and no arbitrary script", (type) => {
    const c = nativeContext()
    const tx = parseTransaction(c.unsignedTransaction)
    const self = bitcoinKeyScripts(nativeVector.public_key)[type]
    const external = bitcoinKeyScripts(legacyVector.public_key).p2wpkh
    const outputs = [concat(u64Bytes(90_000n), new Uint8Array([self.length]), self), concat(u64Bytes(59_000n), new Uint8Array([external.length]), external)]
    c.unsignedTransaction = bytesToHex(concat(tx.raw.subarray(0, 46), new Uint8Array([2]), ...outputs, u32Bytes(0)))
    rehashNative(c)
    const v = verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key)
    expect(v.facts.outputs.map((out) => out.returned)).toEqual([true, false])
    expect(v.facts.returnedSats).toBe(90_000n)
    expect(v.facts.netLeavingSats).toBe(60_000n)
    c.unsignedTransaction = bytesToHex(concat(tx.raw.subarray(0, 46), new Uint8Array([1]), outputs[1], u32Bytes(0)))
    rehashNative(c)
    const none = verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key)
    expect(none.facts.returnedSats).toBe(0n)
    expect(none.facts.netLeavingSats).toBe(150_000n)
  })
  it("uses exact conservative vsize limits and fixed outward-rounded hundredths", () => {
    expect(bitcoinEcdsaVsizeRange("p2pkh", 137)).toEqual({ min: 181, max: 244 })
    expect(bitcoinEcdsaVsizeRange("p2wpkh", 137)).toEqual({ min: 149, max: 165 })
    expect(bitcoinFeeRateInterval(1000n, 149, 165)).toEqual({ lo100: 606n, hi100: 672n, lower: "6.06", upper: "6.72" })
    const c = nativeContext()
    const min = bitcoinEcdsaVsizeRange("p2wpkh", c.unsignedTransaction.length / 2).min
    c.prevout.amountSats = 149000 + 10000 * min
    rehashNative(c)
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key)).not.toThrow()
    c.prevout.amountSats++
    rehashNative(c)
    expect(() => verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key)).toThrow(/10,000/)
  })
  it("keeps warning equality strict at 100 sat/vB and 2 percent", () => {
    const c = nativeContext()
    const tx = parseTransaction(c.unsignedTransaction)
    const script = bitcoinKeyScripts(nativeVector.public_key).p2wpkh
    const spend = (amount: bigint) => bytesToHex(concat(tx.raw.subarray(0, 46), new Uint8Array([1]), u64Bytes(amount), new Uint8Array([script.length]), script, u32Bytes(0)))
    c.unsignedTransaction = spend(100_000_000n)
    const min = bitcoinEcdsaVsizeRange("p2wpkh", c.unsignedTransaction.length / 2).min
    c.prevout.amountSats = 100_000_000 + 100 * min
    rehashNative(c)
    expect(verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key).facts.highFeeWarning).toBe(false)
    c.prevout.amountSats++; rehashNative(c)
    expect(verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key).facts.highFeeWarning).toBe(true)
    c.unsignedTransaction = spend(49_000n); c.prevout.amountSats = 50_000; rehashNative(c)
    expect(verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key).facts.highFeeWarning).toBe(false)
    c.unsignedTransaction = spend(48_999n); rehashNative(c)
    expect(verifyBitcoinEcdsaContext(c, c.digest, nativeVector.public_key).facts.highFeeWarning).toBe(true)
  })
})

describe("strict DER and one-sign local closure", () => {
  it.each(["zero-r", "zero-s", "negative-r", "negative-s", "order-r", "order-s", "redundant-r", "redundant-s", "empty-r", "empty-s", "wrong-sequence", "wrong-integer", "long-length", "short-length", "over-71-bytes"])("rejects strict DER %s", (mutation) => {
    const original = hexToBytes(nativeVector.der)
    let r = original.slice(4, 4 + original[3])
    let s = original.slice(6 + original[3])
    const order = concat(new Uint8Array([0]), hexToBytes(secp256k1.Point.Fn.ORDER.toString(16)))
    if (mutation === "zero-r") r = new Uint8Array([0])
    if (mutation === "zero-s") s = new Uint8Array([0])
    if (mutation === "negative-r") r = new Uint8Array([0x80])
    if (mutation === "negative-s") s = new Uint8Array([0x80])
    if (mutation === "order-r") { r = order; s = new Uint8Array([1]) }
    if (mutation === "order-s") { r = new Uint8Array([1]); s = order }
    if (mutation === "redundant-r") r = concat(new Uint8Array([0]), r)
    if (mutation === "redundant-s") s = concat(new Uint8Array([0]), s)
    if (mutation === "empty-r") r = new Uint8Array()
    if (mutation === "empty-s") s = new Uint8Array()
    const body = concat(new Uint8Array([2, r.length]), r, new Uint8Array([2, s.length]), s)
    let der = concat(new Uint8Array([0x30, body.length]), body)
    if (mutation === "wrong-sequence") der[0] = 0x31
    if (mutation === "wrong-integer") der[2] = 3
    if (mutation === "long-length") der[1]++
    if (mutation === "short-length") der[1]--
    if (mutation === "over-71-bytes") der = concat(original, new Uint8Array(72 - original.length))
    expect(() => verifyBitcoinDerSignature(bytesToHex(der), nativeVector.digest, nativeVector.public_key)).toThrow()
  })
  it.each(["sighash-byte", "trailing", "high-S", "wrong-digest", "wrong-point", "nonminimal"])("rejects %s without a public result", (mutation) => {
    let signature = nativeVector.der
    let digest = nativeVector.digest
    let point = nativeVector.public_key
    if (mutation === "sighash-byte" || mutation === "trailing") signature += "01"
    if (mutation === "wrong-digest") digest = "00".repeat(32)
    if (mutation === "wrong-point") point = legacyVector.public_key
    if (mutation === "high-S") {
      const s = secp256k1.Signature.fromHex(signature, "der")
      signature = new secp256k1.Signature(s.r, secp256k1.Point.Fn.ORDER - s.s).toHex("der")
    }
    if (mutation === "nonminimal") signature = "300702020001020101"
    expect(() => verifyBitcoinDerSignature(signature, digest, point)).toThrow()
  })
  it("closes a synthetic Legacy request under one fresh hermetic key; no seed/words or external custody", () => {
    const secret = secp256k1.utils.randomSecretKey()
    try {
      const publicKey = bytesToHex(secp256k1.getPublicKey(secret, true))
      const c = legacyContext(publicKey)
      const signature = bytesToHex(secp256k1.sign(hexToBytes(c.digest), secret, { prehash: false, lowS: true, format: "der" }))
      const result = closeBitcoinEcdsaSignature(c, c.digest, publicKey, signature)
      expect(result.vsize).toBe(c.unsignedTransaction.length / 2 + signature.length / 2 + 36)
      expect(result.weight).toBe(result.vsize * 4)
      expect(result.txid).toBe(h256d(hexToBytes(result.signedTransaction)).reverse().toString("hex"))
      expect(result.txid).not.toBe(h256d(hexToBytes(c.unsignedTransaction)).reverse().toString("hex"))
      expect(result.wtxid).toBe(result.txid)
      expect(() => closeBitcoinEcdsaSignature(c, c.digest, publicKey, signature + "01")).toThrow()
    } finally { secret.fill(0) }
  })
})
