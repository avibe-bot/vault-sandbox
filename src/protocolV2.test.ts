import { afterEach, describe, expect, it, vi } from "vitest"
import { Aes256Gcm, CipherSuite, HkdfSha256 } from "@hpke/core"
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519"
import { ed25519 } from "@noble/curves/ed25519.js"

import { resolveAuthorizationPlan, type RiskTier } from "./authz"
import { approveReleaseBatch, type ApproveReleaseApproval } from "./approveRelease"
import { evaluateConfirmSurface, parseParentConfirmSurface } from "./confirmSurface"
import {
  agentDeliverBlindBoxContextFromSignedContext,
  consumeSignedOperationContexts,
  parseSignedOperationContext,
  resetSignedContextReplayCacheForTests,
  signedOperationContextMessage,
  verifyAndConsumeSignedOperationContext,
  verifySignedOperationContext,
  type SignedOperationContext,
} from "./operationContext"
import { sealGeneratedKeypair } from "./sealOperations"
import {
  avaultPublicKeyFingerprint,
  buildWrapMeta,
  bytesToBase64,
  deriveSigningAddresses,
  newVmk,
  openProtected,
  packProtectedRecord,
  protectedRecordContextFromMetadata,
  protectRootMetadata,
  sealProtected,
  unpackProtectedRecord,
  withRootMetadata,
  type AvaultPublicKey,
  type VaultRootMetadata,
} from "./vaultCrypto"

afterEach(() => {
  resetSignedContextReplayCacheForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function installMemoryStorage(): void {
  const store = new Map<string, string>()
  const storage = {
    get length() {
      return store.size
    },
    clear: vi.fn(() => store.clear()),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => [...store.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
  } as Storage
  vi.stubGlobal("localStorage", storage)
}

function signContext(
  unsigned: Omit<SignedOperationContext, "signature">,
  secretKey: Uint8Array,
  keyId = "daemon-1",
): SignedOperationContext {
  const withPlaceholder = {
    ...unsigned,
    signature: { alg: "ed25519" as const, keyId, value: "" },
  }
  const message = signedOperationContextMessage(withPlaceholder)
  return {
    ...unsigned,
    signature: {
      alg: "ed25519",
      keyId,
      value: bytesToBase64(ed25519.sign(new TextEncoder().encode(message), secretKey)),
    },
  }
}

async function daemonRoot(): Promise<{ rootMetadata: VaultRootMetadata; secretKey: Uint8Array }> {
  const secretKey = ed25519.utils.randomSecretKey()
  const publicKey = ed25519.getPublicKey(secretKey)
  return {
    secretKey,
    rootMetadata: {
      daemon: {
        verificationKeys: [{ alg: "ed25519", keyId: "daemon-1", publicKey: bytesToBase64(publicKey) }],
      },
    },
  }
}

async function avaultPublicKey(): Promise<AvaultPublicKey> {
  const suite = new CipherSuite({
    kem: new DhkemX25519HkdfSha256(),
    kdf: new HkdfSha256(),
    aead: new Aes256Gcm(),
  })
  const receiver = await suite.kem.generateKeyPair()
  const raw = new Uint8Array(await suite.kem.serializePublicKey(receiver.publicKey))
  const public_key = bytesToBase64(raw)
  return { public_key, fingerprint: await avaultPublicKeyFingerprint(public_key) }
}

function baseContext(input: {
  secretKey: Uint8Array
  agent?: AvaultPublicKey
  grantId?: string
  requestId?: string
  expiresAt?: string
  secrets?: SignedOperationContext["display"]["secrets"]
}): SignedOperationContext {
  return signContext(
    {
      v: 2,
      purpose: "agent-deliver",
      requestId: input.requestId ?? "req-1",
      grantId: input.grantId ?? "grant-1",
      display: {
        secrets: input.secrets ?? [{ name: "OPENAI_API_KEY", kind: "static" }],
        sessionLabel: "Workbench · fix-ci",
        command: "npm test",
        egress: "api.github.com",
        source: { env: ["OPENAI_API_KEY"], tags: ["prod"], skills: ["github"] },
        grantTtlSeconds: 60,
      },
      agent: input.agent ? { publicKey: input.agent, fingerprint: input.agent.fingerprint ?? "" } : undefined,
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
    },
    input.secretKey,
  )
}

describe("risk tier resolution", () => {
  const cases: Array<[string, RiskTier, "locked" | "unlocked", boolean, { confirm: boolean; passkey: string; renewOnSuccess: boolean }]> = [
    ["R1 unlocked", "R1", "unlocked", false, { confirm: false, passkey: "none", renewOnSuccess: true }],
    ["R1 locked", "R1", "locked", false, { confirm: false, passkey: "unlock", renewOnSuccess: true }],
    ["R1 strict unlocked", "R1", "unlocked", true, { confirm: false, passkey: "none", renewOnSuccess: true }],
    ["R1 strict locked", "R1", "locked", true, { confirm: false, passkey: "unlock", renewOnSuccess: true }],
    ["R2 unlocked", "R2", "unlocked", false, { confirm: true, passkey: "none", renewOnSuccess: true }],
    ["R2 locked", "R2", "locked", false, { confirm: true, passkey: "unlock", renewOnSuccess: true }],
    ["R2 strict unlocked", "R2", "unlocked", true, { confirm: true, passkey: "uv", renewOnSuccess: false }],
    ["R2 strict locked", "R2", "locked", true, { confirm: true, passkey: "unlock", renewOnSuccess: false }],
    ["R3 unlocked", "R3", "unlocked", false, { confirm: true, passkey: "uv", renewOnSuccess: false }],
    ["R3 locked", "R3", "locked", false, { confirm: true, passkey: "unlock", renewOnSuccess: false }],
    ["R3 strict unlocked", "R3", "unlocked", true, { confirm: true, passkey: "uv", renewOnSuccess: false }],
    ["R3 strict locked", "R3", "locked", true, { confirm: true, passkey: "unlock", renewOnSuccess: false }],
  ]

  it.each(cases)("%s", (_name, tier, vaultState, strictApprovals, expected) => {
    expect(resolveAuthorizationPlan({ tier, vaultState, policy: { strictApprovals } })).toMatchObject(expected)
  })
})

describe("signed operation contexts", () => {
  it("verifies daemon-signed context against pinned root metadata", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = baseContext({ secretKey, agent: await avaultPublicKey() })

    expect(() => verifySignedOperationContext({ context, rootMetadata, expectedPurpose: "agent-deliver" })).not.toThrow()
    await expect(agentDeliverBlindBoxContextFromSignedContext(context, "OPENAI_API_KEY")).resolves.toMatchObject({
      purpose: "agent-deliver",
      name: "OPENAI_API_KEY",
      grantId: "grant-1",
      ttlSecs: 60,
    })
  })

  it("rejects bad signatures, expired contexts, and replayed requestIds", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const valid = baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-replay" })
    const tampered = parseSignedOperationContext({ ...valid, display: { ...valid.display, command: "rm -rf /" } })
    const expired = baseContext({
      secretKey,
      agent: await avaultPublicKey(),
      requestId: "req-expired",
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    })

    expect(() => verifySignedOperationContext({ context: tampered, rootMetadata })).toThrow(/signature/)
    expect(() => verifySignedOperationContext({ context: expired, rootMetadata })).toThrow(/expired/)
    await expect(verifyAndConsumeSignedOperationContext({ context: valid, rootMetadata })).resolves.toBeUndefined()
    await expect(verifyAndConsumeSignedOperationContext({ context: valid, rootMetadata })).rejects.toThrow(/already used/)
  })

  it("retains replay IDs until their signed contexts expire", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const now = Date.now()
    const expiresAt = new Date(now + 60_000).toISOString()

    for (let index = 0; index < 512; index += 1) {
      const context = baseContext({ secretKey, requestId: `req-cache-${index}`, expiresAt })
      await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now })).resolves.toBeUndefined()
    }

    await expect(
      verifyAndConsumeSignedOperationContext({
        context: baseContext({ secretKey, requestId: "req-cache-extra", expiresAt }),
        rootMetadata,
        now,
      }),
    ).rejects.toThrow(/replay cache is full/)
    await expect(
      verifyAndConsumeSignedOperationContext({
        context: baseContext({ secretKey, requestId: "req-cache-0", expiresAt }),
        rootMetadata,
        now,
      }),
    ).rejects.toThrow(/already used/)
  })

  it("rehydrates consumed replay IDs after a sandbox reload", async () => {
    installMemoryStorage()
    const { rootMetadata, secretKey } = await daemonRoot()
    const now = Date.now()
    const context = baseContext({
      secretKey,
      agent: await avaultPublicKey(),
      requestId: "req-persisted-replay",
      expiresAt: new Date(now + 60_000).toISOString(),
    })

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now })).resolves.toBeUndefined()
    resetSignedContextReplayCacheForTests({ clearPersistent: false })
    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now: now + 1_000 })).rejects.toThrow(/already used/)
  })

  it("claims replay IDs through the browser Web Locks API when available", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-web-lock" })
    const request = vi.fn(async (_name: string, _options: { mode: "exclusive" }, callback: () => Promise<void> | void) => {
      await callback()
    })
    vi.stubGlobal("navigator", { locks: { request } })

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata })).resolves.toBeUndefined()

    expect(request).toHaveBeenCalledWith("avibe-vault-signed-context-replay:v2", { mode: "exclusive" }, expect.any(Function))
  })

  it("fails closed in browsers without an atomic replay lock", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-no-web-lock" })
    vi.stubGlobal("window", {})
    vi.stubGlobal("navigator", {})

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata })).rejects.toThrow(/replay lock is unavailable/)
  })
})

describe("approveRelease batch", () => {
  it("produces one blind box per item with one confirmation ceremony", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const agent = await avaultPublicKey()
    const vmk = newVmk()
    const baseWrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])
    const root = await protectRootMetadata(vmk, rootMetadata, baseWrapMeta)
    const wrapMeta = withRootMetadata(baseWrapMeta, root)
    const names = ["OPENAI_API_KEY", "GITHUB_TOKEN"] as const
    const displaySecrets = names.map((name) => ({ name, kind: "static" as const }))
    const materials = await Promise.all(
      names.map(async (name) => {
        const recordContext = { name, kind: "static" as const }
        return {
          name,
          envelope: packProtectedRecord(await sealProtected(new TextEncoder().encode(`${name}-value`), vmk, recordContext), wrapMeta, recordContext),
        }
      }),
    )
    const items = materials.map((material) => ({
      material,
      context: baseContext({ secretKey, agent, requestId: "req-batch", secrets: displaySecrets }),
    }))
    const confirm = vi.fn(async (_approval: ApproveReleaseApproval) => undefined)

    const result = await approveReleaseBatch({ items, vmk, wrapMeta, confirm })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0].body).toContain(`Agent: ${agent.fingerprint}`)
    expect(confirm.mock.calls[0][0].body).toContain("Grant: grant-1")
    expect(result.blindBoxes).toHaveLength(2)
    expect(result.blindBoxes.every((box) => box.scheme === "hpke-x25519-hkdfsha256-aes256gcm-v1")).toBe(true)
  })

  it("can defer replay consumption until the caller commits the release result", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const agent = await avaultPublicKey()
    const vmk = newVmk()
    const baseWrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])
    const root = await protectRootMetadata(vmk, rootMetadata, baseWrapMeta)
    const wrapMeta = withRootMetadata(baseWrapMeta, root)
    const recordContext = { name: "OPENAI_API_KEY", kind: "static" as const }
    const item = {
      material: {
        name: recordContext.name,
        envelope: packProtectedRecord(await sealProtected(new TextEncoder().encode("secret-value"), vmk, recordContext), wrapMeta, recordContext),
      },
      context: baseContext({ secretKey, agent, requestId: "req-deferred", secrets: [recordContext] }),
    }
    const confirm = vi.fn(async () => undefined)
    let approvalNow: number | undefined

    const result = await approveReleaseBatch({
      items: [item],
      vmk,
      wrapMeta,
      confirm,
      consumeReplayIds: false,
      onApprovalAccepted: (now) => {
        approvalNow = now
      },
    })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(result.blindBoxes).toHaveLength(1)
    expect(approvalNow).toEqual(expect.any(Number))
    await consumeSignedOperationContexts([item.context], approvalNow)
    confirm.mockClear()
    await expect(approveReleaseBatch({ items: [item], vmk, wrapMeta, confirm })).rejects.toThrow(/already used/)
    expect(confirm).not.toHaveBeenCalled()
  })

  it("rejects batches that mix hidden recipients or grants under one display block", async () => {
    const { secretKey } = await daemonRoot()
    const agent = await avaultPublicKey()
    const otherAgent = await avaultPublicKey()
    const vmk = newVmk()
    const wrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])
    const names = ["OPENAI_API_KEY", "GITHUB_TOKEN"] as const
    const displaySecrets = names.map((name) => ({ name, kind: "static" as const }))
    const materials = await Promise.all(
      names.map(async (name) => {
        const recordContext = { name, kind: "static" as const }
        return {
          name,
          envelope: packProtectedRecord(await sealProtected(new TextEncoder().encode(`${name}-value`), vmk, recordContext), wrapMeta, recordContext),
        }
      }),
    )
    const confirm = vi.fn(async () => undefined)

    await expect(
      approveReleaseBatch({
        items: [
          { material: materials[0], context: baseContext({ secretKey, agent, requestId: "req-recipient-a", secrets: displaySecrets }) },
          { material: materials[1], context: baseContext({ secretKey, agent: otherAgent, requestId: "req-recipient-b", secrets: displaySecrets }) },
        ],
        vmk,
        wrapMeta,
        confirm,
      }),
    ).rejects.toThrow(/recipient/)
    await expect(
      approveReleaseBatch({
        items: [
          { material: materials[0], context: baseContext({ secretKey, agent, grantId: "grant-a", requestId: "req-grant-a", secrets: displaySecrets }) },
          { material: materials[1], context: baseContext({ secretKey, agent, grantId: "grant-b", requestId: "req-grant-b", secrets: displaySecrets }) },
        ],
        vmk,
        wrapMeta,
        confirm,
      }),
    ).rejects.toThrow(/recipient/)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe("seal keypair generate", () => {
  it("returns a decryptable keypair envelope and derived addresses", async () => {
    const vmk = newVmk()
    const wrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])

    const result = await sealGeneratedKeypair({ name: "SIGNING_KEY", vmk, wrapMeta })
    const { sealed, recordMetadata } = unpackProtectedRecord(result.envelope)
    const opened = await openProtected(sealed, vmk, protectedRecordContextFromMetadata("SIGNING_KEY", recordMetadata))

    try {
      expect(opened).toHaveLength(32)
      expect(result.publicKey).toBeTruthy()
      expect(result.addresses).toEqual(deriveSigningAddresses(result.publicKey as string))
      expect(result.addresses?.eth).toMatch(/^0x[0-9a-fA-F]{40}$/)
    } finally {
      opened.fill(0)
    }
  })
})

describe("confirm surface gate", () => {
  const visible = {
    documentVisible: true,
    documentFocused: true,
    frameWidth: 360,
    frameHeight: 280,
    intersectionRatio: 1,
    visibleByIntersectionObserver: true,
    uiShowPending: false,
    embedded: false,
  }

  const parentVisible = {
    frameWidth: 360,
    frameHeight: 280,
    intersectionRatio: 1,
    visibleByIntersectionObserver: true,
    opacity: 1,
    pointerEvents: true,
    ageMs: 20,
  }

  it("passes only when the sandbox is focused, large enough, fully visible, and settled", () => {
    expect(evaluateConfirmSurface(visible)).toEqual({ ok: true })
    expect(evaluateConfirmSurface({ ...visible, documentFocused: false })).toMatchObject({ ok: false, code: "sandbox_not_visible" })
    expect(evaluateConfirmSurface({ ...visible, frameWidth: 200 })).toMatchObject({ ok: false, code: "sandbox_not_visible" })
    expect(evaluateConfirmSurface({ ...visible, intersectionRatio: 0.98 })).toMatchObject({ ok: false, code: "sandbox_not_visible" })
    expect(evaluateConfirmSurface({ ...visible, uiShowPending: true })).toMatchObject({ ok: false, code: "sandbox_not_visible" })
  })

  it("requires fresh parent-frame visibility evidence when embedded", () => {
    expect(evaluateConfirmSurface({ ...visible, embedded: true })).toMatchObject({ ok: false, code: "sandbox_not_visible" })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: parentVisible })).toEqual({ ok: true })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, intersectionRatio: 0.98 } })).toMatchObject({
      ok: false,
      code: "sandbox_not_visible",
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, opacity: 0.5 } })).toMatchObject({
      ok: false,
      code: "sandbox_not_visible",
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, ageMs: 61_000 } })).toMatchObject({
      ok: false,
      code: "sandbox_not_visible",
    })
  })

  it("parses CSS-style parent opacity and recomputes attestation age when read", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const input = {
      receivedAt: 1_000,
      value: {
        sampledAt: 900,
        frame: {
          width: 360,
          height: 280,
          intersectionRatio: 1,
          visibleByIntersectionObserver: true,
          opacity: "1",
          pointerEvents: "auto",
        },
      },
    }

    expect(parseParentConfirmSurface(input)).toMatchObject({ opacity: 1, pointerEvents: true, ageMs: 100 })
    vi.setSystemTime(2_500)
    expect(parseParentConfirmSurface(input)).toMatchObject({ opacity: 1, pointerEvents: true, ageMs: 1_600 })
  })

  it("requires parent surfaces to carry a measurement timestamp", () => {
    vi.useFakeTimers()
    vi.setSystemTime(70_000)
    const frame = {
      width: 360,
      height: 280,
      intersectionRatio: 1,
      visibleByIntersectionObserver: true,
      opacity: "1",
      pointerEvents: "auto",
    }

    expect(parseParentConfirmSurface({ receivedAt: 70_000, value: { frame } })).toBeUndefined()
    expect(parseParentConfirmSurface({ receivedAt: 70_000, value: { sampledAt: 5_000, frame } })).toMatchObject({ ageMs: 65_000 })
  })
})
