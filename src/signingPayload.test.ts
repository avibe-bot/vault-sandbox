import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { assertSigningIdentity, parseSolanaSigningContext, type SolanaTransactionSigningContext } from "./signingPayload"
import { assertSignBinding, parseSignRequest, prepareSignRequest, signPreparedRequest, signRequestChallenge, type SignRequest, type PreparedSignRequest } from "./signRequest"
import { assertSignedOperationContextsConsumable, consumeSignedOperationContexts, resetSignedContextReplayCacheForTests, signedOperationContextMessage, verifySignedOperationContext } from "./operationContext"
import * as canonical from "./canonicalJson"
import { MAX_EXACT_MESSAGE_BYTES } from "./exactMessage"
import { signFixture } from "./signTestFixtures"
import * as crypto from "./vaultCrypto"
import vectors from "./fixtures/rfc8032-ed25519.json"
import producer from "./fixtures/protected-solana-sign-context.json"
import producerSource from "./fixtures/protected-solana-sign-context.json?raw"

const v = vectors[1]
// Deliberately not a transaction fixture. Wire/binding acceptance is NOT structural acceptance.
const context: SolanaTransactionSigningContext = { kind: "solana-transaction-v1", messageHex: v.messageHex }
const record = { name: "PUBLIC_TEST_KEY", kind: "keypair" as const, curve: "ed25519" as const, publicKey: v.publicKeyHex }
const payload = { kind: "message" as const, messageHex: v.messageHex }

async function fixture() {
  const f = await signFixture()
  const request: SignRequest<SolanaTransactionSigningContext> = {
    ...f.request, scheme: "ed25519", signingContext: { ...context },
    material: { name: record.name, envelope: crypto.packProtectedRecord(await crypto.sealProtected(hexToBytes(v.seedHex), f.vmk, record), f.wrapMeta, record) },
  }
  request.context.release = { name: record.name, scheme: "ed25519", publicKey: record.publicKey, messageHex: context.messageHex, signingContext: { ...context } }
  const resign = () => {
    request.context.signature.value = crypto.bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(request.context)), new Uint8Array(32).fill(0x11)))
  }
  resign()
  return { ...f, request, resign }
}

afterEach(() => { resetSignedContextReplayCacheForTests(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("Solana exact-message wire and authenticated binding (not a structure verifier)", () => {
  it("accepts an immutable exact wire snapshot and authenticates all fields with existing v2 machinery", async () => {
    const f = await fixture()
    const request = parseSignRequest(f.request)
    assertSigningIdentity(request.scheme, request.signingContext, record)
    assertSignBinding(request, payload, record.publicKey)
    verifySignedOperationContext({ context: request.context, rootMetadata: f.rootMetadata, expectedPurpose: "sign" })
    expect(signRequestChallenge(request)).toEqual(sha256(new TextEncoder().encode(signedOperationContextMessage(request.context))))
    expect(Object.isFrozen(request.context.release)).toBe(true)
    expect(Object.isFrozen(request.signingContext)).toBe(true)
    f.request.signingContext.messageHex = "73"
    f.request.context.release!.messageHex = "73"
    expect(request.signingContext).toEqual(context)
    expect(request.context.release!.messageHex).toBe("72")
    await consumeSignedOperationContexts([request.context])
    expect(() => assertSignedOperationContextsConsumable([request.context])).toThrow(/already used/)
  })

  it("consumes the exact committed Python producer fixture without enabling Solana signing", async () => {
    expect(bytesToHex(sha256(new TextEncoder().encode(producerSource)))).toBe("bd68ae39dc1eec511b4b4dbe084adbfe974d5f866a0e461e6122047eefd0746a")
    const release = producer.signedContext.release
    const record = { name: release.name, kind: "keypair" as const, curve: "ed25519" as const, publicKey: producer.publicKey }
    const vmk = new Uint8Array(32).fill(0x44)
    const seed = hexToBytes(producer.signingSeedHex)
    try {
      const sealed = await crypto.sealProtected(seed, vmk, record)
      const request = parseSignRequest({
        material: { name: record.name, envelope: crypto.packProtectedRecord(sealed, '{"v":1,"copies":[]}', record) },
        scheme: "ed25519", signingContext: release.signingContext, context: producer.signedContext,
      })
      assertSigningIdentity(request.scheme, request.signingContext, record)
      assertSignBinding(request, { kind: "message", messageHex: release.messageHex }, record.publicKey)
      expect(signedOperationContextMessage(request.context)).toBe(producer.canonicalUnsignedContext)
      const verification = {
        context: request.context, expectedPurpose: "sign" as const, now: Date.parse("2026-11-11T00:00:00Z"),
        rootMetadata: { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: producer.daemonKeyId, publicKey: producer.daemonPublicKey }] } },
      }
      verifySignedOperationContext(verification)
      expect(bytesToHex(signRequestChallenge(request))).toBe("69437916686effa24db91cb98812ad38b99e7e6b618e7e850d95e9d7025d0e75")
      expect(release.messageHex.length / 2).toBe(150)
      expect(crypto.signEd25519Message(seed, release.messageHex).signature).toBe(producer.expectedSignature)
      expect((await crypto.signProtectedEd25519Message(sealed, vmk, record, release.messageHex)).signature).toBe(producer.expectedSignature)
      expect(() => prepareSignRequest(request)).toThrow(/not enabled/)
      const changed = structuredClone(request)
      changed.signingContext = { kind: "solana-transaction-v1", messageHex: `00${release.messageHex.slice(2)}` }
      changed.context.release!.messageHex = changed.signingContext.messageHex
      changed.context.release!.signingContext = changed.signingContext
      expect(() => verifySignedOperationContext({ ...verification, context: changed.context })).toThrow(/signature/)
      expect(signRequestChallenge(changed)).not.toEqual(signRequestChallenge(request))
    } finally {
      seed.fill(0)
      vmk.fill(0)
    }
  })

  it("accepts exactly the 1 MiB wire limit without treating size as structural validity", () => {
    const messageHex = "00".repeat(MAX_EXACT_MESSAGE_BYTES)
    expect(parseSolanaSigningContext({ ...context, messageHex })).toEqual({ ...context, messageHex })
  })

  it("rejects one-over before canonical traversal and hex scanning", () => {
    const canonicalScan = vi.spyOn(canonical, "assertCanonicalJson")
    const messageHex = "zz".repeat(MAX_EXACT_MESSAGE_BYTES + 1)
    expect(() => parseSolanaSigningContext({ ...context, messageHex })).toThrow(/1 MiB/)
    expect(canonicalScan).not.toHaveBeenCalled()
  })

  it.each(["context", "release", "nested-release"])("bounds the %s copy before request canonical traversal or cloning", async (location) => {
    const f = await fixture()
    const messageHex = "00".repeat(MAX_EXACT_MESSAGE_BYTES + 1)
    if (location === "context") f.request.signingContext.messageHex = messageHex
    else if (location === "release") f.request.context.release!.messageHex = messageHex
    else f.request.context.release!.signingContext = { ...context, messageHex }
    const canonicalScan = vi.spyOn(canonical, "assertCanonicalJson")
    const clone = vi.spyOn(globalThis, "structuredClone")
    expect(() => parseSignRequest(f.request)).toThrow(/1 MiB/)
    expect(() => assertSignBinding(f.request, payload, record.publicKey)).toThrow(/1 MiB/)
    expect(() => signRequestChallenge(f.request)).toThrow(/1 MiB/)
    expect(canonicalScan).not.toHaveBeenCalled()
    expect(clone).not.toHaveBeenCalled()
  })

  it.each(["", "7", "0x72", "AF82", "72 ", "zz", 72, null])("rejects noncanonical or empty messageHex %j", (messageHex) => {
    expect(() => parseSolanaSigningContext({ kind: context.kind, messageHex })).toThrow(/messageHex/)
  })

  it.each(["digest", "digestAlgorithm", "message_hex", "unsignedTransaction", "prehash"]) ("rejects alternate/extra context field %s", (key) => {
    expect(() => parseSolanaSigningContext({ ...context, [key]: key === "digest" ? "00".repeat(32) : "unexpected" })).toThrow(/no digest alias/)
  })

  it.each(["name", "scheme", "messageHex", "publicKey", "signingContext"]) ("rejects missing signed release %s", async (key) => {
    const f = await fixture()
    delete f.request.context.release![key]
    f.resign()
    expect(() => assertSignBinding(parseSignRequest(f.request), payload, record.publicKey)).toThrow(/signed binding/)
  })

  it.each(["name", "scheme", "messageHex", "publicKey", "signingContext"]) ("rejects signed release %s substitution even after daemon re-signs", async (key) => {
    const f = await fixture()
    f.request.context.release![key] = key === "signingContext" ? { ...context, messageHex: "73" } : "different"
    f.resign()
    expect(() => assertSignBinding(parseSignRequest(f.request), payload, record.publicKey)).toThrow(/signed binding/)
  })

  it("rejects a digest alias in release and a mismatch between verified bytes and context", async () => {
    const f = await fixture()
    f.request.context.release!.digest = bytesToHex(sha256(hexToBytes(context.messageHex)))
    expect(() => assertSignBinding(parseSignRequest(f.request), payload, record.publicKey)).toThrow(/unsupported/)
    delete f.request.context.release!.digest
    expect(() => assertSignBinding(parseSignRequest(f.request), { kind: "message", messageHex: "73" }, record.publicKey)).toThrow(/signed binding/)
    expect(() => assertSignBinding(parseSignRequest(f.request), { kind: "digest", digest: "00".repeat(32) }, record.publicKey)).toThrow(/unsupported|signed binding/)
  })

  it("authenticates exact bytes even if attacker swaps both context and release", async () => {
    const f = await fixture()
    const before = signRequestChallenge(f.request)
    f.request.signingContext.messageHex = "73"
    f.request.context.release!.signingContext = { ...f.request.signingContext }
    f.request.context.release!.messageHex = "73"
    const parsed = parseSignRequest(f.request)
    assertSignBinding(parsed, { kind: "message", messageHex: "73" }, record.publicKey)
    expect(signRequestChallenge(parsed)).not.toEqual(before)
    expect(() => verifySignedOperationContext({ context: parsed.context, rootMetadata: f.rootMetadata, expectedPurpose: "sign" })).toThrow(/signature/)
  })

  it.each(["name", "scheme", "publicKey", "signingContext", "requestId", "expiresAt"]) ("binds whole-operation challenge to %s, not just message bytes", async (field) => {
    const f = await fixture()
    const before = signRequestChallenge(f.request)
    if (field === "requestId" || field === "expiresAt") f.request.context[field] += "changed"
    else f.request.context.release![field] = "changed"
    expect(signRequestChallenge(f.request)).not.toEqual(before)
  })

  it("preserves expiry checks and revalidates at use time", async () => {
    const f = await fixture()
    const request = parseSignRequest(f.request)
    verifySignedOperationContext({ context: request.context, rootMetadata: f.rootMetadata })
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 120_000)
    expect(() => verifySignedOperationContext({ context: request.context, rootMetadata: f.rootMetadata })).toThrow(/expired/)
  })

  it("rejects every curve/scheme/context mismatch, including generic Ed25519 agent operations", async () => {
    const f = await signFixture()
    expect(() => assertSigningIdentity("ed25519", context, { ...record, curve: undefined })).toThrow(/together/)
    expect(() => assertSigningIdentity("ecdsa-secp256k1-der", context, record)).toThrow(/together/)
    expect(() => assertSigningIdentity("ed25519", f.request.signingContext, record)).toThrow(/together/)
    expect(() => assertSigningIdentity("schnorr-secp256k1-bip340", f.request.signingContext, record)).toThrow(/together/)
    expect(() => assertSigningIdentity("ed25519", context, { ...record, kind: "static" })).toThrow(/keypair/)
  })

  it("never prepares Solana for approval/signing even with authentic context and encrypted key", async () => {
    const f = await fixture()
    const signer = vi.spyOn(crypto, "signProtectedEd25519Message")
    const digestSigner = vi.spyOn(crypto, "signProtectedDigest")
    expect(() => prepareSignRequest(f.request)).toThrow(/not enabled/)
    // Even an accidentally hand-constructed prepared object cannot bypass the sign-time gate.
    const forged = { request: parseSignRequest(f.request), recordContext: record } as PreparedSignRequest
    await expect(signPreparedRequest(forged, f.vmk, f.wrapMeta)).rejects.toMatchObject({ code: "unsupported_signing_context" })
    expect(signer).not.toHaveBeenCalled()
    expect(digestSigner).not.toHaveBeenCalled()
  })
})
