// Test support only: public never-fund vectors and independently hashed synthetic Legacy funding.
import { createHash } from "node:crypto"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import oracle from "./fixtures/bitcoin-ecdsa-transactions.json"
import { concat, parseTransaction, u32Bytes, u64Bytes } from "./bitcoin"
import { bitcoinEcdsaSighash, bitcoinKeyScripts, type BitcoinLegacyContext, type BitcoinNativeContext } from "./bitcoinEcdsa"

export const vectors = oracle.synthetic_public_corpus_vectors
export const legacyVector = vectors.find((v) => v.address_type === "p2pkh")!
export const nativeVector = vectors.find((v) => v.address_type === "p2wpkh")!
const h256 = (bytes: Uint8Array): Buffer => createHash("sha256").update(bytes).digest()
export const h256d = (bytes: Uint8Array): Buffer => h256(h256(bytes))
export const compact = (n: number): Uint8Array => n < 253 ? new Uint8Array([n]) : n <= 65535 ? new Uint8Array([253, n & 255, n >>> 8]) : concat(new Uint8Array([254]), u32Bytes(n))

export function funding(outputs: Array<{ amount: bigint; script: Uint8Array }>, inputScript = new Uint8Array([0x00, 0xff])): string {
  return bytesToHex(concat(
    u32Bytes(0xffffffff), new Uint8Array([1]), new Uint8Array(32), u32Bytes(0xffffffff), compact(inputScript.length), inputScript, u32Bytes(0),
    compact(outputs.length), ...outputs.map((o) => concat(u64Bytes(o.amount), compact(o.script.length), o.script)), u32Bytes(0xffffffff),
  ))
}
export function legacyContext(publicKey = legacyVector.public_key, amount = 150_000n): BitcoinLegacyContext {
  const script = bitcoinKeyScripts(publicKey).p2pkh
  const parentTransaction = funding([{ amount, script }, { amount: 0n, script: new Uint8Array([0x6a]) }])
  const parentHash = h256d(hexToBytes(parentTransaction))
  const spend = Buffer.from(legacyVector.unsigned_transaction, "hex")
  parentHash.copy(spend, 5)
  spend.writeUInt32LE(0, 37)
  // Independent node:crypto hash over the literal Legacy ALL serialization.
  const preimage = Buffer.concat([spend.subarray(0, 41), Buffer.from([25]), Buffer.from(script), spend.subarray(42), Buffer.from("01000000", "hex")])
  const digest = h256d(preimage).toString("hex")
  return {
    kind: "bitcoin-p2pkh-v1", addressType: "p2pkh", network: "bitcoin", unsignedTransaction: spend.toString("hex"),
    prevout: { parentTransaction, txid: Buffer.from(parentHash).reverse().toString("hex"), vout: 0, amountSats: Number(amount), scriptPubKey: bytesToHex(script) },
    sighashType: 1, digestAlgorithm: "bitcoin-legacy-sighash-all", digest,
  }
}
export function nativeContext(v = nativeVector): BitcoinNativeContext {
  return {
    kind: "bitcoin-p2wpkh-v1", addressType: "p2wpkh", network: "bitcoin", unsignedTransaction: v.unsigned_transaction,
    prevout: { amountSats: v.prevout_amount_satoshis, scriptPubKey: v.prevout_script_pubkey },
    sighashType: 1, digestAlgorithm: "bitcoin-bip143-sighash-all", digest: v.digest,
  }
}
export function rehashNative(context: BitcoinNativeContext, publicKey = nativeVector.public_key): void {
  context.digest = bitcoinEcdsaSighash(parseTransaction(context.unsignedTransaction), "p2wpkh", BigInt(context.prevout.amountSats), bitcoinKeyScripts(publicKey).p2pkh)
}
