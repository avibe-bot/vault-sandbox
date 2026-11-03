import { BUILD, type Appearance } from "./rpc"

/** Fragments never select different HTTP bytes. Legacy query URLs exist only in
 * the separately frozen root snapshot, not in this versioned runtime. */
export function ceremonyParameters(): URLSearchParams {
  return new URLSearchParams((window.location.hash ?? "").slice(1))
}

export function ceremonyUrl(mode: "setup" | "authorize", id: string, appearance: Appearance, extra: Record<string, string> = {}): string {
  const url = new URL(window.location.href)
  if (BUILD.buildHash !== "dev") url.pathname = `/v/${BUILD.buildHash}/index.html`
  url.search = ""
  url.hash = new URLSearchParams({ mode, id, ...appearance, ...extra }).toString()
  return url.toString()
}

export function sameBuild(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const build = value as Record<string, unknown>
  return build.buildHash === BUILD.buildHash && build.sandboxVersion === BUILD.sandboxVersion
}

export async function requireReleaseReady(): Promise<void> {
  if (BUILD.buildHash === "dev") return // Local Vite/tests only; release builder forbids dev.
  const url = new URL(window.location.href)
  if (url.pathname !== `/v/${BUILD.buildHash}/index.html` || url.search) {
    throw new Error("Sandbox release document URL mismatch")
  }
  // CSS SRI failures do not automatically stop JS execution. Refuse ready/RPC
  // startup unless the sole pinned stylesheet actually loaded, so a failed
  // navigation cannot present an unstyled trusted confirmation surface.
  const styles = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  if (styles.length !== 1 || !styles[0].integrity.startsWith("sha256-")
    || !styles[0].href.startsWith(`${url.origin}/v/${BUILD.buildHash}/assets/`)) {
    throw new Error("Sandbox release stylesheet is not pinned")
  }
  const style = styles[0]
  if (style.sheet) return
  // WebKit can run a module while a delayed cross-origin/SRI stylesheet is
  // still loading, even in head. Wait for that one load, not an optimistic
  // ready message. Every terminal path removes listeners and its deadline.
  await new Promise<void>((resolve, reject) => {
    const failed = () => finish(new Error("Sandbox release stylesheet failed integrity or loading"))
    const loaded = () => style.sheet ? finish() : failed()
    const finish = (error?: Error) => {
      clearTimeout(timer)
      style.removeEventListener("load", loaded)
      style.removeEventListener("error", failed)
      window.removeEventListener("load", loaded)
      window.removeEventListener("pagehide", failed)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(failed, 10_000)
    style.addEventListener("load", loaded, { once: true })
    style.addEventListener("error", failed, { once: true })
    window.addEventListener("load", loaded, { once: true })
    window.addEventListener("pagehide", failed, { once: true })
    if (style.sheet || document.readyState === "complete") loaded()
  })
}
