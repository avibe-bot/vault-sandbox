import type { I18nKey } from "./i18n"
import { rawText, type ConfirmationDetailRow, type ConfirmationDetails, type TextSpec } from "./operationUi"
import { RpcError } from "./rpc"
import { parseSigningReview, type SigningReview } from "./signingReview"
import { base64ToBytes, bytesToBase64 } from "./vaultCrypto"

// One authorization prompt, the form it takes between the sandbox frame and
// its top-level authorization window, and the card it is shown as. Every place
// that shows a prompt goes through `authorizationCard`, so a prompt field
// cannot reach one surface and be dropped on another.

export type AuthorizationPrompt = {
  title: TextSpec
  subtitle: TextSpec
  body?: TextSpec
  details?: ConfirmationDetails
  /** Structured signing review; shown in place of `body`. */
  review?: SigningReview
  /** With `review`: the requesting session's label from the daemon-signed context. */
  reviewSession?: string
  challenge?: Uint8Array
  label: TextSpec
}

export type SerializedAuthorizationPrompt = Omit<AuthorizationPrompt, "challenge"> & {
  challenge?: string
}

export type AuthorizationCard = {
  title: TextSpec
  subtitle: TextSpec
  body?: TextSpec
  details?: ConfirmationDetails
  review?: SigningReview
  reviewSession?: string
  confirmLabel: TextSpec
}

/** The confirmation card for a prompt, with the action label the surface needs. */
export function authorizationCard(prompt: AuthorizationPrompt, confirmLabel: TextSpec = prompt.label): AuthorizationCard {
  return {
    title: prompt.title,
    subtitle: prompt.subtitle,
    ...(prompt.body !== undefined ? { body: prompt.body } : {}),
    ...(prompt.details ? { details: prompt.details } : {}),
    ...(prompt.review ? { review: prompt.review } : {}),
    ...(prompt.reviewSession !== undefined ? { reviewSession: prompt.reviewSession } : {}),
    confirmLabel,
  }
}

export function serializeAuthorizationPrompt(prompt: AuthorizationPrompt): SerializedAuthorizationPrompt {
  const { challenge, ...rest } = prompt
  return {
    ...rest,
    ...(challenge ? { challenge: bytesToBase64(challenge) } : {}),
  }
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new RpcError("invalid_payload", `${field} must be an object`)
  return value as Record<string, unknown>
}

function decodeTextSpec(value: unknown, field: string): TextSpec {
  if (typeof value === "string" && value.length > 0) return value as TextSpec
  if (typeof value !== "object" || value === null) throw new RpcError("invalid_payload", `${field} must be a text spec`)
  const record = value as Record<string, unknown>
  if (typeof record.text === "string") return rawText(record.text)
  if (typeof record.key === "string") {
    const params = record.params
    if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) {
      throw new RpcError("invalid_payload", `${field}.params must be an object`)
    }
    return {
      key: record.key as I18nKey,
      ...(params !== undefined ? { params: params as Record<string, string | number | boolean | null | undefined> } : {}),
    } as TextSpec
  }
  throw new RpcError("invalid_payload", `${field} must be a text spec`)
}

function decodeConfirmationDetails(value: unknown): ConfirmationDetails {
  const record = asRecord(value, "details")
  if (!Array.isArray(record.rows)) throw new RpcError("invalid_payload", "details must contain rows")
  const rows: ConfirmationDetailRow[] = []
  for (const [index, rowValue] of record.rows.entries()) {
    const row = asRecord(rowValue, `details.rows[${index}]`)
    const variant = row.variant
    if (variant !== undefined && variant !== "text" && variant !== "command" && variant !== "mono" && variant !== "chips") {
      throw new RpcError("invalid_payload", `details.rows[${index}].variant is invalid`)
    }
    const label = decodeTextSpec(row.label, `details.rows[${index}].label`)
    if (variant === "chips") {
      if (!Array.isArray(row.values)) throw new RpcError("invalid_payload", `details.rows[${index}].values must be an array`)
      const tone = row.tone
      if (tone !== undefined && tone !== "default" && tone !== "warning") {
        throw new RpcError("invalid_payload", `details.rows[${index}].tone is invalid`)
      }
      const normalizedTone: "default" | "warning" | undefined = tone === "default" || tone === "warning" ? tone : undefined
      rows.push({
        label,
        values: row.values.map((item, itemIndex) => decodeTextSpec(item, `details.rows[${index}].values[${itemIndex}]`)),
        variant: "chips",
        ...(normalizedTone !== undefined ? { tone: normalizedTone } : {}),
      })
      continue
    }
    rows.push({
      label,
      value: decodeTextSpec(row.value, `details.rows[${index}].value`),
      ...(variant !== undefined ? { variant } : {}),
    })
  }
  return { rows }
}

function decodeReview(value: unknown): SigningReview {
  try {
    return parseSigningReview(value)
  } catch (error) {
    throw new RpcError("invalid_payload", error instanceof Error ? error.message : "signing review is malformed")
  }
}

export function decodeAuthorizationPrompt(value: unknown): AuthorizationPrompt {
  const record = asRecord(value, "authorization prompt")
  if (record.challenge !== undefined && (typeof record.challenge !== "string" || record.challenge.length === 0)) {
    throw new RpcError("invalid_payload", "prompt.challenge must be a non-empty string")
  }
  if (record.reviewSession !== undefined && typeof record.reviewSession !== "string") {
    throw new RpcError("invalid_payload", "prompt.reviewSession must be a string")
  }
  const challenge = record.challenge === undefined ? undefined : base64ToBytes(record.challenge)
  return {
    title: decodeTextSpec(record.title, "prompt.title"),
    subtitle: decodeTextSpec(record.subtitle, "prompt.subtitle"),
    ...(record.body !== undefined ? { body: decodeTextSpec(record.body, "prompt.body") } : {}),
    ...(record.details !== undefined ? { details: decodeConfirmationDetails(record.details) } : {}),
    ...(record.review !== undefined ? { review: decodeReview(record.review) } : {}),
    ...(record.reviewSession !== undefined ? { reviewSession: record.reviewSession } : {}),
    ...(challenge ? { challenge } : {}),
    label: decodeTextSpec(record.label, "prompt.label"),
  }
}
