import "./style.css"
import { ceremonyParameters, ceremonyUrl, requireReleaseReady, sameBuild } from "./releaseNavigation"
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
  unpackProtectedRecord,
  withRootMetadata,
  withWrapMetaMetadata,
  type ProtectedRecordEnvelope,
  type VaultRootMetadata,
} from "./vaultCrypto"
import {
  clearVaultOnUnload,
  beginVaultOperationSnapshot,
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
  type SerializedCredential,
} from "./webauthn"
import {
  button as operationButton,
  confirmOperationInActiveSlot,
  appendDynamic,
  hideCard,
  i18nText,
  presentPlaintext,
  rawText,
  runExclusiveOperation,
  setUiEventSink,
  setElementText,
  showCard,
  hasPendingUiShow,
  status as operationStatus,
  type ConfirmationDetails,
  type TextSpec,
} from "./operationUi"
import { getLocale, refreshI18nBindings, setLocale, t } from "./i18n"
import { unlockVmkFromPasskeyPrf, unlockVmkFromPasskeyPrfAssertion } from "./approvalUnlock"
import { parseSealRequest } from "./sealRequest"
import { prepareSignRequest, signPreparedRequest, verifyPreparedSignRequest, type VerifiedSignContent } from "./signRequest"
import {
  authorizationCard, decodeAuthorizationPrompt, serializeAuthorizationPrompt,
  type AuthorizationPrompt, type SerializedAuthorizationPrompt,
} from "./authorizationPrompt"
import { currentVaultSessionPolicy, parseVaultSessionPolicy, setVaultSessionPolicy, type VaultSessionPolicy } from "./policy"
import { monitorConfirmSurface } from "./confirmSurface"
import { resolveAuthorizationPlan, type RiskTier, type PasskeyRequirement } from "./authz"
import { sealGeneratedKeypair, sealParentProvidedStatic } from "./sealOperations"
import { approveReleaseBatch, isStaticReleaseRecord, parseApproveReleaseItem, previewApproveRelease } from "./approveRelease"
import {
  assertSignedOperationContextPreview,
  assertSignedOperationContextsConsumable,
  consumeSignedOperationContexts,
  signedOperationContextMessage,
  verifySignedOperationContext,
  type SignedOperationContext,
} from "./operationContext"
import {
  parsePolicyDowngradeContext,
  parsePolicyDowngradePayload,
  policyRemainingMs,
  requestPolicyAssertion,
  validatePolicyAssertion,
  type PolicyDowngradeContext,
} from "./signingPolicyDowngrade"
import { policyAuthorizationCard } from "./signingPolicyUi"
import { assertRevealBinding, parseRevealRequest } from "./revealRequest"
import {
  HD_OPERATION_MS, hdRemainingMs, parseHdAuthorizationRequest, parseHdAuthorizationResult, parseHdSealRequest,
  runHdPopupCeremony, type HdAuthorizationRequest, type HdAuthorizationResult,
} from "./protectedHdCeremony"
import { collectProtectedHdInput } from "./protectedHdUi"

type StatusRequest = {
  wrapMeta?: string
}

type SetupRequest = {
  vaultUserHandle: string
  displayName: string
  existingProtectedVault: boolean
  authzCreationOptions?: unknown
  rootMetadata?: VaultRootMetadata
  policy?: VaultSessionPolicy
}

type UnlockRequest = {
  wrapMeta: string
  policy?: VaultSessionPolicy
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

type SetupChannelMessage = { build: typeof BUILD } & (
  | { type: "setup-created"; id: string; result: TopLevelSetupResult }
  | { type: "setup-error"; id: string; code: string; message?: string; retryable?: boolean }
)

type LegacyTopLevelAuthorizationRequest = {
  prompt: AuthorizationPrompt
  wrapMeta: string
  passkey: PasskeyRequirement
}

type PolicyTopLevelAuthorizationRequest = {
  kind: "signing-policy-downgrade"
  context: PolicyDowngradeContext
}

type TopLevelAuthorizationRequest = LegacyTopLevelAuthorizationRequest | PolicyTopLevelAuthorizationRequest | HdAuthorizationRequest

type TopLevelAuthorizationResult =
  | { kind: "confirmed" }
  | { kind: "unlock"; prfOutput: string; prfSalt: string }
  | { kind: "assertion"; assertion: SerializedCredential }
  | HdAuthorizationResult

type AuthorizationChannelMessage = { build: typeof BUILD } & (
  | { type: "authorization-ready"; id: string }
  | { type: "authorization-request"; id: string; request: SerializedTopLevelAuthorizationRequest }
  | { type: "authorization-approved"; id: string; result: TopLevelAuthorizationResult }
  | { type: "authorization-error"; id: string; code: string; message?: string; retryable?: boolean }
)

const SETUP_CHANNEL_PREFIX = `avibe-vault-setup:v1:${BUILD.buildHash}:`
const SETUP_RESULT_STORAGE_PREFIX = `avibe-vault-setup-result:${BUILD.buildHash}:`
const SETUP_ERROR_STORAGE_PREFIX = `avibe-vault-setup-error:${BUILD.buildHash}:`
const SETUP_WINDOW_TIMEOUT_MS = 5 * 60 * 1000
const AUTHORIZATION_WINDOW_TIMEOUT_MS = 5 * 60 * 1000
// A window the parent opened for this request must announce itself within this
// bound; otherwise it was closed, blocked, or cannot reach this frame.
const AUTHORIZATION_WINDOW_PAIRING_TIMEOUT_MS = 30 * 1000
// How long an authorization window waits for its request before telling the user
// to retry from Avibe. The requesting page normally answers within a second or
// two; one that has not by now was closed or frozen behind this window (a Home
// Screen app on iOS is frozen about two seconds after it opens a window).
const AUTHORIZATION_WINDOW_WAITING_HINT_MS = 8 * 1000

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
    ...(record.policy !== undefined ? { policy: parseVaultSessionPolicy(record.policy) } : {}),
  }
}

function unlockRequest(payload: unknown): UnlockRequest {
  const record = asRecord(payload)
  return {
    wrapMeta: requiredString(record.wrapMeta, "wrapMeta"),
    ...(record.policy !== undefined ? { policy: parseVaultSessionPolicy(record.policy) } : {}),
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

async function confirmAuthorizationCard(input: AuthorizationPrompt & {
  wrapMeta: string
  passkey: PasskeyRequirement
  policy?: VaultSessionPolicy
  abortSignal?: AbortSignal
  parentSurface?: () => RpcRequestContext["surface"] | undefined
  authorizationWindow?: RpcRequestContext["takeAuthorizationWindow"]
}): Promise<void> {
  await runExclusiveOperation(async (signal) => {
    const activate = async (preopenedWindow?: string): Promise<void> => {
      const merged = mergedAbortSignal([signal, ...(input.abortSignal ? [input.abortSignal] : [])])
      try {
        const result = await requestTopLevelAuthorization(
          {
            prompt: authorizationPromptOf(input),
            wrapMeta: input.wrapMeta,
            passkey: input.passkey,
          },
          merged.signal,
          preopenedWindow,
        )
        if (input.passkey === "unlock") {
          if (result.kind !== "unlock") throw new Error("authorization unlock result is missing")
          await unlockVmkFromPasskeyPrfAssertion({
            wrapMeta: input.wrapMeta,
            currentRpId: rpId(),
            assertion: {
              prfOutput: base64ToBytes(result.prfOutput),
              prfSalt: base64ToBytes(result.prfSalt),
            },
            abortSignal: merged.signal,
            ...(input.policy ? { policy: input.policy } : {}),
          })
        } else if (result.kind !== "confirmed") {
          throw new Error("authorization result is invalid")
        }
      } finally {
        merged.cleanup()
      }
    }
    // The parent already opened the authorization window from its own approval
    // gesture, so the in-slot card that only exists to earn a user activation
    // for window.open is skipped.
    const preopenedWindow = input.authorizationWindow?.()
    if (preopenedWindow) {
      await activate(preopenedWindow)
      return
    }
    await confirmOperationInActiveSlot(authorizationCard(authorizationPromptOf(input), "common.continue"), signal, undefined, activate)
  })
}

/** The prompt fields of a wider input, named one by one so nothing else rides along. */
function authorizationPromptOf(input: AuthorizationPrompt): AuthorizationPrompt {
  return {
    title: input.title,
    subtitle: input.subtitle,
    ...(input.body ? { body: input.body } : {}),
    ...(input.details ? { details: input.details } : {}),
    ...(input.review ? { review: input.review } : {}),
    ...(input.reviewSession !== undefined ? { reviewSession: input.reviewSession } : {}),
    ...(input.challenge ? { challenge: input.challenge } : {}),
    label: input.label,
  }
}

type SerializedLegacyTopLevelAuthorizationRequest = Omit<LegacyTopLevelAuthorizationRequest, "prompt"> & {
  prompt: SerializedAuthorizationPrompt
}
type SerializedTopLevelAuthorizationRequest = SerializedLegacyTopLevelAuthorizationRequest | PolicyTopLevelAuthorizationRequest | HdAuthorizationRequest

function serializeAuthorizationRequest(request: TopLevelAuthorizationRequest): SerializedTopLevelAuthorizationRequest {
  if ("kind" in request) return request
  return {
    ...request,
    prompt: serializeAuthorizationPrompt(request.prompt),
  }
}

function decodeAuthorizationRequest(value: unknown): TopLevelAuthorizationRequest {
  const record = asRecord(value)
  if (!record) throw new RpcError("invalid_payload", "authorization request must be an object")
  if (record.kind === "protected-hd-wallet") return parseHdAuthorizationRequest(record)
  if (record.kind === "signing-policy-downgrade") {
    if (Object.keys(record).length !== 2 || !Object.hasOwn(record, "context")) {
      throw new RpcError("invalid_payload", "policy authorization request has unknown fields")
    }
    return {
      kind: "signing-policy-downgrade",
      context: parsePolicyDowngradeContext(record.context, {
        origin: window.location.origin,
        hostname: window.location.hostname,
      }),
    }
  }
  if (record.kind !== undefined) throw new RpcError("invalid_payload", "authorization request kind is invalid")
  const passkey = record.passkey
  if (passkey !== "none" && passkey !== "unlock" && passkey !== "uv") {
    throw new RpcError("invalid_payload", "authorization passkey requirement is invalid")
  }
  return {
    prompt: decodeAuthorizationPrompt(record.prompt),
    wrapMeta: requiredString(record.wrapMeta, "wrapMeta"),
    passkey,
  }
}

function authorizationWindowUrl(id: string): string {
  return ceremonyUrl("authorize", id, currentAppearance())
}

function validateTopLevelAuthorizationResult(
  value: unknown,
  request: TopLevelAuthorizationRequest,
): TopLevelAuthorizationResult {
  const record = asRecord(value)
  if (!record) throw new RpcError("authorization_result_invalid", "authorization result is invalid")
  if ("kind" in request) {
    if (request.kind === "protected-hd-wallet") return parseHdAuthorizationResult(record, request)
    if (request.kind !== "signing-policy-downgrade") {
      throw new RpcError("authorization_result_invalid", "authorization request kind is invalid")
    }
    if (record.kind !== "assertion" || !Object.hasOwn(record, "assertion")) {
      throw new RpcError("authorization_result_invalid", "policy authorization result kind is invalid")
    }
    return { kind: "assertion", assertion: record.assertion as SerializedCredential }
  }
  if (record.kind === "confirmed") return { kind: "confirmed" }
  if (record.kind === "unlock") {
    return {
      kind: "unlock",
      prfOutput: requiredString(record.prfOutput, "result.prfOutput"),
      prfSalt: requiredString(record.prfSalt, "result.prfSalt"),
    }
  }
  throw new RpcError("authorization_result_invalid", "authorization result kind is invalid")
}

/**
 * Runs one authorization in a top-level sandbox window. Without a preopened id
 * this frame opens the window itself, which requires a user activation here.
 * With a preopened id the parent already opened the window; it is paired by
 * the first sandbox-origin `authorization-ready` that carries that id.
 */
function requestTopLevelAuthorization(
  request: TopLevelAuthorizationRequest,
  signal?: AbortSignal,
  preopenedId?: string,
): Promise<TopLevelAuthorizationResult> {
  throwIfAborted(signal)
  const hd = "kind" in request && request.kind === "protected-hd-wallet" ? request : undefined
  if (hd) hdRemainingMs(hd)
  const id = preopenedId ?? randomId()
  const popupName = `avibe-vault-authorization-${id}`

  return new Promise((resolve, reject) => {
    let popup: Window | null = null
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let closedId: ReturnType<typeof setInterval> | null = null
    let closeGraceTimer: ReturnType<typeof setTimeout> | null = null
    let pairingTimer: ReturnType<typeof setTimeout> | null = null
    const abort = (): void => finish(() => reject(operationAbortReason(signal!)))
    const unload = (): void => finish(() => reject(new RpcError("authorization_cancelled", "requesting sandbox was unloaded", true)))
    const windowClosed = (): RpcError => new RpcError("authorization_window_closed", "authorization window was closed", true)
    const watchPopup = (target: Window): void => {
      popup = target
      closedId = setInterval(() => {
        if (!target.closed || closeGraceTimer) return
        // Mobile Safari may freeze the opener while the popup is foregrounded. The popup can
        // post and close before the queued message is delivered when the opener resumes, so
        // keep a short grace period and let the id-gated message win if it arrives.
        closeGraceTimer = setTimeout(() => finish(() => reject(windowClosed())), 2500)
      }, 500)
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== window.location.origin) return
      const message = event.data as AuthorizationChannelMessage | undefined
      if (!message || message.id !== id || !sameBuild(message.build)) return
      if (!popup && preopenedId && message.type === "authorization-ready" && event.source) {
        if (pairingTimer) clearTimeout(pairingTimer)
        pairingTimer = null
        watchPopup(event.source as Window)
      }
      if (event.source !== popup) return
      if (message.type === "authorization-ready") {
        try {
          popup?.postMessage(
            {
              type: "authorization-request",
              build: BUILD,
              id,
              request: serializeAuthorizationRequest(request),
            } satisfies AuthorizationChannelMessage,
            window.location.origin,
          )
        } catch (error) {
          finish(() => reject(error))
        }
      } else if (message.type === "authorization-approved") {
        try {
          const result = validateTopLevelAuthorizationResult(message.result, request)
          finish(() => resolve(result))
        } catch (error) {
          finish(() => reject(error))
        }
      } else if (message.type === "authorization-error") {
        finish(() => reject(new RpcError(message.code, message.message, Boolean(message.retryable))))
      }
    }
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (closedId) clearInterval(closedId)
      if (closeGraceTimer) clearTimeout(closeGraceTimer)
      if (pairingTimer) clearTimeout(pairingTimer)
      window.removeEventListener("message", onMessage)
      window.removeEventListener("pagehide", unload)
      signal?.removeEventListener("abort", abort)
      try {
        if (popup && !popup.closed) popup.close()
      } catch {
        // The popup is same-origin, but closing can still throw during teardown.
      }
      callback()
    }

    window.addEventListener("message", onMessage)
    window.addEventListener("pagehide", unload, { once: true })
    if (preopenedId) {
      pairingTimer = setTimeout(() => finish(() => reject(windowClosed())), AUTHORIZATION_WINDOW_PAIRING_TIMEOUT_MS)
    } else {
      const opened = window.open(authorizationWindowUrl(id), popupName, "popup,width=520,height=760")
      if (!opened) {
        finish(() => reject(new RpcError("authorization_popup_blocked", "authorization window was blocked", true)))
        return
      }
      opened.focus()
      watchPopup(opened)
    }
    timeoutId = setTimeout(
      () => finish(() => reject(new RpcError("authorization_window_timeout", "authorization window timed out", true))),
      hd ? hdRemainingMs(hd) : AUTHORIZATION_WINDOW_TIMEOUT_MS,
    )
    if (signal) {
      if (signal.aborted) {
        abort()
        return
      }
      signal.addEventListener("abort", abort, { once: true })
    }
  })
}

function grantDurationText(seconds: number): TextSpec {
  if (seconds === 0) return "context.oneTime"
  if (seconds % 60 === 0) return i18nText("context.minutes", { count: seconds / 60 })
  return i18nText("context.seconds", { count: seconds })
}

/**
 * The daemon-signed request rows. A signing request reuses the same fields with
 * wording that fits it: what the request returns, and the name it asked for the
 * key by. Release and reveal keep their established wording.
 */
function signedDisplayConfirmationDetails(
  display: SignedOperationContext["display"],
  recipient?: { agentFingerprint?: string; grantId?: string },
  purpose: "access" | "sign" = "access",
): ConfirmationDetails {
  const rows: ConfirmationDetails["rows"] = []
  if (display.sessionLabel) rows.push({ label: "context.session", value: rawText(display.sessionLabel) })
  if (display.command) rows.push({ label: "context.command", value: rawText(display.command), variant: "command" })
  if (display.egress) rows.push({ label: purpose === "sign" ? "context.signReturns" : "context.egress", value: rawText(display.egress) })
  const sourceValues = [
    ...(display.source?.env?.map((entry) => rawText(`${t(purpose === "sign" ? "context.sourceRequestedName" : "context.sourceEnv")}: ${entry}`)) ?? []),
    ...(display.source?.tags?.map((entry) => rawText(`${t("context.sourceTag")}: ${entry}`)) ?? []),
    ...(display.source?.skills?.map((entry) => rawText(`${t("context.sourceSkill")}: ${entry}`)) ?? []),
  ]
  if (sourceValues.length > 0) rows.push({ label: "context.source", values: sourceValues, variant: "chips" })
  if (recipient?.agentFingerprint) {
    rows.push({ label: "context.agent", value: rawText(recipient.agentFingerprint), variant: "mono" })
  }
  if (recipient?.grantId) rows.push({ label: "context.grant", value: rawText(recipient.grantId), variant: "mono" })
  if (display.grantTtlSeconds !== undefined) {
    rows.push({ label: "context.agentAccess", value: grantDurationText(display.grantTtlSeconds) })
  }
  rows.push({
    label: "context.secrets",
    values: display.secrets.map((secret) =>
      rawText(`${secret.name} · ${t(secret.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`),
    ),
    variant: "chips",
    tone: "warning",
  })
  return { rows }
}

type VmkOperation<T> = (vmk: Uint8Array, wrapMeta: string, session: UnlockedVmkSession) => Promise<T> | T

function isVaultLockedError(error: unknown): boolean {
  return error instanceof Error && error.message === "vault-locked"
}

function isVaultOperationAbortedError(error: unknown): boolean {
  return error instanceof Error && error.message === "vault-operation-aborted"
}

function shouldRetryAfterAuthorizationLockRace(error: unknown, wrapMeta: string): boolean {
  if (isVaultLockedError(error)) return true
  return isVaultOperationAbortedError(error) && vaultStatus(wrapMeta).state === "locked"
}

async function unlockForOperation(wrapMeta: string, policy: VaultSessionPolicy = currentVaultSessionPolicy(), abortSignal?: AbortSignal): Promise<void> {
  await unlockVmkFromPasskeyPrf({ wrapMeta, currentRpId: rpId(), policy, abortSignal })
}

async function unlockForOperationExclusive(wrapMeta: string, policy: VaultSessionPolicy = currentVaultSessionPolicy()): Promise<void> {
  await runExclusiveOperation((signal) => unlockForOperation(wrapMeta, policy, signal))
}

async function confirmAndUnlockForAuthorization(input: AuthorizationPrompt & {
  wrapMeta: string
  policy: VaultSessionPolicy
  abortSignal?: AbortSignal
  parentSurface?: () => RpcRequestContext["surface"] | undefined
  authorizationWindow?: RpcRequestContext["takeAuthorizationWindow"]
}): Promise<void> {
  try {
    await confirmAuthorizationCard({ ...input, passkey: "unlock" })
  } catch (error) {
    if (vaultStatus(input.abortSignal ? undefined : input.wrapMeta).state === "unlocked") lockVault({ broadcast: true, reason: "manual-lock" })
    throw error
  }
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
  parentSurface?: () => RpcRequestContext["surface"] | undefined
  authorizationWindow?: RpcRequestContext["takeAuthorizationWindow"]
  lockedPrompt: AuthorizationPrompt
  buildPrompt: (vmk: Uint8Array, wrapMeta: string, session: UnlockedVmkSession) => Promise<AuthorizationPrompt> | AuthorizationPrompt
  operation: VmkOperation<T>
  bindRoot?: boolean
  beforeSuccess?: () => Promise<void> | void
}): Promise<T> {
  const initialState: VaultState = vaultStatus(input.wrapMeta).state
  const policy = currentVaultSessionPolicy()
  const plan = resolveAuthorizationPlan({ tier: input.tier, vaultState: initialState, policy })
  let unlockedForThisOperation = false

  const confirmAndUnlock = async (): Promise<void> => {
    const snapshot = input.bindRoot ? beginVaultOperationSnapshot(input.wrapMeta) : undefined
    try {
      await confirmAndUnlockForAuthorization({
        ...input.lockedPrompt,
        wrapMeta: input.wrapMeta,
        policy,
        ...(snapshot ? { abortSignal: snapshot.signal } : {}),
        parentSurface: input.parentSurface,
        authorizationWindow: input.authorizationWindow,
      })
      unlockedForThisOperation = true
    } finally { snapshot?.release() }
  }

  const runWithCurrentVmk = async (passkey: Exclude<PasskeyRequirement, "unlock">, alreadyConfirmed = false): Promise<T> => {
    let completed = false
    try {
      const result = await withUnlockedVmk(
        async (vmk, wrapMeta, session) => {
          const prompt = await input.buildPrompt(vmk, wrapMeta, session)
          if (plan.confirm && !alreadyConfirmed) {
            await confirmAuthorizationCard({
              ...prompt,
              wrapMeta,
              passkey,
              abortSignal: session.signal,
              parentSurface: input.parentSurface,
              authorizationWindow: input.authorizationWindow,
            })
            session.assertCurrent()
          }
          return input.operation(vmk, wrapMeta, session)
        },
        { renewOnSuccess: plan.renewOnSuccess, beforeSuccess: input.beforeSuccess,
          ...(input.bindRoot ? { expectedWrapMeta: input.wrapMeta } : {}) },
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
    if (plan.passkey === "unlock") {
      await confirmAndUnlock()
      return await runWithCurrentVmk("none", true)
    }
    return await runWithCurrentVmk(plan.passkey === "uv" ? "uv" : "none")
  } catch (error) {
    if (!input.bindRoot && plan.passkey !== "unlock" && shouldRetryAfterAuthorizationLockRace(error, input.wrapMeta)) {
      await confirmAndUnlock()
      return await runWithCurrentVmk("none", true)
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
  // Only public bootstrap metadata; never keys, PRF output, or plaintext.
  return ceremonyUrl("setup", id, currentAppearance(), { req: encodeSetupRequest(request) })
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
    localStorage.setItem(setupResultStorageKey(id), JSON.stringify({ build: BUILD, result }))
    localStorage.removeItem(setupErrorStorageKey(id))
  } catch {
    // BroadcastChannel remains the fallback when localStorage is unavailable.
  }
}

function writeStoredSetupError(id: string, failure: RpcError): void {
  try {
    localStorage.setItem(
      setupErrorStorageKey(id),
      JSON.stringify({ build: BUILD, code: failure.code, message: failure.message, retryable: failure.retryable }),
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
    const unload = (): void => finish(() => reject(new RpcError("setup_window_closed", "requesting sandbox was unloaded", true)))
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
      window.removeEventListener("pagehide", unload)
      channel?.close()
      clearStoredSetupOutcome(id)
      try { popup?.close() } catch { /* Already closed. */ }
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
          const stored = asRecord(JSON.parse(resultJson))
          if (!sameBuild(stored.build)) throw new RpcError("sandbox_build_mismatch")
          const result = validateTopLevelSetupResult(stored.result)
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
          if (!sameBuild(failure.build)) throw new RpcError("sandbox_build_mismatch")
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
      if (event.origin !== window.location.origin || event.source !== popup) return
      const message = event.data as SetupChannelMessage | undefined
      if (!message || message.id !== id || !sameBuild(message.build)) return
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
        if (!message || message.id !== id || !sameBuild(message.build)) return
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
    window.addEventListener("pagehide", unload, { once: true })

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

async function completeSetupWithCredential(
  request: SetupRequest,
  currentRpId: string,
  created: TopLevelSetupResult,
  signal?: AbortSignal,
  policy: VaultSessionPolicy = currentVaultSessionPolicy(),
) {
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
      policy,
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

function requestInteractiveCredentialSetup(request: SetupRequest, currentRpId: string, policy: VaultSessionPolicy) {
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
        void completeSetupWithCredential(request, currentRpId, created, signal, policy).then(
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
    const policy = request.policy ?? currentVaultSessionPolicy()
    const result =
      window.self !== window.top
        ? await requestInteractiveCredentialSetup(request, currentRpId, policy)
        : await completeSetupWithCredential(request, currentRpId, await requestTopLevelCredentialCreation(request), undefined, policy)
    // Runtime policy updates are accepted from the pinned parent only after the
    // setup ceremony succeeds; cancelled/failed setup cannot relax the session.
    const committedPolicy = request.policy ? setVaultSessionPolicy(policy) : currentVaultSessionPolicy()
    return { ...(result as Record<string, unknown>), policy: committedPolicy }
  } catch (error) {
    throw rpcFailure(error, "setup_failed")
  }
}

async function handleUnlock(payload: unknown) {
  const request = unlockRequest(payload)
  try {
    const currentRpId = rpId()
    const policy = request.policy ?? currentVaultSessionPolicy()
    const unlocked = await runExclusiveOperation(async (signal) => {
      let result: Awaited<ReturnType<typeof unlockVmkFromPasskeyPrf>> | undefined
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
        undefined,
        async () => {
          result = await unlockVmkFromPasskeyPrf({ wrapMeta: request.wrapMeta, currentRpId, abortSignal: signal, policy })
        },
      )
      if (!result) throw new Error("vault unlock did not complete")
      return result
    })
    // The requested policy drives this unlock's window, then becomes the
    // current policy only after the PRF unlock has succeeded.
    const committedPolicy = request.policy ? setVaultSessionPolicy(policy) : currentVaultSessionPolicy()
    return { ...unlocked, policy: committedPolicy }
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
          : await sealGeneratedKeypair({ name: request.name, curve: request.curve, vmk, wrapMeta })
      return { ...sealed, establishingVmk: currentFreshSetup() }
    })
  } catch (error) {
    throw rpcFailure(error, "seal_failed")
  }
}

async function handleSealHdWallet(payload: unknown, rpcContext: RpcRequestContext) {
  try {
    const request = parseHdSealRequest(payload)
    const windowId = rpcContext.takeAuthorizationWindow()
    if (!windowId) throw new RpcError("invalid_payload", "sealHdWallet requires a parent-opened authorization window")
    const snapshot = beginVaultOperationSnapshot(request.wrapMeta)
    const channelRequest: HdAuthorizationRequest = { ...request, kind: "protected-hd-wallet", deadlineAt: Date.now() + HD_OPERATION_MS }
    try {
      return await runExclusiveOperation(async (signal) => {
        const merged = mergedAbortSignal([signal, snapshot.signal])
        try {
          snapshot.assertCurrent()
          const result = await requestTopLevelAuthorization(channelRequest, merged.signal, windowId)
          snapshot.assertCurrent()
          const sealed = parseHdAuthorizationResult(result, channelRequest)
          snapshot.assertCurrent()
          return { envelope: sealed.envelope, accounts: sealed.accounts, expectedAccount0: sealed.expectedAccount0, establishingVmk: snapshot.freshSetup }
        } finally { merged.cleanup() }
      })
    } finally { snapshot.release() }
  } catch (error) { throw rpcFailure(error, "seal_hd_failed") }
}

async function handleReveal(payload: unknown, rpcContext: RpcRequestContext) {
  const request = parseRevealRequest(payload)
  try {
    const { sealed, vmkWrapMeta, recordMetadata } = unpackProtectedRecord(request.material.envelope)
    if (!isStaticReleaseRecord(recordMetadata)) throw new Error("only static protected records can be revealed as plaintext")
    assertSignedOperationContextPreview({
      context: request.context,
      expectedPurpose: "reveal",
      secret: { name: request.material.name, kind: "static" },
    })
    return await withTierAuthorizedVmk({
      tier: "R2",
      wrapMeta: vmkWrapMeta,
      bindRoot: true,
      parentSurface: rpcContext.latestSurface,
      authorizationWindow: rpcContext.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: rawText(request.material.name),
        body: "reveal.confirmBody",
        details: signedDisplayConfirmationDetails(request.context.display),
        label: "common.continue",
      },
      buildPrompt: async (vmk, wrapMeta) => {
        const rootMetadata = await openRootMetadata(wrapMeta, vmk)
        verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "reveal" })
        assertRevealBinding(request)
        assertSignedOperationContextPreview({
          context: request.context,
          expectedPurpose: "reveal",
          secret: { name: request.material.name, kind: "static" },
        })
        assertSignedOperationContextsConsumable([request.context])
        return {
          title: "reveal.showConfirmTitle",
          subtitle: rawText(request.material.name),
          body: "reveal.confirmBody",
          details: signedDisplayConfirmationDetails(request.context.display),
          challenge: await sha256Bytes(signedOperationContextMessage(request.context)),
          label: "common.continue",
        }
      },
      operation: async (vmk, wrapMeta, session) => {
        const rootMetadata = await openRootMetadata(wrapMeta, vmk)
        session.assertCurrent()
        verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "reveal" })
        assertRevealBinding(request)
        assertSignedOperationContextsConsumable([request.context])
        const plaintext = await openProtected(sealed, vmk, protectedRecordContextFromMetadata(request.material.name, recordMetadata))
        try {
          session.assertCurrent()
          verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "reveal" })
          assertRevealBinding(request)
          await consumeSignedOperationContexts([request.context])
          session.assertCurrent()
          verifySignedOperationContext({ context: request.context, rootMetadata, expectedPurpose: "reveal" })
          await presentPlaintext({
            name: request.material.name,
            plaintext,
            abortSignal: session.signal,
            prepareCopy: currentVaultSessionPolicy().strictApprovals
              ? async (signal) => {
                  await confirmPasskeyUvWithAbort({
                    wrapMeta,
                    challenge: await sha256Bytes(`reveal-copy:${request.context.requestId}:${request.material.name}`),
                    abortSignals: [signal, session.signal],
                  })
                  throwIfAborted(signal)
                  throwIfAborted(session.signal)
                }
              : undefined,
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
  try {
    const prepared = prepareSignRequest(payload)
    const { request, unpacked: { vmkWrapMeta } } = prepared
    // A structured review replaces the prose body; the session label is the one
    // request fact shown beside it, and the complete request rows stay in Details.
    const prompt = (content: VerifiedSignContent): AuthorizationPrompt => {
      const sessionLabel = request.context.display.sessionLabel
      // Never an empty card: content without a review must carry its prose display.
      if (!content.review && content.display === undefined) throw new RpcError("invalid_payload", "signing request has no reviewable content")
      return {
        title: "sign.title",
        subtitle: rawText(request.material.name),
        ...(content.review
          ? { review: content.review, ...(sessionLabel ? { reviewSession: sessionLabel } : {}) }
          : { body: rawText(content.display ?? "") }),
        details: signedDisplayConfirmationDetails(request.context.display, undefined, "sign"),
        label: "sign.confirm",
      }
    }
    if (prepared.hd) {
      // HD never inherits generic locked-R3's unlock-only alreadyConfirmed path.
      let unlockedForThisOperation = false
      try {
        if (vaultStatus(vmkWrapMeta).state !== "unlocked") {
          const snapshot = beginVaultOperationSnapshot(vmkWrapMeta)
          try {
            await confirmAndUnlockForAuthorization({
              title: "hd.unlockTitle", subtitle: rawText(request.material.name), body: "hd.unlockBody", label: "common.continue",
              wrapMeta: vmkWrapMeta, policy: currentVaultSessionPolicy(), abortSignal: snapshot.signal,
              parentSurface: rpcContext.latestSurface, authorizationWindow: rpcContext.takeAuthorizationWindow,
            })
          } finally { snapshot.release() }
          unlockedForThisOperation = true
        }
        return await withUnlockedVmk(async (vmk, wrapMeta, session) => {
          const authenticatedContent = await verifyPreparedSignRequest(prepared, vmk, wrapMeta)
          session.assertCurrent()
          await confirmAuthorizationCard({
            ...prompt(authenticatedContent), wrapMeta, passkey: "uv", challenge: new Uint8Array(prepared.challenge),
            abortSignal: session.signal, parentSurface: rpcContext.latestSurface, authorizationWindow: rpcContext.takeAuthorizationWindow,
          })
          session.assertCurrent()
          return signPreparedRequest(prepared, vmk, wrapMeta)
        }, { renewOnSuccess: false, expectedWrapMeta: vmkWrapMeta, beforeSuccess: () => consumeSignedOperationContexts([request.context]) })
      } catch (error) {
        if (unlockedForThisOperation && vaultStatus().state === "unlocked") lockVault({ broadcast: true, reason: "manual-lock" })
        throw error
      }
    }
    return await withTierAuthorizedVmk({
      tier: "R3",
      wrapMeta: vmkWrapMeta,
      parentSurface: rpcContext.latestSurface,
      authorizationWindow: rpcContext.takeAuthorizationWindow,
      lockedPrompt: prompt(prepared.verified),
      // Shown only after the daemon signature, expiry and replay state are
      // verified with the vault key, from content re-derived at that moment.
      buildPrompt: async (vmk, wrapMeta) => ({
        ...prompt(await verifyPreparedSignRequest(prepared, vmk, wrapMeta)),
        challenge: new Uint8Array(prepared.challenge),
      }),
      operation: (vmk, wrapMeta) => signPreparedRequest(prepared, vmk, wrapMeta),
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
      if (!isStaticReleaseRecord(unpacked.recordMetadata)) throw new RpcError("invalid_payload", "approveRelease only supports static protected records")
    }
    const preview = previewApproveRelease(request.items)
    const initialState = vaultStatus(vmkWrapMeta).state
    const policy = currentVaultSessionPolicy()
    const plan = resolveAuthorizationPlan({ tier: "R2", vaultState: initialState, policy })
    let unlockedForThisOperation = false

    const confirmAndUnlock = async (): Promise<void> => {
      await confirmAndUnlockForAuthorization({
        title: "release.title",
        subtitle: i18nText("release.subtitle", { count: request.items.length }),
        details: signedDisplayConfirmationDetails(preview.display, preview.recipient),
        label: "release.confirm",
        wrapMeta: vmkWrapMeta,
        policy,
        parentSurface: rpcContext.latestSurface,
        authorizationWindow: rpcContext.takeAuthorizationWindow,
      })
      unlockedForThisOperation = true
    }

    const runWithCurrentVmk = async (passkey: Exclude<PasskeyRequirement, "unlock">, alreadyConfirmed = false) => {
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
              confirm: (approval) => {
                if (!plan.confirm || alreadyConfirmed) return Promise.resolve()
                return confirmAuthorizationCard({
                  title: "release.title",
                  subtitle: i18nText("release.subtitle", { count: request.items.length }),
                  details: signedDisplayConfirmationDetails(approval.display, approval.recipient),
                  challenge: approval.challenge,
                  label: "release.confirm",
                  wrapMeta,
                  passkey,
                  abortSignal: session.signal,
                  parentSurface: rpcContext.latestSurface,
                  authorizationWindow: rpcContext.takeAuthorizationWindow,
                })
              },
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
      if (plan.passkey === "unlock") {
        await confirmAndUnlock()
        return await runWithCurrentVmk("none", true)
      }
      return await runWithCurrentVmk(plan.passkey === "uv" ? "uv" : "none")
    } catch (error) {
      if (plan.passkey !== "unlock" && shouldRetryAfterAuthorizationLockRace(error, vmkWrapMeta)) {
        await confirmAndUnlock()
        return await runWithCurrentVmk("none", true)
      }
      throw error
    }
  } catch (error) {
    throw rpcFailure(error, "approve_release_failed")
  }
}

async function requestPolicyAuthorization(
  context: PolicyDowngradeContext,
  rpcContext: RpcRequestContext,
): Promise<SerializedCredential> {
  let assertion: SerializedCredential | undefined
  await runExclusiveOperation(async (signal) => {
    policyRemainingMs(context)
    const request: PolicyTopLevelAuthorizationRequest = { kind: "signing-policy-downgrade", context }
    const activate = async (preopenedWindow?: string): Promise<void> => {
      policyRemainingMs(context)
      const result = await requestTopLevelAuthorization(request, signal, preopenedWindow)
      if (result.kind !== "assertion") throw new RpcError("authorization_result_invalid", "policy assertion is missing")
      assertion = validatePolicyAssertion(result.assertion, context)
    }
    const preopenedWindow = rpcContext.takeAuthorizationWindow()
    if (preopenedWindow) {
      await activate(preopenedWindow)
      return
    }
    policyRemainingMs(context)
    const card = policyAuthorizationCard(context)
    await confirmOperationInActiveSlot(
      card,
      signal,
      (target) =>
        monitorConfirmSurface({
          uiShowPending: hasPendingUiShow,
          parentSurface: () => rpcContext.latestSurface(),
          visibilityTarget: target,
          requireParentSurface: true,
        }),
      () => activate(),
    )
  })
  if (!assertion) throw new RpcError("authorization_result_invalid", "policy assertion is missing")
  return validatePolicyAssertion(assertion, context)
}

async function handleAuthorizeSigningPolicyDowngrade(payload: unknown, rpcContext: RpcRequestContext) {
  try {
    const context = parsePolicyDowngradePayload(payload, {
      origin: window.location.origin,
      hostname: window.location.hostname,
    })
    const assertion = await requestPolicyAuthorization(context, rpcContext)
    return { challengeId: context.challengeId, assertion }
  } catch (error) {
    throw rpcFailure(error, "policy_authorization_failed")
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
  const params = ceremonyParameters()
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
      build: BUILD,
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
        const created = { type: "setup-created", build: BUILD, id, result } satisfies SetupChannelMessage
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

function authorizationTopLevelView(): void {
  const params = ceremonyParameters()
  if (params.get("mode") !== "authorize") return
  const requestedLocale = params.get("locale")
  const requestedTheme = params.get("theme")
  if ((requestedLocale === "en" || requestedLocale === "zh") && (requestedTheme === "light" || requestedTheme === "dark")) {
    applyAppearance({ locale: requestedLocale, theme: requestedTheme })
  }

  const id = params.get("id")
  const page = document.getElementById("page")
  const card = page?.querySelector(".card")
  const body = card?.querySelector<HTMLElement>(".body")
  if (!id || !card || !body) return
  // Until the request arrives, say that it is on its way. Without an opener it
  // never can, so the retry hint shows at once.
  body.classList.add("waiting")
  setElementText(body, window.opener ? "authorize.waiting" : "authorize.waitingLong")
  if (!window.opener) return

  // The requesting sandbox frame is either the opener itself (it opened this
  // window) or a frame of the opener (the parent app opened this window from
  // its approval gesture). Messages stay pinned to the sandbox origin, so only
  // sandbox documents can read them.
  const requesterCandidates = (): Window[] => {
    const opener = window.opener as Window | null
    if (!opener) return []
    const candidates: Window[] = [opener]
    try {
      for (let index = 0; index < opener.frames.length; index += 1) candidates.push(opener.frames[index])
    } catch {
      // The opener may disappear while this popup is being initialized.
    }
    return candidates
  }
  let requester: Window | null = null
  const reply = (message: AuthorizationChannelMessage): void => {
    try {
      requester?.postMessage(message, window.location.origin)
    } catch {
      // The requester may have gone away; its own timeout reports the failure.
    }
  }

  let started = false
  let readyTimer: ReturnType<typeof setInterval> | null = null
  const waitingHintTimer = setTimeout(() => setElementText(body, "authorize.waitingLong"), AUTHORIZATION_WINDOW_WAITING_HINT_MS)
  const postReady = (): void => {
    if (started) return
    for (const candidate of requesterCandidates()) {
      try {
        candidate.postMessage({ type: "authorization-ready", build: BUILD, id } satisfies AuthorizationChannelMessage, window.location.origin)
      } catch {
        // The opener may disappear while this popup is being initialized.
      }
    }
  }
  const start = (request: TopLevelAuthorizationRequest): void => {
    if (started) return
    started = true
    if (readyTimer) clearInterval(readyTimer)
    clearTimeout(waitingHintTimer)
    body.classList.remove("waiting")
    window.removeEventListener("message", onMessage)
    document.body.classList.add("setup-mode")
    const controller = new AbortController()
    const fail = (error: unknown): void => {
      const failure = rpcFailure(error, error instanceof Error && error.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed")
      reply({
        type: "authorization-error", build: BUILD, id,
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
      })
      setTimeout(() => window.close(), 250)
    }
    const complete = (operation: Promise<void>, result: () => TopLevelAuthorizationResult): void => {
      void operation.then(
        () => {
          try {
            reply({ type: "authorization-approved", build: BUILD, id, result: result() })
            setTimeout(() => window.close(), 250)
          } catch (error) {
            fail(error)
          }
        },
        fail,
      )
    }

    if ("kind" in request) {
      if (request.kind === "protected-hd-wallet") {
        let result: HdAuthorizationResult | undefined
        const abortOnUnload = (): void => controller.abort(new RpcError("authorization_cancelled", "protected HD window closed", true))
        const timer = setTimeout(() => controller.abort(new RpcError("authorization_window_timeout", "protected HD window expired", true)), hdRemainingMs(request))
        window.addEventListener("pagehide", abortOnUnload, { once: true })
        const operation = runHdPopupCeremony(request, controller.signal, collectProtectedHdInput)
          .then((sealed) => { result = sealed })
          .catch((error: unknown) => {
            if (isWebAuthnCancellationError(error) || (error instanceof Error && ["operation-cancelled", "passkey-cancelled"].includes(error.message))) {
              throw new RpcError("authorization_cancelled", "protected HD operation cancelled", true)
            }
            throw error
          })
          .finally(() => { clearTimeout(timer); window.removeEventListener("pagehide", abortOnUnload) })
        complete(operation, () => {
          if (controller.signal.aborted) throw operationAbortReason(controller.signal)
          hdRemainingMs(request)
          if (!result) throw new RpcError("authorization_result_invalid", "protected HD result is missing")
          return result
        })
        return
      }
      if (request.kind !== "signing-policy-downgrade") {
        fail(new RpcError("authorization_request_invalid", "authorization request kind is invalid"))
        return
      }
      try {
        policyRemainingMs(request.context)
      } catch (error) {
        fail(error)
        return
      }
      let assertion: SerializedCredential | undefined
      const card = policyAuthorizationCard(request.context)
      complete(
        confirmOperationInActiveSlot(
          card,
          controller.signal,
          (target) =>
            monitorConfirmSurface({
              uiShowPending: hasPendingUiShow,
              visibilityTarget: target,
              requireParentSurface: true,
            }),
          async () => {
            policyRemainingMs(request.context)
            assertion = await requestPolicyAssertion(request.context, controller.signal)
          },
        ),
        () => {
          if (!assertion) throw new RpcError("authorization_result_invalid", "policy assertion is missing")
          return { kind: "assertion", assertion }
        },
      )
      return
    }

    let result: TopLevelAuthorizationResult = { kind: "confirmed" }
    const activate = async (): Promise<void> => {
      if (request.passkey === "none") return
      if (request.passkey === "uv") {
        if (!request.prompt.challenge) throw new RpcError("invalid_payload", "authorization challenge is missing")
        await confirmPasskeyUvWithAbort({
          wrapMeta: request.wrapMeta,
          challenge: request.prompt.challenge,
          abortSignals: [controller.signal],
        })
        return
      }
      const assertion = await assertPasskeyPrf(passkeyPrfSaltEntries(request.wrapMeta), rpId(), controller.signal)
      result = {
        kind: "unlock",
        prfOutput: bytesToBase64(assertion.prfOutput),
        prfSalt: bytesToBase64(assertion.prfSalt),
      }
      assertion.prfOutput.fill(0)
    }

    complete(confirmOperationInActiveSlot(authorizationCard(request.prompt), controller.signal, undefined, activate), () => result)
  }
  const onMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) return
    const message = event.data as AuthorizationChannelMessage | undefined
    if (!message || message.type !== "authorization-request" || message.id !== id || !sameBuild(message.build)) return
    const source = requesterCandidates().find((candidate) => candidate === event.source)
    if (!source) return
    requester = source
    try {
      start(decodeAuthorizationRequest(message.request))
    } catch (error) {
      const failure = rpcFailure(error, "authorization_request_invalid")
      reply({
        type: "authorization-error", build: BUILD,
        id,
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
      })
    }
  }
  window.addEventListener("message", onMessage)
  postReady()
  readyTimer = setInterval(postReady, 500)
}

// A direct visit to this origin explains what it is. The setup and authorization
// windows render their own content, and an embedded frame shows no chrome.
function introTopLevelView(): void {
  if (window.self !== window.top || ceremonyParameters().has("mode")) return
  const body = document.querySelector<HTMLElement>("#page .body")
  if (body) setElementText(body, "sandbox.intro")
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
  const policy = handshakePolicyPinned
    ? currentVaultSessionPolicy()
    : setVaultSessionPolicy(p.policy === undefined ? undefined : parseVaultSessionPolicy(p.policy))
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
server.register("sealHdWallet", handleSealHdWallet)
server.register("reveal", handleReveal)
server.register("sign", handleSign)
server.register("approveRelease", handleApproveRelease)
server.register("deleteAuthzAssertion", handleDeleteAuthzAssertion)
server.register("authorizeSigningPolicyDowngrade", handleAuthorizeSigningPolicyDowngrade)

setVaultStateEventSink((event) => server.emit("vault.state", event))
setUiEventSink((event) => server.emit(event))

await requireReleaseReady()
server.start()

window.addEventListener("pagehide", clearVaultOnUnload)

setupTopLevelView()
authorizationTopLevelView()
introTopLevelView()

// When embedded in an iframe we are a headless crypto worker: drop all chrome
// so the parent app's UI shows through. Only a top-level view (direct visit or
// the setup ceremony window) renders the branded card.
if (window.self !== window.top) {
  document.body.classList.add("embedded")
}
