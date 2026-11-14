import { afterEach, describe, expect, it, vi } from "vitest"
import { CHANNEL, RpcServer, VERSION } from "./rpc"

afterEach(() => vi.unstubAllGlobals())
const origin = "https://app.avibe.bot"
const handshake = { channel: CHANNEL, version: VERSION, id: "hello", op: "handshake", payload: { parentOrigin: origin, nonce: "public-nonce-12345678" } }
const request = { channel: CHANNEL, version: VERSION, id: "status", op: "status", payload: {} }
function receiver(server: RpcServer) {
  return (source: unknown, data: unknown, eventOrigin = origin) =>
    (server as unknown as { onMessage(event: unknown): Promise<void> }).onMessage({ source, data, origin: eventOrigin })
}
function fixture(topLevel = false) {
  const parent = { postMessage: vi.fn() }
  const sibling = { postMessage: vi.fn() }
  const win = { parent: parent as unknown }
  if (topLevel) win.parent = win
  vi.stubGlobal("window", win)
  const server = new RpcServer()
  const accepted = vi.fn(() => ({ accepted: true }))
  const status = vi.fn(() => ({}))
  server.register("handshake", accepted)
  server.register("status", status)
  return { parent, sibling, win, server, accepted, status, send: receiver(server) }
}

describe("ordinary RPC actual-parent controller", () => {
  it("refuses an allow-listed opener driving a top-level sandbox", async () => {
    const f = fixture(true)
    await f.send(f.parent, handshake)
    await f.send(f.parent, request)
    expect(f.accepted).not.toHaveBeenCalled()
    expect(f.status).not.toHaveBeenCalled()
    expect(f.parent.postMessage).not.toHaveBeenCalled()
  })
  it("refuses siblings/null before pinning and permits the real parent", async () => {
    const f = fixture()
    await f.send(f.sibling, handshake)
    await f.send(null, handshake)
    expect(f.accepted).not.toHaveBeenCalled()
    await f.send(f.parent, handshake)
    await f.send(f.parent, request)
    expect(f.accepted).toHaveBeenCalledTimes(1)
    expect(f.status).toHaveBeenCalledTimes(1)
    expect(f.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ id: "status", ok: true }), origin)
  })
  it("retains source/origin pinning for reconnect and later requests", async () => {
    const f = fixture()
    await f.send(f.parent, handshake)
    await f.send(f.sibling, request)
    await f.send(f.parent, request, "https://other.avibe.bot")
    await f.send(f.sibling, handshake)
    expect(f.accepted).toHaveBeenCalledTimes(1)
    expect(f.status).not.toHaveBeenCalled()
    await f.send(f.parent, { ...handshake, id: "reconnect" })
    await f.send(f.parent, request)
    expect(f.accepted).toHaveBeenCalledTimes(2)
    expect(f.status).toHaveBeenCalledTimes(1)
  })
  it("does not accept a formerly pinned source after the actual parent changes", async () => {
    const f = fixture()
    await f.send(f.parent, handshake)
    f.win.parent = f.sibling
    await f.send(f.parent, request)
    await f.send(f.sibling, request)
    expect(f.status).not.toHaveBeenCalled()
  })
})
