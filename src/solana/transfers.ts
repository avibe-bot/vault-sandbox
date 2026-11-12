import type { SolanaAccountRef, SolanaDecodedInstruction, SolanaUndecodedReason } from "./facts"

// Instruction decoding is exact-layout or nothing: the transfers below and System
// AdvanceNonceAccount. The System and SPL Token programs read a prefix of the
// data and the leading accounts, so they execute instructions
// with extra data bytes or extra accounts (multisig signer lists among them).
// Describing such an instruction as a plain transfer would drop content, so any
// deviation leaves it undecoded. An undecoded instruction is still a valid part
// of the message: the caller shows its raw bytes, it is not a rejection.

export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111"
export const SPL_TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
/** `SYSVAR_RECENT_BLOCKHASHES_PUBKEY` in @solana/web3.js `src/sysvar.ts`; the upstream Rust builder uses the same key. */
export const RECENT_BLOCKHASHES_SYSVAR_ID = "SysvarRecentB1ockHashes11111111111111111111"

// SystemInstruction is bincode: a u32 LE variant index. Transfer (2) is followed by
// u64 LE lamports; AdvanceNonceAccount (4) has nothing after it.
const SYSTEM_TRANSFER_VARIANT = 2
const SYSTEM_ADVANCE_NONCE_VARIANT = 4
// TokenInstruction tags: Transfer is 3 (u64 LE amount), TransferChecked is 12 (u64 LE amount, u8 decimals).
const TOKEN_TRANSFER_TAG = 3
const TOKEN_TRANSFER_CHECKED_TAG = 12

export type TransferDecoding =
  | { readonly decoded: SolanaDecodedInstruction; readonly undecodedReason: null }
  | { readonly decoded: null; readonly undecodedReason: SolanaUndecodedReason }

function undecoded(undecodedReason: SolanaUndecodedReason): TransferDecoding {
  return { decoded: null, undecodedReason }
}

function u64(data: Uint8Array, offset: number): string {
  let value = 0n
  for (let index = 7; index >= 0; index -= 1) value = (value << 8n) | BigInt(data[offset + index])
  return value.toString()
}

/** Addresses of the accounts when every one is carried in the message, else null. */
function staticAddresses(accounts: readonly SolanaAccountRef[]): string[] | null {
  const addresses: string[] = []
  for (const account of accounts) {
    if (account.source !== "static") return null
    addresses.push(account.address)
  }
  return addresses
}

function systemInstruction(accounts: readonly SolanaAccountRef[], data: Uint8Array): TransferDecoding {
  const variant = data.length >= 4 ? (data[0] | (data[1] << 8) | (data[2] << 16) | (data[3] << 24)) >>> 0 : -1
  if (variant === SYSTEM_TRANSFER_VARIANT && data.length === 12) return systemTransfer(accounts, data)
  if (variant === SYSTEM_ADVANCE_NONCE_VARIANT && data.length === 4) return advanceNonce(accounts)
  return undecoded("unsupported_instruction")
}

function systemTransfer(accounts: readonly SolanaAccountRef[], data: Uint8Array): TransferDecoding {
  if (accounts.length !== 2) return undecoded("unsupported_instruction")
  const addresses = staticAddresses(accounts)
  if (!addresses) return undecoded("unresolved_account")
  const [source, destination] = addresses
  return { decoded: { kind: "system-transfer", source, destination, lamports: u64(data, 4) }, undecodedReason: null }
}

/**
 * Account privileges are not checked here: they are the union over the whole
 * message, so the authority may also be the writable fee payer.
 */
function advanceNonce(accounts: readonly SolanaAccountRef[]): TransferDecoding {
  if (accounts.length !== 3) return undecoded("unsupported_instruction")
  const addresses = staticAddresses(accounts)
  if (!addresses) return undecoded("unresolved_account")
  const [nonceAccount, recentBlockhashesSysvar, nonceAuthority] = addresses
  if (recentBlockhashesSysvar !== RECENT_BLOCKHASHES_SYSVAR_ID) return undecoded("unsupported_instruction")
  return { decoded: { kind: "system-advance-nonce", nonceAccount, recentBlockhashesSysvar, nonceAuthority }, undecodedReason: null }
}

function tokenTransfer(accounts: readonly SolanaAccountRef[], data: Uint8Array): TransferDecoding {
  const transfer = data.length === 9 && data[0] === TOKEN_TRANSFER_TAG && accounts.length === 3
  const checked = data.length === 10 && data[0] === TOKEN_TRANSFER_CHECKED_TAG && accounts.length === 4
  if (!transfer && !checked) return undecoded("unsupported_instruction")
  const addresses = staticAddresses(accounts)
  if (!addresses) return undecoded("unresolved_account")
  const amount = u64(data, 1)
  if (transfer) {
    const [sourceTokenAccount, destinationTokenAccount, authority] = addresses
    return { decoded: { kind: "spl-transfer", sourceTokenAccount, destinationTokenAccount, authority, amount }, undecodedReason: null }
  }
  const [sourceTokenAccount, mint, destinationTokenAccount, authority] = addresses
  return {
    decoded: { kind: "spl-transfer-checked", sourceTokenAccount, mint, destinationTokenAccount, authority, amount, decimals: data[9] },
    undecodedReason: null,
  }
}

export function decodeTransfer(programId: string, accounts: readonly SolanaAccountRef[], data: Uint8Array): TransferDecoding {
  if (programId === SYSTEM_PROGRAM_ID) return systemInstruction(accounts, data)
  if (programId === SPL_TOKEN_PROGRAM_ID) return tokenTransfer(accounts, data)
  return undecoded("unsupported_program")
}
