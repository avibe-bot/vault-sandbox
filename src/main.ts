import "./style.css"
import { RpcServer, RpcError, BUILD, CHANNEL, VERSION, type SandboxOperation } from "./rpc"
import {
  buildWrapMeta,
  newPasskeyPrfSalt,
  newVmk,
  passkeyPrfSaltEntries,
  unwrapVmk,
  withWrapMetaMetadata,
} from "./vaultCrypto"
import {
  clearVaultOnUnload,
  commitUnlockedVmk,
  lockVault,
  rememberWrapMeta,
  scopeIdFromVaultUserHandle,
  vaultStatus,
} from "./vaultLifecycle"
import {
  assertPasskeyPrf,
  createPasskeyCredential,
  rpId,
  type AuthzRegistration,
} from "./webauthn"

type StatusRequest = {
  wrapMeta?: string
}

type SetupRequest = {
  vaultUserHandle: string
  displayName: string
  existingProtectedVault: boolean
  authzCreationOptions?: unknown
}

type UnlockRequest = {
  wrapMeta: string
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
  }
}

function unlockRequest(payload: unknown): UnlockRequest {
  const record = asRecord(payload)
  return { wrapMeta: requiredString(record.wrapMeta, "wrapMeta") }
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
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
      const wrapMeta = withWrapMetaMetadata(baseWrapMeta, {
        rpId: currentRpId,
        vaultUserHandle: request.vaultUserHandle,
      })
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

const NOT_IMPLEMENTED: SandboxOperation[] = ["seal", "unseal", "sign", "releaseDEK", "deleteAuthzAssertion"]
for (const op of NOT_IMPLEMENTED) {
  server.register(op, () => {
    throw new RpcError("not_implemented", `${op} is not available yet in this sandbox build`)
  })
}

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
