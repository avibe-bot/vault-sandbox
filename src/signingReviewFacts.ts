import type { EvmTransactionReview } from "./signingContext"
import type { ReviewField, ReviewGroup, ReviewNote, SigningReview } from "./signingReview"
import type { SolanaAccountRef, SolanaDecodedTransfer, SolanaInstructionFacts, SolanaMessageFacts } from "./solana/facts"
import { SPL_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./solana/transfers"
import { deriveSigningAddresses, type SignatureScheme } from "./vaultCrypto"

// Verified facts to the signing review. Pure: no parsing, no chain lookups, no
// requester text. A summary is kept short by summarising; every fact a summary
// leaves out is still in Details, and nothing here refuses a request.

/**
 * Layout guidance for the summary, never a signing rule. A message whose
 * per-instruction rows exceed it gets a count row and keeps everything in Details.
 */
const SUMMARY_ROWS = 6
/** Decoded transfers listed in the summary when a message carries several; the rest are counted and stay in Details. */
const SUMMARY_TRANSFERS = 3
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

function undecodedProgramRow(instruction: SolanaInstructionFacts): ReviewField {
  return {
    label: "review.field.programIndexed", index: instruction.index + 1, value: instruction.programId,
    notes: [{ key: "review.note.dataBytes", count: byteLength(instruction.dataHex) }, "review.note.notDecoded"],
  }
}

/**
 * One of several transfers, in the summary: a heading that numbers it among the
 * decoded transfers and names its kind, then where it goes, how much, and the
 * mint when the instruction encodes one. A plain SPL Transfer encodes none, and
 * its heading says so; nothing is looked up or inferred.
 */
function transferBlock(transfer: SolanaDecodedTransfer, position: number): ReviewField[] {
  const heading = (label: "review.field.transferSol" | "review.field.transferToken" | "review.field.transferTokenNoMint"): ReviewField =>
    ({ label, index: position, value: "", heading: true })
  switch (transfer.kind) {
    case "system-transfer":
      return [
        heading("review.field.transferSol"),
        { label: "review.field.to", value: transfer.destination },
        { label: "review.field.amount", value: transfer.lamports, native: "sol" },
      ]
    case "spl-transfer":
      return [
        heading("review.field.transferTokenNoMint"),
        { label: "review.field.toTokenAccount", value: transfer.destinationTokenAccount },
        { label: "review.field.amount", value: transfer.amount, notes: ["review.note.baseUnits"] },
      ]
    case "spl-transfer-checked":
      return [
        heading("review.field.transferToken"),
        { label: "review.field.toTokenAccount", value: transfer.destinationTokenAccount },
        {
          label: "review.field.amount", value: transfer.amount,
          notes: ["review.note.baseUnits", { key: "review.note.decimals", count: transfer.decimals }],
        },
        { label: "review.field.mint", value: transfer.mint },
      ]
  }
}

function solanaSummary(facts: SolanaMessageFacts): ReviewField[] {
  const transfers = facts.instructions.filter((instruction) => instruction.decoded).length
  const undecoded = facts.instructions.length - transfers
  const count: ReviewField = {
    label: "review.field.instructions", value: String(facts.instructions.length),
    notes: [
      ...(transfers > 0 ? [{ key: "review.note.transfersDecoded" as const, count: transfers }] : []),
      ...(undecoded > 0 ? [{ key: "review.note.instructionsNotDecoded" as const, count: undecoded }] : []),
    ],
  }
  if (transfers <= 1) {
    const rows = facts.instructions.flatMap((instruction) => instruction.decoded ? transferFields(instruction.decoded) : [undecodedProgramRow(instruction)])
    return facts.instructions.length > 0 && rows.length <= SUMMARY_ROWS ? rows : [count]
  }
  // Several transfers: the count, then in message order a block for each of the
  // first few transfers and the program row of every undecoded instruction.
  // Sources, authorities and any further transfers are in Details.
  let position = 0
  const rows = facts.instructions.flatMap((instruction) => {
    if (!instruction.decoded) return [undecodedProgramRow(instruction)]
    position += 1
    return position <= SUMMARY_TRANSFERS ? transferBlock(instruction.decoded, position) : []
  })
  const hidden = transfers - SUMMARY_TRANSFERS
  return [
    count,
    ...rows,
    ...(hidden > 0 ? [{ label: "review.field.moreTransfers" as const, value: "", notes: [{ key: "review.note.moreInDetails" as const, count: hidden }] }] : []),
  ]
}

function accountIndexes(accounts: readonly SolanaAccountRef[]): string {
  // The encoded indexes as they are. An index past the static keys points into
  // an address table; the loaded address is not in the message and is not shown.
  return accounts.map((account) => account.index).join(", ")
}

function instructionGroup(instruction: SolanaInstructionFacts): ReviewGroup {
  const transfer = instruction.decoded
  const data: ReviewField = {
    label: "review.field.data", value: instruction.dataHex,
    notes: [{ key: "review.note.bytes", count: byteLength(instruction.dataHex) }, ...(transfer ? [] : ["review.note.notDecoded" as const])],
  }
  return {
    title: "review.group.instruction",
    index: instruction.index + 1,
    fields: [
      { label: "review.field.program", value: instruction.programId, notes: programNote(instruction.programId) },
      ...(transfer ? [
        { label: "review.field.instruction" as const, value: transferName(transfer) },
        ...transferFields(transfer),
        ...(transfer.kind === "system-transfer" ? [] : [{ label: "review.field.authority" as const, value: transfer.authority }]),
      ] : []),
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
    kind: !only
      ? "review.kind.solanaTransaction"
      : only.kind === "system-transfer" ? "review.kind.solanaSystemTransfer" : "review.kind.solanaTokenTransfer",
    signer: { label: "review.field.signingKey", value: facts.expectedSigner.address },
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

/** Ether is named only for Ethereum mainnet; every other chain keeps the raw wei value. */
function evmValue(evm: EvmTransactionReview): ReviewField {
  return evm.chainId === "1"
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
    const callArguments = evmArguments(evm)
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
    signer: { label: "review.field.signingAddress", value: address },
    summary: [
      { label: "review.field.chainId", value: evm.chainId },
      evmDestination(evm),
      evmValue(evm),
      ...evmCallSummary(evm),
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
