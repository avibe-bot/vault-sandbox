const Rt = "avibe.vault.crypto";
const ie = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "e0b7ab2d4ecf360989d772ea835fd3fcd3bd055c5b2ead154f8de81ebed93316"
};
class m extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function hs(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function Xl(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === Rt && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const Yl = /^[A-Za-z0-9_-]{16,128}$/;
function Ua(e) {
  return typeof e == "object" && e !== null;
}
function Jl(e) {
  return Ua(e) ? e.channel === Rt && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class Ql {
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
        channel: Rt,
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
      channel: Rt,
      version: 2,
      build: ie,
      capabilities: {
        operations: Array.from(this.handlers.keys())
      }
    });
  }
  async onMessage(t) {
    if (!hs(t.origin)) return;
    if (Jl(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!Xl(t.data)) return;
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
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !Yl.test(n.authorizationWindow))) {
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
        channel: Rt,
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
    if (t.op !== "handshake" || !Ua(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !hs(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
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
    return { channel: Rt, version: 2, id: t, ok: !1, error: { code: n, message: r, retryable: i } };
  }
  reply(t, n) {
    !t || this.pinnedParentOrigin === null || t.postMessage(n, this.pinnedParentOrigin);
  }
  postToParent(t, n) {
    t.postMessage(n, "*");
  }
}
function Ji() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function Ha(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return ie.buildHash !== "dev" && (i.pathname = `/v/${ie.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function Qt(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === ie.buildHash && t.sandboxVersion === ie.sandboxVersion;
}
async function ed() {
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
class Ke extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class Ve extends Ke {
}
class mr extends Ke {
}
class nr extends Ke {
}
class td extends Ke {
}
class nd extends Ke {
}
class rd extends Ke {
}
class id extends Ke {
}
class od extends Ke {
}
class sd extends Ke {
}
class ad extends Ke {
}
class Qi extends Ke {
}
const cd = {}, Ma = ud(globalThis, cd);
function ud(e, t) {
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
async function ld() {
  if (Ma !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Zl);
    return e.subtle;
  } catch (e) {
    throw new Qi(e);
  }
}
class eo {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await ld());
  }
}
const ht = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, ys = {
  DhkemX25519HkdfSha256: 32
}, Na = {
  HkdfSha256: 1
}, to = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, _r = 8192, dd = 268435456, gs = 32, we = /* @__PURE__ */ new Uint8Array(0), Ge = 0n, Vt = 1n, rr = 2n, fd = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), bs = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function xr(e) {
  return new Uint8Array(Z(e));
}
function Z(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class pd extends eo {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Na.HkdfSha256
    }), Object.defineProperty(this, "hashSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "_suiteId", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: we
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
    return r.set(bs, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(bs, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t);
    if (r.byteLength !== this.hashSize)
      throw new Ve("The salt length must be the same as the hashSize");
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
    let c = we;
    const u = xr(n), l = new Uint8Array(1);
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
    if (this._suiteId === we)
      throw new Error("Not initialized. Call init()");
  }
}
class Fa extends pd {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Na.HkdfSha256
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
const xn = (e) => typeof e == "object" && e !== null && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function Tn(e, t) {
  if (t <= 0)
    throw new Error("i2Osp: too small size");
  if (e >= 256 ** t)
    throw new Error("i2Osp: too large integer");
  const n = new Uint8Array(t);
  for (let r = 0; r < t && e; r++)
    n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
  return n;
}
function ir(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function ws(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function hd() {
  if (typeof Ma < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Zl);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function yd(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const gd = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), bd = /* @__PURE__ */ new Uint8Array([
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
function wd(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class md {
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
    const i = new Uint8Array(fd);
    i.set(Tn(this.id, 2), 3), this._kdf.init(i);
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
    if (n.byteLength > _r)
      throw new Ve("Too long ikm");
    return await this._prim.deriveKeyPair(n);
  }
  async encap(t) {
    let n;
    t.ekm === void 0 ? n = await this.generateKeyPair() : xn(t.ekm) ? n = t.ekm : n = await this.deriveKeyPair(t.ekm);
    const r = await this._prim.serializePublicKey(n.publicKey), i = await this._prim.serializePublicKey(t.recipientPublicKey);
    try {
      let o;
      if (t.senderKey === void 0)
        o = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey));
      else {
        const c = xn(t.senderKey) ? t.senderKey.privateKey : t.senderKey, u = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey)), l = new Uint8Array(await this._prim.dh(c, t.recipientPublicKey));
        o = ir(u, l);
      }
      let s;
      if (t.senderKey === void 0)
        s = ir(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = xn(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), u = await this._prim.serializePublicKey(c);
        s = wd(new Uint8Array(r), new Uint8Array(i), new Uint8Array(u));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new td(o);
    }
  }
  async decap(t) {
    const n = Z(t.enc), r = await this._prim.deserializePublicKey(n), i = xn(t.recipientKey) ? t.recipientKey.privateKey : t.recipientKey, o = xn(t.recipientKey) ? t.recipientKey.publicKey : await this._prim.derivePublicKey(t.recipientKey), s = await this._prim.serializePublicKey(o);
    try {
      let a;
      if (t.senderPublicKey === void 0)
        a = new Uint8Array(await this._prim.dh(i, r));
      else {
        const u = new Uint8Array(await this._prim.dh(i, r)), l = new Uint8Array(await this._prim.dh(i, t.senderPublicKey));
        a = ir(u, l);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = ir(new Uint8Array(n), new Uint8Array(s));
      else {
        const u = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + u.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(u), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new nd(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(gd, t), i = this._kdf.buildLabeledInfo(bd, n, this.secretSize);
    return await this._kdf.extractAndExpand(we, r, i, this.secretSize);
  }
}
const or = ["deriveBits"], xd = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), vd = /* @__PURE__ */ new Uint8Array([115, 107]);
class Gt {
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
class Ed {
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
      return Promise.reject(new mr(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(Z(t), !0);
    } catch (n) {
      throw new nr(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new mr(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(Z(t), !1);
    } catch (n) {
      throw new nr(n);
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
      throw new nr(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new Gt(this._algName, t, "private", or);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new Qi(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = Z(t), r = await this._hkdf.labeledExtract(we.buffer, xd, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, vd, we, this._nSk), o = new Gt(this._algName, new Uint8Array(i), "private", or);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new ad(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new Gt(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new nr(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new mr(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new Gt(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : or));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new Gt(this._algName, ws(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new Gt(this._algName, ws(t.d), "private", or)));
    });
  }
}
const Sd = ["encrypt", "decrypt"];
function kd(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Un(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function ct(e, t, n = "") {
  const r = kd(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Ir(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Ad(e, t) {
  ct(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function _d(e) {
  if (typeof e == "bigint") {
    if (!vr(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    Un(e);
  return e;
}
function Br(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const Id = /* @__PURE__ */ new Uint32Array([287454020]), Bd = /* @__PURE__ */ new Uint8Array(Id.buffer);
Bd[0];
function hi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function je(e, t) {
  return e << 32 - t | e >>> t;
}
const Ka = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", Pd = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), $d = [
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
function Od(e) {
  if (ct(e), Ka)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Pd[e[n]];
  return t;
}
const rt = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Li(e) {
  if (e >= rt._0 && e <= rt._9)
    return e - rt._0;
  if (e >= rt.A && e <= rt.F)
    return e - (rt.A - 10);
  if (e >= rt.a && e <= rt.f)
    return e - (rt.a - 10);
}
function Td(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Ka)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Li(e.charCodeAt(o)), a = Li(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Ld(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = Ge;
  for (let n = 0; n < e.length; n++) {
    const r = Li(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | $d[r];
  }
  return t;
}
function Rd(e) {
  Un(e, "numberToBigint");
  let t = e, n = Ge, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function ms(e) {
  return Ld(Od(Ri(ct(e)).reverse()));
}
function Cd(e, t) {
  Un(t), e = _d(e);
  const n = Td(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function zd(e, t) {
  return Cd(e, t).reverse();
}
function Ri(e) {
  return Uint8Array.from(e);
}
function vr(e) {
  return typeof e == "bigint" && Ge <= e;
}
function Ud(e, t, n) {
  return vr(e) && vr(t) && vr(n) && t <= e && e < n;
}
function xs(e, t, n, r) {
  if (!Ud(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Hd(e, t = {}, n = {}) {
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
async function Md(e = 32) {
  const t = await hd(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function Nd(e) {
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
function Fd(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  Un(e.outputLen), Un(e.blockLen);
}
function Kd(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let ja = class {
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
    }), Fd(t), ct(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Br(i);
  }
  update(t) {
    return Ir(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Ir(this), ct(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const Da = (e, t, n) => new ja(e, t).update(n).digest();
Da.create = (e, t) => new ja(e, t);
function jd(e, t, n) {
  return e & t ^ ~e & n;
}
function Dd(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let qd = class {
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
    }), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = hi(this.buffer);
  }
  update(t) {
    Ir(this), ct(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = hi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Ir(this), Ad(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Br(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, Rd(this.length * 8), o), this.process(r, 0);
    const a = hi(t), c = this.outputLen;
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
const yt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Vd = /* @__PURE__ */ Uint32Array.from([
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
]), gt = /* @__PURE__ */ new Uint32Array(64);
let Gd = class extends qd {
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
      gt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = gt[d - 15], f = gt[d - 2], b = je(h, 7) ^ je(h, 18) ^ h >>> 3, g = je(f, 17) ^ je(f, 19) ^ f >>> 10;
      gt[d] = g + gt[d - 7] + b + gt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = je(a, 6) ^ je(a, 11) ^ je(a, 25), f = l + h + jd(a, c, u) + Vd[d] + gt[d] | 0, g = (je(r, 2) ^ je(r, 13) ^ je(r, 22)) + Dd(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Br(gt);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Br(this.buffer);
  }
}, Wd = class extends Gd {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: yt[7] | 0
    });
  }
};
const Zd = /* @__PURE__ */ Kd(
  () => new Wd(),
  /* @__PURE__ */ Nd(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function qa(e, t) {
  const n = e % t;
  return n >= Ge ? n : t + n;
}
function Oe(e, t, n) {
  let r = e;
  for (; t-- > Ge; )
    r *= r, r %= n;
  return r;
}
function Xd(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Yd(e) {
  return Hd(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function Jd(e) {
  const t = Yd(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || Md, u = a ? 255n : 448n, l = a ? 32 : 56, d = a ? 9n : 5n, h = a ? 121665n : 39081n, f = a ? rr ** 254n : rr ** 447n, b = a ? 8n * rr ** 251n - Vt : 4n * rr ** 445n - Vt, g = f + b + Vt, p = (A) => qa(A, n), y = x(d);
  function x(A) {
    return zd(p(A), l);
  }
  function _(A) {
    const v = Ri(ct(A, l, "uCoordinate"));
    return a && (v[31] &= 127), p(ms(v));
  }
  function I(A) {
    return ms(i(Ri(ct(A, l, "scalar"))));
  }
  function S(A, v) {
    const E = j(_(v), I(A));
    if (E === Ge)
      throw new Error("invalid private or public key received");
    return x(E);
  }
  function O(A) {
    return S(A, y);
  }
  const L = O, R = S;
  function U(A, v, E) {
    const B = p(A * (v - E));
    return v = p(v - B), E = p(E + B), { x_2: v, x_3: E };
  }
  function j(A, v) {
    xs("u", A, Ge, n), xs("scalar", v, f, g);
    const E = v, B = A;
    let $ = Vt, P = Ge, T = A, C = Vt, H = Ge;
    for (let N = u - 1n; N >= Ge; N--) {
      const ee = E >> N & Vt;
      H ^= ee, { x_2: $, x_3: T } = U(H, $, T), { x_2: P, x_3: C } = U(H, P, C), H = ee;
      const te = $ + P, ne = p(te * te), Y = $ - P, he = p(Y * Y), nt = ne - he, $t = T + C, qt = T - C, wn = p(qt * te), mn = p($t * Y), fs = wn + mn, ps = wn - mn;
      T = p(fs * fs), C = p(B * p(ps * ps)), $ = p(ne * he), P = p(nt * (ne + p(h * nt)));
    }
    ({ x_2: $, x_3: T } = U(H, $, T)), { x_2: P, x_3: C } = U(H, P, C);
    const V = o(P);
    return p($ * V);
  }
  const z = {
    secretKey: l,
    publicKey: l,
    seed: l
  }, w = async (A) => (A === void 0 && (A = await c(l)), ct(A, z.seed, "seed"), A), k = { randomSecretKey: w };
  return Object.freeze({
    keygen: Xd(w, L),
    getSharedSecret: R,
    getPublicKey: L,
    scalarMult: S,
    scalarMultBase: O,
    utils: k,
    GuBytes: y.slice(),
    lengths: z
  });
}
class Qd extends eo {
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
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, Sd);
  }
}
class ef {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: to.Aes128Gcm
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
    return new Qd(t);
  }
}
class tf extends ef {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: to.Aes256Gcm
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
function vs() {
  return new Promise((e, t) => {
    t(new Qi("Not supported"));
  });
}
const nf = new Uint8Array([115, 101, 99]);
class no {
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
    return await vs();
  }
  async open(t, n) {
    return await vs();
  }
  async export(t, n) {
    const r = Z(t);
    if (r.byteLength > _r)
      throw new Ve("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, nf, new Uint8Array(r), n);
    } catch (i) {
      throw new rd(i);
    }
  }
}
class rf extends no {
}
class of extends no {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Va extends no {
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
    const n = Tn(t.seq, t.baseNonce.byteLength);
    return yd(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new sd("Message limit reached");
    t.seq += 1;
  }
}
var sf = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, af = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Er;
class Ga {
  constructor() {
    Er.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = sf(this, Er, "f");
    return af(this, Er, n, "f"), await r, t;
  }
}
Er = /* @__PURE__ */ new WeakMap();
var Es = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, cf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, In;
class uf extends Va {
  constructor() {
    super(...arguments), In.set(this, void 0);
  }
  async open(t, n = we.buffer) {
    cf(this, In, Es(this, In, "f") ?? new Ga(), "f");
    const r = await Es(this, In, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new od(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
In = /* @__PURE__ */ new WeakMap();
var Ss = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, lf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Bn;
class df extends Va {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), Bn.set(this, void 0), this.enc = i;
  }
  async seal(t, n = we.buffer) {
    lf(this, Bn, Ss(this, Bn, "f") ?? new Ga(), "f");
    const r = await Ss(this, Bn, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new id(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
Bn = /* @__PURE__ */ new WeakMap();
const ff = new Uint8Array([
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
]), pf = new Uint8Array([101, 120, 112]), hf = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), yf = new Uint8Array([107, 101, 121]), gf = new Uint8Array([
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
]), bf = new Uint8Array([115, 101, 99, 114, 101, 116]), wf = new Uint8Array([
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
class mf extends eo {
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
      throw new Ve("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new Ve("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new Ve("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(wf), this._suiteId.set(Tn(this._kem.id, 2), 4), this._suiteId.set(Tn(this._kdf.id, 2), 6), this._suiteId.set(Tn(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
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
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? ht.AuthPsk : ht.Psk : r = t.senderKey !== void 0 ? ht.Auth : ht.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
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
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? ht.AuthPsk : ht.Psk : r = t.senderPublicKey !== void 0 ? ht.Auth : ht.Base, await this._keyScheduleR(r, n, t);
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
  async seal(t, n, r = we.buffer) {
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
  async open(t, n, r = we.buffer) {
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
    const i = r.psk === void 0 ? we : xr(r.psk.id), o = await this._kdf.labeledExtract(we, gf, i), s = r.info === void 0 ? we : xr(r.info), a = await this._kdf.labeledExtract(we, hf, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const u = r.psk === void 0 ? we : xr(r.psk.key), l = this._kdf.buildLabeledIkm(bf, u), d = this._kdf.buildLabeledInfo(pf, c, this._kdf.hashSize), h = await this._kdf.extractAndExpand(n, l, d, this._kdf.hashSize);
    if (this._aead.id === to.ExportOnly)
      return { aead: this._aead, exporterSecret: h };
    const f = this._kdf.buildLabeledInfo(yf, c, this._aead.keySize), b = await this._kdf.extractAndExpand(n, l, f, this._aead.keySize), g = this._kdf.buildLabeledInfo(ff, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, l, g, this._aead.nonceSize);
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
    return o.key === void 0 ? new of(this._api, this._kdf, o.exporterSecret, r) : new df(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new rf(this._api, this._kdf, i.exporterSecret) : new uf(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > dd)
      throw new Ve("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < gs)
        throw new Ve(`PSK must have at least ${gs} bytes`);
      if (t.psk.key.byteLength > _r)
        throw new Ve("Too long psk.key");
      if (t.psk.id.byteLength > _r)
        throw new Ve("Too long psk.id");
    }
  }
}
class xf extends mf {
}
let vf = class extends Fa {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Ef = 1n, ks = 2n, Sf = 3n, kf = 5n, Wa = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function Af(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = Wa, a = e * e % o * e % o, c = Oe(a, ks, o) * a % o, u = Oe(c, Ef, o) * e % o, l = Oe(u, kf, o) * u % o, d = Oe(l, t, o) * l % o, h = Oe(d, n, o) * d % o, f = Oe(h, r, o) * h % o, b = Oe(f, i, o) * f % o, g = Oe(b, i, o) * f % o, p = Oe(g, t, o) * l % o;
  return { pow_p_5_8: Oe(p, ks, o) * e % o, b2: a };
}
function _f(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const If = /* @__PURE__ */ (() => {
  const e = Wa;
  return Jd({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = Af(t);
      return qa(Oe(n, Sf, e) * r, e);
    },
    adjustScalarBytes: _f
  });
})();
class Bf extends Fa {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t), i = Z(n);
    if (r.byteLength !== this.hashSize)
      return Da(Zd, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class Pf extends Ed {
  constructor(t) {
    super("X25519", 32, If, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new mr(r));
    }
  }
}
class $f extends md {
  constructor() {
    const t = new Bf();
    super(ys.DhkemX25519HkdfSha256, new Pf(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ys.DhkemX25519HkdfSha256
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
function Za(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Ye(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function Je(e, t, n = "") {
  const r = Za(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, u = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(u) : new TypeError(u);
  }
  return e;
}
function Xa(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (Ye(e.outputLen), Ye(e.blockLen), e.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (e.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function on(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function ro(e, t) {
  Je(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function Of(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Qe(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function yi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function De(e, t) {
  return e << 32 - t | e >>> t;
}
function sr(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const Tf = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Lf(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Rf(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Lf(e[t]);
  return e;
}
const As = Tf ? (e) => e : Rf, Ya = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Cf = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function io(e) {
  if (Je(e), Ya)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Cf[e[n]];
  return t;
}
const it = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function _s(e) {
  if (e >= it._0 && e <= it._9)
    return e - it._0;
  if (e >= it.A && e <= it.F)
    return e - (it.A - 10);
  if (e >= it.a && e <= it.f)
    return e - (it.a - 10);
}
function oo(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Ya)
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
    const s = _s(e.charCodeAt(o)), a = _s(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function zf(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    Je(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function Xr(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function so(e = 32) {
  Ye(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const Ja = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function Uf(e, t, n) {
  return e & t ^ ~e & n;
}
function Hf(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let ao = class {
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
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = yi(this.buffer);
  }
  update(t) {
    on(this), Je(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = yi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    on(this), ro(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Qe(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = yi(t), c = this.outputLen;
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
const bt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), ye = /* @__PURE__ */ Uint32Array.from([
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
]), ar = /* @__PURE__ */ BigInt(2 ** 32 - 1), Is = /* @__PURE__ */ BigInt(32);
function Mf(e, t = !1) {
  return t ? { h: Number(e & ar), l: Number(e >> Is & ar) } : { h: Number(e >> Is & ar) | 0, l: Number(e & ar) | 0 };
}
function Qa(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Mf(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Bs = (e, t, n) => e >>> n, Ps = (e, t, n) => e << 32 - n | t >>> n, Wt = (e, t, n) => e >>> n | t << 32 - n, Zt = (e, t, n) => e << 32 - n | t >>> n, cr = (e, t, n) => e << 64 - n | t >>> n - 32, ur = (e, t, n) => e >>> n - 32 | t << 64 - n, Nf = (e, t, n) => e << n | t >>> 32 - n, Ff = (e, t, n) => t << n | e >>> 32 - n, Kf = (e, t, n) => t << n - 32 | e >>> 64 - n, jf = (e, t, n) => e << n - 32 | t >>> 64 - n;
function ot(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Df = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), qf = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, Vf = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), Gf = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, Wf = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), Zf = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, Xf = /* @__PURE__ */ Uint32Array.from([
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
]), wt = /* @__PURE__ */ new Uint32Array(64);
class Yf extends ao {
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
      wt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = wt[d - 15], f = wt[d - 2], b = De(h, 7) ^ De(h, 18) ^ h >>> 3, g = De(f, 17) ^ De(f, 19) ^ f >>> 10;
      wt[d] = g + wt[d - 7] + b + wt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = De(a, 6) ^ De(a, 11) ^ De(a, 25), f = l + h + Uf(a, c, u) + Xf[d] + wt[d] | 0, g = (De(r, 2) ^ De(r, 13) ^ De(r, 22)) + Hf(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Qe(wt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), Qe(this.buffer);
  }
}
class Jf extends Yf {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = bt[0] | 0;
  B = bt[1] | 0;
  C = bt[2] | 0;
  D = bt[3] | 0;
  E = bt[4] | 0;
  F = bt[5] | 0;
  G = bt[6] | 0;
  H = bt[7] | 0;
  constructor() {
    super(32);
  }
}
const ec = Qa([
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
].map((e) => BigInt(e))), Qf = ec[0], ep = ec[1], mt = /* @__PURE__ */ new Uint32Array(80), xt = /* @__PURE__ */ new Uint32Array(80);
class tp extends ao {
  constructor(t) {
    super(128, t, 16, !1);
  }
  // prettier-ignore
  get() {
    const { Ah: t, Al: n, Bh: r, Bl: i, Ch: o, Cl: s, Dh: a, Dl: c, Eh: u, El: l, Fh: d, Fl: h, Gh: f, Gl: b, Hh: g, Hl: p } = this;
    return [t, n, r, i, o, s, a, c, u, l, d, h, f, b, g, p];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c, u, l, d, h, f, b, g, p) {
    this.Ah = t | 0, this.Al = n | 0, this.Bh = r | 0, this.Bl = i | 0, this.Ch = o | 0, this.Cl = s | 0, this.Dh = a | 0, this.Dl = c | 0, this.Eh = u | 0, this.El = l | 0, this.Fh = d | 0, this.Fl = h | 0, this.Gh = f | 0, this.Gl = b | 0, this.Hh = g | 0, this.Hl = p | 0;
  }
  process(t, n) {
    for (let _ = 0; _ < 16; _++, n += 4)
      mt[_] = t.getUint32(n), xt[_] = t.getUint32(n += 4);
    for (let _ = 16; _ < 80; _++) {
      const I = mt[_ - 15] | 0, S = xt[_ - 15] | 0, O = Wt(I, S, 1) ^ Wt(I, S, 8) ^ Bs(I, S, 7), L = Zt(I, S, 1) ^ Zt(I, S, 8) ^ Ps(I, S, 7), R = mt[_ - 2] | 0, U = xt[_ - 2] | 0, j = Wt(R, U, 19) ^ cr(R, U, 61) ^ Bs(R, U, 6), z = Zt(R, U, 19) ^ ur(R, U, 61) ^ Ps(R, U, 6), w = Vf(L, z, xt[_ - 7], xt[_ - 16]), k = Gf(w, O, j, mt[_ - 7], mt[_ - 16]);
      mt[_] = k | 0, xt[_] = w | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: u, Dl: l, Eh: d, El: h, Fh: f, Fl: b, Gh: g, Gl: p, Hh: y, Hl: x } = this;
    for (let _ = 0; _ < 80; _++) {
      const I = Wt(d, h, 14) ^ Wt(d, h, 18) ^ cr(d, h, 41), S = Zt(d, h, 14) ^ Zt(d, h, 18) ^ ur(d, h, 41), O = d & f ^ ~d & g, L = h & b ^ ~h & p, R = Wf(x, S, L, ep[_], xt[_]), U = Zf(R, y, I, O, Qf[_], mt[_]), j = R | 0, z = Wt(r, i, 28) ^ cr(r, i, 34) ^ cr(r, i, 39), w = Zt(r, i, 28) ^ ur(r, i, 34) ^ ur(r, i, 39), k = r & o ^ r & a ^ o & a, A = i & s ^ i & c ^ s & c;
      y = g | 0, x = p | 0, g = f | 0, p = b | 0, f = d | 0, b = h | 0, { h: d, l: h } = ot(u | 0, l | 0, U | 0, j | 0), u = a | 0, l = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const v = Df(j, w, A);
      r = qf(v, U, z, k), i = v | 0;
    }
    ({ h: r, l: i } = ot(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = ot(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = ot(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: u, l } = ot(this.Dh | 0, this.Dl | 0, u | 0, l | 0), { h: d, l: h } = ot(this.Eh | 0, this.El | 0, d | 0, h | 0), { h: f, l: b } = ot(this.Fh | 0, this.Fl | 0, f | 0, b | 0), { h: g, l: p } = ot(this.Gh | 0, this.Gl | 0, g | 0, p | 0), { h: y, l: x } = ot(this.Hh | 0, this.Hl | 0, y | 0, x | 0), this.set(r, i, o, s, a, c, u, l, d, h, f, b, g, p, y, x);
  }
  roundClean() {
    Qe(mt, xt);
  }
  destroy() {
    this.destroyed = !0, Qe(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class np extends tp {
  Ah = ye[0] | 0;
  Al = ye[1] | 0;
  Bh = ye[2] | 0;
  Bl = ye[3] | 0;
  Ch = ye[4] | 0;
  Cl = ye[5] | 0;
  Dh = ye[6] | 0;
  Dl = ye[7] | 0;
  Eh = ye[8] | 0;
  El = ye[9] | 0;
  Fh = ye[10] | 0;
  Fl = ye[11] | 0;
  Gh = ye[12] | 0;
  Gl = ye[13] | 0;
  Hh = ye[14] | 0;
  Hl = ye[15] | 0;
  constructor() {
    super(64);
  }
}
const ce = /* @__PURE__ */ Xr(
  () => new Jf(),
  /* @__PURE__ */ Ja(1)
), rp = /* @__PURE__ */ Xr(
  () => new np(),
  /* @__PURE__ */ Ja(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const q = (e, t, n) => Je(e, t, n), tc = Ye, X = io, Pe = (...e) => zf(...e), Hn = (e) => oo(e), co = Za, uo = (e) => so(e), Pr = /* @__PURE__ */ BigInt(0), Ci = /* @__PURE__ */ BigInt(1);
function It(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function lo(e) {
  if (typeof e == "bigint") {
    if (!Sr(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    tc(e);
  return e;
}
function $r(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function lr(e) {
  const t = lo(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function nc(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? Pr : BigInt("0x" + e);
}
function Jn(e) {
  return nc(io(e));
}
function sn(e) {
  return nc(io(zi(Je(e)).reverse()));
}
function fo(e, t) {
  if (Ye(t), t === 0)
    throw new RangeError("zero length");
  e = lo(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return oo(n.padStart(t * 2, "0"));
}
function rc(e, t) {
  return fo(e, t).reverse();
}
function ip(e, t) {
  if (e = q(e), t = q(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function zi(e) {
  return Uint8Array.from(q(e));
}
function op(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const Sr = (e) => typeof e == "bigint" && Pr <= e;
function sp(e, t, n) {
  return Sr(e) && Sr(t) && Sr(n) && t <= e && e < n;
}
function Or(e, t, n, r) {
  if (!sp(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function po(e) {
  if (e < Pr)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > Pr; e >>= Ci, t += 1)
    ;
  return t;
}
const ho = (e) => (Ci << BigInt(e)) - Ci;
function ap(e, t, n) {
  if (Ye(e, "hashLen"), Ye(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), u = r(e), l = 0;
  const d = () => {
    c.fill(1), u.fill(0), l = 0;
  }, h = (...p) => n(u, Pe(c, ...p)), f = (p = i) => {
    u = h(o, p), c = h(), p.length !== 0 && (u = h(s, p), c = h());
  }, b = () => {
    if (l++ >= a)
      throw new Error("drbg: tried max amount of iterations");
    let p = 0;
    const y = [];
    for (; p < t; ) {
      c = h();
      const x = c.slice();
      y.push(x), p += c.length;
    }
    return Pe(...y);
  };
  return (p, y) => {
    d(), f(p);
    let x;
    for (; (x = y(b())) === void 0; )
      f();
    return d(), x;
  };
}
function pn(e, t = {}, n = {}) {
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
const $s = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ge = /* @__PURE__ */ BigInt(0), oe = /* @__PURE__ */ BigInt(1), Ct = /* @__PURE__ */ BigInt(2), ic = /* @__PURE__ */ BigInt(3), oc = /* @__PURE__ */ BigInt(4), sc = /* @__PURE__ */ BigInt(5), cp = /* @__PURE__ */ BigInt(7), ac = /* @__PURE__ */ BigInt(8), up = /* @__PURE__ */ BigInt(9), cc = /* @__PURE__ */ BigInt(16);
function ae(e, t) {
  if (t <= ge)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= ge ? n : t + n;
}
function re(e, t, n) {
  if (t < ge)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let r = e;
  for (; t-- > ge; )
    r *= r, r %= n;
  return r;
}
function Os(e, t) {
  if (e === ge)
    throw new Error("invert: expected non-zero number");
  if (t <= ge)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = ae(e, t), r = t, i = ge, o = oe;
  for (; n !== ge; ) {
    const a = r / n, c = r - n * a, u = i - o * a;
    r = n, n = c, i = o, o = u;
  }
  if (r !== oe)
    throw new Error("invert: does not exist");
  return ae(i, t);
}
function yo(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function uc(e, t) {
  const n = e, r = (n.ORDER + oe) / oc, i = n.pow(t, r);
  return yo(n, i, t), i;
}
function lp(e, t) {
  const n = e, r = (n.ORDER - sc) / ac, i = n.mul(t, Ct), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, Ct), o), c = n.mul(s, n.sub(a, n.ONE));
  return yo(n, c, t), c;
}
function dp(e) {
  const t = Yr(e), n = lc(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + cp) / cc;
  return ((a, c) => {
    const u = a;
    let l = u.pow(c, s), d = u.mul(l, r);
    const h = u.mul(l, i), f = u.mul(l, o), b = u.eql(u.sqr(d), c), g = u.eql(u.sqr(h), c);
    l = u.cmov(l, d, b), d = u.cmov(f, h, g);
    const p = u.eql(u.sqr(d), c), y = u.cmov(l, d, p);
    return yo(u, y, c), y;
  });
}
function lc(e) {
  if (e < ic)
    throw new Error("sqrt is not defined for small field");
  let t = e - oe, n = 0;
  for (; t % Ct === ge; )
    t /= Ct, n++;
  let r = Ct;
  const i = Yr(e);
  for (; Ts(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return uc;
  let o = i.pow(r, t);
  const s = (t + oe) / Ct;
  return function(c, u) {
    const l = c;
    if (l.is0(u))
      return u;
    if (Ts(l, u) !== 1)
      throw new Error("Cannot find square root");
    let d = n, h = l.mul(l.ONE, o), f = l.pow(u, t), b = l.pow(u, s);
    for (; !l.eql(f, l.ONE); ) {
      if (l.is0(f))
        return l.ZERO;
      let g = 1, p = l.sqr(f);
      for (; !l.eql(p, l.ONE); )
        if (g++, p = l.sqr(p), g === d)
          throw new Error("Cannot find square root");
      const y = oe << BigInt(d - g - 1), x = l.pow(h, y);
      d = g, h = l.sqr(x), f = l.mul(f, h), b = l.mul(b, x);
    }
    return b;
  };
}
function fp(e) {
  return e % oc === ic ? uc : e % ac === sc ? lp : e % cc === up ? dp(e) : lc(e);
}
const Ot = (e, t) => (ae(e, t) & oe) === oe, pp = [
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
function hp(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = pp.reduce((r, i) => (r[i] = "function", r), t);
  if (pn(e, n), $r(e.BYTES, "BYTES"), $r(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= oe)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function yp(e, t, n) {
  const r = e;
  if (n < ge)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === ge)
    return r.ONE;
  if (n === oe)
    return t;
  let i = r.ONE, o = t;
  for (; n > ge; )
    n & oe && (i = r.mul(i, o)), o = r.sqr(o), n >>= oe;
  return i;
}
function dc(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, u) => r.is0(c) ? a : (i[u] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, u) => r.is0(c) ? a : (i[u] = r.mul(a, i[u]), r.mul(a, c)), s), i;
}
function Ts(e, t) {
  const n = e, r = (n.ORDER - oe) / Ct, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function gp(e, t) {
  if (t !== void 0 && tc(t), e <= ge)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = po(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const Ls = /* @__PURE__ */ new WeakMap();
class fc {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = ge;
  ONE = oe;
  _lengths;
  _mod;
  constructor(t, n = {}) {
    if (t <= oe)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: n.sqrt, enumerable: !0 }), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = Object.freeze(n.allowedLengths.slice())), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: i, nByteLength: o } = gp(t, r);
    if (o > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = i, this.BYTES = o, Object.freeze(this);
  }
  create(t) {
    return ae(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof t);
    return ge <= t && t < this.ORDER;
  }
  is0(t) {
    return t === ge;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & oe) === oe;
  }
  neg(t) {
    return ae(-t, this.ORDER);
  }
  eql(t, n) {
    return t === n;
  }
  sqr(t) {
    return ae(t * t, this.ORDER);
  }
  add(t, n) {
    return ae(t + n, this.ORDER);
  }
  sub(t, n) {
    return ae(t - n, this.ORDER);
  }
  mul(t, n) {
    return ae(t * n, this.ORDER);
  }
  pow(t, n) {
    return yp(this, t, n);
  }
  div(t, n) {
    return ae(t * Os(n, this.ORDER), this.ORDER);
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
    return Os(t, this.ORDER);
  }
  sqrt(t) {
    let n = Ls.get(this);
    return n || Ls.set(this, n = fp(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? rc(t, this.BYTES) : fo(t, this.BYTES);
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
    let c = o ? sn(t) : Jn(t);
    if (a && (c = ae(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return dc(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return It(r, "condition"), r ? n : t;
  }
}
Object.freeze(fc.prototype);
function Yr(e, t = {}) {
  return new fc(e, t);
}
function pc(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= oe)
    throw new Error("field order must be greater than 1");
  const t = po(e - oe);
  return Math.ceil(t / 8);
}
function hc(e) {
  const t = pc(e);
  return t + Math.ceil(t / 2);
}
function yc(e, t, n = !1) {
  q(e);
  const r = e.length, i = pc(t), o = Math.max(hc(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? sn(e) : Jn(e), a = ae(s, t - oe) + oe;
  return n ? rc(a, i) : fo(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const an = /* @__PURE__ */ BigInt(0), zt = /* @__PURE__ */ BigInt(1);
function Tr(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function Ln(e, t) {
  const n = dc(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function gc(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function gi(e, t) {
  gc(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = ho(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function Rs(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += zt);
  const u = t * r, l = u + Math.abs(a) - 1, d = a === 0, h = a < 0, f = t % 2 !== 0;
  return { nextN: c, offset: l, isZero: d, isNeg: h, isNegF: f, offsetF: u };
}
const bi = /* @__PURE__ */ new WeakMap(), bc = /* @__PURE__ */ new WeakMap();
function wi(e) {
  return bc.get(e) || 1;
}
function Cs(e) {
  if (e !== an)
    throw new Error("invalid wNAF");
}
class wc {
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
    for (; n > an; )
      n & zt && (r = r.add(i)), i = i.double(), n >>= zt;
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
    const { windows: r, windowSize: i } = gi(n, this.bits), o = [];
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
    const s = gi(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: u, isZero: l, isNeg: d, isNegF: h, offsetF: f } = Rs(r, a, s);
      r = c, l ? o = o.add(Tr(h, n[f])) : i = i.add(Tr(d, n[u]));
    }
    return Cs(r), { p: i, f: o };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = gi(t, this.bits);
    for (let s = 0; s < o.windows && r !== an; s++) {
      const { nextN: a, offset: c, isZero: u, isNeg: l } = Rs(r, s, o);
      if (r = a, !u) {
        const d = n[c];
        i = i.add(l ? d.negate() : d);
      }
    }
    return Cs(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = bi.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), bi.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = wi(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = wi(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    gc(n, this.bits), bc.set(t, n), bi.delete(t);
  }
  hasCache(t) {
    return wi(t) !== 1;
  }
}
function bp(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > an || r > an; )
    n & zt && (o = o.add(i)), r & zt && (s = s.add(i)), i = i.double(), n >>= zt, r >>= zt;
  return { p1: o, p2: s };
}
function zs(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return hp(t), t;
  } else
    return Yr(e, { isLE: n });
}
function mc(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const u = t[c];
    if (!(typeof u == "bigint" && u > an))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = zs(t.p, n.Fp, r), o = zs(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function go(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const vt = /* @__PURE__ */ BigInt(0), pe = /* @__PURE__ */ BigInt(1), mi = /* @__PURE__ */ BigInt(2), wp = /* @__PURE__ */ BigInt(8);
function mp(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function xp(e, t = {}) {
  const n = t, r = mc("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  pn(n, {}, { uvRatio: "function" });
  const c = mi << BigInt(o.BYTES * 8) - pe, u = (g) => i.create(g), l = n.uvRatio === void 0 ? (g, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(g, p)) };
    } catch {
      return { isValid: !1, value: vt };
    }
  } : n.uvRatio;
  if (!mp(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(g, p, y = !1) {
    const x = y ? pe : vt;
    return Or("coordinate " + g, p, x, c), p;
  }
  function h(g) {
    if (!(g instanceof f))
      throw new Error("EdwardsPoint expected");
  }
  class f {
    // base / generator point
    static BASE = new f(s.Gx, s.Gy, pe, u(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new f(vt, pe, pe, vt);
    // 0, 1, 1, 0
    // math field
    static Fp = i;
    // scalar field
    static Fn = o;
    X;
    Y;
    Z;
    T;
    constructor(p, y, x, _) {
      this.X = d("x", p), this.Y = d("y", y), this.Z = d("z", x, !0), this.T = d("t", _), Object.freeze(this);
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
      const { x: y, y: x } = p || {};
      return d("x", y), d("y", x), new f(y, x, pe, u(y * x));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(p, y = !1) {
      const x = i.BYTES, { a: _, d: I } = s;
      p = zi(q(p, x, "point")), It(y, "zip215");
      const S = zi(p), O = p[x - 1];
      S[x - 1] = O & -129;
      const L = sn(S), R = y ? c : i.ORDER;
      Or("point.y", L, vt, R);
      const U = u(L * L), j = u(U - pe), z = u(I * U - _);
      let { isValid: w, value: k } = l(j, z);
      if (!w)
        throw new Error("bad point: invalid y coordinate");
      const A = (k & pe) === pe, v = (O & 128) !== 0;
      if (!y && k === vt && v)
        throw new Error("bad point: x=0 and x_0=1");
      return v !== A && (k = u(-k)), f.fromAffine({ x: k, y: L });
    }
    static fromHex(p, y = !1) {
      return f.fromBytes(Hn(p), y);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, y = !0) {
      return b.createCache(this, p), y || this.multiply(mi), this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this, { a: y, d: x } = s;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X: _, Y: I, Z: S, T: O } = p, L = u(_ * _), R = u(I * I), U = u(S * S), j = u(U * U), z = u(L * y), w = u(U * u(z + R)), k = u(j + u(x * u(L * R)));
      if (w !== k)
        throw new Error("bad point: equation left != right (1)");
      const A = u(_ * I), v = u(S * O);
      if (A !== v)
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(p) {
      h(p);
      const { X: y, Y: x, Z: _ } = this, { X: I, Y: S, Z: O } = p, L = u(y * O), R = u(I * _), U = u(x * O), j = u(S * _);
      return L === R && U === j;
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
      const { a: p } = s, { X: y, Y: x, Z: _ } = this, I = u(y * y), S = u(x * x), O = u(mi * u(_ * _)), L = u(p * I), R = y + x, U = u(u(R * R) - I - S), j = L + S, z = j - O, w = L - S, k = u(U * z), A = u(j * w), v = u(U * w), E = u(z * j);
      return new f(k, A, E, v);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      h(p);
      const { a: y, d: x } = s, { X: _, Y: I, Z: S, T: O } = this, { X: L, Y: R, Z: U, T: j } = p, z = u(_ * L), w = u(I * R), k = u(O * x * j), A = u(S * U), v = u((_ + I) * (L + R) - z - w), E = A - k, B = A + k, $ = u(w - y * z), P = u(v * E), T = u(B * $), C = u(v * $), H = u(E * B);
      return new f(P, T, H, C);
    }
    subtract(p) {
      return h(p), this.add(p.negate());
    }
    // Constant-time multiplication.
    multiply(p) {
      if (!o.isValidNot0(p))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p: y, f: x } = b.cached(this, p, (_) => Ln(f, _));
      return Ln(f, [y, x])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(p) {
      if (!o.isValid(p))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      return p === vt ? f.ZERO : this.is0() || p === pe ? this : b.unsafe(this, p, (y) => Ln(f, y));
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
      const y = this;
      let x = p;
      const { X: _, Y: I, Z: S } = y, O = y.is0();
      x == null && (x = O ? wp : i.inv(S));
      const L = u(_ * x), R = u(I * x), U = i.mul(S, x);
      if (O)
        return { x: vt, y: pe };
      if (U !== pe)
        throw new Error("invZ was invalid");
      return { x: L, y: R };
    }
    clearCofactor() {
      return a === pe ? this : this.multiplyUnsafe(a);
    }
    toBytes() {
      const { x: p, y } = this.toAffine(), x = i.toBytes(y);
      return x[x.length - 1] |= p & pe ? 128 : 0, x;
    }
    toHex() {
      return X(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const b = new wc(f, o.BITS);
  return o.BITS >= 8 && f.BASE.precompute(8), Object.freeze(f.prototype), Object.freeze(f), f;
}
class vp {
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
    $s();
  }
  static fromHex(t) {
    $s();
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
function Ep(e, t, n = {}) {
  if (typeof t != "function")
    throw new Error('"hash" function param is required');
  const r = t, i = n;
  pn(i, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function"
  });
  const { prehash: o } = i, { BASE: s, Fp: a, Fn: c } = e, u = r.outputLen, l = 2 * a.BYTES;
  if (u !== void 0 && ($r(u, "hash.outputLen"), u !== l))
    throw new Error(`hash.outputLen must be ${l}, got ${u}`);
  const d = i.randomBytes === void 0 ? uo : i.randomBytes, h = i.adjustScalarBytes === void 0 ? (w) => w : i.adjustScalarBytes, f = i.domain === void 0 ? (w, k, A) => {
    if (It(A, "phflag"), k.length || A)
      throw new Error("Contexts/pre-hash are not supported");
    return w;
  } : i.domain;
  function b(w) {
    return c.create(sn(w));
  }
  function g(w) {
    const k = L.secretKey;
    q(w, L.secretKey, "secretKey");
    const A = q(r(w), 2 * k, "hashedSecretKey"), v = h(A.slice(0, k)), E = A.slice(k, 2 * k), B = b(v);
    return { head: v, prefix: E, scalar: B };
  }
  function p(w) {
    const { head: k, prefix: A, scalar: v } = g(w), E = s.multiply(v), B = E.toBytes();
    return { head: k, prefix: A, scalar: v, point: E, pointBytes: B };
  }
  function y(w) {
    return p(w).pointBytes;
  }
  function x(w = Uint8Array.of(), ...k) {
    const A = Pe(...k);
    return b(r(f(A, q(w, void 0, "context"), !!o)));
  }
  function _(w, k, A = {}) {
    w = q(w, void 0, "message"), o && (w = o(w));
    const { prefix: v, scalar: E, pointBytes: B } = p(k), $ = x(A.context, v, w), P = s.multiply($).toBytes(), T = x(A.context, P, B, w), C = c.create($ + T * E);
    if (!c.isValid(C))
      throw new Error("sign failed: invalid s");
    const H = Pe(P, c.toBytes(C));
    return q(H, L.signature, "result");
  }
  const I = {
    zip215: i.zip215
  };
  function S(w, k, A, v = I) {
    const { context: E } = v, B = v.zip215 === void 0 ? !!I.zip215 : v.zip215, $ = L.signature;
    w = q(w, $, "signature"), k = q(k, void 0, "message"), A = q(A, L.publicKey, "publicKey"), B !== void 0 && It(B, "zip215"), o && (k = o(k));
    const P = $ / 2, T = w.subarray(0, P), C = sn(w.subarray(P, $));
    let H, V, N;
    try {
      H = e.fromBytes(A, B), V = e.fromBytes(T, B), N = s.multiplyUnsafe(C);
    } catch {
      return !1;
    }
    if (!B && H.isSmallOrder())
      return !1;
    const ee = x(E, T, A, k);
    return V.add(H.multiplyUnsafe(ee)).subtract(N).clearCofactor().is0();
  }
  const O = a.BYTES, L = {
    secretKey: O,
    publicKey: O,
    signature: 2 * O,
    seed: O
  };
  function R(w) {
    return w = w === void 0 ? d(L.seed) : w, q(w, L.seed, "seed");
  }
  function U(w) {
    return co(w) && w.length === L.secretKey;
  }
  function j(w, k) {
    try {
      return !!e.fromBytes(w, k === void 0 ? I.zip215 : k);
    } catch {
      return !1;
    }
  }
  const z = {
    getExtendedPublicKey: p,
    randomSecretKey: R,
    isValidSecretKey: U,
    isValidPublicKey: j,
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
      const { y: k } = e.fromBytes(w), A = L.publicKey, v = A === 32;
      if (!v && A !== 57)
        throw new Error("only defined for 25519 and 448");
      const E = v ? a.div(pe + k, pe - k) : a.div(k - pe, k + pe);
      return a.toBytes(E);
    },
    toMontgomerySecret(w) {
      const k = L.secretKey;
      q(w, k);
      const A = r(w.subarray(0, k));
      return h(A).subarray(0, k);
    }
  };
  return Object.freeze(L), Object.freeze(z), Object.freeze({
    keygen: go(R, y),
    getPublicKey: y,
    sign: _,
    verify: S,
    utils: z,
    Point: e,
    lengths: L
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Sp = /* @__PURE__ */ BigInt(0), Rn = /* @__PURE__ */ BigInt(1), Us = /* @__PURE__ */ BigInt(2), kp = /* @__PURE__ */ BigInt(5), Ap = /* @__PURE__ */ BigInt(8), Mn = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), xc = {
  p: Mn,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: Ap,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function _p(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = Mn, a = e * e % o * e % o, c = re(a, Us, o) * a % o, u = re(c, Rn, o) * e % o, l = re(u, kp, o) * u % o, d = re(l, t, o) * l % o, h = re(d, n, o) * d % o, f = re(h, r, o) * h % o, b = re(f, i, o) * f % o, g = re(b, i, o) * f % o, p = re(g, t, o) * l % o;
  return { pow_p_5_8: re(p, Us, o) * e % o, b2: a };
}
function Ip(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Ui = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function vc(e, t) {
  const n = Mn, r = ae(t * t * t, n), i = ae(r * r * t, n), o = _p(e * i).pow_p_5_8;
  let s = ae(e * r * o, n);
  const a = ae(t * s * s, n), c = s, u = ae(s * Ui, n), l = a === e, d = a === ae(-e, n), h = a === ae(-e * Ui, n);
  return l && (s = c), (d || h) && (s = u), Ot(s, n) && (s = ae(-s, n)), { isValid: l || d, value: s };
}
const Ut = /* @__PURE__ */ xp(xc, { uvRatio: vc }), Tt = Ut.Fp, Bp = Ut.Fn;
function Pp(e) {
  return Ep(Ut, rp, Object.assign({ adjustScalarBytes: Ip, zip215: !0 }, e));
}
const Lr = /* @__PURE__ */ Pp({}), Hs = Ui, $p = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), Ms = (e) => vc(Rn, e), Op = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), Tp = (e) => Tt.create(sn(e) & Op);
class _e extends vp {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new _e(Ut.BASE);
  // prettier-ignore
  static ZERO = new _e(Ut.ZERO);
  // prettier-ignore
  static Fp = Tt;
  // prettier-ignore
  static Fn = Bp;
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
    return new _e(Ut.fromAffine(t));
  }
  assertSame(t) {
    if (!(t instanceof _e))
      throw new Error("RistrettoPoint expected");
  }
  init(t) {
    return new _e(t);
  }
  static fromBytes(t) {
    Je(t, 32);
    const { a: n, d: r } = xc, i = Mn, o = (I) => Tt.create(I), s = Tp(t);
    if (!ip(Tt.toBytes(s), t) || Ot(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(Rn + n * a), u = o(Rn - n * a), l = o(c * c), d = o(u * u), h = o(n * r * l - d), { isValid: f, value: b } = Ms(o(h * d)), g = o(b * u), p = o(b * g * h);
    let y = o((s + s) * g);
    Ot(y, i) && (y = o(-y));
    const x = o(c * p), _ = o(y * x);
    if (!f || Ot(_, i) || x === Sp)
      throw new Error("invalid ristretto255 encoding 2");
    return new _e(new Ut(y, x, Rn, _));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return _e.fromBytes(oo(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = Mn, s = (p) => Tt.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), u = s(c * c), { value: l } = Ms(s(a * u)), d = s(l * a), h = s(l * c), f = s(d * h * i);
    let b;
    if (Ot(i * f, o)) {
      let p = s(n * Hs), y = s(t * Hs);
      t = p, n = y, b = s(d * $p);
    } else
      b = h;
    Ot(t * f, o) && (n = s(-n));
    let g = s((r - n) * b);
    return Ot(g, o) && (g = s(-g)), Tt.toBytes(g);
  }
  /**
   * Compares two Ristretto points.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
   */
  equals(t) {
    this.assertSame(t);
    const { X: n, Y: r } = this.ep, { X: i, Y: o } = t.ep, s = (u) => Tt.create(u), a = s(n * o) === s(r * i), c = s(r * o) === s(n * i);
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
class Ns {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (Xa(t), Je(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Qe(i);
  }
  update(t) {
    return on(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    on(this), ro(t, this), this.finished = !0;
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
const Lp = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new Ns(t, n).update(r).digest());
  return e.create = (t, n) => new Ns(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Fs = (e, t) => (e + (e >= 0 ? t : -t) / Ec) / t;
function Rp(e, t, n) {
  Or("scalar", e, We, n);
  const [[r, i], [o, s]] = t, a = Fs(s * e, n), c = Fs(-i * e, n);
  let u = e - a * r - c * o, l = -a * i - c * s;
  const d = u < We, h = l < We;
  d && (u = -u), h && (l = -l);
  const f = ho(Math.ceil(po(n) / 2)) + kt;
  if (u < We || u >= f || l < We || l >= f)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: u, k2neg: h, k2: l };
}
function Hi(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function xi(e, t) {
  pn(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return It(n.lowS, "lowS"), It(n.prehash, "prehash"), n.format !== void 0 && Hi(n.format), n;
}
class Cp extends Error {
  constructor(t = "") {
    super(t);
  }
}
const Le = {
  // asn.1 DER encoding utils
  Err: Cp,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = Le;
      if ($r(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = lr(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? lr(i.length / 2 | 128) : "";
      return lr(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = Le;
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
      const { Err: t } = Le;
      if (lo(e), e < We)
        throw new t("integer: negative integers are not allowed");
      let n = lr(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = Le;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Jn(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = Le, i = q(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: u, l } = r.decode(2, c);
    if (l.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(u) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = Le, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
};
Object.freeze(Le._tlv);
Object.freeze(Le._int);
Object.freeze(Le);
const We = /* @__PURE__ */ BigInt(0), kt = /* @__PURE__ */ BigInt(1), Ec = /* @__PURE__ */ BigInt(2), dr = /* @__PURE__ */ BigInt(3), zp = /* @__PURE__ */ BigInt(4);
function Up(e, t = {}) {
  const n = mc("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  pn(t, {}, {
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
  const l = kc(r, i);
  function d() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function h(z, w, k) {
    if (u && w.is0())
      return Uint8Array.of(0);
    const { x: A, y: v } = w.toAffine(), E = r.toBytes(A);
    if (It(k, "isCompressed"), k) {
      d();
      const B = !r.isOdd(v);
      return Pe(Sc(B), E);
    } else
      return Pe(Uint8Array.of(4), E, r.toBytes(v));
  }
  function f(z) {
    q(z, void 0, "Point");
    const { publicKey: w, publicKeyUncompressed: k } = l, A = z.length, v = z[0], E = z.subarray(1);
    if (u && A === 1 && v === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (A === w && (v === 2 || v === 3)) {
      const B = r.fromBytes(E);
      if (!r.isValid(B))
        throw new Error("bad point: is not on curve, wrong x");
      const $ = p(B);
      let P;
      try {
        P = r.sqrt($);
      } catch (H) {
        const V = H instanceof Error ? ": " + H.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + V);
      }
      d();
      const T = r.isOdd(P);
      return (v & 1) === 1 !== T && (P = r.neg(P)), { x: B, y: P };
    } else if (A === k && v === 4) {
      const B = r.BYTES, $ = r.fromBytes(E.subarray(0, B)), P = r.fromBytes(E.subarray(B, B * 2));
      if (!y($, P))
        throw new Error("bad point: is not on curve");
      return { x: $, y: P };
    } else
      throw new Error(`bad point: got length ${A}, expected compressed=${w} or uncompressed=${k}`);
  }
  const b = t.toBytes === void 0 ? h : t.toBytes, g = t.fromBytes === void 0 ? f : t.fromBytes;
  function p(z) {
    const w = r.sqr(z), k = r.mul(w, z);
    return r.add(r.add(k, r.mul(z, o.a)), o.b);
  }
  function y(z, w) {
    const k = r.sqr(w), A = p(z);
    return r.eql(k, A);
  }
  if (!y(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const x = r.mul(r.pow(o.a, dr), zp), _ = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(x, _)))
    throw new Error("bad curve params: a or b");
  function I(z, w, k = !1) {
    if (!r.isValid(w) || k && r.is0(w))
      throw new Error(`bad point coordinate ${z}`);
    return w;
  }
  function S(z) {
    if (!(z instanceof R))
      throw new Error("Weierstrass Point expected");
  }
  function O(z) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return Rp(z, c.basises, i.ORDER);
  }
  function L(z, w, k, A, v) {
    return k = new R(r.mul(k.X, z), k.Y, k.Z), w = Tr(A, w), k = Tr(v, k), w.add(k);
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
    constructor(w, k, A) {
      this.X = I("x", w), this.Y = I("y", k, !0), this.Z = I("z", A), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(w) {
      const { x: k, y: A } = w || {};
      if (!w || !r.isValid(k) || !r.isValid(A))
        throw new Error("invalid affine point");
      if (w instanceof R)
        throw new Error("projective point not allowed");
      return r.is0(k) && r.is0(A) ? R.ZERO : new R(k, A, r.ONE);
    }
    static fromBytes(w) {
      const k = R.fromAffine(g(q(w, void 0, "point")));
      return k.assertValidity(), k;
    }
    static fromHex(w) {
      return R.fromBytes(Hn(w));
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
    precompute(w = 8, k = !0) {
      return j.createCache(this, w), k || this.multiply(dr), this;
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
      const { x: k, y: A } = w.toAffine();
      if (!r.isValid(k) || !r.isValid(A))
        throw new Error("bad point: x or y not field elements");
      if (!y(k, A))
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
      S(w);
      const { X: k, Y: A, Z: v } = this, { X: E, Y: B, Z: $ } = w, P = r.eql(r.mul(k, $), r.mul(E, v)), T = r.eql(r.mul(A, $), r.mul(B, v));
      return P && T;
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
      const { a: w, b: k } = o, A = r.mul(k, dr), { X: v, Y: E, Z: B } = this;
      let $ = r.ZERO, P = r.ZERO, T = r.ZERO, C = r.mul(v, v), H = r.mul(E, E), V = r.mul(B, B), N = r.mul(v, E);
      return N = r.add(N, N), T = r.mul(v, B), T = r.add(T, T), $ = r.mul(w, T), P = r.mul(A, V), P = r.add($, P), $ = r.sub(H, P), P = r.add(H, P), P = r.mul($, P), $ = r.mul(N, $), T = r.mul(A, T), V = r.mul(w, V), N = r.sub(C, V), N = r.mul(w, N), N = r.add(N, T), T = r.add(C, C), C = r.add(T, C), C = r.add(C, V), C = r.mul(C, N), P = r.add(P, C), V = r.mul(E, B), V = r.add(V, V), C = r.mul(V, N), $ = r.sub($, C), T = r.mul(V, H), T = r.add(T, T), T = r.add(T, T), new R($, P, T);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(w) {
      S(w);
      const { X: k, Y: A, Z: v } = this, { X: E, Y: B, Z: $ } = w;
      let P = r.ZERO, T = r.ZERO, C = r.ZERO;
      const H = o.a, V = r.mul(o.b, dr);
      let N = r.mul(k, E), ee = r.mul(A, B), te = r.mul(v, $), ne = r.add(k, A), Y = r.add(E, B);
      ne = r.mul(ne, Y), Y = r.add(N, ee), ne = r.sub(ne, Y), Y = r.add(k, v);
      let he = r.add(E, $);
      return Y = r.mul(Y, he), he = r.add(N, te), Y = r.sub(Y, he), he = r.add(A, v), P = r.add(B, $), he = r.mul(he, P), P = r.add(ee, te), he = r.sub(he, P), C = r.mul(H, Y), P = r.mul(V, te), C = r.add(P, C), P = r.sub(ee, C), C = r.add(ee, C), T = r.mul(P, C), ee = r.add(N, N), ee = r.add(ee, N), te = r.mul(H, te), Y = r.mul(V, Y), ee = r.add(ee, te), te = r.sub(N, te), te = r.mul(H, te), Y = r.add(Y, te), N = r.mul(ee, Y), T = r.add(T, N), N = r.mul(he, Y), P = r.mul(ne, P), P = r.sub(P, N), N = r.mul(ne, ee), C = r.mul(he, C), C = r.add(C, N), new R(P, T, C);
    }
    subtract(w) {
      return S(w), this.add(w.negate());
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
      const { endo: k } = t;
      if (!i.isValidNot0(w))
        throw new RangeError("invalid scalar: out of range");
      let A, v;
      const E = (B) => j.cached(this, B, ($) => Ln(R, $));
      if (k) {
        const { k1neg: B, k1: $, k2neg: P, k2: T } = O(w), { p: C, f: H } = E($), { p: V, f: N } = E(T);
        v = H.add(N), A = L(k.beta, C, V, B, P);
      } else {
        const { p: B, f: $ } = E(w);
        A = B, v = $;
      }
      return Ln(R, [A, v])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(w) {
      const { endo: k } = t, A = this, v = w;
      if (!i.isValid(v))
        throw new RangeError("invalid scalar: out of range");
      if (v === We || A.is0())
        return R.ZERO;
      if (v === kt)
        return A;
      if (j.hasCache(this))
        return this.multiply(v);
      if (k) {
        const { k1neg: E, k1: B, k2neg: $, k2: P } = O(v), { p1: T, p2: C } = bp(R, A, B, P);
        return L(k.beta, T, C, E, $);
      } else
        return j.unsafe(A, v);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(w) {
      const k = this;
      let A = w;
      const { X: v, Y: E, Z: B } = k;
      if (r.eql(B, r.ONE))
        return { x: v, y: E };
      const $ = k.is0();
      A == null && (A = $ ? r.ONE : r.inv(B));
      const P = r.mul(v, A), T = r.mul(E, A), C = r.mul(B, A);
      if ($)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(C, r.ONE))
        throw new Error("invZ was invalid");
      return { x: P, y: T };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: w } = t;
      return s === kt ? !0 : w ? w(R, this) : j.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: w } = t;
      return s === kt ? this : w ? w(R, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === kt ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(w = !0) {
      return It(w, "isCompressed"), this.assertValidity(), b(R, this, w);
    }
    toHex(w = !0) {
      return X(this.toBytes(w));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const U = i.BITS, j = new wc(R, t.endo ? Math.ceil(U / 2) : U);
  return U >= 8 && R.BASE.precompute(8), Object.freeze(R.prototype), Object.freeze(R), R;
}
function Sc(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function kc(e, t) {
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
function Hp(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? uo : t.randomBytes, i = Object.assign(kc(e.Fp, n), {
    seed: Math.max(hc(n.ORDER), 16)
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
    const { publicKey: g, publicKeyUncompressed: p } = i;
    try {
      const y = f.length;
      return b === !0 && y !== g || b === !1 && y !== p ? !1 : !!e.fromBytes(f);
    } catch {
      return !1;
    }
  }
  function a(f) {
    return f = f === void 0 ? r(i.seed) : f, yc(q(f, i.seed, "seed"), n.ORDER);
  }
  function c(f, b = !0) {
    return e.BASE.multiply(n.fromBytes(f)).toBytes(b);
  }
  function u(f) {
    const { secretKey: b, publicKey: g, publicKeyUncompressed: p } = i, y = n._lengths;
    if (!co(f))
      return;
    const x = q(f, void 0, "key").length, _ = x === g || x === p, I = x === b || !!y?.includes(x);
    if (!(_ && I))
      return _;
  }
  function l(f, b, g = !0) {
    if (u(f) === !0)
      throw new Error("first arg must be private key");
    if (u(b) === !1)
      throw new Error("second arg must be public key");
    const p = n.fromBytes(f);
    return e.fromBytes(b).multiply(p).toBytes(g);
  }
  const d = {
    isValidSecretKey: o,
    isValidPublicKey: s,
    randomSecretKey: a
  }, h = go(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: l, keygen: h, Point: e, utils: d, lengths: i });
}
function Mp(e, t, n = {}) {
  const r = t;
  Xa(r), pn(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? uo : n.randomBytes, o = n.hmac === void 0 ? (v, E) => Lp(r, v, E) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: u } = a, { keygen: l, getPublicKey: d, getSharedSecret: h, utils: f, lengths: b } = Hp(e, n), g = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * Ec + kt < s.ORDER;
  function y(v) {
    const E = c >> kt;
    return v > E;
  }
  function x(v, E) {
    if (!a.isValidNot0(E))
      throw new Error(`invalid signature ${v}: out of range 1..Point.Fn.ORDER`);
    return E;
  }
  function _() {
    if (p)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function I(v, E) {
    Hi(E);
    const B = b.signature, $ = E === "compact" ? B : E === "recovered" ? B + 1 : void 0;
    return q(v, $);
  }
  class S {
    r;
    s;
    recovery;
    constructor(E, B, $) {
      if (this.r = x("r", E), this.s = x("s", B), $ != null) {
        if (_(), ![0, 1, 2, 3].includes($))
          throw new Error("invalid recovery id");
        this.recovery = $;
      }
      Object.freeze(this);
    }
    static fromBytes(E, B = g.format) {
      I(E, B);
      let $;
      if (B === "der") {
        const { r: H, s: V } = Le.toSig(q(E));
        return new S(H, V);
      }
      B === "recovered" && ($ = E[0], B = "compact", E = E.subarray(1));
      const P = b.signature / 2, T = E.subarray(0, P), C = E.subarray(P, P * 2);
      return new S(a.fromBytes(T), a.fromBytes(C), $);
    }
    static fromHex(E, B) {
      return this.fromBytes(Hn(E), B);
    }
    assertRecovery() {
      const { recovery: E } = this;
      if (E == null)
        throw new Error("invalid recovery id: must be present");
      return E;
    }
    addRecoveryBit(E) {
      return new S(this.r, this.s, E);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(E) {
      const { r: B, s: $ } = this, P = this.assertRecovery(), T = P === 2 || P === 3 ? B + c : B;
      if (!s.isValid(T))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const C = s.toBytes(T), H = e.fromBytes(Pe(Sc((P & 1) === 0), C)), V = a.inv(T), N = L(q(E, void 0, "msgHash")), ee = a.create(-N * V), te = a.create($ * V), ne = e.BASE.multiplyUnsafe(ee).add(H.multiplyUnsafe(te));
      if (ne.is0())
        throw new Error("invalid recovery: point at infinify");
      return ne.assertValidity(), ne;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return y(this.s);
    }
    toBytes(E = g.format) {
      if (Hi(E), E === "der")
        return Hn(Le.hexFromSig(this));
      const { r: B, s: $ } = this, P = a.toBytes(B), T = a.toBytes($);
      return E === "recovered" ? (_(), Pe(Uint8Array.of(this.assertRecovery()), P, T)) : Pe(P, T);
    }
    toHex(E) {
      return X(this.toBytes(E));
    }
  }
  Object.freeze(S.prototype), Object.freeze(S);
  const O = n.bits2int === void 0 ? function(E) {
    if (E.length > 8192)
      throw new Error("input is too large");
    const B = Jn(E), $ = E.length * 8 - u;
    return $ > 0 ? B >> BigInt($) : B;
  } : n.bits2int, L = n.bits2int_modN === void 0 ? function(E) {
    return a.create(O(E));
  } : n.bits2int_modN, R = ho(u);
  function U(v) {
    return Or("num < 2^" + u, v, We, R), a.toBytes(v);
  }
  function j(v, E) {
    return q(v, void 0, "message"), E ? q(r(v), void 0, "prehashed message") : v;
  }
  function z(v, E, B) {
    const { lowS: $, prehash: P, extraEntropy: T } = xi(B, g);
    v = j(v, P);
    const C = L(v), H = a.fromBytes(E);
    if (!a.isValidNot0(H))
      throw new Error("invalid private key");
    const V = [U(H), U(C)];
    if (T != null && T !== !1) {
      const ne = T === !0 ? i(b.secretKey) : T;
      V.push(q(ne, void 0, "extraEntropy"));
    }
    const N = Pe(...V), ee = C;
    function te(ne) {
      const Y = O(ne);
      if (!a.isValidNot0(Y))
        return;
      const he = a.inv(Y), nt = e.BASE.multiply(Y).toAffine(), $t = a.create(nt.x);
      if ($t === We)
        return;
      const qt = a.create(he * a.create(ee + $t * H));
      if (qt === We)
        return;
      let wn = (nt.x === $t ? 0 : 2) | Number(nt.y & kt), mn = qt;
      return $ && y(qt) && (mn = a.neg(qt), wn ^= 1), new S($t, mn, p ? void 0 : wn);
    }
    return { seed: N, k2sig: te };
  }
  function w(v, E, B = {}) {
    const { seed: $, k2sig: P } = z(v, E, B);
    return ap(r.outputLen, a.BYTES, o)($, P).toBytes(B.format);
  }
  function k(v, E, B, $ = {}) {
    const { lowS: P, prehash: T, format: C } = xi($, g);
    if (B = q(B, void 0, "publicKey"), E = j(E, T), !co(v)) {
      const H = v instanceof S ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + H);
    }
    I(v, C);
    try {
      const H = S.fromBytes(v, C), V = e.fromBytes(B);
      if (P && H.hasHighS())
        return !1;
      const { r: N, s: ee } = H, te = L(E), ne = a.inv(ee), Y = a.create(te * ne), he = a.create(N * ne), nt = e.BASE.multiplyUnsafe(Y).add(V.multiplyUnsafe(he));
      return nt.is0() ? !1 : a.create(nt.x) === N;
    } catch {
      return !1;
    }
  }
  function A(v, E, B = {}) {
    const { prehash: $ } = xi(B, g);
    return E = j(E, $), S.fromBytes(v, "recovered").recoverPublicKey(E).toBytes();
  }
  return Object.freeze({
    keygen: l,
    getPublicKey: d,
    getSharedSecret: h,
    utils: f,
    lengths: b,
    Point: e,
    sign: w,
    verify: k,
    recoverPublicKey: A,
    Signature: S,
    hash: r
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Jr = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Np = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Fp = /* @__PURE__ */ BigInt(0), Mi = /* @__PURE__ */ BigInt(2);
function Kp(e) {
  const t = Jr.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), u = e * e * e % t, l = u * u * e % t, d = re(l, n, t) * l % t, h = re(d, n, t) * l % t, f = re(h, Mi, t) * u % t, b = re(f, i, t) * f % t, g = re(b, o, t) * b % t, p = re(g, a, t) * g % t, y = re(p, c, t) * p % t, x = re(y, a, t) * g % t, _ = re(x, n, t) * l % t, I = re(_, s, t) * b % t, S = re(I, r, t) * u % t, O = re(S, Mi, t);
  if (!Rr.eql(Rr.sqr(O), e))
    throw new Error("Cannot find square root");
  return O;
}
const Rr = Yr(Jr.p, { sqrt: Kp }), Kt = /* @__PURE__ */ Up(Jr, {
  Fp: Rr,
  endo: Np
}), Se = /* @__PURE__ */ Mp(Kt, ce), Ks = {};
function Cr(e, ...t) {
  let n = Ks[e];
  if (n === void 0) {
    const r = ce(op(e));
    n = Pe(r, r), Ks[e] = n;
  }
  return ce(Pe(n, ...t));
}
const Qr = (e) => e.toBytes(!0).slice(1), ei = (e) => e % Mi === Fp;
function Ac(e) {
  const { Fn: t, BASE: n } = Kt, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: ei(i.y) ? r : t.neg(r), bytes: Qr(i) };
}
function _c(e) {
  const t = Rr;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  ei(i) || (i = t.neg(i));
  const o = Kt.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const tn = Jn;
function Ic(...e) {
  return Kt.Fn.create(tn(Cr("BIP0340/challenge", ...e)));
}
function js(e) {
  return Ac(e).bytes;
}
function jp(e, t, n = so(32)) {
  const { Fn: r, BASE: i } = Kt, o = q(e, void 0, "message"), { bytes: s, scalar: a } = Ac(t), c = q(n, 32, "auxRand"), u = r.toBytes(a ^ tn(Cr("BIP0340/aux", c))), l = Cr("BIP0340/nonce", u, s, o), d = r.create(tn(l));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const h = i.multiply(d), f = ei(h.y) ? d : r.neg(d), b = Qr(h), g = Ic(b, s, o), p = new Uint8Array(64);
  if (p.set(b, 0), p.set(r.toBytes(r.create(f + g * a)), 32), !Bc(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function Bc(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = Kt, s = q(e, 64, "signature"), a = q(t, void 0, "message"), c = q(n, 32, "publicKey");
  try {
    const u = _c(tn(c)), l = tn(s.subarray(0, 32));
    if (!r.isValidNot0(l))
      return !1;
    const d = tn(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const h = Ic(i.toBytes(l), Qr(u), a), f = o.multiplyUnsafe(d).add(u.multiplyUnsafe(i.neg(h))), { x: b, y: g } = f.toAffine();
    return !(f.is0() || !ei(g) || b !== l);
  } catch {
    return !1;
  }
}
const Lt = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? so(48) : r, yc(r, Jr.n));
  return Object.freeze({
    keygen: go(n, js),
    getPublicKey: js,
    sign: jp,
    verify: Bc,
    Point: Kt,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: Cr,
      lift_x: _c,
      pointToBytes: Qr
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), Dp = /* @__PURE__ */ Uint8Array.from([
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
]), Pc = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), qp = Pc.map((e) => (9 * e + 5) % 16), $c = /* @__PURE__ */ (() => {
  const n = [[Pc], [qp]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Dp[o]));
  return n;
})(), Oc = $c[0], Tc = $c[1], Lc = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Vp = /* @__PURE__ */ Oc.map((e, t) => e.map((n) => Lc[t][n])), Gp = /* @__PURE__ */ Tc.map((e, t) => e.map((n) => Lc[t][n])), Wp = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Zp = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Ds(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const fr = /* @__PURE__ */ new Uint32Array(16);
class Xp extends ao {
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
      fr[f] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, u = this.h3 | 0, l = u, d = this.h4 | 0, h = d;
    for (let f = 0; f < 5; f++) {
      const b = 4 - f, g = Wp[f], p = Zp[f], y = Oc[f], x = Tc[f], _ = Vp[f], I = Gp[f];
      for (let S = 0; S < 16; S++) {
        const O = sr(r + Ds(f, o, a, u) + fr[y[S]] + g, _[S]) + d | 0;
        r = d, d = u, u = sr(a, 10) | 0, a = o, o = O;
      }
      for (let S = 0; S < 16; S++) {
        const O = sr(i + Ds(b, s, c, l) + fr[x[S]] + p, I[S]) + h | 0;
        i = h, h = l, l = sr(c, 10) | 0, c = s, s = O;
      }
    }
    this.set(this.h1 + a + l | 0, this.h2 + u + h | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    Qe(fr);
  }
  destroy() {
    this.destroyed = !0, Qe(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Rc = /* @__PURE__ */ Xr(() => new Xp()), Yp = BigInt(0), vn = BigInt(1), Jp = BigInt(2), Qp = BigInt(7), eh = BigInt(256), th = BigInt(113), Cc = [], zc = [], Uc = [];
for (let e = 0, t = vn, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Cc.push(2 * (5 * r + n)), zc.push((e + 1) * (e + 2) / 2 % 64);
  let i = Yp;
  for (let o = 0; o < 7; o++)
    t = (t << vn ^ (t >> Qp) * th) % eh, t & Jp && (i ^= vn << (vn << BigInt(o)) - vn);
  Uc.push(i);
}
const Hc = Qa(Uc, !0), nh = Hc[0], rh = Hc[1], qs = (e, t, n) => n > 32 ? Kf(e, t, n) : Nf(e, t, n), Vs = (e, t, n) => n > 32 ? jf(e, t, n) : Ff(e, t, n);
function ih(e, t = 24) {
  if (Ye(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = qs(u, l, 1) ^ n[a], h = Vs(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = zc[s], c = qs(i, o, a), u = Vs(i, o, a), l = Cc[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], u = e[s + 2], l = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & u, e[s + 9] ^= ~c & l;
    }
    e[0] ^= nh[r], e[1] ^= rh[r];
  }
  Qe(n);
}
let oh = class Mc {
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
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, Ye(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Of(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    As(this.state32), ih(this.state32, this.rounds), As(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    on(this), Je(t);
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
    on(this, !1), Je(t), this.finish();
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
    return Ye(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (ro(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, Qe(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new Mc(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const sh = (e, t, n, r = {}) => Xr(() => new oh(t, e, n), r), Nc = /* @__PURE__ */ sh(1, 136, 32), ah = 1024 * 1024, Fc = Object.getPrototypeOf(Uint8Array.prototype);
Object.getOwnPropertyDescriptor(Fc, Symbol.toStringTag).get;
Object.getOwnPropertyDescriptor(Fc, "byteLength").get;
function ch(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("exact message byte length is invalid");
  if (e > ah) throw new Error("exact message exceeds the 1 MiB decoded limit");
}
function uh(e) {
  const t = e.startsWith("0x") ? 2 : 0;
  ch(Math.ceil((e.length - t) / 2));
}
const lh = "hpke-x25519-hkdfsha256-aes256gcm-v1", dh = "avault:blind-box:v1", fh = "avault:blind-box:aad:v1", zr = "machine-aesgcm-v1", ti = 1, ni = "ecdsa-secp256k1-recoverable", Nn = "ed25519", bo = "ecdsa-secp256k1-der", wo = "schnorr-secp256k1-bip340", Fn = "schnorr-secp256k1-bip341-keypath", de = 32, Ur = 12, ri = 32, ph = "avault:protected-vmk:kek-passkey:v1", hh = /^[A-Za-z_][A-Za-z0-9_]*$/, yh = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, gh = "avault:protected-root-meta:v1", bh = new TextEncoder(), wh = new TextDecoder();
function mo(e) {
  switch (e) {
    case Nn:
    case ni:
    case bo:
    case wo:
    case Fn:
      return e;
    default:
      throw new Error("unsupported signing scheme");
  }
}
function hn(e) {
  if (e === void 0 || e === "secp256k1") return "secp256k1";
  if (e === "ed25519") return e;
  throw new Error("unsupported signing curve");
}
function xo(e) {
  if (mo(e), e === Nn) throw new Error("Ed25519 requires exact-message signing, not a digest");
}
function se(e, t = "bytes") {
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
  const t = se(e), n = new ArrayBuffer(t.byteLength);
  return new Uint8Array(n).set(t), t.fill(0), n;
}
function me(e) {
  return bh.encode(e);
}
function Hr(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Hr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Hr(t[n])}`).join(",")}}`;
}
function Nt(e) {
  const t = new Uint8Array(e);
  return crypto.getRandomValues(t), t;
}
function J(e) {
  const t = se(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return t.fill(0), btoa(n);
}
function fe(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Uint8Array.from(atob(n), (r) => r.charCodeAt(0));
}
function ze(e) {
  return Hn(e.startsWith("0x") ? e.slice(2) : e);
}
function Gs(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? ze(e) : fe(e);
}
function mh(e) {
  return X(se(e));
}
function Kc(e, t = "bytes") {
  return se(e, t);
}
function be(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function Ue(e) {
  e && new Uint8Array(e).fill(0);
}
async function Mr(e, t, n, r) {
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
    Ue(i), Ue(o), Ue(s), Ue(a);
  }
}
async function ii(e, t, n, r) {
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
    Ue(i), Ue(o), Ue(s), Ue(a);
  }
}
async function xh(e, t, n, r) {
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
    Ue(i), Ue(o), Ue(s);
  }
}
async function jc(e, t) {
  const n = se(e, "passkey PRF output");
  try {
    const r = se(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return be(r, ri, "passkey PRF salt"), await xh(n, r, me(ph), de);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function vh() {
  return Nt(de);
}
function Eh() {
  return Nt(ri);
}
function Sh(e) {
  const t = se(e, "passkey PRF salt");
  try {
    return be(t, ri, "passkey PRF salt"), { prf: { eval: { first: Ie(t) } } };
  } finally {
    t.fill(0);
  }
}
function et(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== ti || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function kh(e, t) {
  const n = se(e, "VMK"), r = Nt(Ur);
  let i, o;
  try {
    be(n, de, "VMK"), o = se(t.prfSalt, "passkey PRF salt"), be(o, ri, "passkey PRF salt"), i = await jc(t.prfOutput, o);
    const s = await Mr(i, r, n);
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
async function Ah(e, t) {
  const n = se(e, "VMK");
  try {
    if (be(n, de, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await kh(n, i));
    return JSON.stringify({ v: ti, copies: r });
  } finally {
    n.fill(0);
  }
}
async function _h(e, t) {
  const n = fe(e.prf_salt);
  if (t.prfSalt && J(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await jc(t.prfOutput, n);
  try {
    return await ii(r, fe(e.nonce), fe(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function Ih(e, t) {
  const n = et(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await _h(r, t);
        try {
          return be(i, de, "VMK"), i;
        } catch (o) {
          throw i.fill(0), o;
        }
      }
    } catch {
    }
  throw new Error("no protected VMK copy could be unwrapped");
}
function vo(e) {
  return et(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: fe(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function Bh(e, t) {
  const n = et(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Dc(e) {
  const t = et(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function Eo(e) {
  if (!e.kind) {
    if (e.curve !== void 0) throw new Error("protected record curve requires keypair metadata");
    return;
  }
  const t = hn(e.curve);
  if (e.kind === "static") {
    if (e.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (e.kind === "keypair") {
    if (typeof e.publicKey != "string" || e.publicKey.length === 0)
      throw new Error("keypair protected record requires a public key");
    return t === "ed25519" && Qc(e.publicKey), {
      kind: "keypair",
      public_key: e.publicKey.toLowerCase(),
      ...t === "ed25519" ? { curve: t } : {}
    };
  }
  throw new Error("unsupported protected record kind");
}
function Ph(e) {
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
    return Eo({ kind: "keypair", publicKey: t.public_key, curve: t.curve });
  throw new Error("protected record metadata kind is invalid");
}
function So(e, t) {
  return {
    name: e,
    ...t ? { kind: t.kind } : {},
    ...t?.public_key ? { publicKey: t.public_key } : {},
    ...t?.curve ? { curve: t.curve } : {}
  };
}
function ko(e) {
  return me(
    Hr({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" ? Yc(e.name) : un(e.name),
      scheme: e.scheme ?? zr,
      version: e.version ?? ti,
      record: Eo(e) ?? null
    })
  );
}
async function qc(e, t, n) {
  const r = se(t, "VMK"), i = Nt(de);
  let o;
  try {
    be(r, de, "VMK"), o = se(e, "value");
    const s = ko(n), a = Nt(Ur), c = await Mr(i, a, o, s), u = Nt(Ur), l = await Mr(r, u, i, s);
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
async function Vc(e, t, n) {
  const r = se(t, "VMK");
  try {
    be(r, de, "VMK");
    const i = await ii(
      r,
      fe(e.dek_nonce),
      fe(e.wrapped_dek),
      ko(n)
    );
    try {
      return be(i, de, "DEK"), i;
    } catch (o) {
      throw i.fill(0), o;
    }
  } finally {
    r.fill(0);
  }
}
async function Gc(e, t, n) {
  const r = await Vc(e, t, n);
  try {
    return await ii(
      r,
      fe(e.nonce),
      fe(e.ciphertext),
      ko(n)
    );
  } finally {
    r.fill(0);
  }
}
function Wc(e, t, n) {
  const r = et(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== zr)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? Eo(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: zr,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function cn(e) {
  const t = et(e.wrap_meta), { dek_nonce: n, wrapped_dek: r, record_meta: i, ...o } = t;
  if (typeof n != "string" || typeof r != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const s = Ph(i);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: n, wrapped_dek: r },
    vmkWrapMeta: JSON.stringify(o),
    ...s ? { recordMetadata: s } : {}
  };
}
function Zc(e) {
  const t = { ...et(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, me(Hr({ domain: gh, vault: t }));
}
async function $h(e, t, n) {
  const r = Nt(Ur), i = me(JSON.stringify(t));
  try {
    const o = await Mr(e, r, i, Zc(n));
    return { v: 1, nonce: J(r), ciphertext: J(o) };
  } finally {
    i.fill(0);
  }
}
async function Ao(e, t) {
  const n = et(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await ii(t, fe(n.nonce), fe(n.ciphertext), Zc(e));
  try {
    const i = JSON.parse(wh.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function Oh(e, t) {
  const n = et(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function Th() {
  return new xf({
    kem: new $f(),
    kdf: new vf(),
    aead: new tf()
  });
}
function _o(e) {
  return fe(typeof e == "string" ? e : e.public_key);
}
async function Xc(e) {
  const t = await crypto.subtle.digest("SHA-256", Ie(e));
  return X(new Uint8Array(t));
}
async function Lh(e) {
  return Xc(_o(e));
}
function Rh(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function Ch(e) {
  const t = Rh(e), n = _o(t);
  if (be(n, de, "avault public key"), await Xc(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function zh(e, t, n) {
  const r = Th(), i = _o(t);
  if (be(i, de, "avault public key"), typeof t != "string" && t.fingerprint && await Lh(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? me(e) : se(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: me(dh) },
      s,
      Dh(n)
    );
    return {
      scheme: lh,
      enc: J(new Uint8Array(a.enc)),
      ct: J(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function Yc(e) {
  if (typeof e != "string" || !hh.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function un(e) {
  if (typeof e != "string" || !yh.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function Ws(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function Io(e) {
  const t = typeof e == "string" ? ze(e) : se(e, "digest");
  return be(t, de, "digest"), t;
}
function Uh(e) {
  const t = typeof e == "string" ? ze(e) : se(e, "private key");
  try {
    if (be(t, de, "private key"), !Se.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function Ni(e, t) {
  return typeof e == "string" ? ze(e) : se(e, t);
}
function Nr(e) {
  const t = Ni(e, "operation hash");
  return be(t, de, "operation hash"), t;
}
function Fr(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function Jc(e, t) {
  const n = Fr(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function Hh(e) {
  return Jc(e, "approval expiry");
}
function Zs(e) {
  const t = se(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: Fr(e.expiresAtUnix, "approval expiry") };
}
function Be(e, t) {
  const n = se(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function Mh(e) {
  switch (e.purpose) {
    case "seal":
      return Nh(e.name);
    case "agent-deliver": {
      const t = Zs({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: un(e.name),
        grantId: Ws(e.grantId, "grant id"),
        ttlSecs: Fr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Nr(e.operationHash)
      };
    }
    case "agent-sign": {
      xo(e.signScheme);
      const t = Zs({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: Yc(e.name),
        grantId: Ws(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: Io(e.digest),
        ttlSecs: Fr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Nr(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function Nh(e) {
  return { purpose: "seal", name: un(e) };
}
async function Fh(e) {
  const t = Nr(e.operationHash), n = await jh(e.name, e.ttlSecs);
  if (X(t) !== X(n))
    throw new Error("operation hash does not match release operation fields");
}
async function Kh(e) {
  const t = [];
  for (const n of e)
    Be(t, typeof n == "string" ? me(n) : se(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function jh(e, t) {
  return Kh(["agent-deliver", un(e), Jc(t, "ttl seconds")]);
}
function Dh(e) {
  const t = Mh(e), n = [...me(fh)];
  return Be(n, me(t.purpose)), Be(n, me(t.name)), Be(n, me(zr)), Be(n, new Uint8Array([ti])), Be(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? me(t.grantId) : new Uint8Array()), Be(n, new Uint8Array()), Be(n, t.purpose === "agent-sign" ? me(t.signScheme) : new Uint8Array()), Be(n, t.purpose === "agent-sign" ? Io(t.digest) : new Uint8Array()), Be(n, t.purpose === "seal" ? new Uint8Array() : se(t.approvalNonce, "approval nonce")), Be(n, t.purpose === "seal" ? new Uint8Array() : Hh(t.approvalExpiresAtUnix)), Be(n, t.purpose === "seal" ? new Uint8Array() : Nr(t.operationHash)), new Uint8Array(n);
}
async function qh(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (un(r.name) !== un(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await Fh(i);
  const o = await Ch(n), s = await Vc(e, t, r);
  try {
    return await zh(s, o, i);
  } finally {
    s.fill(0);
  }
}
function Vh(e = "secp256k1") {
  if (hn(e) === "ed25519") {
    const n = Lr.utils.randomSecretKey();
    try {
      return { privateKey: n, publicKey: X(Lr.getPublicKey(n)) };
    } catch (r) {
      throw n.fill(0), r;
    }
  }
  const t = Se.utils.randomSecretKey();
  return { privateKey: t, publicKey: X(Se.getPublicKey(t, !0)) };
}
function Xs(e) {
  return ze(e.toString(16).padStart(de * 2, "0"));
}
function Gh(e, t, n, r = {}) {
  if (xo(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = Uh(e);
  let o;
  try {
    const s = Io(t);
    if (n === ni) {
      const a = Se.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: X(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === bo)
      return {
        scheme: n,
        signature: X(Se.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === wo) {
      o = r.schnorrAuxRand !== void 0 ? Ni(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(de)), be(o, de, "schnorr aux randomness");
      const a = Lt.sign(s, i, o);
      if (!Lt.verify(a, s, Lt.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: X(a), recovery_id: null };
    }
    if (n === Fn) {
      const a = Se.getPublicKey(i, !0), c = Bo(a.slice(1));
      let u = BigInt(`0x${X(i)}`);
      a[0] === 3 && (u = Pn - u);
      const l = BigInt(`0x${X(Lt.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (l >= Pn) throw new Error("invalid taproot tweak");
      let d = (u + l) % Pn;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let h = Xs(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = Pn - d, h.fill(0), h = Xs(d)), o = r.schnorrAuxRand !== void 0 ? Ni(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(de)), be(o, de, "schnorr aux randomness");
        const f = Lt.sign(s, h, o);
        if (!Lt.verify(f, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
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
async function Wh(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  if (xo(i), hn(n.curve) !== "secp256k1") throw new Error("digest signing requires a secp256k1 protected record");
  const s = await Gc(e, t, n);
  try {
    if (X(Se.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Gh(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function Qc(e) {
  if (!/^[0-9a-fA-F]{64}$/.test(e)) throw new Error("expected a 32-byte Ed25519 public key");
  const t = ze(e);
  if (!Lr.utils.isValidPublicKey(t, !1)) throw new Error("invalid Ed25519 public key");
  return t;
}
function Zh(e) {
  return tu(Qc(e));
}
function Xh(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return Lr.verify(Gs(e.signature), me(e.message), Gs(t.publicKey));
}
function eu(e) {
  const t = ze(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && Se.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && Se.utils.isValidPublicKey(t))
    return Se.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const Yh = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", Jh = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", Qh = 1, ey = 734539939, Pn = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function ty(e) {
  return Rc(ce(e));
}
function ny(e) {
  const t = ce(ce(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  return n.set(e), n.set(t, e.length), tu(n);
}
function tu(e) {
  let t = BigInt(`0x${X(e)}`), n = "";
  for (; t > 0n; ) {
    const i = Number(t % 58n);
    t /= 58n, n = Yh[i] + n;
  }
  let r = 0;
  for (const i of e) {
    if (i !== 0) break;
    r += 1;
  }
  return "1".repeat(r) + n;
}
function ry(e) {
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
function iy(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function oy(e, t, n) {
  const r = iy(e).concat(t), i = ry(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function sy(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function Ys(e, t, n) {
  const r = t === 0 ? Qh : ey, i = [t].concat(sy(n, 8, 5));
  return `${e}1${i.concat(oy(e, i, r)).map((o) => Jh[o]).join("")}`;
}
function ay(e) {
  const t = e.toLowerCase(), n = X(Nc(me(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function Bo(e) {
  const t = BigInt(`0x${X(Lt.utils.taggedHash("TapTweak", e))}`);
  if (t >= Pn) throw new Error("invalid taproot tweak");
  const n = Se.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(Se.Point.BASE.multiply(t));
  if (r.equals(Se.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function cy(e) {
  return Bo(eu(e).slice(1)).toBytes(!0).slice(1);
}
function uy(e) {
  const t = eu(e), n = Se.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = Nc(r), o = ty(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = Bo(a);
  return {
    eth: `0x${ay(X(i.slice(-20)))}`,
    btc_legacy: ny(s),
    btc_segwit: Ys("bc", 0, o),
    btc_taproot: Ys("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const Po = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let Fi = { ...Po };
function ly(e) {
  return e === 300 || e === 600 || e === 1800 ? e : Po.windowSeconds;
}
function dy(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new m("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function $o(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new m("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new m("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: dy(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function fy(e) {
  if (typeof e != "object" || e === null) return { ...Po };
  const t = e;
  return {
    windowSeconds: ly(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function Oo(e) {
  return Fi = fy(e), Fi;
}
function ve() {
  return { ...Fi };
}
const py = "avibe-vault-lock:v1:", K = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let lt = null, Cn = null, Kn = null, Ki = null, To = 0;
const Kr = /* @__PURE__ */ new Set();
let nu = null;
function hy(e) {
  nu = e;
}
function Js() {
  return K.vmk ? "unlocked" : K.wrapMeta ? "locked" : "needs-setup";
}
function ru(e) {
  nu?.({
    state: Js(),
    ...lt !== null && Js() === "unlocked" ? { expiresAt: lt } : {},
    reason: e
  });
}
function Lo() {
  Cn !== null && (clearTimeout(Cn), Cn = null);
}
function jr() {
  Kn?.close(), Kn = null, Ki = null;
}
function iu(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function yy(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function ou(e) {
  const t = et(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? iu(t.vault_user_handle) : `wrap-${yy(e)}`;
}
function gy(e) {
  return iu(e);
}
function su(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    jr();
    return;
  }
  const t = `${py}${e}`;
  Ki !== t && (jr(), Ki = t, Kn = new BroadcastChannel(t), Kn.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && Me({ broadcast: !1, reason: "manual-lock" });
  });
}
function by() {
  K.scopeId && (su(K.scopeId), Kn?.postMessage({ type: "lock", scopeId: K.scopeId }));
}
function au() {
  return new Error("vault-operation-aborted");
}
function cu() {
  To += 1;
  for (const e of Kr)
    e.abort(au());
  Kr.clear();
}
function wy() {
  K.vmk?.fill(0), K.vmk = null, lt = null, Lo(), jr(), K.freshSetup && (K.wrapMeta = null, K.freshSetup = !1, K.scopeId = null);
}
function my() {
  return lt !== null && Date.now() >= lt;
}
function uu() {
  return K.vmk && my() ? (Me({ broadcast: !1, reason: "auto-lock" }), !1) : K.vmk !== null;
}
function lu(e, t = ve()) {
  if (!K.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return lt = Date.now() + n, Lo(), Cn = setTimeout(() => {
    Me({ broadcast: !1, reason: "auto-lock" });
  }, n), ru(e), lt;
}
function xy() {
  const e = lt;
  if (!K.vmk || e === null) return () => {
  };
  Lo();
  let t = !1;
  return () => {
    if (t || !K.vmk) return;
    t = !0;
    const n = e - Date.now();
    if (n <= 0) {
      Me({ broadcast: !1, reason: "auto-lock" });
      return;
    }
    Cn = setTimeout(() => {
      Me({ broadcast: !1, reason: "auto-lock" });
    }, n);
  };
}
function vy(e) {
  if (e instanceof m && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function Ey(e) {
  if (e.signal.aborted || e.epoch !== To || !K.vmk)
    throw au();
}
async function Ro(e, t = {}) {
  if (!uu() || !K.vmk || !K.wrapMeta)
    throw new Error("vault-locked");
  const n = new Uint8Array(K.vmk), r = K.wrapMeta, i = To, o = new AbortController();
  Kr.add(o);
  const s = {
    epoch: i,
    signal: o.signal,
    assertCurrent: () => Ey(s)
  };
  let a = null;
  try {
    s.assertCurrent();
    const c = await e(n, r, s);
    return s.assertCurrent(), t.renewOnSuccess !== !1 && lu("renew"), s.assertCurrent(), t.beforeSuccess && (a = xy(), await t.beforeSuccess(), s.assertCurrent(), a(), a = null), c;
  } catch (c) {
    throw vy(c) || Me({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    a?.(), Kr.delete(o), n.fill(0);
  }
}
function Sy() {
  return K.vmk !== null && K.freshSetup;
}
function du(e) {
  return cu(), K.vmk?.fill(0), K.vmk = e.vmk, K.wrapMeta = e.wrapMeta, K.freshSetup = e.freshSetup, K.scopeId = e.scopeId, su(e.scopeId), { state: "unlocked", expiresAt: lu("unlock", e.policy) };
}
function Me(e = {}) {
  return e.broadcast && by(), cu(), wy(), ru(e.reason ?? "manual-lock"), { state: "locked" };
}
function dt(e) {
  return uu(), K.vmk ? {
    state: "unlocked",
    expiresAt: lt ?? void 0,
    ...K.freshSetup ? { freshSetup: !0 } : {}
  } : (e && (K.wrapMeta = Dc(e), K.scopeId = ou(K.wrapMeta)), K.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function Co(e) {
  const t = Dc(e), n = ou(t);
  return K.wrapMeta = t, K.scopeId = n, { wrapMeta: t, scopeId: n };
}
function ky() {
  Me({ broadcast: !1, reason: "unload" }), jr();
}
const pr = "Avibe Vault", Qs = "avibe-vault";
function Ze(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function At(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function fu() {
  return At(crypto.getRandomValues(new Uint8Array(32)));
}
function Ay(e) {
  try {
    return fe(e);
  } catch {
    return null;
  }
}
function jn(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return At(Kc(e));
  if (typeof e == "string") {
    const n = Ay(e);
    return At(n ?? new TextEncoder().encode(e));
  }
  if (Array.isArray(e))
    return At(Uint8Array.from(e));
  if (t !== void 0)
    return At(new TextEncoder().encode(t));
  throw new Error("webauthn bytes are missing");
}
function _y(e) {
  const t = jn(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function Dr(e) {
  if (Array.isArray(e))
    return e.map((t) => {
      const n = Ze(t);
      if (!n || n.type !== "public-key")
        throw new Error("invalid WebAuthn credential descriptor");
      return {
        type: "public-key",
        id: jn(n.id),
        ...Array.isArray(n.transports) ? { transports: n.transports } : {}
      };
    });
}
function ea(e) {
  return !Array.isArray(e) || e.length === 0 ? [
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 }
  ] : e.map((t) => {
    const n = Ze(t);
    if (!n || n.type !== "public-key" || typeof n.alg != "number")
      throw new Error("invalid WebAuthn pubKeyCredParams");
    return { type: "public-key", alg: n.alg };
  });
}
function ta(e) {
  return {
    ...Ze(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function na(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function Iy(e) {
  const t = Ze(e) ?? {};
  return { ...t, prf: Ze(t.prf) ?? {} };
}
function ft() {
  return window.location.hostname;
}
function By(e) {
  const t = Ze(e.authzCreationOptions), r = Ze(t?.webauthn) ?? t, i = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, o = Ze(r?.rp), s = typeof o?.id == "string" ? o.id : void 0;
  if (s && s !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!r)
    return {
      options: {
        rp: { name: pr, id: e.rpId },
        user: {
          id: _y(e.vaultUserHandle),
          name: e.vaultUserHandle || Qs,
          displayName: e.displayName || pr
        },
        challenge: fu(),
        pubKeyCredParams: ea(void 0),
        authenticatorSelection: ta(void 0),
        extensions: { prf: {} }
      }
    };
  const a = Ze(r.user);
  if (!a) throw new Error("webauthn user is missing");
  return {
    options: {
      rp: {
        name: typeof o?.name == "string" ? o.name : pr,
        id: e.rpId
      },
      user: {
        id: jn(a.id, e.vaultUserHandle),
        name: typeof a.name == "string" ? a.name : e.vaultUserHandle || Qs,
        displayName: typeof a.displayName == "string" ? a.displayName : e.displayName || pr
      },
      challenge: jn(r.challenge),
      pubKeyCredParams: ea(r.pubKeyCredParams),
      authenticatorSelection: ta(r.authenticatorSelection),
      extensions: Iy(r.extensions),
      ...Dr(r.excludeCredentials) ? { excludeCredentials: Dr(r.excludeCredentials) } : {},
      ...typeof r.timeout == "number" ? { timeout: r.timeout } : {},
      ...na(r.attestation) ? { attestation: na(r.attestation) } : {}
    },
    ...i ? { challengeId: i } : {}
  };
}
function Py(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function $y(e, t) {
  const n = Py(e), r = {
    challenge: fu(),
    rpId: t,
    userVerification: "required",
    extensions: Sh(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: At(fe(n.credentialId))
    }
  ]), r;
}
function Oy(e, t, n) {
  const r = {
    challenge: At(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: At(fe(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function Ty(e, t = ft()) {
  const n = Ze(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: jn(n.challenge),
    rpId: t,
    userVerification: "required",
    ...Dr(n.allowCredentials) ? { allowCredentials: Dr(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function pu(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function hu(e) {
  return {
    id: e.id,
    rawId: J(e.rawId),
    type: e.type
  };
}
function Ly(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...hu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      attestationObject: J(t.attestationObject),
      transports: n
    }
  };
}
function Ry(e) {
  const t = e.response;
  return {
    ...hu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      authenticatorData: J(t.authenticatorData),
      signature: J(t.signature),
      userHandle: t.userHandle ? J(t.userHandle) : null
    }
  };
}
function Cy(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = Kc(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function zo(e, t, n) {
  const r = await navigator.credentials.get(
    pu($y(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = Cy(r), o = J(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function zy(e, t, n, r) {
  if (!await navigator.credentials.get(
    pu(Oy(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function Uy(e) {
  const t = await navigator.credentials.get({
    publicKey: Ty(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return Ry(t);
}
const Hy = /ancestor|not the same as its|cross-?origin|different origin/i;
function yu(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function My(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function gu(e) {
  const t = yu(e);
  return t === "SecurityError" || t === "NotSupportedError" || Hy.test(My(e));
}
function Ny(e) {
  return yu(e) === "NotAllowedError" && !gu(e);
}
function Uo(e) {
  const { options: t, challengeId: n } = By(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = J(i.rawId), s = Ly(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const ra = {
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
let qr = "en";
function Fy(e) {
  return e === "zh" ? "zh" : "en";
}
function Ky(e) {
  const t = Fy(e);
  return t === qr ? !1 : (qr = t, !0);
}
function jy() {
  return qr;
}
function Q(e, t = {}) {
  const n = ra[qr], r = ra.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function Dy(e) {
  return JSON.stringify(e ?? {});
}
function ia(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function oa(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = Dy(n), e.textContent = Q(t, n);
}
function Ho(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function qy(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = Q(n, ia(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = Q(n, ia(t.dataset.i18nPlaceholderParams)));
  });
}
let Mo = null;
function Vy(e) {
  Mo = e;
}
function Gy() {
  Mo?.("ui.show");
}
function Wy() {
  Mo?.("ui.hide");
}
function Zy() {
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
function bu(e) {
  e.querySelectorAll(".dynamic").forEach((t) => t.remove());
}
function le(e) {
  return { text: e };
}
function Dn(e, t) {
  return { key: e, params: t };
}
function G(e, t) {
  if (typeof t == "string") {
    oa(e, t);
    return;
  }
  if ("text" in t) {
    Ho(e, t.text);
    return;
  }
  oa(e, t.key, t.params);
}
function No(e, t, n) {
  const r = Zy();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), Gy(), r.card.classList.remove("confirm-card"), G(r.title, e), G(r.subtitle, t), n ? G(r.body, n) : Ho(r.body, ""), bu(r.card), r;
}
function Fo() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), bu(e)), Wy();
}
function en(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function sa(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function Xy(e) {
  const t = document.createElement("div");
  if (t.className = "detail-value", e.variant === "chips") {
    t.classList.add("detail-chips");
    for (const r of e.values) {
      const i = document.createElement("span");
      i.className = `detail-chip${e.tone === "warning" ? " detail-chip-warning" : ""}`, G(i, r), t.append(i);
    }
    return t;
  }
  const n = document.createElement(e.variant === "command" ? "code" : "span");
  return n.className = e.variant === "command" ? "detail-command" : e.variant === "mono" ? "detail-mono" : "detail-text", G(n, e.value), e.variant === "mono" && (n.title = n.textContent ?? ""), t.append(n), t;
}
function Yy(e, t, n) {
  Ho(e, "");
  const r = document.createElement("div");
  r.className = "confirmation-details";
  for (const i of t.rows) {
    const o = document.createElement("div");
    o.className = "detail-row";
    const s = document.createElement("span");
    s.className = "detail-label", G(s, i.label), o.append(s, Xy(i)), r.append(o);
  }
  if (e.append(r), n) {
    const i = document.createElement("p");
    i.className = "confirmation-note", G(i, n), e.append(i);
  }
}
function qn(e) {
  const t = document.createElement("button");
  return t.type = "button", t.className = "action dynamic", G(t, e), t;
}
function wu(e = le("")) {
  const t = document.createElement("p");
  return t.className = "setup-status dynamic", G(t, e), t;
}
let hr = null;
function Ko() {
  return new Error("operation-superseded");
}
function zn(e) {
  const t = e.reason;
  return t instanceof Error ? t : Ko();
}
function aa(e) {
  if (e?.aborted) throw zn(e);
}
function Qn(e) {
  hr?.abort(Ko());
  const t = new AbortController();
  return hr = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    hr === t && (hr = null);
  });
}
async function Jy(e) {
  return Qn(async (t) => {
    aa(t), aa(e.abortSignal);
    const n = new TextDecoder().decode(e.plaintext), r = No("plaintext.title", le(e.name), "plaintext.body"), i = document.createElement("pre");
    i.className = "plaintext dynamic", i.textContent = n;
    const o = qn("common.done"), s = qn("plaintext.copy");
    s.classList.add("secondary");
    const a = wu("plaintext.copyWarning");
    en(r.card, i), en(r.card, a), en(r.card, s), en(r.card, o);
    try {
      await new Promise((c, u) => {
        if (t.aborted) {
          u(zn(t));
          return;
        }
        if (e.abortSignal?.aborted) {
          u(zn(e.abortSignal));
          return;
        }
        let l = !1, d = () => {
        }, h = null, f = null, b = !e.prepareCopy;
        const g = () => {
          h?.abort(Ko());
        }, p = (I) => {
          l || (l = !0, d(), g(), I());
        }, y = (I) => {
          p(() => u(zn(I)));
        }, x = () => y(t), _ = () => {
          e.abortSignal && y(e.abortSignal);
        };
        d = () => {
          t.removeEventListener("abort", x), e.abortSignal?.removeEventListener("abort", _);
        }, t.addEventListener("abort", x, { once: !0 }), e.abortSignal?.addEventListener("abort", _, { once: !0 }), s.addEventListener("click", () => {
          if (f) return;
          if (t.aborted) {
            y(t);
            return;
          }
          if (e.abortSignal?.aborted) {
            y(e.abortSignal);
            return;
          }
          s.disabled = !0;
          const I = new AbortController();
          h = I;
          const S = () => {
            try {
              return Promise.resolve(e.onCopy ? e.onCopy(n, I.signal) : navigator.clipboard.writeText(n));
            } catch (L) {
              return Promise.reject(L);
            }
          }, O = e.prepareCopy && !b ? Promise.resolve(e.prepareCopy(I.signal)).then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (b = !0, G(a, "plaintext.copyReady"), s.disabled = !1);
          }) : S().then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (b = !1), G(a, "plaintext.copiedBody"), s.disabled = !1);
          });
          f = O, O.then(
            () => {
              I.signal.aborted;
            },
            (L) => {
              if (!(I.signal.aborted || l)) {
                if (t.aborted) {
                  y(t);
                  return;
                }
                if (e.abortSignal?.aborted) {
                  y(e.abortSignal);
                  return;
                }
                s.disabled = !1, G(a, "plaintext.copyFailed");
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
      Fo();
    }
  });
}
function jo(e, t, n, r) {
  const i = No(e.title, e.subtitle, e.body);
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.details && Yy(i.body, e.details, e.body);
  const o = qn(e.confirmLabel), s = qn("common.cancel");
  return s.classList.add("secondary"), sa(i.card, s), sa(i.card, o), o.disabled = !0, new Promise((a, c) => {
    let u = !1, l;
    const d = setTimeout(() => {
      try {
        l = n?.(i.card);
      } catch (g) {
        f(() => c(g));
        return;
      }
      (l?.ready ?? Promise.resolve()).then(
        () => {
          !u && !t.aborted && (o.disabled = !1);
        },
        (g) => f(() => c(g))
      );
    }, 500), h = () => {
      f(() => c(zn(t)));
    }, f = (b) => {
      u || (u = !0, clearTimeout(d), l?.dispose(), t.removeEventListener("abort", h), Fo(), b());
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
      } catch (g) {
        f(() => c(g));
        return;
      }
      b.then(
        () => f(a),
        (g) => f(() => c(g))
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
function Vr(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Qy(e) {
  return new Promise((t, n) => {
    const r = () => n(Vr(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function ca(e) {
  if (e?.aborted) throw Vr(e);
}
async function mu(e) {
  const t = Co(e.wrapMeta), n = vo(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      zo(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), Vr(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? Vr(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [Qy(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await xu({
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
async function xu(e) {
  const t = Co(e.wrapMeta);
  let n;
  try {
    ca(e.abortSignal), n = await Ih(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), ca(e.abortSignal);
    const r = du({
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
function eg(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function tg(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function ua(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function ng(e) {
  const t = eg(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new m("invalid_payload", "kind must be static or keypair");
  const r = ua(t.name, "name");
  if (t.rootMetadata !== void 0) throw new m("invalid_payload", "seal cannot set vault root metadata");
  const i = tg(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.curve !== void 0) throw new m("invalid_payload", "static seal cannot carry a curve");
    if (t.inputMode !== "parent-value")
      throw new m("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: ua(t.value, "value"),
      wrapMeta: i
    };
  }
  if (t.inputMode !== void 0)
    throw new m("invalid_payload", "keypair seal is generate-only and does not accept inputMode");
  if (t.value !== void 0)
    throw new m("invalid_payload", "keypair seal cannot accept parent-provided private key material");
  let o;
  try {
    o = hn(t.curve);
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
function Do(e) {
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
const rg = 512, vu = "avibe-vault-signed-context-replay:v2", ig = "avibe-vault-signed-context-replay:v2", og = "avibe-vault-signed-context-replay:v2", He = /* @__PURE__ */ new Map();
let la = !1, $n = null;
function Te(e) {
  return typeof e == "object" && e !== null;
}
function at(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function En(e, t) {
  if (e !== void 0) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function vi(e, t) {
  if (e !== void 0) {
    if (!Array.isArray(e) || !e.every((n) => typeof n == "string"))
      throw new m("invalid_payload", `${t} must be a string array`);
    return e;
  }
}
function sg(e, t) {
  if (e !== "static" && e !== "keypair") throw new m("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function ag(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new m("invalid_payload", "context purpose is invalid");
  return e;
}
function ji(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new m("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function cg(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new m("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function qo(e, t) {
  if (!Te(e)) throw new m(t, "agent delivery context.release must be an object");
  return {
    name: at(e.name, "context.release.name"),
    ttlSecs: ji(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: cg(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: ji(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: at(e.operationHash, "context.release.operationHash")
  };
}
function Bt(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Bt).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Bt(t[n])}`).join(",")}}`;
}
function Vo(e) {
  const t = Te(e) ? e : null;
  if (!t) throw new m("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new m("invalid_payload", "context version must be 2");
  const n = ag(t.purpose);
  at(t.requestId, "context.requestId"), t.grantId !== void 0 && En(t.grantId, "context.grantId");
  const r = Te(t.display) ? t.display : null;
  if (!r) throw new m("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new m("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, u) => {
    if (!Te(c)) throw new m("invalid_payload", `context.display.secrets[${u}] must be an object`);
    at(c.name, `context.display.secrets[${u}].name`), sg(c.kind, `context.display.secrets[${u}].kind`);
  }), r.sessionLabel !== void 0 && En(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && En(r.command, "context.display.command"), r.egress !== void 0 && En(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!Te(i)) throw new m("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && vi(i.env, "context.display.source.env"), i.tags !== void 0 && vi(i.tags, "context.display.source.tags"), i.skills !== void 0 && vi(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && ji(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = Te(t.signature) ? t.signature : null;
  if (!o) throw new m("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new m("invalid_payload", "context signature alg must be ed25519");
  at(o.keyId, "context.signature.keyId"), at(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!Te(s)) throw new m("invalid_payload", "context.agent must be an object");
    const c = Te(s.publicKey) ? s.publicKey : null;
    if (!c) throw new m("invalid_payload", "context.agent.publicKey must be an object");
    at(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && En(c.fingerprint, "context.agent.publicKey.fingerprint"), at(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = qo(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new m("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new m("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !Te(a))
    throw new m("invalid_payload", "context.release must be an object");
  return at(t.expiresAt, "context.expiresAt"), t;
}
function oi(e) {
  const { signature: t, ...n } = e;
  return Bt(n);
}
function Di(e) {
  if (e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", `${e.expectedPurpose} context has the wrong purpose`);
  if (!e.context.display.secrets.some(
    (n) => n.name === e.secret.name && n.kind === e.secret.kind
  )) {
    const n = e.secret.kind === "keypair" ? "key" : "secret";
    throw new m("invalid_context", `${e.expectedPurpose} context does not cover the requested ${n}`);
  }
}
function Gr(e) {
  if (e.expectedPurpose && e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", "signed context purpose does not match operation");
  const t = e.now ?? Date.now(), n = Date.parse(e.context.expiresAt);
  if (!Number.isFinite(n) || n <= t)
    throw new m("context_expired", "signed context is expired", !0);
  if (!Xh({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: oi(e.context)
  })) throw new m("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && qo(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new m("context_expired", "signed release approval is expired", !0);
}
function Go(e) {
  for (const [t, n] of He)
    n <= e && He.delete(t);
}
function ug() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function ln() {
  return typeof window < "u";
}
function Wo() {
  return new m("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function Eu(e) {
  const t = ug();
  if (!t && e && ln()) throw Wo();
  return t;
}
function Su(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!Te(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function Zo(e = Date.now(), t = !1) {
  Go(e);
  const n = Eu(t);
  if (n)
    try {
      n.setItem(vu, JSON.stringify({ version: 2, entries: [...He] }));
    } catch {
      if (t && ln()) throw Wo();
    }
}
function ku(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && He.set(r, Math.max(He.get(r) ?? 0, i));
  n && Zo(t);
}
function Xo() {
  if (!($n || typeof BroadcastChannel > "u"))
    try {
      $n = new BroadcastChannel(ig), $n.addEventListener("message", (e) => {
        const t = Te(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || ku(Su({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      $n = null;
    }
}
function lg(e = Date.now()) {
  la || (Xo(), Au(e, ln()), la = !0);
}
function Au(e = Date.now(), t = !1) {
  Xo();
  const n = Eu(t);
  if (n)
    try {
      ku(Su(JSON.parse(n.getItem(vu) ?? "null"), e), e, !1), Go(e);
    } catch {
      if (t && ln()) throw Wo();
      Zo(e);
    }
}
function dg(e) {
  Xo();
  try {
    $n?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function fg() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function pg(e) {
  const t = fg();
  if (t) return await t.request(og, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new m("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function _u(e, t) {
  lg(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new m("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  Go(t);
  for (const r of n.keys())
    if (He.has(r))
      throw new m("context_replayed", "signed context requestId was already used", !0);
  if (He.size + n.size > rg)
    throw new m("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function Wr(e, t = Date.now()) {
  _u(e, t);
}
async function si(e, t = Date.now()) {
  const n = [...e];
  await pg(() => {
    Au(t, ln());
    const r = _u(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, He.get(o));
    for (const [o, s] of r) He.set(o, s);
    try {
      Zo(t, ln());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? He.delete(s) : He.set(s, a);
      throw o;
    }
    dg([...r]);
  });
}
async function hg(e, t) {
  if (e.purpose !== "agent-deliver") throw new m("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  const n = qo(e.release, "invalid_context");
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
function yg(e) {
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  if (e.agent.publicKey.fingerprint && e.agent.publicKey.fingerprint !== e.agent.fingerprint)
    throw new m("invalid_context", "agent public key fingerprint mismatch");
  return { ...e.agent.publicKey, fingerprint: e.agent.fingerprint };
}
async function gg(e) {
  const t = e.map((n) => oi(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Bt(t))));
}
function da(e) {
  return Bt(e.display);
}
const bg = "1.2.3";
let $e = class qi extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof qi ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof qi && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${bg}`
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
function pt(e, t) {
  return e.exec(t)?.groups;
}
const Iu = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Bu = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, Pu = /^\(.+?\).*?$/, fa = /^tuple(?<array>(\[(\d*)\])*)$/;
function Vi(e) {
  let t = e.type;
  if (fa.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += Vi(o), i < n - 1 && (t += ", ");
    }
    const r = pt(fa, e.type);
    return t += `)${r?.array || ""}`, Vi({
      ...e,
      type: t
    });
  }
  return "indexed" in e && e.indexed && (t = `${t} indexed`), e.name ? `${t} ${e.name}` : t;
}
function Sn(e) {
  let t = "";
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r];
    t += Vi(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function wg(e) {
  return e.type === "function" ? `function ${e.name}(${Sn(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${Sn(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${Sn(e.inputs)})` : e.type === "error" ? `error ${e.name}(${Sn(e.inputs)})` : e.type === "constructor" ? `constructor(${Sn(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const $u = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function mg(e) {
  return $u.test(e);
}
function xg(e) {
  return pt($u, e);
}
const Ou = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function vg(e) {
  return Ou.test(e);
}
function Eg(e) {
  return pt(Ou, e);
}
const Tu = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function Sg(e) {
  return Tu.test(e);
}
function kg(e) {
  return pt(Tu, e);
}
const Lu = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function Ru(e) {
  return Lu.test(e);
}
function Ag(e) {
  return pt(Lu, e);
}
const Cu = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function _g(e) {
  return Cu.test(e);
}
function Ig(e) {
  return pt(Cu, e);
}
const zu = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function Bg(e) {
  return zu.test(e);
}
function Pg(e) {
  return pt(zu, e);
}
const $g = /^receive\(\) external payable$/;
function Og(e) {
  return $g.test(e);
}
const Tg = /* @__PURE__ */ new Set(["indexed"]), Gi = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class Lg extends $e {
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
class Rg extends $e {
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
class Cg extends $e {
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
class zg extends $e {
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
class Ug extends $e {
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
class Hg extends $e {
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
class Mg extends $e {
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
class yn extends $e {
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
class Ng extends $e {
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
class Fg extends $e {
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
class Kg extends $e {
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
class jg extends $e {
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
function Dg(e, t, n) {
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
const Ei = /* @__PURE__ */ new Map([
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
function qg(e, t = {}) {
  if (Sg(e))
    return Vg(e, t);
  if (vg(e))
    return Gg(e, t);
  if (mg(e))
    return Wg(e, t);
  if (_g(e))
    return Zg(e, t);
  if (Bg(e))
    return Xg(e);
  if (Og(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new Ng({ signature: e });
}
function Vg(e, t = {}) {
  const n = kg(e);
  if (!n)
    throw new yn({ signature: e, type: "function" });
  const r = Re(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(Ft(r[a], {
      modifiers: Gi,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = Re(n.returns), c = a.length;
    for (let u = 0; u < c; u++)
      s.push(Ft(a[u], {
        modifiers: Gi,
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
function Gg(e, t = {}) {
  const n = Eg(e);
  if (!n)
    throw new yn({ signature: e, type: "event" });
  const r = Re(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Ft(r[s], {
      modifiers: Tg,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function Wg(e, t = {}) {
  const n = xg(e);
  if (!n)
    throw new yn({ signature: e, type: "error" });
  const r = Re(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Ft(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function Zg(e, t = {}) {
  const n = Ig(e);
  if (!n)
    throw new yn({ signature: e, type: "constructor" });
  const r = Re(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Ft(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function Xg(e) {
  const t = Pg(e);
  if (!t)
    throw new yn({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const Yg = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Jg = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Qg = /^u?int$/;
function Ft(e, t) {
  const n = Dg(e, t?.type, t?.structs);
  if (Ei.has(n))
    return Ei.get(n);
  const r = Pu.test(e), i = pt(r ? Jg : Yg, e);
  if (!i)
    throw new Cg({ param: e });
  if (i.name && tb(i.name))
    throw new zg({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, u = {};
  if (r) {
    c = "tuple";
    const d = Re(i.type), h = [], f = d.length;
    for (let b = 0; b < f; b++)
      h.push(Ft(d[b], { structs: a }));
    u = { components: h };
  } else if (i.type in a)
    c = "tuple", u = { components: a[i.type] };
  else if (Qg.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !Uu(c))
    throw new Rg({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new Ug({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (Gi.has(i.modifier) && !nb(c, !!i.array))
      throw new Hg({
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
  return Ei.set(n, l), l;
}
function Re(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? Re(a, [...t, n.trim()]) : Re(a, t, `${n}${s}`, r);
      case "(":
        return Re(a, t, `${n}${s}`, r + 1);
      case ")":
        return Re(a, t, `${n}${s}`, r - 1);
      default:
        return Re(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new jg({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function Uu(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || Iu.test(e) || Bu.test(e);
}
const eb = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function tb(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || Iu.test(e) || Bu.test(e) || eb.test(e);
}
function nb(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function rb(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!Ru(a))
      continue;
    const c = Ag(a);
    if (!c)
      throw new yn({ signature: a, type: "struct" });
    const u = c.properties.split(";"), l = [], d = u.length;
    for (let h = 0; h < d; h++) {
      const b = u[h].trim();
      if (!b)
        continue;
      const g = Ft(b, {
        type: "struct"
      });
      l.push(g);
    }
    if (!l.length)
      throw new Fg({ signature: a });
    t[c.name] = l;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = Hu(c, t);
  }
  return r;
}
const ib = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function Hu(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (Pu.test(s.type))
      r.push(s);
    else {
      const c = pt(ib, s.type);
      if (!c?.type)
        throw new Mg({ abiParameter: s });
      const { array: u, type: l } = c;
      if (l in t) {
        if (n.has(l))
          throw new Kg({ type: l });
        r.push({
          ...s,
          type: `tuple${u ?? ""}`,
          components: Hu(t[l], t, /* @__PURE__ */ new Set([...n, l]))
        });
      } else if (Uu(l))
        r.push(s);
      else
        throw new Lg({ type: l });
    }
  }
  return r;
}
function ob(e) {
  const t = rb(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    Ru(o) || n.push(qg(o, t));
  }
  return n;
}
function sb(e, { includeName: t = !1 } = {}) {
  if (e.type !== "function" && e.type !== "event" && e.type !== "error")
    throw new wb(e.type);
  return `${e.name}(${Yo(e.inputs, { includeName: t })})`;
}
function Yo(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => ab(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function ab(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${Yo(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function er(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function ue(e) {
  return er(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const Mu = "2.54.6";
let Si = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${Mu}`
};
class M extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof M ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof M && n.cause.docsPath || n.docsPath, o = Si.getDocsUrl?.({ ...n, docsPath: i }), s = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...o ? [`Docs: ${o}`] : [],
      ...r ? [`Details: ${r}`] : [],
      ...Si.version ? [`Version: ${Si.version}`] : []
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
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = Mu;
  }
  walk(t) {
    return Nu(this, t);
  }
}
function Nu(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? Nu(e.cause, t) : t ? null : e;
}
class cb extends M {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${Yo(n, { includeName: !0 })})`,
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
class ub extends M {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class lb extends M {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class db extends M {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${ue(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class fb extends M {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class pb extends M {
  constructor(t, { docsPath: n }) {
    super([
      `Encoded function signature "${t}" not found on ABI.`,
      "Make sure you are using the correct ABI and that the function exists on it.",
      `You can look up the signature here: https://4byte.sourcify.dev/?q=${t}.`
    ].join(`
`), {
      docsPath: n,
      name: "AbiFunctionSignatureNotFoundError"
    });
  }
}
class hb extends M {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class yb extends M {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class gb extends M {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class bb extends M {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class wb extends M {
  constructor(t) {
    super([
      `"${t}" is not a valid definition type.`,
      'Valid types: "function", "event", "error"'
    ].join(`
`), { name: "InvalidDefinitionTypeError" });
  }
}
class Fu extends M {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class Ku extends M {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function gn(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? _t(e, { dir: t, size: n }) : mb(e, { dir: t, size: n });
}
function _t(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new Ku({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function mb(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new Ku({
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
class Jo extends M {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class xb extends M {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class vb extends M {
  constructor({ givenSize: t, maxSize: n }) {
    super(`Size cannot exceed ${n} bytes. Given size: ${t} bytes.`, { name: "SizeOverflowError" });
  }
}
function Vn(e, { dir: t = "left" } = {}) {
  let n = typeof e == "string" ? e.replace("0x", "") : e, r = 0;
  for (let i = 0; i < n.length - 1 && n[t === "left" ? i : n.length - i - 1].toString() === "0"; i++)
    r++;
  return n = t === "left" ? n.slice(r) : n.slice(0, n.length - r), typeof e == "string" ? (n.length === 1 && t === "right" && (n = `${n}0`), `0x${n.length % 2 === 1 ? `0${n}` : n}`) : n;
}
function tt(e, { size: t }) {
  if (ue(e) > t)
    throw new vb({
      givenSize: ue(e),
      maxSize: t
    });
}
function ju(e, t = {}) {
  const { signed: n } = t;
  t.size && tt(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function Du(e, t = {}) {
  const n = ju(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new Jo({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const Eb = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Gn(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? F(e, t) : typeof e == "string" ? Vu(e, t) : typeof e == "boolean" ? qu(e, t) : ke(e, t);
}
function qu(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (tt(n, { size: t.size }), gn(n, { size: t.size })) : n;
}
function ke(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += Eb[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (tt(r, { size: t.size }), gn(r, { dir: "right", size: t.size })) : r;
}
function F(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new Jo({
      max: o ? `${o}${c}` : void 0,
      min: `${s}${c}`,
      signed: n,
      size: r,
      value: `${e}${c}`
    });
  }
  const a = `0x${(n && i < 0 ? (1n << BigInt(r * 8)) + BigInt(i) : i).toString(16)}`;
  return r ? gn(a, { size: r }) : a;
}
const Sb = /* @__PURE__ */ new TextEncoder();
function Vu(e, t = {}) {
  const n = Sb.encode(e);
  return ke(n, t);
}
const kb = /* @__PURE__ */ new TextEncoder();
function Qo(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? _b(e, t) : typeof e == "boolean" ? Ab(e, t) : er(e) ? Pt(e, t) : Gu(e, t);
}
function Ab(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (tt(n, { size: t.size }), gn(n, { size: t.size })) : n;
}
const st = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function pa(e) {
  if (e >= st.zero && e <= st.nine)
    return e - st.zero;
  if (e >= st.A && e <= st.F)
    return e - (st.A - 10);
  if (e >= st.a && e <= st.f)
    return e - (st.a - 10);
}
function Pt(e, t = {}) {
  let n = e;
  t.size && (tt(n, { size: t.size }), n = gn(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = pa(r.charCodeAt(a++)), u = pa(r.charCodeAt(a++));
    if (c === void 0 || u === void 0)
      throw new M(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + u;
  }
  return o;
}
function _b(e, t) {
  const n = F(e, t);
  return Pt(n);
}
function Gu(e, t = {}) {
  const n = kb.encode(e);
  return typeof t.size == "number" ? (tt(n, { size: t.size }), gn(n, { dir: "right", size: t.size })) : n;
}
const yr = /* @__PURE__ */ BigInt(2 ** 32 - 1), ha = /* @__PURE__ */ BigInt(32);
function Ib(e, t = !1) {
  return t ? { h: Number(e & yr), l: Number(e >> ha & yr) } : { h: Number(e >> ha & yr) | 0, l: Number(e & yr) | 0 };
}
function Bb(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Ib(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Pb = (e, t, n) => e << n | t >>> 32 - n, $b = (e, t, n) => t << n | e >>> 32 - n, Ob = (e, t, n) => t << n - 32 | e >>> 64 - n, Tb = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Lb(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function ya(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Wn(e, ...t) {
  if (!Lb(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function Zr(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Wu(e, t) {
  Wn(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function Rb(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Zn(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function ki(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function qe(e, t) {
  return e << 32 - t | e >>> t;
}
const Cb = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function zb(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Ub(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = zb(e[t]);
  return e;
}
const ga = Cb ? (e) => e : Ub;
function Hb(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function es(e) {
  return typeof e == "string" && (e = Hb(e)), Wn(e), e;
}
class Zu {
}
function Xu(e) {
  const t = (r) => e().update(es(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const Mb = BigInt(0), kn = BigInt(1), Nb = BigInt(2), Fb = BigInt(7), Kb = BigInt(256), jb = BigInt(113), Yu = [], Ju = [], Qu = [];
for (let e = 0, t = kn, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Yu.push(2 * (5 * r + n)), Ju.push((e + 1) * (e + 2) / 2 % 64);
  let i = Mb;
  for (let o = 0; o < 7; o++)
    t = (t << kn ^ (t >> Fb) * jb) % Kb, t & Nb && (i ^= kn << (kn << /* @__PURE__ */ BigInt(o)) - kn);
  Qu.push(i);
}
const el = Bb(Qu, !0), Db = el[0], qb = el[1], ba = (e, t, n) => n > 32 ? Ob(e, t, n) : Pb(e, t, n), wa = (e, t, n) => n > 32 ? Tb(e, t, n) : $b(e, t, n);
function Vb(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = ba(u, l, 1) ^ n[a], h = wa(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Ju[s], c = ba(i, o, a), u = wa(i, o, a), l = Yu[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= Db[r], e[1] ^= qb[r];
  }
  Zn(n);
}
class ts extends Zu {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, ya(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Rb(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    ga(this.state32), Vb(this.state32, this.rounds), ga(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Zr(this), t = es(t), Wn(t);
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
    Zr(this, !1), Wn(t), this.finish();
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
    return ya(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Wu(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, Zn(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new ts(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const Gb = (e, t, n) => Xu(() => new ts(t, e, n)), Wb = Gb(1, 136, 256 / 8);
function Xe(e, t) {
  const n = t || "hex", r = Wb(er(e, { strict: !1 }) ? Qo(e) : e);
  return n === "bytes" ? r : Gn(r);
}
const Zb = (e) => Xe(Qo(e));
function Xb(e) {
  return Zb(e);
}
function Yb(e) {
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
    throw new M("Unable to normalize signature.");
  return i;
}
const Jb = (e) => {
  const t = typeof e == "string" ? e : wg(e);
  return Yb(t);
};
function Qb(e) {
  return Xb(Jb(e));
}
class jt extends M {
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
class tl extends Map {
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
const Ai = /* @__PURE__ */ new tl(8192);
function nl(e, t) {
  if (Ai.has(`${e}.${t}`))
    return Ai.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = Xe(Gu(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return Ai.set(`${e}.${t}`, o), o;
}
const ew = /^0x[a-fA-F0-9]{40}$/, _i = /* @__PURE__ */ new tl(8192);
function Dt(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if (_i.has(r))
    return _i.get(r);
  const i = ew.test(e) ? e.toLowerCase() === e ? !0 : n ? nl(e) === e : !0 : !1;
  return _i.set(r, i), i;
}
function tw(e) {
  return typeof e[0] == "string" ? Ne(e) : nw(e);
}
function nw(e) {
  let t = 0;
  for (const i of e)
    t += i.length;
  const n = new Uint8Array(t);
  let r = 0;
  for (const i of e)
    n.set(i, r), r += i.length;
  return n;
}
function Ne(e) {
  return `0x${e.reduce((t, n) => t + n.replace("0x", ""), "")}`;
}
function Xn(e, t, n, { strict: r } = {}) {
  return er(e, { strict: !1 }) ? rw(e, t, n, {
    strict: r
  }) : ol(e, t, n, {
    strict: r
  });
}
function rl(e, t) {
  if (typeof t == "number" && t > 0 && t > ue(e) - 1)
    throw new Fu({
      offset: t,
      position: "start",
      size: ue(e)
    });
}
function il(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && ue(e) !== n - t)
    throw new Fu({
      offset: n,
      position: "end",
      size: ue(e)
    });
}
function ol(e, t, n, { strict: r } = {}) {
  rl(e, t);
  const i = e.slice(t, n);
  return r && il(i, t, n), i;
}
function rw(e, t, n, { strict: r } = {}) {
  rl(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && il(i, t, n), i;
}
const iw = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, sl = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function al(e, t) {
  if (e.length !== t.length)
    throw new fb({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = ow({
    params: e,
    values: t
  });
  return rs(n);
}
function ow({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(ns({ param: e[r], value: t[r] }));
  return n;
}
function ns({ param: e, value: t }) {
  const n = ai(e.type);
  if (n) {
    const [r, i] = n;
    return aw(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return fw(t, {
      param: e
    });
  if (e.type === "address")
    return sw(t);
  if (e.type === "bool")
    return uw(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = sl.exec(e.type) ?? [];
    return lw(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return cw(t, { param: e });
  if (e.type === "string")
    return dw(t);
  throw new yb(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function rs(e) {
  let t = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? t += 32 : t += ue(a);
  }
  const n = [], r = [];
  let i = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? (n.push(F(t + i, { size: 32 })), r.push(a), i += ue(a)) : n.push(a);
  }
  return Ne([...n, ...r]);
}
function sw(e) {
  if (!Dt(e))
    throw new jt({ address: e });
  return { dynamic: !1, encoded: _t(e.toLowerCase()) };
}
function aw(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new bb(e);
  if (!r && e.length !== t)
    throw new lb({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && Wi(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = ns({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = rs(o);
    if (r) {
      const a = F(o.length, { size: 32 });
      return {
        dynamic: !0,
        encoded: Ne([a, s])
      };
    }
    if (i)
      return { dynamic: !0, encoded: s };
  }
  return {
    dynamic: !1,
    encoded: Ne(o.map(({ encoded: s }) => s))
  };
}
function cw(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = ue(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = _t(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: Ne([
        _t(F(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new db({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: _t(e, { dir: "right" }) };
}
function uw(e) {
  if (typeof e != "boolean")
    throw new M(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: _t(qu(e)) };
}
function lw(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new Jo({
        max: r.toString(),
        min: i.toString(),
        signed: t,
        size: n / 8,
        value: e.toString()
      });
  }
  return {
    dynamic: !1,
    encoded: F(e, {
      size: 32,
      signed: t
    })
  };
}
function dw(e) {
  const t = Vu(e), n = Math.ceil(ue(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(_t(Xn(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: Ne([
      _t(F(ue(t), { size: 32 })),
      ...r
    ])
  };
}
function fw(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = ns({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? rs(r) : Ne(r.map(({ encoded: i }) => i))
  };
}
function ai(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function Wi(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(Wi);
  const n = ai(t);
  return n ? Wi({ ...e, type: n[1] }) : !1;
}
const pw = (e) => Xn(Qb(e), 0, 4);
class ma extends M {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class hw extends M {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class yw extends M {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const gw = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new yw({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new hw({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new ma({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new ma({ offset: e });
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
function is(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(gw);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function bw(e, t = {}) {
  typeof t.size < "u" && tt(e, { size: t.size });
  const n = ke(e, t);
  return ju(n, t);
}
function ww(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (tt(n, { size: t.size }), n = Vn(n)), n.length > 1 || n[0] > 1)
    throw new xb(n);
  return !!n[0];
}
function ut(e, t = {}) {
  typeof t.size < "u" && tt(e, { size: t.size });
  const n = ke(e, t);
  return Du(n, t);
}
function mw(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (tt(n, { size: t.size }), n = Vn(n, { dir: "right" })), new TextDecoder().decode(n);
}
function xw(e, t) {
  const n = typeof t == "string" ? Pt(t) : t, r = is(n);
  if (ue(n) === 0 && e.length > 0)
    throw new ub();
  if (ue(t) && ue(t) < 32)
    throw new cb({
      data: typeof t == "string" ? t : ke(t),
      params: e,
      size: ue(t)
    });
  let i = 0;
  const o = [];
  for (let s = 0; s < e.length; ++s) {
    const a = e[s];
    i < n.length && r.setPosition(i);
    const [c, u] = nn(r, a, {
      staticPosition: 0
    });
    i += u, o.push(c);
  }
  return o;
}
function nn(e, t, { staticPosition: n }) {
  const r = ai(t.type);
  if (r) {
    const [i, o] = r;
    return Ew(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return _w(e, t, { staticPosition: n });
  if (t.type === "address")
    return vw(e);
  if (t.type === "bool")
    return Sw(e);
  if (t.type.startsWith("bytes"))
    return kw(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return Aw(e, t);
  if (t.type === "string")
    return Iw(e, { staticPosition: n });
  throw new gb(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const xa = 32, Zi = 32;
function vw(e) {
  const t = e.readBytes(32);
  return [nl(ke(ol(t, -20))), 32];
}
function Ew(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = ut(e.readBytes(Zi)), a = r + s, c = a + xa;
    e.setPosition(a);
    const u = ut(e.readBytes(xa)), l = Yn(t);
    let d = 0;
    const h = [];
    for (let f = 0; f < u; ++f) {
      e.setPosition(c + (l ? f * 32 : d));
      const [b, g] = nn(e, t, {
        staticPosition: c
      });
      d += g, h.push(b), g === 0 && (e.assertReadLimit(), e._touch());
    }
    return e.setPosition(r + 32), [h, 32];
  }
  if (Yn(t)) {
    const s = ut(e.readBytes(Zi)), a = r + s, c = [];
    for (let u = 0; u < n; ++u) {
      e.setPosition(a + u * 32);
      const [l] = nn(e, t, {
        staticPosition: a
      });
      c.push(l);
    }
    return e.setPosition(r + 32), [c, 32];
  }
  let i = 0;
  const o = [];
  for (let s = 0; s < n; ++s) {
    const [a, c] = nn(e, t, {
      staticPosition: r + i
    });
    i += c, o.push(a), c === 0 && (e.assertReadLimit(), e._touch());
  }
  return [o, i];
}
function Sw(e) {
  return [ww(e.readBytes(32), { size: 32 }), 32];
}
function kw(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = ut(e.readBytes(32));
    e.setPosition(n + s);
    const a = ut(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [ke(c), 32];
  }
  return [ke(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function Aw(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? bw(i, { signed: n }) : ut(i, { signed: n }),
    32
  ];
}
function _w(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (Yn(t)) {
    const s = ut(e.readBytes(Zi)), a = n + s;
    for (let c = 0; c < t.components.length; ++c) {
      const u = t.components[c];
      e.setPosition(a + o);
      const [l, d] = nn(e, u, {
        staticPosition: a
      });
      o += d, i[r ? c : u?.name] = l;
    }
    return e.setPosition(n + 32), [i, 32];
  }
  for (let s = 0; s < t.components.length; ++s) {
    const a = t.components[s], [c, u] = nn(e, a, {
      staticPosition: n
    });
    i[r ? s : a?.name] = c, o += u;
  }
  return [i, o];
}
function Iw(e, { staticPosition: t }) {
  const n = ut(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = ut(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = mw(Vn(o));
  return e.setPosition(t + 32), [s, 32];
}
function Yn(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components?.some(Yn);
  const n = ai(e.type);
  return !!(n && Yn({ ...e, type: n[1] }));
}
const Bw = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), Pw = {
  ether: -9,
  wei: 9
};
function $w(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function Xi(e, t = "wei") {
  return $w(e, Pw[t]);
}
function Ow(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class Tw extends M {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        Ow(t),
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
class Lw extends M {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function dn(e, t = "hex") {
  const n = cl(e), r = is(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? ke(r.bytes) : r.bytes;
}
function cl(e) {
  return Array.isArray(e) ? Rw(e.map((t) => cl(t))) : Cw(e);
}
function Rw(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = ul(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function Cw(e) {
  const t = typeof e == "string" ? Pt(e) : e, n = ul(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function ul(e) {
  if (e < 2 ** 8)
    return 1;
  if (e < 2 ** 16)
    return 2;
  if (e < 2 ** 24)
    return 3;
  if (e < 2 ** 32)
    return 4;
  throw new M("Length is too large.");
}
class ci extends M {
  constructor({ cause: t, maxFeePerGas: n } = {}) {
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${Xi(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
      cause: t,
      name: "FeeCapTooHighError"
    });
  }
}
Object.defineProperty(ci, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
class ll extends M {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${Xi(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${Xi(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(ll, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const os = 2n ** 256n - 1n;
function dl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => Pt(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => ke(o));
}
function fl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => Pt(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => Pt(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => ke(s));
}
function zw(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, u = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + u, a, r);
}
function Uw(e, t, n) {
  return e & t ^ ~e & n;
}
function Hw(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class Mw extends Zu {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = ki(this.buffer);
  }
  update(t) {
    Zr(this), t = es(t), Wn(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = ki(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Zr(this), Wu(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Zn(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    zw(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = ki(t), c = this.outputLen;
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
const Et = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Nw = /* @__PURE__ */ Uint32Array.from([
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
]), St = /* @__PURE__ */ new Uint32Array(64);
class Fw extends Mw {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = Et[0] | 0, this.B = Et[1] | 0, this.C = Et[2] | 0, this.D = Et[3] | 0, this.E = Et[4] | 0, this.F = Et[5] | 0, this.G = Et[6] | 0, this.H = Et[7] | 0;
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
      St[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = St[d - 15], f = St[d - 2], b = qe(h, 7) ^ qe(h, 18) ^ h >>> 3, g = qe(f, 17) ^ qe(f, 19) ^ f >>> 10;
      St[d] = g + St[d - 7] + b + St[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = qe(a, 6) ^ qe(a, 11) ^ qe(a, 25), f = l + h + Uw(a, c, u) + Nw[d] + St[d] | 0, g = (qe(r, 2) ^ qe(r, 13) ^ qe(r, 22)) + Hw(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Zn(St);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Zn(this.buffer);
  }
}
const Kw = /* @__PURE__ */ Xu(() => new Fw()), jw = Kw;
function Dw(e, t) {
  return jw(er(e, { strict: !1 }) ? Qo(e) : e);
}
function qw(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = Dw(t);
  return i.set([n], 0), r === "bytes" ? i : ke(i);
}
function Vw(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(qw({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const va = 6, pl = 32, ss = 4096, hl = pl * ss, Ea = hl * va - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * ss * va, yl = 1;
class Gw extends M {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class gl extends M {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class Ww extends M {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class Zw extends M {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${yl}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function Xw(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? Pt(e.data) : e.data, r = ue(n);
  if (!r)
    throw new gl();
  if (r > Ea)
    throw new Gw({
      maxSize: Ea,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = is(new Uint8Array(hl));
    let c = 0;
    for (; c < ss; ) {
      const u = n.slice(s, s + (pl - 1));
      if (a.pushByte(0), a.pushBytes(u), u.length < 31) {
        a.pushByte(128), o = !1;
        break;
      }
      c++, s += 31;
    }
    i.push(a);
  }
  return t === "bytes" ? i.map((a) => a.bytes) : i.map((a) => ke(a.bytes));
}
function Yw(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? Xw({ data: t, to: r }), o = e.commitments ?? dl({ blobs: i, kzg: n, to: r }), s = e.proofs ?? fl({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function Jw(e) {
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
  throw new Tw({ transaction: e });
}
class ui extends M {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function Qw(e) {
  const { abi: t, data: n } = e, r = Xn(n, 0, 4), i = t.find((o) => o.type === "function" && r === pw(sb(o)));
  if (!i)
    throw new pb(r, {
      docsPath: "/docs/contract/decodeFunctionData"
    });
  return {
    functionName: i.name,
    args: "inputs" in i && i.inputs && i.inputs.length > 0 ? xw(i.inputs, Xn(n, 4)) : void 0
  };
}
function e0(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!Dt(i))
        throw new jt({ address: i });
      if (r < 0)
        throw new ui({ chainId: r });
    }
  as(e);
}
function t0(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new gl();
    for (const n of t) {
      const r = ue(n), i = Du(Xn(n, 0, 1));
      if (r !== 32)
        throw new Ww({ hash: n, size: r });
      if (i !== yl)
        throw new Zw({
          hash: n,
          version: i
        });
    }
  }
  as(e);
}
function as(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new ui({ chainId: t });
  if (i && !Dt(i))
    throw new jt({ address: i });
  if (r && r > os)
    throw new ci({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new ll({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function n0(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new ui({ chainId: t });
  if (o && !Dt(o))
    throw new jt({ address: o });
  if (n || i)
    throw new M("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > os)
    throw new ci({ maxFeePerGas: r });
}
function r0(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !Dt(o))
    throw new jt({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new ui({ chainId: t });
  if (n || i)
    throw new M("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > os)
    throw new ci({ maxFeePerGas: r });
}
function li(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const { address: r, storageKeys: i } = e[n];
    for (let o = 0; o < i.length; o++)
      if (i[o].length - 2 !== 64)
        throw new Lw({ storageKey: i[o] });
    if (!Dt(r, { strict: !1 }))
      throw new jt({ address: r });
    t.push([r, i]);
  }
  return t;
}
function i0(e, t) {
  const n = Jw(e);
  return n === "eip1559" ? a0(e, t) : n === "eip2930" ? c0(e, t) : n === "eip4844" ? s0(e, t) : n === "eip7702" ? o0(e, t) : u0(e);
}
function o0(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  e0(e);
  const h = li(l), f = l0(n);
  return Ne([
    "0x04",
    dn([
      F(r),
      o ? F(o) : "0x",
      u ? F(u) : "0x",
      c ? F(c) : "0x",
      i ? F(i) : "0x",
      s ?? "0x",
      a ? F(a) : "0x",
      d ?? "0x",
      h,
      f,
      ...tr(e, t)
    ])
  ]);
}
function s0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  t0(e);
  let h = e.blobVersionedHashes, f = e.sidecars;
  if (e.blobs && (typeof h > "u" || typeof f > "u")) {
    const _ = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((O) => ke(O)), I = e.kzg, S = dl({
      blobs: _,
      kzg: I
    });
    if (typeof h > "u" && (h = Vw({
      commitments: S
    })), typeof f > "u") {
      const O = fl({ blobs: _, commitments: S, kzg: I });
      f = Yw({ blobs: _, commitments: S, proofs: O });
    }
  }
  const b = li(l), g = [
    F(n),
    i ? F(i) : "0x",
    u ? F(u) : "0x",
    c ? F(c) : "0x",
    r ? F(r) : "0x",
    o ?? "0x",
    s ? F(s) : "0x",
    d ?? "0x",
    b,
    a ? F(a) : "0x",
    h ?? [],
    ...tr(e, t)
  ], p = [], y = [], x = [];
  if (f)
    for (let _ = 0; _ < f.length; _++) {
      const { blob: I, commitment: S, proof: O } = f[_];
      p.push(I), y.push(S), x.push(O);
    }
  return Ne([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    dn(f ? [g, p, y, x] : g)
  ]);
}
function a0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: u, data: l } = e;
  as(e);
  const d = li(u), h = [
    F(n),
    i ? F(i) : "0x",
    c ? F(c) : "0x",
    a ? F(a) : "0x",
    r ? F(r) : "0x",
    o ?? "0x",
    s ? F(s) : "0x",
    l ?? "0x",
    d,
    ...tr(e, t)
  ];
  return Ne([
    "0x02",
    dn(h)
  ]);
}
function c0(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: u } = e;
  n0(e);
  const l = li(c), d = [
    F(n),
    o ? F(o) : "0x",
    u ? F(u) : "0x",
    r ? F(r) : "0x",
    s ?? "0x",
    a ? F(a) : "0x",
    i ?? "0x",
    l,
    ...tr(e, t)
  ];
  return Ne([
    "0x01",
    dn(d)
  ]);
}
function u0(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  r0(e);
  let u = [
    o ? F(o) : "0x",
    c ? F(c) : "0x",
    r ? F(r) : "0x",
    s ?? "0x",
    a ? F(a) : "0x",
    i ?? "0x"
  ];
  return n > 0 && (u = [
    ...u,
    F(n),
    "0x",
    "0x"
  ]), dn(u);
}
function tr(e, t) {
  const n = t ?? e, { v: r, yParity: i } = n;
  if (typeof n.r > "u")
    return [];
  if (typeof n.s > "u")
    return [];
  if (typeof r > "u" && typeof i > "u")
    return [];
  const o = Vn(n.r), s = Vn(n.s);
  return [typeof i == "number" ? i ? F(1) : "0x" : r === 0n ? "0x" : r === 1n ? F(1) : r === 27n ? "0x" : F(1), o === "0x00" ? "0x" : o, s === "0x00" ? "0x" : s];
}
function l0(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Gn(r) : "0x",
      s,
      i ? Gn(i) : "0x",
      ...tr({}, o)
    ]);
  }
  return t;
}
class d0 extends M {
  constructor({ domain: t }) {
    super(`Invalid domain "${Bw(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class f0 extends M {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class p0 extends M {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function h0(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: u, type: l } = c, d = a[u], h = l.match(sl);
      if (h && (typeof d == "number" || typeof d == "bigint")) {
        const [g, p, y] = h;
        F(d, {
          signed: p === "int",
          size: Number.parseInt(y, 10) / 8
        });
      }
      if (l === "address" && typeof d == "string" && !Dt(d))
        throw new jt({ address: d });
      const f = l.match(iw);
      if (f) {
        const [g, p] = f;
        if (p && ue(d) !== Number.parseInt(p, 10))
          throw new hb({
            expectedSize: Number.parseInt(p, 10),
            givenSize: ue(d)
          });
      }
      const b = i[l];
      b && (g0(l), o(b, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new d0({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new f0({ primaryType: r, types: i });
}
function y0({ domain: e }) {
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
function g0(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new p0({ type: e });
}
function b0(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: y0({ domain: t }),
    ...e.types
  };
  h0({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(w0({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(bl({
    data: n,
    primaryType: r,
    types: i
  })), Xe(tw(o));
}
function w0({ domain: e, types: t }) {
  return bl({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function bl({ data: e, primaryType: t, types: n }) {
  const r = wl({
    data: e,
    primaryType: t,
    types: n
  });
  return Xe(r);
}
function wl({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [m0({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = xl({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return al(r, i);
}
function m0({ primaryType: e, types: t }) {
  const n = Gn(x0({ primaryType: e, types: t }));
  return Xe(n);
}
function x0({ primaryType: e, types: t }) {
  let n = "";
  const r = ml({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function ml({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    ml({ primaryType: o.type, types: t }, n);
  return n;
}
function xl({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      Xe(wl({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, Xe(r)];
  if (n === "string")
    return [{ type: "bytes32" }, Xe(Gn(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => xl({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      Xe(al(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
const Sa = "bitcoin-taproot-keypath-v1", ka = "bip341-sighash-default-keypath", v0 = ["bitcoin", "testnet", "signet", "regtest"], Yi = 21000000n * 100000000n, vl = 137, El = /^[0-9a-f]+$/, E0 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", S0 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", k0 = 734539939, A0 = 1;
function D(e) {
  throw new m("invalid_payload", e);
}
function Aa(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && D(`${t} must be an object`), e;
}
function _a(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && D(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && D(`${n} is missing required fields: ${i.join(", ")}`);
}
function kr(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !El.test(e)) && D(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function _0(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && D(`${t} must be an integer in ${n}..${r}`), e;
}
function Ce(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function Xt(e, t, n, r) {
  return t + n > e.length && D(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function gr(e, t, n) {
  t >= e.length && D(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && D(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function Ii(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function I0(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function An(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function Ia(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function Sl(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  D("transaction output uses an unsupported script template");
}
function B0(e) {
  (e.length === 0 || e.length % 2 || e.length > vl * 2 || !El.test(e)) && D("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (L) => Number.parseInt(L, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && D("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = gr(t, n, "input count");
  n = i, r !== 1 && D("transaction must contain exactly one input");
  const [o, s] = Xt(t, n, 32, "outpoint hash");
  n = s, o.every((L) => L === 0) && D("outpoint hash must not be null");
  const [a, c] = Xt(t, n, 4, "outpoint index");
  n = c;
  const u = Ii(a), [l, d] = gr(t, n, "scriptSig length");
  n = d, l !== 0 && D("scriptSig must be empty");
  const [h, f] = Xt(t, n, 4, "sequence");
  n = f;
  const b = Ii(h);
  b !== 4294967293 && b !== 4294967294 && b !== 4294967295 && D("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [g, p] = gr(t, n, "output count");
  n = p, g !== 1 && g !== 2 && D("transaction must contain one or two outputs");
  const y = [], x = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let L = 0; L < g; L += 1) {
    const [R, U] = Xt(t, n, 8, `output ${L} amount`);
    n = U;
    const j = I0(R);
    (j < 1n || j > Yi) && D(`output ${L} amount is outside the Bitcoin money range`);
    const [z, w] = gr(t, n, `output ${L} script length`);
    n = w;
    const [k, A] = Xt(t, n, z, `output ${L} script`);
    n = A;
    const v = Sl(k);
    z !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[v] && D(`output ${L} script length is not canonical for ${v}`), j < x[v] && D(`output ${L} is below the V1 ${v} dust floor`), y.push({ amountSats: j, scriptPubKey: k, kind: v });
  }
  const [_, I] = Xt(t, n, 4, "locktime");
  n = I;
  const S = Ii(_);
  S !== 0 && D("locktime must be exactly zero"), n !== t.length && D("transaction has trailing bytes");
  const O = y.reduce((L, R) => L + R.amountSats, 0n);
  return (O < 1n || O > Yi) && D("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: u, sequence: b, outputs: y, locktime: S };
}
function P0(e, t) {
  const n = ce(new TextEncoder().encode(e));
  return ce(Ce(n, n, t));
}
function $0(e, t, n) {
  const r = Ce(e.prevoutHashLe, An(e.prevoutIndex)), i = Ce(new Uint8Array([n.length]), n), o = e.outputs.map((a) => Ce(Ia(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = Ce(
    new Uint8Array([0, 0]),
    An(2),
    An(e.locktime),
    ce(r),
    ce(Ia(t)),
    ce(i),
    ce(An(e.sequence)),
    ce(Ce(...o)),
    new Uint8Array([0]),
    An(0)
  );
  return P0("TapSighash", s);
}
function O0(e) {
  return BigInt(`0x${X(e)}`);
}
function Ba(e) {
  return Rc(ce(e));
}
function Pa(e, t) {
  const n = Ce(new Uint8Array([e]), t), r = ce(ce(n)).slice(0, 4), i = Ce(n, r);
  let o = O0(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = E0[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function T0(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function L0(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1) i >>> o & 1 && (n ^= t[o]);
  }
  return n >>> 0;
}
function Bi(e, t, n) {
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...T0(n, 8, 5)], o = [...r].map((u) => u.charCodeAt(0) >> 5).concat([0], [...r].map((u) => u.charCodeAt(0) & 31)), s = t === 0 ? A0 : k0, a = L0(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (u, l) => a >>> 5 * (5 - l) & 31);
  return `${r}1${i.concat(c).map((u) => S0[u]).join("")}`;
}
function R0(e, t) {
  const n = Sl(t), r = e === "bitcoin";
  return n === "p2pkh" ? Pa(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? Pa(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? Bi(e, 0, t.slice(2)) : Bi(e, 1, t.slice(2));
}
function C0(e) {
  const t = Ba(e), n = Ce(new Uint8Array([0, 20]), t);
  return [
    Ce(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    Ce(new Uint8Array([169, 20]), Ba(n), new Uint8Array([135]))
  ];
}
function Pi(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function br(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function z0(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function U0(e) {
  return X(ce(ce(e.raw)).slice().reverse());
}
function H0(e, t) {
  const n = t.transaction, r = Q("bitcoin.network", { network: e.network }), i = [
    Q("bitcoin.title"),
    ...t.highFeeWarning ? [Q("bitcoin.highFeeWarning"), ""] : [],
    r,
    Q("bitcoin.networkWarning"),
    Q("bitcoin.input", { txid: X(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    Q("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: br(BigInt(e.prevout.amountSats)) }),
    Q("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(Q("bitcoin.output", {
      index: s + 1,
      address: R0(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: br(o.amountSats),
      role: Q(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    Q("bitcoin.fee", { sats: t.feeSats.toString(), btc: br(t.feeSats), rate: z0(t.feeSats, t.signedVsize) }),
    Q("bitcoin.vsize", { vsize: t.signedVsize }),
    Q(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    Q("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: br(t.netLeavingSats) }),
    Q("bitcoin.unsignedTxid", { txid: U0(n) }),
    Q("bitcoin.outputKey", { key: X(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function M0(e, t) {
  const n = Aa(e, "signingContext");
  _a(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== Sa && D("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !v0.includes(n.network)) && D("bitcoin signing_context network is invalid");
  const r = kr(n.unsignedTransaction, "unsignedTransaction");
  r.length > vl * 2 && D("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = Aa(n.prevout, "signingContext.prevout");
  _a(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = _0(i.amountSats, "prevout.amountSats", 1, Number(Yi)), s = kr(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || D("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== ka && D("unsupported Bitcoin digest algorithm");
  const a = kr(n.digest, "signingContext.digest", 64);
  return a !== t && D("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: Sa,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: ka,
    digest: a
  };
}
function kl(e, t, n) {
  const r = M0(e, t), i = B0(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (g) => Number.parseInt(g, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const g = kr(n, "signing public key", 66);
    a = Uint8Array.from(g.match(/../g), (y) => Number.parseInt(y, 16)), a[0] !== 2 && a[0] !== 3 && D("signing public key must be compressed secp256k1");
    const p = cy(g);
    Pi(s, p) || D("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const g of i.outputs)
      C0(a).some((p) => Pi(p, g.scriptPubKey)) && D("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((g, p) => Pi(g.scriptPubKey, o) ? [p] : []);
  c.length > 1 && D("transaction may contain at most one same-key P2TR return output");
  const u = i.outputs.reduce((g, p) => g + p.amountSats, 0n), l = BigInt(r.prevout.amountSats) - u;
  l <= 0n && D("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, h = Math.ceil(d / 4);
  l > 10000n * BigInt(h) && D("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const f = X($0(i, BigInt(r.prevout.amountSats), o));
  f !== r.digest && D("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const b = c.reduce((g, p) => g + i.outputs[p].amountSats, 0n);
  return {
    digest: f,
    display: H0(r, {
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
const $a = `avault-agent-operation:v1
`;
function Yt(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function Oa(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function $i(e, t) {
  const n = Oa(e), r = Oa(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function W(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : rn(e);
}
function rn(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(rn).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${rn(t[n])}`).join(",")}}`;
}
const N0 = ob([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]);
function F0(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e;
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
]), j0 = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function Oi(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function Al(e) {
  if (e.type !== void 0 && e.type !== "legacy" && e.type !== "eip1559")
    throw new Error("unsupported EVM transaction type");
  return e.type === "eip1559" || e.maxFeePerGas !== void 0 || e.maxPriorityFeePerGas !== void 0 ? "eip1559" : "legacy";
}
function D0(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function q0(e) {
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
function V0(e) {
  if (e === "0x") return "calldata: none";
  let t;
  try {
    t = Qw({ abi: N0, data: e });
  } catch {
    throw new Error("unsupported EVM calldata selector");
  }
  const n = [...t.args];
  switch (t.functionName) {
    case "approve":
      return ["call: ERC-20/ERC-721 approve", `spender/to: ${W(n[0])}`, `amount/tokenId: ${W(n[1])}`].join(`
`);
    case "transfer":
      return ["call: ERC-20 transfer", `to: ${W(n[0])}`, `amount: ${W(n[1])}`].join(`
`);
    case "transferFrom":
      return [
        "call: ERC-20/ERC-721 transferFrom",
        `from: ${W(n[0])}`,
        `to: ${W(n[1])}`,
        `amount/tokenId: ${W(n[2])}`
      ].join(`
`);
    case "permit":
      return [
        "call: ERC-20 permit",
        `owner: ${W(n[0])}`,
        `spender: ${W(n[1])}`,
        `amount: ${W(n[2])}`,
        `deadline: ${W(n[3])}`
      ].join(`
`);
    case "setApprovalForAll":
      return ["call: ERC-721 setApprovalForAll", `operator: ${W(n[0])}`, `approved: ${W(n[1])}`].join(`
`);
    case "safeTransferFrom":
      return [
        "call: ERC-721 safeTransferFrom",
        `from: ${W(n[0])}`,
        `to: ${W(n[1])}`,
        `tokenId: ${W(n[2])}`,
        n.length > 3 ? `extraData: ${W(n[3])}` : ""
      ].filter(Boolean).join(`
`);
    default:
      throw new Error("unsupported EVM calldata selector");
  }
}
function G0(e) {
  const t = F0(e.data), n = Al(e);
  return [
    `EVM transaction on chain ${W(e.chainId)}`,
    `type: ${n}`,
    `to: ${W(e.to) || "(contract creation)"}`,
    `value: ${W(e.value) || "0"}`,
    `gas: ${W(e.gas)}`,
    `gasPrice: ${W(e.gasPrice)}`,
    `maxFeePerGas: ${W(e.maxFeePerGas)}`,
    `maxPriorityFeePerGas: ${W(e.maxPriorityFeePerGas)}`,
    `nonce: ${W(e.nonce)}`,
    V0(t)
  ].filter((i) => !i.endsWith(": ")).join(`
`);
}
function W0(e) {
  Do(e);
  const t = Yt(e), n = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"]
  }, r = Object.hasOwn(n, e.kind) ? n[e.kind] : void 0;
  if (!r) throw new Error("unsupported signing context");
  if (Oi(t, new Set(r), "signing context"), typeof e.digest != "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(e.digest))
    throw new Error("signing context digest must be 32 bytes");
  switch (e.kind) {
    case "evm-transaction": {
      if (e.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm");
      const i = Yt(e.unsignedTransaction);
      Oi(i, K0, "EVM transaction"), D0(e, i), Al(i);
      const o = i0(q0(i)), s = $i(e.digest, Xe(o));
      return {
        digest: s,
        challenge: ze(s),
        display: G0(i)
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = Yt(e.typedData);
      Oi(i, j0, "EIP-712 typed data");
      const o = Yt(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = $i(e.digest, b0(i));
      return {
        digest: s,
        challenge: ze(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${W(o.chainId)}`,
          `domain.verifyingContract: ${W(o.verifyingContract)}`,
          `domain: ${rn(o)}`,
          `types: ${rn(Yt(i.types))}`,
          `primaryType: ${W(i.primaryType)}`,
          `message: ${rn(Yt(i.message))}`
        ].join(`
`)
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith($a) || e.canonicalPreimage.slice($a.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = $i(e.digest, mh(ce(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: ze(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = kl(e, e.digest);
      return {
        digest: i.digest,
        challenge: ze(i.digest),
        display: i.display
      };
    }
    default:
      throw new Error("unsupported signing context");
  }
}
function Ar(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return;
  const t = e.messageHex;
  if (typeof t == "string")
    try {
      uh(t);
    } catch {
      throw new m("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit");
    }
}
function cs(e) {
  if (Ar(e), Do(e), !e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", "Solana signing context must be an object");
  const t = e;
  if (t.kind !== "solana-transaction-v1" || Object.keys(t).some((n) => n !== "kind" && n !== "messageHex") || typeof t.messageHex != "string" || t.messageHex.length === 0 || t.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(t.messageHex))
    throw new m("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias");
  return { kind: "solana-transaction-v1", messageHex: t.messageHex };
}
function _l(e, t, n) {
  if (n.kind !== "keypair" || !n.publicKey) throw new Error("protected signing requires a keypair protected record");
  const r = hn(n.curve);
  if (e === Nn || t.kind === "solana-transaction-v1" || r === "ed25519") {
    if (e !== Nn || t.kind !== "solana-transaction-v1" || r !== "ed25519")
      throw new m("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together");
    cs(t);
  }
}
function Il(e, t) {
  if (e === Nn || t.kind === "solana-transaction-v1")
    throw new m("unsupported_signing_context", "protected Solana signing is not enabled in this sandbox release");
}
function Jt(e, t) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function wr(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function On(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new m("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function us(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) us(t);
    Object.freeze(e);
  }
  return e;
}
function ls(e, t) {
  if (Ar(e), t && typeof t == "object") {
    const n = t.release;
    Ar(n), n && typeof n == "object" && Ar(n.signingContext);
  }
}
function Z0(e) {
  const t = Jt(e, "sign request");
  ls(t.signingContext, t.context), Do(t);
  const n = Jt(structuredClone(t), "sign request");
  On(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = Jt(n.material, "material");
  On(r, ["name", "envelope"], "material");
  const i = Jt(r.envelope, "envelope");
  On(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = Vo(n.context);
  On(Jt(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = mo(n.scheme);
  } catch {
    throw new m("invalid_payload", "unsupported signing scheme");
  }
  const a = Jt(n.signingContext, "signingContext");
  return a.kind === "solana-transaction-v1" && cs(a), us({
    material: {
      name: wr(r.name, "material.name"),
      envelope: {
        ciphertext: wr(i.ciphertext, "envelope.ciphertext"),
        nonce: wr(i.nonce, "envelope.nonce"),
        wrap_meta: wr(i.wrap_meta, "envelope.wrap_meta")
      }
    },
    scheme: s,
    signingContext: a,
    context: o
  });
}
function _n() {
  throw new m("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request");
}
function Bl(e, t, n) {
  ls(e.signingContext, e.context), Di({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && _n();
  const i = t.kind === "message";
  if (!i && (t.kind !== "digest" || !/^[0-9a-f]{64}$/.test(t.digest)) && _n(), On(r, ["name", "scheme", i ? "messageHex" : "digest", "publicKey", "signingContext"], "sign context.release"), i) {
    const o = cs(e.signingContext);
    (t.messageHex !== o.messageHex || r.messageHex !== t.messageHex || e.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(n) || r.publicKey !== n) && _n();
  } else (e.scheme === "ed25519" || e.signingContext.kind === "solana-transaction-v1" || r.digest !== t.digest) && _n();
  (r.name !== e.material.name || r.scheme !== e.scheme || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || Bt(r.signingContext) !== Bt(e.signingContext)) && _n();
}
function X0(e) {
  return ls(e.signingContext, e.context), ce(new TextEncoder().encode(oi(e.context)));
}
function Y0(e, t) {
  if (mo(e), e === "ed25519") throw new Error("Ed25519 approval is not enabled in this sandbox release");
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === wo ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === Fn ? Q("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === ni ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function J0(e) {
  const t = Z0(e), n = cn(t.material.envelope), r = So(t.material.name, n.recordMetadata);
  _l(t.scheme, t.signingContext, r), Il(t.scheme, t.signingContext);
  let i = W0(t.signingContext);
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    if (t.scheme !== Fn)
      throw new m("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (t.scheme === Fn)
      throw new m("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (t.signingContext.kind !== "avault-agent-operation" && t.scheme !== ni && t.scheme !== bo)
      throw new m("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const a = kl(t.signingContext, i.digest, r.publicKey);
    i = { digest: a.digest, challenge: i.challenge, display: a.display };
  }
  Bl(t, { kind: "digest", digest: i.digest }, r.publicKey);
  const o = `${Y0(t.scheme, r.publicKey)}
scheme: ${t.scheme}
${i.display}`, s = X0(t);
  return us({ request: t, verified: { digest: i.digest, display: o }, unpacked: n, recordContext: r, challenge: [...s] });
}
async function Pl(e, t, n) {
  Il(e.request.scheme, e.request.signingContext), _l(e.request.scheme, e.request.signingContext, e.recordContext);
  const r = await Ao(n, t);
  Gr({ context: e.request.context, rootMetadata: r, expectedPurpose: "sign" }), Bl(e.request, { kind: "digest", digest: e.verified.digest }, e.recordContext.publicKey), Wr([e.request.context]);
}
async function Q0(e, t, n) {
  return await Pl(e, t, n), Wh(e.unpacked.sealed, t, e.recordContext, e.verified.digest, e.request.scheme);
}
function $l(e) {
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
async function em(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await qc(t, e.vmk, n);
    return { envelope: Wc(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function tm(e) {
  const t = hn(e.curve), n = Vh(t);
  let r = n.privateKey;
  try {
    const i = {
      name: e.name,
      kind: "keypair",
      publicKey: n.publicKey,
      ...t === "ed25519" ? { curve: t } : {}
    }, o = await qc(r, e.vmk, i);
    return {
      envelope: Wc(o, e.wrapMeta, i),
      publicKey: n.publicKey,
      addresses: t === "ed25519" ? { solana: Zh(n.publicKey) } : uy(n.publicKey)
    };
  } finally {
    r?.fill(0), r = void 0;
  }
}
function Ol(e) {
  return (e?.kind ?? "static") === "static";
}
function nm(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: Vo(n.context)
  };
}
function Tl(e) {
  const t = e[0]?.context.display;
  if (!t) throw new m("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = da(e[0].context), r = Ta(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if (da(s.context) !== n)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (Ta(s.context) !== r)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed recipient");
  }
  const i = new Set(t.secrets.map((s) => `${s.name}:${s.kind}`));
  for (const s of e) {
    const { recordMetadata: a } = cn(s.material.envelope), c = a?.kind ?? "static";
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
function Ta(e) {
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  return Bt({ agent: e.agent, grantId: e.grantId });
}
async function rm(e) {
  if (e.items.length === 0) throw new m("invalid_payload", "approveRelease requires at least one item");
  const t = Tl(e.items), n = await Ao(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    Gr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  Wr(r, e.now);
  const i = await gg(r);
  await e.confirm({
    ...t,
    challenge: i
  });
  const o = e.now ?? Date.now();
  for (const a of e.items)
    Gr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: o
    });
  e.onApprovalAccepted?.(o), Wr(r, o);
  const s = [];
  for (const a of e.items) {
    const { sealed: c, recordMetadata: u } = cn(a.material.envelope);
    if (!Ol(u)) throw new m("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await qh(
        c,
        e.vmk,
        yg(a.context),
        So(a.material.name, u),
        await hg(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await si(r, o), { blindBoxes: s };
}
const Ll = `avibe-vault-setup:v1:${ie.buildHash}:`, im = `avibe-vault-setup-result:${ie.buildHash}:`, om = `avibe-vault-setup-error:${ie.buildHash}:`, sm = 300 * 1e3, am = 300 * 1e3, cm = 30 * 1e3, um = 8 * 1e3, Ae = new Ql();
let La = !1;
function lm(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function Rl(e) {
  if (!lm(e))
    throw new m("invalid_payload", "appearance must include locale and theme");
  return e;
}
function dm(e) {
  return e == null ? null : Rl(e);
}
function di(e) {
  const t = Ky(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && qy();
}
function Cl() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: jy(), theme: e };
}
function Ee(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function zl(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function xe(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Ul(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function fm(e) {
  const t = Ul(e, "envelope");
  return {
    ciphertext: xe(t.ciphertext, "envelope.ciphertext"),
    nonce: xe(t.nonce, "envelope.nonce"),
    wrap_meta: xe(t.wrap_meta, "envelope.wrap_meta")
  };
}
function Hl(e) {
  const t = Ul(e, "material");
  return { name: xe(t.name, "material.name"), envelope: fm(t.envelope) };
}
function pm(e) {
  const t = e == null ? {} : Ee(e);
  return { wrapMeta: zl(t.wrapMeta, "wrapMeta") };
}
function Ml(e) {
  const t = Ee(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new m("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: xe(t.vaultUserHandle, "vaultUserHandle"),
    displayName: xe(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: $o(t.policy) } : {}
  };
}
function hm(e) {
  const t = Ee(e);
  return {
    wrapMeta: xe(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: $o(t.policy) } : {}
  };
}
function ym(e) {
  const t = Ee(e);
  return { material: Hl(t.material), context: Vo(t.context) };
}
function gm(e) {
  const t = Ee(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new m("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => nm(n, Hl)) };
}
function bm(e) {
  const t = Ee(e);
  if (t.operation !== "delete_secret") throw new m("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: xe(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: xe(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function Nl() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function Ra(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function wm(e) {
  return new Promise((t, n) => {
    const r = () => {
      n(bn(e));
    };
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function mm(e) {
  for (const t of e)
    if (t.aborted) return bn(t);
  return new Error("operation-superseded");
}
function Fl(e) {
  const t = new AbortController(), n = [], r = (i) => {
    t.signal.aborted || t.abort(bn(i));
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
async function Kl(e) {
  const t = Fl(e.abortSignals);
  try {
    await Promise.race([
      zy(vo(e.wrapMeta), ft(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? mm(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => wm(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function ds(e) {
  await Qn(async (t) => {
    const n = async (i) => {
      const o = Fl([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await Im(
          {
            prompt: {
              title: e.title,
              subtitle: e.subtitle,
              ...e.body ? { body: e.body } : {},
              ...e.details ? { details: e.details } : {},
              ...e.challenge ? { challenge: e.challenge } : {},
              label: e.label
            },
            wrapMeta: e.wrapMeta,
            passkey: e.passkey
          },
          o.signal,
          i
        );
        if (e.passkey === "unlock") {
          if (s.kind !== "unlock") throw new Error("authorization unlock result is missing");
          await xu({
            wrapMeta: e.wrapMeta,
            currentRpId: ft(),
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
    await jo(
      {
        title: e.title,
        subtitle: e.subtitle,
        body: e.body,
        details: e.details,
        confirmLabel: "common.continue"
      },
      t,
      void 0,
      n
    );
  });
}
function xm(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: J(t) } : {}
  };
}
function Ht(e, t) {
  if (typeof e == "string" && e.length > 0) return e;
  const n = Ee(e);
  if (n && typeof n.text == "string") return le(n.text);
  if (n && typeof n.key == "string") {
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
function vm(e) {
  if (e === void 0) return;
  const t = Ee(e);
  if (!t || !Array.isArray(t.rows)) throw new m("invalid_payload", "details must contain rows");
  const n = [];
  for (const [r, i] of t.rows.entries()) {
    const o = Ee(i);
    if (!o) throw new m("invalid_payload", `details.rows[${r}] must be an object`);
    const s = o.variant;
    if (s !== void 0 && s !== "text" && s !== "command" && s !== "mono" && s !== "chips")
      throw new m("invalid_payload", `details.rows[${r}].variant is invalid`);
    const a = Ht(o.label, `details.rows[${r}].label`);
    if (s === "chips") {
      if (!Array.isArray(o.values)) throw new m("invalid_payload", `details.rows[${r}].values must be an array`);
      const c = o.tone;
      if (c !== void 0 && c !== "default" && c !== "warning")
        throw new m("invalid_payload", `details.rows[${r}].tone is invalid`);
      const u = c === "default" || c === "warning" ? c : void 0;
      n.push({
        label: a,
        values: o.values.map((l, d) => Ht(l, `details.rows[${r}].values[${d}]`)),
        variant: "chips",
        ...u !== void 0 ? { tone: u } : {}
      });
      continue;
    }
    n.push({
      label: a,
      value: Ht(o.value, `details.rows[${r}].value`),
      ...s !== void 0 ? { variant: s } : {}
    });
  }
  return {
    rows: n
  };
}
function Em(e) {
  const t = Ee(e);
  if (!t) throw new m("invalid_payload", "authorization prompt must be an object");
  const n = t.challenge === void 0 ? void 0 : fe(xe(t.challenge, "prompt.challenge"));
  return {
    title: Ht(t.title, "prompt.title"),
    subtitle: Ht(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Ht(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: vm(t.details) } : {},
    ...n ? { challenge: n } : {},
    label: Ht(t.label, "prompt.label")
  };
}
function Sm(e) {
  return {
    ...e,
    prompt: xm(e.prompt)
  };
}
function km(e) {
  const t = Ee(e);
  if (!t) throw new m("invalid_payload", "authorization request must be an object");
  const n = t.passkey;
  if (n !== "none" && n !== "unlock" && n !== "uv")
    throw new m("invalid_payload", "authorization passkey requirement is invalid");
  return {
    prompt: Em(t.prompt),
    wrapMeta: xe(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function Am(e) {
  return Ha("authorize", e, Cl());
}
function _m(e) {
  const t = Ee(e);
  if (!t) throw new m("authorization_result_invalid", "authorization result is invalid");
  if (t.kind === "confirmed") return { kind: "confirmed" };
  if (t.kind === "unlock")
    return {
      kind: "unlock",
      prfOutput: xe(t.prfOutput, "result.prfOutput"),
      prfSalt: xe(t.prfSalt, "result.prfSalt")
    };
  throw new m("authorization_result_invalid", "authorization result kind is invalid");
}
function Im(e, t, n) {
  Mt(t);
  const r = n ?? Nl(), i = `avibe-vault-authorization-${r}`;
  return new Promise((o, s) => {
    let a = null, c = !1, u = null, l = null, d = null, h = null;
    const f = () => x(() => s(bn(t))), b = () => x(() => s(new m("authorization_cancelled", "requesting sandbox was unloaded", !0))), g = () => new m("authorization_window_closed", "authorization window was closed", !0), p = (_) => {
      a = _, l = setInterval(() => {
        !_.closed || d || (d = setTimeout(() => x(() => s(g())), 2500));
      }, 500);
    }, y = (_) => {
      if (_.origin !== window.location.origin) return;
      const I = _.data;
      if (!(!I || I.id !== r || !Qt(I.build)) && (!a && n && I.type === "authorization-ready" && _.source && (h && clearTimeout(h), h = null, p(_.source)), _.source === a))
        if (I.type === "authorization-ready")
          try {
            a?.postMessage(
              {
                type: "authorization-request",
                build: ie,
                id: r,
                request: Sm(e)
              },
              window.location.origin
            );
          } catch (S) {
            x(() => s(S));
          }
        else if (I.type === "authorization-approved")
          try {
            const S = _m(I.result);
            x(() => o(S));
          } catch (S) {
            x(() => s(S));
          }
        else I.type === "authorization-error" && x(() => s(new m(I.code, I.message, !!I.retryable)));
    }, x = (_) => {
      if (!c) {
        c = !0, u && clearTimeout(u), l && clearInterval(l), d && clearTimeout(d), h && clearTimeout(h), window.removeEventListener("message", y), window.removeEventListener("pagehide", b), t?.removeEventListener("abort", f);
        try {
          a && !a.closed && a.close();
        } catch {
        }
        _();
      }
    };
    if (window.addEventListener("message", y), window.addEventListener("pagehide", b, { once: !0 }), n)
      h = setTimeout(() => x(() => s(g())), cm);
    else {
      const _ = window.open(Am(r), i, "popup,width=520,height=760");
      if (!_) {
        x(() => s(new m("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      _.focus(), p(_);
    }
    if (u = setTimeout(
      () => x(() => s(new m("authorization_window_timeout", "authorization window timed out", !0))),
      am
    ), t) {
      if (t.aborted) {
        f();
        return;
      }
      t.addEventListener("abort", f, { once: !0 });
    }
  });
}
function Bm(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? Dn("context.minutes", { count: e / 60 }) : Dn("context.seconds", { count: e });
}
function fn(e, t) {
  const n = [];
  e.sessionLabel && n.push({ label: "context.session", value: le(e.sessionLabel) }), e.command && n.push({ label: "context.command", value: le(e.command), variant: "command" }), e.egress && n.push({ label: "context.egress", value: le(e.egress) });
  const r = [
    ...e.source?.env?.map((i) => le(`${Q("context.sourceEnv")}: ${i}`)) ?? [],
    ...e.source?.tags?.map((i) => le(`${Q("context.sourceTag")}: ${i}`)) ?? [],
    ...e.source?.skills?.map((i) => le(`${Q("context.sourceSkill")}: ${i}`)) ?? []
  ];
  return r.length > 0 && n.push({ label: "context.source", values: r, variant: "chips" }), t?.agentFingerprint && n.push({ label: "context.agent", value: le(t.agentFingerprint), variant: "mono" }), t?.grantId && n.push({ label: "context.grant", value: le(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && n.push({ label: "context.agentAccess", value: Bm(e.grantTtlSeconds) }), n.push({
    label: "context.secrets",
    values: e.secrets.map(
      (i) => le(`${i.name} · ${Q(i.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: n };
}
function Pm(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function $m(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function jl(e, t) {
  return Pm(e) ? !0 : $m(e) && dt(t).state === "locked";
}
async function Om(e, t = ve(), n) {
  await mu({ wrapMeta: e, currentRpId: ft(), policy: t, abortSignal: n });
}
async function Tm(e, t = ve()) {
  await Qn((n) => Om(e, t, n));
}
async function Dl(e) {
  try {
    await ds({ ...e, passkey: "unlock" });
  } catch (t) {
    throw dt(e.wrapMeta).state === "unlocked" && Me({ broadcast: !0, reason: "manual-lock" }), t;
  }
}
async function Lm(e, t) {
  if (dt(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await Tm(e);
  }
  return await Ro(t, { renewOnSuccess: !0 });
}
async function ql(e) {
  const t = dt(e.wrapMeta).state, n = ve(), r = $l({ tier: e.tier, vaultState: t, policy: n });
  let i = !1;
  const o = async () => {
    await Dl({
      ...e.lockedPrompt,
      wrapMeta: e.wrapMeta,
      policy: n,
      parentSurface: e.parentSurface,
      authorizationWindow: e.authorizationWindow
    }), i = !0;
  }, s = async (a, c = !1) => {
    let u = !1;
    try {
      const l = await Ro(
        async (d, h, f) => {
          const b = await e.buildPrompt(d, h, f);
          return r.confirm && !c && (await ds({
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
      throw i && !u && dt().state === "unlocked" && Me({ broadcast: !0, reason: "manual-lock" }), l;
    }
  };
  try {
    return r.passkey === "unlock" ? (await o(), await s("none", !0)) : await s(r.passkey === "uv" ? "uv" : "none");
  } catch (a) {
    if (r.passkey !== "unlock" && jl(a, e.wrapMeta))
      return await o(), await s("none", !0);
    throw a;
  }
}
function Fe(e, t) {
  if (e instanceof m) return e;
  if (Ny(e)) return new m("passkey_cancelled", "passkey-cancelled", !0);
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
function Rm(e) {
  return J(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function Cm(e) {
  return Ml(JSON.parse(new TextDecoder().decode(fe(e))));
}
function zm(e, t) {
  return Ha("setup", e, Cl(), { req: Rm(t) });
}
function Ti(e) {
  const t = Ee(e);
  return {
    credentialId: xe(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function fi(e) {
  return `${im}${e}`;
}
function pi(e) {
  return `${om}${e}`;
}
function Ca(e) {
  try {
    localStorage.removeItem(fi(e)), localStorage.removeItem(pi(e));
  } catch {
  }
}
function Um(e, t) {
  try {
    localStorage.setItem(fi(e), JSON.stringify({ build: ie, result: t })), localStorage.removeItem(pi(e));
  } catch {
  }
}
function Hm(e, t) {
  try {
    localStorage.setItem(
      pi(e),
      JSON.stringify({ build: ie, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(fi(e));
  } catch {
  }
}
function Vl(e) {
  if (window.self === window.top)
    return Uo({
      rpId: ft(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = Nl(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Ll}${t}`);
  let r = null;
  return Ca(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, u = null;
    const l = () => d(() => o(new m("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (g) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), u && clearTimeout(u), window.removeEventListener("visibilitychange", f), window.removeEventListener("focus", f), window.removeEventListener("storage", f), window.removeEventListener("message", b), window.removeEventListener("pagehide", l), n?.close(), Ca(t);
        try {
          r?.close();
        } catch {
        }
        g();
      }
    }, h = () => {
      let g = null, p = null;
      try {
        g = localStorage.getItem(fi(t)), p = localStorage.getItem(pi(t));
      } catch {
        return !1;
      }
      if (g) {
        try {
          const y = Ee(JSON.parse(g));
          if (!Qt(y.build)) throw new m("sandbox_build_mismatch");
          const x = Ti(y.result);
          d(() => i(x));
        } catch (y) {
          const x = y instanceof Error ? y.message : "stored setup result is invalid";
          d(() => o(new m("setup_storage_invalid", x)));
        }
        return !0;
      }
      if (p) {
        try {
          const y = Ee(JSON.parse(p));
          if (!Qt(y.build)) throw new m("sandbox_build_mismatch");
          d(
            () => o(new m(xe(y.code, "code"), zl(y.message, "message"), !!y.retryable))
          );
        } catch (y) {
          const x = y instanceof Error ? y.message : "stored setup error is invalid";
          d(() => o(new m("setup_storage_invalid", x)));
        }
        return !0;
      }
      return !1;
    }, f = () => {
      h();
    }, b = (g) => {
      if (g.origin !== window.location.origin || g.source !== r) return;
      const p = g.data;
      !p || p.id !== t || !Qt(p.build) || (p.type === "setup-created" ? d(() => i(Ti(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      h() || d(() => o(new m("setup_window_timeout", "setup window timed out", !0)));
    }, sm), c = setInterval(() => {
      !r?.closed || u || h() || (u = setTimeout(() => {
        h() || d(() => o(new m("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (g) => {
      const p = g.data;
      !p || p.id !== t || !Qt(p.build) || (p.type === "setup-created" ? d(() => i(Ti(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", f), window.addEventListener("focus", f), window.addEventListener("storage", f), window.addEventListener("message", b), window.addEventListener("pagehide", l, { once: !0 }), r = window.open(zm(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
      d(() => o(new m("setup_popup_blocked", "setup window was blocked", !0)));
      return;
    }
    r.focus();
  });
}
function bn(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Mt(e) {
  if (e?.aborted) throw bn(e);
}
function Mm() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function za(e) {
  return Mm() && gu(e);
}
async function Gl(e, t, n, r, i = ve()) {
  const o = Eh();
  let s, a;
  try {
    Mt(r), s = (await zo([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, Mt(r), a = vh();
    const u = await Ah(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    Mt(r);
    let l = Bh(u, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (l = Oh(l, await $h(a, e.rootMetadata, l)), Mt(r));
    const d = du({
      vmk: a,
      wrapMeta: l,
      freshSetup: !e.existingProtectedVault,
      scopeId: gy(e.vaultUserHandle),
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
function Nm(e, t, n) {
  return Qn((r) => {
    const i = No(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody"
    ), o = qn("setup.createPasskey"), s = wu("setup.ready");
    return en(i.card, o), en(i.card, s), new Promise((a, c) => {
      let u = !1, l = "create", d = null, h = !1;
      const f = (S) => {
        u || (u = !0, r.removeEventListener("abort", p), Fo(), S());
      }, b = (S) => {
        f(() => c(S));
      }, g = (S) => {
        u || (l = "create", d = null, G(o, "setup.createPasskey"), o.disabled = !1, G(s, S));
      }, p = () => {
        b(bn(r));
      }, y = (S) => {
        if (S instanceof m && S.code === "setup_popup_blocked") {
          g("setup.popupBlocked");
          return;
        }
        b(S);
      }, x = () => {
        h = !0, o.disabled = !0, G(s, "setup.popupPrompt");
        let S;
        try {
          S = Vl(e);
        } catch (O) {
          y(O);
          return;
        }
        S.then(
          (O) => {
            u || (d = O, l = "finish", G(o, "setup.finish"), o.disabled = !1, G(s, "setup.createdFinish"));
          },
          (O) => {
            y(O);
          }
        );
      }, _ = (S) => {
        o.disabled = !0, G(s, "setup.passkeyPrompt"), Gl(e, t, S, r, n).then(
          (O) => f(() => a(O)),
          (O) => b(O)
        );
      }, I = () => {
        o.disabled = !0, G(s, "setup.passkeyPrompt");
        let S;
        try {
          S = Uo({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (O) {
          if (za(O)) {
            x();
            return;
          }
          b(O);
          return;
        }
        S.then(
          (O) => _(O),
          (O) => {
            if (za(O)) {
              x();
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
            _(d);
            return;
          }
          if (h) {
            x();
            return;
          }
          I();
        }
      });
    });
  });
}
async function Fm(e) {
  const t = Ml(e);
  try {
    const n = ft(), r = t.policy ?? ve(), i = window.self !== window.top ? await Nm(t, n, r) : await Gl(t, n, await Vl(t), void 0, r), o = t.policy ? Oo(r) : ve();
    return { ...i, policy: o };
  } catch (n) {
    throw Fe(n, "setup_failed");
  }
}
async function Km(e) {
  const t = hm(e);
  try {
    const n = ft(), r = t.policy ?? ve(), i = await Qn(async (s) => {
      let a;
      if (await jo(
        {
          title: "unlock.sessionTitle",
          subtitle: Dn("unlock.sessionSubtitle", {
            minutes: r.windowSeconds / 60
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue"
        },
        s,
        void 0,
        async () => {
          a = await mu({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? Oo(r) : ve();
    return { ...i, policy: o };
  } catch (n) {
    throw Fe(n, "unlock_failed");
  }
}
async function jm(e) {
  const t = ng(e);
  t.wrapMeta && Co(t.wrapMeta);
  try {
    if (t.kind === "static" && !ve().parentValueSealAllowed)
      throw new m("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await Lm(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await em({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await tm({ name: t.name, curve: t.curve, vmk: n, wrapMeta: r }), establishingVmk: Sy() }));
  } catch (n) {
    throw Fe(n, "seal_failed");
  }
}
async function Dm(e, t) {
  const n = ym(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = cn(n.material.envelope);
    if (o?.kind === "keypair") throw new Error("keypair protected records cannot be revealed as plaintext");
    return Di({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await ql({
      tier: "R2",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: le(n.material.name),
        body: "reveal.confirmBody",
        details: fn(n.context.display),
        label: "common.continue"
      },
      buildPrompt: async (s, a) => {
        const c = await Ao(a, s);
        return Gr({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), Di({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), Wr([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: le(n.material.name),
          body: "reveal.confirmBody",
          details: fn(n.context.display),
          challenge: await Ra(oi(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const u = await Gc(r, s, So(n.material.name, o));
        try {
          c.assertCurrent(), await si([n.context]), await Jy({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: ve().strictApprovals ? async (l) => {
              await Kl({
                wrapMeta: a,
                challenge: await Ra(`reveal-copy:${n.context.requestId}:${n.material.name}`),
                abortSignals: [l, c.signal]
              }), Mt(l), Mt(c.signal);
            } : void 0
          });
        } finally {
          u.fill(0);
        }
        return { completed: !0 };
      }
    });
  } catch (r) {
    throw Fe(r, "reveal_failed");
  }
}
async function qm(e, t) {
  try {
    const n = J0(e), { request: r, verified: i, unpacked: { vmkWrapMeta: o } } = n;
    return await ql({
      tier: "R3",
      wrapMeta: o,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "sign.title",
        subtitle: le(r.material.name),
        body: le(i.display),
        details: fn(r.context.display),
        label: "sign.confirm"
      },
      buildPrompt: async (s, a) => (await Pl(n, s, a), {
        title: "sign.title",
        subtitle: le(r.material.name),
        body: le(i.display),
        details: fn(r.context.display),
        challenge: new Uint8Array(n.challenge),
        label: "sign.confirm"
      }),
      operation: (s, a) => Q0(n, s, a),
      beforeSuccess: () => si([r.context])
    });
  } catch (n) {
    throw Fe(n, "sign_failed");
  }
}
async function Vm(e, t) {
  const n = gm(e);
  try {
    const i = cn(n.items[0].material.envelope).vmkWrapMeta;
    for (const h of n.items) {
      const f = cn(h.material.envelope);
      if (f.vmkWrapMeta !== i) throw new m("invalid_payload", "approveRelease items must share one VMK context");
      if (!Ol(f.recordMetadata)) throw new m("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = Tl(n.items), s = dt(i).state, a = ve(), c = $l({ tier: "R2", vaultState: s, policy: a });
    let u = !1;
    const l = async () => {
      await Dl({
        title: "release.title",
        subtitle: Dn("release.subtitle", { count: n.items.length }),
        details: fn(o.display, o.recipient),
        label: "release.confirm",
        wrapMeta: i,
        policy: a,
        parentSurface: t.latestSurface,
        authorizationWindow: t.takeAuthorizationWindow
      }), u = !0;
    }, d = async (h, f = !1) => {
      let b = !1, g;
      try {
        const p = await Ro(
          async (y, x, _) => {
            const I = await rm({
              items: n.items,
              vmk: y,
              wrapMeta: x,
              consumeReplayIds: !1,
              onApprovalAccepted: (S) => {
                g = S;
              },
              confirm: (S) => !c.confirm || f ? Promise.resolve() : ds({
                title: "release.title",
                subtitle: Dn("release.subtitle", { count: n.items.length }),
                details: fn(S.display, S.recipient),
                challenge: S.challenge,
                label: "release.confirm",
                wrapMeta: x,
                passkey: h,
                abortSignal: _.signal,
                parentSurface: t.latestSurface,
                authorizationWindow: t.takeAuthorizationWindow
              })
            });
            return _.assertCurrent(), I;
          },
          {
            renewOnSuccess: c.renewOnSuccess,
            beforeSuccess: () => si(n.items.map((y) => y.context), g)
          }
        );
        return b = !0, p;
      } catch (p) {
        throw u && !b && dt().state === "unlocked" && Me({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await l(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (h) {
      if (c.passkey !== "unlock" && jl(h, i))
        return await l(), await d("none", !0);
      throw h;
    }
  } catch (r) {
    throw Fe(r, "approve_release_failed");
  }
}
async function Gm(e) {
  const t = bm(e);
  try {
    const n = await Uy(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw Fe(n, "delete_authz_failed");
  }
}
function Wm() {
  const e = Ji();
  if (e.get("mode") !== "setup") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && di({ locale: t, theme: n });
  const r = e.get("id"), i = document.getElementById("page"), o = i?.querySelector(".card"), s = i?.querySelector("h1"), a = i?.querySelector(".sub"), c = i?.querySelector(".body");
  if (!r || !o || !s || !a || !c) return;
  document.body.classList.add("setup-mode"), G(s, "setup.title"), G(a, "setup.subtitle"), G(c, "setup.topLevelBody");
  const u = document.createElement("button");
  u.type = "button", u.className = "action", G(u, "setup.createPasskey");
  const l = document.createElement("p");
  l.className = "setup-status", G(l, "setup.readyOnOrigin"), o.append(u, l);
  const d = new URLSearchParams(window.location.hash.slice(1)).get("req");
  if (!d) {
    u.disabled = !0, G(l, "setup.requestMissing");
    return;
  }
  let h;
  try {
    h = Cm(d);
  } catch {
    u.disabled = !0, G(l, "setup.requestInvalid");
    return;
  }
  const f = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Ll}${r}`), b = (g) => {
    const p = Fe(g, "setup_create_failed"), y = {
      type: "setup-error",
      build: ie,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    Hm(r, p), f?.postMessage(y);
    try {
      window.opener?.postMessage(y, window.location.origin);
    } catch {
    }
    u.disabled = !1, G(l, le(p.message));
  };
  u.addEventListener("click", () => {
    u.disabled = !0, G(l, "setup.passkeyPrompt");
    let g;
    try {
      g = Uo({
        rpId: ft(),
        vaultUserHandle: h.vaultUserHandle,
        displayName: h.displayName,
        authzCreationOptions: h.authzCreationOptions
      });
    } catch (p) {
      b(p);
      return;
    }
    g.then((p) => {
      const y = { type: "setup-created", build: ie, id: r, result: p };
      Um(r, p), f?.postMessage(y);
      try {
        window.opener?.postMessage(y, window.location.origin);
      } catch {
      }
      G(l, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(b);
  });
}
function Zm() {
  const e = Ji();
  if (e.get("mode") !== "authorize") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && di({ locale: t, theme: n });
  const r = e.get("id"), o = document.getElementById("page")?.querySelector(".card"), s = o?.querySelector(".body");
  if (!r || !o || !s || (s.classList.add("waiting"), G(s, window.opener ? "authorize.waiting" : "authorize.waitingLong"), !window.opener)) return;
  const a = () => {
    const p = window.opener;
    if (!p) return [];
    const y = [p];
    try {
      for (let x = 0; x < p.frames.length; x += 1) y.push(p.frames[x]);
    } catch {
    }
    return y;
  };
  let c = null;
  const u = (p) => {
    try {
      c?.postMessage(p, window.location.origin);
    } catch {
    }
  };
  let l = !1, d = null;
  const h = setTimeout(() => G(s, "authorize.waitingLong"), um), f = () => {
    if (!l)
      for (const p of a())
        try {
          p.postMessage({ type: "authorization-ready", build: ie, id: r }, window.location.origin);
        } catch {
        }
  }, b = (p) => {
    if (l) return;
    l = !0, d && clearInterval(d), clearTimeout(h), s.classList.remove("waiting"), window.removeEventListener("message", g), document.body.classList.add("setup-mode");
    const y = new AbortController();
    let x = { kind: "confirmed" };
    const _ = async () => {
      if (p.passkey === "none") return;
      if (p.passkey === "uv") {
        if (!p.prompt.challenge) throw new m("invalid_payload", "authorization challenge is missing");
        await Kl({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [y.signal]
        });
        return;
      }
      const I = await zo(vo(p.wrapMeta), ft(), y.signal);
      x = {
        kind: "unlock",
        prfOutput: J(I.prfOutput),
        prfSalt: J(I.prfSalt)
      }, I.prfOutput.fill(0);
    };
    jo(
      {
        title: p.prompt.title,
        subtitle: p.prompt.subtitle,
        body: p.prompt.body,
        details: p.prompt.details,
        confirmLabel: p.prompt.label
      },
      y.signal,
      void 0,
      _
    ).then(
      () => {
        u({ type: "authorization-approved", build: ie, id: r, result: x }), setTimeout(() => window.close(), 250);
      },
      (I) => {
        const S = Fe(I, I instanceof Error && I.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed");
        u({
          type: "authorization-error",
          build: ie,
          id: r,
          code: S.code,
          message: S.message,
          retryable: S.retryable
        }), setTimeout(() => window.close(), 250);
      }
    );
  }, g = (p) => {
    if (p.origin !== window.location.origin) return;
    const y = p.data;
    if (!y || y.type !== "authorization-request" || y.id !== r || !Qt(y.build)) return;
    const x = a().find((_) => _ === p.source);
    if (x) {
      c = x;
      try {
        b(km(y.request));
      } catch (_) {
        const I = Fe(_, "authorization_request_invalid");
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
  window.addEventListener("message", g), f(), d = setInterval(f, 500);
}
function Xm() {
  if (window.self !== window.top || Ji().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && G(e, "sandbox.intro");
}
Ae.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new m("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== ie.buildHash)
    throw new m("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = dm(t.appearance);
  r && di(r);
  const i = La ? ve() : Oo(t.policy === void 0 ? void 0 : $o(t.policy));
  return La = !0, {
    accepted: !0,
    channel: Rt,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: ie,
    policy: i
  };
});
Ae.register("set-appearance", (e) => (di(Rl(e)), { accepted: !0 }));
Ae.register("status", (e) => {
  const t = pm(e);
  try {
    t.wrapMeta && dt(t.wrapMeta);
    const n = dt(), r = ve();
    return {
      ...n,
      policy: r,
      session: {
        ...n.expiresAt !== void 0 ? { expiresAt: n.expiresAt } : {},
        strict: r.strictApprovals
      }
    };
  } catch (n) {
    throw Fe(n, "invalid_wrap_meta");
  }
});
Ae.register("setup", Fm);
Ae.register("unlock", Km);
Ae.register("lock", () => ({ ...Me({ broadcast: !0, reason: "manual-lock" }), policy: ve() }));
Ae.register("seal", jm);
Ae.register("reveal", Dm);
Ae.register("sign", qm);
Ae.register("approveRelease", Vm);
Ae.register("deleteAuthzAssertion", Gm);
hy((e) => Ae.emit("vault.state", e));
Vy((e) => Ae.emit(e));
await ed();
Ae.start();
window.addEventListener("pagehide", ky);
Wm();
Zm();
Xm();
window.self !== window.top && document.body.classList.add("embedded");
const Wl = globalThis.crypto, Ym = { webcrypto: Wl }, Zl = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Ym,
  webcrypto: Wl
}, Symbol.toStringTag, { value: "Module" }));
