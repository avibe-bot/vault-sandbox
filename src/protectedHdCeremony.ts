import { exactHdFields, hdObject, type HdPublicRow } from "./protectedHd"
import { parseSealedHdWallet, sealHdWalletLocally, validateHdBaseRoot, type SealedHdWallet } from "./protectedHdCustody"
import { assertPasskeyPrf, rpId } from "./webauthn"
import { passkeyPrfSaltEntries, unwrapVmk } from "./vaultCrypto"
import { stableJson } from "./operationContext"
import { RpcError } from "./rpc"

export const HD_OPERATION_MS = 300_000
export type HdSealRequest = { name: string; mode: "create" | "import"; wrapMeta: string }
export type HdAuthorizationRequest = HdSealRequest & { kind: "protected-hd-wallet"; deadlineAt: number }
export type HdAuthorizationResult = SealedHdWallet & { kind: "sealed-hd-wallet" }
/** Popup-local only. This type must NEVER become a channel or ordinary RPC field. */
export type HdConfirmedInput = { words: string; passphrase: string; reviewedAccounts: HdPublicRow[] }
/** The UI must call this synchronously from its final click so WebAuthn keeps the user activation. */
export type HdFinalize = (input: HdConfirmedInput) => Promise<void>
export type CollectHdInput = (request: HdAuthorizationRequest, signal: AbortSignal, finalize: HdFinalize) => Promise<void>

export function parseHdSealRequest(payload: unknown): HdSealRequest {
  try {
    const request = hdObject(payload)
    exactHdFields(request, ["name", "mode", "wrapMeta"])
    if (typeof request.name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(request.name)
      || (request.mode !== "create" && request.mode !== "import")) throw new Error("invalid protected HD name/mode")
    return { name: request.name, mode: request.mode, wrapMeta: validateHdBaseRoot(request.wrapMeta) }
  } catch {
    throw new RpcError("invalid_payload", "sealHdWallet requires only name, create/import mode and an existing base root")
  }
}
export function hdRemainingMs(request: HdAuthorizationRequest): number {
  const remaining = request.deadlineAt - Date.now()
  if (!Number.isSafeInteger(request.deadlineAt) || remaining <= 0 || remaining > HD_OPERATION_MS) throw new RpcError("authorization_window_timeout", "protected HD window expired", true)
  return remaining
}
export function parseHdAuthorizationRequest(payload: unknown): HdAuthorizationRequest {
  const input = hdObject(payload)
  exactHdFields(input, ["kind", "name", "mode", "wrapMeta", "deadlineAt"])
  if (input.kind !== "protected-hd-wallet" || typeof input.deadlineAt !== "number") throw new RpcError("invalid_payload", "invalid protected HD window request")
  const base = parseHdSealRequest({ name: input.name, mode: input.mode, wrapMeta: input.wrapMeta })
  const request = { ...base, kind: "protected-hd-wallet" as const, deadlineAt: input.deadlineAt }
  hdRemainingMs(request)
  return Object.freeze(request)
}
export function parseHdAuthorizationResult(value: unknown, request: HdAuthorizationRequest): HdAuthorizationResult {
  const input = hdObject(value)
  exactHdFields(input, ["kind", "envelope", "accounts", "expectedAccount0"])
  if (input.kind !== "sealed-hd-wallet") throw new RpcError("authorization_result_invalid", "protected HD result kind is invalid")
  hdRemainingMs(request)
  return { kind: "sealed-hd-wallet", ...parseSealedHdWallet({ envelope: input.envelope, accounts: input.accounts, expectedAccount0: input.expectedAccount0 }, request.name, request.wrapMeta) }
}

/** Entire secret flow stays in this top-level popup, including late PRF/unwrap. */
export async function runHdPopupCeremony(request: HdAuthorizationRequest, signal: AbortSignal, collect: CollectHdInput): Promise<HdAuthorizationResult> {
  // UI cancellation must abort custody too, even after the final click. Await
  // any outstanding WebCrypto work before returning an error so no late-owned
  // VMK/payload buffers outlive this ceremony's cleanup.
  const controller = new AbortController()
  const cancelled = (): Error => signal.reason instanceof Error ? signal.reason : new RpcError("authorization_cancelled", "protected HD operation cancelled", true)
  const abort = (): void => controller.abort(cancelled())
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  const assertCurrent = (): void => {
    if (controller.signal.aborted) throw controller.signal.reason
    hdRemainingMs(request)
  }
  let result: HdAuthorizationResult | undefined
  let pendingFinalize: Promise<void> | undefined
  const finalize: HdFinalize = (final) => {
    if (pendingFinalize) return Promise.reject(new RpcError("authorization_result_invalid", "protected HD wallet is already being sealed"))
    // Calling the async body directly (not in a .then) keeps the PRF request in
    // the final button's activation stack.
    pendingFinalize = (async () => {
      let prfOutput: Uint8Array | undefined
      let prfSalt: Uint8Array | undefined
      let vmk: Uint8Array | undefined
      let entries: ReturnType<typeof passkeyPrfSaltEntries> = []
      try {
        assertCurrent()
        entries = passkeyPrfSaltEntries(request.wrapMeta)
        const assertion = await assertPasskeyPrf(entries, rpId(), controller.signal)
        prfOutput = assertion.prfOutput
        prfSalt = assertion.prfSalt
        assertCurrent()
        vmk = await unwrapVmk(request.wrapMeta, { kind: "passkey", prfOutput, prfSalt })
        assertCurrent()
        const sealed = await sealHdWalletLocally({ name: request.name, words: final.words, passphrase: final.passphrase, vmk, wrapMeta: request.wrapMeta, assertCurrent })
        assertCurrent()
        if (stableJson(sealed.accounts) !== stableJson(final.reviewedAccounts)) throw new RpcError("authorization_result_invalid", "protected HD reviewed account table changed")
        result = parseHdAuthorizationResult({ kind: "sealed-hd-wallet", ...sealed }, request)
      } finally {
        prfOutput?.fill(0)
        prfSalt?.fill(0)
        vmk?.fill(0)
        entries.forEach((entry) => entry.prfSalt.fill(0))
        final.words = ""
        final.passphrase = ""
        final.reviewedAccounts = []
      }
    })()
    return pendingFinalize
  }
  try {
    assertCurrent()
    await collect(request, controller.signal, finalize)
    if (pendingFinalize) await pendingFinalize
    assertCurrent()
    if (!result) throw new RpcError("authorization_result_invalid", "protected HD wallet was not sealed")
    return parseHdAuthorizationResult(result, request)
  } catch (error) {
    controller.abort(error)
    if (pendingFinalize) await pendingFinalize.catch(() => undefined)
    throw error
  } finally {
    signal.removeEventListener("abort", abort)
  }
}
