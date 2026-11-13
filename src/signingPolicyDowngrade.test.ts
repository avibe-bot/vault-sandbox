import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { sha256 } from "@noble/hashes/sha2.js"

import {
  parsePolicyDowngradeContext,
  policyAssertionOptions,
  policyChallenge,
  policyRemainingMs,
  requestPolicyAssertion,
  validatePolicyAssertion,
  type PolicyDowngradeContext,
} from "./signingPolicyDowngrade"
import { bytesToBase64, bytesToHexString } from "./vaultCrypto"
import { stableJson } from "./operationContext"
import { setLocale, t } from "./i18n"

type Vector = {
  id: string
  context: unknown
  canonical_json: string
  challenge_hex: string
  challenge_base64url: string
  stored_challenge_hash: string
}

type VectorFile = { vectors: Vector[] }

const vectors = JSON.parse(
  readFileSync(new URL("./fixtures/policy-downgrade-wire-vectors.json", import.meta.url), "utf8"),
) as VectorFile
const location = { origin: "https://sandbox.avibe.bot", hostname: "sandbox.avibe.bot" }
const issuanceNow = Date.parse("2026-11-13T00:00:01.000Z")

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function baseContext(): PolicyDowngradeContext {
  return parsePolicyDowngradeContext(vectors.vectors[2].context, location, issuanceNow)
}

function base64url(value: Uint8Array): string {
  return bytesToBase64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function validAssertion(context: PolicyDowngradeContext): Record<string, unknown> {
  const rawId = Uint8Array.from(atob(context.factors[0].credentialId), (char) => char.charCodeAt(0))
  const rpHash = sha256(new TextEncoder().encode(context.rpId))
  const authData = new Uint8Array(37)
  authData.set(rpHash)
  authData[32] = 0x05
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({
    type: "webauthn.get",
    challenge: base64url(policyChallenge(context)),
    origin: context.origin,
  }))
  return {
    id: base64url(rawId),
    rawId: bytesToBase64(rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64(clientDataJSON),
      authenticatorData: bytesToBase64(authData),
      signature: "AA==",
      userHandle: null,
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("signing-policy-downgrade frozen wire contract", () => {
  it("reproduces all public canonical context, challenge and storage digest vectors", () => {
    for (const vector of vectors.vectors) {
      const context = parsePolicyDowngradeContext(vector.context, location, issuanceNow)
      expect(stableJson(context)).toBe(vector.canonical_json)
      expect(bytesToHexString(policyChallenge(context))).toBe(vector.challenge_hex)
      expect(base64url(policyChallenge(context))).toBe(vector.challenge_base64url)
      expect(bytesToHexString(sha256(policyChallenge(context)))).toBe(vector.stored_challenge_hash)
    }
  })

  it("rejects alternate encodings, unsorted factors, wrong surfaces and invalid address sets", () => {
    const source = vectors.vectors[2].context as Record<string, any>
    const wrongOrigin = clone(source)
    wrongOrigin.origin = "https://avibe.bot"
    expect(() => parsePolicyDowngradeContext(wrongOrigin, location, issuanceNow)).toThrow(/origin|RP/i)

    const urlSafe = clone(source)
    urlSafe.nonce = urlSafe.nonce.replace(/=+$/, "")
    expect(() => parsePolicyDowngradeContext(urlSafe, location, issuanceNow)).toThrow(/base64/i)

    const unsorted = clone(source)
    unsorted.factors.push({ factorId: "vaf_aaa", credentialId: source.factors[0].credentialId })
    expect(() => parsePolicyDowngradeContext(unsorted, location, issuanceNow)).toThrow(/factors/i)

    const badAddress = clone(source)
    badAddress.target.addresses.eth = "0x9858effd232b4033e47d90003d41ec34ecaeda94"
    expect(() => parsePolicyDowngradeContext(badAddress, location, issuanceNow)).toThrow(/EIP-55|address/i)

    const badHd = clone(vectors.vectors[0].context) as Record<string, any>
    badHd.target.addresses.btc_segwit = (vectors.vectors[2].context as Record<string, any>).target.addresses.btc_segwit
    expect(() => parsePolicyDowngradeContext(badHd, location, issuanceNow)).toThrow(/HD address/i)
  })

  it("enforces expiry, clock skew, and the exact WebAuthn timeout", () => {
    const context = baseContext()
    const expiry = Date.parse(context.expiresAt)
    expect(() => policyRemainingMs(context, expiry)).toThrow(/expired/i)
    expect(() => policyRemainingMs(context, expiry - 150_001)).toThrow(/clock/i)
    expect(policyRemainingMs(context, expiry - 120_000)).toBe(120_000)
    expect(policyRemainingMs(context, expiry - 120_001)).toBe(120_001)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(expiry - 119_999))
    expect(policyAssertionOptions(context)).toMatchObject({
      rpId: context.rpId,
      userVerification: "required",
      timeout: 119_999,
    })
  })

  it("uses the direct browser get path and serializes the returned assertion", async () => {
    const context = baseContext()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.parse(context.expiresAt) - 119_999))
    const wire = validAssertion(context) as {
      id: string
      rawId: string
      type: string
      response: Record<string, unknown>
    }
    const rawId = Uint8Array.from(atob(wire.rawId), (char) => char.charCodeAt(0))
    const get = vi.fn().mockResolvedValue({
      id: wire.id,
      rawId: rawId.buffer,
      type: wire.type,
      response: {
        clientDataJSON: Uint8Array.from(atob(wire.response.clientDataJSON as string), (char) => char.charCodeAt(0)).buffer,
        authenticatorData: Uint8Array.from(atob(wire.response.authenticatorData as string), (char) => char.charCodeAt(0)).buffer,
        signature: Uint8Array.from(atob(wire.response.signature as string), (char) => char.charCodeAt(0)).buffer,
        userHandle: null,
      },
    })
    vi.stubGlobal("navigator", { credentials: { get } })

    const result = await requestPolicyAssertion(context, new AbortController().signal)
    expect(result).toEqual(wire)
    expect(get).toHaveBeenCalledOnce()
    expect(get.mock.calls[0][0].publicKey).toMatchObject({
      rpId: context.rpId,
      userVerification: "required",
      timeout: 119_999,
    })
  })

  it("binds the returned assertion to the frozen factor, challenge, origin, RP and UV", () => {
    const context = baseContext()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(Date.parse(context.expiresAt) - 119_999))
    expect(validatePolicyAssertion(validAssertion(context), context)).toMatchObject({ type: "public-key" })

    const wrongChallenge = validAssertion(context) as any
    const client = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(wrongChallenge.response.clientDataJSON), (char) => char.charCodeAt(0))))
    client.challenge = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    wrongChallenge.response.clientDataJSON = bytesToBase64(new TextEncoder().encode(JSON.stringify(client)))
    expect(() => validatePolicyAssertion(wrongChallenge, context)).toThrow(/assertion/i)

    const noUv = validAssertion(context) as any
    const auth = Uint8Array.from(atob(noUv.response.authenticatorData), (char) => char.charCodeAt(0))
    auth[32] = 0x01
    noUv.response.authenticatorData = bytesToBase64(auth)
    expect(() => validatePolicyAssertion(noUv, context)).toThrow(/assertion/i)
  })
})

describe("policy downgrade copy", () => {
  afterEach(() => setLocale("en"))
  it("uses Product's exact turn-off copy in both locales", () => {
    setLocale("en")
    expect(t("policyDowngrade.title")).toBe("Turn off \"Ask before signing\"")
    expect(t("policyDowngrade.standardWarning")).toBe(
      "After this, Agents can sign with it without asking you. This confirmation only guards against mistakes; to protect funds, use the protected tier.",
    )
    expect(t("policyDowngrade.protectedNotice")).toBe("Protected keys still need your Passkey approval in the browser for every signature.")
    expect(t("policyDowngrade.onlyPolicy")).toBe("This only changes the setting. It doesn't sign anything or touch the key.")
    expect(t("policyDowngrade.confirm")).toBe("Turn off confirmation")
    setLocale("zh")
    expect(t("policyDowngrade.title")).toBe("关闭「签名前问我」")
    expect(t("policyDowngrade.standardWarning")).toBe("关闭后，Agent 用它签名时不再问你。这个确认只防误操作；要保护资金，请用保护档。")
    expect(t("policyDowngrade.protectedNotice")).toBe("保护档密钥每次签名仍要在浏览器里用 Passkey 批准。")
    expect(t("policyDowngrade.onlyPolicy")).toBe("这一步只改这个设置，不会签名，也不会动密钥。")
    expect(t("policyDowngrade.confirm")).toBe("关闭确认")
  })
})
