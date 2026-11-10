import { bindText, setRawText, type I18nKey } from "./i18n"

type Keys<Prefix extends string> = Extract<I18nKey, `${Prefix}.${string}`>

export type ReviewKindKey = Keys<"review.kind">
export type ReviewLabelKey = Keys<"review.field">
export type ReviewNoteKey = Keys<"review.note">
export type ReviewTitleKey = Keys<"review.group">

/** A sandbox-owned qualifier. `count` fills `{{count}}`, e.g. a byte length. */
export type ReviewNote = ReviewNoteKey | { key: ReviewNoteKey; count: number }

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
  /** The protected record's own public key or address, not requester text. */
  signingKey: string
  summary: ReviewField[]
  /** Any part that is not decoded or resolved. Shows the one notice line. */
  undecoded: boolean
  details: ReviewGroup[]
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
  setRawText(text, field.value)
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
 * confirmation body. `request` is the existing daemon-signed request rows; they
 * become the first Details group so the summary holds verified facts only.
 */
export function renderSigningReview(target: HTMLElement, review: SigningReview, request?: HTMLElement): void {
  setRawText(target, "")
  const root = element("div", "review")

  const kind = element("p", "review-kind")
  bindText(kind, review.kind)
  const summary = element("div", "review-summary")
  summary.append(fieldRow({ label: "review.field.signingKey", value: review.signingKey }), ...review.summary.map(fieldRow))
  root.append(kind, summary)

  if (review.undecoded) {
    const notice = element("p", "review-notice")
    bindText(notice, "review.notice")
    root.append(notice)
  }

  const details = element("details", "review-details")
  const toggle = element("summary", "review-details-toggle")
  bindText(toggle, "review.details")
  const content = element("div", "review-details-body")
  if (request) content.append(group("review.group.request", undefined, [request]))
  for (const item of review.details) content.append(group(item.title, item.index, item.fields.map(fieldRow)))
  details.append(toggle, content)
  root.append(details)

  target.append(root)
}
