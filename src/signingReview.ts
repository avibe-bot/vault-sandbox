import { bindText, isI18nKey, setRawText, type I18nKey } from "./i18n"

type Keys<Prefix extends string> = Extract<I18nKey, `${Prefix}.${string}`>

export type ReviewKindKey = Keys<"review.kind">
export type ReviewLabelKey = Keys<"review.field">
export type ReviewNoteKey = Keys<"review.note">
export type ReviewTitleKey = Keys<"review.group">
export type ReviewWarningKey = Keys<"review.warning">

/** A sandbox-owned qualifier. `count` fills `{{count}}`, e.g. a byte length. */
export type ReviewNote = ReviewNoteKey | { key: ReviewNoteKey; count: number }

/**
 * A chain's own currency, for an amount whose currency the verified facts
 * establish: lamports of a Solana System transfer, or the value of an EVM
 * transaction whose verified chain id is 1. Any other amount stays a raw
 * integer; no token or network list exists here.
 */
export type ReviewNativeCurrency = keyof typeof NATIVE_CURRENCIES

const NATIVE_CURRENCIES = {
  sol: { symbol: "SOL", baseUnit: "lamports", decimals: 9 },
  eth: { symbol: "ETH", baseUnit: "wei", decimals: 18 },
  btc: { symbol: "BTC", baseUnit: "sats", decimals: 8 },
} as const

/**
 * One reviewed fact. The label and notes are sandbox translation keys, so a
 * requester can never supply label text. The value is exact verified data
 * (address, program id, raw integer, hex) and is rendered unchanged.
 */
export type ReviewField = {
  label: ReviewLabelKey
  /** Fills `{{index}}` for repeated labels such as account or program numbers. */
  index?: number
  /**
   * Fills `{{name}}` with an identifier the sandbox itself defines: the name
   * and type of a built-in ABI parameter, e.g. `spender (address)`. Like the
   * label it is never requester text.
   */
  name?: string
  value: string
  /**
   * `value` is a base-unit integer of this currency. It is shown as the exact
   * decimal amount followed by the unchanged integer, e.g.
   * `1.5 SOL (1500000000 lamports)`.
   */
  native?: ReviewNativeCurrency
  notes?: ReviewNote[]
  /** A complete exact payload: rendered as one copyable block. */
  raw?: boolean
  /**
   * A block heading among the rows: the label alone, set apart from the rows
   * that follow it (one transfer of several). It carries no value.
   */
  heading?: boolean
}

export type ReviewGroup = { title: ReviewTitleKey; index?: number; fields: ReviewField[] }

/**
 * Display data for one signing approval, built by sandbox code from verified
 * facts. `summary` is the compact top section; an adapter keeps it short by
 * summarising (kind, counts), never by dropping facts: every fact stays in
 * `details`. The view imposes no limit of its own, so the length of a summary
 * is never a reason to refuse a valid request.
 */
export type SigningReview = {
  kind: ReviewKindKey
  /**
   * The identity that signs, derived by the sandbox from the protected record's
   * own public key and never taken from the request: the base58 key for Solana,
   * the 0x address for EVM. It is always the first summary row.
   */
  signer: ReviewField
  summary: ReviewField[]
  /** Any part that is not decoded or resolved. Shows the one notice line. */
  undecoded: boolean
  /**
   * Risks the verified facts establish (a fee above the review threshold, a
   * token authorization). Each is one alert line, first in the card, before the
   * blind-signing notice and every row.
   */
  warnings?: ReviewWarningKey[]
  details: ReviewGroup[]
}

/** What the daemon-signed request context contributes to the review. */
export type ReviewRequest = {
  /** The requesting session's label, shown as one small line under the headline. */
  session?: string
  /** The existing request rows; they become the first Details group. */
  rows?: HTMLElement
}

/**
 * Exact base-unit to currency conversion on the decimal digits. No number type
 * is involved, so nothing is rounded or truncated at any magnitude. A value
 * that is not a canonical unsigned integer is shown as it is, never guessed at.
 */
function nativeAmount(value: string, currency: ReviewNativeCurrency): string {
  const { symbol, baseUnit, decimals } = NATIVE_CURRENCIES[currency]
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) return `${value} ${baseUnit}`
  const digits = value.padStart(decimals + 1, "0")
  const fraction = digits.slice(-decimals).replace(/0+$/, "")
  return `${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ""} ${symbol} (${value} ${baseUnit})`
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  return node
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"

function svg(name: string, attributes: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NAMESPACE, name)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  return node
}

/** The warning triangle beside the notice. Decorative: the sentence carries the meaning. */
function warningIcon(): SVGElement {
  const icon = svg("svg", {
    class: "review-notice-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  })
  icon.append(
    svg("path", { d: "M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }),
    svg("path", { d: "M12 9v4.5" }),
    svg("path", { d: "M12 17h.01" }),
  )
  return icon
}

function notes(field: ReviewField): HTMLElement | null {
  if (!field.notes?.length) return null
  const list = element("span", "review-notes")
  for (const note of field.notes) {
    const item = element("span", "review-note")
    if (typeof note === "string") bindText(item, note)
    else bindText(item, note.key, { count: note.count })
    list.append(item)
  }
  return list
}

function label(field: ReviewField, className = "review-label"): HTMLElement {
  const node = element(field.heading ? "p" : "span", className)
  const params = {
    ...(field.index === undefined ? {} : { index: field.index }),
    ...(field.name === undefined ? {} : { name: field.name }),
  }
  bindText(node, field.label, Object.keys(params).length > 0 ? params : undefined)
  return node
}

function copyButton(source: HTMLElement, text: string): HTMLButtonElement {
  const copy = element("button", "review-copy")
  copy.type = "button"
  bindText(copy, "review.copy")
  copy.addEventListener("click", () => {
    // The payload is public transaction content, not protected plaintext. If
    // the clipboard is unavailable, select the block so the keyboard can copy.
    const selectForKeyboard = (): void => {
      window.getSelection()?.selectAllChildren(source)
      bindText(copy, "review.copySelected")
    }
    let written: Promise<void>
    try {
      written = navigator.clipboard.writeText(text)
    } catch {
      selectForKeyboard()
      return
    }
    void written.then(() => bindText(copy, "review.copied"), selectForKeyboard)
  })
  return copy
}

function fieldRow(field: ReviewField): HTMLElement {
  if (field.heading) return label(field, "review-subheading")
  const row = element("div", field.raw ? "review-field review-field-raw" : "review-field")
  const qualifiers = notes(field)
  if (field.raw) {
    const head = element("div", "review-raw-head")
    const block = element("pre", "review-raw")
    setRawText(block, field.value)
    head.append(label(field))
    if (qualifiers) head.append(qualifiers)
    head.append(copyButton(block, field.value))
    row.append(head, block)
    return row
  }
  const value = element("div", "review-value")
  const text = element("span", "review-mono")
  setRawText(text, field.native ? nativeAmount(field.value, field.native) : field.value)
  value.append(text)
  if (qualifiers) value.append(qualifiers)
  row.append(label(field), value)
  return row
}

function group(title: ReviewTitleKey, index: number | undefined, content: HTMLElement[]): HTMLElement {
  const section = element("section", "review-group")
  const heading = element("h2", "review-group-title")
  bindText(heading, title, index === undefined ? undefined : { index })
  section.append(heading, ...content)
  return section
}

/**
 * Render the compact summary and the single collapsed Details section into the
 * confirmation body. From the daemon-signed request, only the session label
 * joins the summary; the complete request rows are the first Details group.
 */
export function renderSigningReview(target: HTMLElement, review: SigningReview, request: ReviewRequest = {}): void {
  setRawText(target, "")
  const root = element("div", "review")

  const heading = element("div", "review-heading")
  const kind = element("p", "review-kind")
  bindText(kind, review.kind)
  heading.append(kind)
  if (request.session) {
    const session = element("p", "review-session")
    const sessionLabel = element("span", "review-session-label")
    bindText(sessionLabel, "context.session")
    const sessionValue = element("span", "review-session-value")
    setRawText(sessionValue, request.session)
    session.append(sessionLabel, sessionValue)
    heading.append(session)
  }
  root.append(heading)

  for (const warning of review.warnings ?? []) {
    const line = element("p", "review-warning")
    const sentence = element("span", "review-warning-text")
    bindText(sentence, warning)
    line.append(warningIcon(), sentence)
    root.append(line)
  }

  if (review.undecoded) {
    // Directly under the headline and session line, before the signer and every
    // summary row, so it is on the first screen however long the summary is.
    // One alert-coloured line with an icon. The sentence is its own element so a
    // locale refresh rewrites the text and leaves the icon in place.
    const notice = element("p", "review-notice")
    const sentence = element("span", "review-notice-text")
    bindText(sentence, "sign.blindNotice")
    notice.append(warningIcon(), sentence)
    root.append(notice)
  }

  const summary = element("div", "review-summary")
  summary.append(fieldRow(review.signer), ...review.summary.map(fieldRow))
  root.append(summary)

  const details = element("details", "review-details")
  const toggle = element("summary", "review-details-toggle")
  bindText(toggle, "review.details")
  const content = element("div", "review-details-body")
  // Verified facts first; the requester's own metadata after them.
  for (const item of review.details) content.append(group(item.title, item.index, item.fields.map(fieldRow)))
  if (request.rows) content.append(group("review.group.request", undefined, [request.rows]))
  details.append(toggle, content)
  root.append(details)

  target.append(root)
}

function fail(detail: string): never {
  throw new Error(`signing review is malformed: ${detail}`)
}

function plainRecord(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${path} must be an object`)
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) if (!allowed.includes(key)) fail(`${path}.${key} is not a review field`)
  return record
}

function translationKey<Prefix extends string>(value: unknown, prefix: Prefix, path: string): Keys<Prefix> {
  if (!isI18nKey(value) || !value.startsWith(`${prefix}.`)) fail(`${path} must be a ${prefix} translation key`)
  return value as Keys<Prefix>
}

function optionalCount(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail(`${path} must be a non-negative integer`)
  return value
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path} must be a list`)
  return value
}

const MAX_TYPED_PATH = 4096

// An ABI parameter as the sandbox writes it: an identifier and a Solidity type.
const ABI_PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63} \([a-z][a-z0-9[\]]{0,31}\)$/

function parseField(value: unknown, path: string): ReviewField {
  const record = plainRecord(value, ["label", "index", "name", "value", "native", "notes", "raw", "heading"], path)
  const index = optionalCount(record.index, `${path}.index`)
  // A typed-data field path is the signed structure's own field names (any
  // Unicode), shown as text; every other name is a built-in ABI parameter.
  if (record.name !== undefined && (typeof record.name !== "string"
    || (record.label === "review.field.typedField" ? record.name.length > MAX_TYPED_PATH : !ABI_PARAMETER_NAME.test(record.name)))) {
    fail(`${path}.name is not a valid field name`)
  }
  if (typeof record.value !== "string") fail(`${path}.value must be a string`)
  if (record.native !== undefined && !Object.hasOwn(NATIVE_CURRENCIES, record.native as string)) fail(`${path}.native is not a native currency`)
  if (record.raw !== undefined && typeof record.raw !== "boolean") fail(`${path}.raw must be a boolean`)
  if (record.heading !== undefined && typeof record.heading !== "boolean") fail(`${path}.heading must be a boolean`)
  // A heading is its label alone; anything else on it would never be shown.
  if (record.heading && (record.value !== "" || record.native !== undefined || record.notes !== undefined || record.raw !== undefined)) {
    fail(`${path} is a heading and cannot carry a value`)
  }
  const notes = record.notes === undefined ? undefined : list(record.notes, `${path}.notes`).map((note, position): ReviewNote => {
    const notePath = `${path}.notes[${position}]`
    if (typeof note === "string") return translationKey(note, "review.note", notePath)
    const counted = plainRecord(note, ["key", "count"], notePath)
    const count = optionalCount(counted.count, `${notePath}.count`)
    if (count === undefined) fail(`${notePath}.count is required`)
    return { key: translationKey(counted.key, "review.note", `${notePath}.key`), count }
  })
  return {
    label: translationKey(record.label, "review.field", `${path}.label`),
    ...(index === undefined ? {} : { index }),
    ...(record.name === undefined ? {} : { name: record.name as string }),
    value: record.value,
    ...(record.native === undefined ? {} : { native: record.native as ReviewNativeCurrency }),
    ...(notes === undefined ? {} : { notes }),
    ...(record.raw === undefined ? {} : { raw: record.raw }),
    ...(record.heading === undefined ? {} : { heading: record.heading }),
  }
}

/**
 * Rebuild a review that crossed a message channel (the authorization window
 * receives it from the sandbox frame). Only this exact shape is accepted, and
 * every label, note, title and kind must be a translation key of this build,
 * so the channel can carry values but never label text or markup.
 */
export function parseSigningReview(value: unknown): SigningReview {
  const record = plainRecord(value, ["kind", "signer", "summary", "undecoded", "warnings", "details"], "review")
  if (typeof record.undecoded !== "boolean") fail("review.undecoded must be a boolean")
  const warnings = record.warnings === undefined ? undefined
    : list(record.warnings, "review.warnings").map((warning, index) => translationKey(warning, "review.warning", `review.warnings[${index}]`))
  return {
    kind: translationKey(record.kind, "review.kind", "review.kind"),
    signer: parseField(record.signer, "review.signer"),
    summary: list(record.summary, "review.summary").map((field, index) => parseField(field, `review.summary[${index}]`)),
    undecoded: record.undecoded,
    ...(warnings === undefined ? {} : { warnings }),
    details: list(record.details, "review.details").map((group, position) => {
      const path = `review.details[${position}]`
      const entry = plainRecord(group, ["title", "index", "fields"], path)
      const index = optionalCount(entry.index, `${path}.index`)
      return {
        title: translationKey(entry.title, "review.group", `${path}.title`),
        ...(index === undefined ? {} : { index }),
        fields: list(entry.fields, `${path}.fields`).map((field, fieldIndex) => parseField(field, `${path}.fields[${fieldIndex}]`)),
      }
    }),
  }
}
