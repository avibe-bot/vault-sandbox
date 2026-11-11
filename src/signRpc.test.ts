import { readFileSync, writeFileSync } from "node:fs"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { schnorr } from "@noble/curves/secp256k1.js"
import { ed25519 } from "@noble/curves/ed25519.js"
import { hexToBytes, bytesToHex } from "@noble/curves/utils.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { signFixture, solanaSignFixture } from "./signTestFixtures"
import attack from "./fixtures/bip143-agent-op-hit.json"
import { consumeSignedOperationContexts, resetSignedContextReplayCacheForTests, signedOperationContextMessage } from "./operationContext"
import { parseSignRequest } from "./signRequest"
import { commitUnlockedVmk, lockVault } from "./vaultLifecycle"
import { BUILD, CHANNEL, VERSION } from "./rpc"
import { bytesToBase64, packProtectedRecord, sealProtected, unpackProtectedRecord, openProtected, signDigest, SIGN_SCHEME_SCHNORR_SECP256K1_BIP340 as RAW, SIGN_SCHEME_SCHNORR_SECP256K1_BIP341_KEYPATH as TAP, type SignatureScheme, type ProtectedRecordEnvelope } from "./vaultCrypto"
import { verifyBitcoinSigningContext, type BitcoinSigningContext } from "./bitcoin"
import coreFixture from "./fixtures/vault-protected-bitcoin-core.json"
import corpus from "./fixtures/solana-acceptance/corpus.json"
import { decodeAuthorizationPrompt, authorizationCard } from "./authorizationPrompt"
import { getLocale, refreshI18nBindings, setLocale } from "./i18n"
import type { SigningReview } from "./signingReview"
import { installCardDocument, type FakeElement } from "./testDom"
import { secp256k1 } from "@noble/curves/secp256k1.js"

// Only simulate the user-click DOM surface and same-origin authorization-window
// ceremony. Crypto, real main.ts RPC handlers, policy, VMK, context verification,
// replay storage and signature return path all run unchanged.
vi.mock("./operationUi", async (original) => {
  const actual = await original<typeof import("./operationUi")>()
  return {
    ...actual,
    runExclusiveOperation: async (operation: (signal: AbortSignal) => unknown) => operation(new AbortController().signal),
    confirmOperationInActiveSlot: async (card: unknown, _signal: unknown, _surface: unknown, activate: () => Promise<void>) => {
      launcherCards.push(card as LauncherCard)
      return activate()
    },
  }
})

// The in-frame launcher card and the wire request the authorization window receives.
type WirePrompt = { challenge?: string; body?: { text: string }; review?: SigningReview; reviewSession?: string; details?: { rows: unknown[] }; title: unknown; subtitle: unknown; label: unknown }
type LauncherCard = { body?: unknown; review?: SigningReview; reviewSession?: string; details?: unknown; confirmLabel: unknown }
const launcherCards: LauncherCard[] = []

type Reply = { id: string; ok: boolean; result?: { scheme: string; signature: string }; error?: { code: string } }
const messages = new EventTarget()
const replies = new Map<string, (value: Reply) => void>()
const ceremonies: Array<{ passkey: string; wrapMeta: string; prompt: WirePrompt }> = []
let refuseCeremony = false
// The public synthetic PRF factor of the test fixtures; lets the locked path complete.
let unlockWithFixturePasskey = false
let duringCeremony: (() => Promise<void>) | undefined
const parent = {
  postMessage(value: Reply) { replies.get(value.id)?.(value) },
}
function dispatch(origin: string, source: unknown, data: unknown) {
  const event = new Event("message")
  Object.assign(event, { origin, source, data })
  messages.dispatchEvent(event)
}
const sandboxOrigin = "https://sandbox.avibe.bot"
const fakeWindow = {
  location: { origin: sandboxOrigin, href: sandboxOrigin, search: "" },
  self: {}, top: {}, parent,
  addEventListener: messages.addEventListener.bind(messages),
  removeEventListener: messages.removeEventListener.bind(messages),
  open(url: string) {
    const id = new URLSearchParams(new URL(url).hash.slice(1)).get("id")!
    const popup = {
      closed: false, close: vi.fn(), focus: vi.fn(),
      postMessage: (message: { request: { passkey: string; wrapMeta: string; prompt: WirePrompt } }) => {
        // What crosses to the authorization window is structured-cloned, as postMessage does.
        ceremonies.push(structuredClone(message.request))
        void (async () => {
          await duringCeremony?.()
          const result = message.request.passkey === "unlock" && unlockWithFixturePasskey
            ? { kind: "unlock", prfOutput: bytesToBase64(new Uint8Array(32).fill(0x22)), prfSalt: bytesToBase64(new Uint8Array(32).fill(0x33)) }
            : { kind: "confirmed" }
          dispatch(sandboxOrigin, popup, refuseCeremony
            ? { type: "authorization-error", build: BUILD, id, code: "passkey_cancelled" }
            : { type: "authorization-approved", build: BUILD, id, result })
        })()
      },
    }
    queueMicrotask(() => dispatch(sandboxOrigin, popup, { type: "authorization-ready", build: BUILD, id }))
    return popup
  },
}

async function rpc(op: string, payload: unknown): Promise<Reply> {
  const id = crypto.randomUUID()
  const result = new Promise<Reply>((resolve) => replies.set(id, resolve))
  dispatch("https://app.avibe.bot", parent, { channel: CHANNEL, version: VERSION, id, op, payload })
  return result.finally(() => replies.delete(id))
}

beforeAll(async () => {
  const store = new Map<string, string>()
  vi.stubGlobal("window", fakeWindow)
  vi.stubGlobal("document", { body: { classList: { add: vi.fn() } }, documentElement: { getAttribute: () => "dark" } })
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() } })
  vi.stubGlobal("localStorage", { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value), removeItem: (key: string) => store.delete(key) })
  await import("./main")
  expect((await rpc("handshake", { parentOrigin: "https://app.avibe.bot", nonce: "public-test-nonce-123456" })).ok).toBe(true)
})
beforeEach(() => { ceremonies.length = 0; launcherCards.length = 0; refuseCeremony = false; unlockWithFixturePasskey = false; duringCeremony = undefined })
afterEach(() => { lockVault(); resetSignedContextReplayCacheForTests() })
afterAll(() => { vi.unstubAllGlobals() })

async function fixture(scheme: SignatureScheme = RAW, privateKey?: Uint8Array) {
  const f = await signFixture(scheme, privateKey)
  commitUnlockedVmk({ vmk: new Uint8Array(f.vmk), wrapMeta: f.wrapMeta, scopeId: "test-only-sign-rpc", freshSetup: false })
  return f
}

async function bitcoinFixture(context: BitcoinSigningContext, scalar: string) {
  const f = await fixture(TAP, hexToBytes(scalar))
  f.request.signingContext = structuredClone(context)
  f.request.context.release!.scheme = TAP
  f.request.context.release!.digest = context.digest
  f.request.context.release!.signingContext = structuredClone(context)
  f.resign()
  return f
}

const bitcoinContext = (vector: typeof coreFixture.cases[number]): BitcoinSigningContext => ({
  kind: "bitcoin-taproot-keypath-v1", network: "signet", unsignedTransaction: vector.unsigned_tx_hex,
  prevout: { amountSats: vector.funding.spent_output_value_sats, scriptPubKey: vector.funding.spent_output_script_hex },
  digestAlgorithm: "bip341-sighash-default-keypath", digest: vector.expected.taproot_digest_hex,
})

describe("actual main.ts signing RPC", () => {
  it("generates Ed25519 only inside the sandbox and returns no seed", async () => {
    const f = await fixture()
    const response = await rpc("seal", { name: "PUBLIC_SOLANA_KEY", kind: "keypair", curve: "ed25519", wrapMeta: f.wrapMeta })
    expect(response.ok).toBe(true)
    const result = response.result as unknown as { publicKey: string; envelope: ProtectedRecordEnvelope; addresses: { solana: string } }
    expect(result.publicKey).toMatch(/^[0-9a-f]{64}$/)
    expect(result.addresses.solana).toBeTruthy()
    expect(response.result).not.toHaveProperty("privateKey")
    const unpacked = unpackProtectedRecord(result.envelope)
    expect(unpacked.recordMetadata).toEqual({ kind: "keypair", public_key: result.publicKey, curve: "ed25519" })
    const seed = await openProtected(unpacked.sealed, f.vmk, { name: "PUBLIC_SOLANA_KEY", kind: "keypair", curve: "ed25519", publicKey: result.publicKey })
    try { expect(bytesToHex(ed25519.getPublicKey(seed))).toBe(result.publicKey) } finally { seed.fill(0) }
    expect(ceremonies).toHaveLength(0)
  })

  it("refuses Ed25519 requests that are not a Solana message for the record's key, before any ceremony", async () => {
    const f = await fixture()
    const seed = new Uint8Array(32).fill(0x12) // Public synthetic test seed, never a real credential.
    const publicKey = bytesToHex(ed25519.getPublicKey(seed))
    const record = { name: f.request.material.name, kind: "keypair" as const, curve: "ed25519" as const, publicKey }
    const signingContext = { kind: "solana-transaction-v1", messageHex: "72" }
    f.request.context.release = { name: record.name, scheme: "ed25519", messageHex: "72", publicKey, signingContext }
    f.resign()
    const request = { ...f.request, scheme: "ed25519", signingContext,
      material: { name: record.name, envelope: packProtectedRecord(await sealProtected(seed, f.vmk, record), f.wrapMeta, record) } }
    seed.fill(0)
    // Authentic binding, but the byte 0x72 is not a Solana message.
    expect(await rpc("sign", request)).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    // No generic Ed25519 operation and no Ed25519 scheme on a secp256k1 record.
    expect(await rpc("sign", { ...request, signingContext: f.request.signingContext })).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    expect(await rpc("sign", { ...f.request, scheme: "ed25519" })).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    expect(ceremonies).toHaveLength(0)
    expect(launcherCards).toHaveLength(0)
  })

  it("returns a valid raw signature only after fresh UV, binds the full request and consumes replay ID", async () => {
    const f = await fixture(RAW)
    const first = await rpc("sign", f.request)
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true })
    expect(ceremonies).toHaveLength(1)
    expect(ceremonies[0].passkey).toBe("uv")
    expect(ceremonies[0].prompt.challenge).toBe(bytesToBase64(sha256(new TextEncoder().encode(signedOperationContextMessage(f.request.context)))))
    expect(schnorr.verify(hexToBytes(first.result!.signature), hexToBytes(f.request.signingContext.digest), schnorr.getPublicKey(f.key))).toBe(true)
    const second = await rpc("sign", f.request)
    expect(second).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(ceremonies).toHaveLength(1)
  })

  it.each(coreFixture.cases)("signs bounded Bitcoin $id through the actual R3 RPC path", async (vector) => {
    const key = coreFixture.keys.find((key) => key.id === vector.signing_key_id)!
    const context = bitcoinContext(vector)
    const f = await bitcoinFixture(context, key.public_secret_scalar_hex)
    const result = await rpc("sign", f.request)
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
    const verified = verifyBitcoinSigningContext(context, context.digest, f.publicKey)
    expect(schnorr.verify(hexToBytes(result.result!.signature), hexToBytes(context.digest), verified.outputKeyXOnly)).toBe(true)
    expect(bytesToHex(verified.outputKeyXOnly)).toBe(key.output_xonly_hex)
    expect(ceremonies).toHaveLength(1)
    expect(ceremonies[0].passkey).toBe("uv")
    expect(ceremonies[0].prompt.body!.text).toContain("not chain proof")
    expect(ceremonies[0].prompt.review).toBeUndefined()
    expect(ceremonies[0].prompt.challenge).toBe(bytesToBase64(sha256(new TextEncoder().encode(signedOperationContextMessage(f.request.context)))))
    expect(await rpc("sign", f.request)).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(ceremonies).toHaveLength(1)
  })

  // Optional hermetic Core gate. scripts/core-acceptance.py creates disposable
  // regtest coins and independent digests. Only the actual RPC signs positive
  // and plausible-false-amount requests; the primitive-only negatives are named.
  it.skipIf(!process.env.AVIBE_TEST_CORE_INPUT)("produces actual RPC signatures for isolated Core acceptance", async () => {
    const inputs = JSON.parse(readFileSync(process.env.AVIBE_TEST_CORE_INPUT!, "utf8")) as Array<{
      id: string; publicScalarHex: string; context: BitcoinSigningContext;
      falseAmount: BitcoinSigningContext; falseScript: BitcoinSigningContext;
    }>
    const results = []
    for (const input of inputs) {
      expect([1n, 2n, 6n, 11n]).toContain(BigInt(`0x${input.publicScalarHex}`))
      const f = await bitcoinFixture(input.context, input.publicScalarHex)
      const good = await rpc("sign", f.request)
      expect(good).toMatchObject({ ok: true })
      expect(ceremonies.at(-1)!.passkey).toBe("uv")
      const falseAmount = await bitcoinFixture(input.falseAmount, input.publicScalarHex)
      const wrongAmount = await rpc("sign", falseAmount.request)
      expect(wrongAmount).toMatchObject({ ok: true })
      const falseScript = await bitcoinFixture(input.falseScript, input.publicScalarHex)
      const count = ceremonies.length
      expect(await rpc("sign", falseScript.request)).toMatchObject({ ok: false })
      expect(ceremonies).toHaveLength(count)
      results.push({ id: input.id, rpc: good.result, falseAmountRpc: wrongAmount.result,
        falseScriptPrimitive: signDigest(input.publicScalarHex, input.falseScript.digest, TAP),
        rawPrimitive: signDigest(input.publicScalarHex, input.context.digest, RAW) })
    }
    writeFileSync(process.env.AVIBE_TEST_CORE_OUTPUT!, JSON.stringify(results, null, 2) + "\n")
  })


  it("rejects the concrete unprefixed Bitcoin preimage before passkey", async () => {
    const f = await fixture("ecdsa-secp256k1-der")
    const result = await rpc("sign", { ...f.request, signingContext: attack.signing_context })
    expect(result.ok).toBe(false)
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })

  it("returns no signature when the fresh-passkey ceremony is cancelled", async () => {
    const f = await fixture()
    refuseCeremony = true
    const result = await rpc("sign", f.request)
    expect(result).toMatchObject({ ok: false, error: { code: "passkey_cancelled" } })
    expect(result.result).toBeUndefined()
  })

  it("rechecks expiry after approval and returns no signature", async () => {
    const f = await fixture()
    duringCeremony = async () => {
      const now = Date.now()
      vi.spyOn(Date, "now").mockReturnValue(now + 120_000)
    }
    try {
      const result = await rpc("sign", f.request)
      expect(result).toMatchObject({ ok: false, error: { code: "context_expired" } })
      expect(result.result).toBeUndefined()
    } finally { vi.restoreAllMocks() }
  })

  it.each(["scheme", "digest", "publicKey", "signingContext", "missingBinding"])("never returns a signature for parent-tampered %s", async (field) => {
    const f = await fixture()
    if (field === "scheme") f.request.scheme = "ecdsa-secp256k1-der"
    if (field === "digest") f.request.signingContext.digest = "11".repeat(32)
    if (field === "publicKey") f.request.context.release!.publicKey = `02${"11".repeat(32)}`
    if (field === "signingContext") f.request.signingContext = { ...f.request.signingContext, canonicalPreimage: "attack" } as never
    if (field === "missingBinding") delete f.request.context.release
    const result = await rpc("sign", f.request)
    expect(result.ok).toBe(false)
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })

  it("rejects forged matching release before fresh UV", async () => {
    const f = await fixture()
    f.request.scheme = "ecdsa-secp256k1-der"
    f.request.context.release!.scheme = "ecdsa-secp256k1-der"
    const result = await rpc("sign", f.request)
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_context_signature" } })
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
  })
})

// Published RFC 8032 seeds from the independent acceptance corpus. Never credentials.
const corpusSeed = (keyId: string) => corpus.keys.find((key) => key.id === keyId)!.seedHex
const solanaVector = (id: string) => corpus.solana.find((vector) => vector.id === id)!
const NOTICE = { en: corpus.blindSigningNotice.en, zh: corpus.blindSigningNotice.zh }

async function solana(id: string, sessionLabel?: string) {
  const vector = solanaVector(id)
  const f = await solanaSignFixture(vector.message.hex, corpusSeed(vector.requestedSigner.keyId), { sessionLabel })
  commitUnlockedVmk({ vmk: new Uint8Array(f.vmk), wrapMeta: f.wrapMeta, scopeId: "test-only-sign-rpc", freshSetup: false })
  return { f, vector, expectedSignature: vector.signatures.find((signature) => signature.publicKeyHex === f.publicKey)!.signatureHex }
}

function reviewValues(review: SigningReview): string[] {
  return [review.signer, ...review.summary, ...review.details.flatMap((group) => group.fields)].map((field) => field.value)
}

describe("actual main.ts protected Solana signing RPC", () => {
  it.each(corpus.solana.map((vector) => vector.id))("signs %s only after the fresh-passkey ceremony showed its review", async (id) => {
    const { f, vector, expectedSignature } = await solana(id, "Public test session")
    const first = await rpc("sign", f.request)
    expect(first, JSON.stringify(first)).toMatchObject({ ok: true, result: { scheme: "ed25519", signature: expectedSignature, recovery_id: null } })
    expect(ed25519.verify(hexToBytes(first.result!.signature), hexToBytes(vector.message.hex), hexToBytes(f.publicKey), { zip215: false })).toBe(true)

    // One ceremony: fresh UV over the whole daemon-signed operation, not over the message alone.
    expect(ceremonies).toHaveLength(1)
    const { passkey, prompt } = ceremonies[0]
    expect(passkey).toBe("uv")
    expect(prompt.challenge).toBe(bytesToBase64(sha256(new TextEncoder().encode(signedOperationContextMessage(f.request.context)))))
    // The window receives the structured review of these exact bytes and this key, and no prose body.
    expect(prompt.body).toBeUndefined()
    expect(prompt.review!.signer.value).toBe(vector.requestedSigner.publicKeyBase58)
    expect(reviewValues(prompt.review!)).toContain(vector.message.hex)
    expect(prompt.review!.undecoded).toBe(vector.expected.partiallyDecoded)
    expect(prompt.reviewSession).toBe("Public test session")
    expect(prompt.details!.rows.length).toBeGreaterThan(0)
    // The in-frame launcher card shows the same review; it only opens the window.
    expect(launcherCards).toHaveLength(1)
    expect(launcherCards[0]).toMatchObject({ review: prompt.review, reviewSession: "Public test session", confirmLabel: "common.continue" })
    expect(launcherCards[0].body).toBeUndefined()

    expect(await rpc("sign", f.request)).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(ceremonies).toHaveLength(1)
  })

  it("from a locked vault, shows the same review for the one unlocking passkey and then signs", async () => {
    const { f, vector, expectedSignature } = await solana("legacy-sol-transfer")
    lockVault()
    unlockWithFixturePasskey = true
    const result = await rpc("sign", f.request)
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, result: { signature: expectedSignature } })
    expect(ceremonies).toHaveLength(1)
    expect(ceremonies[0].passkey).toBe("unlock")
    expect(ceremonies[0].prompt.body).toBeUndefined()
    expect(reviewValues(ceremonies[0].prompt.review!)).toContain(vector.message.hex)
    expect(await rpc("sign", f.request)).toMatchObject({ ok: false, error: { code: "context_replayed" } })
  })

  it("from a locked vault, an unlock that does not complete returns no signature", async () => {
    const { f } = await solana("legacy-sol-transfer")
    lockVault()
    const result = await rpc("sign", f.request)
    expect(result.ok).toBe(false)
    expect(result.result).toBeUndefined()
    expect(ceremonies[0].passkey).toBe("unlock")
  })

  it("returns no signature when the ceremony is cancelled, expires meanwhile, or the request is used elsewhere meanwhile", async () => {
    const cancelled = await solana("legacy-sol-transfer")
    refuseCeremony = true
    const refused = await rpc("sign", cancelled.f.request)
    expect(refused).toMatchObject({ ok: false, error: { code: "passkey_cancelled" } })
    expect(refused.result).toBeUndefined()
    refuseCeremony = false

    const expiring = await solana("legacy-sol-transfer")
    duringCeremony = async () => { vi.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000) }
    try {
      const expired = await rpc("sign", expiring.f.request)
      expect(expired).toMatchObject({ ok: false, error: { code: "context_expired" } })
      expect(expired.result).toBeUndefined()
    } finally { vi.restoreAllMocks() }

    const raced = await solana("legacy-sol-transfer")
    duringCeremony = async () => { await consumeSignedOperationContexts([parseSignRequest(raced.f.request).context]) }
    const replayed = await rpc("sign", raced.f.request)
    expect(replayed).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(replayed.result).toBeUndefined()
  })

  it.each(corpus.negative.filter((negative) => negative.target === "message").map((negative) => negative.id))("refuses malformed %s with no ceremony and no card", async (id) => {
    const negative = corpus.negative.find((candidate) => candidate.id === id)!
    const f = await solanaSignFixture(negative.bytesHex, corpusSeed(solanaVector(negative.baseId).requestedSigner.keyId))
    commitUnlockedVmk({ vmk: new Uint8Array(f.vmk), wrapMeta: f.wrapMeta, scopeId: "test-only-sign-rpc", freshSetup: false })
    const result = await rpc("sign", f.request)
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    expect(result.result).toBeUndefined()
    expect(ceremonies).toHaveLength(0)
    expect(launcherCards).toHaveLength(0)
  })

  it.each(corpus.signerChecks.map((check) => check.id))("refuses %s: the record key is not a required signer", async (id) => {
    const check = corpus.signerChecks.find((candidate) => candidate.id === id)!
    const key = corpus.keys.find((candidate) => candidate.publicKeyHex === check.expectedSignerHex)!
    const f = await solanaSignFixture(solanaVector(check.baseId).message.hex, key.seedHex)
    commitUnlockedVmk({ vmk: new Uint8Array(f.vmk), wrapMeta: f.wrapMeta, scopeId: "test-only-sign-rpc", freshSetup: false })
    expect(await rpc("sign", f.request)).toMatchObject({ ok: false, error: { code: "invalid_payload" } })
    expect(ceremonies).toHaveLength(0)
  })

  it.each(["scheme", "message", "release-message", "release-key", "release-name", "material-name", "digest-alias", "missing-binding", "unsigned-change"])(
    "never returns a signature for a %s mismatch", async (field) => {
      const { f } = await solana("legacy-sol-transfer")
      const other = solanaVector("v0-sol-transfer-static").message.hex
      const release = f.request.context.release!
      if (field === "scheme") f.request.scheme = "ecdsa-secp256k1-der"
      if (field === "message") f.request.signingContext = { kind: "solana-transaction-v1", messageHex: other }
      if (field === "release-message") release.messageHex = other
      if (field === "release-key") release.publicKey = corpus.keys[1].publicKeyHex
      if (field === "release-name") release.name = "ANOTHER_KEY"
      if (field === "material-name") { f.request.material.name = "RENAMED_KEY"; release.name = "RENAMED_KEY"; f.request.context.display.secrets = [{ name: "RENAMED_KEY", kind: "keypair" }] }
      if (field === "digest-alias") release.digest = bytesToHex(sha256(hexToBytes(solanaVector("legacy-sol-transfer").message.hex)))
      if (field === "missing-binding") delete f.request.context.release
      // Every change but the last is re-signed by the daemon; the last is a parent edit after signing.
      if (field === "unsigned-change") {
        f.request.signingContext = { kind: "solana-transaction-v1", messageHex: other }
        Object.assign(release, { messageHex: other, signingContext: { kind: "solana-transaction-v1", messageHex: other } })
      } else f.resign()
      const result = await rpc("sign", f.request)
      expect(result.ok).toBe(false)
      expect(result.result).toBeUndefined()
      // A renamed record passes every pre-approval check and fails only when the envelope is opened.
      if (field !== "material-name") expect(ceremonies).toHaveLength(0)
    })
})

describe("actual main.ts EVM signing RPC with the structured review", () => {
  async function evm(id: string) {
    const vector = corpus.evm.find((candidate) => candidate.id === id)!
    const f = await fixture("ecdsa-secp256k1-recoverable", hexToBytes(vector.signature.publicScalarHex))
    const context = structuredClone(vector.context) as never
    f.request.signingContext = context
    Object.assign(f.request.context.release!, { digest: vector.context.digest, signingContext: structuredClone(context) })
    f.request.context.display.sessionLabel = "Public test session"
    f.resign()
    return { f, vector }
  }

  it.each(["evm-synthetic-uniswap-shaped-unknown-selector", "evm-erc20-transfer", "evm-eip155-published-example", "evm-contract-creation-known-selector-raw"])(
    "signs %s after showing the review derived from the record key, with no prose body", async (id) => {
      const { f, vector } = await evm(id)
      const result = await rpc("sign", f.request)
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true })
      expect(secp256k1.verify(hexToBytes(result.result!.signature).slice(0, 64), hexToBytes(vector.context.digest), hexToBytes(f.publicKey), { prehash: false })).toBe(true)
      const { prompt, passkey } = ceremonies[0]
      expect(passkey).toBe("uv")
      expect(prompt.body).toBeUndefined()
      expect(prompt.review!.signer).toEqual({ label: "review.field.signingAddress", value: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf" })
      expect(prompt.review!.undecoded).toBe(vector.expected.partiallyDecoded)
      expect(reviewValues(prompt.review!)).toEqual(expect.arrayContaining([vector.unsignedSerialized, vector.expected.calldata, f.publicKey]))
      expect(prompt.reviewSession).toBe("Public test session")
      expect(launcherCards[0].review).toEqual(prompt.review)
    })

  it("keeps the prose review, with no structured review, for agent operations", async () => {
    const f = await fixture(RAW)
    expect(await rpc("sign", f.request)).toMatchObject({ ok: true })
    expect(ceremonies[0].prompt.review).toBeUndefined()
    expect(ceremonies[0].prompt.body!.text).toContain("NOT a Bitcoin transaction")
    expect(launcherCards[0].review).toBeUndefined()
  })
})

// The authorization window's side of the transport: the request the frame
// really sent is decoded and rendered by the production decoder, card mapping
// and confirmation component. Only the DOM and the window wiring are stand-ins.
describe("authorization window shows what the frame sent", () => {
  let previousDocument: unknown
  let realUi: typeof import("./operationUi")
  beforeAll(async () => { realUi = await vi.importActual<typeof import("./operationUi")>("./operationUi") })
  beforeEach(() => { previousDocument = (globalThis as { document?: unknown }).document })
  afterEach(() => { vi.useRealTimers(); setLocale("en"); vi.stubGlobal("document", previousDocument) })

  async function shown(request: unknown, locale: "en" | "zh") {
    expect(await rpc("sign", request)).toMatchObject({ ok: true })
    // The wire form, as the window's message handler receives it.
    const prompt = decodeAuthorizationPrompt(JSON.parse(JSON.stringify(ceremonies[0].prompt)))
    setLocale(locale)
    const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
    vi.useFakeTimers()
    const activate = vi.fn(async () => {})
    const confirmation = realUi.confirmOperationInActiveSlot(authorizationCard(prompt), new AbortController().signal, undefined, activate)
    const text = (selector: string) => dom.content.querySelectorAll(selector).map((node: FakeElement) => node.textContent)
    return { dom, prompt, text, activate, confirmation }
  }

  it.each(["en", "zh"] as const)("raw Solana in %s: one notice, session line, one Details with the complete message, copy and gated confirm", async (locale) => {
    const { f, vector } = await solana("v0-unresolved-alt-synthetic-jupiter-shaped", "Public test session")
    const { dom, text, activate, confirmation } = await shown(f.request, locale)

    // Exactly one notice, in the approved words, in the summary and not inside Details.
    expect(dom.content.leafTexts().filter((value) => value.includes(NOTICE.en) || value.includes(NOTICE.zh))).toEqual([NOTICE[locale]])
    expect(text(".review-notice-text")).toEqual([NOTICE[locale]])
    expect(dom.content.querySelector(".review-details")!.querySelectorAll(".review-notice")).toHaveLength(0)
    expect(dom.content.querySelectorAll(".confirmation-note")).toHaveLength(0)

    expect(text(".review-session-value")).toEqual(["Public test session"])
    expect(dom.content.querySelector(".review-summary")!.querySelectorAll(".review-mono")[0].textContent).toBe(vector.requestedSigner.publicKeyBase58)
    // One Details section: the daemon-signed request rows first, then every fact, then the exact bytes.
    expect(dom.content.querySelectorAll(".review-details")).toHaveLength(1)
    const details = dom.content.querySelector(".review-details")!
    expect(details.tagName).toBe("details")
    expect(details.querySelectorAll(".detail-command").map((node) => node.textContent)).toEqual(["vibe vault sign PUBLIC_SOLANA_TEST_KEY"])
    expect(details.querySelectorAll(".review-raw").map((node) => node.textContent)).toEqual([vector.message.hex])
    const mono = details.querySelectorAll(".review-mono").map((node) => node.textContent)
    for (const address of vector.expected.staticAccountKeys) expect(mono).toContain(address)
    for (const instruction of vector.expected.instructions) expect(mono).toContain(instruction.dataHex)
    for (const lookup of vector.expected.addressTableLookups) expect(mono).not.toContain(lookup.accountKey)

    // Copy writes the exact message.
    const writeText = vi.fn(async (_value: string) => {})
    vi.stubGlobal("navigator", { ...(globalThis as { navigator?: object }).navigator, clipboard: { writeText } })
    details.querySelector(".review-copy")!.click()
    expect(writeText).toHaveBeenCalledWith(vector.message.hex)

    // Switching locale relabels the card and leaves every value and the single notice in place.
    const other = locale === "en" ? "zh" : "en"
    const labelsBefore = text(".review-label")
    setLocale(other)
    refreshI18nBindings(document)
    expect(getLocale()).toBe(other)
    expect(text(".review-label")).not.toEqual(labelsBefore)
    expect(text(".review-notice-text")).toEqual([NOTICE[other]])
    expect(details.querySelectorAll(".review-raw").map((node) => node.textContent)).toEqual([vector.message.hex])
    expect(details.querySelectorAll(".review-mono").map((node) => node.textContent)).toEqual(mono)

    // The same gated confirmation as every other card.
    const confirm = dom.footer.children[1]
    expect(confirm.disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(confirm.disabled).toBe(false)
    confirm.click()
    await confirmation
    expect(activate).toHaveBeenCalledTimes(1)
  })

  it("decoded SOL transfer: exact SOL beside raw lamports, and no notice", async () => {
    const { f, vector } = await solana("legacy-sol-transfer")
    const { dom, text } = await shown(f.request, "en")
    expect(dom.content.querySelectorAll(".review-notice")).toHaveLength(0)
    expect(dom.content.querySelectorAll(".review-session")).toHaveLength(0)
    const summary = dom.content.querySelector(".review-summary")!.querySelectorAll(".review-mono").map((node) => node.textContent)
    expect(summary).toEqual([
      vector.requestedSigner.publicKeyBase58, "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z", "8KuqTnrTpiE3zGXbLxZzw1bR3vjbfNADBEVYeECj62T8",
      "1.23456789 SOL (1234567890 lamports)",
    ])
    expect(text(".review-kind")).toEqual(["Solana · SOL transfer"])
  })

  it("raw EVM call: the notice once, although the verifier's prose display also carries it", async () => {
    const vector = corpus.evm.find((candidate) => candidate.id === "evm-synthetic-uniswap-shaped-unknown-selector")!
    const f = await fixture("ecdsa-secp256k1-recoverable", hexToBytes(vector.signature.publicScalarHex))
    const context = structuredClone(vector.context) as never
    f.request.signingContext = context
    Object.assign(f.request.context.release!, { digest: vector.context.digest, signingContext: structuredClone(context) })
    f.resign()
    const { dom, text } = await shown(f.request, "zh")
    expect(dom.content.leafTexts().filter((value) => value.includes(NOTICE.zh) || value.includes(NOTICE.en))).toEqual([NOTICE.zh])
    expect(text(".review-notice-text")).toEqual([NOTICE.zh])
    const details = dom.content.querySelector(".review-details")!
    expect(details.querySelectorAll(".review-raw").map((node) => node.textContent)).toEqual([vector.expected.calldata, vector.unsignedSerialized])
    expect(dom.content.querySelector(".review-summary")!.querySelectorAll(".review-mono")[0].textContent).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
  })

  it("refuses a wire prompt whose review carries anything but sandbox keys and values", async () => {
    const { f } = await solana("legacy-sol-transfer")
    expect(await rpc("sign", f.request)).toMatchObject({ ok: true })
    const wire = JSON.parse(JSON.stringify(ceremonies[0].prompt))
    wire.review.summary[0].label = "Verified recipient"
    expect(() => decodeAuthorizationPrompt(wire)).toThrowError(expect.objectContaining({ code: "invalid_payload" }))
    const markup = JSON.parse(JSON.stringify(ceremonies[0].prompt))
    markup.review.summary[0].html = "<img src=x>"
    expect(() => decodeAuthorizationPrompt(markup)).toThrowError(expect.objectContaining({ code: "invalid_payload" }))
  })
})
