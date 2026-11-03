import { fileURLToPath } from "node:url"
import { join, resolve } from "node:path"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { sourceIdentity, finalize, validateRelease, validateRetained, guardRetained, assemble, retain, hashes, json } from "./release-lib.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const retained = join(root, "retained")
const command = process.argv[2]

async function candidate(out) {
  const { build } = await import("vite")
  const source = await sourceIdentity(root)
  process.env.SANDBOX_BUILD_ID = source.id
  await build({ root, base: `/v/${source.id}/`, build: { outDir: out, emptyOutDir: true } })
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"))
  await finalize(out, source.id, await readFile(join(root, "index.html"), "utf8"), version)
  await writeFile(join(out, "source.json"), json({ schema: 1, buildHash: source.id, inputs: source.inputs }))
  return source.id
}

const temp = await mkdtemp(join(tmpdir(), "vault-release-"))
try {
  if (command === "stage" || command === "check") {
    const a = join(temp, "a")
    const b = join(temp, "b")
    const id = await candidate(a)
    if (await candidate(b) !== id || json(await hashes(a)) !== json(await hashes(b))) throw new Error("Builds are not reproducible")
    const destination = join(retained, "v", id)
    if (command === "stage") await retain(a, destination)
    else if (json(await hashes(a)) !== json(await hashes(destination))) throw new Error("Source build differs from retained release")
    await validateRetained(retained)
    console.log(`Reproduced ${id} twice; ${command === "stage" ? "retained" : "verified"} exact bytes`)
  } else if (command === "assemble") {
    await assemble(retained, join(root, "dist"))
  } else if (command === "pin") {
    const id = (await sourceIdentity(root)).id
    const pin = await validateRelease(join(retained, "v", id), id)
    if (!process.argv[3]) throw new Error("pin needs an explicit local output JSON path (never a URL)")
    await writeFile(resolve(process.argv[3]), json(pin))
  } else if (command === "guard") {
    const base = process.argv[3]
    if (!base) throw new Error("guard needs a reviewed base Git revision")
    await guardRetained(root, base, (await sourceIdentity(root)).id)
  } else if (command === "legacy-check") {
    const receipt = JSON.parse(await readFile(join(retained, "legacy-source.json"), "utf8"))
    const archive = execFileSync("git", ["archive", receipt.sourceCommit], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    execFileSync("tar", ["-x", "-C", temp], { input: archive })
    execFileSync("npm", ["ci", "--ignore-scripts"], { cwd: temp, stdio: "inherit" })
    execFileSync("npm", ["run", "build"], { cwd: temp, stdio: "inherit" })
    if (json(await hashes(join(temp, "dist"))) !== json(receipt.resources)) throw new Error("Legacy source rebuild differs")
    console.log(`Legacy source ${receipt.sourceCommit} reproduced`)
  } else {
    throw new Error("Usage: release.mjs stage | check | assemble | pin <output.json> | guard <base> | legacy-check")
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
