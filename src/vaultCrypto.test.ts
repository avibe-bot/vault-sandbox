import { afterEach, describe, expect, it } from "vitest"

import {
  buildWrapMeta,
  derivePasskeyKek,
  newVmk,
  passkeyPrfSaltEntries,
  passkeyPrfSalts,
  unwrapVmk,
  webAuthnPrfExtensionInput,
} from "./vaultCrypto"
import { commitUnlockedVmk, lockVault, resetVaultSessionForTests, vaultStatus } from "./vaultLifecycle"
import { readPasskeyPrfResult } from "./webauthn"

afterEach(() => {
  resetVaultSessionForTests()
})

describe("protected VMK wrap crypto", () => {
  it("wraps and unwraps the VMK with a passkey PRF copy only", async () => {
    const vmk = newVmk()
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt, credentialId: "cred-1" }])

    await expect(unwrapVmk(wrapMeta, { kind: "passkey", prfOutput })).resolves.toEqual(vmk)
    await expect(
      unwrapVmk(wrapMeta, { kind: "passkey", prfOutput, prfSalt: new Uint8Array(32).fill(0x99) }),
    ).rejects.toThrow(/unwrapped/)
    expect(passkeyPrfSalts(wrapMeta)).toEqual([prfSalt])
    expect(passkeyPrfSaltEntries(wrapMeta)).toEqual([{ prfSalt, credentialId: "cred-1" }])
    expect(webAuthnPrfExtensionInput(prfSalt).prf.eval.first.byteLength).toBe(32)
  })

  it("keeps setup passkey PRF bytes and credential id intact through wrap_meta", async () => {
    const vmk = newVmk()
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const credentialId = "/Wz4YbtaoR9NBzQH1amGZagS0BmEdIh2dS8OIbpdN2WftQMJlny4PP4I"

    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt, credentialId }])

    await expect(unwrapVmk(wrapMeta, { kind: "passkey", prfOutput })).resolves.toEqual(vmk)
    expect(passkeyPrfSaltEntries(wrapMeta)).toEqual([{ prfSalt, credentialId }])
    expect(prfOutput).toEqual(new Uint8Array(32).fill(0x22))
  })

  it("derives a stable passkey KEK from WebAuthn PRF output and salt", async () => {
    const prfOutput = new Uint8Array(32).fill(7)
    const prfSalt = new Uint8Array(32).fill(9)

    await expect(derivePasskeyKek(prfOutput, prfSalt)).resolves.toEqual(await derivePasskeyKek(prfOutput, prfSalt))
  })
})

describe("WebAuthn PRF adapter", () => {
  it("normalizes provider PRF output that arrives as a plain array", () => {
    const credential = {
      getClientExtensionResults: () => ({ prf: { results: { first: [1, 2, 3, 4] } } }),
    } as unknown as PublicKeyCredential

    expect(readPasskeyPrfResult(credential)).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it("rejects missing PRF output", () => {
    const credential = {
      getClientExtensionResults: () => ({ prf: { results: {} } }),
    } as unknown as PublicKeyCredential

    expect(() => readPasskeyPrfResult(credential)).toThrow(/passkey-prf-unavailable/)
  })
})

describe("VMK lifecycle", () => {
  it("zeroes the in-memory VMK on lock", async () => {
    const vmk = new Uint8Array(32).fill(0x77)
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt, credentialId: "cred-1" }])

    commitUnlockedVmk({ vmk, wrapMeta, freshSetup: false, scopeId: "test-vault" })
    expect(vaultStatus().state).toBe("unlocked")

    expect(lockVault()).toEqual({ state: "locked" })
    expect(vmk).toEqual(new Uint8Array(32))
    expect(vaultStatus(wrapMeta)).toEqual({ state: "locked" })
  })

  it("drops uncommitted fresh setup metadata on lock", async () => {
    const vmk = new Uint8Array(32).fill(0x77)
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])

    commitUnlockedVmk({ vmk, wrapMeta, freshSetup: true, scopeId: "fresh-vault" })
    expect(vaultStatus().freshSetup).toBe(true)

    lockVault()
    expect(vaultStatus()).toEqual({ state: "needs-setup" })
  })
})
