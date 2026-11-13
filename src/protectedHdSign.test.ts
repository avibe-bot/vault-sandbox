import { describe, expect, it } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1, schnorr } from "@noble/curves/secp256k1.js"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import { hashTypedData } from "viem"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { syntheticTransfersMessage } from "./signTestFixtures"
import { bytesToBase64, buildWrapMeta, protectRootMetadata, protectedRecordContextFromMetadata, taprootOutputKeyXOnly, unpackProtectedRecord, withRootMetadata } from "./vaultCrypto"
import { hdEnvelopeFingerprint } from "./protectedHd"
import { hdPath } from "./protectedHd"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { parseSignRequest, prepareSignRequest, signPreparedRequest } from "./signRequest"
import { hdSigningIdentity, signHdRequest } from "./protectedHdSign"
import { signedOperationContextMessage, type SignedOperationContext } from "./operationContext"
import type { SignatureScheme } from "./vaultCrypto"

const vector = vectors.cases[0]
const name = "PUBLIC_HD"

type HdFixture = {
  vmk: Uint8Array
  wrapMeta: string
  envelope: { ciphertext: string; nonce: string; wrap_meta: string }
  daemonKey: Uint8Array
  rootMetadata: { daemon: { verificationKeys: Array<{ alg: "ed25519"; keyId: string; publicKey: string }> } }
  accounts: typeof vector.record_meta.accounts
}

async function hdFixture(): Promise<HdFixture> {
  const vmk = new Uint8Array(32).fill(0x44)
  const daemonKey = new Uint8Array(32).fill(0x11)
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public-test-daemon", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const wrapBase = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }])
  const wrapMeta = withRootMetadata(wrapBase, await protectRootMetadata(vmk, rootMetadata, wrapBase))
  const sealed = await sealHdWalletLocally({ name, words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {} })
  return { vmk, wrapMeta, envelope: sealed.envelope, daemonKey, rootMetadata, accounts: sealed.accounts }
}

function signedContext(input: {
  daemonKey: Uint8Array
  scheme: SignatureScheme
  signingContext: Record<string, unknown>
  publicKey: string
  envelope: HdFixture["envelope"]
  derivation: Record<string, unknown>
  requestId: string
}): SignedOperationContext {
  const context = {
    v: 2 as const,
    purpose: "sign" as const,
    requestId: input.requestId,
    display: { secrets: [{ name, kind: "keypair" as const }], command: "public synthetic protected HD sign" },
    release: {
      name,
      scheme: input.scheme,
      ...(input.signingContext.kind === "solana-transaction-v1"
        ? { messageHex: input.signingContext.messageHex }
        : { digest: input.signingContext.digest }),
      publicKey: input.publicKey,
      signingContext: structuredClone(input.signingContext),
      derivation: structuredClone(input.derivation),
      signingKey: { secret_id: name, public_key: input.publicKey, envelope_sha256: hdEnvelopeFingerprint(input.envelope) },
    },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    signature: { alg: "ed25519" as const, keyId: "public-test-daemon", value: "" },
  }
  context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(context)), input.daemonKey))
  return context
}

function evmRequest(f: HdFixture, account: number) {
  const publicKey = f.accounts[account].evm
  const typedData = {
    domain: { name: "Public HD", version: "1", chainId: 1, verifyingContract: "0x0000000000000000000000000000000000000001" },
    types: { Mail: [{ name: "contents", type: "string" }] },
    primaryType: "Mail",
    message: { contents: "public synthetic protected HD EVM operation" },
  }
  const digest = hashTypedData(typedData as never).slice(2)
  const signingContext = { kind: "eip-712-typed-data", typedData, digestAlgorithm: "eip712", digest }
  return {
    material: { name, envelope: f.envelope }, scheme: "ecdsa-secp256k1-recoverable" as const, signingContext,
    context: signedContext({ daemonKey: f.daemonKey, scheme: "ecdsa-secp256k1-recoverable", signingContext, publicKey, envelope: f.envelope, derivation: { chain: "evm", account }, requestId: `hd-evm-${account}` }),
  }
}

function solanaRequest(f: HdFixture, account: number) {
  const message = hexToBytes(syntheticTransfersMessage(["raw"]).messageHex)
  message.set(hexToBytes(f.accounts[account].solana), 4)
  const messageHex = bytesToHex(message)
  const signingContext = { kind: "solana-transaction-v1", messageHex }
  return {
    material: { name, envelope: f.envelope }, scheme: "ed25519" as const, signingContext,
    context: signedContext({ daemonKey: f.daemonKey, scheme: "ed25519", signingContext, publicKey: f.accounts[account].solana, envelope: f.envelope, derivation: { chain: "solana", account }, requestId: `hd-solana-${account}` }),
  }
}

describe("protected HD signing selection and key custody", () => {
  it.each([0, 1, 19])("derives and signs the authenticated EVM account %s", async (account) => {
    const f = await hdFixture()
    try {
      const request = evmRequest(f, account)
      const prepared = prepareSignRequest(request)
      const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta)
      expect(result).toMatchObject({ scheme: "ecdsa-secp256k1-recoverable", recovery_id: expect.any(Number) })
      expect(secp256k1.verify(hexToBytes(result.signature), hexToBytes(request.signingContext.digest), hexToBytes(f.accounts[account].evm), { prehash: false })).toBe(true)
    } finally {
      f.vmk.fill(0)
      f.daemonKey.fill(0)
    }
  })

  it("signs protected Bitcoin only as BIP341 key-path for the selected internal key", async () => {
    const f = await hdFixture()
    try {
      const account = 1
      const publicKey = f.accounts[account].bitcoin
      const digest = "22".repeat(32)
      const request = {
        material: { name, envelope: f.envelope },
        scheme: "schnorr-secp256k1-bip341-keypath" as const,
        signingContext: { kind: "bitcoin-taproot-keypath-v1" },
        context: {
          release: {
            name,
            scheme: "schnorr-secp256k1-bip341-keypath",
            digest,
            publicKey,
            signingContext: { kind: "bitcoin-taproot-keypath-v1" },
            derivation: { chain: "bitcoin", account, address_type: "p2tr" },
            signingKey: { secret_id: name, public_key: publicKey, envelope_sha256: hdEnvelopeFingerprint(f.envelope) },
          },
        },
      } as never
      const unpacked = unpackProtectedRecord(f.envelope)
      const recordContext = protectedRecordContextFromMetadata(name, unpacked.recordMetadata)
      const identity = hdSigningIdentity(request, unpacked.recordMetadata as never)
      const result = await signHdRequest({ request, sealed: unpacked.sealed, vmk: f.vmk, context: recordContext, identity, payload: { kind: "digest", digest } })
      expect(result).toMatchObject({ scheme: "schnorr-secp256k1-bip341-keypath", recovery_id: null })
      expect(schnorr.verify(hexToBytes(result.signature), hexToBytes(digest), taprootOutputKeyXOnly(publicKey))).toBe(true)
      expect(identity.path).toBe(hdPath("bitcoin", account))
    } finally {
      f.vmk.fill(0)
      f.daemonKey.fill(0)
    }
  })

  it("signs the exact authenticated Solana message for a nonzero account", async () => {
    const f = await hdFixture()
    try {
      const request = solanaRequest(f, 2)
      const prepared = prepareSignRequest(request)
      const result = await signPreparedRequest(prepared, f.vmk, f.wrapMeta)
      expect(result).toMatchObject({ scheme: "ed25519", recovery_id: null })
      expect(ed25519.verify(hexToBytes(result.signature), hexToBytes(request.signingContext.messageHex), hexToBytes(f.accounts[2].solana), { zip215: false })).toBe(true)
    } finally {
      f.vmk.fill(0)
      f.daemonKey.fill(0)
    }
  })

  it("refuses missing, typed-wrong, or envelope-mismatched protected HD bindings before key use", async () => {
    const f = await hdFixture()
    try {
      const valid = evmRequest(f, 0)
      for (const mutate of [
        (request: typeof valid) => { delete request.context.release!.derivation },
        (request: typeof valid) => { (request.context.release!.derivation as Record<string, unknown>).address_type = "p2tr" },
        (request: typeof valid) => { (request.context.release!.signingKey as Record<string, unknown>).envelope_sha256 = "00".repeat(32) },
      ]) {
        const request = structuredClone(valid)
        mutate(request)
        request.context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(request.context)), f.daemonKey))
        expect(() => prepareSignRequest(request)).toThrow(/protected HD|binding|derivation/i)
      }
      const ordinary = structuredClone(valid)
      ordinary.context.release!.derivation = { chain: "evm", account: 0 }
      const parsed = parseSignRequest(ordinary)
      expect(parsed.context.release?.derivation).toEqual({ chain: "evm", account: 0 })
    } finally {
      f.vmk.fill(0)
      f.daemonKey.fill(0)
    }
  })
})
