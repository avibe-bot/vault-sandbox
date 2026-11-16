import { RpcError } from "./rpc"
import { parseGenerateRecipe, type GenerateRecipe } from "./secretGenerate"
import { parseSigningCurve, type SigningCurve } from "./vaultCrypto"

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

/** One field of a whole secret whose values are typed in the secure window. */
export type SecureWindowSealField = { record: string; label: string; required: boolean; generate?: GenerateRecipe }

/** A whole static secret sealed from values typed in the secure window (contract v1.1). */
export type SecureWindowSealRequest = {
  kind: "static"
  inputMode: "secure-window"
  secret: string
  mode: "create" | "edit"
  wrapMeta: string
  fields: SecureWindowSealField[]
}

export type SealRequest = SandboxEntrySealRequest | StaticParentValueSealRequest | SecureWindowSealRequest

export const SECURE_WINDOW_MAX_FIELDS = 32
/** The Avibe Vault rules for a secret name and a field name (vaultRecordName, VAULT_FIELD_PATTERN). */
export const SECRET_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
export const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

function onlyKeys(record: Record<string, unknown>, allowed: string[], field: string): void {
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new RpcError("invalid_payload", `${field} has unknown fields`)
}

function parseSecureWindowSeal(record: Record<string, unknown>): SecureWindowSealRequest {
  onlyKeys(record, ["kind", "inputMode", "secret", "mode", "wrapMeta", "fields"], "seal request")
  const secret = requiredString(record.secret, "secret")
  if (!SECRET_NAME_PATTERN.test(secret)) throw new RpcError("invalid_payload", "secret name is invalid")
  if (record.mode !== "create" && record.mode !== "edit") throw new RpcError("invalid_payload", "mode must be create or edit")
  const mode = record.mode
  const wrapMeta = requiredString(record.wrapMeta, "wrapMeta")
  if (!Array.isArray(record.fields) || record.fields.length < 1 || record.fields.length > SECURE_WINDOW_MAX_FIELDS) {
    throw new RpcError("invalid_payload", `fields must hold 1 to ${SECURE_WINDOW_MAX_FIELDS} entries`)
  }
  const seen = new Set<string>()
  const labels = new Set<string>()
  const fields = record.fields.map((value) => {
    const field = asRecord(value)
    onlyKeys(field, ["record", "label", "required", "generate"], "field")
    const recordName = requiredString(field.record, "field.record")
    const own = recordName === secret ? null : recordName.startsWith(`${secret}.`) ? recordName.slice(secret.length + 1) : undefined
    if (own === undefined || (own !== null && !FIELD_NAME_PATTERN.test(own))) throw new RpcError("invalid_payload", "field record must belong to the secret")
    if (seen.has(recordName)) throw new RpcError("invalid_payload", "field records must be distinct")
    seen.add(recordName)
    const label = requiredString(field.label, "field.label")
    if (!FIELD_NAME_PATTERN.test(label)) throw new RpcError("invalid_payload", "field label is invalid")
    // Only the default field's label differs from its record (the record is the secret's own name).
    if (own !== null && own !== label) throw new RpcError("invalid_payload", "field label must name its record")
    if (labels.has(label)) throw new RpcError("invalid_payload", "field labels must be distinct")
    labels.add(label)
    if (typeof field.required !== "boolean") throw new RpcError("invalid_payload", "field.required must be a boolean")
    if (mode === "create" && !field.required) throw new RpcError("invalid_payload", "every field is required on create")
    let generate: GenerateRecipe | undefined
    if (field.generate !== undefined) {
      try { generate = parseGenerateRecipe(field.generate) } catch { throw new RpcError("invalid_payload", "field.generate is invalid") }
    }
    return { record: recordName, label, required: field.required, ...(generate ? { generate } : {}) }
  })
  return { kind: "static", inputMode: "secure-window", secret, mode, wrapMeta, fields }
}

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
  if (record.rootMetadata !== undefined) throw new RpcError("invalid_payload", "seal cannot set vault root metadata")
  if (kind === "static" && record.inputMode === "secure-window") return parseSecureWindowSeal(record)
  const name = requiredString(record.name, "name")
  const wrapMeta = optionalString(record.wrapMeta, "wrapMeta")

  if (kind === "static") {
    if (record.curve !== undefined) throw new RpcError("invalid_payload", "static seal cannot carry a curve")
    if (record.inputMode !== "parent-value") {
      throw new RpcError("invalid_payload", "static seal inputMode must be parent-value")
    }
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
  let curve: SigningCurve
  try { curve = parseSigningCurve(record.curve) } catch { throw new RpcError("invalid_payload", "unsupported signing curve") }
  return {
    name,
    kind: "keypair",
    ...(record.curve !== undefined ? { curve } : {}),
    wrapMeta,
  }
}
