import { afterEach, describe, expect, it, vi } from "vitest"
import { unlockVmkFromPasskeyPrf, unlockVmkFromPasskeyPrfAssertion } from "./approvalUnlock"
import { buildWrapMeta } from "./vaultCrypto"
import {
  beginVaultOperationSnapshot, commitUnlockedVmk, currentFreshSetup, currentWrapMeta, lockVault, rememberWrapMeta,
  resetVaultSessionForTests, scopeIdFromWrapMeta, setVaultStateEventSink, vaultStatus, withUnlockedVmk,
} from "./vaultLifecycle"

// Invariant: a held VMK always belongs to the remembered root. All keys and
// wrap_meta values are public synthetic test data.
type StateEvent = Parameters<NonNullable<Parameters<typeof setVaultStateEventSink>[0]>>[0]
const policy = { strictApprovals: false, windowSeconds: 300 as const, parentValueSealAllowed: true }

async function root(fill: number) {
  const vmk = new Uint8Array(32).fill(fill)
  const prfOutput = new Uint8Array(32).fill(fill + 1)
  const prfSalt = new Uint8Array(32).fill(fill + 2)
  const wrapMeta = await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput, prfSalt }])
  return { vmk, prfOutput, prfSalt, wrapMeta }
}

function unlockedUnder(r: { vmk: Uint8Array; wrapMeta: string }, freshSetup = false): Uint8Array {
  const sessionVmk = new Uint8Array(r.vmk)
  commitUnlockedVmk({ vmk: sessionVmk, wrapMeta: r.wrapMeta, scopeId: "public-root-bound", freshSetup, policy })
  return sessionVmk
}

function stubAssertion(answer: unknown) {
  const get = vi.fn(async () => answer)
  vi.stubGlobal("navigator", { credentials: { get } })
  return get
}

function events(): StateEvent[] {
  const seen: StateEvent[] = []
  setVaultStateEventSink((event) => { seen.push(event) })
  return seen
}

afterEach(() => {
  setVaultStateEventSink(null)
  resetVaultSessionForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("rememberWrapMeta keeps the held VMK bound to the remembered root", () => {
  it("locks, wipes and aborts in-flight copies before adopting a different root", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = unlockedUnder(a)
    let heldCopy: Uint8Array | undefined
    let release!: () => void
    const inFlight = withUnlockedVmk(async (copy) => { heldCopy = copy; await new Promise<void>((resolve) => { release = resolve }) })
    await Promise.resolve()
    const seen = events()
    rememberWrapMeta(b.wrapMeta)
    release()
    await expect(inFlight).rejects.toThrow("vault-operation-aborted")
    expect(heldCopy).toEqual(new Uint8Array(32))
    expect(sessionVmk).toEqual(new Uint8Array(32))
    expect(seen).toEqual([{ state: "locked", reason: "manual-lock" }])
    expect(vaultStatus()).toEqual({ state: "locked" })
    expect(JSON.parse(currentWrapMeta()!)).toEqual(JSON.parse(b.wrapMeta))
    await expect(withUnlockedVmk(() => "forbidden")).rejects.toThrow("vault-locked")
  })

  it("does not lock for the same root, including a record-bearing projection", async () => {
    const a = await root(0x10)
    const sessionVmk = unlockedUnder(a)
    const seen = events()
    rememberWrapMeta(a.wrapMeta)
    rememberWrapMeta(JSON.stringify({ ...JSON.parse(a.wrapMeta), scheme: "machine-aesgcm-v1", wrapped_dek: "public", dek_nonce: "public", record_meta: { kind: "static" } }))
    expect(seen).toEqual([])
    expect(sessionVmk).toEqual(a.vmk)
    await expect(withUnlockedVmk((vmk) => vmk[0])).resolves.toBe(0x10)
  })

  it("keeps the locked behavior unchanged: a different root is adopted with no lock event", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    rememberWrapMeta(a.wrapMeta)
    const seen = events()
    rememberWrapMeta(b.wrapMeta)
    expect(seen).toEqual([])
    expect(vaultStatus()).toEqual({ state: "locked" })
    expect(JSON.parse(currentWrapMeta()!)).toEqual(JSON.parse(b.wrapMeta))
  })

  it("does not carry an unlocked provisional setup into a different root", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = unlockedUnder(a, true)
    const hd = beginVaultOperationSnapshot(a.wrapMeta, { surviveAutoLock: true })
    rememberWrapMeta(b.wrapMeta)
    expect(hd.signal.aborted).toBe(true)
    expect(sessionVmk).toEqual(new Uint8Array(32))
    expect(currentFreshSetup()).toBe(false)
    hd.release()
    expect(vaultStatus()).toEqual({ state: "locked" })
    expect(JSON.parse(currentWrapMeta()!)).toEqual(JSON.parse(b.wrapMeta))
  })

  it("does not broadcast the lock for a different root, so a same-scope sibling keeps its session", () => {
    const channels = new Set<MemoryChannel>()
    const posted: unknown[] = []
    class MemoryChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor(readonly name: string) { channels.add(this) }
      postMessage(data: unknown) {
        posted.push(data)
        for (const channel of [...channels]) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data })
      }
      close() { channels.delete(this) }
    }
    vi.stubGlobal("window", {})
    vi.stubGlobal("BroadcastChannel", MemoryChannel)
    // Two roots of the same vault user share one lock scope.
    const a = JSON.stringify({ v: 1, copies: [], vault_user_handle: "public-user", extension: { label: "a" } })
    const b = JSON.stringify({ v: 1, copies: [], vault_user_handle: "public-user", extension: { label: "b" } })
    const scope = scopeIdFromWrapMeta(a)
    expect(scopeIdFromWrapMeta(b)).toBe(scope)
    const sessionVmk = new Uint8Array(32).fill(0x10)
    commitUnlockedVmk({ vmk: sessionVmk, wrapMeta: a, scopeId: scope, freshSetup: false, policy })
    const sibling = new MemoryChannel(`avibe-vault-lock:v1:${scope}`)
    const siblingSaw: unknown[] = []
    sibling.onmessage = (event) => { siblingSaw.push(event.data) }
    rememberWrapMeta(b)
    expect(sessionVmk).toEqual(new Uint8Array(32))
    expect(posted).toEqual([])
    expect(siblingSaw).toEqual([])
    expect([...channels]).toEqual([sibling])
    // An explicit lock still reaches the sibling on the remembered scope.
    lockVault({ broadcast: true, reason: "manual-lock" })
    expect(siblingSaw).toEqual([{ type: "lock", scopeId: scope }])
    sibling.close()
  })

  it("leaves status reporting unchanged for a different root while unlocked", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = unlockedUnder(a)
    expect(vaultStatus(b.wrapMeta)).toMatchObject({ state: "unlocked" })
    expect(sessionVmk).toEqual(a.vmk)
    await expect(withUnlockedVmk((_vmk, wrapMeta) => JSON.parse(wrapMeta))).resolves.toEqual(JSON.parse(a.wrapMeta))
  })

  it("keeps the HD ceremony's automatic-lock survival and same-root remember intact", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const a = await root(0x10)
    unlockedUnder(a, true)
    const hd = beginVaultOperationSnapshot(a.wrapMeta, { surviveAutoLock: true })
    try {
      vi.advanceTimersByTime(300_001)
      expect(vaultStatus()).toEqual({ state: "locked" })
      rememberWrapMeta(a.wrapMeta)
      expect(hd.signal.aborted).toBe(false)
      expect(() => hd.assertCurrent()).not.toThrow()
      expect(hd.freshSetup).toBe(true)
    } finally { hd.release({ completed: true }) }
    expect(vaultStatus()).toEqual({ state: "locked" })
  })
})

describe("both unlock callers never leave another root's VMK under the new root", () => {
  it("unlockVmkFromPasskeyPrf: a cancelled assertion for a different root ends locked under that root", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = unlockedUnder(a)
    const get = stubAssertion(null)
    await expect(unlockVmkFromPasskeyPrf({ wrapMeta: b.wrapMeta, currentRpId: "sandbox.example" })).rejects.toThrow("passkey-cancelled")
    expect(get).toHaveBeenCalledOnce()
    expect(sessionVmk).toEqual(new Uint8Array(32))
    expect(vaultStatus()).toEqual({ state: "locked" })
    expect(JSON.parse(currentWrapMeta()!)).toEqual(JSON.parse(b.wrapMeta))
    await expect(withUnlockedVmk(() => "forbidden")).rejects.toThrow("vault-locked")
  })

  it("unlockVmkFromPasskeyPrf: a successful assertion for a different root commits only that root's VMK", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = unlockedUnder(a)
    stubAssertion({ rawId: new Uint8Array([1, 2, 3]).buffer, getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(b.prfOutput) } } }) })
    await expect(unlockVmkFromPasskeyPrf({ wrapMeta: b.wrapMeta, currentRpId: "sandbox.example" })).resolves.toMatchObject({ state: "unlocked" })
    expect(sessionVmk).toEqual(new Uint8Array(32))
    await expect(withUnlockedVmk((vmk, wrapMeta) => [vmk[0], JSON.parse(wrapMeta)])).resolves.toEqual([0x40, JSON.parse(b.wrapMeta)])
  })

  it("unlockVmkFromPasskeyPrfAssertion: a failed unwrap for a different root ends locked under that root", async () => {
    const a = await root(0x10)
    const b = await root(0x40)
    const sessionVmk = unlockedUnder(a)
    await expect(unlockVmkFromPasskeyPrfAssertion({
      wrapMeta: b.wrapMeta, currentRpId: "sandbox.example",
      assertion: { prfOutput: new Uint8Array(32).fill(0x99), prfSalt: new Uint8Array(b.prfSalt) },
    })).rejects.toThrow()
    expect(sessionVmk).toEqual(new Uint8Array(32))
    expect(vaultStatus()).toEqual({ state: "locked" })
    expect(JSON.parse(currentWrapMeta()!)).toEqual(JSON.parse(b.wrapMeta))
  })

  it("unlockVmkFromPasskeyPrfAssertion: a failed same-root unwrap keeps the current session unchanged", async () => {
    const a = await root(0x10)
    const sessionVmk = unlockedUnder(a)
    const seen = events()
    await expect(unlockVmkFromPasskeyPrfAssertion({
      wrapMeta: a.wrapMeta, currentRpId: "sandbox.example",
      assertion: { prfOutput: new Uint8Array(32).fill(0x99), prfSalt: new Uint8Array(a.prfSalt) },
    })).rejects.toThrow()
    expect(seen).toEqual([])
    expect(sessionVmk).toEqual(a.vmk)
    expect(vaultStatus()).toMatchObject({ state: "unlocked" })
  })
})
