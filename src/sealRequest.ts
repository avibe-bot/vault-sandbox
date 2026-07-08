import { RpcError } from "./rpc"
import { type ProtectedRecordKind } from "./vaultCrypto"

export type SandboxEntrySealRequest = {
  name: string
  kind: ProtectedRecordKind
  inputMode?: "sandbox-entry"
  wrapMeta?: string
}

export type StaticParentValueSealRequest = {
  name: string
  kind: "static"
  inputMode: "parent-value"
  value: string
  wrapMeta?: string
}

export type SealRequest = SandboxEntrySealRequest | StaticParentValueSealRequest

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
  const inputMode = record.inputMode === undefined ? "sandbox-entry" : record.inputMode
  if (inputMode !== "sandbox-entry" && inputMode !== "parent-value") {
    throw new RpcError("invalid_payload", "seal inputMode must be sandbox-entry or parent-value")
  }
  if (record.rootMetadata !== undefined) throw new RpcError("invalid_payload", "seal cannot set vault root metadata")
  const wrapMeta = optionalString(record.wrapMeta, "wrapMeta")

  if (inputMode === "parent-value") {
    if (kind !== "static") {
      throw new RpcError("invalid_payload", "parent-value inputMode is only supported for static secrets")
    }
    return {
      name,
      kind: "static",
      inputMode,
      value: requiredString(record.value, "value"),
      wrapMeta,
    }
  }

  return {
    name,
    kind,
    inputMode,
    wrapMeta,
  }
}
