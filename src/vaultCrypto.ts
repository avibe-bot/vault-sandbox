export const WRAP_META_VERSION = 1

const KEY_BYTES = 32
const NONCE_BYTES = 12
const PASSKEY_PRF_SALT_BYTES = 32
const PASSKEY_HKDF_INFO = "avault:protected-vmk:kek-passkey:v1"

const textEncoder = new TextEncoder()

type BytesLike = Uint8Array | ArrayBuffer | ArrayBufferView | ArrayLike<number>

export type PasskeyWrapFactor = {
  kind: "passkey"
  prfOutput: BytesLike
  prfSalt: BytesLike
  credentialId?: string
}

export type PasskeyUnlockFactor = {
  kind: "passkey"
  prfOutput: BytesLike
  prfSalt?: BytesLike
}

export type PasskeyPrfCopy = {
  kind: "passkey"
  kdf: "webauthn-prf-hkdf-sha256"
  prf_salt: string
  nonce: string
  wrapped: string
  credential_id?: string
}

export type WrapMeta = {
  v: typeof WRAP_META_VERSION
  copies: PasskeyPrfCopy[]
  rp_id?: string
  vault_user_handle?: string
  [key: string]: unknown
}

export type WebAuthnPrfExtensionInput = {
  prf: {
    eval: {
      first: ArrayBuffer
    }
  }
}

export type PasskeyPrfSalt = {
  prfSalt: Uint8Array
  credentialId?: string
}

function toUint8Array(value: BytesLike, field = "bytes"): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0))
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
  if (typeof value === "object" && value !== null && typeof value.length === "number") {
    return Uint8Array.from(value)
  }
  throw new TypeError(`${field} must be bytes`)
}

function toArrayBuffer(value: BytesLike): ArrayBuffer {
  const bytes = toUint8Array(value)
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  bytes.fill(0)
  return out
}

function utf8(value: string): Uint8Array {
  return textEncoder.encode(value)
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length)
  crypto.getRandomValues(out)
  return out
}

export function bytesToBase64(value: BytesLike): string {
  const bytes = toUint8Array(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  bytes.fill(0)
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

export function copyBytes(value: BytesLike, field = "bytes"): Uint8Array {
  return toUint8Array(value, field)
}

function assertLength(bytes: Uint8Array, length: number, field: string): void {
  if (bytes.length !== length) {
    throw new Error(`${field} must be ${length} bytes`)
  }
}

function wipeArrayBuffer(buffer: ArrayBuffer | undefined): void {
  if (buffer) {
    new Uint8Array(buffer).fill(0)
  }
}

async function aesgcmEncrypt(
  key: BytesLike,
  nonce: BytesLike,
  data: BytesLike,
  additionalData?: BytesLike,
): Promise<Uint8Array> {
  let keyBuffer: ArrayBuffer | undefined
  let nonceBuffer: ArrayBuffer | undefined
  let dataBuffer: ArrayBuffer | undefined
  let additionalDataBuffer: ArrayBuffer | undefined
  try {
    keyBuffer = toArrayBuffer(key)
    nonceBuffer = toArrayBuffer(nonce)
    dataBuffer = toArrayBuffer(data)
    additionalDataBuffer = additionalData ? toArrayBuffer(additionalData) : undefined
    const cryptoKey = await crypto.subtle.importKey("raw", keyBuffer, "AES-GCM", false, ["encrypt"])
    const ct = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonceBuffer,
        ...(additionalDataBuffer ? { additionalData: additionalDataBuffer } : {}),
      },
      cryptoKey,
      dataBuffer,
    )
    return new Uint8Array(ct)
  } finally {
    wipeArrayBuffer(keyBuffer)
    wipeArrayBuffer(nonceBuffer)
    wipeArrayBuffer(dataBuffer)
    wipeArrayBuffer(additionalDataBuffer)
  }
}

async function aesgcmDecrypt(
  key: BytesLike,
  nonce: BytesLike,
  data: BytesLike,
  additionalData?: BytesLike,
): Promise<Uint8Array> {
  let keyBuffer: ArrayBuffer | undefined
  let nonceBuffer: ArrayBuffer | undefined
  let dataBuffer: ArrayBuffer | undefined
  let additionalDataBuffer: ArrayBuffer | undefined
  try {
    keyBuffer = toArrayBuffer(key)
    nonceBuffer = toArrayBuffer(nonce)
    dataBuffer = toArrayBuffer(data)
    additionalDataBuffer = additionalData ? toArrayBuffer(additionalData) : undefined
    const cryptoKey = await crypto.subtle.importKey("raw", keyBuffer, "AES-GCM", false, ["decrypt"])
    const pt = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: nonceBuffer,
        ...(additionalDataBuffer ? { additionalData: additionalDataBuffer } : {}),
      },
      cryptoKey,
      dataBuffer,
    )
    return new Uint8Array(pt)
  } finally {
    wipeArrayBuffer(keyBuffer)
    wipeArrayBuffer(nonceBuffer)
    wipeArrayBuffer(dataBuffer)
    wipeArrayBuffer(additionalDataBuffer)
  }
}

async function hkdfSha256(ikm: BytesLike, salt: BytesLike, info: BytesLike, length: number): Promise<Uint8Array> {
  let ikmBuffer: ArrayBuffer | undefined
  let saltBuffer: ArrayBuffer | undefined
  let infoBuffer: ArrayBuffer | undefined
  try {
    ikmBuffer = toArrayBuffer(ikm)
    saltBuffer = toArrayBuffer(salt)
    infoBuffer = toArrayBuffer(info)
    const key = await crypto.subtle.importKey("raw", ikmBuffer, "HKDF", false, ["deriveBits"])
    const bits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: saltBuffer,
        info: infoBuffer,
      },
      key,
      length * 8,
    )
    return new Uint8Array(bits)
  } finally {
    wipeArrayBuffer(ikmBuffer)
    wipeArrayBuffer(saltBuffer)
    wipeArrayBuffer(infoBuffer)
  }
}

export async function derivePasskeyKek(prfOutput: BytesLike, prfSalt: BytesLike): Promise<Uint8Array> {
  const output = toUint8Array(prfOutput, "passkey PRF output")
  try {
    const salt = toUint8Array(prfSalt, "passkey PRF salt")
    try {
      if (output.length === 0) {
        throw new Error("passkey PRF output is empty")
      }
      assertLength(salt, PASSKEY_PRF_SALT_BYTES, "passkey PRF salt")
      return await hkdfSha256(output, salt, utf8(PASSKEY_HKDF_INFO), KEY_BYTES)
    } finally {
      salt.fill(0)
    }
  } finally {
    output.fill(0)
  }
}

export function newVmk(): Uint8Array {
  return randomBytes(KEY_BYTES)
}

export function newPasskeyPrfSalt(): Uint8Array {
  return randomBytes(PASSKEY_PRF_SALT_BYTES)
}

export function webAuthnPrfExtensionInput(prfSalt: BytesLike): WebAuthnPrfExtensionInput {
  const salt = toUint8Array(prfSalt, "passkey PRF salt")
  try {
    assertLength(salt, PASSKEY_PRF_SALT_BYTES, "passkey PRF salt")
    return { prf: { eval: { first: toArrayBuffer(salt) } } }
  } finally {
    salt.fill(0)
  }
}

export function parseWrapMeta(wrapMeta: string | WrapMeta): WrapMeta {
  const parsed = typeof wrapMeta === "string" ? JSON.parse(wrapMeta) : wrapMeta
  if (parsed?.v !== WRAP_META_VERSION || !Array.isArray(parsed.copies)) {
    throw new Error("invalid protected wrap_meta")
  }
  return parsed as WrapMeta
}

async function passkeyCopy(vmk: BytesLike, factor: PasskeyWrapFactor): Promise<PasskeyPrfCopy> {
  const vmkBytes = toUint8Array(vmk, "VMK")
  const nonce = randomBytes(NONCE_BYTES)
  let kek: Uint8Array | undefined
  let prfSalt: Uint8Array | undefined
  try {
    assertLength(vmkBytes, KEY_BYTES, "VMK")
    prfSalt = toUint8Array(factor.prfSalt, "passkey PRF salt")
    assertLength(prfSalt, PASSKEY_PRF_SALT_BYTES, "passkey PRF salt")
    kek = await derivePasskeyKek(factor.prfOutput, prfSalt)
    const wrapped = await aesgcmEncrypt(kek, nonce, vmkBytes)
    return {
      kind: "passkey",
      kdf: "webauthn-prf-hkdf-sha256",
      prf_salt: bytesToBase64(prfSalt),
      nonce: bytesToBase64(nonce),
      wrapped: bytesToBase64(wrapped),
      ...(factor.credentialId ? { credential_id: factor.credentialId } : {}),
    }
  } finally {
    kek?.fill(0)
    prfSalt?.fill(0)
    vmkBytes.fill(0)
  }
}

export async function buildWrapMeta(vmk: BytesLike, factors: PasskeyWrapFactor[]): Promise<string> {
  const vmkBytes = toUint8Array(vmk, "VMK")
  try {
    assertLength(vmkBytes, KEY_BYTES, "VMK")
    if (factors.length === 0) {
      throw new Error("at least one protected unlock factor is required")
    }
    const copies: PasskeyPrfCopy[] = []
    for (const factor of factors) {
      copies.push(await passkeyCopy(vmkBytes, factor))
    }
    return JSON.stringify({ v: WRAP_META_VERSION, copies } satisfies WrapMeta)
  } finally {
    vmkBytes.fill(0)
  }
}

async function unwrapPasskeyCopy(copy: PasskeyPrfCopy, factor: PasskeyUnlockFactor): Promise<Uint8Array> {
  const prfSalt = base64ToBytes(copy.prf_salt)
  if (factor.prfSalt && bytesToBase64(factor.prfSalt) !== copy.prf_salt) {
    prfSalt.fill(0)
    throw new Error("passkey PRF salt does not match copy")
  }
  const kek = await derivePasskeyKek(factor.prfOutput, prfSalt)
  try {
    return await aesgcmDecrypt(kek, base64ToBytes(copy.nonce), base64ToBytes(copy.wrapped))
  } finally {
    kek.fill(0)
    prfSalt.fill(0)
  }
}

export async function unwrapVmk(wrapMeta: string | WrapMeta, factor: PasskeyUnlockFactor): Promise<Uint8Array> {
  const meta = parseWrapMeta(wrapMeta)
  for (const copy of meta.copies) {
    try {
      if (copy.kind === "passkey") {
        const vmk = await unwrapPasskeyCopy(copy, factor)
        try {
          assertLength(vmk, KEY_BYTES, "VMK")
          return vmk
        } catch (error) {
          vmk.fill(0)
          throw error
        }
      }
    } catch {
      // Wrong factor or corrupt copy; try the next independent VMK copy.
    }
  }
  throw new Error("no protected VMK copy could be unwrapped")
}

export function passkeyPrfSalts(wrapMeta: string | WrapMeta): Uint8Array[] {
  return passkeyPrfSaltEntries(wrapMeta).map((entry) => entry.prfSalt)
}

export function passkeyPrfSaltEntries(wrapMeta: string | WrapMeta): PasskeyPrfSalt[] {
  return parseWrapMeta(wrapMeta)
    .copies.filter((copy): copy is PasskeyPrfCopy => copy.kind === "passkey")
    .map((copy) => ({
      prfSalt: base64ToBytes(copy.prf_salt),
      ...(copy.credential_id ? { credentialId: copy.credential_id } : {}),
    }))
}

export function withWrapMetaMetadata(
  wrapMeta: string,
  metadata: { rpId: string; vaultUserHandle: string },
): string {
  const meta = parseWrapMeta(wrapMeta)
  return JSON.stringify({
    ...meta,
    rp_id: metadata.rpId,
    vault_user_handle: metadata.vaultUserHandle,
  } satisfies WrapMeta)
}

export function baseVmkWrapMeta(wrapMeta: string): string {
  const parsed = parseWrapMeta(wrapMeta)
  delete parsed.dek_nonce
  delete parsed.wrapped_dek
  return JSON.stringify(parsed)
}
