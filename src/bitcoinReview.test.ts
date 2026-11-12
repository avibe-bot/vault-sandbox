import { afterEach, describe, expect, it, vi } from "vitest"
import codec from "./fixtures/vault-protected-bitcoin-codec.json"
import core from "./fixtures/vault-protected-bitcoin-core.json"
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
    expect(btc.signer).toEqual({ label: "review.field.signingAddress", value: expected.inputAddress, elide: true })
    // The P2TR output equal to the spent script returns to this key; every other output is a recipient.
    const spent = (vector.context as { prevout: { scriptPubKey: string } }).prevout.scriptPubKey
    const recipients = expected.outputs.filter((output) => output.scriptPubKey !== spent)
    // What leaves, to whom and what it costs, in transaction order; this key's own address is never repeated.
    expect(btc.summary).toEqual([
      ...expected.outputs.map((output) => output.scriptPubKey === spent
        ? { label: "review.field.returnToKey", value: String(output.amountSats), native: "btc", unit: "symbol" }
        : { label: "review.field.send", value: String(output.amountSats), native: "btc", unit: "symbol", to: output.address }),
      { label: "review.field.fee", value: String(expected.feeSats), native: "btc", unit: "base", secondary: expect.stringMatching(/ sat\/vB$/) },
      { label: "review.field.netLeaving", value: String(expected.netLeavingKeySats), native: "btc", unit: "symbol" },
      // Then the complete recipient addresses and the requester-selected network.
      ...recipients.map((output) => ({ label: "review.field.recipientAddress", value: output.address })),
      { label: "review.field.network", value: (vector.context as { network: string }).network, notes: ["review.note.requesterNetwork"] },
    ])
    expect(JSON.stringify(btc.summary)).not.toContain(expected.inputAddress)
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

  it("shows a self-transfer as the same-key return, fee and net: no recipient is invented", () => {
    const vector = core.cases.find((candidate) => candidate.id === "p-even-q-odd-self-legacy-parent")!
    const key = core.keys.find((candidate) => candidate.id === vector.signing_key_id)!
    const { review: btc } = review({
      context: {
        kind: "bitcoin-taproot-keypath-v1", network: "signet", unsignedTransaction: vector.unsigned_tx_hex,
        prevout: { amountSats: vector.funding.spent_output_value_sats, scriptPubKey: vector.funding.spent_output_script_hex },
        digestAlgorithm: "bip341-sighash-default-keypath", digest: vector.expected.taproot_digest_hex,
      },
    }, key.internal_pubkey_compressed_hex)
    const fee = vector.funding.spent_output_value_sats - vector.outputs[0].value_sats
    expect(btc.summary.map((field) => [field.label, field.value])).toEqual([
      ["review.field.returnToKey", String(vector.outputs[0].value_sats)],
      ["review.field.fee", String(fee)],
      ["review.field.netLeaving", String(fee)],
      ["review.field.network", "signet"],
    ])
    expect(btc.summary.some((field) => field.to !== undefined || field.label === "review.field.send" || field.label === "review.field.recipientAddress")).toBe(false)
  })

  it("shows the warning first, then the amount to the shortened recipient, the fee and the net, in both locales", () => {
    const vector = policy.valid.find((candidate) => candidate.id === "percent-above-warning")!
    const { review: btc } = review(vector)
    for (const [locale, text] of [
      ["en", { warning: "This fee is above the V1 review threshold (100 sat/vB or 2% of the input).", network: "selected by the requester, not proven on chain", kind: "Bitcoin · transfer", send: "Send", back: "Returning to this key" }],
      ["zh", { warning: "手续费高于 V1 审核阈值（100 sat/vB 或输入金额的 2%）。", network: "请求方标注，未经链上证明", kind: "Bitcoin · 转账", send: "转出", back: "退回此密钥" }],
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
      // A self-transfer: the return to this key, the fee in sats beside its rate, and the net.
      expect(summary.querySelectorAll(".review-field")[0].querySelector(".review-label")!.textContent).toBe(text.back)
      const amounts = summary.querySelectorAll(".review-mono").map((node) => node.textContent)
      expect(amounts).toContain("2001 sats")
      expect(amounts).not.toContain("2001")

      // A payment: the amount to the shortened recipient on one line; the complete address follows.
      const paying = review(codec.cases.find((candidate) => (candidate.expected.outputs as Array<{ scriptPubKey: string }>)
        .some((output) => output.scriptPubKey !== (candidate.context as { prevout: { scriptPubKey: string } }).prevout.scriptPubKey))!).review
      const page = installCardDocument((name, value) => vi.stubGlobal(name, value))
      renderSigningReview(page.content as unknown as HTMLElement, paying)
      const position = paying.summary.findIndex((field) => field.label === "review.field.send")
      const send = page.content.querySelector(".review-summary")!.querySelectorAll(".review-field")[position]
      expect(send.querySelector(".review-label")!.textContent).toBe(text.send)
      const recipient = paying.summary[position].to!
      const amount = send.querySelector(".review-mono")!.textContent
      expect(amount).toMatch(/^\d+(\.\d+)? BTC$/)
      expect(send.querySelector(".review-value")!.textContent).toBe(`${amount}→${recipient.slice(0, 8)}…${recipient.slice(-6)}`)
      expect(page.content.querySelector(".review-summary")!.querySelectorAll(".review-mono").map((node) => node.textContent)).toContain(recipient)
    }
  })

  it("never names a currency other than BTC or rounds: exact digits at the smallest and largest amounts", () => {
    const { review: btc } = review(policy.valid.find((candidate) => candidate.id === "dust-at-floor")!)
    setLocale("en")
    const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
    renderSigningReview(dom.content as unknown as HTMLElement, btc)
    for (const text of dom.content.querySelector(".review-summary")!.querySelectorAll(".review-mono").map((node) => node.textContent)) {
      if (/BTC/.test(text)) expect(text).toMatch(/^\d+(\.\d{1,8})? BTC$/)
      if (/sats/.test(text)) expect(text).toMatch(/^\d+ sats$/)
      expect(text).not.toMatch(/ETH|SOL|wei|lamports/)
    }
  })
})
