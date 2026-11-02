import { afterEach, describe, expect, it, vi } from "vitest"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import { schnorr } from "@noble/curves/secp256k1.js"
import { assertCanonicalJson } from "./canonicalJson"
import { AGENT_OPERATION_DOMAIN, verifySigningContext, type VerifiableSigningContext } from "./signingContext"
import { prepareSignRequest, signPreparedRequest } from "./signRequest"
import { resetSignedContextReplayCacheForTests, signedOperationContextMessage, stableJson, type SignedOperationContext } from "./operationContext"
import { buildWrapMeta, packProtectedRecord, protectRootMetadata, sealProtected, withRootMetadata } from "./vaultCrypto"
import attack from "./fixtures/bip143-agent-op-hit.json"
import fixture from "./fixtures/protected-sign-context.json"
import canonicalFixture from "./fixtures/canonical-json-utf16.json"

function operation(canonicalPreimage: string) {
  return { kind: "avault-agent-operation" as const, digestAlgorithm: "avault-operation-hash-v1" as const, canonicalPreimage, digest: bytesToHex(sha256(new TextEncoder().encode(canonicalPreimage))) }
}

afterEach(() => { resetSignedContextReplayCacheForTests(); vi.useRealTimers() })

describe("domain-separated agent operation", () => {
  it("rejects the concrete feasible-grind Bitcoin BIP143 context", () => {
    // This real ground fixture previously passed SHA256(UTF8(preimage)) and
    // exposed a blind ECDSA transaction-signing channel without Bitcoin review.
    expect(operation(attack.signing_context.canonicalPreimage).digest).toBe(attack.bip143_sighash)
    expect(() => verifySigningContext(attack.signing_context as VerifiableSigningContext)).toThrow(/must start with avault-agent-operation/)
  })
  it.each(["", "arbitrary old operation", "avault-agent-operation:v1", "avault-agent-operation:v1\r\ntext", AGENT_OPERATION_DOMAIN, `${AGENT_OPERATION_DOMAIN} \n`])("rejects unprefixed or empty operation %j", (text) => {
    expect(() => verifySigningContext(operation(text))).toThrow(/canonical preimage/)
  })
  it("hashes the exact prefix plus nonempty text, and displays that full domain", () => {
    const context = operation(`${AGENT_OPERATION_DOMAIN}authorize synthetic operation`)
    expect(verifySigningContext(context).digest).toBe(context.digest)
    expect(verifySigningContext(context).display).toContain(context.canonicalPreimage)
    expect(() => verifySigningContext({ ...context, digest: "00".repeat(32) })).toThrow(/digest does not match/)
  })
})

describe("canonical signed JSON", () => {
  it.each([1.5, NaN, Infinity, -Infinity, 9007199254740992, -9007199254740992, 1e21])("rejects unsafe/fractional/non-finite numeric %s", (number) => {
    expect(() => assertCanonicalJson({ nested: [number] })).toThrow(/safe integers/)
  })
  it.each([1n, undefined, new Date(), new Map(), new Uint8Array(1)])("rejects non-JSON value %s", (value) => {
    expect(() => assertCanonicalJson({ value })).toThrow(/JSON/)
  })
  it.each(["\ud800", "\udc00", "hi\ud800x"])("rejects unpaired UTF16 in values and keys %j", (value) => {
    expect(() => assertCanonicalJson({ value })).toThrow(/UTF-16/)
    expect(() => assertCanonicalJson({ [value]: true })).toThrow(/UTF-16/)
  })
  it("matches the actual Python producer's safe integer boundaries and UTF16 code-unit ordering", () => {
    expect(() => assertCanonicalJson(canonicalFixture.payload)).not.toThrow()
    const canonical = stableJson(canonicalFixture.payload)
    expect(canonical).toBe(canonicalFixture.canonical)
    expect(bytesToHex(sha256(new TextEncoder().encode(canonical)))).toBe(canonicalFixture.sha256)
  })
  it("does not permit unsafe numbers hidden in otherwise verifiable context", () => {
    const context = { ...operation(`${AGENT_OPERATION_DOMAIN}test`), unsafe: 9007199254740992 }
    expect(() => verifySigningContext(context)).toThrow(/safe integers/)
  })
  it("rejects unexpected top-level context keys instead of dropping options", () => {
    const context = { ...operation(`${AGENT_OPERATION_DOMAIN}test`), merkleRoot: "" }
    expect(() => verifySigningContext(context)).toThrow(/unsupported field/)
  })
})

describe("actual Python producer fixture", () => {
  it("verifies exact Python canonical bytes and Ed25519 binding before protected raw signing", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-02T00:00:00Z"))
    const context = structuredClone(fixture.signedContext) as SignedOperationContext
    expect(signedOperationContextMessage(context)).toBe(fixture.canonicalUnsignedContext)
    const vmk = new Uint8Array(32).fill(0x55)
    const privateKey = new Uint8Array(32); privateKey[31] = 1
    const base = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(2), prfSalt: new Uint8Array(32).fill(3) }])
    const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: fixture.daemonKeyId, publicKey: fixture.daemonPublicKey }] } }
    const wrap = withRootMetadata(base, await protectRootMetadata(vmk, rootMetadata, base))
    const record = { name: context.release!.name as string, kind: "keypair" as const, publicKey: fixture.publicKey }
    const request = {
      material: { name: record.name, envelope: packProtectedRecord(await sealProtected(privateKey, vmk, record), wrap, record) },
      scheme: context.release!.scheme, signingContext: context.release!.signingContext, context,
    }
    try {
      const result = await signPreparedRequest(prepareSignRequest(request), vmk, wrap)
      expect(schnorr.verify(hexToBytes(result.signature), hexToBytes(context.release!.digest as string), hexToBytes(fixture.publicKey.slice(2)))).toBe(true)
      const changed = structuredClone(request)
      changed.context.release!.digest = "00".repeat(32)
      expect(() => prepareSignRequest(changed)).toThrow(/signed binding/)
      const forged = structuredClone(request)
      forged.context.signature.value = "00".repeat(64)
      await expect(signPreparedRequest(prepareSignRequest(forged), vmk, wrap)).rejects.toThrow(/signature/)
    } finally { vmk.fill(0); privateKey.fill(0) }
  })
})
