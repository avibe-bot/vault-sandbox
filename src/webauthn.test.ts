import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPasskeyCredential, passkeyCreationOptions, passkeyPrfAssertionOptions, passkeyUserVerificationOptions } from "./webauthn"

// Public synthetic IDs only. No real credential, PRF, key generation or signing.
const rpId = "sandbox.avibe.bot"
const legacyId = "YXZpYmUtdmF1bHQ=" // UTF-8 avibe-vault, as issued by old Avibe.
const instanceA = Uint8Array.from({ length: 32 }, (_, index) => index)
const instanceB = Uint8Array.from({ length: 32 }, (_, index) => 255 - index)
// Python's base64.b64encode(...).decode('ascii'), matching the real daemon
// storage/vault_webauthn.py:b64encode (not a URL/text fallback).
const encodedInstanceA = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
const encodedInstanceB = "//79/Pv6+fj39vX08/Lx8O/u7ezr6uno5+bl5OPi4eA="
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const input = { rpId, vaultUserHandle: "avibe-vault", displayName: "Avibe Vault" }
function serverOptions(id: unknown = legacyId) {
  return {
    challenge_id: "public-registration-challenge",
    webauthn: {
      rp: { id: rpId, name: "Avibe Vault" },
      user: { id, name: "avibe-vault", displayName: "Avibe Vault" },
      challenge: "AQIDBA==",
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: { prf: {} },
    },
  }
}
const create = vi.fn()
beforeEach(() => {
  create.mockReset().mockResolvedValue({
    id: "public-credential", rawId: new Uint8Array([1, 2, 3]).buffer, type: "public-key",
    response: { clientDataJSON: new Uint8Array([4]).buffer, attestationObject: new Uint8Array([5]).buffer },
  })
  vi.stubGlobal("navigator", { credentials: { create } })
})
afterEach(() => vi.unstubAllGlobals())

async function createdUserId(authzCreationOptions: unknown): Promise<Uint8Array> {
  await createPasskeyCredential({ ...input, authzCreationOptions })
  const options = create.mock.calls.at(-1)![0].publicKey as PublicKeyCredentialCreationOptions
  expect(options.rp.id).toBe(rpId)
  expect(options.authenticatorSelection).toMatchObject({ residentKey: "required", userVerification: "required" })
  expect(options.extensions).toEqual({ prf: {} })
  expect(new Uint8Array(options.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3, 4]))
  expect(input.vaultUserHandle).toBe("avibe-vault")
  return new Uint8Array(options.user.id as ArrayBuffer)
}

describe("supplied server registration identity at the real create adapter", () => {
  it("preserves the old producer's serialized legacy ID and registration envelope", async () => {
    const result = await createPasskeyCredential({ ...input, authzCreationOptions: JSON.parse(JSON.stringify(serverOptions())) })
    expect(new Uint8Array(create.mock.calls[0][0].publicKey.user.id)).toEqual(new TextEncoder().encode("avibe-vault"))
    expect(result).toMatchObject({ credentialId: "AQID", authzRegistration: { challenge_id: "public-registration-challenge", credential: { rawId: "AQID" } } })
  })

  it("preserves independent 32-byte instance IDs through wrapped and direct options", async () => {
    expect(await createdUserId(JSON.parse(JSON.stringify(serverOptions(encodedInstanceA))))).toEqual(instanceA)
    expect(await createdUserId(serverOptions(encodedInstanceB).webauthn)).toEqual(instanceB)
    expect(new Uint8Array(create.mock.calls[0][0].publicKey.user.id)).not.toEqual(new Uint8Array(create.mock.calls[1][0].publicKey.user.id))
    expect(create.mock.calls[1][0].publicKey.user.name).toBe("avibe-vault")
  })

  it.each([1, 2, 3, 32, 63, 64])("roundtrips %i bytes in canonical padded/unpadded base64 and base64url", async (length) => {
    const bytes = Uint8Array.from({ length }, (_, index) => index % 2 ? 255 : 251)
    const standard = encode(bytes)
    const url = standard.replace(/\+/g, "-").replace(/\//g, "_")
    for (const value of new Set([standard, standard.replace(/=+$/, ""), url, url.replace(/=+$/, "")])) {
      expect(await createdUserId(serverOptions(value))).toEqual(bytes)
    }
  })

  const invalidIds: Array<[string, unknown]> = [
    ["missing", undefined], ["null", null], ["boolean", false], ["number", 42], ["object", {}],
    ["array", [1, 2]], ["lossy array", [256, -1, 1.5]], ["array buffer", new Uint8Array([1]).buffer],
    ["byte view", new Uint8Array([1])], ["data view", new DataView(new ArrayBuffer(1))],
    ["empty", ""], ["empty padding", "=="], ["plain text fallback", "not base64!"],
    ["legacy text is not an encoded ID", "avibe-vault"], ["whitespace", "YQ==\n"], ["embedded space", "Y Q=="],
    ["invalid alphabet", "YQ$="], ["mixed alphabets", "+_8="], ["nonzero pad bits", "YR=="],
    ["nonzero unpadded bits", "YR"], ["nonzero two-byte pad bits", "YWJ="], ["short padding", "YQ="],
    ["excess padding", "YQ==="], ["padding inside", "Y=Q="], ["one character", "Y"],
    ["65 bytes", encode(new Uint8Array(65))], ["66 bytes", encode(new Uint8Array(66))],
    ["unbounded text", "A".repeat(100_000)],
  ]
  it.each(invalidIds)("rejects %s user.id before credentials.create, without a scope fallback", (_label, id) => {
    const supplied = serverOptions()
    Object.assign(supplied.webauthn.user, { id })
    expect(() => createPasskeyCredential({ ...input, authzCreationOptions: supplied })).toThrow(/webauthn user.id/)
    expect(create).not.toHaveBeenCalled()
  })

  const direct = serverOptions().webauthn
  const invalidOptions: Array<[string, unknown]> = [
    ["null", null], ["string", ""], ["boolean", false], ["number", 0], ["array", []],
    ["date", new Date(0)], ["buffer", new ArrayBuffer(0)], ["empty object", {}],
    ["missing user", { challenge: "AQIDBA==" }],
    ...[null, false, "", 42, [], new Uint8Array([1])].map((value) => [`invalid user ${String(value)}`, { ...direct, user: value }] as [string, unknown]),
    ...[undefined, null, false, "", 42, []].map((value) => [`invalid wrapper ${String(value)}`, { ...direct, webauthn: value }] as [string, unknown]),
  ]
  it.each(invalidOptions)("rejects supplied %s options rather than taking the omitted-options path", (_label, authzCreationOptions) => {
    expect(() => createPasskeyCredential({ ...input, authzCreationOptions })).toThrow(/webauthn/)
    expect(create).not.toHaveBeenCalled()
  })

  it("keeps deliberately omitted/undefined options on the historical path", async () => {
    const omitted = passkeyCreationOptions(input)
    const explicitUndefined = passkeyCreationOptions({ ...input, authzCreationOptions: undefined })
    // Preserve the generic historical decoder exactly; do not redefine legacy scope/AAD here.
    expect(new Uint8Array(omitted.options.user.id as ArrayBuffer)).toEqual(new Uint8Array(explicitUndefined.options.user.id as ArrayBuffer))
    expect(Array.from(new Uint8Array(omitted.options.user.id as ArrayBuffer))).toEqual([106, 248, 155, 123, 235, 218, 186, 91])
    expect(omitted.options.user.name).toBe("avibe-vault")
    expect(omitted.options.challenge.byteLength).toBe(32)
    const result = await createPasskeyCredential(input)
    expect(create).toHaveBeenCalledOnce()
    expect(result).toEqual({ credentialId: "AQID" })
  })

  it("does not relax RP or PRF/UV assertion credential binding", () => {
    const options = serverOptions()
    options.webauthn.rp.id = "other.example"
    expect(() => createPasskeyCredential({ ...input, authzCreationOptions: options })).toThrow(/rp_id/)
    expect(create).not.toHaveBeenCalled()
    const entries = [{ credentialId: "AQID", prfSalt: new Uint8Array(32).fill(0x33) }]
    const prf = passkeyPrfAssertionOptions(entries, rpId)
    const uv = passkeyUserVerificationOptions(entries, rpId, new Uint8Array([9]))
    for (const assertion of [prf, uv]) {
      expect(assertion.rpId).toBe(rpId)
      expect(assertion.userVerification).toBe("required")
      expect(new Uint8Array(assertion.allowCredentials![0].id as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    }
    expect(prf.extensions).toHaveProperty("prf")
  })
})
