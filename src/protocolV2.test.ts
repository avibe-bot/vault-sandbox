import { afterEach, describe, expect, it, vi } from "vitest"
import { Aes256Gcm, CipherSuite, HkdfSha256 } from "@hpke/core"
import { DhkemX25519HkdfSha256 } from "@hpke/dhkem-x25519"
import { ed25519 } from "@noble/curves/ed25519.js"

import { resolveAuthorizationPlan, type RiskTier } from "./authz"
import { approveReleaseBatch, isStaticReleaseRecord, type ApproveReleaseApproval } from "./approveRelease"
import { assertConfirmSurfaceReady, evaluateConfirmSurface, monitorConfirmSurface, parseParentConfirmSurface, readConfirmSurfaceSnapshot } from "./confirmSurface"
import {
  assertSignedOperationContextPreview,
  agentDeliverBlindBoxContextFromSignedContext,
  assertSignedOperationContextsConsumable,
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
  blindBoxAgentDeliverOperationHash,
  buildWrapMeta,
  bytesToBase64,
  bytesToHexString,
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
import { CHANNEL, RpcServer, VERSION, type RpcRequestContext } from "./rpc"

afterEach(() => {
  resetSignedContextReplayCacheForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function installMemoryStorage(): Storage {
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
  return storage
}

function signContext<T extends Omit<SignedOperationContext, "signature">>(
  unsigned: T,
  secretKey: Uint8Array,
  keyId = "daemon-1",
): T & Pick<SignedOperationContext, "signature"> {
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

async function baseContext(input: {
  secretKey: Uint8Array
  agent?: AvaultPublicKey
  grantId?: string
  requestId?: string
  expiresAt?: string
  secrets?: SignedOperationContext["display"]["secrets"]
  releaseName?: string
  approvalNonce?: number[]
  approvalExpiresAtUnix?: number
  command?: string
}): Promise<SignedOperationContext> {
  const secrets = input.secrets ?? [{ name: "OPENAI_API_KEY", kind: "static" as const }]
  const expiresAt = input.expiresAt ?? new Date(Date.now() + 60_000).toISOString()
  const releaseName = input.releaseName ?? secrets[0].name
  return signContext(
    {
      v: 2,
      purpose: "agent-deliver",
      requestId: input.requestId ?? "req-1",
      grantId: input.grantId ?? "grant-1",
      display: {
        secrets,
        sessionLabel: "Workbench · fix-ci",
        command: input.command ?? "npm test",
        egress: "api.github.com",
        source: { env: ["OPENAI_API_KEY"], tags: ["prod"], skills: ["github"] },
        grantTtlSeconds: 60,
      },
      release: {
        name: releaseName,
        ttlSecs: 60,
        approvalNonce: input.approvalNonce ?? Array.from({ length: 16 }, (_, index) => index + 1),
        approvalExpiresAtUnix: input.approvalExpiresAtUnix ?? Math.floor(Date.parse(expiresAt) / 1000),
        operationHash: bytesToHexString(await blindBoxAgentDeliverOperationHash(releaseName, 60)),
      },
      agent: input.agent ? { publicKey: input.agent, fingerprint: input.agent.fingerprint ?? "" } : undefined,
      expiresAt,
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
  it("verifies a lossless non-ASCII daemon-signed context against pinned root metadata", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const base = await baseContext({ secretKey, agent: await avaultPublicKey() })
    const { signature: _signature, ...unsigned } = base
    const signed = signContext(
      {
        ...unsigned,
        display: {
          ...unsigned.display,
          sessionLabel: "生产工作台 🚀",
          command: "部署：echo 你好 🌕",
        },
        futureContractField: { label: "保留字段 🔐" },
      },
      secretKey,
    )
    const context = parseSignedOperationContext(signed)

    expect(() => verifySignedOperationContext({ context, rootMetadata, expectedPurpose: "agent-deliver" })).not.toThrow()
    expect(signedOperationContextMessage(context)).toContain("生产工作台 🚀")
    expect(signedOperationContextMessage(context)).toContain("保留字段 🔐")
  })

  it("uses the daemon-provided approval nonce in the blind-box context", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const approvalNonce = Array.from({ length: 16 }, (_, index) => 0xa0 + index)
    const approvalExpiresAtUnix = Math.floor(Date.now() / 1000) + 45
    const context = parseSignedOperationContext(await baseContext({
      secretKey,
      agent: await avaultPublicKey(),
      approvalNonce,
      approvalExpiresAtUnix,
      requestId: "req-daemon-nonce",
    }))

    expect(() => verifySignedOperationContext({ context, rootMetadata, expectedPurpose: "agent-deliver" })).not.toThrow()
    const blindBoxContext = await agentDeliverBlindBoxContextFromSignedContext(context, "OPENAI_API_KEY")
    expect(blindBoxContext).toMatchObject({
      purpose: "agent-deliver",
      name: "OPENAI_API_KEY",
      grantId: "grant-1",
      ttlSecs: 60,
    })
    expect(blindBoxContext.approvalNonce).toEqual(new Uint8Array(approvalNonce))
    expect(blindBoxContext.approvalExpiresAtUnix).toBe(approvalExpiresAtUnix)
    expect(blindBoxContext.operationHash).toBe(context.release?.operationHash)
    const oldSelfDerivedNonce = new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`approveRelease:${context.requestId}:OPENAI_API_KEY`)),
    )
    expect(blindBoxContext.approvalNonce).not.toEqual(oldSelfDerivedNonce)
  })

  it("rejects verification when release is dropped from the canonical message", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const signed = parseSignedOperationContext(await baseContext({ secretKey, agent: await avaultPublicKey() }))
    const { release: _release, ...withoutRelease } = signed

    expect(() => verifySignedOperationContext({ context: withoutRelease as SignedOperationContext, rootMetadata })).toThrow(/signature/)
  })

  it("rejects agent delivery contexts that omit the displayed release TTL", async () => {
    const { secretKey } = await daemonRoot()
    const base = await baseContext({ secretKey, agent: await avaultPublicKey() })
    const { signature: _signature, ...unsigned } = base
    const { grantTtlSeconds: _ttl, ...display } = unsigned.display
    const signed = signContext({ ...unsigned, display }, secretKey)

    expect(() => parseSignedOperationContext(signed)).toThrow(/display.*TTL/)
  })

  it("rejects an expired daemon approval even while the signed context is current", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const now = Date.now()
    const approvalExpiresAtUnix = Math.floor(now / 1000) + 1
    const context = parseSignedOperationContext(await baseContext({
      secretKey,
      agent: await avaultPublicKey(),
      approvalExpiresAtUnix,
      expiresAt: new Date(now + 60_000).toISOString(),
    }))

    expect(() => verifySignedOperationContext({ context, rootMetadata, now })).not.toThrow()
    expect(() => verifySignedOperationContext({ context, rootMetadata, now: (approvalExpiresAtUnix + 1) * 1_000 })).toThrow(/approval is expired/)
  })

  it("preserves purpose-specific reveal release fields in the signed message", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const release = {
      name: "PROTECTED_REVEAL",
      envelopeHash: { alg: "sha256", digest: "ab".repeat(32) },
    }
    const context = parseSignedOperationContext(signContext({
      v: 2,
      purpose: "reveal",
      requestId: "vrl-purpose-specific-release",
      display: {
        secrets: [{ name: "PROTECTED_REVEAL", kind: "static" }],
        sessionLabel: "查看凭据 🔎",
      },
      release,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }, secretKey))

    expect(context.release).toEqual(release)
    expect(() => verifySignedOperationContext({ context, rootMetadata, expectedPurpose: "reveal" })).not.toThrow()
  })

  it("validates reveal and signing previews before a locked-vault passkey prompt", async () => {
    const { secretKey } = await daemonRoot()
    const base = {
      v: 2 as const,
      requestId: "preview-coverage",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    const reveal = parseSignedOperationContext(signContext({
      ...base,
      purpose: "reveal",
      display: { secrets: [{ name: "API_KEY", kind: "static" as const }] },
    }, secretKey))
    const sign = parseSignedOperationContext(signContext({
      ...base,
      requestId: "preview-signing-coverage",
      purpose: "sign",
      display: { secrets: [{ name: "WALLET_KEY", kind: "keypair" as const }] },
    }, secretKey))

    expect(() => assertSignedOperationContextPreview({
      context: reveal,
      expectedPurpose: "reveal",
      secret: { name: "API_KEY", kind: "static" },
    })).not.toThrow()
    expect(() => assertSignedOperationContextPreview({
      context: sign,
      expectedPurpose: "sign",
      secret: { name: "WALLET_KEY", kind: "keypair" },
    })).not.toThrow()
    expect(() => assertSignedOperationContextPreview({
      context: reveal,
      expectedPurpose: "reveal",
      secret: { name: "OTHER_KEY", kind: "static" },
    })).toThrow(/does not cover/)
    expect(() => assertSignedOperationContextPreview({
      context: sign,
      expectedPurpose: "reveal",
      secret: { name: "WALLET_KEY", kind: "keypair" },
    })).toThrow(/wrong purpose/)
  })

  it("rejects bad signatures, expired contexts, and replayed requestIds", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const valid = await baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-replay" })
    const tampered = parseSignedOperationContext({ ...valid, display: { ...valid.display, command: "rm -rf /" } })
    const expired = await baseContext({
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
      const context = await baseContext({ secretKey, requestId: `req-cache-${index}`, expiresAt })
      await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now })).resolves.toBeUndefined()
    }

    await expect(
      verifyAndConsumeSignedOperationContext({
        context: await baseContext({ secretKey, requestId: "req-cache-extra", expiresAt }),
        rootMetadata,
        now,
      }),
    ).rejects.toThrow(/replay cache is full/)
    await expect(
      verifyAndConsumeSignedOperationContext({
        context: await baseContext({ secretKey, requestId: "req-cache-0", expiresAt }),
        rootMetadata,
        now,
      }),
    ).rejects.toThrow(/already used/)
  })

  it("rehydrates consumed replay IDs after a sandbox reload", async () => {
    installMemoryStorage()
    const { rootMetadata, secretKey } = await daemonRoot()
    const now = Date.now()
    const context = await baseContext({
      secretKey,
      agent: await avaultPublicKey(),
      requestId: "req-persisted-replay",
      expiresAt: new Date(now + 60_000).toISOString(),
    })

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now })).resolves.toBeUndefined()
    resetSignedContextReplayCacheForTests({ clearPersistent: false })
    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now: now + 1_000 })).rejects.toThrow(/already used/)
  })

  it("refreshes persisted replay IDs while holding the claim lock", async () => {
    const storage = installMemoryStorage()
    const { rootMetadata, secretKey } = await daemonRoot()
    const now = Date.now()
    const expiresAt = new Date(now + 60_000).toISOString()
    const context = await baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-lock-refresh", expiresAt })

    assertSignedOperationContextsConsumable([context], now)
    storage.setItem(
      "avibe-vault-signed-context-replay:v2",
      JSON.stringify({ version: 2, entries: [[context.requestId, Date.parse(expiresAt)]] }),
    )

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata, now })).rejects.toThrow(/already used/)
  })

  it("claims replay IDs through the browser Web Locks API when available", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = await baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-web-lock" })
    const request = vi.fn(async (_name: string, _options: { mode: "exclusive" }, callback: () => Promise<void> | void) => {
      await callback()
    })
    vi.stubGlobal("navigator", { locks: { request } })

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata })).resolves.toBeUndefined()

    expect(request).toHaveBeenCalledWith("avibe-vault-signed-context-replay:v2", { mode: "exclusive" }, expect.any(Function))
  })

  it("fails closed in browsers when replay state cannot be shared", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = await baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-no-storage" })
    const request = vi.fn(async (_name: string, _options: { mode: "exclusive" }, callback: () => Promise<void> | void) => {
      await callback()
    })
    vi.stubGlobal("window", {})
    vi.stubGlobal("navigator", { locks: { request } })

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata })).rejects.toThrow(/replay state is unavailable/)
  })

  it("fails closed in browsers when replay state cannot be durably recorded", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = await baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-storage-write-fails" })
    const request = vi.fn(async (_name: string, _options: { mode: "exclusive" }, callback: () => Promise<void> | void) => {
      await callback()
    })
    vi.stubGlobal("window", {})
    vi.stubGlobal("navigator", { locks: { request } })
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error("storage-disabled")
      }),
      removeItem: vi.fn(),
    })

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata })).rejects.toThrow(/replay state is unavailable/)
  })

  it("fails closed in browsers without an atomic replay lock", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const context = await baseContext({ secretKey, agent: await avaultPublicKey(), requestId: "req-no-web-lock" })
    vi.stubGlobal("window", {})
    vi.stubGlobal("navigator", {})

    await expect(verifyAndConsumeSignedOperationContext({ context, rootMetadata })).rejects.toThrow(/replay lock is unavailable/)
  })
})

describe("request-scoped parent surface attestations", () => {
  function surface(width: number) {
    return {
      sampledAt: Date.now(),
      frame: {
        width,
        height: 280,
        intersectionRatio: 1,
        visibleByIntersectionObserver: true,
        opacity: "1",
        pointerEvents: "auto",
      },
    }
  }

  async function send(server: RpcServer, data: Record<string, unknown>, source: MessageEventSource): Promise<void> {
    const onMessage = (server as unknown as { onMessage(event: MessageEvent): Promise<void> }).onMessage.bind(server)
    await onMessage({ origin: "https://app.avibe.bot", source, data } as MessageEvent)
  }

  it("does not carry a parent surface sample into the next approval request", async () => {
    const server = new RpcServer()
    const source = { postMessage: vi.fn() } as unknown as MessageEventSource
    const contexts: RpcRequestContext[] = []
    let finishRequest: ((result: unknown) => void) | null = null
    const finishCurrentRequest = (): void => {
      const finish = finishRequest
      if (!finish) throw new Error("request handler was not entered")
      finish({})
    }
    server.register("handshake", () => ({ accepted: true }))
    server.register("reveal", (_payload, context) => {
      contexts.push(context)
      return new Promise((resolve) => {
        finishRequest = resolve
      })
    })

    await send(
      server,
      {
        channel: CHANNEL,
        version: VERSION,
        id: "handshake-1",
        op: "handshake",
        payload: { parentOrigin: "https://app.avibe.bot", nonce: "1234567890123456" },
      },
      source,
    )

    const first = send(
      server,
      { channel: CHANNEL, version: VERSION, id: "reveal-1", op: "reveal", payload: {}, surface: surface(360) },
      source,
    )
    await Promise.resolve()
    expect(contexts[0].latestSurface()?.value).toMatchObject({ frame: { width: 360 } })
    await send(
      server,
      { channel: CHANNEL, version: VERSION, kind: "event", event: "confirm.surface", id: "reveal-1", surface: surface(420) },
      source,
    )
    expect(contexts[0].latestSurface()?.value).toMatchObject({ frame: { width: 420 } })
    finishCurrentRequest()
    await first

    const second = send(server, { channel: CHANNEL, version: VERSION, id: "reveal-2", op: "reveal", payload: {} }, source)
    await Promise.resolve()
    expect(contexts[1].latestSurface()).toBeUndefined()
    await send(
      server,
      { channel: CHANNEL, version: VERSION, kind: "event", event: "confirm.surface", id: "reveal-1", surface: surface(500) },
      source,
    )
    expect(contexts[1].latestSurface()).toBeUndefined()
    finishCurrentRequest()
    await second
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
    const longCommand = [
      "curl --request POST https://api.example.com/v1/deployments/production/releases",
      "  --header 'Authorization: Bearer $DEPLOY_TOKEN'",
      "  --header 'Content-Type: application/json'",
      "  --data '{\"service\":\"payments-worker\",\"revision\":\"0123456789abcdef0123456789abcdef0123456789abcdef\"}'",
    ].join("\\\n")
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
    const items = await Promise.all(materials.map(async (material) => ({
      material,
      context: await baseContext({
        secretKey,
        agent,
        requestId: "req-batch",
        secrets: displaySecrets,
        releaseName: material.name,
        command: longCommand,
      }),
    })))
    const confirm = vi.fn(async (_approval: ApproveReleaseApproval) => undefined)

    const result = await approveReleaseBatch({ items, vmk, wrapMeta, confirm })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatchObject({
      display: {
        command: longCommand,
        grantTtlSeconds: 60,
        secrets: displaySecrets,
      },
      recipient: { agentFingerprint: agent.fingerprint, grantId: "grant-1" },
    })
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
      context: await baseContext({ secretKey, agent, requestId: "req-deferred", secrets: [recordContext] }),
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

  it("treats metadata-less protected records as static for approveRelease", async () => {
    const { rootMetadata, secretKey } = await daemonRoot()
    const agent = await avaultPublicKey()
    const vmk = newVmk()
    const baseWrapMeta = await buildWrapMeta(vmk, [
      { kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x11) },
    ])
    const root = await protectRootMetadata(vmk, rootMetadata, baseWrapMeta)
    const wrapMeta = withRootMetadata(baseWrapMeta, root)
    const recordContext = { name: "LEGACY_STATIC" }
    const item = {
      material: {
        name: recordContext.name,
        envelope: packProtectedRecord(await sealProtected(new TextEncoder().encode("legacy-value"), vmk, recordContext), wrapMeta, recordContext),
      },
      context: await baseContext({
        secretKey,
        agent,
        requestId: "req-legacy-static",
        secrets: [{ name: recordContext.name, kind: "static" }],
      }),
    }
    const confirm = vi.fn(async () => undefined)

    expect(isStaticReleaseRecord(undefined)).toBe(true)
    expect(isStaticReleaseRecord({ kind: "keypair", public_key: "0xabc" })).toBe(false)
    const result = await approveReleaseBatch({ items: [item], vmk, wrapMeta, confirm })

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(result.blindBoxes).toHaveLength(1)
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
          { material: materials[0], context: await baseContext({ secretKey, agent, requestId: "req-recipient-a", secrets: displaySecrets }) },
          { material: materials[1], context: await baseContext({ secretKey, agent: otherAgent, requestId: "req-recipient-b", secrets: displaySecrets }) },
        ],
        vmk,
        wrapMeta,
        confirm,
      }),
    ).rejects.toThrow(/recipient/)
    await expect(
      approveReleaseBatch({
        items: [
          { material: materials[0], context: await baseContext({ secretKey, agent, grantId: "grant-a", requestId: "req-grant-a", secrets: displaySecrets }) },
          { material: materials[1], context: await baseContext({ secretKey, agent, grantId: "grant-b", requestId: "req-grant-b", secrets: displaySecrets }) },
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

  it("keeps sandbox visibility checks fail-closed with stable details", () => {
    expect(evaluateConfirmSurface(visible)).toEqual({ ok: true })
    expect(evaluateConfirmSurface({ ...visible, frameHeight: 220 })).toEqual({ ok: true })
    expect(evaluateConfirmSurface({ ...visible, uiShowPending: true })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "ui show is still pending",
    })
    expect(evaluateConfirmSurface({ ...visible, documentVisible: false })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "document is not visible",
    })
    expect(evaluateConfirmSurface({ ...visible, documentFocused: false })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "document is not focused",
    })
    expect(evaluateConfirmSurface({ ...visible, frameWidth: 200 })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "sandbox frame is too small",
    })
    expect(evaluateConfirmSurface({ ...visible, frameHeight: 219 })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "sandbox frame is too small",
    })
    expect(evaluateConfirmSurface({ ...visible, intersectionRatio: 0.98 })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "sandbox frame is not fully visible",
    })
    expect(evaluateConfirmSurface({ ...visible, visibleByIntersectionObserver: false })).toEqual({
      ok: false,
      code: "sandbox_not_visible",
      detail: "sandbox frame is not fully visible",
    })
  })

  it("reports parent-frame attestation failures as advisory warnings", () => {
    expect(evaluateConfirmSurface({ ...visible, embedded: true })).toEqual({
      ok: true,
      warnings: ["parent frame visibility is not attested"],
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: parentVisible })).toEqual({ ok: true })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, ageMs: 61_000 } })).toEqual({
      ok: true,
      warnings: ["parent frame visibility is stale"],
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, frameWidth: 200 } })).toEqual({
      ok: true,
      warnings: ["parent frame is too small"],
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, intersectionRatio: 0.5 } })).toEqual({
      ok: true,
      warnings: ["parent frame is not fully visible"],
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, opacity: 0.3 } })).toEqual({
      ok: true,
      warnings: ["parent frame is visually occluded"],
    })
    expect(evaluateConfirmSurface({ ...visible, embedded: true, parent: { ...parentVisible, pointerEvents: false } })).toEqual({
      ok: true,
      warnings: ["parent frame is visually occluded"],
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

  it("observes the fixed card shell and logs parent-frame advisory warnings", async () => {
    const fullDocument = { nodeName: "HTML" } as Element
    const cardShell = { nodeName: "MAIN" } as Element
    const observedTargets: Element[] = []
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      documentElement: fullDocument,
      body: fullDocument,
    })
    vi.stubGlobal("window", { innerWidth: 360, innerHeight: 280, parent: {}, self: {} })
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        private readonly callback: IntersectionObserverCallback
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback
        }
        observe(target: Element): void {
          observedTargets.push(target)
          this.callback(
            [{ intersectionRatio: target === cardShell ? 1 : 0.25, isVisible: true } as unknown as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        }
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return []
        }
        root = null
        rootMargin = "0px"
        thresholds = [0, 0.99, 1]
      },
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(readConfirmSurfaceSnapshot({ uiShowPending: false, visibilityTarget: cardShell })).resolves.toMatchObject({
      intersectionRatio: 1,
      visibleByIntersectionObserver: true,
    })
    await expect(assertConfirmSurfaceReady({ uiShowPending: false, visibilityTarget: cardShell })).resolves.toBeUndefined()
    expect(observedTargets).toEqual([cardShell, cardShell])
    expect(warn).toHaveBeenCalledWith("[vault-sandbox] Confirm surface advisory: parent frame visibility is not attested")
    warn.mockRestore()
  })

  it("keeps a live surface sample for synchronous click-time validation", async () => {
    const cardShell = { nodeName: "MAIN" } as Element
    let observerCallback: IntersectionObserverCallback | undefined
    let disconnected = false
    vi.stubGlobal("document", {
      visibilityState: "visible",
      hasFocus: () => true,
      documentElement: cardShell,
      body: cardShell,
    })
    vi.stubGlobal("window", { innerWidth: 360, innerHeight: 280, parent: {}, self: {} })
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          observerCallback = callback
        }
        observe(): void {
          observerCallback?.(
            [{ intersectionRatio: 1, isVisible: true } as unknown as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          )
        }
        unobserve(): void {}
        disconnect(): void {
          disconnected = true
        }
        takeRecords(): IntersectionObserverEntry[] {
          return []
        }
        root = null
        rootMargin = "0px"
        thresholds = [0, 0.99, 1]
      },
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const lease = monitorConfirmSurface({ uiShowPending: () => false, visibilityTarget: cardShell })

    await expect(lease.ready).resolves.toBeUndefined()
    expect(() => lease.assertCurrent()).not.toThrow()

    observerCallback?.(
      [{ intersectionRatio: 0.5, isVisible: true } as unknown as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    expect(() => lease.assertCurrent()).toThrow(/not fully visible/)

    lease.dispose()
    expect(disconnected).toBe(true)
    warn.mockRestore()
  })
})
