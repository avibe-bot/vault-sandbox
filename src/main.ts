import "./style.css"
import { RpcServer, RpcError, BUILD, CHANNEL, VERSION, type SandboxOperation } from "./rpc"

// Phase 1: stand up the RPC boundary. Crypto operations are registered so the
// protocol surface is complete, but they fail closed with `not_implemented`
// until the VMK / passkey / signing logic moves in (later phases).

const server = new RpcServer()

// handshake — the parent confirms our build + pins the session. We echo the
// build hash so the parent can compare it against its locally-pinned manifest
// (defence-in-depth; the parent's fetch-and-hash check is the primary proof).
server.register("handshake", (payload) => {
  const p = (payload ?? {}) as Record<string, unknown>
  const expected = typeof p.expectedBuildHash === "string" ? p.expectedBuildHash : null
  if (expected !== null && expected !== BUILD.buildHash) {
    throw new RpcError("build_hash_mismatch", "sandbox build hash does not match parent expectation")
  }
  return {
    accepted: true,
    channel: CHANNEL,
    version: VERSION,
    sandboxOrigin: window.location.origin,
    build: BUILD,
  }
})

// status — reports lock/setup state. Phase 1 has no VMK, so always needs-setup.
server.register("status", () => ({ state: "needs-setup" as const }))

// Crypto operations — registered but not yet implemented. They fail closed so
// no operation silently succeeds without the real crypto behind it.
const NOT_IMPLEMENTED: SandboxOperation[] = [
  "setup",
  "unlock",
  "lock",
  "seal",
  "unseal",
  "sign",
  "releaseDEK",
  "deleteAuthzAssertion",
]
for (const op of NOT_IMPLEMENTED) {
  server.register(op, () => {
    throw new RpcError("not_implemented", `${op} is not available yet in this sandbox build`)
  })
}

server.start()

const status = document.getElementById("status")
if (status) status.textContent = `Avibe Vault Sandbox · v${BUILD.sandboxVersion}`
