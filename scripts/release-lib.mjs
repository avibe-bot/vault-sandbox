import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { readdir, readFile, mkdir, writeFile, lstat, cp, rm } from "node:fs/promises"
import { dirname, join } from "node:path"

export const origin = "https://sandbox.avibe.bot"
export const digest = (bytes) => `sha256-${createHash("sha256").update(bytes).digest("base64")}`
export const json = (value) => `${JSON.stringify(value, null, 2)}\n`
export const releaseId = /^[a-f0-9]{64}$/

export async function files(dir, prefix = "") {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + entry.name
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not release inputs: ${name}`)
    if (entry.isDirectory()) result.push(...await files(join(dir, entry.name), `${name}/`))
    else if (entry.isFile()) result.push(name)
    else throw new Error(`Not a regular file: ${name}`)
  }
  return result.sort()
}

export async function hashes(dir) {
  return Object.fromEntries(await Promise.all((await files(dir)).map(async (name) => [name, digest(await readFile(join(dir, name)))])))
}

// Content identity, not a Git commit: a snapshot commit cannot contain its own SHA.
// The checked-in provenance lists every input; Git history locates that exact source tree.
export async function sourceIdentity(root) {
  // Only tracked/staged source belongs to a release. Ignored editor/OS files
  // must not change identity; stage new sources before snapshotting them.
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "src"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean)
  const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", "src"], { cwd: root, encoding: "utf8" }).trim()
  if (untracked) throw new Error(`Stage new source inputs before releasing: ${untracked}`)
  const names = ["index.html", "package.json", "package-lock.json", "tsconfig.json", "vite.config.ts",
    "scripts/release-lib.mjs", "scripts/release.mjs", ...tracked].sort()
  const inputs = Object.fromEntries(await Promise.all(names.map(async (name) => [name, digest(await readFile(join(root, name)))])))
  return { id: createHash("sha256").update(json(inputs)).digest("hex"), inputs }
}

export function assertClosedCode(ast) {
  const visit = (node) => {
    if (!node || typeof node !== "object") return
    if (["ImportExpression", "ImportDeclaration", "ExportAllDeclaration"].includes(node.type)
      || (node.type === "ExportNamedDeclaration" && node.source)) throw new Error("Runtime imports are forbidden")
    if (["CallExpression", "NewExpression"].includes(node.type)) {
      const name = node.callee?.name ?? node.callee?.property?.name
      if (["eval", "Function", "Worker", "SharedWorker", "importScripts", "fetch", "WebSocket", "XMLHttpRequest", "EventSource"].includes(name)) {
        throw new Error(`Runtime code/network constructor is forbidden: ${name}`)
      }
      if (name === "createElement" && ["script", "link", "iframe", "style"].includes(node.arguments?.[0]?.value)) {
        throw new Error("Runtime executable/style elements are forbidden")
      }
    }
    if (node.type === "MemberExpression" && (node.property?.name ?? node.property?.value) === "serviceWorker") {
      throw new Error("Service workers are forbidden")
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === "object") visit(value)
    }
  }
  visit(ast)
}

// Rollup supplies the actual executable graph, including transitive dependencies.
// A one-chunk graph avoids the browser's lack of transitive module SRI inheritance.
export function closedGraphPlugin() {
  return {
    name: "vault-closed-runtime-graph",
    enforce: "post",
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === "chunk")
      if (chunks.length !== 1 || !chunks[0].isEntry || chunks[0].imports.length || chunks[0].dynamicImports.length) {
        throw new Error("Sandbox must emit exactly one import-free executable entry")
      }
      assertClosedCode(this.parse(chunks[0].code))
      const styles = Object.values(bundle).filter((item) => item.fileName.endsWith(".css"))
      if (styles.length !== 1 || /@import|url\s*\(/i.test(String(styles[0].source))) {
        throw new Error("Sandbox must emit one stylesheet without external dependencies")
      }
    },
  }
}

export async function finalize(dir, id, template, sandboxVersion) {
  const names = await files(dir)
  const scripts = names.filter((name) => /^assets\/[^/]+\.js$/.test(name))
  const styles = names.filter((name) => /^assets\/[^/]+\.css$/.test(name))
  if (names.length !== 2 || scripts.length !== 1 || styles.length !== 1) {
    throw new Error(`Unexpected runtime asset graph: ${names.join(", ")}`)
  }
  const base = `/v/${id}/`
  const assets = await hashes(dir)
  let html = template
    .replace('<script type="module" src="/src/main.ts"></script>', `<script type="module" src="${base}${scripts[0]}"></script>`)
    .replace('</head>', `  <link rel="stylesheet" href="${base}${styles[0]}">\n  </head>`)
  // No inline executable content, event handlers, extra documents, or alternate resource edges.
  if (/<(?:iframe|object|embed|base|style)\b|\son\w+\s*=|\sstyle\s*=/i.test(html)) throw new Error("Unsafe loader content")
  const scriptTags = [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)]
  const linkTags = [...html.matchAll(/<link\b[^>]*>/g)]
  if (scriptTags.length !== 1 || linkTags.length !== 1) throw new Error("Loader must contain exactly one script and stylesheet")
  for (const [tag, name, attr] of [[scriptTags[0][0], scripts[0], "src"], [linkTags[0][0], styles[0], "href"]]) {
    if (!tag.includes(`${attr}="${base}${name}"`) || (attr === "src" && !/^<script\b[^>]*><\/script>$/.test(tag))
      || (attr === "href" && !tag.includes('rel="stylesheet"'))) throw new Error("Loader reference differs from the release graph")
    html = html.replace(tag, tag.replace(/ crossorigin(?:="[^"]*")?/, "").replace(/>/, ` integrity="${assets[name]}" crossorigin="anonymous">`))
  }
  await writeFile(join(dir, "index.html"), html)
  const resources = Object.fromEntries(Object.entries(await hashes(dir)).map(([name, hash]) => [base + name, hash]))
  const manifest = { schema: 1, algorithm: "sha256", sandboxOrigin: origin, sandboxVersion, buildHash: id, resources }
  await writeFile(join(dir, "build-manifest.json"), json(manifest))
  return manifest
}

export async function validateRelease(dir, id) {
  if (!releaseId.test(id)) throw new Error(`Invalid release id: ${id}`)
  const manifestBytes = await readFile(join(dir, "build-manifest.json"))
  const manifest = JSON.parse(manifestBytes)
  const base = `/v/${id}/`
  if (manifest.schema !== 1 || manifest.algorithm !== "sha256" || manifest.sandboxOrigin !== origin || manifest.buildHash !== id
    || typeof manifest.sandboxVersion !== "string" || !manifest.sandboxVersion) {
    throw new Error("Invalid retained manifest identity")
  }
  const actual = await hashes(dir)
  delete actual["build-manifest.json"]
  delete actual["source.json"]
  if (json(manifest.resources) !== json(Object.fromEntries(Object.entries(actual).map(([name, hash]) => [base + name, hash])))) {
    throw new Error("Retained release bytes do not match manifest")
  }
  const provenance = JSON.parse(await readFile(join(dir, "source.json"), "utf8"))
  if (provenance.buildHash !== id || createHash("sha256").update(json(provenance.inputs)).digest("hex") !== id) {
    throw new Error("Release source-input identity does not match")
  }
  return { ...manifest, manifestHash: digest(manifestBytes) }
}

export async function guardRetained(root, base, currentId) {
  const git = (args) => execFileSync("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  const old = git(["ls-tree", "-r", "--name-only", base, "--", "retained"]).toString().trim().split("\n").filter(Boolean)
  for (const name of old) {
    const expected = git(["show", `${base}:${name}`])
    if (!expected.equals(await readFile(join(root, name)))) throw new Error(`Retained bytes cannot change or disappear: ${name}`)
  }
  const published = new Set(old.filter((name) => name.startsWith("retained/v/")).map((name) => name.split("/")[2]))
  for (const id of await readdir(join(root, "retained/v"))) {
    if (!published.has(id) && id !== currentId) throw new Error(`Unreviewed extra release: ${id}`)
  }
  await validateRetained(join(root, "retained"))
}

export async function validateRetained(retained) {
  const versions = await readdir(join(retained, "v"))
  if (!versions.length) throw new Error("No retained releases; run npm run release:stage")
  for (const id of versions) await validateRelease(join(retained, "v", id), id)
  const legacy = JSON.parse(await readFile(join(retained, "legacy-source.json"), "utf8"))
  if (json(await hashes(join(retained, "legacy"))) !== json(legacy.resources)) throw new Error("Frozen legacy bytes changed")
}

// Deployment only copies reviewed bytes, including all earlier releases.
export async function assemble(retained, out) {
  await validateRetained(retained)
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  await cp(join(retained, "legacy"), out, { recursive: true })
  await cp(join(retained, "v"), join(out, "v"), { recursive: true })
}

export async function retain(candidate, destination) {
  try {
    await lstat(destination)
    if (json(await hashes(candidate)) !== json(await hashes(destination))) throw new Error(`Immutable release conflict: ${destination}`)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    await mkdir(dirname(destination), { recursive: true })
    await cp(candidate, destination, { recursive: true, errorOnExist: true, force: false })
  }
}
