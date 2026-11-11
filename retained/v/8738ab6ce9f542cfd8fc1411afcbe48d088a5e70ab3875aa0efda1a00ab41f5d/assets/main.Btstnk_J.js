const Ht = "avibe.vault.crypto";
const ie = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "8738ab6ce9f542cfd8fc1411afcbe48d088a5e70ab3875aa0efda1a00ab41f5d"
};
class m extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function zs(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function Hd(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === Ht && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const Nd = /^[A-Za-z0-9_-]{16,128}$/;
function pc(e) {
  return typeof e == "object" && e !== null;
}
function Fd(e) {
  return pc(e) ? e.channel === Ht && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class Kd {
  handlers = /* @__PURE__ */ new Map();
  pinnedParentOrigin = null;
  pinnedSource = null;
  handshakeNonce = null;
  activeSurfaceSlots = /* @__PURE__ */ new Map();
  register(t, n) {
    this.handlers.set(t, n);
  }
  emit(t, n) {
    !this.pinnedSource || this.pinnedParentOrigin === null || this.pinnedSource.postMessage(
      {
        channel: Ht,
        version: 2,
        kind: "event",
        event: t,
        ...n !== void 0 ? { payload: n } : {}
      },
      this.pinnedParentOrigin
    );
  }
  /** Start listening + announce readiness to the embedder. */
  start() {
    window.addEventListener("message", (t) => void this.onMessage(t)), window.parent !== window && this.announceReady();
  }
  announceReady() {
    this.postToParent(window.parent, {
      type: "ready",
      channel: Ht,
      version: 2,
      build: ie,
      capabilities: {
        operations: Array.from(this.handlers.keys())
      }
    });
  }
  async onMessage(t) {
    if (!zs(t.origin)) return;
    if (Fd(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!Hd(t.data)) return;
    const n = t.data, r = this.pinnedParentOrigin === null;
    if (r) {
      const c = this.validateInitialHandshake(n, t.origin);
      if (!c) return;
      this.pinnedParentOrigin = t.origin, this.pinnedSource = t.source, this.handshakeNonce = c;
    } else if (t.origin !== this.pinnedParentOrigin || t.source !== this.pinnedSource || this.handshakeNonce === null)
      return;
    const i = this.handlers.get(n.op);
    if (!i) {
      this.reply(t.source, this.fail(n.id, "unknown_operation")), r && this.clearPin();
      return;
    }
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !Nd.test(n.authorizationWindow))) {
      this.reply(t.source, this.fail(n.id, "invalid_payload", "authorizationWindow is invalid")), r && this.clearPin();
      return;
    }
    let o = n.authorizationWindow;
    const s = {
      ...n.surface !== void 0 ? { surface: this.parentSurface(n.surface) } : {}
    };
    this.activeSurfaceSlots.set(n.id, s);
    const a = {
      ...s.surface ? { surface: s.surface } : {},
      latestSurface: () => s.surface,
      takeAuthorizationWindow: () => {
        const c = o;
        return o = void 0, c;
      }
    };
    try {
      const c = await i(n.payload, a);
      this.reply(t.source, {
        channel: Ht,
        version: 2,
        id: n.id,
        ok: !0,
        result: c
      });
    } catch (c) {
      const u = c instanceof m ? c.code : "internal_error", l = c instanceof m ? c.retryable : !1, d = c instanceof m ? c.message : void 0;
      this.reply(t.source, this.fail(n.id, u, d, l)), r && this.clearPin();
    } finally {
      this.activeSurfaceSlots.delete(n.id);
    }
  }
  validateInitialHandshake(t, n) {
    if (t.op !== "handshake" || !pc(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !zs(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
  }
  clearPin() {
    this.pinnedParentOrigin = null, this.pinnedSource = null, this.handshakeNonce = null, this.activeSurfaceSlots.clear();
  }
  parentSurface(t) {
    return { value: t, receivedAt: Date.now() };
  }
  recordParentSurfaceEvent(t, n) {
    const r = typeof t.id == "string" ? t.id : typeof t.requestId == "string" ? t.requestId : null;
    if (r) {
      const o = this.activeSurfaceSlots.get(r);
      o && (o.surface = this.parentSurface(n));
      return;
    }
    if (this.activeSurfaceSlots.size !== 1) return;
    const [i] = this.activeSurfaceSlots.values();
    i && (i.surface = this.parentSurface(n));
  }
  fail(t, n, r, i = !1) {
    return { channel: Ht, version: 2, id: t, ok: !1, error: { code: n, message: r, retryable: i } };
  }
  reply(t, n) {
    !t || this.pinnedParentOrigin === null || t.postMessage(n, this.pinnedParentOrigin);
  }
  postToParent(t, n) {
    t.postMessage(n, "*");
  }
}
function wo() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function hc(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return ie.buildHash !== "dev" && (i.pathname = `/v/${ie.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function sn(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === ie.buildHash && t.sandboxVersion === ie.sandboxVersion;
}
async function Dd() {
  if (ie.buildHash === "dev") return;
  const e = new URL(window.location.href);
  if (e.pathname !== `/v/${ie.buildHash}/index.html` || e.search)
    throw new Error("Sandbox release document URL mismatch");
  const t = document.querySelectorAll('link[rel="stylesheet"]');
  if (t.length !== 1 || !t[0].integrity.startsWith("sha256-") || !t[0].href.startsWith(`${e.origin}/v/${ie.buildHash}/assets/`))
    throw new Error("Sandbox release stylesheet is not pinned");
  const n = t[0];
  n.sheet || await new Promise((r, i) => {
    const o = () => a(new Error("Sandbox release stylesheet failed integrity or loading")), s = () => n.sheet ? a() : o(), a = (u) => {
      clearTimeout(c), n.removeEventListener("load", s), n.removeEventListener("error", o), window.removeEventListener("load", s), window.removeEventListener("pagehide", o), u ? i(u) : r();
    }, c = setTimeout(o, 1e4);
    n.addEventListener("load", s, { once: !0 }), n.addEventListener("error", o, { once: !0 }), window.addEventListener("load", s, { once: !0 }), window.addEventListener("pagehide", o, { once: !0 }), (n.sheet || document.readyState === "complete") && s();
  });
}
class Ve extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class Ze extends Ve {
}
class Br extends Ve {
}
class ur extends Ve {
}
class jd extends Ve {
}
class Vd extends Ve {
}
class qd extends Ve {
}
class Gd extends Ve {
}
class Wd extends Ve {
}
class Zd extends Ve {
}
class Xd extends Ve {
}
class bo extends Ve {
}
const Yd = {}, yc = Jd(globalThis, Yd);
function Jd(e, t) {
  return new Proxy(e, {
    get(n, r, i) {
      return r in t ? t[r] : e[r];
    },
    set(n, r, i) {
      return r in t && delete t[r], e[r] = i, !0;
    },
    deleteProperty(n, r) {
      let i = !1;
      return r in t && (delete t[r], i = !0), r in e && (delete e[r], i = !0), i;
    },
    ownKeys(n) {
      const r = Reflect.ownKeys(e), i = Reflect.ownKeys(t), o = new Set(i);
      return [...r.filter((s) => !o.has(s)), ...i];
    },
    defineProperty(n, r, i) {
      return r in t && delete t[r], Reflect.defineProperty(e, r, i), !0;
    },
    getOwnPropertyDescriptor(n, r) {
      return r in t ? Reflect.getOwnPropertyDescriptor(t, r) : Reflect.getOwnPropertyDescriptor(e, r);
    },
    has(n, r) {
      return r in t || r in e;
    }
  });
}
async function Qd() {
  if (yc !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Md);
    return e.subtle;
  } catch (e) {
    throw new bo(e);
  }
}
class mo {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await Qd());
  }
}
const bt = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, Us = {
  DhkemX25519HkdfSha256: 32
}, gc = {
  HkdfSha256: 1
}, vo = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, Mr = 8192, ef = 268435456, Ms = 32, me = /* @__PURE__ */ new Uint8Array(0), Xe = 0n, Jt = 1n, lr = 2n, tf = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), Hs = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function $r(e) {
  return new Uint8Array(Z(e));
}
function Z(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class nf extends mo {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gc.HkdfSha256
    }), Object.defineProperty(this, "hashSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "_suiteId", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: me
    }), Object.defineProperty(this, "algHash", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
      }
    });
  }
  init(t) {
    this._suiteId = t;
  }
  buildLabeledIkm(t, n) {
    this._checkInit();
    const r = new Uint8Array(7 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return r.set(Hs, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(Hs, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t);
    if (r.byteLength !== this.hashSize)
      throw new Ze("The salt length must be the same as the hashSize");
    const i = Z(n), o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
  async expand(t, n, r) {
    await this._setup();
    const i = Z(t), o = await this._api.importKey("raw", i, this.algHash, !1, [
      "sign"
    ]), s = new ArrayBuffer(r), a = new Uint8Array(s);
    let c = me;
    const u = $r(n), l = new Uint8Array(1);
    if (r > 255 * this.hashSize)
      throw new Error("Entropy limit reached");
    const d = new Uint8Array(this.hashSize + u.length + 1);
    for (let h = 1, f = 0; f < a.length; h++)
      l[0] = h, d.set(c, 0), d.set(u, c.length), d.set(l, c.length + u.length), c = new Uint8Array(await this._api.sign("HMAC", o, d.slice(0, c.length + u.length + 1))), a.length - f >= c.length ? (a.set(c, f), f += c.length) : (a.set(c.slice(0, a.length - f), f), f += a.length - f);
    return s;
  }
  async extractAndExpand(t, n, r, i) {
    await this._setup();
    const o = Z(n), s = await this._api.importKey("raw", o, "HKDF", !1, ["deriveBits"]);
    return await this._api.deriveBits({
      name: "HKDF",
      hash: this.algHash.hash,
      salt: Z(t),
      info: Z(r)
    }, s, i * 8);
  }
  async labeledExtract(t, n, r) {
    return await this.extract(t, this.buildLabeledIkm(n, r));
  }
  async labeledExpand(t, n, r, i) {
    return await this.expand(t, this.buildLabeledInfo(n, r, i), i);
  }
  _checkInit() {
    if (this._suiteId === me)
      throw new Error("Not initialized. Call init()");
  }
}
class wc extends nf {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gc.HkdfSha256
    }), Object.defineProperty(this, "hashSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 32
    }), Object.defineProperty(this, "algHash", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: {
        name: "HMAC",
        hash: "SHA-256",
        length: 256
      }
    });
  }
}
const _n = (e) => typeof e == "object" && e !== null && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function Mn(e, t) {
  if (t <= 0)
    throw new Error("i2Osp: too small size");
  if (e >= 256 ** t)
    throw new Error("i2Osp: too large integer");
  const n = new Uint8Array(t);
  for (let r = 0; r < t && e; r++)
    n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
  return n;
}
function dr(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function Ns(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function rf() {
  if (typeof yc < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Md);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function of(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const sf = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), af = /* @__PURE__ */ new Uint8Array([
  115,
  104,
  97,
  114,
  101,
  100,
  95,
  115,
  101,
  99,
  114,
  101,
  116
]);
function cf(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class uf {
  constructor(t, n, r) {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "secretSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "encSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "publicKeySize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "privateKeySize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "_prim", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_kdf", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.id = t, this._prim = n, this._kdf = r;
    const i = new Uint8Array(tf);
    i.set(Mn(this.id, 2), 3), this._kdf.init(i);
  }
  async serializePublicKey(t) {
    return await this._prim.serializePublicKey(t);
  }
  async deserializePublicKey(t) {
    return await this._prim.deserializePublicKey(Z(t));
  }
  async serializePrivateKey(t) {
    return await this._prim.serializePrivateKey(t);
  }
  async deserializePrivateKey(t) {
    return await this._prim.deserializePrivateKey(Z(t));
  }
  async importKey(t, n, r = !0) {
    return await this._prim.importKey(t, n, r);
  }
  async generateKeyPair() {
    return await this._prim.generateKeyPair();
  }
  async deriveKeyPair(t) {
    const n = Z(t);
    if (n.byteLength > Mr)
      throw new Ze("Too long ikm");
    return await this._prim.deriveKeyPair(n);
  }
  async encap(t) {
    let n;
    t.ekm === void 0 ? n = await this.generateKeyPair() : _n(t.ekm) ? n = t.ekm : n = await this.deriveKeyPair(t.ekm);
    const r = await this._prim.serializePublicKey(n.publicKey), i = await this._prim.serializePublicKey(t.recipientPublicKey);
    try {
      let o;
      if (t.senderKey === void 0)
        o = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey));
      else {
        const c = _n(t.senderKey) ? t.senderKey.privateKey : t.senderKey, u = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey)), l = new Uint8Array(await this._prim.dh(c, t.recipientPublicKey));
        o = dr(u, l);
      }
      let s;
      if (t.senderKey === void 0)
        s = dr(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = _n(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), u = await this._prim.serializePublicKey(c);
        s = cf(new Uint8Array(r), new Uint8Array(i), new Uint8Array(u));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new jd(o);
    }
  }
  async decap(t) {
    const n = Z(t.enc), r = await this._prim.deserializePublicKey(n), i = _n(t.recipientKey) ? t.recipientKey.privateKey : t.recipientKey, o = _n(t.recipientKey) ? t.recipientKey.publicKey : await this._prim.derivePublicKey(t.recipientKey), s = await this._prim.serializePublicKey(o);
    try {
      let a;
      if (t.senderPublicKey === void 0)
        a = new Uint8Array(await this._prim.dh(i, r));
      else {
        const u = new Uint8Array(await this._prim.dh(i, r)), l = new Uint8Array(await this._prim.dh(i, t.senderPublicKey));
        a = dr(u, l);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = dr(new Uint8Array(n), new Uint8Array(s));
      else {
        const u = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + u.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(u), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new Vd(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(sf, t), i = this._kdf.buildLabeledInfo(af, n, this.secretSize);
    return await this._kdf.extractAndExpand(me, r, i, this.secretSize);
  }
}
const fr = ["deriveBits"], lf = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), df = /* @__PURE__ */ new Uint8Array([115, 107]);
class Qt {
  constructor(t, n, r, i = []) {
    Object.defineProperty(this, "key", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "type", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "extractable", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: !0
    }), Object.defineProperty(this, "algorithm", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "usages", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.key = n, this.type = r, this.algorithm = { name: t }, this.usages = i, r === "public" && (this.usages = []);
  }
}
class ff {
  constructor(t, n, r, i) {
    Object.defineProperty(this, "_algName", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_curve", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_hkdf", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_nPk", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_nSk", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this._algName = t, this._nPk = n, this._nSk = n, this._curve = r, this._hkdf = i;
  }
  serializePublicKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new Br(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(Z(t), !0);
    } catch (n) {
      throw new ur(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new Br(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(Z(t), !1);
    } catch (n) {
      throw new ur(n);
    }
  }
  async importKey(t, n, r) {
    try {
      if (t === "raw")
        return await this._importRawKey(n, r);
      if (n instanceof ArrayBuffer)
        throw new Error("Invalid jwk key format");
      return await this._importJWK(n, r);
    } catch (i) {
      throw new ur(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new Qt(this._algName, t, "private", fr);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new bo(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = Z(t), r = await this._hkdf.labeledExtract(me.buffer, lf, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, df, me, this._nSk), o = new Qt(this._algName, new Uint8Array(i), "private", fr);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new Xd(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new Qt(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new ur(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new Br(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new Qt(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : fr));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new Qt(this._algName, Ns(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new Qt(this._algName, Ns(t.d), "private", fr)));
    });
  }
}
const pf = ["encrypt", "decrypt"];
function hf(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function jn(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function ft(e, t, n = "") {
  const r = hf(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Hr(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function yf(e, t) {
  ft(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function gf(e) {
  if (typeof e == "bigint") {
    if (!Tr(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    jn(e);
  return e;
}
function Nr(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const wf = /* @__PURE__ */ new Uint32Array([287454020]), bf = /* @__PURE__ */ new Uint8Array(wf.buffer);
bf[0];
function Pi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function qe(e, t) {
  return e << 32 - t | e >>> t;
}
const bc = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", mf = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), vf = [
  0n,
  1n,
  2n,
  3n,
  4n,
  5n,
  6n,
  7n,
  8n,
  9n,
  10n,
  11n,
  12n,
  13n,
  14n,
  15n
];
function xf(e) {
  if (ft(e), bc)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += mf[e[n]];
  return t;
}
const at = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Zi(e) {
  if (e >= at._0 && e <= at._9)
    return e - at._0;
  if (e >= at.A && e <= at.F)
    return e - (at.A - 10);
  if (e >= at.a && e <= at.f)
    return e - (at.a - 10);
}
function Ef(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (bc)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Zi(e.charCodeAt(o)), a = Zi(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function kf(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = Xe;
  for (let n = 0; n < e.length; n++) {
    const r = Zi(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | vf[r];
  }
  return t;
}
function Sf(e) {
  jn(e, "numberToBigint");
  let t = e, n = Xe, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function Fs(e) {
  return kf(xf(Xi(ft(e)).reverse()));
}
function Af(e, t) {
  jn(t), e = gf(e);
  const n = Ef(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function _f(e, t) {
  return Af(e, t).reverse();
}
function Xi(e) {
  return Uint8Array.from(e);
}
function Tr(e) {
  return typeof e == "bigint" && Xe <= e;
}
function If(e, t, n) {
  return Tr(e) && Tr(t) && Tr(n) && t <= e && e < n;
}
function Ks(e, t, n, r) {
  if (!If(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Pf(e, t = {}, n = {}) {
  if (!e || typeof e != "object")
    throw new Error("expected valid options object");
  function r(o, s, a) {
    const c = e[o];
    if (a && c === void 0)
      return;
    const u = typeof c;
    if (u !== s || c === null)
      throw new Error(`param "${o}" is invalid: expected ${s}, got ${u}`);
  }
  const i = (o, s) => Object.entries(o).forEach(([a, c]) => r(a, c, s));
  i(t, !1), i(n, !0);
}
async function Bf(e = 32) {
  const t = await rf(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function $f(e) {
  return {
    oid: Uint8Array.from([
      6,
      9,
      96,
      134,
      72,
      1,
      101,
      3,
      4,
      2,
      e
    ])
  };
}
function Tf(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  jn(e.outputLen), jn(e.blockLen);
}
function Of(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let mc = class {
  constructor(t, n) {
    if (Object.defineProperty(this, "oHash", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "iHash", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "blockLen", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "outputLen", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "finished", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: !1
    }), Object.defineProperty(this, "destroyed", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: !1
    }), Tf(t), ft(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Nr(i);
  }
  update(t) {
    return Hr(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Hr(this), ft(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash: n, iHash: r, finished: i, destroyed: o, blockLen: s, outputLen: a } = this;
    return t = t, t.finished = i, t.destroyed = o, t.blockLen = s, t.outputLen = a, t.oHash = n._cloneInto(t.oHash), t.iHash = r._cloneInto(t.iHash), t;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
};
const vc = (e, t, n) => new mc(e, t).update(n).digest();
vc.create = (e, t) => new mc(e, t);
function Rf(e, t, n) {
  return e & t ^ ~e & n;
}
function Lf(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Cf = class {
  constructor(t, n, r, i) {
    Object.defineProperty(this, "blockLen", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "outputLen", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "padOffset", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "isLE", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "buffer", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "view", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "finished", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: !1
    }), Object.defineProperty(this, "length", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "pos", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "destroyed", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: !1
    }), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Pi(this.buffer);
  }
  update(t) {
    Hr(this), ft(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = Pi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Hr(this), yf(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Nr(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, Sf(this.length * 8), o), this.process(r, 0);
    const a = Pi(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const u = c / 4, l = this.get();
    if (u > l.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < u; d++)
      a.setUint32(4 * d, l[d], o);
  }
  digest() {
    const { buffer: t, outputLen: n } = this;
    this.digestInto(t);
    const r = t.slice(0, n);
    return this.destroy(), r;
  }
  _cloneInto(t) {
    t ||= new this.constructor(), t.set(...this.get());
    const { blockLen: n, buffer: r, length: i, finished: o, destroyed: s, pos: a } = this;
    return t.destroyed = s, t.finished = o, t.length = i, t.pos = a, i % n && t.buffer.set(r), t;
  }
  clone() {
    return this._cloneInto();
  }
};
const mt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), zf = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), vt = /* @__PURE__ */ new Uint32Array(64);
let Uf = class extends Cf {
  constructor(t) {
    super(64, t, 8, !1);
  }
  get() {
    const { A: t, B: n, C: r, D: i, E: o, F: s, G: a, H: c } = this;
    return [t, n, r, i, o, s, a, c];
  }
  set(t, n, r, i, o, s, a, c) {
    this.A = t | 0, this.B = n | 0, this.C = r | 0, this.D = i | 0, this.E = o | 0, this.F = s | 0, this.G = a | 0, this.H = c | 0;
  }
  process(t, n) {
    for (let d = 0; d < 16; d++, n += 4)
      vt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = vt[d - 15], f = vt[d - 2], b = qe(h, 7) ^ qe(h, 18) ^ h >>> 3, y = qe(f, 17) ^ qe(f, 19) ^ f >>> 10;
      vt[d] = y + vt[d - 7] + b + vt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = qe(a, 6) ^ qe(a, 11) ^ qe(a, 25), f = l + h + Rf(a, c, u) + zf[d] + vt[d] | 0, y = (qe(r, 2) ^ qe(r, 13) ^ qe(r, 22)) + Lf(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + y | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Nr(vt);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Nr(this.buffer);
  }
}, Mf = class extends Uf {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: mt[7] | 0
    });
  }
};
const Hf = /* @__PURE__ */ Of(
  () => new Mf(),
  /* @__PURE__ */ $f(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function xc(e, t) {
  const n = e % t;
  return n >= Xe ? n : t + n;
}
function Re(e, t, n) {
  let r = e;
  for (; t-- > Xe; )
    r *= r, r %= n;
  return r;
}
function Nf(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Ff(e) {
  return Pf(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function Kf(e) {
  const t = Ff(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || Bf, u = a ? 255n : 448n, l = a ? 32 : 56, d = a ? 9n : 5n, h = a ? 121665n : 39081n, f = a ? lr ** 254n : lr ** 447n, b = a ? 8n * lr ** 251n - Jt : 4n * lr ** 445n - Jt, y = f + b + Jt, p = (k) => xc(k, n), g = v(d);
  function v(k) {
    return _f(p(k), l);
  }
  function A(k) {
    const x = Xi(ft(k, l, "uCoordinate"));
    return a && (x[31] &= 127), p(Fs(x));
  }
  function I(k) {
    return Fs(i(Xi(ft(k, l, "scalar"))));
  }
  function _(k, x) {
    const S = U(A(x), I(k));
    if (S === Xe)
      throw new Error("invalid private or public key received");
    return v(S);
  }
  function O(k) {
    return _(k, g);
  }
  const C = O, R = _;
  function B(k, x, S) {
    const P = p(k * (x - S));
    return x = p(x - P), S = p(S + P), { x_2: x, x_3: S };
  }
  function U(k, x) {
    Ks("u", k, Xe, n), Ks("scalar", x, f, y);
    const S = x, P = k;
    let T = Jt, $ = Xe, L = k, z = Jt, H = Xe;
    for (let N = u - 1n; N >= Xe; N--) {
      const ee = S >> N & Jt;
      H ^= ee, { x_2: T, x_3: L } = B(H, T, L), { x_2: $, x_3: z } = B(H, $, z), H = ee;
      const te = T + $, ne = p(te * te), Y = T - $, ye = p(Y * Y), st = ne - ye, Ct = L + z, Yt = L - z, Sn = p(Yt * te), An = p(Ct * Y), Ls = Sn + An, Cs = Sn - An;
      L = p(Ls * Ls), z = p(P * p(Cs * Cs)), T = p(ne * ye), $ = p(st * (ne + p(h * st)));
    }
    ({ x_2: T, x_3: L } = B(H, T, L)), { x_2: $, x_3: z } = B(H, $, z);
    const G = o($);
    return p(T * G);
  }
  const M = {
    secretKey: l,
    publicKey: l,
    seed: l
  }, w = async (k) => (k === void 0 && (k = await c(l)), ft(k, M.seed, "seed"), k), E = { randomSecretKey: w };
  return Object.freeze({
    keygen: Nf(w, C),
    getSharedSecret: R,
    getPublicKey: C,
    scalarMult: _,
    scalarMultBase: O,
    utils: E,
    GuBytes: g.slice(),
    lengths: M
  });
}
class Df extends mo {
  constructor(t) {
    super(), Object.defineProperty(this, "_rawKey", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_key", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this._rawKey = Z(t);
  }
  async seal(t, n, r) {
    await this._setupKey();
    const i = {
      name: "AES-GCM",
      iv: Z(t),
      additionalData: Z(r)
    };
    return await this._api.encrypt(i, this._key, Z(n));
  }
  async open(t, n, r) {
    await this._setupKey();
    const i = {
      name: "AES-GCM",
      iv: Z(t),
      additionalData: Z(r)
    };
    return await this._api.decrypt(i, this._key, Z(n));
  }
  async _setupKey() {
    if (this._key !== void 0)
      return;
    await this._setup();
    const t = await this._importKey(this._rawKey);
    new Uint8Array(this._rawKey).fill(0), this._key = t;
  }
  async _importKey(t) {
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, pf);
  }
}
class jf {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: vo.Aes128Gcm
    }), Object.defineProperty(this, "keySize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 16
    }), Object.defineProperty(this, "nonceSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 12
    }), Object.defineProperty(this, "tagSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 16
    });
  }
  createEncryptionContext(t) {
    return new Df(t);
  }
}
class Vf extends jf {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: vo.Aes256Gcm
    }), Object.defineProperty(this, "keySize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 32
    }), Object.defineProperty(this, "nonceSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 12
    }), Object.defineProperty(this, "tagSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 16
    });
  }
}
function Ds() {
  return new Promise((e, t) => {
    t(new bo("Not supported"));
  });
}
const qf = new Uint8Array([115, 101, 99]);
class xo {
  constructor(t, n, r) {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "exporterSecret", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_kdf", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this._api = t, this._kdf = n, this.exporterSecret = r;
  }
  async seal(t, n) {
    return await Ds();
  }
  async open(t, n) {
    return await Ds();
  }
  async export(t, n) {
    const r = Z(t);
    if (r.byteLength > Mr)
      throw new Ze("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, qf, new Uint8Array(r), n);
    } catch (i) {
      throw new qd(i);
    }
  }
}
class Gf extends xo {
}
class Wf extends xo {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Ec extends xo {
  constructor(t, n, r) {
    if (super(t, n, r.exporterSecret), Object.defineProperty(this, "_aead", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_nK", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_nN", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_nT", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_ctx", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), r.key === void 0 || r.baseNonce === void 0 || r.seq === void 0)
      throw new Error("Required parameters are missing");
    this._aead = r.aead, this._nK = this._aead.keySize, this._nN = this._aead.nonceSize, this._nT = this._aead.tagSize;
    const i = this._aead.createEncryptionContext(r.key);
    this._ctx = {
      key: i,
      baseNonce: r.baseNonce,
      seq: r.seq
    };
  }
  computeNonce(t) {
    const n = Mn(t.seq, t.baseNonce.byteLength);
    return of(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new Zd("Message limit reached");
    t.seq += 1;
  }
}
var Zf = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Xf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Or;
class kc {
  constructor() {
    Or.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = Zf(this, Or, "f");
    return Xf(this, Or, n, "f"), await r, t;
  }
}
Or = /* @__PURE__ */ new WeakMap();
var js = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Yf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Rn;
class Jf extends Ec {
  constructor() {
    super(...arguments), Rn.set(this, void 0);
  }
  async open(t, n = me.buffer) {
    Yf(this, Rn, js(this, Rn, "f") ?? new kc(), "f");
    const r = await js(this, Rn, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new Wd(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
Rn = /* @__PURE__ */ new WeakMap();
var Vs = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Qf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Ln;
class ep extends Ec {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Ln.set(this, void 0), this.enc = i;
  }
  async seal(t, n = me.buffer) {
    Qf(this, Ln, Vs(this, Ln, "f") ?? new kc(), "f");
    const r = await Vs(this, Ln, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new Gd(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
Ln = /* @__PURE__ */ new WeakMap();
const tp = new Uint8Array([
  98,
  97,
  115,
  101,
  95,
  110,
  111,
  110,
  99,
  101
]), np = new Uint8Array([101, 120, 112]), rp = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), ip = new Uint8Array([107, 101, 121]), op = new Uint8Array([
  112,
  115,
  107,
  95,
  105,
  100,
  95,
  104,
  97,
  115,
  104
]), sp = new Uint8Array([115, 101, 99, 114, 101, 116]), ap = new Uint8Array([
  72,
  80,
  75,
  69,
  0,
  0,
  0,
  0,
  0,
  0
]);
class cp extends mo {
  /**
   * @param params A set of parameters for building a cipher suite.
   *
   * If the error occurred, throws {@link InvalidParamError}.
   *
   * @throws {@link InvalidParamError}
   */
  constructor(t) {
    if (super(), Object.defineProperty(this, "_kem", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_kdf", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_aead", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "_suiteId", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), typeof t.kem == "number")
      throw new Ze("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new Ze("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new Ze("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(ap), this._suiteId.set(Mn(this._kem.id, 2), 4), this._suiteId.set(Mn(this._kdf.id, 2), 6), this._suiteId.set(Mn(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
  }
  /**
   * Gets the KEM context of the ciphersuite.
   */
  get kem() {
    return this._kem;
  }
  /**
   * Gets the KDF context of the ciphersuite.
   */
  get kdf() {
    return this._kdf;
  }
  /**
   * Gets the AEAD context of the ciphersuite.
   */
  get aead() {
    return this._aead;
  }
  /**
   * Creates an encryption context for a sender.
   *
   * If the error occurred, throws {@link DecapError} | {@link ValidationError}.
   *
   * @param params A set of parameters for the sender encryption context.
   * @returns A sender encryption context.
   * @throws {@link EncapError}, {@link ValidationError}
   */
  async createSenderContext(t) {
    this._validateInputLength(t), await this._setup();
    const n = await this._kem.encap(t);
    let r;
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? bt.AuthPsk : bt.Psk : r = t.senderKey !== void 0 ? bt.Auth : bt.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
  }
  /**
   * Creates an encryption context for a recipient.
   *
   * If the error occurred, throws {@link DecapError}
   * | {@link DeserializeError} | {@link ValidationError}.
   *
   * @param params A set of parameters for the recipient encryption context.
   * @returns A recipient encryption context.
   * @throws {@link DecapError}, {@link DeserializeError}, {@link ValidationError}
   */
  async createRecipientContext(t) {
    this._validateInputLength(t), await this._setup();
    const n = await this._kem.decap(t);
    let r;
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? bt.AuthPsk : bt.Psk : r = t.senderPublicKey !== void 0 ? bt.Auth : bt.Base, await this._keyScheduleR(r, n, t);
  }
  /**
   * Encrypts a message to a recipient.
   *
   * If the error occurred, throws `EncapError` | `MessageLimitReachedError` | `SealError` | `ValidationError`.
   *
   * @param params A set of parameters for building a sender encryption context.
   * @param pt A plain text as bytes to be encrypted.
   * @param aad Additional authenticated data as bytes fed by an application.
   * @returns A cipher text and an encapsulated key as bytes.
   * @throws {@link EncapError}, {@link MessageLimitReachedError}, {@link SealError}, {@link ValidationError}
   */
  async seal(t, n, r = me.buffer) {
    const i = await this.createSenderContext(t);
    return {
      ct: await i.seal(n, r),
      enc: i.enc
    };
  }
  /**
   * Decrypts a message from a sender.
   *
   * If the error occurred, throws `DecapError` | `DeserializeError` | `OpenError` | `ValidationError`.
   *
   * @param params A set of parameters for building a recipient encryption context.
   * @param ct An encrypted text as bytes to be decrypted.
   * @param aad Additional authenticated data as bytes fed by an application.
   * @returns A decrypted plain text as bytes.
   * @throws {@link DecapError}, {@link DeserializeError}, {@link OpenError}, {@link ValidationError}
   */
  async open(t, n, r = me.buffer) {
    return await (await this.createRecipientContext(t)).open(n, r);
  }
  // private verifyPskInputs(mode: Mode, params: KeyScheduleParams) {
  //   const gotPsk = (params.psk !== undefined);
  //   const gotPskId = (params.psk !== undefined && params.psk.id.byteLength > 0);
  //   if (gotPsk !== gotPskId) {
  //     throw new Error('Inconsistent PSK inputs');
  //   }
  //   if (gotPsk && (mode === Mode.Base || mode === Mode.Auth)) {
  //     throw new Error('PSK input provided when not needed');
  //   }
  //   if (!gotPsk && (mode === Mode.Psk || mode === Mode.AuthPsk)) {
  //     throw new Error('Missing required PSK input');
  //   }
  //   return;
  // }
  async _keySchedule(t, n, r) {
    const i = r.psk === void 0 ? me : $r(r.psk.id), o = await this._kdf.labeledExtract(me, op, i), s = r.info === void 0 ? me : $r(r.info), a = await this._kdf.labeledExtract(me, rp, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const u = r.psk === void 0 ? me : $r(r.psk.key), l = this._kdf.buildLabeledIkm(sp, u), d = this._kdf.buildLabeledInfo(np, c, this._kdf.hashSize), h = await this._kdf.extractAndExpand(n, l, d, this._kdf.hashSize);
    if (this._aead.id === vo.ExportOnly)
      return { aead: this._aead, exporterSecret: h };
    const f = this._kdf.buildLabeledInfo(ip, c, this._aead.keySize), b = await this._kdf.extractAndExpand(n, l, f, this._aead.keySize), y = this._kdf.buildLabeledInfo(tp, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, l, y, this._aead.nonceSize);
    return {
      aead: this._aead,
      exporterSecret: h,
      key: b,
      baseNonce: new Uint8Array(p),
      seq: 0
    };
  }
  async _keyScheduleS(t, n, r, i) {
    const o = await this._keySchedule(t, n, i);
    return o.key === void 0 ? new Wf(this._api, this._kdf, o.exporterSecret, r) : new ep(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new Gf(this._api, this._kdf, i.exporterSecret) : new Jf(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > ef)
      throw new Ze("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < Ms)
        throw new Ze(`PSK must have at least ${Ms} bytes`);
      if (t.psk.key.byteLength > Mr)
        throw new Ze("Too long psk.key");
      if (t.psk.id.byteLength > Mr)
        throw new Ze("Too long psk.id");
    }
  }
}
class up extends cp {
}
let lp = class extends wc {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const dp = 1n, qs = 2n, fp = 3n, pp = 5n, Sc = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function hp(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = Sc, a = e * e % o * e % o, c = Re(a, qs, o) * a % o, u = Re(c, dp, o) * e % o, l = Re(u, pp, o) * u % o, d = Re(l, t, o) * l % o, h = Re(d, n, o) * d % o, f = Re(h, r, o) * h % o, b = Re(f, i, o) * f % o, y = Re(b, i, o) * f % o, p = Re(y, t, o) * l % o;
  return { pow_p_5_8: Re(p, qs, o) * e % o, b2: a };
}
function yp(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const gp = /* @__PURE__ */ (() => {
  const e = Sc;
  return Kf({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = hp(t);
      return xc(Re(n, fp, e) * r, e);
    },
    adjustScalarBytes: yp
  });
})();
class wp extends wc {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t), i = Z(n);
    if (r.byteLength !== this.hashSize)
      return vc(Hf, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class bp extends ff {
  constructor(t) {
    super("X25519", 32, gp, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new Br(r));
    }
  }
}
class mp extends uf {
  constructor() {
    const t = new wp();
    super(Us.DhkemX25519HkdfSha256, new bp(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Us.DhkemX25519HkdfSha256
    }), Object.defineProperty(this, "secretSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 32
    }), Object.defineProperty(this, "encSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 32
    }), Object.defineProperty(this, "publicKeySize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 32
    }), Object.defineProperty(this, "privateKeySize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 32
    });
  }
}
function Ac(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function et(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function tt(e, t, n = "") {
  const r = Ac(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, u = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(u) : new TypeError(u);
  }
  return e;
}
function _c(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (et(e.outputLen), et(e.blockLen), e.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (e.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function dn(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Eo(e, t) {
  tt(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function vp(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function nt(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Bi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Ge(e, t) {
  return e << 32 - t | e >>> t;
}
function pr(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const xp = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Ep(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function kp(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Ep(e[t]);
  return e;
}
const Gs = xp ? (e) => e : kp, Ic = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Sp = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function ko(e) {
  if (tt(e), Ic)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Sp[e[n]];
  return t;
}
const ct = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Ws(e) {
  if (e >= ct._0 && e <= ct._9)
    return e - ct._0;
  if (e >= ct.A && e <= ct.F)
    return e - (ct.A - 10);
  if (e >= ct.a && e <= ct.f)
    return e - (ct.a - 10);
}
function So(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Ic)
    try {
      return Uint8Array.fromHex(e);
    } catch (i) {
      throw i instanceof SyntaxError ? new RangeError(i.message) : i;
    }
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Ws(e.charCodeAt(o)), a = Ws(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Ap(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    tt(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function ui(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function Ao(e = 32) {
  et(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const Pc = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function _p(e, t, n) {
  return e & t ^ ~e & n;
}
function Ip(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let _o = class {
  blockLen;
  outputLen;
  canXOF = !1;
  padOffset;
  isLE;
  // For partial updates less than block size
  buffer;
  view;
  finished = !1;
  length = 0;
  pos = 0;
  destroyed = !1;
  constructor(t, n, r, i) {
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Bi(this.buffer);
  }
  update(t) {
    dn(this), tt(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = Bi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    dn(this), Eo(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, nt(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = Bi(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const u = c / 4, l = this.get();
    if (u > l.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < u; d++)
      a.setUint32(4 * d, l[d], o);
  }
  digest() {
    const { buffer: t, outputLen: n } = this;
    this.digestInto(t);
    const r = t.slice(0, n);
    return this.destroy(), r;
  }
  _cloneInto(t) {
    t ||= new this.constructor(), t.set(...this.get());
    const { blockLen: n, buffer: r, length: i, finished: o, destroyed: s, pos: a } = this;
    return t.destroyed = s, t.finished = o, t.length = i, t.pos = a, i % n && t.buffer.set(r), t;
  }
  clone() {
    return this._cloneInto();
  }
};
const xt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), we = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  4089235720,
  3144134277,
  2227873595,
  1013904242,
  4271175723,
  2773480762,
  1595750129,
  1359893119,
  2917565137,
  2600822924,
  725511199,
  528734635,
  4215389547,
  1541459225,
  327033209
]), hr = /* @__PURE__ */ BigInt(2 ** 32 - 1), Zs = /* @__PURE__ */ BigInt(32);
function Pp(e, t = !1) {
  return t ? { h: Number(e & hr), l: Number(e >> Zs & hr) } : { h: Number(e >> Zs & hr) | 0, l: Number(e & hr) | 0 };
}
function Bc(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Pp(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Xs = (e, t, n) => e >>> n, Ys = (e, t, n) => e << 32 - n | t >>> n, en = (e, t, n) => e >>> n | t << 32 - n, tn = (e, t, n) => e << 32 - n | t >>> n, yr = (e, t, n) => e << 64 - n | t >>> n - 32, gr = (e, t, n) => e >>> n - 32 | t << 64 - n, Bp = (e, t, n) => e << n | t >>> 32 - n, $p = (e, t, n) => t << n | e >>> 32 - n, Tp = (e, t, n) => t << n - 32 | e >>> 64 - n, Op = (e, t, n) => e << n - 32 | t >>> 64 - n;
function ut(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Rp = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), Lp = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, Cp = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), zp = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, Up = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), Mp = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, Hp = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), Et = /* @__PURE__ */ new Uint32Array(64);
class Np extends _o {
  constructor(t) {
    super(64, t, 8, !1);
  }
  get() {
    const { A: t, B: n, C: r, D: i, E: o, F: s, G: a, H: c } = this;
    return [t, n, r, i, o, s, a, c];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c) {
    this.A = t | 0, this.B = n | 0, this.C = r | 0, this.D = i | 0, this.E = o | 0, this.F = s | 0, this.G = a | 0, this.H = c | 0;
  }
  process(t, n) {
    for (let d = 0; d < 16; d++, n += 4)
      Et[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = Et[d - 15], f = Et[d - 2], b = Ge(h, 7) ^ Ge(h, 18) ^ h >>> 3, y = Ge(f, 17) ^ Ge(f, 19) ^ f >>> 10;
      Et[d] = y + Et[d - 7] + b + Et[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = Ge(a, 6) ^ Ge(a, 11) ^ Ge(a, 25), f = l + h + _p(a, c, u) + Hp[d] + Et[d] | 0, y = (Ge(r, 2) ^ Ge(r, 13) ^ Ge(r, 22)) + Ip(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + y | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    nt(Et);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), nt(this.buffer);
  }
}
class Fp extends Np {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = xt[0] | 0;
  B = xt[1] | 0;
  C = xt[2] | 0;
  D = xt[3] | 0;
  E = xt[4] | 0;
  F = xt[5] | 0;
  G = xt[6] | 0;
  H = xt[7] | 0;
  constructor() {
    super(32);
  }
}
const $c = Bc([
  "0x428a2f98d728ae22",
  "0x7137449123ef65cd",
  "0xb5c0fbcfec4d3b2f",
  "0xe9b5dba58189dbbc",
  "0x3956c25bf348b538",
  "0x59f111f1b605d019",
  "0x923f82a4af194f9b",
  "0xab1c5ed5da6d8118",
  "0xd807aa98a3030242",
  "0x12835b0145706fbe",
  "0x243185be4ee4b28c",
  "0x550c7dc3d5ffb4e2",
  "0x72be5d74f27b896f",
  "0x80deb1fe3b1696b1",
  "0x9bdc06a725c71235",
  "0xc19bf174cf692694",
  "0xe49b69c19ef14ad2",
  "0xefbe4786384f25e3",
  "0x0fc19dc68b8cd5b5",
  "0x240ca1cc77ac9c65",
  "0x2de92c6f592b0275",
  "0x4a7484aa6ea6e483",
  "0x5cb0a9dcbd41fbd4",
  "0x76f988da831153b5",
  "0x983e5152ee66dfab",
  "0xa831c66d2db43210",
  "0xb00327c898fb213f",
  "0xbf597fc7beef0ee4",
  "0xc6e00bf33da88fc2",
  "0xd5a79147930aa725",
  "0x06ca6351e003826f",
  "0x142929670a0e6e70",
  "0x27b70a8546d22ffc",
  "0x2e1b21385c26c926",
  "0x4d2c6dfc5ac42aed",
  "0x53380d139d95b3df",
  "0x650a73548baf63de",
  "0x766a0abb3c77b2a8",
  "0x81c2c92e47edaee6",
  "0x92722c851482353b",
  "0xa2bfe8a14cf10364",
  "0xa81a664bbc423001",
  "0xc24b8b70d0f89791",
  "0xc76c51a30654be30",
  "0xd192e819d6ef5218",
  "0xd69906245565a910",
  "0xf40e35855771202a",
  "0x106aa07032bbd1b8",
  "0x19a4c116b8d2d0c8",
  "0x1e376c085141ab53",
  "0x2748774cdf8eeb99",
  "0x34b0bcb5e19b48a8",
  "0x391c0cb3c5c95a63",
  "0x4ed8aa4ae3418acb",
  "0x5b9cca4f7763e373",
  "0x682e6ff3d6b2b8a3",
  "0x748f82ee5defb2fc",
  "0x78a5636f43172f60",
  "0x84c87814a1f0ab72",
  "0x8cc702081a6439ec",
  "0x90befffa23631e28",
  "0xa4506cebde82bde9",
  "0xbef9a3f7b2c67915",
  "0xc67178f2e372532b",
  "0xca273eceea26619c",
  "0xd186b8c721c0c207",
  "0xeada7dd6cde0eb1e",
  "0xf57d4f7fee6ed178",
  "0x06f067aa72176fba",
  "0x0a637dc5a2c898a6",
  "0x113f9804bef90dae",
  "0x1b710b35131c471b",
  "0x28db77f523047d84",
  "0x32caab7b40c72493",
  "0x3c9ebe0a15c9bebc",
  "0x431d67c49c100d4c",
  "0x4cc5d4becb3e42b6",
  "0x597f299cfc657e2a",
  "0x5fcb6fab3ad6faec",
  "0x6c44198c4a475817"
].map((e) => BigInt(e))), Kp = $c[0], Dp = $c[1], kt = /* @__PURE__ */ new Uint32Array(80), St = /* @__PURE__ */ new Uint32Array(80);
class jp extends _o {
  constructor(t) {
    super(128, t, 16, !1);
  }
  // prettier-ignore
  get() {
    const { Ah: t, Al: n, Bh: r, Bl: i, Ch: o, Cl: s, Dh: a, Dl: c, Eh: u, El: l, Fh: d, Fl: h, Gh: f, Gl: b, Hh: y, Hl: p } = this;
    return [t, n, r, i, o, s, a, c, u, l, d, h, f, b, y, p];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c, u, l, d, h, f, b, y, p) {
    this.Ah = t | 0, this.Al = n | 0, this.Bh = r | 0, this.Bl = i | 0, this.Ch = o | 0, this.Cl = s | 0, this.Dh = a | 0, this.Dl = c | 0, this.Eh = u | 0, this.El = l | 0, this.Fh = d | 0, this.Fl = h | 0, this.Gh = f | 0, this.Gl = b | 0, this.Hh = y | 0, this.Hl = p | 0;
  }
  process(t, n) {
    for (let A = 0; A < 16; A++, n += 4)
      kt[A] = t.getUint32(n), St[A] = t.getUint32(n += 4);
    for (let A = 16; A < 80; A++) {
      const I = kt[A - 15] | 0, _ = St[A - 15] | 0, O = en(I, _, 1) ^ en(I, _, 8) ^ Xs(I, _, 7), C = tn(I, _, 1) ^ tn(I, _, 8) ^ Ys(I, _, 7), R = kt[A - 2] | 0, B = St[A - 2] | 0, U = en(R, B, 19) ^ yr(R, B, 61) ^ Xs(R, B, 6), M = tn(R, B, 19) ^ gr(R, B, 61) ^ Ys(R, B, 6), w = Cp(C, M, St[A - 7], St[A - 16]), E = zp(w, O, U, kt[A - 7], kt[A - 16]);
      kt[A] = E | 0, St[A] = w | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: u, Dl: l, Eh: d, El: h, Fh: f, Fl: b, Gh: y, Gl: p, Hh: g, Hl: v } = this;
    for (let A = 0; A < 80; A++) {
      const I = en(d, h, 14) ^ en(d, h, 18) ^ yr(d, h, 41), _ = tn(d, h, 14) ^ tn(d, h, 18) ^ gr(d, h, 41), O = d & f ^ ~d & y, C = h & b ^ ~h & p, R = Up(v, _, C, Dp[A], St[A]), B = Mp(R, g, I, O, Kp[A], kt[A]), U = R | 0, M = en(r, i, 28) ^ yr(r, i, 34) ^ yr(r, i, 39), w = tn(r, i, 28) ^ gr(r, i, 34) ^ gr(r, i, 39), E = r & o ^ r & a ^ o & a, k = i & s ^ i & c ^ s & c;
      g = y | 0, v = p | 0, y = f | 0, p = b | 0, f = d | 0, b = h | 0, { h: d, l: h } = ut(u | 0, l | 0, B | 0, U | 0), u = a | 0, l = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const x = Rp(U, w, k);
      r = Lp(x, B, M, E), i = x | 0;
    }
    ({ h: r, l: i } = ut(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = ut(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = ut(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: u, l } = ut(this.Dh | 0, this.Dl | 0, u | 0, l | 0), { h: d, l: h } = ut(this.Eh | 0, this.El | 0, d | 0, h | 0), { h: f, l: b } = ut(this.Fh | 0, this.Fl | 0, f | 0, b | 0), { h: y, l: p } = ut(this.Gh | 0, this.Gl | 0, y | 0, p | 0), { h: g, l: v } = ut(this.Hh | 0, this.Hl | 0, g | 0, v | 0), this.set(r, i, o, s, a, c, u, l, d, h, f, b, y, p, g, v);
  }
  roundClean() {
    nt(kt, St);
  }
  destroy() {
    this.destroyed = !0, nt(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class Vp extends jp {
  Ah = we[0] | 0;
  Al = we[1] | 0;
  Bh = we[2] | 0;
  Bl = we[3] | 0;
  Ch = we[4] | 0;
  Cl = we[5] | 0;
  Dh = we[6] | 0;
  Dl = we[7] | 0;
  Eh = we[8] | 0;
  El = we[9] | 0;
  Fh = we[10] | 0;
  Fl = we[11] | 0;
  Gh = we[12] | 0;
  Gl = we[13] | 0;
  Hh = we[14] | 0;
  Hl = we[15] | 0;
  constructor() {
    super(64);
  }
}
const ue = /* @__PURE__ */ ui(
  () => new Fp(),
  /* @__PURE__ */ Pc(1)
), qp = /* @__PURE__ */ ui(
  () => new Vp(),
  /* @__PURE__ */ Pc(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const q = (e, t, n) => tt(e, t, n), Tc = et, X = ko, $e = (...e) => Ap(...e), fn = (e) => So(e), Io = Ac, Po = (e) => Ao(e), Fr = /* @__PURE__ */ BigInt(0), Yi = /* @__PURE__ */ BigInt(1);
function Rt(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function Bo(e) {
  if (typeof e == "bigint") {
    if (!Rr(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    Tc(e);
  return e;
}
function Kr(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function wr(e) {
  const t = Bo(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Oc(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? Fr : BigInt("0x" + e);
}
function or(e) {
  return Oc(ko(e));
}
function pn(e) {
  return Oc(ko(Ji(tt(e)).reverse()));
}
function $o(e, t) {
  if (et(t), t === 0)
    throw new RangeError("zero length");
  e = Bo(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return So(n.padStart(t * 2, "0"));
}
function Rc(e, t) {
  return $o(e, t).reverse();
}
function Gp(e, t) {
  if (e = q(e), t = q(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function Ji(e) {
  return Uint8Array.from(q(e));
}
function Wp(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const Rr = (e) => typeof e == "bigint" && Fr <= e;
function Zp(e, t, n) {
  return Rr(e) && Rr(t) && Rr(n) && t <= e && e < n;
}
function Dr(e, t, n, r) {
  if (!Zp(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function To(e) {
  if (e < Fr)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > Fr; e >>= Yi, t += 1)
    ;
  return t;
}
const Oo = (e) => (Yi << BigInt(e)) - Yi;
function Xp(e, t, n) {
  if (et(e, "hashLen"), et(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), u = r(e), l = 0;
  const d = () => {
    c.fill(1), u.fill(0), l = 0;
  }, h = (...p) => n(u, $e(c, ...p)), f = (p = i) => {
    u = h(o, p), c = h(), p.length !== 0 && (u = h(s, p), c = h());
  }, b = () => {
    if (l++ >= a)
      throw new Error("drbg: tried max amount of iterations");
    let p = 0;
    const g = [];
    for (; p < t; ) {
      c = h();
      const v = c.slice();
      g.push(v), p += c.length;
    }
    return $e(...g);
  };
  return (p, g) => {
    d(), f(p);
    let v;
    for (; (v = g(b())) === void 0; )
      f();
    return d(), v;
  };
}
function mn(e, t = {}, n = {}) {
  if (Object.prototype.toString.call(e) !== "[object Object]")
    throw new TypeError("expected valid options object");
  function r(o, s, a) {
    if (!a && s !== "function" && !Object.hasOwn(e, o))
      throw new TypeError(`param "${o}" is invalid: expected own property`);
    const c = e[o];
    if (a && c === void 0)
      return;
    const u = typeof c;
    if (u !== s || c === null)
      throw new TypeError(`param "${o}" is invalid: expected ${s}, got ${u}`);
  }
  const i = (o, s) => Object.entries(o).forEach(([a, c]) => r(a, c, s));
  i(t, !1), i(n, !0);
}
const Js = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const be = /* @__PURE__ */ BigInt(0), oe = /* @__PURE__ */ BigInt(1), Nt = /* @__PURE__ */ BigInt(2), Lc = /* @__PURE__ */ BigInt(3), Cc = /* @__PURE__ */ BigInt(4), zc = /* @__PURE__ */ BigInt(5), Yp = /* @__PURE__ */ BigInt(7), Uc = /* @__PURE__ */ BigInt(8), Jp = /* @__PURE__ */ BigInt(9), Mc = /* @__PURE__ */ BigInt(16);
function ce(e, t) {
  if (t <= be)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= be ? n : t + n;
}
function re(e, t, n) {
  if (t < be)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let r = e;
  for (; t-- > be; )
    r *= r, r %= n;
  return r;
}
function Qs(e, t) {
  if (e === be)
    throw new Error("invert: expected non-zero number");
  if (t <= be)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = ce(e, t), r = t, i = be, o = oe;
  for (; n !== be; ) {
    const a = r / n, c = r - n * a, u = i - o * a;
    r = n, n = c, i = o, o = u;
  }
  if (r !== oe)
    throw new Error("invert: does not exist");
  return ce(i, t);
}
function Ro(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function Hc(e, t) {
  const n = e, r = (n.ORDER + oe) / Cc, i = n.pow(t, r);
  return Ro(n, i, t), i;
}
function Qp(e, t) {
  const n = e, r = (n.ORDER - zc) / Uc, i = n.mul(t, Nt), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, Nt), o), c = n.mul(s, n.sub(a, n.ONE));
  return Ro(n, c, t), c;
}
function eh(e) {
  const t = li(e), n = Nc(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + Yp) / Mc;
  return ((a, c) => {
    const u = a;
    let l = u.pow(c, s), d = u.mul(l, r);
    const h = u.mul(l, i), f = u.mul(l, o), b = u.eql(u.sqr(d), c), y = u.eql(u.sqr(h), c);
    l = u.cmov(l, d, b), d = u.cmov(f, h, y);
    const p = u.eql(u.sqr(d), c), g = u.cmov(l, d, p);
    return Ro(u, g, c), g;
  });
}
function Nc(e) {
  if (e < Lc)
    throw new Error("sqrt is not defined for small field");
  let t = e - oe, n = 0;
  for (; t % Nt === be; )
    t /= Nt, n++;
  let r = Nt;
  const i = li(e);
  for (; ea(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return Hc;
  let o = i.pow(r, t);
  const s = (t + oe) / Nt;
  return function(c, u) {
    const l = c;
    if (l.is0(u))
      return u;
    if (ea(l, u) !== 1)
      throw new Error("Cannot find square root");
    let d = n, h = l.mul(l.ONE, o), f = l.pow(u, t), b = l.pow(u, s);
    for (; !l.eql(f, l.ONE); ) {
      if (l.is0(f))
        return l.ZERO;
      let y = 1, p = l.sqr(f);
      for (; !l.eql(p, l.ONE); )
        if (y++, p = l.sqr(p), y === d)
          throw new Error("Cannot find square root");
      const g = oe << BigInt(d - y - 1), v = l.pow(h, g);
      d = y, h = l.sqr(v), f = l.mul(f, h), b = l.mul(b, v);
    }
    return b;
  };
}
function th(e) {
  return e % Cc === Lc ? Hc : e % Uc === zc ? Qp : e % Mc === Jp ? eh(e) : Nc(e);
}
const zt = (e, t) => (ce(e, t) & oe) === oe, nh = [
  "create",
  "isValid",
  "is0",
  "neg",
  "inv",
  "sqrt",
  "sqr",
  "eql",
  "add",
  "sub",
  "mul",
  "pow",
  "div",
  "addN",
  "subN",
  "mulN",
  "sqrN"
];
function rh(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = nh.reduce((r, i) => (r[i] = "function", r), t);
  if (mn(e, n), Kr(e.BYTES, "BYTES"), Kr(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= oe)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function ih(e, t, n) {
  const r = e;
  if (n < be)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === be)
    return r.ONE;
  if (n === oe)
    return t;
  let i = r.ONE, o = t;
  for (; n > be; )
    n & oe && (i = r.mul(i, o)), o = r.sqr(o), n >>= oe;
  return i;
}
function Fc(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, u) => r.is0(c) ? a : (i[u] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, u) => r.is0(c) ? a : (i[u] = r.mul(a, i[u]), r.mul(a, c)), s), i;
}
function ea(e, t) {
  const n = e, r = (n.ORDER - oe) / Nt, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function oh(e, t) {
  if (t !== void 0 && Tc(t), e <= be)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = To(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const ta = /* @__PURE__ */ new WeakMap();
class Kc {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = be;
  ONE = oe;
  _lengths;
  _mod;
  constructor(t, n = {}) {
    if (t <= oe)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: n.sqrt, enumerable: !0 }), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = Object.freeze(n.allowedLengths.slice())), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: i, nByteLength: o } = oh(t, r);
    if (o > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = i, this.BYTES = o, Object.freeze(this);
  }
  create(t) {
    return ce(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof t);
    return be <= t && t < this.ORDER;
  }
  is0(t) {
    return t === be;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & oe) === oe;
  }
  neg(t) {
    return ce(-t, this.ORDER);
  }
  eql(t, n) {
    return t === n;
  }
  sqr(t) {
    return ce(t * t, this.ORDER);
  }
  add(t, n) {
    return ce(t + n, this.ORDER);
  }
  sub(t, n) {
    return ce(t - n, this.ORDER);
  }
  mul(t, n) {
    return ce(t * n, this.ORDER);
  }
  pow(t, n) {
    return ih(this, t, n);
  }
  div(t, n) {
    return ce(t * Qs(n, this.ORDER), this.ORDER);
  }
  // Same as above, but doesn't normalize
  sqrN(t) {
    return t * t;
  }
  addN(t, n) {
    return t + n;
  }
  subN(t, n) {
    return t - n;
  }
  mulN(t, n) {
    return t * n;
  }
  inv(t) {
    return Qs(t, this.ORDER);
  }
  sqrt(t) {
    let n = ta.get(this);
    return n || ta.set(this, n = th(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? Rc(t, this.BYTES) : $o(t, this.BYTES);
  }
  fromBytes(t, n = !1) {
    q(t);
    const { _lengths: r, BYTES: i, isLE: o, ORDER: s, _mod: a } = this;
    if (r) {
      if (t.length < 1 || !r.includes(t.length) || t.length > i)
        throw new Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
      const u = new Uint8Array(i);
      u.set(t, o ? 0 : u.length - t.length), t = u;
    }
    if (t.length !== i)
      throw new Error("Field.fromBytes: expected " + i + " bytes, got " + t.length);
    let c = o ? pn(t) : or(t);
    if (a && (c = ce(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return Fc(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return Rt(r, "condition"), r ? n : t;
  }
}
Object.freeze(Kc.prototype);
function li(e, t = {}) {
  return new Kc(e, t);
}
function Dc(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= oe)
    throw new Error("field order must be greater than 1");
  const t = To(e - oe);
  return Math.ceil(t / 8);
}
function jc(e) {
  const t = Dc(e);
  return t + Math.ceil(t / 2);
}
function Vc(e, t, n = !1) {
  q(e);
  const r = e.length, i = Dc(t), o = Math.max(jc(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? pn(e) : or(e), a = ce(s, t - oe) + oe;
  return n ? Rc(a, i) : $o(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const hn = /* @__PURE__ */ BigInt(0), Ft = /* @__PURE__ */ BigInt(1);
function jr(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function Hn(e, t) {
  const n = Fc(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function qc(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function $i(e, t) {
  qc(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = Oo(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function na(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += Ft);
  const u = t * r, l = u + Math.abs(a) - 1, d = a === 0, h = a < 0, f = t % 2 !== 0;
  return { nextN: c, offset: l, isZero: d, isNeg: h, isNegF: f, offsetF: u };
}
const Ti = /* @__PURE__ */ new WeakMap(), Gc = /* @__PURE__ */ new WeakMap();
function Oi(e) {
  return Gc.get(e) || 1;
}
function ra(e) {
  if (e !== hn)
    throw new Error("invalid wNAF");
}
class Wc {
  BASE;
  ZERO;
  Fn;
  bits;
  // Parametrized with a given Point class (not individual point)
  constructor(t, n) {
    this.BASE = t.BASE, this.ZERO = t.ZERO, this.Fn = t.Fn, this.bits = n;
  }
  // non-const time multiplication ladder
  _unsafeLadder(t, n, r = this.ZERO) {
    let i = t;
    for (; n > hn; )
      n & Ft && (r = r.add(i)), i = i.double(), n >>= Ft;
    return r;
  }
  /**
   * Creates a wNAF precomputation window. Used for caching.
   * Default window size is set by `utils.precompute()` and is equal to 8.
   * Number of precomputed points depends on the curve size:
   * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
   * - 𝑊 is the window size
   * - 𝑛 is the bitlength of the curve order.
   * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
   * @param point - Point instance
   * @param W - window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(t, n) {
    const { windows: r, windowSize: i } = $i(n, this.bits), o = [];
    let s = t, a = s;
    for (let c = 0; c < r; c++) {
      a = s, o.push(a);
      for (let u = 1; u < i; u++)
        a = a.add(s), o.push(a);
      s = a.double();
    }
    return o;
  }
  /**
   * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
   * More compact implementation:
   * https://github.com/paulmillr/noble-secp256k1/blob/47cb1669b6e506ad66b35fe7d76132ae97465da2/index.ts#L502-L541
   * @returns real and fake (for const-time) points
   */
  wNAF(t, n, r) {
    if (!this.Fn.isValid(r))
      throw new Error("invalid scalar");
    let i = this.ZERO, o = this.BASE;
    const s = $i(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: u, isZero: l, isNeg: d, isNegF: h, offsetF: f } = na(r, a, s);
      r = c, l ? o = o.add(jr(h, n[f])) : i = i.add(jr(d, n[u]));
    }
    return ra(r), { p: i, f: o };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = $i(t, this.bits);
    for (let s = 0; s < o.windows && r !== hn; s++) {
      const { nextN: a, offset: c, isZero: u, isNeg: l } = na(r, s, o);
      if (r = a, !u) {
        const d = n[c];
        i = i.add(l ? d.negate() : d);
      }
    }
    return ra(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = Ti.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), Ti.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = Oi(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = Oi(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    qc(n, this.bits), Gc.set(t, n), Ti.delete(t);
  }
  hasCache(t) {
    return Oi(t) !== 1;
  }
}
function sh(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > hn || r > hn; )
    n & Ft && (o = o.add(i)), r & Ft && (s = s.add(i)), i = i.double(), n >>= Ft, r >>= Ft;
  return { p1: o, p2: s };
}
function ia(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return rh(t), t;
  } else
    return li(e, { isLE: n });
}
function Zc(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const u = t[c];
    if (!(typeof u == "bigint" && u > hn))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = ia(t.p, n.Fp, r), o = ia(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function Lo(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const At = /* @__PURE__ */ BigInt(0), pe = /* @__PURE__ */ BigInt(1), Ri = /* @__PURE__ */ BigInt(2), ah = /* @__PURE__ */ BigInt(8);
function ch(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function uh(e, t = {}) {
  const n = t, r = Zc("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  mn(n, {}, { uvRatio: "function" });
  const c = Ri << BigInt(o.BYTES * 8) - pe, u = (y) => i.create(y), l = n.uvRatio === void 0 ? (y, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(y, p)) };
    } catch {
      return { isValid: !1, value: At };
    }
  } : n.uvRatio;
  if (!ch(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(y, p, g = !1) {
    const v = g ? pe : At;
    return Dr("coordinate " + y, p, v, c), p;
  }
  function h(y) {
    if (!(y instanceof f))
      throw new Error("EdwardsPoint expected");
  }
  class f {
    // base / generator point
    static BASE = new f(s.Gx, s.Gy, pe, u(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new f(At, pe, pe, At);
    // 0, 1, 1, 0
    // math field
    static Fp = i;
    // scalar field
    static Fn = o;
    X;
    Y;
    Z;
    T;
    constructor(p, g, v, A) {
      this.X = d("x", p), this.Y = d("y", g), this.Z = d("z", v, !0), this.T = d("t", A), Object.freeze(this);
    }
    static CURVE() {
      return s;
    }
    /**
     * Create one extended Edwards point from affine coordinates.
     * Does NOT validate that the point is on-curve or torsion-free.
     * Use `.assertValidity()` on adversarial inputs.
     */
    static fromAffine(p) {
      if (p instanceof f)
        throw new Error("extended point not allowed");
      const { x: g, y: v } = p || {};
      return d("x", g), d("y", v), new f(g, v, pe, u(g * v));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(p, g = !1) {
      const v = i.BYTES, { a: A, d: I } = s;
      p = Ji(q(p, v, "point")), Rt(g, "zip215");
      const _ = Ji(p), O = p[v - 1];
      _[v - 1] = O & -129;
      const C = pn(_), R = g ? c : i.ORDER;
      Dr("point.y", C, At, R);
      const B = u(C * C), U = u(B - pe), M = u(I * B - A);
      let { isValid: w, value: E } = l(U, M);
      if (!w)
        throw new Error("bad point: invalid y coordinate");
      const k = (E & pe) === pe, x = (O & 128) !== 0;
      if (!g && E === At && x)
        throw new Error("bad point: x=0 and x_0=1");
      return x !== k && (E = u(-E)), f.fromAffine({ x: E, y: C });
    }
    static fromHex(p, g = !1) {
      return f.fromBytes(fn(p), g);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, g = !0) {
      return b.createCache(this, p), g || this.multiply(Ri), this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this, { a: g, d: v } = s;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X: A, Y: I, Z: _, T: O } = p, C = u(A * A), R = u(I * I), B = u(_ * _), U = u(B * B), M = u(C * g), w = u(B * u(M + R)), E = u(U + u(v * u(C * R)));
      if (w !== E)
        throw new Error("bad point: equation left != right (1)");
      const k = u(A * I), x = u(_ * O);
      if (k !== x)
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(p) {
      h(p);
      const { X: g, Y: v, Z: A } = this, { X: I, Y: _, Z: O } = p, C = u(g * O), R = u(I * A), B = u(v * O), U = u(_ * A);
      return C === R && B === U;
    }
    is0() {
      return this.equals(f.ZERO);
    }
    negate() {
      return new f(u(-this.X), this.Y, this.Z, u(-this.T));
    }
    // Fast algo for doubling Extended Point.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    // Cost: 4M + 4S + 1*a + 6add + 1*2.
    double() {
      const { a: p } = s, { X: g, Y: v, Z: A } = this, I = u(g * g), _ = u(v * v), O = u(Ri * u(A * A)), C = u(p * I), R = g + v, B = u(u(R * R) - I - _), U = C + _, M = U - O, w = C - _, E = u(B * M), k = u(U * w), x = u(B * w), S = u(M * U);
      return new f(E, k, S, x);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      h(p);
      const { a: g, d: v } = s, { X: A, Y: I, Z: _, T: O } = this, { X: C, Y: R, Z: B, T: U } = p, M = u(A * C), w = u(I * R), E = u(O * v * U), k = u(_ * B), x = u((A + I) * (C + R) - M - w), S = k - E, P = k + E, T = u(w - g * M), $ = u(x * S), L = u(P * T), z = u(x * T), H = u(S * P);
      return new f($, L, H, z);
    }
    subtract(p) {
      return h(p), this.add(p.negate());
    }
    // Constant-time multiplication.
    multiply(p) {
      if (!o.isValidNot0(p))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p: g, f: v } = b.cached(this, p, (A) => Hn(f, A));
      return Hn(f, [g, v])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(p) {
      if (!o.isValid(p))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      return p === At ? f.ZERO : this.is0() || p === pe ? this : b.unsafe(this, p, (g) => Hn(f, g));
    }
    // Checks if point is of small order.
    // If you add something to small order point, you will have "dirty"
    // point with torsion component.
    // Clears cofactor and checks if the result is 0.
    isSmallOrder() {
      return this.clearCofactor().is0();
    }
    // Multiplies point by curve order and checks if the result is 0.
    // Returns `false` is the point is dirty.
    isTorsionFree() {
      return b.unsafe(this, s.n).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(p) {
      const g = this;
      let v = p;
      const { X: A, Y: I, Z: _ } = g, O = g.is0();
      v == null && (v = O ? ah : i.inv(_));
      const C = u(A * v), R = u(I * v), B = i.mul(_, v);
      if (O)
        return { x: At, y: pe };
      if (B !== pe)
        throw new Error("invZ was invalid");
      return { x: C, y: R };
    }
    clearCofactor() {
      return a === pe ? this : this.multiplyUnsafe(a);
    }
    toBytes() {
      const { x: p, y: g } = this.toAffine(), v = i.toBytes(g);
      return v[v.length - 1] |= p & pe ? 128 : 0, v;
    }
    toHex() {
      return X(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const b = new Wc(f, o.BITS);
  return o.BITS >= 8 && f.BASE.precompute(8), Object.freeze(f.prototype), Object.freeze(f), f;
}
class lh {
  static BASE;
  static ZERO;
  static Fp;
  static Fn;
  ep;
  /**
   * Wrap one internal Edwards representative directly.
   * This is not a canonical encoding boundary: alternate Edwards
   * representatives may still describe the same abstract wrapper element.
   */
  constructor(t) {
    this.ep = t;
  }
  // Static methods that must be implemented by subclasses
  static fromBytes(t) {
    Js();
  }
  static fromHex(t) {
    Js();
  }
  get x() {
    return this.toAffine().x;
  }
  get y() {
    return this.toAffine().y;
  }
  // Common implementations
  clearCofactor() {
    return this;
  }
  assertValidity() {
    this.ep.assertValidity();
  }
  /**
   * Return affine coordinates of the current internal Edwards representative.
   * This is a convenience helper, not a canonical Ristretto/Decaf encoding.
   * Equal abstract elements may expose different `x` / `y`; use
   * `toBytes()` / `fromBytes()` for canonical roundtrips.
   */
  toAffine(t) {
    return this.ep.toAffine(t);
  }
  toHex() {
    return X(this.toBytes());
  }
  toString() {
    return this.toHex();
  }
  isTorsionFree() {
    return !0;
  }
  isSmallOrder() {
    return !1;
  }
  add(t) {
    return this.assertSame(t), this.init(this.ep.add(t.ep));
  }
  subtract(t) {
    return this.assertSame(t), this.init(this.ep.subtract(t.ep));
  }
  multiply(t) {
    return this.init(this.ep.multiply(t));
  }
  multiplyUnsafe(t) {
    return this.init(this.ep.multiplyUnsafe(t));
  }
  double() {
    return this.init(this.ep.double());
  }
  negate() {
    return this.init(this.ep.negate());
  }
  precompute(t, n) {
    return this.ep.precompute(t, n), this;
  }
}
function dh(e, t, n = {}) {
  if (typeof t != "function")
    throw new Error('"hash" function param is required');
  const r = t, i = n;
  mn(i, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function"
  });
  const { prehash: o } = i, { BASE: s, Fp: a, Fn: c } = e, u = r.outputLen, l = 2 * a.BYTES;
  if (u !== void 0 && (Kr(u, "hash.outputLen"), u !== l))
    throw new Error(`hash.outputLen must be ${l}, got ${u}`);
  const d = i.randomBytes === void 0 ? Po : i.randomBytes, h = i.adjustScalarBytes === void 0 ? (w) => w : i.adjustScalarBytes, f = i.domain === void 0 ? (w, E, k) => {
    if (Rt(k, "phflag"), E.length || k)
      throw new Error("Contexts/pre-hash are not supported");
    return w;
  } : i.domain;
  function b(w) {
    return c.create(pn(w));
  }
  function y(w) {
    const E = C.secretKey;
    q(w, C.secretKey, "secretKey");
    const k = q(r(w), 2 * E, "hashedSecretKey"), x = h(k.slice(0, E)), S = k.slice(E, 2 * E), P = b(x);
    return { head: x, prefix: S, scalar: P };
  }
  function p(w) {
    const { head: E, prefix: k, scalar: x } = y(w), S = s.multiply(x), P = S.toBytes();
    return { head: E, prefix: k, scalar: x, point: S, pointBytes: P };
  }
  function g(w) {
    return p(w).pointBytes;
  }
  function v(w = Uint8Array.of(), ...E) {
    const k = $e(...E);
    return b(r(f(k, q(w, void 0, "context"), !!o)));
  }
  function A(w, E, k = {}) {
    w = q(w, void 0, "message"), o && (w = o(w));
    const { prefix: x, scalar: S, pointBytes: P } = p(E), T = v(k.context, x, w), $ = s.multiply(T).toBytes(), L = v(k.context, $, P, w), z = c.create(T + L * S);
    if (!c.isValid(z))
      throw new Error("sign failed: invalid s");
    const H = $e($, c.toBytes(z));
    return q(H, C.signature, "result");
  }
  const I = {
    zip215: i.zip215
  };
  function _(w, E, k, x = I) {
    const { context: S } = x, P = x.zip215 === void 0 ? !!I.zip215 : x.zip215, T = C.signature;
    w = q(w, T, "signature"), E = q(E, void 0, "message"), k = q(k, C.publicKey, "publicKey"), P !== void 0 && Rt(P, "zip215"), o && (E = o(E));
    const $ = T / 2, L = w.subarray(0, $), z = pn(w.subarray($, T));
    let H, G, N;
    try {
      H = e.fromBytes(k, P), G = e.fromBytes(L, P), N = s.multiplyUnsafe(z);
    } catch {
      return !1;
    }
    if (!P && H.isSmallOrder())
      return !1;
    const ee = v(S, L, k, E);
    return G.add(H.multiplyUnsafe(ee)).subtract(N).clearCofactor().is0();
  }
  const O = a.BYTES, C = {
    secretKey: O,
    publicKey: O,
    signature: 2 * O,
    seed: O
  };
  function R(w) {
    return w = w === void 0 ? d(C.seed) : w, q(w, C.seed, "seed");
  }
  function B(w) {
    return Io(w) && w.length === C.secretKey;
  }
  function U(w, E) {
    try {
      return !!e.fromBytes(w, E === void 0 ? I.zip215 : E);
    } catch {
      return !1;
    }
  }
  const M = {
    getExtendedPublicKey: p,
    randomSecretKey: R,
    isValidSecretKey: B,
    isValidPublicKey: U,
    /**
     * Converts ed public key to x public key. Uses formula:
     * - ed25519:
     *   - `(u, v) = ((1+y)/(1-y), sqrt(-486664)*u/x)`
     *   - `(x, y) = (sqrt(-486664)*u/v, (u-1)/(u+1))`
     * - ed448:
     *   - `(u, v) = ((y-1)/(y+1), sqrt(156324)*u/x)`
     *   - `(x, y) = (sqrt(156324)*u/v, (1+u)/(1-u))`
     */
    toMontgomery(w) {
      const { y: E } = e.fromBytes(w), k = C.publicKey, x = k === 32;
      if (!x && k !== 57)
        throw new Error("only defined for 25519 and 448");
      const S = x ? a.div(pe + E, pe - E) : a.div(E - pe, E + pe);
      return a.toBytes(S);
    },
    toMontgomerySecret(w) {
      const E = C.secretKey;
      q(w, E);
      const k = r(w.subarray(0, E));
      return h(k).subarray(0, E);
    }
  };
  return Object.freeze(C), Object.freeze(M), Object.freeze({
    keygen: Lo(R, g),
    getPublicKey: g,
    sign: A,
    verify: _,
    utils: M,
    Point: e,
    lengths: C
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const fh = /* @__PURE__ */ BigInt(0), Nn = /* @__PURE__ */ BigInt(1), oa = /* @__PURE__ */ BigInt(2), ph = /* @__PURE__ */ BigInt(5), hh = /* @__PURE__ */ BigInt(8), Vn = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), Xc = {
  p: Vn,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: hh,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function yh(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = Vn, a = e * e % o * e % o, c = re(a, oa, o) * a % o, u = re(c, Nn, o) * e % o, l = re(u, ph, o) * u % o, d = re(l, t, o) * l % o, h = re(d, n, o) * d % o, f = re(h, r, o) * h % o, b = re(f, i, o) * f % o, y = re(b, i, o) * f % o, p = re(y, t, o) * l % o;
  return { pow_p_5_8: re(p, oa, o) * e % o, b2: a };
}
function gh(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Qi = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function Yc(e, t) {
  const n = Vn, r = ce(t * t * t, n), i = ce(r * r * t, n), o = yh(e * i).pow_p_5_8;
  let s = ce(e * r * o, n);
  const a = ce(t * s * s, n), c = s, u = ce(s * Qi, n), l = a === e, d = a === ce(-e, n), h = a === ce(-e * Qi, n);
  return l && (s = c), (d || h) && (s = u), zt(s, n) && (s = ce(-s, n)), { isValid: l || d, value: s };
}
const Kt = /* @__PURE__ */ uh(Xc, { uvRatio: Yc }), Ut = Kt.Fp, wh = Kt.Fn;
function bh(e) {
  return dh(Kt, qp, Object.assign({ adjustScalarBytes: gh, zip215: !0 }, e));
}
const Tt = /* @__PURE__ */ bh({}), sa = Qi, mh = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), aa = (e) => Yc(Nn, e), vh = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), xh = (e) => Ut.create(pn(e) & vh);
class _e extends lh {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new _e(Kt.BASE);
  // prettier-ignore
  static ZERO = new _e(Kt.ZERO);
  // prettier-ignore
  static Fp = Ut;
  // prettier-ignore
  static Fn = wh;
  constructor(t) {
    super(t);
  }
  /**
   * Create one Ristretto255 point from affine Edwards coordinates.
   * This wraps the internal Edwards representative directly and is not a
   * canonical ristretto255 decoding path.
   * Use `toBytes()` / `fromBytes()` if canonical ristretto255 bytes matter.
   */
  static fromAffine(t) {
    return new _e(Kt.fromAffine(t));
  }
  assertSame(t) {
    if (!(t instanceof _e))
      throw new Error("RistrettoPoint expected");
  }
  init(t) {
    return new _e(t);
  }
  static fromBytes(t) {
    tt(t, 32);
    const { a: n, d: r } = Xc, i = Vn, o = (I) => Ut.create(I), s = xh(t);
    if (!Gp(Ut.toBytes(s), t) || zt(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(Nn + n * a), u = o(Nn - n * a), l = o(c * c), d = o(u * u), h = o(n * r * l - d), { isValid: f, value: b } = aa(o(h * d)), y = o(b * u), p = o(b * y * h);
    let g = o((s + s) * y);
    zt(g, i) && (g = o(-g));
    const v = o(c * p), A = o(g * v);
    if (!f || zt(A, i) || v === fh)
      throw new Error("invalid ristretto255 encoding 2");
    return new _e(new Kt(g, v, Nn, A));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return _e.fromBytes(So(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = Vn, s = (p) => Ut.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), u = s(c * c), { value: l } = aa(s(a * u)), d = s(l * a), h = s(l * c), f = s(d * h * i);
    let b;
    if (zt(i * f, o)) {
      let p = s(n * sa), g = s(t * sa);
      t = p, n = g, b = s(d * mh);
    } else
      b = h;
    zt(t * f, o) && (n = s(-n));
    let y = s((r - n) * b);
    return zt(y, o) && (y = s(-y)), Ut.toBytes(y);
  }
  /**
   * Compares two Ristretto points.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
   */
  equals(t) {
    this.assertSame(t);
    const { X: n, Y: r } = this.ep, { X: i, Y: o } = t.ep, s = (u) => Ut.create(u), a = s(n * o) === s(r * i), c = s(r * o) === s(n * i);
    return a || c;
  }
  is0() {
    return this.equals(_e.ZERO);
  }
}
Object.freeze(_e.BASE);
Object.freeze(_e.ZERO);
Object.freeze(_e.prototype);
Object.freeze(_e);
class ca {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (_c(t), tt(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), nt(i);
  }
  update(t) {
    return dn(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    dn(this), Eo(t, this), this.finished = !0;
    const n = t.subarray(0, this.outputLen);
    this.iHash.digestInto(n), this.oHash.update(n), this.oHash.digestInto(n), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t ||= Object.create(Object.getPrototypeOf(this), {});
    const { oHash: n, iHash: r, finished: i, destroyed: o, blockLen: s, outputLen: a } = this;
    return t = t, t.finished = i, t.destroyed = o, t.blockLen = s, t.outputLen = a, t.oHash = n._cloneInto(t.oHash), t.iHash = r._cloneInto(t.iHash), t;
  }
  clone() {
    return this._cloneInto();
  }
  destroy() {
    this.destroyed = !0, this.oHash.destroy(), this.iHash.destroy();
  }
}
const Eh = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new ca(t, n).update(r).digest());
  return e.create = (t, n) => new ca(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ua = (e, t) => (e + (e >= 0 ? t : -t) / Jc) / t;
function kh(e, t, n) {
  Dr("scalar", e, Ye, n);
  const [[r, i], [o, s]] = t, a = ua(s * e, n), c = ua(-i * e, n);
  let u = e - a * r - c * o, l = -a * i - c * s;
  const d = u < Ye, h = l < Ye;
  d && (u = -u), h && (l = -l);
  const f = Oo(Math.ceil(To(n) / 2)) + Bt;
  if (u < Ye || u >= f || l < Ye || l >= f)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: u, k2neg: h, k2: l };
}
function eo(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function Li(e, t) {
  mn(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return Rt(n.lowS, "lowS"), Rt(n.prehash, "prehash"), n.format !== void 0 && eo(n.format), n;
}
class Sh extends Error {
  constructor(t = "") {
    super(t);
  }
}
const Ce = {
  // asn.1 DER encoding utils
  Err: Sh,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = Ce;
      if (Kr(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = wr(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? wr(i.length / 2 | 128) : "";
      return wr(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = Ce;
      t = q(t, void 0, "DER data");
      let r = 0;
      if (e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (t.length < 2 || t[r++] !== e)
        throw new n("tlv.decode: wrong tlv");
      const i = t[r++], o = !!(i & 128);
      let s = 0;
      if (!o)
        s = i;
      else {
        const c = i & 127;
        if (!c)
          throw new n("tlv.decode(long): indefinite length not supported");
        if (c > 4)
          throw new n("tlv.decode(long): byte length is too big");
        const u = t.subarray(r, r + c);
        if (u.length !== c)
          throw new n("tlv.decode: length bytes not complete");
        if (u[0] === 0)
          throw new n("tlv.decode(long): zero leftmost byte");
        for (const l of u)
          s = s << 8 | l;
        if (r += c, s < 128)
          throw new n("tlv.decode(long): not minimal encoding");
      }
      const a = t.subarray(r, r + s);
      if (a.length !== s)
        throw new n("tlv.decode: wrong value length");
      return { v: a, l: t.subarray(r + s) };
    }
  },
  // https://crypto.stackexchange.com/a/57734 Leftmost bit of first byte is 'negative' flag,
  // since we always use positive integers here. It must always be empty:
  // - add zero byte if exists
  // - if next byte doesn't have a flag, leading zero is not allowed (minimal encoding)
  _int: {
    encode(e) {
      const { Err: t } = Ce;
      if (Bo(e), e < Ye)
        throw new t("integer: negative integers are not allowed");
      let n = wr(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = Ce;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return or(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = Ce, i = q(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: u, l } = r.decode(2, c);
    if (l.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(u) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = Ce, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
};
Object.freeze(Ce._tlv);
Object.freeze(Ce._int);
Object.freeze(Ce);
const Ye = /* @__PURE__ */ BigInt(0), Bt = /* @__PURE__ */ BigInt(1), Jc = /* @__PURE__ */ BigInt(2), br = /* @__PURE__ */ BigInt(3), Ah = /* @__PURE__ */ BigInt(4);
function _h(e, t = {}) {
  const n = Zc("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  mn(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object"
  });
  const { endo: c, allowInfinityPoint: u } = t;
  if (c && (!r.is0(o.a) || typeof c.beta != "bigint" || !Array.isArray(c.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const l = eu(r, i);
  function d() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function h(M, w, E) {
    if (u && w.is0())
      return Uint8Array.of(0);
    const { x: k, y: x } = w.toAffine(), S = r.toBytes(k);
    if (Rt(E, "isCompressed"), E) {
      d();
      const P = !r.isOdd(x);
      return $e(Qc(P), S);
    } else
      return $e(Uint8Array.of(4), S, r.toBytes(x));
  }
  function f(M) {
    q(M, void 0, "Point");
    const { publicKey: w, publicKeyUncompressed: E } = l, k = M.length, x = M[0], S = M.subarray(1);
    if (u && k === 1 && x === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (k === w && (x === 2 || x === 3)) {
      const P = r.fromBytes(S);
      if (!r.isValid(P))
        throw new Error("bad point: is not on curve, wrong x");
      const T = p(P);
      let $;
      try {
        $ = r.sqrt(T);
      } catch (H) {
        const G = H instanceof Error ? ": " + H.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + G);
      }
      d();
      const L = r.isOdd($);
      return (x & 1) === 1 !== L && ($ = r.neg($)), { x: P, y: $ };
    } else if (k === E && x === 4) {
      const P = r.BYTES, T = r.fromBytes(S.subarray(0, P)), $ = r.fromBytes(S.subarray(P, P * 2));
      if (!g(T, $))
        throw new Error("bad point: is not on curve");
      return { x: T, y: $ };
    } else
      throw new Error(`bad point: got length ${k}, expected compressed=${w} or uncompressed=${E}`);
  }
  const b = t.toBytes === void 0 ? h : t.toBytes, y = t.fromBytes === void 0 ? f : t.fromBytes;
  function p(M) {
    const w = r.sqr(M), E = r.mul(w, M);
    return r.add(r.add(E, r.mul(M, o.a)), o.b);
  }
  function g(M, w) {
    const E = r.sqr(w), k = p(M);
    return r.eql(E, k);
  }
  if (!g(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const v = r.mul(r.pow(o.a, br), Ah), A = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(v, A)))
    throw new Error("bad curve params: a or b");
  function I(M, w, E = !1) {
    if (!r.isValid(w) || E && r.is0(w))
      throw new Error(`bad point coordinate ${M}`);
    return w;
  }
  function _(M) {
    if (!(M instanceof R))
      throw new Error("Weierstrass Point expected");
  }
  function O(M) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return kh(M, c.basises, i.ORDER);
  }
  function C(M, w, E, k, x) {
    return E = new R(r.mul(E.X, M), E.Y, E.Z), w = jr(k, w), E = jr(x, E), w.add(E);
  }
  class R {
    // base / generator point
    static BASE = new R(o.Gx, o.Gy, r.ONE);
    // zero / infinity / identity point
    static ZERO = new R(r.ZERO, r.ONE, r.ZERO);
    // 0, 1, 0
    // math field
    static Fp = r;
    // scalar field
    static Fn = i;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(w, E, k) {
      this.X = I("x", w), this.Y = I("y", E, !0), this.Z = I("z", k), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(w) {
      const { x: E, y: k } = w || {};
      if (!w || !r.isValid(E) || !r.isValid(k))
        throw new Error("invalid affine point");
      if (w instanceof R)
        throw new Error("projective point not allowed");
      return r.is0(E) && r.is0(k) ? R.ZERO : new R(E, k, r.ONE);
    }
    static fromBytes(w) {
      const E = R.fromAffine(y(q(w, void 0, "point")));
      return E.assertValidity(), E;
    }
    static fromHex(w) {
      return R.fromBytes(fn(w));
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     *
     * @param windowSize
     * @param isLazy - true will defer table computation until the first multiplication
     * @returns
     */
    precompute(w = 8, E = !0) {
      return U.createCache(this, w), E || this.multiply(br), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const w = this;
      if (w.is0()) {
        if (t.allowInfinityPoint && r.is0(w.X) && r.eql(w.Y, r.ONE) && r.is0(w.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x: E, y: k } = w.toAffine();
      if (!r.isValid(E) || !r.isValid(k))
        throw new Error("bad point: x or y not field elements");
      if (!g(E, k))
        throw new Error("bad point: equation left != right");
      if (!w.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y: w } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(w);
    }
    /** Compare one point to another. */
    equals(w) {
      _(w);
      const { X: E, Y: k, Z: x } = this, { X: S, Y: P, Z: T } = w, $ = r.eql(r.mul(E, T), r.mul(S, x)), L = r.eql(r.mul(k, T), r.mul(P, x));
      return $ && L;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new R(this.X, r.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a: w, b: E } = o, k = r.mul(E, br), { X: x, Y: S, Z: P } = this;
      let T = r.ZERO, $ = r.ZERO, L = r.ZERO, z = r.mul(x, x), H = r.mul(S, S), G = r.mul(P, P), N = r.mul(x, S);
      return N = r.add(N, N), L = r.mul(x, P), L = r.add(L, L), T = r.mul(w, L), $ = r.mul(k, G), $ = r.add(T, $), T = r.sub(H, $), $ = r.add(H, $), $ = r.mul(T, $), T = r.mul(N, T), L = r.mul(k, L), G = r.mul(w, G), N = r.sub(z, G), N = r.mul(w, N), N = r.add(N, L), L = r.add(z, z), z = r.add(L, z), z = r.add(z, G), z = r.mul(z, N), $ = r.add($, z), G = r.mul(S, P), G = r.add(G, G), z = r.mul(G, N), T = r.sub(T, z), L = r.mul(G, H), L = r.add(L, L), L = r.add(L, L), new R(T, $, L);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(w) {
      _(w);
      const { X: E, Y: k, Z: x } = this, { X: S, Y: P, Z: T } = w;
      let $ = r.ZERO, L = r.ZERO, z = r.ZERO;
      const H = o.a, G = r.mul(o.b, br);
      let N = r.mul(E, S), ee = r.mul(k, P), te = r.mul(x, T), ne = r.add(E, k), Y = r.add(S, P);
      ne = r.mul(ne, Y), Y = r.add(N, ee), ne = r.sub(ne, Y), Y = r.add(E, x);
      let ye = r.add(S, T);
      return Y = r.mul(Y, ye), ye = r.add(N, te), Y = r.sub(Y, ye), ye = r.add(k, x), $ = r.add(P, T), ye = r.mul(ye, $), $ = r.add(ee, te), ye = r.sub(ye, $), z = r.mul(H, Y), $ = r.mul(G, te), z = r.add($, z), $ = r.sub(ee, z), z = r.add(ee, z), L = r.mul($, z), ee = r.add(N, N), ee = r.add(ee, N), te = r.mul(H, te), Y = r.mul(G, Y), ee = r.add(ee, te), te = r.sub(N, te), te = r.mul(H, te), Y = r.add(Y, te), N = r.mul(ee, Y), L = r.add(L, N), N = r.mul(ye, Y), $ = r.mul(ne, $), $ = r.sub($, N), N = r.mul(ne, ee), z = r.mul(ye, z), z = r.add(z, N), new R($, L, z);
    }
    subtract(w) {
      return _(w), this.add(w.negate());
    }
    is0() {
      return this.equals(R.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar - by which the point would be multiplied
     * @returns New point
     */
    multiply(w) {
      const { endo: E } = t;
      if (!i.isValidNot0(w))
        throw new RangeError("invalid scalar: out of range");
      let k, x;
      const S = (P) => U.cached(this, P, (T) => Hn(R, T));
      if (E) {
        const { k1neg: P, k1: T, k2neg: $, k2: L } = O(w), { p: z, f: H } = S(T), { p: G, f: N } = S(L);
        x = H.add(N), k = C(E.beta, z, G, P, $);
      } else {
        const { p: P, f: T } = S(w);
        k = P, x = T;
      }
      return Hn(R, [k, x])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(w) {
      const { endo: E } = t, k = this, x = w;
      if (!i.isValid(x))
        throw new RangeError("invalid scalar: out of range");
      if (x === Ye || k.is0())
        return R.ZERO;
      if (x === Bt)
        return k;
      if (U.hasCache(this))
        return this.multiply(x);
      if (E) {
        const { k1neg: S, k1: P, k2neg: T, k2: $ } = O(x), { p1: L, p2: z } = sh(R, k, P, $);
        return C(E.beta, L, z, S, T);
      } else
        return U.unsafe(k, x);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(w) {
      const E = this;
      let k = w;
      const { X: x, Y: S, Z: P } = E;
      if (r.eql(P, r.ONE))
        return { x, y: S };
      const T = E.is0();
      k == null && (k = T ? r.ONE : r.inv(P));
      const $ = r.mul(x, k), L = r.mul(S, k), z = r.mul(P, k);
      if (T)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(z, r.ONE))
        throw new Error("invZ was invalid");
      return { x: $, y: L };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: w } = t;
      return s === Bt ? !0 : w ? w(R, this) : U.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: w } = t;
      return s === Bt ? this : w ? w(R, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === Bt ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(w = !0) {
      return Rt(w, "isCompressed"), this.assertValidity(), b(R, this, w);
    }
    toHex(w = !0) {
      return X(this.toBytes(w));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const B = i.BITS, U = new Wc(R, t.endo ? Math.ceil(B / 2) : B);
  return B >= 8 && R.BASE.precompute(8), Object.freeze(R.prototype), Object.freeze(R), R;
}
function Qc(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function eu(e, t) {
  return {
    secretKey: t.BYTES,
    publicKey: 1 + e.BYTES,
    publicKeyUncompressed: 1 + 2 * e.BYTES,
    publicKeyHasPrefix: !0,
    // Raw compact `(r || s)` signature width; DER and recovered signatures use
    // different lengths outside this helper.
    signature: 2 * t.BYTES
  };
}
function Ih(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? Po : t.randomBytes, i = Object.assign(eu(e.Fp, n), {
    seed: Math.max(jc(n.ORDER), 16)
  });
  function o(f) {
    try {
      const b = n.fromBytes(f);
      return n.isValidNot0(b);
    } catch {
      return !1;
    }
  }
  function s(f, b) {
    const { publicKey: y, publicKeyUncompressed: p } = i;
    try {
      const g = f.length;
      return b === !0 && g !== y || b === !1 && g !== p ? !1 : !!e.fromBytes(f);
    } catch {
      return !1;
    }
  }
  function a(f) {
    return f = f === void 0 ? r(i.seed) : f, Vc(q(f, i.seed, "seed"), n.ORDER);
  }
  function c(f, b = !0) {
    return e.BASE.multiply(n.fromBytes(f)).toBytes(b);
  }
  function u(f) {
    const { secretKey: b, publicKey: y, publicKeyUncompressed: p } = i, g = n._lengths;
    if (!Io(f))
      return;
    const v = q(f, void 0, "key").length, A = v === y || v === p, I = v === b || !!g?.includes(v);
    if (!(A && I))
      return A;
  }
  function l(f, b, y = !0) {
    if (u(f) === !0)
      throw new Error("first arg must be private key");
    if (u(b) === !1)
      throw new Error("second arg must be public key");
    const p = n.fromBytes(f);
    return e.fromBytes(b).multiply(p).toBytes(y);
  }
  const d = {
    isValidSecretKey: o,
    isValidPublicKey: s,
    randomSecretKey: a
  }, h = Lo(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: l, keygen: h, Point: e, utils: d, lengths: i });
}
function Ph(e, t, n = {}) {
  const r = t;
  _c(r), mn(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? Po : n.randomBytes, o = n.hmac === void 0 ? (x, S) => Eh(r, x, S) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: u } = a, { keygen: l, getPublicKey: d, getSharedSecret: h, utils: f, lengths: b } = Ih(e, n), y = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * Jc + Bt < s.ORDER;
  function g(x) {
    const S = c >> Bt;
    return x > S;
  }
  function v(x, S) {
    if (!a.isValidNot0(S))
      throw new Error(`invalid signature ${x}: out of range 1..Point.Fn.ORDER`);
    return S;
  }
  function A() {
    if (p)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function I(x, S) {
    eo(S);
    const P = b.signature, T = S === "compact" ? P : S === "recovered" ? P + 1 : void 0;
    return q(x, T);
  }
  class _ {
    r;
    s;
    recovery;
    constructor(S, P, T) {
      if (this.r = v("r", S), this.s = v("s", P), T != null) {
        if (A(), ![0, 1, 2, 3].includes(T))
          throw new Error("invalid recovery id");
        this.recovery = T;
      }
      Object.freeze(this);
    }
    static fromBytes(S, P = y.format) {
      I(S, P);
      let T;
      if (P === "der") {
        const { r: H, s: G } = Ce.toSig(q(S));
        return new _(H, G);
      }
      P === "recovered" && (T = S[0], P = "compact", S = S.subarray(1));
      const $ = b.signature / 2, L = S.subarray(0, $), z = S.subarray($, $ * 2);
      return new _(a.fromBytes(L), a.fromBytes(z), T);
    }
    static fromHex(S, P) {
      return this.fromBytes(fn(S), P);
    }
    assertRecovery() {
      const { recovery: S } = this;
      if (S == null)
        throw new Error("invalid recovery id: must be present");
      return S;
    }
    addRecoveryBit(S) {
      return new _(this.r, this.s, S);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(S) {
      const { r: P, s: T } = this, $ = this.assertRecovery(), L = $ === 2 || $ === 3 ? P + c : P;
      if (!s.isValid(L))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const z = s.toBytes(L), H = e.fromBytes($e(Qc(($ & 1) === 0), z)), G = a.inv(L), N = C(q(S, void 0, "msgHash")), ee = a.create(-N * G), te = a.create(T * G), ne = e.BASE.multiplyUnsafe(ee).add(H.multiplyUnsafe(te));
      if (ne.is0())
        throw new Error("invalid recovery: point at infinify");
      return ne.assertValidity(), ne;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return g(this.s);
    }
    toBytes(S = y.format) {
      if (eo(S), S === "der")
        return fn(Ce.hexFromSig(this));
      const { r: P, s: T } = this, $ = a.toBytes(P), L = a.toBytes(T);
      return S === "recovered" ? (A(), $e(Uint8Array.of(this.assertRecovery()), $, L)) : $e($, L);
    }
    toHex(S) {
      return X(this.toBytes(S));
    }
  }
  Object.freeze(_.prototype), Object.freeze(_);
  const O = n.bits2int === void 0 ? function(S) {
    if (S.length > 8192)
      throw new Error("input is too large");
    const P = or(S), T = S.length * 8 - u;
    return T > 0 ? P >> BigInt(T) : P;
  } : n.bits2int, C = n.bits2int_modN === void 0 ? function(S) {
    return a.create(O(S));
  } : n.bits2int_modN, R = Oo(u);
  function B(x) {
    return Dr("num < 2^" + u, x, Ye, R), a.toBytes(x);
  }
  function U(x, S) {
    return q(x, void 0, "message"), S ? q(r(x), void 0, "prehashed message") : x;
  }
  function M(x, S, P) {
    const { lowS: T, prehash: $, extraEntropy: L } = Li(P, y);
    x = U(x, $);
    const z = C(x), H = a.fromBytes(S);
    if (!a.isValidNot0(H))
      throw new Error("invalid private key");
    const G = [B(H), B(z)];
    if (L != null && L !== !1) {
      const ne = L === !0 ? i(b.secretKey) : L;
      G.push(q(ne, void 0, "extraEntropy"));
    }
    const N = $e(...G), ee = z;
    function te(ne) {
      const Y = O(ne);
      if (!a.isValidNot0(Y))
        return;
      const ye = a.inv(Y), st = e.BASE.multiply(Y).toAffine(), Ct = a.create(st.x);
      if (Ct === Ye)
        return;
      const Yt = a.create(ye * a.create(ee + Ct * H));
      if (Yt === Ye)
        return;
      let Sn = (st.x === Ct ? 0 : 2) | Number(st.y & Bt), An = Yt;
      return T && g(Yt) && (An = a.neg(Yt), Sn ^= 1), new _(Ct, An, p ? void 0 : Sn);
    }
    return { seed: N, k2sig: te };
  }
  function w(x, S, P = {}) {
    const { seed: T, k2sig: $ } = M(x, S, P);
    return Xp(r.outputLen, a.BYTES, o)(T, $).toBytes(P.format);
  }
  function E(x, S, P, T = {}) {
    const { lowS: $, prehash: L, format: z } = Li(T, y);
    if (P = q(P, void 0, "publicKey"), S = U(S, L), !Io(x)) {
      const H = x instanceof _ ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + H);
    }
    I(x, z);
    try {
      const H = _.fromBytes(x, z), G = e.fromBytes(P);
      if ($ && H.hasHighS())
        return !1;
      const { r: N, s: ee } = H, te = C(S), ne = a.inv(ee), Y = a.create(te * ne), ye = a.create(N * ne), st = e.BASE.multiplyUnsafe(Y).add(G.multiplyUnsafe(ye));
      return st.is0() ? !1 : a.create(st.x) === N;
    } catch {
      return !1;
    }
  }
  function k(x, S, P = {}) {
    const { prehash: T } = Li(P, y);
    return S = U(S, T), _.fromBytes(x, "recovered").recoverPublicKey(S).toBytes();
  }
  return Object.freeze({
    keygen: l,
    getPublicKey: d,
    getSharedSecret: h,
    utils: f,
    lengths: b,
    Point: e,
    sign: w,
    verify: E,
    recoverPublicKey: k,
    Signature: _,
    hash: r
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const di = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Bh = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, $h = /* @__PURE__ */ BigInt(0), to = /* @__PURE__ */ BigInt(2);
function Th(e) {
  const t = di.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), u = e * e * e % t, l = u * u * e % t, d = re(l, n, t) * l % t, h = re(d, n, t) * l % t, f = re(h, to, t) * u % t, b = re(f, i, t) * f % t, y = re(b, o, t) * b % t, p = re(y, a, t) * y % t, g = re(p, c, t) * p % t, v = re(g, a, t) * y % t, A = re(v, n, t) * l % t, I = re(A, s, t) * b % t, _ = re(I, r, t) * u % t, O = re(_, to, t);
  if (!Vr.eql(Vr.sqr(O), e))
    throw new Error("Cannot find square root");
  return O;
}
const Vr = li(di.p, { sqrt: Th }), Wt = /* @__PURE__ */ _h(di, {
  Fp: Vr,
  endo: Bh
}), Ee = /* @__PURE__ */ Ph(Wt, ue), la = {};
function qr(e, ...t) {
  let n = la[e];
  if (n === void 0) {
    const r = ue(Wp(e));
    n = $e(r, r), la[e] = n;
  }
  return ue($e(n, ...t));
}
const fi = (e) => e.toBytes(!0).slice(1), pi = (e) => e % to === $h;
function tu(e) {
  const { Fn: t, BASE: n } = Wt, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: pi(i.y) ? r : t.neg(r), bytes: fi(i) };
}
function nu(e) {
  const t = Vr;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  pi(i) || (i = t.neg(i));
  const o = Wt.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const cn = or;
function ru(...e) {
  return Wt.Fn.create(cn(qr("BIP0340/challenge", ...e)));
}
function da(e) {
  return tu(e).bytes;
}
function Oh(e, t, n = Ao(32)) {
  const { Fn: r, BASE: i } = Wt, o = q(e, void 0, "message"), { bytes: s, scalar: a } = tu(t), c = q(n, 32, "auxRand"), u = r.toBytes(a ^ cn(qr("BIP0340/aux", c))), l = qr("BIP0340/nonce", u, s, o), d = r.create(cn(l));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const h = i.multiply(d), f = pi(h.y) ? d : r.neg(d), b = fi(h), y = ru(b, s, o), p = new Uint8Array(64);
  if (p.set(b, 0), p.set(r.toBytes(r.create(f + y * a)), 32), !iu(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function iu(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = Wt, s = q(e, 64, "signature"), a = q(t, void 0, "message"), c = q(n, 32, "publicKey");
  try {
    const u = nu(cn(c)), l = cn(s.subarray(0, 32));
    if (!r.isValidNot0(l))
      return !1;
    const d = cn(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const h = ru(i.toBytes(l), fi(u), a), f = o.multiplyUnsafe(d).add(u.multiplyUnsafe(i.neg(h))), { x: b, y } = f.toAffine();
    return !(f.is0() || !pi(y) || b !== l);
  } catch {
    return !1;
  }
}
const Mt = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? Ao(48) : r, Vc(r, di.n));
  return Object.freeze({
    keygen: Lo(n, da),
    getPublicKey: da,
    sign: Oh,
    verify: iu,
    Point: Wt,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: qr,
      lift_x: nu,
      pointToBytes: fi
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), Rh = /* @__PURE__ */ Uint8Array.from([
  7,
  4,
  13,
  1,
  10,
  6,
  15,
  3,
  12,
  0,
  9,
  5,
  2,
  14,
  11,
  8
]), ou = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Lh = ou.map((e) => (9 * e + 5) % 16), su = /* @__PURE__ */ (() => {
  const n = [[ou], [Lh]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Rh[o]));
  return n;
})(), au = su[0], cu = su[1], uu = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Ch = /* @__PURE__ */ au.map((e, t) => e.map((n) => uu[t][n])), zh = /* @__PURE__ */ cu.map((e, t) => e.map((n) => uu[t][n])), Uh = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Mh = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function fa(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const mr = /* @__PURE__ */ new Uint32Array(16);
class Hh extends _o {
  h0 = 1732584193;
  h1 = -271733879;
  h2 = -1732584194;
  h3 = 271733878;
  h4 = -1009589776;
  constructor() {
    super(64, 20, 8, !0);
  }
  get() {
    const { h0: t, h1: n, h2: r, h3: i, h4: o } = this;
    return [t, n, r, i, o];
  }
  set(t, n, r, i, o) {
    this.h0 = t | 0, this.h1 = n | 0, this.h2 = r | 0, this.h3 = i | 0, this.h4 = o | 0;
  }
  process(t, n) {
    for (let f = 0; f < 16; f++, n += 4)
      mr[f] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, u = this.h3 | 0, l = u, d = this.h4 | 0, h = d;
    for (let f = 0; f < 5; f++) {
      const b = 4 - f, y = Uh[f], p = Mh[f], g = au[f], v = cu[f], A = Ch[f], I = zh[f];
      for (let _ = 0; _ < 16; _++) {
        const O = pr(r + fa(f, o, a, u) + mr[g[_]] + y, A[_]) + d | 0;
        r = d, d = u, u = pr(a, 10) | 0, a = o, o = O;
      }
      for (let _ = 0; _ < 16; _++) {
        const O = pr(i + fa(b, s, c, l) + mr[v[_]] + p, I[_]) + h | 0;
        i = h, h = l, l = pr(c, 10) | 0, c = s, s = O;
      }
    }
    this.set(this.h1 + a + l | 0, this.h2 + u + h | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    nt(mr);
  }
  destroy() {
    this.destroyed = !0, nt(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const lu = /* @__PURE__ */ ui(() => new Hh()), Nh = BigInt(0), In = BigInt(1), Fh = BigInt(2), Kh = BigInt(7), Dh = BigInt(256), jh = BigInt(113), du = [], fu = [], pu = [];
for (let e = 0, t = In, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], du.push(2 * (5 * r + n)), fu.push((e + 1) * (e + 2) / 2 % 64);
  let i = Nh;
  for (let o = 0; o < 7; o++)
    t = (t << In ^ (t >> Kh) * jh) % Dh, t & Fh && (i ^= In << (In << BigInt(o)) - In);
  pu.push(i);
}
const hu = Bc(pu, !0), Vh = hu[0], qh = hu[1], pa = (e, t, n) => n > 32 ? Tp(e, t, n) : Bp(e, t, n), ha = (e, t, n) => n > 32 ? Op(e, t, n) : $p(e, t, n);
function Gh(e, t = 24) {
  if (et(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = pa(u, l, 1) ^ n[a], h = ha(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = fu[s], c = pa(i, o, a), u = ha(i, o, a), l = du[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], u = e[s + 2], l = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & u, e[s + 9] ^= ~c & l;
    }
    e[0] ^= Vh[r], e[1] ^= qh[r];
  }
  nt(n);
}
let Wh = class yu {
  state;
  pos = 0;
  posOut = 0;
  finished = !1;
  state32;
  destroyed = !1;
  blockLen;
  suffix;
  outputLen;
  canXOF;
  enableXOF = !1;
  rounds;
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, et(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = vp(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Gs(this.state32), Gh(this.state32, this.rounds), Gs(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    dn(this), tt(t);
    const { blockLen: n, state: r } = this, i = t.length;
    for (let o = 0; o < i; ) {
      const s = Math.min(n - this.pos, i - o);
      for (let a = 0; a < s; a++)
        r[this.pos++] ^= t[o++];
      this.pos === n && this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = !0;
    const { state: t, suffix: n, pos: r, blockLen: i } = this;
    t[r] ^= n, (n & 128) !== 0 && r === i - 1 && this.keccak(), t[i - 1] ^= 128, this.keccak();
  }
  writeInto(t) {
    dn(this, !1), tt(t), this.finish();
    const n = this.state, { blockLen: r } = this;
    for (let i = 0, o = t.length; i < o; ) {
      this.posOut >= r && this.keccak();
      const s = Math.min(r - this.posOut, o - i);
      t.set(n.subarray(this.posOut, this.posOut + s), i), this.posOut += s, i += s;
    }
    return t;
  }
  xofInto(t) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(t);
  }
  xof(t) {
    return et(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Eo(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, nt(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new yu(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const Zh = (e, t, n, r = {}) => ui(() => new Wh(t, e, n), r), gu = /* @__PURE__ */ Zh(1, 136, 32), Xh = 1024 * 1024, wu = Object.getPrototypeOf(Uint8Array.prototype), Yh = Object.getOwnPropertyDescriptor(wu, Symbol.toStringTag).get, Jh = Object.getOwnPropertyDescriptor(wu, "byteLength").get, Qh = Uint8Array.prototype.set;
function bu(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("exact message byte length is invalid");
  if (e > Xh) throw new Error("exact message exceeds the 1 MiB decoded limit");
}
function mu(e) {
  const t = e.startsWith("0x") ? 2 : 0;
  bu(Math.ceil((e.length - t) / 2));
}
function Co(e) {
  if (typeof e == "string")
    return mu(e), fn(e.startsWith("0x") ? e.slice(2) : e);
  if (Yh.call(e) !== "Uint8Array") throw new TypeError("exact message must be hex or Uint8Array");
  const t = Jh.call(e);
  bu(t);
  const n = new Uint8Array(t);
  return Qh.call(n, e), n;
}
const ey = "hpke-x25519-hkdfsha256-aes256gcm-v1", ty = "avault:blind-box:v1", ny = "avault:blind-box:aad:v1", Gr = "machine-aesgcm-v1", hi = 1, yi = "ecdsa-secp256k1-recoverable", qn = "ed25519", zo = "ecdsa-secp256k1-der", Uo = "schnorr-secp256k1-bip340", Gn = "schnorr-secp256k1-bip341-keypath", se = 32, Wr = 12, gi = 32, ry = "avault:protected-vmk:kek-passkey:v1", iy = /^[A-Za-z_][A-Za-z0-9_]*$/, oy = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, sy = "avault:protected-root-meta:v1", ay = new TextEncoder(), cy = new TextDecoder();
function Mo(e) {
  switch (e) {
    case qn:
    case yi:
    case zo:
    case Uo:
    case Gn:
      return e;
    default:
      throw new Error("unsupported signing scheme");
  }
}
function vn(e) {
  if (e === void 0 || e === "secp256k1") return "secp256k1";
  if (e === "ed25519") return e;
  throw new Error("unsupported signing curve");
}
function Ho(e) {
  if (Mo(e), e === qn) throw new Error("Ed25519 requires exact-message signing, not a digest");
}
function ae(e, t = "bytes") {
  if (e instanceof Uint8Array)
    return new Uint8Array(e);
  if (e instanceof ArrayBuffer)
    return new Uint8Array(e.slice(0));
  if (ArrayBuffer.isView(e))
    return new Uint8Array(e.buffer.slice(e.byteOffset, e.byteOffset + e.byteLength));
  if (typeof e == "object" && e !== null && typeof e.length == "number")
    return Uint8Array.from(e);
  throw new TypeError(`${t} must be bytes`);
}
function Ie(e) {
  const t = ae(e), n = new ArrayBuffer(t.byteLength);
  return new Uint8Array(n).set(t), t.fill(0), n;
}
function ve(e) {
  return ay.encode(e);
}
function Zr(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Zr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Zr(t[n])}`).join(",")}}`;
}
function Vt(e) {
  const t = new Uint8Array(e);
  return crypto.getRandomValues(t), t;
}
function J(e) {
  const t = ae(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return t.fill(0), btoa(n);
}
function fe(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Uint8Array.from(atob(n), (r) => r.charCodeAt(0));
}
function Te(e) {
  return fn(e.startsWith("0x") ? e.slice(2) : e);
}
function ya(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? Te(e) : fe(e);
}
function uy(e) {
  return X(ae(e));
}
function vu(e, t = "bytes") {
  return ae(e, t);
}
function he(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function He(e) {
  e && new Uint8Array(e).fill(0);
}
async function Xr(e, t, n, r) {
  let i, o, s, a;
  try {
    i = Ie(e), o = Ie(t), s = Ie(n), a = r ? Ie(r) : void 0;
    const c = await crypto.subtle.importKey("raw", i, "AES-GCM", !1, ["encrypt"]), u = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: o,
        ...a ? { additionalData: a } : {}
      },
      c,
      s
    );
    return new Uint8Array(u);
  } finally {
    He(i), He(o), He(s), He(a);
  }
}
async function wi(e, t, n, r) {
  let i, o, s, a;
  try {
    i = Ie(e), o = Ie(t), s = Ie(n), a = r ? Ie(r) : void 0;
    const c = await crypto.subtle.importKey("raw", i, "AES-GCM", !1, ["decrypt"]), u = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: o,
        ...a ? { additionalData: a } : {}
      },
      c,
      s
    );
    return new Uint8Array(u);
  } finally {
    He(i), He(o), He(s), He(a);
  }
}
async function ly(e, t, n, r) {
  let i, o, s;
  try {
    i = Ie(e), o = Ie(t), s = Ie(n);
    const a = await crypto.subtle.importKey("raw", i, "HKDF", !1, ["deriveBits"]), c = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: o,
        info: s
      },
      a,
      r * 8
    );
    return new Uint8Array(c);
  } finally {
    He(i), He(o), He(s);
  }
}
async function xu(e, t) {
  const n = ae(e, "passkey PRF output");
  try {
    const r = ae(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return he(r, gi, "passkey PRF salt"), await ly(n, r, ve(ry), se);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function dy() {
  return Vt(se);
}
function fy() {
  return Vt(gi);
}
function py(e) {
  const t = ae(e, "passkey PRF salt");
  try {
    return he(t, gi, "passkey PRF salt"), { prf: { eval: { first: Ie(t) } } };
  } finally {
    t.fill(0);
  }
}
function it(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== hi || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function hy(e, t) {
  const n = ae(e, "VMK"), r = Vt(Wr);
  let i, o;
  try {
    he(n, se, "VMK"), o = ae(t.prfSalt, "passkey PRF salt"), he(o, gi, "passkey PRF salt"), i = await xu(t.prfOutput, o);
    const s = await Xr(i, r, n);
    return {
      kind: "passkey",
      kdf: "webauthn-prf-hkdf-sha256",
      prf_salt: J(o),
      nonce: J(r),
      wrapped: J(s),
      ...t.credentialId ? { credential_id: t.credentialId } : {}
    };
  } finally {
    i?.fill(0), o?.fill(0), n.fill(0);
  }
}
async function yy(e, t) {
  const n = ae(e, "VMK");
  try {
    if (he(n, se, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await hy(n, i));
    return JSON.stringify({ v: hi, copies: r });
  } finally {
    n.fill(0);
  }
}
async function gy(e, t) {
  const n = fe(e.prf_salt);
  if (t.prfSalt && J(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await xu(t.prfOutput, n);
  try {
    return await wi(r, fe(e.nonce), fe(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function wy(e, t) {
  const n = it(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await gy(r, t);
        try {
          return he(i, se, "VMK"), i;
        } catch (o) {
          throw i.fill(0), o;
        }
      }
    } catch {
    }
  throw new Error("no protected VMK copy could be unwrapped");
}
function No(e) {
  return it(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: fe(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function by(e, t) {
  const n = it(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Eu(e) {
  const t = it(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function Fo(e) {
  if (!e.kind) {
    if (e.curve !== void 0) throw new Error("protected record curve requires keypair metadata");
    return;
  }
  const t = vn(e.curve);
  if (e.kind === "static") {
    if (e.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (e.kind === "keypair") {
    if (typeof e.publicKey != "string" || e.publicKey.length === 0)
      throw new Error("keypair protected record requires a public key");
    return t === "ed25519" && Wo(e.publicKey), {
      kind: "keypair",
      public_key: e.publicKey.toLowerCase(),
      ...t === "ed25519" ? { curve: t } : {}
    };
  }
  throw new Error("unsupported protected record kind");
}
function my(e) {
  if (e === void 0) return;
  if (typeof e != "object" || e === null)
    throw new Error("protected record metadata is invalid");
  const t = e;
  if (t.curve !== void 0 && t.curve !== "ed25519")
    throw new Error("protected record metadata curve is invalid");
  if (t.kind === "static") {
    if (t.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (t.kind === "keypair")
    return Fo({ kind: "keypair", publicKey: t.public_key, curve: t.curve });
  throw new Error("protected record metadata kind is invalid");
}
function Ko(e, t) {
  return {
    name: e,
    ...t ? { kind: t.kind } : {},
    ...t?.public_key ? { publicKey: t.public_key } : {},
    ...t?.curve ? { curve: t.curve } : {}
  };
}
function Do(e) {
  return ve(
    Zr({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" ? Pu(e.name) : gn(e.name),
      scheme: e.scheme ?? Gr,
      version: e.version ?? hi,
      record: Fo(e) ?? null
    })
  );
}
async function ku(e, t, n) {
  const r = ae(t, "VMK"), i = Vt(se);
  let o;
  try {
    he(r, se, "VMK"), o = ae(e, "value");
    const s = Do(n), a = Vt(Wr), c = await Xr(i, a, o, s), u = Vt(Wr), l = await Xr(r, u, i, s);
    return {
      ciphertext: J(c),
      nonce: J(a),
      dek_nonce: J(u),
      wrapped_dek: J(l)
    };
  } finally {
    i.fill(0), r.fill(0), o?.fill(0);
  }
}
async function Su(e, t, n) {
  const r = ae(t, "VMK");
  try {
    he(r, se, "VMK");
    const i = await wi(
      r,
      fe(e.dek_nonce),
      fe(e.wrapped_dek),
      Do(n)
    );
    try {
      return he(i, se, "DEK"), i;
    } catch (o) {
      throw i.fill(0), o;
    }
  } finally {
    r.fill(0);
  }
}
async function jo(e, t, n) {
  const r = await Su(e, t, n);
  try {
    return await wi(
      r,
      fe(e.nonce),
      fe(e.ciphertext),
      Do(n)
    );
  } finally {
    r.fill(0);
  }
}
function Au(e, t, n) {
  const r = it(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== Gr)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? Fo(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: Gr,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function yn(e) {
  const t = it(e.wrap_meta), { dek_nonce: n, wrapped_dek: r, record_meta: i, ...o } = t;
  if (typeof n != "string" || typeof r != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const s = my(i);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: n, wrapped_dek: r },
    vmkWrapMeta: JSON.stringify(o),
    ...s ? { recordMetadata: s } : {}
  };
}
function _u(e) {
  const t = { ...it(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, ve(Zr({ domain: sy, vault: t }));
}
async function vy(e, t, n) {
  const r = Vt(Wr), i = ve(JSON.stringify(t));
  try {
    const o = await Xr(e, r, i, _u(n));
    return { v: 1, nonce: J(r), ciphertext: J(o) };
  } finally {
    i.fill(0);
  }
}
async function Vo(e, t) {
  const n = it(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await wi(t, fe(n.nonce), fe(n.ciphertext), _u(e));
  try {
    const i = JSON.parse(cy.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function xy(e, t) {
  const n = it(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function Ey() {
  return new up({
    kem: new mp(),
    kdf: new lp(),
    aead: new Vf()
  });
}
function qo(e) {
  return fe(typeof e == "string" ? e : e.public_key);
}
async function Iu(e) {
  const t = await crypto.subtle.digest("SHA-256", Ie(e));
  return X(new Uint8Array(t));
}
async function ky(e) {
  return Iu(qo(e));
}
function Sy(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function Ay(e) {
  const t = Sy(e), n = qo(t);
  if (he(n, se, "avault public key"), await Iu(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function _y(e, t, n) {
  const r = Ey(), i = qo(t);
  if (he(i, se, "avault public key"), typeof t != "string" && t.fingerprint && await ky(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? ve(e) : ae(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: ve(ty) },
      s,
      Ly(n)
    );
    return {
      scheme: ey,
      enc: J(new Uint8Array(a.enc)),
      ct: J(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function Pu(e) {
  if (typeof e != "string" || !iy.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function gn(e) {
  if (typeof e != "string" || !oy.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function ga(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function Go(e) {
  const t = typeof e == "string" ? Te(e) : ae(e, "digest");
  return he(t, se, "digest"), t;
}
function Iy(e) {
  const t = typeof e == "string" ? Te(e) : ae(e, "private key");
  try {
    if (he(t, se, "private key"), !Ee.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function Yr(e, t) {
  return typeof e == "string" ? Te(e) : ae(e, t);
}
function Jr(e) {
  const t = Yr(e, "operation hash");
  return he(t, se, "operation hash"), t;
}
function Qr(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function Bu(e, t) {
  const n = Qr(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function Py(e) {
  return Bu(e, "approval expiry");
}
function wa(e) {
  const t = ae(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: Qr(e.expiresAtUnix, "approval expiry") };
}
function Be(e, t) {
  const n = ae(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function By(e) {
  switch (e.purpose) {
    case "seal":
      return $y(e.name);
    case "agent-deliver": {
      const t = wa({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: gn(e.name),
        grantId: ga(e.grantId, "grant id"),
        ttlSecs: Qr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Jr(e.operationHash)
      };
    }
    case "agent-sign": {
      Ho(e.signScheme);
      const t = wa({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: Pu(e.name),
        grantId: ga(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: Go(e.digest),
        ttlSecs: Qr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Jr(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function $y(e) {
  return { purpose: "seal", name: gn(e) };
}
async function Ty(e) {
  const t = Jr(e.operationHash), n = await Ry(e.name, e.ttlSecs);
  if (X(t) !== X(n))
    throw new Error("operation hash does not match release operation fields");
}
async function Oy(e) {
  const t = [];
  for (const n of e)
    Be(t, typeof n == "string" ? ve(n) : ae(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function Ry(e, t) {
  return Oy(["agent-deliver", gn(e), Bu(t, "ttl seconds")]);
}
function Ly(e) {
  const t = By(e), n = [...ve(ny)];
  return Be(n, ve(t.purpose)), Be(n, ve(t.name)), Be(n, ve(Gr)), Be(n, new Uint8Array([hi])), Be(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? ve(t.grantId) : new Uint8Array()), Be(n, new Uint8Array()), Be(n, t.purpose === "agent-sign" ? ve(t.signScheme) : new Uint8Array()), Be(n, t.purpose === "agent-sign" ? Go(t.digest) : new Uint8Array()), Be(n, t.purpose === "seal" ? new Uint8Array() : ae(t.approvalNonce, "approval nonce")), Be(n, t.purpose === "seal" ? new Uint8Array() : Py(t.approvalExpiresAtUnix)), Be(n, t.purpose === "seal" ? new Uint8Array() : Jr(t.operationHash)), new Uint8Array(n);
}
async function Cy(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (gn(r.name) !== gn(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await Ty(i);
  const o = await Ay(n), s = await Su(e, t, r);
  try {
    return await _y(s, o, i);
  } finally {
    s.fill(0);
  }
}
function zy(e = "secp256k1") {
  if (vn(e) === "ed25519") {
    const n = Tt.utils.randomSecretKey();
    try {
      return { privateKey: n, publicKey: X(Tt.getPublicKey(n)) };
    } catch (r) {
      throw n.fill(0), r;
    }
  }
  const t = Ee.utils.randomSecretKey();
  return { privateKey: t, publicKey: X(Ee.getPublicKey(t, !0)) };
}
function ba(e) {
  return Te(e.toString(16).padStart(se * 2, "0"));
}
function Uy(e, t, n, r = {}) {
  if (Ho(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = Iy(e);
  let o;
  try {
    const s = Go(t);
    if (n === yi) {
      const a = Ee.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: X(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === zo)
      return {
        scheme: n,
        signature: X(Ee.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === Uo) {
      o = r.schnorrAuxRand !== void 0 ? Yr(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(se)), he(o, se, "schnorr aux randomness");
      const a = Mt.sign(s, i, o);
      if (!Mt.verify(a, s, Mt.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: X(a), recovery_id: null };
    }
    if (n === Gn) {
      const a = Ee.getPublicKey(i, !0), c = Zo(a.slice(1));
      let u = BigInt(`0x${X(i)}`);
      a[0] === 3 && (u = Cn - u);
      const l = BigInt(`0x${X(Mt.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (l >= Cn) throw new Error("invalid taproot tweak");
      let d = (u + l) % Cn;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let h = ba(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = Cn - d, h.fill(0), h = ba(d)), o = r.schnorrAuxRand !== void 0 ? Yr(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(se)), he(o, se, "schnorr aux randomness");
        const f = Mt.sign(s, h, o);
        if (!Mt.verify(f, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
        return { scheme: n, signature: X(f), recovery_id: null };
      } finally {
        h.fill(0);
      }
    }
    throw new Error("unsupported signing scheme");
  } finally {
    o?.fill(0), i.fill(0);
  }
}
async function My(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  if (Ho(i), vn(n.curve) !== "secp256k1") throw new Error("digest signing requires a secp256k1 protected record");
  const s = await jo(e, t, n);
  try {
    if (X(Ee.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Uy(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function Hy(e, t) {
  const n = Co(t), r = Yr(e, "Ed25519 seed");
  try {
    he(r, se, "Ed25519 seed");
    const i = Tt.sign(n, r);
    if (!Tt.verify(i, n, Tt.getPublicKey(r), { zip215: !1 }))
      throw new Error("Ed25519 signing self-verification failed");
    return { scheme: qn, signature: X(i), recovery_id: null };
  } finally {
    r.fill(0);
  }
}
function Wo(e) {
  if (!/^[0-9a-fA-F]{64}$/.test(e)) throw new Error("expected a 32-byte Ed25519 public key");
  const t = Te(e);
  if (!Tt.utils.isValidPublicKey(t, !1)) throw new Error("invalid Ed25519 public key");
  return t;
}
async function Ny(e, t, n, r) {
  if (n.kind !== "keypair" || n.curve !== "ed25519" || !n.publicKey)
    throw new Error("exact-message signing requires an Ed25519 keypair protected record");
  const i = Co(r);
  if (i.length === 0) throw new Error("protected Ed25519 message must not be empty");
  Wo(n.publicKey);
  const o = await jo(e, t, n);
  try {
    if (he(o, se, "Ed25519 seed"), X(Tt.getPublicKey(o)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Hy(o, i);
  } finally {
    o.fill(0);
  }
}
function Fy(e) {
  return Tu(Wo(e));
}
function Ky(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return Tt.verify(ya(e.signature), ve(e.message), ya(t.publicKey));
}
function $u(e) {
  const t = Te(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && Ee.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && Ee.utils.isValidPublicKey(t))
    return Ee.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const Dy = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", jy = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", Vy = 1, qy = 734539939, Cn = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function Gy(e) {
  return lu(ue(e));
}
function Wy(e) {
  const t = ue(ue(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  return n.set(e), n.set(t, e.length), Tu(n);
}
function Tu(e) {
  let t = BigInt(`0x${X(e)}`), n = "";
  for (; t > 0n; ) {
    const i = Number(t % 58n);
    t /= 58n, n = Dy[i] + n;
  }
  let r = 0;
  for (const i of e) {
    if (i !== 0) break;
    r += 1;
  }
  return "1".repeat(r) + n;
}
function Zy(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1)
      i >>> o & 1 && (n ^= t[o]);
  }
  return n;
}
function Xy(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function Yy(e, t, n) {
  const r = Xy(e).concat(t), i = Zy(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function Jy(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function ma(e, t, n) {
  const r = t === 0 ? Vy : qy, i = [t].concat(Jy(n, 8, 5));
  return `${e}1${i.concat(Yy(e, i, r)).map((o) => jy[o]).join("")}`;
}
function Qy(e) {
  const t = e.toLowerCase(), n = X(gu(ve(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function Zo(e) {
  const t = BigInt(`0x${X(Mt.utils.taggedHash("TapTweak", e))}`);
  if (t >= Cn) throw new Error("invalid taproot tweak");
  const n = Ee.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(Ee.Point.BASE.multiply(t));
  if (r.equals(Ee.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function eg(e) {
  return Zo($u(e).slice(1)).toBytes(!0).slice(1);
}
function Ou(e) {
  const t = $u(e), n = Ee.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = gu(r), o = Gy(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = Zo(a);
  return {
    eth: `0x${Qy(X(i.slice(-20)))}`,
    btc_legacy: Wy(s),
    btc_segwit: ma("bc", 0, o),
    btc_taproot: ma("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const Xo = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let no = { ...Xo };
function tg(e) {
  return e === 300 || e === 600 || e === 1800 ? e : Xo.windowSeconds;
}
function ng(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new m("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function Yo(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new m("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new m("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: ng(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function rg(e) {
  if (typeof e != "object" || e === null) return { ...Xo };
  const t = e;
  return {
    windowSeconds: tg(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function Jo(e) {
  return no = rg(e), no;
}
function xe() {
  return { ...no };
}
const ig = "avibe-vault-lock:v1:", j = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let ht = null, Fn = null, Wn = null, ro = null, Qo = 0;
const ei = /* @__PURE__ */ new Set();
let Ru = null;
function og(e) {
  Ru = e;
}
function va() {
  return j.vmk ? "unlocked" : j.wrapMeta ? "locked" : "needs-setup";
}
function Lu(e) {
  Ru?.({
    state: va(),
    ...ht !== null && va() === "unlocked" ? { expiresAt: ht } : {},
    reason: e
  });
}
function es() {
  Fn !== null && (clearTimeout(Fn), Fn = null);
}
function ti() {
  Wn?.close(), Wn = null, ro = null;
}
function Cu(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function sg(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function zu(e) {
  const t = it(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? Cu(t.vault_user_handle) : `wrap-${sg(e)}`;
}
function ag(e) {
  return Cu(e);
}
function Uu(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    ti();
    return;
  }
  const t = `${ig}${e}`;
  ro !== t && (ti(), ro = t, Wn = new BroadcastChannel(t), Wn.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && Fe({ broadcast: !1, reason: "manual-lock" });
  });
}
function cg() {
  j.scopeId && (Uu(j.scopeId), Wn?.postMessage({ type: "lock", scopeId: j.scopeId }));
}
function Mu() {
  return new Error("vault-operation-aborted");
}
function Hu() {
  Qo += 1;
  for (const e of ei)
    e.abort(Mu());
  ei.clear();
}
function ug() {
  j.vmk?.fill(0), j.vmk = null, ht = null, es(), ti(), j.freshSetup && (j.wrapMeta = null, j.freshSetup = !1, j.scopeId = null);
}
function lg() {
  return ht !== null && Date.now() >= ht;
}
function Nu() {
  return j.vmk && lg() ? (Fe({ broadcast: !1, reason: "auto-lock" }), !1) : j.vmk !== null;
}
function Fu(e, t = xe()) {
  if (!j.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return ht = Date.now() + n, es(), Fn = setTimeout(() => {
    Fe({ broadcast: !1, reason: "auto-lock" });
  }, n), Lu(e), ht;
}
function dg() {
  const e = ht;
  if (!j.vmk || e === null) return () => {
  };
  es();
  let t = !1;
  return () => {
    if (t || !j.vmk) return;
    t = !0;
    const n = e - Date.now();
    if (n <= 0) {
      Fe({ broadcast: !1, reason: "auto-lock" });
      return;
    }
    Fn = setTimeout(() => {
      Fe({ broadcast: !1, reason: "auto-lock" });
    }, n);
  };
}
function fg(e) {
  if (e instanceof m && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function pg(e) {
  if (e.signal.aborted || e.epoch !== Qo || !j.vmk)
    throw Mu();
}
async function ts(e, t = {}) {
  if (!Nu() || !j.vmk || !j.wrapMeta)
    throw new Error("vault-locked");
  const n = new Uint8Array(j.vmk), r = j.wrapMeta, i = Qo, o = new AbortController();
  ei.add(o);
  const s = {
    epoch: i,
    signal: o.signal,
    assertCurrent: () => pg(s)
  };
  let a = null;
  try {
    s.assertCurrent();
    const c = await e(n, r, s);
    return s.assertCurrent(), t.renewOnSuccess !== !1 && Fu("renew"), s.assertCurrent(), t.beforeSuccess && (a = dg(), await t.beforeSuccess(), s.assertCurrent(), a(), a = null), c;
  } catch (c) {
    throw fg(c) || Fe({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    a?.(), ei.delete(o), n.fill(0);
  }
}
function hg() {
  return j.vmk !== null && j.freshSetup;
}
function Ku(e) {
  return Hu(), j.vmk?.fill(0), j.vmk = e.vmk, j.wrapMeta = e.wrapMeta, j.freshSetup = e.freshSetup, j.scopeId = e.scopeId, Uu(e.scopeId), { state: "unlocked", expiresAt: Fu("unlock", e.policy) };
}
function Fe(e = {}) {
  return e.broadcast && cg(), Hu(), ug(), Lu(e.reason ?? "manual-lock"), { state: "locked" };
}
function yt(e) {
  return Nu(), j.vmk ? {
    state: "unlocked",
    expiresAt: ht ?? void 0,
    ...j.freshSetup ? { freshSetup: !0 } : {}
  } : (e && (j.wrapMeta = Eu(e), j.scopeId = zu(j.wrapMeta)), j.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function ns(e) {
  const t = Eu(e), n = zu(t);
  return j.wrapMeta = t, j.scopeId = n, { wrapMeta: t, scopeId: n };
}
function yg() {
  Fe({ broadcast: !1, reason: "unload" }), ti();
}
const vr = "Avibe Vault", xa = "avibe-vault";
function Je(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function $t(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function Du() {
  return $t(crypto.getRandomValues(new Uint8Array(32)));
}
function gg(e) {
  try {
    return fe(e);
  } catch {
    return null;
  }
}
function Zn(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return $t(vu(e));
  if (typeof e == "string") {
    const n = gg(e);
    return $t(n ?? new TextEncoder().encode(e));
  }
  if (Array.isArray(e))
    return $t(Uint8Array.from(e));
  if (t !== void 0)
    return $t(new TextEncoder().encode(t));
  throw new Error("webauthn bytes are missing");
}
function wg(e) {
  const t = Zn(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function ni(e) {
  if (Array.isArray(e))
    return e.map((t) => {
      const n = Je(t);
      if (!n || n.type !== "public-key")
        throw new Error("invalid WebAuthn credential descriptor");
      return {
        type: "public-key",
        id: Zn(n.id),
        ...Array.isArray(n.transports) ? { transports: n.transports } : {}
      };
    });
}
function Ea(e) {
  return !Array.isArray(e) || e.length === 0 ? [
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 }
  ] : e.map((t) => {
    const n = Je(t);
    if (!n || n.type !== "public-key" || typeof n.alg != "number")
      throw new Error("invalid WebAuthn pubKeyCredParams");
    return { type: "public-key", alg: n.alg };
  });
}
function ka(e) {
  return {
    ...Je(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function Sa(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function bg(e) {
  const t = Je(e) ?? {};
  return { ...t, prf: Je(t.prf) ?? {} };
}
function gt() {
  return window.location.hostname;
}
function mg(e) {
  const t = Je(e.authzCreationOptions), r = Je(t?.webauthn) ?? t, i = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, o = Je(r?.rp), s = typeof o?.id == "string" ? o.id : void 0;
  if (s && s !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!r)
    return {
      options: {
        rp: { name: vr, id: e.rpId },
        user: {
          id: wg(e.vaultUserHandle),
          name: e.vaultUserHandle || xa,
          displayName: e.displayName || vr
        },
        challenge: Du(),
        pubKeyCredParams: Ea(void 0),
        authenticatorSelection: ka(void 0),
        extensions: { prf: {} }
      }
    };
  const a = Je(r.user);
  if (!a) throw new Error("webauthn user is missing");
  return {
    options: {
      rp: {
        name: typeof o?.name == "string" ? o.name : vr,
        id: e.rpId
      },
      user: {
        id: Zn(a.id, e.vaultUserHandle),
        name: typeof a.name == "string" ? a.name : e.vaultUserHandle || xa,
        displayName: typeof a.displayName == "string" ? a.displayName : e.displayName || vr
      },
      challenge: Zn(r.challenge),
      pubKeyCredParams: Ea(r.pubKeyCredParams),
      authenticatorSelection: ka(r.authenticatorSelection),
      extensions: bg(r.extensions),
      ...ni(r.excludeCredentials) ? { excludeCredentials: ni(r.excludeCredentials) } : {},
      ...typeof r.timeout == "number" ? { timeout: r.timeout } : {},
      ...Sa(r.attestation) ? { attestation: Sa(r.attestation) } : {}
    },
    ...i ? { challengeId: i } : {}
  };
}
function vg(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function xg(e, t) {
  const n = vg(e), r = {
    challenge: Du(),
    rpId: t,
    userVerification: "required",
    extensions: py(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: $t(fe(n.credentialId))
    }
  ]), r;
}
function Eg(e, t, n) {
  const r = {
    challenge: $t(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: $t(fe(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function kg(e, t = gt()) {
  const n = Je(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: Zn(n.challenge),
    rpId: t,
    userVerification: "required",
    ...ni(n.allowCredentials) ? { allowCredentials: ni(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function ju(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function Vu(e) {
  return {
    id: e.id,
    rawId: J(e.rawId),
    type: e.type
  };
}
function Sg(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...Vu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      attestationObject: J(t.attestationObject),
      transports: n
    }
  };
}
function Ag(e) {
  const t = e.response;
  return {
    ...Vu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      authenticatorData: J(t.authenticatorData),
      signature: J(t.signature),
      userHandle: t.userHandle ? J(t.userHandle) : null
    }
  };
}
function _g(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = vu(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function rs(e, t, n) {
  const r = await navigator.credentials.get(
    ju(xg(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = _g(r), o = J(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function Ig(e, t, n, r) {
  if (!await navigator.credentials.get(
    ju(Eg(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function Pg(e) {
  const t = await navigator.credentials.get({
    publicKey: kg(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return Ag(t);
}
const Bg = /ancestor|not the same as its|cross-?origin|different origin/i;
function qu(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function $g(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function Gu(e) {
  const t = qu(e);
  return t === "SecurityError" || t === "NotSupportedError" || Bg.test($g(e));
}
function Tg(e) {
  return qu(e) === "NotAllowedError" && !Gu(e);
}
function is(e) {
  const { options: t, challengeId: n } = mg(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = J(i.rawId), s = Sg(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const io = {
  en: {
    "common.cancel": "Cancel",
    "common.continue": "Continue",
    "common.done": "Done",
    "sandbox.intro": "Your protected vault keys are created and used here, isolated from the rest of Avibe. This runs entirely in your browser — Avibe's servers only serve this code, never your keys.",
    "authorize.waiting": "Preparing your approval…",
    "authorize.waitingLong": "Still waiting for Avibe. If nothing appears, close this window and approve again in Avibe.",
    "setup.title": "Create vault passkey",
    "setup.subtitle": "Protected vault setup",
    "setup.iframeBody": "Create a passkey in this sandbox frame. Your vault key stays on this origin.",
    "setup.topLevelBody": "Confirm to create a resident passkey on this sandbox origin. Your vault key stays in this browser.",
    "setup.createPasskey": "Create passkey",
    "setup.finish": "Finish setup",
    "setup.ready": "Ready.",
    "setup.readyOnOrigin": "Ready on this origin.",
    "setup.popupBlocked": "Popup was blocked. Tap Create passkey again.",
    "setup.popupPrompt": "Create the passkey in the new window.",
    "setup.createdFinish": "Passkey created. Tap Finish setup to continue.",
    "setup.passkeyPrompt": "Follow your browser passkey prompt...",
    "setup.requestMissing": "Setup request is missing.",
    "setup.requestInvalid": "Setup request is invalid.",
    "setup.created": "Passkey created.",
    "unlock.sessionTitle": "Unlock vault",
    "unlock.sessionSubtitle": "Available in this browser for {{minutes}} min",
    "unlock.sessionBody": "Use your passkey once. While the vault stays unlocked, access requests only need confirmation; signing still verifies your passkey every time.",
    "plaintext.copyTitle": "Copy protected value",
    "plaintext.title": "Protected value",
    "plaintext.body": "The plaintext is visible only in this sandbox frame.",
    "plaintext.copy": "Copy",
    "plaintext.copyWarning": "Copying puts plaintext on the system clipboard, where other apps or pages may read it.",
    "plaintext.copyReady": "Passkey confirmed. Click Copy again to write to clipboard.",
    "plaintext.copyFailed": "Copy was not completed. The value remains visible here.",
    "plaintext.copiedBody": "Copied from the sandbox frame. The plaintext was not returned to Avibe.",
    "reveal.showConfirmTitle": "Show protected value",
    "reveal.confirmBody": "Confirm in this sandbox to display the value here. The plaintext will not be returned to Avibe.",
    "sign.title": "Sign protected operation",
    "sign.confirm": "Confirm sign",
    "review.details": "Details",
    "review.copy": "Copy",
    "review.copied": "Copied",
    "review.copySelected": "Selected; copy with the keyboard",
    "review.kind.solanaSystemTransfer": "Solana · SOL transfer",
    "review.kind.solanaTokenTransfer": "Solana · token transfer",
    "review.kind.solanaTransaction": "Solana transaction",
    "review.kind.evmTransaction": "EVM transaction",
    "review.field.signingKey": "Signing key",
    "review.field.signingAddress": "Signing address",
    "review.field.publicKey": "Public key",
    "review.field.from": "From",
    "review.field.to": "To",
    "review.field.fromTokenAccount": "From token account",
    "review.field.toTokenAccount": "To token account",
    "review.field.mint": "Mint",
    "review.field.amount": "Amount",
    "review.field.program": "Program",
    "review.field.programIndexed": "Program {{index}}",
    "review.field.instruction": "Instruction",
    "review.field.instructions": "Instructions",
    "review.field.transferTo": "Transfer {{index}} · To",
    "review.field.transferToTokenAccount": "Transfer {{index}} · To token account",
    "review.field.transferAmount": "Transfer {{index}} · Amount",
    "review.field.transferMint": "Transfer {{index}} · Mint",
    "review.field.moreTransfers": "More transfers",
    "review.field.authority": "Authority",
    "review.field.accountIndexes": "Account indexes",
    "review.field.data": "Data",
    "review.field.messageFormat": "Message format",
    "review.field.feePayer": "Fee payer",
    "review.field.blockhashOrNonce": "Blockhash or nonce value",
    "review.field.scheme": "Signature scheme",
    "review.field.account": "Account {{index}}",
    "review.field.message": "Complete message",
    "review.field.chainId": "Chain ID",
    "review.field.contract": "To",
    "review.field.value": "Value",
    "review.field.selector": "Selector",
    "review.field.type": "Type",
    "review.field.nonce": "Nonce",
    "review.field.gas": "Gas limit",
    "review.field.maxFeePerGas": "Max fee per gas",
    "review.field.gasPrice": "Gas price",
    "review.field.maxPriorityFeePerGas": "Max priority fee per gas",
    "review.field.call": "Call",
    "review.field.argument": "Argument {{index}} · {{name}}",
    "review.field.initCode": "Contract init code",
    "review.field.calldata": "Complete calldata",
    "review.field.unsignedTransaction": "Unsigned transaction",
    "review.field.digest": "Signing digest",
    "review.note.wei": "wei",
    "review.note.baseUnits": "base units",
    "review.note.decimals": "decimals {{count}}",
    "review.note.bytes": "{{count}} bytes",
    "review.note.dataBytes": "{{count}} bytes of data",
    "review.note.notDecoded": "not decoded",
    "review.note.transfersDecoded": "{{count}} decoded transfers",
    "review.note.instructionsNotDecoded": "{{count}} not decoded",
    "review.note.moreInDetails": "and {{count}} more, see Details",
    "review.note.argumentsInDetails": "{{count}} arguments in Details",
    "review.note.contractCreation": "contract creation",
    "review.note.signer": "signer",
    "review.note.writable": "writable",
    "review.note.readOnly": "read-only",
    "review.note.systemProgram": "System Program",
    "review.note.tokenProgram": "SPL Token Program",
    "review.group.request": "Request",
    "review.group.transaction": "Transaction",
    "review.group.accounts": "Accounts in message",
    "review.group.instruction": "Instruction {{index}}",
    "review.group.call": "Decoded call",
    "review.group.exact": "Exact content to sign",
    "bitcoin.signingIdentity": `BIP341 Taproot key-path Schnorr (BIP86 empty tree)
Internal key: {{key}}`,
    "bitcoin.title": "Review Bitcoin Taproot payment",
    "bitcoin.network": "Network (requester's selection): {{network}}",
    "bitcoin.networkWarning": "This network label is not chain proof. Verify the destination and funding independently; do not treat testnet or Signet as safer.",
    "bitcoin.input": "Input: {{txid}}:{{vout}}",
    "bitcoin.inputAmount": "Input amount: {{sats}} sats ({{btc}} BTC)",
    "bitcoin.outputs": "Outputs",
    "bitcoin.output": "Output {{index}}: {{address}} · {{sats}} sats ({{btc}} BTC) · {{role}}",
    "bitcoin.sameKeyReturn": "same-key return",
    "bitcoin.recipient": "recipient",
    "bitcoin.fee": "Fee: {{sats}} sats ({{btc}} BTC) · {{rate}}",
    "bitcoin.vsize": "Signed vsize: {{vsize}} vB",
    "bitcoin.rbfSignals": "This transaction signals RBF.",
    "bitcoin.rbfDoesNotSignal": "This transaction does not signal RBF.",
    "bitcoin.netLeaving": "Net value leaving this key: {{sats}} sats ({{btc}} BTC)",
    "bitcoin.unsignedTxid": "Unsigned transaction ID: {{txid}}",
    "bitcoin.outputKey": "Taproot output key Q: {{key}}",
    "bitcoin.highFeeWarning": "Warning: this fee is above the V1 review threshold (100 sat/vB or 2% of input).",
    "sign.blindNotice": "Some content is not decoded; approving it is blind signing.",
    "evm.title": "EVM transaction on chain {{chainId}}",
    "evm.type": "type: {{type}}",
    "evm.to": "to: {{to}}",
    "evm.contractCreation": "to: (contract creation)",
    "evm.value": "value: {{value}} wei",
    "evm.nonce": "nonce: {{value}}",
    "evm.gas": "gas: {{value}}",
    "evm.gasPrice": "gasPrice: {{value}} wei",
    "evm.maxFeePerGas": "maxFeePerGas: {{value}} wei",
    "evm.maxPriorityFeePerGas": "maxPriorityFeePerGas: {{value}} wei",
    "evm.call": "call: {{call}}",
    "evm.selector": "selector: {{selector}}",
    "evm.selectorNone": "selector: none",
    "evm.calldata": "calldata ({{bytes}} bytes, complete): {{calldata}}",
    "evm.calldataNone": "calldata: none",
    "release.title": "Release protected access",
    "release.subtitle": "{{count}} protected item(s)",
    "release.confirm": "Confirm release",
    "context.session": "Session",
    "context.command": "Command",
    "context.egress": "Egress",
    "context.source": "Source",
    "context.sourceEnv": "env",
    "context.sourceTag": "tag",
    "context.sourceSkill": "skill",
    "context.agent": "Agent",
    "context.grant": "Grant",
    "context.agentAccess": "Agent access",
    "context.secrets": "Secrets",
    "context.kindStatic": "static",
    "context.kindKeypair": "keypair",
    "context.oneTime": "one-time",
    "context.minutes": "{{count}} min",
    "context.seconds": "{{count}} sec"
  },
  zh: {
    "common.cancel": "取消",
    "common.continue": "继续",
    "common.done": "完成",
    "sandbox.intro": "受保护的保险库密钥在这里创建和使用，与 Avibe 的其他部分隔离。一切都在你的浏览器里完成——Avibe 的服务器只提供这段代码，从不接触你的密钥。",
    "authorize.waiting": "正在准备授权…",
    "authorize.waitingLong": "仍在等待 Avibe。如果一直没有出现，请关闭这个窗口，回到 Avibe 重新批准。",
    "setup.title": "创建保险库 passkey",
    "setup.subtitle": "保护档设置",
    "setup.iframeBody": "在这个沙箱窗口里创建 passkey。保险库密钥只留在这里。",
    "setup.topLevelBody": "确认在沙箱域名上创建 passkey。保险库密钥只留在这个浏览器里。",
    "setup.createPasskey": "创建 passkey",
    "setup.finish": "完成设置",
    "setup.ready": "准备好了。",
    "setup.readyOnOrigin": "当前域名已准备好。",
    "setup.popupBlocked": "弹窗被拦截了。再点一次创建 passkey。",
    "setup.popupPrompt": "请在新窗口里创建 passkey。",
    "setup.createdFinish": "passkey 已创建。点「完成设置」继续。",
    "setup.passkeyPrompt": "请按浏览器里的 passkey 提示操作…",
    "setup.requestMissing": "缺少设置请求。",
    "setup.requestInvalid": "设置请求无效。",
    "setup.created": "passkey 已创建。",
    "unlock.sessionTitle": "解锁保险库",
    "unlock.sessionSubtitle": "本浏览器内保持 {{minutes}} 分钟",
    "unlock.sessionBody": "使用一次 Passkey 解锁。解锁期间，普通授权只需确认；签名仍会每次验证 Passkey。",
    "plaintext.copyTitle": "复制保护档值",
    "plaintext.title": "保护档值",
    "plaintext.body": "明文只会在这个沙箱窗口里显示。",
    "plaintext.copy": "复制",
    "plaintext.copyWarning": "复制会把明文放到系统剪贴板，其他应用或页面可能读取。",
    "plaintext.copyReady": "passkey 已确认。再次点击「复制」写入剪贴板。",
    "plaintext.copyFailed": "复制未完成。明文仍只显示在这里。",
    "plaintext.copiedBody": "已从沙箱窗口复制。明文没有交给 Avibe。",
    "reveal.showConfirmTitle": "显示保护档值",
    "reveal.confirmBody": "在沙箱里确认后，只在这里显示明文。明文不会交给 Avibe。",
    "sign.title": "签名保护档操作",
    "sign.confirm": "确认签名",
    "review.details": "详情",
    "review.copy": "复制",
    "review.copied": "已复制",
    "review.copySelected": "已选中，请用键盘复制",
    "review.kind.solanaSystemTransfer": "Solana · SOL 转账",
    "review.kind.solanaTokenTransfer": "Solana · 代币转账",
    "review.kind.solanaTransaction": "Solana 交易",
    "review.kind.evmTransaction": "EVM 交易",
    "review.field.signingKey": "签名密钥",
    "review.field.signingAddress": "签名地址",
    "review.field.publicKey": "公钥",
    "review.field.from": "转出账户",
    "review.field.to": "转入账户",
    "review.field.fromTokenAccount": "转出代币账户",
    "review.field.toTokenAccount": "转入代币账户",
    "review.field.mint": "代币 Mint",
    "review.field.amount": "数量",
    "review.field.program": "程序",
    "review.field.programIndexed": "程序 {{index}}",
    "review.field.instruction": "指令",
    "review.field.instructions": "指令数",
    "review.field.transferTo": "转账 {{index}} · 转入账户",
    "review.field.transferToTokenAccount": "转账 {{index}} · 转入代币账户",
    "review.field.transferAmount": "转账 {{index}} · 数量",
    "review.field.transferMint": "转账 {{index}} · 代币 Mint",
    "review.field.moreTransfers": "其余转账",
    "review.field.authority": "授权账户",
    "review.field.accountIndexes": "账户索引",
    "review.field.data": "数据",
    "review.field.messageFormat": "消息格式",
    "review.field.feePayer": "手续费支付方",
    "review.field.blockhashOrNonce": "区块哈希或 nonce 值",
    "review.field.scheme": "签名方案",
    "review.field.account": "账户 {{index}}",
    "review.field.message": "完整消息",
    "review.field.chainId": "链 ID",
    "review.field.contract": "目标地址",
    "review.field.value": "转账金额",
    "review.field.selector": "函数选择器",
    "review.field.type": "类型",
    "review.field.nonce": "Nonce",
    "review.field.gas": "Gas 上限",
    "review.field.maxFeePerGas": "每单位 Gas 最高费用",
    "review.field.gasPrice": "Gas 价格",
    "review.field.maxPriorityFeePerGas": "每单位 Gas 最高优先费",
    "review.field.call": "调用",
    "review.field.argument": "参数 {{index}} · {{name}}",
    "review.field.initCode": "合约初始化代码",
    "review.field.calldata": "完整 calldata",
    "review.field.unsignedTransaction": "未签名交易",
    "review.field.digest": "签名摘要",
    "review.note.wei": "wei",
    "review.note.baseUnits": "最小单位",
    "review.note.decimals": "小数位 {{count}}",
    "review.note.bytes": "{{count}} 字节",
    "review.note.dataBytes": "数据 {{count}} 字节",
    "review.note.notDecoded": "未解析",
    "review.note.transfersDecoded": "{{count}} 笔已解析转账",
    "review.note.instructionsNotDecoded": "{{count}} 条未解析",
    "review.note.moreInDetails": "另有 {{count}} 笔，见详情",
    "review.note.argumentsInDetails": "{{count}} 个参数见详情",
    "review.note.contractCreation": "创建合约",
    "review.note.signer": "签名者",
    "review.note.writable": "可写",
    "review.note.readOnly": "只读",
    "review.note.systemProgram": "System Program",
    "review.note.tokenProgram": "SPL Token Program",
    "review.group.request": "请求来源",
    "review.group.transaction": "交易",
    "review.group.accounts": "消息内账户",
    "review.group.instruction": "指令 {{index}}",
    "review.group.call": "已解析调用",
    "review.group.exact": "待签名的完整内容",
    "bitcoin.signingIdentity": `BIP341 Taproot 密钥路径 Schnorr（BIP86 空脚本树）
内部公钥：{{key}}`,
    "bitcoin.title": "审核 Bitcoin Taproot 支付",
    "bitcoin.network": "网络（请求方选择）：{{network}}",
    "bitcoin.networkWarning": "这个网络标签不是链上证明。请独立核对收款地址和资金来源；不要因为是测试网或 Signet 就降低警惕。",
    "bitcoin.input": "输入：{{txid}}:{{vout}}",
    "bitcoin.inputAmount": "输入金额：{{sats}} sats（{{btc}} BTC）",
    "bitcoin.outputs": "输出",
    "bitcoin.output": "输出 {{index}}：{{address}} · {{sats}} sats（{{btc}} BTC）· {{role}}",
    "bitcoin.sameKeyReturn": "同一密钥找零",
    "bitcoin.recipient": "收款方",
    "bitcoin.fee": "手续费：{{sats}} sats（{{btc}} BTC）· {{rate}}",
    "bitcoin.vsize": "签名后 vsize：{{vsize}} vB",
    "bitcoin.rbfSignals": "此交易会发出 RBF 信号。",
    "bitcoin.rbfDoesNotSignal": "此交易不会发出 RBF 信号。",
    "bitcoin.netLeaving": "离开此密钥的净金额：{{sats}} sats（{{btc}} BTC）",
    "bitcoin.unsignedTxid": "未签名交易 ID：{{txid}}",
    "bitcoin.outputKey": "Taproot 输出密钥 Q：{{key}}",
    "bitcoin.highFeeWarning": "警告：手续费高于 V1 审核阈值（100 sat/vB 或输入金额的 2%）。",
    "sign.blindNotice": "部分内容未解析，批准即为盲签。",
    "evm.title": "EVM 交易，链 ID {{chainId}}",
    "evm.type": "类型：{{type}}",
    "evm.to": "目标地址：{{to}}",
    "evm.contractCreation": "目标地址：（创建合约）",
    "evm.value": "转账金额：{{value}} wei",
    "evm.nonce": "nonce：{{value}}",
    "evm.gas": "gas：{{value}}",
    "evm.gasPrice": "gasPrice：{{value}} wei",
    "evm.maxFeePerGas": "maxFeePerGas：{{value}} wei",
    "evm.maxPriorityFeePerGas": "maxPriorityFeePerGas：{{value}} wei",
    "evm.call": "调用：{{call}}",
    "evm.selector": "函数选择器：{{selector}}",
    "evm.selectorNone": "函数选择器：无",
    "evm.calldata": "calldata（{{bytes}} 字节，完整）：{{calldata}}",
    "evm.calldataNone": "calldata：无",
    "release.title": "批准保护档访问",
    "release.subtitle": "{{count}} 个保护档项目",
    "release.confirm": "确认批准",
    "context.session": "会话",
    "context.command": "命令",
    "context.egress": "外联",
    "context.source": "来源",
    "context.sourceEnv": "环境变量",
    "context.sourceTag": "标签",
    "context.sourceSkill": "技能",
    "context.agent": "Agent",
    "context.grant": "授权",
    "context.agentAccess": "Agent 授权时长",
    "context.secrets": "保护档",
    "context.kindStatic": "静态值",
    "context.kindKeypair": "签名密钥",
    "context.oneTime": "一次性",
    "context.minutes": "{{count}} 分钟",
    "context.seconds": "{{count}} 秒"
  }
};
let ri = "en";
function Og(e) {
  return e === "zh" ? "zh" : "en";
}
function Rg(e) {
  const t = Og(e);
  return t === ri ? !1 : (ri = t, !0);
}
function Lg() {
  return ri;
}
function Cg(e) {
  return typeof e == "string" && Object.hasOwn(io.en, e);
}
function F(e, t = {}) {
  const n = io[ri], r = io.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function zg(e) {
  return JSON.stringify(e ?? {});
}
function Aa(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function Pe(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = zg(n), e.textContent = F(t, n);
}
function qt(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function Ug(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = F(n, Aa(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = F(n, Aa(t.dataset.i18nPlaceholderParams)));
  });
}
const Wu = {
  sol: { symbol: "SOL", baseUnit: "lamports", decimals: 9 },
  eth: { symbol: "ETH", baseUnit: "wei", decimals: 18 }
};
function Mg(e, t) {
  const { symbol: n, baseUnit: r, decimals: i } = Wu[t];
  if (!/^(?:0|[1-9][0-9]*)$/.test(e)) return `${e} ${r}`;
  const o = e.padStart(i + 1, "0"), s = o.slice(-i).replace(/0+$/, "");
  return `${o.slice(0, -i)}${s ? `.${s}` : ""} ${n} (${e} ${r})`;
}
function Q(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
const Hg = "http://www.w3.org/2000/svg";
function xr(e, t) {
  const n = document.createElementNS(Hg, e);
  for (const [r, i] of Object.entries(t)) n.setAttribute(r, i);
  return n;
}
function Ng() {
  const e = xr("svg", {
    class: "review-notice-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true"
  });
  return e.append(
    xr("path", { d: "M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }),
    xr("path", { d: "M12 9v4.5" }),
    xr("path", { d: "M12 17h.01" })
  ), e;
}
function Fg(e) {
  if (!e.notes?.length) return null;
  const t = Q("span", "review-notes");
  for (const n of e.notes) {
    const r = Q("span", "review-note");
    typeof n == "string" ? Pe(r, n) : Pe(r, n.key, { count: n.count }), t.append(r);
  }
  return t;
}
function _a(e) {
  const t = Q("span", "review-label"), n = {
    ...e.index === void 0 ? {} : { index: e.index },
    ...e.name === void 0 ? {} : { name: e.name }
  };
  return Pe(t, e.label, Object.keys(n).length > 0 ? n : void 0), t;
}
function Kg(e, t) {
  const n = Q("button", "review-copy");
  return n.type = "button", Pe(n, "review.copy"), n.addEventListener("click", () => {
    const r = () => {
      window.getSelection()?.selectAllChildren(e), Pe(n, "review.copySelected");
    };
    let i;
    try {
      i = navigator.clipboard.writeText(t);
    } catch {
      r();
      return;
    }
    i.then(() => Pe(n, "review.copied"), r);
  }), n;
}
function Ci(e) {
  const t = Q("div", e.raw ? "review-field review-field-raw" : "review-field"), n = Fg(e);
  if (e.raw) {
    const o = Q("div", "review-raw-head"), s = Q("pre", "review-raw");
    return qt(s, e.value), o.append(_a(e)), n && o.append(n), o.append(Kg(s, e.value)), t.append(o, s), t;
  }
  const r = Q("div", "review-value"), i = Q("span", "review-mono");
  return qt(i, e.native ? Mg(e.value, e.native) : e.value), r.append(i), n && r.append(n), t.append(_a(e), r), t;
}
function Ia(e, t, n) {
  const r = Q("section", "review-group"), i = Q("h2", "review-group-title");
  return Pe(i, e, t === void 0 ? void 0 : { index: t }), r.append(i, ...n), r;
}
function Dg(e, t, n = {}) {
  qt(e, "");
  const r = Q("div", "review"), i = Q("div", "review-heading"), o = Q("p", "review-kind");
  if (Pe(o, t.kind), i.append(o), n.session) {
    const l = Q("p", "review-session"), d = Q("span", "review-session-label");
    Pe(d, "context.session");
    const h = Q("span", "review-session-value");
    qt(h, n.session), l.append(d, h), i.append(l);
  }
  const s = Q("div", "review-summary");
  if (s.append(Ci(t.signer), ...t.summary.map(Ci)), r.append(i, s), t.undecoded) {
    const l = Q("p", "review-notice"), d = Q("span", "review-notice-text");
    Pe(d, "sign.blindNotice"), l.append(Ng(), d), r.append(l);
  }
  const a = Q("details", "review-details"), c = Q("summary", "review-details-toggle");
  Pe(c, "review.details");
  const u = Q("div", "review-details-body");
  n.rows && u.append(Ia("review.group.request", void 0, [n.rows]));
  for (const l of t.details) u.append(Ia(l.title, l.index, l.fields.map(Ci)));
  a.append(c, u), r.append(a), e.append(r);
}
function ze(e) {
  throw new Error(`signing review is malformed: ${e}`);
}
function ii(e, t, n) {
  (typeof e != "object" || e === null || Array.isArray(e)) && ze(`${n} must be an object`);
  const r = e;
  for (const i of Object.keys(r)) t.includes(i) || ze(`${n}.${i} is not a review field`);
  return r;
}
function Kn(e, t, n) {
  return (!Cg(e) || !e.startsWith(`${t}.`)) && ze(`${n} must be a ${t} translation key`), e;
}
function oo(e, t) {
  if (e !== void 0)
    return (typeof e != "number" || !Number.isSafeInteger(e) || e < 0) && ze(`${t} must be a non-negative integer`), e;
}
function Lr(e, t) {
  return Array.isArray(e) || ze(`${t} must be a list`), e;
}
const jg = /^[A-Za-z_][A-Za-z0-9_]{0,63} \([a-z][a-z0-9[\]]{0,31}\)$/;
function zi(e, t) {
  const n = ii(e, ["label", "index", "name", "value", "native", "notes", "raw"], t), r = oo(n.index, `${t}.index`);
  n.name !== void 0 && (typeof n.name != "string" || !jg.test(n.name)) && ze(`${t}.name must be a built-in parameter name`), typeof n.value != "string" && ze(`${t}.value must be a string`), n.native !== void 0 && !Object.hasOwn(Wu, n.native) && ze(`${t}.native is not a native currency`), n.raw !== void 0 && typeof n.raw != "boolean" && ze(`${t}.raw must be a boolean`);
  const i = n.notes === void 0 ? void 0 : Lr(n.notes, `${t}.notes`).map((o, s) => {
    const a = `${t}.notes[${s}]`;
    if (typeof o == "string") return Kn(o, "review.note", a);
    const c = ii(o, ["key", "count"], a), u = oo(c.count, `${a}.count`);
    return u === void 0 && ze(`${a}.count is required`), { key: Kn(c.key, "review.note", `${a}.key`), count: u };
  });
  return {
    label: Kn(n.label, "review.field", `${t}.label`),
    ...r === void 0 ? {} : { index: r },
    ...n.name === void 0 ? {} : { name: n.name },
    value: n.value,
    ...n.native === void 0 ? {} : { native: n.native },
    ...i === void 0 ? {} : { notes: i },
    ...n.raw === void 0 ? {} : { raw: n.raw }
  };
}
function Vg(e) {
  const t = ii(e, ["kind", "signer", "summary", "undecoded", "details"], "review");
  return typeof t.undecoded != "boolean" && ze("review.undecoded must be a boolean"), {
    kind: Kn(t.kind, "review.kind", "review.kind"),
    signer: zi(t.signer, "review.signer"),
    summary: Lr(t.summary, "review.summary").map((n, r) => zi(n, `review.summary[${r}]`)),
    undecoded: t.undecoded,
    details: Lr(t.details, "review.details").map((n, r) => {
      const i = `review.details[${r}]`, o = ii(n, ["title", "index", "fields"], i), s = oo(o.index, `${i}.index`);
      return {
        title: Kn(o.title, "review.group", `${i}.title`),
        ...s === void 0 ? {} : { index: s },
        fields: Lr(o.fields, `${i}.fields`).map((a, c) => zi(a, `${i}.fields[${c}]`))
      };
    })
  };
}
let os = null;
function qg(e) {
  os = e;
}
function Gg() {
  os?.("ui.show");
}
function Wg() {
  os?.("ui.hide");
}
function Zg() {
  const e = document.getElementById("page"), t = e?.querySelector(".card"), n = e?.querySelector("h1"), r = e?.querySelector(".sub"), i = e?.querySelector(".body"), o = e?.querySelector(".card-scroll"), s = e?.querySelector(".card-footer");
  if (!t || !n || !r || !i || !o || !s)
    throw new Error("sandbox UI is unavailable");
  return {
    card: t,
    title: n,
    subtitle: r,
    body: i,
    scroll: o,
    footer: s
  };
}
function Zu(e) {
  e.querySelectorAll(".dynamic").forEach((t) => t.remove());
}
function ge(e) {
  return { text: e };
}
function Xn(e, t) {
  return { key: e, params: t };
}
function W(e, t) {
  if (typeof t == "string") {
    Pe(e, t);
    return;
  }
  if ("text" in t) {
    qt(e, t.text);
    return;
  }
  Pe(e, t.key, t.params);
}
function ss(e, t, n) {
  const r = Zg();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), Gg(), r.card.classList.remove("confirm-card"), W(r.title, e), W(r.subtitle, t), n ? W(r.body, n) : qt(r.body, ""), Zu(r.card), r;
}
function as() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), Zu(e)), Wg();
}
function an(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function Pa(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function Xg(e) {
  const t = document.createElement("div");
  if (t.className = "detail-value", e.variant === "chips") {
    t.classList.add("detail-chips");
    for (const r of e.values) {
      const i = document.createElement("span");
      i.className = `detail-chip${e.tone === "warning" ? " detail-chip-warning" : ""}`, W(i, r), t.append(i);
    }
    return t;
  }
  const n = document.createElement(e.variant === "command" ? "code" : "span");
  return n.className = e.variant === "command" ? "detail-command" : e.variant === "mono" ? "detail-mono" : "detail-text", W(n, e.value), e.variant === "mono" && (n.title = n.textContent ?? ""), t.append(n), t;
}
function Xu(e) {
  const t = document.createElement("div");
  t.className = "confirmation-details";
  for (const n of e.rows) {
    const r = document.createElement("div");
    r.className = "detail-row";
    const i = document.createElement("span");
    i.className = "detail-label", W(i, n.label), r.append(i, Xg(n)), t.append(r);
  }
  return t;
}
function Yg(e, t, n) {
  if (qt(e, ""), e.append(Xu(t)), n) {
    const r = document.createElement("p");
    r.className = "confirmation-note", W(r, n), e.append(r);
  }
}
function Yn(e) {
  const t = document.createElement("button");
  return t.type = "button", t.className = "action dynamic", W(t, e), t;
}
function Yu(e = ge("")) {
  const t = document.createElement("p");
  return t.className = "setup-status dynamic", W(t, e), t;
}
let Er = null;
function cs() {
  return new Error("operation-superseded");
}
function Dn(e) {
  const t = e.reason;
  return t instanceof Error ? t : cs();
}
function Ba(e) {
  if (e?.aborted) throw Dn(e);
}
function sr(e) {
  Er?.abort(cs());
  const t = new AbortController();
  return Er = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    Er === t && (Er = null);
  });
}
async function Jg(e) {
  return sr(async (t) => {
    Ba(t), Ba(e.abortSignal);
    const n = new TextDecoder().decode(e.plaintext), r = ss("plaintext.title", ge(e.name), "plaintext.body"), i = document.createElement("pre");
    i.className = "plaintext dynamic", i.textContent = n;
    const o = Yn("common.done"), s = Yn("plaintext.copy");
    s.classList.add("secondary");
    const a = Yu("plaintext.copyWarning");
    an(r.card, i), an(r.card, a), an(r.card, s), an(r.card, o);
    try {
      await new Promise((c, u) => {
        if (t.aborted) {
          u(Dn(t));
          return;
        }
        if (e.abortSignal?.aborted) {
          u(Dn(e.abortSignal));
          return;
        }
        let l = !1, d = () => {
        }, h = null, f = null, b = !e.prepareCopy;
        const y = () => {
          h?.abort(cs());
        }, p = (I) => {
          l || (l = !0, d(), y(), I());
        }, g = (I) => {
          p(() => u(Dn(I)));
        }, v = () => g(t), A = () => {
          e.abortSignal && g(e.abortSignal);
        };
        d = () => {
          t.removeEventListener("abort", v), e.abortSignal?.removeEventListener("abort", A);
        }, t.addEventListener("abort", v, { once: !0 }), e.abortSignal?.addEventListener("abort", A, { once: !0 }), s.addEventListener("click", () => {
          if (f) return;
          if (t.aborted) {
            g(t);
            return;
          }
          if (e.abortSignal?.aborted) {
            g(e.abortSignal);
            return;
          }
          s.disabled = !0;
          const I = new AbortController();
          h = I;
          const _ = () => {
            try {
              return Promise.resolve(e.onCopy ? e.onCopy(n, I.signal) : navigator.clipboard.writeText(n));
            } catch (C) {
              return Promise.reject(C);
            }
          }, O = e.prepareCopy && !b ? Promise.resolve(e.prepareCopy(I.signal)).then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (b = !0, W(a, "plaintext.copyReady"), s.disabled = !1);
          }) : _().then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (b = !1), W(a, "plaintext.copiedBody"), s.disabled = !1);
          });
          f = O, O.then(
            () => {
              I.signal.aborted;
            },
            (C) => {
              if (!(I.signal.aborted || l)) {
                if (t.aborted) {
                  g(t);
                  return;
                }
                if (e.abortSignal?.aborted) {
                  g(e.abortSignal);
                  return;
                }
                s.disabled = !1, W(a, "plaintext.copyFailed");
              }
            }
          ).finally(() => {
            h === I && (h = null), f === O && (f = null);
          });
        }), o.addEventListener(
          "click",
          () => {
            p(c);
          },
          { once: !0 }
        );
      });
    } finally {
      as();
    }
  });
}
function us(e, t, n, r) {
  const i = ss(e.title, e.subtitle, e.review ? void 0 : e.body);
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.review ? Dg(i.body, e.review, {
    session: e.reviewSession,
    rows: e.details && Xu(e.details)
  }) : e.details && Yg(i.body, e.details, e.body);
  const o = Yn(e.confirmLabel), s = Yn("common.cancel");
  return s.classList.add("secondary"), Pa(i.card, s), Pa(i.card, o), o.disabled = !0, new Promise((a, c) => {
    let u = !1, l;
    const d = setTimeout(() => {
      try {
        l = n?.(i.card);
      } catch (y) {
        f(() => c(y));
        return;
      }
      (l?.ready ?? Promise.resolve()).then(
        () => {
          !u && !t.aborted && (o.disabled = !1);
        },
        (y) => f(() => c(y))
      );
    }, 500), h = () => {
      f(() => c(Dn(t)));
    }, f = (b) => {
      u || (u = !0, clearTimeout(d), l?.dispose(), t.removeEventListener("abort", h), as(), b());
    };
    if (t.aborted) {
      h();
      return;
    }
    t.addEventListener("abort", h, { once: !0 }), o.addEventListener("click", () => {
      if (o.disabled) return;
      o.disabled = !0, s.disabled = !0;
      let b;
      try {
        l?.assertCurrent(), b = r ? r() : Promise.resolve();
      } catch (y) {
        f(() => c(y));
        return;
      }
      b.then(
        () => f(a),
        (y) => f(() => c(y))
      );
    }), s.addEventListener(
      "click",
      () => {
        f(() => c(new Error("operation-cancelled")));
      },
      { once: !0 }
    );
  });
}
function oi(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Qg(e) {
  return new Promise((t, n) => {
    const r = () => n(oi(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function $a(e) {
  if (e?.aborted) throw oi(e);
}
async function Ju(e) {
  const t = ns(e.wrapMeta), n = No(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      rs(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), oi(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? oi(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [Qg(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await Qu({
      wrapMeta: t.wrapMeta,
      currentRpId: e.currentRpId,
      assertion: i,
      ...e.abortSignal ? { abortSignal: e.abortSignal } : {},
      ...e.policy ? { policy: e.policy } : {}
    });
  } finally {
    r?.fill(0);
  }
}
async function Qu(e) {
  const t = ns(e.wrapMeta);
  let n;
  try {
    $a(e.abortSignal), n = await wy(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), $a(e.abortSignal);
    const r = Ku({
      vmk: n,
      wrapMeta: t.wrapMeta,
      freshSetup: !1,
      scopeId: t.scopeId,
      ...e.policy ? { policy: e.policy } : {}
    });
    return n = void 0, { state: r.state, rpId: e.currentRpId, expiresAt: r.expiresAt };
  } finally {
    e.assertion.prfOutput.fill(0), n?.fill(0);
  }
}
function ew(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function tw(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function Ta(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function nw(e) {
  const t = ew(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new m("invalid_payload", "kind must be static or keypair");
  const r = Ta(t.name, "name");
  if (t.rootMetadata !== void 0) throw new m("invalid_payload", "seal cannot set vault root metadata");
  const i = tw(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.curve !== void 0) throw new m("invalid_payload", "static seal cannot carry a curve");
    if (t.inputMode !== "parent-value")
      throw new m("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: Ta(t.value, "value"),
      wrapMeta: i
    };
  }
  if (t.inputMode !== void 0)
    throw new m("invalid_payload", "keypair seal is generate-only and does not accept inputMode");
  if (t.value !== void 0)
    throw new m("invalid_payload", "keypair seal cannot accept parent-provided private key material");
  let o;
  try {
    o = vn(t.curve);
  } catch {
    throw new m("invalid_payload", "unsupported signing curve");
  }
  return {
    name: r,
    kind: "keypair",
    ...t.curve !== void 0 ? { curve: o } : {},
    wrapMeta: i
  };
}
function ls(e) {
  const t = /* @__PURE__ */ new Set();
  function n(i) {
    for (let o = 0; o < i.length; o += 1) {
      const s = i.charCodeAt(o);
      if (s >= 55296 && s <= 56319) {
        const a = i.charCodeAt(++o);
        if (!(a >= 56320 && a <= 57343)) throw new Error("signing context contains an unpaired UTF-16 surrogate");
      } else if (s >= 56320 && s <= 57343)
        throw new Error("signing context contains an unpaired UTF-16 surrogate");
    }
  }
  function r(i) {
    if (!(i === null || typeof i == "boolean")) {
      if (typeof i == "string") {
        n(i);
        return;
      }
      if (typeof i == "number") {
        if (!Number.isSafeInteger(i)) throw new Error("signing context numbers must be safe integers; use strings for large quantities");
        return;
      }
      if (typeof i != "object") throw new Error("signing context must contain only JSON values");
      if (!Array.isArray(i) && Object.getPrototypeOf(i) !== Object.prototype && Object.getPrototypeOf(i) !== null)
        throw new Error("signing context must contain only plain JSON objects");
      if (t.has(i)) throw new Error("signing context must not contain cycles");
      if (t.add(i), Array.isArray(i))
        for (const o of i) r(o);
      else
        for (const [o, s] of Object.entries(i))
          n(o), r(s);
      t.delete(i);
    }
  }
  r(e);
}
const rw = 512, el = "avibe-vault-signed-context-replay:v2", iw = "avibe-vault-signed-context-replay:v2", ow = "avibe-vault-signed-context-replay:v2", Ne = /* @__PURE__ */ new Map();
let Oa = !1, zn = null;
function Le(e) {
  return typeof e == "object" && e !== null;
}
function dt(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Pn(e, t) {
  if (e !== void 0) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function Ui(e, t) {
  if (e !== void 0) {
    if (!Array.isArray(e) || !e.every((n) => typeof n == "string"))
      throw new m("invalid_payload", `${t} must be a string array`);
    return e;
  }
}
function sw(e, t) {
  if (e !== "static" && e !== "keypair") throw new m("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function aw(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new m("invalid_payload", "context purpose is invalid");
  return e;
}
function so(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new m("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function cw(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new m("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function ds(e, t) {
  if (!Le(e)) throw new m(t, "agent delivery context.release must be an object");
  return {
    name: dt(e.name, "context.release.name"),
    ttlSecs: so(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: cw(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: so(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: dt(e.operationHash, "context.release.operationHash")
  };
}
function rt(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(rt).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${rt(t[n])}`).join(",")}}`;
}
function fs(e) {
  const t = Le(e) ? e : null;
  if (!t) throw new m("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new m("invalid_payload", "context version must be 2");
  const n = aw(t.purpose);
  dt(t.requestId, "context.requestId"), t.grantId !== void 0 && Pn(t.grantId, "context.grantId");
  const r = Le(t.display) ? t.display : null;
  if (!r) throw new m("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new m("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, u) => {
    if (!Le(c)) throw new m("invalid_payload", `context.display.secrets[${u}] must be an object`);
    dt(c.name, `context.display.secrets[${u}].name`), sw(c.kind, `context.display.secrets[${u}].kind`);
  }), r.sessionLabel !== void 0 && Pn(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && Pn(r.command, "context.display.command"), r.egress !== void 0 && Pn(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!Le(i)) throw new m("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && Ui(i.env, "context.display.source.env"), i.tags !== void 0 && Ui(i.tags, "context.display.source.tags"), i.skills !== void 0 && Ui(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && so(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = Le(t.signature) ? t.signature : null;
  if (!o) throw new m("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new m("invalid_payload", "context signature alg must be ed25519");
  dt(o.keyId, "context.signature.keyId"), dt(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!Le(s)) throw new m("invalid_payload", "context.agent must be an object");
    const c = Le(s.publicKey) ? s.publicKey : null;
    if (!c) throw new m("invalid_payload", "context.agent.publicKey must be an object");
    dt(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && Pn(c.fingerprint, "context.agent.publicKey.fingerprint"), dt(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = ds(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new m("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new m("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !Le(a))
    throw new m("invalid_payload", "context.release must be an object");
  return dt(t.expiresAt, "context.expiresAt"), t;
}
function bi(e) {
  const { signature: t, ...n } = e;
  return rt(n);
}
function ao(e) {
  if (e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", `${e.expectedPurpose} context has the wrong purpose`);
  if (!e.context.display.secrets.some(
    (n) => n.name === e.secret.name && n.kind === e.secret.kind
  )) {
    const n = e.secret.kind === "keypair" ? "key" : "secret";
    throw new m("invalid_context", `${e.expectedPurpose} context does not cover the requested ${n}`);
  }
}
function si(e) {
  if (e.expectedPurpose && e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", "signed context purpose does not match operation");
  const t = e.now ?? Date.now(), n = Date.parse(e.context.expiresAt);
  if (!Number.isFinite(n) || n <= t)
    throw new m("context_expired", "signed context is expired", !0);
  if (!Ky({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: bi(e.context)
  })) throw new m("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && ds(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new m("context_expired", "signed release approval is expired", !0);
}
function ps(e) {
  for (const [t, n] of Ne)
    n <= e && Ne.delete(t);
}
function uw() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function wn() {
  return typeof window < "u";
}
function hs() {
  return new m("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function tl(e) {
  const t = uw();
  if (!t && e && wn()) throw hs();
  return t;
}
function nl(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!Le(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function ys(e = Date.now(), t = !1) {
  ps(e);
  const n = tl(t);
  if (n)
    try {
      n.setItem(el, JSON.stringify({ version: 2, entries: [...Ne] }));
    } catch {
      if (t && wn()) throw hs();
    }
}
function rl(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && Ne.set(r, Math.max(Ne.get(r) ?? 0, i));
  n && ys(t);
}
function gs() {
  if (!(zn || typeof BroadcastChannel > "u"))
    try {
      zn = new BroadcastChannel(iw), zn.addEventListener("message", (e) => {
        const t = Le(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || rl(nl({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      zn = null;
    }
}
function lw(e = Date.now()) {
  Oa || (gs(), il(e, wn()), Oa = !0);
}
function il(e = Date.now(), t = !1) {
  gs();
  const n = tl(t);
  if (n)
    try {
      rl(nl(JSON.parse(n.getItem(el) ?? "null"), e), e, !1), ps(e);
    } catch {
      if (t && wn()) throw hs();
      ys(e);
    }
}
function dw(e) {
  gs();
  try {
    zn?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function fw() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function pw(e) {
  const t = fw();
  if (t) return await t.request(ow, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new m("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function ol(e, t) {
  lw(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new m("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  ps(t);
  for (const r of n.keys())
    if (Ne.has(r))
      throw new m("context_replayed", "signed context requestId was already used", !0);
  if (Ne.size + n.size > rw)
    throw new m("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function ai(e, t = Date.now()) {
  ol(e, t);
}
async function mi(e, t = Date.now()) {
  const n = [...e];
  await pw(() => {
    il(t, wn());
    const r = ol(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, Ne.get(o));
    for (const [o, s] of r) Ne.set(o, s);
    try {
      ys(t, wn());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? Ne.delete(s) : Ne.set(s, a);
      throw o;
    }
    dw([...r]);
  });
}
async function hw(e, t) {
  if (e.purpose !== "agent-deliver") throw new m("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  const n = ds(e.release, "invalid_context");
  if (n.name !== t) throw new m("invalid_context", "signed release name does not match release item");
  if (e.display.grantTtlSeconds === void 0 || e.display.grantTtlSeconds !== n.ttlSecs)
    throw new m("invalid_context", "signed release TTL does not match display TTL");
  return {
    purpose: "agent-deliver",
    name: n.name,
    grantId: e.grantId,
    ttlSecs: n.ttlSecs,
    approvalNonce: new Uint8Array(n.approvalNonce),
    approvalExpiresAtUnix: n.approvalExpiresAtUnix,
    operationHash: n.operationHash
  };
}
function yw(e) {
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  if (e.agent.publicKey.fingerprint && e.agent.publicKey.fingerprint !== e.agent.fingerprint)
    throw new m("invalid_context", "agent public key fingerprint mismatch");
  return { ...e.agent.publicKey, fingerprint: e.agent.fingerprint };
}
async function gw(e) {
  const t = e.map((n) => bi(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rt(t))));
}
function Ra(e) {
  return rt(e.display);
}
const ww = "1.2.3";
let Oe = class co extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof co ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof co && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${ww}`
    ].join(`
`);
    super(o), Object.defineProperty(this, "details", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "docsPath", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "metaMessages", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "shortMessage", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "AbiTypeError"
    }), n.cause && (this.cause = n.cause), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.shortMessage = t;
  }
};
function wt(e, t) {
  return e.exec(t)?.groups;
}
const sl = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, al = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, cl = /^\(.+?\).*?$/, La = /^tuple(?<array>(\[(\d*)\])*)$/;
function uo(e) {
  let t = e.type;
  if (La.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += uo(o), i < n - 1 && (t += ", ");
    }
    const r = wt(La, e.type);
    return t += `)${r?.array || ""}`, uo({
      ...e,
      type: t
    });
  }
  return "indexed" in e && e.indexed && (t = `${t} indexed`), e.name ? `${t} ${e.name}` : t;
}
function Bn(e) {
  let t = "";
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r];
    t += uo(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function bw(e) {
  return e.type === "function" ? `function ${e.name}(${Bn(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${Bn(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${Bn(e.inputs)})` : e.type === "error" ? `error ${e.name}(${Bn(e.inputs)})` : e.type === "constructor" ? `constructor(${Bn(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const ul = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function mw(e) {
  return ul.test(e);
}
function vw(e) {
  return wt(ul, e);
}
const ll = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function xw(e) {
  return ll.test(e);
}
function Ew(e) {
  return wt(ll, e);
}
const dl = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function kw(e) {
  return dl.test(e);
}
function Sw(e) {
  return wt(dl, e);
}
const fl = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function pl(e) {
  return fl.test(e);
}
function Aw(e) {
  return wt(fl, e);
}
const hl = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function _w(e) {
  return hl.test(e);
}
function Iw(e) {
  return wt(hl, e);
}
const yl = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function Pw(e) {
  return yl.test(e);
}
function Bw(e) {
  return wt(yl, e);
}
const $w = /^receive\(\) external payable$/;
function Tw(e) {
  return $w.test(e);
}
const Ow = /* @__PURE__ */ new Set(["indexed"]), lo = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class Rw extends Oe {
  constructor({ type: t }) {
    super("Unknown type.", {
      metaMessages: [
        `Type "${t}" is not a valid ABI type. Perhaps you forgot to include a struct signature?`
      ]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "UnknownTypeError"
    });
  }
}
class Lw extends Oe {
  constructor({ type: t }) {
    super("Unknown type.", {
      metaMessages: [`Type "${t}" is not a valid ABI type.`]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "UnknownSolidityTypeError"
    });
  }
}
class Cw extends Oe {
  constructor({ param: t }) {
    super("Invalid ABI parameter.", {
      details: t
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidParameterError"
    });
  }
}
class zw extends Oe {
  constructor({ param: t, name: n }) {
    super("Invalid ABI parameter.", {
      details: t,
      metaMessages: [
        `"${n}" is a protected Solidity keyword. More info: https://docs.soliditylang.org/en/latest/cheatsheet.html`
      ]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "SolidityProtectedKeywordError"
    });
  }
}
class Uw extends Oe {
  constructor({ param: t, type: n, modifier: r }) {
    super("Invalid ABI parameter.", {
      details: t,
      metaMessages: [
        `Modifier "${r}" not allowed${n ? ` in "${n}" type` : ""}.`
      ]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidModifierError"
    });
  }
}
class Mw extends Oe {
  constructor({ param: t, type: n, modifier: r }) {
    super("Invalid ABI parameter.", {
      details: t,
      metaMessages: [
        `Modifier "${r}" not allowed${n ? ` in "${n}" type` : ""}.`,
        `Data location can only be specified for array, struct, or mapping types, but "${r}" was given.`
      ]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidFunctionModifierError"
    });
  }
}
class Hw extends Oe {
  constructor({ abiParameter: t }) {
    super("Invalid ABI parameter.", {
      details: JSON.stringify(t, null, 2),
      metaMessages: ["ABI parameter type is invalid."]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidAbiTypeParameterError"
    });
  }
}
class xn extends Oe {
  constructor({ signature: t, type: n }) {
    super(`Invalid ${n} signature.`, {
      details: t
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidSignatureError"
    });
  }
}
class Nw extends Oe {
  constructor({ signature: t }) {
    super("Unknown signature.", {
      details: t
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "UnknownSignatureError"
    });
  }
}
class Fw extends Oe {
  constructor({ signature: t }) {
    super("Invalid struct signature.", {
      details: t,
      metaMessages: ["No properties exist."]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidStructSignatureError"
    });
  }
}
class Kw extends Oe {
  constructor({ type: t }) {
    super("Circular reference detected.", {
      metaMessages: [`Struct "${t}" is a circular reference.`]
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "CircularReferenceError"
    });
  }
}
class Dw extends Oe {
  constructor({ current: t, depth: n }) {
    super("Unbalanced parentheses.", {
      metaMessages: [
        `"${t.trim()}" has too many ${n > 0 ? "opening" : "closing"} parentheses.`
      ],
      details: `Depth "${n}"`
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "InvalidParenthesisError"
    });
  }
}
function jw(e, t, n) {
  let r = "";
  if (n)
    for (const i of Object.entries(n)) {
      if (!i)
        continue;
      let o = "";
      for (const s of i[1])
        o += `[${s.type}${s.name ? `:${s.name}` : ""}]`;
      r += `(${i[0]}{${o}})`;
    }
  return t ? `${t}:${e}${r}` : `${e}${r}`;
}
const Mi = /* @__PURE__ */ new Map([
  // Unnamed
  ["address", { type: "address" }],
  ["bool", { type: "bool" }],
  ["bytes", { type: "bytes" }],
  ["bytes32", { type: "bytes32" }],
  ["int", { type: "int256" }],
  ["int256", { type: "int256" }],
  ["string", { type: "string" }],
  ["uint", { type: "uint256" }],
  ["uint8", { type: "uint8" }],
  ["uint16", { type: "uint16" }],
  ["uint24", { type: "uint24" }],
  ["uint32", { type: "uint32" }],
  ["uint64", { type: "uint64" }],
  ["uint96", { type: "uint96" }],
  ["uint112", { type: "uint112" }],
  ["uint160", { type: "uint160" }],
  ["uint192", { type: "uint192" }],
  ["uint256", { type: "uint256" }],
  // Named
  ["address owner", { type: "address", name: "owner" }],
  ["address to", { type: "address", name: "to" }],
  ["bool approved", { type: "bool", name: "approved" }],
  ["bytes _data", { type: "bytes", name: "_data" }],
  ["bytes data", { type: "bytes", name: "data" }],
  ["bytes signature", { type: "bytes", name: "signature" }],
  ["bytes32 hash", { type: "bytes32", name: "hash" }],
  ["bytes32 r", { type: "bytes32", name: "r" }],
  ["bytes32 root", { type: "bytes32", name: "root" }],
  ["bytes32 s", { type: "bytes32", name: "s" }],
  ["string name", { type: "string", name: "name" }],
  ["string symbol", { type: "string", name: "symbol" }],
  ["string tokenURI", { type: "string", name: "tokenURI" }],
  ["uint tokenId", { type: "uint256", name: "tokenId" }],
  ["uint8 v", { type: "uint8", name: "v" }],
  ["uint256 balance", { type: "uint256", name: "balance" }],
  ["uint256 tokenId", { type: "uint256", name: "tokenId" }],
  ["uint256 value", { type: "uint256", name: "value" }],
  // Indexed
  [
    "event:address indexed from",
    { type: "address", name: "from", indexed: !0 }
  ],
  ["event:address indexed to", { type: "address", name: "to", indexed: !0 }],
  [
    "event:uint indexed tokenId",
    { type: "uint256", name: "tokenId", indexed: !0 }
  ],
  [
    "event:uint256 indexed tokenId",
    { type: "uint256", name: "tokenId", indexed: !0 }
  ]
]);
function Vw(e, t = {}) {
  if (kw(e))
    return qw(e, t);
  if (xw(e))
    return Gw(e, t);
  if (mw(e))
    return Ww(e, t);
  if (_w(e))
    return Zw(e, t);
  if (Pw(e))
    return Xw(e);
  if (Tw(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new Nw({ signature: e });
}
function qw(e, t = {}) {
  const n = Sw(e);
  if (!n)
    throw new xn({ signature: e, type: "function" });
  const r = Ue(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(Gt(r[a], {
      modifiers: lo,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = Ue(n.returns), c = a.length;
    for (let u = 0; u < c; u++)
      s.push(Gt(a[u], {
        modifiers: lo,
        structs: t,
        type: "function"
      }));
  }
  return {
    name: n.name,
    type: "function",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i,
    outputs: s
  };
}
function Gw(e, t = {}) {
  const n = Ew(e);
  if (!n)
    throw new xn({ signature: e, type: "event" });
  const r = Ue(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Gt(r[s], {
      modifiers: Ow,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function Ww(e, t = {}) {
  const n = vw(e);
  if (!n)
    throw new xn({ signature: e, type: "error" });
  const r = Ue(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Gt(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function Zw(e, t = {}) {
  const n = Iw(e);
  if (!n)
    throw new xn({ signature: e, type: "constructor" });
  const r = Ue(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Gt(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function Xw(e) {
  const t = Bw(e);
  if (!t)
    throw new xn({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const Yw = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Jw = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Qw = /^u?int$/;
function Gt(e, t) {
  const n = jw(e, t?.type, t?.structs);
  if (Mi.has(n))
    return Mi.get(n);
  const r = cl.test(e), i = wt(r ? Jw : Yw, e);
  if (!i)
    throw new Cw({ param: e });
  if (i.name && tb(i.name))
    throw new zw({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, u = {};
  if (r) {
    c = "tuple";
    const d = Ue(i.type), h = [], f = d.length;
    for (let b = 0; b < f; b++)
      h.push(Gt(d[b], { structs: a }));
    u = { components: h };
  } else if (i.type in a)
    c = "tuple", u = { components: a[i.type] };
  else if (Qw.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !gl(c))
    throw new Lw({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new Uw({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (lo.has(i.modifier) && !nb(c, !!i.array))
      throw new Mw({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
  }
  const l = {
    type: `${c}${i.array ?? ""}`,
    ...o,
    ...s,
    ...u
  };
  return Mi.set(n, l), l;
}
function Ue(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? Ue(a, [...t, n.trim()]) : Ue(a, t, `${n}${s}`, r);
      case "(":
        return Ue(a, t, `${n}${s}`, r + 1);
      case ")":
        return Ue(a, t, `${n}${s}`, r - 1);
      default:
        return Ue(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new Dw({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function gl(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || sl.test(e) || al.test(e);
}
const eb = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function tb(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || sl.test(e) || al.test(e) || eb.test(e);
}
function nb(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function rb(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!pl(a))
      continue;
    const c = Aw(a);
    if (!c)
      throw new xn({ signature: a, type: "struct" });
    const u = c.properties.split(";"), l = [], d = u.length;
    for (let h = 0; h < d; h++) {
      const b = u[h].trim();
      if (!b)
        continue;
      const y = Gt(b, {
        type: "struct"
      });
      l.push(y);
    }
    if (!l.length)
      throw new Fw({ signature: a });
    t[c.name] = l;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = wl(c, t);
  }
  return r;
}
const ib = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function wl(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (cl.test(s.type))
      r.push(s);
    else {
      const c = wt(ib, s.type);
      if (!c?.type)
        throw new Hw({ abiParameter: s });
      const { array: u, type: l } = c;
      if (l in t) {
        if (n.has(l))
          throw new Kw({ type: l });
        r.push({
          ...s,
          type: `tuple${u ?? ""}`,
          components: wl(t[l], t, /* @__PURE__ */ new Set([...n, l]))
        });
      } else if (gl(l))
        r.push(s);
      else
        throw new Rw({ type: l });
    }
  }
  return r;
}
function ob(e) {
  const t = rb(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    pl(o) || n.push(Vw(o, t));
  }
  return n;
}
function bl(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => sb(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function sb(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${bl(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function ar(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function le(e) {
  return ar(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const ml = "2.54.6";
let Hi = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${ml}`
};
class D extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof D ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof D && n.cause.docsPath || n.docsPath, o = Hi.getDocsUrl?.({ ...n, docsPath: i }), s = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...o ? [`Docs: ${o}`] : [],
      ...r ? [`Details: ${r}`] : [],
      ...Hi.version ? [`Version: ${Hi.version}`] : []
    ].join(`
`);
    super(s, n.cause ? { cause: n.cause } : void 0), Object.defineProperty(this, "details", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "docsPath", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "metaMessages", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "shortMessage", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "version", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "name", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: "BaseError"
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = ml;
  }
  walk(t) {
    return vl(this, t);
  }
}
function vl(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? vl(e.cause, t) : t ? null : e;
}
class ab extends D {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${bl(n, { includeName: !0 })})`,
        `Data:   ${t} (${r} bytes)`
      ],
      name: "AbiDecodingDataSizeTooSmallError"
    }), Object.defineProperty(this, "data", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "params", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Object.defineProperty(this, "size", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.data = t, this.params = n, this.size = r;
  }
}
class cb extends D {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class ub extends D {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class lb extends D {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${le(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class db extends D {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class fb extends D {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class pb extends D {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class hb extends D {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class yb extends D {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class xl extends D {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class El extends D {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function En(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? Ot(e, { dir: t, size: n }) : gb(e, { dir: t, size: n });
}
function Ot(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new El({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function gb(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new El({
      size: e.length,
      targetSize: n,
      type: "bytes"
    });
  const r = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = t === "right";
    r[o ? i : n - i - 1] = e[o ? i : e.length - i - 1];
  }
  return r;
}
class ws extends D {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class wb extends D {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class bb extends D {
  constructor({ givenSize: t, maxSize: n }) {
    super(`Size cannot exceed ${n} bytes. Given size: ${t} bytes.`, { name: "SizeOverflowError" });
  }
}
function Jn(e, { dir: t = "left" } = {}) {
  let n = typeof e == "string" ? e.replace("0x", "") : e, r = 0;
  for (let i = 0; i < n.length - 1 && n[t === "left" ? i : n.length - i - 1].toString() === "0"; i++)
    r++;
  return n = t === "left" ? n.slice(r) : n.slice(0, n.length - r), typeof e == "string" ? (n.length === 1 && t === "right" && (n = `${n}0`), `0x${n.length % 2 === 1 ? `0${n}` : n}`) : n;
}
function ot(e, { size: t }) {
  if (le(e) > t)
    throw new bb({
      givenSize: le(e),
      maxSize: t
    });
}
function kl(e, t = {}) {
  const { signed: n } = t;
  t.size && ot(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function bs(e, t = {}) {
  const n = kl(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new ws({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const mb = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Qn(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? K(e, t) : typeof e == "string" ? Al(e, t) : typeof e == "boolean" ? Sl(e, t) : Se(e, t);
}
function Sl(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (ot(n, { size: t.size }), En(n, { size: t.size })) : n;
}
function Se(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += mb[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (ot(r, { size: t.size }), En(r, { dir: "right", size: t.size })) : r;
}
function K(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new ws({
      max: o ? `${o}${c}` : void 0,
      min: `${s}${c}`,
      signed: n,
      size: r,
      value: `${e}${c}`
    });
  }
  const a = `0x${(n && i < 0 ? (1n << BigInt(r * 8)) + BigInt(i) : i).toString(16)}`;
  return r ? En(a, { size: r }) : a;
}
const vb = /* @__PURE__ */ new TextEncoder();
function Al(e, t = {}) {
  const n = vb.encode(e);
  return Se(n, t);
}
const xb = /* @__PURE__ */ new TextEncoder();
function ms(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? kb(e, t) : typeof e == "boolean" ? Eb(e, t) : ar(e) ? Lt(e, t) : _l(e, t);
}
function Eb(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (ot(n, { size: t.size }), En(n, { size: t.size })) : n;
}
const lt = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function Ca(e) {
  if (e >= lt.zero && e <= lt.nine)
    return e - lt.zero;
  if (e >= lt.A && e <= lt.F)
    return e - (lt.A - 10);
  if (e >= lt.a && e <= lt.f)
    return e - (lt.a - 10);
}
function Lt(e, t = {}) {
  let n = e;
  t.size && (ot(n, { size: t.size }), n = En(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = Ca(r.charCodeAt(a++)), u = Ca(r.charCodeAt(a++));
    if (c === void 0 || u === void 0)
      throw new D(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + u;
  }
  return o;
}
function kb(e, t) {
  const n = K(e, t);
  return Lt(n);
}
function _l(e, t = {}) {
  const n = xb.encode(e);
  return typeof t.size == "number" ? (ot(n, { size: t.size }), En(n, { dir: "right", size: t.size })) : n;
}
const kr = /* @__PURE__ */ BigInt(2 ** 32 - 1), za = /* @__PURE__ */ BigInt(32);
function Sb(e, t = !1) {
  return t ? { h: Number(e & kr), l: Number(e >> za & kr) } : { h: Number(e >> za & kr) | 0, l: Number(e & kr) | 0 };
}
function Ab(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Sb(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const _b = (e, t, n) => e << n | t >>> 32 - n, Ib = (e, t, n) => t << n | e >>> 32 - n, Pb = (e, t, n) => t << n - 32 | e >>> 64 - n, Bb = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function $b(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Ua(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function er(e, ...t) {
  if (!$b(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function ci(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Il(e, t) {
  er(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function Tb(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function tr(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Ni(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function We(e, t) {
  return e << 32 - t | e >>> t;
}
const Ob = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Rb(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Lb(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Rb(e[t]);
  return e;
}
const Ma = Ob ? (e) => e : Lb;
function Cb(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function vs(e) {
  return typeof e == "string" && (e = Cb(e)), er(e), e;
}
class Pl {
}
function Bl(e) {
  const t = (r) => e().update(vs(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const zb = BigInt(0), $n = BigInt(1), Ub = BigInt(2), Mb = BigInt(7), Hb = BigInt(256), Nb = BigInt(113), $l = [], Tl = [], Ol = [];
for (let e = 0, t = $n, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], $l.push(2 * (5 * r + n)), Tl.push((e + 1) * (e + 2) / 2 % 64);
  let i = zb;
  for (let o = 0; o < 7; o++)
    t = (t << $n ^ (t >> Mb) * Nb) % Hb, t & Ub && (i ^= $n << ($n << /* @__PURE__ */ BigInt(o)) - $n);
  Ol.push(i);
}
const Rl = Ab(Ol, !0), Fb = Rl[0], Kb = Rl[1], Ha = (e, t, n) => n > 32 ? Pb(e, t, n) : _b(e, t, n), Na = (e, t, n) => n > 32 ? Bb(e, t, n) : Ib(e, t, n);
function Db(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = Ha(u, l, 1) ^ n[a], h = Na(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Tl[s], c = Ha(i, o, a), u = Na(i, o, a), l = $l[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= Fb[r], e[1] ^= Kb[r];
  }
  tr(n);
}
class xs extends Pl {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, Ua(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Tb(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Ma(this.state32), Db(this.state32, this.rounds), Ma(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    ci(this), t = vs(t), er(t);
    const { blockLen: n, state: r } = this, i = t.length;
    for (let o = 0; o < i; ) {
      const s = Math.min(n - this.pos, i - o);
      for (let a = 0; a < s; a++)
        r[this.pos++] ^= t[o++];
      this.pos === n && this.keccak();
    }
    return this;
  }
  finish() {
    if (this.finished)
      return;
    this.finished = !0;
    const { state: t, suffix: n, pos: r, blockLen: i } = this;
    t[r] ^= n, (n & 128) !== 0 && r === i - 1 && this.keccak(), t[i - 1] ^= 128, this.keccak();
  }
  writeInto(t) {
    ci(this, !1), er(t), this.finish();
    const n = this.state, { blockLen: r } = this;
    for (let i = 0, o = t.length; i < o; ) {
      this.posOut >= r && this.keccak();
      const s = Math.min(r - this.posOut, o - i);
      t.set(n.subarray(this.posOut, this.posOut + s), i), this.posOut += s, i += s;
    }
    return t;
  }
  xofInto(t) {
    if (!this.enableXOF)
      throw new Error("XOF is not possible for this instance");
    return this.writeInto(t);
  }
  xof(t) {
    return Ua(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Il(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, tr(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new xs(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const jb = (e, t, n) => Bl(() => new xs(t, e, n)), Vb = jb(1, 136, 256 / 8);
function Qe(e, t) {
  const n = t || "hex", r = Vb(ar(e, { strict: !1 }) ? ms(e) : e);
  return n === "bytes" ? r : Qn(r);
}
const qb = (e) => Qe(ms(e));
function Gb(e) {
  return qb(e);
}
function Wb(e) {
  let t = !0, n = "", r = 0, i = "", o = !1;
  for (let s = 0; s < e.length; s++) {
    const a = e[s];
    if (["(", ")", ","].includes(a) && (t = !0), a === "(" && r++, a === ")" && r--, !!t) {
      if (r === 0) {
        if (a === " " && ["event", "function", ""].includes(i))
          i = "";
        else if (i += a, a === ")") {
          o = !0;
          break;
        }
        continue;
      }
      if (a === " ") {
        e[s - 1] !== "," && n !== "," && n !== ",(" && (n = "", t = !1);
        continue;
      }
      i += a, n += a;
    }
  }
  if (!o)
    throw new D("Unable to normalize signature.");
  return i;
}
const Zb = (e) => {
  const t = typeof e == "string" ? e : bw(e);
  return Wb(t);
};
function Xb(e) {
  return Gb(Zb(e));
}
class Zt extends D {
  constructor({ address: t }) {
    super(`Address "${t}" is invalid.`, {
      metaMessages: [
        "- Address must be a hex value of 20 bytes (40 hex characters).",
        "- Address must match its checksum counterpart."
      ],
      name: "InvalidAddressError"
    });
  }
}
class Ll extends Map {
  constructor(t) {
    super(), Object.defineProperty(this, "maxSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.maxSize = t;
  }
  get(t) {
    const n = super.get(t);
    return super.has(t) && (super.delete(t), super.set(t, n)), n;
  }
  set(t, n) {
    if (super.has(t) && super.delete(t), super.set(t, n), this.maxSize && this.size > this.maxSize) {
      const r = super.keys().next().value;
      r !== void 0 && super.delete(r);
    }
    return this;
  }
}
const Fi = /* @__PURE__ */ new Ll(8192);
function Cl(e, t) {
  if (Fi.has(`${e}.${t}`))
    return Fi.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = Qe(_l(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return Fi.set(`${e}.${t}`, o), o;
}
const Yb = /^0x[a-fA-F0-9]{40}$/, Ki = /* @__PURE__ */ new Ll(8192);
function Xt(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if (Ki.has(r))
    return Ki.get(r);
  const i = Yb.test(e) ? e.toLowerCase() === e ? !0 : n ? Cl(e) === e : !0 : !1;
  return Ki.set(r, i), i;
}
function Jb(e) {
  return typeof e[0] == "string" ? Ke(e) : Qb(e);
}
function Qb(e) {
  let t = 0;
  for (const i of e)
    t += i.length;
  const n = new Uint8Array(t);
  let r = 0;
  for (const i of e)
    n.set(i, r), r += i.length;
  return n;
}
function Ke(e) {
  return `0x${e.reduce((t, n) => t + n.replace("0x", ""), "")}`;
}
function Es(e, t, n, { strict: r } = {}) {
  return ar(e, { strict: !1 }) ? Hl(e, t, n, {
    strict: r
  }) : Ml(e, t, n, {
    strict: r
  });
}
function zl(e, t) {
  if (typeof t == "number" && t > 0 && t > le(e) - 1)
    throw new xl({
      offset: t,
      position: "start",
      size: le(e)
    });
}
function Ul(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && le(e) !== n - t)
    throw new xl({
      offset: n,
      position: "end",
      size: le(e)
    });
}
function Ml(e, t, n, { strict: r } = {}) {
  zl(e, t);
  const i = e.slice(t, n);
  return r && Ul(i, t, n), i;
}
function Hl(e, t, n, { strict: r } = {}) {
  zl(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && Ul(i, t, n), i;
}
const em = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Nl = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function ks(e, t) {
  if (e.length !== t.length)
    throw new db({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = tm({
    params: e,
    values: t
  });
  return As(n);
}
function tm({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(Ss({ param: e[r], value: t[r] }));
  return n;
}
function Ss({ param: e, value: t }) {
  const n = vi(e.type);
  if (n) {
    const [r, i] = n;
    return rm(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return cm(t, {
      param: e
    });
  if (e.type === "address")
    return nm(t);
  if (e.type === "bool")
    return om(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = Nl.exec(e.type) ?? [];
    return sm(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return im(t, { param: e });
  if (e.type === "string")
    return am(t);
  throw new pb(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function As(e) {
  let t = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? t += 32 : t += le(a);
  }
  const n = [], r = [];
  let i = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? (n.push(K(t + i, { size: 32 })), r.push(a), i += le(a)) : n.push(a);
  }
  return Ke([...n, ...r]);
}
function nm(e) {
  if (!Xt(e))
    throw new Zt({ address: e });
  return { dynamic: !1, encoded: Ot(e.toLowerCase()) };
}
function rm(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new yb(e);
  if (!r && e.length !== t)
    throw new ub({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && fo(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = Ss({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = As(o);
    if (r) {
      const a = K(o.length, { size: 32 });
      return {
        dynamic: !0,
        encoded: Ke([a, s])
      };
    }
    if (i)
      return { dynamic: !0, encoded: s };
  }
  return {
    dynamic: !1,
    encoded: Ke(o.map(({ encoded: s }) => s))
  };
}
function im(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = le(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = Ot(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: Ke([
        Ot(K(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new lb({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: Ot(e, { dir: "right" }) };
}
function om(e) {
  if (typeof e != "boolean")
    throw new D(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: Ot(Sl(e)) };
}
function sm(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new ws({
        max: r.toString(),
        min: i.toString(),
        signed: t,
        size: n / 8,
        value: e.toString()
      });
  }
  return {
    dynamic: !1,
    encoded: K(e, {
      size: 32,
      signed: t
    })
  };
}
function am(e) {
  const t = Al(e), n = Math.ceil(le(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(Ot(Es(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: Ke([
      Ot(K(le(t), { size: 32 })),
      ...r
    ])
  };
}
function cm(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = Ss({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? As(r) : Ke(r.map(({ encoded: i }) => i))
  };
}
function vi(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function fo(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(fo);
  const n = vi(t);
  return n ? fo({ ...e, type: n[1] }) : !1;
}
const um = (e) => Es(Xb(e), 0, 4);
class Fa extends D {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class lm extends D {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class dm extends D {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const fm = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new dm({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new lm({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new Fa({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new Fa({ offset: e });
    const t = this.position + e;
    this.assertPosition(t), this.position = t;
  },
  inspectByte(e) {
    const t = e ?? this.position;
    return this.assertPosition(t), this.bytes[t];
  },
  inspectBytes(e, t) {
    const n = t ?? this.position;
    return this.assertPosition(n + e - 1), this.bytes.subarray(n, n + e);
  },
  inspectUint8(e) {
    const t = e ?? this.position;
    return this.assertPosition(t), this.bytes[t];
  },
  inspectUint16(e) {
    const t = e ?? this.position;
    return this.assertPosition(t + 1), this.dataView.getUint16(t);
  },
  inspectUint24(e) {
    const t = e ?? this.position;
    return this.assertPosition(t + 2), (this.dataView.getUint16(t) << 8) + this.dataView.getUint8(t + 2);
  },
  inspectUint32(e) {
    const t = e ?? this.position;
    return this.assertPosition(t + 3), this.dataView.getUint32(t);
  },
  pushByte(e) {
    this.assertPosition(this.position), this.bytes[this.position] = e, this.position++;
  },
  pushBytes(e) {
    this.assertPosition(this.position + e.length - 1), this.bytes.set(e, this.position), this.position += e.length;
  },
  pushUint8(e) {
    this.assertPosition(this.position), this.bytes[this.position] = e, this.position++;
  },
  pushUint16(e) {
    this.assertPosition(this.position + 1), this.dataView.setUint16(this.position, e), this.position += 2;
  },
  pushUint24(e) {
    this.assertPosition(this.position + 2), this.dataView.setUint16(this.position, e >> 8), this.dataView.setUint8(this.position + 2, e & 255), this.position += 3;
  },
  pushUint32(e) {
    this.assertPosition(this.position + 3), this.dataView.setUint32(this.position, e), this.position += 4;
  },
  readByte() {
    this.assertReadLimit(), this._touch();
    const e = this.inspectByte();
    return this.position++, e;
  },
  readBytes(e, t) {
    this.assertReadLimit(), this._touch();
    const n = this.inspectBytes(e);
    return this.position += t ?? e, n;
  },
  readUint8() {
    this.assertReadLimit(), this._touch();
    const e = this.inspectUint8();
    return this.position += 1, e;
  },
  readUint16() {
    this.assertReadLimit(), this._touch();
    const e = this.inspectUint16();
    return this.position += 2, e;
  },
  readUint24() {
    this.assertReadLimit(), this._touch();
    const e = this.inspectUint24();
    return this.position += 3, e;
  },
  readUint32() {
    this.assertReadLimit(), this._touch();
    const e = this.inspectUint32();
    return this.position += 4, e;
  },
  get remaining() {
    return this.bytes.length - this.position;
  },
  setPosition(e) {
    const t = this.position;
    return this.assertPosition(e), this.position = e, () => this.position = t;
  },
  _touch() {
    if (this.recursiveReadLimit === Number.POSITIVE_INFINITY)
      return;
    const e = this.getReadCount();
    this.positionReadCount.set(this.position, e + 1), e > 0 && this.recursiveReadCount++;
  }
};
function _s(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(fm);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function pm(e, t = {}) {
  typeof t.size < "u" && ot(e, { size: t.size });
  const n = Se(e, t);
  return kl(n, t);
}
function hm(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (ot(n, { size: t.size }), n = Jn(n)), n.length > 1 || n[0] > 1)
    throw new wb(n);
  return !!n[0];
}
function pt(e, t = {}) {
  typeof t.size < "u" && ot(e, { size: t.size });
  const n = Se(e, t);
  return bs(n, t);
}
function ym(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (ot(n, { size: t.size }), n = Jn(n, { dir: "right" })), new TextDecoder().decode(n);
}
function gm(e, t) {
  const n = typeof t == "string" ? Lt(t) : t, r = _s(n);
  if (le(n) === 0 && e.length > 0)
    throw new cb();
  if (le(t) && le(t) < 32)
    throw new ab({
      data: typeof t == "string" ? t : Se(t),
      params: e,
      size: le(t)
    });
  let i = 0;
  const o = [];
  for (let s = 0; s < e.length; ++s) {
    const a = e[s];
    i < n.length && r.setPosition(i);
    const [c, u] = un(r, a, {
      staticPosition: 0
    });
    i += u, o.push(c);
  }
  return o;
}
function un(e, t, { staticPosition: n }) {
  const r = vi(t.type);
  if (r) {
    const [i, o] = r;
    return bm(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return Em(e, t, { staticPosition: n });
  if (t.type === "address")
    return wm(e);
  if (t.type === "bool")
    return mm(e);
  if (t.type.startsWith("bytes"))
    return vm(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return xm(e, t);
  if (t.type === "string")
    return km(e, { staticPosition: n });
  throw new hb(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const Ka = 32, po = 32;
function wm(e) {
  const t = e.readBytes(32);
  return [Cl(Se(Ml(t, -20))), 32];
}
function bm(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = pt(e.readBytes(po)), a = r + s, c = a + Ka;
    e.setPosition(a);
    const u = pt(e.readBytes(Ka)), l = nr(t);
    let d = 0;
    const h = [];
    for (let f = 0; f < u; ++f) {
      e.setPosition(c + (l ? f * 32 : d));
      const [b, y] = un(e, t, {
        staticPosition: c
      });
      d += y, h.push(b), y === 0 && (e.assertReadLimit(), e._touch());
    }
    return e.setPosition(r + 32), [h, 32];
  }
  if (nr(t)) {
    const s = pt(e.readBytes(po)), a = r + s, c = [];
    for (let u = 0; u < n; ++u) {
      e.setPosition(a + u * 32);
      const [l] = un(e, t, {
        staticPosition: a
      });
      c.push(l);
    }
    return e.setPosition(r + 32), [c, 32];
  }
  let i = 0;
  const o = [];
  for (let s = 0; s < n; ++s) {
    const [a, c] = un(e, t, {
      staticPosition: r + i
    });
    i += c, o.push(a), c === 0 && (e.assertReadLimit(), e._touch());
  }
  return [o, i];
}
function mm(e) {
  return [hm(e.readBytes(32), { size: 32 }), 32];
}
function vm(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = pt(e.readBytes(32));
    e.setPosition(n + s);
    const a = pt(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [Se(c), 32];
  }
  return [Se(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function xm(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? pm(i, { signed: n }) : pt(i, { signed: n }),
    32
  ];
}
function Em(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (nr(t)) {
    const s = pt(e.readBytes(po)), a = n + s;
    for (let c = 0; c < t.components.length; ++c) {
      const u = t.components[c];
      e.setPosition(a + o);
      const [l, d] = un(e, u, {
        staticPosition: a
      });
      o += d, i[r ? c : u?.name] = l;
    }
    return e.setPosition(n + 32), [i, 32];
  }
  for (let s = 0; s < t.components.length; ++s) {
    const a = t.components[s], [c, u] = un(e, a, {
      staticPosition: n
    });
    i[r ? s : a?.name] = c, o += u;
  }
  return [i, o];
}
function km(e, { staticPosition: t }) {
  const n = pt(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = pt(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = ym(Jn(o));
  return e.setPosition(t + 32), [s, 32];
}
function nr(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components?.some(nr);
  const n = vi(e.type);
  return !!(n && nr({ ...e, type: n[1] }));
}
const Sm = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), Am = {
  ether: -9,
  wei: 9
};
function _m(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function ho(e, t = "wei") {
  return _m(e, Am[t]);
}
function Im(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class Pm extends D {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        Im(t),
        "}",
        "",
        "To infer the type, either provide:",
        "- a `type` to the Transaction, or",
        "- an EIP-1559 Transaction with `maxFeePerGas`, or",
        "- an EIP-2930 Transaction with `gasPrice` & `accessList`, or",
        "- an EIP-4844 Transaction with `blobs`, `blobVersionedHashes`, `sidecars`, or",
        "- an EIP-7702 Transaction with `authorizationList`, or",
        "- a Legacy Transaction with `gasPrice`"
      ],
      name: "InvalidSerializableTransactionError"
    });
  }
}
class Bm extends D {
  constructor({ serializedType: t }) {
    super(`Serialized transaction type "${t}" is invalid.`, {
      name: "InvalidSerializedTransactionType"
    }), Object.defineProperty(this, "serializedType", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.serializedType = t;
  }
}
class $m extends D {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function bn(e, t = "hex") {
  const n = Fl(e), r = _s(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? Se(r.bytes) : r.bytes;
}
function Fl(e) {
  return Array.isArray(e) ? Tm(e.map((t) => Fl(t))) : Om(e);
}
function Tm(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = Kl(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function Om(e) {
  const t = typeof e == "string" ? Lt(e) : e, n = Kl(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function Kl(e) {
  if (e < 2 ** 8)
    return 1;
  if (e < 2 ** 16)
    return 2;
  if (e < 2 ** 24)
    return 3;
  if (e < 2 ** 32)
    return 4;
  throw new D("Length is too large.");
}
class xi extends D {
  constructor({ cause: t, maxFeePerGas: n } = {}) {
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${ho(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
      cause: t,
      name: "FeeCapTooHighError"
    });
  }
}
Object.defineProperty(xi, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
class Dl extends D {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${ho(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${ho(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(Dl, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const Is = 2n ** 256n - 1n;
function jl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => Lt(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => Se(o));
}
function Vl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => Lt(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => Lt(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => Se(s));
}
function Rm(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, u = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + u, a, r);
}
function Lm(e, t, n) {
  return e & t ^ ~e & n;
}
function Cm(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class zm extends Pl {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Ni(this.buffer);
  }
  update(t) {
    ci(this), t = vs(t), er(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = Ni(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    ci(this), Il(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, tr(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    Rm(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = Ni(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const u = c / 4, l = this.get();
    if (u > l.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < u; d++)
      a.setUint32(4 * d, l[d], o);
  }
  digest() {
    const { buffer: t, outputLen: n } = this;
    this.digestInto(t);
    const r = t.slice(0, n);
    return this.destroy(), r;
  }
  _cloneInto(t) {
    t || (t = new this.constructor()), t.set(...this.get());
    const { blockLen: n, buffer: r, length: i, finished: o, destroyed: s, pos: a } = this;
    return t.destroyed = s, t.finished = o, t.length = i, t.pos = a, i % n && t.buffer.set(r), t;
  }
  clone() {
    return this._cloneInto();
  }
}
const _t = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Um = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]), It = /* @__PURE__ */ new Uint32Array(64);
class Mm extends zm {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = _t[0] | 0, this.B = _t[1] | 0, this.C = _t[2] | 0, this.D = _t[3] | 0, this.E = _t[4] | 0, this.F = _t[5] | 0, this.G = _t[6] | 0, this.H = _t[7] | 0;
  }
  get() {
    const { A: t, B: n, C: r, D: i, E: o, F: s, G: a, H: c } = this;
    return [t, n, r, i, o, s, a, c];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c) {
    this.A = t | 0, this.B = n | 0, this.C = r | 0, this.D = i | 0, this.E = o | 0, this.F = s | 0, this.G = a | 0, this.H = c | 0;
  }
  process(t, n) {
    for (let d = 0; d < 16; d++, n += 4)
      It[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = It[d - 15], f = It[d - 2], b = We(h, 7) ^ We(h, 18) ^ h >>> 3, y = We(f, 17) ^ We(f, 19) ^ f >>> 10;
      It[d] = y + It[d - 7] + b + It[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = We(a, 6) ^ We(a, 11) ^ We(a, 25), f = l + h + Lm(a, c, u) + Um[d] + It[d] | 0, y = (We(r, 2) ^ We(r, 13) ^ We(r, 22)) + Cm(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + y | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    tr(It);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), tr(this.buffer);
  }
}
const Hm = /* @__PURE__ */ Bl(() => new Mm()), Nm = Hm;
function Fm(e, t) {
  return Nm(ar(e, { strict: !1 }) ? ms(e) : e);
}
function Km(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = Fm(t);
  return i.set([n], 0), r === "bytes" ? i : Se(i);
}
function Dm(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(Km({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const Da = 6, ql = 32, Ps = 4096, Gl = ql * Ps, ja = Gl * Da - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * Ps * Da, Wl = 1;
class jm extends D {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class Zl extends D {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class Vm extends D {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class qm extends D {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${Wl}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function Gm(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? Lt(e.data) : e.data, r = le(n);
  if (!r)
    throw new Zl();
  if (r > ja)
    throw new jm({
      maxSize: ja,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = _s(new Uint8Array(Gl));
    let c = 0;
    for (; c < Ps; ) {
      const u = n.slice(s, s + (ql - 1));
      if (a.pushByte(0), a.pushBytes(u), u.length < 31) {
        a.pushByte(128), o = !1;
        break;
      }
      c++, s += 31;
    }
    i.push(a);
  }
  return t === "bytes" ? i.map((a) => a.bytes) : i.map((a) => Se(a.bytes));
}
function Wm(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? Gm({ data: t, to: r }), o = e.commitments ?? jl({ blobs: i, kzg: n, to: r }), s = e.proofs ?? Vl({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function Zm(e) {
  if (e.type)
    return e.type;
  if (typeof e.authorizationList < "u")
    return "eip7702";
  if (typeof e.blobs < "u" || typeof e.blobVersionedHashes < "u" || typeof e.maxFeePerBlobGas < "u" || typeof e.sidecars < "u")
    return "eip4844";
  if (typeof e.maxFeePerGas < "u" || typeof e.maxPriorityFeePerGas < "u")
    return "eip1559";
  if (typeof e.gasPrice < "u")
    return typeof e.accessList < "u" ? "eip2930" : "legacy";
  throw new Pm({ transaction: e });
}
class Ei extends D {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function Xm(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!Xt(i))
        throw new Zt({ address: i });
      if (r < 0)
        throw new Ei({ chainId: r });
    }
  Bs(e);
}
function Ym(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new Zl();
    for (const n of t) {
      const r = le(n), i = bs(Es(n, 0, 1));
      if (r !== 32)
        throw new Vm({ hash: n, size: r });
      if (i !== Wl)
        throw new qm({
          hash: n,
          version: i
        });
    }
  }
  Bs(e);
}
function Bs(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new Ei({ chainId: t });
  if (i && !Xt(i))
    throw new Zt({ address: i });
  if (r && r > Is)
    throw new xi({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new Dl({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function Jm(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new Ei({ chainId: t });
  if (o && !Xt(o))
    throw new Zt({ address: o });
  if (n || i)
    throw new D("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > Is)
    throw new xi({ maxFeePerGas: r });
}
function Qm(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !Xt(o))
    throw new Zt({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new Ei({ chainId: t });
  if (n || i)
    throw new D("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > Is)
    throw new xi({ maxFeePerGas: r });
}
function ki(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const { address: r, storageKeys: i } = e[n];
    for (let o = 0; o < i.length; o++)
      if (i[o].length - 2 !== 64)
        throw new $m({ storageKey: i[o] });
    if (!Xt(r, { strict: !1 }))
      throw new Zt({ address: r });
    t.push([r, i]);
  }
  return t;
}
function e0(e, t) {
  const n = Zm(e);
  return n === "eip1559" ? r0(e, t) : n === "eip2930" ? i0(e, t) : n === "eip4844" ? n0(e, t) : n === "eip7702" ? t0(e, t) : o0(e);
}
function t0(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  Xm(e);
  const h = ki(l), f = s0(n);
  return Ke([
    "0x04",
    bn([
      K(r),
      o ? K(o) : "0x",
      u ? K(u) : "0x",
      c ? K(c) : "0x",
      i ? K(i) : "0x",
      s ?? "0x",
      a ? K(a) : "0x",
      d ?? "0x",
      h,
      f,
      ...cr(e, t)
    ])
  ]);
}
function n0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  Ym(e);
  let h = e.blobVersionedHashes, f = e.sidecars;
  if (e.blobs && (typeof h > "u" || typeof f > "u")) {
    const A = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((O) => Se(O)), I = e.kzg, _ = jl({
      blobs: A,
      kzg: I
    });
    if (typeof h > "u" && (h = Dm({
      commitments: _
    })), typeof f > "u") {
      const O = Vl({ blobs: A, commitments: _, kzg: I });
      f = Wm({ blobs: A, commitments: _, proofs: O });
    }
  }
  const b = ki(l), y = [
    K(n),
    i ? K(i) : "0x",
    u ? K(u) : "0x",
    c ? K(c) : "0x",
    r ? K(r) : "0x",
    o ?? "0x",
    s ? K(s) : "0x",
    d ?? "0x",
    b,
    a ? K(a) : "0x",
    h ?? [],
    ...cr(e, t)
  ], p = [], g = [], v = [];
  if (f)
    for (let A = 0; A < f.length; A++) {
      const { blob: I, commitment: _, proof: O } = f[A];
      p.push(I), g.push(_), v.push(O);
    }
  return Ke([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    bn(f ? [y, p, g, v] : y)
  ]);
}
function r0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: u, data: l } = e;
  Bs(e);
  const d = ki(u), h = [
    K(n),
    i ? K(i) : "0x",
    c ? K(c) : "0x",
    a ? K(a) : "0x",
    r ? K(r) : "0x",
    o ?? "0x",
    s ? K(s) : "0x",
    l ?? "0x",
    d,
    ...cr(e, t)
  ];
  return Ke([
    "0x02",
    bn(h)
  ]);
}
function i0(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: u } = e;
  Jm(e);
  const l = ki(c), d = [
    K(n),
    o ? K(o) : "0x",
    u ? K(u) : "0x",
    r ? K(r) : "0x",
    s ?? "0x",
    a ? K(a) : "0x",
    i ?? "0x",
    l,
    ...cr(e, t)
  ];
  return Ke([
    "0x01",
    bn(d)
  ]);
}
function o0(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  Qm(e);
  let u = [
    o ? K(o) : "0x",
    c ? K(c) : "0x",
    r ? K(r) : "0x",
    s ?? "0x",
    a ? K(a) : "0x",
    i ?? "0x"
  ];
  return n > 0 && (u = [
    ...u,
    K(n),
    "0x",
    "0x"
  ]), bn(u);
}
function cr(e, t) {
  const n = t ?? e, { v: r, yParity: i } = n;
  if (typeof n.r > "u")
    return [];
  if (typeof n.s > "u")
    return [];
  if (typeof r > "u" && typeof i > "u")
    return [];
  const o = Jn(n.r), s = Jn(n.s);
  return [typeof i == "number" ? i ? K(1) : "0x" : r === 0n ? "0x" : r === 1n ? K(1) : r === 27n ? "0x" : K(1), o === "0x00" ? "0x" : o, s === "0x00" ? "0x" : s];
}
function s0(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Qn(r) : "0x",
      s,
      i ? Qn(i) : "0x",
      ...cr({}, o)
    ]);
  }
  return t;
}
class a0 extends D {
  constructor({ domain: t }) {
    super(`Invalid domain "${Sm(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class c0 extends D {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class u0 extends D {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function l0(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: u, type: l } = c, d = a[u], h = l.match(Nl);
      if (h && (typeof d == "number" || typeof d == "bigint")) {
        const [y, p, g] = h;
        K(d, {
          signed: p === "int",
          size: Number.parseInt(g, 10) / 8
        });
      }
      if (l === "address" && typeof d == "string" && !Xt(d))
        throw new Zt({ address: d });
      const f = l.match(em);
      if (f) {
        const [y, p] = f;
        if (p && le(d) !== Number.parseInt(p, 10))
          throw new fb({
            expectedSize: Number.parseInt(p, 10),
            givenSize: le(d)
          });
      }
      const b = i[l];
      b && (f0(l), o(b, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new a0({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new c0({ primaryType: r, types: i });
}
function d0({ domain: e }) {
  return [
    typeof e?.name == "string" && { name: "name", type: "string" },
    e?.version && { name: "version", type: "string" },
    (typeof e?.chainId == "number" || typeof e?.chainId == "bigint") && {
      name: "chainId",
      type: "uint256"
    },
    e?.verifyingContract && {
      name: "verifyingContract",
      type: "address"
    },
    e?.salt && { name: "salt", type: "bytes32" }
  ].filter(Boolean);
}
function f0(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new u0({ type: e });
}
function p0(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: d0({ domain: t }),
    ...e.types
  };
  l0({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(h0({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(Xl({
    data: n,
    primaryType: r,
    types: i
  })), Qe(Jb(o));
}
function h0({ domain: e, types: t }) {
  return Xl({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function Xl({ data: e, primaryType: t, types: n }) {
  const r = Yl({
    data: e,
    primaryType: t,
    types: n
  });
  return Qe(r);
}
function Yl({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [y0({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = Ql({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return ks(r, i);
}
function y0({ primaryType: e, types: t }) {
  const n = Qn(g0({ primaryType: e, types: t }));
  return Qe(n);
}
function g0({ primaryType: e, types: t }) {
  let n = "";
  const r = Jl({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function Jl({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    Jl({ primaryType: o.type, types: t }, n);
  return n;
}
function Ql({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      Qe(Yl({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, Qe(r)];
  if (n === "string")
    return [{ type: "bytes32" }, Qe(Qn(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => Ql({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      Qe(ks(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
function w0(e) {
  const t = Hl(e, 0, 1);
  if (t === "0x04")
    return "eip7702";
  if (t === "0x03")
    return "eip4844";
  if (t === "0x02")
    return "eip1559";
  if (t === "0x01")
    return "eip2930";
  if (t !== "0x" && bs(t) >= 192)
    return "legacy";
  throw new Bm({ serializedType: t });
}
const Va = "bitcoin-taproot-keypath-v1", qa = "bip341-sighash-default-keypath", b0 = ["bitcoin", "testnet", "signet", "regtest"], yo = 21000000n * 100000000n, ed = 137, td = /^[0-9a-f]+$/, m0 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", v0 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", x0 = 734539939, E0 = 1;
function V(e) {
  throw new m("invalid_payload", e);
}
function Ga(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && V(`${t} must be an object`), e;
}
function Wa(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && V(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && V(`${n} is missing required fields: ${i.join(", ")}`);
}
function Cr(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !td.test(e)) && V(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function k0(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && V(`${t} must be an integer in ${n}..${r}`), e;
}
function Me(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function nn(e, t, n, r) {
  return t + n > e.length && V(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function Sr(e, t, n) {
  t >= e.length && V(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && V(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function Di(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function S0(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function Tn(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function Za(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function nd(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  V("transaction output uses an unsupported script template");
}
function A0(e) {
  (e.length === 0 || e.length % 2 || e.length > ed * 2 || !td.test(e)) && V("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (C) => Number.parseInt(C, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && V("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = Sr(t, n, "input count");
  n = i, r !== 1 && V("transaction must contain exactly one input");
  const [o, s] = nn(t, n, 32, "outpoint hash");
  n = s, o.every((C) => C === 0) && V("outpoint hash must not be null");
  const [a, c] = nn(t, n, 4, "outpoint index");
  n = c;
  const u = Di(a), [l, d] = Sr(t, n, "scriptSig length");
  n = d, l !== 0 && V("scriptSig must be empty");
  const [h, f] = nn(t, n, 4, "sequence");
  n = f;
  const b = Di(h);
  b !== 4294967293 && b !== 4294967294 && b !== 4294967295 && V("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [y, p] = Sr(t, n, "output count");
  n = p, y !== 1 && y !== 2 && V("transaction must contain one or two outputs");
  const g = [], v = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let C = 0; C < y; C += 1) {
    const [R, B] = nn(t, n, 8, `output ${C} amount`);
    n = B;
    const U = S0(R);
    (U < 1n || U > yo) && V(`output ${C} amount is outside the Bitcoin money range`);
    const [M, w] = Sr(t, n, `output ${C} script length`);
    n = w;
    const [E, k] = nn(t, n, M, `output ${C} script`);
    n = k;
    const x = nd(E);
    M !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[x] && V(`output ${C} script length is not canonical for ${x}`), U < v[x] && V(`output ${C} is below the V1 ${x} dust floor`), g.push({ amountSats: U, scriptPubKey: E, kind: x });
  }
  const [A, I] = nn(t, n, 4, "locktime");
  n = I;
  const _ = Di(A);
  _ !== 0 && V("locktime must be exactly zero"), n !== t.length && V("transaction has trailing bytes");
  const O = g.reduce((C, R) => C + R.amountSats, 0n);
  return (O < 1n || O > yo) && V("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: u, sequence: b, outputs: g, locktime: _ };
}
function _0(e, t) {
  const n = ue(new TextEncoder().encode(e));
  return ue(Me(n, n, t));
}
function I0(e, t, n) {
  const r = Me(e.prevoutHashLe, Tn(e.prevoutIndex)), i = Me(new Uint8Array([n.length]), n), o = e.outputs.map((a) => Me(Za(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = Me(
    new Uint8Array([0, 0]),
    Tn(2),
    Tn(e.locktime),
    ue(r),
    ue(Za(t)),
    ue(i),
    ue(Tn(e.sequence)),
    ue(Me(...o)),
    new Uint8Array([0]),
    Tn(0)
  );
  return _0("TapSighash", s);
}
function P0(e) {
  return BigInt(`0x${X(e)}`);
}
function Xa(e) {
  return lu(ue(e));
}
function Ya(e, t) {
  const n = Me(new Uint8Array([e]), t), r = ue(ue(n)).slice(0, 4), i = Me(n, r);
  let o = P0(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = m0[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function B0(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function $0(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1) i >>> o & 1 && (n ^= t[o]);
  }
  return n >>> 0;
}
function ji(e, t, n) {
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...B0(n, 8, 5)], o = [...r].map((u) => u.charCodeAt(0) >> 5).concat([0], [...r].map((u) => u.charCodeAt(0) & 31)), s = t === 0 ? E0 : x0, a = $0(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (u, l) => a >>> 5 * (5 - l) & 31);
  return `${r}1${i.concat(c).map((u) => v0[u]).join("")}`;
}
function T0(e, t) {
  const n = nd(t), r = e === "bitcoin";
  return n === "p2pkh" ? Ya(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? Ya(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? ji(e, 0, t.slice(2)) : ji(e, 1, t.slice(2));
}
function O0(e) {
  const t = Xa(e), n = Me(new Uint8Array([0, 20]), t);
  return [
    Me(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    Me(new Uint8Array([169, 20]), Xa(n), new Uint8Array([135]))
  ];
}
function Vi(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function Ar(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function R0(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function L0(e) {
  return X(ue(ue(e.raw)).slice().reverse());
}
function C0(e, t) {
  const n = t.transaction, r = F("bitcoin.network", { network: e.network }), i = [
    F("bitcoin.title"),
    ...t.highFeeWarning ? [F("bitcoin.highFeeWarning"), ""] : [],
    r,
    F("bitcoin.networkWarning"),
    F("bitcoin.input", { txid: X(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    F("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: Ar(BigInt(e.prevout.amountSats)) }),
    F("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(F("bitcoin.output", {
      index: s + 1,
      address: T0(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: Ar(o.amountSats),
      role: F(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    F("bitcoin.fee", { sats: t.feeSats.toString(), btc: Ar(t.feeSats), rate: R0(t.feeSats, t.signedVsize) }),
    F("bitcoin.vsize", { vsize: t.signedVsize }),
    F(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    F("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: Ar(t.netLeavingSats) }),
    F("bitcoin.unsignedTxid", { txid: L0(n) }),
    F("bitcoin.outputKey", { key: X(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function z0(e, t) {
  const n = Ga(e, "signingContext");
  Wa(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== Va && V("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !b0.includes(n.network)) && V("bitcoin signing_context network is invalid");
  const r = Cr(n.unsignedTransaction, "unsignedTransaction");
  r.length > ed * 2 && V("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = Ga(n.prevout, "signingContext.prevout");
  Wa(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = k0(i.amountSats, "prevout.amountSats", 1, Number(yo)), s = Cr(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || V("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== qa && V("unsupported Bitcoin digest algorithm");
  const a = Cr(n.digest, "signingContext.digest", 64);
  return a !== t && V("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: Va,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: qa,
    digest: a
  };
}
function rd(e, t, n) {
  const r = z0(e, t), i = A0(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (y) => Number.parseInt(y, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const y = Cr(n, "signing public key", 66);
    a = Uint8Array.from(y.match(/../g), (g) => Number.parseInt(g, 16)), a[0] !== 2 && a[0] !== 3 && V("signing public key must be compressed secp256k1");
    const p = eg(y);
    Vi(s, p) || V("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const y of i.outputs)
      O0(a).some((p) => Vi(p, y.scriptPubKey)) && V("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((y, p) => Vi(y.scriptPubKey, o) ? [p] : []);
  c.length > 1 && V("transaction may contain at most one same-key P2TR return output");
  const u = i.outputs.reduce((y, p) => y + p.amountSats, 0n), l = BigInt(r.prevout.amountSats) - u;
  l <= 0n && V("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, h = Math.ceil(d / 4);
  l > 10000n * BigInt(h) && V("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const f = X(I0(i, BigInt(r.prevout.amountSats), o));
  f !== r.digest && V("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const b = c.reduce((y, p) => y + i.outputs[p].amountSats, 0n);
  return {
    digest: f,
    display: C0(r, {
      transaction: i,
      outputKeyXOnly: s,
      feeSats: l,
      signedVsize: h,
      sameKeyOutputIndexes: c,
      highFeeWarning: l > 100n * BigInt(h) || l * 100n > BigInt(r.prevout.amountSats) * 2n,
      netLeavingSats: BigInt(r.prevout.amountSats) - b
    }),
    transaction: i,
    outputKeyXOnly: s
  };
}
const Ja = `avault-agent-operation:v1
`;
function rn(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function Qa(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function qi(e, t) {
  const n = Qa(e), r = Qa(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function zr(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : ln(e);
}
function ln(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(ln).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${ln(t[n])}`).join(",")}}`;
}
const U0 = ob([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]), M0 = {
  approve: "ERC-20/ERC-721 approve",
  transfer: "ERC-20 transfer",
  transferFrom: "ERC-20/ERC-721 transferFrom",
  permit: "ERC-20 permit",
  setApprovalForAll: "ERC-721 setApprovalForAll",
  safeTransferFrom: "ERC-721 safeTransferFrom",
  safeTransferFromWithData: "ERC-721 safeTransferFrom"
}, H0 = new Map(
  U0.map((e) => {
    const t = e.name === "safeTransferFrom" && e.inputs.length === 4 ? "safeTransferFromWithData" : e.name;
    return [um(e), { call: t, item: e }];
  })
);
function N0(e) {
  return `${e.name}(${e.inputs.map((t) => t.type).join(",")})`;
}
function F0(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e.toLowerCase();
}
const K0 = /* @__PURE__ */ new Set([
  "chainId",
  "type",
  "to",
  "value",
  "nonce",
  "gas",
  "gasPrice",
  "maxFeePerGas",
  "maxPriorityFeePerGas",
  "data"
]), D0 = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function Gi(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function id(e) {
  if (e.type !== void 0 && e.type !== "legacy" && e.type !== "eip1559")
    throw new Error("unsupported EVM transaction type");
  const t = e.maxFeePerGas !== void 0 || e.maxPriorityFeePerGas !== void 0;
  if (e.type === "legacy" && t)
    throw new Error("EVM legacy transaction cannot carry maxFeePerGas or maxPriorityFeePerGas");
  if (e.type === "eip1559" || t) {
    if (e.gasPrice !== void 0) throw new Error("EVM EIP-1559 transaction cannot carry gasPrice");
    return "eip1559";
  }
  return "legacy";
}
function j0(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function V0(e) {
  const t = { ...e };
  for (const n of ["chainId", "nonce", "value", "gas", "gasPrice", "maxFeePerGas", "maxPriorityFeePerGas"]) {
    const r = e[n];
    if (r === void 0) continue;
    if (!(typeof r == "number" && Number.isSafeInteger(r) && r >= 0 || typeof r == "string" && /^(?:[0-9]+|0x[0-9a-fA-F]+)$/.test(r)))
      throw new Error(`EVM transaction ${n} must be an unsigned integer or integer string`);
    const i = BigInt(r);
    if (i >= 1n << 256n) throw new Error(`EVM transaction ${n} is out of range`);
    t[n] = i;
  }
  return t;
}
function q0(e) {
  if (e.length < 10) return null;
  const t = H0.get(e.slice(0, 10));
  if (!t) return null;
  let n;
  try {
    if (n = gm(t.item.inputs, `0x${e.slice(10)}`), ks(t.item.inputs, n).toLowerCase() !== `0x${e.slice(10)}`) return null;
  } catch {
    return null;
  }
  return {
    call: t.call,
    signature: N0(t.item),
    arguments: t.item.inputs.map((r, i) => ({
      name: r.name ?? `arg${i}`,
      type: r.type,
      value: zr(n[i])
    }))
  };
}
function G0(e, t, n) {
  const r = id(e), i = F0(e.data), o = (c) => (t[c] === void 0 ? 0n : t[c]).toString(), s = e.to === void 0 || e.to === null || e.to === "" ? null : String(e.to), a = s === null ? null : q0(i);
  return {
    chainId: o("chainId"),
    type: r,
    to: s,
    value: o("value"),
    nonce: o("nonce"),
    gas: o("gas"),
    ...r === "legacy" ? { gasPrice: o("gasPrice") } : { maxFeePerGas: o("maxFeePerGas"), maxPriorityFeePerGas: o("maxPriorityFeePerGas") },
    selector: i === "0x" ? null : i.slice(0, 10),
    unsignedTransactionHex: n,
    calldata: i,
    calldataBytes: (i.length - 2) / 2,
    decoded: a,
    blindSigning: i !== "0x" && a === null
  };
}
function W0(e) {
  const t = [F("evm.title", { chainId: e.chainId })];
  if (e.blindSigning && t.push(F("sign.blindNotice")), t.push(
    F("evm.type", { type: e.type }),
    e.to === null ? F("evm.contractCreation") : F("evm.to", { to: e.to }),
    F("evm.value", { value: e.value }),
    F("evm.nonce", { value: e.nonce }),
    F("evm.gas", { value: e.gas })
  ), e.gasPrice !== void 0 && t.push(F("evm.gasPrice", { value: e.gasPrice })), e.maxFeePerGas !== void 0 && t.push(F("evm.maxFeePerGas", { value: e.maxFeePerGas })), e.maxPriorityFeePerGas !== void 0 && t.push(F("evm.maxPriorityFeePerGas", { value: e.maxPriorityFeePerGas })), e.decoded) {
    t.push(F("evm.call", { call: `${M0[e.decoded.call]} ${e.decoded.signature}` }));
    for (const n of e.decoded.arguments) t.push(`  ${n.name} (${n.type}): ${n.value}`);
  }
  return t.push(
    e.selector === null ? F("evm.selectorNone") : F("evm.selector", { selector: e.selector }),
    e.calldata === "0x" ? F("evm.calldataNone") : F("evm.calldata", { bytes: e.calldataBytes, calldata: e.calldata })
  ), t.join(`
`);
}
function Z0(e) {
  ls(e);
  const t = rn(e), n = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"]
  }, r = Object.hasOwn(n, e.kind) ? n[e.kind] : void 0;
  if (!r) throw new Error("unsupported signing context");
  if (Gi(t, new Set(r), "signing context"), typeof e.digest != "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(e.digest))
    throw new Error("signing context digest must be 32 bytes");
  switch (e.kind) {
    case "evm-transaction": {
      if (e.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm");
      const i = rn(e.unsignedTransaction);
      Gi(i, K0, "EVM transaction"), j0(e, i), id(i);
      const o = V0(i), s = e0(o), a = qi(e.digest, Qe(s)), c = G0(i, o, s);
      if (w0(s) !== c.type) throw new Error("EVM transaction type does not match its serialization");
      return {
        digest: a,
        challenge: Te(a),
        display: W0(c),
        evm: c
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = rn(e.typedData);
      Gi(i, D0, "EIP-712 typed data");
      const o = rn(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = qi(e.digest, p0(i));
      return {
        digest: s,
        challenge: Te(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${zr(o.chainId)}`,
          `domain.verifyingContract: ${zr(o.verifyingContract)}`,
          `domain: ${ln(o)}`,
          `types: ${ln(rn(i.types))}`,
          `primaryType: ${zr(i.primaryType)}`,
          `message: ${ln(rn(i.message))}`
        ].join(`
`)
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith(Ja) || e.canonicalPreimage.slice(Ja.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = qi(e.digest, uy(ue(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: Te(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = rd(e, e.digest);
      return {
        digest: i.digest,
        challenge: Te(i.digest),
        display: i.display
      };
    }
    default:
      throw new Error("unsupported signing context");
  }
}
function Ur(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return;
  const t = e.messageHex;
  if (typeof t == "string")
    try {
      mu(t);
    } catch {
      throw new m("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit");
    }
}
function Si(e) {
  if (Ur(e), ls(e), !e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", "Solana signing context must be an object");
  const t = e;
  if (t.kind !== "solana-transaction-v1" || Object.keys(t).some((n) => n !== "kind" && n !== "messageHex") || typeof t.messageHex != "string" || t.messageHex.length === 0 || t.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(t.messageHex))
    throw new m("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias");
  return { kind: "solana-transaction-v1", messageHex: t.messageHex };
}
function X0(e, t, n) {
  if (n.kind !== "keypair" || !n.publicKey) throw new Error("protected signing requires a keypair protected record");
  const r = vn(n.curve);
  if (e === qn || t.kind === "solana-transaction-v1" || r === "ed25519") {
    if (e !== qn || t.kind !== "solana-transaction-v1" || r !== "ed25519")
      throw new m("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together");
    Si(t);
  }
}
const od = "11111111111111111111111111111111", sd = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", Y0 = 2, J0 = 3, Q0 = 12;
function rr(e) {
  return { decoded: null, undecodedReason: e };
}
function ad(e, t) {
  let n = 0n;
  for (let r = 7; r >= 0; r -= 1) n = n << 8n | BigInt(e[t + r]);
  return n.toString();
}
function cd(e) {
  const t = [];
  for (const n of e) {
    if (n.source !== "static") return null;
    t.push(n.address);
  }
  return t;
}
function ev(e, t) {
  if ((t.length === 12 ? t[0] | t[1] << 8 | t[2] << 16 | t[3] << 24 : -1) !== Y0 || e.length !== 2) return rr("unsupported_instruction");
  const r = cd(e);
  if (!r) return rr("unresolved_account");
  const [i, o] = r;
  return { decoded: { kind: "system-transfer", source: i, destination: o, lamports: ad(t, 4) }, undecodedReason: null };
}
function tv(e, t) {
  const n = t.length === 9 && t[0] === J0 && e.length === 3, r = t.length === 10 && t[0] === Q0 && e.length === 4;
  if (!n && !r) return rr("unsupported_instruction");
  const i = cd(e);
  if (!i) return rr("unresolved_account");
  const o = ad(t, 1);
  if (n) {
    const [l, d, h] = i;
    return { decoded: { kind: "spl-transfer", sourceTokenAccount: l, destinationTokenAccount: d, authority: h, amount: o }, undecodedReason: null };
  }
  const [s, a, c, u] = i;
  return {
    decoded: { kind: "spl-transfer-checked", sourceTokenAccount: s, mint: a, destinationTokenAccount: c, authority: u, amount: o, decimals: t[9] },
    undecodedReason: null
  };
}
function nv(e, t, n) {
  return e === od ? ev(t, n) : e === sd ? tv(t, n) : rr("unsupported_program");
}
const rv = 6, ec = 3, iv = 3;
function ud(e) {
  return e === od ? ["review.note.systemProgram"] : e === sd ? ["review.note.tokenProgram"] : [];
}
function $s(e) {
  return e.length / 2;
}
function ld(e) {
  switch (e.kind) {
    case "system-transfer":
      return [
        { label: "review.field.from", value: e.source },
        { label: "review.field.to", value: e.destination },
        { label: "review.field.amount", value: e.lamports, native: "sol" }
      ];
    case "spl-transfer":
      return [
        { label: "review.field.fromTokenAccount", value: e.sourceTokenAccount },
        { label: "review.field.toTokenAccount", value: e.destinationTokenAccount },
        { label: "review.field.amount", value: e.amount, notes: ["review.note.baseUnits"] }
      ];
    case "spl-transfer-checked":
      return [
        { label: "review.field.fromTokenAccount", value: e.sourceTokenAccount },
        { label: "review.field.toTokenAccount", value: e.destinationTokenAccount },
        { label: "review.field.mint", value: e.mint },
        {
          label: "review.field.amount",
          value: e.amount,
          notes: ["review.note.baseUnits", { key: "review.note.decimals", count: e.decimals }]
        }
      ];
  }
}
function ov(e) {
  return e.kind === "spl-transfer-checked" ? "TransferChecked" : "Transfer";
}
function sv(e) {
  return {
    label: "review.field.programIndexed",
    index: e.index + 1,
    value: e.programId,
    notes: [{ key: "review.note.dataBytes", count: $s(e.dataHex) }, "review.note.notDecoded"]
  };
}
function av(e, t) {
  switch (e.kind) {
    case "system-transfer":
      return [
        { label: "review.field.transferTo", index: t, value: e.destination },
        { label: "review.field.transferAmount", index: t, value: e.lamports, native: "sol" }
      ];
    case "spl-transfer":
      return [
        { label: "review.field.transferToTokenAccount", index: t, value: e.destinationTokenAccount },
        { label: "review.field.transferAmount", index: t, value: e.amount, notes: ["review.note.baseUnits"] }
      ];
    case "spl-transfer-checked":
      return [
        { label: "review.field.transferToTokenAccount", index: t, value: e.destinationTokenAccount },
        {
          label: "review.field.transferAmount",
          index: t,
          value: e.amount,
          notes: ["review.note.baseUnits", { key: "review.note.decimals", count: e.decimals }]
        },
        { label: "review.field.transferMint", index: t, value: e.mint }
      ];
  }
}
function cv(e) {
  const t = e.instructions.flatMap((o) => o.decoded ? [o.decoded] : []), n = e.instructions.length - t.length, r = {
    label: "review.field.instructions",
    value: String(e.instructions.length),
    notes: [
      ...t.length > 0 ? [{ key: "review.note.transfersDecoded", count: t.length }] : [],
      ...n > 0 ? [{ key: "review.note.instructionsNotDecoded", count: n }] : []
    ]
  };
  if (t.length <= 1) {
    const o = e.instructions.flatMap((s) => s.decoded ? ld(s.decoded) : [sv(s)]);
    return e.instructions.length > 0 && o.length <= rv ? o : [r];
  }
  const i = t.length - ec;
  return [
    r,
    ...t.slice(0, ec).flatMap((o, s) => av(o, s + 1)),
    ...i > 0 ? [{ label: "review.field.moreTransfers", value: "", notes: [{ key: "review.note.moreInDetails", count: i }] }] : []
  ];
}
function uv(e) {
  return e.map((t) => t.index).join(", ");
}
function lv(e) {
  const t = e.decoded, n = {
    label: "review.field.data",
    value: e.dataHex,
    notes: [{ key: "review.note.bytes", count: $s(e.dataHex) }, ...t ? [] : ["review.note.notDecoded"]]
  };
  return {
    title: "review.group.instruction",
    index: e.index + 1,
    fields: [
      { label: "review.field.program", value: e.programId, notes: ud(e.programId) },
      ...t ? [
        { label: "review.field.instruction", value: ov(t) },
        ...ld(t),
        ...t.kind === "system-transfer" ? [] : [{ label: "review.field.authority", value: t.authority }]
      ] : [],
      { label: "review.field.accountIndexes", value: uv(e.accounts) },
      n
    ]
  };
}
function dv(e) {
  const t = e.instructions.length === 1 ? e.instructions[0].decoded : null;
  return {
    kind: t ? t.kind === "system-transfer" ? "review.kind.solanaSystemTransfer" : "review.kind.solanaTokenTransfer" : "review.kind.solanaTransaction",
    signer: { label: "review.field.signingKey", value: e.expectedSigner.address },
    summary: cv(e),
    // Any undecoded instruction, and any account loaded through an address table.
    undecoded: e.hasUndecodedContent,
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.messageFormat", value: e.version },
          { label: "review.field.scheme", value: "ed25519" },
          { label: "review.field.feePayer", value: e.feePayer },
          { label: "review.field.blockhashOrNonce", value: e.recentBlockhash }
        ]
      },
      {
        title: "review.group.accounts",
        fields: e.staticAccountKeys.map((n) => ({
          label: "review.field.account",
          index: n.index,
          value: n.address,
          notes: [
            ...n.signer ? ["review.note.signer"] : [],
            n.writable ? "review.note.writable" : "review.note.readOnly",
            ...ud(n.address)
          ]
        }))
      },
      ...e.instructions.map(lv),
      {
        title: "review.group.exact",
        fields: [{
          label: "review.field.message",
          value: e.messageHex,
          notes: [{ key: "review.note.bytes", count: e.messageLength }],
          raw: !0
        }]
      }
    ]
  };
}
function tc(e) {
  return e.chainId === "1" ? { label: "review.field.value", value: e.value, native: "eth" } : { label: "review.field.value", value: e.value, notes: ["review.note.wei"] };
}
function nc(e) {
  return e.to === null ? { label: "review.field.contract", value: "", notes: ["review.note.contractCreation"] } : { label: "review.field.contract", value: e.to };
}
function dd(e) {
  return (e.decoded?.arguments ?? []).map((t, n) => ({
    label: "review.field.argument",
    index: n + 1,
    name: `${t.name} (${t.type})`,
    value: t.value
  }));
}
function fv(e) {
  if (e.decoded) {
    const n = { label: "review.field.call", value: e.decoded.signature }, r = dd(e);
    return r.length <= iv ? [n, ...r] : [{ ...n, notes: [{ key: "review.note.argumentsInDetails", count: r.length }] }];
  }
  if (e.calldata === "0x") return [];
  const t = [{ key: "review.note.dataBytes", count: e.calldataBytes }, "review.note.notDecoded"];
  return e.to === null || e.selector === null ? [{ label: "review.field.initCode", value: "", notes: t }] : [{ label: "review.field.selector", value: e.selector, notes: t }];
}
function pv(e, t) {
  const n = Ou(t.publicKey).eth;
  if (!n) throw new Error("EVM review requires a secp256k1 signing key");
  const r = (i, o) => o === void 0 ? [] : [{ label: i, value: o, notes: ["review.note.wei"] }];
  return {
    kind: "review.kind.evmTransaction",
    signer: { label: "review.field.signingAddress", value: n },
    summary: [
      { label: "review.field.chainId", value: e.chainId },
      nc(e),
      tc(e),
      ...fv(e)
    ],
    undecoded: e.blindSigning,
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.publicKey", value: t.publicKey.toLowerCase() },
          { label: "review.field.scheme", value: t.scheme },
          { label: "review.field.type", value: e.type },
          { label: "review.field.chainId", value: e.chainId },
          nc(e),
          tc(e),
          { label: "review.field.nonce", value: e.nonce },
          { label: "review.field.gas", value: e.gas },
          ...r("review.field.gasPrice", e.gasPrice),
          ...r("review.field.maxFeePerGas", e.maxFeePerGas),
          ...r("review.field.maxPriorityFeePerGas", e.maxPriorityFeePerGas)
        ]
      },
      ...e.decoded ? [{
        title: "review.group.call",
        fields: [
          { label: "review.field.call", value: e.decoded.signature },
          ...e.selector === null ? [] : [{ label: "review.field.selector", value: e.selector }],
          ...dd(e)
        ]
      }] : [],
      {
        title: "review.group.exact",
        fields: [
          {
            label: "review.field.calldata",
            value: e.calldata,
            notes: [{ key: "review.note.bytes", count: e.calldataBytes }, ...e.blindSigning ? ["review.note.notDecoded"] : []],
            raw: e.calldata !== "0x"
          },
          {
            label: "review.field.unsignedTransaction",
            value: e.unsignedTransactionHex,
            notes: [{ key: "review.note.bytes", count: $s(e.unsignedTransactionHex) - 1 }],
            raw: !0
          },
          { label: "review.field.digest", value: `0x${t.digest}` }
        ]
      }
    ]
  };
}
const hv = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function _r(e) {
  let t = 0;
  for (; t < e.length && e[t] === 0; ) t += 1;
  let n = 0n;
  for (const i of e) n = n << 8n | BigInt(i);
  let r = "";
  for (; n > 0n; )
    r = hv[Number(n % 58n)] + r, n /= 58n;
  return "1".repeat(t) + r;
}
class fd extends Error {
  code;
  constructor(t, n) {
    super(n), this.name = "SolanaMessageError", this.code = t;
  }
}
const Ir = 1232, rc = 64, On = 32, yv = 32, ic = 128, oc = 256;
function de(e, t) {
  throw new fd(e, t);
}
function sc(e) {
  let t = "";
  for (const n of e) t += n.toString(16).padStart(2, "0");
  return t;
}
function gv(e) {
  return e < 128 ? 1 : e < 16384 ? 2 : 3;
}
function wv(e, t, n = "compact-u16") {
  let r = 0;
  for (let i = 0; ; i += 1) {
    t + i >= e.length && de("truncated", `message ends inside ${n}`);
    const o = e[t + i];
    o === 0 && i !== 0 && de("invalid_compact_u16", `${n} is not minimally encoded`);
    const s = (o & 128) === 0;
    if (i === 2 && !s && de("invalid_compact_u16", `${n} is longer than three bytes`), r |= (o & 127) << 7 * i, r > 65535 && de("invalid_compact_u16", `${n} exceeds 65535`), s) return { value: r, length: i + 1 };
  }
}
class bv {
  bytes;
  offset = 0;
  constructor(t) {
    this.bytes = t;
  }
  get remaining() {
    return this.bytes.length - this.offset;
  }
  u8(t) {
    return this.remaining < 1 && de("truncated", `message ends before ${t}`), this.bytes[this.offset++];
  }
  take(t, n) {
    this.remaining < t && de("truncated", `message ends inside ${n}`);
    const r = this.bytes.subarray(this.offset, this.offset + t);
    return this.offset += t, r;
  }
  compactU16(t) {
    const { value: n, length: r } = wv(this.bytes, this.offset, t);
    return this.offset += r, n;
  }
}
function pd(e) {
  if (typeof e == "object" && e !== null) {
    for (const t of Object.values(e)) pd(t);
    Object.freeze(e);
  }
  return e;
}
function mv(e, t) {
  e instanceof Uint8Array || de("invalid_input", "message must be a byte array"), (!(t instanceof Uint8Array) || t.length !== On) && de("invalid_input", "expected public key must be 32 bytes"), e.length > Ir - 1 - rc && de("packet_too_large", `message of ${e.length} bytes cannot fit a ${Ir}-byte transaction`);
  const n = new Uint8Array(e), r = _r(new Uint8Array(t)), i = new bv(n), o = i.u8("message prefix");
  let s = "legacy", a = o;
  if ((o & ic) !== 0) {
    const B = o & ~ic;
    B !== 0 && de("unsupported_version", `Solana message version ${B} is not supported`), s = "v0", a = i.u8("required signature count");
  }
  const c = i.u8("read-only signed account count"), u = i.u8("read-only unsigned account count"), l = i.compactU16("account key count"), d = i.take(l * On, "account keys"), h = Array.from({ length: l }, (B, U) => _r(d.subarray(U * On, (U + 1) * On))), f = _r(i.take(yv, "recent blockhash")), b = [];
  for (let B = i.compactU16("instruction count"); B > 0; B -= 1) {
    const U = i.u8("instruction program id index"), M = i.take(i.compactU16("instruction account count"), "instruction account indexes"), w = i.take(i.compactU16("instruction data length"), "instruction data");
    b.push({ programIdIndex: U, accountIndexes: M, data: w });
  }
  const y = [];
  if (s === "v0")
    for (let B = i.compactU16("address table lookup count"); B > 0; B -= 1) {
      const U = i.take(On, "address table key"), M = i.take(i.compactU16("writable lookup index count"), "writable lookup indexes"), w = i.take(i.compactU16("read-only lookup index count"), "read-only lookup indexes");
      y.push({ accountKey: U, writableIndexes: M, readonlyIndexes: w });
    }
  i.remaining !== 0 && de("trailing_bytes", `${i.remaining} bytes follow the message`), a + u > l && de("invalid_header", "header counts more signed and read-only unsigned accounts than the message carries"), c >= a && de("invalid_header", "header leaves no writable signer to pay the fee");
  let p = 0, g = 0;
  for (const B of y)
    B.writableIndexes.length + B.readonlyIndexes.length === 0 && de("invalid_address_table_lookup", "an address table lookup loads no account"), p += B.writableIndexes.length, g += B.readonlyIndexes.length;
  const v = l + p + g;
  v > oc && de("invalid_address_table_lookup", `message addresses ${v} accounts; the limit is ${oc}`);
  for (const B of b) {
    (B.programIdIndex === 0 || B.programIdIndex >= l) && de("invalid_program_id_index", `instruction program id index ${B.programIdIndex} is not a static non-payer key`);
    for (const U of B.accountIndexes)
      U >= v && de("invalid_account_index", `instruction account index ${U} is outside the message's ${v} accounts`);
  }
  const A = gv(a) + a * rc + n.length;
  A > Ir && de("packet_too_large", `signed transaction would be ${A} bytes; the limit is ${Ir}`);
  const I = h.indexOf(r);
  (I === -1 || I >= a) && de("signer_not_required", "the expected key is not a required signer of this message");
  const _ = h.map((B, U) => ({
    index: U,
    address: B,
    signer: U < a,
    writable: U < a ? U < a - c : U < l - u
  })), O = y.map((B) => ({
    accountKey: _r(B.accountKey),
    writableIndexes: Array.from(B.writableIndexes),
    readonlyIndexes: Array.from(B.readonlyIndexes)
  })), C = (B) => {
    if (B < l) return { source: "static", ..._[B] };
    const U = B - l < p;
    let M = B - l - (U ? 0 : p);
    for (const [w, E] of O.entries()) {
      const k = U ? E.writableIndexes : E.readonlyIndexes;
      if (M < k.length)
        return { source: "lookup", index: B, lookupIndex: w, accountKey: E.accountKey, tableIndex: k[M], writable: U };
      M -= k.length;
    }
    throw new Error("account index was validated against the lookup tables");
  }, R = b.map((B, U) => {
    const M = h[B.programIdIndex], w = Array.from(B.accountIndexes, C);
    return {
      index: U,
      programIdIndex: B.programIdIndex,
      programId: M,
      accounts: w,
      dataHex: sc(B.data),
      ...nv(M, w, B.data)
    };
  });
  return pd({
    version: s,
    messageHex: sc(n),
    messageLength: n.length,
    transactionLength: A,
    header: { numRequiredSignatures: a, numReadonlySignedAccounts: c, numReadonlyUnsignedAccounts: u },
    feePayer: h[0],
    expectedSigner: { index: I, address: r, isFeePayer: I === 0 },
    staticAccountKeys: _,
    recentBlockhash: f,
    instructions: R,
    addressTableLookups: O,
    hasUndecodedContent: O.length > 0 || R.some((B) => B.decoded === null)
  });
}
function on(e, t) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function Pr(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Un(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new m("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function Ts(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) Ts(t);
    Object.freeze(e);
  }
  return e;
}
function Os(e, t) {
  if (Ur(e), t && typeof t == "object") {
    const n = t.release;
    Ur(n), n && typeof n == "object" && Ur(n.signingContext);
  }
}
function hd(e) {
  const t = on(e, "sign request");
  Os(t.signingContext, t.context), ls(t);
  const n = on(structuredClone(t), "sign request");
  Un(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = on(n.material, "material");
  Un(r, ["name", "envelope"], "material");
  const i = on(r.envelope, "envelope");
  Un(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = fs(n.context);
  Un(on(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = Mo(n.scheme);
  } catch {
    throw new m("invalid_payload", "unsupported signing scheme");
  }
  const a = on(n.signingContext, "signingContext");
  return a.kind === "solana-transaction-v1" && Si(a), Ts({
    material: {
      name: Pr(r.name, "material.name"),
      envelope: {
        ciphertext: Pr(i.ciphertext, "envelope.ciphertext"),
        nonce: Pr(i.nonce, "envelope.nonce"),
        wrap_meta: Pr(i.wrap_meta, "envelope.wrap_meta")
      }
    },
    scheme: s,
    signingContext: a,
    context: o
  });
}
function Pt() {
  throw new m("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request");
}
function yd(e, t, n) {
  Os(e.signingContext, e.context), ao({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && Pt();
  const i = t.kind === "message";
  if (!i && (t.kind !== "digest" || !/^[0-9a-f]{64}$/.test(t.digest)) && Pt(), Un(r, ["name", "scheme", i ? "messageHex" : "digest", "publicKey", "signingContext"], "sign context.release"), i) {
    const o = Si(e.signingContext);
    (t.messageHex !== o.messageHex || r.messageHex !== t.messageHex || e.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(n) || r.publicKey !== n) && Pt();
  } else (e.scheme === "ed25519" || e.signingContext.kind === "solana-transaction-v1" || r.digest !== t.digest) && Pt();
  (r.name !== e.material.name || r.scheme !== e.scheme || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || rt(r.signingContext) !== rt(e.signingContext)) && Pt();
}
function vv(e) {
  return Os(e.signingContext, e.context), ue(new TextEncoder().encode(bi(e.context)));
}
function xv(e, t) {
  if (Mo(e), e === "ed25519") throw new Error("Ed25519 exact-message signing is reviewed structurally and has no prose description");
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === Uo ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === Gn ? F("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === yi ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function Ev(e, t) {
  const n = Si(e.signingContext);
  yd(e, { kind: "message", messageHex: n.messageHex }, t);
  let r;
  try {
    r = mv(Co(n.messageHex), Te(t));
  } catch (i) {
    throw i instanceof fd ? new m("invalid_payload", `Solana message cannot be signed (${i.code}): ${i.message}`) : i;
  }
  return r.messageHex !== n.messageHex && Pt(), { payload: { kind: "message", messageHex: r.messageHex }, review: dv(r) };
}
function kv(e, t) {
  const n = e.signingContext;
  n.kind === "solana-transaction-v1" && Pt();
  let r = Z0(n);
  if (n.kind === "bitcoin-taproot-keypath-v1") {
    if (e.scheme !== Gn)
      throw new m("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (e.scheme === Gn)
      throw new m("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (n.kind !== "avault-agent-operation" && e.scheme !== yi && e.scheme !== zo)
      throw new m("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  if (n.kind === "bitcoin-taproot-keypath-v1") {
    const i = rd(n, r.digest, t);
    r = { digest: i.digest, challenge: r.challenge, display: i.display };
  }
  return yd(e, { kind: "digest", digest: r.digest }, t), {
    payload: { kind: "digest", digest: r.digest },
    display: `${xv(e.scheme, t)}
scheme: ${e.scheme}
${r.display}`,
    ...r.evm ? { review: pv(r.evm, { publicKey: t, scheme: e.scheme, digest: r.digest }) } : {}
  };
}
function gd(e) {
  const t = yn(e.material.envelope), n = Ko(e.material.name, t.recordMetadata);
  X0(e.scheme, e.signingContext, n);
  const r = n.publicKey, i = e.signingContext.kind === "solana-transaction-v1" ? Ev(e, r) : kv(e, r);
  return { unpacked: t, recordContext: n, content: i };
}
function Sv(e) {
  const t = hd(e), { unpacked: n, recordContext: r, content: i } = gd(t), o = vv(t);
  return Ts({ request: t, verified: i, unpacked: n, recordContext: r, challenge: [...o] });
}
async function wd(e, t, n) {
  const r = hd(e.request), i = gd(r);
  (!e.verified || rt(e.verified.payload) !== rt(i.content.payload)) && Pt();
  const o = await Vo(n, t);
  return si({ context: r.context, rootMetadata: o, expectedPurpose: "sign" }), ai([r.context]), { request: r, ...i };
}
async function Av(e, t, n) {
  return (await wd(e, t, n)).content;
}
async function _v(e, t, n) {
  const { request: r, content: i, unpacked: o, recordContext: s } = await wd(e, t, n);
  return i.payload.kind === "message" ? Ny(o.sealed, t, s, i.payload.messageHex) : My(o.sealed, t, s, i.payload.digest, r.scheme);
}
function bd(e, t = e.label) {
  return {
    title: e.title,
    subtitle: e.subtitle,
    ...e.body !== void 0 ? { body: e.body } : {},
    ...e.details ? { details: e.details } : {},
    ...e.review ? { review: e.review } : {},
    ...e.reviewSession !== void 0 ? { reviewSession: e.reviewSession } : {},
    confirmLabel: t
  };
}
function Iv(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: J(t) } : {}
  };
}
function go(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function Dt(e, t) {
  if (typeof e == "string" && e.length > 0) return e;
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be a text spec`);
  const n = e;
  if (typeof n.text == "string") return ge(n.text);
  if (typeof n.key == "string") {
    const r = n.params;
    if (r !== void 0 && (typeof r != "object" || r === null || Array.isArray(r)))
      throw new m("invalid_payload", `${t}.params must be an object`);
    return {
      key: n.key,
      ...r !== void 0 ? { params: r } : {}
    };
  }
  throw new m("invalid_payload", `${t} must be a text spec`);
}
function Pv(e) {
  const t = go(e, "details");
  if (!Array.isArray(t.rows)) throw new m("invalid_payload", "details must contain rows");
  const n = [];
  for (const [r, i] of t.rows.entries()) {
    const o = go(i, `details.rows[${r}]`), s = o.variant;
    if (s !== void 0 && s !== "text" && s !== "command" && s !== "mono" && s !== "chips")
      throw new m("invalid_payload", `details.rows[${r}].variant is invalid`);
    const a = Dt(o.label, `details.rows[${r}].label`);
    if (s === "chips") {
      if (!Array.isArray(o.values)) throw new m("invalid_payload", `details.rows[${r}].values must be an array`);
      const c = o.tone;
      if (c !== void 0 && c !== "default" && c !== "warning")
        throw new m("invalid_payload", `details.rows[${r}].tone is invalid`);
      const u = c === "default" || c === "warning" ? c : void 0;
      n.push({
        label: a,
        values: o.values.map((l, d) => Dt(l, `details.rows[${r}].values[${d}]`)),
        variant: "chips",
        ...u !== void 0 ? { tone: u } : {}
      });
      continue;
    }
    n.push({
      label: a,
      value: Dt(o.value, `details.rows[${r}].value`),
      ...s !== void 0 ? { variant: s } : {}
    });
  }
  return { rows: n };
}
function Bv(e) {
  try {
    return Vg(e);
  } catch (t) {
    throw new m("invalid_payload", t instanceof Error ? t.message : "signing review is malformed");
  }
}
function $v(e) {
  const t = go(e, "authorization prompt");
  if (t.challenge !== void 0 && (typeof t.challenge != "string" || t.challenge.length === 0))
    throw new m("invalid_payload", "prompt.challenge must be a non-empty string");
  if (t.reviewSession !== void 0 && typeof t.reviewSession != "string")
    throw new m("invalid_payload", "prompt.reviewSession must be a string");
  const n = t.challenge === void 0 ? void 0 : fe(t.challenge);
  return {
    title: Dt(t.title, "prompt.title"),
    subtitle: Dt(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Dt(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: Pv(t.details) } : {},
    ...t.review !== void 0 ? { review: Bv(t.review) } : {},
    ...t.reviewSession !== void 0 ? { reviewSession: t.reviewSession } : {},
    ...n ? { challenge: n } : {},
    label: Dt(t.label, "prompt.label")
  };
}
function md(e) {
  const t = e.tier === "R2" && e.policy.strictApprovals ? "R3" : e.tier, n = e.vaultState !== "unlocked";
  return t === "R1" ? {
    tier: e.tier,
    effectiveTier: t,
    confirm: !1,
    passkey: n ? "unlock" : "none",
    renewOnSuccess: !0
  } : n ? {
    tier: e.tier,
    effectiveTier: t,
    confirm: !0,
    passkey: "unlock",
    renewOnSuccess: t !== "R3"
  } : {
    tier: e.tier,
    effectiveTier: t,
    confirm: !0,
    passkey: t === "R3" ? "uv" : "none",
    renewOnSuccess: t !== "R3"
  };
}
async function Tv(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await ku(t, e.vmk, n);
    return { envelope: Au(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function Ov(e) {
  const t = vn(e.curve), n = zy(t);
  let r = n.privateKey;
  try {
    const i = {
      name: e.name,
      kind: "keypair",
      publicKey: n.publicKey,
      ...t === "ed25519" ? { curve: t } : {}
    }, o = await ku(r, e.vmk, i);
    return {
      envelope: Au(o, e.wrapMeta, i),
      publicKey: n.publicKey,
      addresses: t === "ed25519" ? { solana: Fy(n.publicKey) } : Ou(n.publicKey)
    };
  } finally {
    r?.fill(0), r = void 0;
  }
}
function vd(e) {
  return (e?.kind ?? "static") === "static";
}
function Rv(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: fs(n.context)
  };
}
function xd(e) {
  const t = e[0]?.context.display;
  if (!t) throw new m("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = Ra(e[0].context), r = ac(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if (Ra(s.context) !== n)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (ac(s.context) !== r)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed recipient");
  }
  const i = new Set(t.secrets.map((s) => `${s.name}:${s.kind}`));
  for (const s of e) {
    const { recordMetadata: a } = yn(s.material.envelope), c = a?.kind ?? "static";
    if (!i.has(`${s.material.name}:${c}`))
      throw new m("invalid_context", "signed display block does not cover every release item");
  }
  const o = e[0].context;
  return {
    display: t,
    recipient: {
      agentFingerprint: o.agent?.fingerprint,
      grantId: o.grantId
    }
  };
}
function ac(e) {
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  return rt({ agent: e.agent, grantId: e.grantId });
}
async function Lv(e) {
  if (e.items.length === 0) throw new m("invalid_payload", "approveRelease requires at least one item");
  const t = xd(e.items), n = await Vo(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    si({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  ai(r, e.now);
  const i = await gw(r);
  await e.confirm({
    ...t,
    challenge: i
  });
  const o = e.now ?? Date.now();
  for (const a of e.items)
    si({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: o
    });
  e.onApprovalAccepted?.(o), ai(r, o);
  const s = [];
  for (const a of e.items) {
    const { sealed: c, recordMetadata: u } = yn(a.material.envelope);
    if (!vd(u)) throw new m("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await Cy(
        c,
        e.vmk,
        yw(a.context),
        Ko(a.material.name, u),
        await hw(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await mi(r, o), { blindBoxes: s };
}
const Ed = `avibe-vault-setup:v1:${ie.buildHash}:`, Cv = `avibe-vault-setup-result:${ie.buildHash}:`, zv = `avibe-vault-setup-error:${ie.buildHash}:`, Uv = 300 * 1e3, Mv = 300 * 1e3, Hv = 30 * 1e3, Nv = 8 * 1e3, Ae = new Kd();
let cc = !1;
function Fv(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function kd(e) {
  if (!Fv(e))
    throw new m("invalid_payload", "appearance must include locale and theme");
  return e;
}
function Kv(e) {
  return e == null ? null : kd(e);
}
function Ai(e) {
  const t = Rg(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && Ug();
}
function Sd() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: Lg(), theme: e };
}
function De(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function Ad(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function ke(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function _d(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function Dv(e) {
  const t = _d(e, "envelope");
  return {
    ciphertext: ke(t.ciphertext, "envelope.ciphertext"),
    nonce: ke(t.nonce, "envelope.nonce"),
    wrap_meta: ke(t.wrap_meta, "envelope.wrap_meta")
  };
}
function Id(e) {
  const t = _d(e, "material");
  return { name: ke(t.name, "material.name"), envelope: Dv(t.envelope) };
}
function jv(e) {
  const t = e == null ? {} : De(e);
  return { wrapMeta: Ad(t.wrapMeta, "wrapMeta") };
}
function Pd(e) {
  const t = De(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new m("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: ke(t.vaultUserHandle, "vaultUserHandle"),
    displayName: ke(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: Yo(t.policy) } : {}
  };
}
function Vv(e) {
  const t = De(e);
  return {
    wrapMeta: ke(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: Yo(t.policy) } : {}
  };
}
function qv(e) {
  const t = De(e);
  return { material: Id(t.material), context: fs(t.context) };
}
function Gv(e) {
  const t = De(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new m("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => Rv(n, Id)) };
}
function Wv(e) {
  const t = De(e);
  if (t.operation !== "delete_secret") throw new m("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: ke(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: ke(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function Bd() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function uc(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function Zv(e) {
  return new Promise((t, n) => {
    const r = () => {
      n(kn(e));
    };
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function Xv(e) {
  for (const t of e)
    if (t.aborted) return kn(t);
  return new Error("operation-superseded");
}
function $d(e) {
  const t = new AbortController(), n = [], r = (i) => {
    t.signal.aborted || t.abort(kn(i));
  };
  for (const i of e) {
    if (i.aborted) {
      r(i);
      continue;
    }
    const o = () => r(i);
    i.addEventListener("abort", o, { once: !0 }), n.push(() => i.removeEventListener("abort", o));
  }
  return { signal: t.signal, cleanup: () => n.forEach((i) => i()) };
}
async function Td(e) {
  const t = $d(e.abortSignals);
  try {
    await Promise.race([
      Ig(No(e.wrapMeta), gt(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? Xv(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => Zv(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function Rs(e) {
  await sr(async (t) => {
    const n = async (i) => {
      const o = $d([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await tx(
          {
            prompt: lc(e),
            wrapMeta: e.wrapMeta,
            passkey: e.passkey
          },
          o.signal,
          i
        );
        if (e.passkey === "unlock") {
          if (s.kind !== "unlock") throw new Error("authorization unlock result is missing");
          await Qu({
            wrapMeta: e.wrapMeta,
            currentRpId: gt(),
            assertion: {
              prfOutput: fe(s.prfOutput),
              prfSalt: fe(s.prfSalt)
            },
            abortSignal: o.signal,
            ...e.policy ? { policy: e.policy } : {}
          });
        } else if (s.kind !== "confirmed")
          throw new Error("authorization result is invalid");
      } finally {
        o.cleanup();
      }
    }, r = e.authorizationWindow?.();
    if (r) {
      await n(r);
      return;
    }
    await us(bd(lc(e), "common.continue"), t, void 0, n);
  });
}
function lc(e) {
  return {
    title: e.title,
    subtitle: e.subtitle,
    ...e.body ? { body: e.body } : {},
    ...e.details ? { details: e.details } : {},
    ...e.review ? { review: e.review } : {},
    ...e.reviewSession !== void 0 ? { reviewSession: e.reviewSession } : {},
    ...e.challenge ? { challenge: e.challenge } : {},
    label: e.label
  };
}
function Yv(e) {
  return {
    ...e,
    prompt: Iv(e.prompt)
  };
}
function Jv(e) {
  const t = De(e);
  if (!t) throw new m("invalid_payload", "authorization request must be an object");
  const n = t.passkey;
  if (n !== "none" && n !== "unlock" && n !== "uv")
    throw new m("invalid_payload", "authorization passkey requirement is invalid");
  return {
    prompt: $v(t.prompt),
    wrapMeta: ke(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function Qv(e) {
  return hc("authorize", e, Sd());
}
function ex(e) {
  const t = De(e);
  if (!t) throw new m("authorization_result_invalid", "authorization result is invalid");
  if (t.kind === "confirmed") return { kind: "confirmed" };
  if (t.kind === "unlock")
    return {
      kind: "unlock",
      prfOutput: ke(t.prfOutput, "result.prfOutput"),
      prfSalt: ke(t.prfSalt, "result.prfSalt")
    };
  throw new m("authorization_result_invalid", "authorization result kind is invalid");
}
function tx(e, t, n) {
  jt(t);
  const r = n ?? Bd(), i = `avibe-vault-authorization-${r}`;
  return new Promise((o, s) => {
    let a = null, c = !1, u = null, l = null, d = null, h = null;
    const f = () => v(() => s(kn(t))), b = () => v(() => s(new m("authorization_cancelled", "requesting sandbox was unloaded", !0))), y = () => new m("authorization_window_closed", "authorization window was closed", !0), p = (A) => {
      a = A, l = setInterval(() => {
        !A.closed || d || (d = setTimeout(() => v(() => s(y())), 2500));
      }, 500);
    }, g = (A) => {
      if (A.origin !== window.location.origin) return;
      const I = A.data;
      if (!(!I || I.id !== r || !sn(I.build)) && (!a && n && I.type === "authorization-ready" && A.source && (h && clearTimeout(h), h = null, p(A.source)), A.source === a))
        if (I.type === "authorization-ready")
          try {
            a?.postMessage(
              {
                type: "authorization-request",
                build: ie,
                id: r,
                request: Yv(e)
              },
              window.location.origin
            );
          } catch (_) {
            v(() => s(_));
          }
        else if (I.type === "authorization-approved")
          try {
            const _ = ex(I.result);
            v(() => o(_));
          } catch (_) {
            v(() => s(_));
          }
        else I.type === "authorization-error" && v(() => s(new m(I.code, I.message, !!I.retryable)));
    }, v = (A) => {
      if (!c) {
        c = !0, u && clearTimeout(u), l && clearInterval(l), d && clearTimeout(d), h && clearTimeout(h), window.removeEventListener("message", g), window.removeEventListener("pagehide", b), t?.removeEventListener("abort", f);
        try {
          a && !a.closed && a.close();
        } catch {
        }
        A();
      }
    };
    if (window.addEventListener("message", g), window.addEventListener("pagehide", b, { once: !0 }), n)
      h = setTimeout(() => v(() => s(y())), Hv);
    else {
      const A = window.open(Qv(r), i, "popup,width=520,height=760");
      if (!A) {
        v(() => s(new m("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      A.focus(), p(A);
    }
    if (u = setTimeout(
      () => v(() => s(new m("authorization_window_timeout", "authorization window timed out", !0))),
      Mv
    ), t) {
      if (t.aborted) {
        f();
        return;
      }
      t.addEventListener("abort", f, { once: !0 });
    }
  });
}
function nx(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? Xn("context.minutes", { count: e / 60 }) : Xn("context.seconds", { count: e });
}
function ir(e, t) {
  const n = [];
  e.sessionLabel && n.push({ label: "context.session", value: ge(e.sessionLabel) }), e.command && n.push({ label: "context.command", value: ge(e.command), variant: "command" }), e.egress && n.push({ label: "context.egress", value: ge(e.egress) });
  const r = [
    ...e.source?.env?.map((i) => ge(`${F("context.sourceEnv")}: ${i}`)) ?? [],
    ...e.source?.tags?.map((i) => ge(`${F("context.sourceTag")}: ${i}`)) ?? [],
    ...e.source?.skills?.map((i) => ge(`${F("context.sourceSkill")}: ${i}`)) ?? []
  ];
  return r.length > 0 && n.push({ label: "context.source", values: r, variant: "chips" }), t?.agentFingerprint && n.push({ label: "context.agent", value: ge(t.agentFingerprint), variant: "mono" }), t?.grantId && n.push({ label: "context.grant", value: ge(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && n.push({ label: "context.agentAccess", value: nx(e.grantTtlSeconds) }), n.push({
    label: "context.secrets",
    values: e.secrets.map(
      (i) => ge(`${i.name} · ${F(i.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: n };
}
function rx(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function ix(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function Od(e, t) {
  return rx(e) ? !0 : ix(e) && yt(t).state === "locked";
}
async function ox(e, t = xe(), n) {
  await Ju({ wrapMeta: e, currentRpId: gt(), policy: t, abortSignal: n });
}
async function sx(e, t = xe()) {
  await sr((n) => ox(e, t, n));
}
async function Rd(e) {
  try {
    await Rs({ ...e, passkey: "unlock" });
  } catch (t) {
    throw yt(e.wrapMeta).state === "unlocked" && Fe({ broadcast: !0, reason: "manual-lock" }), t;
  }
}
async function ax(e, t) {
  if (yt(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await sx(e);
  }
  return await ts(t, { renewOnSuccess: !0 });
}
async function Ld(e) {
  const t = yt(e.wrapMeta).state, n = xe(), r = md({ tier: e.tier, vaultState: t, policy: n });
  let i = !1;
  const o = async () => {
    await Rd({
      ...e.lockedPrompt,
      wrapMeta: e.wrapMeta,
      policy: n,
      parentSurface: e.parentSurface,
      authorizationWindow: e.authorizationWindow
    }), i = !0;
  }, s = async (a, c = !1) => {
    let u = !1;
    try {
      const l = await ts(
        async (d, h, f) => {
          const b = await e.buildPrompt(d, h, f);
          return r.confirm && !c && (await Rs({
            ...b,
            wrapMeta: h,
            passkey: a,
            abortSignal: f.signal,
            parentSurface: e.parentSurface,
            authorizationWindow: e.authorizationWindow
          }), f.assertCurrent()), e.operation(d, h, f);
        },
        { renewOnSuccess: r.renewOnSuccess, beforeSuccess: e.beforeSuccess }
      );
      return u = !0, l;
    } catch (l) {
      throw i && !u && yt().state === "unlocked" && Fe({ broadcast: !0, reason: "manual-lock" }), l;
    }
  };
  try {
    return r.passkey === "unlock" ? (await o(), await s("none", !0)) : await s(r.passkey === "uv" ? "uv" : "none");
  } catch (a) {
    if (r.passkey !== "unlock" && Od(a, e.wrapMeta))
      return await o(), await s("none", !0);
    throw a;
  }
}
function je(e, t) {
  if (e instanceof m) return e;
  if (Tg(e)) return new m("passkey_cancelled", "passkey-cancelled", !0);
  const n = e instanceof Error ? e.message : t;
  switch (n) {
    case "passkey-cancelled":
      return new m("passkey_cancelled", n, !0);
    case "passkey-prf-unavailable":
      return new m("passkey_prf_unavailable", n);
    case "passkey-not-configured":
      return new m("passkey_not_configured", n);
    case "passkey-multiple-not-supported":
      return new m("passkey_multiple_not_supported", n);
    case "vault-operation-aborted":
      return new m("vault_operation_aborted", n, !0);
    default:
      return new m(t, n);
  }
}
function cx(e) {
  return J(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function ux(e) {
  return Pd(JSON.parse(new TextDecoder().decode(fe(e))));
}
function lx(e, t) {
  return hc("setup", e, Sd(), { req: cx(t) });
}
function Wi(e) {
  const t = De(e);
  return {
    credentialId: ke(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function _i(e) {
  return `${Cv}${e}`;
}
function Ii(e) {
  return `${zv}${e}`;
}
function dc(e) {
  try {
    localStorage.removeItem(_i(e)), localStorage.removeItem(Ii(e));
  } catch {
  }
}
function dx(e, t) {
  try {
    localStorage.setItem(_i(e), JSON.stringify({ build: ie, result: t })), localStorage.removeItem(Ii(e));
  } catch {
  }
}
function fx(e, t) {
  try {
    localStorage.setItem(
      Ii(e),
      JSON.stringify({ build: ie, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(_i(e));
  } catch {
  }
}
function Cd(e) {
  if (window.self === window.top)
    return is({
      rpId: gt(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = Bd(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Ed}${t}`);
  let r = null;
  return dc(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, u = null;
    const l = () => d(() => o(new m("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (y) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), u && clearTimeout(u), window.removeEventListener("visibilitychange", f), window.removeEventListener("focus", f), window.removeEventListener("storage", f), window.removeEventListener("message", b), window.removeEventListener("pagehide", l), n?.close(), dc(t);
        try {
          r?.close();
        } catch {
        }
        y();
      }
    }, h = () => {
      let y = null, p = null;
      try {
        y = localStorage.getItem(_i(t)), p = localStorage.getItem(Ii(t));
      } catch {
        return !1;
      }
      if (y) {
        try {
          const g = De(JSON.parse(y));
          if (!sn(g.build)) throw new m("sandbox_build_mismatch");
          const v = Wi(g.result);
          d(() => i(v));
        } catch (g) {
          const v = g instanceof Error ? g.message : "stored setup result is invalid";
          d(() => o(new m("setup_storage_invalid", v)));
        }
        return !0;
      }
      if (p) {
        try {
          const g = De(JSON.parse(p));
          if (!sn(g.build)) throw new m("sandbox_build_mismatch");
          d(
            () => o(new m(ke(g.code, "code"), Ad(g.message, "message"), !!g.retryable))
          );
        } catch (g) {
          const v = g instanceof Error ? g.message : "stored setup error is invalid";
          d(() => o(new m("setup_storage_invalid", v)));
        }
        return !0;
      }
      return !1;
    }, f = () => {
      h();
    }, b = (y) => {
      if (y.origin !== window.location.origin || y.source !== r) return;
      const p = y.data;
      !p || p.id !== t || !sn(p.build) || (p.type === "setup-created" ? d(() => i(Wi(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      h() || d(() => o(new m("setup_window_timeout", "setup window timed out", !0)));
    }, Uv), c = setInterval(() => {
      !r?.closed || u || h() || (u = setTimeout(() => {
        h() || d(() => o(new m("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (y) => {
      const p = y.data;
      !p || p.id !== t || !sn(p.build) || (p.type === "setup-created" ? d(() => i(Wi(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", f), window.addEventListener("focus", f), window.addEventListener("storage", f), window.addEventListener("message", b), window.addEventListener("pagehide", l, { once: !0 }), r = window.open(lx(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
      d(() => o(new m("setup_popup_blocked", "setup window was blocked", !0)));
      return;
    }
    r.focus();
  });
}
function kn(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function jt(e) {
  if (e?.aborted) throw kn(e);
}
function px() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function fc(e) {
  return px() && Gu(e);
}
async function zd(e, t, n, r, i = xe()) {
  const o = fy();
  let s, a;
  try {
    jt(r), s = (await rs([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, jt(r), a = dy();
    const u = await yy(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    jt(r);
    let l = by(u, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (l = xy(l, await vy(a, e.rootMetadata, l)), jt(r));
    const d = Ku({
      vmk: a,
      wrapMeta: l,
      freshSetup: !e.existingProtectedVault,
      scopeId: ag(e.vaultUserHandle),
      policy: i
    });
    return a = void 0, {
      wrapMeta: l,
      rpId: t,
      credentialId: n.credentialId,
      state: d.state,
      expiresAt: d.expiresAt,
      ...n.authzRegistration ? { authzRegistration: n.authzRegistration } : {}
    };
  } finally {
    s?.fill(0), o.fill(0), a?.fill(0);
  }
}
function hx(e, t, n) {
  return sr((r) => {
    const i = ss(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody"
    ), o = Yn("setup.createPasskey"), s = Yu("setup.ready");
    return an(i.card, o), an(i.card, s), new Promise((a, c) => {
      let u = !1, l = "create", d = null, h = !1;
      const f = (_) => {
        u || (u = !0, r.removeEventListener("abort", p), as(), _());
      }, b = (_) => {
        f(() => c(_));
      }, y = (_) => {
        u || (l = "create", d = null, W(o, "setup.createPasskey"), o.disabled = !1, W(s, _));
      }, p = () => {
        b(kn(r));
      }, g = (_) => {
        if (_ instanceof m && _.code === "setup_popup_blocked") {
          y("setup.popupBlocked");
          return;
        }
        b(_);
      }, v = () => {
        h = !0, o.disabled = !0, W(s, "setup.popupPrompt");
        let _;
        try {
          _ = Cd(e);
        } catch (O) {
          g(O);
          return;
        }
        _.then(
          (O) => {
            u || (d = O, l = "finish", W(o, "setup.finish"), o.disabled = !1, W(s, "setup.createdFinish"));
          },
          (O) => {
            g(O);
          }
        );
      }, A = (_) => {
        o.disabled = !0, W(s, "setup.passkeyPrompt"), zd(e, t, _, r, n).then(
          (O) => f(() => a(O)),
          (O) => b(O)
        );
      }, I = () => {
        o.disabled = !0, W(s, "setup.passkeyPrompt");
        let _;
        try {
          _ = is({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (O) {
          if (fc(O)) {
            v();
            return;
          }
          b(O);
          return;
        }
        _.then(
          (O) => A(O),
          (O) => {
            if (fc(O)) {
              v();
              return;
            }
            b(O);
          }
        );
      };
      if (r.aborted) {
        p();
        return;
      }
      r.addEventListener("abort", p, { once: !0 }), o.addEventListener("click", () => {
        if (!(u || o.disabled)) {
          if (l === "finish" && d) {
            A(d);
            return;
          }
          if (h) {
            v();
            return;
          }
          I();
        }
      });
    });
  });
}
async function yx(e) {
  const t = Pd(e);
  try {
    const n = gt(), r = t.policy ?? xe(), i = window.self !== window.top ? await hx(t, n, r) : await zd(t, n, await Cd(t), void 0, r), o = t.policy ? Jo(r) : xe();
    return { ...i, policy: o };
  } catch (n) {
    throw je(n, "setup_failed");
  }
}
async function gx(e) {
  const t = Vv(e);
  try {
    const n = gt(), r = t.policy ?? xe(), i = await sr(async (s) => {
      let a;
      if (await us(
        {
          title: "unlock.sessionTitle",
          subtitle: Xn("unlock.sessionSubtitle", {
            minutes: r.windowSeconds / 60
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue"
        },
        s,
        void 0,
        async () => {
          a = await Ju({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? Jo(r) : xe();
    return { ...i, policy: o };
  } catch (n) {
    throw je(n, "unlock_failed");
  }
}
async function wx(e) {
  const t = nw(e);
  t.wrapMeta && ns(t.wrapMeta);
  try {
    if (t.kind === "static" && !xe().parentValueSealAllowed)
      throw new m("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await ax(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await Tv({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await Ov({ name: t.name, curve: t.curve, vmk: n, wrapMeta: r }), establishingVmk: hg() }));
  } catch (n) {
    throw je(n, "seal_failed");
  }
}
async function bx(e, t) {
  const n = qv(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = yn(n.material.envelope);
    if (o?.kind === "keypair") throw new Error("keypair protected records cannot be revealed as plaintext");
    return ao({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await Ld({
      tier: "R2",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: ge(n.material.name),
        body: "reveal.confirmBody",
        details: ir(n.context.display),
        label: "common.continue"
      },
      buildPrompt: async (s, a) => {
        const c = await Vo(a, s);
        return si({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), ao({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), ai([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: ge(n.material.name),
          body: "reveal.confirmBody",
          details: ir(n.context.display),
          challenge: await uc(bi(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const u = await jo(r, s, Ko(n.material.name, o));
        try {
          c.assertCurrent(), await mi([n.context]), await Jg({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: xe().strictApprovals ? async (l) => {
              await Td({
                wrapMeta: a,
                challenge: await uc(`reveal-copy:${n.context.requestId}:${n.material.name}`),
                abortSignals: [l, c.signal]
              }), jt(l), jt(c.signal);
            } : void 0
          });
        } finally {
          u.fill(0);
        }
        return { completed: !0 };
      }
    });
  } catch (r) {
    throw je(r, "reveal_failed");
  }
}
async function mx(e, t) {
  try {
    const n = Sv(e), { request: r, unpacked: { vmkWrapMeta: i } } = n, o = (s) => {
      const a = r.context.display.sessionLabel;
      if (!s.review && s.display === void 0) throw new m("invalid_payload", "signing request has no reviewable content");
      return {
        title: "sign.title",
        subtitle: ge(r.material.name),
        ...s.review ? { review: s.review, ...a ? { reviewSession: a } : {} } : { body: ge(s.display ?? "") },
        details: ir(r.context.display),
        label: "sign.confirm"
      };
    };
    return await Ld({
      tier: "R3",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: o(n.verified),
      // Shown only after the daemon signature, expiry and replay state are
      // verified with the vault key, from content re-derived at that moment.
      buildPrompt: async (s, a) => ({
        ...o(await Av(n, s, a)),
        challenge: new Uint8Array(n.challenge)
      }),
      operation: (s, a) => _v(n, s, a),
      beforeSuccess: () => mi([r.context])
    });
  } catch (n) {
    throw je(n, "sign_failed");
  }
}
async function vx(e, t) {
  const n = Gv(e);
  try {
    const i = yn(n.items[0].material.envelope).vmkWrapMeta;
    for (const h of n.items) {
      const f = yn(h.material.envelope);
      if (f.vmkWrapMeta !== i) throw new m("invalid_payload", "approveRelease items must share one VMK context");
      if (!vd(f.recordMetadata)) throw new m("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = xd(n.items), s = yt(i).state, a = xe(), c = md({ tier: "R2", vaultState: s, policy: a });
    let u = !1;
    const l = async () => {
      await Rd({
        title: "release.title",
        subtitle: Xn("release.subtitle", { count: n.items.length }),
        details: ir(o.display, o.recipient),
        label: "release.confirm",
        wrapMeta: i,
        policy: a,
        parentSurface: t.latestSurface,
        authorizationWindow: t.takeAuthorizationWindow
      }), u = !0;
    }, d = async (h, f = !1) => {
      let b = !1, y;
      try {
        const p = await ts(
          async (g, v, A) => {
            const I = await Lv({
              items: n.items,
              vmk: g,
              wrapMeta: v,
              consumeReplayIds: !1,
              onApprovalAccepted: (_) => {
                y = _;
              },
              confirm: (_) => !c.confirm || f ? Promise.resolve() : Rs({
                title: "release.title",
                subtitle: Xn("release.subtitle", { count: n.items.length }),
                details: ir(_.display, _.recipient),
                challenge: _.challenge,
                label: "release.confirm",
                wrapMeta: v,
                passkey: h,
                abortSignal: A.signal,
                parentSurface: t.latestSurface,
                authorizationWindow: t.takeAuthorizationWindow
              })
            });
            return A.assertCurrent(), I;
          },
          {
            renewOnSuccess: c.renewOnSuccess,
            beforeSuccess: () => mi(n.items.map((g) => g.context), y)
          }
        );
        return b = !0, p;
      } catch (p) {
        throw u && !b && yt().state === "unlocked" && Fe({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await l(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (h) {
      if (c.passkey !== "unlock" && Od(h, i))
        return await l(), await d("none", !0);
      throw h;
    }
  } catch (r) {
    throw je(r, "approve_release_failed");
  }
}
async function xx(e) {
  const t = Wv(e);
  try {
    const n = await Pg(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw je(n, "delete_authz_failed");
  }
}
function Ex() {
  const e = wo();
  if (e.get("mode") !== "setup") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && Ai({ locale: t, theme: n });
  const r = e.get("id"), i = document.getElementById("page"), o = i?.querySelector(".card"), s = i?.querySelector("h1"), a = i?.querySelector(".sub"), c = i?.querySelector(".body");
  if (!r || !o || !s || !a || !c) return;
  document.body.classList.add("setup-mode"), W(s, "setup.title"), W(a, "setup.subtitle"), W(c, "setup.topLevelBody");
  const u = document.createElement("button");
  u.type = "button", u.className = "action", W(u, "setup.createPasskey");
  const l = document.createElement("p");
  l.className = "setup-status", W(l, "setup.readyOnOrigin"), o.append(u, l);
  const d = new URLSearchParams(window.location.hash.slice(1)).get("req");
  if (!d) {
    u.disabled = !0, W(l, "setup.requestMissing");
    return;
  }
  let h;
  try {
    h = ux(d);
  } catch {
    u.disabled = !0, W(l, "setup.requestInvalid");
    return;
  }
  const f = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Ed}${r}`), b = (y) => {
    const p = je(y, "setup_create_failed"), g = {
      type: "setup-error",
      build: ie,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    fx(r, p), f?.postMessage(g);
    try {
      window.opener?.postMessage(g, window.location.origin);
    } catch {
    }
    u.disabled = !1, W(l, ge(p.message));
  };
  u.addEventListener("click", () => {
    u.disabled = !0, W(l, "setup.passkeyPrompt");
    let y;
    try {
      y = is({
        rpId: gt(),
        vaultUserHandle: h.vaultUserHandle,
        displayName: h.displayName,
        authzCreationOptions: h.authzCreationOptions
      });
    } catch (p) {
      b(p);
      return;
    }
    y.then((p) => {
      const g = { type: "setup-created", build: ie, id: r, result: p };
      dx(r, p), f?.postMessage(g);
      try {
        window.opener?.postMessage(g, window.location.origin);
      } catch {
      }
      W(l, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(b);
  });
}
function kx() {
  const e = wo();
  if (e.get("mode") !== "authorize") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && Ai({ locale: t, theme: n });
  const r = e.get("id"), o = document.getElementById("page")?.querySelector(".card"), s = o?.querySelector(".body");
  if (!r || !o || !s || (s.classList.add("waiting"), W(s, window.opener ? "authorize.waiting" : "authorize.waitingLong"), !window.opener)) return;
  const a = () => {
    const p = window.opener;
    if (!p) return [];
    const g = [p];
    try {
      for (let v = 0; v < p.frames.length; v += 1) g.push(p.frames[v]);
    } catch {
    }
    return g;
  };
  let c = null;
  const u = (p) => {
    try {
      c?.postMessage(p, window.location.origin);
    } catch {
    }
  };
  let l = !1, d = null;
  const h = setTimeout(() => W(s, "authorize.waitingLong"), Nv), f = () => {
    if (!l)
      for (const p of a())
        try {
          p.postMessage({ type: "authorization-ready", build: ie, id: r }, window.location.origin);
        } catch {
        }
  }, b = (p) => {
    if (l) return;
    l = !0, d && clearInterval(d), clearTimeout(h), s.classList.remove("waiting"), window.removeEventListener("message", y), document.body.classList.add("setup-mode");
    const g = new AbortController();
    let v = { kind: "confirmed" };
    const A = async () => {
      if (p.passkey === "none") return;
      if (p.passkey === "uv") {
        if (!p.prompt.challenge) throw new m("invalid_payload", "authorization challenge is missing");
        await Td({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [g.signal]
        });
        return;
      }
      const I = await rs(No(p.wrapMeta), gt(), g.signal);
      v = {
        kind: "unlock",
        prfOutput: J(I.prfOutput),
        prfSalt: J(I.prfSalt)
      }, I.prfOutput.fill(0);
    };
    us(bd(p.prompt), g.signal, void 0, A).then(
      () => {
        u({ type: "authorization-approved", build: ie, id: r, result: v }), setTimeout(() => window.close(), 250);
      },
      (I) => {
        const _ = je(I, I instanceof Error && I.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed");
        u({
          type: "authorization-error",
          build: ie,
          id: r,
          code: _.code,
          message: _.message,
          retryable: _.retryable
        }), setTimeout(() => window.close(), 250);
      }
    );
  }, y = (p) => {
    if (p.origin !== window.location.origin) return;
    const g = p.data;
    if (!g || g.type !== "authorization-request" || g.id !== r || !sn(g.build)) return;
    const v = a().find((A) => A === p.source);
    if (v) {
      c = v;
      try {
        b(Jv(g.request));
      } catch (A) {
        const I = je(A, "authorization_request_invalid");
        u({
          type: "authorization-error",
          build: ie,
          id: r,
          code: I.code,
          message: I.message,
          retryable: I.retryable
        });
      }
    }
  };
  window.addEventListener("message", y), f(), d = setInterval(f, 500);
}
function Sx() {
  if (window.self !== window.top || wo().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && W(e, "sandbox.intro");
}
Ae.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new m("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== ie.buildHash)
    throw new m("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = Kv(t.appearance);
  r && Ai(r);
  const i = cc ? xe() : Jo(t.policy === void 0 ? void 0 : Yo(t.policy));
  return cc = !0, {
    accepted: !0,
    channel: Ht,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: ie,
    policy: i
  };
});
Ae.register("set-appearance", (e) => (Ai(kd(e)), { accepted: !0 }));
Ae.register("status", (e) => {
  const t = jv(e);
  try {
    t.wrapMeta && yt(t.wrapMeta);
    const n = yt(), r = xe();
    return {
      ...n,
      policy: r,
      session: {
        ...n.expiresAt !== void 0 ? { expiresAt: n.expiresAt } : {},
        strict: r.strictApprovals
      }
    };
  } catch (n) {
    throw je(n, "invalid_wrap_meta");
  }
});
Ae.register("setup", yx);
Ae.register("unlock", gx);
Ae.register("lock", () => ({ ...Fe({ broadcast: !0, reason: "manual-lock" }), policy: xe() }));
Ae.register("seal", wx);
Ae.register("reveal", bx);
Ae.register("sign", mx);
Ae.register("approveRelease", vx);
Ae.register("deleteAuthzAssertion", xx);
og((e) => Ae.emit("vault.state", e));
qg((e) => Ae.emit(e));
await Dd();
Ae.start();
window.addEventListener("pagehide", yg);
Ex();
kx();
Sx();
window.self !== window.top && document.body.classList.add("embedded");
const Ud = globalThis.crypto, Ax = { webcrypto: Ud }, Md = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Ax,
  webcrypto: Ud
}, Symbol.toStringTag, { value: "Module" }));
