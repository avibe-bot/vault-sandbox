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
    ).toThrow(/parent-value inputMode is only supported for static secrets/)
  })

  it("keeps sandbox-entry sealing for static and keypair secrets", () => {
    expect(parseSealRequest({ name: "STATIC_SECRET", kind: "static", inputMode: "sandbox-entry" })).toEqual({
      name: "STATIC_SECRET",
      kind: "static",
      inputMode: "sandbox-entry",
      wrapMeta: undefined,
    })
    expect(parseSealRequest({ name: "SIGNING_KEY", kind: "keypair" })).toEqual({
      name: "SIGNING_KEY",
      kind: "keypair",
      inputMode: "sandbox-entry",
      wrapMeta: undefined,
    })
  })
})
