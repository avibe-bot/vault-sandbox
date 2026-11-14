// PUBLIC design-frame inputs for Legacy (P2PKH) and Native SegWit (P2WPKH) reviews.
// Native is the committed public never-fund transaction vector unchanged. Legacy
// reuses that vector's public spend shape against a synthetic funding transaction
// built here; the real verifier recomputes every hash, so a wrong value cannot
// render. No seed, private key, signer or custody. Not the acceptance corpus.
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import oracle from "../src/fixtures/bitcoin-ecdsa-transactions.json"
import { concat, u32Bytes, u64Bytes } from "../src/bitcoin"
import { bitcoinKeyScripts, type BitcoinLegacyContext, type BitcoinNativeContext } from "../src/bitcoinEcdsa"

const vectors = oracle.synthetic_public_corpus_vectors
export const legacyVector = vectors.find((v) => v.address_type === "p2pkh")!
export const nativeVector = vectors.find((v) => v.address_type === "p2wpkh")!
const sha256d = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes))

export function nativeDesignContext(): BitcoinNativeContext {
  return {
    kind: "bitcoin-p2wpkh-v1", addressType: "p2wpkh", network: "bitcoin", unsignedTransaction: nativeVector.unsigned_transaction,
    prevout: { amountSats: nativeVector.prevout_amount_satoshis, scriptPubKey: nativeVector.prevout_script_pubkey },
    sighashType: 1, digestAlgorithm: "bitcoin-bip143-sighash-all", digest: nativeVector.digest,
  }
}

export function legacyDesignContext(): BitcoinLegacyContext {
  const script = bitcoinKeyScripts(legacyVector.public_key).p2pkh
  // One label-derived prior outpoint, the selected 150000-sat output, and an OP_RETURN.
  const priorOutpoint = sha256(new TextEncoder().encode("design frame legacy funding input"))
  const parent = concat(
    u32Bytes(2), new Uint8Array([1]), priorOutpoint, u32Bytes(0), new Uint8Array([0]), u32Bytes(0xffffffff),
    new Uint8Array([2]), u64Bytes(150_000n), new Uint8Array([script.length]), script,
    u64Bytes(0n), new Uint8Array([1, 0x6a]), u32Bytes(0),
  )
  const parentHash = sha256d(parent)
  const spend = hexToBytes(legacyVector.unsigned_transaction)
  spend.set(parentHash, 5)
  spend.set(u32Bytes(0), 37)
  const preimage = concat(spend.subarray(0, 41), new Uint8Array([script.length]), script, spend.subarray(42), u32Bytes(1))
  return {
    kind: "bitcoin-p2pkh-v1", addressType: "p2pkh", network: "bitcoin", unsignedTransaction: bytesToHex(spend),
    prevout: {
      parentTransaction: bytesToHex(parent), txid: bytesToHex(parentHash.slice().reverse()), vout: 0,
      amountSats: 150_000, scriptPubKey: bytesToHex(script),
    },
    sighashType: 1, digestAlgorithm: "bitcoin-legacy-sighash-all", digest: bytesToHex(sha256d(preimage)),
  }
}
