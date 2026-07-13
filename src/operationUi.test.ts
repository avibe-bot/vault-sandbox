import { afterEach, describe, expect, it, vi } from "vitest"

import { confirmOperationInActiveSlot, rawText } from "./operationUi"

class TestClassList {
  readonly values = new Set<string>()

  add(...names: string[]): void {
    names.forEach((name) => this.values.add(name))
  }

  remove(...names: string[]): void {
    names.forEach((name) => this.values.delete(name))
  }

  contains(name: string): boolean {
    return this.values.has(name)
  }

  replaceFrom(className: string): void {
    this.values.clear()
    className.split(/\s+/).filter(Boolean).forEach((name) => this.values.add(name))
  }
}

class TestElement {
  readonly classList = new TestClassList()
  readonly dataset: Record<string, string> = {}
  readonly selectors = new Map<string, TestElement>()
  readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
  readonly children: TestElement[] = []
  parent: TestElement | null = null
  textContent: string | null = ""
  title = ""
  type = ""
  disabled = false

  constructor(readonly tagName = "div") {}

  set className(value: string) {
    this.classList.replaceFrom(value)
  }

  get className(): string {
    return [...this.classList.values].join(" ")
  }

  append(...nodes: unknown[]): void {
    for (const node of nodes) {
      if (!(node instanceof TestElement)) continue
      node.parent = this
      this.children.push(node)
    }
  }

  replaceChildren(...nodes: unknown[]): void {
    this.children.splice(0).forEach((child) => {
      child.parent = null
    })
    this.textContent = ""
    this.append(...nodes)
  }

  remove(): void {
    if (!this.parent) return
    const index = this.parent.children.indexOf(this)
    if (index >= 0) this.parent.children.splice(index, 1)
    this.parent = null
  }

  querySelector(selector: string): TestElement | null {
    return this.selectors.get(selector) ?? this.find((element) => element.matches(selector))
  }

  querySelectorAll(selector: string): TestElement[] {
    const matches: TestElement[] = []
    this.walk((element) => {
      if (element.matches(selector)) matches.push(element)
    })
    return matches
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.get(type)?.delete(listener)
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) {
      if (typeof listener === "function") listener({ type: "click" } as Event)
      else listener.handleEvent({ type: "click" } as Event)
    }
  }

  find(predicate: (element: TestElement) => boolean): TestElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child
      const nested = child.find(predicate)
      if (nested) return nested
    }
    return null
  }

  private matches(selector: string): boolean {
    return selector.startsWith(".") ? this.classList.contains(selector.slice(1)) : this.tagName.toLowerCase() === selector.toLowerCase()
  }

  private walk(visit: (element: TestElement) => void): void {
    for (const child of this.children) {
      visit(child)
      child.walk(visit)
    }
  }
}

function installCardDom() {
  const body = new TestElement("body")
  const page = new TestElement("div")
  const card = new TestElement("main")
  const title = new TestElement("h1")
  const subtitle = new TestElement("p")
  const scroll = new TestElement("div")
  const content = new TestElement("div")
  const footer = new TestElement("footer")
  card.className = "card"
  subtitle.className = "sub"
  scroll.className = "card-scroll"
  content.className = "body"
  footer.className = "card-footer"
  page.selectors.set(".card", card)
  page.selectors.set("h1", title)
  page.selectors.set(".sub", subtitle)
  page.selectors.set(".body", content)
  page.selectors.set(".card-scroll", scroll)
  page.selectors.set(".card-footer", footer)
  card.selectors.set(".card-scroll", scroll)
  card.selectors.set(".card-footer", footer)
  scroll.append(content)
  card.append(title, subtitle, scroll, footer)
  page.append(card)
  body.append(page)

  vi.stubGlobal("HTMLElement", TestElement)
  vi.stubGlobal("document", {
    body,
    getElementById: (id: string) => id === "page" ? page : null,
    createElement: (tagName: string) => new TestElement(tagName),
  })
  return { body, card, content, footer }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("confirmation card", () => {
  it("keeps actions in the footer and sends the fixed shell to the visibility guard", async () => {
    vi.useFakeTimers()
    const dom = installCardDom()
    const longCommand = `curl https://api.example.com/releases \\\n+  --header 'Authorization: Bearer token' \\\n+  --data '${"x".repeat(300)}'`
    let visibilityTarget: HTMLElement | undefined

    const confirmation = confirmOperationInActiveSlot(
      {
        title: rawText("Release protected access"),
        subtitle: rawText("2 protected items"),
        body: "reveal.confirmBody",
        details: {
          rows: [
            { label: rawText("Command"), value: rawText(longCommand), variant: "command" },
            { label: rawText("Agent"), value: rawText("sha256:0123456789abcdef".repeat(4)), variant: "mono" },
          ],
        },
        confirmLabel: rawText("Confirm release"),
      },
      new AbortController().signal,
      async (target) => {
        visibilityTarget = target
      },
    )

    expect(dom.body.classList.contains("confirming")).toBe(true)
    expect(dom.card.classList.contains("confirm-card")).toBe(true)
    expect(dom.content.dataset.i18nKey).toBeUndefined()
    expect(dom.content.find((element) => element.classList.contains("detail-command"))?.textContent).toBe(longCommand)
    expect(dom.footer.children).toHaveLength(2)
    expect(dom.footer.children.every((button) => button.classList.contains("action"))).toBe(true)

    await vi.advanceTimersByTimeAsync(500)
    dom.footer.children[1].click()
    await confirmation

    expect(visibilityTarget).toBe(dom.card as unknown as HTMLElement)
    expect(dom.body.classList.contains("confirming")).toBe(false)
  })

  it("starts passkey activation directly from the confirmation click", async () => {
    vi.useFakeTimers()
    const dom = installCardDom()
    const events: string[] = []
    let finishActivation: (() => void) | undefined

    const confirmation = confirmOperationInActiveSlot(
      {
        title: rawText("Release protected access"),
        subtitle: rawText("1 protected item"),
        confirmLabel: rawText("Confirm release"),
      },
      new AbortController().signal,
      async () => {
        events.push("guard")
      },
      () => {
        events.push("activate")
        return new Promise<void>((resolve) => {
          finishActivation = resolve
        })
      },
    )

    expect(dom.footer.children[1].disabled).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(events).toEqual(["guard"])
    expect(dom.footer.children[1].disabled).toBe(false)

    dom.footer.children[1].click()
    expect(events).toEqual(["guard", "activate"])
    expect(dom.body.classList.contains("confirming")).toBe(true)
    expect(dom.footer.children.every((action) => action.disabled)).toBe(true)

    finishActivation?.()
    await confirmation
    expect(dom.body.classList.contains("confirming")).toBe(false)
  })
})
