import { describe, expect, it } from "vitest"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import fingerprints from "./fixtures/protected-hd-fingerprint-vectors.json"
import {
  decodeHdPayload, deriveHdAccounts, encodeHdPayload, hdAccount0Addresses, hdEnvelopeFingerprint,
  hdPayloadFromWords, hdPath, hdWords, parseHdDerivation, parseHdRecordMetadata, parseHdWrapJson,
  strictHdBase64, validateHdEnvelopeFields, wipeHdPayload, withHdSigningKey,
} from "./protectedHd"
import { buildWrapMeta, openProtected, protectedRecordAadHex, protectedRecordContextFromMetadata, signProtectedDigest, unpackProtectedRecord } from "./vaultCrypto"
import { hdRootIdentity, parseSealedHdWallet, sealHdWalletLocally, validateHdBaseRoot } from "./protectedHdCustody"
import { isStaticReleaseRecord } from "./approveRelease"

// All words/seeds/VMKs are the committed PUBLIC NEVER-FUND contract corpus.
describe("protected HD frozen codec and full public identity", () => {
  it.each(vectors.cases)("derives all100 precommitted points and five account0 addresses: $id", (c) => {
    const payload = hdPayloadFromWords(c.words, c.passphrase)
    try {
      expect(bytesToHex(payload.entropy)).toBe(c.entropy_hex)
      expect(hdWords(payload.entropy)).toBe(c.words)
      expect(bytesToHex(payload.seed)).toBe(c.seed_hex)
      expect(Number(payload.passphraseRequired)).toBe(c.passphrase_required)
      expect(bytesToHex(encodeHdPayload(payload))).toBe(c.payload_hex)
      const accounts = deriveHdAccounts(payload.seed)
      expect(accounts).toEqual(c.record_meta.accounts)
      expect(hdAccount0Addresses(accounts[0])).toEqual(c.expected_account0)
    } finally { wipeHdPayload(payload) }
    expect(payload.entropy.every((byte) => byte === 0)).toBe(true)
    expect(payload.seed.every((byte) => byte === 0)).toBe(true)
  })
  it.each(vectors.cases)("opens both independent fixture AEADs with exact typed AAD: $id", async (c) => {
    const metadata = parseHdRecordMetadata(c.record_meta)
    const context = protectedRecordContextFromMetadata(c.name, metadata)
    expect(protectedRecordAadHex(context)).toBe(c.aad_hex)
    const wrap = JSON.parse(c.envelope.wrap_meta)
    validateHdEnvelopeFields(c.envelope, wrap)
    const opened = await openProtected({ ...c.envelope, dek_nonce: wrap.dek_nonce, wrapped_dek: wrap.wrapped_dek }, hexToBytes(c.vmk_hex), context)
    let payload: ReturnType<typeof decodeHdPayload> | undefined
    try {
      expect(bytesToHex(opened)).toBe(c.payload_hex)
      payload = decodeHdPayload(opened)
      expect(bytesToHex(payload.entropy)).toBe(c.entropy_hex)
      expect(bytesToHex(payload.seed)).toBe(c.seed_hex)
    } finally { opened.fill(0); wipeHdPayload(payload) }
  })
  it.each(fingerprints.cases)("matches existing Python fingerprint: $id", (c) => {
    expect(hdEnvelopeFingerprint({ ciphertext: c.input[0], nonce: c.input[1], wrap_meta: c.input[2] })).toBe(c.sha256)
  })
  it.each(vectors.legacy_aad)("preserves actual legacy AAD: $id", (c) => {
    const record = c.record
    expect(protectedRecordAadHex({ name: c.name, ...(record ? { kind: record.kind as "static" | "keypair" } : {}),
      ...(record && "public_key" in record ? { publicKey: record.public_key } : {}),
      ...(record && "curve" in record ? { curve: "ed25519" as const } : {}) })).toBe(c.aad_hex)
  })
  it("pins #1 Bitcoin to public address index, not hardened account1", () => {
    expect(hdPath("bitcoin", 1)).toBe("m/86'/0'/0'/0/1")
    expect(hdPath("solana", 2)).toBe("m/44'/501'/2'/0'")
  })
  it("keeps whitespace significant and uses final NFKD passphrase", () => {
    const words = vectors.cases[0].words
    const plain = hdPayloadFromWords(words, "café")
    const normalized = hdPayloadFromWords(words, "cafe\u0301")
    const spaces = hdPayloadFromWords(words, " café ")
    try {
      expect(plain.seed).toEqual(normalized.seed)
      expect(spaces.seed).not.toEqual(plain.seed)
      expect(spaces.passphraseRequired).toBe(true)
    } finally { [plain, normalized, spaces].forEach(wipeHdPayload) }
  })
})

describe("protected HD malformed input and custody refusal", () => {
  it.each(vectors.negative_cases.filter((c) => c.reject_at === "payload-codec"))("refuses exact codec negative: $id", (c) => {
    expect(() => decodeHdPayload(hexToBytes(c.payload_hex!))).toThrow(/invalid/)
  })
  it.each(vectors.negative_cases.filter((c) => c.reject_at === "typed-metadata-before-crypto"))("refuses actual typed metadata negative: $id", (negative) => {
    const n = negative as unknown as Record<string, unknown>
    const record = structuredClone(vectors.cases[0].record_meta)
    if (n.remove_account0_field) delete (record.accounts[0] as unknown as Record<string, unknown>)[n.remove_account0_field as string]
    if (n.add_account0_field) Object.assign(record.accounts[0], n.add_account0_field)
    if (n.replace_profile) record.profile = n.replace_profile as string
    if (Object.hasOwn(n, "replace_account0_index")) (record.accounts[0] as unknown as Record<string, unknown>).account = n.replace_account0_index
    if (n.swap_indices) [record.accounts[0], record.accounts[1]] = [record.accounts[1], record.accounts[0]]
    expect(() => parseHdRecordMetadata(record)).toThrow()
  })
  it.each(vectors.negative_cases.filter((c) => c.reject_at === "wrapped-dek-and-payload-aead"))("rejects both-AEAD metadata substitution: $id", async (negative) => {
    const n = negative as unknown as Record<string, unknown>
    const c = vectors.cases[0]
    const record = structuredClone(c.record_meta)
    if (n.replace_record_account0_evm) record.accounts[0].evm = n.replace_record_account0_evm as string
    if (n.replace_record_account0_field) Object.assign(record.accounts[0], n.replace_record_account0_field)
    const context = protectedRecordContextFromMetadata((n.replace_name as string) ?? c.name, parseHdRecordMetadata(record))
    const wrap = JSON.parse(c.envelope.wrap_meta)
    await expect(openProtected({ ...c.envelope, dek_nonce: wrap.dek_nonce, wrapped_dek: wrap.wrapped_dek }, hexToBytes(c.vmk_hex), context)).rejects.toThrow()
  })
  it.each([
    { chain: "bitcoin", account: 0 }, { chain: "bitcoin", account: 0, address_type: "p2pkh" },
    { chain: "bitcoin", account: 0, address_type: "p2wpkh" }, { chain: "evm", account: 0, address_type: "p2tr" },
    { chain: "solana", account: 0, address_type: "p2tr" }, { chain: "evm", account: true },
    { chain: "evm", account: 20 }, { chain: "evm", account: -1 }, { chain: "evm", account: 0, path: "m" },
  ])("never normalizes missing/extra signed selection: %j", (value) => expect(() => parseHdDerivation(value)).toThrow())
  it("wipes derived secret on synchronous success and failure", () => {
    const seed = hexToBytes(vectors.cases[0].seed_hex)
    try {
      for (const chain of ["evm", "bitcoin", "solana"] as const) {
        let observed: Uint8Array | undefined
        const selection = chain === "bitcoin" ? { chain, account: 1, address_type: "p2tr" as const } : { chain, account: 1 }
        withHdSigningKey(seed, selection, (key) => { observed = key; expect(key.some((byte) => byte !== 0)).toBe(true) })
        expect(observed!.every((byte) => byte === 0)).toBe(true)
        expect(() => withHdSigningKey(seed, selection, (key) => { observed = key; throw new Error("public-error") })).toThrow("public-error")
        expect(observed!.every((byte) => byte === 0)).toBe(true)
      }
    } finally { seed.fill(0) }
  })
  it.each(["[]", "null", '"string"', '{"v":1,"x":1e400}', '{"v":1,"x":"\\ud800"}', '{"v":1,"x":' + "[".repeat(65) + "0" + "]".repeat(65) + "}", " ".repeat(65_537)])("refuses bounded malformed JSON", (raw) => expect(() => parseHdWrapJson(raw)).toThrow())
  it("preserves unknown root extensions/last-member semantics and finite numbers", () => {
    expect(parseHdWrapJson('{"v":0,"v":1,"copies":[],"extension":{"x":0.25,"用户":"🚀"}}')).toEqual({ v: 1, copies: [], extension: { x: 0.25, 用户: "🚀" } })
  })
  it.each(["AA", "AB==", "AA==\n", "-A==", "AAA=", "A".repeat(900)])("refuses noncanonical/wrong-length base64 %s", (value) => expect(() => strictHdBase64(value, [1])).toThrow())
})

describe("popup-local seal and reopen, no public plaintext result", () => {
  async function root() {
    const vmk = new Uint8Array(32).fill(0x44)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }])
    return { vmk, wrapMeta }
  }
  it("returns only permitted ciphertext/public values, validates full reopen and refuses value outlets", async () => {
    const f = await root()
    const c = vectors.cases[3]
    try {
      const result = await sealHdWalletLocally({ ...f, name: c.name, words: c.words, passphrase: c.passphrase, assertCurrent() {} })
      expect(Object.keys(result).sort()).toEqual(["accounts", "envelope", "expectedAccount0"])
      expect(result.accounts).toEqual(c.record_meta.accounts)
      expect(result.expectedAccount0).toEqual(c.expected_account0)
      expect(hdRootIdentity(result.envelope.wrap_meta)).toBe(hdRootIdentity(f.wrapMeta))
      expect(parseSealedHdWallet(result, c.name, f.wrapMeta)).toEqual(result)
      const unpacked = unpackProtectedRecord(result.envelope)
      expect(isStaticReleaseRecord(unpacked.recordMetadata)).toBe(false)
      await expect(signProtectedDigest(unpacked.sealed, f.vmk, protectedRecordContextFromMetadata(c.name, unpacked.recordMetadata), "11".repeat(32), "ecdsa-secp256k1-recoverable")).rejects.toThrow(/keypair/)
      const bad = structuredClone(result)
      bad.expectedAccount0.btc_legacy = "wrong"
      expect(() => parseSealedHdWallet(bad, c.name, f.wrapMeta)).toThrow(/account0/)
    } finally { f.vmk.fill(0) }
  })
  it("invalidates after an awaited seal and never returns a late success", async () => {
    const f = await root()
    let checkpoints = 0
    try {
      await expect(sealHdWalletLocally({ ...f, name: "PUBLIC_HD", words: vectors.cases[0].words, passphrase: "final", assertCurrent() { if (++checkpoints === 3) throw new Error("operation-aborted") } })).rejects.toThrow("operation-aborted")
      expect(checkpoints).toBe(3)
    } finally { f.vmk.fill(0) }
  })
  it("does not accept crypto-only empty-copy fixtures as setup/unlock/restore roots", () => {
    expect(() => validateHdBaseRoot('{"v":1,"copies":[]}')).toThrow()
    expect(() => validateHdBaseRoot(vectors.cases[0].envelope.wrap_meta)).toThrow()
  })
})
