import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { sha256 } from "@noble/hashes/sha2.js"

import { bytesToBase64 } from "./vaultCrypto"
import { policyChallenge, type PolicyDowngradeContext } from "./signingPolicyDowngrade"
import { BUILD, CHANNEL, VERSION } from "./rpc"

const vectorFile = await import("./fixtures/policy-downgrade-wire-vectors.json")
const protectedContext = vectorFile.default.vectors[2].context as PolicyDowngradeContext
// Keep the unchanged standard RPC/assertion baseline alongside the newly
// implemented source's truthful protected all-three target.
const context: PolicyDowngradeContext = {
  ...protectedContext, target: { ...protectedContext.target, protection: "standard" },
}
const sandboxOrigin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const messages = new EventTarget()
const replies = new Map<string, (value: Reply) => void>()
const readyOperations: string[] = []
let wrongResult = false

vi.mock("./operationUi", async (original) => {
  const actual = await original<typeof import("./operationUi")>()
  return {
    ...actual,
    runExclusiveOperation: async (operation: (signal: AbortSignal) => unknown) => operation(new AbortController().signal),
    confirmOperationInActiveSlot: async (_card: unknown, _signal: unknown, _guard: unknown, activate: () => Promise<void>) => activate(),
  }
})

type Reply = { id: string; ok: boolean; result?: unknown; error?: { code: string } }

function dispatch(origin: string, source: unknown, data: unknown): void {
  const event = new Event("message")
  Object.assign(event, { origin, source, data })
  messages.dispatchEvent(event)
}

function validAssertion(c: PolicyDowngradeContext = context): Record<string, unknown> {
  const rawId = Uint8Array.from(atob(c.factors[0].credentialId), (char) => char.charCodeAt(0))
  const authData = new Uint8Array(37)
  authData.set(sha256(new TextEncoder().encode(c.rpId)))
  authData[32] = 0x05
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({
    type: "webauthn.get",
    challenge: bytesToBase64(policyChallenge(c)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    origin: c.origin,
  }))
  return {
    id: bytesToBase64(rawId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    rawId: bytesToBase64(rawId),
    type: "public-key",
    response: {
      clientDataJSON: bytesToBase64(clientDataJSON),
      authenticatorData: bytesToBase64(authData),
      signature: "AA==",
      userHandle: null,
    },
  }
}

const parent = {
  postMessage(value: Reply & { type?: string; capabilities?: { operations?: string[] } }) {
    if (value.type === "ready") {
      readyOperations.push(...(value.capabilities?.operations ?? []))
      return
    }
    replies.get(value.id)?.(value)
  },
}

const fakeWindow = {
  location: { origin: sandboxOrigin, hostname: "sandbox.avibe.bot", href: sandboxOrigin, search: "", hash: "" },
  self: {},
  top: {},
  parent,
  addEventListener: messages.addEventListener.bind(messages),
  removeEventListener: messages.removeEventListener.bind(messages),
  open(url: string) {
    const id = new URLSearchParams(new URL(url).hash.slice(1)).get("id")!
    const popup = {
      closed: false,
      close: vi.fn(),
      focus: vi.fn(),
      postMessage(message: { request: { context?: PolicyDowngradeContext } }) {
        const result = wrongResult ? { kind: "confirmed" } : { kind: "assertion", assertion: validAssertion(message.request.context) }
        queueMicrotask(() => dispatch(sandboxOrigin, popup, { type: "authorization-approved", build: BUILD, id, result }))
      },
    }
    queueMicrotask(() => dispatch(sandboxOrigin, popup, { type: "authorization-ready", build: BUILD, id }))
    return popup
  },
}

async function rpc(op: string, payload: unknown): Promise<Reply> {
  const id = crypto.randomUUID()
  const result = new Promise<Reply>((resolve) => replies.set(id, resolve))
  dispatch(parentOrigin, parent, { channel: CHANNEL, version: VERSION, id, op, payload })
  return result.finally(() => replies.delete(id))
}

beforeAll(async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-13T00:01:00.000Z"))
  vi.stubGlobal("window", fakeWindow)
  vi.stubGlobal("document", {
    body: { classList: { add: vi.fn(), remove: vi.fn() } },
    documentElement: { getAttribute: () => "dark", setAttribute: vi.fn() },
  })
  vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() } })
  await import("./main")
  expect(readyOperations).toContain("authorizeSigningPolicyDowngrade")
  expect((await rpc("handshake", { parentOrigin, nonce: "policy-test-nonce-123456" })).ok).toBe(true)
})

beforeEach(() => {
  wrongResult = false
})

afterAll(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("authorizeSigningPolicyDowngrade RPC", () => {
  it("refuses a protected partial address set before opening a popup instead of filtering v1", async () => {
    const open = vi.spyOn(fakeWindow, "open")
    try {
      const partial = structuredClone(protectedContext)
      partial.target.addresses.btc_legacy = null
      const reply = await rpc("authorizeSigningPolicyDowngrade", { context: partial })
      expect(reply.ok).toBe(false)
      expect(reply.error?.code).toBe("policy_context_invalid")
      expect(open).not.toHaveBeenCalled()
    } finally { open.mockRestore() }
  })
  it("preserves all-three protected policy v1 on the actually capable compiled source", async () => {
    const reply = await rpc("authorizeSigningPolicyDowngrade", { context: protectedContext })
    expect(reply).toMatchObject({ ok: true })
    expect(reply.result).toEqual({ challengeId: protectedContext.challengeId, assertion: validAssertion(protectedContext) })
  })

  it("uses the additive structured request and returns the actual serialized assertion", async () => {
    const reply = await rpc("authorizeSigningPolicyDowngrade", { context })
    expect(reply).toMatchObject({ ok: true })
    expect(reply.result).toEqual({ challengeId: context.challengeId, assertion: validAssertion() })
  })

  it("rejects a legacy confirmed result instead of accepting it as policy authorization", async () => {
    wrongResult = true
    const reply = await rpc("authorizeSigningPolicyDowngrade", { context })
    expect(reply.ok).toBe(false)
    expect(reply.error?.code).toBe("authorization_result_invalid")
  })
})
