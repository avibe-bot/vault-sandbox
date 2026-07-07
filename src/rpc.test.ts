import { describe, expect, it } from "vitest"

import { BUILD } from "./rpc"

describe("sandbox build metadata", () => {
  it("reports a deterministic build identifier instead of the dev placeholder", () => {
    expect(BUILD.sandboxVersion).toBe("0.1.0")
    expect(BUILD.buildHash).not.toBe("dev")
    expect(BUILD.buildHash).toMatch(/^0\.1\.0(\+[0-9a-f]{7,12})?$/)
  })
})
