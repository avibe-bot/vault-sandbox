// Hermetic sign-route fixtures, reusing the public transaction/HD corpus.
// Never fund these records. No browser, external signing service or secret store.
import { bytesToHex } from "@noble/curves/utils.js"
import hdVectors from "./fixtures/protected-hd-codec-vectors.json"
import { concat, parseTransaction, u32Bytes, u64Bytes } from "./bitcoin"
import { bitcoinEcdsaSighash, bitcoinKeyScripts, type BitcoinEcdsaType } from "./bitcoinEcdsa"
import { legacyContext, nativeContext } from "./bitcoinEcdsaTestVectors"
import { hdEnvelopeFingerprint } from "./protectedHd"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { BUILD } from "./rpc"
import { signFixture } from "./signTestFixtures"
import type { SignRequest } from "./signRequest"

export async function bitcoinEcdsaSignFixture(type: BitcoinEcdsaType, account?: number) {
  const f = await signFixture("ecdsa-secp256k1-der")
  const request: SignRequest = f.request
  const hd = account === undefined ? undefined : await sealHdWalletLocally({
    name: request.material.name, words: hdVectors.cases[0].words, passphrase: hdVectors.cases[0].passphrase,
    vmk: f.vmk, wrapMeta: f.wrapMeta, assertCurrent() {},
  })
  if (hd) request.material.envelope = hd.envelope
  const row = hd?.accounts[account!]
  const publicKey = row ? (type === "p2pkh" ? row.bitcoin_p2pkh : row.bitcoin_p2wpkh) : f.publicKey
  const signingContext = type === "p2pkh" ? legacyContext(publicKey) : nativeContext()
  const scripts = bitcoinKeyScripts(publicKey)
  signingContext.prevout.scriptPubKey = bytesToHex(scripts[type])
  const tx = parseTransaction(signingContext.unsignedTransaction)
  // Keep the corpus's unrelated Taproot recipient; make output0 an actual
  // same-key/account return rather than trusting the corpus's selected point.
  signingContext.unsignedTransaction = bytesToHex(concat(
    tx.raw.subarray(0, 46), new Uint8Array([2]),
    u64Bytes(tx.outputs[0].amountSats), new Uint8Array([scripts[type].length]), scripts[type],
    u64Bytes(tx.outputs[1].amountSats), new Uint8Array([tx.outputs[1].scriptPubKey.length]), tx.outputs[1].scriptPubKey,
    u32Bytes(0),
  ))
  signingContext.digest = bitcoinEcdsaSighash(parseTransaction(signingContext.unsignedTransaction), type, BigInt(signingContext.prevout.amountSats), scripts.p2pkh)
  request.signingContext = signingContext
  request.context.release = {
    name: request.material.name, scheme: request.scheme, digest: signingContext.digest, publicKey,
    signingContext: structuredClone(signingContext),
    signingKey: { secret_id: "public-saved-id", public_key: publicKey, envelope_sha256: hdEnvelopeFingerprint(request.material.envelope) },
    sandboxCohort: { buildHash: BUILD.buildHash, manifestHash: "sha256-" + "A".repeat(43) + "=" },
    ...(account === undefined ? {} : { derivation: { chain: "bitcoin", account, address_type: type } }),
  }
  f.resign()
  return { ...f, request, publicKey, accounts: hd?.accounts, signingContext }
}
