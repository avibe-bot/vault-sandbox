import { afterEach, describe, expect, it, vi } from "vitest"
import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js"
import { hexToBytes, bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { keccak256, serializeTransaction } from "viem"
import * as crypto from "./vaultCrypto"
import { consumeSignedOperationContexts, resetSignedContextReplayCacheForTests } from "./operationContext"
import { prepareSignRequest, signingSchemeDescription, signPreparedRequest } from "./signRequest"
import { signFixture } from "./signTestFixtures"

const TAP = crypto.SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH
const RAW = crypto.SIGN_SCHEME_SCHNORR_SECP256K1_BIP340

afterEach(() => { resetSignedContextReplayCacheForTests(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("immutable protected signing semantics", () => {
  it("accepts a daemon-bound raw signature for a domain-separated agent operation", async () => {
    const f = await signFixture()
    const prepared = prepareSignRequest(f.request)
    const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta)
    expect(schnorr.verify(hexToBytes(result.signature), hexToBytes(f.request.signingContext.digest), schnorr.getPublicKey(f.key))).toBe(true)
    expect(prepared.verified.display).toContain("untweaked internal key")
    expect(prepared.verified.display).toContain("NOT a Bitcoin transaction")
    expect(Object.isFrozen(prepared.request.context.release)).toBe(true)
    expect(Object.isFrozen(prepared.request.signingContext)).toBe(true)
    await consumeSignedOperationContexts([prepared.request.context])
    await expect(signPreparedRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow(/already used/)
  })

  it.each(["name", "scheme", "digest", "publicKey", "signingContext", "release"])("refuses missing signed %s before signing", async (field) => {
    const f = await signFixture()
    if (field === "release") delete f.request.context.release
    else delete f.request.context.release![field]
    f.resign()
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    await expect(async () => signPreparedRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)).rejects.toMatchObject({ code: "invalid_sign_binding" })
    expect(sign).not.toHaveBeenCalled()
  })

  it.each(["name", "scheme", "digest", "publicKey", "signingContext"])("rejects mismatching signed %s even with a valid daemon signature", async (field) => {
    const f = await signFixture()
    f.request.context.release![field] = field === "signingContext" ? { ...f.request.signingContext, canonicalPreimage: "different" } : "different"
    f.resign()
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    await expect(async () => signPreparedRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)).rejects.toThrow(/signed binding/)
    expect(sign).not.toHaveBeenCalled()
  })

  it("rejects an attacker swapping both the requested scheme and signed release without the daemon key", async () => {
    const f = await signFixture()
    f.request.scheme = "ecdsa-secp256k1-der"
    f.request.context.release!.scheme = "ecdsa-secp256k1-der"
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    await expect(signPreparedRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)).rejects.toThrow(/signature/)
    expect(sign).not.toHaveBeenCalled()
  })

  it("rejects swapping the digest plus its valid preimage, even if the attacker never returns a result to the API", async () => {
    const f = await signFixture()
    const canonicalPreimage = "avault-agent-operation:v1\nattack"
    f.request.signingContext = { kind: "avault-agent-operation", digestAlgorithm: "avault-operation-hash-v1", canonicalPreimage, digest: bytesToHex(sha256(new TextEncoder().encode(canonicalPreimage))) }
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    expect(() => prepareSignRequest(f.request)).toThrow(/signed binding/)
    expect(sign).not.toHaveBeenCalled()
  })

  it("rejects a different encrypted key under the same record name before opening/signing", async () => {
    const f = await signFixture()
    const otherKey = new Uint8Array(32).fill(2)
    const otherContext = { name: f.request.material.name, kind: "keypair" as const, publicKey: bytesToHex(secp256k1.getPublicKey(otherKey)) }
    f.request.material.envelope = crypto.packProtectedRecord(await crypto.sealProtected(otherKey, f.vmk, otherContext), f.wrapMeta, otherContext)
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    expect(() => prepareSignRequest(f.request)).toThrow(/signed binding/)
    expect(sign).not.toHaveBeenCalled()
  })

  it("does not retain mutable caller references across approval", async () => {
    const f = await signFixture(RAW)
    const prepared = prepareSignRequest(f.request)
    f.request.scheme = "ecdsa-secp256k1-der"
    f.request.context.release!.scheme = "ecdsa-secp256k1-der"
    f.request.material.name = "SWAPPED"
    const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta)
    expect(result.scheme).toBe(RAW)
    expect(schnorr.verify(hexToBytes(result.signature), hexToBytes(prepared.verified.digest), schnorr.getPublicKey(f.key))).toBe(true)
  })

  it.each(["expiry", "purpose", "signature", "keyId"])("rejects invalid %s without invoking the signer", async (field) => {
    const f = await signFixture()
    if (field === "expiry") { f.request.context.expiresAt = new Date(Date.now() - 1).toISOString(); f.resign() }
    if (field === "purpose") { f.request.context.purpose = "reveal"; f.resign() }
    if (field === "signature") f.request.context.signature.value = "00".repeat(64)
    if (field === "keyId") f.request.context.signature.keyId = "unpinned"
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    await expect(async () => signPreparedRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)).rejects.toThrow()
    expect(sign).not.toHaveBeenCalled()
  })

  it("rechecks expiry at use time, after preparation/approval", async () => {
    const f = await signFixture()
    const prepared = prepareSignRequest(f.request)
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 120_000)
    const sign = vi.spyOn(crypto, "signProtectedDigest")
    await expect(signPreparedRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow(/expired/)
    expect(sign).not.toHaveBeenCalled()
  })

  it.each(["request", "material", "envelope", "context", "release", "signingContext"])("rejects unsupported tree options in %s", async (location) => {
    const f = await signFixture()
    const target = location === "request" ? f.request : location === "material" ? f.request.material
      : location === "envelope" ? f.request.material.envelope : location === "context" ? f.request.context
      : location === "release" ? f.request.context.release! : f.request.signingContext
    Object.assign(target, { merkleRoot: "00".repeat(32) })
    expect(() => prepareSignRequest(f.request)).toThrow(/unsupported/)
  })

  it.each(["bitcoin-transaction", "raw-hex", "digest"])("does not introduce unverified %s approval", async (kind) => {
    const f = await signFixture()
    f.request.signingContext = { kind, digest: "11".repeat(32) } as never
    expect(() => prepareSignRequest(f.request)).toThrow(/unsupported signing context/)
  })

  it("does not label a raw BIP340 approval with the tweaked receiving address", async () => {
    const f = await signFixture(RAW)
    const prepared = prepareSignRequest(f.request)
    expect(prepared.verified.display).toContain("untweaked internal key")
    expect(prepared.verified.display).not.toContain(crypto.deriveSigningAddresses(f.publicKey).btc_taproot)
    expect(signingSchemeDescription("ecdsa-secp256k1-der", f.publicKey)).toBe(`ECDSA secp256k1 DER\npublic key: ${f.publicKey}`)
    expect(signingSchemeDescription(TAP, f.publicKey)).toContain("BIP341 Taproot key-path Schnorr")
    expect(() => prepareSignRequest({ ...f.request, scheme: TAP })).toThrow(/requires a Bitcoin Taproot context/)
  })

  it("rejects Schnorr schemes paired with an EVM context", async () => {
    const f = await signFixture()
    const tx = { chainId: 1, to: "0x0000000000000000000000000000000000000001", value: 0, gas: 21_000, gasPrice: 1, nonce: 0 } as const
    const digest = keccak256(serializeTransaction({ ...tx, value: 0n, gas: 21_000n, gasPrice: 1n }))
    f.request.signingContext = { kind: "evm-transaction", chainId: "1", unsignedTransaction: tx, digestAlgorithm: "keccak256", digest }
    expect(() => prepareSignRequest(f.request)).toThrow(/ECDSA scheme/)
  })
})
