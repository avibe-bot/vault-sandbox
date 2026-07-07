import { afterEach, describe, expect, it } from "vitest"
import { Aes256Gcm, CipherSuite, HkdfSha256 } from "@hpke/core"
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519"
import { ed25519 } from "@noble/curves/ed25519.js"

import {
  avaultPublicKeyFingerprint,
  buildWrapMeta,
  bytesFromHex,
  bytesToBase64,
  derivePasskeyKek,
  deriveSigningAddresses,
  generateSigningKey,
  newVmk,
  passkeyPrfSaltEntries,
  passkeyPrfSalts,
  packProtectedRecord,
  protectRootMetadata,
  releaseProtectedDek,
  sealProtected,
  signProtectedDigest,
  unpackProtectedRecord,
  unwrapVmk,
  verifyDaemonBindingSignature,
  webAuthnPrfExtensionInput,
  withRootMetadata,
  type AvaultPublicKey,
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

describe("protected operations crypto", () => {
  it("seals, packs, unpacks, and opens a protected value without exposing plaintext in the envelope", async () => {
    const vmk = newVmk()
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, { name: "OPENAI_API_KEY" })
    const envelope = packProtectedRecord(sealed, wrapMeta)
    const restored = unpackProtectedRecord(envelope)
    const opened = await unwrapVmk(restored.vmkWrapMeta, { kind: "passkey", prfOutput, prfSalt }).then((restoredVmk) =>
      import("./vaultCrypto").then(async ({ openProtected }) => {
        try {
          return openProtected(restored.sealed, restoredVmk, { name: "OPENAI_API_KEY" })
        } finally {
          restoredVmk.fill(0)
        }
      }),
    )

    expect(new TextDecoder().decode(opened)).toBe("protected value")
    expect(JSON.stringify(envelope)).not.toContain("protected value")
  })

  it("signs with a sealed secp256k1 key and derives public addresses", async () => {
    const vmk = newVmk()
    const key = generateSigningKey()
    const sealed = await sealProtected(key.privateKey, vmk, { name: "SIGNING_KEY" })
    const result = await signProtectedDigest(sealed, vmk, { name: "SIGNING_KEY" }, "11".repeat(32), "ecdsa-secp256k1-recoverable")
    const addresses = deriveSigningAddresses(key.publicKey)

    expect(result.signature).toHaveLength(128)
    expect(result.recovery_id === 0 || result.recovery_id === 1).toBe(true)
    expect(addresses.eth).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(addresses.btc_legacy).toMatch(/^1/)
    expect(addresses.btc_segwit).toMatch(/^bc1q/)
    expect(addresses.btc_taproot).toMatch(/^bc1p/)
  })

  it("authenticates root metadata before accepting a daemon-signed agent binding key", async () => {
    const vmk = newVmk()
    const daemonSecret = ed25519.utils.randomSecretKey()
    const daemonPublic = ed25519.getPublicKey(daemonSecret)
    const root = await protectRootMetadata(vmk, {
      daemon: {
        verificationKeys: [{ alg: "ed25519", keyId: "daemon-1", publicKey: bytesToBase64(daemonPublic) }],
      },
    })
    const wrapMeta = withRootMetadata(
      await buildWrapMeta(vmk, [
        { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
      ]),
      root,
    )
    const { openRootMetadata } = await import("./vaultCrypto")
    const openedRoot = await openRootMetadata(wrapMeta, vmk)
    const message = "{\"agent\":\"agent-1\"}"
    const signature = ed25519.sign(new TextEncoder().encode(message), daemonSecret)

    expect(
      verifyDaemonBindingSignature({
        rootMetadata: openedRoot,
        keyId: "daemon-1",
        signature: bytesToBase64(signature),
        message,
      }),
    ).toBe(true)
  })

  it("releases only a context-bound DEK as an HPKE blind box", async () => {
    const suite = new CipherSuite({
      kem: new DhkemX25519HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes256Gcm(),
    })
    const receiver = await suite.kem.generateKeyPair()
    const publicRaw = new Uint8Array(await suite.kem.serializePublicKey(receiver.publicKey))
    const publicKey: AvaultPublicKey = {
      public_key: bytesToBase64(publicRaw),
      fingerprint: await avaultPublicKeyFingerprint(bytesToBase64(publicRaw)),
    }
    const vmk = newVmk()
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, { name: "OPENAI_API_KEY" })
    const operationHash = await import("./vaultCrypto").then(({ blindBoxAgentDeliverOperationHash, bytesToHexString }) =>
      blindBoxAgentDeliverOperationHash("OPENAI_API_KEY", 60).then(bytesToHexString),
    )
    const box = await releaseProtectedDek(sealed, vmk, publicKey, { name: "OPENAI_API_KEY" }, {
      purpose: "agent-deliver",
      name: "OPENAI_API_KEY",
      grantId: "grant-1",
      ttlSecs: 60,
      approvalNonce: new Uint8Array(16).fill(1),
      approvalExpiresAtUnix: 1,
      operationHash: bytesFromHex(operationHash),
    })

    expect(box.scheme).toBe("hpke-x25519-hkdfsha256-aes256gcm-v1")
    expect(box.enc).toBeTruthy()
    expect(box.ct).toBeTruthy()
  })
})
