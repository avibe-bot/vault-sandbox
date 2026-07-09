import { describe, expect, it } from "vitest"
import { RpcError } from "./rpc"
import { parseSealRequest } from "./sealRequest"

describe("seal request contract", () => {
  it("accepts a parent-provided value for static secrets", () => {
    expect(
      parseSealRequest({
        name: "OPENAI_API_KEY",
        kind: "static",
        inputMode: "parent-value",
        value: "protected value",
        wrapMeta: "wrap",
      }),
    ).toEqual({
      name: "OPENAI_API_KEY",
      kind: "static",
      inputMode: "parent-value",
      value: "protected value",
      wrapMeta: "wrap",
    })
  })

  it("rejects an empty parent-provided static value", () => {
    expect(() =>
      parseSealRequest({
        name: "OPENAI_API_KEY",
        kind: "static",
        inputMode: "parent-value",
        value: "",
      }),
    ).toThrow(RpcError)
    expect(() =>
      parseSealRequest({
        name: "OPENAI_API_KEY",
        kind: "static",
        inputMode: "parent-value",
        value: "",
      }),
    ).toThrow(/value must be a non-empty string/)
  })

  it("rejects parent-provided keypair material", () => {
    expect(() =>
      parseSealRequest({
        name: "SIGNING_KEY",
        kind: "keypair",
        inputMode: "parent-value",
        value: "0x1234",
      }),
    ).toThrow(/keypair seal is generate-only/)
  })

  it("rejects sandbox-entry static sealing", () => {
    expect(() => parseSealRequest({ name: "STATIC_SECRET", kind: "static", inputMode: "sandbox-entry" })).toThrow(
      /static seal inputMode must be parent-value/,
    )
  })

  it("accepts generate-only keypair sealing", () => {
    expect(parseSealRequest({ name: "SIGNING_KEY", kind: "keypair" })).toEqual({
      name: "SIGNING_KEY",
      kind: "keypair",
      wrapMeta: undefined,
    })
  })

  it("rejects parent-provided keypair value without inputMode", () => {
    expect(() =>
      parseSealRequest({
        name: "SIGNING_KEY",
        kind: "keypair",
        value: "0x1234",
      }),
    ).toThrow(/keypair seal cannot accept parent-provided private key material/)
  })
})
