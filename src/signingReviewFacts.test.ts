import { describe, expect, it } from "vitest"
import { hexToBytes } from "@noble/curves/utils.js"
import { keccak256, serializeTransaction } from "viem"
import corpus from "./fixtures/solana-acceptance/corpus.json"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"
import { parseSigningReview, type ReviewField, type SigningReview } from "./signingReview"
import { evmSigningReview, solanaSigningReview } from "./signingReviewFacts"
import { parseSolanaMessage } from "./solana/message"
import { deriveSigningAddresses } from "./vaultCrypto"

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
    expect(review.signer).toEqual({ label: "review.field.signingKey", value: vector.requestedSigner.publicKeyBase58 })
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

  it("shows a native transfer as from, to and exact SOL beside raw lamports", () => {
    const review = solana("legacy-sol-transfer")
    expect(review.kind).toBe("review.kind.solanaSystemTransfer")
    expect(review.summary).toEqual([
      { label: "review.field.from", value: "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z" },
      { label: "review.field.to", value: "8KuqTnrTpiE3zGXbLxZzw1bR3vjbfNADBEVYeECj62T8" },
      { label: "review.field.amount", value: "1234567890", native: "sol" },
    ])
    expect(review.undecoded).toBe(false)
    expect(solana("v0-sol-transfer-static").kind).toBe("review.kind.solanaSystemTransfer")
  })

  it("shows SPL Transfer with token accounts and raw units only: no mint, decimals, owner or symbol", () => {
    const review = solana("legacy-spl-transfer-u64-max")
    expect(review.kind).toBe("review.kind.solanaTokenTransfer")
    expect(labels(review.summary)).toEqual(["review.field.fromTokenAccount", "review.field.toTokenAccount", "review.field.amount"])
    expect(review.summary[2]).toEqual({ label: "review.field.amount", value: "18446744073709551615", notes: ["review.note.baseUnits"] })
    expect(labels(allFields(review))).not.toContain("review.field.mint")
    expect(JSON.stringify(review)).not.toContain("review.note.decimals")
    expect(allFields(review).some((field) => field.native)).toBe(false)
  })

  it("shows TransferChecked with the encoded mint and decimals, and the authority in Details only", () => {
    const vector = corpus.solana.find((candidate) => candidate.id === "legacy-spl-transfer-checked-different-fee-payer")!
    const decoded = vector.expected.instructions[0].decoded as { sourceTokenAccount: string; destinationTokenAccount: string; mint: string; authority: string }
    const review = solanaReview(vector)
    expect(review.summary).toEqual([
      { label: "review.field.fromTokenAccount", value: decoded.sourceTokenAccount },
      { label: "review.field.toTokenAccount", value: decoded.destinationTokenAccount },
      { label: "review.field.mint", value: decoded.mint },
      { label: "review.field.amount", value: "1234567", notes: ["review.note.baseUnits", { key: "review.note.decimals", count: 6 }] },
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
    expect(review.summary).toEqual(vector.expected.instructions.map((instruction, index) => ({
      label: "review.field.programIndexed", index: index + 1, value: instruction.programId,
      notes: [{ key: "review.note.dataBytes", count: instruction.dataHex.length / 2 }, "review.note.notDecoded"],
    })))
    // Near misses of the decoded layouts stay raw too.
    const nearMisses = solana("legacy-known-program-near-misses-raw")
    expect(nearMisses.undecoded).toBe(true)
    expect(labels(allFields(nearMisses))).not.toContain("review.field.amount")
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
    expect(labels(unused.summary)).toEqual(["review.field.from", "review.field.to", "review.field.amount"])
  })

  it("counts instead of listing when a summary would run long, and keeps every fact in Details", () => {
    const two = solana("legacy-two-sol-transfers")
    expect(two.kind).toBe("review.kind.solanaTransaction")
    expect(two.summary).toEqual([{ label: "review.field.instructions", value: "2", notes: [{ key: "review.note.transfersDecoded", count: 2 }] }])
    expect(two.undecoded).toBe(false)
    for (const index of [1, 2]) {
      expect(labels(group(two, "review.group.instruction", index).fields)).toEqual(expect.arrayContaining(["review.field.from", "review.field.to", "review.field.amount"]))
    }
    const vector = corpus.solana.find((candidate) => candidate.id === "legacy-two-sol-transfers")!
    vector.expected.instructions.forEach((instruction, index) => {
      const decoded = instruction.decoded as { destination: string; lamports: string }
      const fields = group(two, "review.group.instruction", index + 1).fields
      expect(fields.find((field) => field.label === "review.field.to")!.value).toBe(decoded.destination)
      expect(fields.find((field) => field.label === "review.field.amount")).toEqual({ label: "review.field.amount", value: decoded.lamports, native: "sol" })
    })
  })
})

describe("EVM verified transaction to signing review", () => {
  it.each(corpus.evm)("$id: derived signer, exact envelope and one notice exactly when undecoded", (vector) => {
    const verified = verifySigningContext(vector.context as VerifiableSigningContext)
    const scheme = "ecdsa-secp256k1-recoverable"
    const review = evmSigningReview(verified.evm!, { publicKey: vector.signature.publicKeyHex, scheme, digest: verified.digest })
    const transaction = vector.context.unsignedTransaction as Record<string, string | undefined>

    // The address comes from the key, by the sandbox's own derivation; the public key is in Details.
    expect(review.signer).toEqual({ label: "review.field.signingAddress", value: deriveSigningAddresses(vector.signature.publicKeyHex).eth })
    expect(review.signer.value).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
    expect(group(review, "review.group.transaction").fields[0]).toEqual({ label: "review.field.publicKey", value: vector.signature.publicKeyHex })
    expect(labels(review.summary)).not.toContain("review.field.publicKey")

    expect(review.undecoded).toBe(vector.expected.partiallyDecoded)
    const exact = group(review, "review.group.exact").fields
    expect(exact.find((field) => field.label === "review.field.calldata")!.value).toBe(vector.expected.calldata)
    expect(exact.find((field) => field.label === "review.field.unsignedTransaction")).toMatchObject({ value: vector.unsignedSerialized, raw: true })
    expect(exact.find((field) => field.label === "review.field.digest")!.value).toBe(`0x${vector.expected.serializedKeccak256}`)

    // Ether only on chain id 1; any other chain keeps raw wei and names no currency.
    const value = review.summary.find((field) => field.label === "review.field.value")!
    expect(value.value).toBe(transaction.value)
    if (vector.context.chainId === "1") expect(value).toEqual({ label: "review.field.value", value: transaction.value, native: "eth" })
    else expect(value).toEqual({ label: "review.field.value", value: transaction.value, notes: ["review.note.wei"] })
    expect(review.summary[0]).toEqual({ label: "review.field.chainId", value: vector.context.chainId })

    const destination = review.summary[1]
    if (transaction.to) expect(destination).toEqual({ label: "review.field.contract", value: transaction.to })
    else expect(destination).toEqual({ label: "review.field.contract", value: "", notes: ["review.note.contractCreation"] })

    expect(parseSigningReview(JSON.parse(JSON.stringify(review)))).toEqual(review)
  })

  const review = (id: string): SigningReview => {
    const vector = corpus.evm.find((candidate) => candidate.id === id)!
    const verified = verifySigningContext(vector.context as VerifiableSigningContext)
    return evmSigningReview(verified.evm!, { publicKey: vector.signature.publicKeyHex, scheme: "ecdsa-secp256k1-der", digest: verified.digest })
  }

  it("lists a decoded call's arguments under their built-in names", () => {
    const transfer = review("evm-erc20-transfer")
    expect(transfer.undecoded).toBe(false)
    expect(transfer.summary.slice(3)).toEqual([
      { label: "review.field.call", value: "transfer(address,uint256)" },
      { label: "review.field.argument", index: 1, name: "to (address)", value: "0x1111111111111111111111111111111111111111" },
      { label: "review.field.argument", index: 2, name: "amount (uint256)", value: "9007199254740993" },
    ])
    expect(group(transfer, "review.group.call").fields.map((field) => field.value)).toEqual([
      "transfer(address,uint256)", "0xa9059cbb", "0x1111111111111111111111111111111111111111", "9007199254740993",
    ])
    // The decoded recipient is an argument; the transaction's destination stays the contract.
    expect(transfer.summary[1].value).toBe("0x2222222222222222222222222222222222222222")
  })

  it("keeps undecoded calldata raw: selector, byte count and the complete bytes", () => {
    const unknown = review("evm-synthetic-uniswap-shaped-unknown-selector")
    expect(unknown.summary.at(-1)).toMatchObject({ label: "review.field.selector", value: "0x414bf389", notes: [expect.objectContaining({ key: "review.note.dataBytes" }), "review.note.notDecoded"] })
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
      expect(creation.summary.at(-1)).toMatchObject({ label: "review.field.initCode", value: "", notes: [expect.objectContaining({ key: "review.note.dataBytes" }), "review.note.notDecoded"] })
      expect(labels(allFields(creation))).not.toEqual(expect.arrayContaining(["review.field.selector"]))
      expect(labels(allFields(creation))).not.toContain("review.field.call")
    }
  })

  it("shows a plain transfer with no call rows and no notice, with the fee fields its type carries", () => {
    const legacy = review("evm-eip155-published-example")
    expect(legacy.undecoded).toBe(false)
    expect(labels(legacy.summary)).toEqual(["review.field.chainId", "review.field.contract", "review.field.value"])
    expect(legacy.summary[2]).toEqual({ label: "review.field.value", value: "1000000000000000000", native: "eth" })
    const fields = labels(group(legacy, "review.group.transaction").fields)
    expect(fields).toContain("review.field.gasPrice")
    expect(fields).not.toContain("review.field.maxFeePerGas")
    const modern = labels(group(review("evm-eth-eip1559"), "review.group.transaction").fields)
    expect(modern).toEqual(expect.arrayContaining(["review.field.maxFeePerGas", "review.field.maxPriorityFeePerGas"]))
    expect(modern).not.toContain("review.field.gasPrice")
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
    expect(permit.summary.at(-1)).toEqual({ label: "review.field.call", value: verified.evm!.decoded!.signature, notes: [{ key: "review.note.argumentsInDetails", count: 7 }] })
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
  ])("refuses %s", (_name, mutate) => {
    const review = wire()
    mutate(review)
    expect(() => parseSigningReview(review)).toThrow(/signing review is malformed/)
  })
})
