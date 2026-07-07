import {
  base64ToBytes,
  bytesToBase64,
  copyBytes,
  webAuthnPrfExtensionInput,
  type PasskeyPrfSalt,
} from "./vaultCrypto"

const WEBAUTHN_RP_NAME = "Avibe Vault"
const DEFAULT_USER_NAME = "avibe-vault"

type JsonRecord = Record<string, unknown>

export type SerializedCredential = {
  id: string
  rawId: string
  type: string
  response: Record<string, unknown>
}

export type AuthzRegistration =
  | SerializedCredential
  | {
      challenge_id: string
      credential: SerializedCredential
    }

export type CreationOptionsResult = {
  options: PublicKeyCredentialCreationOptions
  challengeId?: string
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}

function randomChallenge(): ArrayBuffer {
  return bufferSource(crypto.getRandomValues(new Uint8Array(32)))
}

function tryDecodeBase64(value: string): Uint8Array | null {
  try {
    return base64ToBytes(value)
  } catch {
    return null
  }
}

function bytesFromUnknown(value: unknown, fallbackText?: string): ArrayBuffer {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return bufferSource(copyBytes(value))
  }
  if (typeof value === "string") {
    const decoded = tryDecodeBase64(value)
    return bufferSource(decoded ?? new TextEncoder().encode(value))
  }
  if (Array.isArray(value)) {
    return bufferSource(Uint8Array.from(value))
  }
  if (fallbackText !== undefined) {
    return bufferSource(new TextEncoder().encode(fallbackText))
  }
  throw new Error("webauthn bytes are missing")
}

function userHandleBytes(vaultUserHandle: string): ArrayBuffer {
  const bytes = bytesFromUnknown(vaultUserHandle)
  if (bytes.byteLength === 0 || bytes.byteLength > 64) {
    throw new Error("vault user handle must be 1-64 bytes")
  }
  return bytes
}

function credentialDescriptors(value: unknown): PublicKeyCredentialDescriptor[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((entry) => {
    const record = asRecord(entry)
    if (!record || record.type !== "public-key") {
      throw new Error("invalid WebAuthn credential descriptor")
    }
    return {
      type: "public-key",
      id: bytesFromUnknown(record.id),
      ...(Array.isArray(record.transports) ? { transports: record.transports as AuthenticatorTransport[] } : {}),
    }
  })
}

function pubKeyCredParams(value: unknown): PublicKeyCredentialParameters[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ]
  }
  return value.map((entry) => {
    const record = asRecord(entry)
    if (!record || record.type !== "public-key" || typeof record.alg !== "number") {
      throw new Error("invalid WebAuthn pubKeyCredParams")
    }
    return { type: "public-key", alg: record.alg }
  })
}

function authenticatorSelection(value: unknown): AuthenticatorSelectionCriteria {
  const record = asRecord(value) ?? {}
  return {
    ...record,
    residentKey: "required",
    userVerification: "required",
  } as AuthenticatorSelectionCriteria
}

function attestation(value: unknown): AttestationConveyancePreference | undefined {
  if (value === "none" || value === "indirect" || value === "direct" || value === "enterprise") return value
  return undefined
}

function extensions(value: unknown): AuthenticationExtensionsClientInputs {
  const record = asRecord(value) ?? {}
  return { ...record, prf: asRecord(record.prf) ?? {} } as AuthenticationExtensionsClientInputs
}

export function rpId(): string {
  return window.location.hostname
}

export function passkeyCreationOptions(input: {
  rpId: string
  vaultUserHandle: string
  displayName: string
  authzCreationOptions?: unknown
}): CreationOptionsResult {
  const raw = asRecord(input.authzCreationOptions)
  const serverWebauthn = asRecord(raw?.webauthn)
  const json = serverWebauthn ?? raw
  const challengeId = typeof raw?.challenge_id === "string" ? raw.challenge_id : undefined
  const rpRecord = asRecord(json?.rp)
  const serverRpId = typeof rpRecord?.id === "string" ? rpRecord.id : undefined
  if (serverRpId && serverRpId !== input.rpId) {
    throw new Error("webauthn rp_id does not match sandbox host")
  }

  if (!json) {
    return {
      options: {
        rp: { name: WEBAUTHN_RP_NAME, id: input.rpId },
        user: {
          id: userHandleBytes(input.vaultUserHandle),
          name: input.vaultUserHandle || DEFAULT_USER_NAME,
          displayName: input.displayName || WEBAUTHN_RP_NAME,
        },
        challenge: randomChallenge(),
        pubKeyCredParams: pubKeyCredParams(undefined),
        authenticatorSelection: authenticatorSelection(undefined),
        extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
      },
    }
  }

  const user = asRecord(json.user)
  if (!user) throw new Error("webauthn user is missing")
  return {
    options: {
      rp: {
        name: typeof rpRecord?.name === "string" ? rpRecord.name : WEBAUTHN_RP_NAME,
        id: input.rpId,
      },
      user: {
        id: bytesFromUnknown(user.id, input.vaultUserHandle),
        name: typeof user.name === "string" ? user.name : input.vaultUserHandle || DEFAULT_USER_NAME,
        displayName: typeof user.displayName === "string" ? user.displayName : input.displayName || WEBAUTHN_RP_NAME,
      },
      challenge: bytesFromUnknown(json.challenge),
      pubKeyCredParams: pubKeyCredParams(json.pubKeyCredParams),
      authenticatorSelection: authenticatorSelection(json.authenticatorSelection),
      extensions: extensions(json.extensions),
      ...(credentialDescriptors(json.excludeCredentials)
        ? { excludeCredentials: credentialDescriptors(json.excludeCredentials) }
        : {}),
      ...(typeof json.timeout === "number" ? { timeout: json.timeout } : {}),
      ...(attestation(json.attestation) ? { attestation: attestation(json.attestation) } : {}),
    },
    ...(challengeId ? { challengeId } : {}),
  }
}

function singlePasskeyEntry(entries: PasskeyPrfSalt[]): PasskeyPrfSalt {
  if (entries.length === 0) throw new Error("passkey-not-configured")
  if (entries.length > 1) throw new Error("passkey-multiple-not-supported")
  return entries[0]
}

export function passkeyPrfAssertionOptions(entries: PasskeyPrfSalt[], currentRpId: string): PublicKeyCredentialRequestOptions {
  const entry = singlePasskeyEntry(entries)
  const options: PublicKeyCredentialRequestOptions = {
    challenge: randomChallenge(),
    rpId: currentRpId,
    userVerification: "required",
    extensions: webAuthnPrfExtensionInput(entry.prfSalt) as AuthenticationExtensionsClientInputs,
  }
  if (entry.credentialId) {
    options.allowCredentials = [
      {
        type: "public-key",
        id: bufferSource(base64ToBytes(entry.credentialId)),
      },
    ]
  }
  return options
}

export function passkeyUserVerificationOptions(
  entries: PasskeyPrfSalt[],
  currentRpId: string,
  challenge: Uint8Array,
): PublicKeyCredentialRequestOptions {
  const options: PublicKeyCredentialRequestOptions = {
    challenge: bufferSource(challenge),
    rpId: currentRpId,
    userVerification: "required",
  }
  const descriptors = entries
    .filter((entry) => entry.credentialId)
    .map((entry) => ({ type: "public-key" as const, id: bufferSource(base64ToBytes(entry.credentialId as string)) }))
  if (descriptors.length > 0) options.allowCredentials = descriptors
  return options
}

export function passkeyAssertionOptionsFromJson(webauthn: unknown, currentRpId = rpId()): PublicKeyCredentialRequestOptions {
  const record = asRecord(webauthn)
  if (!record) throw new Error("webauthn assertion options are missing")
  const suppliedRp = typeof record.rpId === "string" ? record.rpId : typeof record.rp_id === "string" ? record.rp_id : undefined
  if (suppliedRp && suppliedRp !== currentRpId) {
    throw new Error("webauthn rpId does not match sandbox host")
  }
  return {
    challenge: bytesFromUnknown(record.challenge),
    rpId: currentRpId,
    userVerification: "required",
    ...(credentialDescriptors(record.allowCredentials) ? { allowCredentials: credentialDescriptors(record.allowCredentials) } : {}),
    ...(typeof record.timeout === "number" ? { timeout: record.timeout } : {}),
  }
}

function serializeCredentialBase(credential: PublicKeyCredential): Pick<SerializedCredential, "id" | "rawId" | "type"> {
  return {
    id: credential.id,
    rawId: bytesToBase64(credential.rawId),
    type: credential.type,
  }
}

export function serializeAttestationCredential(credential: PublicKeyCredential): SerializedCredential {
  const response = credential.response as AuthenticatorAttestationResponse
  const transports = typeof response.getTransports === "function" ? response.getTransports() : []
  return {
    ...serializeCredentialBase(credential),
    response: {
      clientDataJSON: bytesToBase64(response.clientDataJSON),
      attestationObject: bytesToBase64(response.attestationObject),
      transports,
    },
  }
}

export function serializeAssertionCredential(credential: PublicKeyCredential): SerializedCredential {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    ...serializeCredentialBase(credential),
    response: {
      clientDataJSON: bytesToBase64(response.clientDataJSON),
      authenticatorData: bytesToBase64(response.authenticatorData),
      signature: bytesToBase64(response.signature),
      userHandle: response.userHandle ? bytesToBase64(response.userHandle) : null,
    },
  }
}

export function readPasskeyPrfResult(credential: PublicKeyCredential | null): Uint8Array {
  const ext = credential?.getClientExtensionResults() as
    | { prf?: { results?: { first?: ArrayBuffer | ArrayBufferView | ArrayLike<number> } } }
    | undefined
  const first = ext?.prf?.results?.first
  if (!first) throw new Error("passkey-prf-unavailable")
  const prfOutput = copyBytes(first, "passkey PRF output")
  if (prfOutput.byteLength === 0) throw new Error("passkey-prf-unavailable")
  return prfOutput
}

export async function assertPasskeyPrf(
  entries: PasskeyPrfSalt[],
  currentRpId: string,
): Promise<{ prfOutput: Uint8Array; prfSalt: Uint8Array; credentialId: string }> {
  const assertion = (await navigator.credentials.get({
    publicKey: passkeyPrfAssertionOptions(entries, currentRpId),
  })) as PublicKeyCredential | null
  if (!assertion) throw new Error("passkey-cancelled")
  const prfOutput = readPasskeyPrfResult(assertion)
  const credentialId = bytesToBase64(assertion.rawId)
  const used = entries.find((entry) => entry.credentialId === credentialId)
  return { prfOutput, prfSalt: used?.prfSalt ?? entries[0].prfSalt, credentialId }
}

export async function confirmWithPasskeyUv(entries: PasskeyPrfSalt[], currentRpId: string, challenge: Uint8Array): Promise<void> {
  const assertion = (await navigator.credentials.get({
    publicKey: passkeyUserVerificationOptions(entries, currentRpId, challenge),
  })) as PublicKeyCredential | null
  if (!assertion) throw new Error("passkey-cancelled")
}

export async function produceAssertionCredential(webauthn: unknown): Promise<SerializedCredential> {
  const assertion = (await navigator.credentials.get({
    publicKey: passkeyAssertionOptionsFromJson(webauthn),
  })) as PublicKeyCredential | null
  if (!assertion) throw new Error("passkey-cancelled")
  return serializeAssertionCredential(assertion)
}

export async function createPasskeyCredential(input: {
  rpId: string
  vaultUserHandle: string
  displayName: string
  authzCreationOptions?: unknown
}): Promise<{ credentialId: string; authzRegistration?: AuthzRegistration }> {
  const { options, challengeId } = passkeyCreationOptions(input)
  const created = (await navigator.credentials.create({
    publicKey: options,
  })) as PublicKeyCredential | null
  if (!created) throw new Error("passkey-cancelled")
  const credentialId = bytesToBase64(created.rawId)
  const credential = serializeAttestationCredential(created)
  const shouldReturnRegistration = input.authzCreationOptions !== undefined
  return {
    credentialId,
    ...(shouldReturnRegistration
      ? { authzRegistration: challengeId ? { challenge_id: challengeId, credential } : credential }
      : {}),
  }
}
