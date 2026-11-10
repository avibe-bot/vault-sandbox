import { bindText, setRawText, type I18nKey } from "./i18n"

type Keys<Prefix extends string> = Extract<I18nKey, `${Prefix}.${string}`>

export type ReviewKindKey = Keys<"review.kind">
export type ReviewLabelKey = Keys<"review.field">
export type ReviewNoteKey = Keys<"review.note">
export type ReviewTitleKey = Keys<"review.group">

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

function label(field: ReviewField): HTMLElement {
  const node = element("span", "review-label")
  bindText(node, field.label, field.index === undefined ? undefined : { index: field.index })
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
  const summary = element("div", "review-summary")
  summary.append(fieldRow(review.signer), ...review.summary.map(fieldRow))
  root.append(heading, summary)

  if (review.undecoded) {
    const notice = element("p", "review-notice")
    bindText(notice, "review.notice")
    root.append(notice)
  }

  const details = element("details", "review-details")
  const toggle = element("summary", "review-details-toggle")
  bindText(toggle, "review.details")
  const content = element("div", "review-details-body")
  if (request.rows) content.append(group("review.group.request", undefined, [request.rows]))
  for (const item of review.details) content.append(group(item.title, item.index, item.fields.map(fieldRow)))
  details.append(toggle, content)
  root.append(details)

  target.append(root)
}
