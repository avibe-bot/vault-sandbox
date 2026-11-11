// Contract between the Solana message parser and its consumers (signing gate,
// trusted review UI, tests). Facts are structural: they state what the message
// bytes encode, never whether the transaction will execute or what it achieves.
// Every value is JSON (strings, safe integers, booleans, null, arrays, plain
// objects) and the whole tree is frozen.

export type SolanaMessageVersion = "legacy" | "v0"

export type SolanaMessageHeader = {
  readonly numRequiredSignatures: number
  readonly numReadonlySignedAccounts: number
  readonly numReadonlyUnsignedAccounts: number
}

/** A key carried in the message. `signer`/`writable` are the header-encoded privileges. */
export type SolanaStaticAccount = {
  readonly index: number
  readonly address: string
  readonly signer: boolean
  readonly writable: boolean
}

export type SolanaAddressTableLookup = {
  readonly accountKey: string
  readonly writableIndexes: readonly number[]
  readonly readonlyIndexes: readonly number[]
}

/**
 * One account index of an instruction. A `lookup` reference names the table and
 * slot the bytes encode; the loaded address is not in the message and is never
 * resolved, guessed or accepted from the caller.
 */
export type SolanaAccountRef =
  | ({ readonly source: "static" } & SolanaStaticAccount)
  | {
      readonly source: "lookup"
      readonly index: number
      readonly lookupIndex: number
      readonly accountKey: string
      readonly tableIndex: number
      readonly writable: boolean
    }

/**
 * Amounts are u64 raw base units as base-10 strings. Token accounts are token
 * accounts, not wallets. `spl-transfer` has no mint because its bytes carry none.
 */
export type SolanaDecodedTransfer =
  | {
      readonly kind: "system-transfer"
      readonly source: string
      readonly destination: string
      readonly lamports: string
    }
  | {
      readonly kind: "spl-transfer"
      readonly sourceTokenAccount: string
      readonly destinationTokenAccount: string
      readonly authority: string
      readonly amount: string
    }
  | {
      readonly kind: "spl-transfer-checked"
      readonly sourceTokenAccount: string
      readonly mint: string
      readonly destinationTokenAccount: string
      readonly authority: string
      readonly amount: string
      readonly decimals: number
    }

export type SolanaUndecodedReason =
  /** The program is outside the decoded set. */
  | "unsupported_program"
  /** A decoded program, but not one of its exact transfer layouts. */
  | "unsupported_instruction"
  /** An exact transfer layout whose account is loaded through a lookup table. */
  | "unresolved_account"

/** Exactly one of `decoded` and `undecodedReason` is non-null. */
export type SolanaInstructionFacts = {
  readonly index: number
  readonly programIdIndex: number
  readonly programId: string
  readonly accounts: readonly SolanaAccountRef[]
  readonly dataHex: string
  readonly decoded: SolanaDecodedTransfer | null
  readonly undecodedReason: SolanaUndecodedReason | null
}

export type SolanaMessageFacts = {
  readonly version: SolanaMessageVersion
  /** Lowercase hex of exactly the bytes that were parsed; the bytes to sign. */
  readonly messageHex: string
  readonly messageLength: number
  /** Signature count prefix, one 64-byte signature per required signer, and the message. */
  readonly transactionLength: number
  readonly header: SolanaMessageHeader
  readonly feePayer: string
  /** The expected key. `index` is the first required-signer slot that holds it. */
  readonly expectedSigner: { readonly index: number; readonly address: string; readonly isFeePayer: boolean }
  readonly staticAccountKeys: readonly SolanaStaticAccount[]
  /** Base58 of the 32 lifetime bytes: a recent blockhash or a durable nonce value. */
  readonly recentBlockhash: string
  readonly instructions: readonly SolanaInstructionFacts[]
  readonly addressTableLookups: readonly SolanaAddressTableLookup[]
  /** True when any instruction is undecoded or any account is loaded through a lookup table. */
  readonly hasUndecodedContent: boolean
}

export type SolanaRejectionCode =
  | "invalid_input"
  | "packet_too_large"
  | "unsupported_version"
  | "truncated"
  | "invalid_compact_u16"
  | "trailing_bytes"
  | "invalid_header"
  | "invalid_address_table_lookup"
  | "invalid_program_id_index"
  | "invalid_account_index"
  | "signer_not_required"

/** The message is not a canonical legacy or v0 message this key is required to sign. */
export class SolanaMessageError extends Error {
  readonly code: SolanaRejectionCode

  constructor(code: SolanaRejectionCode, message: string) {
    super(message)
    this.name = "SolanaMessageError"
    this.code = code
  }
}
