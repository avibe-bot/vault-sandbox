// Synthetic, public test keys only. Shared by consumer and real-RPC tests.
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { base58Encode } from "./solana/base58"
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

/**
 * A protected Solana sign request for one exact message, signed by the public
 * test daemon. `seed` is a PUBLISHED Ed25519 test seed (RFC 8032), never a credential.
 */
export async function solanaSignFixture(messageHex: string, seedHex: string, options: { name?: string; sessionLabel?: string } = {}) {
  const seed = Uint8Array.from(seedHex.match(/../g)!.map((byte) => Number.parseInt(byte, 16)))
  const daemonKey = new Uint8Array(32).fill(0x11)
  const vmk = new Uint8Array(32).fill(0x44)
  const publicKey = bytesToHex(ed25519.getPublicKey(seed))
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public-test-daemon", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const factor = { kind: "passkey" as const, prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }
  const wrapBase = await buildWrapMeta(vmk, [factor])
  const wrapMeta = withRootMetadata(wrapBase, await protectRootMetadata(vmk, rootMetadata, wrapBase))
  const record = { name: options.name ?? "PUBLIC_SOLANA_TEST_KEY", kind: "keypair" as const, curve: "ed25519" as const, publicKey }
  const signingContext = { kind: "solana-transaction-v1" as const, messageHex }
  const request: SignRequest = {
    material: { name: record.name, envelope: packProtectedRecord(await sealProtected(seed, vmk, record), wrapMeta, record) },
    scheme: "ed25519",
    signingContext,
    context: {
      v: 2, purpose: "sign", requestId: crypto.randomUUID(),
      display: {
        secrets: [{ name: record.name, kind: "keypair" }],
        command: "vibe vault sign PUBLIC_SOLANA_TEST_KEY",
        ...(options.sessionLabel ? { sessionLabel: options.sessionLabel } : {}),
      },
      release: { name: record.name, scheme: "ed25519", messageHex, publicKey, signingContext: { ...signingContext } },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      signature: { alg: "ed25519", keyId: "public-test-daemon", value: "" },
    },
  }
  const resign = () => { request.context.signature.value = bytesToBase64(ed25519.sign(new TextEncoder().encode(signedOperationContextMessage(request.context)), daemonKey)) }
  resign()
  seed.fill(0)
  return { request, vmk, publicKey, record, wrapMeta, rootMetadata, resign }
}

/** `raw` is an instruction for an invented program, which no decoder knows. */
export type SyntheticTransferKind = "sol" | "spl" | "spl-checked" | "raw"

/**
 * A legacy Solana message of several instructions, for cases the acceptance corpus
 * has no vector for. SYNTHETIC: the signer and fee payer is the published
 * RFC 8032 test 1 key, every other account is a SHA-256 of a label, and the
 * blockhash is invented. The returned expectations are the construction inputs.
 */
export function syntheticTransfersMessage(kinds: SyntheticTransferKind[]) {
  const account = (label: string) => sha256(new TextEncoder().encode(`avibe synthetic test account: ${label}`))
  const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g)!.map((byte) => Number.parseInt(byte, 16)))
  const u64 = (value: bigint) => { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigUint64(0, value, true); return bytes }
  const signer = fromHex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
  const systemProgram = new Uint8Array(32)
  const tokenProgram = fromHex("06ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a9")
  const writable: Uint8Array[] = []
  const readonly: Uint8Array[] = []
  const rawProgram = account("undecoded program")
  const plans = kinds.map((kind, index) => {
    if (kind === "raw") return { kind, data: Uint8Array.of(0xde, 0xad, 0xbe, 0xef), accounts: [signer], program: rawProgram }
    const amount = BigInt(index + 1) * (kind === "sol" ? 250_000_000n : 1_500_000n)
    const destination = account(`transfer ${index + 1} destination`)
    if (kind === "sol") {
      writable.push(destination)
      return { kind, amount, destination, data: Uint8Array.of(2, 0, 0, 0, ...u64(amount)), accounts: [signer, destination], program: systemProgram }
    }
    const source = account(`transfer ${index + 1} source token account`)
    writable.push(source, destination)
    if (kind === "spl") return { kind, amount, destination, data: Uint8Array.of(3, ...u64(amount)), accounts: [source, destination, signer], program: tokenProgram }
    const mint = account(`transfer ${index + 1} mint`)
    readonly.push(mint)
    return { kind, amount, destination, mint, data: Uint8Array.of(12, ...u64(amount), 6), accounts: [source, mint, destination, signer], program: tokenProgram }
  })
  if (kinds.includes("sol")) readonly.push(systemProgram)
  if (kinds.some((kind) => kind === "spl" || kind === "spl-checked")) readonly.push(tokenProgram)
  if (kinds.includes("raw")) readonly.push(rawProgram)
  const keys = [signer, ...writable, ...readonly]
  if (keys.length > 127) throw new Error("synthetic message supports at most 127 accounts")
  const indexOf = (key: Uint8Array) => keys.indexOf(key)
  const bytes = [
    1, 0, readonly.length, keys.length, ...keys.flatMap((key) => [...key]),
    ...account("blockhash"),
    plans.length,
    ...plans.flatMap((plan) => [indexOf(plan.program), plan.accounts.length, ...plan.accounts.map(indexOf), plan.data.length, ...plan.data]),
  ]
  return {
    messageHex: bytesToHex(Uint8Array.from(bytes)),
    transfers: plans.flatMap((plan) => plan.kind === "raw" ? [] : [{
      kind: plan.kind, destination: base58Encode(plan.destination), amount: plan.amount.toString(),
      ...("mint" in plan && plan.mint ? { mint: base58Encode(plan.mint) } : {}),
    }]),
  }
}
