import { afterEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { buildWrapMeta } from "./vaultCrypto"
import { sealHdWalletLocally } from "./protectedHdCustody"

const faults = vi.hoisted(() => ({ change: "none", opened: undefined as Uint8Array | undefined, encoded: undefined as Uint8Array | undefined }))
vi.mock("./vaultCrypto", async (original) => {
  const actual = await original<typeof import("./vaultCrypto")>()
  return {
    ...actual,
    sealProtected: async (...args: Parameters<typeof actual.sealProtected>) => {
      faults.encoded = args[0] as Uint8Array
      return actual.sealProtected(...args)
    },
    openProtected: async (...args: Parameters<typeof actual.openProtected>) => {
      const opened = await actual.openProtected(...args)
      faults.opened = opened
      if (faults.change === "entropy") opened[30] ^= 1
      if (faults.change === "seed") opened[30 + opened[29]] ^= 1
      if (faults.change === "hint") opened[opened.length - 1] ^= 1
      return opened
    },
  }
})
afterEach(() => { faults.change = "none"; faults.opened = undefined; faults.encoded = undefined })

describe("HD creation reopen consistency and owned-buffer cleanup", () => {
  it.each(["none", "entropy", "seed", "hint"])("checks both entropy and seed plus honesty bit, then scrubs buffers (%s)", async (change) => {
    const vmk = new Uint8Array(32).fill(0x44)
    const factor = { kind: "passkey" as const, prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }
    try {
      const wrapMeta = await buildWrapMeta(vmk, [factor])
      faults.change = change
      const vector = vectors.cases[0]
      const pending = sealHdWalletLocally({ name: "PUBLIC_HD", words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {} })
      if (change === "none") await expect(pending).resolves.toHaveProperty("accounts")
      else await expect(pending).rejects.toThrow(/creation reopen mismatch/)
      expect(faults.opened).toBeDefined()
      expect(faults.encoded).toBeDefined()
      expect(faults.opened!.every((byte) => byte === 0)).toBe(true)
      expect(faults.encoded!.every((byte) => byte === 0)).toBe(true)
    } finally { vmk.fill(0); factor.prfOutput.fill(0); factor.prfSalt.fill(0) }
  })
})
