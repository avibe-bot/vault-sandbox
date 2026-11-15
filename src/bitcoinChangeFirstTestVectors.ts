// Test support only: a public, never-funded CHANGE-FIRST Taproot spend for the
// display-order-1 first-screen grouping. Output 0 returns to the signing key's own
// BIP86 output, output 1 pays an unrelated recipient. The BIP341 SIGHASH_DEFAULT
// digest is computed here independently with node:crypto, not by the verifier.
import { createHash } from "node:crypto"
import { taprootOutputKeyXOnly } from "./vaultCrypto"

const sha256 = (value: Uint8Array): Buffer => createHash("sha256").update(value).digest()
const u32 = (value: number): Buffer => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes }
const u64 = (value: bigint): Buffer => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes }

export function taprootChangeFirstContext(internalPublicKey: string, network = "regtest") {
  const own = Buffer.concat([Buffer.from([0x51, 0x20]), taprootOutputKeyXOnly(internalPublicKey)])
  const recipient = Buffer.concat([Buffer.from([0x51, 0x20]), sha256(new TextEncoder().encode("public unrelated change-first recipient"))])
  const outpoint = Buffer.concat([sha256(new TextEncoder().encode("public change-first outpoint")), u32(0)])
  const version = u32(2), locktime = u32(0), sequence = u32(0xfffffffd)
  const outputs = Buffer.concat([u64(9_000n), Buffer.from([own.length]), own, u64(10_000n), Buffer.from([recipient.length]), recipient])
  const unsignedTransaction = Buffer.concat([version, Buffer.from([1]), outpoint, Buffer.from([0]), sequence, Buffer.from([2]), outputs, locktime]).toString("hex")
  const tag = sha256(new TextEncoder().encode("TapSighash"))
  const digest = sha256(Buffer.concat([
    tag, tag, Buffer.from([0, 0]), version, locktime,
    sha256(outpoint), sha256(u64(20_000n)), sha256(Buffer.concat([Buffer.from([own.length]), own])),
    sha256(sequence), sha256(outputs), Buffer.from([0]), u32(0),
  ])).toString("hex")
  return {
    kind: "bitcoin-taproot-keypath-v1" as const, network, unsignedTransaction,
    prevout: { amountSats: 20_000, scriptPubKey: own.toString("hex") },
    digestAlgorithm: "bip341-sighash-default-keypath" as const, digest,
  }
}
