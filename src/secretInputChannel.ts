// The secure window's input request and its answer: the values of one protected
// secret travel only from that window to this build's sandbox frame. The rows are
// unsigned input display from the requesting page; both ends hold them to the
// same strict shape, so a bad row is refused rather than shown or saved.
import { RpcError } from "./rpc"
import { FIELD_NAME_PATTERN, SECRET_NAME_PATTERN, SECURE_WINDOW_MAX_FIELDS } from "./sealRequest"
import { parseGenerateRecipe, type GenerateRecipe } from "./secretGenerate"
import type { SecretInputValue } from "./secretInputUi"

/** A sanity bound on one value, far above any real credential. */
export const SECRET_INPUT_MAX_CHARS = 1024 * 1024

export type SecretInputWindowRow = { label: string; required: boolean; isDefault: boolean; generate?: GenerateRecipe }

export type SecretInputWindowRequest = {
  kind: "protected-input"
  /** The secret's name, shown as the card's subtitle. */
  name: string
  mode: "create" | "edit"
  rows: SecretInputWindowRow[]
  /** The input's end (ms since epoch): at most 5 minutes, and 5 s before the unlocked session would lock by itself. The window takes no input past it. */
  notAfter?: number
}

export type SecretInputWindowResult = { kind: "entered"; values: SecretInputValue[] }

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new RpcError("invalid_payload", `${field} must be an object`)
  return value as Record<string, unknown>
}

function onlyKeys(value: Record<string, unknown>, allowed: string[], field: string, code = "invalid_payload"): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new RpcError(code, `${field} has unknown fields`)
}

/** The window's decode of an input request: strict keys, at most 32 rows, valid labels and recipes. */
export function decodeSecretInputRequest(value: Record<string, unknown>): SecretInputWindowRequest {
  onlyKeys(value, ["kind", "name", "mode", "rows", "notAfter"], "input request")
  if (typeof value.name !== "string" || !SECRET_NAME_PATTERN.test(value.name)) throw new RpcError("invalid_payload", "input name is invalid")
  if (value.mode !== "create" && value.mode !== "edit") throw new RpcError("invalid_payload", "input mode is invalid")
  const mode = value.mode
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > SECURE_WINDOW_MAX_FIELDS) {
    throw new RpcError("invalid_payload", "input rows are invalid")
  }
  if (value.notAfter !== undefined && (typeof value.notAfter !== "number" || !Number.isFinite(value.notAfter))) {
    throw new RpcError("invalid_payload", "input notAfter is invalid")
  }
  const labels = new Set<string>()
  let defaults = 0
  const rows = value.rows.map((entry): SecretInputWindowRow => {
    const row = record(entry, "input row")
    onlyKeys(row, ["label", "required", "isDefault", "generate"], "input row")
    if (typeof row.label !== "string" || !FIELD_NAME_PATTERN.test(row.label) || labels.has(row.label)) throw new RpcError("invalid_payload", "input row label is invalid")
    labels.add(row.label)
    if (typeof row.required !== "boolean" || typeof row.isDefault !== "boolean") throw new RpcError("invalid_payload", "input row flags are invalid")
    if (mode === "create" && !row.required) throw new RpcError("invalid_payload", "every row is required on create")
    if (row.isDefault) defaults += 1
    let generate: GenerateRecipe | undefined
    if (row.generate !== undefined) {
      try { generate = parseGenerateRecipe(row.generate) } catch { throw new RpcError("invalid_payload", "input row recipe is invalid") }
    }
    return { label: row.label, required: row.required, isDefault: row.isDefault, ...(generate ? { generate } : {}) }
  })
  if (defaults > 1) throw new RpcError("invalid_payload", "input rows name more than one default")
  return { kind: "protected-input", name: value.name, mode, rows, ...(value.notAfter !== undefined ? { notAfter: value.notAfter } : {}) }
}

/**
 * The frame's check of the window's answer against the request it sent: one
 * entry per row, empty only where a row may be kept, generated only where the
 * row offered Generate, and at least one value to save.
 */
export function parseSecretInputResult(value: Record<string, unknown>, request: SecretInputWindowRequest): SecretInputWindowResult {
  const invalid = (message: string): RpcError => new RpcError("authorization_result_invalid", message)
  if (value.kind !== "entered") throw invalid("input result kind is invalid")
  onlyKeys(value, ["kind", "values"], "input result", "authorization_result_invalid")
  if (!Array.isArray(value.values) || value.values.length !== request.rows.length) throw invalid("input result does not match its rows")
  const values = value.values.map((entry, index): SecretInputValue => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw invalid("input value is invalid")
    const item = entry as Record<string, unknown>
    onlyKeys(item, ["value", "generated"], "input value", "authorization_result_invalid")
    const row = request.rows[index]
    if (typeof item.generated !== "boolean") throw invalid("input generated flag is invalid")
    if (item.value === null) {
      if (row.required || item.generated) throw invalid("a required input value is missing")
      return { value: null, generated: false }
    }
    if (typeof item.value !== "string" || item.value.length === 0 || item.value.length > SECRET_INPUT_MAX_CHARS) throw invalid("input value is invalid")
    // The window takes single-line values only; it never sends one with a line break.
    if (/[\r\n]/.test(item.value)) throw invalid("input value has a line break")
    if (item.generated && !row.generate) throw invalid("input value was generated without a recipe")
    return { value: item.value, generated: item.generated }
  })
  if (values.every((entry) => entry.value === null)) throw invalid("input result has nothing to save")
  return { kind: "entered", values }
}
