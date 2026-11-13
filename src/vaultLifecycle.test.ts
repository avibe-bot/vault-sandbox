import { afterEach, describe, expect, it, vi } from "vitest"
import { beginVaultOperationSnapshot, commitUnlockedVmk, currentFreshSetup, lockVault, rememberWrapMeta, resetVaultSessionForTests, vaultStatus, withUnlockedVmk } from "./vaultLifecycle"

const root = JSON.stringify({ v: 1, copies: [], vault_user_handle: "public-root", extension: { label: "first" } })
const changed = JSON.stringify({ v: 1, copies: [], vault_user_handle: "public-root", extension: { label: "second" } })
afterEach(() => { resetVaultSessionForTests(); vi.useRealTimers() })

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
