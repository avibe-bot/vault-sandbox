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
