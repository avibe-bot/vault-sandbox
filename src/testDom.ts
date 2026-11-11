// A small DOM stand-in for consumer tests of the confirmation card: enough of
// Element for operationUi.ts and signingReview.ts to render into, queried by
// class, tag or data attribute. Test support only; nothing imports it at runtime.

class FakeClassList {
  constructor(private readonly owner: FakeElement) {}
  private names(): string[] { return this.owner.className.split(/\s+/).filter(Boolean) }
  add(...names: string[]): void { this.owner.className = [...new Set([...this.names(), ...names])].join(" ") }
  remove(...names: string[]): void { this.owner.className = this.names().filter((name) => !names.includes(name)).join(" ") }
  contains(name: string): boolean { return this.names().includes(name) }
}

export class FakeElement {
  readonly dataset: Record<string, string> = {}
  readonly attributes: Record<string, string> = {}
  readonly children: FakeElement[] = []
  readonly classList = new FakeClassList(this)
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>()
  private ownText = ""
  parent: FakeElement | null = null
  className = ""
  id = ""
  type = ""
  title = ""
  disabled = false
  open = false

  constructor(readonly tagName: string) {}

  /** Like the DOM: reading concatenates descendants, writing replaces them. */
  get textContent(): string { return this.ownText + this.children.map((child) => child.textContent).join("") }
  set textContent(value: string | null) {
    this.children.splice(0).forEach((child) => { child.parent = null })
    this.ownText = value ?? ""
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) { node.parent = this; this.children.push(node) }
  }

  prepend(node: FakeElement): void { node.parent = this; this.children.unshift(node) }

  remove(): void {
    const siblings = this.parent?.children
    if (siblings) siblings.splice(siblings.indexOf(this), 1)
    this.parent = null
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value
    if (name === "class") this.className = value
  }

  getAttribute(name: string): string | null { return this.attributes[name] ?? null }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type) ?? new Set()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void { this.listeners.get(type)?.delete(listener) }

  click(): void { for (const listener of [...(this.listeners.get("click") ?? [])]) listener({ type: "click" }) }

  private matches(selector: string): boolean {
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1))
    const data = /^\[data-([a-z0-9-]+)\]$/.exec(selector)
    if (data) return this.dataset[data[1].replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] !== undefined
    return this.tagName.toLowerCase() === selector.toLowerCase()
  }

  /** Descendants in document order. Simple selectors only: `.class`, `tag`, `[data-name]`. */
  querySelectorAll(selector: string): FakeElement[] {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)])
  }

  querySelector(selector: string): FakeElement | null { return this.querySelectorAll(selector)[0] ?? null }

  /** Text of every element that holds text directly, in document order. */
  leafTexts(): string[] {
    return [...(this.ownText ? [this.ownText] : []), ...this.children.flatMap((child) => child.leafTexts())]
  }
}

/** The shell markup of index.html: page > card > header(h1, .sub), .card-scroll > .body, .card-footer. */
export function installCardDocument(stubGlobal: (name: string, value: unknown) => void) {
  const make = (tag: string, className = ""): FakeElement => {
    const node = new FakeElement(tag)
    node.className = className
    return node
  }
  const body = make("body")
  const page = make("div", "page")
  page.id = "page"
  const card = make("main", "card")
  const title = make("h1")
  const subtitle = make("p", "sub")
  const scroll = make("div", "card-scroll")
  const content = make("div", "body")
  const footer = make("footer", "card-footer")
  scroll.append(content)
  card.append(title, subtitle, scroll, footer)
  page.append(card)
  body.append(page)
  const document = {
    body,
    documentElement: make("html"),
    getElementById: (id: string) => (id === "page" ? page : null),
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_namespace: string, tag: string) => new FakeElement(tag),
    querySelectorAll: (selector: string) => body.querySelectorAll(selector),
  }
  stubGlobal("HTMLElement", FakeElement)
  stubGlobal("document", document)
  return { document, body, card, title, subtitle, content, footer }
}
