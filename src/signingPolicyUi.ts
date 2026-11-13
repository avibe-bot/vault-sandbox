import { bindText, setRawText, type I18nKey } from "./i18n"
import type { AuthorizationCard } from "./authorizationPrompt"
import type { PolicyDowngradeContext } from "./signingPolicyDowngrade"

// This card is built locally from the parsed context in BOTH the launcher and
// the paired popup. Neither title/copy nor adjacent parent-supplied labels ride
// on the policy authorization channel. Addresses are server-asserted facts.
export function policyAuthorizationCard(context: PolicyDowngradeContext): AuthorizationCard & { policyDowngrade: PolicyDowngradeContext } {
  return {
    title: "policyDowngrade.title", subtitle: { text: context.target.name },
    confirmLabel: "policyDowngrade.confirm", policyDowngrade: context,
  }
}

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  return element
}

type RowValue = string | { key: I18nKey; params?: Record<string, string | number> }

// Identifiers stay monospace; first-screen prose values use the sans review word style.
function row(label: I18nKey, value: RowValue, style: "mono" | "word" = "mono"): HTMLElement {
  const field = node("div", "review-field")
  const title = node("span", "review-label")
  bindText(title, label)
  const content = node("div", "review-value")
  const text = node("span", style === "word" ? "review-word" : "review-mono")
  if (typeof value === "string") setRawText(text, value)
  else bindText(text, value.key, value.params)
  content.append(text)
  field.append(title, content)
  return field
}

function paragraph(key: I18nKey, className: string): HTMLElement {
  const text = node("p", className)
  bindText(text, key)
  return text
}

export function renderPolicyDowngradeReview(target: HTMLElement, context: PolicyDowngradeContext): void {
  setRawText(target, "")
  const { target: record } = context
  const review = node("div", "review policy-downgrade-review")
  review.append(record.protection === "standard"
    ? paragraph("policyDowngrade.standardWarning", "review-warning")
    : paragraph("policyDowngrade.protectedNotice", "review-info"))
  const summary = node("div", "review-summary")
  summary.append(
    row("policyDowngrade.setting", { key: "policyDowngrade.settingValue" }, "word"),
    row("policyDowngrade.key", record.name),
    row("policyDowngrade.tier", { key: record.protection === "standard" ? "policyDowngrade.standard" : "policyDowngrade.protected" }, "word"),
  )
  if (record.account !== null) {
    summary.append(
      row("policyDowngrade.account", record.accountName !== null
        ? { key: "policyDowngrade.accountNamed", params: { index: record.account, name: record.accountName } }
        : { key: "policyDowngrade.accountUnnamed", params: { index: record.account } }, "word"),
      row("policyDowngrade.appliesTo", { key: "policyDowngrade.appliesToValue" }, "word"),
    )
  }
  review.append(summary, paragraph("policyDowngrade.onlyPolicy", "confirmation-note"))
  const details = node("details", "review-details")
  const toggle = node("summary", "review-details-toggle")
  bindText(toggle, "policyDowngrade.details")
  const body = node("div", "review-details-body")
  const addresses: Array<[keyof typeof record.addresses, I18nKey]> = [
    ["eth", "policyDowngrade.eth"], ["btc_legacy", "policyDowngrade.btcLegacy"],
    ["btc_segwit", "policyDowngrade.btcSegwit"], ["btc_taproot", "policyDowngrade.btcTaproot"], ["solana", "policyDowngrade.solana"],
  ]
  body.append(paragraph("policyDowngrade.serverFacts", "confirmation-note"))
  for (const [field, label] of addresses) {
    const address = record.addresses[field]
    if (address !== null) body.append(row(label, address))
    else if (record.signerKind === "hd-seed") body.append(row(label, { key: "policyDowngrade.notUsed" }))
  }
  body.append(
    row("policyDowngrade.recordId", record.secretId), row("policyDowngrade.identity", record.identitySha256),
    row("policyDowngrade.revision", context.change.revision), row("policyDowngrade.expires", context.expiresAt),
    row("policyDowngrade.challengeId", context.challengeId),
  )
  details.append(toggle, body)
  review.append(details)
  target.append(review)
}
