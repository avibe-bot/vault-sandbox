import {
  deriveHdAccounts, decodeHdPayload, encodeHdPayload, exactHdFields, hdAccount0Addresses,
  hdObject, hdPayloadFromWords, HD_PROFILE, parseHdRecordMetadata, parseHdWrapJson,
  strictHdBase64, wipeHdPayload, type HdAccount0, type HdPublicRow,
} from "./protectedHd"
import {
  openProtected, packProtectedRecord, protectedRecordContextFromMetadata, sealProtected,
  unpackProtectedRecord, type ProtectedRecordEnvelope,
} from "./vaultCrypto"
import { stableJson } from "./operationContext"

export type SealedHdWallet = { envelope: ProtectedRecordEnvelope; accounts: HdPublicRow[]; expectedAccount0: HdAccount0 }
export function validateHdBaseRoot(value: unknown): string {
  const wrap = parseHdWrapJson(value)
  if (wrap.v !== 1 || !Array.isArray(wrap.copies) || wrap.copies.length === 0
    || ["record_meta", "dek_nonce", "wrapped_dek"].some((key) => Object.hasOwn(wrap, key))
    || (wrap.scheme !== undefined && wrap.scheme !== "machine-aesgcm-v1")) throw new Error("protected HD requires an existing base/root wrap")
  for (const candidate of wrap.copies) {
    const copy = hdObject(candidate)
    if (copy.kind !== "passkey" || copy.kdf !== "webauthn-prf-hkdf-sha256"
      || (copy.credential_id !== undefined && (typeof copy.credential_id !== "string" || copy.credential_id.length === 0))) throw new Error("invalid protected HD passkey copy")
    strictHdBase64(copy.prf_salt, [32])
    strictHdBase64(copy.nonce, [12])
    strictHdBase64(copy.wrapped, [48])
  }
  return value as string
}
/** Full reusable-root projection: no scope-only identity or legacy root rewriting. */
export function hdRootIdentity(wrapMeta: string): string {
  const wrap = parseHdWrapJson(wrapMeta)
  for (const key of ["scheme", "record_meta", "dek_nonce", "wrapped_dek"]) delete wrap[key]
  return stableJson(wrap)
}
export function parseSealedHdWallet(value: unknown, name: string, root: string): SealedHdWallet {
  const input = hdObject(value)
  exactHdFields(input, ["envelope", "accounts", "expectedAccount0"])
  const envelope = hdObject(input.envelope)
  exactHdFields(envelope, ["ciphertext", "nonce", "wrap_meta"])
  if (typeof envelope.ciphertext !== "string" || typeof envelope.nonce !== "string" || typeof envelope.wrap_meta !== "string") throw new Error("invalid protected HD envelope")
  // The name is separately authenticated by both AADs on open, never a returned caller label.
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("invalid protected HD name")
  const material = envelope as ProtectedRecordEnvelope
  const unpacked = unpackProtectedRecord(material)
  if (unpacked.recordMetadata?.kind !== "hd-seed" || hdRootIdentity(material.wrap_meta) !== hdRootIdentity(root)) throw new Error("protected HD result root mismatch")
  const metadata = parseHdRecordMetadata({ kind: "hd-seed", profile: HD_PROFILE, accounts: input.accounts })
  if (stableJson(metadata) !== stableJson(unpacked.recordMetadata)) throw new Error("protected HD result table mismatch")
  const addresses = hdObject(input.expectedAccount0)
  exactHdFields(addresses, ["eth", "btc_legacy", "btc_segwit", "btc_taproot", "solana"])
  const expectedAccount0 = hdAccount0Addresses(metadata.accounts[0])
  if (stableJson(addresses) !== stableJson(expectedAccount0)) throw new Error("protected HD result account0 mismatch")
  return { envelope: { ...material }, accounts: metadata.accounts, expectedAccount0 }
}

/** Popup-local custody only: final words/passphrase enter here, never an RPC parser. */
export async function sealHdWalletLocally(input: {
  name: string; words: string; passphrase: string; vmk: Uint8Array; wrapMeta: string;
  assertCurrent: () => void;
}): Promise<SealedHdWallet> {
  input.assertCurrent()
  validateHdBaseRoot(input.wrapMeta)
  const payload = hdPayloadFromWords(input.words, input.passphrase)
  let encoded: Uint8Array | undefined
  let reopened: Uint8Array | undefined
  let decoded: ReturnType<typeof decodeHdPayload> | undefined
  try {
    const accounts = deriveHdAccounts(payload.seed)
    input.assertCurrent()
    const metadata = { kind: "hd-seed" as const, profile: HD_PROFILE, accounts }
    const context = protectedRecordContextFromMetadata(input.name, metadata)
    encoded = encodeHdPayload(payload)
    const sealed = await sealProtected(encoded, input.vmk, context)
    input.assertCurrent()
    const envelope = packProtectedRecord(sealed, input.wrapMeta, context)
    const result = { envelope, accounts, expectedAccount0: hdAccount0Addresses(accounts[0]) }
    reopened = await openProtected(sealed, input.vmk, context)
    input.assertCurrent()
    decoded = decodeHdPayload(reopened)
    const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i])
    if (!equal(decoded.entropy, payload.entropy) || !equal(decoded.seed, payload.seed) || decoded.passphraseRequired !== payload.passphraseRequired
      || stableJson(deriveHdAccounts(decoded.seed)) !== stableJson(accounts)) throw new Error("protected HD creation reopen mismatch")
    const checked = parseSealedHdWallet(result, input.name, input.wrapMeta)
    input.assertCurrent()
    return checked
  } finally {
    encoded?.fill(0)
    reopened?.fill(0)
    wipeHdPayload(decoded)
    wipeHdPayload(payload)
    // VMK belongs to the popup's outer finally; this helper never commits a session.
  }
}
