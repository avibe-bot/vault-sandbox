import { afterEach, describe, expect, it } from "vitest"
import policyFixture from "./fixtures/vault-protected-bitcoin-policy.json"
import { setLocale } from "./i18n"
import coreFixture from "./fixtures/vault-protected-bitcoin-core.json"
import codecFixture from "./fixtures/vault-protected-bitcoin-codec.json"
import { verifyBitcoinSigningContext } from "./bitcoin"
import {
  SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH,
  signDigest,
} from "./vaultCrypto"

type CoreFixture = {
  keys: Array<{ id: string; internal_pubkey_compressed_hex: string; public_secret_scalar_hex: string }>
  cases: Array<{ id: string; signing_key_id: string; unsigned_tx_hex: string; funding: { spent_output_value_sats: number; spent_output_script_hex: string }; expected: { taproot_digest_hex: string; txid: string } }>
}

type CodecFixture = {
  cases: Array<{
    id: string
    publicKey: string
    context: Record<string, unknown>
    expected: { txid: string; outputs: Array<{ address: string }>; feeSats: number; vsize: number; netLeavingKeySats: number; signalsRbf: boolean }
  }>
}

afterEach(() => { setLocale("en") })

describe("protected Bitcoin Taproot codec", () => {
  it.each(policyFixture.invalid)("rejects $id for the specified reason", (vector) => {
    const context = vector.context as Record<string, unknown>
    expect(() => verifyBitcoinSigningContext(context, context.digest as string ?? "00".repeat(32), policyFixture.publicKey)).toThrow(new RegExp(vector.error))
  })
  it.each(policyFixture.valid)("derives the Core policy boundary $id", (vector) => {
    const verified = verifyBitcoinSigningContext(vector.context, vector.context.digest, policyFixture.publicKey)
    expect(verified.display).toContain(vector.expected.signalsRbf ? "This transaction signals RBF." : "This transaction does not signal RBF.")
    expect(verified.display.includes("Warning: this fee")).toBe(vector.expected.highFee)
    expect(verified.display).toContain(`Fee: ${vector.expected.feeSats} sats`)
    expect(verified.display).toContain(vector.expected.txid)
  })
  it.each(codecFixture.sameKeyPolicyRefusals)("refuses the same-key unsupported address $id", (vector) => {
    expect(() => verifyBitcoinSigningContext(vector.context, vector.context.digest, vector.publicKey)).toThrow(/same-key/)
  })
  it("renders exact amounts, full addresses and the network warning in Chinese", () => {
    setLocale("zh")
    const vector = codecFixture.cases[0]
    const verified = verifyBitcoinSigningContext(vector.context, vector.context.digest, vector.publicKey)
    expect(verified.display).toContain("不是链上证明")
    expect(verified.display).toContain("60000 sats（0.00060000 BTC）")
    expect(verified.display).toContain("239778 sats（0.00239778 BTC）")
    expect(verified.display).toContain("同一密钥找零")
    for (const output of vector.expected.outputs) expect(verified.display).toContain(output.address)
  })
  it("matches all public Core BIP341 digest and txid vectors", () => {
    const fixture = coreFixture as CoreFixture
    const keys = new Map(fixture.keys.map((key) => [key.id, key]))
    for (const vector of fixture.cases) {
      const key = keys.get(vector.signing_key_id)
      expect(key, vector.id).toBeDefined()
      const context = {
        kind: "bitcoin-taproot-keypath-v1",
        network: "signet",
        unsignedTransaction: vector.unsigned_tx_hex,
        prevout: {
          amountSats: vector.funding.spent_output_value_sats,
          scriptPubKey: vector.funding.spent_output_script_hex,
        },
        digestAlgorithm: "bip341-sighash-default-keypath",
        digest: vector.expected.taproot_digest_hex,
      }
      const verified = verifyBitcoinSigningContext(context, vector.expected.taproot_digest_hex, key!.internal_pubkey_compressed_hex)
      expect(verified.digest, vector.id).toBe(vector.expected.taproot_digest_hex)
      expect(verified.transaction.raw.length, vector.id).toBe(vector.unsigned_tx_hex.length / 2)
    }
  })

  it("matches Core's BIP340 signatures after BIP86 key normalization and tweak", () => {
    const fixture = coreFixture as CoreFixture & { signing_parameters: { bip340_aux_rand_hex: string }; keys: Array<{ public_secret_scalar_hex: string; id: string; internal_pubkey_compressed_hex: string }> }
    const keys = new Map(fixture.keys.map((key) => [key.id, key]))
    for (const vector of fixture.cases) {
      const key = keys.get(vector.signing_key_id)!
      const signature = signDigest(
        key.public_secret_scalar_hex,
        vector.expected.taproot_digest_hex,
        SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH,
        { schnorrAuxRand: fixture.signing_parameters.bip340_aux_rand_hex },
      )
      expect(signature.signature, vector.id).toBe((vector.expected as typeof vector.expected & { bip340_signature_hex: string }).bip340_signature_hex)
    }
  })
  it("renders the independent public address and policy vectors in every supported network", () => {
    const fixture = codecFixture as CodecFixture
    for (const vector of fixture.cases) {
      const verified = verifyBitcoinSigningContext(vector.context, vector.context.digest as string, vector.publicKey)
      expect(verified.display, vector.id).toContain(`Unsigned transaction ID: ${vector.expected.txid}`)
      expect(verified.display, vector.id).toContain(`Fee: ${vector.expected.feeSats} sats`)
      expect(verified.display, vector.id).toContain(`Signed vsize: ${vector.expected.vsize} vB`)
      expect(verified.display, vector.id).toContain(`Net value leaving this key: ${vector.expected.netLeavingKeySats} sats`)
      expect(verified.display, vector.id).toContain(vector.expected.signalsRbf ? "This transaction signals RBF." : "This transaction does not signal RBF.")
      for (const output of vector.expected.outputs) expect(verified.display, vector.id).toContain(output.address)
    }
  })
})
