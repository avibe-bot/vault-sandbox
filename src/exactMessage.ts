import { hexToBytes } from "@noble/curves/utils.js"

// Transport/custody bound, not Solana structural acceptance. The later Solana
// parser independently enforces the signed packet size (including signatures).
export const MAX_EXACT_MESSAGE_BYTES = 1024 * 1024
export type ExactMessageInput = string | Uint8Array

// Native accessors ignore shadowed public length/buffer/offset properties. The
// fixed-size native destination cannot grow if a shared source grows meanwhile.
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype)
const nativeUint8Tag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)!.get!
const nativeUint8ByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!
const nativeUint8Set = Uint8Array.prototype.set

export function assertExactMessageSize(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error("exact message byte length is invalid")
  if (byteLength > MAX_EXACT_MESSAGE_BYTES) throw new Error("exact message exceeds the 1 MiB decoded limit")
}

/** Check length before scanning/decoding hex. Formatting is validated separately. */
export function assertExactMessageHexSize(hex: string): void {
  const prefixLength = hex.startsWith("0x") ? 2 : 0
  assertExactMessageSize(Math.ceil((hex.length - prefixLength) / 2))
}

/** Own the entire bounded conversion. Do not delegate to a generic byte copier. */
export function copyExactMessage(value: ExactMessageInput): Uint8Array {
  if (typeof value === "string") {
    assertExactMessageHexSize(value)
    return hexToBytes(value.startsWith("0x") ? value.slice(2) : value)
  }
  if (nativeUint8Tag.call(value) !== "Uint8Array") throw new TypeError("exact message must be hex or Uint8Array")
  const length = nativeUint8ByteLength.call(value) as number
  assertExactMessageSize(length)
  const copy = new Uint8Array(length)
  nativeUint8Set.call(copy, value)
  return copy
}
