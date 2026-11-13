import { afterEach, describe, expect, it, vi } from "vitest"
import { beginVaultOperationSnapshot, commitUnlockedVmk, currentFreshSetup, lockVault, rememberWrapMeta, resetVaultSessionForTests, scopeIdFromWrapMeta, vaultStatus, withUnlockedVmk } from "./vaultLifecycle"

const root = JSON.stringify({ v: 1, copies: [], vault_user_handle: "public-root", extension: { label: "first" } })
const changed = JSON.stringify({ v: 1, copies: [], vault_user_handle: "public-root", extension: { label: "second" } })
afterEach(() => { resetVaultSessionForTests(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe("root/epoch/generation operation snapshots", () => {
  it("tracks an initially locked root and catches false-to-false root replacement", () => {
    const snapshot = beginVaultOperationSnapshot(root)
    expect(snapshot.freshSetup).toBe(false)
    expect(currentFreshSetup()).toBe(false)
    expect(() => snapshot.assertCurrent()).not.toThrow()
    vaultStatus(changed)
    expect(currentFreshSetup()).toBe(false)
    expect(snapshot.signal.aborted).toBe(true)
    expect(() => snapshot.assertCurrent()).toThrow(/aborted/)
  })
  it("catches same-scope unknown-root-extension changes through rememberWrapMeta", () => {
    const snapshot = beginVaultOperationSnapshot(root)
    rememberWrapMeta(changed)
    expect(snapshot.signal.aborted).toBe(true)
  })
  it("ignores root serialization and record/DEK/scheme projections, not actual extensions", () => {
    const snapshot = beginVaultOperationSnapshot(root)
    vaultStatus(JSON.stringify({ scheme: "machine-aesgcm-v1", wrapped_dek: "public", dek_nonce: "public", record_meta: { kind: "static" }, extension: { label: "first" }, vault_user_handle: "public-root", copies: [], v: 1 }))
    expect(() => snapshot.assertCurrent()).not.toThrow()
    snapshot.release()
    expect(() => snapshot.assertCurrent()).toThrow(/aborted/)
  })
  it("invalidates even an already-locked manual lock, and on supersession", () => {
    const first = beginVaultOperationSnapshot(root)
    const second = beginVaultOperationSnapshot(root)
    expect(first.signal.aborted).toBe(true)
    expect(() => second.assertCurrent()).not.toThrow()
    lockVault()
    expect(second.signal.aborted).toBe(true)
  })
  it("captures true fresh setup and invalidates on unlock/commit replacement", () => {
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: true })
    const snapshot = beginVaultOperationSnapshot(root)
    expect(snapshot.freshSetup).toBe(true)
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(2), wrapMeta: root, scopeId: "public", freshSetup: false })
    expect(snapshot.signal.aborted).toBe(true)
  })
  it("invalidates an initially-unlocked create when its absolute auto-lock expires", () => {
    vi.useFakeTimers()
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false, policy: { strictApprovals: false, windowSeconds: 300, parentValueSealAllowed: true } })
    const snapshot = beginVaultOperationSnapshot(root)
    vi.advanceTimersByTime(300_001)
    expect(() => snapshot.assertCurrent()).toThrow(/aborted/)
  })
  it("keeps the shipped unlocked-session behavior while cancelling only the HD snapshot", async () => {
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false })
    const snapshot = beginVaultOperationSnapshot(root)
    expect(vaultStatus(changed).state).toBe("unlocked")
    expect(snapshot.signal.aborted).toBe(true)
    await expect(withUnlockedVmk(async (_vmk, wrapMeta) => wrapMeta)).resolves.toBe(root)
  })
  it("receives same-scope cross-frame lock while initially locked, and releases its receiver", () => {
    const channels = new Set<MemoryChannel>()
    class MemoryChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor(readonly name: string) { channels.add(this) }
      postMessage(data: unknown) {
        for (const channel of [...channels]) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data })
      }
      close() { channels.delete(this) }
    }
    vi.stubGlobal("window", {})
    vi.stubGlobal("BroadcastChannel", MemoryChannel)
    const snapshot = beginVaultOperationSnapshot(root)
    expect(channels.size).toBe(1)
    const scopeId = scopeIdFromWrapMeta(root)
    const sender = new MemoryChannel(`avibe-vault-lock:v1:${scopeId}`)
    sender.postMessage({ type: "lock", scopeId: "different-scope" })
    expect(snapshot.signal.aborted).toBe(false)
    sender.postMessage({ type: "lock", scopeId })
    expect(snapshot.signal.aborted).toBe(true)
    expect(() => snapshot.assertCurrent()).toThrow(/aborted/)
    expect(channels.size).toBe(1) // only the other frame's sender remains
    sender.close()
    const next = beginVaultOperationSnapshot(root)
    expect(channels.size).toBe(1)
    next.release()
    expect(channels.size).toBe(0)
  })

  it("keeps valid deep legacy extensions usable with no bound operation and while aborting one", () => {
    // One small historical extension, not a load/stress matrix. JSON.parse and
    // JSON.stringify already accept this shape; the new lifecycle must too.
    const deep = '{"v":1,"copies":[],"vault_user_handle":"public-root","extension":' + '{"n":'.repeat(2_500) + '0' + '}'.repeat(2_500) + '}'
    expect(() => vaultStatus(deep)).not.toThrow()
    expect(() => rememberWrapMeta(deep)).not.toThrow()
    resetVaultSessionForTests()
    const snapshot = beginVaultOperationSnapshot(root)
    expect(() => vaultStatus(deep)).not.toThrow()
    expect(snapshot.signal.aborted).toBe(true)
    expect(() => rememberWrapMeta(deep)).not.toThrow()
    snapshot.release()
  })

  it("does not let an old owner lease lock a newer same-root or changed-root session", async () => {
    let owner: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    commitUnlockedVmk({
      vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false,
      onCommitted: (snapshot) => { owner = snapshot },
    })
    expect(owner).toBeDefined()

    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(2), wrapMeta: root, scopeId: "public", freshSetup: false })
    expect(owner!.lockIfCurrent({ broadcast: true, reason: "manual-lock" })).toBe(false)
    expect(vaultStatus().state).toBe("unlocked")
    await expect(withUnlockedVmk(async (vmk) => vmk[0], { renewOnSuccess: false })).resolves.toBe(2)

    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(3), wrapMeta: root, scopeId: "public", freshSetup: false })
    const changedOwner = beginVaultOperationSnapshot(root)
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(4), wrapMeta: changed, scopeId: "public", freshSetup: false })
    expect(changedOwner.lockIfCurrent({ broadcast: true, reason: "manual-lock" })).toBe(false)
    expect(vaultStatus().state).toBe("unlocked")
    expect(changedOwner.signal.aborted).toBe(true)
    changedOwner.release()
    owner!.release()
  })

  it("lets the current owner lease lock its still-current session", () => {
    let owner: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    commitUnlockedVmk({
      vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false,
      onCommitted: (snapshot) => { owner = snapshot },
    })
    expect(owner!.lockIfCurrent({ broadcast: true, reason: "manual-lock" })).toBe(true)
    expect(owner!.signal.aborted).toBe(true)
    expect(vaultStatus().state).toBe("locked")
    owner!.release()
  })
  it("releasing an old owner lease does not close a newer unlocked receiver", () => {
    const channels = new Set<MemoryChannel>()
    class MemoryChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null
      constructor(readonly name: string) { channels.add(this) }
      postMessage(data: unknown) {
        for (const channel of [...channels]) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data })
      }
      close() { channels.delete(this) }
    }
    vi.stubGlobal("window", {})
    vi.stubGlobal("BroadcastChannel", MemoryChannel)
    let owner: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    commitUnlockedVmk({
      vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false,
      onCommitted: (snapshot) => { owner = snapshot },
    })
    expect(channels.size).toBe(1)
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(2), wrapMeta: root, scopeId: "public", freshSetup: false })
    owner!.release()
    expect(channels.size).toBe(1)
    expect(vaultStatus().state).toBe("unlocked")
  })

  it("does not let a superseded same-epoch lease lock the newer operation", async () => {
    const broadcasts: unknown[] = []
    class MemoryChannel {
      onmessage: ((event: { data: unknown }) => void) | null = null
      postMessage(data: unknown) { broadcasts.push(data) }
      close() {}
    }
    vi.stubGlobal("window", {})
    vi.stubGlobal("BroadcastChannel", MemoryChannel)
    let owner: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    commitUnlockedVmk({
      vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false,
      onCommitted: (snapshot) => { owner = snapshot },
    })
    const newer = beginVaultOperationSnapshot(root)
    expect(owner!.signal.aborted).toBe(true)
    expect(owner!.lockIfCurrent({ broadcast: true })).toBe(false)
    owner!.release()
    expect(owner!.lockIfCurrent({ broadcast: true })).toBe(false)
    expect(broadcasts).toEqual([])
    expect(() => newer.assertCurrent()).not.toThrow()
    await expect(withUnlockedVmk((vmk) => vmk[0], { renewOnSuccess: false })).resolves.toBe(1)
    newer.release()
  })

  it("does not let fatal cleanup from a superseded bound VMK copy lock the newer operation", async () => {
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false })
    let newer: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    let heldCopy: Uint8Array | undefined
    await expect(withUnlockedVmk(async (copy) => {
      heldCopy = copy
      newer = beginVaultOperationSnapshot(root)
      throw new Error("public-test-fatal-error")
    }, { expectedWrapMeta: root })).rejects.toThrow("public-test-fatal-error")
    expect(heldCopy!.every((byte) => byte === 0)).toBe(true)
    expect(vaultStatus().state).toBe("unlocked")
    expect(() => newer!.assertCurrent()).not.toThrow()
    newer!.release()
  })

  it("still locks and wipes the current bound VMK after a fatal error", async () => {
    const vmk = new Uint8Array(32).fill(1)
    commitUnlockedVmk({ vmk, wrapMeta: root, scopeId: "public", freshSetup: false })
    await expect(withUnlockedVmk(() => { throw new Error("public-test-fatal-error") }, { expectedWrapMeta: root })).rejects.toThrow("public-test-fatal-error")
    expect(vmk.every((byte) => byte === 0)).toBe(true)
    expect(vaultStatus().state).toBe("locked")
  })

  it.each([root, changed])("does not restore an old success-hook timer onto a newer commit (%s)", async (newRoot) => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const policy = { windowSeconds: 300 as const, strictApprovals: false, parentValueSealAllowed: true }
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false, policy })
    let heldCopy: Uint8Array | undefined
    await expect(withUnlockedVmk((copy) => { heldCopy = copy; return "public-result" }, {
      expectedWrapMeta: root, renewOnSuccess: false,
      beforeSuccess: async () => {
        vi.setSystemTime(2_000)
        commitUnlockedVmk({ vmk: new Uint8Array(32).fill(2), wrapMeta: newRoot, scopeId: "public", freshSetup: false, policy })
      },
    })).rejects.toThrow("vault-operation-aborted")
    expect(heldCopy!.every((byte) => byte === 0)).toBe(true)
    expect(vaultStatus()).toMatchObject({ state: "unlocked", expiresAt: 302_000 })
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(299_001)
    expect(vaultStatus()).toMatchObject({ state: "unlocked", expiresAt: 302_000 })
    vi.advanceTimersByTime(999)
    expect(vaultStatus().state).toBe("locked")
  })

  it("preserves a same-session renewed timer when a bound success hook is superseded", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const policy = { windowSeconds: 300 as const, strictApprovals: false, parentValueSealAllowed: true }
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false, policy })
    let newer: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    await expect(withUnlockedVmk(() => "public-result", {
      expectedWrapMeta: root, renewOnSuccess: false,
      beforeSuccess: async () => {
        vi.setSystemTime(2_000)
        newer = beginVaultOperationSnapshot(root)
        await withUnlockedVmk(() => "public-renewal")
      },
    })).rejects.toThrow("vault-operation-aborted")
    const renewed = vaultStatus().expiresAt!
    expect(renewed).toBeGreaterThan(301_000)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(299_001)
    expect(vaultStatus()).toMatchObject({ state: "unlocked", expiresAt: renewed })
    expect(() => newer!.assertCurrent()).not.toThrow()
    newer!.release()
  })

  it("restores the unchanged session deadline even when a same-epoch operation supersedes the hook", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const policy = { windowSeconds: 300 as const, strictApprovals: false, parentValueSealAllowed: true }
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false, policy })
    let newer: ReturnType<typeof beginVaultOperationSnapshot> | undefined
    await expect(withUnlockedVmk(() => "public-result", {
      expectedWrapMeta: root, renewOnSuccess: false,
      beforeSuccess: async () => { newer = beginVaultOperationSnapshot(root) },
    })).rejects.toThrow("vault-operation-aborted")
    expect(vi.getTimerCount()).toBe(1)
    expect(() => newer!.assertCurrent()).not.toThrow()
    vi.advanceTimersByTime(300_000)
    expect(vaultStatus().state).toBe("locked")
    expect(newer!.signal.aborted).toBe(true)
    newer!.release()
  })

  it("restores just one timer after overlapping same-session success hooks settle", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const policy = { windowSeconds: 300 as const, strictApprovals: false, parentValueSealAllowed: true }
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false, policy })
    let enterFirst!: () => void
    let enterSecond!: () => void
    let finishFirst!: () => void
    let finishSecond!: () => void
    const firstEntered = new Promise<void>((resolve) => { enterFirst = resolve })
    const secondEntered = new Promise<void>((resolve) => { enterSecond = resolve })
    const firstGate = new Promise<void>((resolve) => { finishFirst = resolve })
    const secondGate = new Promise<void>((resolve) => { finishSecond = resolve })
    const first = withUnlockedVmk(() => "first", {
      expectedWrapMeta: root, renewOnSuccess: false,
      beforeSuccess: () => { enterFirst(); return firstGate },
    })
    await firstEntered
    const second = withUnlockedVmk(() => "second", {
      expectedWrapMeta: root, renewOnSuccess: false,
      beforeSuccess: () => { enterSecond(); return secondGate },
    })
    await secondEntered
    expect(vi.getTimerCount()).toBe(0)
    finishFirst()
    await expect(first).resolves.toBe("first")
    expect(vi.getTimerCount()).toBe(0)
    finishSecond()
    await expect(second).resolves.toBe("second")
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(300_000)
    expect(vaultStatus().state).toBe("locked")
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(["replacement", "renewal"] as const)("ignores an already-queued stale timer callback after %s", async (change) => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const timers = vi.spyOn(globalThis, "setTimeout")
    const policy = { windowSeconds: 300 as const, strictApprovals: false, parentValueSealAllowed: true }
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false, policy })
    const stale = timers.mock.calls[0][0] as () => void
    vi.setSystemTime(2_000)
    if (change === "replacement") {
      commitUnlockedVmk({ vmk: new Uint8Array(32).fill(2), wrapMeta: root, scopeId: "public", freshSetup: false, policy })
    } else {
      await withUnlockedVmk(() => "public-renewal")
    }
    const expiresAt = vaultStatus().expiresAt!
    expect(expiresAt).toBeGreaterThan(301_000)
    stale()
    expect(vaultStatus()).toMatchObject({ state: "unlocked", expiresAt })
    expect(vi.getTimerCount()).toBe(1)
    timers.mockRestore()
  })

  it("refuses to replace an already remembered locked root before snapshotting", () => {
    rememberWrapMeta(root)
    expect(() => beginVaultOperationSnapshot(changed)).toThrow(/aborted/)
    expect(() => beginVaultOperationSnapshot(root).assertCurrent()).not.toThrow()
  })
  it("refuses to start against a different unlocked root", () => {
    commitUnlockedVmk({ vmk: new Uint8Array(32).fill(1), wrapMeta: root, scopeId: "public", freshSetup: false })
    expect(() => beginVaultOperationSnapshot(changed)).toThrow(/aborted/)
    expect(vaultStatus().state).toBe("unlocked")
  })
})
