import { baseVmkWrapMeta, parseWrapMeta } from "./vaultCrypto"
import { currentVaultSessionPolicy, type VaultSessionPolicy } from "./policy"
import { RpcError } from "./rpc"

export type VaultState = "needs-setup" | "locked" | "unlocked"
export type VaultStateReason = "unlock" | "renew" | "manual-lock" | "auto-lock" | "unload"

export type VaultStatusResult = {
  state: VaultState
  expiresAt?: number
  freshSetup?: boolean
}

export type UnlockedVmkSession = {
  epoch: number
  signal: AbortSignal
  assertCurrent: () => void
}

const LOCK_CHANNEL_PREFIX = "avibe-vault-lock:v1:"

const sessionVault: {
  vmk: Uint8Array | null
  wrapMeta: string | null
  freshSetup: boolean
  scopeId: string | null
} = {
  vmk: null,
  wrapMeta: null,
  freshSetup: false,
  scopeId: null,
}

let vaultLockExpiresAt: number | null = null
let vaultAutoLockTimer: ReturnType<typeof setTimeout> | null = null
let vaultLockChannel: BroadcastChannel | null = null
let vaultLockChannelName: string | null = null
let vaultEpoch = 0
const activeVmkCopies = new Set<AbortController>()
let vaultOperationGeneration = 0
let vaultStateEventSink: ((event: { state: VaultState; expiresAt?: number; reason: VaultStateReason }) => void) | null = null

export function setVaultStateEventSink(
  sink: ((event: { state: VaultState; expiresAt?: number; reason: VaultStateReason }) => void) | null,
): void {
  vaultStateEventSink = sink
}

function rawVaultState(): VaultState {
  if (sessionVault.vmk) return "unlocked"
  return sessionVault.wrapMeta ? "locked" : "needs-setup"
}

function emitVaultState(reason: VaultStateReason): void {
  vaultStateEventSink?.({
    state: rawVaultState(),
    ...(vaultLockExpiresAt !== null && rawVaultState() === "unlocked" ? { expiresAt: vaultLockExpiresAt } : {}),
    reason,
  })
}

function clearAutoLockTimer(): void {
  if (vaultAutoLockTimer !== null) {
    clearTimeout(vaultAutoLockTimer)
    vaultAutoLockTimer = null
  }
}

function closeLockChannel(): void {
  vaultLockChannel?.close()
  vaultLockChannel = null
  vaultLockChannelName = null
}

function normalizeScopeToken(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

export function scopeIdFromWrapMeta(wrapMeta: string): string {
  const meta = parseWrapMeta(wrapMeta)
  if (typeof meta.vault_user_handle === "string" && meta.vault_user_handle.length > 0) {
    return normalizeScopeToken(meta.vault_user_handle)
  }
  return `wrap-${fnv1a(wrapMeta)}`
}

export function scopeIdFromVaultUserHandle(vaultUserHandle: string): string {
  return normalizeScopeToken(vaultUserHandle)
}

function configureLockChannel(scopeId: string | null): void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined" || !scopeId) {
    closeLockChannel()
    return
  }

  const channelName = `${LOCK_CHANNEL_PREFIX}${scopeId}`
  if (vaultLockChannelName === channelName) return
  closeLockChannel()
  vaultLockChannelName = channelName
  vaultLockChannel = new BroadcastChannel(channelName)
  vaultLockChannel.onmessage = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; scopeId?: unknown } | undefined
    if (data?.type === "lock" && data.scopeId === scopeId) {
      lockVault({ broadcast: false, reason: "manual-lock" })
    }
  }
}

function broadcastLock(): void {
  if (!sessionVault.scopeId) return
  configureLockChannel(sessionVault.scopeId)
  vaultLockChannel?.postMessage({ type: "lock", scopeId: sessionVault.scopeId })
}

function vaultEpochError(): Error {
  return new Error("vault-operation-aborted")
}

function advanceVaultEpoch(): void {
  vaultEpoch += 1
  for (const controller of activeVmkCopies) {
    controller.abort(vaultEpochError())
  }
  activeVmkCopies.clear()
  for (const controller of activeOperationRoots.keys()) controller.abort(vaultEpochError())
  activeOperationRoots.clear()
}

type RootIdentity = Record<string, unknown>
function reusableRootIdentity(wrapMeta: string): RootIdentity {
  const root = { ...parseWrapMeta(wrapMeta) }
  for (const key of ["scheme", "record_meta", "dek_nonce", "wrapped_dek"]) delete root[key]
  return root
}

/** Compare the effective JSON projection without recursively serializing legacy
 * extensions or imposing the NEW HD codec's size/depth rules on old roots. */
function sameRoot(left: RootIdentity, right: RootIdentity): boolean {
  const pending: Array<[unknown, unknown]> = [[left, right]]
  while (pending.length) {
    const [a, b] = pending.pop()!
    if (a === b) continue
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false
      pending.push([(a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]])
    }
  }
  return true
}

const activeOperationRoots = new Map<AbortController, RootIdentity>()

/**
 * Any observed root unlike an in-flight operation's snapshot cancels that
 * operation. Existing unlocked-VMK and legacy root-update behavior is unchanged.
 */
function abortOperationsForRoot(wrapMeta: string): void {
  if (activeOperationRoots.size === 0) return
  const observed = reusableRootIdentity(wrapMeta)
  for (const [controller, root] of activeOperationRoots) {
    if (!sameRoot(root, observed)) controller.abort(vaultEpochError())
  }
}

/** Cancellable non-VMK operation snapshot, including an initially LOCKED vault. */
export function beginVaultOperationSnapshot(wrapMeta: string): {
  freshSetup: boolean; signal: AbortSignal; assertCurrent: () => void; release: () => void;
} {
  // A first observation may initialize a locked session, but an incoming
  // operation must not replace an already remembered root before comparing it.
  enforceAutoLock()
  const root = reusableRootIdentity(wrapMeta)
  if (sessionVault.wrapMeta && !sameRoot(reusableRootIdentity(sessionVault.wrapMeta), root)) throw vaultEpochError()
  vaultStatus(wrapMeta)
  if (!sessionVault.wrapMeta || !sameRoot(reusableRootIdentity(sessionVault.wrapMeta), root)) throw vaultEpochError()
  for (const pending of activeOperationRoots.keys()) pending.abort(vaultEpochError())
  activeOperationRoots.clear()
  const generation = ++vaultOperationGeneration
  const epoch = vaultEpoch
  const freshSetup = currentFreshSetup()
  const controller = new AbortController()
  activeOperationRoots.set(controller, root)
  // The ordinary unlocked session already owns this receiver. Initially locked
  // custody must listen too, so a same-vault lock from another frame cancels it.
  configureLockChannel(sessionVault.scopeId)
  return {
    freshSetup,
    signal: controller.signal,
    assertCurrent: () => {
      enforceAutoLock()
      if (controller.signal.aborted || epoch !== vaultEpoch || generation !== vaultOperationGeneration
        || freshSetup !== currentFreshSetup() || !sessionVault.wrapMeta || !sameRoot(reusableRootIdentity(sessionVault.wrapMeta), root)) throw vaultEpochError()
    },
    release: () => {
      activeOperationRoots.delete(controller)
      controller.abort(vaultEpochError())
      if (!sessionVault.vmk && activeOperationRoots.size === 0) closeLockChannel()
    },
  }
}

function clearVmk(): void {
  sessionVault.vmk?.fill(0)
  sessionVault.vmk = null
  vaultLockExpiresAt = null
  clearAutoLockTimer()
  closeLockChannel()
  if (sessionVault.freshSetup) {
    sessionVault.wrapMeta = null
    sessionVault.freshSetup = false
    sessionVault.scopeId = null
  }
}

function autoLockExpired(): boolean {
  return vaultLockExpiresAt !== null && Date.now() >= vaultLockExpiresAt
}

export function enforceAutoLock(): boolean {
  if (sessionVault.vmk && autoLockExpired()) {
    lockVault({ broadcast: false, reason: "auto-lock" })
    return false
  }
  return sessionVault.vmk !== null
}

function armVaultAutoLock(reason: "unlock" | "renew", policy: VaultSessionPolicy = currentVaultSessionPolicy()): number {
  if (!sessionVault.vmk) {
    throw new Error("vault VMK is not loaded")
  }
  const ttlMs = policy.windowSeconds * 1000
  vaultLockExpiresAt = Date.now() + ttlMs
  clearAutoLockTimer()
  vaultAutoLockTimer = setTimeout(() => {
    lockVault({ broadcast: false, reason: "auto-lock" })
  }, ttlMs)
  emitVaultState(reason)
  return vaultLockExpiresAt
}

function deferAutoLockDuringSuccessCommit(): () => void {
  const expiresAt = vaultLockExpiresAt
  if (!sessionVault.vmk || expiresAt === null) return () => {}
  clearAutoLockTimer()
  let restored = false
  return () => {
    if (restored || !sessionVault.vmk) return
    restored = true
    const remainingMs = expiresAt - Date.now()
    if (remainingMs <= 0) {
      lockVault({ broadcast: false, reason: "auto-lock" })
      return
    }
    vaultAutoLockTimer = setTimeout(() => {
      lockVault({ broadcast: false, reason: "auto-lock" })
    }, remainingMs)
  }
}

function shouldPreserveUnlockOnError(error: unknown): boolean {
  if (error instanceof RpcError && error.retryable) return true
  const message = error instanceof Error ? error.message : String(error)
  return (
    message === "operation-cancelled" ||
    message === "operation-superseded" ||
    message === "passkey-cancelled" ||
    message === "vault-operation-aborted"
  )
}

export function assertUnlockedEpoch(session: UnlockedVmkSession): void {
  if (session.signal.aborted || session.epoch !== vaultEpoch || !sessionVault.vmk) {
    throw vaultEpochError()
  }
}

export async function withUnlockedVmk<T>(
  callback: (vmk: Uint8Array, wrapMeta: string, session: UnlockedVmkSession) => Promise<T> | T,
  options: { renewOnSuccess?: boolean; beforeSuccess?: () => Promise<void> | void; expectedWrapMeta?: string } = {},
): Promise<T> {
  if (!enforceAutoLock() || !sessionVault.vmk || !sessionVault.wrapMeta) {
    throw new Error("vault-locked")
  }
  const wrapMeta = sessionVault.wrapMeta
  const expectedRoot = options.expectedWrapMeta === undefined ? undefined : reusableRootIdentity(options.expectedWrapMeta)
  if (expectedRoot !== undefined && !sameRoot(reusableRootIdentity(wrapMeta), expectedRoot)) throw vaultEpochError()
  const vmk = new Uint8Array(sessionVault.vmk)
  const epoch = vaultEpoch
  const controller = new AbortController()
  activeVmkCopies.add(controller)
  if (expectedRoot !== undefined) activeOperationRoots.set(controller, expectedRoot)
  const session: UnlockedVmkSession = {
    epoch,
    signal: controller.signal,
    assertCurrent: () => assertUnlockedEpoch(session),
  }
  let restoreAutoLock: (() => void) | null = null
  try {
    session.assertCurrent()
    const result = await callback(vmk, wrapMeta, session)
    session.assertCurrent()
    if (options.renewOnSuccess !== false) armVaultAutoLock("renew")
    session.assertCurrent()
    if (options.beforeSuccess) {
      restoreAutoLock = deferAutoLockDuringSuccessCommit()
      await options.beforeSuccess()
      session.assertCurrent()
      restoreAutoLock()
      restoreAutoLock = null
    }
    return result
  } catch (error) {
    if (!shouldPreserveUnlockOnError(error)) {
      lockVault({ broadcast: true, reason: "manual-lock" })
    }
    throw error
  } finally {
    restoreAutoLock?.()
    activeVmkCopies.delete(controller)
    activeOperationRoots.delete(controller)
    vmk.fill(0)
  }
}

export function currentFreshSetup(): boolean {
  return sessionVault.vmk !== null && sessionVault.freshSetup
}

export function currentWrapMeta(): string | null {
  enforceAutoLock()
  return sessionVault.wrapMeta
}

export function commitUnlockedVmk(input: {
  vmk: Uint8Array
  wrapMeta: string
  freshSetup: boolean
  scopeId: string
  policy?: VaultSessionPolicy
}): { state: "unlocked"; expiresAt: number } {
  advanceVaultEpoch()
  sessionVault.vmk?.fill(0)
  sessionVault.vmk = input.vmk
  sessionVault.wrapMeta = input.wrapMeta
  sessionVault.freshSetup = input.freshSetup
  sessionVault.scopeId = input.scopeId
  configureLockChannel(input.scopeId)
  return { state: "unlocked", expiresAt: armVaultAutoLock("unlock", input.policy) }
}

export function lockVault(options: { broadcast?: boolean; reason?: Exclude<VaultStateReason, "unlock" | "renew"> } = {}): { state: "locked" } {
  if (options.broadcast) {
    broadcastLock()
  }
  advanceVaultEpoch()
  clearVmk()
  emitVaultState(options.reason ?? "manual-lock")
  return { state: "locked" }
}

export function vaultStatus(wrapMeta?: string): VaultStatusResult {
  enforceAutoLock()
  const observed = wrapMeta ? baseVmkWrapMeta(wrapMeta) : undefined
  if (observed) abortOperationsForRoot(observed)
  if (sessionVault.vmk) {
    return {
      state: "unlocked",
      expiresAt: vaultLockExpiresAt ?? undefined,
      ...(sessionVault.freshSetup ? { freshSetup: true } : {}),
    }
  }
  if (observed) {
    sessionVault.wrapMeta = observed
    sessionVault.scopeId = scopeIdFromWrapMeta(observed)
  }
  return sessionVault.wrapMeta ? { state: "locked" } : { state: "needs-setup" }
}

export function rememberWrapMeta(wrapMeta: string): { wrapMeta: string; scopeId: string } {
  const base = baseVmkWrapMeta(wrapMeta)
  const scopeId = scopeIdFromWrapMeta(base)
  abortOperationsForRoot(base)
  sessionVault.wrapMeta = base
  sessionVault.scopeId = scopeId
  return { wrapMeta: base, scopeId }
}

export function clearVaultOnUnload(): void {
  lockVault({ broadcast: false, reason: "unload" })
  closeLockChannel()
}

export function resetVaultSessionForTests(): void {
  clearVaultOnUnload()
  sessionVault.wrapMeta = null
  sessionVault.freshSetup = false
  sessionVault.scopeId = null
}
