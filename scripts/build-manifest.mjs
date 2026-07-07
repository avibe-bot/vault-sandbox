import { createHash } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { sandboxBuildInfo } from "./build-info.mjs"

const { sandboxVersion, buildHash, versionPathPrefix } = sandboxBuildInfo()
const distDir = new URL("../dist", import.meta.url)
const versionDistDir = new URL(`../dist/v/${sandboxVersion}`, import.meta.url)
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
const compatibilityResources = {}
for (const file of (await files(versionDistDir.pathname)).sort()) {
  const bytes = await readFile(file)
  const relativePath = relative(versionDistDir.pathname, file).split(sep).join("/")
  const key = `${versionPathPrefix}/${relativePath}`
  resources[key] = `sha256-${createHash("sha256").update(bytes).digest("base64")}`
  compatibilityResources[`/${relativePath}`] = resources[key]
}

const manifest = {
  algorithm: "sha256",
  sandboxVersion,
  buildHash,
  resources,
}

const compatibilityManifest = {
  algorithm: "sha256",
  sandboxVersion,
  buildHash,
  canonicalManifestPath: `${versionPathPrefix}/${manifestName}`,
  resources: compatibilityResources,
}

await mkdir(distDir, { recursive: true })
await writeFile(new URL(`../dist/v/${sandboxVersion}/${manifestName}`, import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(new URL(`../dist/${manifestName}`, import.meta.url), `${JSON.stringify(compatibilityManifest, null, 2)}\n`)
