// PUBLIC design-frame inputs for protected Legacy (P2PKH) and Native SegWit
// (P2WPKH) signing reviews. Everything is synthetic and never funded: a public
// test scalar, the committed public HD contract vector, label-derived outpoints
// and a synthetic vault key. The frame runs the REAL request preparation and the
// authenticated pre-review key/seed proof on these inputs; it never signs.
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex } from "@noble/curves/utils.js"
import oracle from "../src/fixtures/bitcoin-ecdsa-transactions.json"
import hdVectors from "../src/fixtures/protected-hd-codec-vectors.json"
import { concat, parseTransaction, u32Bytes, u64Bytes } from "../src/bitcoin"
import {
  bitcoinEcdsaSighash, bitcoinKeyScripts, type BitcoinEcdsaContext, type BitcoinEcdsaType,
} from "../src/bitcoinEcdsa"
import { signedOperationContextMessage, type SignedOperationContext } from "../src/operationContext"
import { hdEnvelopeFingerprint } from "../src/protectedHd"
import { sealHdWalletLocally } from "../src/protectedHdCustody"
import { BUILD } from "../src/rpc"
import {
  buildWrapMeta, bytesToBase64, packProtectedRecord, protectRootMetadata, sealProtected, withRootMetadata,
} from "../src/vaultCrypto"

const sha256d = (bytes: Uint8Array): Uint8Array => sha256(sha256(bytes))
const label = (text: string): Uint8Array => sha256(new TextEncoder().encode(`avibe design frame: ${text}`))
// The corpus's unrelated Taproot recipient output, reused as the external payee.
const corpusRecipient = parseTransaction(oracle.synthetic_public_corpus_vectors[0].unsigned_transaction).outputs[1].scriptPubKey

/**
 * One input of 150000 sats, CHANGE FIRST: output 0 returns 90000 to the selected
 * key/account, output 1 sends 59000 out, 1000 fee. The first screen still reads
 * send, return, fee, net (display-order-1); Details keep this transaction order.
 */
export function designContext(type: BitcoinEcdsaType, publicKey: string): BitcoinEcdsaContext {
  const scripts = bitcoinKeyScripts(publicKey)
  const own = scripts[type]
  const outputs = concat(
    u64Bytes(90_000n), new Uint8Array([own.length]), own,
    u64Bytes(59_000n), new Uint8Array([corpusRecipient.length]), corpusRecipient,
  )
  let parent: Uint8Array | undefined
  let outpointHash = label("native spent outpoint")
  if (type === "p2pkh") {
    // One label-derived prior input, the selected 150000-sat output, and an OP_RETURN.
    parent = concat(
      u32Bytes(2), new Uint8Array([1]), label("legacy funding input"), u32Bytes(0), new Uint8Array([0]), u32Bytes(0xffffffff),
      new Uint8Array([2]), u64Bytes(150_000n), new Uint8Array([own.length]), own,
      u64Bytes(0n), new Uint8Array([1, 0x6a]), u32Bytes(0),
    )
    outpointHash = sha256d(parent)
  }
  const unsigned = concat(
    u32Bytes(2), new Uint8Array([1]), outpointHash, u32Bytes(0), new Uint8Array([0]), u32Bytes(0xfffffffd),
    new Uint8Array([2]), outputs, u32Bytes(0),
  )
  const digest = bitcoinEcdsaSighash(parseTransaction(bytesToHex(unsigned)), type, 150_000n, scripts.p2pkh)
  const common = { network: "bitcoin" as const, unsignedTransaction: bytesToHex(unsigned), sighashType: 1 as const, digest }
  return type === "p2pkh"
    ? {
        kind: "bitcoin-p2pkh-v1", addressType: "p2pkh", ...common, digestAlgorithm: "bitcoin-legacy-sighash-all",
        prevout: { parentTransaction: bytesToHex(parent!), txid: bytesToHex(outpointHash.slice().reverse()), vout: 0, amountSats: 150_000, scriptPubKey: bytesToHex(own) },
      }
    : {
        kind: "bitcoin-p2wpkh-v1", addressType: "p2wpkh", ...common, digestAlgorithm: "bitcoin-bip143-sighash-all",
        prevout: { amountSats: 150_000, scriptPubKey: bytesToHex(own) },
      }
}

/**
 * A complete daemon-signed protected sign request for an ordinary key or for HD
 * receiving index #1, with the vault key and root needed to run the authenticated
 * pre-review proof. Returns the vault key so the caller wipes it after use.
 */
export async function designSignRequest(type: BitcoinEcdsaType, hd: boolean) {
  const name = hd ? "COLD_WALLET" : "TREASURY_KEY"
  const vmk = new Uint8Array(32).fill(0x44)
  const daemonKey = new Uint8Array(32).fill(0x11)
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public-test-daemon", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const base = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }])
  const wrapMeta = withRootMetadata(base, await protectRootMetadata(vmk, rootMetadata, base))
  let envelope
  let publicKey: string
  const account = 1
  if (hd) {
    const vector = hdVectors.cases[0]
    const sealed = await sealHdWalletLocally({ name, words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {} })
    envelope = sealed.envelope
    publicKey = type === "p2pkh" ? sealed.accounts[account].bitcoin_p2pkh : sealed.accounts[account].bitcoin_p2wpkh
  } else {
    const scalar = label("public ordinary test scalar")
    try {
      publicKey = bytesToHex(secp256k1.getPublicKey(scalar, true))
      const record = { name, kind: "keypair" as const, publicKey }
      envelope = packProtectedRecord(await sealProtected(scalar, vmk, record), wrapMeta, record)
    } finally { scalar.fill(0) }
  }
  const signingContext = designContext(type, publicKey)
  const command = hd ? `vibe vault sign ${name} --chain bitcoin --account ${account} --address-type ${type}` : `vibe vault sign ${name}`
  const context: SignedOperationContext = {
    v: 2, purpose: "sign", requestId: crypto.randomUUID(),
    display: { secrets: [{ name, kind: "keypair" }], command, egress: "signature", sessionLabel: "Public test session" },
    release: {
      name, scheme: "ecdsa-secp256k1-der", digest: signingContext.digest, publicKey, signingContext: structuredClone(signingContext),
      signingKey: { secret_id: "public-record-id", public_key: publicKey, envelope_sha256: hdEnvelopeFingerprint(envelope) },
      // A syntactically canonical synthetic manifest SRI; parent/daemon own real pin identity.
      sandboxCohort: { buildHash: BUILD.buildHash, manifestHash: `sha256-${bytesToBase64(label("synthetic manifest"))}` },
      ...(hd ? { derivation: { chain: "bitcoin", account, address_type: type } } : {}),
    },
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    signature: { alg: "ed25519", keyId: "public-test-daemon", value: "" },
  }
  context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(context)), daemonKey))
  daemonKey.fill(0)
  return { request: { material: { name, envelope }, scheme: "ecdsa-secp256k1-der" as const, signingContext, context }, vmk, wrapMeta, command, name }
}
