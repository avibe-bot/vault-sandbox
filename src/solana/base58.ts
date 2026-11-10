const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

/** Base58 (Bitcoin alphabet) as Solana prints addresses and hashes. */
export function base58Encode(bytes: Uint8Array): string {
  let leadingZeros = 0
  while (leadingZeros < bytes.length && bytes[leadingZeros] === 0) leadingZeros += 1
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  let digits = ""
  while (value > 0n) {
    digits = ALPHABET[Number(value % 58n)] + digits
    value /= 58n
  }
  return "1".repeat(leadingZeros) + digits
}
