// Re-check src/hdPhrase.ts against an upstream avibe ui/src/lib/vaultHdWallet.ts.
// Usage: node scripts/hd-phrase-parity.mjs /path/to/vaultHdWallet.ts
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { vendoredHdPhraseRegion } from "./hd-phrase-region.mjs"

const bytes = readFileSync(process.argv[2], "utf8")
if (createHash("sha256").update(bytes).digest("hex") !== "dc105586ef461be0ce4263ece9506bd7acdd912a8a0459062b5ef6a816005fdd") {
  throw new Error("Use the exact pinned standard source blob; a new upstream revision needs an explicit re-vendor")
}
const upstream = bytes.split("\n")
const block = (from, to) => upstream.slice(from - 1, to).join("\n")
const expected = [block(28, 28), block(48, 83), block(199, 231), block(234, 235)].join("\n\n") + "\n"
const { region, pinned } = vendoredHdPhraseRegion(readFileSync(new URL("../src/hdPhrase.ts", import.meta.url), "utf8"))
const digest = (text) => createHash("sha256").update(text).digest("hex")
if (region !== expected) { console.error("hdPhrase.ts differs from upstream lines; re-vendor"); process.exit(1) }
if (digest(region) !== pinned) { console.error("hdPhrase.ts pinned digest is stale"); process.exit(1) }
console.log(`hdPhrase.ts matches upstream (${pinned})`)
