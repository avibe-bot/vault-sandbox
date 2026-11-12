import { RpcError } from "./rpc"
import { parseSigningCurve, type SigningCurve } from "./vaultCrypto"
import { parseStaticSecretGenerationRecipe, type StaticSecretGenerationRecipe } from "./staticSecretGeneration"

export type SandboxEntrySealRequest = {
  name: string
  kind: "keypair"
  curve?: SigningCurve
  inputMode?: undefined
  wrapMeta?: string
}

export type StaticParentValueSealRequest = {
  name: string
  kind: "static"
  inputMode: "parent-value"
  value: string
  wrapMeta?: string
}

export type StaticSandboxGeneratedSealRequest = {
  name: string
  kind: "static"
  inputMode: "sandbox-generated"
  generate: StaticSecretGenerationRecipe
  wrapMeta?: string
}

export type SealRequest = SandboxEntrySealRequest | StaticParentValueSealRequest | StaticSandboxGeneratedSealRequest

function asRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null) {
    throw new RpcError("invalid_payload", "request payload must be an object")
  }
  return payload as Record<string, unknown>
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new RpcError("invalid_payload", `${field} must be a string`)
  return value
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new RpcError("invalid_payload", `${field} must be a non-empty string`)
  }
  return value
}

export function parseSealRequest(payload: unknown): SealRequest {
  const record = asRecord(payload)
  const kind = record.kind === "keypair" ? "keypair" : record.kind === "static" ? "static" : null
  if (!kind) throw new RpcError("invalid_payload", "kind must be static or keypair")
  const name = requiredString(record.name, "name")
  if (record.rootMetadata !== undefined) throw new RpcError("invalid_payload", "seal cannot set vault root metadata")
  const wrapMeta = optionalString(record.wrapMeta, "wrapMeta")

  if (kind === "static") {
    if (record.curve !== undefined) throw new RpcError("invalid_payload", "static seal cannot carry a curve")
    if (record.inputMode === "sandbox-generated") {
      if (record.value !== undefined) throw new RpcError("invalid_payload", "sandbox-generated static seal cannot accept a parent value")
      let generate: StaticSecretGenerationRecipe
      try { generate = parseStaticSecretGenerationRecipe(record.generate) } catch (error) {
        throw new RpcError("invalid_payload", error instanceof Error ? error.message : "invalid generation recipe")
      }
      return { name, kind: "static", inputMode: "sandbox-generated", generate, wrapMeta }
    }
    if (record.inputMode !== "parent-value") {
      throw new RpcError("invalid_payload", "static seal inputMode must be parent-value")
    }
    if (record.generate !== undefined) throw new RpcError("invalid_payload", "parent-value static seal cannot carry a generation recipe")
    return {
      name,
      kind: "static",
      inputMode: "parent-value",
      value: requiredString(record.value, "value"),
      wrapMeta,
    }
  }

  if (record.inputMode !== undefined) {
    throw new RpcError("invalid_payload", "keypair seal is generate-only and does not accept inputMode")
  }
  if (record.value !== undefined) {
    throw new RpcError("invalid_payload", "keypair seal cannot accept parent-provided private key material")
  }
  if (record.generate !== undefined) throw new RpcError("invalid_payload", "keypair seal cannot carry a static generation recipe")
  let curve: SigningCurve
  try { curve = parseSigningCurve(record.curve) } catch { throw new RpcError("invalid_payload", "unsupported signing curve") }
  return {
    name,
    kind: "keypair",
    ...(record.curve !== undefined ? { curve } : {}),
    wrapMeta,
  }
}
