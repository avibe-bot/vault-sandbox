import { RpcError } from "./rpc"
import { t } from "./i18n"
import {
  blindBoxAgentDeliverOperationHash,
  verifyDaemonBindingSignature,
  type AvaultPublicKey,
  type ProtectedDekDeliveryBlindBoxContext,
  type ProtectedRecordKind,
  type VaultRootMetadata,
} from "./vaultCrypto"

export type SignedOperationPurpose = "agent-deliver" | "sign" | "reveal"

export type SignedOperationContext = {
  v: 2
  purpose: SignedOperationPurpose
  requestId: string
  grantId?: string
  display: {
    secrets: Array<{ name: string; kind: ProtectedRecordKind }>
    sessionLabel?: string
    command?: string
    egress?: string
    source?: { env?: string[]; tags?: string[]; skills?: string[] }
    grantTtlSeconds?: number
  }
  agent?: { publicKey: AvaultPublicKey; fingerprint: string }
  expiresAt: string
  signature: { alg: "ed25519"; keyId: string; value: string }
}

const MAX_CONSUMED_REQUEST_IDS = 512
const REPLAY_STORAGE_KEY = "avibe-vault-signed-context-replay:v2"
const REPLAY_CHANNEL_NAME = "avibe-vault-signed-context-replay:v2"
const REPLAY_LOCK_NAME = "avibe-vault-signed-context-replay:v2"
const consumedRequestIds = new Map<string, number>()
let replayHydrated = false
let replayChannel: BroadcastChannel | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) throw new RpcError("invalid_payload", `${field} must be a non-empty string`)
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new RpcError("invalid_payload", `${field} must be a string`)
  return value
}

function optionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new RpcError("invalid_payload", `${field} must be a string array`)
  }
  return value
}

function parseKind(value: unknown, field: string): ProtectedRecordKind {
  if (value !== "static" && value !== "keypair") throw new RpcError("invalid_payload", `${field} must be static or keypair`)
  return value
}

function parsePurpose(value: unknown): SignedOperationPurpose {
  if (value !== "agent-deliver" && value !== "sign" && value !== "reveal") {
    throw new RpcError("invalid_payload", "context purpose is invalid")
  }
  return value
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

export function parseSignedOperationContext(value: unknown): SignedOperationContext {
  const record = isRecord(value) ? value : null
  if (!record) throw new RpcError("invalid_payload", "context must be an object")
  if (record.v !== 2) throw new RpcError("invalid_payload", "context version must be 2")
  const display = isRecord(record.display) ? record.display : null
  if (!display) throw new RpcError("invalid_payload", "context.display must be an object")
  if (!Array.isArray(display.secrets) || display.secrets.length === 0) {
    throw new RpcError("invalid_payload", "context.display.secrets must be a non-empty array")
  }
  const source = display.source
  const signature = isRecord(record.signature) ? record.signature : null
  if (!signature) throw new RpcError("invalid_payload", "context.signature must be an object")
  if (signature.alg !== "ed25519") throw new RpcError("invalid_payload", "context signature alg must be ed25519")
  const agent = record.agent
  const parsedAgent = agent === undefined || agent === null
    ? undefined
    : (() => {
        if (!isRecord(agent)) throw new RpcError("invalid_payload", "context.agent must be an object")
        const publicKey = isRecord(agent.publicKey) ? agent.publicKey : null
        if (!publicKey) throw new RpcError("invalid_payload", "context.agent.publicKey must be an object")
        const fingerprint = requiredString(agent.fingerprint, "context.agent.fingerprint")
        return {
          publicKey: {
            public_key: requiredString(publicKey.public_key, "context.agent.publicKey.public_key"),
            ...(publicKey.fingerprint !== undefined ? { fingerprint: optionalString(publicKey.fingerprint, "context.agent.publicKey.fingerprint") } : {}),
          },
          fingerprint,
        }
      })()

  return {
    v: 2,
    purpose: parsePurpose(record.purpose),
    requestId: requiredString(record.requestId, "context.requestId"),
    ...(record.grantId !== undefined ? { grantId: optionalString(record.grantId, "context.grantId") } : {}),
    display: {
      secrets: display.secrets.map((secret, index) => {
        if (!isRecord(secret)) throw new RpcError("invalid_payload", `context.display.secrets[${index}] must be an object`)
        return {
          name: requiredString(secret.name, `context.display.secrets[${index}].name`),
          kind: parseKind(secret.kind, `context.display.secrets[${index}].kind`),
        }
      }),
      ...(display.sessionLabel !== undefined ? { sessionLabel: optionalString(display.sessionLabel, "context.display.sessionLabel") } : {}),
      ...(display.command !== undefined ? { command: optionalString(display.command, "context.display.command") } : {}),
      ...(display.egress !== undefined ? { egress: optionalString(display.egress, "context.display.egress") } : {}),
      ...(source !== undefined
        ? {
            source: (() => {
              if (!isRecord(source)) throw new RpcError("invalid_payload", "context.display.source must be an object")
              return {
                ...(source.env !== undefined ? { env: optionalStringArray(source.env, "context.display.source.env") } : {}),
                ...(source.tags !== undefined ? { tags: optionalStringArray(source.tags, "context.display.source.tags") } : {}),
                ...(source.skills !== undefined ? { skills: optionalStringArray(source.skills, "context.display.source.skills") } : {}),
              }
            })(),
          }
        : {}),
      ...(display.grantTtlSeconds !== undefined
        ? {
            grantTtlSeconds:
              typeof display.grantTtlSeconds === "number" && Number.isSafeInteger(display.grantTtlSeconds) && display.grantTtlSeconds >= 0
                ? display.grantTtlSeconds
                : (() => {
                    throw new RpcError("invalid_payload", "context.display.grantTtlSeconds must be a non-negative integer")
                  })(),
          }
        : {}),
    },
    ...(parsedAgent ? { agent: parsedAgent } : {}),
    expiresAt: requiredString(record.expiresAt, "context.expiresAt"),
    signature: {
      alg: "ed25519",
      keyId: requiredString(signature.keyId, "context.signature.keyId"),
      value: requiredString(signature.value, "context.signature.value"),
    },
  }
}

export function signedOperationContextMessage(context: SignedOperationContext): string {
  const { signature: _signature, ...unsigned } = context
  return stableJson(unsigned)
}

export function verifySignedOperationContext(input: {
  context: SignedOperationContext
  rootMetadata: VaultRootMetadata | null
  expectedPurpose?: SignedOperationPurpose
  now?: number
}): void {
  if (input.expectedPurpose && input.context.purpose !== input.expectedPurpose) {
    throw new RpcError("invalid_context", "signed context purpose does not match operation")
  }
  const expires = Date.parse(input.context.expiresAt)
  if (!Number.isFinite(expires) || expires <= (input.now ?? Date.now())) {
    throw new RpcError("context_expired", "signed context is expired", true)
  }
  const verified = verifyDaemonBindingSignature({
    rootMetadata: input.rootMetadata,
    keyId: input.context.signature.keyId,
    signature: input.context.signature.value,
    message: signedOperationContextMessage(input.context),
  })
  if (!verified) throw new RpcError("invalid_context_signature", "signed context signature is invalid")
}

function pruneExpiredConsumedRequestIds(now: number): void {
  for (const [requestId, expiresAt] of consumedRequestIds) {
    if (expiresAt <= now) consumedRequestIds.delete(requestId)
  }
}

function replayStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function shouldRequireSharedReplayState(): boolean {
  return typeof window !== "undefined"
}

function replayStateUnavailable(): RpcError {
  return new RpcError("context_replay_state_unavailable", "signed context replay state is unavailable", true)
}

function sharedReplayStorage(required: boolean): Storage | null {
  const storage = replayStorage()
  if (!storage && required && shouldRequireSharedReplayState()) throw replayStateUnavailable()
  return storage
}

function parseReplayEntries(value: unknown, now: number): Map<string, number> {
  const parsed = new Map<string, number>()
  if (!isRecord(value) || value.version !== 2 || !Array.isArray(value.entries)) return parsed
  for (const entry of value.entries) {
    if (!Array.isArray(entry) || entry.length !== 2) continue
    const [requestId, expiresAt] = entry
    if (typeof requestId !== "string" || requestId.length === 0 || typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) continue
    if (expiresAt > now) parsed.set(requestId, Math.max(parsed.get(requestId) ?? 0, expiresAt))
  }
  return parsed
}

function persistConsumedRequestIds(now = Date.now(), required = false): void {
  pruneExpiredConsumedRequestIds(now)
  const storage = sharedReplayStorage(required)
  if (!storage) return
  try {
    storage.setItem(REPLAY_STORAGE_KEY, JSON.stringify({ version: 2, entries: [...consumedRequestIds] }))
  } catch {
    if (required && shouldRequireSharedReplayState()) throw replayStateUnavailable()
    // Non-browser tests and legacy contexts retain in-memory protection.
  }
}

function applyConsumedRequestIdEntries(entries: Iterable<[string, number]>, now = Date.now(), persist = true): void {
  for (const [requestId, expiresAt] of entries) {
    if (expiresAt > now) consumedRequestIds.set(requestId, Math.max(consumedRequestIds.get(requestId) ?? 0, expiresAt))
  }
  if (persist) persistConsumedRequestIds(now)
}

function ensureReplayChannel(): void {
  if (replayChannel || typeof BroadcastChannel === "undefined") return
  try {
    replayChannel = new BroadcastChannel(REPLAY_CHANNEL_NAME)
    replayChannel.addEventListener("message", (event) => {
      const record = isRecord(event.data) ? event.data : null
      if (!record || record.type !== "signed-context-consumed") return
      applyConsumedRequestIdEntries(parseReplayEntries({ version: 2, entries: record.entries }, Date.now()))
    })
  } catch {
    replayChannel = null
  }
}

function hydrateConsumedRequestIds(now = Date.now()): void {
  if (replayHydrated) return
  ensureReplayChannel()
  refreshConsumedRequestIdsFromStorage(now, shouldRequireSharedReplayState())
  replayHydrated = true
}

function refreshConsumedRequestIdsFromStorage(now = Date.now(), required = false): void {
  ensureReplayChannel()
  const storage = sharedReplayStorage(required)
  if (!storage) return
  try {
    applyConsumedRequestIdEntries(parseReplayEntries(JSON.parse(storage.getItem(REPLAY_STORAGE_KEY) ?? "null"), now), now, false)
    pruneExpiredConsumedRequestIds(now)
  } catch {
    if (required && shouldRequireSharedReplayState()) throw replayStateUnavailable()
    persistConsumedRequestIds(now)
  }
}

function broadcastConsumedRequestIds(entries: Array<[string, number]>): void {
  ensureReplayChannel()
  try {
    replayChannel?.postMessage({ type: "signed-context-consumed", entries })
  } catch {
    // Best-effort cross-frame propagation; localStorage covers reloads.
  }
}

type LockManagerLike = {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => T | Promise<T>): Promise<T>
}

function lockManager(): LockManagerLike | null {
  const maybeNavigator = globalThis.navigator as (Navigator & { locks?: unknown }) | undefined
  const locks = maybeNavigator?.locks
  if (!locks || typeof locks !== "object") return null
  const request = (locks as { request?: unknown }).request
  if (typeof request !== "function") return null
  return locks as LockManagerLike
}

async function withReplayClaimLock<T>(callback: () => T | Promise<T>): Promise<T> {
  const locks = lockManager()
  if (locks) return await locks.request(REPLAY_LOCK_NAME, { mode: "exclusive" }, callback)
  if (typeof window !== "undefined") {
    throw new RpcError("context_replay_lock_unavailable", "signed context replay lock is unavailable", true)
  }
  return await callback()
}

function consumableRequestIds(contexts: Iterable<SignedOperationContext>, now: number): Map<string, number> {
  hydrateConsumedRequestIds(now)
  const unique = new Map<string, number>()
  for (const context of contexts) {
    const expiresAt = Date.parse(context.expiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      throw new RpcError("context_expired", "signed context is expired", true)
    }
    unique.set(context.requestId, Math.max(unique.get(context.requestId) ?? 0, expiresAt))
  }
  pruneExpiredConsumedRequestIds(now)
  for (const requestId of unique.keys()) {
    if (consumedRequestIds.has(requestId)) {
      throw new RpcError("context_replayed", "signed context requestId was already used", true)
    }
  }
  if (consumedRequestIds.size + unique.size > MAX_CONSUMED_REQUEST_IDS) {
    throw new RpcError("context_replay_cache_full", "signed context replay cache is full", true)
  }
  return unique
}

export function assertSignedOperationContextsConsumable(contexts: Iterable<SignedOperationContext>, now = Date.now()): void {
  void consumableRequestIds(contexts, now)
}

export async function consumeSignedOperationContexts(contexts: Iterable<SignedOperationContext>, now = Date.now()): Promise<void> {
  const contextList = [...contexts]
  await withReplayClaimLock(() => {
    refreshConsumedRequestIdsFromStorage(now, shouldRequireSharedReplayState())
    const unique = consumableRequestIds(contextList, now)
    const previous = new Map<string, number | undefined>()
    for (const requestId of unique.keys()) previous.set(requestId, consumedRequestIds.get(requestId))
    for (const [requestId, expiresAt] of unique) consumedRequestIds.set(requestId, expiresAt)
    try {
      persistConsumedRequestIds(now, shouldRequireSharedReplayState())
    } catch (error) {
      for (const [requestId, expiresAt] of previous) {
        if (expiresAt === undefined) consumedRequestIds.delete(requestId)
        else consumedRequestIds.set(requestId, expiresAt)
      }
      throw error
    }
    broadcastConsumedRequestIds([...unique])
  })
}

export async function verifyAndConsumeSignedOperationContext(input: {
  context: SignedOperationContext
  rootMetadata: VaultRootMetadata | null
  expectedPurpose?: SignedOperationPurpose
  now?: number
}): Promise<void> {
  verifySignedOperationContext(input)
  await consumeSignedOperationContexts([input.context], input.now)
}

export function resetSignedContextReplayCacheForTests(options: { clearPersistent?: boolean } = {}): void {
  consumedRequestIds.clear()
  replayHydrated = false
  replayChannel?.close()
  replayChannel = null
  if (options.clearPersistent !== false) {
    try {
      replayStorage()?.removeItem(REPLAY_STORAGE_KEY)
    } catch {
      // test-only cleanup
    }
  }
}

export async function agentDeliverBlindBoxContextFromSignedContext(
  context: SignedOperationContext,
  secretName: string,
): Promise<ProtectedDekDeliveryBlindBoxContext> {
  if (context.purpose !== "agent-deliver") throw new RpcError("invalid_context", "context is not an agent delivery")
  if (!context.grantId) throw new RpcError("invalid_context", "agent delivery context is missing grantId")
  const ttlSecs = context.display.grantTtlSeconds ?? 0
  const expiresAtUnix = Math.floor(Date.parse(context.expiresAt) / 1000)
  const approvalNonce = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`approveRelease:${context.requestId}:${secretName}`),
  )
  return {
    purpose: "agent-deliver",
    name: secretName,
    grantId: context.grantId,
    ttlSecs,
    approvalNonce: new Uint8Array(approvalNonce),
    approvalExpiresAtUnix: expiresAtUnix,
    operationHash: await blindBoxAgentDeliverOperationHash(secretName, ttlSecs),
  }
}

export function agentPublicKeyFromSignedContext(context: SignedOperationContext): AvaultPublicKey {
  if (!context.agent) throw new RpcError("invalid_context", "agent delivery context is missing agent key")
  if (context.agent.publicKey.fingerprint && context.agent.publicKey.fingerprint !== context.agent.fingerprint) {
    throw new RpcError("invalid_context", "agent public key fingerprint mismatch")
  }
  return { ...context.agent.publicKey, fingerprint: context.agent.fingerprint }
}

export async function signedContextBatchChallenge(contexts: SignedOperationContext[]): Promise<Uint8Array> {
  const messages = contexts.map((context) => signedOperationContextMessage(context))
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(stableJson(messages))))
}

export function formatSignedDisplayBlock(
  display: SignedOperationContext["display"],
  recipient?: { agentFingerprint?: string; grantId?: string },
): string {
  const lines: string[] = []
  if (display.sessionLabel) lines.push(`${t("context.session")}: ${display.sessionLabel}`)
  if (display.command) lines.push(`${t("context.command")}: ${display.command}`)
  if (display.egress) lines.push(`${t("context.egress")}: ${display.egress}`)
  const sourceParts = [
    ...(display.source?.env?.map((entry) => `${t("context.sourceEnv")}:${entry}`) ?? []),
    ...(display.source?.tags?.map((entry) => `${t("context.sourceTag")}:${entry}`) ?? []),
    ...(display.source?.skills?.map((entry) => `${t("context.sourceSkill")}:${entry}`) ?? []),
  ]
  if (sourceParts.length > 0) lines.push(`${t("context.source")}: ${sourceParts.join(", ")}`)
  if (recipient?.agentFingerprint) lines.push(`${t("context.agent")}: ${recipient.agentFingerprint}`)
  if (recipient?.grantId) lines.push(`${t("context.grant")}: ${recipient.grantId}`)
  if (display.grantTtlSeconds !== undefined) lines.push(`${t("context.agentAccess")}: ${humanizeSeconds(display.grantTtlSeconds)}`)
  lines.push(`${t("context.secrets")}:`)
  for (const secret of display.secrets) lines.push(`- ${secret.name} (${t(secret.kind === "static" ? "context.kindStatic" : "context.kindKeypair")})`)
  return lines.join("\n")
}

function humanizeSeconds(seconds: number): string {
  if (seconds === 0) return t("context.oneTime")
  if (seconds % 60 === 0) return t("context.minutes", { count: seconds / 60 })
  return t("context.seconds", { count: seconds })
}

export function displayFingerprint(context: SignedOperationContext): string {
  return stableJson(context.display)
}
