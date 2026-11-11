import { createPublicKey, verify } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { hexToBytes } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import corpus from "./fixtures/solana-acceptance/corpus.json"
import { consumeSignedOperationContexts, resetSignedContextReplayCacheForTests, signedOperationContextMessage } from "./operationContext"
import { parseSignRequest, prepareSignRequest, signPreparedRequest, verifyPreparedSignRequest, type PreparedSignRequest } from "./signRequest"
import { MAX_EXACT_MESSAGE_BYTES } from "./exactMessage"
import { signFixture, solanaSignFixture } from "./signTestFixtures"
import * as crypto from "./vaultCrypto"

// Published RFC 8032 seeds from the independent acceptance corpus. Never credentials.
const seeds = new Map(corpus.keys.map((key) => [key.id, key.seedHex]))
const seedFor = (keyId: string) => seeds.get(keyId)!
const base = corpus.solana[0]

/** OpenSSL, independent of the noble signer under test. */
function opensslVerifies(publicKeyHex: string, messageHex: string, signatureHex: string): boolean {
  const key = createPublicKey({ key: Buffer.from(`302a300506032b6570032100${publicKeyHex}`, "hex"), format: "der", type: "spki" })
  return verify(null, Buffer.from(messageHex, "hex"), key, Buffer.from(signatureHex, "hex"))
}

async function fixture(messageHex = base.message.hex, keyId = base.requestedSigner.keyId) {
  return solanaSignFixture(messageHex, seedFor(keyId))
}

/**
 * Every refusal here must precede any use of the protected key. Preparation has
 * no vault key at all; these spies additionally watch both protected signers
 * (the positive control below shows they observe real calls).
 */
function keyUse() {
  return [vi.spyOn(crypto, "signProtectedEd25519Message"), vi.spyOn(crypto, "signProtectedDigest")]
}

afterEach(() => { resetSignedContextReplayCacheForTests(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("protected Solana signing: structure, signer membership and exact bytes", () => {
  it.each(corpus.solana)("signs exactly the reviewed bytes of $id under the record's own key", async (vector) => {
    const f = await fixture(vector.message.hex, vector.requestedSigner.keyId)
    const prepared = prepareSignRequest(f.request)
    expect(prepared.verified.payload).toEqual({ kind: "message", messageHex: vector.message.hex })
    expect(prepared.verified.display).toBeUndefined()
    expect(prepared.verified.review!.signer.value).toBe(vector.requestedSigner.publicKeyBase58)
    expect(prepared.challenge).toEqual([...sha256(new TextEncoder().encode(signedOperationContextMessage(f.request.context)))])

    const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta)
    const expected = vector.signatures.find((signature) => signature.publicKeyHex === f.publicKey)!
    // Ed25519 is deterministic: the same bytes under the same key give the corpus signature,
    // which was produced independently with OpenSSL.
    expect(result).toEqual({ scheme: "ed25519", signature: expected.signatureHex, recovery_id: null })
    expect(opensslVerifies(f.publicKey, vector.message.hex, result.signature)).toBe(true)
    expect(opensslVerifies(f.publicKey, Buffer.from(sha256(hexToBytes(vector.message.hex))).toString("hex"), result.signature)).toBe(false)
  })

  it.each(corpus.negative.filter((negative) => negative.target === "message"))("refuses malformed message $id before any key use", async (negative) => {
    const vector = corpus.solana.find((candidate) => candidate.id === negative.baseId)!
    const f = await fixture(negative.bytesHex, vector.requestedSigner.keyId)
    const used = keyUse()
    expect(() => prepareSignRequest(f.request)).toThrowError(expect.objectContaining({ code: "invalid_payload", message: expect.stringMatching(/^Solana message cannot be signed \(/) }))
    for (const spy of used) expect(spy).not.toHaveBeenCalled()
  })

  it("names the unsupported version and the packet bound in the refusal", async () => {
    const v1 = await fixture(corpus.negative.find((negative) => negative.id === "v1-unsupported")!.bytesHex)
    expect(() => prepareSignRequest(v1.request)).toThrow(/\(unsupported_version\)/)
    const oversized = await fixture(corpus.negative.find((negative) => negative.id === "message-packet-exceeds-1232")!.bytesHex)
    expect(() => prepareSignRequest(oversized.request)).toThrow(/\(packet_too_large\)/)
    const exact = await fixture(corpus.solana.find((vector) => vector.id === "legacy-signed-packet-exactly-1232")!.message.hex)
    expect(prepareSignRequest(exact.request).verified.payload.kind).toBe("message")
  })

  it.each(corpus.signerChecks)("refuses $id: the record key must be a required signer", async (check) => {
    const vector = corpus.solana.find((candidate) => candidate.id === check.baseId)!
    const key = corpus.keys.find((candidate) => candidate.publicKeyHex === check.expectedSignerHex)!
    const f = await fixture(vector.message.hex, key.id)
    const used = keyUse()
    expect(() => prepareSignRequest(f.request)).toThrow(/\(signer_not_required\)/)
    for (const spy of used) expect(spy).not.toHaveBeenCalled()
  })

  it("keeps the 1 MiB transport cap ahead of parsing, and the packet bound inside it", async () => {
    const f = await fixture()
    const huge = "00".repeat(MAX_EXACT_MESSAGE_BYTES + 1)
    f.request.signingContext = { kind: "solana-transaction-v1", messageHex: huge }
    expect(() => prepareSignRequest(f.request)).toThrow(/1 MiB/)
    // Within the transport cap but far past one packet: bound, signed by the daemon, still refused.
    const big = await fixture("00".repeat(4096))
    expect(() => prepareSignRequest(big.request)).toThrow(/\(packet_too_large\)/)
  })

  it.each(["scheme", "context-kind", "message", "release-message", "release-nested-message", "release-key", "release-name", "release-digest-alias", "release-missing"])(
    "refuses a %s mismatch before any key use, even when the daemon signs it", async (field) => {
      const f = await fixture()
      const other = corpus.solana[4].message.hex
      const release = f.request.context.release!
      if (field === "scheme") f.request.scheme = "ecdsa-secp256k1-der"
      if (field === "context-kind") f.request.signingContext = (await signFixture()).request.signingContext
      if (field === "message") f.request.signingContext = { kind: "solana-transaction-v1", messageHex: other }
      if (field === "release-message") release.messageHex = other
      if (field === "release-nested-message") release.signingContext = { kind: "solana-transaction-v1", messageHex: other }
      if (field === "release-key") release.publicKey = corpus.keys[1].publicKeyHex
      if (field === "release-name") release.name = "ANOTHER_KEY"
      if (field === "release-digest-alias") release.digest = Buffer.from(sha256(hexToBytes(base.message.hex))).toString("hex")
      if (field === "release-missing") delete f.request.context.release
      f.resign()
      const used = keyUse()
      expect(() => prepareSignRequest(f.request)).toThrow()
      for (const spy of used) expect(spy).not.toHaveBeenCalled()
    })

  it("refuses every curve crossing: Ed25519 scheme on a secp256k1 record and the reverse", async () => {
    const secp = await signFixture()
    const solana = await fixture()
    const used = keyUse()
    // A secp256k1 record asked for an Ed25519 Solana signature.
    expect(() => prepareSignRequest({ ...solana.request, material: secp.request.material })).toThrow(/together|signed binding/)
    // An Ed25519 record asked for a digest signature, generic or EVM.
    expect(() => prepareSignRequest({ ...secp.request, material: solana.request.material })).toThrow(/together/)
    expect(() => prepareSignRequest({ ...secp.request, scheme: "ed25519" })).toThrow(/together/)
    for (const spy of used) expect(spy).not.toHaveBeenCalled()
  })

  it("binds the record name through the envelope: a renamed request cannot open the key", async () => {
    // The daemon signs a release for another name, and the request carries that name with the original envelope.
    const f = await fixture()
    f.request.material.name = "RENAMED_KEY"
    f.request.context.release!.name = "RENAMED_KEY"
    f.request.context.display.secrets = [{ name: "RENAMED_KEY", kind: "keypair" }]
    f.resign()
    const signer = vi.spyOn(crypto, "signEd25519Message")
    const prepared = prepareSignRequest(f.request)
    await expect(signPreparedRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow()
    expect(signer).not.toHaveBeenCalled()

    // An envelope sealed under another name, presented under this one.
    const other = await solanaSignFixture(base.message.hex, seedFor(base.requestedSigner.keyId), { name: "OTHER_NAME" })
    const g = await fixture()
    g.request.material.envelope = other.request.material.envelope
    await expect(signPreparedRequest(prepareSignRequest(g.request), g.vmk, g.wrapMeta)).rejects.toThrow()
    expect(signer).not.toHaveBeenCalled()
  })

  it("re-derives what it signs at use: a forged prepared object cannot choose the bytes, key or review", async () => {
    const f = await fixture()
    const prepared = prepareSignRequest(f.request)
    expect(Object.isFrozen(prepared) && Object.isFrozen(prepared.verified) && Object.isFrozen(prepared.request.signingContext)).toBe(true)
    const other = corpus.solana[4]
    const signer = vi.spyOn(crypto, "signEd25519Message")

    // A different payload beside the authentic request.
    const swappedPayload = { ...prepared, verified: { ...prepared.verified, payload: { kind: "message", messageHex: other.message.hex } } } as PreparedSignRequest
    await expect(signPreparedRequest(swappedPayload, f.vmk, f.wrapMeta)).rejects.toMatchObject({ code: "invalid_sign_binding" })
    // A digest payload, to reach the secp256k1 signer.
    const digestPayload = { ...prepared, verified: { payload: { kind: "digest", digest: "11".repeat(32) }, display: "forged" } } as PreparedSignRequest
    await expect(signPreparedRequest(digestPayload, f.vmk, f.wrapMeta)).rejects.toMatchObject({ code: "invalid_sign_binding" })
    // No verified content at all.
    await expect(signPreparedRequest({ request: prepared.request, recordContext: prepared.recordContext } as PreparedSignRequest, f.vmk, f.wrapMeta)).rejects.toMatchObject({ code: "invalid_sign_binding" })
    // A request whose bytes changed after the daemon signed it, with a payload forged to match.
    const changedRequest = structuredClone(prepared.request) as typeof prepared.request
    Object.assign(changedRequest, { signingContext: { kind: "solana-transaction-v1", messageHex: other.message.hex } })
    Object.assign(changedRequest.context.release!, { messageHex: other.message.hex, signingContext: { kind: "solana-transaction-v1", messageHex: other.message.hex } })
    const changed = { ...prepared, request: changedRequest, verified: { ...prepared.verified, payload: { kind: "message", messageHex: other.message.hex } } } as PreparedSignRequest
    await expect(signPreparedRequest(changed, f.vmk, f.wrapMeta)).rejects.toThrow(/signature/)
    expect(signer).not.toHaveBeenCalled()

    // A forged record identity or cached envelope is not an input: the authentic request still signs its own bytes.
    const forgedIdentity = { ...prepared, recordContext: { ...prepared.recordContext, publicKey: corpus.keys[1].publicKeyHex }, unpacked: { ...prepared.unpacked, sealed: {} } } as unknown as PreparedSignRequest
    const result = await signPreparedRequest(forgedIdentity, f.vmk, f.wrapMeta)
    expect(result.signature).toBe(base.signatures[0].signatureHex)
    // The prompt is built from content re-derived at that moment, not from the cache.
    const forgedReview = { ...prepared, verified: { ...prepared.verified, review: { ...prepared.verified.review!, undecoded: true, summary: [] } } } as PreparedSignRequest
    const shown = await verifyPreparedSignRequest(forgedReview, f.vmk, f.wrapMeta)
    expect(shown.review).toEqual(prepared.verified.review)
  })

  it("rechecks the daemon signature, expiry and replay at use, after the approval", async () => {
    const forged = await fixture()
    forged.request.context.display.command = "changed after signing"
    await expect(signPreparedRequest(prepareSignRequest(forged.request), forged.vmk, forged.wrapMeta)).rejects.toThrow(/signature/)

    const replayed = await fixture()
    const prepared = prepareSignRequest(replayed.request)
    expect((await signPreparedRequest(prepared, replayed.vmk, replayed.wrapMeta)).signature).toBe(base.signatures[0].signatureHex)
    await consumeSignedOperationContexts([prepared.request.context])
    await expect(signPreparedRequest(prepared, replayed.vmk, replayed.wrapMeta)).rejects.toThrow(/already used/)

    const expiring = await fixture()
    const waiting = prepareSignRequest(expiring.request)
    vi.useFakeTimers()
    vi.setSystemTime(Date.now() + 120_000)
    await expect(signPreparedRequest(waiting, expiring.vmk, expiring.wrapMeta)).rejects.toThrow(/expired/)
  })

  it("reaches the Ed25519 custody signer exactly once per approval, and never the digest signer", async () => {
    const f = await fixture()
    const [message, digest] = keyUse()
    const result = await signPreparedRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)
    expect(message).toHaveBeenCalledTimes(1)
    expect(message.mock.calls[0][3]).toBe(base.message.hex)
    expect(digest).not.toHaveBeenCalled()
    expect(ed25519.verify(hexToBytes(result.signature), hexToBytes(base.message.hex), hexToBytes(f.publicKey), { zip215: false })).toBe(true)
    // The wrong vault key cannot open the record.
    await expect(signPreparedRequest(prepareSignRequest((await fixture()).request), new Uint8Array(32).fill(0x45), f.wrapMeta)).rejects.toThrow()
  })

  it("takes an immutable snapshot: later changes to the caller's object do not reach the signature", async () => {
    const f = await fixture()
    const prepared = prepareSignRequest(f.request)
    const other = corpus.solana[4].message.hex
    f.request.signingContext = { kind: "solana-transaction-v1", messageHex: other }
    f.request.context.release!.messageHex = other
    expect(parseSignRequest(prepared.request).signingContext).toEqual({ kind: "solana-transaction-v1", messageHex: base.message.hex })
    expect((await signPreparedRequest(prepared, f.vmk, f.wrapMeta)).signature).toBe(base.signatures[0].signatureHex)
  })
})
