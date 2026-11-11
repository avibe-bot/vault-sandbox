import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { signingReviewFixtures } from "../design/signingFixtures"
import { setLocale, type Locale } from "./i18n"
import { renderSigningReview, type ReviewField, type ReviewNativeCurrency, type ReviewRequest, type SigningReview } from "./signingReview"

class FakeElement {
  readonly dataset: Record<string, string> = {}
  readonly attributes: Record<string, string> = {}
  readonly children: FakeElement[] = []
  readonly listeners: Array<() => void> = []
  className = ""
  textContent: string | null = ""
  type = ""

  constructor(readonly tagName: string) {}

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes)
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
    if (name === "class") this.className = value
  }

  addEventListener(_type: string, listener: () => void): void {
    this.listeners.push(listener)
  }

  click(): void {
    this.listeners.forEach((listener) => listener())
  }

  /** Descendants carrying any of the classes, in document order. */
  all(...classNames: string[]): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").some((name) => classNames.includes(name)) ? [child] : []),
      ...child.all(...classNames),
    ])
  }

  texts(): string[] {
    return [...(this.textContent ? [this.textContent] : []), ...this.children.flatMap((child) => child.texts())]
  }
}

const EN_NOTICE = "Some content is not decoded; approving it is blind signing."
const ZH_NOTICE = "部分内容未解析，批准即为盲签。"

function render(review: SigningReview, locale: Locale = "en", request?: { session?: string; rows?: FakeElement }): FakeElement {
  setLocale(locale)
  const target = new FakeElement("div")
  renderSigningReview(target as unknown as HTMLElement, review, request as ReviewRequest | undefined)
  return target
}

function fields(review: SigningReview): ReviewField[] {
  return [review.signer, ...review.summary, ...review.details.flatMap((group) => group.fields)]
}

function amount(value: string, native: ReviewNativeCurrency): string | null {
  const review: SigningReview = {
    ...signingReviewFixtures["sol-transfer"], summary: [{ label: "review.field.amount", value, native }], details: [],
  }
  return render(review).all("review-mono")[1].textContent
}

beforeEach(() => {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeElement(tagName),
    createElementNS: (_namespace: string, tagName: string) => new FakeElement(tagName),
  })
})

afterEach(() => {
  setLocale("en")
  vi.unstubAllGlobals()
})

describe("signing review view", () => {
  const cases = Object.entries(signingReviewFixtures)

  it.each(cases)("%s: one summary, at most one notice, one Details section, in both locales", (_name, review) => {
    for (const [locale, notice] of [["en", EN_NOTICE], ["zh", ZH_NOTICE]] as const) {
      const root = render(review, locale)
      expect(root.all("review-summary")).toHaveLength(1)
      expect(root.all("review-summary")[0].children).toHaveLength(1 + review.summary.length)
      expect(root.all("review-details")).toHaveLength(1)
      expect(root.all("review-details")[0].tagName).toBe("details")
      expect(root.all("review-notice")).toHaveLength(review.undecoded ? 1 : 0)
      expect(root.all("review-notice-text").map((node) => node.textContent)).toEqual(review.undecoded ? [notice] : [])
      // The notice sits directly under the headline (and session line), before the
      // signer and every summary row, and never inside the summary or Details.
      expect(root.children[0].children.map((node) => node.className)).toEqual(
        review.undecoded ? ["review-heading", "review-notice", "review-summary", "review-details"] : ["review-heading", "review-summary", "review-details"])
      expect(root.all("review-summary")[0].all("review-notice")).toHaveLength(0)
      expect(root.all("review-details")[0].all("review-notice")).toHaveLength(0)
      expect(root.texts().filter((text) => text === EN_NOTICE || text === ZH_NOTICE)).toHaveLength(review.undecoded ? 1 : 0)
    }
  })

  it.each(cases)("%s: every value is shown exactly and is not a translation binding", (_name, review) => {
    const english = render(review, "en")
    const chinese = render(review, "zh")
    for (const root of [english, chinese]) {
      const shown = root.all("review-mono", "review-raw")
      const expected = fields(review)
      expect(shown).toHaveLength(expected.length)
      shown.forEach((node, index) => {
        const field = expected[index]
        // A native amount adds the readable figure; the exact integer is still there, unchanged.
        if (field.native) expect(node.textContent).toMatch(new RegExp(`^[0-9.]+ [A-Z]+ \\(${field.value} [a-z]+\\)$`))
        else expect(node.textContent).toBe(field.value)
        expect(node.dataset.i18nKey).toBeUndefined()
      })
    }
  })

  it("shows a native amount as the exact decimal figure beside the unchanged integer", () => {
    expect(amount("1500000000", "sol")).toBe("1.5 SOL (1500000000 lamports)")
    expect(amount("10000000000000000", "eth")).toBe("0.01 ETH (10000000000000000 wei)")
    expect(amount("0", "sol")).toBe("0 SOL (0 lamports)")
    expect(amount("0", "eth")).toBe("0 ETH (0 wei)")
    expect(amount("1", "sol")).toBe("0.000000001 SOL (1 lamports)")
    expect(amount("1", "eth")).toBe("0.000000000000000001 ETH (1 wei)")
    expect(amount("1000000000", "sol")).toBe("1 SOL (1000000000 lamports)")
    expect(amount("1000000010", "sol")).toBe("1.00000001 SOL (1000000010 lamports)")
    // u64 maximum and the uint256 maximum: far beyond what a floating-point number can hold exactly.
    expect(amount("18446744073709551615", "sol")).toBe("18446744073.709551615 SOL (18446744073709551615 lamports)")
    expect(amount("9007199254740993", "eth")).toBe("0.009007199254740993 ETH (9007199254740993 wei)")
    const uint256Max = (2n ** 256n - 1n).toString()
    expect(amount(uint256Max, "eth")).toBe(`${uint256Max.slice(0, -18)}.${uint256Max.slice(-18)} ETH (${uint256Max} wei)`)
  })

  it.each(["", "01", "1.5", "-1", "1e9", "0x10", " 1", "١"])("shows a non-canonical native value %j as it is, without a guessed figure", (value) => {
    expect(amount(value, "sol")).toBe(`${value} lamports`)
    expect(amount(value, "eth")).toBe(`${value} wei`)
  })

  it("adds one small session line under the headline only when the request has a session label", () => {
    const review = signingReviewFixtures["evm-unknown"]
    const withSession = render(review, "zh", { session: "Synthetic design session" })
    const heading = withSession.all("review-heading")[0]
    expect(heading.children.map((node) => node.className)).toEqual(["review-kind", "review-session"])
    expect(withSession.all("review-session")).toHaveLength(1)
    expect(withSession.all("review-session-label")[0].dataset.i18nKey).toBe("context.session")
    expect(withSession.all("review-session-value")[0].textContent).toBe("Synthetic design session")
    expect(withSession.all("review-session-value")[0].dataset.i18nKey).toBeUndefined()
    // The summary rows are unaffected, and the single notice follows the session line.
    expect(withSession.all("review-summary")[0].children).toHaveLength(1 + review.summary.length)
    expect(withSession.all("review-notice")).toHaveLength(1)
    expect(withSession.children[0].children.map((node) => node.className)).toEqual(["review-heading", "review-notice", "review-summary", "review-details"])
    for (const request of [undefined, {}, { session: "" }]) expect(render(review, "en", request).all("review-session")).toHaveLength(0)
  })

  it("leads the summary with the signer the review names: a key for Solana, an address for EVM", () => {
    const first = (name: keyof typeof signingReviewFixtures) => render(signingReviewFixtures[name]).all("review-summary")[0].children[0]
    expect(first("sol-transfer").all("review-label")[0].dataset.i18nKey).toBe("review.field.signingKey")
    expect(first("evm-unknown").all("review-label")[0].dataset.i18nKey).toBe("review.field.signingAddress")
    expect(first("evm-unknown").all("review-mono")[0].textContent).toBe("0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf")
  })

  it.each(cases)("%s: every label, note and title is a sandbox translation in both locales", (_name, review) => {
    const english = render(review, "en")
    const chinese = render(review, "zh")
    for (const className of ["review-kind", "review-label", "review-note", "review-group-title", "review-details-toggle", "review-copy"]) {
      const en = english.all(className)
      const zh = chinese.all(className)
      expect(en.length).toBeGreaterThan(0)
      expect(zh.map((node) => node.dataset.i18nKey)).toEqual(en.map((node) => node.dataset.i18nKey))
      for (const node of [...en, ...zh]) {
        expect(node.dataset.i18nKey).toMatch(/^review\./)
        expect(node.textContent).not.toBe("")
        expect(node.textContent).not.toMatch(/^review\.|\{\{/)
      }
    }
    // Translated, not copied: the fixed chrome differs between locales.
    for (const className of ["review-kind", "review-details-toggle", "review-copy", "review-group-title"]) {
      expect(chinese.all(className)[0].textContent).not.toBe(english.all(className)[0].textContent)
    }
  })

  it("shows the notice as one line: a decorative warning icon, then the translated sentence", () => {
    const [notice] = render(signingReviewFixtures["evm-unknown"], "zh").all("review-notice")
    expect(notice.children.map((node) => node.tagName)).toEqual(["svg", "span"])
    const [icon, sentence] = notice.children
    expect(icon.attributes["aria-hidden"]).toBe("true")
    expect(icon.attributes.stroke).toBe("currentColor")
    expect(icon.children.every((node) => node.tagName === "path")).toBe(true)
    // The sentence, not the container, carries the binding, so a locale refresh keeps the icon.
    expect(sentence.dataset.i18nKey).toBe("sign.blindNotice")
    expect(sentence.textContent).toBe(ZH_NOTICE)
    expect(notice.dataset.i18nKey).toBeUndefined()
    expect(notice.textContent).toBe("")
  })

  it("labels a built-in call argument with its position and sandbox-defined name, in both locales", () => {
    const review: SigningReview = {
      ...signingReviewFixtures["evm-unknown"],
      summary: [{ label: "review.field.argument", index: 2, name: "amount (uint256)", value: "9007199254740993" }],
      details: [],
    }
    const row = (locale: Locale) => render(review, locale).all("review-summary")[0].children[1]
    expect(row("en").all("review-label")[0].textContent).toBe("Argument 2 · amount (uint256)")
    expect(row("zh").all("review-label")[0].textContent).toBe("参数 2 · amount (uint256)")
    expect(row("zh").all("review-mono")[0].textContent).toBe("9007199254740993")
  })

  it("renders a heading as its translated label alone, between the rows it separates", () => {
    const review: SigningReview = {
      ...signingReviewFixtures["sol-transfer"],
      summary: [
        { label: "review.field.transferTokenNoMint", index: 3, value: "", heading: true },
        { label: "review.field.toTokenAccount", value: "PUBLIC_TEST_ACCOUNT" },
      ],
      details: [],
    }
    for (const [locale, text] of [["en", "3 · Token transfer · mint not in instruction"], ["zh", "3 · 代币转账 · 指令未包含 mint"]] as const) {
      const rows = render(review, locale).all("review-summary")[0].children
      expect(rows.map((row) => row.className)).toEqual(["review-field", "review-subheading", "review-field"])
      const heading = rows[1]
      expect(heading.tagName).toBe("p")
      expect(heading.textContent).toBe(text)
      expect(heading.dataset.i18nKey).toBe("review.field.transferTokenNoMint")
      // No value element: a heading shows nothing but its sandbox-owned label.
      expect(heading.children).toHaveLength(0)
    }
  })

  it("puts the complete payload in a copyable Details block", () => {
    const review = signingReviewFixtures["solana-unknown"]
    const details = render(review).all("review-details")[0]
    const message = review.details.at(-1)!.fields[0].value
    expect(details.all("review-raw").map((node) => node.textContent)).toEqual([message])
    expect(details.all("review-raw")[0].tagName).toBe("pre")
    expect(details.all("review-copy")).toHaveLength(1)
  })

  it("renders a long summary whole instead of refusing or dropping facts", () => {
    const summary: ReviewField[] = Array.from({ length: 40 }, (_unused, index) => ({
      label: "review.field.account", index: index + 1, value: `account-${index + 1}`, notes: ["review.note.notDecoded"],
    }))
    const root = render({ ...signingReviewFixtures["solana-unknown"], summary, details: [] })
    const rows = root.all("review-summary")[0]
    expect(rows.children).toHaveLength(41)
    expect(rows.all("review-mono").slice(1).map((node) => node.textContent)).toEqual(summary.map((field) => field.value))
    expect(rows.all("review-label").at(-1)?.textContent).toBe("Account 40")
    expect(root.all("review-notice")).toHaveLength(1)
  })

  it("places the request rows first inside Details and nowhere else", () => {
    const request = new FakeElement("div")
    request.className = "confirmation-details"
    const root = render(signingReviewFixtures["sol-transfer"], "en", { rows: request })
    const groups = root.all("review-details")[0].all("review-group")
    expect(groups[0].children[0].dataset.i18nKey).toBe("review.group.request")
    expect(groups[0].children[1]).toBe(request)
    expect(root.all("confirmation-details")).toEqual([request])
    expect(render(signingReviewFixtures["sol-transfer"]).all("review-group")[0].children[0].dataset.i18nKey)
      .toBe("review.group.transaction")
  })

  it("copies the exact payload, and selects it when the clipboard is unavailable", async () => {
    const review = signingReviewFixtures["evm-unknown"]
    const calldata = review.details.at(-1)!.fields[0].value
    const writeText = vi.fn(async (_text: string) => {})
    const selectAllChildren = vi.fn()
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    vi.stubGlobal("window", { getSelection: () => ({ selectAllChildren }) })

    const root = render(review)
    const [copy] = root.all("review-copy")
    const [block] = root.all("review-raw")
    copy.click()
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith(calldata)
    expect(copy.dataset.i18nKey).toBe("review.copied")
    expect(selectAllChildren).not.toHaveBeenCalled()

    writeText.mockRejectedValueOnce(new Error("denied"))
    copy.click()
    await vi.waitFor(() => expect(copy.dataset.i18nKey).toBe("review.copySelected"))
    expect(selectAllChildren).toHaveBeenCalledWith(block)

    vi.stubGlobal("navigator", {})
    const offline = render(review)
    offline.all("review-copy")[0].click()
    expect(offline.all("review-copy")[0].dataset.i18nKey).toBe("review.copySelected")
    expect(selectAllChildren).toHaveBeenLastCalledWith(offline.all("review-raw")[0])
  })
})
