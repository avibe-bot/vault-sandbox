// Classification only, never a validator or an identity/AAD source. The legacy
// envelope parser is deliberately unbounded; identify the NEW HD discriminator
// without allocating a parsed tree so its own bounds can run first. All effective
// fields are still validated by the real JSON + typed metadata parsers afterward.
// Only two object levels are interpreted. Unknown values are skipped iteratively;
// escaped names and last-duplicate-wins match JSON.parse for valid JSON.
const JSON_ESCAPES: Readonly<Record<string, number>> = { '"': 34, "\\": 92, "/": 47, b: 8, f: 12, n: 10, r: 13, t: 9 }

export function hasHdRecordMetadata(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  let at = 0
  const whitespace = (): void => { while (at < raw.length && /[\x20\t\r\n]/.test(raw[at])) at += 1 }
  const stringEquals = (expected?: string): boolean => {
    if (raw[at++] !== '"') return false
    let size = 0
    let equal = expected !== undefined
    while (at < raw.length) {
      let code = raw.charCodeAt(at++)
      if (code === 34) return equal && size === expected!.length
      if (code === 92) {
        if (at >= raw.length) return false
        const escape = raw[at++]
        if (escape === "u") {
          const hex = raw.slice(at, at + 4)
          if (hex.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) return false
          code = Number.parseInt(hex, 16)
          at += 4
        } else {
          if (!Object.hasOwn(JSON_ESCAPES, escape)) return false
          code = JSON_ESCAPES[escape]
        }
      }
      if (expected === undefined || size >= expected.length || code !== expected.charCodeAt(size)) equal = false
      size += 1
    }
    return false
  }
  const skipValue = (): void => {
    whitespace()
    if (raw[at] === '"') { stringEquals(); return }
    if (raw[at] !== "{" && raw[at] !== "[") {
      while (at < raw.length && !/[,}\]\x20\t\r\n]/.test(raw[at])) at += 1
      return
    }
    let depth = 0
    while (at < raw.length) {
      const char = raw[at]
      if (char === '"') { stringEquals(); continue }
      at += 1
      if (char === "{" || char === "[") depth += 1
      if (char === "}" || char === "]") { depth -= 1; if (depth === 0) return }
    }
  }
  const recordIsHd = (): boolean => {
    whitespace()
    if (raw[at] !== "{") { skipValue(); return false }
    at += 1
    let hd = false
    for (;;) {
      whitespace()
      if (raw[at] === "}") { at += 1; return hd }
      if (raw[at] !== '"') return false
      const kind = stringEquals("kind")
      whitespace()
      if (raw[at++] !== ":") return false
      whitespace()
      if (kind && raw[at] === '"') hd = stringEquals("hd-seed")
      else { skipValue(); if (kind) hd = false }
      whitespace()
      if (raw[at] === "}") { at += 1; return hd }
      if (raw[at++] !== ",") return false
    }
  }
  whitespace()
  if (raw[at++] !== "{") return false
  let hd = false
  for (;;) {
    whitespace()
    if (raw[at] === "}") return hd
    if (raw[at] !== '"') return false
    const record = stringEquals("record_meta")
    whitespace()
    if (raw[at++] !== ":") return false
    if (record) hd = recordIsHd()
    else skipValue()
    whitespace()
    if (raw[at] === "}") return hd
    if (raw[at++] !== ",") return false
  }
}
