// JSON values authenticated by Python and JavaScript must have one lossless
// representation. In particular JS cannot preserve arbitrary-size JSON numbers.
export function assertCanonicalJson(value: unknown): void {
  const ancestors = new Set<object>()
  function string(value: string): void {
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i)
      if (code >= 0xd800 && code <= 0xdbff) {
        const low = value.charCodeAt(++i)
        if (!(low >= 0xdc00 && low <= 0xdfff)) throw new Error("signing context contains an unpaired UTF-16 surrogate")
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new Error("signing context contains an unpaired UTF-16 surrogate")
      }
    }
  }
  function visit(item: unknown): void {
    if (item === null || typeof item === "boolean") return
    if (typeof item === "string") { string(item); return }
    if (typeof item === "number") {
      if (!Number.isSafeInteger(item)) throw new Error("signing context numbers must be safe integers; use strings for large quantities")
      return
    }
    if (typeof item !== "object") throw new Error("signing context must contain only JSON values")
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new Error("signing context must contain only plain JSON objects")
    }
    if (ancestors.has(item)) throw new Error("signing context must not contain cycles")
    ancestors.add(item)
    if (Array.isArray(item)) {
      for (const child of item) visit(child)
    } else {
      for (const [key, child] of Object.entries(item)) { string(key); visit(child) }
    }
    ancestors.delete(item)
  }
  visit(value)
}
