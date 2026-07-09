import { RpcError } from "./rpc"

export type VaultSessionPolicy = {
  windowSeconds: 300 | 600 | 1800
  strictApprovals: boolean
  parentValueSealAllowed: boolean
}

export const DEFAULT_VAULT_SESSION_POLICY: VaultSessionPolicy = {
  windowSeconds: 600,
  strictApprovals: false,
  parentValueSealAllowed: true,
}

let currentPolicy: VaultSessionPolicy = { ...DEFAULT_VAULT_SESSION_POLICY }

function normalizeWindowSeconds(value: unknown): 300 | 600 | 1800 {
  return value === 300 || value === 600 || value === 1800 ? value : DEFAULT_VAULT_SESSION_POLICY.windowSeconds
}

function parseWindowSeconds(value: unknown, field: string): 300 | 600 | 1800 {
  if (value === 300 || value === 600 || value === 1800) return value
  throw new RpcError("invalid_payload", `${field}.windowSeconds must be 300, 600, or 1800`)
}

export function parseVaultSessionPolicy(value: unknown, field = "policy"): VaultSessionPolicy {
  if (typeof value !== "object" || value === null) throw new RpcError("invalid_payload", `${field} must be an object`)
  const record = value as Record<string, unknown>
  if (typeof record.strictApprovals !== "boolean") throw new RpcError("invalid_payload", `${field}.strictApprovals must be a boolean`)
  if (typeof record.parentValueSealAllowed !== "boolean") {
    throw new RpcError("invalid_payload", `${field}.parentValueSealAllowed must be a boolean`)
  }
  return {
    windowSeconds: parseWindowSeconds(record.windowSeconds, field),
    strictApprovals: record.strictApprovals,
    parentValueSealAllowed: record.parentValueSealAllowed,
  }
}

export function normalizeVaultSessionPolicy(value: unknown): VaultSessionPolicy {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_VAULT_SESSION_POLICY }
  const record = value as Record<string, unknown>
  return {
    windowSeconds: normalizeWindowSeconds(record.windowSeconds),
    strictApprovals: record.strictApprovals === true,
    parentValueSealAllowed: record.parentValueSealAllowed !== false,
  }
}

export function setVaultSessionPolicy(value: unknown): VaultSessionPolicy {
  currentPolicy = normalizeVaultSessionPolicy(value)
  return currentPolicy
}

export function currentVaultSessionPolicy(): VaultSessionPolicy {
  return { ...currentPolicy }
}

export function resetVaultSessionPolicyForTests(): void {
  currentPolicy = { ...DEFAULT_VAULT_SESSION_POLICY }
}
