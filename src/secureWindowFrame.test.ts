// Frame-side guards of the secure window, from the independent PR50 review probes.
// The REAL main.ts frame (RPC, lifecycle, operationUi) against scripted authorization windows.
// Pure Node: no browser, no passkey (credentials.get throws), no clipboard use in this file.
// Every key, root, secret and value is public synthetic test data.
import { afterEach, describe, expect, it, vi } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"
import { secp256k1 } from "@noble/curves/secp256k1.js"
import { hexToBytes } from "@noble/curves/utils.js"
import { hashTypedData } from "viem"
import vectors from "./fixtures/protected-hd-codec-vectors.json"
import { installCardDocument } from "./testDom"
import { buildWrapMeta, bytesToBase64, packProtectedRecord, protectRootMetadata, sealProtected, withRootMetadata, withWrapMetaMetadata } from "./vaultCrypto"
import { hdEnvelopeFingerprint } from "./protectedHd"
import { sealHdWalletLocally } from "./protectedHdCustody"
import { signedOperationContextMessage } from "./operationContext"
import { revealEnvelopeHash } from "./revealRequest"
import { CHANNEL, VERSION } from "./rpc"

const origin = "https://sandbox.avibe.bot"
const parentOrigin = "https://app.avibe.bot"
const vector = vectors.cases[0]
const realSetTimeout = globalThis.setTimeout
const tick = (ms = 5): Promise<void> => new Promise((resolve) => { realSetTimeout(resolve, ms) })
const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)
const UNLOCK = { kind: "unlock", prfOutput: bytesToBase64(new Uint8Array(32).fill(0x22)), prfSalt: bytesToBase64(new Uint8Array(32).fill(0x33)) }
type Reply = { id: string; ok: boolean; result?: Record<string, unknown>; error?: { code: string; message?: string; retryable?: boolean } }
type AuthRequest = { passkey?: string; keepOpen?: true; kind?: string; name?: string; wrapMeta?: string
  rows?: Array<{ label?: string; value: string; copyChallenge?: string }>; prompt?: { challenge?: string; review?: unknown; body?: unknown; details?: { rows?: Array<{ values?: unknown[] }> } } }

async function runtime() {
  vi.resetModules()
  const events = new EventTarget()
  const replies = new Map<string, (reply: Reply) => void>()
  const toParent: unknown[] = []
  const parent = { postMessage: vi.fn((value: Reply) => { toParent.push(structuredClone(value)); if (value?.id) replies.get(value.id)?.(value) }) }
  const nav = {
    credentials: { get: vi.fn(async () => { throw new Error("passkey calls are forbidden in this probe") }), create: vi.fn() },
    userAgent: "test", platform: "test", maxTouchPoints: 0,
    locks: { request: async (_name: string, _options: unknown, operation: () => unknown) => operation() },
  }
  const location = { origin, hostname: "sandbox.avibe.bot", href: `${origin}/index.html#mode=test`, hash: "#mode=test", search: "" }
  let build: unknown
  function dispatch(source: unknown, data: unknown, eventOrigin = origin): void {
    const event = new Event("message")
    Object.assign(event, { origin: eventOrigin, source, data })
    events.dispatchEvent(event)
  }
  /** A scripted top-level window. Nothing happens in it unless the test says so. */
  const makeWindow = (id = `review-window-${crypto.randomUUID()}`) => {
    const posted: Array<{ message: { type: string; request?: AuthRequest }; target: string }> = []
    const popup = {
      id, closed: false,
      close: vi.fn(() => { popup.closed = true }),
      focus: vi.fn(),
      postMessage: vi.fn((message: { type: string; request?: AuthRequest }, target: string) => { posted.push({ message: structuredClone(message), target }) }),
    }
    const requests = (): AuthRequest[] => posted.filter((entry) => entry.message.type === "authorization-request").map((entry) => entry.message.request!)
    const ready = (overrides: { build?: unknown; origin?: string } = {}): void =>
      dispatch(popup, { type: "authorization-ready", build: "build" in overrides ? overrides.build : build, id }, overrides.origin ?? origin)
    return {
      id, popup, posted, requests, ready,
      dismissed: (): boolean => posted.some((entry) => entry.message.type === "authorization-dismiss"),
      approve: (result: unknown): void => dispatch(popup, { type: "authorization-approved", build, id, result }),
      fail: (code: string): void => dispatch(popup, { type: "authorization-error", build, id, code, message: "public mock", retryable: true }),
      /** Announce like the real window does until the frame answers with its next request. */
      async next(limitMs = 3_000): Promise<AuthRequest> {
        const before = requests().length
        const until = performance.now() + limitMs
        while (performance.now() < until) {
          if (!popup.closed) ready()
          if (requests().length > before) return requests().at(-1)!
          await tick()
        }
        throw new Error(`frame sent no authorization-request to window ${id}`)
      },
    }
  }
  const opened: Array<ReturnType<typeof makeWindow>> = []
  const window = {
    location, navigator: nav, self: {}, top: {}, parent, opener: null,
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    open: vi.fn((url: string) => {
      const scripted = makeWindow(new URLSearchParams(new URL(url).hash.slice(1)).get("id")!)
      opened.push(scripted)
      return scripted.popup
    }),
    close: vi.fn(),
  }
  const storage = new Map<string, string>()
  vi.stubGlobal("window", window)
  vi.stubGlobal("navigator", nav)
  vi.stubGlobal("BroadcastChannel", undefined)
  vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) })
  const dom = installCardDocument(vi.stubGlobal)
  vi.stubGlobal("navigator", nav)

  const vmk = new Uint8Array(32).fill(0x44)
  const daemonKey = new Uint8Array(32).fill(0x11)
  const rootMetadata = { daemon: { verificationKeys: [{ alg: "ed25519" as const, keyId: "public", publicKey: bytesToBase64(ed25519.getPublicKey(daemonKey)) }] } }
  const makeRoot = async (): Promise<string> => {
    const base = withWrapMetaMetadata(await buildWrapMeta(vmk, [{ kind: "passkey", prfOutput: new Uint8Array(32).fill(0x22), prfSalt: new Uint8Array(32).fill(0x33) }]), { rpId: "sandbox.avibe.bot", vaultUserHandle: "public-pr50" })
    return withRootMetadata(base, await protectRootMetadata(vmk, rootMetadata, base))
  }
  const wrapMeta = await makeRoot()
  const sign = <T extends { signature: { value: string } }>(context: T, key = daemonKey): T => {
    context.signature.value = bytesToBase64(ed25519.sign(utf8(signedOperationContextMessage(context as never)), key))
    return context
  }
  const item = async (name: string, value: string, options: { requestId?: string; root?: string; ttlMs?: number; key?: Uint8Array; purpose?: string; corrupt?: boolean } = {}) => {
    const record = { name, kind: "static" as const }
    const envelope = packProtectedRecord(await sealProtected(utf8(value), vmk, record), options.root ?? wrapMeta, record)
    if (options.corrupt) envelope.ciphertext = bytesToBase64(new Uint8Array(48).fill(7))
    const context = sign({
      v: 2 as const, purpose: (options.purpose ?? "reveal") as "reveal", requestId: options.requestId ?? `public-${name}-${crypto.randomUUID()}`,
      display: { secrets: [{ name, kind: "static" as const }] },
      release: { name, envelopeHash: { alg: "sha256", digest: revealEnvelopeHash(envelope) } },
      expiresAt: new Date(Date.now() + (options.ttlMs ?? 3_600_000)).toISOString(),
      signature: { alg: "ed25519" as const, keyId: "public", value: "" },
    }, options.key)
    return { material: { name, envelope }, context }
  }
  const hd = await sealHdWalletLocally({ name: "PUBLIC_HD", words: vector.words, passphrase: vector.passphrase, vmk, wrapMeta, assertCurrent() {} })
  const hdPublicKey = hd.accounts[1].evm
  const signRequest = (contents: string, options: { key?: Uint8Array } = {}) => {
    const typedData = {
      domain: { name: "Public HD", version: "1", chainId: 1, verifyingContract: "0x0000000000000000000000000000000000000001" },
      types: { Mail: [{ name: "contents", type: "string" }] }, primaryType: "Mail", message: { contents },
    }
    const digest = hashTypedData(typedData as never).slice(2)
    const signingContext = { kind: "eip-712-typed-data", typedData, digestAlgorithm: "eip712", digest }
    const context = sign({
      v: 2 as const, purpose: "sign" as const, requestId: crypto.randomUUID(),
      display: { secrets: [{ name: "PUBLIC_HD", kind: "keypair" as const }] },
      release: {
        name: "PUBLIC_HD", scheme: "ecdsa-secp256k1-recoverable", digest, publicKey: hdPublicKey,
        signingContext: structuredClone(signingContext), derivation: { chain: "evm", account: 1 },
        signingKey: { secret_id: "PUBLIC_HD", public_key: hdPublicKey, envelope_sha256: hdEnvelopeFingerprint(hd.envelope) },
      },
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      signature: { alg: "ed25519" as const, keyId: "public", value: "" },
    }, options.key)
    return { digest, payload: { material: { name: "PUBLIC_HD", envelope: hd.envelope }, scheme: "ecdsa-secp256k1-recoverable", signingContext, context } }
  }
  const validSignature = (reply: Reply, digest: string): boolean =>
    secp256k1.verify(hexToBytes(String(reply.result!.signature)), hexToBytes(digest), hexToBytes(hdPublicKey), { prehash: false })

  const rpc = (op: string, payload: unknown, authorizationWindow?: string): Promise<Reply> & { settled: () => boolean } => {
    const id = crypto.randomUUID()
    let done = false
    const reply = new Promise<Reply>((resolve) => replies.set(id, resolve))
    dispatch(parent, { channel: CHANNEL, version: VERSION, id, op, payload, ...(authorizationWindow ? { authorizationWindow } : {}) }, parentOrigin)
    const result = reply.finally(() => { done = true; replies.delete(id) }) as Promise<Reply> & { settled: () => boolean }
    result.settled = () => done
    return result
  }
  build = (await import("./rpc")).BUILD
  await import("./main")
  expect((await rpc("handshake", { parentOrigin, nonce: "public-pr50-review-handshake-123456" })).ok).toBe(true)
  const lifecycle = await import("./vaultLifecycle")
  const policy = await import("./policy")
  const setPolicy = (strictApprovals: boolean, windowSeconds: 300 | 600 = 300): void => { policy.setVaultSessionPolicy({ windowSeconds, strictApprovals, parentValueSealAllowed: true }) }
  setPolicy(false)
  const unlock = (fill?: number): Uint8Array => {
    const session = fill === undefined ? new Uint8Array(vmk) : new Uint8Array(32).fill(fill)
    lifecycle.commitUnlockedVmk({ vmk: session, wrapMeta, scopeId: "public-pr50", freshSetup: false, policy: policy.currentVaultSessionPolicy() })
    return session
  }
  /** Everything this frame ever told the parent or drew into its own document. */
  const frameSurface = (): string => JSON.stringify(toParent) + dom.body.textContent
  const uiShows = (): number => toParent.filter((message) => (message as { event?: string }).event === "ui.show").length
  type CardButton = { click(): void; disabled: boolean; textContent: string; classList: { contains(name: string): boolean } }
  const cardButtons = (): CardButton[] => dom.body.querySelectorAll("button") as unknown as CardButton[]
  /** Click the frame card's own confirm button once it is enabled (it stays disabled for 500 ms). */
  const clickFrameCard = async (advance?: (ms: number) => Promise<unknown>): Promise<string> => {
    const until = performance.now() + 4_000
    while (performance.now() < until) {
      const confirm = cardButtons().filter((node) => !node.classList.contains("secondary")).at(-1)
      if (confirm && !confirm.disabled) { const label = confirm.textContent; confirm.click(); return label }
      if (advance) await advance(100)
      await tick(10)
    }
    throw new Error("the frame shows no enabled card button")
  }
  const frameText = (): string => dom.body.textContent
  return { rpc, makeWindow, opened, lifecycle, setPolicy, unlock, item, makeRoot, signRequest, validSignature, wrapMeta, vmk, daemonKey, nav, dom, frameSurface, uiShows, window, clickFrameCard, frameText, cardButtons }
}
type R = Awaited<ReturnType<typeof runtime>>

async function login(r: R, values: Record<string, string> = { "": "public-password", username: "public-user", totp: "public-otp-seed" }) {
  return Promise.all(Object.entries(values).map(([field, value]) => r.item(field ? `PUBLIC_LOGIN.${field}` : "PUBLIC_LOGIN", value)))
}

afterEach(async () => {
  vi.useRealTimers()
  const lifecycle = await import("./vaultLifecycle")
  lifecycle.resetVaultSessionForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("PR50 whole-secret reveal at the real RPC boundary", () => {
  it("F1 locked: one unlock in the window, then the rows go only to that window; nothing reaches the parent or this frame; every context is spent", async () => {
    const r = await runtime()
    const items = await login(r)
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items, defaultFieldLabel: "password" }, w.id)
    const first = await w.next()
    expect(first).toMatchObject({ passkey: "unlock", keepOpen: true })
    expect(JSON.stringify(first)).not.toContain("public-password")
    w.approve(UNLOCK)
    const second = await w.next()
    expect(second).toMatchObject({ kind: "protected-display", name: "PUBLIC_LOGIN" })
    expect(second.rows).toEqual([
      { label: "password", value: "public-password" }, { label: "username", value: "public-user" }, { label: "totp", value: "public-otp-seed" },
    ])
    expect(Object.keys(second).sort()).toEqual(["kind", "name", "rows", "wrapMeta"])
    expect(w.posted.every((entry) => entry.target === origin)).toBe(true)
    expect(w.popup.close).not.toHaveBeenCalled()
    expect(pending.settled()).toBe(false)
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true, result: { completed: true } })
    for (const value of ["public-password", "public-user", "public-otp-seed"]) expect(r.frameSurface()).not.toContain(value)
    expect(r.uiShows()).toBe(0)
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
    expect(r.window.open).not.toHaveBeenCalled()
    // One approval spent all three contexts: each field alone is now refused, not only the whole batch.
    for (const single of items) {
      r.unlock()
      const again = r.makeWindow()
      expect(await r.rpc("reveal", single, again.id)).toMatchObject({ ok: false, error: { code: "context_replayed" } })
      expect(again.requests()).toHaveLength(0)
    }
  })

  it("F2 all-or-nothing: one field that cannot be opened shows nothing, consumes nothing and dismisses the window", async () => {
    const r = await runtime()
    r.unlock()
    const [password, username] = await login(r, { "": "public-password", username: "public-user" })
    const broken = await r.item("PUBLIC_LOGIN.totp", "public-otp-seed", { corrupt: true })
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items: [password, username, broken] }, w.id)
    expect(await w.next()).toMatchObject({ passkey: "none", keepOpen: true })
    w.approve({ kind: "confirmed" })
    expect((await pending).ok).toBe(false)
    expect(w.requests()).toHaveLength(1)
    expect(w.dismissed()).toBe(true)
    expect(JSON.stringify(w.posted)).not.toContain("public-password")
    expect(r.window.open).not.toHaveBeenCalled()
    r.unlock()
    const retry = r.makeWindow()
    const second = r.rpc("reveal", { items: [password, username] }, retry.id)
    await retry.next()
    retry.approve({ kind: "confirmed" })
    expect((await retry.next()).rows?.map((row) => row.value)).toEqual(["public-password", "public-user"])
    retry.approve({ kind: "displayed" })
    expect(await second).toMatchObject({ ok: true })
  })

  it("F3 one already-used context refuses the whole batch before any window, and leaves the others unused", async () => {
    const r = await runtime()
    r.unlock()
    const [password, username, totp] = await login(r)
    const single = r.makeWindow()
    const first = r.rpc("reveal", password, single.id)
    expect(await single.next()).toMatchObject({ passkey: "none", keepOpen: true })
    single.approve({ kind: "confirmed" })
    expect((await single.next()).rows).toEqual([{ value: "public-password" }])
    single.approve({ kind: "displayed" })
    expect(await first).toMatchObject({ ok: true })
    const batch = r.makeWindow()
    expect(await r.rpc("reveal", { items: [password, username, totp] }, batch.id)).toMatchObject({ ok: false, error: { code: "context_replayed" } })
    expect(batch.requests()).toHaveLength(0)
    const rest = r.makeWindow()
    const others = r.rpc("reveal", { items: [username, totp] }, rest.id)
    await rest.next()
    rest.approve({ kind: "confirmed" })
    expect((await rest.next()).rows).toHaveLength(2)
    rest.approve({ kind: "displayed" })
    expect(await others).toMatchObject({ ok: true })
  })

  it("F4 refuses mixed roots, swapped bindings, a wrong purpose, a bad signature and an expired item, never showing a row", async () => {
    const r = await runtime()
    const good = await r.item("PUBLIC_LOGIN", "public-password")
    const user = await r.item("PUBLIC_LOGIN.username", "public-user")
    const cases: Array<[string, unknown, string | undefined]> = [
      ["mixed roots", { items: [good, await r.item("PUBLIC_LOGIN.other", "public-other", { root: await r.makeRoot() })] }, "invalid_payload"],
      ["swapped contexts", { items: [{ material: good.material, context: user.context }, { material: user.material, context: good.context }] }, undefined],
      ["a sign-purpose context", { items: [good, await r.item("PUBLIC_LOGIN.signer", "public-x", { purpose: "sign" })] }, undefined],
      ["a forged signature", { items: [good, await r.item("PUBLIC_LOGIN.forged", "public-forged", { key: new Uint8Array(32).fill(0x55) })] }, "invalid_context_signature"],
      ["an expired item", { items: [good, await r.item("PUBLIC_LOGIN.old", "public-old", { ttlMs: -1_000 })] }, "context_expired"],
    ]
    for (const [name, payload, code] of cases) {
      r.unlock()
      const w = r.makeWindow()
      const reply = await r.rpc("reveal", payload, w.id)
      expect(reply.ok, name).toBe(false)
      if (code) expect(reply.error?.code, name).toBe(code)
      expect(w.requests(), name).toHaveLength(0)
    }
    expect(r.window.open).not.toHaveBeenCalled()
    r.unlock()
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items: [good, user] }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    expect((await w.next()).rows).toHaveLength(2)
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
  })

  it("F5 carries 32 fields through one approval card and one display", async () => {
    const r = await runtime()
    r.unlock()
    const values = Object.fromEntries(Array.from({ length: 32 }, (_unused, index) => [index === 0 ? "" : `field_${index}`, `public-value-${index}`]))
    const items = await login(r, values)
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items }, w.id)
    const approval = await w.next()
    expect(approval).toMatchObject({ passkey: "none", keepOpen: true })
    expect(JSON.stringify(approval.prompt)).toContain("PUBLIC_LOGIN.field_31")
    w.approve({ kind: "confirmed" })
    const shown = await w.next()
    expect(shown.rows).toHaveLength(32)
    expect(shown.rows![0]).toEqual({ value: "public-value-0" })
    expect(shown.rows![31]).toEqual({ label: "field_31", value: "public-value-31" })
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
  })

  it("F6 Strict and locked: still one unlocking passkey, and every row carries its own copy challenge", async () => {
    const r = await runtime()
    r.setPolicy(true)
    const single = await r.item("PUBLIC_TOKEN", "public-token", { requestId: "rq-token" })
    const w = r.makeWindow()
    const pending = r.rpc("reveal", single, w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    const shown = await w.next()
    const expected = bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", utf8("reveal-copy:rq-token:PUBLIC_TOKEN"))))
    expect(shown.rows).toEqual([{ value: "public-token", copyChallenge: expected }])
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
  })

  it("F7 the rows go to the approving window object only: a twin with the same id and build, an old build and a foreign origin get nothing", async () => {
    const r = await runtime()
    r.unlock()
    const items = await login(r, { "": "public-password" })
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    const twin = r.makeWindow(w.id)
    const oldBuild = r.makeWindow(w.id)
    const foreign = r.makeWindow(w.id)
    for (let attempt = 0; attempt < 60; attempt += 1) {
      twin.ready()
      oldBuild.ready({ build: { buildHash: "1".repeat(64), sandboxVersion: "0.1.0" } })
      foreign.ready({ origin: parentOrigin })
      await tick()
    }
    for (const other of [twin, oldBuild, foreign]) expect(other.posted).toHaveLength(0)
    expect(w.requests()).toHaveLength(1)
    // A forged "displayed" from the twin does not finish the reveal either.
    twin.approve({ kind: "displayed" })
    await tick(30)
    expect(pending.settled()).toBe(false)
    expect((await w.next()).rows).toEqual([{ value: "public-password" }])
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
  })
})

describe("PR50 a page frozen behind its window (the kept window is gone when the frame continues)", () => {
  it("F10 reveal: a frame card with no value, then a window this frame opens itself shows the rows as its first request", async () => {
    const r = await runtime()
    const items = await login(r)
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items, defaultFieldLabel: "password" }, w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    w.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
    // Nothing opens, and no value is anywhere in this frame, until the person clicks.
    expect(r.window.open).not.toHaveBeenCalled()
    expect(r.frameText()).toContain("Approved")
    for (const value of ["public-password", "public-user", "public-otp-seed"]) expect(r.frameSurface()).not.toContain(value)
    expect(await r.clickFrameCard()).toBe("Open secure window")
    expect(r.window.open).toHaveBeenCalledOnce()
    const url = new URL(String(r.window.open.mock.calls[0][0]))
    expect(url.origin).toBe(origin)
    expect(url.hash).toContain("mode=authorize")
    const fresh = r.opened[0]
    expect(fresh.id).not.toBe(w.id)
    // Another window that announces the same id gets nothing: the frame talks only to the window it opened.
    const lookalike = r.makeWindow(fresh.id)
    for (let attempt = 0; attempt < 30; attempt += 1) { lookalike.ready(); await tick() }
    expect(lookalike.posted).toHaveLength(0)
    const shown = await fresh.next()
    expect(shown.kind).toBe("protected-display")
    expect(shown.rows?.map((row) => row.value)).toEqual(["public-password", "public-user", "public-otp-seed"])
    expect(fresh.posted.every((entry) => entry.target === origin)).toBe(true)
    expect(w.requests()).toHaveLength(1)
    lookalike.approve({ kind: "displayed" })
    await tick(30)
    expect(pending.settled()).toBe(false)
    fresh.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true, result: { completed: true } })
    for (const value of ["public-password", "public-user", "public-otp-seed"]) expect(r.frameSurface()).not.toContain(value)
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
  })

  it("S7 signing: the review reopens from a frame card in a window this frame opens, still passkey-free, and its click signs", async () => {
    const r = await runtime()
    const sign = r.signRequest("frozen page")
    const w = r.makeWindow()
    const pending = r.rpc("sign", sign.payload, w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    w.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
    expect(r.window.open).not.toHaveBeenCalled()
    expect(await r.clickFrameCard()).toBe("Continue")
    const fresh = r.opened[0]
    const lookalike = r.makeWindow(fresh.id)
    for (let attempt = 0; attempt < 30; attempt += 1) { lookalike.ready(); await tick() }
    expect(lookalike.posted).toHaveLength(0)
    const review = await fresh.next()
    expect(review.passkey).toBe("none")
    expect(review.keepOpen).toBeUndefined()
    expect(review.prompt?.challenge).toBeUndefined()
    // A click in any other window does not count.
    lookalike.approve({ kind: "confirmed" })
    w.approve({ kind: "confirmed" })
    await tick(30)
    expect(pending.settled()).toBe(false)
    fresh.approve({ kind: "confirmed" })
    const reply = await pending
    expect(reply.ok, JSON.stringify(reply)).toBe(true)
    expect(r.validSignature(reply, sign.digest)).toBe(true)
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
  })

  it("S7b signing: in the reopened window the click still needs this request's own unlock to be current", async () => {
    for (const ending of ["another unlock", "expired, timer not fired", "lock", "lock before the card click"] as const) {
      const r = await runtime()
      const sign = r.signRequest(`reopened: ${ending}`)
      const w = r.makeWindow()
      const pending = r.rpc("sign", sign.payload, w.id)
      await w.next()
      const fake = ending === "expired, timer not fired"
      if (fake) vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
      w.approve(UNLOCK)
      w.popup.closed = true
      for (let step = 0; step < 300 && r.uiShows() < 1; step += 1) await tick()
      expect(r.uiShows(), ending).toBe(1)
      if (ending === "lock before the card click") {
        r.lifecycle.lockVault({ broadcast: false, reason: "manual-lock" })
        await r.clickFrameCard()
        const reply = await pending
        expect(reply.ok, ending).toBe(false)
        expect(reply.result, ending).toBeUndefined()
        expect(r.window.open, ending).not.toHaveBeenCalled()
      } else {
        await r.clickFrameCard(fake ? (ms) => vi.advanceTimersByTimeAsync(ms) : undefined)
        const fresh = r.opened[0]
        let review: AuthRequest | undefined
        for (let step = 0; step < 300 && !review; step += 1) { fresh.ready(); review = fresh.requests()[0]; if (!review) await tick() }
        expect(review?.passkey, ending).toBe("none")
        if (ending === "another unlock") r.unlock(0x77)
        else if (ending === "lock") r.lifecycle.lockVault({ broadcast: false, reason: "manual-lock" })
        else vi.setSystemTime(Date.now() + 301_000)
        fresh.approve({ kind: "confirmed" })
        for (let step = 0; step < 300 && !pending.settled(); step += 1) await tick()
        const reply = await pending
        expect(reply.ok, ending).toBe(false)
        expect(reply.result, ending).toBeUndefined()
        if (ending !== "expired, timer not fired") expect(fresh.popup.close, ending).toHaveBeenCalled()
        expect(r.lifecycle.vaultStatus().state, ending).toBe(ending === "another unlock" ? "unlocked" : "locked")
      }
      vi.useRealTimers()
      r.lifecycle.resetVaultSessionForTests()
      vi.unstubAllGlobals()
    }
  }, 30_000)

  it("S9 signing: a kept window that closes during the review falls back to the frame card, and one click gives one signature", async () => {
    const r = await runtime()
    const sign = r.signRequest("closed during review")
    const w = r.makeWindow()
    const pending = r.rpc("sign", sign.payload, w.id)
    await w.next()
    w.approve(UNLOCK)
    expect((await w.next()).passkey).toBe("none")
    w.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 12_000, interval: 20 })
    // A late click from the closed window is not an approval.
    w.approve({ kind: "confirmed" })
    await tick(30)
    expect(pending.settled()).toBe(false)
    expect(await r.clickFrameCard()).toBe("Continue")
    expect((await r.opened[0].next()).passkey).toBe("none")
    r.opened[0].approve({ kind: "confirmed" })
    const reply = await pending
    expect(r.validSignature(reply, sign.digest)).toBe(true)
    expect(r.opened).toHaveLength(1)
  }, 30_000)
})

describe("PR50 what ends a display, and what the parent is told", () => {
  it("F8 after the rows were handed over, a lock, an auto-lock and a replacement root close the window and the reveal counts as completed", async () => {
    for (const ending of ["lock", "auto-lock", "root"] as const) {
      const r = await runtime()
      if (ending === "auto-lock") vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
      r.unlock()
      const items = await login(r, { "": "public-password" })
      const w = r.makeWindow()
      const pending = r.rpc("reveal", { items }, w.id)
      await w.next()
      w.approve({ kind: "confirmed" })
      expect((await w.next()).kind).toBe("protected-display")
      expect(w.popup.close).not.toHaveBeenCalled()
      if (ending === "lock") expect((await r.rpc("lock", {})).ok).toBe(true)
      else if (ending === "auto-lock") await vi.advanceTimersByTimeAsync(300_001)
      else {
        const changed = JSON.parse(r.wrapMeta)
        changed.public_extension = "replacement"
        expect((await r.rpc("status", { wrapMeta: JSON.stringify(changed) })).ok).toBe(true)
      }
      for (let step = 0; step < 300 && !pending.settled(); step += 1) await tick()
      expect(await pending, ending).toMatchObject({ ok: true, result: { completed: true } })
      expect(w.popup.close, ending).toHaveBeenCalled()
      vi.useRealTimers()
      r.lifecycle.resetVaultSessionForTests()
      vi.unstubAllGlobals()
    }
  })

  it("F11 completed only after the hand-over: closing or the 5-minute limit afterwards completes; every failure before it is still an error", async () => {
    // (a) the person closes the window that shows the rows
    let r = await runtime()
    r.unlock()
    let w = r.makeWindow()
    let pending = r.rpc("reveal", { items: await login(r, { "": "public-a" }) }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    expect((await w.next()).kind).toBe("protected-display")
    w.popup.closed = true
    expect(await pending).toMatchObject({ ok: true, result: { completed: true } })
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // (b) the frame's own 5-minute limit while the rows are shown
    r = await runtime()
    r.setPolicy(false, 600)
    r.unlock()
    w = r.makeWindow()
    const longer = r.rpc("reveal", { items: await login(r, { "": "public-b" }) }, w.id)
    await w.next()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
    w.approve({ kind: "confirmed" })
    let shown: AuthRequest | undefined
    for (let step = 0; step < 300 && !shown; step += 1) { w.ready(); shown = w.requests()[1]; if (!shown) await tick() }
    expect(shown?.kind).toBe("protected-display")
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100)
    for (let step = 0; step < 300 && !longer.settled(); step += 1) await tick()
    expect(await longer).toMatchObject({ ok: true, result: { completed: true } })
    expect(w.popup.close).toHaveBeenCalled()
    vi.useRealTimers()
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // (c) the window answers the rows with an error: not masked
    r = await runtime()
    r.unlock()
    w = r.makeWindow()
    pending = r.rpc("reveal", { items: await login(r, { "": "public-c" }) }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    expect((await w.next()).kind).toBe("protected-display")
    dispatchError(w)
    expect(await pending).toMatchObject({ ok: false, error: { code: "authorization_request_invalid" } })
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // (d) never handed over: the kept window is gone and the frame's own window is blocked
    r = await runtime()
    r.unlock()
    r.window.open.mockImplementation((() => null) as unknown as Parameters<typeof r.window.open.mockImplementation>[0])
    w = r.makeWindow()
    pending = r.rpc("reveal", { items: await login(r, { "": "public-d" }) }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    w.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
    await r.clickFrameCard()
    expect(await pending).toMatchObject({ ok: false, error: { code: "authorization_popup_blocked" } })
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // (d2) never handed over: the frame's own window closes before it ever announces itself
    r = await runtime()
    r.unlock()
    w = r.makeWindow()
    pending = r.rpc("reveal", { items: await login(r, { "": "public-d2" }) }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    w.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
    await r.clickFrameCard()
    r.opened[0].popup.closed = true
    expect(await pending).toMatchObject({ ok: false, error: { code: "authorization_window_closed" } })
    expect(r.opened[0].posted).toHaveLength(0)
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // (e) never handed over: the person cancels the frame card, or the vault locks while it waits
    for (const ending of ["cancel", "lock"] as const) {
      r = await runtime()
      r.unlock()
      w = r.makeWindow()
      pending = r.rpc("reveal", { items: await login(r, { "": "public-e" }) }, w.id)
      await w.next()
      w.approve({ kind: "confirmed" })
      w.popup.closed = true
      await vi.waitFor(() => expect(r.uiShows()).toBe(1), { timeout: 3_000, interval: 10 })
      if (ending === "cancel") r.cardButtons().filter((node) => node.classList.contains("secondary")).at(-1)!.click()
      else expect((await r.rpc("lock", {})).ok).toBe(true)
      const reply = await pending
      expect(reply.ok, ending).toBe(false)
      expect(r.window.open, ending).not.toHaveBeenCalled()
      r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()
    }
  }, 30_000)

  it("F12 [residual] 'handed over' means posted to the window that announced itself, not shown: a window that then closes without showing still completes", async () => {
    const r = await runtime()
    r.unlock()
    const items = await login(r, { "": "public-never-shown" })
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    // The real window stops listening when its 5 s wait ends (window probe W9); an announcement already in flight
    // still draws the rows, which it then drops, and it closes 1.5 s later.
    expect((await w.next()).kind).toBe("protected-display")
    w.popup.closed = true
    expect(await pending).toMatchObject({ ok: true, result: { completed: true } })
  })

  it("F9 a newer request ends a display, in the kept approving window and in a window the frame opened itself", async () => {
    const r = await runtime()
    r.unlock()
    // Kept window: the display holds the frame's single interactive slot too.
    const w1 = r.makeWindow()
    const showing = r.rpc("reveal", { items: await login(r, { "": "public-first-secret" }) }, w1.id)
    await w1.next()
    w1.approve({ kind: "confirmed" })
    expect((await w1.next()).rows).toEqual([{ value: "public-first-secret" }])
    const w2 = r.makeWindow()
    const newer = r.rpc("reveal", { items: [await r.item("PUBLIC_OTHER", "public-second-secret")] }, w2.id)
    expect(await w2.next()).toMatchObject({ passkey: "none", keepOpen: true })
    // Two secrets are never on screen at once: the first window closes as the next approval starts.
    expect(w1.popup.close).toHaveBeenCalled()
    expect(await showing).toMatchObject({ ok: true, result: { completed: true } })
    w2.approve({ kind: "confirmed" })
    expect((await w2.next()).rows).toEqual([{ value: "public-second-secret" }])
    expect((await r.rpc("lock", {})).ok).toBe(true)
    expect(await newer).toMatchObject({ ok: true })

    // Frame-opened window: the display holds the slot, so the next request's card closes it.
    r.unlock()
    const w3 = r.makeWindow()
    const third = r.rpc("reveal", { items: [await r.item("PUBLIC_THIRD", "public-third-secret")] }, w3.id)
    await w3.next()
    w3.approve({ kind: "confirmed" })
    w3.popup.closed = true
    await vi.waitFor(() => expect(r.uiShows()).toBeGreaterThan(0), { timeout: 3_000, interval: 10 })
    await r.clickFrameCard()
    const fresh = r.opened[0]
    expect((await fresh.next()).rows).toEqual([{ value: "public-third-secret" }])
    const w4 = r.makeWindow()
    const fourth = r.rpc("reveal", { items: [await r.item("PUBLIC_FOURTH", "public-fourth-secret")] }, w4.id)
    expect(await w4.next()).toMatchObject({ passkey: "none", keepOpen: true })
    expect(await third).toMatchObject({ ok: true, result: { completed: true } })
    expect(fresh.popup.close).toHaveBeenCalled()
    w4.fail("authorization_cancelled")
    expect((await fourth).ok).toBe(false)
  }, 15_000)
})

function dispatchError(w: { fail: (code: string) => void }): void { w.fail("authorization_request_invalid") }

describe("PR50 one-touch signing (C) at the real RPC boundary", () => {
  it("S1 its own unlock is its passkey: the same window id then gets a passkey-free review, and the click signs", async () => {
    const r = await runtime()
    const sign = r.signRequest("one touch")
    const w = r.makeWindow()
    const pending = r.rpc("sign", sign.payload, w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    const review = await w.next()
    expect(review.passkey).toBe("none")
    expect(review.keepOpen).toBeUndefined()
    expect(review.prompt?.challenge).toBeUndefined()
    expect(review.prompt?.review ?? review.prompt?.body).toBeDefined()
    expect(pending.settled()).toBe(false)
    w.approve({ kind: "confirmed" })
    const reply = await pending
    expect(reply.ok, JSON.stringify(reply)).toBe(true)
    expect(r.validSignature(reply, sign.digest)).toBe(true)
    expect(r.nav.credentials.get).not.toHaveBeenCalled()
  })

  it("S2 another operation's unlock between this unlock and the click voids the click", async () => {
    const r = await runtime()
    const sign = r.signRequest("superseded by another unlock")
    const w = r.makeWindow()
    const pending = r.rpc("sign", sign.payload, w.id)
    await w.next()
    w.approve(UNLOCK)
    expect((await w.next()).passkey).toBe("none")
    const other = r.unlock(0x77)
    w.approve({ kind: "confirmed" })
    const reply = await pending
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(reply.result).toBeUndefined()
    expect(w.popup.close).toHaveBeenCalled()
    // The other session is neither used nor locked by the refused request.
    expect(other).toEqual(new Uint8Array(32).fill(0x77))
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
  })

  it("S3 a click after the unlock window expired is refused even if the opener's lock timer has not fired yet", async () => {
    const r = await runtime()
    const sign = r.signRequest("late click")
    const w = r.makeWindow()
    const pending = r.rpc("sign", sign.payload, w.id)
    await w.next()
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
    w.approve(UNLOCK)
    let review: AuthRequest | undefined
    for (let step = 0; step < 200 && !review; step += 1) { w.ready(); review = w.requests()[1]; if (!review) await tick() }
    expect(review?.passkey).toBe("none")
    // A throttled background tab: the clock passes the 300 s window but no timer callback runs.
    vi.setSystemTime(Date.now() + 301_000)
    w.approve({ kind: "confirmed" })
    for (let step = 0; step < 200 && !pending.settled(); step += 1) await tick()
    const reply = await pending
    expect(reply.ok).toBe(false)
    expect(reply.result).toBeUndefined()
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
  })

  it("S4 a lock from a sibling frame closes the review, and a click that arrives afterwards does nothing", async () => {
    const r = await runtime()
    const sign = r.signRequest("sibling lock")
    const w = r.makeWindow()
    const pending = r.rpc("sign", sign.payload, w.id)
    await w.next()
    w.approve(UNLOCK)
    expect((await w.next()).passkey).toBe("none")
    // Exactly what this frame's lock-channel receiver runs for a same-scope lock message.
    r.lifecycle.lockVault({ broadcast: false, reason: "manual-lock" })
    w.approve({ kind: "confirmed" })
    const reply = await pending
    expect(reply).toMatchObject({ ok: false, error: { code: "vault_operation_aborted" } })
    expect(reply.result).toBeUndefined()
    expect(w.popup.close).toHaveBeenCalled()
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
  })

  it("S5 one request's unlock never makes another request's click count", async () => {
    const r = await runtime()
    // (a) After A finished with its own unlock, the vault is still open: B is asked for fresh UV, not a click.
    const a = r.signRequest("request A")
    const wa = r.makeWindow()
    const first = r.rpc("sign", a.payload, wa.id)
    await wa.next()
    wa.approve(UNLOCK)
    expect((await wa.next()).passkey).toBe("none")
    wa.approve({ kind: "confirmed" })
    expect(r.validSignature(await first, a.digest)).toBe(true)
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
    const b = r.signRequest("request B")
    const wb = r.makeWindow()
    const second = r.rpc("sign", b.payload, wb.id)
    const asked = await wb.next()
    expect(asked.passkey).toBe("uv")
    expect(asked.keepOpen).toBeUndefined()
    expect(typeof asked.prompt?.challenge).toBe("string")
    wb.fail("authorization_cancelled")
    expect((await second).ok).toBe(false)

    // (b) D arrives while C's review is waiting for its click: C is superseded and throws its unlock away,
    // which also ends D. Neither signs, and D's window is never asked for a passkey-free confirmation.
    r.lifecycle.lockVault()
    const c = r.signRequest("request C")
    const wc = r.makeWindow()
    const third = r.rpc("sign", c.payload, wc.id)
    await wc.next()
    wc.approve(UNLOCK)
    expect((await wc.next()).passkey).toBe("none")
    const d = r.signRequest("request D")
    const wd = r.makeWindow()
    const fourth = r.rpc("sign", d.payload, wd.id)
    const [replyC, replyD] = await Promise.all([third, fourth])
    wc.approve({ kind: "confirmed" })
    for (let attempt = 0; attempt < 20; attempt += 1) { wd.ready(); await tick() }
    expect(replyC.ok).toBe(false)
    expect(replyC.result).toBeUndefined()
    expect(replyD.ok).toBe(false)
    expect(replyD.result).toBeUndefined()
    expect(wd.requests().filter((request) => request.passkey === "none")).toHaveLength(0)
    expect(wc.popup.close).toHaveBeenCalled()
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
  })

  it("S6 an already unlocked vault asks fresh UV, and Strict keeps unlock then UV in two windows", async () => {
    const r = await runtime()
    r.unlock()
    const unlocked = r.signRequest("already unlocked")
    const w = r.makeWindow()
    const pending = r.rpc("sign", unlocked.payload, w.id)
    const asked = await w.next()
    expect(asked).toMatchObject({ passkey: "uv" })
    expect(asked.keepOpen).toBeUndefined()
    w.approve({ kind: "confirmed" })
    expect(r.validSignature(await pending, unlocked.digest)).toBe(true)

    r.lifecycle.lockVault()
    r.setPolicy(true)
    const strict = r.signRequest("strict and locked")
    const s = r.makeWindow()
    const strictPending = r.rpc("sign", strict.payload, s.id)
    const unlockAsk = await s.next()
    expect(unlockAsk.passkey).toBe("unlock")
    expect(unlockAsk.keepOpen).toBeUndefined()
    s.approve(UNLOCK)
    // Not kept: the frame closes the unlocking window and asks again from its own card.
    await vi.waitFor(() => expect(s.popup.close).toHaveBeenCalled(), { timeout: 3_000, interval: 10 })
    await tick(700)
    const buttons = (r.dom.body.querySelectorAll("button") as Array<{ click(): void; disabled: boolean; classList: { contains(name: string): boolean } }>)
    buttons.filter((node) => !node.classList.contains("secondary")).at(-1)!.click()
    await vi.waitFor(() => expect(r.opened).toHaveLength(1), { timeout: 3_000, interval: 10 })
    const uvAsk = await r.opened[0].next()
    expect(uvAsk.passkey).toBe("uv")
    expect(typeof uvAsk.prompt?.challenge).toBe("string")
    r.opened[0].approve({ kind: "confirmed" })
    expect(r.validSignature(await strictPending, strict.digest)).toBe(true)
  })

  it("S8 a request that fails after its unlock dismisses the kept window and locks again", async () => {
    const r = await runtime()
    const forged = r.signRequest("forged daemon signature", { key: new Uint8Array(32).fill(0x55) })
    const w = r.makeWindow()
    const pending = r.rpc("sign", forged.payload, w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    const reply = await pending
    expect(reply.ok).toBe(false)
    expect(reply.result).toBeUndefined()
    expect(w.requests()).toHaveLength(1)
    expect(w.dismissed()).toBe(true)
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
  })
})
