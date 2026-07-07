import "./style.css"
import { RpcServer, RpcError, BUILD, CHANNEL, VERSION } from "./rpc"
import {
  buildWrapMeta,
  newPasskeyPrfSalt,
  newVmk,
  openProtected,
  openRootMetadata,
  passkeyPrfSaltEntries,
  packProtectedRecord,
  protectRootMetadata,
  releaseProtectedDek,
  sealProtected,
  signProtectedDigest,
  unwrapVmk,
  unpackProtectedRecord,
  verifyDaemonBindingSignature,
  withRootMetadata,
  withWrapMetaMetadata,
  type AvaultPublicKey,
  type BlindBox,
  type ProtectedDekDeliveryBlindBoxContext,
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
  vaultStatus,
  withUnlockedVmk,
} from "./vaultLifecycle"
import {
  assertPasskeyPrf,
  confirmWithPasskeyUv,
  createPasskeyCredential,
  produceAssertionCredential,
  rpId,
  type AuthzRegistration,
} from "./webauthn"
import { confirmOperation, presentPlaintext, promptSealInput } from "./operationUi"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"

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

type SealRequest = {
  name: string
  kind: "static" | "keypair"
  inputMode: "sandbox-entry"
  wrapMeta?: string
  rootMetadata?: VaultRootMetadata
}

type UnsealRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  mode: "sandbox-display" | "sandbox-copy"
}

type SignRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  scheme: SignatureScheme
  signingContext: VerifiableSigningContext
}

type DaemonSignedAgentBinding = {
  challengeId: string
  requestId: string
  grantId: string
  agent: {
    publicKey: AvaultPublicKey
    fingerprint: string
  }
  context: ProtectedDekDeliveryBlindBoxContext
  expiresAt: string
  signature: {
    alg: "ed25519"
    keyId: string
    value: string
  }
}

type ReleaseDekRequest = {
  material: { name: string; envelope: ProtectedRecordEnvelope }
  agentBinding: DaemonSignedAgentBinding
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
  | { type: "setup-ready"; id: string }
  | { type: "setup-options"; id: string; request: SetupRequest }
  | { type: "setup-created"; id: string; result: TopLevelSetupResult }
  | { type: "setup-error"; id: string; code: string; message?: string; retryable?: boolean }

const SETUP_CHANNEL_PREFIX = "avibe-vault-setup:v1:"
const SETUP_WINDOW_TIMEOUT_MS = 5 * 60 * 1000

const server = new RpcServer()

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
  return {
    vaultUserHandle: requiredString(record.vaultUserHandle, "vaultUserHandle"),
    displayName: requiredString(record.displayName, "displayName"),
    existingProtectedVault: Boolean(record.existingProtectedVault),
    authzCreationOptions: record.authzCreationOptions,
    ...(record.rootMetadata !== undefined ? { rootMetadata: record.rootMetadata as VaultRootMetadata } : {}),
  }
}

function unlockRequest(payload: unknown): UnlockRequest {
  const record = asRecord(payload)
  return { wrapMeta: requiredString(record.wrapMeta, "wrapMeta") }
}

function sealRequest(payload: unknown): SealRequest {
  const record = asRecord(payload)
  const kind = record.kind === "keypair" ? "keypair" : record.kind === "static" ? "static" : null
  if (!kind) throw new RpcError("invalid_payload", "kind must be static or keypair")
  if (record.inputMode !== "sandbox-entry") throw new RpcError("invalid_payload", "seal requires sandbox-entry input")
  return {
    name: requiredString(record.name, "name"),
    kind,
    inputMode: "sandbox-entry",
    wrapMeta: optionalString(record.wrapMeta, "wrapMeta"),
    ...(record.rootMetadata !== undefined ? { rootMetadata: record.rootMetadata as VaultRootMetadata } : {}),
  }
}

function unsealRequest(payload: unknown): UnsealRequest {
  const record = asRecord(payload)
  if (record.mode !== "sandbox-display" && record.mode !== "sandbox-copy") {
    throw new RpcError("invalid_payload", "unseal mode must be sandbox-display or sandbox-copy")
  }
  return { material: protectedMaterial(record.material), mode: record.mode }
}

function signRequest(payload: unknown): SignRequest {
  const record = asRecord(payload)
  const scheme = requiredString(record.scheme, "scheme") as SignatureScheme
  return {
    material: protectedMaterial(record.material),
    scheme,
    signingContext: requiredRecord(record.signingContext, "signingContext") as unknown as VerifiableSigningContext,
  }
}

function releaseDekRequest(payload: unknown): ReleaseDekRequest {
  const record = asRecord(payload)
  return {
    material: protectedMaterial(record.material),
    agentBinding: requiredRecord(record.agentBinding, "agentBinding") as unknown as DaemonSignedAgentBinding,
  }
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

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function bindingSigningMessage(binding: DaemonSignedAgentBinding): string {
  const { signature: _signature, ...unsigned } = binding
  return stableJson(unsigned)
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
}

async function confirmSensitiveOperation(input: {
  title: string
  subtitle: string
  body: string
  wrapMeta: string
  challenge: Uint8Array
  label: string
}): Promise<void> {
  await confirmOperation({ title: input.title, subtitle: input.subtitle, body: input.body, confirmLabel: input.label })
  await confirmWithPasskeyUv(passkeyPrfSaltEntries(input.wrapMeta), rpId(), input.challenge)
}

function rpcFailure(error: unknown, fallbackCode: string): RpcError {
  if (error instanceof RpcError) return error
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
    default:
      return new RpcError(fallbackCode, message)
  }
}

function setupWindowUrl(id: string): string {
  const url = new URL(window.location.href)
  url.search = ""
  url.hash = ""
  url.searchParams.set("mode", "setup")
  url.searchParams.set("id", id)
  return url.toString()
}

function validateTopLevelSetupResult(result: unknown): TopLevelSetupResult {
  const record = asRecord(result)
  return {
    credentialId: requiredString(record.credentialId, "credentialId"),
    ...(record.authzRegistration !== undefined ? { authzRegistration: record.authzRegistration as AuthzRegistration } : {}),
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

  if (typeof BroadcastChannel === "undefined") {
    throw new RpcError("broadcast_channel_unavailable", "setup requires same-origin BroadcastChannel")
  }

  const id = randomId()
  const channel = new BroadcastChannel(`${SETUP_CHANNEL_PREFIX}${id}`)
  let popup: Window | null = null

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      clearInterval(closedId)
      channel.close()
      callback()
    }

    const timeoutId = setTimeout(() => {
      finish(() => reject(new RpcError("setup_window_timeout", "setup window timed out", true)))
    }, SETUP_WINDOW_TIMEOUT_MS)

    const closedId = setInterval(() => {
      if (popup?.closed) {
        finish(() => reject(new RpcError("setup_window_closed", "setup window was closed", true)))
      }
    }, 500)

    channel.onmessage = (event: MessageEvent<SetupChannelMessage>) => {
      const message = event.data
      if (!message || message.id !== id) return
      if (message.type === "setup-ready") {
        channel.postMessage({ type: "setup-options", id, request } satisfies SetupChannelMessage)
      } else if (message.type === "setup-created") {
        finish(() => resolve(validateTopLevelSetupResult(message.result)))
      } else if (message.type === "setup-error") {
        finish(() => reject(new RpcError(message.code, message.message, Boolean(message.retryable))))
      }
    }

    popup = window.open(setupWindowUrl(id), "avibe-vault-setup", "popup,width=440,height=620")
    if (!popup) {
      finish(() => reject(new RpcError("setup_popup_blocked", "setup window was blocked", true)))
      return
    }
    popup.focus()
  })
}

async function handleSetup(payload: unknown) {
  const request = setupRequest(payload)
  try {
    const currentRpId = rpId()
    const topLevel = await requestTopLevelCredentialCreation(request)
    const prfSalt = newPasskeyPrfSalt()
    let prfOutput: Uint8Array | undefined
    let vmk: Uint8Array | undefined
    try {
      const assertion = await assertPasskeyPrf([{ credentialId: topLevel.credentialId, prfSalt }], currentRpId)
      prfOutput = assertion.prfOutput
      vmk = newVmk()
      const baseWrapMeta = await buildWrapMeta(vmk, [
        { kind: "passkey", prfOutput, prfSalt, credentialId: topLevel.credentialId },
      ])
      let wrapMeta = withWrapMetaMetadata(baseWrapMeta, {
        rpId: currentRpId,
        vaultUserHandle: request.vaultUserHandle,
      })
      if (request.rootMetadata) {
        wrapMeta = withRootMetadata(wrapMeta, await protectRootMetadata(vmk, request.rootMetadata))
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
        credentialId: topLevel.credentialId,
        state: unlocked.state,
        expiresAt: unlocked.expiresAt,
        ...(topLevel.authzRegistration ? { authzRegistration: topLevel.authzRegistration } : {}),
      }
    } finally {
      prfOutput?.fill(0)
      prfSalt.fill(0)
      vmk?.fill(0)
    }
  } catch (error) {
    throw rpcFailure(error, "setup_failed")
  }
}

async function handleUnlock(payload: unknown) {
  const request = unlockRequest(payload)
  try {
    const currentRpId = rpId()
    const remembered = rememberWrapMeta(request.wrapMeta)
    const entries = passkeyPrfSaltEntries(remembered.wrapMeta)
    const { prfOutput, prfSalt } = await assertPasskeyPrf(entries, currentRpId)
    let vmk: Uint8Array | undefined
    try {
      vmk = await unwrapVmk(remembered.wrapMeta, { kind: "passkey", prfOutput, prfSalt })
      const unlocked = commitUnlockedVmk({
        vmk,
        wrapMeta: remembered.wrapMeta,
        freshSetup: false,
        scopeId: remembered.scopeId,
      })
      vmk = undefined
      return { state: unlocked.state, rpId: currentRpId, expiresAt: unlocked.expiresAt }
    } finally {
      prfOutput.fill(0)
      vmk?.fill(0)
    }
  } catch (error) {
    throw rpcFailure(error, "unlock_failed")
  }
}

async function handleSeal(payload: unknown) {
  const request = sealRequest(payload)
  if (request.wrapMeta) rememberWrapMeta(request.wrapMeta)
  try {
    const input = await promptSealInput({ name: request.name, kind: request.kind })
    let secretBytes: Uint8Array | undefined = input.value
    try {
      return await withUnlockedVmk(async (vmk, wrapMeta) => {
        let effectiveWrapMeta = wrapMeta
        if (request.rootMetadata) {
          effectiveWrapMeta = withRootMetadata(effectiveWrapMeta, await protectRootMetadata(vmk, request.rootMetadata))
        }
        const sealed = await sealProtected(secretBytes as Uint8Array, vmk, { name: request.name })
        const envelope = packProtectedRecord(sealed, effectiveWrapMeta)
        return {
          envelope,
          establishingVmk: currentFreshSetup(),
          ...(input.kind === "keypair" ? { publicKey: input.publicKey, addresses: input.addresses } : {}),
        }
      })
    } finally {
      secretBytes?.fill(0)
      secretBytes = undefined
    }
  } catch (error) {
    throw rpcFailure(error, "seal_failed")
  }
}

async function handleUnseal(payload: unknown) {
  const request = unsealRequest(payload)
  try {
    return await withUnlockedVmk(async (vmk, wrapMeta) => {
      const challenge = await sha256Bytes(`unseal:${request.material.name}:${request.mode}`)
      await confirmSensitiveOperation({
        title: request.mode === "sandbox-copy" ? "Copy protected value" : "Show protected value",
        subtitle: request.material.name,
        body: "Confirm in this sandbox, then complete the passkey prompt. The plaintext will not be returned to Avibe.",
        wrapMeta,
        challenge,
        label: "Continue",
      })
      const { sealed } = unpackProtectedRecord(request.material.envelope)
      const plaintext = await openProtected(sealed, vmk, { name: request.material.name })
      try {
        await presentPlaintext({ name: request.material.name, plaintext, mode: request.mode })
      } finally {
        plaintext.fill(0)
      }
      return { completed: true }
    })
  } catch (error) {
    throw rpcFailure(error, "unseal_failed")
  }
}

async function handleSign(payload: unknown) {
  const request = signRequest(payload)
  try {
    const verified = verifySigningContext(request.signingContext)
    return await withUnlockedVmk(async (vmk, wrapMeta) => {
      await confirmSensitiveOperation({
        title: "Sign protected operation",
        subtitle: request.material.name,
        body: verified.display,
        wrapMeta,
        challenge: verified.challenge,
        label: "Confirm sign",
      })
      const { sealed } = unpackProtectedRecord(request.material.envelope)
      return signProtectedDigest(sealed, vmk, { name: request.material.name }, verified.digest, request.scheme)
    })
  } catch (error) {
    throw rpcFailure(error, "sign_failed")
  }
}

function assertAgentBinding(binding: DaemonSignedAgentBinding): void {
  if (binding.signature?.alg !== "ed25519") throw new Error("unsupported daemon binding signature")
  if (!binding.agent?.publicKey?.public_key || !binding.agent.fingerprint) throw new Error("agent public key binding is incomplete")
  if (binding.agent.publicKey.fingerprint && binding.agent.publicKey.fingerprint !== binding.agent.fingerprint) {
    throw new Error("agent public key fingerprint mismatch")
  }
  binding.agent.publicKey.fingerprint = binding.agent.fingerprint
  if (binding.context?.purpose !== "agent-deliver") throw new Error("releaseDEK only supports agent delivery")
  if (binding.context.grantId !== binding.grantId) throw new Error("agent binding grant id mismatch")
  const expires = Date.parse(binding.expiresAt)
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error("agent binding is expired")
}

async function handleReleaseDek(payload: unknown): Promise<BlindBox> {
  const request = releaseDekRequest(payload)
  try {
    assertAgentBinding(request.agentBinding)
    return await withUnlockedVmk(async (vmk, wrapMeta) => {
      const { sealed, vmkWrapMeta } = unpackProtectedRecord(request.material.envelope)
      const rootMetadata = await openRootMetadata(vmkWrapMeta, vmk)
      const signingMessage = bindingSigningMessage(request.agentBinding)
      const verified = verifyDaemonBindingSignature({
        rootMetadata,
        keyId: request.agentBinding.signature.keyId,
        signature: request.agentBinding.signature.value,
        message: signingMessage,
      })
      if (!verified) throw new Error("daemon agent binding signature is invalid")
      await confirmSensitiveOperation({
        title: "Release protected access",
        subtitle: request.material.name,
        body: `Grant ${request.agentBinding.grantId}\nRequest ${request.agentBinding.requestId}\nExpires ${request.agentBinding.expiresAt}`,
        wrapMeta,
        challenge: await sha256Bytes(signingMessage),
        label: "Confirm release",
      })
      return releaseProtectedDek(
        sealed,
        vmk,
        request.agentBinding.agent.publicKey,
        { name: request.material.name },
        request.agentBinding.context,
      )
    })
  } catch (error) {
    throw rpcFailure(error, "release_dek_failed")
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
  const id = params.get("id")
  const page = document.getElementById("page")
  const card = page?.querySelector(".card")
  const title = page?.querySelector("h1")
  const subtitle = page?.querySelector(".sub")
  const body = page?.querySelector(".body")
  if (!id || !card || !title || !subtitle || !body) return

  document.body.classList.add("setup-mode")
  title.textContent = "Create vault passkey"
  subtitle.textContent = "Protected vault setup"
  body.textContent = "Confirm to create a resident passkey on this sandbox origin. Your vault key stays in this browser."

  const button = document.createElement("button")
  button.type = "button"
  button.className = "action"
  button.textContent = "Create passkey"
  button.disabled = true

  const status = document.createElement("p")
  status.className = "setup-status"
  status.textContent = "Waiting for Avibe..."

  const origin = document.getElementById("origin")
  card.insertBefore(button, origin)
  card.insertBefore(status, origin)

  if (typeof BroadcastChannel === "undefined") {
    status.textContent = "This browser cannot open the sandbox setup channel."
    return
  }

  const channel = new BroadcastChannel(`${SETUP_CHANNEL_PREFIX}${id}`)
  let request: SetupRequest | null = null
  let readyTimer: ReturnType<typeof setInterval> | null = null

  const postReady = (): void => {
    channel.postMessage({ type: "setup-ready", id } satisfies SetupChannelMessage)
  }

  readyTimer = setInterval(postReady, 500)
  postReady()

  channel.onmessage = (event: MessageEvent<SetupChannelMessage>) => {
    const message = event.data
    if (message?.type !== "setup-options" || message.id !== id) return
    request = message.request
    button.disabled = false
    status.textContent = "Ready on this origin."
    if (readyTimer) {
      clearInterval(readyTimer)
      readyTimer = null
    }
  }

  button.addEventListener("click", () => {
    if (!request) return
    button.disabled = true
    status.textContent = "Follow your browser passkey prompt..."
    void createPasskeyCredential({
      rpId: rpId(),
      vaultUserHandle: request.vaultUserHandle,
      displayName: request.displayName,
      authzCreationOptions: request.authzCreationOptions,
    })
      .then((result) => {
        channel.postMessage({ type: "setup-created", id, result } satisfies SetupChannelMessage)
        status.textContent = "Passkey created."
        setTimeout(() => window.close(), 250)
      })
      .catch((error: unknown) => {
        const failure = rpcFailure(error, "setup_create_failed")
        channel.postMessage({
          type: "setup-error",
          id,
          code: failure.code,
          message: failure.message,
          retryable: failure.retryable,
        } satisfies SetupChannelMessage)
        button.disabled = false
        status.textContent = failure.message
      })
  })
}

// handshake — the parent confirms our build + pins the session. We echo the
// build hash so the parent can compare it against its locally-pinned manifest
// (defence-in-depth; the parent's fetch-and-hash check is the primary proof).
server.register("handshake", (payload) => {
  const p = (payload ?? {}) as Record<string, unknown>
  const expected = typeof p.expectedBuildHash === "string" ? p.expectedBuildHash : null
  if (expected !== null && expected !== BUILD.buildHash) {
    throw new RpcError("build_hash_mismatch", "sandbox build hash does not match parent expectation")
  }
  return {
    accepted: true,
    channel: CHANNEL,
    version: VERSION,
    sandboxOrigin: window.location.origin,
    build: BUILD,
  }
})

server.register("status", (payload) => {
  const request = statusRequest(payload)
  try {
    return vaultStatus(request.wrapMeta)
  } catch (error) {
    throw rpcFailure(error, "invalid_wrap_meta")
  }
})
server.register("setup", handleSetup)
server.register("unlock", handleUnlock)
server.register("lock", () => lockVault({ broadcast: true }))
server.register("seal", handleSeal)
server.register("unseal", handleUnseal)
server.register("sign", handleSign)
server.register("releaseDEK", handleReleaseDek)
server.register("deleteAuthzAssertion", handleDeleteAuthzAssertion)

server.start()

window.addEventListener("pagehide", clearVaultOnUnload)

setupTopLevelView()

// When embedded in an iframe we are a headless crypto worker: drop all chrome
// so the parent app's UI shows through. Only a top-level view (direct visit or
// the setup ceremony window) renders the branded card.
if (window.self !== window.top) {
  document.body.classList.add("embedded")
}
const originEl = document.getElementById("origin")
if (originEl) originEl.textContent = window.location.host
