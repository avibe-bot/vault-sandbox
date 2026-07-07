import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const rootUrl = new URL("../", import.meta.url)

function packageJson() {
  return JSON.parse(readFileSync(new URL("package.json", rootUrl), "utf8"))
}

function gitShortSha() {
  const envSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (typeof envSha === "string" && /^[0-9a-f]{7,40}$/i.test(envSha)) {
    return envSha.slice(0, 12).toLowerCase()
  }

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: rootUrl,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    return null
  }
}

export function sandboxBuildInfo() {
  const version = packageJson().version
  if (typeof version !== "string" || !/^[0-9A-Za-z._+~-]+$/.test(version)) {
    throw new Error("package.json version must be a URL-safe version segment")
  }

  const shortSha = gitShortSha()
  return {
    sandboxVersion: version,
    buildHash: shortSha ? `${version}+${shortSha}` : version,
    versionPathPrefix: `/v/${version}`,
  }
}
