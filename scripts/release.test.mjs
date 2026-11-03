import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdtemp, mkdir, rm, readFile, writeFile, cp } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, it } from "vitest"
import { build } from "vite"
import { assemble, closedGraphPlugin, digest, finalize, guardRetained, hashes, json, retain, validateRelease } from "./release-lib.mjs"

const dirs = []
async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "vault-release-test-"))
  dirs.push(dir)
  return dir
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))) })
const template = '<html><head></head><body><script type="module" src="/src/main.ts"></script></body></html>'

async function snapshot(root, text) {
  const inputs = { "src/main.ts": digest(Buffer.from(text)) }
  const id = createHash("sha256").update(json(inputs)).digest("hex")
  const out = join(root, id)
  await mkdir(join(out, "assets"), { recursive: true })
  await writeFile(join(out, "assets/main.js"), text)
  await writeFile(join(out, "assets/style.css"), "body{color:black}")
  await finalize(out, id, template, '0.1.0')
  await writeFile(join(out, "source.json"), json({ buildHash: id, inputs }))
  return { id, out }
}

describe("source-owned immutable release artifacts", () => {
  it("retains A byte-for-byte when assembling B, and rejects collisions, deletion and tampering", async () => {
    const root = await temp()
    const retained = join(root, "retained")
    await mkdir(join(retained, "legacy"), { recursive: true })
    await writeFile(join(retained, "legacy/index.html"), "frozen dev root")
    await writeFile(join(retained, "legacy-source.json"), json({ resources: await hashes(join(retained, "legacy")) }))
    const a = await snapshot(root, "globalThis.version='A'")
    const b = await snapshot(root, "globalThis.version='B'")
    await retain(a.out, join(retained, "v", a.id))
    const git = (args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
    git(['init'])
    git(['add', 'retained'])
    git(['-c', 'user.name=Public Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'published A'])
    const base = git(['rev-parse', 'HEAD']).toString().trim()
    await assemble(retained, join(root, "deploy-a"))
    await retain(b.out, join(retained, "v", b.id))
    await guardRetained(root, base, b.id)
    await expect(guardRetained(root, base, 'f'.repeat(64))).rejects.toThrow('Unreviewed extra release')
    await assemble(retained, join(root, "deploy-b"))
    expect(await hashes(join(root, "deploy-b/v", a.id))).toEqual(await hashes(join(root, "deploy-a/v", a.id)))
    expect(await readFile(join(root, "deploy-b/index.html"), "utf8")).toBe("frozen dev root")
    await expect(retain(b.out, join(retained, "v", a.id))).rejects.toThrow("Immutable release conflict")
    await writeFile(join(retained, "v", a.id, "assets/main.js"), "tampered")
    await expect(guardRetained(root, base, b.id)).rejects.toThrow('Retained bytes cannot change')
    await expect(assemble(retained, join(root, "bad-deploy"))).rejects.toThrow("bytes do not match")
    await rm(join(retained, "v", a.id, "assets/main.js"))
    await expect(validateRelease(join(retained, "v", a.id), a.id)).rejects.toThrow("bytes do not match")
  })

  it("pins all runtime files and emits native SRI for the only script and stylesheet", async () => {
    const s = await snapshot(await temp(), "globalThis.version='public fixture'")
    const pin = await validateRelease(s.out, s.id)
    const html = await readFile(join(s.out, "index.html"), "utf8")
    expect(html.indexOf('<link ')).toBeLessThan(html.indexOf('</head>'));
    expect(Object.keys(pin.resources)).toEqual([
      `/v/${s.id}/assets/main.js`, `/v/${s.id}/assets/style.css`, `/v/${s.id}/index.html`,
    ])
    for (const path of Object.keys(pin.resources).filter((p) => !p.endsWith(".html"))) {
      expect(html).toContain(`integrity="${pin.resources[path]}" crossorigin="anonymous"`)
    }
    expect(pin.manifestHash).toBe(digest(await readFile(join(s.out, "build-manifest.json"))))
    // An extra file is not silently omitted from the trust graph.
    await writeFile(join(s.out, "extra.js"), "external()")
    await expect(validateRelease(s.out, s.id)).rejects.toThrow("bytes do not match")
  })

  it.each(["@import 'https://example.test/style.css';", "body{background:url(https://example.test/x)}"])("rejects external CSS: %s", async (css) => {
    const root = await temp()
    await writeFile(join(root, "main.js"), "import './style.css'; globalThis.loaded=true")
    await writeFile(join(root, "style.css"), css)
    await expect(build({ root, configFile: false, logLevel: "silent", plugins: [closedGraphPlugin()], build: {
      write: false, lib: { entry: join(root, "main.js"), formats: ["es"] },
    } })).rejects.toThrow()
  })

  it.each([
    "import('./lazy.js').then(x=>x.run())", "new Worker('worker.js')", "new SharedWorker('worker.js')",
    "navigator.serviceWorker.register('sw.js')", "eval('external()')", "new Function('external()')",
    "document.createElement('script')", "document.createElement('link')", "fetch('/extra.js')",
  ])("rejects an executable/network bypass in the actual Rollup graph: %s", async (code) => {
    const root = await temp()
    await writeFile(join(root, "main.js"), `import './style.css'; ${code}`)
    await writeFile(join(root, "lazy.js"), "export function run(){globalThis.lazy=true}")
    await writeFile(join(root, "style.css"), "body{color:black}")
    await expect(build({ root, configFile: false, logLevel: "silent", plugins: [closedGraphPlugin()], build: {
      write: false, lib: { entry: join(root, "main.js"), formats: ["es"] }, minify: false,
    } })).rejects.toThrow()
  })

  it("rejects malformed manifests and provenance, not just altered bundles", async () => {
    const root = await temp()
    const s = await snapshot(root, "globalThis.fixture=true")
    const backup = join(root, "backup")
    await cp(s.out, backup, { recursive: true })
    for (const file of ["build-manifest.json", "source.json"]) {
      await writeFile(join(s.out, file), "{malformed")
      await expect(validateRelease(s.out, s.id)).rejects.toThrow()
      await cp(join(backup, file), join(s.out, file))
    }
    const manifest = JSON.parse(await readFile(join(s.out, "build-manifest.json"), "utf8"))
    manifest.buildHash = "dev"
    await writeFile(join(s.out, "build-manifest.json"), json(manifest))
    await expect(validateRelease(s.out, s.id)).rejects.toThrow("identity")
  })
})
