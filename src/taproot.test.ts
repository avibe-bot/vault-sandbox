import { afterEach, describe, expect, it, vi } from "vitest"
import { secp256k1, schnorr } from "@noble/curves/secp256k1.js"
import { hexToBytes, bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import bip340 from "./fixtures/bip340.csv?raw"
import bip341 from "./fixtures/bip341.json"
import bip86 from "./fixtures/bip86.json"
import {
  buildWrapMeta, deriveSigningAddresses, newVmk, packProtectedRecord,
  protectedRecordContextFromMetadata, sealProtected, signDigest, signProtectedDigest,
  unpackProtectedRecord, unwrapVmk,
  SIGN_SCHEME_SCHNORR_SECP256K1_BIP340 as RAW,
  SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH as TAP,
} from "./vaultCrypto"

// Unfrozen wrappers ONLY in tests allow impossible public-hash/fault cases.
vi.mock("@noble/curves/secp256k1.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@noble/curves/secp256k1.js")>()
  return { ...actual, schnorr: { ...actual.schnorr, utils: { ...actual.schnorr.utils } } }
})

const N = secp256k1.Point.Fn.ORDER
const scalarBytes = (n: bigint) => hexToBytes(n.toString(16).padStart(64, "0"))
const aux = new Uint8Array(32)
const msg = new Uint8Array(32).fill(0x42)

// Independent public-key oracle: explicit BIP341 tagged hash, not production helper.
function outputFor(key: Uint8Array) {
  const internal = secp256k1.getPublicKey(key).slice(1)
  const tag = sha256(new TextEncoder().encode("TapTweak"))
  const tweak = BigInt(`0x${bytesToHex(sha256(new Uint8Array([...tag, ...tag, ...internal])))}`)
  return secp256k1.Point.fromBytes(new Uint8Array([2, ...internal])).add(secp256k1.Point.BASE.multiply(tweak))
}

function witnessProgram(address: string): Uint8Array {
  const alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
  const words = [...address.slice(address.lastIndexOf("1") + 2, -6)].map((c) => alphabet.indexOf(c))
  let acc = 0, bits = 0
  const bytes: number[] = []
  for (const word of words) {
    acc = (acc << 5) | word
    bits += 5
    if (bits >= 8) { bits -= 8; bytes.push((acc >>> bits) & 255) }
  }
  return new Uint8Array(bytes)
}

afterEach(() => vi.restoreAllMocks())

describe("published BIP340 and public BIP341/86 vectors", () => {
  for (const line of bip340.trim().split(/\r?\n/).slice(1)) {
    const [index, secret, publicKey, randomness, message, signature, valid] = line.split(",")
    it(`BIP340 vector ${index}: verification and fixed-digest signing`, () => {
      expect(schnorr.verify(hexToBytes(signature), hexToBytes(message), hexToBytes(publicKey))).toBe(valid === "TRUE")
      if (secret && message.length === 64) {
        const result = signDigest(secret, message, RAW, { schnorrAuxRand: randomness })
        expect(result.signature).toBe(signature.toLowerCase())
        expect(result.recovery_id).toBeNull()
      }
    })
  }

  it.each(bip341.scriptPubKey.filter((v) => v.given.scriptTree === null))("BIP341 address stays byte-exact for either input parity", (vector) => {
    for (const prefix of ["02", "03"]) {
      const address = deriveSigningAddresses(prefix + vector.given.internalPubkey).btc_taproot!
      expect(address).toBe(vector.expected.bip350Address)
      expect(bytesToHex(witnessProgram(address))).toBe(vector.intermediary.tweakedPubkey)
    }
  })

  it.each(bip86)("BIP86 public output and address $address", (vector) => {
    const key = hexToBytes(vector.privateKey)
    expect(bytesToHex(schnorr.getPublicKey(key))).toBe(vector.internalKey)
    const publicKey = bytesToHex(secp256k1.getPublicKey(key))
    expect(bytesToHex(outputFor(key).toBytes(true).slice(1))).toBe(vector.outputKey)
    const address = deriveSigningAddresses(publicKey).btc_taproot!
    expect(address).toBe(vector.address)
    expect(bytesToHex(witnessProgram(address))).toBe(vector.outputKey)
    // A raw BIP340 signature is NOT a signature for the displayed Taproot key.
    const signature = hexToBytes(signDigest(key, msg, RAW, { schnorrAuxRand: aux }).signature)
    expect(schnorr.verify(signature, msg, hexToBytes(vector.internalKey))).toBe(true)
    expect(schnorr.verify(signature, msg, hexToBytes(vector.outputKey))).toBe(false)
  })

  it("covers all four input/output parity cases in public address derivation", () => {
    const seen = new Set<string>()
    for (let n = 1n; n <= 12n; n++) {
      const key = scalarBytes(n)
      const output = outputFor(key)
      const pub = secp256k1.getPublicKey(key)
      seen.add(`${pub[0]}:${output.toBytes(true)[0]}`)
      const address = deriveSigningAddresses(bytesToHex(pub)).btc_taproot!
      expect(witnessProgram(address)).toEqual(output.toBytes(true).slice(1))
      expect(deriveSigningAddresses(bytesToHex(secp256k1.getPublicKey(scalarBytes(N - n)))).btc_taproot).toBe(address)
    }
    expect(seen.size).toBe(4)
  })

  it("accepts a valid zero public tweak", () => {
    vi.spyOn(schnorr.utils, "taggedHash").mockReturnValue(new Uint8Array(32))
    const key = scalarBytes(6n)
    expect(witnessProgram(deriveSigningAddresses(bytesToHex(secp256k1.getPublicKey(key))).btc_taproot!)).toEqual(schnorr.getPublicKey(key))
  })
  it.each([N, N + 1n, (1n << 256n) - 1n])("rejects out-of-range public tweak %s, not reduction mod n", (tweak) => {
    vi.spyOn(schnorr.utils, "taggedHash").mockReturnValue(scalarBytes(tweak))
    expect(() => deriveSigningAddresses(bytesToHex(secp256k1.getPublicKey(scalarBytes(1n))))).toThrow(/tweak/)
  })
  it("rejects public point at infinity", () => {
    vi.spyOn(schnorr.utils, "taggedHash").mockReturnValue(scalarBytes(N - 1n))
    expect(() => deriveSigningAddresses(bytesToHex(secp256k1.getPublicKey(scalarBytes(1n))))).toThrow(/taproot output key/)
  })
})

describe("supported signing validation and secret lifetime", () => {
  it("signs a BIP86 key-path digest with the tweaked output key", () => {
    const key = scalarBytes(1n)
    const signature = hexToBytes(signDigest(key, msg, TAP, { schnorrAuxRand: aux }).signature)
    expect(schnorr.verify(signature, msg, outputFor(key).toBytes(true).slice(1))).toBe(true)
  })
  it.each([0n, N, N + 1n])("rejects invalid original scalar %s", (n) => {
    expect(() => signDigest(scalarBytes(n), msg, RAW)).toThrow(/private key/)
  })
  it.each(["", "00", "00".repeat(31), "00".repeat(33), "gg".repeat(32)])("rejects invalid digest %s", (digest) => {
    expect(() => signDigest(scalarBytes(1n), digest, RAW)).toThrow()
  })
  it.each(["", "00", "00".repeat(31), "00".repeat(33)])("rejects malformed auxiliary randomness %s", (randomness) => {
    expect(() => signDigest(scalarBytes(1n), msg, RAW, { schnorrAuxRand: randomness })).toThrow()
  })
  it.each([{ merkleRoot: "" }, { merkle_root: "00".repeat(32) }, { scriptTree: null }, { tweak: 0 }])("rejects unsupported signing option %j", (options) => {
    expect(() => signDigest(scalarBytes(1n), msg, RAW, options as never)).toThrow(/unsupported signing option/)
  })
  it("wipes Taproot tweaked key and aux buffers on signing failure", () => {
    const key = scalarBytes(6n)
    const randomness = new Uint8Array(32).fill(23)
    const captured: Uint8Array[] = []
    vi.spyOn(schnorr, "sign").mockImplementation((_message, secret, random) => {
      captured.push(secret, random!)
      throw new Error("injected taproot failure")
    })
    expect(() => signDigest(key, msg, TAP, { schnorrAuxRand: randomness })).toThrow(/failure/)
    expect(captured).toHaveLength(2)
    for (const buffer of captured) expect(buffer).toEqual(new Uint8Array(32))
    expect(key).toEqual(scalarBytes(6n))
    expect(randomness).toEqual(new Uint8Array(32).fill(23))
  })
  it.each([false, true])("wipes owned key and aux buffers on %s failure without mutating caller input", (throwFromSigner) => {
    const key = scalarBytes(3n)
    const randomness = new Uint8Array(32).fill(19)
    const captured: Uint8Array[] = []
    vi.spyOn(schnorr, "sign").mockImplementation((_msg, secret, random) => {
      captured.push(secret, random!)
      if (throwFromSigner) throw new Error("injected sign failure")
      return new Uint8Array(64)
    })
    expect(() => signDigest(key, msg, RAW, { schnorrAuxRand: randomness })).toThrow(/failure|verification/)
    expect(captured).toHaveLength(2)
    for (const buffer of captured) expect(buffer).toEqual(new Uint8Array(32))
    expect(key).toEqual(scalarBytes(3n))
    expect(randomness).toEqual(new Uint8Array(32).fill(19))
  })
  it.each(["ecdsa-secp256k1-der", "ecdsa-secp256k1-recoverable"] as const)("preserves %s real verification", (scheme) => {
    const key = scalarBytes(1n)
    const result = signDigest(key, msg, scheme)
    expect(secp256k1.verify(hexToBytes(result.signature), msg, secp256k1.getPublicKey(key), {
      prehash: false, lowS: true, format: scheme.endsWith("-der") ? "der" : "compact",
    })).toBe(true)
  })
})

describe("protected raw signing envelope", () => {
  it("signs the official BIP340 witness after passkey-factor unwrap and authenticates key metadata", async () => {
    const [_index, secret, _publicKey, randomness, message, signature] = bip340.trim().split(/\r?\n/)[1].split(",")
    const key = hexToBytes(secret)
    const vmk = newVmk()
    const factor = { kind: "passkey" as const, prfOutput: new Uint8Array(32).fill(0x23), prfSalt: new Uint8Array(32).fill(0x45) }
    const meta = { name: "PUBLIC_TEST_KEY", kind: "keypair" as const, publicKey: bytesToHex(secp256k1.getPublicKey(key)) }
    const wrap = await buildWrapMeta(vmk, [factor])
    const envelope = packProtectedRecord(await sealProtected(key, vmk, meta), wrap, meta)
    const unpacked = unpackProtectedRecord(envelope)
    const unwrapped = await unwrapVmk(unpacked.vmkWrapMeta, factor)
    const context = protectedRecordContextFromMetadata(meta.name, unpacked.recordMetadata)
    try {
      const result = await signProtectedDigest(unpacked.sealed, unwrapped, context, message, RAW, { schnorrAuxRand: randomness })
      expect(result.signature).toBe(signature.toLowerCase())
      expect(Object.keys(result).sort()).toEqual(["recovery_id", "scheme", "signature"])
      expect(schnorr.verify(hexToBytes(result.signature), hexToBytes(message), schnorr.getPublicKey(key))).toBe(true)
      await expect(signProtectedDigest(unpacked.sealed, unwrapped, { ...context, name: "SWAPPED" }, msg, RAW)).rejects.toThrow()
      await expect(signProtectedDigest(unpacked.sealed, unwrapped, { ...context, publicKey: bytesToHex(secp256k1.getPublicKey(scalarBytes(2n))) }, msg, RAW)).rejects.toThrow()
      const wrongMeta = { ...meta, publicKey: bytesToHex(secp256k1.getPublicKey(scalarBytes(2n))) }
      const wrong = await sealProtected(key, vmk, wrongMeta)
      await expect(signProtectedDigest(wrong, vmk, wrongMeta, msg, RAW)).rejects.toThrow(/does not match/)
    } finally { key.fill(0); vmk.fill(0); unwrapped.fill(0) }
  })
})
