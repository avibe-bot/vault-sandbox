import { afterEach, describe, expect, it, vi } from "vitest"
import {
  generateStaticSecretBytes,
  MAX_STATIC_SECRET_LENGTH,
  parseStaticSecretGenerationRecipe,
} from "./staticSecretGeneration"

afterEach(() => vi.restoreAllMocks())

function reveal(bytes: Uint8Array): string {
  try {
    return new TextDecoder().decode(bytes)
  } finally {
    bytes.fill(0)
  }
}

describe("static secret generation recipe", () => {
  it("normalizes supported recipes and applies the 512-character ceiling", () => {
    expect(parseStaticSecretGenerationRecipe({ length: 64, charset: "hex" })).toEqual({ length: 64, charset: "hex" })
    expect(parseStaticSecretGenerationRecipe({
      length: MAX_STATIC_SECRET_LENGTH,
      charset: "custom",
      lowercase: true,
      digits: true,
      exclude_lookalikes: true,
    })).toEqual({
      length: MAX_STATIC_SECRET_LENGTH,
      charset: "custom",
      lowercase: true,
      uppercase: false,
      digits: true,
      symbols: false,
      exclude_lookalikes: true,
    })
  })

  it.each([
    null,
    [],
    { length: 0, charset: "hex" },
    { length: 513, charset: "hex" },
    { length: 1.5, charset: "hex" },
    { length: 2, charset: "unknown" },
    { length: 2, charset: "custom" },
    { length: 2, charset: "custom", digits: "yes" },
    { length: 2, charset: "hex", lowercase: true },
    { length: 2, charset: "hex", exclude_lookalikes: true },
    { length: 2, charset: "hex", value: "secret" },
  ])("rejects malformed or secret-bearing recipe %j", (recipe) => {
    expect(() => parseStaticSecretGenerationRecipe(recipe)).toThrow()
  })
})

describe("sandbox static secret generator", () => {
  it("uses exact preset alphabets and returns only bounded ASCII bytes", () => {
    const hex = generateStaticSecretBytes({ length: 128, charset: "hex" })
    const base64url = generateStaticSecretBytes({ length: 128, charset: "base64url" })
    try {
      expect(String.fromCharCode(...hex)).toMatch(/^[0-9a-f]{128}$/)
      expect(String.fromCharCode(...base64url)).toMatch(/^[A-Za-z0-9_-]{128}$/)
    } finally {
      hex.fill(0)
      base64url.fill(0)
    }
  })

  it("honors custom groups and excludes look-alikes", () => {
    const output = generateStaticSecretBytes({
      length: 64,
      charset: "custom",
      lowercase: true,
      uppercase: true,
      digits: true,
      symbols: true,
      exclude_lookalikes: true,
    })
    const text = reveal(output)
    expect(text).toMatch(/^[a-zA-Z0-9!#$%&()*+,-./:;<=>?@\[\]^_{|}~]{64}$/)
    expect(text).not.toMatch(/[0O1lI|]/)
  })

  it("rejects out-of-range bytes before modulo selection", () => {
    const source = Uint8Array.from([255, 254, 0, 1, 2, 3, 4, 5])
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((target) => {
      if (target === null) throw new TypeError("random target is required")
      const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength)
      bytes.set(source.subarray(0, bytes.length))
      return target
    })
    const output = generateStaticSecretBytes({ length: 2, charset: "custom", digits: true })
    expect(reveal(output)).toBe("01")
    expect(random).toHaveBeenCalledOnce()
  })
})
