import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { hexToBytes, bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import * as crypto from "./vaultCrypto"
import { sealGeneratedKeypair } from "./sealOperations"
import { parseSealRequest } from "./sealRequest"
import vectors from "./fixtures/rfc8032-ed25519.json"
import legacy from "./fixtures/protected-record-secp256k1-v2.json"

// Unfrozen wrappers ONLY in tests let fault injection observe owned seed buffers.
vi.mock("@noble/curves/ed25519.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@noble/curves/ed25519.js")>()
  return { ...actual, ed25519: { ...actual.ed25519, utils: { ...actual.ed25519.utils } } }
})

const vmk = new Uint8Array(32).fill(0x44)
const wrapMeta = '{"v":1,"copies":[]}'
const vector = vectors[1]
const record = { name: "PUBLIC_TEST_KEY", kind: "keypair" as const, curve: "ed25519" as const, publicKey: vector.publicKeyHex }
const nodeKey = (seed: string) => createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${seed}`, "hex"), format: "der", type: "pkcs8" })

afterEach(() => vi.restoreAllMocks())

describe("exact-message Ed25519 primitive (public RFC 8032 keys only)", () => {
  it.each(vectors)("matches $id without digest substitution and agrees with OpenSSL", (v) => {
    const key = hexToBytes(v.seedHex)
    const message = hexToBytes(v.messageHex)
    const result = crypto.signEd25519Message(key, message)
    expect(result).toEqual({ scheme: "ed25519", signature: v.signatureHex, recovery_id: null })
    const independent = nodeKey(v.seedHex)
    expect(createPublicKey(independent).export({ format: "der", type: "spki" }).subarray(-32).toString("hex")).toBe(v.publicKeyHex)
    expect(sign(null, message, independent).toString("hex")).toBe(v.signatureHex)
    expect(verify(null, message, createPublicKey(independent), Buffer.from(result.signature, "hex"))).toBe(true)
    expect(verify(null, sha256(message), createPublicKey(independent), Buffer.from(result.signature, "hex"))).toBe(false)
    expect(crypto.signEd25519Message(key, new Uint8Array([...message, 0])).signature).not.toBe(v.signatureHex)
    // The primitive owns copies, never the caller's buffers.
    expect(bytesToHex(key)).toBe(v.seedHex)
    expect(bytesToHex(message)).toBe(v.messageHex)
  })

  it.each([false, true])("clears its owned seed copy, including failure=%s", (fail) => {
    const captured: Uint8Array[] = []
    const original = ed25519.sign
    vi.spyOn(ed25519, "sign").mockImplementation((message, key, options) => {
      captured.push(key)
      if (fail) throw new Error("synthetic signer failure")
      return original(message, key, options)
    })
    const run = () => crypto.signEd25519Message(vector.seedHex, vector.messageHex)
    if (fail) expect(run).toThrow(/synthetic/)
    else expect(run().signature).toBe(vector.signatureHex)
    expect(captured).toHaveLength(1)
    expect(captured[0].every((byte) => byte === 0)).toBe(true)
  })

  it("fails closed on self-verification failure and clears the signer seed", () => {
    const original = ed25519.sign
    let captured: Uint8Array | undefined
    vi.spyOn(ed25519, "sign").mockImplementation((message, key, options) => { captured = key; return original(message, key, options) })
    vi.spyOn(ed25519, "verify").mockReturnValue(false)
    expect(() => crypto.signEd25519Message(vector.seedHex, vector.messageHex)).toThrow(/self-verification/)
    expect(captured!.every((byte) => byte === 0)).toBe(true)
  })

  it.each([0, 31, 33, 64])("rejects a %s-byte seed instead of accepting expanded Solana secret material", (length) => {
    expect(() => crypto.signEd25519Message(new Uint8Array(length), "72")).toThrow(/32 bytes/)
  })

  it("rejects Ed25519 on every digest-based crypto/DEK binding entry", async () => {
    expect(() => crypto.signDigest(vector.seedHex, "11".repeat(32), "ed25519")).toThrow(/not a digest/)
    await expect(crypto.blindBoxAgentSignOperationHash("ed25519", "11".repeat(32), 1)).rejects.toThrow(/not a digest/)
    expect(() => crypto.blindBoxAad({ purpose: "agent-sign", name: record.name, grantId: "test", signScheme: "ed25519", digest: "11".repeat(32), ttlSecs: 1, approvalNonce: new Uint8Array(16), approvalExpiresAtUnix: 1, operationHash: "22".repeat(32) })).toThrow(/not a digest/)
  })
})

describe("sandbox-born Ed25519 custody", () => {
  it("returns only ciphertext and public identity, authenticates its curve, and wipes generation material", async () => {
    const seed = hexToBytes(vector.seedHex)
    vi.spyOn(ed25519.utils, "randomSecretKey").mockReturnValue(seed)
    const result = await sealGeneratedKeypair({ name: record.name, curve: "ed25519", vmk, wrapMeta })
    expect(seed.every((byte) => byte === 0)).toBe(true)
    expect(Object.keys(result).sort()).toEqual(["addresses", "envelope", "publicKey"])
    expect(result.publicKey).toBe(vector.publicKeyHex)
    expect(Object.keys(result.addresses!)).toEqual(["solana"])
    const unpacked = crypto.unpackProtectedRecord(result.envelope)
    expect(unpacked.recordMetadata).toEqual({ kind: "keypair", curve: "ed25519", public_key: vector.publicKeyHex })
    expect(crypto.protectedRecordContextFromMetadata(record.name, unpacked.recordMetadata)).toEqual(record)
    const opened = await crypto.openProtected(unpacked.sealed, vmk, record)
    try { expect(bytesToHex(opened)).toBe(vector.seedHex) } finally { opened.fill(0) }
    expect((await crypto.signProtectedEd25519Message(unpacked.sealed, vmk, record, vector.messageHex)).signature).toBe(vector.signatureHex)
    // Removing/swapping curve or key changes AAD; never reinterpret old ciphertext.
    await expect(crypto.openProtected(unpacked.sealed, vmk, { ...record, curve: undefined })).rejects.toThrow()
    await expect(crypto.openProtected(unpacked.sealed, vmk, { ...record, publicKey: vectors[2].publicKeyHex })).rejects.toThrow()
    await expect(crypto.signProtectedDigest(unpacked.sealed, vmk, record, "11".repeat(32), "ecdsa-secp256k1-der")).rejects.toThrow(/secp256k1/)
  })

  it("rejects an empty protected message even though the generic RFC primitive permits it", async () => {
    const sealed = await crypto.sealProtected(hexToBytes(vector.seedHex), vmk, record)
    await expect(crypto.signProtectedEd25519Message(sealed, vmk, record, new Uint8Array())).rejects.toThrow(/must not be empty/)
    await expect(crypto.signProtectedEd25519Message(sealed, new Uint8Array(32), record, "72")).rejects.toThrow()
  })

  it("wipes generated material on encryption failure", async () => {
    const seed = hexToBytes(vector.seedHex)
    vi.spyOn(ed25519.utils, "randomSecretKey").mockReturnValue(seed)
    await expect(sealGeneratedKeypair({ name: record.name, curve: "ed25519", vmk: new Uint8Array(1), wrapMeta })).rejects.toThrow()
    expect(seed.every((byte) => byte === 0)).toBe(true)
  })

  it("verifies decrypted seed/public-key consistency and wipes on mismatch", async () => {
    const sealed = await crypto.sealProtected(hexToBytes(vectors[2].seedHex), vmk, record)
    const original = ed25519.getPublicKey
    const captured: Uint8Array[] = []
    vi.spyOn(ed25519, "getPublicKey").mockImplementation((key) => { captured.push(key); return original(key) })
    await expect(crypto.signProtectedEd25519Message(sealed, vmk, record, "72")).rejects.toThrow(/does not match/)
    expect(captured).toHaveLength(1)
    expect(captured[0].every((byte) => byte === 0)).toBe(true)
  })

  it("clears decrypted material on success and signer failure", async () => {
    const sealed = await crypto.sealProtected(hexToBytes(vector.seedHex), vmk, record)
    const original = ed25519.getPublicKey
    const captured: Uint8Array[] = []
    vi.spyOn(ed25519, "getPublicKey").mockImplementation((key) => { captured.push(key); return original(key) })
    await crypto.signProtectedEd25519Message(sealed, vmk, record, "72")
    vi.spyOn(ed25519, "sign").mockImplementation(() => { throw new Error("synthetic sign failure") })
    await expect(crypto.signProtectedEd25519Message(sealed, vmk, record, "72")).rejects.toThrow(/synthetic/)
    expect(captured.length).toBeGreaterThanOrEqual(2)
    expect(captured.every((key) => key.every((byte) => byte === 0))).toBe(true)
  })

  it("rejects missing/wrong/static record curve before decrypting", async () => {
    const sealed = await crypto.sealProtected(hexToBytes(vector.seedHex), vmk, record)
    for (const context of [{ ...record, curve: undefined }, { ...record, curve: "secp256k1" as const }, { ...record, kind: "static" as const }]) {
      await expect(crypto.signProtectedEd25519Message(sealed, vmk, context, "72")).rejects.toThrow(/Ed25519 keypair/)
    }
    for (const curve of ["secp256k1", "unknown", null]) {
      const envelope = crypto.packProtectedRecord(sealed, wrapMeta, record)
      const meta = JSON.parse(envelope.wrap_meta)
      meta.record_meta.curve = curve
      expect(() => crypto.unpackProtectedRecord({ ...envelope, wrap_meta: JSON.stringify(meta) })).toThrow(/curve/)
    }
  })

  it("uses raw base58 of the 32-byte public key, not Base58Check", () => {
    // Independent Python big-endian integer/divmod encoding of the RFC public key.
    expect(crypto.deriveSolanaAddress(vector.publicKeyHex)).toBe("586Z7H2vpX9qNhN2T4e9Utugie3ogjbxzGaMtM3E6HR5")
    expect(() => crypto.deriveSolanaAddress(legacy.publicKey)).toThrow(/32-byte/)
  })

  it("accepts only generate-only Ed25519 requests, never protected imports", () => {
    expect(parseSealRequest({ name: record.name, kind: "keypair", curve: "ed25519" })).toMatchObject({ curve: "ed25519" })
    expect(() => parseSealRequest({ name: record.name, kind: "keypair", curve: "unknown" })).toThrow(/curve/)
    expect(() => parseSealRequest({ name: record.name, kind: "static", curve: "ed25519", inputMode: "parent-value", value: "x" })).toThrow(/curve/)
    expect(() => parseSealRequest({ name: record.name, kind: "keypair", curve: "ed25519", value: vector.seedHex })).toThrow(/private key/)
    expect(() => parseSealRequest({ name: record.name, kind: "keypair", curve: "ed25519", inputMode: "sandbox-entry" })).toThrow(/generate-only/)
  })
})

describe("unchanged secp256k1 record compatibility", () => {
  it("opens an independently encrypted old-format envelope with byte-identical AAD", async () => {
    const unpacked = crypto.unpackProtectedRecord(legacy.envelope)
    const context = crypto.protectedRecordContextFromMetadata("PUBLIC_TEST_KEY", unpacked.recordMetadata)
    expect(unpacked.recordMetadata).toEqual({ kind: "keypair", public_key: legacy.publicKey })
    expect(new TextDecoder().decode(hexToBytes(crypto.protectedRecordAadHex(context)))).toBe(legacy.aad)
    expect(crypto.protectedRecordAadHex({ ...context, curve: "secp256k1" })).toBe(crypto.protectedRecordAadHex(context))
    const opened = await crypto.openProtected(unpacked.sealed, hexToBytes(legacy.vmkHex), context)
    try { expect(bytesToHex(opened)).toBe(legacy.privateKeyHex) } finally { opened.fill(0) }
    expect((await crypto.signProtectedDigest(unpacked.sealed, hexToBytes(legacy.vmkHex), context, "11".repeat(32), "ecdsa-secp256k1-der")).scheme).toBe("ecdsa-secp256k1-der")
    const resealed = crypto.packProtectedRecord(await crypto.sealProtected(hexToBytes(legacy.privateKeyHex), vmk, { ...context, curve: "secp256k1" }), wrapMeta, { ...context, curve: "secp256k1" })
    expect(JSON.parse(resealed.wrap_meta).record_meta).toEqual({ kind: "keypair", public_key: legacy.publicKey })
    await expect(crypto.signProtectedEd25519Message(unpacked.sealed, vmk, context, "72")).rejects.toThrow(/Ed25519/)
  })
})
