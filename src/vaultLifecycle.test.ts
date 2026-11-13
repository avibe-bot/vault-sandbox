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
