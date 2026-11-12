import { bindText, isI18nKey, setRawText, type I18nKey } from "./i18n"

type Keys<Prefix extends string> = Extract<I18nKey, `${Prefix}.${string}`>

export type ReviewKindKey = Keys<"review.kind">
export type ReviewLabelKey = Keys<"review.field">
export type ReviewNoteKey = Keys<"review.note">
export type ReviewTitleKey = Keys<"review.group">
export type ReviewWarningKey = Keys<"review.warning">
export type ReviewValueKey = Keys<"review.value">

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
  /**
   * With `native`: show only the currency amount (`symbol`, e.g. `0.0012 BTC`)
   * or only the base units (`base`, e.g. `308 sats`). Both are exact; the
   * default shows both.
   */
  unit?: "symbol" | "base"
  /**
   * `value` is a base-unit integer whose decimal count the signed bytes encode
   * (a Solana TransferChecked instruction). It is shown as the exact decimal
   * amount, then the unchanged integer and the decimal count, e.g.
   * `3 (3000000 base units, decimals 6)`. No symbol is named.
   */
  decimals?: number
  /**
   * `value` is a Unix time in seconds. It is shown as its UTC date, then the
   * unchanged integer, e.g. `2030-01-01 00:00 UTC (1893456000)`; seconds are
   * shown when they are not zero. A value past the calendar range shown here
   * stays the raw integer and says it has no date; nothing is wrapped or clamped.
   */
  time?: "unix-seconds"
  /**
   * The exact identifier the amount goes to, shown after it as `→ <identifier>`
   * on one line. It is shortened on the first screen like `elide`.
   */
  to?: string
  /** A second exact value of the same fact, shown after it as `· <value>`, e.g. a fee rate. */
  secondary?: string
  /**
   * The value is a long identifier (an address or key). On the first screen it
   * is shown as its first 8 and last 6 characters and expands on tap; Details
   * always show it complete. The adapter keeps every elided value in Details.
   */
  elide?: boolean
  /**
   * A sandbox word shown in place of the value on the first screen, e.g.
   * "Unlimited" for a field's maximum. The exact value is in Details.
   */
  shownAs?: ReviewValueKey
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
   * the 0x address for EVM. The first screen answers what leaves, to whom and
   * what it costs before any identity, so it is the last summary row; it is
   * also the first row of Details.
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
const CANONICAL_UNSIGNED = /^(?:0|[1-9][0-9]*)$/

/** Place the decimal point in a canonical unsigned integer, on its digits: never rounded, never in exponent form. */
function decimalPlaced(value: string, decimals: number): string {
  if (decimals === 0) return value
  const digits = value.padStart(decimals + 1, "0")
  const fraction = digits.slice(-decimals).replace(/0+$/, "")
  return `${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ""}`
}

function nativeAmount(value: string, currency: ReviewNativeCurrency, unit?: "symbol" | "base"): string {
  const { symbol, baseUnit, decimals } = NATIVE_CURRENCIES[currency]
  if (!CANONICAL_UNSIGNED.test(value) || unit === "base") return `${value} ${baseUnit}`
  const amount = `${decimalPlaced(value, decimals)} ${symbol}`
  return unit === "symbol" ? amount : `${amount} (${value} ${baseUnit})`
}

/** The last second this view dates: 9999-12-31 23:59:59 UTC. Later values stay raw. */
const LATEST_DATED_SECOND = 253402300799n

/**
 * A Unix time in seconds as its UTC date, or null when it is not a canonical
 * unsigned integer or lies past the dated range. The integer is bounded before
 * any conversion to a number, so no value is wrapped or rounded.
 */
export function utcDate(value: string): string | null {
  if (!CANONICAL_UNSIGNED.test(value) || value.length > 12 || BigInt(value) > LATEST_DATED_SECOND) return null
  const iso = new Date(Number(value) * 1000).toISOString()
  const seconds = iso.slice(17, 19)
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}${seconds === "00" ? "" : `:${seconds}`} UTC`
}

const ELIDE_HEAD = 8
const ELIDE_TAIL = 6
/** A first-screen value this short sits on its label's line. */
const INLINE_LENGTH = 28

/**
 * A long identifier on the first screen: its first 8 and last 6 characters, one
 * tap from the complete value. Short values are shown whole.
 */
function identifier(value: string, compact: boolean): HTMLElement {
  if (!compact || value.length <= ELIDE_HEAD + ELIDE_TAIL + 2) {
    const text = element("span", "review-mono")
    setRawText(text, value)
    return text
  }
  const button = element("button", "review-mono review-elided")
  button.type = "button"
  button.setAttribute("aria-expanded", "false")
  button.title = value
  setRawText(button, `${value.slice(0, ELIDE_HEAD)}…${value.slice(-ELIDE_TAIL)}`)
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-expanded") === "true") return
    button.setAttribute("aria-expanded", "true")
    setRawText(button, value)
  })
  return button
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

/** One fact. `compact` is the first screen, where long identifiers are shortened; Details show everything whole. */
function fieldRow(field: ReviewField, compact = false): HTMLElement {
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
  // On the first screen a short fact shares its label's line; notes may wrap below.
  const placed = field.decimals !== undefined && CANONICAL_UNSIGNED.test(field.value) ? decimalPlaced(field.value, field.decimals) : null
  const date = field.time ? utcDate(field.value) : null
  const shownLength = compact && field.shownAs ? 0
    : field.native ? nativeAmount(field.value, field.native, field.unit).length
    : placed !== null || field.time ? INLINE_LENGTH + 1
    : compact && field.elide && field.value.length > ELIDE_HEAD + ELIDE_TAIL + 2 ? ELIDE_HEAD + ELIDE_TAIL + 1
    : field.value.length
  if (compact && field.to === undefined && shownLength + (field.secondary?.length ?? 0) <= INLINE_LENGTH) row.classList.add("review-field-inline")
  if (compact && field.shownAs) {
    const word = element("span", "review-word")
    bindText(word, field.shownAs)
    value.append(word)
  } else if (field.native) {
    const text = element("span", "review-mono")
    setRawText(text, nativeAmount(field.value, field.native, field.unit))
    value.append(text)
  } else if (placed !== null) {
    // The exact decimal amount, then the unchanged integer and the encoded decimals.
    const amount = element("span", "review-mono")
    setRawText(amount, placed)
    const exact = element("span", "review-exact")
    bindText(exact, "review.amount.baseUnitsDecimals", { value: field.value, count: field.decimals })
    value.append(amount, exact)
  } else if (field.time) {
    // The UTC date, then the unchanged integer; a value with no date says so.
    const shown = element("span", "review-mono")
    setRawText(shown, date ?? field.value)
    const exact = element("span", "review-exact")
    if (date === null) bindText(exact, "review.time.noDate")
    else bindText(exact, "review.time.raw", { value: field.value })
    value.append(shown, exact)
  } else {
    value.append(identifier(field.value, compact && field.elide === true))
  }
  if (field.secondary !== undefined) {
    const secondary = element("span", "review-mono review-secondary")
    setRawText(secondary, field.secondary)
    value.append(secondary)
  }
  if (field.to !== undefined) {
    const arrow = element("span", "review-arrow")
    setRawText(arrow, "→")
    value.append(arrow, identifier(field.to, compact))
  }
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
  summary.append(...review.summary.map((field) => fieldRow(field, true)), fieldRow(review.signer, true))
  root.append(summary)

  const details = element("details", "review-details")
  const toggle = element("summary", "review-details-toggle")
  bindText(toggle, "review.details")
  const content = element("div", "review-details-body")
  // Verified facts first; the requester's own metadata after them.
  review.details.forEach((item, position) => {
    const rows = item.fields.map((field) => fieldRow(field))
    // The signer, complete, heads the first group.
    content.append(group(item.title, item.index, position === 0 ? [fieldRow(review.signer), ...rows] : rows))
  })
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
  const record = plainRecord(value, ["label", "index", "name", "value", "native", "unit", "decimals", "time", "to", "secondary", "elide", "shownAs", "notes", "raw", "heading"], path)
  const index = optionalCount(record.index, `${path}.index`)
  // A typed-data field path is the signed structure's own field names (any
  // Unicode), shown as text; every other name is a built-in ABI parameter.
  if (record.name !== undefined && (typeof record.name !== "string"
    || (record.label === "review.field.typedField" ? record.name.length > MAX_TYPED_PATH : !ABI_PARAMETER_NAME.test(record.name)))) {
    fail(`${path}.name is not a valid field name`)
  }
  if (typeof record.value !== "string") fail(`${path}.value must be a string`)
  if (record.native !== undefined && !Object.hasOwn(NATIVE_CURRENCIES, record.native as string)) fail(`${path}.native is not a native currency`)
  if (record.unit !== undefined && (record.native === undefined || (record.unit !== "symbol" && record.unit !== "base"))) fail(`${path}.unit is not a unit of its currency`)
  // One amount form at most: a native currency, encoded decimals, or a time.
  if (record.decimals !== undefined && (typeof record.decimals !== "number" || !Number.isInteger(record.decimals)
    || record.decimals < 0 || record.decimals > 255 || record.native !== undefined)) fail(`${path}.decimals must be an encoded decimal count`)
  if (record.time !== undefined && (record.time !== "unix-seconds" || record.native !== undefined || record.decimals !== undefined)) fail(`${path}.time is not a time form`)
  if (record.to !== undefined && typeof record.to !== "string") fail(`${path}.to must be a string`)
  if (record.secondary !== undefined && typeof record.secondary !== "string") fail(`${path}.secondary must be a string`)
  if (record.elide !== undefined && typeof record.elide !== "boolean") fail(`${path}.elide must be a boolean`)
  const shownAs = record.shownAs === undefined ? undefined : translationKey(record.shownAs, "review.value", `${path}.shownAs`)
  if (record.raw !== undefined && typeof record.raw !== "boolean") fail(`${path}.raw must be a boolean`)
  if (record.heading !== undefined && typeof record.heading !== "boolean") fail(`${path}.heading must be a boolean`)
  // A heading is its label alone; anything else on it would never be shown.
  if (record.heading && (record.value !== "" || record.native !== undefined || record.decimals !== undefined || record.time !== undefined
    || record.notes !== undefined || record.raw !== undefined
    || record.to !== undefined || record.secondary !== undefined || record.elide !== undefined || shownAs !== undefined)) {
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
    ...(record.unit === undefined ? {} : { unit: record.unit as "symbol" | "base" }),
    ...(record.decimals === undefined ? {} : { decimals: record.decimals as number }),
    ...(record.time === undefined ? {} : { time: "unix-seconds" as const }),
    ...(record.to === undefined ? {} : { to: record.to as string }),
    ...(record.secondary === undefined ? {} : { secondary: record.secondary as string }),
    ...(record.elide === undefined ? {} : { elide: record.elide as boolean }),
    ...(shownAs === undefined ? {} : { shownAs }),
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
