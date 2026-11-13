import { describe, expect, it, vi } from "vitest"
import { hexToBytes } from "@noble/curves/utils.js"
import { encodeFunctionData, keccak256, parseAbi, serializeTransaction } from "viem"
import corpus from "./fixtures/solana-acceptance/corpus.json"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"
import { setLocale } from "./i18n"
import { parseSigningReview, renderSigningReview, type ReviewField, type SigningReview } from "./signingReview"
import { installCardDocument } from "./testDom"
import { evmSigningReview, solanaSigningReview } from "./signingReviewFacts"
import { parseSolanaMessage } from "./solana/message"
import { deriveSigningAddresses } from "./vaultCrypto"
import { syntheticTransfersMessage, type SyntheticTransferKind } from "./signTestFixtures"

// Expectations come from the independent acceptance corpus (official SDK
// serialization and explicit construction inputs), not from the parser.

const allFields = (review: SigningReview): ReviewField[] => [review.signer, ...review.summary, ...review.details.flatMap((group) => group.fields)]
const values = (review: SigningReview): string[] => allFields(review).map((field) => field.value)
const labels = (fields: ReviewField[]): string[] => fields.map((field) => field.label)
const group = (review: SigningReview, title: string, index?: number) => review.details.find((entry) => entry.title === title && entry.index === index)!

function solanaReview(vector: (typeof corpus.solana)[number]): SigningReview {
  return solanaSigningReview(parseSolanaMessage(hexToBytes(vector.message.hex), hexToBytes(vector.requestedSigner.publicKeyHex)))
}
const solana = (id: string) => solanaReview(corpus.solana.find((vector) => vector.id === id)!)

describe("Solana facts to signing review", () => {
  it.each(corpus.solana)("$id: signer, notice and complete Details match the construction", (vector) => {
    const review = solanaReview(vector)
    const expected = vector.expected
    expect(review.signer).toEqual({ label: "review.field.signingKey", value: vector.requestedSigner.publicKeyBase58, elide: true })
    // The single notice: any raw instruction or any address table.
    expect(review.undecoded).toBe(expected.partiallyDecoded)
    expect(review.undecoded).toBe(expected.addressTableLookups.length > 0 || expected.instructions.some((instruction) => instruction.decoded.kind === "raw"))

    // Details lose nothing: every static account, every instruction's program, indexes and exact data, and the whole message.
    expect(group(review, "review.group.accounts").fields.map((field) => [field.index, field.value])).toEqual(expected.staticAccountKeys.map((address, index) => [index, address]))
    expect(review.details.filter((entry) => entry.title === "review.group.instruction")).toHaveLength(expected.instructions.length)
    expected.instructions.forEach((instruction, index) => {
      const fields = group(review, "review.group.instruction", index + 1).fields
      expect(fields[0]).toMatchObject({ label: "review.field.program", value: instruction.programId })
      expect(fields.find((field) => field.label === "review.field.accountIndexes")!.value).toBe(instruction.accountIndices.join(", "))
      const data = fields.find((field) => field.label === "review.field.data")!
      expect(data.value).toBe(instruction.dataHex)
      expect(data.notes).toContainEqual({ key: "review.note.bytes", count: instruction.dataHex.length / 2 })
      expect(data.notes?.includes("review.note.notDecoded")).toBe(instruction.decoded.kind === "raw")
    })
    expect(group(review, "review.group.exact").fields).toEqual([{
      label: "review.field.message", value: vector.message.hex, notes: [{ key: "review.note.bytes", count: vector.message.byteLength }], raw: true,
    }])
    const transaction = group(review, "review.group.transaction").fields
    expect(transaction.map((field) => field.value)).toEqual([vector.version, "ed25519", expected.feePayer, expected.recentBlockhash])

    // The review survives the authorization-window channel unchanged.
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it("shows a native transfer as exact SOL beside raw lamports, then to and from, shortened on the first screen", () => {
    const review = solana("legacy-sol-transfer")
    expect(review.kind).toBe("review.kind.solanaSystemTransfer")
    expect(review.summary).toEqual([
      { label: "review.field.amount", value: "1234567890", native: "sol" },
      { label: "review.field.to", value: "8KuqTnrTpiE3zGXbLxZzw1bR3vjbfNADBEVYeECj62T8", elide: true },
      { label: "review.field.from", value: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z", elide: true },
    ])
    expect(review.undecoded).toBe(false)
    expect(solana("v0-sol-transfer-static").kind).toBe("review.kind.solanaSystemTransfer")
  })

  it("shows SPL Transfer with token accounts and raw units only: no mint, decimals, owner or symbol", () => {
    const review = solana("legacy-spl-transfer-u64-max")
    expect(review.kind).toBe("review.kind.solanaTokenTransfer")
    expect(labels(review.summary)).toEqual(["review.field.amount", "review.field.toTokenAccount", "review.field.fromTokenAccount"])
    expect(review.summary[0]).toEqual({ label: "review.field.amount", value: "18446744073709551615", notes: ["review.note.baseUnits"] })
    expect(labels(allFields(review))).not.toContain("review.field.mint")
    expect(JSON.stringify(review)).not.toContain("review.note.decimals")
    expect(allFields(review).some((field) => field.native)).toBe(false)
  })

  it("shows TransferChecked with the encoded mint and decimals, and the authority in Details only", () => {
    const vector = corpus.solana.find((candidate) => candidate.id === "legacy-spl-transfer-checked-different-fee-payer")!
    const decoded = vector.expected.instructions[0].decoded as { sourceTokenAccount: string; destinationTokenAccount: string; mint: string; authority: string }
    const review = solanaReview(vector)
    expect(review.summary).toEqual([
      { label: "review.field.amount", value: "1234567", decimals: 6 },
      { label: "review.field.toTokenAccount", value: decoded.destinationTokenAccount, elide: true },
      { label: "review.field.mint", value: decoded.mint, elide: true },
      { label: "review.field.fromTokenAccount", value: decoded.sourceTokenAccount, elide: true },
    ])
    expect(labels(review.summary)).not.toContain("review.field.authority")
    const instruction = group(review, "review.group.instruction", 1).fields
    expect(instruction.find((field) => field.label === "review.field.instruction")!.value).toBe("TransferChecked")
    expect(instruction.find((field) => field.label === "review.field.authority")!.value).toBe(decoded.authority)
    // The signer is not the fee payer here; both are stated, neither is inferred to own anything.
    expect(review.signer.value).toBe(vector.requestedSigner.publicKeyBase58)
    expect(group(review, "review.group.transaction").fields[2].value).toBe(vector.expected.feePayer)
  })

  it("reviews undecoded instructions raw: program, byte count and the notice; no decoder for Token-2022, compute budget or memo", () => {
    const vector = corpus.solana.find((candidate) => candidate.id === "legacy-token2022-compute-memo-raw")!
    const review = solanaReview(vector)
    expect(review.kind).toBe("review.kind.solanaTransaction")
    expect(review.undecoded).toBe(true)
    expect(review.summary).toEqual([
      { label: "review.field.instructions", value: "3", notes: [{ key: "review.note.instructionsNotDecoded", count: 3 }] },
      ...vector.expected.instructions.map((instruction) => ({
        label: "review.field.undecodedInstruction", value: instruction.programId,
        notes: [{ key: "review.note.dataBytes", count: instruction.dataHex.length / 2 }, "review.note.notDecoded"], elide: true,
      })),
    ])
    // Near misses of the decoded layouts stay raw too: four of them, so three rows and a remainder.
    const nearMisses = solana("legacy-known-program-near-misses-raw")
    expect(nearMisses.undecoded).toBe(true)
    expect(labels(allFields(nearMisses))).not.toContain("review.field.amount")
    expect(labels(nearMisses.summary)).toEqual(["review.field.instructions", "review.field.undecodedInstruction", "review.field.undecodedInstruction", "review.field.undecodedInstruction", "review.field.moreUndecoded"])
    expect(nearMisses.summary.at(-1)).toEqual({ label: "review.field.moreUndecoded", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: 1 }] })
  })

  it("gives address tables no presentation: unresolved accounts stay indexes, table keys stay in the raw bytes", () => {
    for (const id of ["v0-unresolved-alt-system-transfer", "v0-unresolved-alt-synthetic-jupiter-shaped", "v0-unused-unresolved-alt-static-transfer"]) {
      const vector = corpus.solana.find((candidate) => candidate.id === id)!
      const review = solanaReview(vector)
      expect(review.undecoded).toBe(true)
      const shown = values(review).filter((value) => value !== vector.message.hex)
      for (const lookup of vector.expected.addressTableLookups) expect(shown).not.toContain(lookup.accountKey)
      // Addresses the generator knew only from construction are never shown as resolved accounts.
      const staticKeys = new Set(vector.expected.staticAccountKeys)
      for (const instruction of vector.expected.instructions) {
        for (const address of instruction.accountAddressesFromConstruction) if (!staticKeys.has(address)) expect(shown).not.toContain(address)
      }
    }
    // A transfer whose destination is loaded from a table is not described as a transfer.
    const unresolved = solana("v0-unresolved-alt-system-transfer")
    expect(unresolved.kind).toBe("review.kind.solanaTransaction")
    expect(labels(allFields(unresolved))).not.toContain("review.field.to")
    // A fully static transfer beside an unused table keeps its facts and still carries the notice.
    const unused = solana("v0-unused-unresolved-alt-static-transfer")
    expect(unused.kind).toBe("review.kind.solanaSystemTransfer")
    expect(labels(unused.summary)).toEqual(["review.field.amount", "review.field.to", "review.field.from"])
  })

  const heading = (label: string, index: number) => ({ label, index, value: "", heading: true })

  it("lists each of two transfers as a numbered block with its destination and amount, under the count", () => {
    const vector = corpus.solana.find((candidate) => candidate.id === "legacy-two-sol-transfers")!
    const two = solanaReview(vector)
    const decoded = vector.expected.instructions.map((instruction) => instruction.decoded as { destination: string; lamports: string })
    expect(two.kind).toBe("review.kind.solanaTransaction")
    expect(two.undecoded).toBe(false)
    expect(two.summary).toEqual([
      { label: "review.field.instructions", value: "2", notes: [{ key: "review.note.transfersDecoded", count: 2 }] },
      heading("review.field.transferSol", 1),
      { label: "review.field.amount", value: decoded[0].lamports, native: "sol" },
      { label: "review.field.to", value: decoded[0].destination, elide: true },
      heading("review.field.transferSol", 2),
      { label: "review.field.amount", value: decoded[1].lamports, native: "sol" },
      { label: "review.field.to", value: decoded[1].destination, elide: true },
    ])
    // The source is not in the summary; Details carry every fact of every instruction.
    expect(labels(two.summary)).not.toContain("review.field.from")
    decoded.forEach((transfer, index) => {
      const fields = group(two, "review.group.instruction", index + 1).fields
      expect(labels(fields)).toEqual(expect.arrayContaining(["review.field.from", "review.field.to", "review.field.amount"]))
      expect(fields.find((field) => field.label === "review.field.to")!.value).toBe(transfer.destination)
      expect(fields.find((field) => field.label === "review.field.amount")).toEqual({ label: "review.field.amount", value: transfer.lamports, native: "sol" })
    })
  })

  const synthetic = (kinds: SyntheticTransferKind[]) => {
    const message = syntheticTransfersMessage(kinds)
    const signer = hexToBytes(corpus.keys[0].publicKeyHex)
    return { ...message, review: solanaSigningReview(parseSolanaMessage(hexToBytes(message.messageHex), signer)) }
  }

  it("lists three mixed transfers: the mint only where the instruction encodes it, and a heading that says when it does not", () => {
    const { review, transfers } = synthetic(["sol", "spl-checked", "spl"])
    expect(review.undecoded).toBe(false)
    expect(review.summary).toEqual([
      { label: "review.field.instructions", value: "3", notes: [{ key: "review.note.transfersDecoded", count: 3 }] },
      heading("review.field.transferSol", 1),
      { label: "review.field.amount", value: "250000000", native: "sol" },
      { label: "review.field.to", value: transfers[0].destination, elide: true },
      heading("review.field.transferToken", 2),
      { label: "review.field.amount", value: "3000000", decimals: 6 },
      { label: "review.field.toTokenAccount", value: transfers[1].destination, elide: true },
      { label: "review.field.mint", value: transfers[1].mint, elide: true },
      // A plain SPL Transfer encodes no mint: no mint row and no note, only the heading.
      heading("review.field.transferTokenNoMint", 3),
      { label: "review.field.amount", value: "4500000", notes: ["review.note.baseUnits"] },
      { label: "review.field.toTokenAccount", value: transfers[2].destination, elide: true },
    ])
    expect(labels(review.summary)).not.toContain("review.field.moreTransfers")
    expect(labels(review.summary)).not.toEqual(expect.arrayContaining(["review.field.fromTokenAccount"]))
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it("above three transfers, lists the first three and says how many more are in Details", () => {
    const { review, transfers } = synthetic(["sol", "sol", "spl-checked", "sol", "spl"])
    expect(review.summary[0]).toEqual({ label: "review.field.instructions", value: "5", notes: [{ key: "review.note.transfersDecoded", count: 5 }] })
    expect(review.summary.filter((field) => field.heading).map((field) => [field.label, field.index]))
      .toEqual([["review.field.transferSol", 1], ["review.field.transferSol", 2], ["review.field.transferToken", 3]])
    expect(review.summary.filter((field) => field.label === "review.field.to" || field.label === "review.field.toTokenAccount").map((field) => field.value))
      .toEqual(transfers.slice(0, 3).map((transfer) => transfer.destination))
    expect(review.summary.at(-1)).toEqual({ label: "review.field.moreTransfers", value: "", notes: [{ key: "review.note.moreInDetails", count: 2 }] })
    const summaryValues = review.summary.map((field) => field.value)
    for (const transfer of transfers.slice(3)) expect(summaryValues).not.toContain(transfer.destination)
    // Nothing is dropped: the fourth and fifth transfers are complete in Details.
    transfers.forEach((transfer, index) => {
      const fields = group(review, "review.group.instruction", index + 1).fields
      expect(fields.map((field) => field.value)).toEqual(expect.arrayContaining([transfer.destination, transfer.amount]))
      if (transfer.mint) expect(fields.find((field) => field.label === "review.field.mint")!.value).toBe(transfer.mint)
    })
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it("keeps an unnumbered row for every undecoded instruction beside the transfer blocks, in message order, with the notice", () => {
    const { review, transfers } = synthetic(["raw", "sol", "raw", "spl"])
    const programId = group(review, "review.group.instruction", 1).fields[0].value
    const undecodedRow = {
      label: "review.field.undecodedInstruction", value: programId,
      notes: [{ key: "review.note.dataBytes", count: 4 }, "review.note.notDecoded"], elide: true,
    }
    expect(review.undecoded).toBe(true)
    expect(review.summary).toEqual([
      { label: "review.field.instructions", value: "4", notes: [{ key: "review.note.transfersDecoded", count: 2 }, { key: "review.note.instructionsNotDecoded", count: 2 }] },
      undecodedRow,
      heading("review.field.transferSol", 1),
      { label: "review.field.amount", value: transfers[0].amount, native: "sol" },
      { label: "review.field.to", value: transfers[0].destination, elide: true },
      undecodedRow,
      heading("review.field.transferTokenNoMint", 2),
      { label: "review.field.amount", value: transfers[1].amount, notes: ["review.note.baseUnits"] },
      { label: "review.field.toTokenAccount", value: transfers[1].destination, elide: true },
    ])
    // Only transfer blocks are numbered in the summary; nothing carries an instruction number there.
    expect(review.summary.filter((field) => field.index !== undefined).map((field) => [field.label, field.index]))
      .toEqual([["review.field.transferSol", 1], ["review.field.transferTokenNoMint", 2]])
    // The instruction number and exact data of each undecoded instruction are in Details.
    for (const index of [1, 3]) {
      const fields = group(review, "review.group.instruction", index).fields
      expect(fields[0]).toMatchObject({ label: "review.field.program", value: programId })
      expect(fields.find((field) => field.label === "review.field.data")).toMatchObject({ value: "deadbeef", notes: expect.arrayContaining(["review.note.notDecoded"]) })
    }
  })

  const kinds = (review: SigningReview) => review.summary.flatMap((field) =>
    field.heading ? ["transfer"] : field.label === "review.field.undecodedInstruction" ? ["undecoded"]
      : field.label === "review.field.moreTransfers" ? ["more-transfers"] : field.label === "review.field.moreUndecoded" ? ["more-undecoded"]
      : field.label === "review.field.instructions" ? ["count"] : [])

  it.each([
    ["no transfer and five undecoded", ["raw", "raw", "raw", "raw", "raw"], ["count", "undecoded", "undecoded", "undecoded", "more-undecoded"], [0, 5]],
    ["one transfer and four undecoded", ["raw", "sol", "raw", "raw", "raw"], ["count", "undecoded", "transfer", "undecoded", "undecoded", "more-undecoded"], [1, 4]],
    ["five transfers and five undecoded, interleaved", ["sol", "raw", "spl", "raw", "spl-checked", "raw", "sol", "raw", "sol", "raw"],
      ["count", "transfer", "undecoded", "transfer", "undecoded", "transfer", "undecoded", "more-transfers", "more-undecoded"], [5, 5]],
    ["four transfers and one undecoded", ["sol", "sol", "raw", "sol", "sol"], ["count", "transfer", "transfer", "undecoded", "transfer", "more-transfers"], [4, 1]],
  ] as const)("one rule for %s: at most three of each kind, in message order, then each remainder", (_name, message, expected, [transferCount, undecodedCount]) => {
    const { review, transfers } = synthetic([...message])
    expect(kinds(review)).toEqual(expected)
    expect(review.summary[0]).toEqual({
      label: "review.field.instructions", value: String(message.length),
      notes: [
        ...(transferCount ? [{ key: "review.note.transfersDecoded", count: transferCount }] : []),
        ...(undecodedCount ? [{ key: "review.note.instructionsNotDecoded", count: undecodedCount }] : []),
      ],
    })
    expect(review.summary.filter((field) => field.heading).map((field) => field.index)).toEqual(Array.from({ length: Math.min(3, transferCount) }, (_unused, index) => index + 1))
    // Only transfer headings carry a number in the summary.
    expect(review.summary.filter((field) => field.index !== undefined && !field.heading)).toEqual([])
    const more = (label: string) => review.summary.find((field) => field.label === label)?.notes
    expect(more("review.field.moreTransfers")).toEqual(transferCount > 3 ? [{ key: "review.note.moreInDetails", count: transferCount - 3 }] : undefined)
    expect(more("review.field.moreUndecoded")).toEqual(undecodedCount > 3 ? [{ key: "review.note.moreInstructionsInDetails", count: undecodedCount - 3 }] : undefined)
    expect(review.undecoded).toBe(undecodedCount > 0)
    // Details keep every instruction, numbered by its position, with its program and exact data.
    expect(review.details.filter((entry) => entry.title === "review.group.instruction").map((entry) => entry.index)).toEqual(message.map((_kind, index) => index + 1))
    message.forEach((kind, index) => {
      const fields = group(review, "review.group.instruction", index + 1).fields
      expect(fields[0].label).toBe("review.field.program")
      if (kind === "raw") expect(fields.find((field) => field.label === "review.field.data")!.value).toBe("deadbeef")
    })
    for (const transfer of transfers) expect(review.details.flatMap((entry) => entry.fields).map((field) => field.value)).toContain(transfer.destination)
    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  it("shows a message of exactly one instruction as that instruction, without a count row", () => {
    expect(labels(synthetic(["spl-checked"]).review.summary)).toEqual(["review.field.amount", "review.field.toTokenAccount", "review.field.mint", "review.field.fromTokenAccount"])
    expect(labels(synthetic(["sol"]).review.summary)).toEqual(["review.field.amount", "review.field.to", "review.field.from"])
    expect(labels(synthetic(["raw"]).review.summary)).toEqual(["review.field.undecodedInstruction"])
    // Anything more goes through the one rule: a transfer beside one undecoded instruction is a block under the count.
    expect(kinds(synthetic(["raw", "sol"]).review)).toEqual(["count", "undecoded", "transfer"])
    expect(labels(synthetic(["raw", "sol"]).review.summary)).not.toContain("review.field.from")
  })
})

describe("EVM verified transaction to signing review", () => {
  it.each(corpus.evm)("$id: derived signer, exact envelope and one notice exactly when undecoded", (vector) => {
    const verified = verifySigningContext(vector.context as VerifiableSigningContext)
    const scheme = "ecdsa-secp256k1-recoverable"
    const review = evmSigningReview(verified.evm!, { publicKey: vector.signature.publicKeyHex, scheme, digest: verified.digest })
    const transaction = vector.context.unsignedTransaction as Record<string, string | undefined>

    // The address comes from the key, by the sandbox's own derivation; the public key is in Details.
    expect(review.signer).toEqual({ label: "review.field.signingAddress", value: deriveSigningAddresses(vector.signature.publicKeyHex).eth, elide: true })
    expect(review.signer.value).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
    expect(group(review, "review.group.transaction").fields[0]).toEqual({ label: "review.field.publicKey", value: vector.signature.publicKeyHex })
    expect(labels(review.summary)).not.toContain("review.field.publicKey")

    expect(review.undecoded).toBe(vector.expected.partiallyDecoded)
    const exact = group(review, "review.group.exact").fields
    expect(exact.find((field) => field.label === "review.field.calldata")!.value).toBe(vector.expected.calldata)
    expect(exact.find((field) => field.label === "review.field.unsignedTransaction")).toMatchObject({ value: vector.unsignedSerialized, raw: true })
    expect(exact.find((field) => field.label === "review.field.digest")!.value).toBe(`0x${vector.expected.serializedKeccak256}`)

    // Ether only on chains whose native unit is ETH (Ethereum, OP, Base, Arbitrum and their Sepolia testnets); any other keeps raw wei.
    const eth = ["1", "11155111"].includes(vector.context.chainId)
    const value = group(review, "review.group.transaction").fields.find((field) => field.label === "review.field.value")!
    expect(value).toEqual(eth
      ? { label: "review.field.value", value: transaction.value, native: "eth" }
      : { label: "review.field.value", value: transaction.value, notes: ["review.note.wei"] })
    // The encoded chain id, with a static name only for known ids; Sepolia here, Ethereum for the EIP-155 example.
    // What it does first, then where: the chain row follows the destination, value and call.
    expect(review.summary.at(-1)).toEqual({
      label: "review.field.chainId", value: { "1": "1 · Ethereum", "11155111": "11155111 · Sepolia" }[vector.context.chainId], notes: [],
    })
    expect(group(review, "review.group.transaction").fields.find((field) => field.label === "review.field.chainId")!.value).toBe(vector.context.chainId)

    // What leaves, to whom: a call with no calldata leads with the native amount to its destination;
    // a token call leads with its own recipient or spender and names the contract after it; any
    // other call leads with its destination and the value it carries.
    const lead = review.summary[0]
    const nativeTransfer = Boolean(transaction.to) && vector.expected.calldata === "0x"
    if (nativeTransfer) {
      expect(lead).toEqual({ label: "review.field.nativeTransfer", value: transaction.value, native: "eth", unit: "symbol", to: transaction.to })
      expect(review.summary).toHaveLength(2)
    } else if (vector.expected.decoded.kind === "erc20-transfer") {
      expect(review.summary.find((field) => field.label === "review.field.tokenContract")).toEqual({ label: "review.field.tokenContract", value: transaction.to, elide: true })
      expect(review.summary.find((field) => field.label === "review.field.value")!.value).toBe(transaction.value)
    } else if (transaction.to) {
      expect(lead).toEqual({ label: "review.field.contract", value: transaction.to, elide: true })
      expect(review.summary[1]).toEqual(value)
    } else {
      expect(lead).toEqual({ label: "review.field.contract", value: "", notes: ["review.note.contractCreation"], elide: true })
      expect(review.summary[1]).toEqual(value)
    }

    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  const review = (id: string): SigningReview => {
    const vector = corpus.evm.find((candidate) => candidate.id === id)!
    const verified = verifySigningContext(vector.context as VerifiableSigningContext)
    return evmSigningReview(verified.evm!, { publicKey: vector.signature.publicKeyHex, scheme: "ecdsa-secp256k1-der", digest: verified.digest })
  }

  it("leads an ERC-20-format transfer with its recipient and exact raw amount, then the contract, the encoded value and the chain", () => {
    const transfer = review("evm-erc20-transfer")
    expect(transfer.undecoded).toBe(false)
    expect(transfer.kind).toBe("review.kind.erc20Transfer")
    expect(transfer.warnings).toBeUndefined()
    expect(transfer.summary).toEqual([
      { label: "review.field.transferTo", value: "0x1111111111111111111111111111111111111111", elide: true },
      // Above the safe integer range, exact: no decimals or symbol are encoded, so none are shown.
      { label: "review.field.amount", value: "9007199254740993", notes: ["review.note.rawTokenUnits"] },
      { label: "review.field.tokenContract", value: "0x2222222222222222222222222222222222222222", elide: true },
      { label: "review.field.value", value: "0", native: "eth" },
      { label: "review.field.chainId", value: "11155111 · Sepolia", notes: [] },
    ])
    // The decoded call, every argument and the transaction's own destination stay complete in Details.
    expect(group(transfer, "review.group.call").fields.map((field) => field.value)).toEqual([
      "transfer(address,uint256)", "0xa9059cbb", "0x1111111111111111111111111111111111111111", "9007199254740993",
    ])
    expect(group(transfer, "review.group.transaction").fields.find((field) => field.label === "review.field.contract")!.value)
      .toBe("0x2222222222222222222222222222222222222222")
  })

  it("keeps undecoded calldata raw: selector, byte count and the complete bytes", () => {
    const unknown = review("evm-synthetic-uniswap-shaped-unknown-selector")
    expect(unknown.summary.at(-2)).toMatchObject({ label: "review.field.selector", value: "0x414bf389", notes: [expect.objectContaining({ key: "review.note.dataBytes" }), "review.note.notDecoded"] })
    expect(labels(allFields(unknown))).not.toContain("review.field.call")
    for (const id of ["evm-erc20-trailing-byte-raw", "evm-erc20-trailing-word-raw", "evm-erc20-dirty-address-word-raw"]) {
      const raw = review(id)
      expect(raw.undecoded).toBe(true)
      expect(labels(allFields(raw))).not.toContain("review.field.argument")
    }
  })

  it("never reads contract creation init code as a call", () => {
    for (const id of ["evm-contract-creation-raw", "evm-contract-creation-known-selector-raw"]) {
      const creation = review(id)
      expect(creation.undecoded).toBe(true)
      expect(creation.summary.at(-2)).toMatchObject({ label: "review.field.initCode", value: "", notes: [expect.objectContaining({ key: "review.note.dataBytes" }), "review.note.notDecoded"] })
      expect(labels(allFields(creation))).not.toEqual(expect.arrayContaining(["review.field.selector"]))
      expect(labels(allFields(creation))).not.toContain("review.field.call")
    }
  })

  it("leads a plain transfer with the amount to its destination, with no call rows and no notice, and the fee fields its type carries", () => {
    const legacy = review("evm-eip155-published-example")
    expect(legacy.undecoded).toBe(false)
    expect(legacy.summary).toEqual([
      { label: "review.field.nativeTransfer", value: "1000000000000000000", native: "eth", unit: "symbol", to: "0x3535353535353535353535353535353535353535" },
      { label: "review.field.chainId", value: "1 · Ethereum", notes: [] },
    ])
    // The exact wei and the complete destination stay in Details.
    expect(group(legacy, "review.group.transaction").fields.find((field) => field.label === "review.field.value"))
      .toEqual({ label: "review.field.value", value: "1000000000000000000", native: "eth" })
    const fields = labels(group(legacy, "review.group.transaction").fields)
    expect(fields).toContain("review.field.gasPrice")
    expect(fields).not.toContain("review.field.maxFeePerGas")
    const modern = labels(group(review("evm-eth-eip1559"), "review.group.transaction").fields)
    expect(modern).toEqual(expect.arrayContaining(["review.field.maxFeePerGas", "review.field.maxPriorityFeePerGas"]))
    expect(modern).not.toContain("review.field.gasPrice")
  })

  /** A transaction through the production verifier: canonical ABI encoding by viem, an independent encoder. */
  const verified = (fields: { to?: `0x${string}` | null; data?: `0x${string}`; value?: bigint; chainId?: number; type?: "legacy" | "eip1559" }): SigningReview => {
    const { to = TOKEN, data = "0x", value = 0n, chainId = 1, type = "eip1559" } = fields
    const fees = type === "legacy" ? { gasPrice: 1n } : { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }
    const digest = keccak256(serializeTransaction({ type, chainId, nonce: 0, ...(to ? { to } : {}), value, gas: 1n, data, ...fees } as never)).slice(2)
    const wire = type === "legacy" ? { gasPrice: "1" } : { maxFeePerGas: "1", maxPriorityFeePerGas: "1" }
    const context = verifySigningContext({
      kind: "evm-transaction", chainId: String(chainId), digestAlgorithm: "keccak256", digest,
      unsignedTransaction: { type, chainId: String(chainId), nonce: "0", ...(to ? { to } : {}), value: value.toString(), gas: "1", data, ...wire },
    })
    const result = evmSigningReview(context.evm!, { publicKey: corpus.evm[0].signature.publicKeyHex, scheme: "ecdsa-secp256k1-der", digest })
    expect(parseSigningReview(JSON.parse(JSON.stringify(result)))).toEqual(result)
    return result
  }
  const TOKEN = "0x2222222222222222222222222222222222222222"
  const SPENDER = "0x1111111111111111111111111111111111111111"
  const MAX = (2n ** 256n) - 1n
  const erc20 = parseAbi(["function approve(address spender,uint256 amount)", "function increaseAllowance(address spender,uint256 addedValue)", "function transfer(address to,uint256 amount)"])
  const approve = (amount: bigint) => encodeFunctionData({ abi: erc20, functionName: "approve", args: [SPENDER, amount] })
  const increase = (amount: bigint) => encodeFunctionData({ abi: erc20, functionName: "increaseAllowance", args: [SPENDER, amount] })

  it("gives approve the token-authorization warning, and its value as an ERC-20 amount or an NFT token ID", () => {
    const finite = verified({ data: approve(1000n) })
    expect(finite.kind).toBe("review.kind.tokenApprove")
    expect(finite.undecoded).toBe(false)
    expect(finite.warnings).toEqual(["review.warning.tokenAuthorization"])
    expect(finite.summary).toEqual([
      { label: "review.field.spender", value: SPENDER, elide: true },
      // The same selector and argument bytes approve an ERC-20 allowance or one ERC-721 token ID.
      { label: "review.field.approvalValue", value: "1000" },
      { label: "review.field.tokenContract", value: TOKEN, elide: true },
      { label: "review.field.value", value: "0", native: "eth" },
      { label: "review.field.chainId", value: "1 · Ethereum", notes: [] },
    ])
  })

  it("names the uint256 maximum on approve as the maximum, conditionally unlimited, and keeps it exact in Details", () => {
    const maximum = verified({ data: approve(MAX) })
    expect(maximum.warnings).toEqual(["review.warning.tokenAuthorization", "review.warning.maximumApproval"])
    expect(maximum.summary[1]).toEqual({
      label: "review.field.approvalValue", value: MAX.toString(), shownAs: "review.value.maximum", notes: ["review.note.exactInDetails"],
    })
    // Never an unconditional "Unlimited": the value could be an NFT token ID.
    expect(JSON.stringify(maximum)).not.toContain("review.value.unlimited")
    expect(JSON.stringify(maximum)).not.toContain("review.warning.unlimitedAllowance")
    expect(group(maximum, "review.group.call").fields.map((field) => field.value)).toContain(MAX.toString())
    expect(verified({ data: approve(MAX - 1n) }).warnings).toEqual(["review.warning.tokenAuthorization"])
  })

  it("renders the maximum approval in both locales: the red warnings first, the word, and the exact value only in Details", () => {
    const maximum = verified({ data: approve(MAX) })
    for (const [locale, kind, warnings, word] of [
      ["en", "Token authorization · approve", [
        "This signature lets the spender move your tokens.",
        "This value is the largest uint256. If it is an ERC-20 allowance, that usually means unlimited; it may also be an NFT token ID.",
      ], "Maximum"],
      ["zh", "代币授权 · approve", ["代币授权：此签名允许被授权方动用你的代币。", "该值为 uint256 最大值：若为 ERC-20 额度，通常表示无限授权；也可能是 NFT 编号。"], "最大值"],
    ] as const) {
      setLocale(locale)
      const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
      renderSigningReview(dom.content as unknown as HTMLElement, maximum)
      expect(dom.content.querySelector(".review-kind")!.textContent).toBe(kind)
      expect(dom.content.querySelector(".review")!.children.map((node) => node.className)).toEqual(["review-heading", "review-warning", "review-warning", "review-summary", "review-details"])
      expect(dom.content.querySelectorAll(".review-warning-text").map((node) => node.textContent)).toEqual(warnings)
      const summary = dom.content.querySelector(".review-summary")!
      expect(summary.querySelectorAll(".review-word").map((node) => node.textContent)).toEqual([word])
      expect(summary.leafTexts()).not.toContain(MAX.toString())
      expect(dom.content.querySelector(".review-details")!.querySelectorAll(".review-mono").map((node) => node.textContent)).toContain(MAX.toString())
    }
    setLocale("en")
    vi.unstubAllGlobals()
  })

  it("decodes canonical increaseAllowance as an added amount, never the resulting allowance", () => {
    const data = increase(5n)
    expect(data.slice(0, 10)).toBe("0x39509351")
    const finite = verified({ data })
    // Previously undecoded: canonical bytes now review as a call, so the blind-signing notice no longer shows.
    expect(finite.undecoded).toBe(false)
    expect(finite.kind).toBe("review.kind.tokenIncreaseAllowance")
    expect(finite.warnings).toEqual(["review.warning.tokenAuthorization"])
    expect(finite.summary.slice(0, 3)).toEqual([
      { label: "review.field.spender", value: SPENDER, elide: true },
      { label: "review.field.allowanceIncrease", value: "5", notes: ["review.note.rawTokenUnits", "review.note.addedToAllowance"] },
      { label: "review.field.tokenContract", value: TOKEN, elide: true },
    ])
    expect(group(finite, "review.group.call").fields.slice(0, 2).map((field) => field.value)).toEqual(["increaseAllowance(address,uint256)", "0x39509351"])
    const maximum = verified({ data: increase(MAX) })
    expect(maximum.summary[1]).toEqual({
      label: "review.field.allowanceIncrease", value: MAX.toString(), shownAs: "review.value.maximumIncrease", notes: ["review.note.exactInDetails", "review.note.addedToAllowance"],
    })
    expect(maximum.warnings).toEqual(["review.warning.tokenAuthorization"])
    expect(JSON.stringify(maximum)).not.toContain("review.value.unlimited")
  })

  it.each([
    ["a trailing byte", (data: string) => `${data}00`],
    ["a short argument", (data: string) => data.slice(0, -2)],
    ["a dirty address word", (data: string) => `${data.slice(0, 10)}ff${data.slice(12)}`],
  ])("keeps increaseAllowance and approve with %s raw, as before", (_name, mutate) => {
    for (const data of [increase(5n), approve(5n)]) {
      const raw = verified({ data: mutate(data) as `0x${string}` })
      expect(raw.undecoded).toBe(true)
      expect(raw.kind).toBe("review.kind.evmTransaction")
      expect(raw.warnings).toBeUndefined()
      expect(labels(raw.summary)).toEqual(["review.field.contract", "review.field.value", "review.field.selector", "review.field.chainId"])
    }
  })

  it("never reads approve-shaped init code as an approval", () => {
    const creation = verified({ to: null, data: approve(MAX) })
    expect(creation.kind).toBe("review.kind.evmTransaction")
    expect(creation.warnings).toBeUndefined()
    expect(labels(creation.summary)).toEqual(["review.field.contract", "review.field.value", "review.field.initCode", "review.field.chainId"])
  })

  it("shows the native value a token call actually carries, never an assumed zero", () => {
    const paying = verified({ data: encodeFunctionData({ abi: erc20, functionName: "transfer", args: [SPENDER, 1n] }), value: 5n * 10n ** 17n })
    expect(paying.kind).toBe("review.kind.erc20Transfer")
    expect(paying.summary.find((field) => field.label === "review.field.value")).toEqual({ label: "review.field.value", value: "500000000000000000", native: "eth" })
  })

  it("leads an empty-calldata transfer with the amount to its destination, for legacy and EIP-1559 alike; raw wei off the ETH chains", () => {
    const half = 5n * 10n ** 17n
    for (const type of ["legacy", "eip1559"] as const) {
      expect(verified({ type, to: SPENDER, value: half }).summary[0]).toEqual({
        label: "review.field.nativeTransfer", value: "500000000000000000", native: "eth", unit: "symbol", to: SPENDER,
      })
    }
    // Sepolia's native unit is ETH; BNB Smart Chain and an unknown chain keep the raw wei, and the chain row says which.
    expect(verified({ to: SPENDER, value: half, chainId: 11155111 }).summary[0]).toMatchObject({ native: "eth", unit: "symbol" })
    for (const chainId of [56, 999999]) {
      const other = verified({ to: SPENDER, value: half, chainId })
      expect(other.summary[0]).toEqual({ label: "review.field.nativeTransfer", value: "500000000000000000", notes: ["review.note.wei"], to: SPENDER })
    }
    expect(verified({ to: SPENDER, value: half, chainId: 999999 }).summary[1]).toEqual({ label: "review.field.chainId", value: "999999", notes: ["review.note.unknownChain"] })
    // A contract creation with no init code is not a transfer to anyone.
    expect(labels(verified({ to: null, value: half }).summary)).toEqual(["review.field.contract", "review.field.value", "review.field.chainId"])
  })

  it("moves a long argument list to Details and says so", () => {
    const word = (hex: string) => hex.padStart(64, "0")
    const data = `0xd505accf${word("11".repeat(20))}${word("22".repeat(20))}${word("5")}${word("6")}${word("1c")}${"33".repeat(32)}${"44".repeat(32)}` as `0x${string}`
    const to = "0x2222222222222222222222222222222222222222"
    const digest = keccak256(serializeTransaction({ type: "eip1559", chainId: 1, nonce: 0, to, value: 0n, gas: 1n, data, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n })).slice(2)
    const verified = verifySigningContext({
      kind: "evm-transaction", chainId: "1", digestAlgorithm: "keccak256", digest,
      unsignedTransaction: { type: "eip1559", chainId: "1", nonce: "0", to, value: "0", gas: "1", data, maxFeePerGas: "1", maxPriorityFeePerGas: "1" },
    })
    const permit = evmSigningReview(verified.evm!, { publicKey: corpus.evm[0].signature.publicKeyHex, scheme: "ecdsa-secp256k1-der", digest })
    expect(permit.undecoded).toBe(false)
    expect(permit.summary.at(-2)).toEqual({ label: "review.field.call", value: verified.evm!.decoded!.signature, notes: [{ key: "review.note.argumentsInDetails", count: 7 }] })
    expect(group(permit, "review.group.call").fields.filter((field) => field.label === "review.field.argument").map((field) => field.name)).toEqual([
      "owner (address)", "spender (address)", "value (uint256)", "deadline (uint256)", "v (uint8)", "r (bytes32)", "s (bytes32)",
    ])
  })
})

describe("a review that crossed the authorization-window channel", () => {
  const good = solana("legacy-sol-transfer")
  const wire = (): Record<string, any> => JSON.parse(JSON.stringify(good))

  it.each([
    ["an unknown kind", (review: Record<string, any>) => { review.kind = "review.kind.other" }],
    ["a label that is free text", (review: Record<string, any>) => { review.summary[0].label = "Send to (verified)" }],
    ["a label from another key family", (review: Record<string, any>) => { review.summary[0].label = "sign.title" }],
    ["a note that is free text", (review: Record<string, any>) => { review.summary[0].notes = ["trusted recipient"] }],
    ["a group title that is free text", (review: Record<string, any>) => { review.details[0].title = "Verified" }],
    ["markup in a parameter name", (review: Record<string, any>) => { review.summary[0].name = "<b>to</b> (address)" }],
    ["an unknown native currency", (review: Record<string, any>) => { review.summary[2].native = "usd" }],
    ["an extra field", (review: Record<string, any>) => { review.summary[0].html = "<img>" }],
    ["an extra top-level field", (review: Record<string, any>) => { review.body = "text" }],
    ["a non-boolean notice flag", (review: Record<string, any>) => { review.undecoded = "false" }],
    ["a non-string value", (review: Record<string, any>) => { review.summary[0].value = 5 }],
    ["a fractional index", (review: Record<string, any>) => { review.details[1].fields[0].index = 1.5 }],
    ["a missing signer", (review: Record<string, any>) => { delete review.signer }],
    ["a heading that carries a value", (review: Record<string, any>) => { review.summary[0].heading = true }],
    ["a heading that carries notes", (review: Record<string, any>) => { review.summary[0] = { label: "review.field.transferSol", value: "", heading: true, notes: ["review.note.signer"] } }],
    ["a non-boolean heading flag", (review: Record<string, any>) => { review.summary[0].heading = "yes" }],
    ["a unit without a currency", (review: Record<string, any>) => { review.summary[1].unit = "symbol" }],
    ["an unknown unit", (review: Record<string, any>) => { review.summary[0].unit = "usd" }],
    ["a shown word that is free text", (review: Record<string, any>) => { review.summary[0].shownAs = "Unlimited" }],
    ["a shown word from another key family", (review: Record<string, any>) => { review.summary[0].shownAs = "review.field.amount" }],
    ["a non-string destination", (review: Record<string, any>) => { review.summary[0].to = 5 }],
    ["a non-string second value", (review: Record<string, any>) => { review.summary[0].secondary = 5 }],
    ["a non-boolean elide flag", (review: Record<string, any>) => { review.summary[1].elide = "yes" }],
    ["a heading that carries a destination", (review: Record<string, any>) => { review.summary[0] = { label: "review.field.transferSol", value: "", heading: true, to: "x" } }],
    ["decimals beside a native currency", (review: Record<string, any>) => { review.summary[0].decimals = 6 }],
    ["decimals past a u8", (review: Record<string, any>) => { review.summary[1].decimals = 256 }],
    ["fractional decimals", (review: Record<string, any>) => { review.summary[1].decimals = 1.5 }],
    ["negative decimals", (review: Record<string, any>) => { review.summary[1].decimals = -1 }],
    ["string decimals", (review: Record<string, any>) => { review.summary[1].decimals = "6" }],
    ["an unknown time form", (review: Record<string, any>) => { review.summary[1].time = "unix-ms" }],
    ["a time beside decimals", (review: Record<string, any>) => { review.summary[1].time = "unix-seconds"; review.summary[1].decimals = 6 }],
    ["a time beside a native currency", (review: Record<string, any>) => { review.summary[0].time = "unix-seconds" }],
    ["a heading that carries decimals", (review: Record<string, any>) => { review.summary[0] = { label: "review.field.transferSol", value: "", heading: true, decimals: 6 } }],
  ])("refuses %s", (_name, mutate) => {
    const review = wire()
    mutate(review)
    expect(() => parseSigningReview(review)).toThrow(/signing review is malformed/)
  })
})
