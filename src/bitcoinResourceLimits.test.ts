import { describe, expect, it, vi } from "vitest"
import { assertBitcoinContextLimits, assertBitcoinPromptLimits, assertBitcoinSignRequestLimits } from "./bitcoinResourceLimits"
import { parseSignRequest } from "./signRequest"

function context(proof = "00") {
  return { kind: "bitcoin-p2pkh-v1", unsignedTransaction: "00", prevout: { parentTransaction: proof } }
}
function rpc(c: ReturnType<typeof context> = context()) {
  return { material: { name: "PUBLIC_TEST", envelope: { ciphertext: "AA==", nonce: "AA==", wrap_meta: "{}" } }, scheme: "ecdsa-secp256k1-der", signingContext: c, context: { release: { signingContext: structuredClone(c) } } }
}

describe("NEW-kind preflight before canonical walking/cloning", () => {
  it("accepts two inclusive max proof copies without building canonical/encoded copies", () => {
    const c = context("00".repeat(1_048_576))
    expect(() => assertBitcoinContextLimits(c)).not.toThrow()
    expect(() => assertBitcoinSignRequestLimits(rpc(c))).not.toThrow()
  })
  it.each(["direct", "nested", "malformed-kind", "native"])("bounds oversized %s copy before structuredClone", (location) => {
    const source = rpc()
    const oversized = "00".repeat(1_048_577)
    if (location === "nested") source.context.release.signingContext.prevout.parentTransaction = oversized
    else source.signingContext.prevout.parentTransaction = oversized
    if (location === "malformed-kind") source.signingContext.kind = "unknown"
    if (location === "native") source.signingContext.kind = "bitcoin-p2wpkh-v1"
    const spy = vi.spyOn(globalThis, "structuredClone")
    try {
      expect(() => parseSignRequest(source)).toThrow(/parentTransaction.*size/)
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
  it("still bounds a proof when the discriminator is missing or invalid and bounds both effective copies", () => {
    const source = rpc()
    delete (source.signingContext as Partial<typeof source.signingContext>).kind
    source.context.release.signingContext.kind = "unknown"
    source.context.release.signingContext.prevout.parentTransaction = "a".repeat(2_097_153)
    expect(() => assertBitcoinSignRequestLimits(source)).toThrow(/size/)
  })
  it.each(["0", "FF", "0x00", "00 ", "\ud8000"])("rejects odd/nonlowercase proof without generic traversal", (proof) => {
    expect(() => assertBitcoinSignRequestLimits(rpc(context(proof)))).toThrow()
  })
  it("rejects unrecognized embedded proof copies and multiple direct aliases", () => {
    const source = rpc()
    Object.assign(source, { signing_context: source.signingContext })
    expect(() => assertBitcoinSignRequestLimits(source)).toThrow(/aliases/)
    const duplicate = rpc()
    Object.assign(duplicate, { extra: { prevout: { parentTransaction: "00" } } })
    expect(() => assertBitcoinSignRequestLimits(duplicate)).toThrow(/embedded proof/)
  })
  it("refuses material string cap, canonical non-proof bytes, and Native context cap", () => {
    const source = rpc()
    source.material.envelope.ciphertext = "a".repeat(262_145)
    expect(() => assertBitcoinSignRequestLimits(source)).toThrow(/envelope string/)
    source.material.envelope.ciphertext = "é".repeat(262_144)
    expect(() => assertBitcoinSignRequestLimits(source)).toThrow(/byte budget/)
    const native = { kind: "bitcoin-p2wpkh-v1", memo: "a".repeat(4096) }
    expect(() => assertBitcoinContextLimits(native)).toThrow(/byte budget/)
  })
  it("bounds every material envelope string before cloning, including a later-rejected field", () => {
    const source = rpc()
    Object.assign(source.material.envelope, { unknown: "a".repeat(262_145) })
    const clone = vi.spyOn(globalThis, "structuredClone")
    try {
      expect(() => parseSignRequest(source)).toThrow(/envelope string/)
      expect(clone).not.toHaveBeenCalled()
    } finally { clone.mockRestore() }
  })
  it("enforces depth/nodes/fields/arrays iteratively", () => {
    for (const extra of [
      { fields: Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`k${i}`, 0])) },
      { entries: Array.from({ length: 2049 }, () => 0) },
      { nodes: [Array.from({ length: 2048 }, () => 0), Array.from({ length: 2048 }, () => 0)] },
    ]) expect(() => assertBitcoinSignRequestLimits(Object.assign(rpc(), extra))).toThrow(/budget|size/)
    let deep: unknown = null
    for (let i = 0; i < 17; i++) deep = { child: deep }
    expect(() => assertBitcoinSignRequestLimits(Object.assign(rpc(), { deep }))).toThrow(/depth/)
  })
  it("rejects cycles, nonplain objects, unsafe numbers, invalid Unicode and accessors WITHOUT invocation", () => {
    const cyclic: Record<string, unknown> = {}; cyclic.child = cyclic
    for (const extra of [cyclic, new Date(), 0.5, Number.MAX_SAFE_INTEGER + 1, "\ud800", "\udc00"]) {
      expect(() => assertBitcoinSignRequestLimits(Object.assign(rpc(), { extra }))).toThrow()
    }
    const source = rpc()
    const getter = vi.fn(() => "00")
    Object.defineProperty(source.signingContext.prevout, "parentTransaction", { get: getter, enumerable: true })
    expect(() => assertBitcoinSignRequestLimits(source)).toThrow()
    expect(getter).not.toHaveBeenCalled()
  })
  it("does not apply new budgets/precedence to old unrelated contexts", () => {
    const old = { signingContext: { kind: "avault-agent-operation", operation: "a".repeat(524_289) } }
    expect(() => assertBitcoinSignRequestLimits(old)).not.toThrow()
  })
})

describe("paired authorization prompt preflight for NEW Bitcoin reviews", () => {
  function prompt(proof: string, extraFields: unknown[] = []) {
    return {
      title: { key: "confirm.signTitle" }, subtitle: { key: "confirm.signSubtitle" }, label: { key: "confirm.sign" }, challenge: "AA==",
      review: {
        kind: "review.kind.bitcoinLegacyTransfer", undecoded: false, signer: { label: "review.field.signingAddress", value: "1A" }, summary: [],
        details: [{ title: "review.group.exact", fields: [{ label: "review.field.parentTransaction", value: proof, raw: true }, ...extraFields] }],
      },
    }
  }
  it("accepts ONE complete inclusive-max proof without dropping any JSON values", () => {
    expect(() => assertBitcoinPromptLimits(prompt("00".repeat(1_048_576)))).not.toThrow()
  })
  it("rejects non-JSON values in requests and prompts instead of silently omitting them", () => {
    for (const value of [undefined, () => 0, Symbol("not-json"), 1n]) {
      expect(() => assertBitcoinSignRequestLimits(Object.assign(rpc(), { extra: value }))).toThrow(/JSON/)
      expect(() => assertBitcoinPromptLimits(Object.assign(prompt("00"), { extra: value }))).toThrow(/JSON/)
      const nested = prompt("00")
      Object.assign(nested.subtitle, { params: { omitted: value } })
      expect(() => assertBitcoinPromptLimits(nested)).toThrow(/JSON/)
    }
  })
  it("refuses a second proof copy, an oversized proof, other facts over 512 KiB, and malformed proof", () => {
    expect(() => assertBitcoinPromptLimits(prompt("00", [{ label: "review.field.parentTransaction", value: "00" }]))).toThrow(/proof-copy/)
    expect(() => assertBitcoinPromptLimits(prompt("00".repeat(1_048_577)))).toThrow(/size/)
    expect(() => assertBitcoinPromptLimits(prompt("00", [{ label: "review.field.digest", value: "a".repeat(524_289) }]))).toThrow(/budget|size/)
    expect(() => assertBitcoinPromptLimits(prompt("0G"))).toThrow(/lowercase/)
  })
  it("leaves every existing prompt kind on its existing path", () => {
    const old = prompt("zz".repeat(1_048_577))
    old.review.kind = "review.kind.bitcoinTransfer"
    expect(() => assertBitcoinPromptLimits(old)).not.toThrow()
    expect(() => assertBitcoinPromptLimits({ title: "x" })).not.toThrow()
  })
})
