// The frame's notAfter and a display ended by a newer request, from the independent PR50 review probes.
// The REAL main.ts frame (RPC, lifecycle, operationUi) against scripted authorization windows.
// Pure Node: no browser, no passkey (credentials.get throws), no clipboard use in this file.
// Every key, root, secret and value is public synthetic test data.
import { afterEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 30_000 })
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
type AuthRequest = { passkey?: string; keepOpen?: true; kind?: string; name?: string; wrapMeta?: string; notAfter?: number
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

afterEach(async () => {
  vi.useRealTimers()
  const lifecycle = await import("./vaultLifecycle")
  lifecycle.resetVaultSessionForTests()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** A reveal whose rows are on screen in the kept approving window. */
async function showing(r: R, name: string, value: string, options: { locked?: boolean } = {}) {
  const w = r.makeWindow()
  const pending = r.rpc("reveal", { items: [await r.item(name, value)] }, w.id)
  expect(await w.next()).toMatchObject({ passkey: options.locked ? "unlock" : "none", keepOpen: true })
  w.approve(options.locked ? UNLOCK : { kind: "confirmed" })
  expect((await w.next()).rows).toEqual([{ value }])
  expect(w.popup.close).not.toHaveBeenCalled()
  return { w, pending }
}

const lockedEvents = (r: R): number => (r.frameSurface().match(/"state":"locked"/g) ?? []).length

/** The frozen-page path: the kept window is gone, the frame card is clicked, a window this frame opened shows the rows. */
async function showingInFreshWindow(r: R, name: string, value: string) {
  const w = r.makeWindow()
  const pending = r.rpc("reveal", { items: [await r.item(name, value)] }, w.id)
  expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
  w.approve(UNLOCK)
  w.popup.closed = true
  const cards = r.uiShows()
  await vi.waitFor(() => expect(r.uiShows()).toBe(cards + 1), { timeout: 8_000, interval: 10 })
  await r.clickFrameCard()
  const fresh = r.opened.at(-1)!
  const shown = await fresh.next()
  expect(shown.rows).toEqual([{ value }])
  return { w: fresh, pending, shown }
}

describe("0e3f: the frame tells the window when the session ends", () => {
  it("G1 notAfter is this session's own end, for a self-unlocked reveal, an already unlocked vault, Strict, and the frame-opened window", async () => {
    // self-unlocked: the end is that unlock's deadline, within the 300 s policy window
    let r = await runtime()
    let w = r.makeWindow()
    let pending = r.rpc("reveal", { items: [await r.item("PUBLIC_A", "public-a")] }, w.id)
    await w.next()
    w.approve(UNLOCK)
    let shown = await w.next()
    expect(shown.notAfter).toBe(r.lifecycle.vaultStatus().expiresAt)
    expect(shown.notAfter! - Date.now()).toBeGreaterThan(290_000)
    expect(shown.notAfter! - Date.now()).toBeLessThanOrEqual(300_000)
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // already unlocked a while ago: the end is that older session's deadline, not five minutes from now
    r = await runtime()
    vi.useFakeTimers({ toFake: ["Date"] })
    r.unlock()
    const sessionEnd = r.lifecycle.vaultStatus().expiresAt!
    vi.setSystemTime(Date.now() + 240_000)
    w = r.makeWindow()
    pending = r.rpc("reveal", { items: [await r.item("PUBLIC_B", "public-b")] }, w.id)
    await w.next()
    w.approve({ kind: "confirmed" })
    shown = await w.next()
    expect(shown.notAfter).toBe(sessionEnd)
    expect(shown.notAfter! - Date.now()).toBeLessThanOrEqual(60_000)
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
    vi.useRealTimers()
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // Strict
    r = await runtime()
    r.setPolicy(true)
    w = r.makeWindow()
    pending = r.rpc("reveal", { items: [await r.item("PUBLIC_C", "public-c")] }, w.id)
    await w.next()
    w.approve(UNLOCK)
    shown = await w.next()
    expect(shown.notAfter).toBe(r.lifecycle.vaultStatus().expiresAt)
    expect(typeof shown.rows![0].copyChallenge).toBe("string")
    w.approve({ kind: "displayed" })
    expect(await pending).toMatchObject({ ok: true })
    r.lifecycle.resetVaultSessionForTests(); vi.unstubAllGlobals()

    // the window this frame opens itself gets the same absolute end
    r = await runtime()
    const fresh = await showingInFreshWindow(r, "PUBLIC_D", "public-d")
    expect(fresh.shown.notAfter).toBe(r.lifecycle.vaultStatus().expiresAt)
    expect(Object.keys(fresh.shown).sort()).toEqual(["kind", "name", "notAfter", "rows", "wrapMeta"])
    fresh.w.approve({ kind: "displayed" })
    expect(await fresh.pending).toMatchObject({ ok: true })
  })

  it("G1b a session that has already ended never reaches a window: no rows, no request without notAfter", async () => {
    const r = await runtime()
    vi.useFakeTimers({ toFake: ["Date"] })
    r.unlock()
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items: [await r.item("PUBLIC_E", "public-e")] }, w.id)
    expect(await w.next()).toMatchObject({ passkey: "none", keepOpen: true })
    // The clock passes the session's end while the approval card is up; no lock timer has run.
    vi.setSystemTime(Date.now() + 301_000)
    w.approve({ kind: "confirmed" })
    const reply = await pending
    expect(reply.ok).toBe(false)
    expect(w.requests()).toHaveLength(1)
    expect(JSON.stringify(w.posted)).not.toContain("public-e")
    expect(r.window.open).not.toHaveBeenCalled()
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
    vi.useRealTimers()
  })
})

describe("0e3f: a display ended by a newer request", () => {
  it("G2 kept window, self-unlocked: a normal end. The vault stays open, nothing is locked, and the newer request needs no passkey", async () => {
    const r = await runtime()
    const first = await showing(r, "PUBLIC_FIRST", "public-first-secret", { locked: true })
    const before = r.lifecycle.vaultStatus().expiresAt!
    const locksBefore = lockedEvents(r)
    const w2 = r.makeWindow()
    const newer = r.rpc("reveal", { items: [await r.item("PUBLIC_SECOND", "public-second-secret")] }, w2.id)
    expect(await w2.next()).toMatchObject({ passkey: "none", keepOpen: true })
    expect(first.w.popup.close).toHaveBeenCalled()
    expect(await first.pending).toMatchObject({ ok: true, result: { completed: true } })
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
    expect(lockedEvents(r)).toBe(locksBefore)
    // As after Done, the completed reveal renews the session.
    expect(r.lifecycle.vaultStatus().expiresAt!).toBeGreaterThanOrEqual(before)
    w2.approve({ kind: "confirmed" })
    expect((await w2.next()).rows).toEqual([{ value: "public-second-secret" }])
    w2.approve({ kind: "displayed" })
    expect(await newer).toMatchObject({ ok: true })
  })

  it("G3 frame-opened window, self-unlocked: also a normal end. The vault stays open and the newer request needs no passkey", async () => {
    const r = await runtime()
    const first = await showingInFreshWindow(r, "PUBLIC_FIRST", "public-first-secret")
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
    const w2 = r.makeWindow()
    const newer = r.rpc("reveal", { items: [await r.item("PUBLIC_SECOND", "public-second-secret")] }, w2.id)
    expect(await w2.next()).toMatchObject({ passkey: "none", keepOpen: true })
    expect(first.w.popup.close).toHaveBeenCalled()
    expect(await first.pending).toMatchObject({ ok: true, result: { completed: true } })
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
    w2.approve({ kind: "confirmed" })
    expect((await w2.next()).rows).toEqual([{ value: "public-second-secret" }])
    w2.approve({ kind: "displayed" })
    expect(await newer).toMatchObject({ ok: true })
  })

  it("G4 Strict, kept window, self-unlocked: also a normal end, and the session is not renewed", async () => {
    const r = await runtime()
    r.setPolicy(true)
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items: [await r.item("PUBLIC_FIRST", "public-first-secret")] }, w.id)
    await w.next()
    w.approve(UNLOCK)
    expect((await w.next()).rows?.[0].value).toBe("public-first-secret")
    const before = r.lifecycle.vaultStatus().expiresAt!
    const w2 = r.makeWindow()
    const newer = r.rpc("reveal", { items: [await r.item("PUBLIC_SECOND", "public-second-secret")] }, w2.id)
    // Unlocked and Strict: the newer reveal asks its own fresh UV.
    expect(await w2.next()).toMatchObject({ passkey: "uv", keepOpen: true })
    expect(await pending).toMatchObject({ ok: true, result: { completed: true } })
    expect(r.lifecycle.vaultStatus().state).toBe("unlocked")
    expect(r.lifecycle.vaultStatus().expiresAt).toBe(before)
    w2.fail("authorization_cancelled")
    expect((await newer).ok).toBe(false)
  })

  it("G5 before the hand-over a newer request is still a failure, and a self-unlocked reveal still locks on the way out", async () => {
    const r = await runtime()
    const w = r.makeWindow()
    const pending = r.rpc("reveal", { items: [await r.item("PUBLIC_FIRST", "public-first-secret")] }, w.id)
    expect(await w.next()).toMatchObject({ passkey: "unlock", keepOpen: true })
    w.approve(UNLOCK)
    // The kept window stays open but never announces itself again: nothing is handed over.
    await vi.waitFor(() => expect(r.lifecycle.vaultStatus().state).toBe("unlocked"), { timeout: 5_000, interval: 10 })
    await tick(100)
    const w2 = r.makeWindow()
    const newer = r.rpc("reveal", { items: [await r.item("PUBLIC_SECOND", "public-second-secret")] }, w2.id)
    const [done, second] = await Promise.all([pending, newer])
    expect(done.ok).toBe(false)
    expect(done.result).toBeUndefined()
    expect(w.requests()).toHaveLength(1)
    expect(JSON.stringify(w.posted)).not.toContain("public-first-secret")
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
    expect(second.ok).toBe(false)
  })
})

describe("0e3f: the normal end never keeps a vault open that should lock", () => {
  it("G6 after the hand-over an explicit lock, an auto-lock, a sibling's lock and another root each leave the vault locked", async () => {
    for (const ending of ["lock RPC", "auto-lock", "sibling lock", "seal names another root"] as const) {
      const r = await runtime()
      if (ending === "auto-lock") vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
      const w = r.makeWindow()
      const pending = r.rpc("reveal", { items: [await r.item("PUBLIC_FIRST", "public-first-secret")] }, w.id)
      await w.next()
      w.approve(UNLOCK)
      let shown: AuthRequest | undefined
      for (let step = 0; step < 400 && !shown; step += 1) { w.ready(); shown = w.requests()[1]; if (!shown) await tick() }
      expect(shown?.rows, ending).toEqual([{ value: "public-first-secret" }])
      expect(r.lifecycle.vaultStatus().state, ending).toBe("unlocked")
      let other: Promise<Reply> | undefined
      if (ending === "lock RPC") expect((await r.rpc("lock", {})).ok).toBe(true)
      else if (ending === "auto-lock") await vi.advanceTimersByTimeAsync(300_001)
      else if (ending === "sibling lock") r.lifecycle.lockVault({ broadcast: false, reason: "manual-lock" })
      else other = r.rpc("seal", { name: "PUBLIC_NEW", kind: "static", inputMode: "parent-value", value: "public synthetic value", wrapMeta: await r.makeRoot() })
      for (let step = 0; step < 400 && !pending.settled(); step += 1) await tick()
      expect(await pending, ending).toMatchObject({ ok: true, result: { completed: true } })
      expect(w.popup.close, ending).toHaveBeenCalled()
      expect(r.lifecycle.vaultStatus().state, ending).toBe("locked")
      await expect(r.lifecycle.withUnlockedVmk(() => "forbidden"), ending).rejects.toThrow("vault-locked")
      if (other) expect((await other).ok, ending).toBe(false)
      vi.useRealTimers()
      r.lifecycle.resetVaultSessionForTests()
      vi.unstubAllGlobals()
    }
  })

  it("G7 a lock that lands while a newer request is taking the slot still wins: the vault ends locked", async () => {
    const r = await runtime()
    const first = await showing(r, "PUBLIC_FIRST", "public-first-secret", { locked: true })
    const w2 = r.makeWindow()
    const newer = r.rpc("reveal", { items: [await r.item("PUBLIC_SECOND", "public-second-secret")] }, w2.id)
    // Same turn: the newer request supersedes the display and the vault is locked before anything else runs.
    r.lifecycle.lockVault({ broadcast: false, reason: "manual-lock" })
    const [done, second] = await Promise.all([first.pending, newer])
    expect(done).toMatchObject({ ok: true, result: { completed: true } })
    expect(first.w.popup.close).toHaveBeenCalled()
    expect(r.lifecycle.vaultStatus().state).toBe("locked")
    await expect(r.lifecycle.withUnlockedVmk(() => "forbidden")).rejects.toThrow("vault-locked")
    expect(JSON.stringify(w2.posted)).not.toContain("public-second-secret")
    if (second.ok) throw new Error("the newer request must not complete on a locked vault without its own unlock")
  })
})
