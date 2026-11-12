// SYNTHETIC design-frame values. Public inputs only: the signer and recipient
// are the RFC 8032 test 1 and test 2 public keys, the EVM key and address are those
// of private key 1, program and mint ids are public constants, and every other
// account, blockhash and opaque payload is a SHA-256 of a "design frame" label.
// These are layout placeholders, not the acceptance corpus (src/fixtures/).
import type { ReviewField, SigningReview } from "../src/signingReview"

const signer = "FVen3X669xLzsi6N2V91DoiyzHzg1uAgqiT8jZ9nS96Z"
// The 32 lifetime bytes: a blockhash or a durable-nonce value; the message does not say which.
const blockhash = "9k28P2qPPz9aj6c27yanifAxt9AeiDnhxuWR8RRi2P2S"
const systemProgram = "11111111111111111111111111111111"
const tokenProgram = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
const computeBudgetProgram = "ComputeBudget111111111111111111111111111111"
const otherProgram = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"

const solanaTransaction = (format: string): ReviewField[] => [
  { label: "review.field.messageFormat", value: format },
  { label: "review.field.scheme", value: "ed25519" },
  { label: "review.field.feePayer", value: signer },
  { label: "review.field.blockhashOrNonce", value: blockhash },
]
const signerAccount: ReviewField = {
  label: "review.field.account", index: 0, value: signer, notes: ["review.note.signer", "review.note.writable"],
}

const recipient = "586Z7H2vpX9qNhN2T4e9Utugie3ogjbxzGaMtM3E6HR5"
const solTransfer: SigningReview = {
  kind: "review.kind.solanaSystemTransfer",
  signer: { label: "review.field.signingKey", value: signer, elide: true },
  summary: [
    { label: "review.field.amount", value: "1500000000", native: "sol" },
    { label: "review.field.to", value: recipient, elide: true },
    { label: "review.field.from", value: signer, elide: true },
  ],
  undecoded: false,
  details: [
    { title: "review.group.transaction", fields: solanaTransaction("legacy") },
    {
      title: "review.group.accounts",
      fields: [
        signerAccount,
        { label: "review.field.account", index: 1, value: recipient, notes: ["review.note.writable"] },
        { label: "review.field.account", index: 2, value: systemProgram, notes: ["review.note.readOnly", "review.note.systemProgram"] },
      ],
    },
    {
      title: "review.group.instruction",
      index: 1,
      fields: [
        { label: "review.field.program", value: systemProgram, notes: ["review.note.systemProgram"] },
        { label: "review.field.instruction", value: "Transfer" },
        { label: "review.field.accountIndexes", value: "0, 1" },
        { label: "review.field.data", value: "02000000002f685900000000" },
      ],
    },
    {
      title: "review.group.exact",
      fields: [{
        label: "review.field.message",
        value: "01000103d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c000000000000000000000000000000000000000000000000000000000000000081e2bea9844fc6c9ff2879426e61c4e5611fa10817e282e159f08cfe66d90ba301020200010c02000000002f685900000000",
        notes: [{ key: "review.note.bytes", count: 150 }],
        raw: true,
      }],
    },
  ],
}

const sourceTokenAccount = "JEDsMsBea4qAoB8BbutmhvFivDj1rHJHtAaBY8qQ5S8s"
const destinationTokenAccount = "ERzQmT6bECBwak5fUrLsQLhW283qENyKe6Hex11Yviob"
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
const tokenTransferChecked: SigningReview = {
  kind: "review.kind.solanaTokenTransfer",
  signer: { label: "review.field.signingKey", value: signer, elide: true },
  summary: [
    { label: "review.field.amount", value: "25000000", decimals: 6 },
    { label: "review.field.toTokenAccount", value: destinationTokenAccount, elide: true },
    { label: "review.field.mint", value: mint, elide: true },
    { label: "review.field.fromTokenAccount", value: sourceTokenAccount, elide: true },
  ],
  undecoded: false,
  details: [
    { title: "review.group.transaction", fields: solanaTransaction("legacy") },
    {
      title: "review.group.accounts",
      fields: [
        signerAccount,
        { label: "review.field.account", index: 1, value: sourceTokenAccount, notes: ["review.note.writable"] },
        { label: "review.field.account", index: 2, value: destinationTokenAccount, notes: ["review.note.writable"] },
        { label: "review.field.account", index: 3, value: mint, notes: ["review.note.readOnly"] },
        { label: "review.field.account", index: 4, value: tokenProgram, notes: ["review.note.readOnly", "review.note.tokenProgram"] },
      ],
    },
    {
      title: "review.group.instruction",
      index: 1,
      fields: [
        { label: "review.field.program", value: tokenProgram, notes: ["review.note.tokenProgram"] },
        { label: "review.field.instruction", value: "TransferChecked" },
        { label: "review.field.accountIndexes", value: "1, 3, 2, 0" },
        { label: "review.field.data", value: "0c40787d010000000006" },
      ],
    },
    {
      title: "review.group.exact",
      fields: [{
        label: "review.field.message",
        value: "01000205d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511afff9c7499b723100c042f633449b716482b6213ace8b7397b736211672355e9cc78ec86b661652a5ce6d97d8bfd8f89fc71618c846f778c11273ef131a5b470ac6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d6106ddf6e1d765a193d9cbe146ceeb79ac1cb485ed5f5b37913a8cf5857eff00a981e2bea9844fc6c9ff2879426e61c4e5611fa10817e282e159f08cfe66d90ba3010404010302000a0c40787d010000000006",
        notes: [{ key: "review.note.bytes", count: 214 }],
        raw: true,
      }],
    },
  ],
}

// A v0 message with two instructions this release does not decode. Address
// tables get no presentation of their own: they stay in the complete message.
const solanaUnknown: SigningReview = {
  kind: "review.kind.solanaTransaction",
  signer: { label: "review.field.signingKey", value: signer, elide: true },
  summary: [
    { label: "review.field.instructions", value: "2", notes: [{ key: "review.note.instructionsNotDecoded", count: 2 }] },
    {
      label: "review.field.undecodedInstruction", value: computeBudgetProgram,
      notes: [{ key: "review.note.dataBytes", count: 5 }, "review.note.notDecoded"], elide: true,
    },
    {
      label: "review.field.undecodedInstruction", value: otherProgram,
      notes: [{ key: "review.note.dataBytes", count: 35 }, "review.note.notDecoded"], elide: true,
    },
  ],
  undecoded: true,
  details: [
    { title: "review.group.transaction", fields: solanaTransaction("v0") },
    {
      title: "review.group.accounts",
      fields: [
        signerAccount,
        { label: "review.field.account", index: 1, value: "3W5etj9R2z2eznRQdGiKnGdhZ6w9mUXXya7nPa7sE8yZ", notes: ["review.note.writable"] },
        { label: "review.field.account", index: 2, value: computeBudgetProgram, notes: ["review.note.readOnly"] },
        { label: "review.field.account", index: 3, value: otherProgram, notes: ["review.note.readOnly"] },
      ],
    },
    {
      title: "review.group.instruction",
      index: 1,
      fields: [
        { label: "review.field.program", value: computeBudgetProgram },
        { label: "review.field.data", value: "02400d0300", notes: ["review.note.notDecoded"] },
      ],
    },
    {
      title: "review.group.instruction",
      index: 2,
      fields: [
        { label: "review.field.program", value: otherProgram },
        { label: "review.field.accountIndexes", value: "0, 1, 4, 5, 6" },
        {
          label: "review.field.data",
          value: "e517cb977ae3ad2a5733bd4a36ce8dfc1e6ccd4ea7757b98ac3efc1c34bfd7bc0906d8",
          notes: ["review.note.notDecoded"],
        },
      ],
    },
    {
      title: "review.group.exact",
      fields: [{
        label: "review.field.message",
        value: "8001000204d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a252a7a9470a7750feb1a06237f8fed53d16d89db7be518fc285f4ef790eb2df40306466fe5211732ffecadba72c39be7bc8ce5bbc5f7126b2c439b3a400000000479d55bf231c06eee74c56ece681507fdb1b2dea3f48e5102b1cda256bc138f81e2bea9844fc6c9ff2879426e61c4e5611fa10817e282e159f08cfe66d90ba30202000502400d03000305000104050623e517cb977ae3ad2a5733bd4a36ce8dfc1e6ccd4ea7757b98ac3efc1c34bfd7bc0906d801ebd2d25734bc69304094810e924b06e89cc3e218d7cb724f8a520a4e98246caf0103020709",
        notes: [{ key: "review.note.bytes", count: 255 }],
        raw: true,
      }],
    },
  ],
}

const calldata = "0x7ff36ab500000000000000000000000000000000000000000000000000000000016e360000000000000000000000000000000000000000000000000000000000000000800000000000000000000000007e5f4552091a69125d5dfcb7b8c2659029395bdf00000000000000000000000000000000000000000000000000000000713fb3000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
const evmContract = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
const evmUnknown: SigningReview = {
  kind: "review.kind.evmTransaction",
  // The address of the public key below; integration derives it from the record key.
  signer: { label: "review.field.signingAddress", value: "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf", elide: true },
  summary: [
    { label: "review.field.contract", value: evmContract, elide: true },
    // ETH because chain id 1's native unit is ETH; a chain without one keeps the raw wei value.
    { label: "review.field.value", value: "10000000000000000", native: "eth" },
    {
      label: "review.field.selector", value: "0x7ff36ab5",
      notes: [{ key: "review.note.dataBytes", count: 228 }, "review.note.notDecoded"],
    },
    { label: "review.field.chainId", value: "1 · Ethereum", notes: [] },
  ],
  undecoded: true,
  details: [
    {
      title: "review.group.transaction",
      fields: [
        { label: "review.field.publicKey", value: "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798" },
        { label: "review.field.scheme", value: "ecdsa-secp256k1-recoverable" },
        { label: "review.field.type", value: "eip1559" },
        { label: "review.field.chainId", value: "1" },
        { label: "review.field.contract", value: evmContract },
        { label: "review.field.value", value: "10000000000000000", native: "eth" },
        { label: "review.field.nonce", value: "7" },
        { label: "review.field.gas", value: "210000" },
        { label: "review.field.maxFeePerGas", value: "30000000000", notes: ["review.note.wei"] },
        { label: "review.field.maxPriorityFeePerGas", value: "1500000000", notes: ["review.note.wei"] },
      ],
    },
    {
      title: "review.group.exact",
      fields: [
        {
          label: "review.field.calldata", value: calldata,
          notes: [{ key: "review.note.bytes", count: 228 }, "review.note.notDecoded"], raw: true,
        },
        {
          label: "review.field.unsignedTransaction",
          value: `0x02f9011501078459682f008506fc23ac0083033450947a250d5630b4cf539739df2c5dacb4c659f2488d872386f26fc10000b8e4${calldata.slice(2)}c0`,
          notes: [{ key: "review.note.bytes", count: 281 }], raw: true,
        },
        { label: "review.field.digest", value: "0x6eace00ef47eddd0c1bede1c426f0075187e7f72ff3694801d93719adf9b9611" },
      ],
    },
  ],
}

export const signingReviewFixtures = {
  "sol-transfer": solTransfer,
  "token-transfer-checked": tokenTransferChecked,
  "solana-unknown": solanaUnknown,
  "evm-unknown": evmUnknown,
} satisfies Record<string, SigningReview>
