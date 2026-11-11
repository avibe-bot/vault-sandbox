import { describe, expect, it } from "vitest"

import { assertCanonicalJson } from "../canonicalJson"
import vectors from "./fixtures/upstream-rust-vectors.json"
import { parseSolanaMessage, readCompactU16, SOLANA_PACKET_DATA_SIZE, SolanaMessageError } from "./message"

// Bytes and expectations come from the upstream Rust crates (see fixtures/README.md).
// Nothing in the fixture was produced by this parser.

function bytes(hex: string): Uint8Array {
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16))
}

function parse(messageHex: string, publicKeyHex: string) {
  return parseSolanaMessage(bytes(messageHex), bytes(publicKeyHex))
}

/** The rejection code, or "accepted". Any other error is a test failure. */
function outcome(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof SolanaMessageError) return error.code
    throw error
  }
  return "accepted"
}

function expectDeepFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return
  expect(Object.isFrozen(value)).toBe(true)
  Object.values(value).forEach(expectDeepFrozen)
}

const accepted = vectors.accepted
const vector = (id: string) => accepted.find((item) => item.id === id)!

describe("Solana compact-u16", () => {
  it.each(vectors.compactU16.valid)("decodes upstream encoding $hex", ({ hex, value }) => {
    expect(readCompactU16(bytes(hex), 0)).toEqual({ value, length: hex.length / 2 })
    // Only its own bytes are read, wherever it sits.
    expect(readCompactU16(bytes(`aa${hex}ff`), 1)).toEqual({ value, length: hex.length / 2 })
  })

  it.each(vectors.compactU16.invalid)("rejects upstream-invalid encoding '$hex' as $code", ({ hex, code }) => {
    expect(outcome(() => readCompactU16(bytes(hex), 0))).toBe(code)
  })

  it("never reads past a third byte that continues", () => {
    for (const hex of ["808080", "80808001", "808080808001"]) {
      expect(outcome(() => readCompactU16(bytes(hex), 0)), hex).toBe("invalid_compact_u16")
    }
  })
})

describe("Solana message facts", () => {
  it.each(accepted)("describes $id exactly as upstream decodes it", ({ expectedPublicKeyHex, facts }) => {
    expect(parse(facts.messageHex, expectedPublicKeyHex)).toStrictEqual(facts)
  })

  it.each(accepted)("returns frozen JSON-only facts for $id", ({ expectedPublicKeyHex, facts }) => {
    const parsed = parse(facts.messageHex, expectedPublicKeyHex)
    expectDeepFrozen(parsed)
    expect(() => assertCanonicalJson(parsed)).not.toThrow()
    expect(JSON.parse(JSON.stringify(parsed))).toStrictEqual(parsed)
  })

  it("describes the caller's bytes and keeps no reference to them", () => {
    const { expectedPublicKeyHex, facts } = vector("legacy-system-transfer")
    const message = Buffer.from(facts.messageHex, "hex")
    const publicKey = bytes(expectedPublicKeyHex)
    const parsed = parseSolanaMessage(message, publicKey)
    message.fill(0)
    publicKey.fill(0)
    expect(parsed).toStrictEqual(facts)
    expect(parsed.messageHex).toBe(facts.messageHex)
  })

  it("parses one private snapshot of the input", () => {
    const { expectedPublicKeyHex, facts } = vector("legacy-system-transfer")
    // Copying sees the true bytes; any later indexed read through the proxy sees zero.
    const shifting = new Proxy(bytes(facts.messageHex), {
      get(target, property) {
        if (typeof property === "string" && /^\d+$/.test(property)) return 0
        const value = Reflect.get(target, property, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    expect(parseSolanaMessage(shifting, bytes(expectedPublicKeyHex))).toStrictEqual(facts)
  })

  it("reports the first slot when the expected key fills two required-signer slots", () => {
    const { expectedPublicKeyHex, facts } = vector("legacy-repeated-signer-key")
    const parsed = parse(facts.messageHex, expectedPublicKeyHex)
    const signers = parsed.staticAccountKeys.filter((account) => account.signer)
    expect(signers.map((account) => account.address)).toEqual([parsed.expectedSigner.address, parsed.expectedSigner.address])
    expect(parsed.expectedSigner).toMatchObject({ index: 0, isFeePayer: true })
  })

  it("flags undecoded content for any undecoded instruction or address table lookup, and for nothing else", () => {
    for (const { expectedPublicKeyHex, facts } of accepted) {
      const parsed = parse(facts.messageHex, expectedPublicKeyHex)
      const undecoded = parsed.instructions.some((instruction) => instruction.decoded === null)
      expect(parsed.hasUndecodedContent, facts.messageHex).toBe(undecoded || parsed.addressTableLookups.length > 0)
      for (const instruction of parsed.instructions) {
        expect(instruction.decoded === null, facts.messageHex).toBe(instruction.undecodedReason !== null)
      }
    }
  })
})

describe("Solana message rejection", () => {
  it.each(vectors.rejected)("rejects $id as $code", ({ messageHex, expectedPublicKeyHex, code }) => {
    expect(outcome(() => parse(messageHex, expectedPublicKeyHex))).toBe(code)
  })

  it("adds only the packet bound and signer membership to what upstream accepts", () => {
    const beyondUpstream = vectors.rejected.filter(({ upstream }) => upstream.decode === "ok" && upstream.sanitize === "ok")
    expect(beyondUpstream.map(({ code }) => code).sort()).toEqual(["packet_too_large", "signer_not_required", "signer_not_required"])
    const oversize = beyondUpstream.find(({ code }) => code === "packet_too_large")!
    expect(oversize.upstream.transactionLength).toBe(SOLANA_PACKET_DATA_SIZE + 1)
    expect(vector("legacy-packet-1232").facts.transactionLength).toBe(SOLANA_PACKET_DATA_SIZE)
  })

  it("rejects every strict prefix of a valid message as truncated", () => {
    for (const { expectedPublicKeyHex, facts } of accepted) {
      const message = bytes(facts.messageHex)
      const publicKey = bytes(expectedPublicKeyHex)
      for (let length = 0; length < message.length; length += 1) {
        const code = outcome(() => parseSolanaMessage(message.subarray(0, length), publicKey))
        if (code !== "truncated") throw new Error(`${length}-byte prefix of ${facts.messageHex} gave ${code}`)
      }
    }
  })

  it("rejects any byte after a valid message", () => {
    for (const { expectedPublicKeyHex, facts } of accepted) {
      // One more byte no longer fits a packet for the largest vector.
      const expected = facts.transactionLength === SOLANA_PACKET_DATA_SIZE ? "packet_too_large" : "trailing_bytes"
      for (const extra of ["00", "01", "ff"]) {
        expect(outcome(() => parse(facts.messageHex + extra, expectedPublicKeyHex)), facts.messageHex).toBe(expected)
      }
    }
  })

  it("supports no versioned message other than v0", () => {
    const { expectedPublicKeyHex, facts } = vector("v0-two-lookup-tables")
    expect(facts.messageHex.startsWith("80")).toBe(true)
    for (let prefix = 0x81; prefix <= 0xff; prefix += 1) {
      const message = prefix.toString(16) + facts.messageHex.slice(2)
      expect(outcome(() => parse(message, expectedPublicKeyHex)), `prefix ${prefix}`).toBe("unsupported_version")
    }
  })

  it("rejects arguments that are not message bytes and a 32-byte key", () => {
    const { expectedPublicKeyHex, facts } = vector("legacy-system-transfer")
    const message = bytes(facts.messageHex)
    const publicKey = bytes(expectedPublicKeyHex)
    expect(outcome(() => parseSolanaMessage(facts.messageHex as unknown as Uint8Array, publicKey))).toBe("invalid_input")
    expect(outcome(() => parseSolanaMessage(Array.from(message) as unknown as Uint8Array, publicKey))).toBe("invalid_input")
    expect(outcome(() => parseSolanaMessage(message, expectedPublicKeyHex as unknown as Uint8Array))).toBe("invalid_input")
    expect(outcome(() => parseSolanaMessage(message, publicKey.subarray(0, 31)))).toBe("invalid_input")
    expect(outcome(() => parseSolanaMessage(message, new Uint8Array(33)))).toBe("invalid_input")
    expect(outcome(() => parseSolanaMessage(new Uint8Array(SOLANA_PACKET_DATA_SIZE), publicKey))).toBe("packet_too_large")
  })
})
