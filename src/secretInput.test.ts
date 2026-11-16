// Typing a protected secret's values in the secure window: the request rules,
// the window channel, the generator and the input card. Pure Node with a small
// DOM stand-in; no passkey, no clipboard. Every value is public synthetic data.
import { afterEach, describe, expect, it, vi } from "vitest"
import webVectors from "./fixtures/web-generate-vectors.json"
import { parseSealRequest } from "./sealRequest"
import { generateSecretValue, parseGenerateRecipe, GENERATE_SYMBOLS, type GenerateRecipe } from "./secretGenerate"
import { decodeSecretInputRequest, parseSecretInputResult, SECRET_INPUT_MAX_CHARS, type SecretInputWindowRequest } from "./secretInputChannel"
import { FakeElement, installCardDocument } from "./testDom"

/** xorshift32, one low byte per step: the stream the Web vectors were made with. */
function stream(seed: number): (bytes: Uint8Array) => void {
  let state = seed >>> 0 || 1
  return (bytes) => {
    for (let index = 0; index < bytes.length; index += 1) {
      state ^= state << 13; state >>>= 0
      state ^= state >>> 17
      state ^= state << 5; state >>>= 0
      bytes[index] = state & 0xff
    }
  }
}

const PASSWORD: GenerateRecipe = { type: "password", length: 24, digits: true, symbols: true, noLookalikes: false }
const wrapMeta = JSON.stringify({ v: 1, copies: [] })
const seal = (overrides: Record<string, unknown> = {}, fields: unknown[] = [
  { record: "GITHUB_LOGIN", label: "password", required: true, generate: PASSWORD },
  { record: "GITHUB_LOGIN.username", label: "username", required: true },
]) => ({ kind: "static", inputMode: "secure-window", secret: "GITHUB_LOGIN", mode: "create", wrapMeta, fields, ...overrides })
const code = (run: () => unknown): string | undefined => {
  try { run() } catch (error) { return (error as { code?: string }).code ?? "thrown" }
  return undefined
}

describe("generator: the Web Vaults rules", () => {
  it("reproduces every Web generator vector from the same random stream", () => {
    expect(webVectors.cases).toHaveLength(48)
    for (const vector of webVectors.cases) {
      expect(generateSecretValue(vector.recipe as GenerateRecipe, stream(vector.seed)), JSON.stringify(vector.recipe)).toBe(vector.value)
    }
  })

  it("draws again rather than folding a byte above the last whole alphabet (rejection sampling)", () => {
    // A first buffer of 0xff bytes is all above the limit for these alphabets: it adds nothing.
    for (const recipe of [PASSWORD, { ...PASSWORD, digits: false, symbols: false, noLookalikes: true }] as GenerateRecipe[]) {
      const rest = stream(7)
      let first = true
      const source = (bytes: Uint8Array): void => { if (first) { first = false; bytes.fill(0xff) } else rest(bytes) }
      expect(generateSecretValue(recipe, source)).toBe(generateSecretValue(recipe, stream(7)))
    }
  })

  it("puts every chosen class in, and only the chosen alphabet", () => {
    const lookalikes = /[0O1lI]/
    for (let round = 0; round < 200; round += 1) {
      const recipe = { type: "password" as const, length: 8 + (round % 93), digits: round % 2 === 0, symbols: round % 3 !== 0, noLookalikes: round % 5 === 0 }
      const value = generateSecretValue(recipe)
      expect(value).toHaveLength(recipe.length)
      expect(value).toMatch(/[a-z]/)
      expect(value).toMatch(/[A-Z]/)
      expect(/[0-9]/.test(value)).toBe(recipe.digits)
      expect([...value].some((char) => GENERATE_SYMBOLS.includes(char))).toBe(recipe.symbols)
      if (recipe.noLookalikes) expect(value).not.toMatch(lookalikes)
      expect(value).toMatch(/^[A-Za-z0-9!#$%&*+\-.:=?@^_~]+$/)
    }
    expect(generateSecretValue({ type: "hex", bytes: 16 })).toMatch(/^[0-9a-f]{32}$/)
    expect(generateSecretValue({ type: "base64", bytes: 64 })).toMatch(/^[A-Za-z0-9+/]{86}==$/)
  })

  it("takes a recipe exactly: the Web shape and limits, nothing else", () => {
    expect(parseGenerateRecipe(PASSWORD)).toEqual(PASSWORD)
    expect(parseGenerateRecipe({ type: "base64", bytes: 16 })).toEqual({ type: "base64", bytes: 16 })
    for (const bad of [
      null, [], "password", { type: "pin", length: 8 },
      { ...PASSWORD, length: 7 }, { ...PASSWORD, length: 101 }, { ...PASSWORD, length: 24.5 }, { ...PASSWORD, digits: "yes" },
      { ...PASSWORD, extra: true }, { type: "password", length: 24, digits: true, symbols: true },
      { type: "hex", bytes: 15 }, { type: "hex", bytes: 65 }, { type: "hex", bytes: 32, length: 8 }, { type: "base64" },
    ]) expect(() => parseGenerateRecipe(bad), JSON.stringify(bad)).toThrow()
    expect(() => generateSecretValue({ ...PASSWORD, length: 101 })).toThrow()
  })
})

describe("seal request: inputMode secure-window (contract v1.1)", () => {
  it("parses the contract's example, keeping each row's recipe", () => {
    expect(parseSealRequest(seal())).toEqual({
      kind: "static", inputMode: "secure-window", secret: "GITHUB_LOGIN", mode: "create", wrapMeta,
      fields: [
        { record: "GITHUB_LOGIN", label: "password", required: true, generate: PASSWORD },
        { record: "GITHUB_LOGIN.username", label: "username", required: true },
      ],
    })
    // Edit: a saved field may stay empty; a single value is labelled "value".
    expect(parseSealRequest(seal({ mode: "edit" }, [{ record: "GITHUB_LOGIN", label: "value", required: false }]))).toMatchObject({ mode: "edit", secret: "GITHUB_LOGIN" })
  })

  it("holds 1 to 32 fields", () => {
    const fields = (count: number) => Array.from({ length: count }, (_unused, index) => index === 0
      ? { record: "GITHUB_LOGIN", label: "value", required: true }
      : { record: `GITHUB_LOGIN.f${index}`, label: `f${index}`, required: true })
    expect((parseSealRequest(seal({}, fields(32))) as { fields: unknown[] }).fields).toHaveLength(32)
    expect(code(() => parseSealRequest(seal({}, fields(33))))).toBe("invalid_payload")
    expect(code(() => parseSealRequest(seal({}, [])))).toBe("invalid_payload")
  })

  it("refuses anything outside the contract, before any window", () => {
    const row = (extra: Record<string, unknown>) => [{ record: "GITHUB_LOGIN", label: "password", required: true, ...extra }]
    const cases: Array<[string, unknown]> = [
      ["a parent value", seal({ value: "public" })],
      ["an unknown key", seal({ name: "GITHUB_LOGIN" })],
      ["no wrapMeta", seal({ wrapMeta: undefined })],
      ["a bad secret name", seal({ secret: "1BAD" })],
      ["another mode", seal({ mode: "replace" })],
      ["an unknown row key", seal({}, row({ value: "public" }))],
      ["a row of another secret", seal({}, [{ record: "OTHER.password", label: "password", required: true }])],
      ["a lookalike secret", seal({}, [{ record: "GITHUB_LOGINX", label: "password", required: true }])],
      ["a bad field name", seal({}, [{ record: "GITHUB_LOGIN.Bad", label: "Bad", required: true }])],
      ["a label that is not its record", seal({}, [{ record: "GITHUB_LOGIN.username", label: "password", required: true }])],
      ["a bad label", seal({}, row({ label: "Pass word" }))],
      ["a repeated record", seal({}, [...row({}), ...row({})])],
      ["a repeated label", seal({}, [...row({}), { record: "GITHUB_LOGIN.password", label: "password", required: true }])],
      ["required not a boolean", seal({}, row({ required: "yes" }))],
      ["an optional field on create", seal({}, row({ required: false }))],
      ["a recipe out of range", seal({}, row({ generate: { ...PASSWORD, length: 101 } }))],
      ["a recipe with extra keys", seal({}, row({ generate: { type: "hex", bytes: 32, noLookalikes: true } }))],
    ]
    for (const [name, payload] of cases) expect(code(() => parseSealRequest(payload)), name).toBe("invalid_payload")
  })
})

describe("the window channel", () => {
  const request = (overrides: Record<string, unknown> = {}, rows: unknown[] = [
    { label: "password", required: false, isDefault: true, generate: PASSWORD },
    { label: "username", required: false, isDefault: false },
    { label: "totp", required: true, isDefault: false },
  ]): Record<string, unknown> => ({ kind: "protected-input", name: "GITHUB_LOGIN", mode: "edit", rows, notAfter: Date.now() + 60_000, ...overrides })

  it("the window takes only well-formed rows: strict keys, at most 32, valid labels and recipes, one default", () => {
    expect(decodeSecretInputRequest(request())).toMatchObject({ kind: "protected-input", mode: "edit", rows: [{ label: "password", isDefault: true, generate: PASSWORD }, { label: "username" }, { label: "totp", required: true }] })
    const many = Array.from({ length: 33 }, (_unused, index) => ({ label: `f${index}`, required: true, isDefault: false }))
    const cases: Array<[string, Record<string, unknown>]> = [
      ["an unknown key", request({ wrapMeta })],
      ["33 rows", request({ mode: "create" }, many)],
      ["no rows", request({}, [])],
      ["a bad name", request({ name: "two words" })],
      ["a bad mode", request({ mode: "delete" })],
      ["a bad notAfter", request({ notAfter: "later" })],
      ["a markup label", request({}, [{ label: "<b>x</b>", required: true, isDefault: false }])],
      ["a repeated label", request({}, [{ label: "a", required: true, isDefault: false }, { label: "a", required: true, isDefault: false }])],
      ["a row with a value", request({}, [{ label: "a", required: true, isDefault: false, value: "public" }])],
      ["flags that are not booleans", request({}, [{ label: "a", required: 1, isDefault: false }])],
      ["an optional row on create", request({ mode: "create" })],
      ["two defaults", request({}, [{ label: "a", required: true, isDefault: true }, { label: "b", required: true, isDefault: true }])],
      ["a bad recipe", request({}, [{ label: "a", required: true, isDefault: false, generate: { type: "hex", bytes: 8 } }])],
    ]
    for (const [name, value] of cases) expect(code(() => decodeSecretInputRequest(value)), name).toBe("invalid_payload")
  })

  it("the frame takes only an answer that fits the rows it sent", () => {
    const sent = decodeSecretInputRequest(request()) as SecretInputWindowRequest
    const answer = (values: unknown[], extra: Record<string, unknown> = {}) => ({ kind: "entered", values, ...extra })
    expect(parseSecretInputResult(answer([
      { value: "public-generated", generated: true }, { value: null, generated: false }, { value: "public-otp", generated: false },
    ]), sent).values).toEqual([{ value: "public-generated", generated: true }, { value: null, generated: false }, { value: "public-otp", generated: false }])
    const cases: Array<[string, Record<string, unknown>]> = [
      ["another kind", { kind: "displayed" }],
      ["an extra key", answer([{ value: "a", generated: false }, { value: null, generated: false }, { value: "b", generated: false }], { rows: [] })],
      ["too few values", answer([{ value: "a", generated: false }, { value: "b", generated: false }])],
      ["a required value missing", answer([{ value: "a", generated: false }, { value: "b", generated: false }, { value: null, generated: false }])],
      ["an empty value", answer([{ value: "", generated: false }, { value: null, generated: false }, { value: "b", generated: false }])],
      ["a value too long", answer([{ value: "x".repeat(SECRET_INPUT_MAX_CHARS + 1), generated: false }, { value: null, generated: false }, { value: "b", generated: false }])],
      ["generated without a recipe", answer([{ value: null, generated: false }, { value: "a", generated: true }, { value: "b", generated: false }])],
      ["an empty value marked generated", answer([{ value: null, generated: true }, { value: null, generated: false }, { value: "b", generated: false }])],
      ["a value entry with extra keys", answer([{ value: "a", generated: false, record: "X" }, { value: null, generated: false }, { value: "b", generated: false }])],
      ["a number for a value", answer([{ value: 7, generated: false }, { value: null, generated: false }, { value: "b", generated: false }])],
    ]
    for (const [name, value] of cases) expect(code(() => parseSecretInputResult(value, sent)), name).toBe("authorization_result_invalid")
    // An edit never saves nothing.
    const edit = decodeSecretInputRequest(request({}, [{ label: "password", required: false, isDefault: true }])) as SecretInputWindowRequest
    expect(code(() => parseSecretInputResult(answer([{ value: null, generated: false }]), edit))).toBe("authorization_result_invalid")
  })
})

describe("the input card in the secure window", () => {
  afterEach(() => { vi.unstubAllGlobals() })

  async function card(input: { mode: "create" | "edit"; rows: Array<{ label: string; required: boolean; isDefault?: boolean; generate?: GenerateRecipe }>; random?: (bytes: Uint8Array) => void }) {
    vi.resetModules()
    const dom = installCardDocument(vi.stubGlobal)
    for (const name of ["HTMLInputElement", "HTMLTextAreaElement"]) vi.stubGlobal(name, FakeElement)
    const { collectSecretValues } = await import("./secretInputUi")
    const controller = new AbortController()
    let outcome: { values?: unknown; error?: Error } | undefined
    const done = collectSecretValues({ name: "GITHUB_LOGIN", ...input, abortSignal: controller.signal })
      .then((values) => { outcome = { values } }, (error: Error) => { outcome = { error } })
    await vi.waitFor(() => expect(dom.body.querySelectorAll("input").length).toBe(input.rows.length))
    const inputs = dom.body.querySelectorAll("input")
    const buttons = () => dom.body.querySelectorAll("button")
    const button = (text: string) => buttons().find((node) => node.textContent === text)!
    const type = (index: number, value: string): void => { inputs[index].value = value; inputs[index].dispatch("input") }
    const reason = () => dom.body.querySelector(".secret-status")!.textContent
    return { dom, inputs, buttons, button, type, reason, controller, done, outcome: () => outcome }
  }

  it("create: Save stays closed, with the reason, until every value is in; the inputs never autofill and are cleared after", async () => {
    const c = await card({ mode: "create", rows: [{ label: "password", required: true, isDefault: true }, { label: "username", required: true }] })
    for (const node of c.inputs) {
      expect(node.type).toBe("password")
      expect([node.getAttribute("autocomplete"), node.getAttribute("spellcheck"), node.getAttribute("autocapitalize"), node.getAttribute("autocorrect")]).toEqual(["new-password", "false", "off", "off"])
      expect(node.getAttribute("placeholder")).toBeNull()
    }
    expect(c.dom.body.textContent).toContain("Enter secret")
    expect(c.dom.body.textContent).toContain("Default")
    expect(c.button("Save").disabled).toBe(true)
    expect(c.reason()).toBe("Fill in every value to save.")
    c.type(0, "public-password")
    expect(c.button("Save").disabled).toBe(true)
    c.type(1, "public-user")
    expect(c.button("Save").disabled).toBe(false)
    expect(c.reason()).toBe("")
    c.button("Save").click()
    await c.done
    expect(c.outcome()).toEqual({ values: [{ value: "public-password", generated: false }, { value: "public-user", generated: false }] })
    expect(c.inputs.map((node) => node.value)).toEqual(["", ""])
    expect(c.dom.body.textContent).not.toContain("public-")
  })

  it("edit: a saved row may stay empty (null, never an empty value), a new row is required, and an edit with nothing typed cannot save", async () => {
    const c = await card({ mode: "edit", rows: [
      { label: "password", required: false, isDefault: true }, { label: "username", required: false }, { label: "totp", required: true },
    ] })
    expect(c.dom.body.textContent).toContain("Change secret")
    expect(c.inputs.map((node) => node.placeholder)).toEqual(["Saved", "Saved", ""])
    expect(c.button("Save").disabled).toBe(true)
    expect(c.reason()).toBe("Fill in the new field to save.")
    c.type(2, "public-otp")
    c.type(0, "public-new-password")
    expect(c.button("Save").disabled).toBe(false)
    c.button("Save").click()
    await c.done
    expect(c.outcome()).toEqual({ values: [{ value: "public-new-password", generated: false }, { value: null, generated: false }, { value: "public-otp", generated: false }] })

    const empty = await card({ mode: "edit", rows: [{ label: "password", required: false, isDefault: true }, { label: "username", required: false }] })
    expect(empty.button("Save").disabled).toBe(true)
    expect(empty.reason()).toBe("Enter a value to change before saving.")
    empty.button("Save").click()
    empty.type(1, "public-user")
    expect(empty.button("Save").disabled).toBe(false)
    empty.type(1, "")
    expect(empty.button("Save").disabled).toBe(true)
    expect(empty.reason()).toBe("Enter a value to change before saving.")
    empty.controller.abort(new Error("public-test-end"))
    await empty.done
    expect(empty.outcome()?.error?.message).toBe("public-test-end")
  })

  it("Generate uses the row's recipe in this window; typing over it makes the value the person's own", async () => {
    const recipe: GenerateRecipe = { type: "password", length: 20, digits: true, symbols: false, noLookalikes: true }
    const c = await card({ mode: "create", random: stream(99), rows: [{ label: "value", required: true, isDefault: true, generate: recipe }] })
    // A single value reads as "Value", with no Default tag.
    expect(c.dom.body.querySelector(".hd-field-label")!.textContent).toBe("Value")
    expect(c.dom.body.textContent).not.toContain("Default")
    expect(c.buttons().filter((node) => node.textContent === "Generate")).toHaveLength(1)
    c.button("Generate").click()
    expect(c.inputs[0].value).toBe(generateSecretValue(recipe, stream(99)))
    const badge = c.dom.body.querySelector(".secret-input-generated") as unknown as { hidden: boolean }
    expect(badge.hidden).toBe(false)
    c.button("Save").click()
    await c.done
    expect(c.outcome()).toEqual({ values: [{ value: generateSecretValue(recipe, stream(99)), generated: true }] })

    const typed = await card({ mode: "create", rows: [{ label: "token", required: true, generate: { type: "hex", bytes: 16 } }, { label: "plain", required: true }] })
    expect(typed.buttons().filter((node) => node.textContent === "Generate")).toHaveLength(1)
    typed.button("Generate").click()
    typed.type(0, `${typed.inputs[0].value}x`)
    typed.type(1, "public-plain")
    typed.button("Save").click()
    await typed.done
    expect((typed.outcome()?.values as Array<{ generated: boolean }>).map((entry) => entry.generated)).toEqual([false, false])
  })

  it("Cancel and an outside end both clear what was typed", async () => {
    const c = await card({ mode: "create", rows: [{ label: "password", required: true }] })
    c.type(0, "public-typed")
    c.button("Cancel").click()
    await c.done
    expect(c.outcome()?.error?.message).toBe("operation-cancelled")
    expect(c.inputs[0].value).toBe("")
    const ended = await card({ mode: "create", rows: [{ label: "password", required: true }] })
    ended.type(0, "public-typed")
    ended.controller.abort(new Error("secure window was closed"))
    await ended.done
    expect(ended.outcome()?.error?.message).toBe("secure window was closed")
    expect(ended.inputs[0].value).toBe("")
    expect(ended.dom.body.textContent).not.toContain("public-typed")
  })
})

describe("arm on focus", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it("a click stays the only click: regaining focus while its activation runs does not enable Confirm again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    vi.resetModules()
    const dom = installCardDocument(vi.stubGlobal)
    const target = new EventTarget()
    const { trackWindowFocus, windowArmingGuard } = await import("./windowArming")
    const { confirmOperationInActiveSlot, rawText } = await import("./operationUi")
    const tracker = trackWindowFocus(target as never, dom.document as never)
    let activations = 0
    const card = confirmOperationInActiveSlot(
      { title: rawText("PUBLIC unlock"), subtitle: rawText("PUBLIC_LOGIN"), body: rawText("public"), confirmLabel: rawText("Continue") },
      new AbortController().signal,
      windowArmingGuard(tracker),
      () => { activations += 1; return new Promise<void>(() => {}) },
    )
    void card.catch(() => {})
    const confirm = () => dom.body.querySelectorAll("button").find((node) => node.textContent === "Continue")!
    await vi.advanceTimersByTimeAsync(1_100)
    expect(confirm().disabled).toBe(false)
    confirm().click()
    expect(activations).toBe(1)
    expect(confirm().disabled).toBe(true)
    // The passkey sheet takes focus, then gives it back.
    dom.document.focused = false
    target.dispatchEvent(new Event("blur"))
    dom.document.focused = true
    target.dispatchEvent(new Event("focus"))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(confirm().disabled).toBe(true)
    confirm().click()
    expect(activations).toBe(1)
  })

  it("Confirm arms only after the window has been visible and focused for 500 ms, and disarms when it loses focus", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] })
    const dom = installCardDocument(vi.stubGlobal)
    const target = new EventTarget()
    const { trackWindowFocus, windowArmingGuard } = await import("./windowArming")
    dom.document.focused = false
    const tracker = trackWindowFocus(target as never, dom.document as never)
    const armed: boolean[] = []
    const lease = windowArmingGuard(tracker)(dom.card as never, { setArmed: (value) => { armed.push(value) } })
    const hint = dom.card.querySelector(".window-focus-hint") as unknown as { hidden: boolean; textContent: string }
    expect(armed.at(-1)).toBe(false)
    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toBe("Click this window to continue.")
    expect(() => lease.assertCurrent()).toThrow()
    dom.document.focused = true
    target.dispatchEvent(new Event("focus"))
    expect(hint.hidden).toBe(true)
    await vi.advanceTimersByTimeAsync(499)
    expect(armed.at(-1)).toBe(false)
    expect(() => lease.assertCurrent()).toThrow()
    await vi.advanceTimersByTimeAsync(1)
    expect(armed.at(-1)).toBe(true)
    await lease.ready
    expect(() => lease.assertCurrent()).not.toThrow()
    dom.document.focused = false
    target.dispatchEvent(new Event("blur"))
    expect(armed.at(-1)).toBe(false)
    expect(() => lease.assertCurrent()).toThrow()
    // Hidden counts as not in front even when focus says otherwise.
    dom.document.focused = true
    dom.document.visibilityState = "hidden"
    dom.document.dispatchEvent(new Event("visibilitychange"))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(armed.at(-1)).toBe(false)
    lease.dispose()
    expect(dom.card.querySelector(".window-focus-hint")).toBeNull()
  })
})
