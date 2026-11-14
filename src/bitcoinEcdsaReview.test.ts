import { afterEach, describe, expect, it, vi } from "vitest"
import { assertBitcoinPromptLimits } from "./bitcoinResourceLimits"
import { decodeAuthorizationPrompt, serializeAuthorizationPrompt } from "./authorizationPrompt"
import { closeBitcoinEcdsaSignature, verifyBitcoinEcdsaContext } from "./bitcoinEcdsa"
import { legacyContext, legacyVector, nativeContext, nativeVector } from "./bitcoinEcdsaTestVectors"
import { setLocale } from "./i18n"
import { parseSigningReview, renderSigningReview, type ReviewField, type SigningReview } from "./signingReview"
import { bitcoinEcdsaSigningReview, type BitcoinReturnBoundary } from "./signingReviewFacts"
import { installCardDocument } from "./testDom"

const SCHEME = "ecdsa-secp256k1-der" as const
const ORDINARY: BitcoinReturnBoundary = { kind: "key" }
const ACCOUNT: BitcoinReturnBoundary = { kind: "account", index: 0, path: "m/84'/0'/0'/0/0" }
const values = (fields: ReviewField[], label: string) => fields.filter((field) => field.label === label).map((field) => field.value)
const group = (review: SigningReview, title: string) => review.details.find((item) => item.title === title)!.fields

function native(boundary = ORDINARY) {
  const context = nativeContext()
  const verified = verifyBitcoinEcdsaContext(context, context.digest, nativeVector.public_key)
  return { verified, review: bitcoinEcdsaSigningReview(verified.facts, { scheme: SCHEME, digest: verified.digest, publicKey: nativeVector.public_key, boundary }) }
}
function legacy(boundary = ORDINARY) {
  const context = legacyContext()
  const verified = verifyBitcoinEcdsaContext(context, context.digest, legacyVector.public_key)
  return { context, verified, review: bitcoinEcdsaSigningReview(verified.facts, { scheme: SCHEME, digest: verified.digest, publicKey: legacyVector.public_key, boundary }) }
}
function rendered(review: SigningReview, locale: "en" | "zh") {
  setLocale(locale)
  const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
  renderSigningReview(dom.content as unknown as HTMLElement, review, { session: "Public test session" })
  return dom.content
}

afterEach(() => { setLocale("en"); vi.unstubAllGlobals() })

describe("one Legacy/Native review adapter from verified facts", () => {
  it("round-trips actual generated prompts through the strict paired preflight without omitted values", () => {
    for (const review of [native().review, legacy().review, native(ACCOUNT).review]) {
      const prompt = serializeAuthorizationPrompt({
        title: "sign.title", subtitle: { text: "PUBLIC_TEST_KEY" }, label: "sign.confirm", review,
        reviewSession: "Public test session", challenge: new Uint8Array(32),
      })
      expect(() => assertBitcoinPromptLimits(prompt)).not.toThrow()
      expect(decodeAuthorizationPrompt(structuredClone(prompt)).review).toEqual(review)
    }
  })
  it("leads with every output in order, the fee with its outward-rounded rate range, the net, then recipients and requester network", () => {
    const { review, verified } = native()
    const facts = verified.facts
    expect(review.kind).toBe("review.kind.bitcoinNativeTransfer")
    expect(review.undecoded).toBe(false)
    expect(review.signer).toEqual({ label: "review.field.signingAddress", value: facts.spendingAddress, elide: true })
    // Independent public vector: output 0 is this key's own P2WPKH, output 1 a Taproot recipient.
    expect(facts.outputs.map((output) => output.returned)).toEqual([true, false])
    expect(review.summary).toEqual([
      { label: "review.field.returnToKey", value: "90000", native: "btc", unit: "symbol" },
      { label: "review.field.send", value: "59000", native: "btc", unit: "symbol", to: facts.outputs[1].address },
      { label: "review.field.fee", value: "1000", native: "btc", unit: "base", secondary: `${facts.rate.lower} – ${facts.rate.upper} sat/vB` },
      { label: "review.field.netLeaving", value: "60000", native: "btc", unit: "symbol" },
      { label: "review.field.recipientAddress", value: facts.outputs[1].address },
      { label: "review.field.network", value: "bitcoin", notes: ["review.note.requesterNetwork"] },
    ])
    // 125-byte unsigned template: vsize 137..153; floor(100000/153)=653, ceil(100000/137)=730.
    expect(facts.rate).toMatchObject({ lower: "6.53", upper: "7.30" })
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it("names the account boundary and exact HD path only for an HD account; ordinary says this key", () => {
    const ordinary = native().review
    const account = native(ACCOUNT).review
    expect(values(ordinary.summary, "review.field.returnToKey")).toEqual(["90000"])
    expect(values(account.summary, "review.field.returnToAccount")).toEqual(["90000"])
    expect(values(account.summary, "review.field.netLeavingAccount")).toEqual(["60000"])
    expect(values(group(account, "review.group.transaction"), "review.field.walletAccount")).toEqual(["#0"])
    expect(values(group(account, "review.group.transaction"), "review.field.derivationPath")).toEqual(["m/84'/0'/0'/0/0"])
    expect(values(group(ordinary, "review.group.transaction"), "review.field.derivationPath")).toEqual([])
    expect(JSON.stringify(ordinary)).not.toContain("returnToAccount")
  })

  it("Native says its amount is the requester's, committed by the signature, not chain-verified; shows the length-prefixed scriptCode", () => {
    const { review, verified } = native()
    const input = group(review, "review.group.transaction").find((field) => field.label === "review.field.inputAmount")!
    expect(input.notes).toEqual(["review.note.nativeAmountSupplied", "review.note.nativeFormOnly"])
    expect(values(group(review, "review.group.exact"), "review.field.scriptCode")).toEqual([`19${nativeVector.script_code}`])
    const template = group(review, "review.group.transaction").find((field) => field.label === "review.field.unsignedTemplateHash")!
    expect(template.notes).toEqual(["review.note.finalTxidUnchanged"])
    expect(template.value).toBe(closeBitcoinEcdsaSignature(nativeContext(), verified.digest, nativeVector.public_key, nativeVector.der).txid)
    expect(values(group(review, "review.group.transaction"), "review.field.parentTxid")).toEqual([])
  })

  it("Legacy carries the complete funding transaction once, its txid, the indirect-amount note and the not-final-txid note", () => {
    const { review, context } = legacy()
    expect(review.kind).toBe("review.kind.bitcoinLegacyTransfer")
    const details = group(review, "review.group.transaction")
    expect(details.find((field) => field.label === "review.field.inputAmount")!.notes)
      .toEqual(["review.note.legacyAmountFromParent", "review.note.legacyNoAmountField"])
    expect(details.find((field) => field.label === "review.field.unsignedTemplateHash")!.notes).toEqual(["review.note.notFinalTxid"])
    expect(values(details, "review.field.parentTxid")).toEqual([context.prevout.txid])
    const proof = group(review, "review.group.exact").filter((field) => field.label === "review.field.parentTransaction")
    expect(proof).toEqual([{ label: "review.field.parentTransaction", value: context.prevout.parentTransaction, notes: [{ key: "review.note.bytes", count: context.prevout.parentTransaction.length / 2 }], raw: true }])
    expect(JSON.stringify(review.summary)).not.toContain(context.prevout.parentTransaction)
    expect(values(group(review, "review.group.exact"), "review.field.scriptCode")).toEqual([])
  })

  it("keeps every output's complete address, type, role, exact amount and full script in Details", () => {
    const { review, verified } = native()
    const details = group(review, "review.group.transaction")
    verified.facts.outputs.forEach((output) => {
      const row = details.find((field) => field.label === "review.field.outputIndexed" && field.index === output.index + 1)!
      expect(row.value).toBe(output.address)
      expect(row.notes).toEqual([output.kind === "p2wpkh" ? "review.note.scriptP2wpkh" : "review.note.scriptP2tr", output.returned ? "review.note.sameKeyReturn" : "review.note.recipient"])
      expect(details.find((field) => field.label === "review.field.outputAmountIndexed" && field.index === output.index + 1)!.value).toBe(output.amountSats.toString())
      expect(group(review, "review.group.exact").find((field) => field.label === "review.field.outputScriptIndexed" && field.index === output.index + 1)!.value).toBe(output.scriptPubKey)
    })
    expect(values(details, "review.field.sighashType")).toEqual(["SIGHASH_ALL (0x01)"])
    expect(values(details, "review.field.digest")).toEqual([verified.digest])
  })

  it.each([["en", "Bitcoin · Native SegWit (P2WPKH) transfer", "Returning to this wallet account", "Net leaving this wallet account"], ["zh", "Bitcoin · Native SegWit（P2WPKH）转账", "退回此钱包账户", "实际离开此钱包账户"]] as const)(
    "renders %s labels as sandbox translations, not requester text, with no unresolved keys",
    (locale, kind, back, net) => {
      const page = rendered(native(ACCOUNT).review, locale)
      expect(page.querySelector(".review-kind")!.textContent).toBe(kind)
      const labels = page.querySelector(".review-summary")!.querySelectorAll(".review-label").map((node) => node.textContent)
      expect(labels).toContain(back)
      expect(labels).toContain(net)
      expect(page.textContent).not.toMatch(/review\.|\{\{/)
    },
  )

  it("renders the complete Legacy proof bytes in Details without truncation, in both locales", () => {
    const { review, context } = legacy()
    for (const locale of ["en", "zh"] as const) {
      const page = rendered(review, locale)
      const raw = page.querySelector(".review-details")!.querySelectorAll(".review-raw").map((node) => node.textContent)
      expect(raw).toContain(context.prevout.parentTransaction)
    }
  })
})
