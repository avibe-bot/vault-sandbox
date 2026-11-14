import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { assertRevealBinding, parseRevealRequest, revealEnvelopeHash } from "./revealRequest"
import type { SignedOperationContext } from "./operationContext"

function fixture() {
  const envelope = { ciphertext: "PUBLIC-ciphertext", nonce: "PUBLIC-nonce", wrap_meta: '{"用户":"🚀","copies":[],"v":1}' }
  const context: SignedOperationContext = {
    v: 2, purpose: "reveal", requestId: "public-reveal",
    display: { secrets: [{ name: "PUBLIC_LOGIN.password", kind: "static" }] },
    release: { name: "PUBLIC_LOGIN.password", envelopeHash: { alg: "sha256", digest: revealEnvelopeHash(envelope) } },
    expiresAt: "2099-01-01T00:00:00Z", signature: { alg: "ed25519", keyId: "public", value: "public" },
  }
  return { material: { name: "PUBLIC_LOGIN.password", envelope }, context }
}

describe("reveal exact envelope binding", () => {
  it("matches the producer canonical object convention with raw Unicode wrap string", () => {
    const f = fixture()
    const canonical = JSON.stringify({ ciphertext: f.material.envelope.ciphertext, nonce: f.material.envelope.nonce, wrap_meta: f.material.envelope.wrap_meta })
    const independent = createHash("sha256").update(canonical, "utf8").digest("hex")
    expect(revealEnvelopeHash(f.material.envelope)).toBe(independent)
    expect(revealEnvelopeHash({ wrap_meta: f.material.envelope.wrap_meta, nonce: f.material.envelope.nonce, ciphertext: f.material.envelope.ciphertext })).toBe(independent)
    expect(() => parseRevealRequest(f)).not.toThrow()
    const arrayHash = createHash("sha256").update(JSON.stringify(Object.values(f.material.envelope))).digest("hex")
    expect(independent).not.toBe(arrayHash)
  })
  it.each(["ciphertext", "nonce", "wrap_meta"] as const)("refuses a substituted %s, including same-name old material", (field) => {
    const f = fixture()
    f.material.envelope[field] += "old"
    expect(() => parseRevealRequest(f)).toThrow(/does not bind/)
  })
  it("does not parse/reserialize a raw wrap string for hashing", () => {
    const f = fixture()
    const original = f.material.envelope.wrap_meta
    f.material.envelope.wrap_meta = JSON.stringify({ v: 1, copies: [], 用户: "🚀" })
    expect(JSON.parse(f.material.envelope.wrap_meta)).toEqual(JSON.parse(original))
    expect(() => parseRevealRequest(f)).toThrow(/does not bind/)
  })
  it.each([
    undefined, null, {}, { alg: "sha512", digest: "ab".repeat(32) },
    { alg: "sha256", digest: "AB".repeat(32) }, { alg: "sha256", digest: "ab" },
    { alg: "sha256", digest: "ab".repeat(32), extra: true },
  ])("refuses absent/malformed hash %j", (hash) => {
    const f = fixture()
    f.context.release!.envelopeHash = hash
    // Undefined is not a JSON wire value; controlled refusal still applies.
    expect(() => parseRevealRequest(f)).toThrow()
  })
  it("refuses a changed release name or missing release", () => {
    const f = fixture()
    f.context.release!.name = "OTHER"
    expect(() => parseRevealRequest(f)).toThrow(/does not bind/)
    delete f.context.release
    expect(() => parseRevealRequest(f)).toThrow(/does not bind/)
  })
  it("owns a deeply frozen snapshot throughout asynchronous confirmation", () => {
    const caller = fixture()
    const captured = parseRevealRequest(caller)
    caller.material.envelope.ciphertext = "substitution"
    caller.context.release!.name = "OTHER"
    expect(captured.material.envelope.ciphertext).toBe("PUBLIC-ciphertext")
    expect(() => assertRevealBinding(captured)).not.toThrow()
    expect(() => { captured.material.envelope.ciphertext = "late" }).toThrow()
    expect(Object.isFrozen(captured.context.release!.envelopeHash)).toBe(true)
  })
})
