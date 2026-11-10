import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { signingReviewFixtures } from "../design/signingFixtures"
import { setLocale, type Locale } from "./i18n"
import { renderSigningReview, type ReviewField, type SigningReview } from "./signingReview"

class FakeElement {
  readonly dataset: Record<string, string> = {}
  readonly children: FakeElement[] = []
  readonly listeners: Array<() => void> = []
  className = ""
  textContent: string | null = ""
  type = ""

  constructor(readonly tagName: string) {}

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes)
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

function render(review: SigningReview, locale: Locale = "en", request?: FakeElement): FakeElement {
  setLocale(locale)
  const target = new FakeElement("div")
  renderSigningReview(target as unknown as HTMLElement, review, request as unknown as HTMLElement | undefined)
  return target
}

function values(review: SigningReview): string[] {
  return [review.signingKey, ...review.summary, ...review.details.flatMap((group) => group.fields)]
    .map((field) => typeof field === "string" ? field : field.value)
}

beforeEach(() => {
  vi.stubGlobal("document", { createElement: (tagName: string) => new FakeElement(tagName) })
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
      expect(root.all("review-notice").map((node) => node.textContent)).toEqual(review.undecoded ? [notice] : [])
      // The notice sits in the summary area, above Details, never inside it.
      expect(root.all("review-details")[0].all("review-notice")).toHaveLength(0)
      expect(root.texts().filter((text) => text === EN_NOTICE || text === ZH_NOTICE)).toHaveLength(review.undecoded ? 1 : 0)
    }
  })

  it.each(cases)("%s: every value is shown exactly and is not a translation binding", (_name, review) => {
    const english = render(review, "en")
    const chinese = render(review, "zh")
    for (const root of [english, chinese]) {
      const shown = root.all("review-mono", "review-raw")
      expect(shown.map((node) => node.textContent)).toEqual(values(review))
      expect(shown.every((node) => node.dataset.i18nKey === undefined)).toBe(true)
    }
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
      label: "review.field.programIndexed", index: index + 1, value: `program-${index + 1}`, notes: ["review.note.notDecoded"],
    }))
    const root = render({ ...signingReviewFixtures["solana-unknown"], summary, details: [] })
    const rows = root.all("review-summary")[0]
    expect(rows.children).toHaveLength(41)
    expect(rows.all("review-mono").slice(1).map((node) => node.textContent)).toEqual(summary.map((field) => field.value))
    expect(rows.all("review-label").at(-1)?.textContent).toBe("Program 40")
    expect(root.all("review-notice")).toHaveLength(1)
  })

  it("places the request rows first inside Details and nowhere else", () => {
    const request = new FakeElement("div")
    request.className = "confirmation-details"
    const root = render(signingReviewFixtures["sol-transfer"], "en", request)
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
