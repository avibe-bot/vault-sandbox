import { base58Encode } from "./base58"
import {
  SolanaMessageError,
  type SolanaAccountRef,
  type SolanaAddressTableLookup,
  type SolanaInstructionFacts,
  type SolanaMessageFacts,
  type SolanaMessageVersion,
  type SolanaRejectionCode,
  type SolanaStaticAccount,
} from "./facts"
import { decodeTransfer } from "./transfers"

export * from "./facts"

// Canonical legacy and v0 Solana message parser.
//
// It accepts exactly the bytes the upstream decoder and sanitizer accept
// (solana-short-vec, VersionedMessage, legacy and v0 Message::sanitize), with
// three additions that a signing approval needs: the bytes must be consumed in
// full, the signed transaction must fit one packet, and the expected key must be
// a required signer. It applies no policy on fees, programs, lookup tables or
// instruction content, and makes no claim that the transaction will execute.
// The input bytes are described, never re-serialized.

/** Maximum over-the-wire size of a transaction (upstream PACKET_DATA_SIZE). */
export const SOLANA_PACKET_DATA_SIZE = 1232
const SIGNATURE_LENGTH = 64
const KEY_LENGTH = 32
const HASH_LENGTH = 32
const VERSION_PREFIX = 0x80
/** Account indexes are one byte, so a message addresses at most 256 accounts. */
const MAX_ACCOUNTS = 256

function reject(code: SolanaRejectionCode, message: string): never {
  throw new SolanaMessageError(code, message)
}

function hex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

function compactU16Length(value: number): number {
  return value < 0x80 ? 1 : value < 0x4000 ? 2 : 3
}

/**
 * Decode the upstream ShortU16 length prefix at `offset`: seven value bits per
 * byte, low bits first, at most three bytes. Each value has one encoding: a
 * zero byte after the first is an alias, the third byte cannot continue, and
 * the value must fit 16 bits.
 */
export function readCompactU16(bytes: Uint8Array, offset: number, field = "compact-u16"): { value: number; length: number } {
  let value = 0
  for (let nth = 0; ; nth += 1) {
    if (offset + nth >= bytes.length) reject("truncated", `message ends inside ${field}`)
    const byte = bytes[offset + nth]
    if (byte === 0 && nth !== 0) reject("invalid_compact_u16", `${field} is not minimally encoded`)
    const done = (byte & 0x80) === 0
    if (nth === 2 && !done) reject("invalid_compact_u16", `${field} is longer than three bytes`)
    value |= (byte & 0x7f) << (7 * nth)
    if (value > 0xffff) reject("invalid_compact_u16", `${field} exceeds 65535`)
    if (done) return { value, length: nth + 1 }
  }
}

class Reader {
  private readonly bytes: Uint8Array
  private offset = 0

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
  }

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  u8(field: string): number {
    if (this.remaining < 1) reject("truncated", `message ends before ${field}`)
    return this.bytes[this.offset++]
  }

  take(length: number, field: string): Uint8Array {
    if (this.remaining < length) reject("truncated", `message ends inside ${field}`)
    const view = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return view
  }

  compactU16(field: string): number {
    const { value, length } = readCompactU16(this.bytes, this.offset, field)
    this.offset += length
    return value
  }
}

type RawInstruction = { programIdIndex: number; accountIndexes: Uint8Array; data: Uint8Array }
type RawLookup = { accountKey: Uint8Array; writableIndexes: Uint8Array; readonlyIndexes: Uint8Array }

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

/**
 * Describe the exact message bytes `expectedPublicKey` is asked to sign.
 *
 * Throws `SolanaMessageError` unless the bytes are one canonical legacy or v0
 * message that requires this key's signature. Instructions that are not exact
 * System or SPL Token transfers, and accounts loaded through lookup tables,
 * are returned undecoded with their raw bytes; they do not reject the message.
 */
export function parseSolanaMessage(message: Uint8Array, expectedPublicKey: Uint8Array): SolanaMessageFacts {
  if (!(message instanceof Uint8Array)) reject("invalid_input", "message must be a byte array")
  if (!(expectedPublicKey instanceof Uint8Array) || expectedPublicKey.length !== KEY_LENGTH) {
    reject("invalid_input", "expected public key must be 32 bytes")
  }
  // Even one signature leaves at most this many message bytes in a packet, so
  // everything below is bounded by it.
  if (message.length > SOLANA_PACKET_DATA_SIZE - 1 - SIGNATURE_LENGTH) {
    reject("packet_too_large", `message of ${message.length} bytes cannot fit a ${SOLANA_PACKET_DATA_SIZE}-byte transaction`)
  }
  // Private copies: the facts describe one snapshot of the input, whatever the
  // caller's buffers are or later become.
  const bytes = new Uint8Array(message)
  const expectedAddress = base58Encode(new Uint8Array(expectedPublicKey))
  const reader = new Reader(bytes)

  // A set high bit marks a versioned message; otherwise the first byte is
  // already the legacy header's signature count.
  const prefix = reader.u8("message prefix")
  let version: SolanaMessageVersion = "legacy"
  let numRequiredSignatures = prefix
  if ((prefix & VERSION_PREFIX) !== 0) {
    const number = prefix & ~VERSION_PREFIX
    if (number !== 0) reject("unsupported_version", `Solana message version ${number} is not supported`)
    version = "v0"
    numRequiredSignatures = reader.u8("required signature count")
  }
  const numReadonlySignedAccounts = reader.u8("read-only signed account count")
  const numReadonlyUnsignedAccounts = reader.u8("read-only unsigned account count")

  const staticCount = reader.compactU16("account key count")
  const keyBytes = reader.take(staticCount * KEY_LENGTH, "account keys")
  const addresses = Array.from({ length: staticCount }, (_, index) => base58Encode(keyBytes.subarray(index * KEY_LENGTH, (index + 1) * KEY_LENGTH)))
  const recentBlockhash = base58Encode(reader.take(HASH_LENGTH, "recent blockhash"))

  const rawInstructions: RawInstruction[] = []
  for (let count = reader.compactU16("instruction count"); count > 0; count -= 1) {
    const programIdIndex = reader.u8("instruction program id index")
    const accountIndexes = reader.take(reader.compactU16("instruction account count"), "instruction account indexes")
    const data = reader.take(reader.compactU16("instruction data length"), "instruction data")
    rawInstructions.push({ programIdIndex, accountIndexes, data })
  }

  const rawLookups: RawLookup[] = []
  if (version === "v0") {
    for (let count = reader.compactU16("address table lookup count"); count > 0; count -= 1) {
      const accountKey = reader.take(KEY_LENGTH, "address table key")
      const writableIndexes = reader.take(reader.compactU16("writable lookup index count"), "writable lookup indexes")
      const readonlyIndexes = reader.take(reader.compactU16("read-only lookup index count"), "read-only lookup indexes")
      rawLookups.push({ accountKey, writableIndexes, readonlyIndexes })
    }
  }
  if (reader.remaining !== 0) reject("trailing_bytes", `${reader.remaining} bytes follow the message`)

  // Upstream Message::sanitize, legacy and v0.
  if (numRequiredSignatures + numReadonlyUnsignedAccounts > staticCount) {
    reject("invalid_header", "header counts more signed and read-only unsigned accounts than the message carries")
  }
  if (numReadonlySignedAccounts >= numRequiredSignatures) {
    reject("invalid_header", "header leaves no writable signer to pay the fee")
  }
  let writableLoaded = 0
  let readonlyLoaded = 0
  for (const lookup of rawLookups) {
    if (lookup.writableIndexes.length + lookup.readonlyIndexes.length === 0) {
      reject("invalid_address_table_lookup", "an address table lookup loads no account")
    }
    writableLoaded += lookup.writableIndexes.length
    readonlyLoaded += lookup.readonlyIndexes.length
  }
  const accountCount = staticCount + writableLoaded + readonlyLoaded
  if (accountCount > MAX_ACCOUNTS) {
    reject("invalid_address_table_lookup", `message addresses ${accountCount} accounts; the limit is ${MAX_ACCOUNTS}`)
  }
  for (const instruction of rawInstructions) {
    // A program is a key carried in the message and never the fee payer.
    if (instruction.programIdIndex === 0 || instruction.programIdIndex >= staticCount) {
      reject("invalid_program_id_index", `instruction program id index ${instruction.programIdIndex} is not a static non-payer key`)
    }
    for (const index of instruction.accountIndexes) {
      if (index >= accountCount) reject("invalid_account_index", `instruction account index ${index} is outside the message's ${accountCount} accounts`)
    }
  }

  const transactionLength = compactU16Length(numRequiredSignatures) + numRequiredSignatures * SIGNATURE_LENGTH + bytes.length
  if (transactionLength > SOLANA_PACKET_DATA_SIZE) {
    reject("packet_too_large", `signed transaction would be ${transactionLength} bytes; the limit is ${SOLANA_PACKET_DATA_SIZE}`)
  }
  const signerIndex = addresses.indexOf(expectedAddress)
  if (signerIndex === -1 || signerIndex >= numRequiredSignatures) {
    reject("signer_not_required", "the expected key is not a required signer of this message")
  }

  const staticAccountKeys: SolanaStaticAccount[] = addresses.map((address, index) => ({
    index,
    address,
    signer: index < numRequiredSignatures,
    writable: index < numRequiredSignatures
      ? index < numRequiredSignatures - numReadonlySignedAccounts
      : index < staticCount - numReadonlyUnsignedAccounts,
  }))
  const addressTableLookups: SolanaAddressTableLookup[] = rawLookups.map((lookup) => ({
    accountKey: base58Encode(lookup.accountKey),
    writableIndexes: Array.from(lookup.writableIndexes),
    readonlyIndexes: Array.from(lookup.readonlyIndexes),
  }))

  // Account order is the static keys, then every table's writable entries in
  // table order, then every table's read-only entries in table order.
  const accountRef = (index: number): SolanaAccountRef => {
    if (index < staticCount) return { source: "static", ...staticAccountKeys[index] }
    const writable = index - staticCount < writableLoaded
    let slot = index - staticCount - (writable ? 0 : writableLoaded)
    for (const [lookupIndex, lookup] of addressTableLookups.entries()) {
      const tableIndexes = writable ? lookup.writableIndexes : lookup.readonlyIndexes
      if (slot < tableIndexes.length) {
        return { source: "lookup", index, lookupIndex, accountKey: lookup.accountKey, tableIndex: tableIndexes[slot], writable }
      }
      slot -= tableIndexes.length
    }
    throw new Error("account index was validated against the lookup tables")
  }

  const instructions: SolanaInstructionFacts[] = rawInstructions.map((instruction, index) => {
    const programId = addresses[instruction.programIdIndex]
    const accounts = Array.from(instruction.accountIndexes, accountRef)
    return {
      index,
      programIdIndex: instruction.programIdIndex,
      programId,
      accounts,
      dataHex: hex(instruction.data),
      ...decodeTransfer(programId, accounts, instruction.data),
    }
  })

  return deepFreeze({
    version,
    messageHex: hex(bytes),
    messageLength: bytes.length,
    transactionLength,
    header: { numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts },
    feePayer: addresses[0],
    expectedSigner: { index: signerIndex, address: expectedAddress, isFeePayer: signerIndex === 0 },
    staticAccountKeys,
    recentBlockhash,
    instructions,
    addressTableLookups,
    hasUndecodedContent: addressTableLookups.length > 0 || instructions.some((instruction) => instruction.decoded === null),
  })
}
