import { describe, expect, it, vi } from "vitest"
import { hashTypedData } from "viem"
import { prepareSignRequest } from "./signRequest"
import { signFixture } from "./signTestFixtures"

// A typed-data review the authorization window would refuse must never reach it,
// and must never change acceptance: the request keeps its prose review.
vi.mock("./eip712Review", async (original) => {
  const actual = await original<typeof import("./eip712Review")>()
  return {
    ...actual,
    eip712SigningReview: (...args: Parameters<typeof actual.eip712SigningReview>) => ({
      ...actual.eip712SigningReview(...args),
      summary: [{ label: "Free text label", value: "x" }],
    }),
  }
})

describe("typed-data review fallback", () => {
  it("keeps the prose review when the structured one would fail the window's decoder", async () => {
    const typed = {
      domain: { name: "Ether Mail", version: "1", chainId: 1, verifyingContract: "0x1111111111111111111111111111111111111111" },
      types: { Note: [{ name: "text", type: "string" }] }, primaryType: "Note", message: { text: "hello" },
    }
    const f = await signFixture("ecdsa-secp256k1-recoverable", Uint8Array.from({ length: 32 }, (_unused, index) => (index === 31 ? 1 : 0)))
    const context = { kind: "eip-712-typed-data", typedData: typed, digestAlgorithm: "eip712", digest: hashTypedData(typed as never).slice(2) } as never
    f.request.signingContext = context
    Object.assign(f.request.context.release!, { digest: (context as { digest: string }).digest, signingContext: structuredClone(context) })
    f.resign()
    const prepared = prepareSignRequest(f.request)
    expect(prepared.verified.review).toBeUndefined()
    expect(prepared.verified.display).toContain("EIP-712 typed data")
    expect(prepared.verified.payload).toEqual({ kind: "digest", digest: (context as { digest: string }).digest })
  })
})
