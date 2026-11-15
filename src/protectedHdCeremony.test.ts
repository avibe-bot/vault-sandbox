import { beforeEach, describe, expect, it, vi } from "vitest"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { buildWrapMeta, unwrapVmk } from "./vaultCrypto"
import { deriveHdAccounts, hdPayloadFromWords, wipeHdPayload } from "./protectedHd"
import { runHdPopupCeremony, HD_OPERATION_MS, hdRemainingMs, type HdAuthorizationRequest, type HdConfirmedInput } from "./protectedHdCeremony"

const mockAssertPasskeyPrf = vi.hoisted(() => vi.fn())
vi.mock("./webauthn", async () => {
  const actual = await vi.importActual<typeof import("./webauthn")>("./webauthn")
  return { ...actual, assertPasskeyPrf: mockAssertPasskeyPrf, rpId: () => "sandbox.avibe.bot" }
})

const vector = vectors.cases[0]
const vmkBytes = () => new Uint8Array(32).fill(0x44)
const prfOutputBytes = () => new Uint8Array(32).fill(0x22)
const prfSaltBytes = () => new Uint8Array(32).fill(0x33)

async function rootWrap(): Promise<{ vmk: Uint8Array; wrapMeta: string }> {
  const vmk = vmkBytes()
  const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: prfOutputBytes(), prfSalt: prfSaltBytes() }])
  return { vmk, wrapMeta }
}

function request(wrapMeta: string, deadlineAt = Date.now() + HD_OPERATION_MS): HdAuthorizationRequest {
  return { kind: "protected-hd-wallet", name: "PUBLIC_HD", mode: "import", wrapMeta, deadlineAt }
}

function confirmedInput(): HdConfirmedInput {
  const payload = hdPayloadFromWords(vector.words, vector.passphrase)
  try {
    return { words: vector.words, passphrase: vector.passphrase, reviewedAccounts: deriveHdAccounts(payload.seed) }
  } finally {
    wipeHdPayload(payload)
  }
}

beforeEach(() => {
  mockAssertPasskeyPrf.mockReset()
  mockAssertPasskeyPrf.mockImplementation(async () => ({ prfOutput: prfOutputBytes(), prfSalt: prfSaltBytes() }))
})

describe("protected HD popup ceremony", () => {
  it("starts the late PRF from the final callback and seals/reopens only public result material", async () => {
    const root = await rootWrap()
    const input = confirmedInput()
    const original = { words: input.words, passphrase: input.passphrase, reviewedAccounts: structuredClone(input.reviewedAccounts) }
    let collected = false
    try {
      const result = await runHdPopupCeremony(request(root.wrapMeta), new AbortController().signal, async (_request, _signal, finalize) => {
        collected = true
        await finalize(input)
      })
      expect(collected).toBe(true)
      expect(mockAssertPasskeyPrf).toHaveBeenCalledTimes(1)
      expect(input).toEqual({ words: "", passphrase: "", reviewedAccounts: [] })
      expect(result.kind).toBe("sealed-hd-wallet")
      expect(result.accounts).toEqual(original.reviewedAccounts)
      if (vector.passphrase) expect(result.envelope.wrap_meta).not.toContain(vector.passphrase)
      expect(result.expectedAccount0).toEqual(vector.expected_account0)
      const reopened = await unwrapVmk(result.envelope.wrap_meta, { kind: "passkey", prfOutput: prfOutputBytes(), prfSalt: prfSaltBytes() })
      reopened.fill(0)
    } finally {
      root.vmk.fill(0)
    }
  })

  it("wipes the callback input and refuses a late success when the passkey stage aborts", async () => {
    const root = await rootWrap()
    const input = confirmedInput()
    const controller = new AbortController()
    mockAssertPasskeyPrf.mockImplementation((_entries: unknown, _rp: string, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("operation-cancelled")), { once: true })
    }))
    try {
      const pending = runHdPopupCeremony(request(root.wrapMeta), controller.signal, async (_request, _signal, finalize) => finalize(input))
      await vi.waitFor(() => expect(mockAssertPasskeyPrf).toHaveBeenCalledTimes(1))
      controller.abort(new Error("operation-cancelled"))
      await expect(pending).rejects.toThrow("operation-cancelled")
      expect(input).toEqual({ words: "", passphrase: "", reviewedAccounts: [] })
    } finally {
      root.vmk.fill(0)
    }
  })

  it("cancels in-flight finalization and waits for late PRF buffers to be scrubbed", async () => {
    const root = await rootWrap()
    const input = confirmedInput()
    const prfOutput = prfOutputBytes()
    const prfSalt = prfSaltBytes()
    let resolvePrf!: (value: { prfOutput: Uint8Array; prfSalt: Uint8Array }) => void
    let custodySignal: AbortSignal | undefined
    mockAssertPasskeyPrf.mockImplementation((_entries: unknown, _rp: string, signal: AbortSignal) => {
      custodySignal = signal
      return new Promise((resolve) => { resolvePrf = resolve })
    })
    const cancelled = new Error("operation-cancelled")
    let settled = false
    try {
      const pending = runHdPopupCeremony(request(root.wrapMeta), new AbortController().signal, async (_request, _signal, finalize) => {
        void finalize(input).catch(() => undefined)
        throw cancelled
      })
      const observed = pending.then(() => { settled = true }, () => { settled = true })
      await vi.waitFor(() => expect(custodySignal?.aborted).toBe(true))
      expect(settled).toBe(false)
      resolvePrf({ prfOutput, prfSalt })
      await expect(pending).rejects.toBe(cancelled)
      await observed
      expect(prfOutput).toEqual(new Uint8Array(32))
      expect(prfSalt).toEqual(new Uint8Array(32))
      expect(input).toEqual({ words: "", passphrase: "", reviewedAccounts: [] })
    } finally { root.vmk.fill(0) }
  })

  it("keeps the human flow alive past 120 seconds, the old five-minute limit, and 30 minutes", async () => {
    vi.useFakeTimers()
    const start = 10_000
    vi.setSystemTime(start)
    const root = await rootWrap()
    const input = confirmedInput()
    try {
      const result = await runHdPopupCeremony(request(root.wrapMeta), new AbortController().signal, async (_request, _signal, finalize) => {
        vi.setSystemTime(start + 120_001)
        vi.setSystemTime(start + 300_001)
        vi.setSystemTime(start + 1_800_000)
        vi.setSystemTime(start + HD_OPERATION_MS - 1)
        await finalize(input)
      })
      expect(result.kind).toBe("sealed-hd-wallet")
    } finally {
      root.vmk.fill(0)
    }
  })

  it("expires exactly at the 35-minute deadline", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const root = await rootWrap()
    try {
      const authorization = request(root.wrapMeta)
      expect(hdRemainingMs(authorization)).toBe(HD_OPERATION_MS)
      vi.setSystemTime(10_000 + HD_OPERATION_MS - 1)
      expect(hdRemainingMs(authorization)).toBe(1)
      vi.setSystemTime(10_000 + HD_OPERATION_MS)
      expect(() => hdRemainingMs(authorization)).toThrow(/expired/)
    } finally {
      root.vmk.fill(0)
    }
  })
  it("rejects an expired window before collecting any words", async () => {
    const root = await rootWrap()
    let collected = false
    try {
      await expect(runHdPopupCeremony(request(root.wrapMeta, Date.now() - 1), new AbortController().signal, async () => {
        collected = true
      })).rejects.toMatchObject({ code: "authorization_window_timeout" })
      expect(collected).toBe(false)
      expect(mockAssertPasskeyPrf).not.toHaveBeenCalled()
    } finally {
      root.vmk.fill(0)
    }
  })

  it("rejects a collector that returns without sealing", async () => {
    const root = await rootWrap()
    try {
      await expect(runHdPopupCeremony(request(root.wrapMeta), new AbortController().signal, async () => undefined)).rejects.toMatchObject({
        code: "authorization_result_invalid",
      })
    } finally {
      root.vmk.fill(0)
    }
  })
})
