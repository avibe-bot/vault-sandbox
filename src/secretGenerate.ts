// Generating a protected value inside the secure window, so it never exists on the page.
// The same recipes, limits and rules as the Avibe Vaults generator (avibe ui/src/lib/
// vaultGenerate.ts): a password counts characters, hex and Base64 count random bytes;
// characters are picked by rejection sampling (no modulo bias) and every chosen class
// appears in a password. Randomness is crypto.getRandomValues only.

export type GenerateRecipe =
  | { type: "password"; length: number; digits: boolean; symbols: boolean; noLookalikes: boolean }
  | { type: "hex" | "base64"; bytes: number }

export const PASSWORD_LENGTH = { min: 8, max: 100 } as const
export const RANDOM_BYTES = { min: 16, max: 64 } as const

/** Safe in env files, shells and URLs: no quotes, backslash, space, comma or backtick. */
export const GENERATE_SYMBOLS = "!#$%&*+-.:=?@^_~"
const LOWER = "abcdefghijklmnopqrstuvwxyz"
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const DIGITS = "0123456789"
const LOOKALIKES = new Set(["0", "O", "1", "l", "I"])

export type RandomSource = (bytes: Uint8Array) => void
const cryptoSource: RandomSource = (bytes) => { crypto.getRandomValues(bytes) }

/** A recipe from the wire, exactly; anything else is refused. */
export function parseGenerateRecipe(value: unknown): GenerateRecipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("generate recipe must be an object")
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (record.type === "password") {
    if (keys.some((key) => !["type", "length", "digits", "symbols", "noLookalikes"].includes(key)) || keys.length !== 5) throw new Error("password recipe has the wrong fields")
    const { length, digits, symbols, noLookalikes } = record
    if (typeof length !== "number" || !Number.isInteger(length) || length < PASSWORD_LENGTH.min || length > PASSWORD_LENGTH.max) throw new Error("password length is out of range")
    if (typeof digits !== "boolean" || typeof symbols !== "boolean" || typeof noLookalikes !== "boolean") throw new Error("password options must be booleans")
    return { type: "password", length, digits, symbols, noLookalikes }
  }
  if (record.type === "hex" || record.type === "base64") {
    if (keys.length !== 2 || !keys.includes("bytes")) throw new Error("byte recipe has the wrong fields")
    const { bytes } = record
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < RANDOM_BYTES.min || bytes > RANDOM_BYTES.max) throw new Error("byte count is out of range")
    return { type: record.type, bytes }
  }
  throw new Error("generate recipe type is unsupported")
}

function passwordClasses(recipe: Extract<GenerateRecipe, { type: "password" }>): string[] {
  const classes = [LOWER, UPPER]
  if (recipe.digits) classes.push(DIGITS)
  if (recipe.symbols) classes.push(GENERATE_SYMBOLS)
  return recipe.noLookalikes ? classes.map((set) => [...set].filter((char) => !LOOKALIKES.has(char)).join("")) : classes
}

/** `count` indexes in [0, size), each uniform: a byte at or above the largest multiple of `size`
 *  below 256 is thrown away and drawn again. */
function uniformIndexes(count: number, size: number, random: RandomSource): number[] {
  const limit = 256 - (256 % size)
  const out: number[] = []
  const buffer = new Uint8Array(Math.max(16, count * 2))
  while (out.length < count) {
    random(buffer)
    for (const byte of buffer) {
      if (byte < limit) out.push(byte % size)
      if (out.length === count) break
    }
  }
  buffer.fill(0)
  return out
}

function randomPassword(recipe: Extract<GenerateRecipe, { type: "password" }>, random: RandomSource): string {
  const classes = passwordClasses(recipe)
  const alphabet = classes.join("")
  // Every chosen class must appear. A string that misses one is drawn again whole; changing one
  // position instead would make some strings likelier than others.
  for (;;) {
    const value = uniformIndexes(recipe.length, alphabet.length, random).map((index) => alphabet[index]).join("")
    if (classes.every((set) => [...value].some((char) => set.includes(char)))) return value
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** A new random value for `recipe`. Hex is lowercase; Base64 is the standard alphabet with `=` padding. */
export function generateSecretValue(recipe: GenerateRecipe, random: RandomSource = cryptoSource): string {
  const valid = parseGenerateRecipe(recipe)
  if (valid.type === "password") return randomPassword(valid, random)
  const bytes = new Uint8Array(valid.bytes)
  random(bytes)
  const value = valid.type === "hex" ? Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") : toBase64(bytes)
  bytes.fill(0)
  return value
}
