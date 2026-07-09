import "./style.css"
import { RpcServer, RpcError, BUILD, CHANNEL, VERSION, type Appearance, type RpcRequestContext } from "./rpc"
import {
  base64ToBytes,
  buildWrapMeta,
  bytesToBase64,
  newPasskeyPrfSalt,
  newVmk,
  openProtected,
  openRootMetadata,
  passkeyPrfSaltEntries,
  protectedRecordContextFromMetadata,
  protectRootMetadata,
  signProtectedDigest,
  unpackProtectedRecord,
  withRootMetadata,
  withWrapMetaMetadata,
  type ProtectedRecordEnvelope,
  type SignatureScheme,
  type VaultRootMetadata,
} from "./vaultCrypto"
import {
  clearVaultOnUnload,
  commitUnlockedVmk,
  currentFreshSetup,
  lockVault,
  rememberWrapMeta,
  scopeIdFromVaultUserHandle,
  setVaultStateEventSink,
  vaultStatus,
  withUnlockedVmk,
  type UnlockedVmkSession,
  type VaultState,
} from "./vaultLifecycle"
import {
  assertPasskeyPrf,
  confirmWithPasskeyUv,
  createPasskeyCredential,
  isCrossOriginAncestorWebAuthnError,
  isWebAuthnCancellationError,
  produceAssertionCredential,
  rpId,
  type AuthzRegistration,
} from "./webauthn"
import {
  button as operationButton,
  confirmOperationInActiveSlot,
  appendDynamic,
  hasPendingUiShow,
  hideCard,
  i18nText,
  presentPlaintext,
  rawText,
  runExclusiveOperation,
  setUiEventSink,
  setElementText,
  showCard,
  status as operationStatus,
  type TextSpec,
} from "./operationUi"
import { getLocale, refreshI18nBindings, setLocale, t } from "./i18n"
import { unlockVmkFromPasskeyPrf } from "./approvalUnlock"
import { parseSealRequest } from "./sealRequest"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"
import { currentVaultSessionPolicy, setVaultSessionPolicy, type VaultSessionPolicy } from "./policy"
import { resolveAuthorizationPlan, type RiskTier, type PasskeyRequirement } from "./authz"
import { assertConfirmSurfaceReady } from "./confirmSurface"
import { sealGeneratedKeypair, sealParentProvidedStatic } from "./sealOperations"
import { approveReleaseBatch, parseApproveReleaseItem } from "./approveRelease"
import {
  formatSignedDisplayBlock,
  assertSignedOperationContextsConsumable,
  consumeSignedOperationContexts,
  parseSignedOperationContext,
  signedOperationContextMessage,
  verifySignedOperationContext,
  type SignedOperationContext,
} from "./operationContext"

type StatusRequest = {
  wrapMeta?: string
}

type SetupRequest = {
  vaultUserHandle: string
  displayName: string
  existingProtectedVault: boolean
  authzCreationOptions?: unknown
  rootMetadata?: VaultRootMetadata
}

type UnlockRequest = {
  wrapMeta: string
}

type RevealRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  context: SignedOperationContext
}

type SignRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  scheme: SignatureScheme
  signingContext: VerifiableSigningContext
  context: SignedOperationContext
}

type ApproveReleaseRequest = {
  items: Array<{
    material: { name: string; envelope: ProtectedRecordEnvelope }
    context: SignedOperationContext
  }>
}

type DeleteAuthzAssertionRequest = {
  challengeId: string
  operation: "delete_secret"
  secretName: string
  webauthn: unknown
}

type TopLevelSetupResult = {
  credentialId: string
  authzRegistration?: AuthzRegistration
}

type SetupChannelMessage =
  | { type: "setup-created"; id: string; result: TopLevelSetupResult }
  | { type: "setup-error"; id: string; code: string; message?: string; retryable?: boolean }

const SETUP_CHANNEL_PREFIX = "avibe-vault-setup:v1:"
const SETUP_RESULT_STORAGE_PREFIX = "avibe-vault-setup-result:"
const SETUP_ERROR_STORAGE_PREFIX = "avibe-vault-setup-error:"
const SETUP_WINDOW_TIMEOUT_MS = 5 * 60 * 1000

const server = new RpcServer()
let handshakePolicyPinned = false

function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== "object" || value === null) return false
  const record = value as Record<string, unknown>
  return (record.locale === "en" || record.locale === "zh") && (record.theme === "light" || record.theme === "dark")
}

function appearanceRequest(payload: unknown): Appearance {
  if (!isAppearance(payload)) {
    throw new RpcError("invalid_payload", "appearance must include locale and theme")
  }
  return payload
}

function optionalAppearance(value: unknown): Appearance | null {
  if (value === undefined || value === null) return null
  return appearanceRequest(value)
}

function applyAppearance(appearance: Appearance): void {
  const localeChanged = setLocale(appearance.locale)
  document.documentElement.setAttribute("data-theme", appearance.theme)
  if (localeChanged) refreshI18nBindings()
}

function currentAppearance(): Appearance {
  const theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"
  return { locale: getLocale(), theme }
}

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new RpcError("invalid_payload", "request payload must be an object")
  }
  return payload as Record<string, unknown>
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new RpcError("invalid_payload", `${field} must be a string`)
  return value
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RpcError("invalid_payload", `${field} must be a non-empty string`)
  }
  return value
}

function requiredRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new RpcError("invalid_payload", `${field} must be an object`)
  return value as Record<string, unknown>
}

function protectedEnvelope(value: unknown): ProtectedRecordEnvelope {
  const record = requiredRecord(value, "envelope")
  return {
    ciphertext: requiredString(record.ciphertext, "envelope.ciphertext"),
    nonce: requiredString(record.nonce, "envelope.nonce"),
    wrap_meta: requiredString(record.wrap_meta, "envelope.wrap_meta"),
  }
}

function protectedMaterial(value: unknown): { name: string; envelope: ProtectedRecordEnvelope } {
  const record = requiredRecord(value, "material")
  return { name: requiredString(record.name, "material.name"), envelope: protectedEnvelope(record.envelope) }
}

function statusRequest(payload: unknown): StatusRequest {
  const record = payload === undefined || payload === null ? {} : asRecord(payload)
  return { wrapMeta: optionalString(record.wrapMeta, "wrapMeta") }
}

function setupRequest(payload: unknown): SetupRequest {
  const record = asRecord(payload)
  const existingProtectedVault = Boolean(record.existingProtectedVault)
  if (existingProtectedVault && record.rootMetadata !== undefined) {
    throw new RpcError("invalid_payload", "vault root metadata cannot be replaced during setup")
  }
  return {
    vaultUserHandle: requiredString(record.vaultUserHandle, "vaultUserHandle"),
    displayName: requiredString(record.displayName, "displayName"),
    existingProtectedVault,
    authzCreationOptions: record.authzCreationOptions,
    ...(record.rootMetadata !== undefined ? { rootMetadata: record.rootMetadata as VaultRootMetadata } : {}),
  }
}

function unlockRequest(payload: unknown): UnlockRequest {
  const record = asRecord(payload)
  return { wrapMeta: requiredString(record.wrapMeta, "wrapMeta") }
}

function revealRequest(payload: unknown): RevealRequest {
  const record = asRecord(payload)
  return { material: protectedMaterial(record.material), context: parseSignedOperationContext(record.context) }
}

function signRequest(payload: unknown): SignRequest {
  const record = asRecord(payload)
  const scheme = requiredString(record.scheme, "scheme") as SignatureScheme
  return {
    material: protectedMaterial(record.material),
    scheme,
    signingContext: requiredRecord(record.signingContext, "signingContext") as unknown as VerifiableSigningContext,
    context: parseSignedOperationContext(record.context),
  }
}

function approveReleaseRequest(payload: unknown): ApproveReleaseRequest {
  const record = asRecord(payload)
  if (!Array.isArray(record.items) || record.items.length === 0) {
    throw new RpcError("invalid_payload", "approveRelease requires a non-empty items array")
  }
  return { items: record.items.map((item) => parseApproveReleaseItem(item, protectedMaterial)) }
}

function deleteAuthzAssertionRequest(payload: unknown): DeleteAuthzAssertionRequest {
  const record = asRecord(payload)
  if (record.operation !== "delete_secret") throw new RpcError("invalid_payload", "deleteAuthzAssertion only supports delete_secret")
  return {
    challengeId: requiredString(record.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: requiredString(record.secretName, "secretName"),
    webauthn: record.webauthn,
  }
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = (): void => {
      reject(operationAbortReason(signal))
    }
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

function firstAbortReason(signals: AbortSignal[]): Error {
  for (const signal of signals) {
    if (signal.aborted) return operationAbortReason(signal)
  }
  return new Error("operation-superseded")
}

function mergedAbortSignal(signals: AbortSignal[]): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const cleanupCallbacks: Array<() => void> = []
  const abortFrom = (signal: AbortSignal): void => {
    if (!controller.signal.aborted) controller.abort(operationAbortReason(signal))
  }
  for (const signal of signals) {
    if (signal.aborted) {
      abortFrom(signal)
      continue
    }
    const listener = (): void => abortFrom(signal)
    signal.addEventListener("abort", listener, { once: true })
    cleanupCallbacks.push(() => signal.removeEventListener("abort", listener))
  }
  return { signal: controller.signal, cleanup: () => cleanupCallbacks.forEach((cleanup) => cleanup()) }
}

async function confirmPasskeyUvWithAbort(input: { wrapMeta: string; challenge: Uint8Array; abortSignals: AbortSignal[] }): Promise<void> {
  const merged = mergedAbortSignal(input.abortSignals)
  try {
    await Promise.race([
      confirmWithPasskeyUv(passkeyPrfSaltEntries(input.wrapMeta), rpId(), input.challenge, merged.signal).catch((error) => {
        if (merged.signal.aborted) throw firstAbortReason(input.abortSignals)
        throw error
      }),
      ...input.abortSignals.map((signal) => rejectOnAbort(signal)),
    ])
  } finally {
    merged.cleanup()
  }
}

async function confirmAuthorizationCard(input: {
  title: TextSpec
  subtitle: TextSpec
  body: TextSpec
  wrapMeta: string
  challenge: Uint8Array
  label: TextSpec
  passkey: Exclude<PasskeyRequirement, "unlock">
  abortSignal?: AbortSignal
  parentSurface?: RpcRequestContext["surface"]
}): Promise<void> {
  await runExclusiveOperation(async (signal) => {
    await confirmOperationInActiveSlot(
      { title: input.title, subtitle: input.subtitle, body: input.body, confirmLabel: input.label },
      signal,
      () => assertConfirmSurfaceReady({ uiShowPending: hasPendingUiShow(), parentSurface: input.parentSurface }),
    )
    if (input.passkey === "uv") {
      await confirmPasskeyUvWithAbort({
        wrapMeta: input.wrapMeta,
        challenge: input.challenge,
        abortSignals: [signal, ...(input.abortSignal ? [input.abortSignal] : [])],
      })
    }
  })
}

type AuthorizationPrompt = {
  title: TextSpec
  subtitle: TextSpec
  body: TextSpec
  challenge: Uint8Array
  label: TextSpec
}

type VmkOperation<T> = (vmk: Uint8Array, wrapMeta: string, session: UnlockedVmkSession) => Promise<T> | T

function isVaultLockedError(error: unknown): boolean {
  return error instanceof Error && error.message === "vault-locked"
}

function isVaultOperationAbortedError(error: unknown): boolean {
  return error instanceof Error && error.message === "vault-operation-aborted"
}

function shouldRetryAfterApproveReleaseLockRace(error: unknown, wrapMeta: string): boolean {
  if (isVaultLockedError(error)) return true
  return isVaultOperationAbortedError(error) && vaultStatus(wrapMeta).state === "locked"
}

async function unlockForOperation(wrapMeta: string, policy: VaultSessionPolicy = currentVaultSessionPolicy(), abortSignal?: AbortSignal): Promise<void> {
  await unlockVmkFromPasskeyPrf({ wrapMeta, currentRpId: rpId(), policy, abortSignal })
}

async function unlockForOperationExclusive(wrapMeta: string, policy: VaultSessionPolicy = currentVaultSessionPolicy()): Promise<void> {
  await runExclusiveOperation((signal) => unlockForOperation(wrapMeta, policy, signal))
}

async function withSelfCustodyVmk<T>(wrapMeta: string | undefined, operation: VmkOperation<T>): Promise<T> {
  const state = vaultStatus(wrapMeta).state
  if (state !== "unlocked") {
    if (!wrapMeta) throw new Error("vault-locked")
    await unlockForOperationExclusive(wrapMeta)
  }
  return await withUnlockedVmk(operation, { renewOnSuccess: true })
}

async function withTierAuthorizedVmk<T>(input: {
  tier: RiskTier
  wrapMeta: string
  parentSurface?: RpcRequestContext["surface"]
  buildPrompt: (vmk: Uint8Array, wrapMeta: string, session: UnlockedVmkSession) => Promise<AuthorizationPrompt> | AuthorizationPrompt
  operation: VmkOperation<T>
  beforeSuccess?: () => Promise<void> | void
}): Promise<T> {
  const initialState: VaultState = vaultStatus(input.wrapMeta).state
  const policy = currentVaultSessionPolicy()
  const plan = resolveAuthorizationPlan({ tier: input.tier, vaultState: initialState, policy })
  let unlockedForThisOperation = false
  if (plan.passkey === "unlock") {
    await unlockForOperationExclusive(input.wrapMeta, policy)
    unlockedForThisOperation = true
  }

  const runWithCurrentVmk = async (passkey: Exclude<PasskeyRequirement, "unlock">): Promise<T> => {
    let completed = false
    try {
      const result = await withUnlockedVmk(
        async (vmk, wrapMeta, session) => {
          const prompt = await input.buildPrompt(vmk, wrapMeta, session)
          if (plan.confirm) {
            await confirmAuthorizationCard({
              ...prompt,
              wrapMeta,
              passkey,
              abortSignal: session.signal,
              parentSurface: input.parentSurface,
            })
            session.assertCurrent()
          }
          return input.operation(vmk, wrapMeta, session)
        },
        { renewOnSuccess: plan.renewOnSuccess, beforeSuccess: input.beforeSuccess },
      )
      completed = true
      return result
    } catch (error) {
      if (unlockedForThisOperation && !completed && vaultStatus().state === "unlocked") {
        lockVault({ broadcast: true, reason: "manual-lock" })
      }
      throw error
    }
  }

  try {
    return await runWithCurrentVmk(plan.passkey === "uv" ? "uv" : "none")
  } catch (error) {
    if (plan.passkey !== "unlock" && isVaultLockedError(error)) {
      await unlockForOperationExclusive(input.wrapMeta, policy)
      unlockedForThisOperation = true
      return await runWithCurrentVmk("none")
    }
    throw error
  }
}

function rpcFailure(error: unknown, fallbackCode: string): RpcError {
  if (error instanceof RpcError) return error
  if (isWebAuthnCancellationError(error)) return new RpcError("passkey_cancelled", "passkey-cancelled", true)
  const message = error instanceof Error ? error.message : fallbackCode
  switch (message) {
    case "passkey-cancelled":
      return new RpcError("passkey_cancelled", message, true)
    case "passkey-prf-unavailable":
      return new RpcError("passkey_prf_unavailable", message)
    case "passkey-not-configured":
      return new RpcError("passkey_not_configured", message)
    case "passkey-multiple-not-supported":
      return new RpcError("passkey_multiple_not_supported", message)
    case "vault-operation-aborted":
      return new RpcError("vault_operation_aborted", message, true)
    default:
      return new RpcError(fallbackCode, message)
  }
}

function encodeSetupRequest(request: SetupRequest): string {
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(request)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function decodeSetupRequest(value: string): SetupRequest {
  return setupRequest(JSON.parse(new TextDecoder().decode(base64ToBytes(value))))
}

function setupWindowUrl(id: string, request: SetupRequest): string {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("mode", "setup")
  url.searchParams.set("id", id)
  const appearance = currentAppearance()
  url.searchParams.set("locale", appearance.locale)
  url.searchParams.set("theme", appearance.theme)
  // This fragment carries only non-secret setup bootstrap data. VMK, PRF output,
  // private keys, and plaintext are never placed in the URL.
  url.hash = new URLSearchParams({ req: encodeSetupRequest(request) }).toString()
  return url.toString()
}

function validateTopLevelSetupResult(result: unknown): TopLevelSetupResult {
  const record = asRecord(result)
  return {
    credentialId: requiredString(record.credentialId, "credentialId"),
    ...(record.authzRegistration !== undefined ? { authzRegistration: record.authzRegistration as AuthzRegistration } : {}),
  }
}

function setupResultStorageKey(id: string): string {
  return `${SETUP_RESULT_STORAGE_PREFIX}${id}`
}

function setupErrorStorageKey(id: string): string {
  return `${SETUP_ERROR_STORAGE_PREFIX}${id}`
}

function clearStoredSetupOutcome(id: string): void {
  try {
    localStorage.removeItem(setupResultStorageKey(id))
    localStorage.removeItem(setupErrorStorageKey(id))
  } catch {
    // BroadcastChannel remains the fallback when localStorage is unavailable.
  }
}

function writeStoredSetupResult(id: string, result: TopLevelSetupResult): void {
  try {
    localStorage.setItem(setupResultStorageKey(id), JSON.stringify(result))
    localStorage.removeItem(setupErrorStorageKey(id))
  } catch {
    // BroadcastChannel remains the fallback when localStorage is unavailable.
  }
}

function writeStoredSetupError(id: string, failure: RpcError): void {
  try {
    localStorage.setItem(
      setupErrorStorageKey(id),
      JSON.stringify({ code: failure.code, message: failure.message, retryable: failure.retryable }),
    )
    localStorage.removeItem(setupResultStorageKey(id))
  } catch {
    // BroadcastChannel remains the fallback when localStorage is unavailable.
  }
}

function requestTopLevelCredentialCreation(request: SetupRequest): Promise<TopLevelSetupResult> {
  if (window.self === window.top) {
    return createPasskeyCredential({
      rpId: rpId(),
      vaultUserHandle: request.vaultUserHandle,
      displayName: request.displayName,
      authzCreationOptions: request.authzCreationOptions,
    })
  }

  const id = randomId()
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`${SETUP_CHANNEL_PREFIX}${id}`)
  let popup: Window | null = null
  clearStoredSetupOutcome(id)

  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let closedId: ReturnType<typeof setInterval> | null = null
    let closeGraceTimer: ReturnType<typeof setTimeout> | null = null
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (closedId) clearInterval(closedId)
      if (closeGraceTimer) clearTimeout(closeGraceTimer)
      window.removeEventListener("visibilitychange", resumeFromStorage)
      window.removeEventListener("focus", resumeFromStorage)
      window.removeEventListener("storage", resumeFromStorage)
      window.removeEventListener("message", onOpenerMessage)
      channel?.close()
      clearStoredSetupOutcome(id)
      callback()
    }

    const readStoredOutcome = (): boolean => {
      let resultJson: string | null = null
      let errorJson: string | null = null
      try {
        resultJson = localStorage.getItem(setupResultStorageKey(id))
        errorJson = localStorage.getItem(setupErrorStorageKey(id))
      } catch {
        return false
      }
      if (resultJson) {
        try {
          const result = validateTopLevelSetupResult(JSON.parse(resultJson))
          finish(() => resolve(result))
        } catch (error) {
          const message = error instanceof Error ? error.message : "stored setup result is invalid"
          finish(() => reject(new RpcError("setup_storage_invalid", message)))
        }
        return true
      }
      if (errorJson) {
        try {
          const failure = asRecord(JSON.parse(errorJson))
          finish(() =>
            reject(new RpcError(requiredString(failure.code, "code"), optionalString(failure.message, "message"), Boolean(failure.retryable))),
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : "stored setup error is invalid"
          finish(() => reject(new RpcError("setup_storage_invalid", message)))
        }
        return true
      }
      return false
    }

    const resumeFromStorage = (): void => {
      readStoredOutcome()
    }

    const onOpenerMessage = (event: MessageEvent): void => {
      // The setup popup posts its result straight back to us (its opener). This is the
      // reliable iOS path: unlike localStorage/BroadcastChannel it is NOT storage-partitioned
      // between this cross-site iframe and the top-level popup, and it queues across the freeze
      // this tab undergoes while the popup is foreground. Same-origin + id gated.
      if (event.origin !== window.location.origin) return
      const message = event.data as SetupChannelMessage | undefined
      if (!message || message.id !== id) return
      if (message.type === "setup-created") {
        finish(() => resolve(validateTopLevelSetupResult(message.result)))
      } else if (message.type === "setup-error") {
        finish(() => reject(new RpcError(message.code, message.message, Boolean(message.retryable))))
      }
    }

    timeoutId = setTimeout(() => {
      if (readStoredOutcome()) return
      finish(() => reject(new RpcError("setup_window_timeout", "setup window timed out", true)))
    }, SETUP_WINDOW_TIMEOUT_MS)

    closedId = setInterval(() => {
      if (!popup?.closed || closeGraceTimer) return
      if (readStoredOutcome()) return
      // The popup closed, but on iOS the success result may still be an in-flight
      // opener.postMessage that is only delivered as this (previously frozen) tab resumes.
      // Give it a short grace before declaring the window closed/failed; any result that
      // arrives (message / storage / channel) settles first via finish().
      closeGraceTimer = setTimeout(() => {
        if (readStoredOutcome()) return
        finish(() => reject(new RpcError("setup_window_closed", "setup window was closed", true)))
      }, 2500)
    }, 500)

    if (channel) {
      channel.onmessage = (event: MessageEvent<SetupChannelMessage>) => {
        const message = event.data
        if (!message || message.id !== id) return
        if (message.type === "setup-created") {
          finish(() => resolve(validateTopLevelSetupResult(message.result)))
        } else if (message.type === "setup-error") {
          finish(() => reject(new RpcError(message.code, message.message, Boolean(message.retryable))))
        }
      }
    }

    window.addEventListener("visibilitychange", resumeFromStorage)
    window.addEventListener("focus", resumeFromStorage)
    window.addEventListener("storage", resumeFromStorage)
    window.addEventListener("message", onOpenerMessage)

    popup = window.open(setupWindowUrl(id, request), "avibe-vault-setup", "popup,width=440,height=620")
    if (!popup) {
      finish(() => reject(new RpcError("setup_popup_blocked", "setup window was blocked", true)))
      return
    }
    popup.focus()
  })
}

function operationAbortReason(signal: AbortSignal): Error {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason
  return reason instanceof Error ? reason : new Error("operation-superseded")
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw operationAbortReason(signal)
}

function isIosLikeBrowser(): boolean {
  const nav = window.navigator
  return /iP(?:hone|ad|od)/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1)
}

function shouldUseTopLevelSetupCreateFallback(error: unknown): boolean {
  return isIosLikeBrowser() && isCrossOriginAncestorWebAuthnError(error)
}

async function completeSetupWithCredential(request: SetupRequest, currentRpId: string, created: TopLevelSetupResult, signal?: AbortSignal) {
  const prfSalt = newPasskeyPrfSalt()
  let prfOutput: Uint8Array | undefined
  let vmk: Uint8Array | undefined
  try {
    throwIfAborted(signal)
    const assertion = await assertPasskeyPrf([{ credentialId: created.credentialId, prfSalt }], currentRpId, signal)
    prfOutput = assertion.prfOutput
    throwIfAborted(signal)
    vmk = newVmk()
    const baseWrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt, credentialId: created.credentialId }])
    throwIfAborted(signal)
    let wrapMeta = withWrapMetaMetadata(baseWrapMeta, {
      rpId: currentRpId,
      vaultUserHandle: request.vaultUserHandle,
    })
    if (request.rootMetadata) {
      wrapMeta = withRootMetadata(wrapMeta, await protectRootMetadata(vmk, request.rootMetadata, wrapMeta))
      throwIfAborted(signal)
    }
    const unlocked = commitUnlockedVmk({
      vmk,
      wrapMeta,
      freshSetup: !request.existingProtectedVault,
      scopeId: scopeIdFromVaultUserHandle(request.vaultUserHandle),
    })
    vmk = undefined
    return {
      wrapMeta,
      rpId: currentRpId,
      credentialId: created.credentialId,
      state: unlocked.state,
      expiresAt: unlocked.expiresAt,
      ...(created.authzRegistration ? { authzRegistration: created.authzRegistration } : {}),
    }
  } finally {
    prfOutput?.fill(0)
    prfSalt.fill(0)
    vmk?.fill(0)
  }
}

function requestInteractiveCredentialSetup(request: SetupRequest, currentRpId: string) {
  return runExclusiveOperation((signal) => {
    const r = showCard(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody",
    )
    const action = operationButton("setup.createPasskey")
    const message = operationStatus("setup.ready")
    appendDynamic(r.card, action)
    appendDynamic(r.card, message)

    return new Promise((resolve, reject) => {
      let settled = false
      let phase: "create" | "finish" = "create"
      let createdCredential: TopLevelSetupResult | null = null
      let preferPopupCreate = false

      const settle = (callback: () => void): void => {
        if (settled) return
        settled = true
        signal.removeEventListener("abort", abortPending)
        hideCard()
        callback()
      }

      const rejectOperation = (error: unknown): void => {
        settle(() => reject(error))
      }

      const retryCreate = (text: TextSpec): void => {
        if (settled) return
        phase = "create"
        createdCredential = null
        setElementText(action, "setup.createPasskey")
        action.disabled = false
        setElementText(message, text)
      }

      const abortPending = (): void => {
        rejectOperation(operationAbortReason(signal))
      }

      const handlePopupError = (error: unknown): void => {
        if (error instanceof RpcError && error.code === "setup_popup_blocked") {
          retryCreate("setup.popupBlocked")
          return
        }
        rejectOperation(error)
      }

      const beginPopupCreate = (): void => {
        preferPopupCreate = true
        action.disabled = true
        setElementText(message, "setup.popupPrompt")
        let popupResult: Promise<TopLevelSetupResult>
        try {
          popupResult = requestTopLevelCredentialCreation(request)
        } catch (error) {
          handlePopupError(error)
          return
        }
        void popupResult.then(
          (result) => {
            if (settled) return
            createdCredential = result
            phase = "finish"
            setElementText(action, "setup.finish")
            action.disabled = false
            setElementText(message, "setup.createdFinish")
          },
          (error: unknown) => {
            handlePopupError(error)
          },
        )
      }

      const finishSetup = (created: TopLevelSetupResult): void => {
        action.disabled = true
        setElementText(message, "setup.passkeyPrompt")
        void completeSetupWithCredential(request, currentRpId, created, signal).then(
          (result) => settle(() => resolve(result)),
          (error: unknown) => rejectOperation(error),
        )
      }

      const beginIframeCreate = (): void => {
        action.disabled = true
        setElementText(message, "setup.passkeyPrompt")
        let created: Promise<TopLevelSetupResult>
        try {
          created = createPasskeyCredential({
            rpId: currentRpId,
            vaultUserHandle: request.vaultUserHandle,
            displayName: request.displayName,
            authzCreationOptions: request.authzCreationOptions,
          })
        } catch (error) {
          if (shouldUseTopLevelSetupCreateFallback(error)) {
            beginPopupCreate()
            return
          }
          rejectOperation(error)
          return
        }
        void created.then(
          (result) => finishSetup(result),
          (error: unknown) => {
            if (shouldUseTopLevelSetupCreateFallback(error)) {
              beginPopupCreate()
              return
            }
            rejectOperation(error)
          },
        )
      }

      if (signal.aborted) {
        abortPending()
        return
      }
      signal.addEventListener("abort", abortPending, { once: true })
      action.addEventListener("click", () => {
        if (settled || action.disabled) return
        if (phase === "finish" && createdCredential) {
          finishSetup(createdCredential)
          return
        }
        if (preferPopupCreate) {
          beginPopupCreate()
          return
        }
        beginIframeCreate()
      })
    })
  })
}

async function handleSetup(payload: unknown) {
  const request = setupRequest(payload)
  try {
    const currentRpId = rpId()
    const result =
      window.self !== window.top
        ? await requestInteractiveCredentialSetup(request, currentRpId)
        : await completeSetupWithCredential(request, currentRpId, await requestTopLevelCredentialCreation(request))
    return { ...(result as Record<string, unknown>), policy: currentVaultSessionPolicy() }
  } catch (error) {
    throw rpcFailure(error, "setup_failed")
  }
}

async function handleUnlock(payload: unknown) {
  const request = unlockRequest(payload)
  try {
    const currentRpId = rpId()
    const policy = currentVaultSessionPolicy()
    const unlocked = await runExclusiveOperation(async (signal) => {
      await confirmOperationInActiveSlot(
        {
          title: "unlock.sessionTitle",
          subtitle: i18nText("unlock.sessionSubtitle", {
            minutes: policy.windowSeconds / 60,
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue",
        },
        signal,
      )
      return unlockVmkFromPasskeyPrf({ wrapMeta: request.wrapMeta, currentRpId, abortSignal: signal, policy })
    })
    return { ...unlocked, policy: currentVaultSessionPolicy() }
  } catch (error) {
    throw rpcFailure(error, "unlock_failed")
  }
}

async function handleSeal(payload: unknown) {
  const request = parseSealRequest(payload)
  if (request.wrapMeta) rememberWrapMeta(request.wrapMeta)
  try {
    if (request.kind === "static" && !currentVaultSessionPolicy().parentValueSealAllowed) {
      throw new RpcError("parent_value_seal_disabled", "parent-value sealing is disabled by policy")
    }
    return await withSelfCustodyVmk(request.wrapMeta, async (vmk, wrapMeta) => {
      const sealed =
        request.kind === "static"
          ? await sealParentProvidedStatic({ name: request.name, value: request.value, vmk, wrapMeta })
          : await sealGeneratedKeypair({ name: request.name, vmk, wrapMeta })
      return { ...sealed, establishingVmk: currentFreshSetup() }
    })
  } catch (error) {
    throw rpcFailure(error, "seal_failed")
  }
}

function displayContainsSecret(context: SignedOperationContext, name: string, kind: "static" | "keypair"): boolean {
  return context.display.secrets.some((secret) => secret.name === name && secret.kind === kind)
}

async function handleReveal(payload: unknown, rpcContext: RpcRequestContext) {
  const request = revealRequest(payload)
  try {
    const { sealed, vmkWrapMeta, recordMetadata } = unpackProtectedRecord(request.material.envelope)
    if (recordMetadata?.kind === "keypair") throw new Error("keypair protected records cannot be revealed as plaintext")
    return await withTierAuthorizedVmk({
      tier: "R2",
      wrapMeta: vmkWrapMeta,
      parentSurface: rpcContext.surface,
      buildPrompt: async (vmk, wrapMeta) => {
        const rootMetadata = await openRootMetadata(wrapMeta, vmk)
        verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "reveal" })
        if (!displayContainsSecret(request.context, request.material.name, "static")) {
          throw new RpcError("invalid_context", "reveal context does not cover the requested secret")
        }
        return {
          title: "reveal.showConfirmTitle",
          subtitle: rawText(request.material.name),
          body: rawText(`${formatSignedDisplayBlock(request.context.display)}\n\n${t("reveal.confirmBody")}`),
          challenge: await sha256Bytes(signedOperationContextMessage(request.context)),
          label: "common.continue",
        }
      },
      operation: async (vmk, wrapMeta, session) => {
        consumeSignedOperationContexts([request.context])
        const plaintext = await openProtected(sealed, vmk, protectedRecordContextFromMetadata(request.material.name, recordMetadata))
        try {
          await presentPlaintext({
            name: request.material.name,
            plaintext,
            abortSignal: session.signal,
            onCopy: async (text, signal) => {
              if (currentVaultSessionPolicy().strictApprovals) {
                await confirmPasskeyUvWithAbort({
                  wrapMeta,
                  challenge: await sha256Bytes(`reveal-copy:${request.context.requestId}:${request.material.name}`),
                  abortSignals: [signal, session.signal],
                })
              }
              throwIfAborted(signal)
              throwIfAborted(session.signal)
              await navigator.clipboard.writeText(text)
            },
          })
        } finally {
          plaintext.fill(0)
        }
        return { completed: true }
      },
    })
  } catch (error) {
    throw rpcFailure(error, "reveal_failed")
  }
}

async function handleSign(payload: unknown, rpcContext: RpcRequestContext) {
  const request = signRequest(payload)
  try {
    const verified = verifySigningContext(request.signingContext)
    const { sealed, vmkWrapMeta, recordMetadata } = unpackProtectedRecord(request.material.envelope)
    if (recordMetadata?.kind !== "keypair") {
      throw new Error("protected signing requires a keypair protected record")
    }
    return await withTierAuthorizedVmk({
      tier: "R3",
      wrapMeta: vmkWrapMeta,
      parentSurface: rpcContext.surface,
      buildPrompt: async (vmk, wrapMeta) => {
        const rootMetadata = await openRootMetadata(wrapMeta, vmk)
        verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "sign" })
        if (!displayContainsSecret(request.context, request.material.name, "keypair")) {
          throw new RpcError("invalid_context", "sign context does not cover the requested key")
        }
        assertSignedOperationContextsConsumable([request.context])
        return {
          title: "sign.title",
          subtitle: rawText(request.material.name),
          body: rawText(`${formatSignedDisplayBlock(request.context.display)}\n\n${verified.display}`),
          challenge: verified.challenge,
          label: "sign.confirm",
        }
      },
      operation: async (vmk) => {
        assertSignedOperationContextsConsumable([request.context])
        return await signProtectedDigest(
          sealed,
          vmk,
          protectedRecordContextFromMetadata(request.material.name, recordMetadata),
          verified.digest,
          request.scheme,
        )
      },
      beforeSuccess: () => consumeSignedOperationContexts([request.context]),
    })
  } catch (error) {
    throw rpcFailure(error, "sign_failed")
  }
}

async function handleApproveRelease(payload: unknown, rpcContext: RpcRequestContext) {
  const request = approveReleaseRequest(payload)
  try {
    const first = unpackProtectedRecord(request.items[0].material.envelope)
    const vmkWrapMeta = first.vmkWrapMeta
    for (const item of request.items) {
      const unpacked = unpackProtectedRecord(item.material.envelope)
      if (unpacked.vmkWrapMeta !== vmkWrapMeta) throw new RpcError("invalid_payload", "approveRelease items must share one VMK context")
      if (unpacked.recordMetadata?.kind !== "static") throw new RpcError("invalid_payload", "approveRelease only supports static protected records")
    }
    const initialState = vaultStatus(vmkWrapMeta).state
    const policy = currentVaultSessionPolicy()
    const plan = resolveAuthorizationPlan({ tier: "R2", vaultState: initialState, policy })
    let unlockedForThisOperation = false
    if (plan.passkey === "unlock") {
      await unlockForOperationExclusive(vmkWrapMeta, policy)
      unlockedForThisOperation = true
    }

    const runWithCurrentVmk = async (passkey: Exclude<PasskeyRequirement, "unlock">) => {
      let completed = false
      let approvalNow: number | undefined
      try {
        const result = await withUnlockedVmk(
          async (vmk, wrapMeta, session) => {
            const release = await approveReleaseBatch({
              items: request.items,
              vmk,
              wrapMeta,
              consumeReplayIds: false,
              onApprovalAccepted: (now) => {
                approvalNow = now
              },
              confirm: (approval) =>
                confirmAuthorizationCard({
                  title: "release.title",
                  subtitle: i18nText("release.subtitle", { count: request.items.length }),
                  body: rawText(approval.body),
                  challenge: approval.challenge,
                  label: "release.confirm",
                  wrapMeta,
                  passkey,
                  abortSignal: session.signal,
                  parentSurface: rpcContext.surface,
                }),
            })
            session.assertCurrent()
            return release
          },
          {
            renewOnSuccess: plan.renewOnSuccess,
            beforeSuccess: () => consumeSignedOperationContexts(request.items.map((item) => item.context), approvalNow),
          },
        )
        completed = true
        return result
      } catch (error) {
        if (unlockedForThisOperation && !completed && vaultStatus().state === "unlocked") {
          lockVault({ broadcast: true, reason: "manual-lock" })
        }
        throw error
      }
    }

    try {
      return await runWithCurrentVmk(plan.passkey === "uv" ? "uv" : "none")
    } catch (error) {
      if (plan.passkey !== "unlock" && shouldRetryAfterApproveReleaseLockRace(error, vmkWrapMeta)) {
        await unlockForOperationExclusive(vmkWrapMeta, policy)
        unlockedForThisOperation = true
        return await runWithCurrentVmk("none")
      }
      throw error
    }
  } catch (error) {
    throw rpcFailure(error, "approve_release_failed")
  }
}

async function handleDeleteAuthzAssertion(payload: unknown) {
  const request = deleteAuthzAssertionRequest(payload)
  try {
    const assertion = await produceAssertionCredential(request.webauthn)
    return { challengeId: request.challengeId, assertion }
  } catch (error) {
    throw rpcFailure(error, "delete_authz_failed")
  }
}

function setupTopLevelView(): void {
  const params = new URLSearchParams(window.location.search)
  if (params.get("mode") !== "setup") return
  const requestedLocale = params.get("locale")
  const requestedTheme = params.get("theme")
  if ((requestedLocale === "en" || requestedLocale === "zh") && (requestedTheme === "light" || requestedTheme === "dark")) {
    applyAppearance({ locale: requestedLocale, theme: requestedTheme })
  }
  const id = params.get("id")
  const page = document.getElementById("page")
  const card = page?.querySelector(".card")
  const title = page?.querySelector("h1")
  const subtitle = page?.querySelector(".sub")
  const body = page?.querySelector(".body")
  if (!id || !card || !title || !subtitle || !body) return

  document.body.classList.add("setup-mode")
  setElementText(title as HTMLElement, "setup.title")
  setElementText(subtitle as HTMLElement, "setup.subtitle")
  setElementText(body as HTMLElement, "setup.topLevelBody")

  const button = document.createElement("button")
  button.type = "button"
  button.className = "action"
  setElementText(button, "setup.createPasskey")

  const status = document.createElement("p")
  status.className = "setup-status"
  setElementText(status, "setup.readyOnOrigin")

  card.append(button, status)

  const requestParam = new URLSearchParams(window.location.hash.slice(1)).get("req")
  if (!requestParam) {
    button.disabled = true
    setElementText(status, "setup.requestMissing")
    return
  }

  let request: SetupRequest
  try {
    request = decodeSetupRequest(requestParam)
  } catch {
    button.disabled = true
    setElementText(status, "setup.requestInvalid")
    return
  }

  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`${SETUP_CHANNEL_PREFIX}${id}`)
  const failSetup = (error: unknown): void => {
    const failure = rpcFailure(error, "setup_create_failed")
    const errored = {
      type: "setup-error",
      id,
      code: failure.code,
      message: failure.message,
      retryable: failure.retryable,
    } satisfies SetupChannelMessage
    writeStoredSetupError(id, failure)
    channel?.postMessage(errored)
    try {
      window.opener?.postMessage(errored, window.location.origin)
    } catch {
      // Fallbacks remain.
    }
    button.disabled = false
    setElementText(status, rawText(failure.message))
  }

  button.addEventListener("click", () => {
    button.disabled = true
    setElementText(status, "setup.passkeyPrompt")
    let created: Promise<TopLevelSetupResult>
    try {
      created = createPasskeyCredential({
        rpId: rpId(),
        vaultUserHandle: request.vaultUserHandle,
        displayName: request.displayName,
        authzCreationOptions: request.authzCreationOptions,
      })
    } catch (error) {
      failSetup(error)
      return
    }
    void created
      .then((result) => {
        const created = { type: "setup-created", id, result } satisfies SetupChannelMessage
        writeStoredSetupResult(id, result)
        channel?.postMessage(created)
        // Primary channel back to the embedding iframe: postMessage to our opener is NOT
        // storage-partitioned (iOS Safari isolates localStorage/BroadcastChannel between this
        // top-level page and the cross-site iframe) and queues across the opener tab's freeze.
        try {
          window.opener?.postMessage(created, window.location.origin)
        } catch {
          // localStorage / BroadcastChannel fallbacks remain for contexts without a live opener.
        }
        setElementText(status, "setup.created")
        setTimeout(() => window.close(), 250)
      })
      .catch(failSetup)
  })
}

// handshake — the parent confirms our build + pins the session. We echo the
// build hash so the parent can compare it against its locally-pinned manifest
// (defence-in-depth; the parent's fetch-and-hash check is the primary proof).
server.register("handshake", (payload) => {
  const p = (payload ?? {}) as Record<string, unknown>
  const expected = typeof p.expectedBuildHash === "string" ? p.expectedBuildHash : null
  if (typeof p.parentOrigin !== "string" || typeof p.nonce !== "string" || p.nonce.length < 16) {
    throw new RpcError("invalid_handshake", "handshake must include parentOrigin and nonce")
  }
  if (expected !== null && expected !== BUILD.buildHash) {
    throw new RpcError("build_hash_mismatch", "sandbox build hash does not match parent expectation")
  }
  const appearance = optionalAppearance(p.appearance)
  if (appearance) applyAppearance(appearance)
  const policy = handshakePolicyPinned ? currentVaultSessionPolicy() : setVaultSessionPolicy(p.policy)
  handshakePolicyPinned = true
  return {
    accepted: true,
    channel: CHANNEL,
    version: VERSION,
    sandboxOrigin: window.location.origin,
    build: BUILD,
    policy,
  }
})

server.register("set-appearance", (payload) => {
  applyAppearance(appearanceRequest(payload))
  return { accepted: true }
})

server.register("status", (payload) => {
  const request = statusRequest(payload)
  try {
    if (request.wrapMeta) vaultStatus(request.wrapMeta)
    const status = vaultStatus()
    const policy = currentVaultSessionPolicy()
    return {
      ...status,
      policy,
      session: {
        ...(status.expiresAt !== undefined ? { expiresAt: status.expiresAt } : {}),
        strict: policy.strictApprovals,
      },
    }
  } catch (error) {
    throw rpcFailure(error, "invalid_wrap_meta")
  }
})
server.register("setup", handleSetup)
server.register("unlock", handleUnlock)
server.register("lock", () => {
  const status = lockVault({ broadcast: true, reason: "manual-lock" })
  return { ...status, policy: currentVaultSessionPolicy() }
})
server.register("seal", handleSeal)
server.register("reveal", handleReveal)
server.register("sign", handleSign)
server.register("approveRelease", handleApproveRelease)
server.register("deleteAuthzAssertion", handleDeleteAuthzAssertion)

setVaultStateEventSink((event) => server.emit("vault.state", event))
setUiEventSink((event) => server.emit(event))

server.start()

window.addEventListener("pagehide", clearVaultOnUnload)

setupTopLevelView()

// When embedded in an iframe we are a headless crypto worker: drop all chrome
// so the parent app's UI shows through. Only a top-level view (direct visit or
// the setup ceremony window) renders the branded card.
if (window.self !== window.top) {
  document.body.classList.add("embedded")
}
