import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"

import { setLocale } from "./i18n"
import { parsePolicyDowngradeContext, type PolicyDowngradeContext } from "./signingPolicyDowngrade"
import { renderPolicyDowngradeReview } from "./signingPolicyUi"

class FakeElement {
  className = ""
  textContent = ""
  readonly dataset: Record<string, string> = {}
  readonly children: FakeElement[] = []
  constructor(readonly tagName: string) {}
  append(...nodes: FakeElement[]): void { this.children.push(...nodes) }
  all(className: string): FakeElement[] {
    const out: FakeElement[] = []
    const walk = (node: FakeElement): void => {
      if (node.className.split(/\s+/).includes(className)) out.push(node)
      node.children.forEach(walk)
    }
    this.children.forEach(walk)
    return out
  }
}

const vectors = JSON.parse(readFileSync(new URL("./fixtures/policy-downgrade-wire-vectors.json", import.meta.url), "utf8")) as { vectors: Array<{ context: unknown }> }
const location = { origin: "https://sandbox.avibe.bot", hostname: "sandbox.avibe.bot" }
const now = Date.parse("2026-11-13T00:00:01.000Z")
const contextAt = (index: number): PolicyDowngradeContext => parsePolicyDowngradeContext(vectors.vectors[index].context, location, now)

function render(context: PolicyDowngradeContext): FakeElement {
  vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) })
  const root = new FakeElement("div")
  renderPolicyDowngradeReview(root as unknown as HTMLElement, context)
  return root
}

// First-screen label/value pairs, in order.
function summary(root: FakeElement): Array<[string, string]> {
  const [block] = root.all("review-summary")
  return block.children.map((field) => [field.all("review-label")[0].textContent, field.children[1].children[0].textContent])
}

describe("policy downgrade first screen", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setLocale("en")
  })

  it("shows an HD account as one numbered, named account row plus what it applies to", () => {
    setLocale("zh")
    const context = contextAt(0)
    const root = render(context)
    expect(root.all("review-warning")).toHaveLength(1)
    expect(root.all("review-info")).toHaveLength(0)
    expect(summary(root)).toEqual([
      ["设置", "签名前问我：开 → 关"],
      ["密钥", context.target.name],
      ["档位", "标准档"],
      ["账户", `#0 ${context.target.accountName}`],
      ["适用于", "这个账户在 ETH、BTC、Solana 上的签名"],
    ])
    expect(root.all("review-details-toggle")[0].textContent).toBe("请求信息")
  })

  it("names an unnamed HD account truthfully", () => {
    const context = contextAt(0)
    const root = render({ ...context, target: { ...context.target, accountName: null } })
    expect(summary(root)[3]).toEqual(["Account", "#0 (no name)"])
  })

  it("drops the empty scope row for a plain key and keeps the protected note neutral", () => {
    const context = contextAt(2)
    expect(context.target.protection).toBe("protected")
    const root = render(context)
    expect(root.all("review-warning")).toHaveLength(0)
    expect(root.all("review-info").map((node) => node.textContent)).toEqual(["Protected keys still need your Passkey approval in the browser for every signature."])
    expect(summary(root)).toEqual([
      ["Setting", "Ask before signing: On → Off"],
      ["Key", context.target.name],
      ["Tier", "Protected"],
    ])
  })
})
