import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { keccak256, serializeTransaction } from "viem"
import corpus from "./corpus.json"

const fromHex = (hex: string) => Buffer.from(hex.replace(/^0x/, ""), "hex")
const hash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex")

// Observable contract: corpus bytes and independent crypto expectations must
// agree before any production consumer uses them. This catches stale/manual
// fixture edits or signing a message hash instead of exact Solana message bytes.
// These are corpus-integrity tests, NOT production parser/RPC acceptance tests.
describe("independently produced public acceptance corpus integrity", () => {
  it("pins the independent generator and complete generator-only dependency lock", () => {
    expect(corpus.publicFixturesOnly).toBe(true)
    expect(hash(readFileSync(new URL("./generate.mjs", import.meta.url)))).toBe(corpus.provenance.generatorSha256)
    expect(hash(readFileSync(new URL("./package-lock.json", import.meta.url)))).toBe(corpus.provenance.dependencyLockSha256)
    const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> }
    expect(manifest.dependencies).toEqual({ "@solana/web3.js": "1.98.4", "@solana/spl-token": "0.4.14", ethers: "6.15.0" })
    expect(corpus.provenance.expectedSemantics).toContain("never production parser output")
  })

  it("anchors published RFC8032 seed/public-key pairs with a second implementation", () => {
    expect(corpus.keys).toHaveLength(2)
    for (const key of corpus.keys) {
      expect(Buffer.from(ed25519.getPublicKey(fromHex(key.seedHex))).toString("hex")).toBe(key.publicKeyHex)
    }
    // RFC8032 section 7.1 TEST1, empty message: independent immutable anchor.
    expect(Buffer.from(ed25519.sign(new Uint8Array(), fromHex(corpus.keys[0].seedHex))).toString("hex")).toBe(
      "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    )
  })

  it.each(corpus.solana)("verifies native OpenSSL signatures over exact SDK message $id using noble", (vector) => {
    const message = fromHex(vector.message.hex)
    expect(Buffer.from(vector.message.base64, "base64")).toEqual(message)
    expect(message.length).toBe(vector.message.byteLength)
    expect(hash(message)).toBe(vector.message.sha256)
    const unsigned = fromHex(vector.transaction.unsignedHex)
    const signed = fromHex(vector.transaction.signedHex)
    expect(Buffer.from(vector.transaction.unsignedBase64, "base64")).toEqual(unsigned)
    expect(Buffer.from(vector.transaction.signedBase64, "base64")).toEqual(signed)
    expect(unsigned[0]).toBe(vector.expected.header.numRequiredSignatures)
    expect(vector.signatures.length).toBe(vector.expected.header.numRequiredSignatures)
    expect(vector.expected.requiredSigners).toContain(vector.requestedSigner.publicKeyBase58)
    expect(vector.expected.staticAccountKeys[0]).toBe(vector.expected.feePayer)
    expect(vector.transaction.messageOffset).toBe(1 + vector.signatures.length * 64)
    expect(unsigned.subarray(vector.transaction.messageOffset)).toEqual(message)
    expect(signed.subarray(vector.transaction.messageOffset)).toEqual(message)
    expect(unsigned.subarray(1, vector.transaction.messageOffset)).toEqual(Buffer.alloc(vector.signatures.length * 64))
    for (const [index, signature] of vector.signatures.entries()) {
      const sig = fromHex(signature.signatureHex)
      const pubkey = fromHex(signature.publicKeyHex)
      const key = corpus.keys.find(key => key.id === signature.keyId)!
      expect(sig).toHaveLength(64)
      expect(pubkey).toHaveLength(32)
      expect(Buffer.from(signature.signatureBase64, "base64")).toEqual(sig)
      expect(signed.subarray(1 + index * 64, 1 + (index + 1) * 64)).toEqual(sig)
      expect(ed25519.verify(sig, message, pubkey)).toBe(true)
      expect(Buffer.from(ed25519.sign(message, fromHex(key.seedHex)))).toEqual(sig)
      expect(ed25519.verify(sig, fromHex(vector.message.sha256), pubkey)).toBe(false)
      const changed = Buffer.from(message)
      changed[changed.length - 1] ^= 1
      expect(ed25519.verify(sig, changed, pubkey)).toBe(false)
      const wrongKey = corpus.keys.find(key => key.id !== signature.keyId)!
      expect(ed25519.verify(sig, message, fromHex(wrongKey.publicKeyHex))).toBe(false)
    }
    if (vector.version === "v0") expect(message[0]).toBe(0x80)
    else expect(message[0] & 0x80).toBe(0)
  })

  it("independently reads supported raw amounts, encoded decimals and mint presence from instruction bytes", () => {
    for (const vector of corpus.solana) {
      for (const instruction of vector.expected.instructions) {
        const data = fromHex(instruction.dataHex)
        const decoded = instruction.decoded
        if (decoded.kind === "system-transfer") {
          if (!("lamports" in decoded)) throw new Error("Malformed system transfer fixture")
          expect(instruction.programId).toBe(corpus.programIds.system)
          expect(data.length).toBe(12)
          expect(data.readUInt32LE()).toBe(2)
          expect(data.readBigUInt64LE(4).toString()).toBe(decoded.lamports)
          expect(instruction.accountAddressesFromConstruction.slice(0, 2)).toEqual([decoded.source, decoded.destination])
        } else if (decoded.kind === "spl-transfer") {
          if (!("amount" in decoded)) throw new Error("Malformed SPL transfer fixture")
          expect(instruction.programId).toBe(corpus.programIds.splToken)
          expect(data.length).toBe(9)
          expect(data[0]).toBe(3)
          expect(data.readBigUInt64LE(1).toString()).toBe(decoded.amount)
          expect(decoded.mint).toBeNull()
          expect(decoded.decimals).toBeNull()
          expect(instruction.accountAddressesFromConstruction.slice(0, 3)).toEqual([decoded.sourceTokenAccount, decoded.destinationTokenAccount, decoded.authority])
        } else if (decoded.kind === "spl-transfer-checked") {
          if (!("amount" in decoded)) throw new Error("Malformed SPL checked transfer fixture")
          expect(instruction.programId).toBe(corpus.programIds.splToken)
          expect(data.length).toBe(10)
          expect(data[0]).toBe(12)
          expect(data.readBigUInt64LE(1).toString()).toBe(decoded.amount)
          expect(data[9]).toBe(decoded.decimals)
          expect(instruction.accountAddressesFromConstruction.slice(0, 4)).toEqual([decoded.sourceTokenAccount, decoded.mint, decoded.destinationTokenAccount, decoded.authority])
        }
      }
    }
    const differentPayer = corpus.solana.find(vector => vector.id === "legacy-spl-transfer-checked-different-fee-payer")!
    expect(differentPayer.expected.requiredSigners).toHaveLength(2)
    expect(differentPayer.requestedSigner.publicKeyBase58).not.toBe(differentPayer.expected.feePayer)
    const table = corpus.solana.find(vector => vector.id === "v0-unresolved-alt-synthetic-jupiter-shaped")!
    expect(table.expected.addressTableLookups).toHaveLength(1)
    expect(table.expected.addressTableLookups[0].writableIndexes).toEqual([0, 1])
    expect(table.expected.addressTableLookups[0].readonlyIndexes).toEqual([2])
    expect(table.expected.partiallyDecoded).toBe(true)
  })

  it.each(corpus.negative)("reconstructs negative bytes exactly for $id without claiming parser acceptance", (negative) => {
    const original = corpus.solana.find(vector => vector.id === negative.baseId)!
    const source = fromHex(negative.target === "message" ? original.message.hex : original.transaction.unsignedHex)
    const { offset, deleteCount, insertHex } = negative.mutation
    expect(offset).toBeGreaterThanOrEqual(0)
    expect(offset + deleteCount).toBeLessThanOrEqual(source.length)
    const result = Buffer.concat([source.subarray(0, offset), fromHex(insertHex), source.subarray(offset + deleteCount)])
    expect(result).not.toEqual(source)
    expect(result.toString("hex")).toBe(negative.bytesHex)
    expect(result.toString("base64")).toBe(negative.bytesBase64)
    expect(negative.expected.action).toBe("reject")
  })

  it.each(corpus.evm)("cross-checks independent ethers EVM envelope $id using viem and verifies its public signature", (vector) => {
    const transaction: Record<string, unknown> = { ...vector.context.unsignedTransaction }
    for (const field of ["chainId", "nonce", "value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]) {
      if (transaction[field] !== undefined) transaction[field] = BigInt(transaction[field] as string)
    }
    const serialized = serializeTransaction(transaction as Parameters<typeof serializeTransaction>[0])
    expect(serialized).toBe(vector.unsignedSerialized)
    expect(keccak256(serialized).slice(2)).toBe(vector.context.digest)
    expect(vector.expected.serializedKeccak256).toBe(vector.context.digest)
    expect(vector.expected.calldata).toBe(vector.context.unsignedTransaction.data)
    expect(vector.expected.selector).toBe(vector.expected.calldata === "0x" ? null : vector.expected.calldata.slice(0, 10))
    const signature = fromHex(`${vector.signature.r.slice(2)}${vector.signature.s.slice(2)}`)
    expect(secp256k1.verify(signature, fromHex(vector.context.digest), fromHex(vector.signature.publicKeyHex), { prehash: false })).toBe(true)
  })

  it.each(corpus.signerChecks)("isolates signer membership from valid message bytes: $id", (check) => {
    const vector = corpus.solana.find(vector => vector.id === check.baseId)!
    expect(vector.expected.requiredSigners).not.toContain(check.expectedSignerBase58)
    expect(check.expected.reason).toBe("signer_not_required")
    if (check.id === "expected-key-present-only-as-nonsigner") expect(vector.expected.staticAccountKeys).toContain(check.expectedSignerBase58)
    else expect(vector.expected.staticAccountKeys).not.toContain(check.expectedSignerBase58)
    expect(corpus.keys.find(key => key.publicKeyHex === check.expectedSignerHex)?.publicKeyBase58).toBe(check.expectedSignerBase58)
  })

  it("pins canonical wire, raw-only near-miss and packet-boundary construction distinctions", () => {
    const packet = corpus.solana.find(vector => vector.id === "legacy-signed-packet-exactly-1232")!
    expect(fromHex(packet.transaction.signedHex)).toHaveLength(1232)
    const over = corpus.negative.find(vector => vector.id === "message-packet-exceeds-1232")!
    expect(fromHex(over.bytesHex).length + packet.transaction.messageOffset).toBe(1233)
    const repeated = corpus.solana.find(vector => vector.id === "legacy-repeated-static-key-wire-valid")!
    expect(repeated.expected.staticAccountKeys[0]).toBe(repeated.expected.staticAccountKeys[1])
    const near = corpus.solana.find(vector => vector.id === "legacy-known-program-near-misses-raw")!
    expect(near.expected.instructions).toHaveLength(4)
    expect(near.expected.instructions.every(ix => ix.decoded.kind === "raw")).toBe(true)
    const unusedLookup = corpus.solana.find(vector => vector.id === "v0-unused-unresolved-alt-static-transfer")!
    expect(unusedLookup.expected.instructions[0].decoded.kind).toBe("system-transfer")
    expect(unusedLookup.expected.addressTableLookups).toHaveLength(1)
    expect(unusedLookup.expected.partiallyDecoded).toBe(true)
  })

  it.each(corpus.evmNegative)("isolates forbidden legacy field presence from a digest mismatch: $id", (vector) => {
    const base = corpus.evm.find(vector => vector.id === "evm-eth-legacy-zero-nonce")!
    expect(vector.context.digest).toBe(base.context.digest)
    expect(vector.context.unsignedTransaction.type).toBe("legacy")
    const changes = Object.keys(vector.context.unsignedTransaction).filter(key => !Object.hasOwn(base.context.unsignedTransaction, key))
    expect(changes).toHaveLength(1)
    expect(["maxFeePerGas", "maxPriorityFeePerGas"]).toContain(changes[0])
    expect((vector.context.unsignedTransaction as Record<string, unknown>)[changes[0]]).toBe("0")
    const { [changes[0]]: _forbidden, ...clean } = vector.context.unsignedTransaction as Record<string, unknown>
    expect(clean).toEqual(base.context.unsignedTransaction)
  })

  it("anchors unsigned EIP155 bytes/hash directly to the published primary example", () => {
    const vector = corpus.evm.find(vector => vector.id === "evm-eip155-published-example")!
    expect(vector.unsignedSerialized).toBe("0xec098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a764000080018080")
    expect(vector.context.digest).toBe("daf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53")
  })
})
