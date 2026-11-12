import { afterEach, describe, expect, it, vi } from "vitest"
import { hashTypedData } from "viem"
import { eip712SigningReview } from "./eip712Review"
import { setLocale } from "./i18n"
import { verifySigningContext, type VerifiableSigningContext } from "./signingContext"
import { parseSigningReview, renderSigningReview, type ReviewField, type SigningReview } from "./signingReview"
import { installCardDocument } from "./testDom"

// EIP-712 typed data to the structured review. Every case is first hashed and
// verified by the unchanged verifier; the review never decides acceptance.

const PUBLIC_KEY = "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" // public key of scalar 1
const SIGNER = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
const TOKEN = "0x1111111111111111111111111111111111111111"
const SPENDER = "0x2222222222222222222222222222222222222222"
const OWNER = "0x3333333333333333333333333333333333333333"
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3"
const MAX160 = ((1n << 160n) - 1n).toString()
const MAX256 = ((1n << 256n) - 1n).toString()

type Typed = { domain: Record<string, unknown>; types: Record<string, Array<{ name: string; type: string }>>; primaryType: string; message: Record<string, unknown> }

/** Verify with the production verifier, then review what it verified. */
function review(typed: Typed): SigningReview {
  const context = { kind: "eip-712-typed-data", typedData: typed, digestAlgorithm: "eip712", digest: hashTypedData(typed as never).slice(2) } as VerifiableSigningContext
  const verified = verifySigningContext(context)
  expect(verified.digest).toBe(context.digest)
  const result = eip712SigningReview(verified.typedData, { publicKey: PUBLIC_KEY, scheme: "ecdsa-secp256k1-recoverable", digest: verified.digest })
  expect(parseSigningReview(JSON.parse(JSON.stringify(result)))).toEqual(result)
  return result
}

const field = (fields: ReviewField[], label: string) => fields.find((candidate) => candidate.label === label)
const detailGroup = (result: SigningReview, title: string) => result.details.find((group) => group.title === title)

const permitTypes = {
  Permit: [
    { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
}
const permit = (value: unknown, extra: Partial<Typed> = {}): Typed => ({
  domain: { name: "Test Token", version: "1", chainId: 1, verifyingContract: TOKEN },
  types: permitTypes, primaryType: "Permit",
  message: { owner: OWNER, spender: SPENDER, value, nonce: 0, deadline: "1893456000" },
  ...extra,
})
const permitDetails = [
  { name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" },
]
const permit2Domain = { name: "Permit2", chainId: 1, verifyingContract: PERMIT2 }
const permitSingle = (amount: unknown, details: Record<string, unknown> = {}): Typed => ({
  domain: permit2Domain,
  types: { PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }], PermitDetails: permitDetails },
  primaryType: "PermitSingle",
  message: { details: { token: TOKEN, amount, expiration: 0, nonce: 0, ...details }, spender: SPENDER, sigDeadline: "1893456000" },
})
const permitBatch = (amounts: unknown[]): Typed => ({
  domain: permit2Domain,
  types: { PermitBatch: [{ name: "details", type: "PermitDetails[]" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }], PermitDetails: permitDetails },
  primaryType: "PermitBatch",
  message: { details: amounts.map((amount, index) => ({ token: `0x${String(index + 1).repeat(40)}`, amount, expiration: 1893456000, nonce: index })), spender: SPENDER, sigDeadline: "1893456000" },
})
const tokenPermissions = [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }]
const transferFrom = (amount: unknown): Typed => ({
  domain: permit2Domain,
  types: {
    PermitTransferFrom: [{ name: "permitted", type: "TokenPermissions" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
    TokenPermissions: tokenPermissions,
  },
  primaryType: "PermitTransferFrom",
  message: { permitted: { token: TOKEN, amount }, spender: SPENDER, nonce: 7, deadline: "1893456000" },
})
const batchTransferFrom = (amounts: unknown[]): Typed => ({
  domain: permit2Domain,
  types: {
    PermitBatchTransferFrom: [{ name: "permitted", type: "TokenPermissions[]" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
    TokenPermissions: tokenPermissions,
  },
  primaryType: "PermitBatchTransferFrom",
  message: { permitted: amounts.map((amount) => ({ token: TOKEN, amount })), spender: SPENDER, nonce: 7, deadline: "1893456000" },
})

afterEach(() => { setLocale("en"); vi.unstubAllGlobals() })

describe("generic EIP-712", () => {
  const mail: Typed = {
    domain: { name: "Ether Mail", version: "1", chainId: 1, verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" },
    types: {
      Person: [{ name: "name", type: "string" }, { name: "wallet", type: "address" }],
      Mail: [{ name: "from", type: "Person" }, { name: "to", type: "Person" }, { name: "contents", type: "string" }],
    },
    primaryType: "Mail",
    message: {
      from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" },
      to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" },
      contents: "Hello, Bob!",
    },
  }

  it("leads with each message field by path and type, then the hashed domain; the record's ETH address last", () => {
    const result = review(mail)
    expect(result.kind).toBe("review.kind.eip712")
    expect(result.warnings).toBeUndefined()
    expect(result.undecoded).toBe(false)
    expect(result.signer).toEqual({ label: "review.field.signingAddress", value: SIGNER, elide: true })
    expect(result.summary.slice(-4)).toEqual([
      { label: "review.field.chainId", value: "1 · Ethereum", notes: [] },
      { label: "review.field.domainName", value: "Ether Mail", notes: [] },
      { label: "review.field.verifyingContract", value: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC", notes: [], elide: true },
      { label: "review.field.primaryType", value: "Mail" },
    ])
    expect(result.summary.slice(0, -4).map((row) => [row.name, row.value, row.elide])).toEqual([
      ["from.name (string)", "Cow", undefined], ["from.wallet (address)", "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826", true],
      ["to.name (string)", "Bob", undefined], ["to.wallet (address)", "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB", true], ["contents (string)", "Hello, Bob!", undefined],
    ])
    // Details: public key, scheme and digest, and the complete types and typed data to copy.
    expect(field(detailGroup(result, "review.group.transaction")!.fields, "review.field.publicKey")!.value).toBe(PUBLIC_KEY)
    const exact = detailGroup(result, "review.group.exact")!.fields
    expect(JSON.parse(field(exact, "review.field.typedData")!.value)).toEqual(mail)
    expect(JSON.parse(field(exact, "review.field.typedTypes")!.value)).toEqual(mail.types)
  })

  it("names only known chain ids and never guesses one", () => {
    const unknown = review({ ...mail, domain: { ...mail.domain, chainId: 424242 } })
    expect(field(unknown.summary, "review.field.chainId")).toEqual({ label: "review.field.chainId", value: "424242", notes: ["review.note.unknownChain"] })
    expect(JSON.stringify(unknown)).not.toContain("Ethereum")
  })

  it("never treats an inherited object key as a known chain", () => {
    for (const chainId of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const result = review({ ...mail, domain: { ...mail.domain, chainId } })
      // A string chainId is not in viem's inferred domain type, so it is also outside the hash.
      expect(field(result.summary, "review.field.chainId")).toEqual({ label: "review.field.chainId", value: chainId, notes: ["review.note.unknownChain", "review.note.notInTypedHash"] })
      expect(JSON.stringify(result)).not.toContain("native code")
    }
  })

  it("marks values the typed-data hash does not cover, without refusing them", () => {
    // A string chainId is not in viem's inferred domain type; an extra message key is not in the primary type.
    const result = review({ ...mail, domain: { ...mail.domain, chainId: "1" }, message: { ...mail.message, note: "unsigned extra" } })
    expect(field(result.summary, "review.field.chainId")).toEqual({ label: "review.field.chainId", value: "1 · Ethereum", notes: ["review.note.notInTypedHash"] })
    expect(field(result.summary, "review.field.notInTypedHash")!.notes).toEqual([{ key: "review.note.fieldsOutsideHash", count: 2 }])
    expect(detailGroup(result, "review.group.notInTypedHash")!.fields.map((row) => row.name)).toEqual(["domain.chainId", "note"])
    expect(result.summary.map((row) => row.value)).not.toContain("unsigned extra")
  })

  it("follows an explicit EIP712Domain type, including fields it leaves out", () => {
    const explicit = review({
      ...mail,
      types: { ...mail.types, EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }] },
    })
    expect(field(explicit.summary, "review.field.verifyingContract")!.notes).toEqual(["review.note.notInTypedHash"])
    expect(field(explicit.summary, "review.field.chainId")!.notes).toEqual([])
  })

  it("says so when the primary type is EIP712Domain and the message is not hashed at all", () => {
    const result = review({ ...mail, primaryType: "EIP712Domain" })
    expect(field(result.summary, "review.field.primaryType")).toEqual({ label: "review.field.primaryType", value: "EIP712Domain", notes: ["review.note.messageNotHashed"] })
    expect(result.summary.some((row) => row.label === "review.field.typedField")).toBe(false)
    expect(detailGroup(result, "review.group.notInTypedHash")!.fields.map((row) => row.name)).toEqual(["message"])
  })

  it("shortens a very long field path for its label, and the window still accepts the review", () => {
    const long = "a".repeat(4097)
    const typed: Typed = { ...mail, types: { ...mail.types, Mail: [...mail.types.Mail, { name: long, type: "string" }] }, message: { ...mail.message, [long]: "v", [`x${long}`]: "unsigned" } }
    const result = review(typed)
    const row = result.summary.find((candidate) => candidate.value === "v")!
    expect(row.name!.length).toBeLessThanOrEqual(512)
    expect(row.notes).toEqual(["review.note.pathShortened"])
    const extra = detailGroup(result, "review.group.notInTypedHash")!.fields[0]
    expect(extra.notes).toEqual(["review.note.notInTypedHash", "review.note.pathShortened"])
    // The complete path stays in the raw typed data.
    expect(JSON.parse(field(detailGroup(result, "review.group.exact")!.fields, "review.field.typedData")!.value).message[long]).toBe("v")
  })

  it("never calls a signed field past the listing depth unsigned: it is counted as more, in the raw data", () => {
    const depth = 40
    const types: Typed["types"] = { L0: [{ name: "leaf", type: "string" }] }
    for (let level = 1; level <= depth; level += 1) types[`L${level}`] = [{ name: "next", type: `L${level - 1}` }]
    let message: Record<string, unknown> = { leaf: "deep" }
    for (let level = 1; level <= depth; level += 1) message = { next: message }
    const result = review({ domain: mail.domain, types, primaryType: `L${depth}`, message: message.next ? { next: message.next } : message })
    expect(detailGroup(result, "review.group.notInTypedHash")).toBeUndefined()
    expect(result.summary.some((row) => row.label === "review.field.notInTypedHash")).toBe(false)
    expect(field(detailGroup(result, "review.group.typedMessage")!.fields, "review.field.moreFields")!.notes).toEqual([{ key: "review.note.moreInRawData", count: 1 }])
    expect(field(result.summary, "review.field.moreFields")!.notes).toEqual([{ key: "review.note.moreInstructionsInDetails", count: 1 }])
  })

  it("keeps long, nested and Unicode field paths, bounded in the summary and complete in Details", () => {
    const long = "字段".repeat(200)
    const nested: Typed = {
      domain: mail.domain,
      types: { Leaf: [{ name: long, type: "string" }, { name: "n", type: "uint256" }], Root: [{ name: "items", type: "Leaf[]" }] },
      primaryType: "Root",
      message: { items: Array.from({ length: 12 }, (_unused, index) => ({ [long]: `<b>${index}</b>`, n: index })) },
    }
    const result = review(nested)
    const rows = result.summary.filter((row) => row.label === "review.field.typedField")
    expect(rows).toHaveLength(8)
    expect(rows[0].name).toBe(`items[0].${long} (string)`)
    expect(rows[0].value).toBe("<b>0</b>")
    expect(field(result.summary, "review.field.moreFields")!.notes).toEqual([{ key: "review.note.moreInstructionsInDetails", count: 16 }])
    expect(detailGroup(result, "review.group.typedMessage")!.fields).toHaveLength(24)
    // Rendered as text: markup in a value or a field name is never interpreted.
    const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
    renderSigningReview(dom.content as unknown as HTMLElement, result)
    expect(dom.content.querySelector(".review-summary")!.querySelectorAll(".review-mono").map((node) => node.textContent)).toContain("<b>0</b>")
    expect(dom.content.querySelectorAll("b")).toHaveLength(0)
    expect(dom.content.querySelector(".review-summary")!.querySelectorAll(".review-label").map((node) => node.textContent)).toContain(`items[0].${long} (string)`)
  })
})

// Coverage matrix against viem's encodeField branches (struct by declared name
// first, then bytes/string, then arrays, then atomic values). Each accepted case
// lists every hashed value; changing any listed value changes the digest.
describe("typed-data shapes the hash accepts", () => {
  const domain = { name: "Shapes", version: "1", chainId: 1, verifyingContract: TOKEN }
  const shape = (types: Typed["types"], message: Record<string, unknown>): Typed => ({ domain, types, primaryType: "Root", message })
  const listed = (result: SigningReview) => detailGroup(result, "review.group.typedMessage")!.fields.map((row) => [row.name, row.value])
  const digestChanges = (typed: Typed, mutate: (message: Record<string, unknown>) => void) => {
    const changed = structuredClone(typed)
    mutate(changed.message)
    return hashTypedData(changed as never) !== hashTypedData(typed as never)
  }

  const cases: Array<{ name: string; typed: Typed; rows: Array<[string, string]>; mutate: (message: Record<string, unknown>) => void }> = [
    {
      name: "a struct carried by an array, read by property like viem",
      typed: shape({ Root: [{ name: "nested", type: "S" }], S: [{ name: "0", type: "uint256" }] }, { nested: [1] }),
      rows: [["nested.0 (uint256)", "1"]],
      mutate: (message) => { message.nested = [2] },
    },
    {
      name: "a declared type whose name ends in [], which viem treats as a struct",
      typed: shape({ Root: [{ name: "nested", type: "S[]" }], "S[]": [{ name: "n", type: "uint256" }] }, { nested: { n: 1 } }),
      rows: [["nested.n (uint256)", "1"]],
      mutate: (message) => { message.nested = { n: 2 } },
    },
    {
      name: "an empty atomic array",
      typed: shape({ Root: [{ name: "items", type: "uint256[]" }] }, { items: [] }),
      rows: [["items (uint256[])", "[]"]],
      mutate: (message) => { message.items = [0] },
    },
    {
      name: "nested arrays, one of them empty",
      typed: shape({ Root: [{ name: "grid", type: "uint256[][]" }] }, { grid: [[1, 2], []] }),
      rows: [["grid[0][0] (uint256)", "1"], ["grid[0][1] (uint256)", "2"], ["grid[1] (uint256[])", "[]"]],
      mutate: (message) => { message.grid = [[1, 2], [3]] },
    },
    {
      name: "an empty struct array and a fixed-size array",
      typed: shape({ Root: [{ name: "people", type: "P[]" }, { name: "pair", type: "bytes32[2]" }], P: [{ name: "who", type: "address" }] }, { people: [], pair: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`] }),
      rows: [["people (P[])", "[]"], [`pair[0] (bytes32)`, `0x${"11".repeat(32)}`], [`pair[1] (bytes32)`, `0x${"22".repeat(32)}`]],
      mutate: (message) => { message.people = [{ who: TOKEN }] },
    },
    {
      name: "dynamic bytes and strings as leaves",
      typed: shape({ Root: [{ name: "data", type: "bytes" }, { name: "note", type: "string" }] }, { data: "0x0102", note: "" }),
      rows: [["data (bytes)", "0x0102"], ["note (string)", ""]],
      mutate: (message) => { message.note = "x" },
    },
  ]

  for (const { name, typed, rows, mutate } of cases) {
    it(`lists every hashed value: ${name}`, () => {
      const result = review(typed)
      expect(listed(result)).toEqual(rows)
      expect(result.summary.slice(0, -4).map((row) => [row.name, row.value])).toEqual(rows)
      expect(detailGroup(result, "review.group.notInTypedHash")).toBeUndefined()
      expect(digestChanges(typed, mutate)).toBe(true)
    })
  }

  it("keeps array-carrier indices the struct does not declare outside the hash", () => {
    const typed = shape({ Root: [{ name: "nested", type: "S" }], S: [{ name: "0", type: "uint256" }] }, { nested: [1, 9] })
    const result = review(typed)
    expect(detailGroup(result, "review.group.notInTypedHash")!.fields.map((row) => row.name)).toEqual(["nested.1"])
    expect(digestChanges(typed, (message) => { message.nested = [1, 8] })).toBe(false)
  })

  it("refuses to describe a shape it cannot encode, instead of dropping it; the caller falls back", () => {
    const unhashable = { ...shape({ Root: [{ name: "items", type: "uint256[]" }] }, { items: 5 }) }
    expect(() => eip712SigningReview(unhashable, { publicKey: PUBLIC_KEY, scheme: "ecdsa-secp256k1-recoverable", digest: "00".repeat(32) })).toThrow()
    const nullStruct = shape({ Root: [{ name: "nested", type: "S" }], S: [{ name: "n", type: "uint256" }] }, { nested: null })
    expect(() => eip712SigningReview(nullStruct, { publicKey: PUBLIC_KEY, scheme: "ecdsa-secp256k1-recoverable", digest: "00".repeat(32) })).toThrow()
  })
})

describe("recognized token authorizations", () => {
  it.each([
    ["finite", "1000000", false],
    ["zero", "0", false],
    ["one below the maximum", ((1n << 256n) - 2n).toString(), false],
    ["the uint256 maximum in decimal", MAX256, true],
    ["the uint256 maximum in hex", `0x${"f".repeat(64)}`, true],
  ])("ERC-2612 permit, %s", (_name, value, unlimited) => {
    const result = review(permit(value))
    expect(result.kind).toBe("review.kind.erc2612Permit")
    expect(result.warnings).toEqual(unlimited ? ["review.warning.tokenAuthorization", "review.warning.unlimitedAllowance"] : ["review.warning.tokenAuthorization"])
    expect(field(result.summary, "review.field.spender")!.value).toBe(SPENDER)
    // The maximum reads "Unlimited" on the first screen; the exact value stays on the field and in Details. Never a guessed unit.
    expect(field(result.summary, "review.field.permitAmount")).toEqual(unlimited
      ? { label: "review.field.permitAmount", value: BigInt(value).toString(), shownAs: "review.value.unlimited", notes: ["review.note.exactInDetails"] }
      : { label: "review.field.permitAmount", value: BigInt(value).toString(), notes: ["review.note.rawTokenUnits"] })
    expect(detailGroup(result, "review.group.typedMessage")!.fields.find((row) => row.name === "value (uint256)")!.value).toBe(BigInt(value).toString())
    // Spender, amount and deadline first; then where it applies; the owner, nonce and signer after.
    expect(result.summary.map((row) => row.label)).toEqual([
      "review.field.spender", "review.field.permitAmount", "review.field.permitDeadline",
      "review.field.chainId", "review.field.domainName", "review.field.verifyingContract", "review.field.primaryType",
      "review.field.permitOwner", "review.field.permitNonce",
    ])
    // The owner in the message is shown as such; the signer is the record's own address.
    expect(field(result.summary, "review.field.permitOwner")!.value).toBe(OWNER)
    expect(result.signer.value).toBe(SIGNER)
    expect(field(result.summary, "review.field.permitDeadline")!.notes).toEqual(["review.note.permitDeadline"])
  })

  it("reads unusual integer forms the verifier accepts exactly as they are encoded", () => {
    expect(field(review(permit(" +1 ")).summary, "review.field.permitAmount")!.value).toBe("1")
    expect(field(review(permit("0b1")).summary, "review.field.permitAmount")!.value).toBe("1")
  })

  it.each([
    ["finite", "1000000", false],
    ["zero", 0, false],
    ["one below the uint160 maximum", ((1n << 160n) - 2n).toString(), false],
    ["the uint160 maximum", MAX160, true],
    ["the uint160 maximum in hex", `0x${"f".repeat(40)}`, true],
  ])("Permit2 allowance, %s", (_name, amount, unlimited) => {
    const result = review(permitSingle(amount))
    expect(result.kind).toBe("review.kind.permit2Allowance")
    expect(result.warnings).toEqual(unlimited ? ["review.warning.tokenAuthorization", "review.warning.unlimitedAllowance"] : ["review.warning.tokenAuthorization"])
    expect(field(result.summary, "review.field.permitToken")).toEqual({ label: "review.field.permitToken", index: 1, value: TOKEN, elide: true })
    expect(field(result.summary, "review.field.permitTokenAmount")!.shownAs).toBe(unlimited ? "review.value.unlimited" : undefined)
    expect(result.summary.slice(0, 2).map((row) => row.label)).toEqual(["review.field.spender", "review.field.permitTokenAmount"])
    expect(field(result.summary, "review.field.permitExpiration")!.notes).toEqual(["review.note.permit2Expiration"])
    expect(field(result.summary, "review.field.signatureDeadline")!.value).toBe("1893456000")
  })

  it("never calls a maximum nonce or expiration unlimited", () => {
    const result = review(permitSingle("5", { expiration: 2 ** 48 - 1, nonce: 2 ** 48 - 1 }))
    expect(result.warnings).toEqual(["review.warning.tokenAuthorization"])
  })

  /** The listed batch entries: [signed position, amount], in first-screen order. */
  const listed = (result: SigningReview): Array<[number | undefined, string]> =>
    result.summary.filter((row) => row.label === "review.field.permitTokenAmount").map((row) => [row.index, row.value])
  const hidden = (result: SigningReview) => field(result.summary, "review.field.moreTokens")?.notes

  it("lists an unlimited batch entry first, under its signed position, and counts only finite entries as more", () => {
    // The previous card listed entries 1-3 and hid the unlimited fourth.
    const four = review(permitBatch(["1", "2", "3", MAX160]))
    expect(four.kind).toBe("review.kind.permit2Allowance")
    expect(four.warnings).toEqual(["review.warning.tokenAuthorization", "review.warning.unlimitedAllowance"])
    expect(listed(four)).toEqual([[4, MAX160], [1, "1"], [2, "2"]])
    expect(field(four.summary, "review.field.permitTokenAmount")).toEqual({
      label: "review.field.permitTokenAmount", index: 4, value: MAX160, shownAs: "review.value.unlimited", notes: ["review.note.exactInDetails"],
    })
    // Each listed entry keeps its own token and expiry rows, under the same signed position.
    expect(four.summary.slice(1, 4)).toEqual([
      expect.objectContaining({ label: "review.field.permitTokenAmount", index: 4 }),
      { label: "review.field.permitToken", index: 4, value: `0x${"4".repeat(40)}`, elide: true },
      expect.objectContaining({ label: "review.field.permitExpiration", index: 4 }),
    ])
    expect(hidden(four)).toEqual([{ key: "review.note.moreEntriesInDetails", count: 1 }])
    // The signed structure is unchanged: Details list every entry in signed order.
    const amounts = detailGroup(four, "review.group.typedMessage")!.fields.filter((row) => row.name?.endsWith(".amount (uint160)")).map((row) => row.value)
    expect(amounts).toEqual(["1", "2", "3", MAX160])
  })

  it("keeps maxima and finite entries each in signed order, and never hides a maximum behind the count", () => {
    expect(listed(review(permitBatch(["1", MAX160, "3", MAX160, "5"])))).toEqual([[2, MAX160], [4, MAX160], [1, "1"]])
    expect(hidden(review(permitBatch(["1", MAX160, "3", MAX160, "5"])))).toEqual([{ key: "review.note.moreEntriesInDetails", count: 2 }])
    // Three maxima fill the places; every finite entry is counted.
    expect(listed(review(permitBatch(["1", MAX160, MAX160, MAX160])))).toEqual([[2, MAX160], [3, MAX160], [4, MAX160]])
    expect(hidden(review(permitBatch(["1", MAX160, MAX160, MAX160])))).toEqual([{ key: "review.note.moreEntriesInDetails", count: 1 }])
    // All finite: the first three in signed order, as before.
    expect(listed(review(permitBatch(["1", "2", "3", "4", "5"])))).toEqual([[1, "1"], [2, "2"], [3, "3"]])
    expect(hidden(review(permitBatch(["1", "2", "3", "4", "5"])))).toEqual([{ key: "review.note.moreEntriesInDetails", count: 2 }])
    expect(review(permitBatch(["1", "2", "3", "4", "5"])).warnings).toEqual(["review.warning.tokenAuthorization"])
    // Exactly three: nothing more.
    expect(hidden(review(permitBatch(["1", MAX160, "3"])))).toBeUndefined()
  })

  it("lists every maximum when there are more than three, with their count and the deadline before them", () => {
    const result = review(permitBatch([MAX160, "2", MAX160, MAX160, MAX160, "6"]))
    expect(listed(result)).toEqual([[1, MAX160], [3, MAX160], [4, MAX160], [5, MAX160]])
    expect(result.summary.slice(0, 4).map((row) => row.label)).toEqual([
      "review.field.spender", "review.field.maxEntries", "review.field.signatureDeadline", "review.field.permitTokenAmount",
    ])
    expect(field(result.summary, "review.field.maxEntries")).toEqual({ label: "review.field.maxEntries", value: "4", notes: [{ key: "review.note.ofEntries", count: 6 }] })
    expect(hidden(result)).toEqual([{ key: "review.note.moreEntriesInDetails", count: 2 }])
    expect(result.summary.filter((row) => row.label === "review.field.signatureDeadline")).toHaveLength(1)
  })

  it("reviews an empty batch honestly: no entries, no maximum, no count", () => {
    const result = review(permitBatch([]))
    expect(result.kind).toBe("review.kind.permit2Allowance")
    expect(listed(result)).toEqual([])
    expect(hidden(result)).toBeUndefined()
    expect(result.warnings).toEqual(["review.warning.tokenAuthorization"])
  })

  it("orders a SignatureTransfer batch the same way, as a one-time maximum and never an unlimited allowance", () => {
    const batch = review(batchTransferFrom(["1", "2", "3", "4", MAX256]))
    expect(listed(batch)).toEqual([[5, MAX256], [1, "1"], [2, "2"]])
    expect(field(batch.summary, "review.field.permitTokenAmount")!.shownAs).toBe("review.value.maximumOneTime")
    expect(hidden(batch)).toEqual([{ key: "review.note.moreEntriesInDetails", count: 2 }])
    expect(JSON.stringify(batch)).not.toContain("review.value.unlimited")
  })

  it("dates every signature deadline in UTC beside its exact integer, and keeps an allowance expiry raw", () => {
    const deadline = (result: SigningReview, label: string) => field(result.summary, label)
    expect(deadline(review(permit("1")), "review.field.permitDeadline")).toEqual({
      label: "review.field.permitDeadline", value: "1893456000", time: "unix-seconds", notes: ["review.note.permitDeadline"],
    })
    expect(deadline(review(permitSingle("1")), "review.field.signatureDeadline")).toEqual({
      label: "review.field.signatureDeadline", value: "1893456000", time: "unix-seconds", notes: ["review.note.signatureDeadline"],
    })
    expect(deadline(review(transferFrom("1")), "review.field.permitDeadline")).toEqual({
      label: "review.field.permitDeadline", value: "1893456000", time: "unix-seconds", notes: ["review.note.signatureDeadline"],
    })
    // An allowance expiry is a different fact and stays the raw integer; 0 has its own meaning.
    expect(field(review(permitSingle("1")).summary, "review.field.permitExpiration")!.time).toBeUndefined()
    // A maximum deadline stays exact; it is never called "never expires".
    const far = review({ ...permit("1"), message: { ...permit("1").message, deadline: MAX256 } })
    expect(field(far.summary, "review.field.permitDeadline")).toMatchObject({ value: MAX256, time: "unix-seconds" })
  })

  it("treats SignatureTransfer as one transfer: never an unlimited allowance, even at the maximum", () => {
    const finite = review(transferFrom("1000"))
    expect(finite.kind).toBe("review.kind.permit2Transfer")
    expect(finite.warnings).toEqual(["review.warning.oneTimeTransfer"])
    const maximum = review(transferFrom(MAX256))
    expect(maximum.warnings).toEqual(["review.warning.oneTimeTransfer", "review.warning.maximumOneTimeTransfer"])
    expect(JSON.stringify(maximum)).not.toContain("unlimitedAllowance")
    // A one-time maximum, never a lasting "Unlimited" allowance.
    expect(field(maximum.summary, "review.field.permitTokenAmount")).toEqual({
      label: "review.field.permitTokenAmount", index: 1, value: MAX256, shownAs: "review.value.maximumOneTime", notes: ["review.note.exactInDetails"],
    })
    expect(JSON.stringify(maximum)).not.toContain("review.value.unlimited")
    const batch = review(batchTransferFrom(["1", "2", "3", "4", MAX256]))
    expect(batch.warnings).toEqual(["review.warning.oneTimeTransfer", "review.warning.maximumOneTimeTransfer"])
  })

  it.each([
    ["DAI-style permit", { Permit: [
      { name: "holder", type: "address" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" },
      { name: "expiry", type: "uint256" }, { name: "allowed", type: "bool" },
    ] }, "Permit", { holder: OWNER, spender: SPENDER, nonce: 0, expiry: 0, allowed: true }],
    ["ERC-2612 fields in another order", { Permit: [
      { name: "spender", type: "address" }, { name: "owner", type: "address" }, { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    ] }, "Permit", { owner: OWNER, spender: SPENDER, value: MAX256, nonce: 0, deadline: 0 }],
    ["ERC-2612 fields under another type name", { Approval: permitTypes.Permit }, "Approval", { owner: OWNER, spender: SPENDER, value: MAX256, nonce: 0, deadline: 0 }],
    ["Permit2 details with a uint256 amount", {
      PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
      PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
    }, "PermitSingle", { details: { token: TOKEN, amount: MAX256, expiration: 0, nonce: 0 }, spender: SPENDER, sigDeadline: 0 }],
    ["a Permit2 witness transfer", {
      PermitWitnessTransferFrom: [
        { name: "permitted", type: "TokenPermissions" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }, { name: "witness", type: "Witness" },
      ],
      TokenPermissions: tokenPermissions,
      Witness: [{ name: "user", type: "address" }],
    }, "PermitWitnessTransferFrom", { permitted: { token: TOKEN, amount: MAX256 }, spender: SPENDER, nonce: 0, deadline: 0, witness: { user: OWNER } }],
  ])("keeps %s generic: a name or field key is not a recognized structure", (_name, types, primaryType, message) => {
    const result = review({ domain: permit2Domain, types, primaryType, message } as Typed)
    expect(result.kind).toBe("review.kind.eip712")
    expect(result.warnings).toBeUndefined()
  })

  it("keeps a schema whose joined type string imitates ERC-2612 generic: field lists are compared, not strings", () => {
    // One field whose name contains the rest of the ERC-2612 signature; viem accepts and hashes it.
    const forged: Typed = {
      domain: { name: "Test Token", version: "1", chainId: 1, verifyingContract: TOKEN },
      types: { Permit: [{ type: "address", name: "owner,address spender,uint256 value,uint256 nonce,uint256 deadline" }] },
      primaryType: "Permit",
      message: { "owner,address spender,uint256 value,uint256 nonce,uint256 deadline": OWNER, spender: SPENDER, value: MAX256 },
    }
    const result = review(forged)
    expect(result.kind).toBe("review.kind.eip712")
    expect(result.warnings).toBeUndefined()
    // The look-alike spender and amount are shown as outside the hash, never as authorization facts.
    expect(result.summary.some((row) => row.label === "review.field.spender" || row.label === "review.field.permitAmount")).toBe(false)
    expect(detailGroup(result, "review.group.notInTypedHash")!.fields.map((row) => row.name)).toEqual(["spender", "value"])
  })

  it("requires the exact referenced types: an extra referenced type keeps Permit2 generic", () => {
    const typed = permitSingle("5")
    typed.types = { ...typed.types, PermitSingle: [...typed.types.PermitSingle, { name: "extra", type: "Extra" }], Extra: [{ name: "x", type: "uint256" }] }
    typed.message = { ...typed.message, extra: { x: 1 } }
    expect(review(typed).kind).toBe("review.kind.eip712")
  })

  it("puts the authorization warnings first in the card, in both locales", () => {
    const result = review(permit(MAX256))
    for (const [locale, warnings] of [
      ["en", ["This signature lets the spender move your tokens.", "Unlimited amount: the allowance is the largest value the field can hold."]],
      ["zh", ["代币授权：此签名允许被授权方动用你的代币。", "无限授权：额度为该字段能表示的最大值。"]],
    ] as const) {
      setLocale(locale)
      const dom = installCardDocument((name, value) => vi.stubGlobal(name, value))
      renderSigningReview(dom.content as unknown as HTMLElement, result, { session: "x".repeat(2000) })
      const root = dom.content.querySelector(".review")!
      expect(root.children.map((node) => node.className)).toEqual(["review-heading", "review-warning", "review-warning", "review-summary", "review-details"])
      expect(dom.content.querySelectorAll(".review-warning-text").map((node) => node.textContent)).toEqual(warnings)
    }
  })
})
