import { afterEach, describe, expect, it, vi } from "vitest"
import { assertBitcoinPromptLimits } from "./bitcoinResourceLimits"
import { decodeAuthorizationPrompt, serializeAuthorizationPrompt } from "./authorizationPrompt"
import { bytesToHex, hexToBytes } from "@noble/curves/utils.js"
import { parseTransaction } from "./bitcoin"
import { closeBitcoinEcdsaSignature, bitcoinEcdsaSighash, bitcoinKeyScripts, parseBitcoinFundingTransaction, verifyBitcoinEcdsaContext } from "./bitcoinEcdsa"
import { funding, legacyContext, legacyVector, nativeContext, nativeVector } from "./bitcoinEcdsaTestVectors"
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
  it("carries a legal exact-1MiB parent through verified facts and the actual paired prompt decoder without truncation", () => {
    const context = legacyContext()
    const script = bitcoinKeyScripts(legacyVector.public_key).p2pkh
    const outputs = [
      { amount: BigInt(context.prevout.amountSats), script },
      ...Array.from({ length: 104 }, () => ({ amount: 0n, script: new Uint8Array(10_000) })),
      { amount: 0n, script: new Uint8Array() },
    ]
    const emptySize = funding(outputs, new Uint8Array()).length / 2
    // The last script grows from a one-byte length to a three-byte CompactSize.
    outputs[outputs.length - 1].script = new Uint8Array(1_048_576 - emptySize - 2)
    context.prevout.parentTransaction = funding(outputs, new Uint8Array())
    expect(context.prevout.parentTransaction.length / 2).toBe(1_048_576)
    const parent = parseBitcoinFundingTransaction(context.prevout.parentTransaction)
    context.prevout.txid = parent.txid
    const spend = hexToBytes(context.unsignedTransaction)
    spend.set(parent.hash, 5)
    context.unsignedTransaction = bytesToHex(spend)
    context.digest = bitcoinEcdsaSighash(parseTransaction(context.unsignedTransaction), "p2pkh", BigInt(context.prevout.amountSats), script)
    const verified = verifyBitcoinEcdsaContext(context, context.digest, legacyVector.public_key)
    const review = bitcoinEcdsaSigningReview(verified.facts, { scheme: SCHEME, digest: context.digest, publicKey: legacyVector.public_key, boundary: ORDINARY })
    const prompt = serializeAuthorizationPrompt({
      title: "sign.title", subtitle: { text: "PUBLIC_TEST_KEY" }, label: "sign.confirm", review,
      reviewSession: "Public test session", challenge: new Uint8Array(32),
    })
    assertBitcoinPromptLimits(prompt) // sender, before product-controlled postMessage
    const received = structuredClone(prompt) // simulate the browser's delivery clone
    assertBitcoinPromptLimits(received) // receiver, before decode walks the fields
    const decoded = decodeAuthorizationPrompt(received)
    const proof = decoded.review!.details.flatMap((item) => item.fields).filter((field) => field.label === "review.field.parentTransaction")
    expect(proof).toHaveLength(1)
    expect(proof[0].raw).toBe(true)
    expect(proof[0].value.length).toBe(2_097_152)
    expect(proof[0].value === context.prevout.parentTransaction).toBe(true)
    expect(verified.facts.feeSats).toBe(1000n)
  })
  it("groups the change-first vector as send, return, fee with outward-rounded rate range, net, then recipients and requester network", () => {
    const { review, verified } = native()
    const facts = verified.facts
    expect(review.kind).toBe("review.kind.bitcoinNativeTransfer")
    expect(review.undecoded).toBe(false)
    expect(review.signer).toEqual({ label: "review.field.signingAddress", value: facts.spendingAddress, elide: true })
    // Independent public vector: output 0 is this key's own P2WPKH, output 1 a Taproot recipient.
    expect(facts.outputs.map((output) => output.returned)).toEqual([true, false])
    expect(review.summary).toEqual([
      { label: "review.field.send", value: "59000", native: "btc", unit: "symbol", to: facts.outputs[1].address },
      { label: "review.field.returnToKey", value: "90000", native: "btc", unit: "symbol" },
      { label: "review.field.fee", value: "1000", native: "btc", unit: "base", secondary: `${facts.rate.lower} – ${facts.rate.upper} sat/vB` },
      { label: "review.field.netLeaving", value: "60000", native: "btc", unit: "symbol" },
      { label: "review.field.recipientAddress", value: facts.outputs[1].address },
      { label: "review.field.network", value: "bitcoin", notes: ["review.note.requesterNetwork"] },
    ])
    // 125-byte unsigned template: vsize 137..153; floor(100000/153)=653, ceil(100000/137)=730.
    expect(facts.rate).toMatchObject({ lower: "6.53", upper: "7.30" })
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it.each(["legacy", "native"] as const)("%s change-first: Details, raw bytes, digest and verified outputs keep transaction order and indices", (type) => {
    // Verifier facts first; snapshot and freeze them BEFORE the real adapter runs.
    const context = type === "legacy" ? legacyContext() : nativeContext()
    const publicKey = type === "legacy" ? legacyVector.public_key : nativeVector.public_key
    const verified = verifyBitcoinEcdsaContext(context, context.digest, publicKey)
    const snapshot = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v)
    const before = { outputs: snapshot(verified.facts.outputs), context: snapshot(context), digest: verified.digest }
    verified.facts.outputs.forEach((output) => Object.freeze(output))
    Object.freeze(verified.facts.outputs)
    expect(verified.facts.outputs.map((output) => output.returned)).toEqual([true, false])
    const review = bitcoinEcdsaSigningReview(verified.facts, { scheme: SCHEME, digest: verified.digest, publicKey, boundary: ORDINARY })
    expect({ outputs: snapshot(verified.facts.outputs), context: snapshot(context), digest: verified.digest }).toEqual(before)
    expect(review.summary.slice(0, 4).map((field) => field.label)).toEqual(["review.field.send", "review.field.returnToKey", "review.field.fee", "review.field.netLeaving"])
    const details = group(review, "review.group.transaction")
    expect(details.filter((field) => field.label === "review.field.outputIndexed").map((field) => [field.index, field.value]))
      .toEqual(verified.facts.outputs.map((output) => [output.index + 1, output.address]))
    expect(values(details, "review.field.outputAmountIndexed")).toEqual(["90000", "59000"])
    expect(values(group(review, "review.group.exact"), "review.field.unsignedTransaction")).toEqual([verified.context.unsignedTransaction])
    expect(values(details, "review.field.digest")).toEqual([verified.context.digest])
  })

  it("names the account boundary and exact HD path only for an HD account; ordinary says this key", () => {
    const ordinary = native().review
    const account = native(ACCOUNT).review
    expect(values(ordinary.summary, "review.field.returnToKey")).toEqual(["90000"])
    expect(values(account.summary, "review.field.returnToAccount")).toEqual(["90000"])
    expect(values(account.summary, "review.field.netLeavingAccount")).toEqual(["60000"])
    // The selected receiving index and exact purpose path are on the first screen too.
    expect(values(account.summary, "review.field.walletAccount")).toEqual(["#0 · m/84'/0'/0'/0/0"])
    expect(values(ordinary.summary, "review.field.walletAccount")).toEqual([])
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
    // Native names its spent-output script as requested, never as a checked fact.
    expect(group(review, "review.group.exact").find((field) => field.label === "review.field.requestedPrevoutScript"))
      .toEqual({ label: "review.field.requestedPrevoutScript", value: nativeVector.prevout_script_pubkey, notes: ["review.note.requestedNativeScript"] })
    expect(values(group(review, "review.group.exact"), "review.field.prevoutScript")).toEqual([])
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
    expect(group(review, "review.group.exact").find((field) => field.label === "review.field.prevoutScript"))
      .toEqual({ label: "review.field.prevoutScript", value: context.prevout.scriptPubKey, notes: ["review.note.scriptFromParent"] })
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
