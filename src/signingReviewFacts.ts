import type { BitcoinReviewFacts } from "./bitcoin"
import type { EvmTransactionReview } from "./signingContext"
import type { ReviewField, ReviewGroup, ReviewNote, SigningReview } from "./signingReview"
import type {
  SolanaAccountRef, SolanaDecodedInstruction, SolanaDecodedTransfer, SolanaInstructionFacts, SolanaMessageFacts,
} from "./solana/facts"
import { SPL_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./solana/transfers"
import { chainLabel, chainNote, ETH_NATIVE_CHAINS } from "./eip712Review"
import { deriveSigningAddresses, type SignatureScheme } from "./vaultCrypto"

// Verified facts to the signing review. Pure: no parsing, no chain lookups, no
// requester text. A summary is kept short by summarising; every fact a summary
// leaves out is still in Details, and nothing here refuses a request.

/**
 * Layout guidance for the summary, never a signing rule: how many decoded
 * transfers and how many undecoded instructions it lists. The rest are counted
 * there and are complete in Details.
 */
const SUMMARY_TRANSFERS = 3
const SUMMARY_UNDECODED = 3
/** A decoded call with more arguments than this lists them in Details only. */
const SUMMARY_ARGUMENTS = 3

function programNote(programId: string): ReviewNote[] {
  if (programId === SYSTEM_PROGRAM_ID) return ["review.note.systemProgram"]
  if (programId === SPL_TOKEN_PROGRAM_ID) return ["review.note.tokenProgram"]
  return []
}

function byteLength(hex: string): number {
  return hex.length / 2
}

/** The decoded facts of one transfer. Token accounts are token accounts; no owner, symbol or converted token amount. */
function transferFields(transfer: SolanaDecodedTransfer): ReviewField[] {
  switch (transfer.kind) {
    case "system-transfer":
      return [
        { label: "review.field.from", value: transfer.source },
        { label: "review.field.to", value: transfer.destination },
        { label: "review.field.amount", value: transfer.lamports, native: "sol" },
      ]
    case "spl-transfer":
      return [
        { label: "review.field.fromTokenAccount", value: transfer.sourceTokenAccount },
        { label: "review.field.toTokenAccount", value: transfer.destinationTokenAccount },
        { label: "review.field.amount", value: transfer.amount, notes: ["review.note.baseUnits"] },
      ]
    case "spl-transfer-checked":
      return [
        { label: "review.field.fromTokenAccount", value: transfer.sourceTokenAccount },
        { label: "review.field.toTokenAccount", value: transfer.destinationTokenAccount },
        { label: "review.field.mint", value: transfer.mint },
        {
          label: "review.field.amount", value: transfer.amount,
          notes: ["review.note.baseUnits", { key: "review.note.decimals", count: transfer.decimals }],
        },
      ]
  }
}

/** The program-defined instruction name, unchanged. */
function transferName(transfer: SolanaDecodedTransfer): string {
  return transfer.kind === "spl-transfer-checked" ? "TransferChecked" : "Transfer"
}

/**
 * An undecoded instruction, in the summary: its program address and how much
 * data it carries. It has no number: only transfer blocks are numbered there,
 * and its position among the instructions is in Details.
 */
function undecodedInstructionRow(instruction: SolanaInstructionFacts): ReviewField {
  return {
    label: "review.field.undecodedInstruction", value: instruction.programId,
    notes: [{ key: "review.note.dataBytes", count: byteLength(instruction.dataHex) }, "review.note.notDecoded"],
  }
}

/**
 * One transfer among several instructions, in the summary: a heading that
 * numbers it among the decoded transfers and names its kind, then where it
 * goes, how much, and the mint when the instruction encodes one. A plain SPL
 * Transfer encodes none, and its heading says so; nothing is looked up or inferred.
 */
function transferBlock(transfer: SolanaDecodedTransfer, position: number): ReviewField[] {
  const heading = (label: "review.field.transferSol" | "review.field.transferToken" | "review.field.transferTokenNoMint"): ReviewField =>
    ({ label, index: position, value: "", heading: true })
  switch (transfer.kind) {
    case "system-transfer":
      return [
        heading("review.field.transferSol"),
        { label: "review.field.amount", value: transfer.lamports, native: "sol" },
        { label: "review.field.to", value: transfer.destination, elide: true },
      ]
    case "spl-transfer":
      return [
        heading("review.field.transferTokenNoMint"),
        { label: "review.field.amount", value: transfer.amount, notes: ["review.note.baseUnits"] },
        { label: "review.field.toTokenAccount", value: transfer.destinationTokenAccount, elide: true },
      ]
    case "spl-transfer-checked":
      return [
        heading("review.field.transferToken"),
        {
          label: "review.field.amount", value: transfer.amount,
          notes: ["review.note.baseUnits", { key: "review.note.decimals", count: transfer.decimals }],
        },
        { label: "review.field.toTokenAccount", value: transfer.destinationTokenAccount, elide: true },
        { label: "review.field.mint", value: transfer.mint, elide: true },
      ]
  }
}

/**
 * Nonce advances on the first screen: one plain line that the message includes
 * a durable-nonce advance instruction, with a count only above one. It moves
 * nothing; its accounts are in Details. It claims no expiry behaviour: the
 * instruction may sit anywhere, and its nonce is never compared with chain state.
 */
function durableNonceLine(count: number): ReviewField[] {
  if (count === 0) return []
  return [{ label: "review.field.durableNonce", value: "", ...(count > 1 ? { notes: [{ key: "review.note.nonceAdvances" as const, count }] } : {}) }]
}

/**
 * A single transfer's own facts on the first screen: the amount, where it goes,
 * then the mint and the source, with addresses shortened (complete in Details).
 */
function singleTransferSummary(transfer: SolanaDecodedTransfer): ReviewField[] {
  const fields = transferFields(transfer).map((field) => (field.label === "review.field.amount" ? field : { ...field, elide: true }))
  const order = ["review.field.amount", "review.field.to", "review.field.toTokenAccount", "review.field.mint", "review.field.from", "review.field.fromTokenAccount"]
  return [...fields].sort((left, right) => order.indexOf(left.label) - order.indexOf(right.label))
}

const isTransfer = (decoded: SolanaDecodedInstruction): decoded is SolanaDecodedTransfer => decoded.kind !== "system-advance-nonce"

/**
 * One rule for every message. A message that is a single instruction shows that
 * instruction: a transfer's own facts, a nonce advance, or the undecoded
 * instruction's row. Any other message shows the instruction count, then in
 * message order a block for each of the first transfers and of the first nonce
 * advances and a row for each of the first undecoded instructions, then how many
 * more of each are in Details. Only transfers are numbered and counted as transfers.
 */
function solanaSummary(facts: SolanaMessageFacts): ReviewField[] {
  if (facts.instructions.length === 1) {
    const [only] = facts.instructions
    if (!only.decoded) return [{ ...undecodedInstructionRow(only), elide: true }]
    return isTransfer(only.decoded) ? singleTransferSummary(only.decoded) : durableNonceLine(1)
  }
  let transfers = 0
  let nonceAdvances = 0
  let undecoded = 0
  const rows = facts.instructions.flatMap((instruction) => {
    const decoded = instruction.decoded
    if (decoded && isTransfer(decoded)) {
      transfers += 1
      return transfers <= SUMMARY_TRANSFERS ? transferBlock(decoded, transfers) : []
    }
    if (decoded) {
      // A nonce advance moves nothing: one line after the transfers, so their amounts lead.
      nonceAdvances += 1
      return []
    }
    undecoded += 1
    return undecoded <= SUMMARY_UNDECODED ? [{ ...undecodedInstructionRow(instruction), elide: true }] : []
  })
  const more = (label: "review.field.moreTransfers" | "review.field.moreUndecoded", key: "review.note.moreInDetails" | "review.note.moreInstructionsInDetails", count: number, cap: number): ReviewField[] =>
    count > cap ? [{ label, value: "", notes: [{ key, count: count - cap }] }] : []
  return [
    {
      label: "review.field.instructions", value: String(facts.instructions.length),
      notes: [
        ...(transfers > 0 ? [{ key: "review.note.transfersDecoded" as const, count: transfers }] : []),
        ...(undecoded > 0 ? [{ key: "review.note.instructionsNotDecoded" as const, count: undecoded }] : []),
      ],
    },
    ...rows,
    ...more("review.field.moreTransfers", "review.note.moreInDetails", transfers, SUMMARY_TRANSFERS),
    ...more("review.field.moreUndecoded", "review.note.moreInstructionsInDetails", undecoded, SUMMARY_UNDECODED),
    ...durableNonceLine(nonceAdvances),
  ]
}

/** The decoded facts of an instruction in Details, beyond its program, indexes and data. */
function decodedDetailFields(decoded: SolanaDecodedInstruction): ReviewField[] {
  if (!isTransfer(decoded)) {
    return [
      { label: "review.field.instruction", value: "AdvanceNonceAccount" },
      { label: "review.field.nonceAccount", value: decoded.nonceAccount },
      { label: "review.field.recentBlockhashesSysvar", value: decoded.recentBlockhashesSysvar },
      { label: "review.field.nonceAuthority", value: decoded.nonceAuthority },
    ]
  }
  return [
    { label: "review.field.instruction", value: transferName(decoded) },
    ...transferFields(decoded),
    ...(decoded.kind === "system-transfer" ? [] : [{ label: "review.field.authority" as const, value: decoded.authority }]),
  ]
}

function accountIndexes(accounts: readonly SolanaAccountRef[]): string {
  // The encoded indexes as they are. An index past the static keys points into
  // an address table; the loaded address is not in the message and is not shown.
  return accounts.map((account) => account.index).join(", ")
}

function instructionGroup(instruction: SolanaInstructionFacts): ReviewGroup {
  const decoded = instruction.decoded
  const data: ReviewField = {
    label: "review.field.data", value: instruction.dataHex,
    notes: [{ key: "review.note.bytes", count: byteLength(instruction.dataHex) }, ...(decoded ? [] : ["review.note.notDecoded" as const])],
  }
  return {
    title: "review.group.instruction",
    index: instruction.index + 1,
    fields: [
      { label: "review.field.program", value: instruction.programId, notes: programNote(instruction.programId) },
      ...(decoded ? decodedDetailFields(decoded) : []),
      { label: "review.field.accountIndexes", value: accountIndexes(instruction.accounts) },
      data,
    ],
  }
}

/**
 * The review of one parsed Solana message. `facts` must come from
 * `parseSolanaMessage` run on the exact bytes to sign with the protected
 * record's own public key, so the signer shown is the key that signs.
 */
export function solanaSigningReview(facts: SolanaMessageFacts): SigningReview {
  const only = facts.instructions.length === 1 ? facts.instructions[0].decoded : null
  return {
    kind: !only || !isTransfer(only)
      ? "review.kind.solanaTransaction"
      : only.kind === "system-transfer" ? "review.kind.solanaSystemTransfer" : "review.kind.solanaTokenTransfer",
    signer: { label: "review.field.signingKey", value: facts.expectedSigner.address, elide: true },
    summary: solanaSummary(facts),
    // Any undecoded instruction, and any account loaded through an address table.
    undecoded: facts.hasUndecodedContent,
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.messageFormat", value: facts.version },
          { label: "review.field.scheme", value: "ed25519" },
          { label: "review.field.feePayer", value: facts.feePayer },
          { label: "review.field.blockhashOrNonce", value: facts.recentBlockhash },
        ],
      },
      {
        title: "review.group.accounts",
        fields: facts.staticAccountKeys.map((account) => ({
          label: "review.field.account" as const, index: account.index, value: account.address,
          notes: [
            ...(account.signer ? ["review.note.signer" as const] : []),
            account.writable ? "review.note.writable" as const : "review.note.readOnly" as const,
            ...programNote(account.address),
          ],
        })),
      },
      ...facts.instructions.map(instructionGroup),
      {
        title: "review.group.exact",
        fields: [{
          label: "review.field.message", value: facts.messageHex,
          notes: [{ key: "review.note.bytes", count: facts.messageLength }], raw: true,
        }],
      },
    ],
  }
}

/** Ether is named only on chains whose native unit is ETH; every other chain keeps the raw wei value. */
function evmValue(evm: EvmTransactionReview): ReviewField {
  return ETH_NATIVE_CHAINS.has(evm.chainId)
    ? { label: "review.field.value", value: evm.value, native: "eth" }
    : { label: "review.field.value", value: evm.value, notes: ["review.note.wei"] }
}

function evmDestination(evm: EvmTransactionReview): ReviewField {
  return evm.to === null
    ? { label: "review.field.contract", value: "", notes: ["review.note.contractCreation"] }
    : { label: "review.field.contract", value: evm.to }
}

function evmArguments(evm: EvmTransactionReview): ReviewField[] {
  return (evm.decoded?.arguments ?? []).map((argument, index) => ({
    label: "review.field.argument" as const, index: index + 1, name: `${argument.name} (${argument.type})`, value: argument.value,
  }))
}

function evmCallSummary(evm: EvmTransactionReview): ReviewField[] {
  if (evm.decoded) {
    const call: ReviewField = { label: "review.field.call", value: evm.decoded.signature }
    // Address arguments are shortened on the first screen; the call group in Details has them whole.
    const callArguments = evmArguments(evm).map((argument) => (argument.name?.endsWith(" (address)") ? { ...argument, elide: true } : argument))
    return callArguments.length <= SUMMARY_ARGUMENTS
      ? [call, ...callArguments]
      : [{ ...call, notes: [{ key: "review.note.argumentsInDetails", count: callArguments.length }] }]
  }
  if (evm.calldata === "0x") return []
  const undecoded: ReviewNote[] = [{ key: "review.note.dataBytes", count: evm.calldataBytes }, "review.note.notDecoded"]
  // Init code has no selector; its leading bytes are not a function.
  return evm.to === null || evm.selector === null
    ? [{ label: "review.field.initCode", value: "", notes: undecoded }]
    : [{ label: "review.field.selector", value: evm.selector, notes: undecoded }]
}

/**
 * The review of one verified EVM transaction. `evm` must come from
 * `verifySigningContext`; `publicKey` is the protected record's own compressed
 * secp256k1 key, from which the signing address is derived here.
 */
export function evmSigningReview(
  evm: EvmTransactionReview,
  signing: { publicKey: string; scheme: SignatureScheme; digest: string },
): SigningReview {
  const address = deriveSigningAddresses(signing.publicKey).eth
  if (!address) throw new Error("EVM review requires a secp256k1 signing key")
  const fee = (label: "review.field.gasPrice" | "review.field.maxFeePerGas" | "review.field.maxPriorityFeePerGas", value: string | undefined): ReviewField[] =>
    value === undefined ? [] : [{ label, value, notes: ["review.note.wei"] }]
  return {
    kind: "review.kind.evmTransaction",
    signer: { label: "review.field.signingAddress", value: address, elide: true },
    summary: [
      // What it does first, then where: a static label describes the encoded id; it does not prove the network.
      { ...evmDestination(evm), elide: true },
      evmValue(evm),
      ...evmCallSummary(evm),
      { label: "review.field.chainId", value: chainLabel(evm.chainId), notes: chainNote(evm.chainId) },
    ],
    undecoded: evm.blindSigning,
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.publicKey", value: signing.publicKey.toLowerCase() },
          { label: "review.field.scheme", value: signing.scheme },
          { label: "review.field.type", value: evm.type },
          { label: "review.field.chainId", value: evm.chainId },
          evmDestination(evm),
          evmValue(evm),
          { label: "review.field.nonce", value: evm.nonce },
          { label: "review.field.gas", value: evm.gas },
          ...fee("review.field.gasPrice", evm.gasPrice),
          ...fee("review.field.maxFeePerGas", evm.maxFeePerGas),
          ...fee("review.field.maxPriorityFeePerGas", evm.maxPriorityFeePerGas),
        ],
      },
      ...(evm.decoded ? [{
        title: "review.group.call" as const,
        fields: [
          { label: "review.field.call" as const, value: evm.decoded.signature },
          ...(evm.selector === null ? [] : [{ label: "review.field.selector" as const, value: evm.selector }]),
          ...evmArguments(evm),
        ],
      }] : []),
      {
        title: "review.group.exact",
        fields: [
          {
            label: "review.field.calldata", value: evm.calldata,
            notes: [{ key: "review.note.bytes", count: evm.calldataBytes }, ...(evm.blindSigning ? ["review.note.notDecoded" as const] : [])],
            raw: evm.calldata !== "0x",
          },
          {
            label: "review.field.unsignedTransaction", value: evm.unsignedTransactionHex,
            notes: [{ key: "review.note.bytes", count: byteLength(evm.unsignedTransactionHex) - 1 }], raw: true,
          },
          { label: "review.field.digest", value: `0x${signing.digest}` },
        ],
      },
    ],
  }
}

/**
 * The review of one verified Bitcoin Taproot key-path payment. `facts` must come
 * from `verifyBitcoinSigningContext` with the protected record's own public key.
 * The network is the requester's selection and is labelled so; a same-key
 * return is exact script equality with the spent output, not an inferred wallet.
 */
export function bitcoinSigningReview(facts: BitcoinReviewFacts, signing: { scheme: SignatureScheme; digest: string }): SigningReview {
  const sats = (value: bigint) => value.toString()
  const network: ReviewField = { label: "review.field.network", value: facts.network, notes: ["review.note.requesterNetwork"] }
  // What leaves, to whom and what it costs, in transaction order: one line per
  // recipient, one line per same-key return (this key's own address is not
  // repeated), then the fee and the exact net. A self-transfer has no recipient line.
  const movement = facts.outputs.map((output): ReviewField => output.sameKey
    ? { label: "review.field.returnToKey", value: sats(output.amountSats), native: "btc", unit: "symbol" }
    : { label: "review.field.send", value: sats(output.amountSats), native: "btc", unit: "symbol", to: output.address })
  const recipients = facts.outputs.filter((output) => !output.sameKey)
    .map((output): ReviewField => ({ label: "review.field.recipientAddress", value: output.address }))
  return {
    kind: "review.kind.bitcoinTransfer",
    signer: { label: "review.field.signingAddress", value: facts.spendingAddress, elide: true },
    summary: [
      ...movement,
      { label: "review.field.fee", value: sats(facts.feeSats), native: "btc", unit: "base", secondary: facts.feeRate },
      { label: "review.field.netLeaving", value: sats(facts.netLeavingSats), native: "btc", unit: "symbol" },
      ...recipients,
      network,
    ],
    // Every byte is parsed by the bounded verifier; nothing here is blind.
    undecoded: false,
    ...(facts.highFeeWarning ? { warnings: ["review.warning.highFee" as const] } : {}),
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.scheme", value: signing.scheme },
          ...(facts.internalKeyXOnly ? [{ label: "review.field.internalKey" as const, value: facts.internalKeyXOnly }] : []),
          { label: "review.field.outputKey", value: facts.outputKeyXOnly },
          { label: "review.field.network", value: facts.network, notes: ["review.note.networkNotChainProof"] },
          { label: "review.field.input", value: `${facts.inputTxid}:${facts.inputVout}` },
          { label: "review.field.inputAmount", value: sats(facts.inputAmountSats), native: "btc" },
          ...facts.outputs.flatMap((output, index): ReviewField[] => [
            { label: "review.field.outputIndexed", index: index + 1, value: output.address, notes: [output.sameKey ? "review.note.sameKeyReturn" : "review.note.recipient"] },
            { label: "review.field.outputAmountIndexed", index: index + 1, value: sats(output.amountSats), native: "btc" },
          ]),
          { label: "review.field.fee", value: sats(facts.feeSats), native: "btc" },
          { label: "review.field.feeRate", value: facts.feeRate },
          { label: "review.field.signedVsize", value: String(facts.signedVsize), notes: ["review.note.vbytes"] },
          { label: "review.field.netLeaving", value: sats(facts.netLeavingSats), native: "btc" },
          {
            label: "review.field.sequence", value: `0x${facts.sequence.toString(16).padStart(8, "0")}`,
            notes: [facts.signalsRbf ? "review.note.rbfSignals" : "review.note.rbfDoesNotSignal"],
          },
          { label: "review.field.locktime", value: String(facts.locktime) },
          { label: "review.field.unsignedTxid", value: facts.unsignedTxid },
          { label: "review.field.digest", value: signing.digest },
        ],
      },
      {
        title: "review.group.exact",
        fields: [
          {
            label: "review.field.unsignedTransaction", value: facts.unsignedTransaction,
            notes: [{ key: "review.note.bytes", count: byteLength(facts.unsignedTransaction) }], raw: true,
          },
          { label: "review.field.prevoutScript", value: facts.prevoutScriptPubKey },
        ],
      },
    ],
  }
}
