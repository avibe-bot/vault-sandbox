// Synthetic, public test keys only. Shared by consumer and real-RPC tests.
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { signedOperationContextMessage } from "./operationContext"
import type { SignRequest } from "./signRequest"
import type { VerifiableSigningContext } from "./signingContext"
import {
  buildWrapMeta, bytesToBase64, packProtectedRecord, protectRootMetadata, sealProtected, withRootMetadata,
  SIGN_SCHEME_SCHNORR_SECP256K1_BIP340, type SignatureScheme,
} from "./vaultCrypto"

export async function signFixture(scheme: SignatureScheme = SIGN_SCHEME_SCHNORR_SECP256K1_BIP340, privateKeyInput?: Uint8Array) {
  const key = privateKeyInput ? new Uint8Array(privateKeyInput) : new Uint8Array(32).fill(1)
  const daemonKey = new Uint8Array(32).fill(0x11)
  const vmk = new Uint8Array(32).fill(0x44)
  const publicKey = bytesToHex(secp256k1.getPublicKey(key))
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public-test-daemon", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const factor = { kind: "passkey" as const, prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }
  const wrapBase = await buildWrapMeta(vmk, [factor])
  const wrapMeta = withRootMetadata(wrapBase, await protectRootMetadata(vmk, rootMetadata, wrapBase))
  const canonicalPreimage = "avault-agent-operation:v1\npublic synthetic operation; NOT a Bitcoin transaction"
  const digest = bytesToHex(sha256(new TextEncoder().encode(canonicalPreimage)))
  const signingContext = { kind: "avault-agent-operation" as const, canonicalPreimage, digestAlgorithm: "avault-operation-hash-v1" as const, digest }
  const context = { name: "PUBLIC_TEST_KEY", kind: "keypair" as const, publicKey }
  const request: SignRequest<VerifiableSigningContext> = {
    material: { name: context.name, envelope: packProtectedRecord(await sealProtected(key, vmk, context), wrapMeta, context) },
    scheme,
    signingContext,
    context: {
      v: 2, purpose: "sign", requestId: crypto.randomUUID(),
      display: { secrets: [{ name: context.name, kind: "keypair" }] },
      release: { name: context.name, scheme, digest, publicKey, signingContext: structuredClone(signingContext) },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      signature: { alg: "ed25519", keyId: "public-test-daemon", value: "" },
    },
  }
  const resign = () => { request.context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(request.context)), daemonKey)) }
  resign()
  return { request, vmk, key, publicKey, wrapMeta, rootMetadata, resign }
}
