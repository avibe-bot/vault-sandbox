// Publishes the host's Apple app association next to the assembled releases.
//
// It is host metadata, not part of any sandbox release: this file and its
// source are deliberately absent from the release identity inputs, so the
// retained bytes, the build hash and the Avibe pin do not change. The step
// writes one fixed path and accepts only the webcredentials app list, so it
// cannot become a way to publish executable bytes outside a retained release.
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

export const ASSOCIATION_PATH = ".well-known/apple-app-site-association"
const APP_ID = /^[A-Z0-9]{10}\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/

function onlyKey(value, key) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === 1 && Object.hasOwn(value, key)
}

/** The app identifiers an association names; throws unless it is webcredentials only. */
export function associatedApps(text) {
  const association = JSON.parse(text)
  if (!onlyKey(association, "webcredentials") || !onlyKey(association.webcredentials, "apps")) {
    throw new Error("The association may only declare webcredentials.apps")
  }
  const { apps } = association.webcredentials
  if (!Array.isArray(apps) || apps.length === 0 || !apps.every((app) => typeof app === "string" && APP_ID.test(app))) {
    throw new Error("webcredentials.apps must list application identifiers")
  }
  return apps
}

export async function publishAssociation(source, out) {
  const bytes = await readFile(source)
  associatedApps(bytes.toString("utf8"))
  await mkdir(join(out, ".well-known"))
  await writeFile(join(out, ASSOCIATION_PATH), bytes, { flag: "wx" })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url))
  await publishAssociation(join(root, "hosting/apple-app-site-association.json"), join(root, "dist"))
}
