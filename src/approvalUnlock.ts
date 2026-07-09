import { passkeyPrfSaltEntries, unwrapVmk } from "./vaultCrypto"
import { commitUnlockedVmk, rememberWrapMeta } from "./vaultLifecycle"
import { assertPasskeyPrf } from "./webauthn"

export type ApprovalUnlockResult = {
  state: "unlocked"
  rpId: string
  expiresAt: number
}

function abortReason(signal: AbortSignal): Error {
  const reason = (signal as AbortSignal & { reason?: unknown }).reason
  return reason instanceof Error ? reason : new Error("operation-superseded")
}

function rejectOnAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const abort = (): void => reject(abortReason(signal))
    if (signal.aborted) {
      abort()
      return
    }
    signal.addEventListener("abort", abort, { once: true })
  })
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortReason(signal)
}

export async function unlockVmkFromPasskeyPrf(input: {
  wrapMeta: string
  currentRpId: string
  abortSignal?: AbortSignal
}): Promise<ApprovalUnlockResult> {
  const remembered = rememberWrapMeta(input.wrapMeta)
  const entries = passkeyPrfSaltEntries(remembered.wrapMeta)
  let prfOutput: Uint8Array | undefined
  let vmk: Uint8Array | undefined
  try {
    const assertion = await Promise.race([
      assertPasskeyPrf(entries, input.currentRpId),
      ...(input.abortSignal ? [rejectOnAbort(input.abortSignal)] : []),
    ])
    prfOutput = assertion.prfOutput
    throwIfAborted(input.abortSignal)
    vmk = await unwrapVmk(remembered.wrapMeta, { kind: "passkey", prfOutput, prfSalt: assertion.prfSalt })
    throwIfAborted(input.abortSignal)
    const unlocked = commitUnlockedVmk({
      vmk,
      wrapMeta: remembered.wrapMeta,
      freshSetup: false,
      scopeId: remembered.scopeId,
    })
    vmk = undefined
    return { state: unlocked.state, rpId: input.currentRpId, expiresAt: unlocked.expiresAt }
  } finally {
    prfOutput?.fill(0)
    vmk?.fill(0)
  }
}
