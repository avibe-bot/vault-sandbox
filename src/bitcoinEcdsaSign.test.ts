import { describe, expect, it, vi } from "vitest"
import { bytesToHex } from "@noble/curves/utils.js"
import { bitcoinEcdsaSignFixture } from "./bitcoinEcdsaSignTestFixtures"
import { concat, parseTransaction, u32Bytes, u64Bytes } from "./bitcoin"
import { bitcoinKeyScripts, closeBitcoinEcdsaSignature, verifyBitcoinDerSignature } from "./bitcoinEcdsa"
import { rehashNative } from "./bitcoinEcdsaTestVectors"
import * as protectedHd from "./protectedHd"
import { hdEnvelopeFingerprint } from "./protectedHd"
import { prepareSignRequest, signPreparedRequest, verifyPreparedSignRequest } from "./signRequest"
import {
  openProtected, packProtectedRecord, protectedRecordContextFromMetadata, sealProtected, unpackProtectedRecord,
} from "./vaultCrypto"

async function withFixture<T>(type: "p2pkh" | "p2wpkh", account: number | undefined, operation: (f: Awaited<ReturnType<typeof bitcoinEcdsaSignFixture>>) => Promise<T>) {
  const f = await bitcoinEcdsaSignFixture(type, account)
  try { return await operation(f) } finally { f.vmk.fill(0); f.key.fill(0) }
}

describe("new protected Bitcoin binding, actual key and local closure", () => {
  it.each(["p2pkh", "p2wpkh"] as const)("authenticates the ordinary %s scalar before review and closes one DER signature", async (type) => {
    await withFixture(type, undefined, async (f) => {
      const prepared = prepareSignRequest(f.request)
      const content = await verifyPreparedSignRequest(prepared, f.vmk, f.wrapMeta)
      expect(content.review?.summary).toContainEqual({ label: "review.field.returnToKey", value: "90000", native: "btc", unit: "symbol" })
      let checks = 0
      const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta, () => { checks++ })
      expect(checks).toBe(2)
      expect(result).toMatchObject({ scheme: "ecdsa-secp256k1-der", recovery_id: null })
      expect(bytesToHex(verifyBitcoinDerSignature(result.signature, f.signingContext.digest, f.publicKey))).toBe(result.signature)
      expect(closeBitcoinEcdsaSignature(f.signingContext, f.signingContext.digest, f.publicKey, result.signature).feeSats).toBe(1000n)
      await expect(signPreparedRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow(/scoped authorization lease/)
    })
  })

  it.each([0, 1, 19])("uses actual purpose44/84 and proves three Bitcoin siblings only at HD index %s", async (account) => {
    for (const type of ["p2pkh", "p2wpkh"] as const) {
      await withFixture(type, account, async (f) => {
        const prepared = prepareSignRequest(f.request)
        const purpose = type === "p2pkh" ? 44 : 84
        expect(prepared.hd?.path).toBe(`m/${purpose}'/0'/0'/0/${account}`)
        const content = await verifyPreparedSignRequest(prepared, f.vmk, f.wrapMeta)
        expect(content.review?.summary).toContainEqual({ label: "review.field.returnToAccount", value: "90000", native: "btc", unit: "symbol" })
        const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta, () => {})
        expect(bytesToHex(verifyBitcoinDerSignature(result.signature, f.signingContext.digest, f.publicKey))).toBe(result.signature)
      })
    }
  })

  it("counts a real same-index cross-purpose HD return, keeps another index a recipient, and refuses two return outputs", async () => {
    await withFixture("p2wpkh", 1, async (f) => {
      const c = f.signingContext
      if (c.kind !== "bitcoin-p2wpkh-v1") throw new Error("test requires Native context")
      const tx = parseTransaction(c.unsignedTransaction)
      const own44 = bitcoinKeyScripts(f.accounts![1].bitcoin_p2pkh).p2pkh
      const other44 = bitcoinKeyScripts(f.accounts![2].bitcoin_p2pkh).p2pkh
      const own84 = bitcoinKeyScripts(f.accounts![1].bitcoin_p2wpkh).p2wpkh
      const setOutputs = (first: Uint8Array, second = tx.outputs[1].scriptPubKey) => {
        c.unsignedTransaction = bytesToHex(concat(tx.raw.subarray(0, 46), new Uint8Array([2]),
          u64Bytes(90_000n), new Uint8Array([first.length]), first,
          u64Bytes(59_000n), new Uint8Array([second.length]), second, u32Bytes(0)))
        rehashNative(c, f.publicKey)
        f.request.context.release!.digest = c.digest
        f.request.context.release!.signingContext = structuredClone(c)
        f.resign()
      }
      setOutputs(own44)
      const returned = await verifyPreparedSignRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)
      expect(returned.review?.summary).toContainEqual({ label: "review.field.returnToAccount", value: "90000", native: "btc", unit: "symbol" })
      expect(returned.review?.summary).toContainEqual({ label: "review.field.netLeavingAccount", value: "60000", native: "btc", unit: "symbol" })
      setOutputs(other44)
      const recipient = await verifyPreparedSignRequest(prepareSignRequest(f.request), f.vmk, f.wrapMeta)
      expect(recipient.review?.summary.some((field) => field.label === "review.field.returnToAccount")).toBe(false)
      expect(recipient.review?.summary).toContainEqual({ label: "review.field.netLeavingAccount", value: "150000", native: "btc", unit: "symbol" })
      setOutputs(own44, own84)
      expect(() => prepareSignRequest(f.request)).toThrow(/return OUTPUT/)
    })
  })

  it("refuses a validly sealed ordinary metadata point that is not the opened scalar", async () => {
    await withFixture("p2wpkh", undefined, async (f) => {
      // Correct AAD and a valid point/context cannot substitute the encrypted scalar.
      const unpacked = unpackProtectedRecord(f.request.material.envelope)
      const context = protectedRecordContextFromMetadata(f.request.material.name, unpacked.recordMetadata)
      const wrongScalar = new Uint8Array(32).fill(2)
      try {
        f.request.material.envelope = packProtectedRecord(await sealProtected(wrongScalar, f.vmk, context), f.wrapMeta, context)
        const binding = f.request.context.release!.signingKey as Record<string, unknown>
        binding.envelope_sha256 = hdEnvelopeFingerprint(f.request.material.envelope)
        f.resign()
        const prepared = prepareSignRequest(f.request)
        await expect(verifyPreparedSignRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow(/signed binding/)
      } finally { wrongScalar.fill(0) }
    })
  })

  it.each(["bitcoin_p2pkh", "bitcoin_p2wpkh", "bitcoin", "bip86-substitution"] as const)("rejects authenticated but seed-inconsistent HD sibling %s before showing a review", async (mutation) => {
    await withFixture("p2wpkh", 1, async (f) => {
      const unpacked = unpackProtectedRecord(f.request.material.envelope)
      const original = protectedRecordContextFromMetadata(f.request.material.name, unpacked.recordMetadata)
      const payload = await openProtected(unpacked.sealed, f.vmk, original)
      try {
        if (unpacked.recordMetadata?.kind !== "hd-seed") throw new Error("test requires HD metadata")
        const metadata = structuredClone(unpacked.recordMetadata)
        const field = mutation === "bip86-substitution" ? "bitcoin_p2wpkh" : mutation
        const point = metadata.accounts[1][field]
        metadata.accounts[1][field] = mutation === "bip86-substitution" ? metadata.accounts[1].bitcoin : (point.startsWith("02") ? "03" : "02") + point.slice(2)
        const changed = protectedRecordContextFromMetadata(f.request.material.name, metadata)
        f.request.material.envelope = packProtectedRecord(await sealProtected(payload, f.vmk, changed), f.wrapMeta, changed)
        const release = f.request.context.release!
        const binding = release.signingKey as Record<string, unknown>
        binding.envelope_sha256 = hdEnvelopeFingerprint(f.request.material.envelope)
        // For the selected-point substitution, even a correspondingly changed
        // public binding must fail actual seed equality, not just field mismatch.
        if (field === "bitcoin_p2wpkh") {
          release.publicKey = metadata.accounts[1][field]
          binding.public_key = release.publicKey
          if (f.request.signingContext.kind !== "bitcoin-p2wpkh-v1") throw new Error("test requires Native context")
          f.request.signingContext.prevout.scriptPubKey = bytesToHex(bitcoinKeyScripts(release.publicKey as string).p2wpkh)
          rehashNative(f.request.signingContext, release.publicKey as string)
          release.digest = f.request.signingContext.digest
          release.signingContext = structuredClone(f.request.signingContext)
          f.resign()
          const prepared = prepareSignRequest(f.request) // public schema/script/digest all agree
          await expect(verifyPreparedSignRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow(/selected authenticated public key/)
        } else {
          f.resign()
          const prepared = prepareSignRequest(f.request)
          await expect(verifyPreparedSignRequest(prepared, f.vmk, f.wrapMeta)).rejects.toThrow(/sibling point/)
        }
      } finally { payload.fill(0) }
    })
  })

  it("proves just the selected index's Bitcoin purposes and wipes every opened seed", async () => {
    await withFixture("p2wpkh", 1, async (f) => {
      const prepared = prepareSignRequest(f.request)
      const derive = vi.spyOn(protectedHd, "withHdSigningKey")
      try {
        await verifyPreparedSignRequest(prepared, f.vmk, f.wrapMeta)
        expect(derive.mock.calls.map(([, selection]) => selection)).toEqual([
          { chain: "bitcoin", account: 1, address_type: "p2wpkh" },
          { chain: "bitcoin", account: 1, address_type: "p2pkh" },
          { chain: "bitcoin", account: 1, address_type: "p2tr" },
        ])
        expect(derive.mock.calls.every(([seed]) => seed.every((byte) => byte === 0))).toBe(true)
      } finally { derive.mockRestore() }
    })
  })

  it("binds the ordinary raw envelope and canonical exact compiled cohort, with no HD selector", async () => {
    await withFixture("p2pkh", undefined, async (f) => {
      for (const mutation of ["missing-key", "saved-id", "point", "raw-wrap", "wrong-build", "bad-manifest", "noncanonical-manifest", "extra-cohort", "ordinary-derivation"] as const) {
        const request = structuredClone(f.request)
        const release = request.context.release!
        const key = release.signingKey as Record<string, unknown>
        const cohort = release.sandboxCohort as Record<string, unknown>
        if (mutation === "missing-key") delete release.signingKey
        if (mutation === "saved-id") key.secret_id = ""
        if (mutation === "point") key.public_key = "02" + "00".repeat(32)
        if (mutation === "raw-wrap") request.material.envelope.wrap_meta += " "
        if (mutation === "wrong-build") cohort.buildHash = "other-build"
        if (mutation === "bad-manifest") cohort.manifestHash = "not-an-SRI"
        if (mutation === "noncanonical-manifest") cohort.manifestHash = "sha256-" + "A".repeat(42) + "B="
        if (mutation === "extra-cohort") cohort.extra = true
        if (mutation === "ordinary-derivation") release.derivation = { chain: "bitcoin", account: 0, address_type: "p2pkh" }
        expect(() => prepareSignRequest(request)).toThrow()
      }
    })
  })
})
