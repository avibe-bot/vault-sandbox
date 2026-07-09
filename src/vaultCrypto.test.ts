import { afterEach, describe, expect, it, vi } from "vitest"
import { Aes256Gcm, CipherSuite, HkdfSha256 } from "@hpke/core"
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519"
import { ed25519 } from "@noble/curves/ed25519.js"
import { encodeFunctionData, hashTypedData, keccak256, serializeTransaction } from "viem"

import {
  avaultPublicKeyFingerprint,
  blindBoxAgentDeliverOperationHash,
  buildWrapMeta,
  bytesFromHex,
  bytesToBase64,
  bytesToHexString,
  derivePasskeyKek,
  deriveSigningAddresses,
  generateSigningKey,
  newVmk,
  openProtected,
  passkeyPrfSaltEntries,
  passkeyPrfSalts,
  packProtectedRecord,
  protectedRecordContextFromMetadata,
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
import { commitUnlockedVmk, lockVault, resetVaultSessionForTests, vaultStatus, withUnlockedVmk } from "./vaultLifecycle"
import {
  createPasskeyCredential,
  isCrossOriginAncestorWebAuthnError,
  isWebAuthnCancellationError,
  passkeyAssertionOptionsFromJson,
  readPasskeyPrfResult,
} from "./webauthn"
import { verifySigningContext } from "./signingContext"
import { unlockVmkFromPasskeyPrf } from "./approvalUnlock"

afterEach(() => {
  resetVaultSessionForTests()
  vi.unstubAllGlobals()
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
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it("recognizes cross-origin iframe create blocks without treating user cancellation as fallback", () => {
    expect(isCrossOriginAncestorWebAuthnError({ name: "SecurityError", message: "" })).toBe(true)
    expect(isCrossOriginAncestorWebAuthnError({ name: "NotSupportedError", message: "" })).toBe(true)
    expect(isCrossOriginAncestorWebAuthnError({ name: "NotAllowedError", message: "ancestor is cross-origin" })).toBe(true)

    const cancellation = { name: "NotAllowedError", message: "The operation was cancelled by the user." }
    expect(isCrossOriginAncestorWebAuthnError(cancellation)).toBe(false)
    expect(isWebAuthnCancellationError(cancellation)).toBe(true)
  })

  it("lets synchronous create errors escape synchronously so popup fallback keeps user activation", () => {
    const blocked = Object.assign(new Error("The document has a cross-origin ancestor."), { name: "SecurityError" })
    vi.stubGlobal("navigator", {
      credentials: {
        create: () => {
          throw blocked
        },
      },
    })

    expect(() =>
      createPasskeyCredential({
        rpId: "sandbox.example",
        vaultUserHandle: "test-user",
        displayName: "Test User",
      }),
    ).toThrow(blocked)
  })

  it("forces delete authz assertions onto the sandbox RP with required UV", () => {
    expect(() =>
      passkeyAssertionOptionsFromJson({ challenge: "challenge", rpId: "evil.example", userVerification: "discouraged" }, "sandbox.example"),
    ).toThrow(/rpId/)

    const options = passkeyAssertionOptionsFromJson(
      { challenge: "challenge", rpId: "sandbox.example", userVerification: "discouraged" },
      "sandbox.example",
    )
    expect(options.rpId).toBe("sandbox.example")
    expect(options.userVerification).toBe("required")
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

  it("locks and zeroes the session VMK when an unlocked operation fails fatally", async () => {
    const vmk = new Uint8Array(32).fill(0x77)
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])

    commitUnlockedVmk({ vmk, wrapMeta, freshSetup: false, scopeId: "test-vault" })

    await expect(
      withUnlockedVmk(() => {
        throw new Error("fatal crypto error")
      }),
    ).rejects.toThrow(/fatal crypto error/)
    expect(vmk).toEqual(new Uint8Array(32))
    expect(vaultStatus(wrapMeta)).toEqual({ state: "locked" })
  })

  it("aborts and zeroes a held VMK copy when lock lands during pending high-risk confirmation", async () => {
    const vmk = new Uint8Array(32).fill(0x77)
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])
    let heldCopy: Uint8Array | null = null

    commitUnlockedVmk({ vmk, wrapMeta, freshSetup: false, scopeId: "test-vault" })
    const pending = withUnlockedVmk(
      (copy, _wrapMeta, session) =>
        new Promise<string>((resolve, reject) => {
          heldCopy = copy
          session.signal.addEventListener(
            "abort",
            () => {
              const reason = (session.signal as AbortSignal & { reason?: unknown }).reason
              reject(reason instanceof Error ? reason : new Error("missing abort reason"))
            },
            { once: true },
          )
          void resolve
        }),
    )
    await Promise.resolve()
    expect(heldCopy).toEqual(new Uint8Array(32).fill(0x77))

    lockVault()

    await expect(pending).rejects.toThrow(/vault-operation-aborted/)
    expect(heldCopy).toEqual(new Uint8Array(32))
    expect(vaultStatus(wrapMeta)).toEqual({ state: "locked" })
  })

  it("unlocks from a protected material envelope with one PRF assertion for locked approvals", async () => {
    const vmk = new Uint8Array(32).fill(0x77)
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])
    const context = { name: "OPENAI_API_KEY", kind: "static" as const }
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, context)
    const envelope = packProtectedRecord(sealed, wrapMeta, context)
    const get = vi.fn(async () => ({
      rawId: new Uint8Array([1, 2, 3]).buffer,
      getClientExtensionResults: () => ({ prf: { results: { first: prfOutput } } }),
    }))
    vi.stubGlobal("navigator", { credentials: { get } })

    expect(vaultStatus()).toEqual({ state: "needs-setup" })
    const unlocked = await unlockVmkFromPasskeyPrf({ wrapMeta: envelope.wrap_meta, currentRpId: "sandbox.example" })

    expect(unlocked.state).toBe("unlocked")
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith({
      publicKey: expect.objectContaining({
        rpId: "sandbox.example",
        userVerification: "required",
        extensions: expect.any(Object),
      }),
    })
    await withUnlockedVmk((copy) => {
      expect(copy).toEqual(vmk)
    })
  })
})

describe("protected operations crypto", () => {
  it("seals, packs, unpacks, and opens a protected value without exposing plaintext in the envelope", async () => {
    const vmk = newVmk()
    const prfSalt = new Uint8Array(32).fill(0x11)
    const prfOutput = new Uint8Array(32).fill(0x22)
    const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])
    const context = { name: "OPENAI_API_KEY", kind: "static" as const }
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, context)
    const envelope = packProtectedRecord(sealed, wrapMeta, context)
    const restored = unpackProtectedRecord(envelope)
    const opened = await unwrapVmk(restored.vmkWrapMeta, { kind: "passkey", prfOutput, prfSalt }).then(async (restoredVmk) => {
      try {
        return openProtected(restored.sealed, restoredVmk, protectedRecordContextFromMetadata("OPENAI_API_KEY", restored.recordMetadata))
      } finally {
        restoredVmk.fill(0)
      }
    })

    expect(new TextDecoder().decode(opened)).toBe("protected value")
    expect(JSON.stringify(envelope)).not.toContain("protected value")
  })

  it("keeps unsealed plaintext out of RPC-shaped results", async () => {
    const vmk = newVmk()
    const context = { name: "OPENAI_API_KEY", kind: "static" as const }
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, context)
    const opened = await openProtected(sealed, vmk, context)
    const rpcResult = { completed: true }

    try {
      expect(new TextDecoder().decode(opened)).toBe("protected value")
      expect(JSON.stringify(rpcResult)).not.toContain("protected value")
      expect(Object.keys(rpcResult)).toEqual(["completed"])
    } finally {
      opened.fill(0)
    }
  })

  it("signs with a sealed secp256k1 key and derives public addresses", async () => {
    const vmk = newVmk()
    const key = generateSigningKey()
    const context = { name: "SIGNING_KEY", kind: "keypair" as const, publicKey: key.publicKey }
    const sealed = await sealProtected(key.privateKey, vmk, context)
    const result = await signProtectedDigest(sealed, vmk, context, "11".repeat(32), "ecdsa-secp256k1-recoverable")
    const addresses = deriveSigningAddresses(key.publicKey)

    expect(result.signature).toHaveLength(128)
    expect(result.recovery_id === 0 || result.recovery_id === 1).toBe(true)
    expect(addresses.eth).toMatch(/^0x[0-9a-fA-F]{40}$/)
    expect(addresses.btc_legacy).toMatch(/^1/)
    expect(addresses.btc_segwit).toMatch(/^bc1q/)
    expect(addresses.btc_taproot).toMatch(/^bc1p/)
  })

  it("refuses to sign a static protected record as a keypair", async () => {
    const vmk = newVmk()
    const sealed = await sealProtected(new Uint8Array(32).fill(0x42), vmk, { name: "STATIC_SECRET", kind: "static" })

    await expect(
      signProtectedDigest(
        sealed,
        vmk,
        { name: "STATIC_SECRET", kind: "static" },
        "11".repeat(32),
        "ecdsa-secp256k1-recoverable",
      ),
    ).rejects.toThrow(/keypair/)
  })

  it("refuses undecodable signing contexts instead of falling back to parent-supplied raw display", () => {
    expect(() =>
      verifySigningContext({
        kind: "evm-transaction",
        chainId: "1",
        unsignedTransaction: { to: "not-an-address", value: "1" },
        digestAlgorithm: "keccak256",
        digest: `0x${"00".repeat(32)}`,
      }),
    ).toThrow()

    expect(() =>
      verifySigningContext({
        kind: "raw-hex",
        digest: `0x${"00".repeat(32)}`,
      } as never),
    ).toThrow(/unsupported signing context/)
  })

  it("refuses matching-digest approvals when EVM calldata cannot be fully decoded", () => {
    const tx = {
      chainId: 1,
      to: "0x0000000000000000000000000000000000000001",
      value: 0n,
      gas: 50_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      data: "0x12345678",
    } as const
    const digest = keccak256(serializeTransaction(tx))

    expect(() =>
      verifySigningContext({
        kind: "evm-transaction",
        chainId: "1",
        unsignedTransaction: tx,
        digestAlgorithm: "keccak256",
        digest,
      }),
    ).toThrow(/unsupported EVM calldata/)
  })

  it.each([
    ["missing chainId", { to: "0x0000000000000000000000000000000000000001", value: 0n, gas: 50_000n, data: "0x" }],
    [
      "accessList",
      {
        chainId: 1,
        to: "0x0000000000000000000000000000000000000001",
        value: 0n,
        gas: 50_000n,
        data: "0x",
        accessList: [],
      },
    ],
    [
      "authorizationList",
      {
        chainId: 1,
        to: "0x0000000000000000000000000000000000000001",
        value: 0n,
        gas: 50_000n,
        data: "0x",
        authorizationList: [],
      },
    ],
    [
      "blob fields",
      {
        chainId: 1,
        to: "0x0000000000000000000000000000000000000001",
        value: 0n,
        gas: 50_000n,
        data: "0x",
        blobVersionedHashes: [`0x${"00".repeat(32)}`],
        maxFeePerBlobGas: 1n,
      },
    ],
  ])("refuses EVM tx with %s because not every signed field can be displayed", (_name, tx) => {
    expect(() =>
      verifySigningContext({
        kind: "evm-transaction",
        chainId: "1",
        unsignedTransaction: tx,
        digestAlgorithm: "keccak256",
        digest: `0x${"00".repeat(32)}`,
      }),
    ).toThrow()
  })

  it("fully displays known approval semantics when the EVM digest matches", () => {
    const spender = "0x000000000000000000000000000000000000dEaD"
    const tx = {
      chainId: 1,
      to: "0x000000000000000000000000000000000000c0Fe",
      value: 0n,
      gas: 50_000n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      data: encodeFunctionData({
        abi: [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] }],
        functionName: "approve",
        args: [spender, 123n],
      }),
    } as const
    const digest = keccak256(serializeTransaction(tx))
    const verified = verifySigningContext({
      kind: "evm-transaction",
      chainId: "1",
      unsignedTransaction: tx,
      digestAlgorithm: "keccak256",
      digest,
    })

    expect(verified.display).toContain("ERC-20/ERC-721 approve")
    expect(verified.display).toContain("EVM transaction on chain 1")
    expect(verified.display).toContain("type: eip1559")
    expect(verified.display.toLowerCase()).toContain(spender.toLowerCase())
    expect(verified.display).toContain("123")
  })

  it("renders the full EIP-712 typed message instead of a domain-only summary", () => {
    const typedData = {
      domain: {
        name: "Sandbox Test",
        version: "1",
        chainId: 1,
        verifyingContract: "0x0000000000000000000000000000000000000001",
      },
      types: {
        Mail: [
          { name: "to", type: "address" },
          { name: "contents", type: "string" },
        ],
      },
      primaryType: "Mail",
      message: {
        to: "0x000000000000000000000000000000000000dEaD",
        contents: "hello",
      },
    } as const
    const verified = verifySigningContext({
      kind: "eip-712-typed-data",
      typedData,
      digestAlgorithm: "eip712",
      digest: hashTypedData(typedData),
    })

    expect(verified.display).toContain("\"contents\":\"hello\"")
    expect(verified.display.toLowerCase()).toContain("000000000000000000000000000000000000dead")
  })

  it("authenticates root metadata before accepting a daemon-signed agent binding key", async () => {
    const vmk = newVmk()
    const daemonSecret = ed25519.utils.randomSecretKey()
    const daemonPublic = ed25519.getPublicKey(daemonSecret)
    const baseWrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])
    const root = await protectRootMetadata(vmk, {
      daemon: {
        verificationKeys: [{ alg: "ed25519", keyId: "daemon-1", publicKey: bytesToBase64(daemonPublic) }],
      },
    }, baseWrapMeta)
    const wrapMeta = withRootMetadata(baseWrapMeta, root)
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

  it("rejects spliced root metadata bound to a different vault wrap context", async () => {
    const vmk = newVmk()
    const targetWrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])
    const attackerWrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x33), prfSalt: new Uint8Array(32).fill(0x44) },
    ])
    const attackerRoot = await protectRootMetadata(vmk, {
      daemon: {
        verificationKeys: [{ alg: "ed25519", keyId: "attacker", publicKey: bytesToBase64(new Uint8Array(32).fill(9)) }],
      },
    }, attackerWrapMeta)
    const spliced = withRootMetadata(targetWrapMeta, attackerRoot)

    await expect(import("./vaultCrypto").then(({ openRootMetadata }) => openRootMetadata(spliced, vmk))).rejects.toThrow()
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
    const recordContext = { name: "OPENAI_API_KEY", kind: "static" as const }
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, recordContext)
    const operationHash = bytesToHexString(await blindBoxAgentDeliverOperationHash("OPENAI_API_KEY", 60))
    const box = await releaseProtectedDek(sealed, vmk, publicKey, recordContext, {
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

  it("rejects raw parent-supplied release keys without a pinned daemon-authenticated fingerprint", async () => {
    const vmk = newVmk()
    const recordContext = { name: "OPENAI_API_KEY", kind: "static" as const }
    const sealed = await sealProtected(new TextEncoder().encode("protected value"), vmk, recordContext)
    const operationHash = await blindBoxAgentDeliverOperationHash("OPENAI_API_KEY", 60)

    await expect(
      releaseProtectedDek(
        sealed,
        vmk,
        { public_key: bytesToBase64(new Uint8Array(32).fill(3)) },
        recordContext,
        {
          purpose: "agent-deliver",
          name: "OPENAI_API_KEY",
          grantId: "grant-1",
          ttlSecs: 60,
          approvalNonce: new Uint8Array(16).fill(1),
          approvalExpiresAtUnix: 1,
          operationHash,
        },
      ),
    ).rejects.toThrow(/pinned/)

    expect(() =>
      verifyDaemonBindingSignature({
        rootMetadata: null,
        keyId: "daemon-1",
        signature: bytesToBase64(new Uint8Array(64)),
        message: "{\"agent\":\"agent-1\"}",
      }),
    ).toThrow(/not pinned/)
  })
})
