import { describe, expect, it } from "vitest"
import { hexToBytes } from "@noble/curves/utils.js"
import pt1 from "./fixtures/solana-pt1-acceptance.json"
import corpus from "./fixtures/solana-acceptance/corpus.json"
import { parseSigningReview, type ReviewField, type SigningReview } from "./signingReview"
import { solanaSigningReview } from "./signingReviewFacts"
import { syntheticTransfersMessage, type SyntheticTransferKind } from "./signTestFixtures"
import { parseSolanaMessage } from "./solana/message"
import { RECENT_BLOCKHASHES_SYSVAR_ID } from "./solana/transfers"

// AdvanceNonceAccount decoding and review. Layout, near misses, the sysvar and
// lookup-loaded accounts are covered by the upstream Rust vectors in
// solana/message.test.ts; this file covers the real P-T1 messages and the review.

const labels = (fields: ReviewField[]) => fields.map((field) => field.label)
const group = (review: SigningReview, index: number) => review.details.find((entry) => entry.title === "review.group.instruction" && entry.index === index)!

function synthetic(kinds: SyntheticTransferKind[]) {
  const message = syntheticTransfersMessage(kinds)
  const facts = parseSolanaMessage(hexToBytes(message.messageHex), hexToBytes(corpus.keys[0].publicKeyHex))
  return { ...message, facts, review: solanaSigningReview(facts) }
}

describe("the owner's P-T1 messages (public mainnet bytes)", () => {
  it.each(pt1.cases)("$id decodes as independently decoded with @solana/web3.js", (vector) => {
    const facts = parseSolanaMessage(hexToBytes(vector.messageHex), hexToBytes(pt1.signer.publicKeyHex))
    expect(facts.version).toBe(vector.expected.version)
    expect(facts.feePayer).toBe(vector.expected.feePayer)
    expect(facts.recentBlockhash).toBe(vector.expected.blockhashOrNonceValue)
    expect(facts.hasUndecodedContent).toBe(vector.expected.hasUndecodedContent)
    expect(facts.instructions.map((instruction) => ({
      programId: instruction.programId,
      accountIndexes: instruction.accounts.map((account) => account.index),
      dataHex: instruction.dataHex,
      decoded: instruction.decoded,
    }))).toEqual(vector.expected.instructions)
  })

  it("reviews the broadcast durable-nonce transfer with no blind-signing notice", () => {
    const vector = pt1.cases[0]
    const review = solanaSigningReview(parseSolanaMessage(hexToBytes(vector.messageHex), hexToBytes(pt1.signer.publicKeyHex)))
    expect(review.undecoded).toBe(false)
    expect(review.kind).toBe("review.kind.solanaTransaction")
    expect(review.summary).toEqual([
      { label: "review.field.instructions", value: "2", notes: [{ key: "review.note.transfersDecoded", count: 1 }, { key: "review.note.nonceAdvances", count: 1 }] },
      { label: "review.field.advanceNonce", value: "", heading: true },
      { label: "review.field.nonceAccount", value: "DiamF8Lap2UcwbdWafd5FkE2hjxT4nZqwNLJjobZyweE" },
      { label: "review.field.nonceAuthority", value: "Dna8mRXubQx8KSKmmgMHA7GTrHBtW1GGJFonuWU7ABHW" },
      { label: "review.field.transferToken", index: 1, value: "", heading: true },
      { label: "review.field.toTokenAccount", value: "FGVv2gMxaZLEGWSBxMdzV2bKJe751E8tMNhRB7o2MhWm" },
      { label: "review.field.amount", value: "10000000", notes: ["review.note.baseUnits", { key: "review.note.decimals", count: 9 }] },
      { label: "review.field.mint", value: "7BgBvyjrZX1YKz4oh9mjb8ZScatkkwb8DzFx7LoiVkM3" },
    ])
    expect(group(review, 1).fields).toEqual([
      { label: "review.field.program", value: "11111111111111111111111111111111", notes: ["review.note.systemProgram"] },
      { label: "review.field.instruction", value: "AdvanceNonceAccount" },
      { label: "review.field.nonceAccount", value: "DiamF8Lap2UcwbdWafd5FkE2hjxT4nZqwNLJjobZyweE" },
      { label: "review.field.recentBlockhashesSysvar", value: RECENT_BLOCKHASHES_SYSVAR_ID },
      { label: "review.field.nonceAuthority", value: "Dna8mRXubQx8KSKmmgMHA7GTrHBtW1GGJFonuWU7ABHW" },
      { label: "review.field.accountIndexes", value: "1, 5, 0" },
      { label: "review.field.data", value: "04000000", notes: [{ key: "review.note.bytes", count: 4 }] },
    ])
    // The nonce authority is also the writable fee payer and signer: privileges are not narrowed.
    const authority = parseSolanaMessage(hexToBytes(vector.messageHex), hexToBytes(pt1.signer.publicKeyHex)).staticAccountKeys[0]
    expect(authority).toMatchObject({ address: "Dna8mRXubQx8KSKmmgMHA7GTrHBtW1GGJFonuWU7ABHW", signer: true, writable: true })
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it("keeps the recent-blockhash transfer exactly as before: one instruction, its own facts", () => {
    const vector = pt1.cases[1]
    const review = solanaSigningReview(parseSolanaMessage(hexToBytes(vector.messageHex), hexToBytes(pt1.signer.publicKeyHex)))
    expect(review.kind).toBe("review.kind.solanaTokenTransfer")
    expect(review.undecoded).toBe(false)
    expect(labels(review.summary)).toEqual(["review.field.fromTokenAccount", "review.field.toTokenAccount", "review.field.mint", "review.field.amount"])
  })
})

describe("AdvanceNonceAccount in the review", () => {
  it("is a recognized operation, never a transfer: its own heading, unnumbered, counted apart", () => {
    const { review, nonceAccounts, transfers } = synthetic(["nonce", "sol"])
    expect(review.undecoded).toBe(false)
    expect(review.summary[0]).toEqual({ label: "review.field.instructions", value: "2", notes: [{ key: "review.note.transfersDecoded", count: 1 }, { key: "review.note.nonceAdvances", count: 1 }] })
    expect(review.summary.filter((field) => field.heading).map((field) => [field.label, field.index])).toEqual([["review.field.advanceNonce", undefined], ["review.field.transferSol", 1]])
    expect(review.summary.find((field) => field.label === "review.field.nonceAccount")!.value).toBe(nonceAccounts[0])
    expect(review.summary.find((field) => field.label === "review.field.nonceAuthority")!.value).toBe(corpus.keys[0].publicKeyBase58)
    expect(review.summary.find((field) => field.label === "review.field.to")!.value).toBe(transfers[0].destination)
    expect(JSON.stringify(review.summary)).not.toContain("transferSol\",\"index\":2")
  })

  it("leaves the single notice to anything still undecoded beside it", () => {
    const { review } = synthetic(["nonce", "spl-checked", "raw"])
    expect(review.undecoded).toBe(true)
    expect(review.summary[0].notes).toEqual([
      { key: "review.note.transfersDecoded", count: 1 }, { key: "review.note.nonceAdvances", count: 1 }, { key: "review.note.instructionsNotDecoded", count: 1 },
    ])
    expect(labels(review.summary)).toContain("review.field.undecodedInstruction")
  })

  it("shows a message of only a nonce advance as that operation, with no notice", () => {
    const { review, nonceAccounts } = synthetic(["nonce"])
    expect(review.kind).toBe("review.kind.solanaTransaction")
    expect(review.undecoded).toBe(false)
    expect(review.summary).toEqual([
      { label: "review.field.advanceNonce", value: "", heading: true },
      { label: "review.field.nonceAccount", value: nonceAccounts[0] },
      { label: "review.field.nonceAuthority", value: corpus.keys[0].publicKeyBase58 },
    ])
  })

  it("caps nonce advances at three like every other kind, and keeps all of them in Details", () => {
    const { review, nonceAccounts } = synthetic(["nonce", "nonce", "nonce", "nonce", "sol"])
    expect(review.summary.filter((field) => field.label === "review.field.advanceNonce")).toHaveLength(3)
    expect(review.summary.at(-1)).toEqual({ label: "review.field.moreNonceAdvances", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: 1 }] })
    nonceAccounts.forEach((nonceAccount, index) => {
      expect(group(review, index + 1).fields.find((field) => field.label === "review.field.nonceAccount")!.value).toBe(nonceAccount)
    })
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })
})
