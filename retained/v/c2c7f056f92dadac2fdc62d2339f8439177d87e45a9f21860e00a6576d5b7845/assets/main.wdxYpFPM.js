const Ct = "avibe.vault.crypto";
const ie = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "c2c7f056f92dadac2fdc62d2339f8439177d87e45a9f21860e00a6576d5b7845"
};
class m extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function ms(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function rd(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === Ct && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const id = /^[A-Za-z0-9_-]{16,128}$/;
function Da(e) {
  return typeof e == "object" && e !== null;
}
function od(e) {
  return Da(e) ? e.channel === Ct && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class sd {
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
        channel: Ct,
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
      channel: Ct,
      version: 2,
      build: ie,
      capabilities: {
        operations: Array.from(this.handlers.keys())
      }
    });
  }
  async onMessage(t) {
    if (!ms(t.origin)) return;
    if (od(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!rd(t.data)) return;
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
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !id.test(n.authorizationWindow))) {
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
        channel: Ct,
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
    if (t.op !== "handshake" || !Da(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !ms(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
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
    return { channel: Ct, version: 2, id: t, ok: !1, error: { code: n, message: r, retryable: i } };
  }
  reply(t, n) {
    !t || this.pinnedParentOrigin === null || t.postMessage(n, this.pinnedParentOrigin);
  }
  postToParent(t, n) {
    t.postMessage(n, "*");
  }
}
function no() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function ja(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return ie.buildHash !== "dev" && (i.pathname = `/v/${ie.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function tn(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === ie.buildHash && t.sandboxVersion === ie.sandboxVersion;
}
async function ad() {
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
class De extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class Ge extends De {
}
class xr extends De {
}
class rr extends De {
}
class cd extends De {
}
class ud extends De {
}
class ld extends De {
}
class dd extends De {
}
class fd extends De {
}
class pd extends De {
}
class hd extends De {
}
class ro extends De {
}
const yd = {}, Va = gd(globalThis, yd);
function gd(e, t) {
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
async function wd() {
  if (Va !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => nd);
    return e.subtle;
  } catch (e) {
    throw new ro(e);
  }
}
class io {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await wd());
  }
}
const yt = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, vs = {
  DhkemX25519HkdfSha256: 32
}, qa = {
  HkdfSha256: 1
}, oo = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, Br = 8192, bd = 268435456, xs = 32, be = /* @__PURE__ */ new Uint8Array(0), We = 0n, Wt = 1n, ir = 2n, md = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), Es = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function Er(e) {
  return new Uint8Array(Z(e));
}
function Z(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class vd extends io {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: qa.HkdfSha256
    }), Object.defineProperty(this, "hashSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "_suiteId", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: be
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
    return r.set(Es, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(Es, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t);
    if (r.byteLength !== this.hashSize)
      throw new Ge("The salt length must be the same as the hashSize");
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
    let c = be;
    const u = Er(n), l = new Uint8Array(1);
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
    if (this._suiteId === be)
      throw new Error("Not initialized. Call init()");
  }
}
class Ga extends vd {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: qa.HkdfSha256
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
const En = (e) => typeof e == "object" && e !== null && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function Rn(e, t) {
  if (t <= 0)
    throw new Error("i2Osp: too small size");
  if (e >= 256 ** t)
    throw new Error("i2Osp: too large integer");
  const n = new Uint8Array(t);
  for (let r = 0; r < t && e; r++)
    n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
  return n;
}
function or(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function Ss(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function xd() {
  if (typeof Va < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => nd);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function Ed(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const Sd = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), kd = /* @__PURE__ */ new Uint8Array([
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
function Ad(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class _d {
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
    const i = new Uint8Array(md);
    i.set(Rn(this.id, 2), 3), this._kdf.init(i);
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
    if (n.byteLength > Br)
      throw new Ge("Too long ikm");
    return await this._prim.deriveKeyPair(n);
  }
  async encap(t) {
    let n;
    t.ekm === void 0 ? n = await this.generateKeyPair() : En(t.ekm) ? n = t.ekm : n = await this.deriveKeyPair(t.ekm);
    const r = await this._prim.serializePublicKey(n.publicKey), i = await this._prim.serializePublicKey(t.recipientPublicKey);
    try {
      let o;
      if (t.senderKey === void 0)
        o = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey));
      else {
        const c = En(t.senderKey) ? t.senderKey.privateKey : t.senderKey, u = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey)), l = new Uint8Array(await this._prim.dh(c, t.recipientPublicKey));
        o = or(u, l);
      }
      let s;
      if (t.senderKey === void 0)
        s = or(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = En(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), u = await this._prim.serializePublicKey(c);
        s = Ad(new Uint8Array(r), new Uint8Array(i), new Uint8Array(u));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new cd(o);
    }
  }
  async decap(t) {
    const n = Z(t.enc), r = await this._prim.deserializePublicKey(n), i = En(t.recipientKey) ? t.recipientKey.privateKey : t.recipientKey, o = En(t.recipientKey) ? t.recipientKey.publicKey : await this._prim.derivePublicKey(t.recipientKey), s = await this._prim.serializePublicKey(o);
    try {
      let a;
      if (t.senderPublicKey === void 0)
        a = new Uint8Array(await this._prim.dh(i, r));
      else {
        const u = new Uint8Array(await this._prim.dh(i, r)), l = new Uint8Array(await this._prim.dh(i, t.senderPublicKey));
        a = or(u, l);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = or(new Uint8Array(n), new Uint8Array(s));
      else {
        const u = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + u.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(u), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new ud(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(Sd, t), i = this._kdf.buildLabeledInfo(kd, n, this.secretSize);
    return await this._kdf.extractAndExpand(be, r, i, this.secretSize);
  }
}
const sr = ["deriveBits"], Id = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), Pd = /* @__PURE__ */ new Uint8Array([115, 107]);
class Zt {
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
class Bd {
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
      return Promise.reject(new xr(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(Z(t), !0);
    } catch (n) {
      throw new rr(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new xr(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(Z(t), !1);
    } catch (n) {
      throw new rr(n);
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
      throw new rr(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new Zt(this._algName, t, "private", sr);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new ro(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = Z(t), r = await this._hkdf.labeledExtract(be.buffer, Id, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, Pd, be, this._nSk), o = new Zt(this._algName, new Uint8Array(i), "private", sr);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new hd(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new Zt(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new rr(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new xr(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new Zt(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : sr));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new Zt(this._algName, Ss(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new Zt(this._algName, Ss(t.d), "private", sr)));
    });
  }
}
const $d = ["encrypt", "decrypt"];
function Od(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Mn(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function ut(e, t, n = "") {
  const r = Od(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function $r(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Td(e, t) {
  ut(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function Ld(e) {
  if (typeof e == "bigint") {
    if (!Sr(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    Mn(e);
  return e;
}
function Or(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const Rd = /* @__PURE__ */ new Uint32Array([287454020]), Cd = /* @__PURE__ */ new Uint8Array(Rd.buffer);
Cd[0];
function wi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function je(e, t) {
  return e << 32 - t | e >>> t;
}
const Wa = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", zd = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), Ud = [
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
function Hd(e) {
  if (ut(e), Wa)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += zd[e[n]];
  return t;
}
const it = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Ui(e) {
  if (e >= it._0 && e <= it._9)
    return e - it._0;
  if (e >= it.A && e <= it.F)
    return e - (it.A - 10);
  if (e >= it.a && e <= it.f)
    return e - (it.a - 10);
}
function Md(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Wa)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Ui(e.charCodeAt(o)), a = Ui(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Nd(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = We;
  for (let n = 0; n < e.length; n++) {
    const r = Ui(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | Ud[r];
  }
  return t;
}
function Fd(e) {
  Mn(e, "numberToBigint");
  let t = e, n = We, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function ks(e) {
  return Nd(Hd(Hi(ut(e)).reverse()));
}
function Kd(e, t) {
  Mn(t), e = Ld(e);
  const n = Md(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function Dd(e, t) {
  return Kd(e, t).reverse();
}
function Hi(e) {
  return Uint8Array.from(e);
}
function Sr(e) {
  return typeof e == "bigint" && We <= e;
}
function jd(e, t, n) {
  return Sr(e) && Sr(t) && Sr(n) && t <= e && e < n;
}
function As(e, t, n, r) {
  if (!jd(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Vd(e, t = {}, n = {}) {
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
async function qd(e = 32) {
  const t = await xd(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function Gd(e) {
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
function Wd(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  Mn(e.outputLen), Mn(e.blockLen);
}
function Zd(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let Za = class {
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
    }), Wd(t), ut(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Or(i);
  }
  update(t) {
    return $r(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    $r(this), ut(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const Xa = (e, t, n) => new Za(e, t).update(n).digest();
Xa.create = (e, t) => new Za(e, t);
function Xd(e, t, n) {
  return e & t ^ ~e & n;
}
function Yd(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Jd = class {
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
    }), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = wi(this.buffer);
  }
  update(t) {
    $r(this), ut(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = wi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    $r(this), Td(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Or(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, Fd(this.length * 8), o), this.process(r, 0);
    const a = wi(t), c = this.outputLen;
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
const gt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Qd = /* @__PURE__ */ Uint32Array.from([
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
let ef = class extends Jd {
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
      wt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = wt[d - 15], f = wt[d - 2], w = je(h, 7) ^ je(h, 18) ^ h >>> 3, g = je(f, 17) ^ je(f, 19) ^ f >>> 10;
      wt[d] = g + wt[d - 7] + w + wt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = je(a, 6) ^ je(a, 11) ^ je(a, 25), f = l + h + Xd(a, c, u) + Qd[d] + wt[d] | 0, g = (je(r, 2) ^ je(r, 13) ^ je(r, 22)) + Yd(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Or(wt);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Or(this.buffer);
  }
}, tf = class extends ef {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: gt[7] | 0
    });
  }
};
const nf = /* @__PURE__ */ Zd(
  () => new tf(),
  /* @__PURE__ */ Gd(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Ya(e, t) {
  const n = e % t;
  return n >= We ? n : t + n;
}
function Te(e, t, n) {
  let r = e;
  for (; t-- > We; )
    r *= r, r %= n;
  return r;
}
function rf(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function of(e) {
  return Vd(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function sf(e) {
  const t = of(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || qd, u = a ? 255n : 448n, l = a ? 32 : 56, d = a ? 9n : 5n, h = a ? 121665n : 39081n, f = a ? ir ** 254n : ir ** 447n, w = a ? 8n * ir ** 251n - Wt : 4n * ir ** 445n - Wt, g = f + w + Wt, p = (A) => Ya(A, n), y = v(d);
  function v(A) {
    return Dd(p(A), l);
  }
  function _(A) {
    const x = Hi(ut(A, l, "uCoordinate"));
    return a && (x[31] &= 127), p(ks(x));
  }
  function I(A) {
    return ks(i(Hi(ut(A, l, "scalar"))));
  }
  function S(A, x) {
    const E = j(_(x), I(A));
    if (E === We)
      throw new Error("invalid private or public key received");
    return v(E);
  }
  function O(A) {
    return S(A, y);
  }
  const L = O, R = S;
  function U(A, x, E) {
    const P = p(A * (x - E));
    return x = p(x - P), E = p(E + P), { x_2: x, x_3: E };
  }
  function j(A, x) {
    As("u", A, We, n), As("scalar", x, f, g);
    const E = x, P = A;
    let $ = Wt, B = We, T = A, C = Wt, H = We;
    for (let M = u - 1n; M >= We; M--) {
      const ee = E >> M & Wt;
      H ^= ee, { x_2: $, x_3: T } = U(H, $, T), { x_2: B, x_3: C } = U(H, B, C), H = ee;
      const te = $ + B, ne = p(te * te), Y = $ - B, he = p(Y * Y), rt = ne - he, Ot = T + C, Gt = T - C, vn = p(Gt * te), xn = p(Ot * Y), ws = vn + xn, bs = vn - xn;
      T = p(ws * ws), C = p(P * p(bs * bs)), $ = p(ne * he), B = p(rt * (ne + p(h * rt)));
    }
    ({ x_2: $, x_3: T } = U(H, $, T)), { x_2: B, x_3: C } = U(H, B, C);
    const G = o(B);
    return p($ * G);
  }
  const z = {
    secretKey: l,
    publicKey: l,
    seed: l
  }, b = async (A) => (A === void 0 && (A = await c(l)), ut(A, z.seed, "seed"), A), k = { randomSecretKey: b };
  return Object.freeze({
    keygen: rf(b, L),
    getSharedSecret: R,
    getPublicKey: L,
    scalarMult: S,
    scalarMultBase: O,
    utils: k,
    GuBytes: y.slice(),
    lengths: z
  });
}
class af extends io {
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
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, $d);
  }
}
class cf {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: oo.Aes128Gcm
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
    return new af(t);
  }
}
class uf extends cf {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: oo.Aes256Gcm
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
function _s() {
  return new Promise((e, t) => {
    t(new ro("Not supported"));
  });
}
const lf = new Uint8Array([115, 101, 99]);
class so {
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
    return await _s();
  }
  async open(t, n) {
    return await _s();
  }
  async export(t, n) {
    const r = Z(t);
    if (r.byteLength > Br)
      throw new Ge("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, lf, new Uint8Array(r), n);
    } catch (i) {
      throw new ld(i);
    }
  }
}
class df extends so {
}
class ff extends so {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Ja extends so {
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
    const n = Rn(t.seq, t.baseNonce.byteLength);
    return Ed(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new pd("Message limit reached");
    t.seq += 1;
  }
}
var pf = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, hf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, kr;
class Qa {
  constructor() {
    kr.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = pf(this, kr, "f");
    return hf(this, kr, n, "f"), await r, t;
  }
}
kr = /* @__PURE__ */ new WeakMap();
var Is = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, yf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Bn;
class gf extends Ja {
  constructor() {
    super(...arguments), Bn.set(this, void 0);
  }
  async open(t, n = be.buffer) {
    yf(this, Bn, Is(this, Bn, "f") ?? new Qa(), "f");
    const r = await Is(this, Bn, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new fd(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
Bn = /* @__PURE__ */ new WeakMap();
var Ps = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, wf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, $n;
class bf extends Ja {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), $n.set(this, void 0), this.enc = i;
  }
  async seal(t, n = be.buffer) {
    wf(this, $n, Ps(this, $n, "f") ?? new Qa(), "f");
    const r = await Ps(this, $n, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new dd(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
$n = /* @__PURE__ */ new WeakMap();
const mf = new Uint8Array([
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
]), vf = new Uint8Array([101, 120, 112]), xf = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), Ef = new Uint8Array([107, 101, 121]), Sf = new Uint8Array([
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
]), kf = new Uint8Array([115, 101, 99, 114, 101, 116]), Af = new Uint8Array([
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
class _f extends io {
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
      throw new Ge("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new Ge("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new Ge("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(Af), this._suiteId.set(Rn(this._kem.id, 2), 4), this._suiteId.set(Rn(this._kdf.id, 2), 6), this._suiteId.set(Rn(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
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
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? yt.AuthPsk : yt.Psk : r = t.senderKey !== void 0 ? yt.Auth : yt.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
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
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? yt.AuthPsk : yt.Psk : r = t.senderPublicKey !== void 0 ? yt.Auth : yt.Base, await this._keyScheduleR(r, n, t);
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
  async seal(t, n, r = be.buffer) {
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
  async open(t, n, r = be.buffer) {
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
    const i = r.psk === void 0 ? be : Er(r.psk.id), o = await this._kdf.labeledExtract(be, Sf, i), s = r.info === void 0 ? be : Er(r.info), a = await this._kdf.labeledExtract(be, xf, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const u = r.psk === void 0 ? be : Er(r.psk.key), l = this._kdf.buildLabeledIkm(kf, u), d = this._kdf.buildLabeledInfo(vf, c, this._kdf.hashSize), h = await this._kdf.extractAndExpand(n, l, d, this._kdf.hashSize);
    if (this._aead.id === oo.ExportOnly)
      return { aead: this._aead, exporterSecret: h };
    const f = this._kdf.buildLabeledInfo(Ef, c, this._aead.keySize), w = await this._kdf.extractAndExpand(n, l, f, this._aead.keySize), g = this._kdf.buildLabeledInfo(mf, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, l, g, this._aead.nonceSize);
    return {
      aead: this._aead,
      exporterSecret: h,
      key: w,
      baseNonce: new Uint8Array(p),
      seq: 0
    };
  }
  async _keyScheduleS(t, n, r, i) {
    const o = await this._keySchedule(t, n, i);
    return o.key === void 0 ? new ff(this._api, this._kdf, o.exporterSecret, r) : new bf(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new df(this._api, this._kdf, i.exporterSecret) : new gf(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > bd)
      throw new Ge("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < xs)
        throw new Ge(`PSK must have at least ${xs} bytes`);
      if (t.psk.key.byteLength > Br)
        throw new Ge("Too long psk.key");
      if (t.psk.id.byteLength > Br)
        throw new Ge("Too long psk.id");
    }
  }
}
class If extends _f {
}
let Pf = class extends Ga {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Bf = 1n, Bs = 2n, $f = 3n, Of = 5n, ec = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function Tf(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = ec, a = e * e % o * e % o, c = Te(a, Bs, o) * a % o, u = Te(c, Bf, o) * e % o, l = Te(u, Of, o) * u % o, d = Te(l, t, o) * l % o, h = Te(d, n, o) * d % o, f = Te(h, r, o) * h % o, w = Te(f, i, o) * f % o, g = Te(w, i, o) * f % o, p = Te(g, t, o) * l % o;
  return { pow_p_5_8: Te(p, Bs, o) * e % o, b2: a };
}
function Lf(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Rf = /* @__PURE__ */ (() => {
  const e = ec;
  return sf({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = Tf(t);
      return Ya(Te(n, $f, e) * r, e);
    },
    adjustScalarBytes: Lf
  });
})();
class Cf extends Ga {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t), i = Z(n);
    if (r.byteLength !== this.hashSize)
      return Xa(nf, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class zf extends Bd {
  constructor(t) {
    super("X25519", 32, Rf, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new xr(r));
    }
  }
}
class Uf extends _d {
  constructor() {
    const t = new Cf();
    super(vs.DhkemX25519HkdfSha256, new zf(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: vs.DhkemX25519HkdfSha256
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
function tc(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Je(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function Qe(e, t, n = "") {
  const r = tc(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, u = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(u) : new TypeError(u);
  }
  return e;
}
function nc(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (Je(e.outputLen), Je(e.blockLen), e.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (e.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function an(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function ao(e, t) {
  Qe(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function Hf(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function et(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function bi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Ve(e, t) {
  return e << 32 - t | e >>> t;
}
function ar(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const Mf = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Nf(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Ff(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Nf(e[t]);
  return e;
}
const $s = Mf ? (e) => e : Ff, rc = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Kf = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function co(e) {
  if (Qe(e), rc)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Kf[e[n]];
  return t;
}
const ot = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Os(e) {
  if (e >= ot._0 && e <= ot._9)
    return e - ot._0;
  if (e >= ot.A && e <= ot.F)
    return e - (ot.A - 10);
  if (e >= ot.a && e <= ot.f)
    return e - (ot.a - 10);
}
function uo(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (rc)
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
    const s = Os(e.charCodeAt(o)), a = Os(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Df(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    Qe(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function Qr(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function lo(e = 32) {
  Je(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const ic = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function jf(e, t, n) {
  return e & t ^ ~e & n;
}
function Vf(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let fo = class {
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
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = bi(this.buffer);
  }
  update(t) {
    an(this), Qe(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = bi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    an(this), ao(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, et(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = bi(t), c = this.outputLen;
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
]), cr = /* @__PURE__ */ BigInt(2 ** 32 - 1), Ts = /* @__PURE__ */ BigInt(32);
function qf(e, t = !1) {
  return t ? { h: Number(e & cr), l: Number(e >> Ts & cr) } : { h: Number(e >> Ts & cr) | 0, l: Number(e & cr) | 0 };
}
function oc(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = qf(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Ls = (e, t, n) => e >>> n, Rs = (e, t, n) => e << 32 - n | t >>> n, Xt = (e, t, n) => e >>> n | t << 32 - n, Yt = (e, t, n) => e << 32 - n | t >>> n, ur = (e, t, n) => e << 64 - n | t >>> n - 32, lr = (e, t, n) => e >>> n - 32 | t << 64 - n, Gf = (e, t, n) => e << n | t >>> 32 - n, Wf = (e, t, n) => t << n | e >>> 32 - n, Zf = (e, t, n) => t << n - 32 | e >>> 64 - n, Xf = (e, t, n) => e << n - 32 | t >>> 64 - n;
function st(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Yf = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), Jf = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, Qf = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), ep = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, tp = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), np = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, rp = /* @__PURE__ */ Uint32Array.from([
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
]), mt = /* @__PURE__ */ new Uint32Array(64);
class ip extends fo {
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
      mt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = mt[d - 15], f = mt[d - 2], w = Ve(h, 7) ^ Ve(h, 18) ^ h >>> 3, g = Ve(f, 17) ^ Ve(f, 19) ^ f >>> 10;
      mt[d] = g + mt[d - 7] + w + mt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = Ve(a, 6) ^ Ve(a, 11) ^ Ve(a, 25), f = l + h + jf(a, c, u) + rp[d] + mt[d] | 0, g = (Ve(r, 2) ^ Ve(r, 13) ^ Ve(r, 22)) + Vf(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    et(mt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), et(this.buffer);
  }
}
class op extends ip {
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
const sc = oc([
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
].map((e) => BigInt(e))), sp = sc[0], ap = sc[1], vt = /* @__PURE__ */ new Uint32Array(80), xt = /* @__PURE__ */ new Uint32Array(80);
class cp extends fo {
  constructor(t) {
    super(128, t, 16, !1);
  }
  // prettier-ignore
  get() {
    const { Ah: t, Al: n, Bh: r, Bl: i, Ch: o, Cl: s, Dh: a, Dl: c, Eh: u, El: l, Fh: d, Fl: h, Gh: f, Gl: w, Hh: g, Hl: p } = this;
    return [t, n, r, i, o, s, a, c, u, l, d, h, f, w, g, p];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c, u, l, d, h, f, w, g, p) {
    this.Ah = t | 0, this.Al = n | 0, this.Bh = r | 0, this.Bl = i | 0, this.Ch = o | 0, this.Cl = s | 0, this.Dh = a | 0, this.Dl = c | 0, this.Eh = u | 0, this.El = l | 0, this.Fh = d | 0, this.Fl = h | 0, this.Gh = f | 0, this.Gl = w | 0, this.Hh = g | 0, this.Hl = p | 0;
  }
  process(t, n) {
    for (let _ = 0; _ < 16; _++, n += 4)
      vt[_] = t.getUint32(n), xt[_] = t.getUint32(n += 4);
    for (let _ = 16; _ < 80; _++) {
      const I = vt[_ - 15] | 0, S = xt[_ - 15] | 0, O = Xt(I, S, 1) ^ Xt(I, S, 8) ^ Ls(I, S, 7), L = Yt(I, S, 1) ^ Yt(I, S, 8) ^ Rs(I, S, 7), R = vt[_ - 2] | 0, U = xt[_ - 2] | 0, j = Xt(R, U, 19) ^ ur(R, U, 61) ^ Ls(R, U, 6), z = Yt(R, U, 19) ^ lr(R, U, 61) ^ Rs(R, U, 6), b = Qf(L, z, xt[_ - 7], xt[_ - 16]), k = ep(b, O, j, vt[_ - 7], vt[_ - 16]);
      vt[_] = k | 0, xt[_] = b | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: u, Dl: l, Eh: d, El: h, Fh: f, Fl: w, Gh: g, Gl: p, Hh: y, Hl: v } = this;
    for (let _ = 0; _ < 80; _++) {
      const I = Xt(d, h, 14) ^ Xt(d, h, 18) ^ ur(d, h, 41), S = Yt(d, h, 14) ^ Yt(d, h, 18) ^ lr(d, h, 41), O = d & f ^ ~d & g, L = h & w ^ ~h & p, R = tp(v, S, L, ap[_], xt[_]), U = np(R, y, I, O, sp[_], vt[_]), j = R | 0, z = Xt(r, i, 28) ^ ur(r, i, 34) ^ ur(r, i, 39), b = Yt(r, i, 28) ^ lr(r, i, 34) ^ lr(r, i, 39), k = r & o ^ r & a ^ o & a, A = i & s ^ i & c ^ s & c;
      y = g | 0, v = p | 0, g = f | 0, p = w | 0, f = d | 0, w = h | 0, { h: d, l: h } = st(u | 0, l | 0, U | 0, j | 0), u = a | 0, l = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const x = Yf(j, b, A);
      r = Jf(x, U, z, k), i = x | 0;
    }
    ({ h: r, l: i } = st(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = st(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = st(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: u, l } = st(this.Dh | 0, this.Dl | 0, u | 0, l | 0), { h: d, l: h } = st(this.Eh | 0, this.El | 0, d | 0, h | 0), { h: f, l: w } = st(this.Fh | 0, this.Fl | 0, f | 0, w | 0), { h: g, l: p } = st(this.Gh | 0, this.Gl | 0, g | 0, p | 0), { h: y, l: v } = st(this.Hh | 0, this.Hl | 0, y | 0, v | 0), this.set(r, i, o, s, a, c, u, l, d, h, f, w, g, p, y, v);
  }
  roundClean() {
    et(vt, xt);
  }
  destroy() {
    this.destroyed = !0, et(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class up extends cp {
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
const ce = /* @__PURE__ */ Qr(
  () => new op(),
  /* @__PURE__ */ ic(1)
), lp = /* @__PURE__ */ Qr(
  () => new up(),
  /* @__PURE__ */ ic(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const q = (e, t, n) => Qe(e, t, n), ac = Je, X = co, $e = (...e) => Df(...e), Nn = (e) => uo(e), po = tc, ho = (e) => lo(e), Tr = /* @__PURE__ */ BigInt(0), Mi = /* @__PURE__ */ BigInt(1);
function Pt(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function yo(e) {
  if (typeof e == "bigint") {
    if (!Ar(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    ac(e);
  return e;
}
function Lr(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function dr(e) {
  const t = yo(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function cc(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? Tr : BigInt("0x" + e);
}
function Qn(e) {
  return cc(co(e));
}
function cn(e) {
  return cc(co(Ni(Qe(e)).reverse()));
}
function go(e, t) {
  if (Je(t), t === 0)
    throw new RangeError("zero length");
  e = yo(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return uo(n.padStart(t * 2, "0"));
}
function uc(e, t) {
  return go(e, t).reverse();
}
function dp(e, t) {
  if (e = q(e), t = q(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function Ni(e) {
  return Uint8Array.from(q(e));
}
function fp(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const Ar = (e) => typeof e == "bigint" && Tr <= e;
function pp(e, t, n) {
  return Ar(e) && Ar(t) && Ar(n) && t <= e && e < n;
}
function Rr(e, t, n, r) {
  if (!pp(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function wo(e) {
  if (e < Tr)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > Tr; e >>= Mi, t += 1)
    ;
  return t;
}
const bo = (e) => (Mi << BigInt(e)) - Mi;
function hp(e, t, n) {
  if (Je(e, "hashLen"), Je(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), u = r(e), l = 0;
  const d = () => {
    c.fill(1), u.fill(0), l = 0;
  }, h = (...p) => n(u, $e(c, ...p)), f = (p = i) => {
    u = h(o, p), c = h(), p.length !== 0 && (u = h(s, p), c = h());
  }, w = () => {
    if (l++ >= a)
      throw new Error("drbg: tried max amount of iterations");
    let p = 0;
    const y = [];
    for (; p < t; ) {
      c = h();
      const v = c.slice();
      y.push(v), p += c.length;
    }
    return $e(...y);
  };
  return (p, y) => {
    d(), f(p);
    let v;
    for (; (v = y(w())) === void 0; )
      f();
    return d(), v;
  };
}
function yn(e, t = {}, n = {}) {
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
const Cs = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ge = /* @__PURE__ */ BigInt(0), oe = /* @__PURE__ */ BigInt(1), zt = /* @__PURE__ */ BigInt(2), lc = /* @__PURE__ */ BigInt(3), dc = /* @__PURE__ */ BigInt(4), fc = /* @__PURE__ */ BigInt(5), yp = /* @__PURE__ */ BigInt(7), pc = /* @__PURE__ */ BigInt(8), gp = /* @__PURE__ */ BigInt(9), hc = /* @__PURE__ */ BigInt(16);
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
function zs(e, t) {
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
function mo(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function yc(e, t) {
  const n = e, r = (n.ORDER + oe) / dc, i = n.pow(t, r);
  return mo(n, i, t), i;
}
function wp(e, t) {
  const n = e, r = (n.ORDER - fc) / pc, i = n.mul(t, zt), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, zt), o), c = n.mul(s, n.sub(a, n.ONE));
  return mo(n, c, t), c;
}
function bp(e) {
  const t = ei(e), n = gc(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + yp) / hc;
  return ((a, c) => {
    const u = a;
    let l = u.pow(c, s), d = u.mul(l, r);
    const h = u.mul(l, i), f = u.mul(l, o), w = u.eql(u.sqr(d), c), g = u.eql(u.sqr(h), c);
    l = u.cmov(l, d, w), d = u.cmov(f, h, g);
    const p = u.eql(u.sqr(d), c), y = u.cmov(l, d, p);
    return mo(u, y, c), y;
  });
}
function gc(e) {
  if (e < lc)
    throw new Error("sqrt is not defined for small field");
  let t = e - oe, n = 0;
  for (; t % zt === ge; )
    t /= zt, n++;
  let r = zt;
  const i = ei(e);
  for (; Us(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return yc;
  let o = i.pow(r, t);
  const s = (t + oe) / zt;
  return function(c, u) {
    const l = c;
    if (l.is0(u))
      return u;
    if (Us(l, u) !== 1)
      throw new Error("Cannot find square root");
    let d = n, h = l.mul(l.ONE, o), f = l.pow(u, t), w = l.pow(u, s);
    for (; !l.eql(f, l.ONE); ) {
      if (l.is0(f))
        return l.ZERO;
      let g = 1, p = l.sqr(f);
      for (; !l.eql(p, l.ONE); )
        if (g++, p = l.sqr(p), g === d)
          throw new Error("Cannot find square root");
      const y = oe << BigInt(d - g - 1), v = l.pow(h, y);
      d = g, h = l.sqr(v), f = l.mul(f, h), w = l.mul(w, v);
    }
    return w;
  };
}
function mp(e) {
  return e % dc === lc ? yc : e % pc === fc ? wp : e % hc === gp ? bp(e) : gc(e);
}
const Tt = (e, t) => (ae(e, t) & oe) === oe, vp = [
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
function xp(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = vp.reduce((r, i) => (r[i] = "function", r), t);
  if (yn(e, n), Lr(e.BYTES, "BYTES"), Lr(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= oe)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function Ep(e, t, n) {
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
function wc(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, u) => r.is0(c) ? a : (i[u] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, u) => r.is0(c) ? a : (i[u] = r.mul(a, i[u]), r.mul(a, c)), s), i;
}
function Us(e, t) {
  const n = e, r = (n.ORDER - oe) / zt, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function Sp(e, t) {
  if (t !== void 0 && ac(t), e <= ge)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = wo(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const Hs = /* @__PURE__ */ new WeakMap();
class bc {
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
    const { nBitLength: i, nByteLength: o } = Sp(t, r);
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
    return Ep(this, t, n);
  }
  div(t, n) {
    return ae(t * zs(n, this.ORDER), this.ORDER);
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
    return zs(t, this.ORDER);
  }
  sqrt(t) {
    let n = Hs.get(this);
    return n || Hs.set(this, n = mp(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? uc(t, this.BYTES) : go(t, this.BYTES);
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
    let c = o ? cn(t) : Qn(t);
    if (a && (c = ae(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return wc(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return Pt(r, "condition"), r ? n : t;
  }
}
Object.freeze(bc.prototype);
function ei(e, t = {}) {
  return new bc(e, t);
}
function mc(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= oe)
    throw new Error("field order must be greater than 1");
  const t = wo(e - oe);
  return Math.ceil(t / 8);
}
function vc(e) {
  const t = mc(e);
  return t + Math.ceil(t / 2);
}
function xc(e, t, n = !1) {
  q(e);
  const r = e.length, i = mc(t), o = Math.max(vc(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? cn(e) : Qn(e), a = ae(s, t - oe) + oe;
  return n ? uc(a, i) : go(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const un = /* @__PURE__ */ BigInt(0), Ut = /* @__PURE__ */ BigInt(1);
function Cr(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function Cn(e, t) {
  const n = wc(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function Ec(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function mi(e, t) {
  Ec(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = bo(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function Ms(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += Ut);
  const u = t * r, l = u + Math.abs(a) - 1, d = a === 0, h = a < 0, f = t % 2 !== 0;
  return { nextN: c, offset: l, isZero: d, isNeg: h, isNegF: f, offsetF: u };
}
const vi = /* @__PURE__ */ new WeakMap(), Sc = /* @__PURE__ */ new WeakMap();
function xi(e) {
  return Sc.get(e) || 1;
}
function Ns(e) {
  if (e !== un)
    throw new Error("invalid wNAF");
}
class kc {
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
    for (; n > un; )
      n & Ut && (r = r.add(i)), i = i.double(), n >>= Ut;
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
    const { windows: r, windowSize: i } = mi(n, this.bits), o = [];
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
    const s = mi(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: u, isZero: l, isNeg: d, isNegF: h, offsetF: f } = Ms(r, a, s);
      r = c, l ? o = o.add(Cr(h, n[f])) : i = i.add(Cr(d, n[u]));
    }
    return Ns(r), { p: i, f: o };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = mi(t, this.bits);
    for (let s = 0; s < o.windows && r !== un; s++) {
      const { nextN: a, offset: c, isZero: u, isNeg: l } = Ms(r, s, o);
      if (r = a, !u) {
        const d = n[c];
        i = i.add(l ? d.negate() : d);
      }
    }
    return Ns(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = vi.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), vi.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = xi(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = xi(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    Ec(n, this.bits), Sc.set(t, n), vi.delete(t);
  }
  hasCache(t) {
    return xi(t) !== 1;
  }
}
function kp(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > un || r > un; )
    n & Ut && (o = o.add(i)), r & Ut && (s = s.add(i)), i = i.double(), n >>= Ut, r >>= Ut;
  return { p1: o, p2: s };
}
function Fs(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return xp(t), t;
  } else
    return ei(e, { isLE: n });
}
function Ac(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const u = t[c];
    if (!(typeof u == "bigint" && u > un))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = Fs(t.p, n.Fp, r), o = Fs(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function vo(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Et = /* @__PURE__ */ BigInt(0), pe = /* @__PURE__ */ BigInt(1), Ei = /* @__PURE__ */ BigInt(2), Ap = /* @__PURE__ */ BigInt(8);
function _p(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function Ip(e, t = {}) {
  const n = t, r = Ac("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  yn(n, {}, { uvRatio: "function" });
  const c = Ei << BigInt(o.BYTES * 8) - pe, u = (g) => i.create(g), l = n.uvRatio === void 0 ? (g, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(g, p)) };
    } catch {
      return { isValid: !1, value: Et };
    }
  } : n.uvRatio;
  if (!_p(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(g, p, y = !1) {
    const v = y ? pe : Et;
    return Rr("coordinate " + g, p, v, c), p;
  }
  function h(g) {
    if (!(g instanceof f))
      throw new Error("EdwardsPoint expected");
  }
  class f {
    // base / generator point
    static BASE = new f(s.Gx, s.Gy, pe, u(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new f(Et, pe, pe, Et);
    // 0, 1, 1, 0
    // math field
    static Fp = i;
    // scalar field
    static Fn = o;
    X;
    Y;
    Z;
    T;
    constructor(p, y, v, _) {
      this.X = d("x", p), this.Y = d("y", y), this.Z = d("z", v, !0), this.T = d("t", _), Object.freeze(this);
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
      const { x: y, y: v } = p || {};
      return d("x", y), d("y", v), new f(y, v, pe, u(y * v));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(p, y = !1) {
      const v = i.BYTES, { a: _, d: I } = s;
      p = Ni(q(p, v, "point")), Pt(y, "zip215");
      const S = Ni(p), O = p[v - 1];
      S[v - 1] = O & -129;
      const L = cn(S), R = y ? c : i.ORDER;
      Rr("point.y", L, Et, R);
      const U = u(L * L), j = u(U - pe), z = u(I * U - _);
      let { isValid: b, value: k } = l(j, z);
      if (!b)
        throw new Error("bad point: invalid y coordinate");
      const A = (k & pe) === pe, x = (O & 128) !== 0;
      if (!y && k === Et && x)
        throw new Error("bad point: x=0 and x_0=1");
      return x !== A && (k = u(-k)), f.fromAffine({ x: k, y: L });
    }
    static fromHex(p, y = !1) {
      return f.fromBytes(Nn(p), y);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, y = !0) {
      return w.createCache(this, p), y || this.multiply(Ei), this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this, { a: y, d: v } = s;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X: _, Y: I, Z: S, T: O } = p, L = u(_ * _), R = u(I * I), U = u(S * S), j = u(U * U), z = u(L * y), b = u(U * u(z + R)), k = u(j + u(v * u(L * R)));
      if (b !== k)
        throw new Error("bad point: equation left != right (1)");
      const A = u(_ * I), x = u(S * O);
      if (A !== x)
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(p) {
      h(p);
      const { X: y, Y: v, Z: _ } = this, { X: I, Y: S, Z: O } = p, L = u(y * O), R = u(I * _), U = u(v * O), j = u(S * _);
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
      const { a: p } = s, { X: y, Y: v, Z: _ } = this, I = u(y * y), S = u(v * v), O = u(Ei * u(_ * _)), L = u(p * I), R = y + v, U = u(u(R * R) - I - S), j = L + S, z = j - O, b = L - S, k = u(U * z), A = u(j * b), x = u(U * b), E = u(z * j);
      return new f(k, A, E, x);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      h(p);
      const { a: y, d: v } = s, { X: _, Y: I, Z: S, T: O } = this, { X: L, Y: R, Z: U, T: j } = p, z = u(_ * L), b = u(I * R), k = u(O * v * j), A = u(S * U), x = u((_ + I) * (L + R) - z - b), E = A - k, P = A + k, $ = u(b - y * z), B = u(x * E), T = u(P * $), C = u(x * $), H = u(E * P);
      return new f(B, T, H, C);
    }
    subtract(p) {
      return h(p), this.add(p.negate());
    }
    // Constant-time multiplication.
    multiply(p) {
      if (!o.isValidNot0(p))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p: y, f: v } = w.cached(this, p, (_) => Cn(f, _));
      return Cn(f, [y, v])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(p) {
      if (!o.isValid(p))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      return p === Et ? f.ZERO : this.is0() || p === pe ? this : w.unsafe(this, p, (y) => Cn(f, y));
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
      return w.unsafe(this, s.n).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(p) {
      const y = this;
      let v = p;
      const { X: _, Y: I, Z: S } = y, O = y.is0();
      v == null && (v = O ? Ap : i.inv(S));
      const L = u(_ * v), R = u(I * v), U = i.mul(S, v);
      if (O)
        return { x: Et, y: pe };
      if (U !== pe)
        throw new Error("invZ was invalid");
      return { x: L, y: R };
    }
    clearCofactor() {
      return a === pe ? this : this.multiplyUnsafe(a);
    }
    toBytes() {
      const { x: p, y } = this.toAffine(), v = i.toBytes(y);
      return v[v.length - 1] |= p & pe ? 128 : 0, v;
    }
    toHex() {
      return X(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const w = new kc(f, o.BITS);
  return o.BITS >= 8 && f.BASE.precompute(8), Object.freeze(f.prototype), Object.freeze(f), f;
}
class Pp {
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
    Cs();
  }
  static fromHex(t) {
    Cs();
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
function Bp(e, t, n = {}) {
  if (typeof t != "function")
    throw new Error('"hash" function param is required');
  const r = t, i = n;
  yn(i, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function"
  });
  const { prehash: o } = i, { BASE: s, Fp: a, Fn: c } = e, u = r.outputLen, l = 2 * a.BYTES;
  if (u !== void 0 && (Lr(u, "hash.outputLen"), u !== l))
    throw new Error(`hash.outputLen must be ${l}, got ${u}`);
  const d = i.randomBytes === void 0 ? ho : i.randomBytes, h = i.adjustScalarBytes === void 0 ? (b) => b : i.adjustScalarBytes, f = i.domain === void 0 ? (b, k, A) => {
    if (Pt(A, "phflag"), k.length || A)
      throw new Error("Contexts/pre-hash are not supported");
    return b;
  } : i.domain;
  function w(b) {
    return c.create(cn(b));
  }
  function g(b) {
    const k = L.secretKey;
    q(b, L.secretKey, "secretKey");
    const A = q(r(b), 2 * k, "hashedSecretKey"), x = h(A.slice(0, k)), E = A.slice(k, 2 * k), P = w(x);
    return { head: x, prefix: E, scalar: P };
  }
  function p(b) {
    const { head: k, prefix: A, scalar: x } = g(b), E = s.multiply(x), P = E.toBytes();
    return { head: k, prefix: A, scalar: x, point: E, pointBytes: P };
  }
  function y(b) {
    return p(b).pointBytes;
  }
  function v(b = Uint8Array.of(), ...k) {
    const A = $e(...k);
    return w(r(f(A, q(b, void 0, "context"), !!o)));
  }
  function _(b, k, A = {}) {
    b = q(b, void 0, "message"), o && (b = o(b));
    const { prefix: x, scalar: E, pointBytes: P } = p(k), $ = v(A.context, x, b), B = s.multiply($).toBytes(), T = v(A.context, B, P, b), C = c.create($ + T * E);
    if (!c.isValid(C))
      throw new Error("sign failed: invalid s");
    const H = $e(B, c.toBytes(C));
    return q(H, L.signature, "result");
  }
  const I = {
    zip215: i.zip215
  };
  function S(b, k, A, x = I) {
    const { context: E } = x, P = x.zip215 === void 0 ? !!I.zip215 : x.zip215, $ = L.signature;
    b = q(b, $, "signature"), k = q(k, void 0, "message"), A = q(A, L.publicKey, "publicKey"), P !== void 0 && Pt(P, "zip215"), o && (k = o(k));
    const B = $ / 2, T = b.subarray(0, B), C = cn(b.subarray(B, $));
    let H, G, M;
    try {
      H = e.fromBytes(A, P), G = e.fromBytes(T, P), M = s.multiplyUnsafe(C);
    } catch {
      return !1;
    }
    if (!P && H.isSmallOrder())
      return !1;
    const ee = v(E, T, A, k);
    return G.add(H.multiplyUnsafe(ee)).subtract(M).clearCofactor().is0();
  }
  const O = a.BYTES, L = {
    secretKey: O,
    publicKey: O,
    signature: 2 * O,
    seed: O
  };
  function R(b) {
    return b = b === void 0 ? d(L.seed) : b, q(b, L.seed, "seed");
  }
  function U(b) {
    return po(b) && b.length === L.secretKey;
  }
  function j(b, k) {
    try {
      return !!e.fromBytes(b, k === void 0 ? I.zip215 : k);
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
    toMontgomery(b) {
      const { y: k } = e.fromBytes(b), A = L.publicKey, x = A === 32;
      if (!x && A !== 57)
        throw new Error("only defined for 25519 and 448");
      const E = x ? a.div(pe + k, pe - k) : a.div(k - pe, k + pe);
      return a.toBytes(E);
    },
    toMontgomerySecret(b) {
      const k = L.secretKey;
      q(b, k);
      const A = r(b.subarray(0, k));
      return h(A).subarray(0, k);
    }
  };
  return Object.freeze(L), Object.freeze(z), Object.freeze({
    keygen: vo(R, y),
    getPublicKey: y,
    sign: _,
    verify: S,
    utils: z,
    Point: e,
    lengths: L
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const $p = /* @__PURE__ */ BigInt(0), zn = /* @__PURE__ */ BigInt(1), Ks = /* @__PURE__ */ BigInt(2), Op = /* @__PURE__ */ BigInt(5), Tp = /* @__PURE__ */ BigInt(8), Fn = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), _c = {
  p: Fn,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: Tp,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function Lp(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = Fn, a = e * e % o * e % o, c = re(a, Ks, o) * a % o, u = re(c, zn, o) * e % o, l = re(u, Op, o) * u % o, d = re(l, t, o) * l % o, h = re(d, n, o) * d % o, f = re(h, r, o) * h % o, w = re(f, i, o) * f % o, g = re(w, i, o) * f % o, p = re(g, t, o) * l % o;
  return { pow_p_5_8: re(p, Ks, o) * e % o, b2: a };
}
function Rp(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Fi = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function Ic(e, t) {
  const n = Fn, r = ae(t * t * t, n), i = ae(r * r * t, n), o = Lp(e * i).pow_p_5_8;
  let s = ae(e * r * o, n);
  const a = ae(t * s * s, n), c = s, u = ae(s * Fi, n), l = a === e, d = a === ae(-e, n), h = a === ae(-e * Fi, n);
  return l && (s = c), (d || h) && (s = u), Tt(s, n) && (s = ae(-s, n)), { isValid: l || d, value: s };
}
const Ht = /* @__PURE__ */ Ip(_c, { uvRatio: Ic }), Lt = Ht.Fp, Cp = Ht.Fn;
function zp(e) {
  return Bp(Ht, lp, Object.assign({ adjustScalarBytes: Rp, zip215: !0 }, e));
}
const zr = /* @__PURE__ */ zp({}), Ds = Fi, Up = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), js = (e) => Ic(zn, e), Hp = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), Mp = (e) => Lt.create(cn(e) & Hp);
class _e extends Pp {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new _e(Ht.BASE);
  // prettier-ignore
  static ZERO = new _e(Ht.ZERO);
  // prettier-ignore
  static Fp = Lt;
  // prettier-ignore
  static Fn = Cp;
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
    return new _e(Ht.fromAffine(t));
  }
  assertSame(t) {
    if (!(t instanceof _e))
      throw new Error("RistrettoPoint expected");
  }
  init(t) {
    return new _e(t);
  }
  static fromBytes(t) {
    Qe(t, 32);
    const { a: n, d: r } = _c, i = Fn, o = (I) => Lt.create(I), s = Mp(t);
    if (!dp(Lt.toBytes(s), t) || Tt(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(zn + n * a), u = o(zn - n * a), l = o(c * c), d = o(u * u), h = o(n * r * l - d), { isValid: f, value: w } = js(o(h * d)), g = o(w * u), p = o(w * g * h);
    let y = o((s + s) * g);
    Tt(y, i) && (y = o(-y));
    const v = o(c * p), _ = o(y * v);
    if (!f || Tt(_, i) || v === $p)
      throw new Error("invalid ristretto255 encoding 2");
    return new _e(new Ht(y, v, zn, _));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return _e.fromBytes(uo(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = Fn, s = (p) => Lt.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), u = s(c * c), { value: l } = js(s(a * u)), d = s(l * a), h = s(l * c), f = s(d * h * i);
    let w;
    if (Tt(i * f, o)) {
      let p = s(n * Ds), y = s(t * Ds);
      t = p, n = y, w = s(d * Up);
    } else
      w = h;
    Tt(t * f, o) && (n = s(-n));
    let g = s((r - n) * w);
    return Tt(g, o) && (g = s(-g)), Lt.toBytes(g);
  }
  /**
   * Compares two Ristretto points.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
   */
  equals(t) {
    this.assertSame(t);
    const { X: n, Y: r } = this.ep, { X: i, Y: o } = t.ep, s = (u) => Lt.create(u), a = s(n * o) === s(r * i), c = s(r * o) === s(n * i);
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
class Vs {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (nc(t), Qe(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), et(i);
  }
  update(t) {
    return an(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    an(this), ao(t, this), this.finished = !0;
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
const Np = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new Vs(t, n).update(r).digest());
  return e.create = (t, n) => new Vs(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const qs = (e, t) => (e + (e >= 0 ? t : -t) / Pc) / t;
function Fp(e, t, n) {
  Rr("scalar", e, Ze, n);
  const [[r, i], [o, s]] = t, a = qs(s * e, n), c = qs(-i * e, n);
  let u = e - a * r - c * o, l = -a * i - c * s;
  const d = u < Ze, h = l < Ze;
  d && (u = -u), h && (l = -l);
  const f = bo(Math.ceil(wo(n) / 2)) + At;
  if (u < Ze || u >= f || l < Ze || l >= f)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: u, k2neg: h, k2: l };
}
function Ki(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function Si(e, t) {
  yn(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return Pt(n.lowS, "lowS"), Pt(n.prehash, "prehash"), n.format !== void 0 && Ki(n.format), n;
}
class Kp extends Error {
  constructor(t = "") {
    super(t);
  }
}
const Re = {
  // asn.1 DER encoding utils
  Err: Kp,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = Re;
      if (Lr(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = dr(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? dr(i.length / 2 | 128) : "";
      return dr(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = Re;
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
      const { Err: t } = Re;
      if (yo(e), e < Ze)
        throw new t("integer: negative integers are not allowed");
      let n = dr(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = Re;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Qn(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = Re, i = q(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: u, l } = r.decode(2, c);
    if (l.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(u) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = Re, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
};
Object.freeze(Re._tlv);
Object.freeze(Re._int);
Object.freeze(Re);
const Ze = /* @__PURE__ */ BigInt(0), At = /* @__PURE__ */ BigInt(1), Pc = /* @__PURE__ */ BigInt(2), fr = /* @__PURE__ */ BigInt(3), Dp = /* @__PURE__ */ BigInt(4);
function jp(e, t = {}) {
  const n = Ac("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  yn(t, {}, {
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
  const l = $c(r, i);
  function d() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function h(z, b, k) {
    if (u && b.is0())
      return Uint8Array.of(0);
    const { x: A, y: x } = b.toAffine(), E = r.toBytes(A);
    if (Pt(k, "isCompressed"), k) {
      d();
      const P = !r.isOdd(x);
      return $e(Bc(P), E);
    } else
      return $e(Uint8Array.of(4), E, r.toBytes(x));
  }
  function f(z) {
    q(z, void 0, "Point");
    const { publicKey: b, publicKeyUncompressed: k } = l, A = z.length, x = z[0], E = z.subarray(1);
    if (u && A === 1 && x === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (A === b && (x === 2 || x === 3)) {
      const P = r.fromBytes(E);
      if (!r.isValid(P))
        throw new Error("bad point: is not on curve, wrong x");
      const $ = p(P);
      let B;
      try {
        B = r.sqrt($);
      } catch (H) {
        const G = H instanceof Error ? ": " + H.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + G);
      }
      d();
      const T = r.isOdd(B);
      return (x & 1) === 1 !== T && (B = r.neg(B)), { x: P, y: B };
    } else if (A === k && x === 4) {
      const P = r.BYTES, $ = r.fromBytes(E.subarray(0, P)), B = r.fromBytes(E.subarray(P, P * 2));
      if (!y($, B))
        throw new Error("bad point: is not on curve");
      return { x: $, y: B };
    } else
      throw new Error(`bad point: got length ${A}, expected compressed=${b} or uncompressed=${k}`);
  }
  const w = t.toBytes === void 0 ? h : t.toBytes, g = t.fromBytes === void 0 ? f : t.fromBytes;
  function p(z) {
    const b = r.sqr(z), k = r.mul(b, z);
    return r.add(r.add(k, r.mul(z, o.a)), o.b);
  }
  function y(z, b) {
    const k = r.sqr(b), A = p(z);
    return r.eql(k, A);
  }
  if (!y(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const v = r.mul(r.pow(o.a, fr), Dp), _ = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(v, _)))
    throw new Error("bad curve params: a or b");
  function I(z, b, k = !1) {
    if (!r.isValid(b) || k && r.is0(b))
      throw new Error(`bad point coordinate ${z}`);
    return b;
  }
  function S(z) {
    if (!(z instanceof R))
      throw new Error("Weierstrass Point expected");
  }
  function O(z) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return Fp(z, c.basises, i.ORDER);
  }
  function L(z, b, k, A, x) {
    return k = new R(r.mul(k.X, z), k.Y, k.Z), b = Cr(A, b), k = Cr(x, k), b.add(k);
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
    constructor(b, k, A) {
      this.X = I("x", b), this.Y = I("y", k, !0), this.Z = I("z", A), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(b) {
      const { x: k, y: A } = b || {};
      if (!b || !r.isValid(k) || !r.isValid(A))
        throw new Error("invalid affine point");
      if (b instanceof R)
        throw new Error("projective point not allowed");
      return r.is0(k) && r.is0(A) ? R.ZERO : new R(k, A, r.ONE);
    }
    static fromBytes(b) {
      const k = R.fromAffine(g(q(b, void 0, "point")));
      return k.assertValidity(), k;
    }
    static fromHex(b) {
      return R.fromBytes(Nn(b));
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
    precompute(b = 8, k = !0) {
      return j.createCache(this, b), k || this.multiply(fr), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const b = this;
      if (b.is0()) {
        if (t.allowInfinityPoint && r.is0(b.X) && r.eql(b.Y, r.ONE) && r.is0(b.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x: k, y: A } = b.toAffine();
      if (!r.isValid(k) || !r.isValid(A))
        throw new Error("bad point: x or y not field elements");
      if (!y(k, A))
        throw new Error("bad point: equation left != right");
      if (!b.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y: b } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(b);
    }
    /** Compare one point to another. */
    equals(b) {
      S(b);
      const { X: k, Y: A, Z: x } = this, { X: E, Y: P, Z: $ } = b, B = r.eql(r.mul(k, $), r.mul(E, x)), T = r.eql(r.mul(A, $), r.mul(P, x));
      return B && T;
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
      const { a: b, b: k } = o, A = r.mul(k, fr), { X: x, Y: E, Z: P } = this;
      let $ = r.ZERO, B = r.ZERO, T = r.ZERO, C = r.mul(x, x), H = r.mul(E, E), G = r.mul(P, P), M = r.mul(x, E);
      return M = r.add(M, M), T = r.mul(x, P), T = r.add(T, T), $ = r.mul(b, T), B = r.mul(A, G), B = r.add($, B), $ = r.sub(H, B), B = r.add(H, B), B = r.mul($, B), $ = r.mul(M, $), T = r.mul(A, T), G = r.mul(b, G), M = r.sub(C, G), M = r.mul(b, M), M = r.add(M, T), T = r.add(C, C), C = r.add(T, C), C = r.add(C, G), C = r.mul(C, M), B = r.add(B, C), G = r.mul(E, P), G = r.add(G, G), C = r.mul(G, M), $ = r.sub($, C), T = r.mul(G, H), T = r.add(T, T), T = r.add(T, T), new R($, B, T);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(b) {
      S(b);
      const { X: k, Y: A, Z: x } = this, { X: E, Y: P, Z: $ } = b;
      let B = r.ZERO, T = r.ZERO, C = r.ZERO;
      const H = o.a, G = r.mul(o.b, fr);
      let M = r.mul(k, E), ee = r.mul(A, P), te = r.mul(x, $), ne = r.add(k, A), Y = r.add(E, P);
      ne = r.mul(ne, Y), Y = r.add(M, ee), ne = r.sub(ne, Y), Y = r.add(k, x);
      let he = r.add(E, $);
      return Y = r.mul(Y, he), he = r.add(M, te), Y = r.sub(Y, he), he = r.add(A, x), B = r.add(P, $), he = r.mul(he, B), B = r.add(ee, te), he = r.sub(he, B), C = r.mul(H, Y), B = r.mul(G, te), C = r.add(B, C), B = r.sub(ee, C), C = r.add(ee, C), T = r.mul(B, C), ee = r.add(M, M), ee = r.add(ee, M), te = r.mul(H, te), Y = r.mul(G, Y), ee = r.add(ee, te), te = r.sub(M, te), te = r.mul(H, te), Y = r.add(Y, te), M = r.mul(ee, Y), T = r.add(T, M), M = r.mul(he, Y), B = r.mul(ne, B), B = r.sub(B, M), M = r.mul(ne, ee), C = r.mul(he, C), C = r.add(C, M), new R(B, T, C);
    }
    subtract(b) {
      return S(b), this.add(b.negate());
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
    multiply(b) {
      const { endo: k } = t;
      if (!i.isValidNot0(b))
        throw new RangeError("invalid scalar: out of range");
      let A, x;
      const E = (P) => j.cached(this, P, ($) => Cn(R, $));
      if (k) {
        const { k1neg: P, k1: $, k2neg: B, k2: T } = O(b), { p: C, f: H } = E($), { p: G, f: M } = E(T);
        x = H.add(M), A = L(k.beta, C, G, P, B);
      } else {
        const { p: P, f: $ } = E(b);
        A = P, x = $;
      }
      return Cn(R, [A, x])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(b) {
      const { endo: k } = t, A = this, x = b;
      if (!i.isValid(x))
        throw new RangeError("invalid scalar: out of range");
      if (x === Ze || A.is0())
        return R.ZERO;
      if (x === At)
        return A;
      if (j.hasCache(this))
        return this.multiply(x);
      if (k) {
        const { k1neg: E, k1: P, k2neg: $, k2: B } = O(x), { p1: T, p2: C } = kp(R, A, P, B);
        return L(k.beta, T, C, E, $);
      } else
        return j.unsafe(A, x);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(b) {
      const k = this;
      let A = b;
      const { X: x, Y: E, Z: P } = k;
      if (r.eql(P, r.ONE))
        return { x, y: E };
      const $ = k.is0();
      A == null && (A = $ ? r.ONE : r.inv(P));
      const B = r.mul(x, A), T = r.mul(E, A), C = r.mul(P, A);
      if ($)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(C, r.ONE))
        throw new Error("invZ was invalid");
      return { x: B, y: T };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: b } = t;
      return s === At ? !0 : b ? b(R, this) : j.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: b } = t;
      return s === At ? this : b ? b(R, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === At ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(b = !0) {
      return Pt(b, "isCompressed"), this.assertValidity(), w(R, this, b);
    }
    toHex(b = !0) {
      return X(this.toBytes(b));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const U = i.BITS, j = new kc(R, t.endo ? Math.ceil(U / 2) : U);
  return U >= 8 && R.BASE.precompute(8), Object.freeze(R.prototype), Object.freeze(R), R;
}
function Bc(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function $c(e, t) {
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
function Vp(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? ho : t.randomBytes, i = Object.assign($c(e.Fp, n), {
    seed: Math.max(vc(n.ORDER), 16)
  });
  function o(f) {
    try {
      const w = n.fromBytes(f);
      return n.isValidNot0(w);
    } catch {
      return !1;
    }
  }
  function s(f, w) {
    const { publicKey: g, publicKeyUncompressed: p } = i;
    try {
      const y = f.length;
      return w === !0 && y !== g || w === !1 && y !== p ? !1 : !!e.fromBytes(f);
    } catch {
      return !1;
    }
  }
  function a(f) {
    return f = f === void 0 ? r(i.seed) : f, xc(q(f, i.seed, "seed"), n.ORDER);
  }
  function c(f, w = !0) {
    return e.BASE.multiply(n.fromBytes(f)).toBytes(w);
  }
  function u(f) {
    const { secretKey: w, publicKey: g, publicKeyUncompressed: p } = i, y = n._lengths;
    if (!po(f))
      return;
    const v = q(f, void 0, "key").length, _ = v === g || v === p, I = v === w || !!y?.includes(v);
    if (!(_ && I))
      return _;
  }
  function l(f, w, g = !0) {
    if (u(f) === !0)
      throw new Error("first arg must be private key");
    if (u(w) === !1)
      throw new Error("second arg must be public key");
    const p = n.fromBytes(f);
    return e.fromBytes(w).multiply(p).toBytes(g);
  }
  const d = {
    isValidSecretKey: o,
    isValidPublicKey: s,
    randomSecretKey: a
  }, h = vo(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: l, keygen: h, Point: e, utils: d, lengths: i });
}
function qp(e, t, n = {}) {
  const r = t;
  nc(r), yn(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? ho : n.randomBytes, o = n.hmac === void 0 ? (x, E) => Np(r, x, E) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: u } = a, { keygen: l, getPublicKey: d, getSharedSecret: h, utils: f, lengths: w } = Vp(e, n), g = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * Pc + At < s.ORDER;
  function y(x) {
    const E = c >> At;
    return x > E;
  }
  function v(x, E) {
    if (!a.isValidNot0(E))
      throw new Error(`invalid signature ${x}: out of range 1..Point.Fn.ORDER`);
    return E;
  }
  function _() {
    if (p)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function I(x, E) {
    Ki(E);
    const P = w.signature, $ = E === "compact" ? P : E === "recovered" ? P + 1 : void 0;
    return q(x, $);
  }
  class S {
    r;
    s;
    recovery;
    constructor(E, P, $) {
      if (this.r = v("r", E), this.s = v("s", P), $ != null) {
        if (_(), ![0, 1, 2, 3].includes($))
          throw new Error("invalid recovery id");
        this.recovery = $;
      }
      Object.freeze(this);
    }
    static fromBytes(E, P = g.format) {
      I(E, P);
      let $;
      if (P === "der") {
        const { r: H, s: G } = Re.toSig(q(E));
        return new S(H, G);
      }
      P === "recovered" && ($ = E[0], P = "compact", E = E.subarray(1));
      const B = w.signature / 2, T = E.subarray(0, B), C = E.subarray(B, B * 2);
      return new S(a.fromBytes(T), a.fromBytes(C), $);
    }
    static fromHex(E, P) {
      return this.fromBytes(Nn(E), P);
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
      const { r: P, s: $ } = this, B = this.assertRecovery(), T = B === 2 || B === 3 ? P + c : P;
      if (!s.isValid(T))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const C = s.toBytes(T), H = e.fromBytes($e(Bc((B & 1) === 0), C)), G = a.inv(T), M = L(q(E, void 0, "msgHash")), ee = a.create(-M * G), te = a.create($ * G), ne = e.BASE.multiplyUnsafe(ee).add(H.multiplyUnsafe(te));
      if (ne.is0())
        throw new Error("invalid recovery: point at infinify");
      return ne.assertValidity(), ne;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return y(this.s);
    }
    toBytes(E = g.format) {
      if (Ki(E), E === "der")
        return Nn(Re.hexFromSig(this));
      const { r: P, s: $ } = this, B = a.toBytes(P), T = a.toBytes($);
      return E === "recovered" ? (_(), $e(Uint8Array.of(this.assertRecovery()), B, T)) : $e(B, T);
    }
    toHex(E) {
      return X(this.toBytes(E));
    }
  }
  Object.freeze(S.prototype), Object.freeze(S);
  const O = n.bits2int === void 0 ? function(E) {
    if (E.length > 8192)
      throw new Error("input is too large");
    const P = Qn(E), $ = E.length * 8 - u;
    return $ > 0 ? P >> BigInt($) : P;
  } : n.bits2int, L = n.bits2int_modN === void 0 ? function(E) {
    return a.create(O(E));
  } : n.bits2int_modN, R = bo(u);
  function U(x) {
    return Rr("num < 2^" + u, x, Ze, R), a.toBytes(x);
  }
  function j(x, E) {
    return q(x, void 0, "message"), E ? q(r(x), void 0, "prehashed message") : x;
  }
  function z(x, E, P) {
    const { lowS: $, prehash: B, extraEntropy: T } = Si(P, g);
    x = j(x, B);
    const C = L(x), H = a.fromBytes(E);
    if (!a.isValidNot0(H))
      throw new Error("invalid private key");
    const G = [U(H), U(C)];
    if (T != null && T !== !1) {
      const ne = T === !0 ? i(w.secretKey) : T;
      G.push(q(ne, void 0, "extraEntropy"));
    }
    const M = $e(...G), ee = C;
    function te(ne) {
      const Y = O(ne);
      if (!a.isValidNot0(Y))
        return;
      const he = a.inv(Y), rt = e.BASE.multiply(Y).toAffine(), Ot = a.create(rt.x);
      if (Ot === Ze)
        return;
      const Gt = a.create(he * a.create(ee + Ot * H));
      if (Gt === Ze)
        return;
      let vn = (rt.x === Ot ? 0 : 2) | Number(rt.y & At), xn = Gt;
      return $ && y(Gt) && (xn = a.neg(Gt), vn ^= 1), new S(Ot, xn, p ? void 0 : vn);
    }
    return { seed: M, k2sig: te };
  }
  function b(x, E, P = {}) {
    const { seed: $, k2sig: B } = z(x, E, P);
    return hp(r.outputLen, a.BYTES, o)($, B).toBytes(P.format);
  }
  function k(x, E, P, $ = {}) {
    const { lowS: B, prehash: T, format: C } = Si($, g);
    if (P = q(P, void 0, "publicKey"), E = j(E, T), !po(x)) {
      const H = x instanceof S ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + H);
    }
    I(x, C);
    try {
      const H = S.fromBytes(x, C), G = e.fromBytes(P);
      if (B && H.hasHighS())
        return !1;
      const { r: M, s: ee } = H, te = L(E), ne = a.inv(ee), Y = a.create(te * ne), he = a.create(M * ne), rt = e.BASE.multiplyUnsafe(Y).add(G.multiplyUnsafe(he));
      return rt.is0() ? !1 : a.create(rt.x) === M;
    } catch {
      return !1;
    }
  }
  function A(x, E, P = {}) {
    const { prehash: $ } = Si(P, g);
    return E = j(E, $), S.fromBytes(x, "recovered").recoverPublicKey(E).toBytes();
  }
  return Object.freeze({
    keygen: l,
    getPublicKey: d,
    getSharedSecret: h,
    utils: f,
    lengths: w,
    Point: e,
    sign: b,
    verify: k,
    recoverPublicKey: A,
    Signature: S,
    hash: r
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ti = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Gp = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Wp = /* @__PURE__ */ BigInt(0), Di = /* @__PURE__ */ BigInt(2);
function Zp(e) {
  const t = ti.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), u = e * e * e % t, l = u * u * e % t, d = re(l, n, t) * l % t, h = re(d, n, t) * l % t, f = re(h, Di, t) * u % t, w = re(f, i, t) * f % t, g = re(w, o, t) * w % t, p = re(g, a, t) * g % t, y = re(p, c, t) * p % t, v = re(y, a, t) * g % t, _ = re(v, n, t) * l % t, I = re(_, s, t) * w % t, S = re(I, r, t) * u % t, O = re(S, Di, t);
  if (!Ur.eql(Ur.sqr(O), e))
    throw new Error("Cannot find square root");
  return O;
}
const Ur = ei(ti.p, { sqrt: Zp }), jt = /* @__PURE__ */ jp(ti, {
  Fp: Ur,
  endo: Gp
}), Se = /* @__PURE__ */ qp(jt, ce), Gs = {};
function Hr(e, ...t) {
  let n = Gs[e];
  if (n === void 0) {
    const r = ce(fp(e));
    n = $e(r, r), Gs[e] = n;
  }
  return ce($e(n, ...t));
}
const ni = (e) => e.toBytes(!0).slice(1), ri = (e) => e % Di === Wp;
function Oc(e) {
  const { Fn: t, BASE: n } = jt, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: ri(i.y) ? r : t.neg(r), bytes: ni(i) };
}
function Tc(e) {
  const t = Ur;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  ri(i) || (i = t.neg(i));
  const o = jt.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const rn = Qn;
function Lc(...e) {
  return jt.Fn.create(rn(Hr("BIP0340/challenge", ...e)));
}
function Ws(e) {
  return Oc(e).bytes;
}
function Xp(e, t, n = lo(32)) {
  const { Fn: r, BASE: i } = jt, o = q(e, void 0, "message"), { bytes: s, scalar: a } = Oc(t), c = q(n, 32, "auxRand"), u = r.toBytes(a ^ rn(Hr("BIP0340/aux", c))), l = Hr("BIP0340/nonce", u, s, o), d = r.create(rn(l));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const h = i.multiply(d), f = ri(h.y) ? d : r.neg(d), w = ni(h), g = Lc(w, s, o), p = new Uint8Array(64);
  if (p.set(w, 0), p.set(r.toBytes(r.create(f + g * a)), 32), !Rc(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function Rc(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = jt, s = q(e, 64, "signature"), a = q(t, void 0, "message"), c = q(n, 32, "publicKey");
  try {
    const u = Tc(rn(c)), l = rn(s.subarray(0, 32));
    if (!r.isValidNot0(l))
      return !1;
    const d = rn(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const h = Lc(i.toBytes(l), ni(u), a), f = o.multiplyUnsafe(d).add(u.multiplyUnsafe(i.neg(h))), { x: w, y: g } = f.toAffine();
    return !(f.is0() || !ri(g) || w !== l);
  } catch {
    return !1;
  }
}
const Rt = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? lo(48) : r, xc(r, ti.n));
  return Object.freeze({
    keygen: vo(n, Ws),
    getPublicKey: Ws,
    sign: Xp,
    verify: Rc,
    Point: jt,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: Hr,
      lift_x: Tc,
      pointToBytes: ni
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), Yp = /* @__PURE__ */ Uint8Array.from([
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
]), Cc = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Jp = Cc.map((e) => (9 * e + 5) % 16), zc = /* @__PURE__ */ (() => {
  const n = [[Cc], [Jp]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Yp[o]));
  return n;
})(), Uc = zc[0], Hc = zc[1], Mc = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Qp = /* @__PURE__ */ Uc.map((e, t) => e.map((n) => Mc[t][n])), eh = /* @__PURE__ */ Hc.map((e, t) => e.map((n) => Mc[t][n])), th = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), nh = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Zs(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const pr = /* @__PURE__ */ new Uint32Array(16);
class rh extends fo {
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
      pr[f] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, u = this.h3 | 0, l = u, d = this.h4 | 0, h = d;
    for (let f = 0; f < 5; f++) {
      const w = 4 - f, g = th[f], p = nh[f], y = Uc[f], v = Hc[f], _ = Qp[f], I = eh[f];
      for (let S = 0; S < 16; S++) {
        const O = ar(r + Zs(f, o, a, u) + pr[y[S]] + g, _[S]) + d | 0;
        r = d, d = u, u = ar(a, 10) | 0, a = o, o = O;
      }
      for (let S = 0; S < 16; S++) {
        const O = ar(i + Zs(w, s, c, l) + pr[v[S]] + p, I[S]) + h | 0;
        i = h, h = l, l = ar(c, 10) | 0, c = s, s = O;
      }
    }
    this.set(this.h1 + a + l | 0, this.h2 + u + h | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    et(pr);
  }
  destroy() {
    this.destroyed = !0, et(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Nc = /* @__PURE__ */ Qr(() => new rh()), ih = BigInt(0), Sn = BigInt(1), oh = BigInt(2), sh = BigInt(7), ah = BigInt(256), ch = BigInt(113), Fc = [], Kc = [], Dc = [];
for (let e = 0, t = Sn, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Fc.push(2 * (5 * r + n)), Kc.push((e + 1) * (e + 2) / 2 % 64);
  let i = ih;
  for (let o = 0; o < 7; o++)
    t = (t << Sn ^ (t >> sh) * ch) % ah, t & oh && (i ^= Sn << (Sn << BigInt(o)) - Sn);
  Dc.push(i);
}
const jc = oc(Dc, !0), uh = jc[0], lh = jc[1], Xs = (e, t, n) => n > 32 ? Zf(e, t, n) : Gf(e, t, n), Ys = (e, t, n) => n > 32 ? Xf(e, t, n) : Wf(e, t, n);
function dh(e, t = 24) {
  if (Je(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = Xs(u, l, 1) ^ n[a], h = Ys(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Kc[s], c = Xs(i, o, a), u = Ys(i, o, a), l = Fc[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], u = e[s + 2], l = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & u, e[s + 9] ^= ~c & l;
    }
    e[0] ^= uh[r], e[1] ^= lh[r];
  }
  et(n);
}
let fh = class Vc {
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
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, Je(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Hf(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    $s(this.state32), dh(this.state32, this.rounds), $s(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    an(this), Qe(t);
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
    an(this, !1), Qe(t), this.finish();
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
    return Je(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (ao(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, et(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new Vc(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const ph = (e, t, n, r = {}) => Qr(() => new fh(t, e, n), r), qc = /* @__PURE__ */ ph(1, 136, 32), hh = 1024 * 1024, Gc = Object.getPrototypeOf(Uint8Array.prototype);
Object.getOwnPropertyDescriptor(Gc, Symbol.toStringTag).get;
Object.getOwnPropertyDescriptor(Gc, "byteLength").get;
function yh(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("exact message byte length is invalid");
  if (e > hh) throw new Error("exact message exceeds the 1 MiB decoded limit");
}
function gh(e) {
  const t = e.startsWith("0x") ? 2 : 0;
  yh(Math.ceil((e.length - t) / 2));
}
const wh = "hpke-x25519-hkdfsha256-aes256gcm-v1", bh = "avault:blind-box:v1", mh = "avault:blind-box:aad:v1", Mr = "machine-aesgcm-v1", ii = 1, oi = "ecdsa-secp256k1-recoverable", Kn = "ed25519", xo = "ecdsa-secp256k1-der", Eo = "schnorr-secp256k1-bip340", Dn = "schnorr-secp256k1-bip341-keypath", de = 32, Nr = 12, si = 32, vh = "avault:protected-vmk:kek-passkey:v1", xh = /^[A-Za-z_][A-Za-z0-9_]*$/, Eh = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, Sh = "avault:protected-root-meta:v1", kh = new TextEncoder(), Ah = new TextDecoder();
function So(e) {
  switch (e) {
    case Kn:
    case oi:
    case xo:
    case Eo:
    case Dn:
      return e;
    default:
      throw new Error("unsupported signing scheme");
  }
}
function gn(e) {
  if (e === void 0 || e === "secp256k1") return "secp256k1";
  if (e === "ed25519") return e;
  throw new Error("unsupported signing curve");
}
function ko(e) {
  if (So(e), e === Kn) throw new Error("Ed25519 requires exact-message signing, not a digest");
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
  return kh.encode(e);
}
function Fr(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Fr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Fr(t[n])}`).join(",")}}`;
}
function Ft(e) {
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
function Ue(e) {
  return Nn(e.startsWith("0x") ? e.slice(2) : e);
}
function Js(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? Ue(e) : fe(e);
}
function _h(e) {
  return X(se(e));
}
function Wc(e, t = "bytes") {
  return se(e, t);
}
function we(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function He(e) {
  e && new Uint8Array(e).fill(0);
}
async function Kr(e, t, n, r) {
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
async function ai(e, t, n, r) {
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
async function Ih(e, t, n, r) {
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
async function Zc(e, t) {
  const n = se(e, "passkey PRF output");
  try {
    const r = se(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return we(r, si, "passkey PRF salt"), await Ih(n, r, me(vh), de);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function Ph() {
  return Ft(de);
}
function Bh() {
  return Ft(si);
}
function $h(e) {
  const t = se(e, "passkey PRF salt");
  try {
    return we(t, si, "passkey PRF salt"), { prf: { eval: { first: Ie(t) } } };
  } finally {
    t.fill(0);
  }
}
function tt(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== ii || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function Oh(e, t) {
  const n = se(e, "VMK"), r = Ft(Nr);
  let i, o;
  try {
    we(n, de, "VMK"), o = se(t.prfSalt, "passkey PRF salt"), we(o, si, "passkey PRF salt"), i = await Zc(t.prfOutput, o);
    const s = await Kr(i, r, n);
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
async function Th(e, t) {
  const n = se(e, "VMK");
  try {
    if (we(n, de, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await Oh(n, i));
    return JSON.stringify({ v: ii, copies: r });
  } finally {
    n.fill(0);
  }
}
async function Lh(e, t) {
  const n = fe(e.prf_salt);
  if (t.prfSalt && J(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await Zc(t.prfOutput, n);
  try {
    return await ai(r, fe(e.nonce), fe(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function Rh(e, t) {
  const n = tt(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await Lh(r, t);
        try {
          return we(i, de, "VMK"), i;
        } catch (o) {
          throw i.fill(0), o;
        }
      }
    } catch {
    }
  throw new Error("no protected VMK copy could be unwrapped");
}
function Ao(e) {
  return tt(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: fe(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function Ch(e, t) {
  const n = tt(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Xc(e) {
  const t = tt(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function _o(e) {
  if (!e.kind) {
    if (e.curve !== void 0) throw new Error("protected record curve requires keypair metadata");
    return;
  }
  const t = gn(e.curve);
  if (e.kind === "static") {
    if (e.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (e.kind === "keypair") {
    if (typeof e.publicKey != "string" || e.publicKey.length === 0)
      throw new Error("keypair protected record requires a public key");
    return t === "ed25519" && ou(e.publicKey), {
      kind: "keypair",
      public_key: e.publicKey.toLowerCase(),
      ...t === "ed25519" ? { curve: t } : {}
    };
  }
  throw new Error("unsupported protected record kind");
}
function zh(e) {
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
    return _o({ kind: "keypair", publicKey: t.public_key, curve: t.curve });
  throw new Error("protected record metadata kind is invalid");
}
function Io(e, t) {
  return {
    name: e,
    ...t ? { kind: t.kind } : {},
    ...t?.public_key ? { publicKey: t.public_key } : {},
    ...t?.curve ? { curve: t.curve } : {}
  };
}
function Po(e) {
  return me(
    Fr({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" ? ru(e.name) : dn(e.name),
      scheme: e.scheme ?? Mr,
      version: e.version ?? ii,
      record: _o(e) ?? null
    })
  );
}
async function Yc(e, t, n) {
  const r = se(t, "VMK"), i = Ft(de);
  let o;
  try {
    we(r, de, "VMK"), o = se(e, "value");
    const s = Po(n), a = Ft(Nr), c = await Kr(i, a, o, s), u = Ft(Nr), l = await Kr(r, u, i, s);
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
async function Jc(e, t, n) {
  const r = se(t, "VMK");
  try {
    we(r, de, "VMK");
    const i = await ai(
      r,
      fe(e.dek_nonce),
      fe(e.wrapped_dek),
      Po(n)
    );
    try {
      return we(i, de, "DEK"), i;
    } catch (o) {
      throw i.fill(0), o;
    }
  } finally {
    r.fill(0);
  }
}
async function Qc(e, t, n) {
  const r = await Jc(e, t, n);
  try {
    return await ai(
      r,
      fe(e.nonce),
      fe(e.ciphertext),
      Po(n)
    );
  } finally {
    r.fill(0);
  }
}
function eu(e, t, n) {
  const r = tt(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== Mr)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? _o(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: Mr,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function ln(e) {
  const t = tt(e.wrap_meta), { dek_nonce: n, wrapped_dek: r, record_meta: i, ...o } = t;
  if (typeof n != "string" || typeof r != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const s = zh(i);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: n, wrapped_dek: r },
    vmkWrapMeta: JSON.stringify(o),
    ...s ? { recordMetadata: s } : {}
  };
}
function tu(e) {
  const t = { ...tt(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, me(Fr({ domain: Sh, vault: t }));
}
async function Uh(e, t, n) {
  const r = Ft(Nr), i = me(JSON.stringify(t));
  try {
    const o = await Kr(e, r, i, tu(n));
    return { v: 1, nonce: J(r), ciphertext: J(o) };
  } finally {
    i.fill(0);
  }
}
async function Bo(e, t) {
  const n = tt(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await ai(t, fe(n.nonce), fe(n.ciphertext), tu(e));
  try {
    const i = JSON.parse(Ah.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function Hh(e, t) {
  const n = tt(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function Mh() {
  return new If({
    kem: new Uf(),
    kdf: new Pf(),
    aead: new uf()
  });
}
function $o(e) {
  return fe(typeof e == "string" ? e : e.public_key);
}
async function nu(e) {
  const t = await crypto.subtle.digest("SHA-256", Ie(e));
  return X(new Uint8Array(t));
}
async function Nh(e) {
  return nu($o(e));
}
function Fh(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function Kh(e) {
  const t = Fh(e), n = $o(t);
  if (we(n, de, "avault public key"), await nu(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function Dh(e, t, n) {
  const r = Mh(), i = $o(t);
  if (we(i, de, "avault public key"), typeof t != "string" && t.fingerprint && await Nh(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? me(e) : se(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: me(bh) },
      s,
      Yh(n)
    );
    return {
      scheme: wh,
      enc: J(new Uint8Array(a.enc)),
      ct: J(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function ru(e) {
  if (typeof e != "string" || !xh.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function dn(e) {
  if (typeof e != "string" || !Eh.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function Qs(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function Oo(e) {
  const t = typeof e == "string" ? Ue(e) : se(e, "digest");
  return we(t, de, "digest"), t;
}
function jh(e) {
  const t = typeof e == "string" ? Ue(e) : se(e, "private key");
  try {
    if (we(t, de, "private key"), !Se.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function ji(e, t) {
  return typeof e == "string" ? Ue(e) : se(e, t);
}
function Dr(e) {
  const t = ji(e, "operation hash");
  return we(t, de, "operation hash"), t;
}
function jr(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function iu(e, t) {
  const n = jr(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function Vh(e) {
  return iu(e, "approval expiry");
}
function ea(e) {
  const t = se(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: jr(e.expiresAtUnix, "approval expiry") };
}
function Be(e, t) {
  const n = se(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function qh(e) {
  switch (e.purpose) {
    case "seal":
      return Gh(e.name);
    case "agent-deliver": {
      const t = ea({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: dn(e.name),
        grantId: Qs(e.grantId, "grant id"),
        ttlSecs: jr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Dr(e.operationHash)
      };
    }
    case "agent-sign": {
      ko(e.signScheme);
      const t = ea({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: ru(e.name),
        grantId: Qs(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: Oo(e.digest),
        ttlSecs: jr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Dr(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function Gh(e) {
  return { purpose: "seal", name: dn(e) };
}
async function Wh(e) {
  const t = Dr(e.operationHash), n = await Xh(e.name, e.ttlSecs);
  if (X(t) !== X(n))
    throw new Error("operation hash does not match release operation fields");
}
async function Zh(e) {
  const t = [];
  for (const n of e)
    Be(t, typeof n == "string" ? me(n) : se(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function Xh(e, t) {
  return Zh(["agent-deliver", dn(e), iu(t, "ttl seconds")]);
}
function Yh(e) {
  const t = qh(e), n = [...me(mh)];
  return Be(n, me(t.purpose)), Be(n, me(t.name)), Be(n, me(Mr)), Be(n, new Uint8Array([ii])), Be(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? me(t.grantId) : new Uint8Array()), Be(n, new Uint8Array()), Be(n, t.purpose === "agent-sign" ? me(t.signScheme) : new Uint8Array()), Be(n, t.purpose === "agent-sign" ? Oo(t.digest) : new Uint8Array()), Be(n, t.purpose === "seal" ? new Uint8Array() : se(t.approvalNonce, "approval nonce")), Be(n, t.purpose === "seal" ? new Uint8Array() : Vh(t.approvalExpiresAtUnix)), Be(n, t.purpose === "seal" ? new Uint8Array() : Dr(t.operationHash)), new Uint8Array(n);
}
async function Jh(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (dn(r.name) !== dn(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await Wh(i);
  const o = await Kh(n), s = await Jc(e, t, r);
  try {
    return await Dh(s, o, i);
  } finally {
    s.fill(0);
  }
}
function Qh(e = "secp256k1") {
  if (gn(e) === "ed25519") {
    const n = zr.utils.randomSecretKey();
    try {
      return { privateKey: n, publicKey: X(zr.getPublicKey(n)) };
    } catch (r) {
      throw n.fill(0), r;
    }
  }
  const t = Se.utils.randomSecretKey();
  return { privateKey: t, publicKey: X(Se.getPublicKey(t, !0)) };
}
function ta(e) {
  return Ue(e.toString(16).padStart(de * 2, "0"));
}
function ey(e, t, n, r = {}) {
  if (ko(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = jh(e);
  let o;
  try {
    const s = Oo(t);
    if (n === oi) {
      const a = Se.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: X(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === xo)
      return {
        scheme: n,
        signature: X(Se.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === Eo) {
      o = r.schnorrAuxRand !== void 0 ? ji(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(de)), we(o, de, "schnorr aux randomness");
      const a = Rt.sign(s, i, o);
      if (!Rt.verify(a, s, Rt.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: X(a), recovery_id: null };
    }
    if (n === Dn) {
      const a = Se.getPublicKey(i, !0), c = To(a.slice(1));
      let u = BigInt(`0x${X(i)}`);
      a[0] === 3 && (u = On - u);
      const l = BigInt(`0x${X(Rt.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (l >= On) throw new Error("invalid taproot tweak");
      let d = (u + l) % On;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let h = ta(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = On - d, h.fill(0), h = ta(d)), o = r.schnorrAuxRand !== void 0 ? ji(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(de)), we(o, de, "schnorr aux randomness");
        const f = Rt.sign(s, h, o);
        if (!Rt.verify(f, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
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
async function ty(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  if (ko(i), gn(n.curve) !== "secp256k1") throw new Error("digest signing requires a secp256k1 protected record");
  const s = await Qc(e, t, n);
  try {
    if (X(Se.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return ey(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function ou(e) {
  if (!/^[0-9a-fA-F]{64}$/.test(e)) throw new Error("expected a 32-byte Ed25519 public key");
  const t = Ue(e);
  if (!zr.utils.isValidPublicKey(t, !1)) throw new Error("invalid Ed25519 public key");
  return t;
}
function ny(e) {
  return au(ou(e));
}
function ry(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return zr.verify(Js(e.signature), me(e.message), Js(t.publicKey));
}
function su(e) {
  const t = Ue(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && Se.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && Se.utils.isValidPublicKey(t))
    return Se.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const iy = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", oy = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", sy = 1, ay = 734539939, On = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function cy(e) {
  return Nc(ce(e));
}
function uy(e) {
  const t = ce(ce(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  return n.set(e), n.set(t, e.length), au(n);
}
function au(e) {
  let t = BigInt(`0x${X(e)}`), n = "";
  for (; t > 0n; ) {
    const i = Number(t % 58n);
    t /= 58n, n = iy[i] + n;
  }
  let r = 0;
  for (const i of e) {
    if (i !== 0) break;
    r += 1;
  }
  return "1".repeat(r) + n;
}
function ly(e) {
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
function dy(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function fy(e, t, n) {
  const r = dy(e).concat(t), i = ly(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function py(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function na(e, t, n) {
  const r = t === 0 ? sy : ay, i = [t].concat(py(n, 8, 5));
  return `${e}1${i.concat(fy(e, i, r)).map((o) => oy[o]).join("")}`;
}
function hy(e) {
  const t = e.toLowerCase(), n = X(qc(me(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function To(e) {
  const t = BigInt(`0x${X(Rt.utils.taggedHash("TapTweak", e))}`);
  if (t >= On) throw new Error("invalid taproot tweak");
  const n = Se.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(Se.Point.BASE.multiply(t));
  if (r.equals(Se.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function yy(e) {
  return To(su(e).slice(1)).toBytes(!0).slice(1);
}
function gy(e) {
  const t = su(e), n = Se.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = qc(r), o = cy(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = To(a);
  return {
    eth: `0x${hy(X(i.slice(-20)))}`,
    btc_legacy: uy(s),
    btc_segwit: na("bc", 0, o),
    btc_taproot: na("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const Lo = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let Vi = { ...Lo };
function wy(e) {
  return e === 300 || e === 600 || e === 1800 ? e : Lo.windowSeconds;
}
function by(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new m("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function Ro(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new m("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new m("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: by(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function my(e) {
  if (typeof e != "object" || e === null) return { ...Lo };
  const t = e;
  return {
    windowSeconds: wy(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function Co(e) {
  return Vi = my(e), Vi;
}
function xe() {
  return { ...Vi };
}
const vy = "avibe-vault-lock:v1:", D = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let dt = null, Un = null, jn = null, qi = null, zo = 0;
const Vr = /* @__PURE__ */ new Set();
let cu = null;
function xy(e) {
  cu = e;
}
function ra() {
  return D.vmk ? "unlocked" : D.wrapMeta ? "locked" : "needs-setup";
}
function uu(e) {
  cu?.({
    state: ra(),
    ...dt !== null && ra() === "unlocked" ? { expiresAt: dt } : {},
    reason: e
  });
}
function Uo() {
  Un !== null && (clearTimeout(Un), Un = null);
}
function qr() {
  jn?.close(), jn = null, qi = null;
}
function lu(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function Ey(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function du(e) {
  const t = tt(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? lu(t.vault_user_handle) : `wrap-${Ey(e)}`;
}
function Sy(e) {
  return lu(e);
}
function fu(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    qr();
    return;
  }
  const t = `${vy}${e}`;
  qi !== t && (qr(), qi = t, jn = new BroadcastChannel(t), jn.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && Ne({ broadcast: !1, reason: "manual-lock" });
  });
}
function ky() {
  D.scopeId && (fu(D.scopeId), jn?.postMessage({ type: "lock", scopeId: D.scopeId }));
}
function pu() {
  return new Error("vault-operation-aborted");
}
function hu() {
  zo += 1;
  for (const e of Vr)
    e.abort(pu());
  Vr.clear();
}
function Ay() {
  D.vmk?.fill(0), D.vmk = null, dt = null, Uo(), qr(), D.freshSetup && (D.wrapMeta = null, D.freshSetup = !1, D.scopeId = null);
}
function _y() {
  return dt !== null && Date.now() >= dt;
}
function yu() {
  return D.vmk && _y() ? (Ne({ broadcast: !1, reason: "auto-lock" }), !1) : D.vmk !== null;
}
function gu(e, t = xe()) {
  if (!D.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return dt = Date.now() + n, Uo(), Un = setTimeout(() => {
    Ne({ broadcast: !1, reason: "auto-lock" });
  }, n), uu(e), dt;
}
function Iy() {
  const e = dt;
  if (!D.vmk || e === null) return () => {
  };
  Uo();
  let t = !1;
  return () => {
    if (t || !D.vmk) return;
    t = !0;
    const n = e - Date.now();
    if (n <= 0) {
      Ne({ broadcast: !1, reason: "auto-lock" });
      return;
    }
    Un = setTimeout(() => {
      Ne({ broadcast: !1, reason: "auto-lock" });
    }, n);
  };
}
function Py(e) {
  if (e instanceof m && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function By(e) {
  if (e.signal.aborted || e.epoch !== zo || !D.vmk)
    throw pu();
}
async function Ho(e, t = {}) {
  if (!yu() || !D.vmk || !D.wrapMeta)
    throw new Error("vault-locked");
  const n = new Uint8Array(D.vmk), r = D.wrapMeta, i = zo, o = new AbortController();
  Vr.add(o);
  const s = {
    epoch: i,
    signal: o.signal,
    assertCurrent: () => By(s)
  };
  let a = null;
  try {
    s.assertCurrent();
    const c = await e(n, r, s);
    return s.assertCurrent(), t.renewOnSuccess !== !1 && gu("renew"), s.assertCurrent(), t.beforeSuccess && (a = Iy(), await t.beforeSuccess(), s.assertCurrent(), a(), a = null), c;
  } catch (c) {
    throw Py(c) || Ne({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    a?.(), Vr.delete(o), n.fill(0);
  }
}
function $y() {
  return D.vmk !== null && D.freshSetup;
}
function wu(e) {
  return hu(), D.vmk?.fill(0), D.vmk = e.vmk, D.wrapMeta = e.wrapMeta, D.freshSetup = e.freshSetup, D.scopeId = e.scopeId, fu(e.scopeId), { state: "unlocked", expiresAt: gu("unlock", e.policy) };
}
function Ne(e = {}) {
  return e.broadcast && ky(), hu(), Ay(), uu(e.reason ?? "manual-lock"), { state: "locked" };
}
function ft(e) {
  return yu(), D.vmk ? {
    state: "unlocked",
    expiresAt: dt ?? void 0,
    ...D.freshSetup ? { freshSetup: !0 } : {}
  } : (e && (D.wrapMeta = Xc(e), D.scopeId = du(D.wrapMeta)), D.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function Mo(e) {
  const t = Xc(e), n = du(t);
  return D.wrapMeta = t, D.scopeId = n, { wrapMeta: t, scopeId: n };
}
function Oy() {
  Ne({ broadcast: !1, reason: "unload" }), qr();
}
const hr = "Avibe Vault", ia = "avibe-vault";
function Xe(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function _t(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function bu() {
  return _t(crypto.getRandomValues(new Uint8Array(32)));
}
function Ty(e) {
  try {
    return fe(e);
  } catch {
    return null;
  }
}
function Vn(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return _t(Wc(e));
  if (typeof e == "string") {
    const n = Ty(e);
    return _t(n ?? new TextEncoder().encode(e));
  }
  if (Array.isArray(e))
    return _t(Uint8Array.from(e));
  if (t !== void 0)
    return _t(new TextEncoder().encode(t));
  throw new Error("webauthn bytes are missing");
}
function Ly(e) {
  const t = Vn(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function Gr(e) {
  if (Array.isArray(e))
    return e.map((t) => {
      const n = Xe(t);
      if (!n || n.type !== "public-key")
        throw new Error("invalid WebAuthn credential descriptor");
      return {
        type: "public-key",
        id: Vn(n.id),
        ...Array.isArray(n.transports) ? { transports: n.transports } : {}
      };
    });
}
function oa(e) {
  return !Array.isArray(e) || e.length === 0 ? [
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 }
  ] : e.map((t) => {
    const n = Xe(t);
    if (!n || n.type !== "public-key" || typeof n.alg != "number")
      throw new Error("invalid WebAuthn pubKeyCredParams");
    return { type: "public-key", alg: n.alg };
  });
}
function sa(e) {
  return {
    ...Xe(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function aa(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function Ry(e) {
  const t = Xe(e) ?? {};
  return { ...t, prf: Xe(t.prf) ?? {} };
}
function pt() {
  return window.location.hostname;
}
function Cy(e) {
  const t = Xe(e.authzCreationOptions), r = Xe(t?.webauthn) ?? t, i = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, o = Xe(r?.rp), s = typeof o?.id == "string" ? o.id : void 0;
  if (s && s !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!r)
    return {
      options: {
        rp: { name: hr, id: e.rpId },
        user: {
          id: Ly(e.vaultUserHandle),
          name: e.vaultUserHandle || ia,
          displayName: e.displayName || hr
        },
        challenge: bu(),
        pubKeyCredParams: oa(void 0),
        authenticatorSelection: sa(void 0),
        extensions: { prf: {} }
      }
    };
  const a = Xe(r.user);
  if (!a) throw new Error("webauthn user is missing");
  return {
    options: {
      rp: {
        name: typeof o?.name == "string" ? o.name : hr,
        id: e.rpId
      },
      user: {
        id: Vn(a.id, e.vaultUserHandle),
        name: typeof a.name == "string" ? a.name : e.vaultUserHandle || ia,
        displayName: typeof a.displayName == "string" ? a.displayName : e.displayName || hr
      },
      challenge: Vn(r.challenge),
      pubKeyCredParams: oa(r.pubKeyCredParams),
      authenticatorSelection: sa(r.authenticatorSelection),
      extensions: Ry(r.extensions),
      ...Gr(r.excludeCredentials) ? { excludeCredentials: Gr(r.excludeCredentials) } : {},
      ...typeof r.timeout == "number" ? { timeout: r.timeout } : {},
      ...aa(r.attestation) ? { attestation: aa(r.attestation) } : {}
    },
    ...i ? { challengeId: i } : {}
  };
}
function zy(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function Uy(e, t) {
  const n = zy(e), r = {
    challenge: bu(),
    rpId: t,
    userVerification: "required",
    extensions: $h(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: _t(fe(n.credentialId))
    }
  ]), r;
}
function Hy(e, t, n) {
  const r = {
    challenge: _t(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: _t(fe(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function My(e, t = pt()) {
  const n = Xe(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: Vn(n.challenge),
    rpId: t,
    userVerification: "required",
    ...Gr(n.allowCredentials) ? { allowCredentials: Gr(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function mu(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function vu(e) {
  return {
    id: e.id,
    rawId: J(e.rawId),
    type: e.type
  };
}
function Ny(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...vu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      attestationObject: J(t.attestationObject),
      transports: n
    }
  };
}
function Fy(e) {
  const t = e.response;
  return {
    ...vu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      authenticatorData: J(t.authenticatorData),
      signature: J(t.signature),
      userHandle: t.userHandle ? J(t.userHandle) : null
    }
  };
}
function Ky(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = Wc(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function No(e, t, n) {
  const r = await navigator.credentials.get(
    mu(Uy(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = Ky(r), o = J(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function Dy(e, t, n, r) {
  if (!await navigator.credentials.get(
    mu(Hy(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function jy(e) {
  const t = await navigator.credentials.get({
    publicKey: My(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return Fy(t);
}
const Vy = /ancestor|not the same as its|cross-?origin|different origin/i;
function xu(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function qy(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function Eu(e) {
  const t = xu(e);
  return t === "SecurityError" || t === "NotSupportedError" || Vy.test(qy(e));
}
function Gy(e) {
  return xu(e) === "NotAllowedError" && !Eu(e);
}
function Fo(e) {
  const { options: t, challengeId: n } = Cy(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = J(i.rawId), s = Ny(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const ca = {
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
    "review.notice": "Some content is not decoded; approving it is blind signing.",
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
    "review.field.maxPriorityFeePerGas": "Max priority fee per gas",
    "review.field.calldata": "Complete calldata",
    "review.field.unsignedTransaction": "Unsigned transaction",
    "review.field.digest": "Signing digest",
    "review.note.wei": "wei",
    "review.note.baseUnits": "base units",
    "review.note.decimals": "decimals {{count}}",
    "review.note.bytes": "{{count}} bytes",
    "review.note.dataBytes": "{{count}} bytes of data",
    "review.note.notDecoded": "not decoded",
    "review.note.signer": "signer",
    "review.note.writable": "writable",
    "review.note.readOnly": "read-only",
    "review.note.systemProgram": "System Program",
    "review.note.tokenProgram": "SPL Token Program",
    "review.group.request": "Request",
    "review.group.transaction": "Transaction",
    "review.group.accounts": "Accounts in message",
    "review.group.instruction": "Instruction {{index}}",
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
    "review.notice": "部分内容未解析，批准即为盲签。",
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
    "review.field.maxPriorityFeePerGas": "每单位 Gas 最高优先费",
    "review.field.calldata": "完整 calldata",
    "review.field.unsignedTransaction": "未签名交易",
    "review.field.digest": "签名摘要",
    "review.note.wei": "wei",
    "review.note.baseUnits": "最小单位",
    "review.note.decimals": "小数位 {{count}}",
    "review.note.bytes": "{{count}} 字节",
    "review.note.dataBytes": "数据 {{count}} 字节",
    "review.note.notDecoded": "未解析",
    "review.note.signer": "签名者",
    "review.note.writable": "可写",
    "review.note.readOnly": "只读",
    "review.note.systemProgram": "System Program",
    "review.note.tokenProgram": "SPL Token Program",
    "review.group.request": "请求来源",
    "review.group.transaction": "交易",
    "review.group.accounts": "消息内账户",
    "review.group.instruction": "指令 {{index}}",
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
let Wr = "en";
function Wy(e) {
  return e === "zh" ? "zh" : "en";
}
function Zy(e) {
  const t = Wy(e);
  return t === Wr ? !1 : (Wr = t, !0);
}
function Xy() {
  return Wr;
}
function N(e, t = {}) {
  const n = ca[Wr], r = ca.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function Yy(e) {
  return JSON.stringify(e ?? {});
}
function ua(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function Pe(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = Yy(n), e.textContent = N(t, n);
}
function Kt(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function Jy(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = N(n, ua(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = N(n, ua(t.dataset.i18nPlaceholderParams)));
  });
}
const Qy = {
  sol: { symbol: "SOL", baseUnit: "lamports", decimals: 9 },
  eth: { symbol: "ETH", baseUnit: "wei", decimals: 18 }
};
function eg(e, t) {
  const { symbol: n, baseUnit: r, decimals: i } = Qy[t];
  if (!/^(?:0|[1-9][0-9]*)$/.test(e)) return `${e} ${r}`;
  const o = e.padStart(i + 1, "0"), s = o.slice(-i).replace(/0+$/, "");
  return `${o.slice(0, -i)}${s ? `.${s}` : ""} ${n} (${e} ${r})`;
}
function Q(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
const tg = "http://www.w3.org/2000/svg";
function yr(e, t) {
  const n = document.createElementNS(tg, e);
  for (const [r, i] of Object.entries(t)) n.setAttribute(r, i);
  return n;
}
function ng() {
  const e = yr("svg", {
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
    yr("path", { d: "M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }),
    yr("path", { d: "M12 9v4.5" }),
    yr("path", { d: "M12 17h.01" })
  ), e;
}
function rg(e) {
  if (!e.notes?.length) return null;
  const t = Q("span", "review-notes");
  for (const n of e.notes) {
    const r = Q("span", "review-note");
    typeof n == "string" ? Pe(r, n) : Pe(r, n.key, { count: n.count }), t.append(r);
  }
  return t;
}
function la(e) {
  const t = Q("span", "review-label");
  return Pe(t, e.label, e.index === void 0 ? void 0 : { index: e.index }), t;
}
function ig(e, t) {
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
function ki(e) {
  const t = Q("div", e.raw ? "review-field review-field-raw" : "review-field"), n = rg(e);
  if (e.raw) {
    const o = Q("div", "review-raw-head"), s = Q("pre", "review-raw");
    return Kt(s, e.value), o.append(la(e)), n && o.append(n), o.append(ig(s, e.value)), t.append(o, s), t;
  }
  const r = Q("div", "review-value"), i = Q("span", "review-mono");
  return Kt(i, e.native ? eg(e.value, e.native) : e.value), r.append(i), n && r.append(n), t.append(la(e), r), t;
}
function da(e, t, n) {
  const r = Q("section", "review-group"), i = Q("h2", "review-group-title");
  return Pe(i, e, t === void 0 ? void 0 : { index: t }), r.append(i, ...n), r;
}
function og(e, t, n = {}) {
  Kt(e, "");
  const r = Q("div", "review"), i = Q("div", "review-heading"), o = Q("p", "review-kind");
  if (Pe(o, t.kind), i.append(o), n.session) {
    const l = Q("p", "review-session"), d = Q("span", "review-session-label");
    Pe(d, "context.session");
    const h = Q("span", "review-session-value");
    Kt(h, n.session), l.append(d, h), i.append(l);
  }
  const s = Q("div", "review-summary");
  if (s.append(ki(t.signer), ...t.summary.map(ki)), r.append(i, s), t.undecoded) {
    const l = Q("p", "review-notice"), d = Q("span", "review-notice-text");
    Pe(d, "review.notice"), l.append(ng(), d), r.append(l);
  }
  const a = Q("details", "review-details"), c = Q("summary", "review-details-toggle");
  Pe(c, "review.details");
  const u = Q("div", "review-details-body");
  n.rows && u.append(da("review.group.request", void 0, [n.rows]));
  for (const l of t.details) u.append(da(l.title, l.index, l.fields.map(ki)));
  a.append(c, u), r.append(a), e.append(r);
}
let Ko = null;
function sg(e) {
  Ko = e;
}
function ag() {
  Ko?.("ui.show");
}
function cg() {
  Ko?.("ui.hide");
}
function ug() {
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
function Su(e) {
  e.querySelectorAll(".dynamic").forEach((t) => t.remove());
}
function le(e) {
  return { text: e };
}
function qn(e, t) {
  return { key: e, params: t };
}
function W(e, t) {
  if (typeof t == "string") {
    Pe(e, t);
    return;
  }
  if ("text" in t) {
    Kt(e, t.text);
    return;
  }
  Pe(e, t.key, t.params);
}
function Do(e, t, n) {
  const r = ug();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), ag(), r.card.classList.remove("confirm-card"), W(r.title, e), W(r.subtitle, t), n ? W(r.body, n) : Kt(r.body, ""), Su(r.card), r;
}
function jo() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), Su(e)), cg();
}
function nn(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function fa(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function lg(e) {
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
function ku(e) {
  const t = document.createElement("div");
  t.className = "confirmation-details";
  for (const n of e.rows) {
    const r = document.createElement("div");
    r.className = "detail-row";
    const i = document.createElement("span");
    i.className = "detail-label", W(i, n.label), r.append(i, lg(n)), t.append(r);
  }
  return t;
}
function dg(e, t, n) {
  if (Kt(e, ""), e.append(ku(t)), n) {
    const r = document.createElement("p");
    r.className = "confirmation-note", W(r, n), e.append(r);
  }
}
function Gn(e) {
  const t = document.createElement("button");
  return t.type = "button", t.className = "action dynamic", W(t, e), t;
}
function Au(e = le("")) {
  const t = document.createElement("p");
  return t.className = "setup-status dynamic", W(t, e), t;
}
let gr = null;
function Vo() {
  return new Error("operation-superseded");
}
function Hn(e) {
  const t = e.reason;
  return t instanceof Error ? t : Vo();
}
function pa(e) {
  if (e?.aborted) throw Hn(e);
}
function er(e) {
  gr?.abort(Vo());
  const t = new AbortController();
  return gr = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    gr === t && (gr = null);
  });
}
async function fg(e) {
  return er(async (t) => {
    pa(t), pa(e.abortSignal);
    const n = new TextDecoder().decode(e.plaintext), r = Do("plaintext.title", le(e.name), "plaintext.body"), i = document.createElement("pre");
    i.className = "plaintext dynamic", i.textContent = n;
    const o = Gn("common.done"), s = Gn("plaintext.copy");
    s.classList.add("secondary");
    const a = Au("plaintext.copyWarning");
    nn(r.card, i), nn(r.card, a), nn(r.card, s), nn(r.card, o);
    try {
      await new Promise((c, u) => {
        if (t.aborted) {
          u(Hn(t));
          return;
        }
        if (e.abortSignal?.aborted) {
          u(Hn(e.abortSignal));
          return;
        }
        let l = !1, d = () => {
        }, h = null, f = null, w = !e.prepareCopy;
        const g = () => {
          h?.abort(Vo());
        }, p = (I) => {
          l || (l = !0, d(), g(), I());
        }, y = (I) => {
          p(() => u(Hn(I)));
        }, v = () => y(t), _ = () => {
          e.abortSignal && y(e.abortSignal);
        };
        d = () => {
          t.removeEventListener("abort", v), e.abortSignal?.removeEventListener("abort", _);
        }, t.addEventListener("abort", v, { once: !0 }), e.abortSignal?.addEventListener("abort", _, { once: !0 }), s.addEventListener("click", () => {
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
          }, O = e.prepareCopy && !w ? Promise.resolve(e.prepareCopy(I.signal)).then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (w = !0, W(a, "plaintext.copyReady"), s.disabled = !1);
          }) : S().then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (w = !1), W(a, "plaintext.copiedBody"), s.disabled = !1);
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
      jo();
    }
  });
}
function qo(e, t, n, r) {
  const i = Do(e.title, e.subtitle, e.review ? void 0 : e.body);
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.review ? og(i.body, e.review, {
    session: e.reviewSession,
    rows: e.details && ku(e.details)
  }) : e.details && dg(i.body, e.details, e.body);
  const o = Gn(e.confirmLabel), s = Gn("common.cancel");
  return s.classList.add("secondary"), fa(i.card, s), fa(i.card, o), o.disabled = !0, new Promise((a, c) => {
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
      f(() => c(Hn(t)));
    }, f = (w) => {
      u || (u = !0, clearTimeout(d), l?.dispose(), t.removeEventListener("abort", h), jo(), w());
    };
    if (t.aborted) {
      h();
      return;
    }
    t.addEventListener("abort", h, { once: !0 }), o.addEventListener("click", () => {
      if (o.disabled) return;
      o.disabled = !0, s.disabled = !0;
      let w;
      try {
        l?.assertCurrent(), w = r ? r() : Promise.resolve();
      } catch (g) {
        f(() => c(g));
        return;
      }
      w.then(
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
function Zr(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function pg(e) {
  return new Promise((t, n) => {
    const r = () => n(Zr(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function ha(e) {
  if (e?.aborted) throw Zr(e);
}
async function _u(e) {
  const t = Mo(e.wrapMeta), n = Ao(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      No(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), Zr(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? Zr(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [pg(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await Iu({
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
async function Iu(e) {
  const t = Mo(e.wrapMeta);
  let n;
  try {
    ha(e.abortSignal), n = await Rh(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), ha(e.abortSignal);
    const r = wu({
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
function hg(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function yg(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function ya(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function gg(e) {
  const t = hg(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new m("invalid_payload", "kind must be static or keypair");
  const r = ya(t.name, "name");
  if (t.rootMetadata !== void 0) throw new m("invalid_payload", "seal cannot set vault root metadata");
  const i = yg(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.curve !== void 0) throw new m("invalid_payload", "static seal cannot carry a curve");
    if (t.inputMode !== "parent-value")
      throw new m("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: ya(t.value, "value"),
      wrapMeta: i
    };
  }
  if (t.inputMode !== void 0)
    throw new m("invalid_payload", "keypair seal is generate-only and does not accept inputMode");
  if (t.value !== void 0)
    throw new m("invalid_payload", "keypair seal cannot accept parent-provided private key material");
  let o;
  try {
    o = gn(t.curve);
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
function Go(e) {
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
const wg = 512, Pu = "avibe-vault-signed-context-replay:v2", bg = "avibe-vault-signed-context-replay:v2", mg = "avibe-vault-signed-context-replay:v2", Me = /* @__PURE__ */ new Map();
let ga = !1, Tn = null;
function Le(e) {
  return typeof e == "object" && e !== null;
}
function ct(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function kn(e, t) {
  if (e !== void 0) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function Ai(e, t) {
  if (e !== void 0) {
    if (!Array.isArray(e) || !e.every((n) => typeof n == "string"))
      throw new m("invalid_payload", `${t} must be a string array`);
    return e;
  }
}
function vg(e, t) {
  if (e !== "static" && e !== "keypair") throw new m("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function xg(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new m("invalid_payload", "context purpose is invalid");
  return e;
}
function Gi(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new m("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function Eg(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new m("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function Wo(e, t) {
  if (!Le(e)) throw new m(t, "agent delivery context.release must be an object");
  return {
    name: ct(e.name, "context.release.name"),
    ttlSecs: Gi(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: Eg(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: Gi(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: ct(e.operationHash, "context.release.operationHash")
  };
}
function Bt(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Bt).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Bt(t[n])}`).join(",")}}`;
}
function Zo(e) {
  const t = Le(e) ? e : null;
  if (!t) throw new m("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new m("invalid_payload", "context version must be 2");
  const n = xg(t.purpose);
  ct(t.requestId, "context.requestId"), t.grantId !== void 0 && kn(t.grantId, "context.grantId");
  const r = Le(t.display) ? t.display : null;
  if (!r) throw new m("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new m("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, u) => {
    if (!Le(c)) throw new m("invalid_payload", `context.display.secrets[${u}] must be an object`);
    ct(c.name, `context.display.secrets[${u}].name`), vg(c.kind, `context.display.secrets[${u}].kind`);
  }), r.sessionLabel !== void 0 && kn(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && kn(r.command, "context.display.command"), r.egress !== void 0 && kn(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!Le(i)) throw new m("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && Ai(i.env, "context.display.source.env"), i.tags !== void 0 && Ai(i.tags, "context.display.source.tags"), i.skills !== void 0 && Ai(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && Gi(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = Le(t.signature) ? t.signature : null;
  if (!o) throw new m("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new m("invalid_payload", "context signature alg must be ed25519");
  ct(o.keyId, "context.signature.keyId"), ct(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!Le(s)) throw new m("invalid_payload", "context.agent must be an object");
    const c = Le(s.publicKey) ? s.publicKey : null;
    if (!c) throw new m("invalid_payload", "context.agent.publicKey must be an object");
    ct(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && kn(c.fingerprint, "context.agent.publicKey.fingerprint"), ct(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = Wo(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new m("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new m("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !Le(a))
    throw new m("invalid_payload", "context.release must be an object");
  return ct(t.expiresAt, "context.expiresAt"), t;
}
function ci(e) {
  const { signature: t, ...n } = e;
  return Bt(n);
}
function Wi(e) {
  if (e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", `${e.expectedPurpose} context has the wrong purpose`);
  if (!e.context.display.secrets.some(
    (n) => n.name === e.secret.name && n.kind === e.secret.kind
  )) {
    const n = e.secret.kind === "keypair" ? "key" : "secret";
    throw new m("invalid_context", `${e.expectedPurpose} context does not cover the requested ${n}`);
  }
}
function Xr(e) {
  if (e.expectedPurpose && e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", "signed context purpose does not match operation");
  const t = e.now ?? Date.now(), n = Date.parse(e.context.expiresAt);
  if (!Number.isFinite(n) || n <= t)
    throw new m("context_expired", "signed context is expired", !0);
  if (!ry({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: ci(e.context)
  })) throw new m("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && Wo(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new m("context_expired", "signed release approval is expired", !0);
}
function Xo(e) {
  for (const [t, n] of Me)
    n <= e && Me.delete(t);
}
function Sg() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function fn() {
  return typeof window < "u";
}
function Yo() {
  return new m("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function Bu(e) {
  const t = Sg();
  if (!t && e && fn()) throw Yo();
  return t;
}
function $u(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!Le(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function Jo(e = Date.now(), t = !1) {
  Xo(e);
  const n = Bu(t);
  if (n)
    try {
      n.setItem(Pu, JSON.stringify({ version: 2, entries: [...Me] }));
    } catch {
      if (t && fn()) throw Yo();
    }
}
function Ou(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && Me.set(r, Math.max(Me.get(r) ?? 0, i));
  n && Jo(t);
}
function Qo() {
  if (!(Tn || typeof BroadcastChannel > "u"))
    try {
      Tn = new BroadcastChannel(bg), Tn.addEventListener("message", (e) => {
        const t = Le(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || Ou($u({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      Tn = null;
    }
}
function kg(e = Date.now()) {
  ga || (Qo(), Tu(e, fn()), ga = !0);
}
function Tu(e = Date.now(), t = !1) {
  Qo();
  const n = Bu(t);
  if (n)
    try {
      Ou($u(JSON.parse(n.getItem(Pu) ?? "null"), e), e, !1), Xo(e);
    } catch {
      if (t && fn()) throw Yo();
      Jo(e);
    }
}
function Ag(e) {
  Qo();
  try {
    Tn?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function _g() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function Ig(e) {
  const t = _g();
  if (t) return await t.request(mg, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new m("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function Lu(e, t) {
  kg(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new m("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  Xo(t);
  for (const r of n.keys())
    if (Me.has(r))
      throw new m("context_replayed", "signed context requestId was already used", !0);
  if (Me.size + n.size > wg)
    throw new m("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function Yr(e, t = Date.now()) {
  Lu(e, t);
}
async function ui(e, t = Date.now()) {
  const n = [...e];
  await Ig(() => {
    Tu(t, fn());
    const r = Lu(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, Me.get(o));
    for (const [o, s] of r) Me.set(o, s);
    try {
      Jo(t, fn());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? Me.delete(s) : Me.set(s, a);
      throw o;
    }
    Ag([...r]);
  });
}
async function Pg(e, t) {
  if (e.purpose !== "agent-deliver") throw new m("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  const n = Wo(e.release, "invalid_context");
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
function Bg(e) {
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  if (e.agent.publicKey.fingerprint && e.agent.publicKey.fingerprint !== e.agent.fingerprint)
    throw new m("invalid_context", "agent public key fingerprint mismatch");
  return { ...e.agent.publicKey, fingerprint: e.agent.fingerprint };
}
async function $g(e) {
  const t = e.map((n) => ci(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(Bt(t))));
}
function wa(e) {
  return Bt(e.display);
}
const Og = "1.2.3";
let Oe = class Zi extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof Zi ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof Zi && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${Og}`
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
function ht(e, t) {
  return e.exec(t)?.groups;
}
const Ru = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Cu = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, zu = /^\(.+?\).*?$/, ba = /^tuple(?<array>(\[(\d*)\])*)$/;
function Xi(e) {
  let t = e.type;
  if (ba.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += Xi(o), i < n - 1 && (t += ", ");
    }
    const r = ht(ba, e.type);
    return t += `)${r?.array || ""}`, Xi({
      ...e,
      type: t
    });
  }
  return "indexed" in e && e.indexed && (t = `${t} indexed`), e.name ? `${t} ${e.name}` : t;
}
function An(e) {
  let t = "";
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r];
    t += Xi(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function Tg(e) {
  return e.type === "function" ? `function ${e.name}(${An(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${An(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${An(e.inputs)})` : e.type === "error" ? `error ${e.name}(${An(e.inputs)})` : e.type === "constructor" ? `constructor(${An(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const Uu = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function Lg(e) {
  return Uu.test(e);
}
function Rg(e) {
  return ht(Uu, e);
}
const Hu = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function Cg(e) {
  return Hu.test(e);
}
function zg(e) {
  return ht(Hu, e);
}
const Mu = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function Ug(e) {
  return Mu.test(e);
}
function Hg(e) {
  return ht(Mu, e);
}
const Nu = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function Fu(e) {
  return Nu.test(e);
}
function Mg(e) {
  return ht(Nu, e);
}
const Ku = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function Ng(e) {
  return Ku.test(e);
}
function Fg(e) {
  return ht(Ku, e);
}
const Du = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function Kg(e) {
  return Du.test(e);
}
function Dg(e) {
  return ht(Du, e);
}
const jg = /^receive\(\) external payable$/;
function Vg(e) {
  return jg.test(e);
}
const qg = /* @__PURE__ */ new Set(["indexed"]), Yi = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class Gg extends Oe {
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
class Wg extends Oe {
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
class Zg extends Oe {
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
class Xg extends Oe {
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
class Yg extends Oe {
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
class Jg extends Oe {
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
class Qg extends Oe {
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
class wn extends Oe {
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
class ew extends Oe {
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
class tw extends Oe {
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
class nw extends Oe {
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
class rw extends Oe {
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
function iw(e, t, n) {
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
const _i = /* @__PURE__ */ new Map([
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
function ow(e, t = {}) {
  if (Ug(e))
    return sw(e, t);
  if (Cg(e))
    return aw(e, t);
  if (Lg(e))
    return cw(e, t);
  if (Ng(e))
    return uw(e, t);
  if (Kg(e))
    return lw(e);
  if (Vg(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new ew({ signature: e });
}
function sw(e, t = {}) {
  const n = Hg(e);
  if (!n)
    throw new wn({ signature: e, type: "function" });
  const r = Ce(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(Dt(r[a], {
      modifiers: Yi,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = Ce(n.returns), c = a.length;
    for (let u = 0; u < c; u++)
      s.push(Dt(a[u], {
        modifiers: Yi,
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
function aw(e, t = {}) {
  const n = zg(e);
  if (!n)
    throw new wn({ signature: e, type: "event" });
  const r = Ce(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Dt(r[s], {
      modifiers: qg,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function cw(e, t = {}) {
  const n = Rg(e);
  if (!n)
    throw new wn({ signature: e, type: "error" });
  const r = Ce(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Dt(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function uw(e, t = {}) {
  const n = Fg(e);
  if (!n)
    throw new wn({ signature: e, type: "constructor" });
  const r = Ce(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Dt(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function lw(e) {
  const t = Dg(e);
  if (!t)
    throw new wn({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const dw = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, fw = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, pw = /^u?int$/;
function Dt(e, t) {
  const n = iw(e, t?.type, t?.structs);
  if (_i.has(n))
    return _i.get(n);
  const r = zu.test(e), i = ht(r ? fw : dw, e);
  if (!i)
    throw new Zg({ param: e });
  if (i.name && yw(i.name))
    throw new Xg({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, u = {};
  if (r) {
    c = "tuple";
    const d = Ce(i.type), h = [], f = d.length;
    for (let w = 0; w < f; w++)
      h.push(Dt(d[w], { structs: a }));
    u = { components: h };
  } else if (i.type in a)
    c = "tuple", u = { components: a[i.type] };
  else if (pw.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !ju(c))
    throw new Wg({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new Yg({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (Yi.has(i.modifier) && !gw(c, !!i.array))
      throw new Jg({
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
  return _i.set(n, l), l;
}
function Ce(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? Ce(a, [...t, n.trim()]) : Ce(a, t, `${n}${s}`, r);
      case "(":
        return Ce(a, t, `${n}${s}`, r + 1);
      case ")":
        return Ce(a, t, `${n}${s}`, r - 1);
      default:
        return Ce(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new rw({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function ju(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || Ru.test(e) || Cu.test(e);
}
const hw = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function yw(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || Ru.test(e) || Cu.test(e) || hw.test(e);
}
function gw(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function ww(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!Fu(a))
      continue;
    const c = Mg(a);
    if (!c)
      throw new wn({ signature: a, type: "struct" });
    const u = c.properties.split(";"), l = [], d = u.length;
    for (let h = 0; h < d; h++) {
      const w = u[h].trim();
      if (!w)
        continue;
      const g = Dt(w, {
        type: "struct"
      });
      l.push(g);
    }
    if (!l.length)
      throw new tw({ signature: a });
    t[c.name] = l;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = Vu(c, t);
  }
  return r;
}
const bw = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function Vu(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (zu.test(s.type))
      r.push(s);
    else {
      const c = ht(bw, s.type);
      if (!c?.type)
        throw new Qg({ abiParameter: s });
      const { array: u, type: l } = c;
      if (l in t) {
        if (n.has(l))
          throw new nw({ type: l });
        r.push({
          ...s,
          type: `tuple${u ?? ""}`,
          components: Vu(t[l], t, /* @__PURE__ */ new Set([...n, l]))
        });
      } else if (ju(l))
        r.push(s);
      else
        throw new Gg({ type: l });
    }
  }
  return r;
}
function mw(e) {
  const t = ww(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    Fu(o) || n.push(ow(o, t));
  }
  return n;
}
function qu(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => vw(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function vw(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${qu(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function tr(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function ue(e) {
  return tr(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const Gu = "2.54.6";
let Ii = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${Gu}`
};
class K extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof K ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof K && n.cause.docsPath || n.docsPath, o = Ii.getDocsUrl?.({ ...n, docsPath: i }), s = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...o ? [`Docs: ${o}`] : [],
      ...r ? [`Details: ${r}`] : [],
      ...Ii.version ? [`Version: ${Ii.version}`] : []
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
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = Gu;
  }
  walk(t) {
    return Wu(this, t);
  }
}
function Wu(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? Wu(e.cause, t) : t ? null : e;
}
class xw extends K {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${qu(n, { includeName: !0 })})`,
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
class Ew extends K {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class Sw extends K {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class kw extends K {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${ue(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class Aw extends K {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class _w extends K {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class Iw extends K {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class Pw extends K {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class Bw extends K {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class Zu extends K {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class Xu extends K {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function bn(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? It(e, { dir: t, size: n }) : $w(e, { dir: t, size: n });
}
function It(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new Xu({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function $w(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new Xu({
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
class es extends K {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class Ow extends K {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class Tw extends K {
  constructor({ givenSize: t, maxSize: n }) {
    super(`Size cannot exceed ${n} bytes. Given size: ${t} bytes.`, { name: "SizeOverflowError" });
  }
}
function Wn(e, { dir: t = "left" } = {}) {
  let n = typeof e == "string" ? e.replace("0x", "") : e, r = 0;
  for (let i = 0; i < n.length - 1 && n[t === "left" ? i : n.length - i - 1].toString() === "0"; i++)
    r++;
  return n = t === "left" ? n.slice(r) : n.slice(0, n.length - r), typeof e == "string" ? (n.length === 1 && t === "right" && (n = `${n}0`), `0x${n.length % 2 === 1 ? `0${n}` : n}`) : n;
}
function nt(e, { size: t }) {
  if (ue(e) > t)
    throw new Tw({
      givenSize: ue(e),
      maxSize: t
    });
}
function Yu(e, t = {}) {
  const { signed: n } = t;
  t.size && nt(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function ts(e, t = {}) {
  const n = Yu(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new es({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const Lw = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Zn(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? F(e, t) : typeof e == "string" ? Qu(e, t) : typeof e == "boolean" ? Ju(e, t) : ke(e, t);
}
function Ju(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (nt(n, { size: t.size }), bn(n, { size: t.size })) : n;
}
function ke(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += Lw[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (nt(r, { size: t.size }), bn(r, { dir: "right", size: t.size })) : r;
}
function F(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new es({
      max: o ? `${o}${c}` : void 0,
      min: `${s}${c}`,
      signed: n,
      size: r,
      value: `${e}${c}`
    });
  }
  const a = `0x${(n && i < 0 ? (1n << BigInt(r * 8)) + BigInt(i) : i).toString(16)}`;
  return r ? bn(a, { size: r }) : a;
}
const Rw = /* @__PURE__ */ new TextEncoder();
function Qu(e, t = {}) {
  const n = Rw.encode(e);
  return ke(n, t);
}
const Cw = /* @__PURE__ */ new TextEncoder();
function ns(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? Uw(e, t) : typeof e == "boolean" ? zw(e, t) : tr(e) ? $t(e, t) : el(e, t);
}
function zw(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (nt(n, { size: t.size }), bn(n, { size: t.size })) : n;
}
const at = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function ma(e) {
  if (e >= at.zero && e <= at.nine)
    return e - at.zero;
  if (e >= at.A && e <= at.F)
    return e - (at.A - 10);
  if (e >= at.a && e <= at.f)
    return e - (at.a - 10);
}
function $t(e, t = {}) {
  let n = e;
  t.size && (nt(n, { size: t.size }), n = bn(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = ma(r.charCodeAt(a++)), u = ma(r.charCodeAt(a++));
    if (c === void 0 || u === void 0)
      throw new K(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + u;
  }
  return o;
}
function Uw(e, t) {
  const n = F(e, t);
  return $t(n);
}
function el(e, t = {}) {
  const n = Cw.encode(e);
  return typeof t.size == "number" ? (nt(n, { size: t.size }), bn(n, { dir: "right", size: t.size })) : n;
}
const wr = /* @__PURE__ */ BigInt(2 ** 32 - 1), va = /* @__PURE__ */ BigInt(32);
function Hw(e, t = !1) {
  return t ? { h: Number(e & wr), l: Number(e >> va & wr) } : { h: Number(e >> va & wr) | 0, l: Number(e & wr) | 0 };
}
function Mw(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Hw(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Nw = (e, t, n) => e << n | t >>> 32 - n, Fw = (e, t, n) => t << n | e >>> 32 - n, Kw = (e, t, n) => t << n - 32 | e >>> 64 - n, Dw = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function jw(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function xa(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Xn(e, ...t) {
  if (!jw(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function Jr(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function tl(e, t) {
  Xn(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function Vw(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Yn(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Pi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function qe(e, t) {
  return e << 32 - t | e >>> t;
}
const qw = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Gw(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Ww(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Gw(e[t]);
  return e;
}
const Ea = qw ? (e) => e : Ww;
function Zw(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function rs(e) {
  return typeof e == "string" && (e = Zw(e)), Xn(e), e;
}
class nl {
}
function rl(e) {
  const t = (r) => e().update(rs(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const Xw = BigInt(0), _n = BigInt(1), Yw = BigInt(2), Jw = BigInt(7), Qw = BigInt(256), eb = BigInt(113), il = [], ol = [], sl = [];
for (let e = 0, t = _n, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], il.push(2 * (5 * r + n)), ol.push((e + 1) * (e + 2) / 2 % 64);
  let i = Xw;
  for (let o = 0; o < 7; o++)
    t = (t << _n ^ (t >> Jw) * eb) % Qw, t & Yw && (i ^= _n << (_n << /* @__PURE__ */ BigInt(o)) - _n);
  sl.push(i);
}
const al = Mw(sl, !0), tb = al[0], nb = al[1], Sa = (e, t, n) => n > 32 ? Kw(e, t, n) : Nw(e, t, n), ka = (e, t, n) => n > 32 ? Dw(e, t, n) : Fw(e, t, n);
function rb(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = Sa(u, l, 1) ^ n[a], h = ka(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = ol[s], c = Sa(i, o, a), u = ka(i, o, a), l = il[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= tb[r], e[1] ^= nb[r];
  }
  Yn(n);
}
class is extends nl {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, xa(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Vw(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Ea(this.state32), rb(this.state32, this.rounds), Ea(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Jr(this), t = rs(t), Xn(t);
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
    Jr(this, !1), Xn(t), this.finish();
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
    return xa(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (tl(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, Yn(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new is(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const ib = (e, t, n) => rl(() => new is(t, e, n)), ob = ib(1, 136, 256 / 8);
function Ye(e, t) {
  const n = t || "hex", r = ob(tr(e, { strict: !1 }) ? ns(e) : e);
  return n === "bytes" ? r : Zn(r);
}
const sb = (e) => Ye(ns(e));
function ab(e) {
  return sb(e);
}
function cb(e) {
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
    throw new K("Unable to normalize signature.");
  return i;
}
const ub = (e) => {
  const t = typeof e == "string" ? e : Tg(e);
  return cb(t);
};
function lb(e) {
  return ab(ub(e));
}
class Vt extends K {
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
class cl extends Map {
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
const Bi = /* @__PURE__ */ new cl(8192);
function ul(e, t) {
  if (Bi.has(`${e}.${t}`))
    return Bi.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = Ye(el(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return Bi.set(`${e}.${t}`, o), o;
}
const db = /^0x[a-fA-F0-9]{40}$/, $i = /* @__PURE__ */ new cl(8192);
function qt(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if ($i.has(r))
    return $i.get(r);
  const i = db.test(e) ? e.toLowerCase() === e ? !0 : n ? ul(e) === e : !0 : !1;
  return $i.set(r, i), i;
}
function fb(e) {
  return typeof e[0] == "string" ? Fe(e) : pb(e);
}
function pb(e) {
  let t = 0;
  for (const i of e)
    t += i.length;
  const n = new Uint8Array(t);
  let r = 0;
  for (const i of e)
    n.set(i, r), r += i.length;
  return n;
}
function Fe(e) {
  return `0x${e.reduce((t, n) => t + n.replace("0x", ""), "")}`;
}
function os(e, t, n, { strict: r } = {}) {
  return tr(e, { strict: !1 }) ? pl(e, t, n, {
    strict: r
  }) : fl(e, t, n, {
    strict: r
  });
}
function ll(e, t) {
  if (typeof t == "number" && t > 0 && t > ue(e) - 1)
    throw new Zu({
      offset: t,
      position: "start",
      size: ue(e)
    });
}
function dl(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && ue(e) !== n - t)
    throw new Zu({
      offset: n,
      position: "end",
      size: ue(e)
    });
}
function fl(e, t, n, { strict: r } = {}) {
  ll(e, t);
  const i = e.slice(t, n);
  return r && dl(i, t, n), i;
}
function pl(e, t, n, { strict: r } = {}) {
  ll(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && dl(i, t, n), i;
}
const hb = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, hl = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function ss(e, t) {
  if (e.length !== t.length)
    throw new Aw({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = yb({
    params: e,
    values: t
  });
  return cs(n);
}
function yb({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(as({ param: e[r], value: t[r] }));
  return n;
}
function as({ param: e, value: t }) {
  const n = li(e.type);
  if (n) {
    const [r, i] = n;
    return wb(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return Eb(t, {
      param: e
    });
  if (e.type === "address")
    return gb(t);
  if (e.type === "bool")
    return mb(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = hl.exec(e.type) ?? [];
    return vb(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return bb(t, { param: e });
  if (e.type === "string")
    return xb(t);
  throw new Iw(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function cs(e) {
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
  return Fe([...n, ...r]);
}
function gb(e) {
  if (!qt(e))
    throw new Vt({ address: e });
  return { dynamic: !1, encoded: It(e.toLowerCase()) };
}
function wb(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new Bw(e);
  if (!r && e.length !== t)
    throw new Sw({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && Ji(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = as({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = cs(o);
    if (r) {
      const a = F(o.length, { size: 32 });
      return {
        dynamic: !0,
        encoded: Fe([a, s])
      };
    }
    if (i)
      return { dynamic: !0, encoded: s };
  }
  return {
    dynamic: !1,
    encoded: Fe(o.map(({ encoded: s }) => s))
  };
}
function bb(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = ue(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = It(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: Fe([
        It(F(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new kw({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: It(e, { dir: "right" }) };
}
function mb(e) {
  if (typeof e != "boolean")
    throw new K(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: It(Ju(e)) };
}
function vb(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new es({
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
function xb(e) {
  const t = Qu(e), n = Math.ceil(ue(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(It(os(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: Fe([
      It(F(ue(t), { size: 32 })),
      ...r
    ])
  };
}
function Eb(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = as({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? cs(r) : Fe(r.map(({ encoded: i }) => i))
  };
}
function li(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function Ji(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(Ji);
  const n = li(t);
  return n ? Ji({ ...e, type: n[1] }) : !1;
}
const Sb = (e) => os(lb(e), 0, 4);
class Aa extends K {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class kb extends K {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class Ab extends K {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const _b = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new Ab({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new kb({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new Aa({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new Aa({ offset: e });
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
function us(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(_b);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function Ib(e, t = {}) {
  typeof t.size < "u" && nt(e, { size: t.size });
  const n = ke(e, t);
  return Yu(n, t);
}
function Pb(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (nt(n, { size: t.size }), n = Wn(n)), n.length > 1 || n[0] > 1)
    throw new Ow(n);
  return !!n[0];
}
function lt(e, t = {}) {
  typeof t.size < "u" && nt(e, { size: t.size });
  const n = ke(e, t);
  return ts(n, t);
}
function Bb(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (nt(n, { size: t.size }), n = Wn(n, { dir: "right" })), new TextDecoder().decode(n);
}
function $b(e, t) {
  const n = typeof t == "string" ? $t(t) : t, r = us(n);
  if (ue(n) === 0 && e.length > 0)
    throw new Ew();
  if (ue(t) && ue(t) < 32)
    throw new xw({
      data: typeof t == "string" ? t : ke(t),
      params: e,
      size: ue(t)
    });
  let i = 0;
  const o = [];
  for (let s = 0; s < e.length; ++s) {
    const a = e[s];
    i < n.length && r.setPosition(i);
    const [c, u] = on(r, a, {
      staticPosition: 0
    });
    i += u, o.push(c);
  }
  return o;
}
function on(e, t, { staticPosition: n }) {
  const r = li(t.type);
  if (r) {
    const [i, o] = r;
    return Tb(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return zb(e, t, { staticPosition: n });
  if (t.type === "address")
    return Ob(e);
  if (t.type === "bool")
    return Lb(e);
  if (t.type.startsWith("bytes"))
    return Rb(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return Cb(e, t);
  if (t.type === "string")
    return Ub(e, { staticPosition: n });
  throw new Pw(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const _a = 32, Qi = 32;
function Ob(e) {
  const t = e.readBytes(32);
  return [ul(ke(fl(t, -20))), 32];
}
function Tb(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = lt(e.readBytes(Qi)), a = r + s, c = a + _a;
    e.setPosition(a);
    const u = lt(e.readBytes(_a)), l = Jn(t);
    let d = 0;
    const h = [];
    for (let f = 0; f < u; ++f) {
      e.setPosition(c + (l ? f * 32 : d));
      const [w, g] = on(e, t, {
        staticPosition: c
      });
      d += g, h.push(w), g === 0 && (e.assertReadLimit(), e._touch());
    }
    return e.setPosition(r + 32), [h, 32];
  }
  if (Jn(t)) {
    const s = lt(e.readBytes(Qi)), a = r + s, c = [];
    for (let u = 0; u < n; ++u) {
      e.setPosition(a + u * 32);
      const [l] = on(e, t, {
        staticPosition: a
      });
      c.push(l);
    }
    return e.setPosition(r + 32), [c, 32];
  }
  let i = 0;
  const o = [];
  for (let s = 0; s < n; ++s) {
    const [a, c] = on(e, t, {
      staticPosition: r + i
    });
    i += c, o.push(a), c === 0 && (e.assertReadLimit(), e._touch());
  }
  return [o, i];
}
function Lb(e) {
  return [Pb(e.readBytes(32), { size: 32 }), 32];
}
function Rb(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = lt(e.readBytes(32));
    e.setPosition(n + s);
    const a = lt(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [ke(c), 32];
  }
  return [ke(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function Cb(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? Ib(i, { signed: n }) : lt(i, { signed: n }),
    32
  ];
}
function zb(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (Jn(t)) {
    const s = lt(e.readBytes(Qi)), a = n + s;
    for (let c = 0; c < t.components.length; ++c) {
      const u = t.components[c];
      e.setPosition(a + o);
      const [l, d] = on(e, u, {
        staticPosition: a
      });
      o += d, i[r ? c : u?.name] = l;
    }
    return e.setPosition(n + 32), [i, 32];
  }
  for (let s = 0; s < t.components.length; ++s) {
    const a = t.components[s], [c, u] = on(e, a, {
      staticPosition: n
    });
    i[r ? s : a?.name] = c, o += u;
  }
  return [i, o];
}
function Ub(e, { staticPosition: t }) {
  const n = lt(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = lt(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = Bb(Wn(o));
  return e.setPosition(t + 32), [s, 32];
}
function Jn(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components?.some(Jn);
  const n = li(e.type);
  return !!(n && Jn({ ...e, type: n[1] }));
}
const Hb = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), Mb = {
  ether: -9,
  wei: 9
};
function Nb(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function eo(e, t = "wei") {
  return Nb(e, Mb[t]);
}
function Fb(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class Kb extends K {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        Fb(t),
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
class Db extends K {
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
class jb extends K {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function pn(e, t = "hex") {
  const n = yl(e), r = us(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? ke(r.bytes) : r.bytes;
}
function yl(e) {
  return Array.isArray(e) ? Vb(e.map((t) => yl(t))) : qb(e);
}
function Vb(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = gl(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function qb(e) {
  const t = typeof e == "string" ? $t(e) : e, n = gl(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function gl(e) {
  if (e < 2 ** 8)
    return 1;
  if (e < 2 ** 16)
    return 2;
  if (e < 2 ** 24)
    return 3;
  if (e < 2 ** 32)
    return 4;
  throw new K("Length is too large.");
}
class di extends K {
  constructor({ cause: t, maxFeePerGas: n } = {}) {
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${eo(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
      cause: t,
      name: "FeeCapTooHighError"
    });
  }
}
Object.defineProperty(di, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
class wl extends K {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${eo(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${eo(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(wl, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const ls = 2n ** 256n - 1n;
function bl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => $t(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => ke(o));
}
function ml(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => $t(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => $t(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => ke(s));
}
function Gb(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, u = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + u, a, r);
}
function Wb(e, t, n) {
  return e & t ^ ~e & n;
}
function Zb(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class Xb extends nl {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Pi(this.buffer);
  }
  update(t) {
    Jr(this), t = rs(t), Xn(t);
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
    Jr(this), tl(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Yn(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    Gb(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = Pi(t), c = this.outputLen;
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
const St = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Yb = /* @__PURE__ */ Uint32Array.from([
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
]), kt = /* @__PURE__ */ new Uint32Array(64);
class Jb extends Xb {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = St[0] | 0, this.B = St[1] | 0, this.C = St[2] | 0, this.D = St[3] | 0, this.E = St[4] | 0, this.F = St[5] | 0, this.G = St[6] | 0, this.H = St[7] | 0;
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
      kt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = kt[d - 15], f = kt[d - 2], w = qe(h, 7) ^ qe(h, 18) ^ h >>> 3, g = qe(f, 17) ^ qe(f, 19) ^ f >>> 10;
      kt[d] = g + kt[d - 7] + w + kt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = qe(a, 6) ^ qe(a, 11) ^ qe(a, 25), f = l + h + Wb(a, c, u) + Yb[d] + kt[d] | 0, g = (qe(r, 2) ^ qe(r, 13) ^ qe(r, 22)) + Zb(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Yn(kt);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Yn(this.buffer);
  }
}
const Qb = /* @__PURE__ */ rl(() => new Jb()), em = Qb;
function tm(e, t) {
  return em(tr(e, { strict: !1 }) ? ns(e) : e);
}
function nm(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = tm(t);
  return i.set([n], 0), r === "bytes" ? i : ke(i);
}
function rm(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(nm({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const Ia = 6, vl = 32, ds = 4096, xl = vl * ds, Pa = xl * Ia - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * ds * Ia, El = 1;
class im extends K {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class Sl extends K {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class om extends K {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class sm extends K {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${El}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function am(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? $t(e.data) : e.data, r = ue(n);
  if (!r)
    throw new Sl();
  if (r > Pa)
    throw new im({
      maxSize: Pa,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = us(new Uint8Array(xl));
    let c = 0;
    for (; c < ds; ) {
      const u = n.slice(s, s + (vl - 1));
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
function cm(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? am({ data: t, to: r }), o = e.commitments ?? bl({ blobs: i, kzg: n, to: r }), s = e.proofs ?? ml({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function um(e) {
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
  throw new Kb({ transaction: e });
}
class fi extends K {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function lm(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!qt(i))
        throw new Vt({ address: i });
      if (r < 0)
        throw new fi({ chainId: r });
    }
  fs(e);
}
function dm(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new Sl();
    for (const n of t) {
      const r = ue(n), i = ts(os(n, 0, 1));
      if (r !== 32)
        throw new om({ hash: n, size: r });
      if (i !== El)
        throw new sm({
          hash: n,
          version: i
        });
    }
  }
  fs(e);
}
function fs(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new fi({ chainId: t });
  if (i && !qt(i))
    throw new Vt({ address: i });
  if (r && r > ls)
    throw new di({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new wl({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function fm(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new fi({ chainId: t });
  if (o && !qt(o))
    throw new Vt({ address: o });
  if (n || i)
    throw new K("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > ls)
    throw new di({ maxFeePerGas: r });
}
function pm(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !qt(o))
    throw new Vt({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new fi({ chainId: t });
  if (n || i)
    throw new K("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > ls)
    throw new di({ maxFeePerGas: r });
}
function pi(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const { address: r, storageKeys: i } = e[n];
    for (let o = 0; o < i.length; o++)
      if (i[o].length - 2 !== 64)
        throw new jb({ storageKey: i[o] });
    if (!qt(r, { strict: !1 }))
      throw new Vt({ address: r });
    t.push([r, i]);
  }
  return t;
}
function hm(e, t) {
  const n = um(e);
  return n === "eip1559" ? wm(e, t) : n === "eip2930" ? bm(e, t) : n === "eip4844" ? gm(e, t) : n === "eip7702" ? ym(e, t) : mm(e);
}
function ym(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  lm(e);
  const h = pi(l), f = vm(n);
  return Fe([
    "0x04",
    pn([
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
      ...nr(e, t)
    ])
  ]);
}
function gm(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  dm(e);
  let h = e.blobVersionedHashes, f = e.sidecars;
  if (e.blobs && (typeof h > "u" || typeof f > "u")) {
    const _ = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((O) => ke(O)), I = e.kzg, S = bl({
      blobs: _,
      kzg: I
    });
    if (typeof h > "u" && (h = rm({
      commitments: S
    })), typeof f > "u") {
      const O = ml({ blobs: _, commitments: S, kzg: I });
      f = cm({ blobs: _, commitments: S, proofs: O });
    }
  }
  const w = pi(l), g = [
    F(n),
    i ? F(i) : "0x",
    u ? F(u) : "0x",
    c ? F(c) : "0x",
    r ? F(r) : "0x",
    o ?? "0x",
    s ? F(s) : "0x",
    d ?? "0x",
    w,
    a ? F(a) : "0x",
    h ?? [],
    ...nr(e, t)
  ], p = [], y = [], v = [];
  if (f)
    for (let _ = 0; _ < f.length; _++) {
      const { blob: I, commitment: S, proof: O } = f[_];
      p.push(I), y.push(S), v.push(O);
    }
  return Fe([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    pn(f ? [g, p, y, v] : g)
  ]);
}
function wm(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: u, data: l } = e;
  fs(e);
  const d = pi(u), h = [
    F(n),
    i ? F(i) : "0x",
    c ? F(c) : "0x",
    a ? F(a) : "0x",
    r ? F(r) : "0x",
    o ?? "0x",
    s ? F(s) : "0x",
    l ?? "0x",
    d,
    ...nr(e, t)
  ];
  return Fe([
    "0x02",
    pn(h)
  ]);
}
function bm(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: u } = e;
  fm(e);
  const l = pi(c), d = [
    F(n),
    o ? F(o) : "0x",
    u ? F(u) : "0x",
    r ? F(r) : "0x",
    s ?? "0x",
    a ? F(a) : "0x",
    i ?? "0x",
    l,
    ...nr(e, t)
  ];
  return Fe([
    "0x01",
    pn(d)
  ]);
}
function mm(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  pm(e);
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
  ]), pn(u);
}
function nr(e, t) {
  const n = t ?? e, { v: r, yParity: i } = n;
  if (typeof n.r > "u")
    return [];
  if (typeof n.s > "u")
    return [];
  if (typeof r > "u" && typeof i > "u")
    return [];
  const o = Wn(n.r), s = Wn(n.s);
  return [typeof i == "number" ? i ? F(1) : "0x" : r === 0n ? "0x" : r === 1n ? F(1) : r === 27n ? "0x" : F(1), o === "0x00" ? "0x" : o, s === "0x00" ? "0x" : s];
}
function vm(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Zn(r) : "0x",
      s,
      i ? Zn(i) : "0x",
      ...nr({}, o)
    ]);
  }
  return t;
}
class xm extends K {
  constructor({ domain: t }) {
    super(`Invalid domain "${Hb(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class Em extends K {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class Sm extends K {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function km(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: u, type: l } = c, d = a[u], h = l.match(hl);
      if (h && (typeof d == "number" || typeof d == "bigint")) {
        const [g, p, y] = h;
        F(d, {
          signed: p === "int",
          size: Number.parseInt(y, 10) / 8
        });
      }
      if (l === "address" && typeof d == "string" && !qt(d))
        throw new Vt({ address: d });
      const f = l.match(hb);
      if (f) {
        const [g, p] = f;
        if (p && ue(d) !== Number.parseInt(p, 10))
          throw new _w({
            expectedSize: Number.parseInt(p, 10),
            givenSize: ue(d)
          });
      }
      const w = i[l];
      w && (_m(l), o(w, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new xm({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new Em({ primaryType: r, types: i });
}
function Am({ domain: e }) {
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
function _m(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new Sm({ type: e });
}
function Im(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: Am({ domain: t }),
    ...e.types
  };
  km({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(Pm({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(kl({
    data: n,
    primaryType: r,
    types: i
  })), Ye(fb(o));
}
function Pm({ domain: e, types: t }) {
  return kl({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function kl({ data: e, primaryType: t, types: n }) {
  const r = Al({
    data: e,
    primaryType: t,
    types: n
  });
  return Ye(r);
}
function Al({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [Bm({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = Il({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return ss(r, i);
}
function Bm({ primaryType: e, types: t }) {
  const n = Zn($m({ primaryType: e, types: t }));
  return Ye(n);
}
function $m({ primaryType: e, types: t }) {
  let n = "";
  const r = _l({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function _l({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    _l({ primaryType: o.type, types: t }, n);
  return n;
}
function Il({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      Ye(Al({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, Ye(r)];
  if (n === "string")
    return [{ type: "bytes32" }, Ye(Zn(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => Il({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      Ye(ss(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
function Om(e) {
  const t = pl(e, 0, 1);
  if (t === "0x04")
    return "eip7702";
  if (t === "0x03")
    return "eip4844";
  if (t === "0x02")
    return "eip1559";
  if (t === "0x01")
    return "eip2930";
  if (t !== "0x" && ts(t) >= 192)
    return "legacy";
  throw new Db({ serializedType: t });
}
const Ba = "bitcoin-taproot-keypath-v1", $a = "bip341-sighash-default-keypath", Tm = ["bitcoin", "testnet", "signet", "regtest"], to = 21000000n * 100000000n, Pl = 137, Bl = /^[0-9a-f]+$/, Lm = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", Rm = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", Cm = 734539939, zm = 1;
function V(e) {
  throw new m("invalid_payload", e);
}
function Oa(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && V(`${t} must be an object`), e;
}
function Ta(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && V(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && V(`${n} is missing required fields: ${i.join(", ")}`);
}
function _r(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !Bl.test(e)) && V(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function Um(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && V(`${t} must be an integer in ${n}..${r}`), e;
}
function ze(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function Jt(e, t, n, r) {
  return t + n > e.length && V(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function br(e, t, n) {
  t >= e.length && V(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && V(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function Oi(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function Hm(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function In(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function La(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function $l(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  V("transaction output uses an unsupported script template");
}
function Mm(e) {
  (e.length === 0 || e.length % 2 || e.length > Pl * 2 || !Bl.test(e)) && V("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (L) => Number.parseInt(L, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && V("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = br(t, n, "input count");
  n = i, r !== 1 && V("transaction must contain exactly one input");
  const [o, s] = Jt(t, n, 32, "outpoint hash");
  n = s, o.every((L) => L === 0) && V("outpoint hash must not be null");
  const [a, c] = Jt(t, n, 4, "outpoint index");
  n = c;
  const u = Oi(a), [l, d] = br(t, n, "scriptSig length");
  n = d, l !== 0 && V("scriptSig must be empty");
  const [h, f] = Jt(t, n, 4, "sequence");
  n = f;
  const w = Oi(h);
  w !== 4294967293 && w !== 4294967294 && w !== 4294967295 && V("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [g, p] = br(t, n, "output count");
  n = p, g !== 1 && g !== 2 && V("transaction must contain one or two outputs");
  const y = [], v = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let L = 0; L < g; L += 1) {
    const [R, U] = Jt(t, n, 8, `output ${L} amount`);
    n = U;
    const j = Hm(R);
    (j < 1n || j > to) && V(`output ${L} amount is outside the Bitcoin money range`);
    const [z, b] = br(t, n, `output ${L} script length`);
    n = b;
    const [k, A] = Jt(t, n, z, `output ${L} script`);
    n = A;
    const x = $l(k);
    z !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[x] && V(`output ${L} script length is not canonical for ${x}`), j < v[x] && V(`output ${L} is below the V1 ${x} dust floor`), y.push({ amountSats: j, scriptPubKey: k, kind: x });
  }
  const [_, I] = Jt(t, n, 4, "locktime");
  n = I;
  const S = Oi(_);
  S !== 0 && V("locktime must be exactly zero"), n !== t.length && V("transaction has trailing bytes");
  const O = y.reduce((L, R) => L + R.amountSats, 0n);
  return (O < 1n || O > to) && V("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: u, sequence: w, outputs: y, locktime: S };
}
function Nm(e, t) {
  const n = ce(new TextEncoder().encode(e));
  return ce(ze(n, n, t));
}
function Fm(e, t, n) {
  const r = ze(e.prevoutHashLe, In(e.prevoutIndex)), i = ze(new Uint8Array([n.length]), n), o = e.outputs.map((a) => ze(La(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = ze(
    new Uint8Array([0, 0]),
    In(2),
    In(e.locktime),
    ce(r),
    ce(La(t)),
    ce(i),
    ce(In(e.sequence)),
    ce(ze(...o)),
    new Uint8Array([0]),
    In(0)
  );
  return Nm("TapSighash", s);
}
function Km(e) {
  return BigInt(`0x${X(e)}`);
}
function Ra(e) {
  return Nc(ce(e));
}
function Ca(e, t) {
  const n = ze(new Uint8Array([e]), t), r = ce(ce(n)).slice(0, 4), i = ze(n, r);
  let o = Km(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = Lm[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function Dm(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function jm(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1) i >>> o & 1 && (n ^= t[o]);
  }
  return n >>> 0;
}
function Ti(e, t, n) {
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...Dm(n, 8, 5)], o = [...r].map((u) => u.charCodeAt(0) >> 5).concat([0], [...r].map((u) => u.charCodeAt(0) & 31)), s = t === 0 ? zm : Cm, a = jm(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (u, l) => a >>> 5 * (5 - l) & 31);
  return `${r}1${i.concat(c).map((u) => Rm[u]).join("")}`;
}
function Vm(e, t) {
  const n = $l(t), r = e === "bitcoin";
  return n === "p2pkh" ? Ca(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? Ca(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? Ti(e, 0, t.slice(2)) : Ti(e, 1, t.slice(2));
}
function qm(e) {
  const t = Ra(e), n = ze(new Uint8Array([0, 20]), t);
  return [
    ze(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    ze(new Uint8Array([169, 20]), Ra(n), new Uint8Array([135]))
  ];
}
function Li(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function mr(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function Gm(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function Wm(e) {
  return X(ce(ce(e.raw)).slice().reverse());
}
function Zm(e, t) {
  const n = t.transaction, r = N("bitcoin.network", { network: e.network }), i = [
    N("bitcoin.title"),
    ...t.highFeeWarning ? [N("bitcoin.highFeeWarning"), ""] : [],
    r,
    N("bitcoin.networkWarning"),
    N("bitcoin.input", { txid: X(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    N("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: mr(BigInt(e.prevout.amountSats)) }),
    N("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(N("bitcoin.output", {
      index: s + 1,
      address: Vm(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: mr(o.amountSats),
      role: N(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    N("bitcoin.fee", { sats: t.feeSats.toString(), btc: mr(t.feeSats), rate: Gm(t.feeSats, t.signedVsize) }),
    N("bitcoin.vsize", { vsize: t.signedVsize }),
    N(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    N("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: mr(t.netLeavingSats) }),
    N("bitcoin.unsignedTxid", { txid: Wm(n) }),
    N("bitcoin.outputKey", { key: X(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function Xm(e, t) {
  const n = Oa(e, "signingContext");
  Ta(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== Ba && V("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !Tm.includes(n.network)) && V("bitcoin signing_context network is invalid");
  const r = _r(n.unsignedTransaction, "unsignedTransaction");
  r.length > Pl * 2 && V("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = Oa(n.prevout, "signingContext.prevout");
  Ta(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = Um(i.amountSats, "prevout.amountSats", 1, Number(to)), s = _r(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || V("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== $a && V("unsupported Bitcoin digest algorithm");
  const a = _r(n.digest, "signingContext.digest", 64);
  return a !== t && V("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: Ba,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: $a,
    digest: a
  };
}
function Ol(e, t, n) {
  const r = Xm(e, t), i = Mm(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (g) => Number.parseInt(g, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const g = _r(n, "signing public key", 66);
    a = Uint8Array.from(g.match(/../g), (y) => Number.parseInt(y, 16)), a[0] !== 2 && a[0] !== 3 && V("signing public key must be compressed secp256k1");
    const p = yy(g);
    Li(s, p) || V("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const g of i.outputs)
      qm(a).some((p) => Li(p, g.scriptPubKey)) && V("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((g, p) => Li(g.scriptPubKey, o) ? [p] : []);
  c.length > 1 && V("transaction may contain at most one same-key P2TR return output");
  const u = i.outputs.reduce((g, p) => g + p.amountSats, 0n), l = BigInt(r.prevout.amountSats) - u;
  l <= 0n && V("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, h = Math.ceil(d / 4);
  l > 10000n * BigInt(h) && V("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const f = X(Fm(i, BigInt(r.prevout.amountSats), o));
  f !== r.digest && V("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const w = c.reduce((g, p) => g + i.outputs[p].amountSats, 0n);
  return {
    digest: f,
    display: Zm(r, {
      transaction: i,
      outputKeyXOnly: s,
      feeSats: l,
      signedVsize: h,
      sameKeyOutputIndexes: c,
      highFeeWarning: l > 100n * BigInt(h) || l * 100n > BigInt(r.prevout.amountSats) * 2n,
      netLeavingSats: BigInt(r.prevout.amountSats) - w
    }),
    transaction: i,
    outputKeyXOnly: s
  };
}
const za = `avault-agent-operation:v1
`;
function Qt(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function Ua(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function Ri(e, t) {
  const n = Ua(e), r = Ua(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function Ir(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : sn(e);
}
function sn(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(sn).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${sn(t[n])}`).join(",")}}`;
}
const Ym = mw([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]), Jm = {
  approve: "ERC-20/ERC-721 approve",
  transfer: "ERC-20 transfer",
  transferFrom: "ERC-20/ERC-721 transferFrom",
  permit: "ERC-20 permit",
  setApprovalForAll: "ERC-721 setApprovalForAll",
  safeTransferFrom: "ERC-721 safeTransferFrom",
  safeTransferFromWithData: "ERC-721 safeTransferFrom"
}, Qm = new Map(
  Ym.map((e) => {
    const t = e.name === "safeTransferFrom" && e.inputs.length === 4 ? "safeTransferFromWithData" : e.name;
    return [Sb(e), { call: t, item: e }];
  })
);
function e0(e) {
  return `${e.name}(${e.inputs.map((t) => t.type).join(",")})`;
}
function t0(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e.toLowerCase();
}
const n0 = /* @__PURE__ */ new Set([
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
]), r0 = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function Ci(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function Tl(e) {
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
function i0(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function o0(e) {
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
function s0(e) {
  if (e.length < 10) return null;
  const t = Qm.get(e.slice(0, 10));
  if (!t) return null;
  let n;
  try {
    if (n = $b(t.item.inputs, `0x${e.slice(10)}`), ss(t.item.inputs, n).toLowerCase() !== `0x${e.slice(10)}`) return null;
  } catch {
    return null;
  }
  return {
    call: t.call,
    signature: e0(t.item),
    arguments: t.item.inputs.map((r, i) => ({
      name: r.name ?? `arg${i}`,
      type: r.type,
      value: Ir(n[i])
    }))
  };
}
function a0(e, t, n) {
  const r = Tl(e), i = t0(e.data), o = (c) => (t[c] === void 0 ? 0n : t[c]).toString(), s = e.to === void 0 || e.to === null || e.to === "" ? null : String(e.to), a = s === null ? null : s0(i);
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
function c0(e) {
  const t = [N("evm.title", { chainId: e.chainId })];
  if (e.blindSigning && t.push(N("sign.blindNotice")), t.push(
    N("evm.type", { type: e.type }),
    e.to === null ? N("evm.contractCreation") : N("evm.to", { to: e.to }),
    N("evm.value", { value: e.value }),
    N("evm.nonce", { value: e.nonce }),
    N("evm.gas", { value: e.gas })
  ), e.gasPrice !== void 0 && t.push(N("evm.gasPrice", { value: e.gasPrice })), e.maxFeePerGas !== void 0 && t.push(N("evm.maxFeePerGas", { value: e.maxFeePerGas })), e.maxPriorityFeePerGas !== void 0 && t.push(N("evm.maxPriorityFeePerGas", { value: e.maxPriorityFeePerGas })), e.decoded) {
    t.push(N("evm.call", { call: `${Jm[e.decoded.call]} ${e.decoded.signature}` }));
    for (const n of e.decoded.arguments) t.push(`  ${n.name} (${n.type}): ${n.value}`);
  }
  return t.push(
    e.selector === null ? N("evm.selectorNone") : N("evm.selector", { selector: e.selector }),
    e.calldata === "0x" ? N("evm.calldataNone") : N("evm.calldata", { bytes: e.calldataBytes, calldata: e.calldata })
  ), t.join(`
`);
}
function u0(e) {
  Go(e);
  const t = Qt(e), n = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"]
  }, r = Object.hasOwn(n, e.kind) ? n[e.kind] : void 0;
  if (!r) throw new Error("unsupported signing context");
  if (Ci(t, new Set(r), "signing context"), typeof e.digest != "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(e.digest))
    throw new Error("signing context digest must be 32 bytes");
  switch (e.kind) {
    case "evm-transaction": {
      if (e.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm");
      const i = Qt(e.unsignedTransaction);
      Ci(i, n0, "EVM transaction"), i0(e, i), Tl(i);
      const o = o0(i), s = hm(o), a = Ri(e.digest, Ye(s)), c = a0(i, o, s);
      if (Om(s) !== c.type) throw new Error("EVM transaction type does not match its serialization");
      return {
        digest: a,
        challenge: Ue(a),
        display: c0(c),
        evm: c
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = Qt(e.typedData);
      Ci(i, r0, "EIP-712 typed data");
      const o = Qt(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = Ri(e.digest, Im(i));
      return {
        digest: s,
        challenge: Ue(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${Ir(o.chainId)}`,
          `domain.verifyingContract: ${Ir(o.verifyingContract)}`,
          `domain: ${sn(o)}`,
          `types: ${sn(Qt(i.types))}`,
          `primaryType: ${Ir(i.primaryType)}`,
          `message: ${sn(Qt(i.message))}`
        ].join(`
`)
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith(za) || e.canonicalPreimage.slice(za.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = Ri(e.digest, _h(ce(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: Ue(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = Ol(e, e.digest);
      return {
        digest: i.digest,
        challenge: Ue(i.digest),
        display: i.display
      };
    }
    default:
      throw new Error("unsupported signing context");
  }
}
function Pr(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return;
  const t = e.messageHex;
  if (typeof t == "string")
    try {
      gh(t);
    } catch {
      throw new m("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit");
    }
}
function ps(e) {
  if (Pr(e), Go(e), !e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", "Solana signing context must be an object");
  const t = e;
  if (t.kind !== "solana-transaction-v1" || Object.keys(t).some((n) => n !== "kind" && n !== "messageHex") || typeof t.messageHex != "string" || t.messageHex.length === 0 || t.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(t.messageHex))
    throw new m("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias");
  return { kind: "solana-transaction-v1", messageHex: t.messageHex };
}
function Ll(e, t, n) {
  if (n.kind !== "keypair" || !n.publicKey) throw new Error("protected signing requires a keypair protected record");
  const r = gn(n.curve);
  if (e === Kn || t.kind === "solana-transaction-v1" || r === "ed25519") {
    if (e !== Kn || t.kind !== "solana-transaction-v1" || r !== "ed25519")
      throw new m("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together");
    ps(t);
  }
}
function Rl(e, t) {
  if (e === Kn || t.kind === "solana-transaction-v1")
    throw new m("unsupported_signing_context", "protected Solana signing is not enabled in this sandbox release");
}
function en(e, t) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function vr(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Ln(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new m("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function hs(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) hs(t);
    Object.freeze(e);
  }
  return e;
}
function ys(e, t) {
  if (Pr(e), t && typeof t == "object") {
    const n = t.release;
    Pr(n), n && typeof n == "object" && Pr(n.signingContext);
  }
}
function l0(e) {
  const t = en(e, "sign request");
  ys(t.signingContext, t.context), Go(t);
  const n = en(structuredClone(t), "sign request");
  Ln(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = en(n.material, "material");
  Ln(r, ["name", "envelope"], "material");
  const i = en(r.envelope, "envelope");
  Ln(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = Zo(n.context);
  Ln(en(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = So(n.scheme);
  } catch {
    throw new m("invalid_payload", "unsupported signing scheme");
  }
  const a = en(n.signingContext, "signingContext");
  return a.kind === "solana-transaction-v1" && ps(a), hs({
    material: {
      name: vr(r.name, "material.name"),
      envelope: {
        ciphertext: vr(i.ciphertext, "envelope.ciphertext"),
        nonce: vr(i.nonce, "envelope.nonce"),
        wrap_meta: vr(i.wrap_meta, "envelope.wrap_meta")
      }
    },
    scheme: s,
    signingContext: a,
    context: o
  });
}
function Pn() {
  throw new m("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request");
}
function Cl(e, t, n) {
  ys(e.signingContext, e.context), Wi({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && Pn();
  const i = t.kind === "message";
  if (!i && (t.kind !== "digest" || !/^[0-9a-f]{64}$/.test(t.digest)) && Pn(), Ln(r, ["name", "scheme", i ? "messageHex" : "digest", "publicKey", "signingContext"], "sign context.release"), i) {
    const o = ps(e.signingContext);
    (t.messageHex !== o.messageHex || r.messageHex !== t.messageHex || e.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(n) || r.publicKey !== n) && Pn();
  } else (e.scheme === "ed25519" || e.signingContext.kind === "solana-transaction-v1" || r.digest !== t.digest) && Pn();
  (r.name !== e.material.name || r.scheme !== e.scheme || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || Bt(r.signingContext) !== Bt(e.signingContext)) && Pn();
}
function d0(e) {
  return ys(e.signingContext, e.context), ce(new TextEncoder().encode(ci(e.context)));
}
function f0(e, t) {
  if (So(e), e === "ed25519") throw new Error("Ed25519 approval is not enabled in this sandbox release");
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === Eo ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === Dn ? N("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === oi ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function p0(e) {
  const t = l0(e), n = ln(t.material.envelope), r = Io(t.material.name, n.recordMetadata);
  Ll(t.scheme, t.signingContext, r), Rl(t.scheme, t.signingContext);
  let i = u0(t.signingContext);
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    if (t.scheme !== Dn)
      throw new m("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (t.scheme === Dn)
      throw new m("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (t.signingContext.kind !== "avault-agent-operation" && t.scheme !== oi && t.scheme !== xo)
      throw new m("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const a = Ol(t.signingContext, i.digest, r.publicKey);
    i = { digest: a.digest, challenge: i.challenge, display: a.display };
  }
  Cl(t, { kind: "digest", digest: i.digest }, r.publicKey);
  const o = `${f0(t.scheme, r.publicKey)}
scheme: ${t.scheme}
${i.display}`, s = d0(t);
  return hs({ request: t, verified: { digest: i.digest, display: o }, unpacked: n, recordContext: r, challenge: [...s] });
}
async function zl(e, t, n) {
  Rl(e.request.scheme, e.request.signingContext), Ll(e.request.scheme, e.request.signingContext, e.recordContext);
  const r = await Bo(n, t);
  Xr({ context: e.request.context, rootMetadata: r, expectedPurpose: "sign" }), Cl(e.request, { kind: "digest", digest: e.verified.digest }, e.recordContext.publicKey), Yr([e.request.context]);
}
async function h0(e, t, n) {
  return await zl(e, t, n), ty(e.unpacked.sealed, t, e.recordContext, e.verified.digest, e.request.scheme);
}
function Ul(e) {
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
async function y0(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await Yc(t, e.vmk, n);
    return { envelope: eu(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function g0(e) {
  const t = gn(e.curve), n = Qh(t);
  let r = n.privateKey;
  try {
    const i = {
      name: e.name,
      kind: "keypair",
      publicKey: n.publicKey,
      ...t === "ed25519" ? { curve: t } : {}
    }, o = await Yc(r, e.vmk, i);
    return {
      envelope: eu(o, e.wrapMeta, i),
      publicKey: n.publicKey,
      addresses: t === "ed25519" ? { solana: ny(n.publicKey) } : gy(n.publicKey)
    };
  } finally {
    r?.fill(0), r = void 0;
  }
}
function Hl(e) {
  return (e?.kind ?? "static") === "static";
}
function w0(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: Zo(n.context)
  };
}
function Ml(e) {
  const t = e[0]?.context.display;
  if (!t) throw new m("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = wa(e[0].context), r = Ha(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if (wa(s.context) !== n)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (Ha(s.context) !== r)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed recipient");
  }
  const i = new Set(t.secrets.map((s) => `${s.name}:${s.kind}`));
  for (const s of e) {
    const { recordMetadata: a } = ln(s.material.envelope), c = a?.kind ?? "static";
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
function Ha(e) {
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  return Bt({ agent: e.agent, grantId: e.grantId });
}
async function b0(e) {
  if (e.items.length === 0) throw new m("invalid_payload", "approveRelease requires at least one item");
  const t = Ml(e.items), n = await Bo(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    Xr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  Yr(r, e.now);
  const i = await $g(r);
  await e.confirm({
    ...t,
    challenge: i
  });
  const o = e.now ?? Date.now();
  for (const a of e.items)
    Xr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: o
    });
  e.onApprovalAccepted?.(o), Yr(r, o);
  const s = [];
  for (const a of e.items) {
    const { sealed: c, recordMetadata: u } = ln(a.material.envelope);
    if (!Hl(u)) throw new m("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await Jh(
        c,
        e.vmk,
        Bg(a.context),
        Io(a.material.name, u),
        await Pg(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await ui(r, o), { blindBoxes: s };
}
const Nl = `avibe-vault-setup:v1:${ie.buildHash}:`, m0 = `avibe-vault-setup-result:${ie.buildHash}:`, v0 = `avibe-vault-setup-error:${ie.buildHash}:`, x0 = 300 * 1e3, E0 = 300 * 1e3, S0 = 30 * 1e3, k0 = 8 * 1e3, Ae = new sd();
let Ma = !1;
function A0(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function Fl(e) {
  if (!A0(e))
    throw new m("invalid_payload", "appearance must include locale and theme");
  return e;
}
function _0(e) {
  return e == null ? null : Fl(e);
}
function hi(e) {
  const t = Zy(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && Jy();
}
function Kl() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: Xy(), theme: e };
}
function Ee(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function Dl(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function ve(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function jl(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function I0(e) {
  const t = jl(e, "envelope");
  return {
    ciphertext: ve(t.ciphertext, "envelope.ciphertext"),
    nonce: ve(t.nonce, "envelope.nonce"),
    wrap_meta: ve(t.wrap_meta, "envelope.wrap_meta")
  };
}
function Vl(e) {
  const t = jl(e, "material");
  return { name: ve(t.name, "material.name"), envelope: I0(t.envelope) };
}
function P0(e) {
  const t = e == null ? {} : Ee(e);
  return { wrapMeta: Dl(t.wrapMeta, "wrapMeta") };
}
function ql(e) {
  const t = Ee(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new m("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: ve(t.vaultUserHandle, "vaultUserHandle"),
    displayName: ve(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: Ro(t.policy) } : {}
  };
}
function B0(e) {
  const t = Ee(e);
  return {
    wrapMeta: ve(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: Ro(t.policy) } : {}
  };
}
function $0(e) {
  const t = Ee(e);
  return { material: Vl(t.material), context: Zo(t.context) };
}
function O0(e) {
  const t = Ee(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new m("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => w0(n, Vl)) };
}
function T0(e) {
  const t = Ee(e);
  if (t.operation !== "delete_secret") throw new m("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: ve(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: ve(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function Gl() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function Na(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function L0(e) {
  return new Promise((t, n) => {
    const r = () => {
      n(mn(e));
    };
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function R0(e) {
  for (const t of e)
    if (t.aborted) return mn(t);
  return new Error("operation-superseded");
}
function Wl(e) {
  const t = new AbortController(), n = [], r = (i) => {
    t.signal.aborted || t.abort(mn(i));
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
async function Zl(e) {
  const t = Wl(e.abortSignals);
  try {
    await Promise.race([
      Dy(Ao(e.wrapMeta), pt(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? R0(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => L0(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function gs(e) {
  await er(async (t) => {
    const n = async (i) => {
      const o = Wl([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await K0(
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
          await Iu({
            wrapMeta: e.wrapMeta,
            currentRpId: pt(),
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
    await qo(
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
function C0(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: J(t) } : {}
  };
}
function Mt(e, t) {
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
function z0(e) {
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
    const a = Mt(o.label, `details.rows[${r}].label`);
    if (s === "chips") {
      if (!Array.isArray(o.values)) throw new m("invalid_payload", `details.rows[${r}].values must be an array`);
      const c = o.tone;
      if (c !== void 0 && c !== "default" && c !== "warning")
        throw new m("invalid_payload", `details.rows[${r}].tone is invalid`);
      const u = c === "default" || c === "warning" ? c : void 0;
      n.push({
        label: a,
        values: o.values.map((l, d) => Mt(l, `details.rows[${r}].values[${d}]`)),
        variant: "chips",
        ...u !== void 0 ? { tone: u } : {}
      });
      continue;
    }
    n.push({
      label: a,
      value: Mt(o.value, `details.rows[${r}].value`),
      ...s !== void 0 ? { variant: s } : {}
    });
  }
  return {
    rows: n
  };
}
function U0(e) {
  const t = Ee(e);
  if (!t) throw new m("invalid_payload", "authorization prompt must be an object");
  const n = t.challenge === void 0 ? void 0 : fe(ve(t.challenge, "prompt.challenge"));
  return {
    title: Mt(t.title, "prompt.title"),
    subtitle: Mt(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Mt(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: z0(t.details) } : {},
    ...n ? { challenge: n } : {},
    label: Mt(t.label, "prompt.label")
  };
}
function H0(e) {
  return {
    ...e,
    prompt: C0(e.prompt)
  };
}
function M0(e) {
  const t = Ee(e);
  if (!t) throw new m("invalid_payload", "authorization request must be an object");
  const n = t.passkey;
  if (n !== "none" && n !== "unlock" && n !== "uv")
    throw new m("invalid_payload", "authorization passkey requirement is invalid");
  return {
    prompt: U0(t.prompt),
    wrapMeta: ve(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function N0(e) {
  return ja("authorize", e, Kl());
}
function F0(e) {
  const t = Ee(e);
  if (!t) throw new m("authorization_result_invalid", "authorization result is invalid");
  if (t.kind === "confirmed") return { kind: "confirmed" };
  if (t.kind === "unlock")
    return {
      kind: "unlock",
      prfOutput: ve(t.prfOutput, "result.prfOutput"),
      prfSalt: ve(t.prfSalt, "result.prfSalt")
    };
  throw new m("authorization_result_invalid", "authorization result kind is invalid");
}
function K0(e, t, n) {
  Nt(t);
  const r = n ?? Gl(), i = `avibe-vault-authorization-${r}`;
  return new Promise((o, s) => {
    let a = null, c = !1, u = null, l = null, d = null, h = null;
    const f = () => v(() => s(mn(t))), w = () => v(() => s(new m("authorization_cancelled", "requesting sandbox was unloaded", !0))), g = () => new m("authorization_window_closed", "authorization window was closed", !0), p = (_) => {
      a = _, l = setInterval(() => {
        !_.closed || d || (d = setTimeout(() => v(() => s(g())), 2500));
      }, 500);
    }, y = (_) => {
      if (_.origin !== window.location.origin) return;
      const I = _.data;
      if (!(!I || I.id !== r || !tn(I.build)) && (!a && n && I.type === "authorization-ready" && _.source && (h && clearTimeout(h), h = null, p(_.source)), _.source === a))
        if (I.type === "authorization-ready")
          try {
            a?.postMessage(
              {
                type: "authorization-request",
                build: ie,
                id: r,
                request: H0(e)
              },
              window.location.origin
            );
          } catch (S) {
            v(() => s(S));
          }
        else if (I.type === "authorization-approved")
          try {
            const S = F0(I.result);
            v(() => o(S));
          } catch (S) {
            v(() => s(S));
          }
        else I.type === "authorization-error" && v(() => s(new m(I.code, I.message, !!I.retryable)));
    }, v = (_) => {
      if (!c) {
        c = !0, u && clearTimeout(u), l && clearInterval(l), d && clearTimeout(d), h && clearTimeout(h), window.removeEventListener("message", y), window.removeEventListener("pagehide", w), t?.removeEventListener("abort", f);
        try {
          a && !a.closed && a.close();
        } catch {
        }
        _();
      }
    };
    if (window.addEventListener("message", y), window.addEventListener("pagehide", w, { once: !0 }), n)
      h = setTimeout(() => v(() => s(g())), S0);
    else {
      const _ = window.open(N0(r), i, "popup,width=520,height=760");
      if (!_) {
        v(() => s(new m("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      _.focus(), p(_);
    }
    if (u = setTimeout(
      () => v(() => s(new m("authorization_window_timeout", "authorization window timed out", !0))),
      E0
    ), t) {
      if (t.aborted) {
        f();
        return;
      }
      t.addEventListener("abort", f, { once: !0 });
    }
  });
}
function D0(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? qn("context.minutes", { count: e / 60 }) : qn("context.seconds", { count: e });
}
function hn(e, t) {
  const n = [];
  e.sessionLabel && n.push({ label: "context.session", value: le(e.sessionLabel) }), e.command && n.push({ label: "context.command", value: le(e.command), variant: "command" }), e.egress && n.push({ label: "context.egress", value: le(e.egress) });
  const r = [
    ...e.source?.env?.map((i) => le(`${N("context.sourceEnv")}: ${i}`)) ?? [],
    ...e.source?.tags?.map((i) => le(`${N("context.sourceTag")}: ${i}`)) ?? [],
    ...e.source?.skills?.map((i) => le(`${N("context.sourceSkill")}: ${i}`)) ?? []
  ];
  return r.length > 0 && n.push({ label: "context.source", values: r, variant: "chips" }), t?.agentFingerprint && n.push({ label: "context.agent", value: le(t.agentFingerprint), variant: "mono" }), t?.grantId && n.push({ label: "context.grant", value: le(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && n.push({ label: "context.agentAccess", value: D0(e.grantTtlSeconds) }), n.push({
    label: "context.secrets",
    values: e.secrets.map(
      (i) => le(`${i.name} · ${N(i.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: n };
}
function j0(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function V0(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function Xl(e, t) {
  return j0(e) ? !0 : V0(e) && ft(t).state === "locked";
}
async function q0(e, t = xe(), n) {
  await _u({ wrapMeta: e, currentRpId: pt(), policy: t, abortSignal: n });
}
async function G0(e, t = xe()) {
  await er((n) => q0(e, t, n));
}
async function Yl(e) {
  try {
    await gs({ ...e, passkey: "unlock" });
  } catch (t) {
    throw ft(e.wrapMeta).state === "unlocked" && Ne({ broadcast: !0, reason: "manual-lock" }), t;
  }
}
async function W0(e, t) {
  if (ft(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await G0(e);
  }
  return await Ho(t, { renewOnSuccess: !0 });
}
async function Jl(e) {
  const t = ft(e.wrapMeta).state, n = xe(), r = Ul({ tier: e.tier, vaultState: t, policy: n });
  let i = !1;
  const o = async () => {
    await Yl({
      ...e.lockedPrompt,
      wrapMeta: e.wrapMeta,
      policy: n,
      parentSurface: e.parentSurface,
      authorizationWindow: e.authorizationWindow
    }), i = !0;
  }, s = async (a, c = !1) => {
    let u = !1;
    try {
      const l = await Ho(
        async (d, h, f) => {
          const w = await e.buildPrompt(d, h, f);
          return r.confirm && !c && (await gs({
            ...w,
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
      throw i && !u && ft().state === "unlocked" && Ne({ broadcast: !0, reason: "manual-lock" }), l;
    }
  };
  try {
    return r.passkey === "unlock" ? (await o(), await s("none", !0)) : await s(r.passkey === "uv" ? "uv" : "none");
  } catch (a) {
    if (r.passkey !== "unlock" && Xl(a, e.wrapMeta))
      return await o(), await s("none", !0);
    throw a;
  }
}
function Ke(e, t) {
  if (e instanceof m) return e;
  if (Gy(e)) return new m("passkey_cancelled", "passkey-cancelled", !0);
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
function Z0(e) {
  return J(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function X0(e) {
  return ql(JSON.parse(new TextDecoder().decode(fe(e))));
}
function Y0(e, t) {
  return ja("setup", e, Kl(), { req: Z0(t) });
}
function zi(e) {
  const t = Ee(e);
  return {
    credentialId: ve(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function yi(e) {
  return `${m0}${e}`;
}
function gi(e) {
  return `${v0}${e}`;
}
function Fa(e) {
  try {
    localStorage.removeItem(yi(e)), localStorage.removeItem(gi(e));
  } catch {
  }
}
function J0(e, t) {
  try {
    localStorage.setItem(yi(e), JSON.stringify({ build: ie, result: t })), localStorage.removeItem(gi(e));
  } catch {
  }
}
function Q0(e, t) {
  try {
    localStorage.setItem(
      gi(e),
      JSON.stringify({ build: ie, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(yi(e));
  } catch {
  }
}
function Ql(e) {
  if (window.self === window.top)
    return Fo({
      rpId: pt(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = Gl(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Nl}${t}`);
  let r = null;
  return Fa(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, u = null;
    const l = () => d(() => o(new m("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (g) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), u && clearTimeout(u), window.removeEventListener("visibilitychange", f), window.removeEventListener("focus", f), window.removeEventListener("storage", f), window.removeEventListener("message", w), window.removeEventListener("pagehide", l), n?.close(), Fa(t);
        try {
          r?.close();
        } catch {
        }
        g();
      }
    }, h = () => {
      let g = null, p = null;
      try {
        g = localStorage.getItem(yi(t)), p = localStorage.getItem(gi(t));
      } catch {
        return !1;
      }
      if (g) {
        try {
          const y = Ee(JSON.parse(g));
          if (!tn(y.build)) throw new m("sandbox_build_mismatch");
          const v = zi(y.result);
          d(() => i(v));
        } catch (y) {
          const v = y instanceof Error ? y.message : "stored setup result is invalid";
          d(() => o(new m("setup_storage_invalid", v)));
        }
        return !0;
      }
      if (p) {
        try {
          const y = Ee(JSON.parse(p));
          if (!tn(y.build)) throw new m("sandbox_build_mismatch");
          d(
            () => o(new m(ve(y.code, "code"), Dl(y.message, "message"), !!y.retryable))
          );
        } catch (y) {
          const v = y instanceof Error ? y.message : "stored setup error is invalid";
          d(() => o(new m("setup_storage_invalid", v)));
        }
        return !0;
      }
      return !1;
    }, f = () => {
      h();
    }, w = (g) => {
      if (g.origin !== window.location.origin || g.source !== r) return;
      const p = g.data;
      !p || p.id !== t || !tn(p.build) || (p.type === "setup-created" ? d(() => i(zi(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      h() || d(() => o(new m("setup_window_timeout", "setup window timed out", !0)));
    }, x0), c = setInterval(() => {
      !r?.closed || u || h() || (u = setTimeout(() => {
        h() || d(() => o(new m("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (g) => {
      const p = g.data;
      !p || p.id !== t || !tn(p.build) || (p.type === "setup-created" ? d(() => i(zi(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", f), window.addEventListener("focus", f), window.addEventListener("storage", f), window.addEventListener("message", w), window.addEventListener("pagehide", l, { once: !0 }), r = window.open(Y0(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
      d(() => o(new m("setup_popup_blocked", "setup window was blocked", !0)));
      return;
    }
    r.focus();
  });
}
function mn(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Nt(e) {
  if (e?.aborted) throw mn(e);
}
function ev() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function Ka(e) {
  return ev() && Eu(e);
}
async function ed(e, t, n, r, i = xe()) {
  const o = Bh();
  let s, a;
  try {
    Nt(r), s = (await No([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, Nt(r), a = Ph();
    const u = await Th(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    Nt(r);
    let l = Ch(u, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (l = Hh(l, await Uh(a, e.rootMetadata, l)), Nt(r));
    const d = wu({
      vmk: a,
      wrapMeta: l,
      freshSetup: !e.existingProtectedVault,
      scopeId: Sy(e.vaultUserHandle),
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
function tv(e, t, n) {
  return er((r) => {
    const i = Do(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody"
    ), o = Gn("setup.createPasskey"), s = Au("setup.ready");
    return nn(i.card, o), nn(i.card, s), new Promise((a, c) => {
      let u = !1, l = "create", d = null, h = !1;
      const f = (S) => {
        u || (u = !0, r.removeEventListener("abort", p), jo(), S());
      }, w = (S) => {
        f(() => c(S));
      }, g = (S) => {
        u || (l = "create", d = null, W(o, "setup.createPasskey"), o.disabled = !1, W(s, S));
      }, p = () => {
        w(mn(r));
      }, y = (S) => {
        if (S instanceof m && S.code === "setup_popup_blocked") {
          g("setup.popupBlocked");
          return;
        }
        w(S);
      }, v = () => {
        h = !0, o.disabled = !0, W(s, "setup.popupPrompt");
        let S;
        try {
          S = Ql(e);
        } catch (O) {
          y(O);
          return;
        }
        S.then(
          (O) => {
            u || (d = O, l = "finish", W(o, "setup.finish"), o.disabled = !1, W(s, "setup.createdFinish"));
          },
          (O) => {
            y(O);
          }
        );
      }, _ = (S) => {
        o.disabled = !0, W(s, "setup.passkeyPrompt"), ed(e, t, S, r, n).then(
          (O) => f(() => a(O)),
          (O) => w(O)
        );
      }, I = () => {
        o.disabled = !0, W(s, "setup.passkeyPrompt");
        let S;
        try {
          S = Fo({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (O) {
          if (Ka(O)) {
            v();
            return;
          }
          w(O);
          return;
        }
        S.then(
          (O) => _(O),
          (O) => {
            if (Ka(O)) {
              v();
              return;
            }
            w(O);
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
            v();
            return;
          }
          I();
        }
      });
    });
  });
}
async function nv(e) {
  const t = ql(e);
  try {
    const n = pt(), r = t.policy ?? xe(), i = window.self !== window.top ? await tv(t, n, r) : await ed(t, n, await Ql(t), void 0, r), o = t.policy ? Co(r) : xe();
    return { ...i, policy: o };
  } catch (n) {
    throw Ke(n, "setup_failed");
  }
}
async function rv(e) {
  const t = B0(e);
  try {
    const n = pt(), r = t.policy ?? xe(), i = await er(async (s) => {
      let a;
      if (await qo(
        {
          title: "unlock.sessionTitle",
          subtitle: qn("unlock.sessionSubtitle", {
            minutes: r.windowSeconds / 60
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue"
        },
        s,
        void 0,
        async () => {
          a = await _u({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? Co(r) : xe();
    return { ...i, policy: o };
  } catch (n) {
    throw Ke(n, "unlock_failed");
  }
}
async function iv(e) {
  const t = gg(e);
  t.wrapMeta && Mo(t.wrapMeta);
  try {
    if (t.kind === "static" && !xe().parentValueSealAllowed)
      throw new m("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await W0(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await y0({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await g0({ name: t.name, curve: t.curve, vmk: n, wrapMeta: r }), establishingVmk: $y() }));
  } catch (n) {
    throw Ke(n, "seal_failed");
  }
}
async function ov(e, t) {
  const n = $0(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = ln(n.material.envelope);
    if (o?.kind === "keypair") throw new Error("keypair protected records cannot be revealed as plaintext");
    return Wi({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await Jl({
      tier: "R2",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: le(n.material.name),
        body: "reveal.confirmBody",
        details: hn(n.context.display),
        label: "common.continue"
      },
      buildPrompt: async (s, a) => {
        const c = await Bo(a, s);
        return Xr({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), Wi({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), Yr([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: le(n.material.name),
          body: "reveal.confirmBody",
          details: hn(n.context.display),
          challenge: await Na(ci(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const u = await Qc(r, s, Io(n.material.name, o));
        try {
          c.assertCurrent(), await ui([n.context]), await fg({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: xe().strictApprovals ? async (l) => {
              await Zl({
                wrapMeta: a,
                challenge: await Na(`reveal-copy:${n.context.requestId}:${n.material.name}`),
                abortSignals: [l, c.signal]
              }), Nt(l), Nt(c.signal);
            } : void 0
          });
        } finally {
          u.fill(0);
        }
        return { completed: !0 };
      }
    });
  } catch (r) {
    throw Ke(r, "reveal_failed");
  }
}
async function sv(e, t) {
  try {
    const n = p0(e), { request: r, verified: i, unpacked: { vmkWrapMeta: o } } = n;
    return await Jl({
      tier: "R3",
      wrapMeta: o,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "sign.title",
        subtitle: le(r.material.name),
        body: le(i.display),
        details: hn(r.context.display),
        label: "sign.confirm"
      },
      buildPrompt: async (s, a) => (await zl(n, s, a), {
        title: "sign.title",
        subtitle: le(r.material.name),
        body: le(i.display),
        details: hn(r.context.display),
        challenge: new Uint8Array(n.challenge),
        label: "sign.confirm"
      }),
      operation: (s, a) => h0(n, s, a),
      beforeSuccess: () => ui([r.context])
    });
  } catch (n) {
    throw Ke(n, "sign_failed");
  }
}
async function av(e, t) {
  const n = O0(e);
  try {
    const i = ln(n.items[0].material.envelope).vmkWrapMeta;
    for (const h of n.items) {
      const f = ln(h.material.envelope);
      if (f.vmkWrapMeta !== i) throw new m("invalid_payload", "approveRelease items must share one VMK context");
      if (!Hl(f.recordMetadata)) throw new m("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = Ml(n.items), s = ft(i).state, a = xe(), c = Ul({ tier: "R2", vaultState: s, policy: a });
    let u = !1;
    const l = async () => {
      await Yl({
        title: "release.title",
        subtitle: qn("release.subtitle", { count: n.items.length }),
        details: hn(o.display, o.recipient),
        label: "release.confirm",
        wrapMeta: i,
        policy: a,
        parentSurface: t.latestSurface,
        authorizationWindow: t.takeAuthorizationWindow
      }), u = !0;
    }, d = async (h, f = !1) => {
      let w = !1, g;
      try {
        const p = await Ho(
          async (y, v, _) => {
            const I = await b0({
              items: n.items,
              vmk: y,
              wrapMeta: v,
              consumeReplayIds: !1,
              onApprovalAccepted: (S) => {
                g = S;
              },
              confirm: (S) => !c.confirm || f ? Promise.resolve() : gs({
                title: "release.title",
                subtitle: qn("release.subtitle", { count: n.items.length }),
                details: hn(S.display, S.recipient),
                challenge: S.challenge,
                label: "release.confirm",
                wrapMeta: v,
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
            beforeSuccess: () => ui(n.items.map((y) => y.context), g)
          }
        );
        return w = !0, p;
      } catch (p) {
        throw u && !w && ft().state === "unlocked" && Ne({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await l(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (h) {
      if (c.passkey !== "unlock" && Xl(h, i))
        return await l(), await d("none", !0);
      throw h;
    }
  } catch (r) {
    throw Ke(r, "approve_release_failed");
  }
}
async function cv(e) {
  const t = T0(e);
  try {
    const n = await jy(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw Ke(n, "delete_authz_failed");
  }
}
function uv() {
  const e = no();
  if (e.get("mode") !== "setup") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && hi({ locale: t, theme: n });
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
    h = X0(d);
  } catch {
    u.disabled = !0, W(l, "setup.requestInvalid");
    return;
  }
  const f = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Nl}${r}`), w = (g) => {
    const p = Ke(g, "setup_create_failed"), y = {
      type: "setup-error",
      build: ie,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    Q0(r, p), f?.postMessage(y);
    try {
      window.opener?.postMessage(y, window.location.origin);
    } catch {
    }
    u.disabled = !1, W(l, le(p.message));
  };
  u.addEventListener("click", () => {
    u.disabled = !0, W(l, "setup.passkeyPrompt");
    let g;
    try {
      g = Fo({
        rpId: pt(),
        vaultUserHandle: h.vaultUserHandle,
        displayName: h.displayName,
        authzCreationOptions: h.authzCreationOptions
      });
    } catch (p) {
      w(p);
      return;
    }
    g.then((p) => {
      const y = { type: "setup-created", build: ie, id: r, result: p };
      J0(r, p), f?.postMessage(y);
      try {
        window.opener?.postMessage(y, window.location.origin);
      } catch {
      }
      W(l, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(w);
  });
}
function lv() {
  const e = no();
  if (e.get("mode") !== "authorize") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && hi({ locale: t, theme: n });
  const r = e.get("id"), o = document.getElementById("page")?.querySelector(".card"), s = o?.querySelector(".body");
  if (!r || !o || !s || (s.classList.add("waiting"), W(s, window.opener ? "authorize.waiting" : "authorize.waitingLong"), !window.opener)) return;
  const a = () => {
    const p = window.opener;
    if (!p) return [];
    const y = [p];
    try {
      for (let v = 0; v < p.frames.length; v += 1) y.push(p.frames[v]);
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
  const h = setTimeout(() => W(s, "authorize.waitingLong"), k0), f = () => {
    if (!l)
      for (const p of a())
        try {
          p.postMessage({ type: "authorization-ready", build: ie, id: r }, window.location.origin);
        } catch {
        }
  }, w = (p) => {
    if (l) return;
    l = !0, d && clearInterval(d), clearTimeout(h), s.classList.remove("waiting"), window.removeEventListener("message", g), document.body.classList.add("setup-mode");
    const y = new AbortController();
    let v = { kind: "confirmed" };
    const _ = async () => {
      if (p.passkey === "none") return;
      if (p.passkey === "uv") {
        if (!p.prompt.challenge) throw new m("invalid_payload", "authorization challenge is missing");
        await Zl({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [y.signal]
        });
        return;
      }
      const I = await No(Ao(p.wrapMeta), pt(), y.signal);
      v = {
        kind: "unlock",
        prfOutput: J(I.prfOutput),
        prfSalt: J(I.prfSalt)
      }, I.prfOutput.fill(0);
    };
    qo(
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
        u({ type: "authorization-approved", build: ie, id: r, result: v }), setTimeout(() => window.close(), 250);
      },
      (I) => {
        const S = Ke(I, I instanceof Error && I.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed");
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
    if (!y || y.type !== "authorization-request" || y.id !== r || !tn(y.build)) return;
    const v = a().find((_) => _ === p.source);
    if (v) {
      c = v;
      try {
        w(M0(y.request));
      } catch (_) {
        const I = Ke(_, "authorization_request_invalid");
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
function dv() {
  if (window.self !== window.top || no().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && W(e, "sandbox.intro");
}
Ae.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new m("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== ie.buildHash)
    throw new m("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = _0(t.appearance);
  r && hi(r);
  const i = Ma ? xe() : Co(t.policy === void 0 ? void 0 : Ro(t.policy));
  return Ma = !0, {
    accepted: !0,
    channel: Ct,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: ie,
    policy: i
  };
});
Ae.register("set-appearance", (e) => (hi(Fl(e)), { accepted: !0 }));
Ae.register("status", (e) => {
  const t = P0(e);
  try {
    t.wrapMeta && ft(t.wrapMeta);
    const n = ft(), r = xe();
    return {
      ...n,
      policy: r,
      session: {
        ...n.expiresAt !== void 0 ? { expiresAt: n.expiresAt } : {},
        strict: r.strictApprovals
      }
    };
  } catch (n) {
    throw Ke(n, "invalid_wrap_meta");
  }
});
Ae.register("setup", nv);
Ae.register("unlock", rv);
Ae.register("lock", () => ({ ...Ne({ broadcast: !0, reason: "manual-lock" }), policy: xe() }));
Ae.register("seal", iv);
Ae.register("reveal", ov);
Ae.register("sign", sv);
Ae.register("approveRelease", av);
Ae.register("deleteAuthzAssertion", cv);
xy((e) => Ae.emit("vault.state", e));
sg((e) => Ae.emit(e));
await ad();
Ae.start();
window.addEventListener("pagehide", Oy);
uv();
lv();
dv();
window.self !== window.top && document.body.classList.add("embedded");
const td = globalThis.crypto, fv = { webcrypto: td }, nd = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: fv,
  webcrypto: td
}, Symbol.toStringTag, { value: "Module" }));
