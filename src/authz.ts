import { type VaultState } from "./vaultLifecycle"
import { type VaultSessionPolicy } from "./policy"

export type RiskTier = "R1" | "R2" | "R3"
export type PasskeyRequirement = "none" | "unlock" | "uv"

export type AuthorizationPlan = {
  tier: RiskTier
  effectiveTier: RiskTier
  confirm: boolean
  passkey: PasskeyRequirement
  renewOnSuccess: boolean
}

export function resolveAuthorizationPlan(input: {
  tier: RiskTier
  vaultState: VaultState
  policy: Pick<VaultSessionPolicy, "strictApprovals">
}): AuthorizationPlan {
  const effectiveTier = input.tier === "R2" && input.policy.strictApprovals ? "R3" : input.tier
  const locked = input.vaultState !== "unlocked"

  if (effectiveTier === "R1") {
    return {
      tier: input.tier,
      effectiveTier,
      confirm: false,
      passkey: locked ? "unlock" : "none",
      renewOnSuccess: true,
    }
  }

  if (locked) {
    return {
      tier: input.tier,
      effectiveTier,
      confirm: true,
      passkey: "unlock",
      renewOnSuccess: effectiveTier !== "R3",
    }
  }

  return {
    tier: input.tier,
    effectiveTier,
    confirm: true,
    passkey: effectiveTier === "R3" ? "uv" : "none",
    renewOnSuccess: effectiveTier !== "R3",
  }
}
