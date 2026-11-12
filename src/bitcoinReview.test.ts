import { afterEach, describe, expect, it, vi } from "vitest"
import codec from "./fixtures/vault-protected-bitcoin-codec.json"
import policy from "./fixtures/vault-protected-bitcoin-policy.json"
import { verifyBitcoinSigningContext } from "./bitcoin"
import { setLocale } from "./i18n"
import { parseSigningReview, renderSigningReview, type ReviewField, type SigningReview } from "./signingReview"
import { bitcoinSigningReview } from "./signingReviewFacts"
import { installCardDocument } from "./testDom"

// The structured Bitcoin review from the verifier's own facts. Expectations come
// from the independent codec/policy fixtures (Bitcoin Core-derived), not from it.

const SCHEME = "schnorr-secp256k1-bip341-keypath" as const
const valueOf = (fields: ReviewField[], label: string) => fields.filter((field) => field.label === label).map((field) => field.value)
const transaction = (review: SigningReview) => review.details.find((group) => group.title === "review.group.transaction")!.fields

function review(vector: { context: unknown; publicKey?: string }, publicKey = vector.publicKey ?? policy.publicKey) {
  const context = vector.context as { digest: string }
  const verified = verifyBitcoinSigningContext(context, context.digest, publicKey)
  return { verified, review: bitcoinSigningReview(verified.facts, { scheme: SCHEME, digest: verified.digest }) }
}

afterEach(() => { setLocale("en"); vi.unstubAllGlobals() })

describe("Bitcoin facts to signing review", () => {
  it.each(codec.cases)("$id: recipient and return, fee, net leaving and the network badge match the independent fixture", (vector) => {
    const { review: btc } = review(vector)
    const expected = vector.expected
    expect(btc.kind).toBe("review.kind.bitcoinTransfer")
    expect(btc.undecoded).toBe(false)
    expect(btc.warnings).toBeUndefined()
    expect(btc.signer).toEqual({ label: "review.field.signingAddress", value: expected.inputAddress })
    expect(btc.summary[0]).toEqual({ label: "review.field.network", value: (vector.context as { network: string }).network, notes: ["review.note.requesterNetwork"] })
    // The P2TR output equal to the spent script returns to this key; every other output is a recipient.
    const returns = expected.outputs.filter((output) => output.scriptPubKey === (vector.context as { prevout: { scriptPubKey: string } }).prevout.scriptPubKey)
    const recipients = expected.outputs.filter((output) => !returns.includes(output))
    expect(valueOf(btc.summary, "review.field.to")).toEqual(recipients.map((output) => output.address))
    expect(valueOf(btc.summary, "review.field.amount")).toEqual(recipients.map((output) => String(output.amountSats)))
    expect(valueOf(btc.summary, "review.field.returnToKey")).toEqual(returns.map((output) => output.address))
    expect(valueOf(btc.summary, "review.field.returnAmount")).toEqual(returns.map((output) => String(output.amountSats)))
    expect(btc.summary.filter((field) => field.native === "btc").map((field) => field.label)).toEqual(expect.arrayContaining(["review.field.fee", "review.field.netLeaving"]))
    expect(valueOf(btc.summary, "review.field.fee")).toEqual([String(expected.feeSats)])
    expect(valueOf(btc.summary, "review.field.netLeaving")).toEqual([String(expected.netLeavingKeySats)])
    // Details keep every technical fact the prose review had.
    const details = transaction(btc)
    expect(valueOf(details, "review.field.unsignedTxid")).toEqual([expected.txid])
    expect(valueOf(details, "review.field.signedVsize")).toEqual([String(expected.vsize)])
    expect(details.find((field) => field.label === "review.field.sequence")!.notes).toEqual([expected.signalsRbf ? "review.note.rbfSignals" : "review.note.rbfDoesNotSignal"])
    expect(valueOf(details, "review.field.internalKey")).toEqual([(vector.publicKey as string).slice(2)])
    expect(valueOf(details, "review.field.outputIndexed")).toEqual(expected.outputs.map((output) => output.address))
    const exact = btc.details.find((group) => group.title === "review.group.exact")!.fields
    expect(exact[0]).toMatchObject({ label: "review.field.unsignedTransaction", value: (vector.context as { unsignedTransaction: string }).unsignedTransaction, raw: true })
    expect(parseSigningReview(JSON.parse(JSON.stringify(btc)))).toEqual(btc)
  })

  it.each(policy.valid)("$id: the high-fee warning appears exactly when the verifier flags it; thresholds unchanged", (vector) => {
    const { review: btc, verified } = review(vector)
    expect(verified.facts.highFeeWarning).toBe(vector.expected.highFee)
    expect(btc.warnings).toEqual(vector.expected.highFee ? ["review.warning.highFee"] : undefined)
    expect(valueOf(btc.summary, "review.field.fee")).toEqual([String(vector.expected.feeSats)])
  })

  it("shows the warning first, then the network badge, recipient and exact BTC beside sats, in both locales", () => {
    const vector = policy.valid.find((candidate) => candidate.id === "percent-above-warning")!
    const { review: btc } = review(vector)
    for (const [locale, text] of [
      ["en", { warning: "This fee is above the V1 review threshold (100 sat/vB or 2% of the input).", network: "selected by the requester, not proven on chain", kind: "Bitcoin · transfer" }],
      ["zh", { warning: "手续费高于 V1 审核阈值（100 sat/vB 或输入金额的 2%）。", network: "请求方标注，未经链上证明", kind: "Bitcoin · 转账" }],
    ] as const) {
      setLocale(locale)
      const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
      renderSigningReview(dom.content as unknown as HTMLElement, btc, { session: "Public test session" })
      const root = dom.content.querySelector(".review")!
      expect(root.children.map((node) => node.className)).toEqual(["review-heading", "review-warning", "review-summary", "review-details"])
      expect(dom.content.querySelector(".review-kind")!.textContent).toBe(text.kind)
      expect(dom.content.querySelector(".review-warning-text")!.textContent).toBe(text.warning)
      expect(dom.content.querySelectorAll(".review-notice")).toHaveLength(0)
      const summary = dom.content.querySelector(".review-summary")!
      expect(summary.querySelectorAll(".review-note")[0].textContent).toBe(text.network)
      const amounts = summary.querySelectorAll(".review-mono").map((node) => node.textContent)
      expect(amounts).toContain(`0.00002001 BTC (2001 sats)`)
    }
  })

  it("never names a currency other than BTC or rounds: exact digits at the smallest and largest amounts", () => {
    const { review: btc } = review(policy.valid.find((candidate) => candidate.id === "dust-at-floor")!)
    setLocale("en")
    const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
    renderSigningReview(dom.content as unknown as HTMLElement, btc)
    for (const text of dom.content.querySelector(".review-summary")!.querySelectorAll(".review-mono").map((node) => node.textContent)) {
      if (/BTC/.test(text)) expect(text).toMatch(/^\d+(\.\d{1,8})? BTC \(\d+ sats\)$/)
      expect(text).not.toMatch(/ETH|SOL|wei|lamports/)
    }
  })
})
