import { afterEach, describe, expect, it, vi } from "vitest"
import { hasHdRecordMetadata } from "./protectedHdRaw"
import { unpackProtectedRecord } from "./vaultCrypto"

afterEach(() => vi.restoreAllMocks())

describe("HD-only bounded raw-wrap dispatch", () => {
  it.each([
    ['{"record_meta":{"kind":"hd-seed"}}', true],
    ['{"\\u0072ecord_meta":{"\\u006bind":"\\u0068d-seed"}}', true],
    ['{"record_meta":{"kind":"static","kind":"hd-seed"}}', true],
    ['{"record_meta":{"kind":"hd-seed","kind":"static"}}', false],
    ['{"record_meta":{"kind":"static"},"record_meta":{"kind":"hd-seed"}}', true],
    ['{"record_meta":{"kind":"hd-seed"},"record_meta":{"kind":"static"}}', false],
    ['{"record_meta":{"kind":"hd-seed"},"record_meta":null}', false],
    ['{"other":{"record_meta":{"kind":"hd-seed"}},"record_meta":{"kind":"static"}}', false],
    ['{"other":"record_meta: hd-seed","record_meta":[{"kind":"hd-seed"}]}', false],
    ['{"other":[{"escaped":"\\\"},]\\\\"}],"record_meta":{"kind":"hd-seed"}}', true],
    ['{"record_meta":{"kind":"hd-seed","nested":{"kind":"static"}}}', true],
    ['{"record_meta":{"kind":{"nested":"hd-seed"}}}', false],
  ] as const)("classifies only effective top-level fields: %s", (raw, expected) => {
    expect(hasHdRecordMetadata(raw)).toBe(expected)
    expect((JSON.parse(raw) as { record_meta?: { kind?: string } }).record_meta?.kind === "hd-seed").toBe(expected)
  })

  it("agrees with JSON last-member semantics while skipping bounded public combinations", () => {
    const values = [null, true, 0.25, "text \\\u2603", [], { kind: "static" }, { kind: "hd-seed" }]
    for (const first of values) for (const last of values) {
      const raw = `{"other":[${JSON.stringify(first)}],"record_meta":${JSON.stringify(first)},"record_meta":${JSON.stringify(last)}}`
      const parsed = JSON.parse(raw) as { record_meta?: { kind?: string } | null }
      expect(hasHdRecordMetadata(raw)).toBe(parsed.record_meta?.kind === "hd-seed")
    }
  })

  it("rejects an oversized HD wrap before allocating any native parsed tree, even with escaped discriminator keys", () => {
    const raw = `{"v":1,"copies":[],"extension":"${"x".repeat(65_536)}","\\u0072ecord_meta":{"kind":"\\u0068d-seed"}}`
    const parse = vi.spyOn(JSON, "parse")
    expect(() => unpackProtectedRecord({ ciphertext: "public", nonce: "public", wrap_meta: raw })).toThrow(/size\/type/)
    expect(parse).not.toHaveBeenCalled()
  })

  it("preserves the legacy parser for large unknown extensions and last-wins non-HD metadata", () => {
    const raw = `{"v":1,"copies":[],"extension":"${"hd-seed".repeat(10_000)}","record_meta":{"kind":"hd-seed"},"record_meta":{"kind":"static"},"dek_nonce":"public","wrapped_dek":"public"}`
    const unpacked = unpackProtectedRecord({ ciphertext: "public", nonce: "public", wrap_meta: raw })
    expect(unpacked.recordMetadata).toEqual({ kind: "static" })
    expect(JSON.parse(unpacked.vmkWrapMeta).extension).toHaveLength(70_000)
  })

  it.each(["", "null", "[]", '{"record_meta":', '{"record_meta":{"kind":', '{"other":[', '{"other":"\\'])
    ("terminates on malformed input without claiming validation: %s", (raw) => {
      expect(typeof hasHdRecordMetadata(raw)).toBe("boolean")
    })
})
