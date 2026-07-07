import { createHash } from "node:crypto"
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"

const distDir = new URL("../dist", import.meta.url)
const manifestName = "build-manifest.json"

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const out = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await files(path)))
    } else if (entry.name !== manifestName) {
      out.push(path)
    }
  }
  return out
}

const resources = {}
for (const file of (await files(distDir.pathname)).sort()) {
  const bytes = await readFile(file)
  const key = `/${relative(distDir.pathname, file).split(sep).join("/")}`
  resources[key] = `sha256-${createHash("sha256").update(bytes).digest("base64")}`
}

await writeFile(
  new URL(`../dist/${manifestName}`, import.meta.url),
  `${JSON.stringify(
    {
      algorithm: "sha256",
      resources,
    },
    null,
    2,
  )}\n`,
)
