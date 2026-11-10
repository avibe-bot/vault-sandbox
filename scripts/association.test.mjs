import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { ASSOCIATION_PATH, associatedApps, publishAssociation } from "./association.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const source = join(root, "hosting/apple-app-site-association.json")
const dirs = []
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "vault-association-test-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })

describe("host app association", () => {
  it("publishes the committed bytes, which name only the Avibe iOS app for passkeys", async () => {
    const out = await temp()
    await publishAssociation(source, out)
    const published = await readFile(join(out, ASSOCIATION_PATH))
    expect(published.equals(await readFile(source))).toBe(true)
    expect(JSON.parse(published.toString("utf8"))).toEqual({ webcredentials: { apps: ["68B2SQ6YK3.bot.avibe.ios"] } })
  })

  it("accepts nothing but a webcredentials app list", () => {
    const app = "68B2SQ6YK3.bot.avibe.ios"
    expect(associatedApps(JSON.stringify({ webcredentials: { apps: [app] } }))).toEqual([app])
    for (const association of [
      { webcredentials: { apps: [app] }, applinks: { details: [] } },
      { webcredentials: { apps: [app], origins: ["https://example.invalid"] } },
      { webcredentials: { apps: [] } },
      { webcredentials: { apps: ["bot.avibe.ios"] } },
      { webcredentials: { apps: [app, "*"] } },
      [],
    ]) {
      expect(() => associatedApps(JSON.stringify(association))).toThrow()
    }
  })

  it("never replaces bytes a release already assembled", async () => {
    const out = await temp()
    await mkdir(join(out, ".well-known"))
    await writeFile(join(out, ASSOCIATION_PATH), "assembled")
    await expect(publishAssociation(source, out)).rejects.toThrow()
    expect(await readFile(join(out, ASSOCIATION_PATH), "utf8")).toBe("assembled")
  })
})
