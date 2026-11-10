const Lt = "avibe.vault.crypto";
const re = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "dc31e679fc8af0d80c59d647768d146f357b3ab1d665ced33d45ae70038113d1"
};
class w extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function os(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function Hl(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === Lt && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const Ml = /^[A-Za-z0-9_-]{16,128}$/;
function Pa(e) {
  return typeof e == "object" && e !== null;
}
function Fl(e) {
  return Pa(e) ? e.channel === Lt && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class Kl {
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
        channel: Lt,
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
      channel: Lt,
      version: 2,
      build: re,
      capabilities: {
        operations: Array.from(this.handlers.keys())
      }
    });
  }
  async onMessage(t) {
    if (!os(t.origin)) return;
    if (Fl(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!Hl(t.data)) return;
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
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !Ml.test(n.authorizationWindow))) {
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
        channel: Lt,
        version: 2,
        id: n.id,
        ok: !0,
        result: c
      });
    } catch (c) {
      const u = c instanceof w ? c.code : "internal_error", l = c instanceof w ? c.retryable : !1, d = c instanceof w ? c.message : void 0;
      this.reply(t.source, this.fail(n.id, u, d, l)), r && this.clearPin();
    } finally {
      this.activeSurfaceSlots.delete(n.id);
    }
  }
  validateInitialHandshake(t, n) {
    if (t.op !== "handshake" || !Pa(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !os(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
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
    return { channel: Lt, version: 2, id: t, ok: !1, error: { code: n, message: r, retryable: i } };
  }
  reply(t, n) {
    !t || this.pinnedParentOrigin === null || t.postMessage(n, this.pinnedParentOrigin);
  }
  postToParent(t, n) {
    t.postMessage(n, "*");
  }
}
function qi() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function $a(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return re.buildHash !== "dev" && (i.pathname = `/v/${re.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function Jt(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === re.buildHash && t.sandboxVersion === re.sandboxVersion;
}
async function Dl() {
  if (re.buildHash === "dev") return;
  const e = new URL(window.location.href);
  if (e.pathname !== `/v/${re.buildHash}/index.html` || e.search)
    throw new Error("Sandbox release document URL mismatch");
  const t = document.querySelectorAll('link[rel="stylesheet"]');
  if (t.length !== 1 || !t[0].integrity.startsWith("sha256-") || !t[0].href.startsWith(`${e.origin}/v/${re.buildHash}/assets/`))
    throw new Error("Sandbox release stylesheet is not pinned");
  const n = t[0];
  n.sheet || await new Promise((r, i) => {
    const o = () => a(new Error("Sandbox release stylesheet failed integrity or loading")), s = () => n.sheet ? a() : o(), a = (u) => {
      clearTimeout(c), n.removeEventListener("load", s), n.removeEventListener("error", o), window.removeEventListener("load", s), window.removeEventListener("pagehide", o), u ? i(u) : r();
    }, c = setTimeout(o, 1e4);
    n.addEventListener("load", s, { once: !0 }), n.addEventListener("error", o, { once: !0 }), window.addEventListener("load", s, { once: !0 }), window.addEventListener("pagehide", o, { once: !0 }), (n.sheet || document.readyState === "complete") && s();
  });
}
class Me extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class je extends Me {
}
class hr extends Me {
}
class Yn extends Me {
}
class jl extends Me {
}
class Vl extends Me {
}
class ql extends Me {
}
class Gl extends Me {
}
class Wl extends Me {
}
class Zl extends Me {
}
class Xl extends Me {
}
class Gi extends Me {
}
const Yl = {}, Oa = Jl(globalThis, Yl);
function Jl(e, t) {
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
async function Ql() {
  if (Oa !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Nl);
    return e.subtle;
  } catch (e) {
    throw new Gi(e);
  }
}
class Wi {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await Ql());
  }
}
const pt = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, ss = {
  DhkemX25519HkdfSha256: 32
}, Ta = {
  HkdfSha256: 1
}, Zi = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, vr = 8192, ed = 268435456, as = 32, be = /* @__PURE__ */ new Uint8Array(0), Ve = 0n, Vt = 1n, Jn = 2n, td = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), cs = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function yr(e) {
  return new Uint8Array(Z(e));
}
function Z(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class nd extends Wi {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Ta.HkdfSha256
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
    return r.set(cs, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(cs, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t);
    if (r.byteLength !== this.hashSize)
      throw new je("The salt length must be the same as the hashSize");
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
    const u = yr(n), l = new Uint8Array(1);
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
class La extends nd {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Ta.HkdfSha256
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
const mn = (e) => typeof e == "object" && e !== null && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function Pn(e, t) {
  if (t <= 0)
    throw new Error("i2Osp: too small size");
  if (e >= 256 ** t)
    throw new Error("i2Osp: too large integer");
  const n = new Uint8Array(t);
  for (let r = 0; r < t && e; r++)
    n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
  return n;
}
function Qn(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function us(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function rd() {
  if (typeof Oa < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Nl);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function id(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const od = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), sd = /* @__PURE__ */ new Uint8Array([
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
function ad(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class cd {
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
    const i = new Uint8Array(td);
    i.set(Pn(this.id, 2), 3), this._kdf.init(i);
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
    if (n.byteLength > vr)
      throw new je("Too long ikm");
    return await this._prim.deriveKeyPair(n);
  }
  async encap(t) {
    let n;
    t.ekm === void 0 ? n = await this.generateKeyPair() : mn(t.ekm) ? n = t.ekm : n = await this.deriveKeyPair(t.ekm);
    const r = await this._prim.serializePublicKey(n.publicKey), i = await this._prim.serializePublicKey(t.recipientPublicKey);
    try {
      let o;
      if (t.senderKey === void 0)
        o = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey));
      else {
        const c = mn(t.senderKey) ? t.senderKey.privateKey : t.senderKey, u = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey)), l = new Uint8Array(await this._prim.dh(c, t.recipientPublicKey));
        o = Qn(u, l);
      }
      let s;
      if (t.senderKey === void 0)
        s = Qn(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = mn(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), u = await this._prim.serializePublicKey(c);
        s = ad(new Uint8Array(r), new Uint8Array(i), new Uint8Array(u));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new jl(o);
    }
  }
  async decap(t) {
    const n = Z(t.enc), r = await this._prim.deserializePublicKey(n), i = mn(t.recipientKey) ? t.recipientKey.privateKey : t.recipientKey, o = mn(t.recipientKey) ? t.recipientKey.publicKey : await this._prim.derivePublicKey(t.recipientKey), s = await this._prim.serializePublicKey(o);
    try {
      let a;
      if (t.senderPublicKey === void 0)
        a = new Uint8Array(await this._prim.dh(i, r));
      else {
        const u = new Uint8Array(await this._prim.dh(i, r)), l = new Uint8Array(await this._prim.dh(i, t.senderPublicKey));
        a = Qn(u, l);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = Qn(new Uint8Array(n), new Uint8Array(s));
      else {
        const u = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + u.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(u), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new Vl(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(od, t), i = this._kdf.buildLabeledInfo(sd, n, this.secretSize);
    return await this._kdf.extractAndExpand(be, r, i, this.secretSize);
  }
}
const er = ["deriveBits"], ud = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), ld = /* @__PURE__ */ new Uint8Array([115, 107]);
class qt {
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
class dd {
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
      return Promise.reject(new hr(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(Z(t), !0);
    } catch (n) {
      throw new Yn(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new hr(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(Z(t), !1);
    } catch (n) {
      throw new Yn(n);
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
      throw new Yn(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new qt(this._algName, t, "private", er);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new Gi(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = Z(t), r = await this._hkdf.labeledExtract(be.buffer, ud, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, ld, be, this._nSk), o = new qt(this._algName, new Uint8Array(i), "private", er);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new Xl(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new qt(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new Yn(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new hr(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new qt(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : er));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new qt(this._algName, us(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new qt(this._algName, us(t.d), "private", er)));
    });
  }
}
const fd = ["encrypt", "decrypt"];
function pd(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Rn(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function at(e, t, n = "") {
  const r = pd(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Er(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function hd(e, t) {
  at(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function yd(e) {
  if (typeof e == "bigint") {
    if (!gr(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    Rn(e);
  return e;
}
function Sr(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const gd = /* @__PURE__ */ new Uint32Array([287454020]), bd = /* @__PURE__ */ new Uint8Array(gd.buffer);
bd[0];
function ci(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Fe(e, t) {
  return e << 32 - t | e >>> t;
}
const Ra = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", md = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), wd = [
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
function xd(e) {
  if (at(e), Ra)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += md[e[n]];
  return t;
}
const nt = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Ii(e) {
  if (e >= nt._0 && e <= nt._9)
    return e - nt._0;
  if (e >= nt.A && e <= nt.F)
    return e - (nt.A - 10);
  if (e >= nt.a && e <= nt.f)
    return e - (nt.a - 10);
}
function vd(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Ra)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Ii(e.charCodeAt(o)), a = Ii(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Ed(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = Ve;
  for (let n = 0; n < e.length; n++) {
    const r = Ii(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | wd[r];
  }
  return t;
}
function Sd(e) {
  Rn(e, "numberToBigint");
  let t = e, n = Ve, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function ls(e) {
  return Ed(xd(Bi(at(e)).reverse()));
}
function kd(e, t) {
  Rn(t), e = yd(e);
  const n = vd(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function Ad(e, t) {
  return kd(e, t).reverse();
}
function Bi(e) {
  return Uint8Array.from(e);
}
function gr(e) {
  return typeof e == "bigint" && Ve <= e;
}
function _d(e, t, n) {
  return gr(e) && gr(t) && gr(n) && t <= e && e < n;
}
function ds(e, t, n, r) {
  if (!_d(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Id(e, t = {}, n = {}) {
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
async function Bd(e = 32) {
  const t = await rd(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function Pd(e) {
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
function $d(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  Rn(e.outputLen), Rn(e.blockLen);
}
function Od(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let Ca = class {
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
    }), $d(t), at(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Sr(i);
  }
  update(t) {
    return Er(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Er(this), at(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const za = (e, t, n) => new Ca(e, t).update(n).digest();
za.create = (e, t) => new Ca(e, t);
function Td(e, t, n) {
  return e & t ^ ~e & n;
}
function Ld(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Rd = class {
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
    }), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = ci(this.buffer);
  }
  update(t) {
    Er(this), at(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = ci(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Er(this), hd(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Sr(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, Sd(this.length * 8), o), this.process(r, 0);
    const a = ci(t), c = this.outputLen;
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
const ht = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Cd = /* @__PURE__ */ Uint32Array.from([
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
]), yt = /* @__PURE__ */ new Uint32Array(64);
let zd = class extends Rd {
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
      yt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = yt[d - 15], f = yt[d - 2], b = Fe(h, 7) ^ Fe(h, 18) ^ h >>> 3, g = Fe(f, 17) ^ Fe(f, 19) ^ f >>> 10;
      yt[d] = g + yt[d - 7] + b + yt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = Fe(a, 6) ^ Fe(a, 11) ^ Fe(a, 25), f = l + h + Td(a, c, u) + Cd[d] + yt[d] | 0, g = (Fe(r, 2) ^ Fe(r, 13) ^ Fe(r, 22)) + Ld(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Sr(yt);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Sr(this.buffer);
  }
}, Ud = class extends zd {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ht[7] | 0
    });
  }
};
const Nd = /* @__PURE__ */ Od(
  () => new Ud(),
  /* @__PURE__ */ Pd(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Ua(e, t) {
  const n = e % t;
  return n >= Ve ? n : t + n;
}
function $e(e, t, n) {
  let r = e;
  for (; t-- > Ve; )
    r *= r, r %= n;
  return r;
}
function Hd(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Md(e) {
  return Id(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function Fd(e) {
  const t = Md(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || Bd, u = a ? 255n : 448n, l = a ? 32 : 56, d = a ? 9n : 5n, h = a ? 121665n : 39081n, f = a ? Jn ** 254n : Jn ** 447n, b = a ? 8n * Jn ** 251n - Vt : 4n * Jn ** 445n - Vt, g = f + b + Vt, p = (A) => Ua(A, n), y = x(d);
  function x(A) {
    return Ad(p(A), l);
  }
  function _(A) {
    const v = Bi(at(A, l, "uCoordinate"));
    return a && (v[31] &= 127), p(ls(v));
  }
  function I(A) {
    return ls(i(Bi(at(A, l, "scalar"))));
  }
  function S(A, v) {
    const E = j(_(v), I(A));
    if (E === Ve)
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
    ds("u", A, Ve, n), ds("scalar", v, f, g);
    const E = v, B = A;
    let $ = Vt, P = Ve, T = A, C = Vt, N = Ve;
    for (let H = u - 1n; H >= Ve; H--) {
      const Q = E >> H & Vt;
      N ^= Q, { x_2: $, x_3: T } = U(N, $, T), { x_2: P, x_3: C } = U(N, P, C), N = Q;
      const ee = $ + P, te = p(ee * ee), X = $ - P, pe = p(X * X), tt = te - pe, Pt = T + C, jt = T - C, gn = p(jt * ee), bn = p(Pt * X), rs = gn + bn, is = gn - bn;
      T = p(rs * rs), C = p(B * p(is * is)), $ = p(te * pe), P = p(tt * (te + p(h * tt)));
    }
    ({ x_2: $, x_3: T } = U(N, $, T)), { x_2: P, x_3: C } = U(N, P, C);
    const G = o(P);
    return p($ * G);
  }
  const z = {
    secretKey: l,
    publicKey: l,
    seed: l
  }, m = async (A) => (A === void 0 && (A = await c(l)), at(A, z.seed, "seed"), A), k = { randomSecretKey: m };
  return Object.freeze({
    keygen: Hd(m, L),
    getSharedSecret: R,
    getPublicKey: L,
    scalarMult: S,
    scalarMultBase: O,
    utils: k,
    GuBytes: y.slice(),
    lengths: z
  });
}
class Kd extends Wi {
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
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, fd);
  }
}
class Dd {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Zi.Aes128Gcm
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
    return new Kd(t);
  }
}
class jd extends Dd {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Zi.Aes256Gcm
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
function fs() {
  return new Promise((e, t) => {
    t(new Gi("Not supported"));
  });
}
const Vd = new Uint8Array([115, 101, 99]);
class Xi {
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
    return await fs();
  }
  async open(t, n) {
    return await fs();
  }
  async export(t, n) {
    const r = Z(t);
    if (r.byteLength > vr)
      throw new je("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, Vd, new Uint8Array(r), n);
    } catch (i) {
      throw new ql(i);
    }
  }
}
class qd extends Xi {
}
class Gd extends Xi {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Na extends Xi {
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
    const n = Pn(t.seq, t.baseNonce.byteLength);
    return id(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new Zl("Message limit reached");
    t.seq += 1;
  }
}
var Wd = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Zd = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, br;
class Ha {
  constructor() {
    br.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = Wd(this, br, "f");
    return Zd(this, br, n, "f"), await r, t;
  }
}
br = /* @__PURE__ */ new WeakMap();
var ps = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Xd = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, kn;
class Yd extends Na {
  constructor() {
    super(...arguments), kn.set(this, void 0);
  }
  async open(t, n = be.buffer) {
    Xd(this, kn, ps(this, kn, "f") ?? new Ha(), "f");
    const r = await ps(this, kn, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new Wl(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
kn = /* @__PURE__ */ new WeakMap();
var hs = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Jd = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, An;
class Qd extends Na {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), An.set(this, void 0), this.enc = i;
  }
  async seal(t, n = be.buffer) {
    Jd(this, An, hs(this, An, "f") ?? new Ha(), "f");
    const r = await hs(this, An, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new Gl(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
An = /* @__PURE__ */ new WeakMap();
const ef = new Uint8Array([
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
]), tf = new Uint8Array([101, 120, 112]), nf = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), rf = new Uint8Array([107, 101, 121]), of = new Uint8Array([
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
]), sf = new Uint8Array([115, 101, 99, 114, 101, 116]), af = new Uint8Array([
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
class cf extends Wi {
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
      throw new je("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new je("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new je("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(af), this._suiteId.set(Pn(this._kem.id, 2), 4), this._suiteId.set(Pn(this._kdf.id, 2), 6), this._suiteId.set(Pn(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
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
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? pt.AuthPsk : pt.Psk : r = t.senderKey !== void 0 ? pt.Auth : pt.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
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
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? pt.AuthPsk : pt.Psk : r = t.senderPublicKey !== void 0 ? pt.Auth : pt.Base, await this._keyScheduleR(r, n, t);
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
    const i = r.psk === void 0 ? be : yr(r.psk.id), o = await this._kdf.labeledExtract(be, of, i), s = r.info === void 0 ? be : yr(r.info), a = await this._kdf.labeledExtract(be, nf, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const u = r.psk === void 0 ? be : yr(r.psk.key), l = this._kdf.buildLabeledIkm(sf, u), d = this._kdf.buildLabeledInfo(tf, c, this._kdf.hashSize), h = await this._kdf.extractAndExpand(n, l, d, this._kdf.hashSize);
    if (this._aead.id === Zi.ExportOnly)
      return { aead: this._aead, exporterSecret: h };
    const f = this._kdf.buildLabeledInfo(rf, c, this._aead.keySize), b = await this._kdf.extractAndExpand(n, l, f, this._aead.keySize), g = this._kdf.buildLabeledInfo(ef, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, l, g, this._aead.nonceSize);
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
    return o.key === void 0 ? new Gd(this._api, this._kdf, o.exporterSecret, r) : new Qd(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new qd(this._api, this._kdf, i.exporterSecret) : new Yd(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > ed)
      throw new je("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < as)
        throw new je(`PSK must have at least ${as} bytes`);
      if (t.psk.key.byteLength > vr)
        throw new je("Too long psk.key");
      if (t.psk.id.byteLength > vr)
        throw new je("Too long psk.id");
    }
  }
}
class uf extends cf {
}
let lf = class extends La {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const df = 1n, ys = 2n, ff = 3n, pf = 5n, Ma = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function hf(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = Ma, a = e * e % o * e % o, c = $e(a, ys, o) * a % o, u = $e(c, df, o) * e % o, l = $e(u, pf, o) * u % o, d = $e(l, t, o) * l % o, h = $e(d, n, o) * d % o, f = $e(h, r, o) * h % o, b = $e(f, i, o) * f % o, g = $e(b, i, o) * f % o, p = $e(g, t, o) * l % o;
  return { pow_p_5_8: $e(p, ys, o) * e % o, b2: a };
}
function yf(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const gf = /* @__PURE__ */ (() => {
  const e = Ma;
  return Fd({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = hf(t);
      return Ua($e(n, ff, e) * r, e);
    },
    adjustScalarBytes: yf
  });
})();
class bf extends La {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t), i = Z(n);
    if (r.byteLength !== this.hashSize)
      return za(Nd, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class mf extends dd {
  constructor(t) {
    super("X25519", 32, gf, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new hr(r));
    }
  }
}
class wf extends cd {
  constructor() {
    const t = new bf();
    super(ss.DhkemX25519HkdfSha256, new mf(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ss.DhkemX25519HkdfSha256
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
function Fa(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Xe(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function Ye(e, t, n = "") {
  const r = Fa(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, u = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(u) : new TypeError(u);
  }
  return e;
}
function Ka(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (Xe(e.outputLen), Xe(e.blockLen), e.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (e.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function rn(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Yi(e, t) {
  Ye(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function xf(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Je(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function ui(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Ke(e, t) {
  return e << 32 - t | e >>> t;
}
function tr(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const vf = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Ef(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Sf(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Ef(e[t]);
  return e;
}
const gs = vf ? (e) => e : Sf, Da = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", kf = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Ji(e) {
  if (Ye(e), Da)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += kf[e[n]];
  return t;
}
const rt = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function bs(e) {
  if (e >= rt._0 && e <= rt._9)
    return e - rt._0;
  if (e >= rt.A && e <= rt.F)
    return e - (rt.A - 10);
  if (e >= rt.a && e <= rt.f)
    return e - (rt.a - 10);
}
function Qi(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Da)
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
    const s = bs(e.charCodeAt(o)), a = bs(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Af(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    Ye(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function jr(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function eo(e = 32) {
  Xe(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const ja = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function _f(e, t, n) {
  return e & t ^ ~e & n;
}
function If(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let to = class {
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
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = ui(this.buffer);
  }
  update(t) {
    rn(this), Ye(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = ui(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    rn(this), Yi(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Je(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = ui(t), c = this.outputLen;
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
]), he = /* @__PURE__ */ Uint32Array.from([
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
]), nr = /* @__PURE__ */ BigInt(2 ** 32 - 1), ms = /* @__PURE__ */ BigInt(32);
function Bf(e, t = !1) {
  return t ? { h: Number(e & nr), l: Number(e >> ms & nr) } : { h: Number(e >> ms & nr) | 0, l: Number(e & nr) | 0 };
}
function Va(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Bf(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const ws = (e, t, n) => e >>> n, xs = (e, t, n) => e << 32 - n | t >>> n, Gt = (e, t, n) => e >>> n | t << 32 - n, Wt = (e, t, n) => e << 32 - n | t >>> n, rr = (e, t, n) => e << 64 - n | t >>> n - 32, ir = (e, t, n) => e >>> n - 32 | t << 64 - n, Pf = (e, t, n) => e << n | t >>> 32 - n, $f = (e, t, n) => t << n | e >>> 32 - n, Of = (e, t, n) => t << n - 32 | e >>> 64 - n, Tf = (e, t, n) => e << n - 32 | t >>> 64 - n;
function it(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Lf = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), Rf = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, Cf = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), zf = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, Uf = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), Nf = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, Hf = /* @__PURE__ */ Uint32Array.from([
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
]), bt = /* @__PURE__ */ new Uint32Array(64);
class Mf extends to {
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
      bt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = bt[d - 15], f = bt[d - 2], b = Ke(h, 7) ^ Ke(h, 18) ^ h >>> 3, g = Ke(f, 17) ^ Ke(f, 19) ^ f >>> 10;
      bt[d] = g + bt[d - 7] + b + bt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = Ke(a, 6) ^ Ke(a, 11) ^ Ke(a, 25), f = l + h + _f(a, c, u) + Hf[d] + bt[d] | 0, g = (Ke(r, 2) ^ Ke(r, 13) ^ Ke(r, 22)) + If(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Je(bt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), Je(this.buffer);
  }
}
class Ff extends Mf {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = gt[0] | 0;
  B = gt[1] | 0;
  C = gt[2] | 0;
  D = gt[3] | 0;
  E = gt[4] | 0;
  F = gt[5] | 0;
  G = gt[6] | 0;
  H = gt[7] | 0;
  constructor() {
    super(32);
  }
}
const qa = Va([
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
].map((e) => BigInt(e))), Kf = qa[0], Df = qa[1], mt = /* @__PURE__ */ new Uint32Array(80), wt = /* @__PURE__ */ new Uint32Array(80);
class jf extends to {
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
      mt[_] = t.getUint32(n), wt[_] = t.getUint32(n += 4);
    for (let _ = 16; _ < 80; _++) {
      const I = mt[_ - 15] | 0, S = wt[_ - 15] | 0, O = Gt(I, S, 1) ^ Gt(I, S, 8) ^ ws(I, S, 7), L = Wt(I, S, 1) ^ Wt(I, S, 8) ^ xs(I, S, 7), R = mt[_ - 2] | 0, U = wt[_ - 2] | 0, j = Gt(R, U, 19) ^ rr(R, U, 61) ^ ws(R, U, 6), z = Wt(R, U, 19) ^ ir(R, U, 61) ^ xs(R, U, 6), m = Cf(L, z, wt[_ - 7], wt[_ - 16]), k = zf(m, O, j, mt[_ - 7], mt[_ - 16]);
      mt[_] = k | 0, wt[_] = m | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: u, Dl: l, Eh: d, El: h, Fh: f, Fl: b, Gh: g, Gl: p, Hh: y, Hl: x } = this;
    for (let _ = 0; _ < 80; _++) {
      const I = Gt(d, h, 14) ^ Gt(d, h, 18) ^ rr(d, h, 41), S = Wt(d, h, 14) ^ Wt(d, h, 18) ^ ir(d, h, 41), O = d & f ^ ~d & g, L = h & b ^ ~h & p, R = Uf(x, S, L, Df[_], wt[_]), U = Nf(R, y, I, O, Kf[_], mt[_]), j = R | 0, z = Gt(r, i, 28) ^ rr(r, i, 34) ^ rr(r, i, 39), m = Wt(r, i, 28) ^ ir(r, i, 34) ^ ir(r, i, 39), k = r & o ^ r & a ^ o & a, A = i & s ^ i & c ^ s & c;
      y = g | 0, x = p | 0, g = f | 0, p = b | 0, f = d | 0, b = h | 0, { h: d, l: h } = it(u | 0, l | 0, U | 0, j | 0), u = a | 0, l = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const v = Lf(j, m, A);
      r = Rf(v, U, z, k), i = v | 0;
    }
    ({ h: r, l: i } = it(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = it(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = it(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: u, l } = it(this.Dh | 0, this.Dl | 0, u | 0, l | 0), { h: d, l: h } = it(this.Eh | 0, this.El | 0, d | 0, h | 0), { h: f, l: b } = it(this.Fh | 0, this.Fl | 0, f | 0, b | 0), { h: g, l: p } = it(this.Gh | 0, this.Gl | 0, g | 0, p | 0), { h: y, l: x } = it(this.Hh | 0, this.Hl | 0, y | 0, x | 0), this.set(r, i, o, s, a, c, u, l, d, h, f, b, g, p, y, x);
  }
  roundClean() {
    Je(mt, wt);
  }
  destroy() {
    this.destroyed = !0, Je(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class Vf extends jf {
  Ah = he[0] | 0;
  Al = he[1] | 0;
  Bh = he[2] | 0;
  Bl = he[3] | 0;
  Ch = he[4] | 0;
  Cl = he[5] | 0;
  Dh = he[6] | 0;
  Dl = he[7] | 0;
  Eh = he[8] | 0;
  El = he[9] | 0;
  Fh = he[10] | 0;
  Fl = he[11] | 0;
  Gh = he[12] | 0;
  Gl = he[13] | 0;
  Hh = he[14] | 0;
  Hl = he[15] | 0;
  constructor() {
    super(64);
  }
}
const ae = /* @__PURE__ */ jr(
  () => new Ff(),
  /* @__PURE__ */ ja(1)
), qf = /* @__PURE__ */ jr(
  () => new Vf(),
  /* @__PURE__ */ ja(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const q = (e, t, n) => Ye(e, t, n), Ga = Xe, Y = Ji, Be = (...e) => Af(...e), Cn = (e) => Qi(e), no = Fa, ro = (e) => eo(e), kr = /* @__PURE__ */ BigInt(0), Pi = /* @__PURE__ */ BigInt(1);
function _t(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function io(e) {
  if (typeof e == "bigint") {
    if (!mr(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    Ga(e);
  return e;
}
function Ar(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function or(e) {
  const t = io(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Wa(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? kr : BigInt("0x" + e);
}
function Gn(e) {
  return Wa(Ji(e));
}
function on(e) {
  return Wa(Ji($i(Ye(e)).reverse()));
}
function oo(e, t) {
  if (Xe(t), t === 0)
    throw new RangeError("zero length");
  e = io(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return Qi(n.padStart(t * 2, "0"));
}
function Za(e, t) {
  return oo(e, t).reverse();
}
function Gf(e, t) {
  if (e = q(e), t = q(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function $i(e) {
  return Uint8Array.from(q(e));
}
function Wf(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const mr = (e) => typeof e == "bigint" && kr <= e;
function Zf(e, t, n) {
  return mr(e) && mr(t) && mr(n) && t <= e && e < n;
}
function _r(e, t, n, r) {
  if (!Zf(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function so(e) {
  if (e < kr)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > kr; e >>= Pi, t += 1)
    ;
  return t;
}
const ao = (e) => (Pi << BigInt(e)) - Pi;
function Xf(e, t, n) {
  if (Xe(e, "hashLen"), Xe(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), u = r(e), l = 0;
  const d = () => {
    c.fill(1), u.fill(0), l = 0;
  }, h = (...p) => n(u, Be(c, ...p)), f = (p = i) => {
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
    return Be(...y);
  };
  return (p, y) => {
    d(), f(p);
    let x;
    for (; (x = y(b())) === void 0; )
      f();
    return d(), x;
  };
}
function fn(e, t = {}, n = {}) {
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
const vs = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ye = /* @__PURE__ */ BigInt(0), ie = /* @__PURE__ */ BigInt(1), Rt = /* @__PURE__ */ BigInt(2), Xa = /* @__PURE__ */ BigInt(3), Ya = /* @__PURE__ */ BigInt(4), Ja = /* @__PURE__ */ BigInt(5), Yf = /* @__PURE__ */ BigInt(7), Qa = /* @__PURE__ */ BigInt(8), Jf = /* @__PURE__ */ BigInt(9), ec = /* @__PURE__ */ BigInt(16);
function se(e, t) {
  if (t <= ye)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= ye ? n : t + n;
}
function ne(e, t, n) {
  if (t < ye)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let r = e;
  for (; t-- > ye; )
    r *= r, r %= n;
  return r;
}
function Es(e, t) {
  if (e === ye)
    throw new Error("invert: expected non-zero number");
  if (t <= ye)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = se(e, t), r = t, i = ye, o = ie;
  for (; n !== ye; ) {
    const a = r / n, c = r - n * a, u = i - o * a;
    r = n, n = c, i = o, o = u;
  }
  if (r !== ie)
    throw new Error("invert: does not exist");
  return se(i, t);
}
function co(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function tc(e, t) {
  const n = e, r = (n.ORDER + ie) / Ya, i = n.pow(t, r);
  return co(n, i, t), i;
}
function Qf(e, t) {
  const n = e, r = (n.ORDER - Ja) / Qa, i = n.mul(t, Rt), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, Rt), o), c = n.mul(s, n.sub(a, n.ONE));
  return co(n, c, t), c;
}
function ep(e) {
  const t = Vr(e), n = nc(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + Yf) / ec;
  return ((a, c) => {
    const u = a;
    let l = u.pow(c, s), d = u.mul(l, r);
    const h = u.mul(l, i), f = u.mul(l, o), b = u.eql(u.sqr(d), c), g = u.eql(u.sqr(h), c);
    l = u.cmov(l, d, b), d = u.cmov(f, h, g);
    const p = u.eql(u.sqr(d), c), y = u.cmov(l, d, p);
    return co(u, y, c), y;
  });
}
function nc(e) {
  if (e < Xa)
    throw new Error("sqrt is not defined for small field");
  let t = e - ie, n = 0;
  for (; t % Rt === ye; )
    t /= Rt, n++;
  let r = Rt;
  const i = Vr(e);
  for (; Ss(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return tc;
  let o = i.pow(r, t);
  const s = (t + ie) / Rt;
  return function(c, u) {
    const l = c;
    if (l.is0(u))
      return u;
    if (Ss(l, u) !== 1)
      throw new Error("Cannot find square root");
    let d = n, h = l.mul(l.ONE, o), f = l.pow(u, t), b = l.pow(u, s);
    for (; !l.eql(f, l.ONE); ) {
      if (l.is0(f))
        return l.ZERO;
      let g = 1, p = l.sqr(f);
      for (; !l.eql(p, l.ONE); )
        if (g++, p = l.sqr(p), g === d)
          throw new Error("Cannot find square root");
      const y = ie << BigInt(d - g - 1), x = l.pow(h, y);
      d = g, h = l.sqr(x), f = l.mul(f, h), b = l.mul(b, x);
    }
    return b;
  };
}
function tp(e) {
  return e % Ya === Xa ? tc : e % Qa === Ja ? Qf : e % ec === Jf ? ep(e) : nc(e);
}
const $t = (e, t) => (se(e, t) & ie) === ie, np = [
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
function rp(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = np.reduce((r, i) => (r[i] = "function", r), t);
  if (fn(e, n), Ar(e.BYTES, "BYTES"), Ar(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= ie)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function ip(e, t, n) {
  const r = e;
  if (n < ye)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === ye)
    return r.ONE;
  if (n === ie)
    return t;
  let i = r.ONE, o = t;
  for (; n > ye; )
    n & ie && (i = r.mul(i, o)), o = r.sqr(o), n >>= ie;
  return i;
}
function rc(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, u) => r.is0(c) ? a : (i[u] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, u) => r.is0(c) ? a : (i[u] = r.mul(a, i[u]), r.mul(a, c)), s), i;
}
function Ss(e, t) {
  const n = e, r = (n.ORDER - ie) / Rt, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function op(e, t) {
  if (t !== void 0 && Ga(t), e <= ye)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = so(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const ks = /* @__PURE__ */ new WeakMap();
class ic {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = ye;
  ONE = ie;
  _lengths;
  _mod;
  constructor(t, n = {}) {
    if (t <= ie)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: n.sqrt, enumerable: !0 }), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = Object.freeze(n.allowedLengths.slice())), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: i, nByteLength: o } = op(t, r);
    if (o > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = i, this.BYTES = o, Object.freeze(this);
  }
  create(t) {
    return se(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof t);
    return ye <= t && t < this.ORDER;
  }
  is0(t) {
    return t === ye;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & ie) === ie;
  }
  neg(t) {
    return se(-t, this.ORDER);
  }
  eql(t, n) {
    return t === n;
  }
  sqr(t) {
    return se(t * t, this.ORDER);
  }
  add(t, n) {
    return se(t + n, this.ORDER);
  }
  sub(t, n) {
    return se(t - n, this.ORDER);
  }
  mul(t, n) {
    return se(t * n, this.ORDER);
  }
  pow(t, n) {
    return ip(this, t, n);
  }
  div(t, n) {
    return se(t * Es(n, this.ORDER), this.ORDER);
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
    return Es(t, this.ORDER);
  }
  sqrt(t) {
    let n = ks.get(this);
    return n || ks.set(this, n = tp(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? Za(t, this.BYTES) : oo(t, this.BYTES);
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
    let c = o ? on(t) : Gn(t);
    if (a && (c = se(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return rc(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return _t(r, "condition"), r ? n : t;
  }
}
Object.freeze(ic.prototype);
function Vr(e, t = {}) {
  return new ic(e, t);
}
function oc(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= ie)
    throw new Error("field order must be greater than 1");
  const t = so(e - ie);
  return Math.ceil(t / 8);
}
function sc(e) {
  const t = oc(e);
  return t + Math.ceil(t / 2);
}
function ac(e, t, n = !1) {
  q(e);
  const r = e.length, i = oc(t), o = Math.max(sc(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? on(e) : Gn(e), a = se(s, t - ie) + ie;
  return n ? Za(a, i) : oo(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const sn = /* @__PURE__ */ BigInt(0), Ct = /* @__PURE__ */ BigInt(1);
function Ir(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function $n(e, t) {
  const n = rc(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function cc(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function li(e, t) {
  cc(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = ao(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function As(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += Ct);
  const u = t * r, l = u + Math.abs(a) - 1, d = a === 0, h = a < 0, f = t % 2 !== 0;
  return { nextN: c, offset: l, isZero: d, isNeg: h, isNegF: f, offsetF: u };
}
const di = /* @__PURE__ */ new WeakMap(), uc = /* @__PURE__ */ new WeakMap();
function fi(e) {
  return uc.get(e) || 1;
}
function _s(e) {
  if (e !== sn)
    throw new Error("invalid wNAF");
}
class lc {
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
    for (; n > sn; )
      n & Ct && (r = r.add(i)), i = i.double(), n >>= Ct;
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
    const { windows: r, windowSize: i } = li(n, this.bits), o = [];
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
    const s = li(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: u, isZero: l, isNeg: d, isNegF: h, offsetF: f } = As(r, a, s);
      r = c, l ? o = o.add(Ir(h, n[f])) : i = i.add(Ir(d, n[u]));
    }
    return _s(r), { p: i, f: o };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = li(t, this.bits);
    for (let s = 0; s < o.windows && r !== sn; s++) {
      const { nextN: a, offset: c, isZero: u, isNeg: l } = As(r, s, o);
      if (r = a, !u) {
        const d = n[c];
        i = i.add(l ? d.negate() : d);
      }
    }
    return _s(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = di.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), di.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = fi(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = fi(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    cc(n, this.bits), uc.set(t, n), di.delete(t);
  }
  hasCache(t) {
    return fi(t) !== 1;
  }
}
function sp(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > sn || r > sn; )
    n & Ct && (o = o.add(i)), r & Ct && (s = s.add(i)), i = i.double(), n >>= Ct, r >>= Ct;
  return { p1: o, p2: s };
}
function Is(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return rp(t), t;
  } else
    return Vr(e, { isLE: n });
}
function dc(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const u = t[c];
    if (!(typeof u == "bigint" && u > sn))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = Is(t.p, n.Fp, r), o = Is(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function uo(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const xt = /* @__PURE__ */ BigInt(0), fe = /* @__PURE__ */ BigInt(1), pi = /* @__PURE__ */ BigInt(2), ap = /* @__PURE__ */ BigInt(8);
function cp(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function up(e, t = {}) {
  const n = t, r = dc("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  fn(n, {}, { uvRatio: "function" });
  const c = pi << BigInt(o.BYTES * 8) - fe, u = (g) => i.create(g), l = n.uvRatio === void 0 ? (g, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(g, p)) };
    } catch {
      return { isValid: !1, value: xt };
    }
  } : n.uvRatio;
  if (!cp(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(g, p, y = !1) {
    const x = y ? fe : xt;
    return _r("coordinate " + g, p, x, c), p;
  }
  function h(g) {
    if (!(g instanceof f))
      throw new Error("EdwardsPoint expected");
  }
  class f {
    // base / generator point
    static BASE = new f(s.Gx, s.Gy, fe, u(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new f(xt, fe, fe, xt);
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
      return d("x", y), d("y", x), new f(y, x, fe, u(y * x));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(p, y = !1) {
      const x = i.BYTES, { a: _, d: I } = s;
      p = $i(q(p, x, "point")), _t(y, "zip215");
      const S = $i(p), O = p[x - 1];
      S[x - 1] = O & -129;
      const L = on(S), R = y ? c : i.ORDER;
      _r("point.y", L, xt, R);
      const U = u(L * L), j = u(U - fe), z = u(I * U - _);
      let { isValid: m, value: k } = l(j, z);
      if (!m)
        throw new Error("bad point: invalid y coordinate");
      const A = (k & fe) === fe, v = (O & 128) !== 0;
      if (!y && k === xt && v)
        throw new Error("bad point: x=0 and x_0=1");
      return v !== A && (k = u(-k)), f.fromAffine({ x: k, y: L });
    }
    static fromHex(p, y = !1) {
      return f.fromBytes(Cn(p), y);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, y = !0) {
      return b.createCache(this, p), y || this.multiply(pi), this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this, { a: y, d: x } = s;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X: _, Y: I, Z: S, T: O } = p, L = u(_ * _), R = u(I * I), U = u(S * S), j = u(U * U), z = u(L * y), m = u(U * u(z + R)), k = u(j + u(x * u(L * R)));
      if (m !== k)
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
      const { a: p } = s, { X: y, Y: x, Z: _ } = this, I = u(y * y), S = u(x * x), O = u(pi * u(_ * _)), L = u(p * I), R = y + x, U = u(u(R * R) - I - S), j = L + S, z = j - O, m = L - S, k = u(U * z), A = u(j * m), v = u(U * m), E = u(z * j);
      return new f(k, A, E, v);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      h(p);
      const { a: y, d: x } = s, { X: _, Y: I, Z: S, T: O } = this, { X: L, Y: R, Z: U, T: j } = p, z = u(_ * L), m = u(I * R), k = u(O * x * j), A = u(S * U), v = u((_ + I) * (L + R) - z - m), E = A - k, B = A + k, $ = u(m - y * z), P = u(v * E), T = u(B * $), C = u(v * $), N = u(E * B);
      return new f(P, T, N, C);
    }
    subtract(p) {
      return h(p), this.add(p.negate());
    }
    // Constant-time multiplication.
    multiply(p) {
      if (!o.isValidNot0(p))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p: y, f: x } = b.cached(this, p, (_) => $n(f, _));
      return $n(f, [y, x])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(p) {
      if (!o.isValid(p))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      return p === xt ? f.ZERO : this.is0() || p === fe ? this : b.unsafe(this, p, (y) => $n(f, y));
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
      x == null && (x = O ? ap : i.inv(S));
      const L = u(_ * x), R = u(I * x), U = i.mul(S, x);
      if (O)
        return { x: xt, y: fe };
      if (U !== fe)
        throw new Error("invZ was invalid");
      return { x: L, y: R };
    }
    clearCofactor() {
      return a === fe ? this : this.multiplyUnsafe(a);
    }
    toBytes() {
      const { x: p, y } = this.toAffine(), x = i.toBytes(y);
      return x[x.length - 1] |= p & fe ? 128 : 0, x;
    }
    toHex() {
      return Y(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const b = new lc(f, o.BITS);
  return o.BITS >= 8 && f.BASE.precompute(8), Object.freeze(f.prototype), Object.freeze(f), f;
}
class lp {
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
    vs();
  }
  static fromHex(t) {
    vs();
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
    return Y(this.toBytes());
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
function dp(e, t, n = {}) {
  if (typeof t != "function")
    throw new Error('"hash" function param is required');
  const r = t, i = n;
  fn(i, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function"
  });
  const { prehash: o } = i, { BASE: s, Fp: a, Fn: c } = e, u = r.outputLen, l = 2 * a.BYTES;
  if (u !== void 0 && (Ar(u, "hash.outputLen"), u !== l))
    throw new Error(`hash.outputLen must be ${l}, got ${u}`);
  const d = i.randomBytes === void 0 ? ro : i.randomBytes, h = i.adjustScalarBytes === void 0 ? (m) => m : i.adjustScalarBytes, f = i.domain === void 0 ? (m, k, A) => {
    if (_t(A, "phflag"), k.length || A)
      throw new Error("Contexts/pre-hash are not supported");
    return m;
  } : i.domain;
  function b(m) {
    return c.create(on(m));
  }
  function g(m) {
    const k = L.secretKey;
    q(m, L.secretKey, "secretKey");
    const A = q(r(m), 2 * k, "hashedSecretKey"), v = h(A.slice(0, k)), E = A.slice(k, 2 * k), B = b(v);
    return { head: v, prefix: E, scalar: B };
  }
  function p(m) {
    const { head: k, prefix: A, scalar: v } = g(m), E = s.multiply(v), B = E.toBytes();
    return { head: k, prefix: A, scalar: v, point: E, pointBytes: B };
  }
  function y(m) {
    return p(m).pointBytes;
  }
  function x(m = Uint8Array.of(), ...k) {
    const A = Be(...k);
    return b(r(f(A, q(m, void 0, "context"), !!o)));
  }
  function _(m, k, A = {}) {
    m = q(m, void 0, "message"), o && (m = o(m));
    const { prefix: v, scalar: E, pointBytes: B } = p(k), $ = x(A.context, v, m), P = s.multiply($).toBytes(), T = x(A.context, P, B, m), C = c.create($ + T * E);
    if (!c.isValid(C))
      throw new Error("sign failed: invalid s");
    const N = Be(P, c.toBytes(C));
    return q(N, L.signature, "result");
  }
  const I = {
    zip215: i.zip215
  };
  function S(m, k, A, v = I) {
    const { context: E } = v, B = v.zip215 === void 0 ? !!I.zip215 : v.zip215, $ = L.signature;
    m = q(m, $, "signature"), k = q(k, void 0, "message"), A = q(A, L.publicKey, "publicKey"), B !== void 0 && _t(B, "zip215"), o && (k = o(k));
    const P = $ / 2, T = m.subarray(0, P), C = on(m.subarray(P, $));
    let N, G, H;
    try {
      N = e.fromBytes(A, B), G = e.fromBytes(T, B), H = s.multiplyUnsafe(C);
    } catch {
      return !1;
    }
    if (!B && N.isSmallOrder())
      return !1;
    const Q = x(E, T, A, k);
    return G.add(N.multiplyUnsafe(Q)).subtract(H).clearCofactor().is0();
  }
  const O = a.BYTES, L = {
    secretKey: O,
    publicKey: O,
    signature: 2 * O,
    seed: O
  };
  function R(m) {
    return m = m === void 0 ? d(L.seed) : m, q(m, L.seed, "seed");
  }
  function U(m) {
    return no(m) && m.length === L.secretKey;
  }
  function j(m, k) {
    try {
      return !!e.fromBytes(m, k === void 0 ? I.zip215 : k);
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
    toMontgomery(m) {
      const { y: k } = e.fromBytes(m), A = L.publicKey, v = A === 32;
      if (!v && A !== 57)
        throw new Error("only defined for 25519 and 448");
      const E = v ? a.div(fe + k, fe - k) : a.div(k - fe, k + fe);
      return a.toBytes(E);
    },
    toMontgomerySecret(m) {
      const k = L.secretKey;
      q(m, k);
      const A = r(m.subarray(0, k));
      return h(A).subarray(0, k);
    }
  };
  return Object.freeze(L), Object.freeze(z), Object.freeze({
    keygen: uo(R, y),
    getPublicKey: y,
    sign: _,
    verify: S,
    utils: z,
    Point: e,
    lengths: L
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const fp = /* @__PURE__ */ BigInt(0), On = /* @__PURE__ */ BigInt(1), Bs = /* @__PURE__ */ BigInt(2), pp = /* @__PURE__ */ BigInt(5), hp = /* @__PURE__ */ BigInt(8), zn = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), fc = {
  p: zn,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: hp,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function yp(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = zn, a = e * e % o * e % o, c = ne(a, Bs, o) * a % o, u = ne(c, On, o) * e % o, l = ne(u, pp, o) * u % o, d = ne(l, t, o) * l % o, h = ne(d, n, o) * d % o, f = ne(h, r, o) * h % o, b = ne(f, i, o) * f % o, g = ne(b, i, o) * f % o, p = ne(g, t, o) * l % o;
  return { pow_p_5_8: ne(p, Bs, o) * e % o, b2: a };
}
function gp(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Oi = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function pc(e, t) {
  const n = zn, r = se(t * t * t, n), i = se(r * r * t, n), o = yp(e * i).pow_p_5_8;
  let s = se(e * r * o, n);
  const a = se(t * s * s, n), c = s, u = se(s * Oi, n), l = a === e, d = a === se(-e, n), h = a === se(-e * Oi, n);
  return l && (s = c), (d || h) && (s = u), $t(s, n) && (s = se(-s, n)), { isValid: l || d, value: s };
}
const zt = /* @__PURE__ */ up(fc, { uvRatio: pc }), Ot = zt.Fp, bp = zt.Fn;
function mp(e) {
  return dp(zt, qf, Object.assign({ adjustScalarBytes: gp, zip215: !0 }, e));
}
const wp = /* @__PURE__ */ mp({}), Ps = Oi, xp = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), $s = (e) => pc(On, e), vp = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), Ep = (e) => Ot.create(on(e) & vp);
class Ae extends lp {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new Ae(zt.BASE);
  // prettier-ignore
  static ZERO = new Ae(zt.ZERO);
  // prettier-ignore
  static Fp = Ot;
  // prettier-ignore
  static Fn = bp;
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
    return new Ae(zt.fromAffine(t));
  }
  assertSame(t) {
    if (!(t instanceof Ae))
      throw new Error("RistrettoPoint expected");
  }
  init(t) {
    return new Ae(t);
  }
  static fromBytes(t) {
    Ye(t, 32);
    const { a: n, d: r } = fc, i = zn, o = (I) => Ot.create(I), s = Ep(t);
    if (!Gf(Ot.toBytes(s), t) || $t(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(On + n * a), u = o(On - n * a), l = o(c * c), d = o(u * u), h = o(n * r * l - d), { isValid: f, value: b } = $s(o(h * d)), g = o(b * u), p = o(b * g * h);
    let y = o((s + s) * g);
    $t(y, i) && (y = o(-y));
    const x = o(c * p), _ = o(y * x);
    if (!f || $t(_, i) || x === fp)
      throw new Error("invalid ristretto255 encoding 2");
    return new Ae(new zt(y, x, On, _));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return Ae.fromBytes(Qi(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = zn, s = (p) => Ot.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), u = s(c * c), { value: l } = $s(s(a * u)), d = s(l * a), h = s(l * c), f = s(d * h * i);
    let b;
    if ($t(i * f, o)) {
      let p = s(n * Ps), y = s(t * Ps);
      t = p, n = y, b = s(d * xp);
    } else
      b = h;
    $t(t * f, o) && (n = s(-n));
    let g = s((r - n) * b);
    return $t(g, o) && (g = s(-g)), Ot.toBytes(g);
  }
  /**
   * Compares two Ristretto points.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
   */
  equals(t) {
    this.assertSame(t);
    const { X: n, Y: r } = this.ep, { X: i, Y: o } = t.ep, s = (u) => Ot.create(u), a = s(n * o) === s(r * i), c = s(r * o) === s(n * i);
    return a || c;
  }
  is0() {
    return this.equals(Ae.ZERO);
  }
}
Object.freeze(Ae.BASE);
Object.freeze(Ae.ZERO);
Object.freeze(Ae.prototype);
Object.freeze(Ae);
class Os {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (Ka(t), Ye(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Je(i);
  }
  update(t) {
    return rn(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    rn(this), Yi(t, this), this.finished = !0;
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
const Sp = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new Os(t, n).update(r).digest());
  return e.create = (t, n) => new Os(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Ts = (e, t) => (e + (e >= 0 ? t : -t) / hc) / t;
function kp(e, t, n) {
  _r("scalar", e, qe, n);
  const [[r, i], [o, s]] = t, a = Ts(s * e, n), c = Ts(-i * e, n);
  let u = e - a * r - c * o, l = -a * i - c * s;
  const d = u < qe, h = l < qe;
  d && (u = -u), h && (l = -l);
  const f = ao(Math.ceil(so(n) / 2)) + St;
  if (u < qe || u >= f || l < qe || l >= f)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: u, k2neg: h, k2: l };
}
function Ti(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function hi(e, t) {
  fn(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return _t(n.lowS, "lowS"), _t(n.prehash, "prehash"), n.format !== void 0 && Ti(n.format), n;
}
class Ap extends Error {
  constructor(t = "") {
    super(t);
  }
}
const Te = {
  // asn.1 DER encoding utils
  Err: Ap,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = Te;
      if (Ar(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = or(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? or(i.length / 2 | 128) : "";
      return or(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = Te;
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
      const { Err: t } = Te;
      if (io(e), e < qe)
        throw new t("integer: negative integers are not allowed");
      let n = or(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = Te;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Gn(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = Te, i = q(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: u, l } = r.decode(2, c);
    if (l.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(u) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = Te, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
};
Object.freeze(Te._tlv);
Object.freeze(Te._int);
Object.freeze(Te);
const qe = /* @__PURE__ */ BigInt(0), St = /* @__PURE__ */ BigInt(1), hc = /* @__PURE__ */ BigInt(2), sr = /* @__PURE__ */ BigInt(3), _p = /* @__PURE__ */ BigInt(4);
function Ip(e, t = {}) {
  const n = dc("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  fn(t, {}, {
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
  const l = gc(r, i);
  function d() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function h(z, m, k) {
    if (u && m.is0())
      return Uint8Array.of(0);
    const { x: A, y: v } = m.toAffine(), E = r.toBytes(A);
    if (_t(k, "isCompressed"), k) {
      d();
      const B = !r.isOdd(v);
      return Be(yc(B), E);
    } else
      return Be(Uint8Array.of(4), E, r.toBytes(v));
  }
  function f(z) {
    q(z, void 0, "Point");
    const { publicKey: m, publicKeyUncompressed: k } = l, A = z.length, v = z[0], E = z.subarray(1);
    if (u && A === 1 && v === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (A === m && (v === 2 || v === 3)) {
      const B = r.fromBytes(E);
      if (!r.isValid(B))
        throw new Error("bad point: is not on curve, wrong x");
      const $ = p(B);
      let P;
      try {
        P = r.sqrt($);
      } catch (N) {
        const G = N instanceof Error ? ": " + N.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + G);
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
      throw new Error(`bad point: got length ${A}, expected compressed=${m} or uncompressed=${k}`);
  }
  const b = t.toBytes === void 0 ? h : t.toBytes, g = t.fromBytes === void 0 ? f : t.fromBytes;
  function p(z) {
    const m = r.sqr(z), k = r.mul(m, z);
    return r.add(r.add(k, r.mul(z, o.a)), o.b);
  }
  function y(z, m) {
    const k = r.sqr(m), A = p(z);
    return r.eql(k, A);
  }
  if (!y(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const x = r.mul(r.pow(o.a, sr), _p), _ = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(x, _)))
    throw new Error("bad curve params: a or b");
  function I(z, m, k = !1) {
    if (!r.isValid(m) || k && r.is0(m))
      throw new Error(`bad point coordinate ${z}`);
    return m;
  }
  function S(z) {
    if (!(z instanceof R))
      throw new Error("Weierstrass Point expected");
  }
  function O(z) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return kp(z, c.basises, i.ORDER);
  }
  function L(z, m, k, A, v) {
    return k = new R(r.mul(k.X, z), k.Y, k.Z), m = Ir(A, m), k = Ir(v, k), m.add(k);
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
    constructor(m, k, A) {
      this.X = I("x", m), this.Y = I("y", k, !0), this.Z = I("z", A), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(m) {
      const { x: k, y: A } = m || {};
      if (!m || !r.isValid(k) || !r.isValid(A))
        throw new Error("invalid affine point");
      if (m instanceof R)
        throw new Error("projective point not allowed");
      return r.is0(k) && r.is0(A) ? R.ZERO : new R(k, A, r.ONE);
    }
    static fromBytes(m) {
      const k = R.fromAffine(g(q(m, void 0, "point")));
      return k.assertValidity(), k;
    }
    static fromHex(m) {
      return R.fromBytes(Cn(m));
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
    precompute(m = 8, k = !0) {
      return j.createCache(this, m), k || this.multiply(sr), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const m = this;
      if (m.is0()) {
        if (t.allowInfinityPoint && r.is0(m.X) && r.eql(m.Y, r.ONE) && r.is0(m.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x: k, y: A } = m.toAffine();
      if (!r.isValid(k) || !r.isValid(A))
        throw new Error("bad point: x or y not field elements");
      if (!y(k, A))
        throw new Error("bad point: equation left != right");
      if (!m.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y: m } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(m);
    }
    /** Compare one point to another. */
    equals(m) {
      S(m);
      const { X: k, Y: A, Z: v } = this, { X: E, Y: B, Z: $ } = m, P = r.eql(r.mul(k, $), r.mul(E, v)), T = r.eql(r.mul(A, $), r.mul(B, v));
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
      const { a: m, b: k } = o, A = r.mul(k, sr), { X: v, Y: E, Z: B } = this;
      let $ = r.ZERO, P = r.ZERO, T = r.ZERO, C = r.mul(v, v), N = r.mul(E, E), G = r.mul(B, B), H = r.mul(v, E);
      return H = r.add(H, H), T = r.mul(v, B), T = r.add(T, T), $ = r.mul(m, T), P = r.mul(A, G), P = r.add($, P), $ = r.sub(N, P), P = r.add(N, P), P = r.mul($, P), $ = r.mul(H, $), T = r.mul(A, T), G = r.mul(m, G), H = r.sub(C, G), H = r.mul(m, H), H = r.add(H, T), T = r.add(C, C), C = r.add(T, C), C = r.add(C, G), C = r.mul(C, H), P = r.add(P, C), G = r.mul(E, B), G = r.add(G, G), C = r.mul(G, H), $ = r.sub($, C), T = r.mul(G, N), T = r.add(T, T), T = r.add(T, T), new R($, P, T);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(m) {
      S(m);
      const { X: k, Y: A, Z: v } = this, { X: E, Y: B, Z: $ } = m;
      let P = r.ZERO, T = r.ZERO, C = r.ZERO;
      const N = o.a, G = r.mul(o.b, sr);
      let H = r.mul(k, E), Q = r.mul(A, B), ee = r.mul(v, $), te = r.add(k, A), X = r.add(E, B);
      te = r.mul(te, X), X = r.add(H, Q), te = r.sub(te, X), X = r.add(k, v);
      let pe = r.add(E, $);
      return X = r.mul(X, pe), pe = r.add(H, ee), X = r.sub(X, pe), pe = r.add(A, v), P = r.add(B, $), pe = r.mul(pe, P), P = r.add(Q, ee), pe = r.sub(pe, P), C = r.mul(N, X), P = r.mul(G, ee), C = r.add(P, C), P = r.sub(Q, C), C = r.add(Q, C), T = r.mul(P, C), Q = r.add(H, H), Q = r.add(Q, H), ee = r.mul(N, ee), X = r.mul(G, X), Q = r.add(Q, ee), ee = r.sub(H, ee), ee = r.mul(N, ee), X = r.add(X, ee), H = r.mul(Q, X), T = r.add(T, H), H = r.mul(pe, X), P = r.mul(te, P), P = r.sub(P, H), H = r.mul(te, Q), C = r.mul(pe, C), C = r.add(C, H), new R(P, T, C);
    }
    subtract(m) {
      return S(m), this.add(m.negate());
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
    multiply(m) {
      const { endo: k } = t;
      if (!i.isValidNot0(m))
        throw new RangeError("invalid scalar: out of range");
      let A, v;
      const E = (B) => j.cached(this, B, ($) => $n(R, $));
      if (k) {
        const { k1neg: B, k1: $, k2neg: P, k2: T } = O(m), { p: C, f: N } = E($), { p: G, f: H } = E(T);
        v = N.add(H), A = L(k.beta, C, G, B, P);
      } else {
        const { p: B, f: $ } = E(m);
        A = B, v = $;
      }
      return $n(R, [A, v])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(m) {
      const { endo: k } = t, A = this, v = m;
      if (!i.isValid(v))
        throw new RangeError("invalid scalar: out of range");
      if (v === qe || A.is0())
        return R.ZERO;
      if (v === St)
        return A;
      if (j.hasCache(this))
        return this.multiply(v);
      if (k) {
        const { k1neg: E, k1: B, k2neg: $, k2: P } = O(v), { p1: T, p2: C } = sp(R, A, B, P);
        return L(k.beta, T, C, E, $);
      } else
        return j.unsafe(A, v);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(m) {
      const k = this;
      let A = m;
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
      const { isTorsionFree: m } = t;
      return s === St ? !0 : m ? m(R, this) : j.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: m } = t;
      return s === St ? this : m ? m(R, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === St ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(m = !0) {
      return _t(m, "isCompressed"), this.assertValidity(), b(R, this, m);
    }
    toHex(m = !0) {
      return Y(this.toBytes(m));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const U = i.BITS, j = new lc(R, t.endo ? Math.ceil(U / 2) : U);
  return U >= 8 && R.BASE.precompute(8), Object.freeze(R.prototype), Object.freeze(R), R;
}
function yc(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function gc(e, t) {
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
function Bp(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? ro : t.randomBytes, i = Object.assign(gc(e.Fp, n), {
    seed: Math.max(sc(n.ORDER), 16)
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
    return f = f === void 0 ? r(i.seed) : f, ac(q(f, i.seed, "seed"), n.ORDER);
  }
  function c(f, b = !0) {
    return e.BASE.multiply(n.fromBytes(f)).toBytes(b);
  }
  function u(f) {
    const { secretKey: b, publicKey: g, publicKeyUncompressed: p } = i, y = n._lengths;
    if (!no(f))
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
  }, h = uo(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: l, keygen: h, Point: e, utils: d, lengths: i });
}
function Pp(e, t, n = {}) {
  const r = t;
  Ka(r), fn(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? ro : n.randomBytes, o = n.hmac === void 0 ? (v, E) => Sp(r, v, E) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: u } = a, { keygen: l, getPublicKey: d, getSharedSecret: h, utils: f, lengths: b } = Bp(e, n), g = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * hc + St < s.ORDER;
  function y(v) {
    const E = c >> St;
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
    Ti(E);
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
        const { r: N, s: G } = Te.toSig(q(E));
        return new S(N, G);
      }
      B === "recovered" && ($ = E[0], B = "compact", E = E.subarray(1));
      const P = b.signature / 2, T = E.subarray(0, P), C = E.subarray(P, P * 2);
      return new S(a.fromBytes(T), a.fromBytes(C), $);
    }
    static fromHex(E, B) {
      return this.fromBytes(Cn(E), B);
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
      const C = s.toBytes(T), N = e.fromBytes(Be(yc((P & 1) === 0), C)), G = a.inv(T), H = L(q(E, void 0, "msgHash")), Q = a.create(-H * G), ee = a.create($ * G), te = e.BASE.multiplyUnsafe(Q).add(N.multiplyUnsafe(ee));
      if (te.is0())
        throw new Error("invalid recovery: point at infinify");
      return te.assertValidity(), te;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return y(this.s);
    }
    toBytes(E = g.format) {
      if (Ti(E), E === "der")
        return Cn(Te.hexFromSig(this));
      const { r: B, s: $ } = this, P = a.toBytes(B), T = a.toBytes($);
      return E === "recovered" ? (_(), Be(Uint8Array.of(this.assertRecovery()), P, T)) : Be(P, T);
    }
    toHex(E) {
      return Y(this.toBytes(E));
    }
  }
  Object.freeze(S.prototype), Object.freeze(S);
  const O = n.bits2int === void 0 ? function(E) {
    if (E.length > 8192)
      throw new Error("input is too large");
    const B = Gn(E), $ = E.length * 8 - u;
    return $ > 0 ? B >> BigInt($) : B;
  } : n.bits2int, L = n.bits2int_modN === void 0 ? function(E) {
    return a.create(O(E));
  } : n.bits2int_modN, R = ao(u);
  function U(v) {
    return _r("num < 2^" + u, v, qe, R), a.toBytes(v);
  }
  function j(v, E) {
    return q(v, void 0, "message"), E ? q(r(v), void 0, "prehashed message") : v;
  }
  function z(v, E, B) {
    const { lowS: $, prehash: P, extraEntropy: T } = hi(B, g);
    v = j(v, P);
    const C = L(v), N = a.fromBytes(E);
    if (!a.isValidNot0(N))
      throw new Error("invalid private key");
    const G = [U(N), U(C)];
    if (T != null && T !== !1) {
      const te = T === !0 ? i(b.secretKey) : T;
      G.push(q(te, void 0, "extraEntropy"));
    }
    const H = Be(...G), Q = C;
    function ee(te) {
      const X = O(te);
      if (!a.isValidNot0(X))
        return;
      const pe = a.inv(X), tt = e.BASE.multiply(X).toAffine(), Pt = a.create(tt.x);
      if (Pt === qe)
        return;
      const jt = a.create(pe * a.create(Q + Pt * N));
      if (jt === qe)
        return;
      let gn = (tt.x === Pt ? 0 : 2) | Number(tt.y & St), bn = jt;
      return $ && y(jt) && (bn = a.neg(jt), gn ^= 1), new S(Pt, bn, p ? void 0 : gn);
    }
    return { seed: H, k2sig: ee };
  }
  function m(v, E, B = {}) {
    const { seed: $, k2sig: P } = z(v, E, B);
    return Xf(r.outputLen, a.BYTES, o)($, P).toBytes(B.format);
  }
  function k(v, E, B, $ = {}) {
    const { lowS: P, prehash: T, format: C } = hi($, g);
    if (B = q(B, void 0, "publicKey"), E = j(E, T), !no(v)) {
      const N = v instanceof S ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + N);
    }
    I(v, C);
    try {
      const N = S.fromBytes(v, C), G = e.fromBytes(B);
      if (P && N.hasHighS())
        return !1;
      const { r: H, s: Q } = N, ee = L(E), te = a.inv(Q), X = a.create(ee * te), pe = a.create(H * te), tt = e.BASE.multiplyUnsafe(X).add(G.multiplyUnsafe(pe));
      return tt.is0() ? !1 : a.create(tt.x) === H;
    } catch {
      return !1;
    }
  }
  function A(v, E, B = {}) {
    const { prehash: $ } = hi(B, g);
    return E = j(E, $), S.fromBytes(v, "recovered").recoverPublicKey(E).toBytes();
  }
  return Object.freeze({
    keygen: l,
    getPublicKey: d,
    getSharedSecret: h,
    utils: f,
    lengths: b,
    Point: e,
    sign: m,
    verify: k,
    recoverPublicKey: A,
    Signature: S,
    hash: r
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const qr = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, $p = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Op = /* @__PURE__ */ BigInt(0), Li = /* @__PURE__ */ BigInt(2);
function Tp(e) {
  const t = qr.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), u = e * e * e % t, l = u * u * e % t, d = ne(l, n, t) * l % t, h = ne(d, n, t) * l % t, f = ne(h, Li, t) * u % t, b = ne(f, i, t) * f % t, g = ne(b, o, t) * b % t, p = ne(g, a, t) * g % t, y = ne(p, c, t) * p % t, x = ne(y, a, t) * g % t, _ = ne(x, n, t) * l % t, I = ne(_, s, t) * b % t, S = ne(I, r, t) * u % t, O = ne(S, Li, t);
  if (!Br.eql(Br.sqr(O), e))
    throw new Error("Cannot find square root");
  return O;
}
const Br = Vr(qr.p, { sqrt: Tp }), Ft = /* @__PURE__ */ Ip(qr, {
  Fp: Br,
  endo: $p
}), Ee = /* @__PURE__ */ Pp(Ft, ae), Ls = {};
function Pr(e, ...t) {
  let n = Ls[e];
  if (n === void 0) {
    const r = ae(Wf(e));
    n = Be(r, r), Ls[e] = n;
  }
  return ae(Be(n, ...t));
}
const Gr = (e) => e.toBytes(!0).slice(1), Wr = (e) => e % Li === Op;
function bc(e) {
  const { Fn: t, BASE: n } = Ft, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: Wr(i.y) ? r : t.neg(r), bytes: Gr(i) };
}
function mc(e) {
  const t = Br;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  Wr(i) || (i = t.neg(i));
  const o = Ft.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const en = Gn;
function wc(...e) {
  return Ft.Fn.create(en(Pr("BIP0340/challenge", ...e)));
}
function Rs(e) {
  return bc(e).bytes;
}
function Lp(e, t, n = eo(32)) {
  const { Fn: r, BASE: i } = Ft, o = q(e, void 0, "message"), { bytes: s, scalar: a } = bc(t), c = q(n, 32, "auxRand"), u = r.toBytes(a ^ en(Pr("BIP0340/aux", c))), l = Pr("BIP0340/nonce", u, s, o), d = r.create(en(l));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const h = i.multiply(d), f = Wr(h.y) ? d : r.neg(d), b = Gr(h), g = wc(b, s, o), p = new Uint8Array(64);
  if (p.set(b, 0), p.set(r.toBytes(r.create(f + g * a)), 32), !xc(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function xc(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = Ft, s = q(e, 64, "signature"), a = q(t, void 0, "message"), c = q(n, 32, "publicKey");
  try {
    const u = mc(en(c)), l = en(s.subarray(0, 32));
    if (!r.isValidNot0(l))
      return !1;
    const d = en(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const h = wc(i.toBytes(l), Gr(u), a), f = o.multiplyUnsafe(d).add(u.multiplyUnsafe(i.neg(h))), { x: b, y: g } = f.toAffine();
    return !(f.is0() || !Wr(g) || b !== l);
  } catch {
    return !1;
  }
}
const Tt = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? eo(48) : r, ac(r, qr.n));
  return Object.freeze({
    keygen: uo(n, Rs),
    getPublicKey: Rs,
    sign: Lp,
    verify: xc,
    Point: Ft,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: Pr,
      lift_x: mc,
      pointToBytes: Gr
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), Rp = /* @__PURE__ */ Uint8Array.from([
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
]), vc = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Cp = vc.map((e) => (9 * e + 5) % 16), Ec = /* @__PURE__ */ (() => {
  const n = [[vc], [Cp]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Rp[o]));
  return n;
})(), Sc = Ec[0], kc = Ec[1], Ac = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), zp = /* @__PURE__ */ Sc.map((e, t) => e.map((n) => Ac[t][n])), Up = /* @__PURE__ */ kc.map((e, t) => e.map((n) => Ac[t][n])), Np = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Hp = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Cs(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const ar = /* @__PURE__ */ new Uint32Array(16);
class Mp extends to {
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
      ar[f] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, u = this.h3 | 0, l = u, d = this.h4 | 0, h = d;
    for (let f = 0; f < 5; f++) {
      const b = 4 - f, g = Np[f], p = Hp[f], y = Sc[f], x = kc[f], _ = zp[f], I = Up[f];
      for (let S = 0; S < 16; S++) {
        const O = tr(r + Cs(f, o, a, u) + ar[y[S]] + g, _[S]) + d | 0;
        r = d, d = u, u = tr(a, 10) | 0, a = o, o = O;
      }
      for (let S = 0; S < 16; S++) {
        const O = tr(i + Cs(b, s, c, l) + ar[x[S]] + p, I[S]) + h | 0;
        i = h, h = l, l = tr(c, 10) | 0, c = s, s = O;
      }
    }
    this.set(this.h1 + a + l | 0, this.h2 + u + h | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    Je(ar);
  }
  destroy() {
    this.destroyed = !0, Je(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const _c = /* @__PURE__ */ jr(() => new Mp()), Fp = BigInt(0), wn = BigInt(1), Kp = BigInt(2), Dp = BigInt(7), jp = BigInt(256), Vp = BigInt(113), Ic = [], Bc = [], Pc = [];
for (let e = 0, t = wn, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Ic.push(2 * (5 * r + n)), Bc.push((e + 1) * (e + 2) / 2 % 64);
  let i = Fp;
  for (let o = 0; o < 7; o++)
    t = (t << wn ^ (t >> Dp) * Vp) % jp, t & Kp && (i ^= wn << (wn << BigInt(o)) - wn);
  Pc.push(i);
}
const $c = Va(Pc, !0), qp = $c[0], Gp = $c[1], zs = (e, t, n) => n > 32 ? Of(e, t, n) : Pf(e, t, n), Us = (e, t, n) => n > 32 ? Tf(e, t, n) : $f(e, t, n);
function Wp(e, t = 24) {
  if (Xe(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = zs(u, l, 1) ^ n[a], h = Us(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Bc[s], c = zs(i, o, a), u = Us(i, o, a), l = Ic[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], u = e[s + 2], l = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & u, e[s + 9] ^= ~c & l;
    }
    e[0] ^= qp[r], e[1] ^= Gp[r];
  }
  Je(n);
}
let Zp = class Oc {
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
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, Xe(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = xf(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    gs(this.state32), Wp(this.state32, this.rounds), gs(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    rn(this), Ye(t);
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
    rn(this, !1), Ye(t), this.finish();
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
    return Xe(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Yi(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, Je(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new Oc(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const Xp = (e, t, n, r = {}) => jr(() => new Zp(t, e, n), r), Tc = /* @__PURE__ */ Xp(1, 136, 32), Yp = "hpke-x25519-hkdfsha256-aes256gcm-v1", Jp = "avault:blind-box:v1", Qp = "avault:blind-box:aad:v1", $r = "machine-aesgcm-v1", Zr = 1, Xr = "ecdsa-secp256k1-recoverable", lo = "ecdsa-secp256k1-der", fo = "schnorr-secp256k1-bip340", Un = "schnorr-secp256k1-bip341-keypath", le = 32, Or = 12, Yr = 32, eh = "avault:protected-vmk:kek-passkey:v1", th = /^[A-Za-z_][A-Za-z0-9_]*$/, nh = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, rh = "avault:protected-root-meta:v1", ih = new TextEncoder(), oh = new TextDecoder();
function po(e) {
  switch (e) {
    case Xr:
    case lo:
    case fo:
    case Un:
      return e;
    default:
      throw new Error("unsupported signing scheme");
  }
}
function oe(e, t = "bytes") {
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
function _e(e) {
  const t = oe(e), n = new ArrayBuffer(t.byteLength);
  return new Uint8Array(n).set(t), t.fill(0), n;
}
function me(e) {
  return ih.encode(e);
}
function Tr(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Tr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Tr(t[n])}`).join(",")}}`;
}
function Ht(e) {
  const t = new Uint8Array(e);
  return crypto.getRandomValues(t), t;
}
function J(e) {
  const t = oe(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return t.fill(0), btoa(n);
}
function de(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Uint8Array.from(atob(n), (r) => r.charCodeAt(0));
}
function Ge(e) {
  return Cn(e.startsWith("0x") ? e.slice(2) : e);
}
function Ns(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? Ge(e) : de(e);
}
function sh(e) {
  return Y(oe(e));
}
function Lc(e, t = "bytes") {
  return oe(e, t);
}
function ge(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function Ce(e) {
  e && new Uint8Array(e).fill(0);
}
async function Lr(e, t, n, r) {
  let i, o, s, a;
  try {
    i = _e(e), o = _e(t), s = _e(n), a = r ? _e(r) : void 0;
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
    Ce(i), Ce(o), Ce(s), Ce(a);
  }
}
async function Jr(e, t, n, r) {
  let i, o, s, a;
  try {
    i = _e(e), o = _e(t), s = _e(n), a = r ? _e(r) : void 0;
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
    Ce(i), Ce(o), Ce(s), Ce(a);
  }
}
async function ah(e, t, n, r) {
  let i, o, s;
  try {
    i = _e(e), o = _e(t), s = _e(n);
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
    Ce(i), Ce(o), Ce(s);
  }
}
async function Rc(e, t) {
  const n = oe(e, "passkey PRF output");
  try {
    const r = oe(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return ge(r, Yr, "passkey PRF salt"), await ah(n, r, me(eh), le);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function ch() {
  return Ht(le);
}
function uh() {
  return Ht(Yr);
}
function lh(e) {
  const t = oe(e, "passkey PRF salt");
  try {
    return ge(t, Yr, "passkey PRF salt"), { prf: { eval: { first: _e(t) } } };
  } finally {
    t.fill(0);
  }
}
function Qe(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== Zr || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function dh(e, t) {
  const n = oe(e, "VMK"), r = Ht(Or);
  let i, o;
  try {
    ge(n, le, "VMK"), o = oe(t.prfSalt, "passkey PRF salt"), ge(o, Yr, "passkey PRF salt"), i = await Rc(t.prfOutput, o);
    const s = await Lr(i, r, n);
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
async function fh(e, t) {
  const n = oe(e, "VMK");
  try {
    if (ge(n, le, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await dh(n, i));
    return JSON.stringify({ v: Zr, copies: r });
  } finally {
    n.fill(0);
  }
}
async function ph(e, t) {
  const n = de(e.prf_salt);
  if (t.prfSalt && J(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await Rc(t.prfOutput, n);
  try {
    return await Jr(r, de(e.nonce), de(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function hh(e, t) {
  const n = Qe(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await ph(r, t);
        try {
          return ge(i, le, "VMK"), i;
        } catch (o) {
          throw i.fill(0), o;
        }
      }
    } catch {
    }
  throw new Error("no protected VMK copy could be unwrapped");
}
function ho(e) {
  return Qe(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: de(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function yh(e, t) {
  const n = Qe(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Cc(e) {
  const t = Qe(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function zc(e) {
  if (e.kind) {
    if (e.kind === "static")
      return { kind: "static" };
    if (e.kind === "keypair") {
      if (typeof e.publicKey != "string" || e.publicKey.length === 0)
        throw new Error("keypair protected record requires a public key");
      return { kind: "keypair", public_key: e.publicKey.toLowerCase() };
    }
    throw new Error("unsupported protected record kind");
  }
}
function gh(e) {
  if (e === void 0) return;
  if (typeof e != "object" || e === null)
    throw new Error("protected record metadata is invalid");
  const t = e;
  if (t.kind === "static") return { kind: "static" };
  if (t.kind === "keypair") {
    if (typeof t.public_key != "string" || t.public_key.length === 0)
      throw new Error("keypair protected record metadata is missing public key");
    return { kind: "keypair", public_key: t.public_key.toLowerCase() };
  }
  throw new Error("protected record metadata kind is invalid");
}
function yo(e, t) {
  return {
    name: e,
    ...t ? { kind: t.kind } : {},
    ...t?.public_key ? { publicKey: t.public_key } : {}
  };
}
function go(e) {
  return me(
    Tr({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" ? Dc(e.name) : cn(e.name),
      scheme: e.scheme ?? $r,
      version: e.version ?? Zr,
      record: zc(e) ?? null
    })
  );
}
async function Uc(e, t, n) {
  const r = oe(t, "VMK"), i = Ht(le);
  let o;
  try {
    ge(r, le, "VMK"), o = oe(e, "value");
    const s = go(n), a = Ht(Or), c = await Lr(i, a, o, s), u = Ht(Or), l = await Lr(r, u, i, s);
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
async function Nc(e, t, n) {
  const r = oe(t, "VMK");
  try {
    ge(r, le, "VMK");
    const i = await Jr(
      r,
      de(e.dek_nonce),
      de(e.wrapped_dek),
      go(n)
    );
    try {
      return ge(i, le, "DEK"), i;
    } catch (o) {
      throw i.fill(0), o;
    }
  } finally {
    r.fill(0);
  }
}
async function Hc(e, t, n) {
  const r = await Nc(e, t, n);
  try {
    return await Jr(
      r,
      de(e.nonce),
      de(e.ciphertext),
      go(n)
    );
  } finally {
    r.fill(0);
  }
}
function Mc(e, t, n) {
  const r = Qe(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== $r)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? zc(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: $r,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function an(e) {
  const t = Qe(e.wrap_meta), { dek_nonce: n, wrapped_dek: r, record_meta: i, ...o } = t;
  if (typeof n != "string" || typeof r != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const s = gh(i);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: n, wrapped_dek: r },
    vmkWrapMeta: JSON.stringify(o),
    ...s ? { recordMetadata: s } : {}
  };
}
function Fc(e) {
  const t = { ...Qe(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, me(Tr({ domain: rh, vault: t }));
}
async function bh(e, t, n) {
  const r = Ht(Or), i = me(JSON.stringify(t));
  try {
    const o = await Lr(e, r, i, Fc(n));
    return { v: 1, nonce: J(r), ciphertext: J(o) };
  } finally {
    i.fill(0);
  }
}
async function bo(e, t) {
  const n = Qe(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await Jr(t, de(n.nonce), de(n.ciphertext), Fc(e));
  try {
    const i = JSON.parse(oh.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function mh(e, t) {
  const n = Qe(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function wh() {
  return new uf({
    kem: new wf(),
    kdf: new lf(),
    aead: new jd()
  });
}
function mo(e) {
  return de(typeof e == "string" ? e : e.public_key);
}
async function Kc(e) {
  const t = await crypto.subtle.digest("SHA-256", _e(e));
  return Y(new Uint8Array(t));
}
async function xh(e) {
  return Kc(mo(e));
}
function vh(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function Eh(e) {
  const t = vh(e), n = mo(t);
  if (ge(n, le, "avault public key"), await Kc(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function Sh(e, t, n) {
  const r = wh(), i = mo(t);
  if (ge(i, le, "avault public key"), typeof t != "string" && t.fingerprint && await xh(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? me(e) : oe(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: me(Jp) },
      s,
      Oh(n)
    );
    return {
      scheme: Yp,
      enc: J(new Uint8Array(a.enc)),
      ct: J(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function Dc(e) {
  if (typeof e != "string" || !th.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function cn(e) {
  if (typeof e != "string" || !nh.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function Hs(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function wo(e) {
  const t = typeof e == "string" ? Ge(e) : oe(e, "digest");
  return ge(t, le, "digest"), t;
}
function kh(e) {
  const t = typeof e == "string" ? Ge(e) : oe(e, "private key");
  try {
    if (ge(t, le, "private key"), !Ee.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function Ri(e, t) {
  return typeof e == "string" ? Ge(e) : oe(e, t);
}
function Rr(e) {
  const t = Ri(e, "operation hash");
  return ge(t, le, "operation hash"), t;
}
function Cr(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function jc(e, t) {
  const n = Cr(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function Ah(e) {
  return jc(e, "approval expiry");
}
function Ms(e) {
  const t = oe(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: Cr(e.expiresAtUnix, "approval expiry") };
}
function Ie(e, t) {
  const n = oe(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function _h(e) {
  switch (e.purpose) {
    case "seal":
      return Ih(e.name);
    case "agent-deliver": {
      const t = Ms({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: cn(e.name),
        grantId: Hs(e.grantId, "grant id"),
        ttlSecs: Cr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Rr(e.operationHash)
      };
    }
    case "agent-sign": {
      const t = Ms({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: Dc(e.name),
        grantId: Hs(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: wo(e.digest),
        ttlSecs: Cr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: Rr(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function Ih(e) {
  return { purpose: "seal", name: cn(e) };
}
async function Bh(e) {
  const t = Rr(e.operationHash), n = await $h(e.name, e.ttlSecs);
  if (Y(t) !== Y(n))
    throw new Error("operation hash does not match release operation fields");
}
async function Ph(e) {
  const t = [];
  for (const n of e)
    Ie(t, typeof n == "string" ? me(n) : oe(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function $h(e, t) {
  return Ph(["agent-deliver", cn(e), jc(t, "ttl seconds")]);
}
function Oh(e) {
  const t = _h(e), n = [...me(Qp)];
  return Ie(n, me(t.purpose)), Ie(n, me(t.name)), Ie(n, me($r)), Ie(n, new Uint8Array([Zr])), Ie(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? me(t.grantId) : new Uint8Array()), Ie(n, new Uint8Array()), Ie(n, t.purpose === "agent-sign" ? me(t.signScheme) : new Uint8Array()), Ie(n, t.purpose === "agent-sign" ? wo(t.digest) : new Uint8Array()), Ie(n, t.purpose === "seal" ? new Uint8Array() : oe(t.approvalNonce, "approval nonce")), Ie(n, t.purpose === "seal" ? new Uint8Array() : Ah(t.approvalExpiresAtUnix)), Ie(n, t.purpose === "seal" ? new Uint8Array() : Rr(t.operationHash)), new Uint8Array(n);
}
async function Th(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (cn(r.name) !== cn(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await Bh(i);
  const o = await Eh(n), s = await Nc(e, t, r);
  try {
    return await Sh(s, o, i);
  } finally {
    s.fill(0);
  }
}
function Lh() {
  const e = Ee.utils.randomSecretKey();
  return { privateKey: e, publicKey: Y(Ee.getPublicKey(e, !0)) };
}
function Fs(e) {
  return Ge(e.toString(16).padStart(le * 2, "0"));
}
function Rh(e, t, n, r = {}) {
  if (po(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = kh(e);
  let o;
  try {
    const s = wo(t);
    if (n === Xr) {
      const a = Ee.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: Y(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === lo)
      return {
        scheme: n,
        signature: Y(Ee.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === fo) {
      o = r.schnorrAuxRand !== void 0 ? Ri(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(le)), ge(o, le, "schnorr aux randomness");
      const a = Tt.sign(s, i, o);
      if (!Tt.verify(a, s, Tt.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: Y(a), recovery_id: null };
    }
    if (n === Un) {
      const a = Ee.getPublicKey(i, !0), c = xo(a.slice(1));
      let u = BigInt(`0x${Y(i)}`);
      a[0] === 3 && (u = _n - u);
      const l = BigInt(`0x${Y(Tt.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (l >= _n) throw new Error("invalid taproot tweak");
      let d = (u + l) % _n;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let h = Fs(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = _n - d, h.fill(0), h = Fs(d)), o = r.schnorrAuxRand !== void 0 ? Ri(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(le)), ge(o, le, "schnorr aux randomness");
        const f = Tt.sign(s, h, o);
        if (!Tt.verify(f, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
        return { scheme: n, signature: Y(f), recovery_id: null };
      } finally {
        h.fill(0);
      }
    }
    throw new Error("unsupported signing scheme");
  } finally {
    o?.fill(0), i.fill(0);
  }
}
async function Ch(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  const s = await Hc(e, t, n);
  try {
    if (Y(Ee.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Rh(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function zh(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return wp.verify(Ns(e.signature), me(e.message), Ns(t.publicKey));
}
function Vc(e) {
  const t = Ge(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && Ee.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && Ee.utils.isValidPublicKey(t))
    return Ee.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const Uh = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", Nh = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", Hh = 1, Mh = 734539939, _n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function Fh(e) {
  return _c(ae(e));
}
function Kh(e) {
  const t = ae(ae(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  n.set(e), n.set(t, e.length);
  let r = BigInt(`0x${Y(n)}`), i = "";
  for (; r > 0n; ) {
    const s = Number(r % 58n);
    r /= 58n, i = Uh[s] + i;
  }
  let o = 0;
  for (const s of n) {
    if (s !== 0) break;
    o += 1;
  }
  return "1".repeat(o) + i;
}
function Dh(e) {
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
function jh(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function Vh(e, t, n) {
  const r = jh(e).concat(t), i = Dh(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function qh(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function Ks(e, t, n) {
  const r = t === 0 ? Hh : Mh, i = [t].concat(qh(n, 8, 5));
  return `${e}1${i.concat(Vh(e, i, r)).map((o) => Nh[o]).join("")}`;
}
function Gh(e) {
  const t = e.toLowerCase(), n = Y(Tc(me(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function xo(e) {
  const t = BigInt(`0x${Y(Tt.utils.taggedHash("TapTweak", e))}`);
  if (t >= _n) throw new Error("invalid taproot tweak");
  const n = Ee.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(Ee.Point.BASE.multiply(t));
  if (r.equals(Ee.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function Wh(e) {
  return xo(Vc(e).slice(1)).toBytes(!0).slice(1);
}
function Zh(e) {
  const t = Vc(e), n = Ee.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = Tc(r), o = Fh(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = xo(a);
  return {
    eth: `0x${Gh(Y(i.slice(-20)))}`,
    btc_legacy: Kh(s),
    btc_segwit: Ks("bc", 0, o),
    btc_taproot: Ks("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const vo = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let Ci = { ...vo };
function Xh(e) {
  return e === 300 || e === 600 || e === 1800 ? e : vo.windowSeconds;
}
function Yh(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new w("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function Eo(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new w("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new w("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new w("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: Yh(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function Jh(e) {
  if (typeof e != "object" || e === null) return { ...vo };
  const t = e;
  return {
    windowSeconds: Xh(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function So(e) {
  return Ci = Jh(e), Ci;
}
function xe() {
  return { ...Ci };
}
const Qh = "avibe-vault-lock:v1:", D = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let ut = null, Tn = null, Nn = null, zi = null, ko = 0;
const zr = /* @__PURE__ */ new Set();
let qc = null;
function ey(e) {
  qc = e;
}
function Ds() {
  return D.vmk ? "unlocked" : D.wrapMeta ? "locked" : "needs-setup";
}
function Gc(e) {
  qc?.({
    state: Ds(),
    ...ut !== null && Ds() === "unlocked" ? { expiresAt: ut } : {},
    reason: e
  });
}
function Ao() {
  Tn !== null && (clearTimeout(Tn), Tn = null);
}
function Ur() {
  Nn?.close(), Nn = null, zi = null;
}
function Wc(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function ty(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function Zc(e) {
  const t = Qe(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? Wc(t.vault_user_handle) : `wrap-${ty(e)}`;
}
function ny(e) {
  return Wc(e);
}
function Xc(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    Ur();
    return;
  }
  const t = `${Qh}${e}`;
  zi !== t && (Ur(), zi = t, Nn = new BroadcastChannel(t), Nn.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && Ue({ broadcast: !1, reason: "manual-lock" });
  });
}
function ry() {
  D.scopeId && (Xc(D.scopeId), Nn?.postMessage({ type: "lock", scopeId: D.scopeId }));
}
function Yc() {
  return new Error("vault-operation-aborted");
}
function Jc() {
  ko += 1;
  for (const e of zr)
    e.abort(Yc());
  zr.clear();
}
function iy() {
  D.vmk?.fill(0), D.vmk = null, ut = null, Ao(), Ur(), D.freshSetup && (D.wrapMeta = null, D.freshSetup = !1, D.scopeId = null);
}
function oy() {
  return ut !== null && Date.now() >= ut;
}
function Qc() {
  return D.vmk && oy() ? (Ue({ broadcast: !1, reason: "auto-lock" }), !1) : D.vmk !== null;
}
function eu(e, t = xe()) {
  if (!D.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return ut = Date.now() + n, Ao(), Tn = setTimeout(() => {
    Ue({ broadcast: !1, reason: "auto-lock" });
  }, n), Gc(e), ut;
}
function sy() {
  const e = ut;
  if (!D.vmk || e === null) return () => {
  };
  Ao();
  let t = !1;
  return () => {
    if (t || !D.vmk) return;
    t = !0;
    const n = e - Date.now();
    if (n <= 0) {
      Ue({ broadcast: !1, reason: "auto-lock" });
      return;
    }
    Tn = setTimeout(() => {
      Ue({ broadcast: !1, reason: "auto-lock" });
    }, n);
  };
}
function ay(e) {
  if (e instanceof w && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function cy(e) {
  if (e.signal.aborted || e.epoch !== ko || !D.vmk)
    throw Yc();
}
async function _o(e, t = {}) {
  if (!Qc() || !D.vmk || !D.wrapMeta)
    throw new Error("vault-locked");
  const n = new Uint8Array(D.vmk), r = D.wrapMeta, i = ko, o = new AbortController();
  zr.add(o);
  const s = {
    epoch: i,
    signal: o.signal,
    assertCurrent: () => cy(s)
  };
  let a = null;
  try {
    s.assertCurrent();
    const c = await e(n, r, s);
    return s.assertCurrent(), t.renewOnSuccess !== !1 && eu("renew"), s.assertCurrent(), t.beforeSuccess && (a = sy(), await t.beforeSuccess(), s.assertCurrent(), a(), a = null), c;
  } catch (c) {
    throw ay(c) || Ue({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    a?.(), zr.delete(o), n.fill(0);
  }
}
function uy() {
  return D.vmk !== null && D.freshSetup;
}
function tu(e) {
  return Jc(), D.vmk?.fill(0), D.vmk = e.vmk, D.wrapMeta = e.wrapMeta, D.freshSetup = e.freshSetup, D.scopeId = e.scopeId, Xc(e.scopeId), { state: "unlocked", expiresAt: eu("unlock", e.policy) };
}
function Ue(e = {}) {
  return e.broadcast && ry(), Jc(), iy(), Gc(e.reason ?? "manual-lock"), { state: "locked" };
}
function lt(e) {
  return Qc(), D.vmk ? {
    state: "unlocked",
    expiresAt: ut ?? void 0,
    ...D.freshSetup ? { freshSetup: !0 } : {}
  } : (e && (D.wrapMeta = Cc(e), D.scopeId = Zc(D.wrapMeta)), D.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function Io(e) {
  const t = Cc(e), n = Zc(t);
  return D.wrapMeta = t, D.scopeId = n, { wrapMeta: t, scopeId: n };
}
function ly() {
  Ue({ broadcast: !1, reason: "unload" }), Ur();
}
const cr = "Avibe Vault", js = "avibe-vault";
function We(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function kt(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function nu() {
  return kt(crypto.getRandomValues(new Uint8Array(32)));
}
function dy(e) {
  try {
    return de(e);
  } catch {
    return null;
  }
}
function Hn(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return kt(Lc(e));
  if (typeof e == "string") {
    const n = dy(e);
    return kt(n ?? new TextEncoder().encode(e));
  }
  if (Array.isArray(e))
    return kt(Uint8Array.from(e));
  if (t !== void 0)
    return kt(new TextEncoder().encode(t));
  throw new Error("webauthn bytes are missing");
}
function fy(e) {
  const t = Hn(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function Nr(e) {
  if (Array.isArray(e))
    return e.map((t) => {
      const n = We(t);
      if (!n || n.type !== "public-key")
        throw new Error("invalid WebAuthn credential descriptor");
      return {
        type: "public-key",
        id: Hn(n.id),
        ...Array.isArray(n.transports) ? { transports: n.transports } : {}
      };
    });
}
function Vs(e) {
  return !Array.isArray(e) || e.length === 0 ? [
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 }
  ] : e.map((t) => {
    const n = We(t);
    if (!n || n.type !== "public-key" || typeof n.alg != "number")
      throw new Error("invalid WebAuthn pubKeyCredParams");
    return { type: "public-key", alg: n.alg };
  });
}
function qs(e) {
  return {
    ...We(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function Gs(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function py(e) {
  const t = We(e) ?? {};
  return { ...t, prf: We(t.prf) ?? {} };
}
function dt() {
  return window.location.hostname;
}
function hy(e) {
  const t = We(e.authzCreationOptions), r = We(t?.webauthn) ?? t, i = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, o = We(r?.rp), s = typeof o?.id == "string" ? o.id : void 0;
  if (s && s !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!r)
    return {
      options: {
        rp: { name: cr, id: e.rpId },
        user: {
          id: fy(e.vaultUserHandle),
          name: e.vaultUserHandle || js,
          displayName: e.displayName || cr
        },
        challenge: nu(),
        pubKeyCredParams: Vs(void 0),
        authenticatorSelection: qs(void 0),
        extensions: { prf: {} }
      }
    };
  const a = We(r.user);
  if (!a) throw new Error("webauthn user is missing");
  return {
    options: {
      rp: {
        name: typeof o?.name == "string" ? o.name : cr,
        id: e.rpId
      },
      user: {
        id: Hn(a.id, e.vaultUserHandle),
        name: typeof a.name == "string" ? a.name : e.vaultUserHandle || js,
        displayName: typeof a.displayName == "string" ? a.displayName : e.displayName || cr
      },
      challenge: Hn(r.challenge),
      pubKeyCredParams: Vs(r.pubKeyCredParams),
      authenticatorSelection: qs(r.authenticatorSelection),
      extensions: py(r.extensions),
      ...Nr(r.excludeCredentials) ? { excludeCredentials: Nr(r.excludeCredentials) } : {},
      ...typeof r.timeout == "number" ? { timeout: r.timeout } : {},
      ...Gs(r.attestation) ? { attestation: Gs(r.attestation) } : {}
    },
    ...i ? { challengeId: i } : {}
  };
}
function yy(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function gy(e, t) {
  const n = yy(e), r = {
    challenge: nu(),
    rpId: t,
    userVerification: "required",
    extensions: lh(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: kt(de(n.credentialId))
    }
  ]), r;
}
function by(e, t, n) {
  const r = {
    challenge: kt(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: kt(de(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function my(e, t = dt()) {
  const n = We(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: Hn(n.challenge),
    rpId: t,
    userVerification: "required",
    ...Nr(n.allowCredentials) ? { allowCredentials: Nr(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function ru(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function iu(e) {
  return {
    id: e.id,
    rawId: J(e.rawId),
    type: e.type
  };
}
function wy(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...iu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      attestationObject: J(t.attestationObject),
      transports: n
    }
  };
}
function xy(e) {
  const t = e.response;
  return {
    ...iu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      authenticatorData: J(t.authenticatorData),
      signature: J(t.signature),
      userHandle: t.userHandle ? J(t.userHandle) : null
    }
  };
}
function vy(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = Lc(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function Bo(e, t, n) {
  const r = await navigator.credentials.get(
    ru(gy(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = vy(r), o = J(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function Ey(e, t, n, r) {
  if (!await navigator.credentials.get(
    ru(by(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function Sy(e) {
  const t = await navigator.credentials.get({
    publicKey: my(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return xy(t);
}
const ky = /ancestor|not the same as its|cross-?origin|different origin/i;
function ou(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function Ay(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function su(e) {
  const t = ou(e);
  return t === "SecurityError" || t === "NotSupportedError" || ky.test(Ay(e));
}
function _y(e) {
  return ou(e) === "NotAllowedError" && !su(e);
}
function Po(e) {
  const { options: t, challengeId: n } = hy(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = J(i.rawId), s = wy(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const Ws = {
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
let Hr = "en";
function Iy(e) {
  return e === "zh" ? "zh" : "en";
}
function By(e) {
  const t = Iy(e);
  return t === Hr ? !1 : (Hr = t, !0);
}
function Py() {
  return Hr;
}
function M(e, t = {}) {
  const n = Ws[Hr], r = Ws.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function $y(e) {
  return JSON.stringify(e ?? {});
}
function Zs(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function Xs(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = $y(n), e.textContent = M(t, n);
}
function $o(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function Oy(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = M(n, Zs(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = M(n, Zs(t.dataset.i18nPlaceholderParams)));
  });
}
let Oo = null;
function Ty(e) {
  Oo = e;
}
function Ly() {
  Oo?.("ui.show");
}
function Ry() {
  Oo?.("ui.hide");
}
function Cy() {
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
function au(e) {
  e.querySelectorAll(".dynamic").forEach((t) => t.remove());
}
function ue(e) {
  return { text: e };
}
function Mn(e, t) {
  return { key: e, params: t };
}
function W(e, t) {
  if (typeof t == "string") {
    Xs(e, t);
    return;
  }
  if ("text" in t) {
    $o(e, t.text);
    return;
  }
  Xs(e, t.key, t.params);
}
function To(e, t, n) {
  const r = Cy();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), Ly(), r.card.classList.remove("confirm-card"), W(r.title, e), W(r.subtitle, t), n ? W(r.body, n) : $o(r.body, ""), au(r.card), r;
}
function Lo() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), au(e)), Ry();
}
function Qt(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function Ys(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function zy(e) {
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
function Uy(e, t, n) {
  $o(e, "");
  const r = document.createElement("div");
  r.className = "confirmation-details";
  for (const i of t.rows) {
    const o = document.createElement("div");
    o.className = "detail-row";
    const s = document.createElement("span");
    s.className = "detail-label", W(s, i.label), o.append(s, zy(i)), r.append(o);
  }
  if (e.append(r), n) {
    const i = document.createElement("p");
    i.className = "confirmation-note", W(i, n), e.append(i);
  }
}
function Fn(e) {
  const t = document.createElement("button");
  return t.type = "button", t.className = "action dynamic", W(t, e), t;
}
function cu(e = ue("")) {
  const t = document.createElement("p");
  return t.className = "setup-status dynamic", W(t, e), t;
}
let ur = null;
function Ro() {
  return new Error("operation-superseded");
}
function Ln(e) {
  const t = e.reason;
  return t instanceof Error ? t : Ro();
}
function Js(e) {
  if (e?.aborted) throw Ln(e);
}
function Wn(e) {
  ur?.abort(Ro());
  const t = new AbortController();
  return ur = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    ur === t && (ur = null);
  });
}
async function Ny(e) {
  return Wn(async (t) => {
    Js(t), Js(e.abortSignal);
    const n = new TextDecoder().decode(e.plaintext), r = To("plaintext.title", ue(e.name), "plaintext.body"), i = document.createElement("pre");
    i.className = "plaintext dynamic", i.textContent = n;
    const o = Fn("common.done"), s = Fn("plaintext.copy");
    s.classList.add("secondary");
    const a = cu("plaintext.copyWarning");
    Qt(r.card, i), Qt(r.card, a), Qt(r.card, s), Qt(r.card, o);
    try {
      await new Promise((c, u) => {
        if (t.aborted) {
          u(Ln(t));
          return;
        }
        if (e.abortSignal?.aborted) {
          u(Ln(e.abortSignal));
          return;
        }
        let l = !1, d = () => {
        }, h = null, f = null, b = !e.prepareCopy;
        const g = () => {
          h?.abort(Ro());
        }, p = (I) => {
          l || (l = !0, d(), g(), I());
        }, y = (I) => {
          p(() => u(Ln(I)));
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
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (b = !0, W(a, "plaintext.copyReady"), s.disabled = !1);
          }) : S().then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (b = !1), W(a, "plaintext.copiedBody"), s.disabled = !1);
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
      Lo();
    }
  });
}
function Co(e, t, n, r) {
  const i = To(e.title, e.subtitle, e.body);
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.details && Uy(i.body, e.details, e.body);
  const o = Fn(e.confirmLabel), s = Fn("common.cancel");
  return s.classList.add("secondary"), Ys(i.card, s), Ys(i.card, o), o.disabled = !0, new Promise((a, c) => {
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
      f(() => c(Ln(t)));
    }, f = (b) => {
      u || (u = !0, clearTimeout(d), l?.dispose(), t.removeEventListener("abort", h), Lo(), b());
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
function Mr(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Hy(e) {
  return new Promise((t, n) => {
    const r = () => n(Mr(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function Qs(e) {
  if (e?.aborted) throw Mr(e);
}
async function uu(e) {
  const t = Io(e.wrapMeta), n = ho(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      Bo(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), Mr(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? Mr(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [Hy(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await lu({
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
async function lu(e) {
  const t = Io(e.wrapMeta);
  let n;
  try {
    Qs(e.abortSignal), n = await hh(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), Qs(e.abortSignal);
    const r = tu({
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
function My(e) {
  if (typeof e != "object" || e === null)
    throw new w("invalid_payload", "request payload must be an object");
  return e;
}
function Fy(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new w("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function ea(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new w("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Ky(e) {
  const t = My(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new w("invalid_payload", "kind must be static or keypair");
  const r = ea(t.name, "name");
  if (t.rootMetadata !== void 0) throw new w("invalid_payload", "seal cannot set vault root metadata");
  const i = Fy(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.inputMode !== "parent-value")
      throw new w("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: ea(t.value, "value"),
      wrapMeta: i
    };
  }
  if (t.inputMode !== void 0)
    throw new w("invalid_payload", "keypair seal is generate-only and does not accept inputMode");
  if (t.value !== void 0)
    throw new w("invalid_payload", "keypair seal cannot accept parent-provided private key material");
  return {
    name: r,
    kind: "keypair",
    wrapMeta: i
  };
}
function du(e) {
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
const Dy = 512, fu = "avibe-vault-signed-context-replay:v2", jy = "avibe-vault-signed-context-replay:v2", Vy = "avibe-vault-signed-context-replay:v2", ze = /* @__PURE__ */ new Map();
let ta = !1, In = null;
function Oe(e) {
  return typeof e == "object" && e !== null;
}
function st(e, t) {
  if (typeof e != "string" || e.length === 0) throw new w("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function xn(e, t) {
  if (e !== void 0) {
    if (typeof e != "string") throw new w("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function yi(e, t) {
  if (e !== void 0) {
    if (!Array.isArray(e) || !e.every((n) => typeof n == "string"))
      throw new w("invalid_payload", `${t} must be a string array`);
    return e;
  }
}
function qy(e, t) {
  if (e !== "static" && e !== "keypair") throw new w("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function Gy(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new w("invalid_payload", "context purpose is invalid");
  return e;
}
function Ui(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new w("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function Wy(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new w("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function zo(e, t) {
  if (!Oe(e)) throw new w(t, "agent delivery context.release must be an object");
  return {
    name: st(e.name, "context.release.name"),
    ttlSecs: Ui(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: Wy(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: Ui(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: st(e.operationHash, "context.release.operationHash")
  };
}
function It(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(It).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${It(t[n])}`).join(",")}}`;
}
function Uo(e) {
  const t = Oe(e) ? e : null;
  if (!t) throw new w("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new w("invalid_payload", "context version must be 2");
  const n = Gy(t.purpose);
  st(t.requestId, "context.requestId"), t.grantId !== void 0 && xn(t.grantId, "context.grantId");
  const r = Oe(t.display) ? t.display : null;
  if (!r) throw new w("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new w("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, u) => {
    if (!Oe(c)) throw new w("invalid_payload", `context.display.secrets[${u}] must be an object`);
    st(c.name, `context.display.secrets[${u}].name`), qy(c.kind, `context.display.secrets[${u}].kind`);
  }), r.sessionLabel !== void 0 && xn(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && xn(r.command, "context.display.command"), r.egress !== void 0 && xn(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!Oe(i)) throw new w("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && yi(i.env, "context.display.source.env"), i.tags !== void 0 && yi(i.tags, "context.display.source.tags"), i.skills !== void 0 && yi(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && Ui(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = Oe(t.signature) ? t.signature : null;
  if (!o) throw new w("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new w("invalid_payload", "context signature alg must be ed25519");
  st(o.keyId, "context.signature.keyId"), st(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!Oe(s)) throw new w("invalid_payload", "context.agent must be an object");
    const c = Oe(s.publicKey) ? s.publicKey : null;
    if (!c) throw new w("invalid_payload", "context.agent.publicKey must be an object");
    st(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && xn(c.fingerprint, "context.agent.publicKey.fingerprint"), st(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = zo(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new w("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new w("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !Oe(a))
    throw new w("invalid_payload", "context.release must be an object");
  return st(t.expiresAt, "context.expiresAt"), t;
}
function Qr(e) {
  const { signature: t, ...n } = e;
  return It(n);
}
function Ni(e) {
  if (e.context.purpose !== e.expectedPurpose)
    throw new w("invalid_context", `${e.expectedPurpose} context has the wrong purpose`);
  if (!e.context.display.secrets.some(
    (n) => n.name === e.secret.name && n.kind === e.secret.kind
  )) {
    const n = e.secret.kind === "keypair" ? "key" : "secret";
    throw new w("invalid_context", `${e.expectedPurpose} context does not cover the requested ${n}`);
  }
}
function Fr(e) {
  if (e.expectedPurpose && e.context.purpose !== e.expectedPurpose)
    throw new w("invalid_context", "signed context purpose does not match operation");
  const t = e.now ?? Date.now(), n = Date.parse(e.context.expiresAt);
  if (!Number.isFinite(n) || n <= t)
    throw new w("context_expired", "signed context is expired", !0);
  if (!zh({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: Qr(e.context)
  })) throw new w("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && zo(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new w("context_expired", "signed release approval is expired", !0);
}
function No(e) {
  for (const [t, n] of ze)
    n <= e && ze.delete(t);
}
function Zy() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function un() {
  return typeof window < "u";
}
function Ho() {
  return new w("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function pu(e) {
  const t = Zy();
  if (!t && e && un()) throw Ho();
  return t;
}
function hu(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!Oe(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function Mo(e = Date.now(), t = !1) {
  No(e);
  const n = pu(t);
  if (n)
    try {
      n.setItem(fu, JSON.stringify({ version: 2, entries: [...ze] }));
    } catch {
      if (t && un()) throw Ho();
    }
}
function yu(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && ze.set(r, Math.max(ze.get(r) ?? 0, i));
  n && Mo(t);
}
function Fo() {
  if (!(In || typeof BroadcastChannel > "u"))
    try {
      In = new BroadcastChannel(jy), In.addEventListener("message", (e) => {
        const t = Oe(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || yu(hu({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      In = null;
    }
}
function Xy(e = Date.now()) {
  ta || (Fo(), gu(e, un()), ta = !0);
}
function gu(e = Date.now(), t = !1) {
  Fo();
  const n = pu(t);
  if (n)
    try {
      yu(hu(JSON.parse(n.getItem(fu) ?? "null"), e), e, !1), No(e);
    } catch {
      if (t && un()) throw Ho();
      Mo(e);
    }
}
function Yy(e) {
  Fo();
  try {
    In?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function Jy() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function Qy(e) {
  const t = Jy();
  if (t) return await t.request(Vy, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new w("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function bu(e, t) {
  Xy(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new w("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  No(t);
  for (const r of n.keys())
    if (ze.has(r))
      throw new w("context_replayed", "signed context requestId was already used", !0);
  if (ze.size + n.size > Dy)
    throw new w("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function Kr(e, t = Date.now()) {
  bu(e, t);
}
async function ei(e, t = Date.now()) {
  const n = [...e];
  await Qy(() => {
    gu(t, un());
    const r = bu(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, ze.get(o));
    for (const [o, s] of r) ze.set(o, s);
    try {
      Mo(t, un());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? ze.delete(s) : ze.set(s, a);
      throw o;
    }
    Yy([...r]);
  });
}
async function eg(e, t) {
  if (e.purpose !== "agent-deliver") throw new w("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new w("invalid_context", "agent delivery context is missing grantId");
  const n = zo(e.release, "invalid_context");
  if (n.name !== t) throw new w("invalid_context", "signed release name does not match release item");
  if (e.display.grantTtlSeconds === void 0 || e.display.grantTtlSeconds !== n.ttlSecs)
    throw new w("invalid_context", "signed release TTL does not match display TTL");
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
function tg(e) {
  if (!e.agent) throw new w("invalid_context", "agent delivery context is missing agent key");
  if (e.agent.publicKey.fingerprint && e.agent.publicKey.fingerprint !== e.agent.fingerprint)
    throw new w("invalid_context", "agent public key fingerprint mismatch");
  return { ...e.agent.publicKey, fingerprint: e.agent.fingerprint };
}
async function ng(e) {
  const t = e.map((n) => Qr(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(It(t))));
}
function na(e) {
  return It(e.display);
}
const rg = "1.2.3";
let Pe = class Hi extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof Hi ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof Hi && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${rg}`
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
function ft(e, t) {
  return e.exec(t)?.groups;
}
const mu = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, wu = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, xu = /^\(.+?\).*?$/, ra = /^tuple(?<array>(\[(\d*)\])*)$/;
function Mi(e) {
  let t = e.type;
  if (ra.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += Mi(o), i < n - 1 && (t += ", ");
    }
    const r = ft(ra, e.type);
    return t += `)${r?.array || ""}`, Mi({
      ...e,
      type: t
    });
  }
  return "indexed" in e && e.indexed && (t = `${t} indexed`), e.name ? `${t} ${e.name}` : t;
}
function vn(e) {
  let t = "";
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r];
    t += Mi(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function ig(e) {
  return e.type === "function" ? `function ${e.name}(${vn(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${vn(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${vn(e.inputs)})` : e.type === "error" ? `error ${e.name}(${vn(e.inputs)})` : e.type === "constructor" ? `constructor(${vn(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const vu = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function og(e) {
  return vu.test(e);
}
function sg(e) {
  return ft(vu, e);
}
const Eu = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function ag(e) {
  return Eu.test(e);
}
function cg(e) {
  return ft(Eu, e);
}
const Su = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function ug(e) {
  return Su.test(e);
}
function lg(e) {
  return ft(Su, e);
}
const ku = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function Au(e) {
  return ku.test(e);
}
function dg(e) {
  return ft(ku, e);
}
const _u = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function fg(e) {
  return _u.test(e);
}
function pg(e) {
  return ft(_u, e);
}
const Iu = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function hg(e) {
  return Iu.test(e);
}
function yg(e) {
  return ft(Iu, e);
}
const gg = /^receive\(\) external payable$/;
function bg(e) {
  return gg.test(e);
}
const mg = /* @__PURE__ */ new Set(["indexed"]), Fi = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class wg extends Pe {
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
class xg extends Pe {
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
class vg extends Pe {
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
class Eg extends Pe {
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
class Sg extends Pe {
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
class kg extends Pe {
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
class Ag extends Pe {
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
class pn extends Pe {
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
class _g extends Pe {
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
class Ig extends Pe {
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
class Bg extends Pe {
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
class Pg extends Pe {
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
function $g(e, t, n) {
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
const gi = /* @__PURE__ */ new Map([
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
function Og(e, t = {}) {
  if (ug(e))
    return Tg(e, t);
  if (ag(e))
    return Lg(e, t);
  if (og(e))
    return Rg(e, t);
  if (fg(e))
    return Cg(e, t);
  if (hg(e))
    return zg(e);
  if (bg(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new _g({ signature: e });
}
function Tg(e, t = {}) {
  const n = lg(e);
  if (!n)
    throw new pn({ signature: e, type: "function" });
  const r = Le(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(Mt(r[a], {
      modifiers: Fi,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = Le(n.returns), c = a.length;
    for (let u = 0; u < c; u++)
      s.push(Mt(a[u], {
        modifiers: Fi,
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
function Lg(e, t = {}) {
  const n = cg(e);
  if (!n)
    throw new pn({ signature: e, type: "event" });
  const r = Le(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Mt(r[s], {
      modifiers: mg,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function Rg(e, t = {}) {
  const n = sg(e);
  if (!n)
    throw new pn({ signature: e, type: "error" });
  const r = Le(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Mt(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function Cg(e, t = {}) {
  const n = pg(e);
  if (!n)
    throw new pn({ signature: e, type: "constructor" });
  const r = Le(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(Mt(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function zg(e) {
  const t = yg(e);
  if (!t)
    throw new pn({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const Ug = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Ng = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Hg = /^u?int$/;
function Mt(e, t) {
  const n = $g(e, t?.type, t?.structs);
  if (gi.has(n))
    return gi.get(n);
  const r = xu.test(e), i = ft(r ? Ng : Ug, e);
  if (!i)
    throw new vg({ param: e });
  if (i.name && Fg(i.name))
    throw new Eg({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, u = {};
  if (r) {
    c = "tuple";
    const d = Le(i.type), h = [], f = d.length;
    for (let b = 0; b < f; b++)
      h.push(Mt(d[b], { structs: a }));
    u = { components: h };
  } else if (i.type in a)
    c = "tuple", u = { components: a[i.type] };
  else if (Hg.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !Bu(c))
    throw new xg({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new Sg({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (Fi.has(i.modifier) && !Kg(c, !!i.array))
      throw new kg({
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
  return gi.set(n, l), l;
}
function Le(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? Le(a, [...t, n.trim()]) : Le(a, t, `${n}${s}`, r);
      case "(":
        return Le(a, t, `${n}${s}`, r + 1);
      case ")":
        return Le(a, t, `${n}${s}`, r - 1);
      default:
        return Le(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new Pg({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function Bu(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || mu.test(e) || wu.test(e);
}
const Mg = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function Fg(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || mu.test(e) || wu.test(e) || Mg.test(e);
}
function Kg(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function Dg(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!Au(a))
      continue;
    const c = dg(a);
    if (!c)
      throw new pn({ signature: a, type: "struct" });
    const u = c.properties.split(";"), l = [], d = u.length;
    for (let h = 0; h < d; h++) {
      const b = u[h].trim();
      if (!b)
        continue;
      const g = Mt(b, {
        type: "struct"
      });
      l.push(g);
    }
    if (!l.length)
      throw new Ig({ signature: a });
    t[c.name] = l;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = Pu(c, t);
  }
  return r;
}
const jg = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function Pu(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (xu.test(s.type))
      r.push(s);
    else {
      const c = ft(jg, s.type);
      if (!c?.type)
        throw new Ag({ abiParameter: s });
      const { array: u, type: l } = c;
      if (l in t) {
        if (n.has(l))
          throw new Bg({ type: l });
        r.push({
          ...s,
          type: `tuple${u ?? ""}`,
          components: Pu(t[l], t, /* @__PURE__ */ new Set([...n, l]))
        });
      } else if (Bu(l))
        r.push(s);
      else
        throw new wg({ type: l });
    }
  }
  return r;
}
function Vg(e) {
  const t = Dg(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    Au(o) || n.push(Og(o, t));
  }
  return n;
}
function $u(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => qg(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function qg(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${$u(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function Zn(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function ce(e) {
  return Zn(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const Ou = "2.54.6";
let bi = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${Ou}`
};
class K extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof K ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof K && n.cause.docsPath || n.docsPath, o = bi.getDocsUrl?.({ ...n, docsPath: i }), s = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...o ? [`Docs: ${o}`] : [],
      ...r ? [`Details: ${r}`] : [],
      ...bi.version ? [`Version: ${bi.version}`] : []
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
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = Ou;
  }
  walk(t) {
    return Tu(this, t);
  }
}
function Tu(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? Tu(e.cause, t) : t ? null : e;
}
class Gg extends K {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${$u(n, { includeName: !0 })})`,
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
class Wg extends K {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class Zg extends K {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class Xg extends K {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${ce(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class Yg extends K {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class Jg extends K {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class Qg extends K {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class eb extends K {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class tb extends K {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class Lu extends K {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class Ru extends K {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function hn(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? At(e, { dir: t, size: n }) : nb(e, { dir: t, size: n });
}
function At(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new Ru({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function nb(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new Ru({
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
class Ko extends K {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class rb extends K {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class ib extends K {
  constructor({ givenSize: t, maxSize: n }) {
    super(`Size cannot exceed ${n} bytes. Given size: ${t} bytes.`, { name: "SizeOverflowError" });
  }
}
function Kn(e, { dir: t = "left" } = {}) {
  let n = typeof e == "string" ? e.replace("0x", "") : e, r = 0;
  for (let i = 0; i < n.length - 1 && n[t === "left" ? i : n.length - i - 1].toString() === "0"; i++)
    r++;
  return n = t === "left" ? n.slice(r) : n.slice(0, n.length - r), typeof e == "string" ? (n.length === 1 && t === "right" && (n = `${n}0`), `0x${n.length % 2 === 1 ? `0${n}` : n}`) : n;
}
function et(e, { size: t }) {
  if (ce(e) > t)
    throw new ib({
      givenSize: ce(e),
      maxSize: t
    });
}
function Cu(e, t = {}) {
  const { signed: n } = t;
  t.size && et(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function Do(e, t = {}) {
  const n = Cu(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new Ko({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const ob = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Dn(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? F(e, t) : typeof e == "string" ? Uu(e, t) : typeof e == "boolean" ? zu(e, t) : Se(e, t);
}
function zu(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (et(n, { size: t.size }), hn(n, { size: t.size })) : n;
}
function Se(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += ob[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (et(r, { size: t.size }), hn(r, { dir: "right", size: t.size })) : r;
}
function F(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new Ko({
      max: o ? `${o}${c}` : void 0,
      min: `${s}${c}`,
      signed: n,
      size: r,
      value: `${e}${c}`
    });
  }
  const a = `0x${(n && i < 0 ? (1n << BigInt(r * 8)) + BigInt(i) : i).toString(16)}`;
  return r ? hn(a, { size: r }) : a;
}
const sb = /* @__PURE__ */ new TextEncoder();
function Uu(e, t = {}) {
  const n = sb.encode(e);
  return Se(n, t);
}
const ab = /* @__PURE__ */ new TextEncoder();
function jo(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? ub(e, t) : typeof e == "boolean" ? cb(e, t) : Zn(e) ? Bt(e, t) : Nu(e, t);
}
function cb(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (et(n, { size: t.size }), hn(n, { size: t.size })) : n;
}
const ot = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function ia(e) {
  if (e >= ot.zero && e <= ot.nine)
    return e - ot.zero;
  if (e >= ot.A && e <= ot.F)
    return e - (ot.A - 10);
  if (e >= ot.a && e <= ot.f)
    return e - (ot.a - 10);
}
function Bt(e, t = {}) {
  let n = e;
  t.size && (et(n, { size: t.size }), n = hn(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = ia(r.charCodeAt(a++)), u = ia(r.charCodeAt(a++));
    if (c === void 0 || u === void 0)
      throw new K(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + u;
  }
  return o;
}
function ub(e, t) {
  const n = F(e, t);
  return Bt(n);
}
function Nu(e, t = {}) {
  const n = ab.encode(e);
  return typeof t.size == "number" ? (et(n, { size: t.size }), hn(n, { dir: "right", size: t.size })) : n;
}
const lr = /* @__PURE__ */ BigInt(2 ** 32 - 1), oa = /* @__PURE__ */ BigInt(32);
function lb(e, t = !1) {
  return t ? { h: Number(e & lr), l: Number(e >> oa & lr) } : { h: Number(e >> oa & lr) | 0, l: Number(e & lr) | 0 };
}
function db(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = lb(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const fb = (e, t, n) => e << n | t >>> 32 - n, pb = (e, t, n) => t << n | e >>> 32 - n, hb = (e, t, n) => t << n - 32 | e >>> 64 - n, yb = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function gb(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function sa(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function jn(e, ...t) {
  if (!gb(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function Dr(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Hu(e, t) {
  jn(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function bb(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Vn(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function mi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function De(e, t) {
  return e << 32 - t | e >>> t;
}
const mb = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function wb(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function xb(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = wb(e[t]);
  return e;
}
const aa = mb ? (e) => e : xb;
function vb(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function Vo(e) {
  return typeof e == "string" && (e = vb(e)), jn(e), e;
}
class Mu {
}
function Fu(e) {
  const t = (r) => e().update(Vo(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const Eb = BigInt(0), En = BigInt(1), Sb = BigInt(2), kb = BigInt(7), Ab = BigInt(256), _b = BigInt(113), Ku = [], Du = [], ju = [];
for (let e = 0, t = En, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Ku.push(2 * (5 * r + n)), Du.push((e + 1) * (e + 2) / 2 % 64);
  let i = Eb;
  for (let o = 0; o < 7; o++)
    t = (t << En ^ (t >> kb) * _b) % Ab, t & Sb && (i ^= En << (En << /* @__PURE__ */ BigInt(o)) - En);
  ju.push(i);
}
const Vu = db(ju, !0), Ib = Vu[0], Bb = Vu[1], ca = (e, t, n) => n > 32 ? hb(e, t, n) : fb(e, t, n), ua = (e, t, n) => n > 32 ? yb(e, t, n) : pb(e, t, n);
function Pb(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = ca(u, l, 1) ^ n[a], h = ua(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Du[s], c = ca(i, o, a), u = ua(i, o, a), l = Ku[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= Ib[r], e[1] ^= Bb[r];
  }
  Vn(n);
}
class qo extends Mu {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, sa(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = bb(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    aa(this.state32), Pb(this.state32, this.rounds), aa(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Dr(this), t = Vo(t), jn(t);
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
    Dr(this, !1), jn(t), this.finish();
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
    return sa(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Hu(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, Vn(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new qo(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const $b = (e, t, n) => Fu(() => new qo(t, e, n)), Ob = $b(1, 136, 256 / 8);
function Ze(e, t) {
  const n = t || "hex", r = Ob(Zn(e, { strict: !1 }) ? jo(e) : e);
  return n === "bytes" ? r : Dn(r);
}
const Tb = (e) => Ze(jo(e));
function Lb(e) {
  return Tb(e);
}
function Rb(e) {
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
const Cb = (e) => {
  const t = typeof e == "string" ? e : ig(e);
  return Rb(t);
};
function zb(e) {
  return Lb(Cb(e));
}
class Kt extends K {
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
class qu extends Map {
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
const wi = /* @__PURE__ */ new qu(8192);
function Gu(e, t) {
  if (wi.has(`${e}.${t}`))
    return wi.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = Ze(Nu(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return wi.set(`${e}.${t}`, o), o;
}
const Ub = /^0x[a-fA-F0-9]{40}$/, xi = /* @__PURE__ */ new qu(8192);
function Dt(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if (xi.has(r))
    return xi.get(r);
  const i = Ub.test(e) ? e.toLowerCase() === e ? !0 : n ? Gu(e) === e : !0 : !1;
  return xi.set(r, i), i;
}
function Nb(e) {
  return typeof e[0] == "string" ? Ne(e) : Hb(e);
}
function Hb(e) {
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
function Go(e, t, n, { strict: r } = {}) {
  return Zn(e, { strict: !1 }) ? Yu(e, t, n, {
    strict: r
  }) : Xu(e, t, n, {
    strict: r
  });
}
function Wu(e, t) {
  if (typeof t == "number" && t > 0 && t > ce(e) - 1)
    throw new Lu({
      offset: t,
      position: "start",
      size: ce(e)
    });
}
function Zu(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && ce(e) !== n - t)
    throw new Lu({
      offset: n,
      position: "end",
      size: ce(e)
    });
}
function Xu(e, t, n, { strict: r } = {}) {
  Wu(e, t);
  const i = e.slice(t, n);
  return r && Zu(i, t, n), i;
}
function Yu(e, t, n, { strict: r } = {}) {
  Wu(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && Zu(i, t, n), i;
}
const Mb = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Ju = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function Wo(e, t) {
  if (e.length !== t.length)
    throw new Yg({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = Fb({
    params: e,
    values: t
  });
  return Xo(n);
}
function Fb({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(Zo({ param: e[r], value: t[r] }));
  return n;
}
function Zo({ param: e, value: t }) {
  const n = ti(e.type);
  if (n) {
    const [r, i] = n;
    return Db(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return Wb(t, {
      param: e
    });
  if (e.type === "address")
    return Kb(t);
  if (e.type === "bool")
    return Vb(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = Ju.exec(e.type) ?? [];
    return qb(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return jb(t, { param: e });
  if (e.type === "string")
    return Gb(t);
  throw new Qg(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function Xo(e) {
  let t = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? t += 32 : t += ce(a);
  }
  const n = [], r = [];
  let i = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? (n.push(F(t + i, { size: 32 })), r.push(a), i += ce(a)) : n.push(a);
  }
  return Ne([...n, ...r]);
}
function Kb(e) {
  if (!Dt(e))
    throw new Kt({ address: e });
  return { dynamic: !1, encoded: At(e.toLowerCase()) };
}
function Db(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new tb(e);
  if (!r && e.length !== t)
    throw new Zg({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && Ki(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = Zo({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = Xo(o);
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
function jb(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = ce(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = At(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: Ne([
        At(F(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new Xg({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: At(e, { dir: "right" }) };
}
function Vb(e) {
  if (typeof e != "boolean")
    throw new K(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: At(zu(e)) };
}
function qb(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new Ko({
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
function Gb(e) {
  const t = Uu(e), n = Math.ceil(ce(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(At(Go(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: Ne([
      At(F(ce(t), { size: 32 })),
      ...r
    ])
  };
}
function Wb(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = Zo({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? Xo(r) : Ne(r.map(({ encoded: i }) => i))
  };
}
function ti(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function Ki(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(Ki);
  const n = ti(t);
  return n ? Ki({ ...e, type: n[1] }) : !1;
}
const Zb = (e) => Go(zb(e), 0, 4);
class la extends K {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class Xb extends K {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class Yb extends K {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const Jb = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new Yb({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new Xb({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new la({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new la({ offset: e });
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
function Yo(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(Jb);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function Qb(e, t = {}) {
  typeof t.size < "u" && et(e, { size: t.size });
  const n = Se(e, t);
  return Cu(n, t);
}
function e0(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (et(n, { size: t.size }), n = Kn(n)), n.length > 1 || n[0] > 1)
    throw new rb(n);
  return !!n[0];
}
function ct(e, t = {}) {
  typeof t.size < "u" && et(e, { size: t.size });
  const n = Se(e, t);
  return Do(n, t);
}
function t0(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (et(n, { size: t.size }), n = Kn(n, { dir: "right" })), new TextDecoder().decode(n);
}
function n0(e, t) {
  const n = typeof t == "string" ? Bt(t) : t, r = Yo(n);
  if (ce(n) === 0 && e.length > 0)
    throw new Wg();
  if (ce(t) && ce(t) < 32)
    throw new Gg({
      data: typeof t == "string" ? t : Se(t),
      params: e,
      size: ce(t)
    });
  let i = 0;
  const o = [];
  for (let s = 0; s < e.length; ++s) {
    const a = e[s];
    i < n.length && r.setPosition(i);
    const [c, u] = tn(r, a, {
      staticPosition: 0
    });
    i += u, o.push(c);
  }
  return o;
}
function tn(e, t, { staticPosition: n }) {
  const r = ti(t.type);
  if (r) {
    const [i, o] = r;
    return i0(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return c0(e, t, { staticPosition: n });
  if (t.type === "address")
    return r0(e);
  if (t.type === "bool")
    return o0(e);
  if (t.type.startsWith("bytes"))
    return s0(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return a0(e, t);
  if (t.type === "string")
    return u0(e, { staticPosition: n });
  throw new eb(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const da = 32, Di = 32;
function r0(e) {
  const t = e.readBytes(32);
  return [Gu(Se(Xu(t, -20))), 32];
}
function i0(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = ct(e.readBytes(Di)), a = r + s, c = a + da;
    e.setPosition(a);
    const u = ct(e.readBytes(da)), l = qn(t);
    let d = 0;
    const h = [];
    for (let f = 0; f < u; ++f) {
      e.setPosition(c + (l ? f * 32 : d));
      const [b, g] = tn(e, t, {
        staticPosition: c
      });
      d += g, h.push(b), g === 0 && (e.assertReadLimit(), e._touch());
    }
    return e.setPosition(r + 32), [h, 32];
  }
  if (qn(t)) {
    const s = ct(e.readBytes(Di)), a = r + s, c = [];
    for (let u = 0; u < n; ++u) {
      e.setPosition(a + u * 32);
      const [l] = tn(e, t, {
        staticPosition: a
      });
      c.push(l);
    }
    return e.setPosition(r + 32), [c, 32];
  }
  let i = 0;
  const o = [];
  for (let s = 0; s < n; ++s) {
    const [a, c] = tn(e, t, {
      staticPosition: r + i
    });
    i += c, o.push(a), c === 0 && (e.assertReadLimit(), e._touch());
  }
  return [o, i];
}
function o0(e) {
  return [e0(e.readBytes(32), { size: 32 }), 32];
}
function s0(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = ct(e.readBytes(32));
    e.setPosition(n + s);
    const a = ct(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [Se(c), 32];
  }
  return [Se(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function a0(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? Qb(i, { signed: n }) : ct(i, { signed: n }),
    32
  ];
}
function c0(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (qn(t)) {
    const s = ct(e.readBytes(Di)), a = n + s;
    for (let c = 0; c < t.components.length; ++c) {
      const u = t.components[c];
      e.setPosition(a + o);
      const [l, d] = tn(e, u, {
        staticPosition: a
      });
      o += d, i[r ? c : u?.name] = l;
    }
    return e.setPosition(n + 32), [i, 32];
  }
  for (let s = 0; s < t.components.length; ++s) {
    const a = t.components[s], [c, u] = tn(e, a, {
      staticPosition: n
    });
    i[r ? s : a?.name] = c, o += u;
  }
  return [i, o];
}
function u0(e, { staticPosition: t }) {
  const n = ct(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = ct(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = t0(Kn(o));
  return e.setPosition(t + 32), [s, 32];
}
function qn(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components?.some(qn);
  const n = ti(e.type);
  return !!(n && qn({ ...e, type: n[1] }));
}
const l0 = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), d0 = {
  ether: -9,
  wei: 9
};
function f0(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function ji(e, t = "wei") {
  return f0(e, d0[t]);
}
function p0(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class h0 extends K {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        p0(t),
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
class y0 extends K {
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
class g0 extends K {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function ln(e, t = "hex") {
  const n = Qu(e), r = Yo(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? Se(r.bytes) : r.bytes;
}
function Qu(e) {
  return Array.isArray(e) ? b0(e.map((t) => Qu(t))) : m0(e);
}
function b0(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = el(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function m0(e) {
  const t = typeof e == "string" ? Bt(e) : e, n = el(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function el(e) {
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
class ni extends K {
  constructor({ cause: t, maxFeePerGas: n } = {}) {
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${ji(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
      cause: t,
      name: "FeeCapTooHighError"
    });
  }
}
Object.defineProperty(ni, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
class tl extends K {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${ji(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${ji(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(tl, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const Jo = 2n ** 256n - 1n;
function nl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => Bt(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => Se(o));
}
function rl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => Bt(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => Bt(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => Se(s));
}
function w0(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, u = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + u, a, r);
}
function x0(e, t, n) {
  return e & t ^ ~e & n;
}
function v0(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class E0 extends Mu {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = mi(this.buffer);
  }
  update(t) {
    Dr(this), t = Vo(t), jn(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = mi(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Dr(this), Hu(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Vn(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    w0(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = mi(t), c = this.outputLen;
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
const vt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), S0 = /* @__PURE__ */ Uint32Array.from([
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
class k0 extends E0 {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = vt[0] | 0, this.B = vt[1] | 0, this.C = vt[2] | 0, this.D = vt[3] | 0, this.E = vt[4] | 0, this.F = vt[5] | 0, this.G = vt[6] | 0, this.H = vt[7] | 0;
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
      const h = Et[d - 15], f = Et[d - 2], b = De(h, 7) ^ De(h, 18) ^ h >>> 3, g = De(f, 17) ^ De(f, 19) ^ f >>> 10;
      Et[d] = g + Et[d - 7] + b + Et[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = De(a, 6) ^ De(a, 11) ^ De(a, 25), f = l + h + x0(a, c, u) + S0[d] + Et[d] | 0, g = (De(r, 2) ^ De(r, 13) ^ De(r, 22)) + v0(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Vn(Et);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Vn(this.buffer);
  }
}
const A0 = /* @__PURE__ */ Fu(() => new k0()), _0 = A0;
function I0(e, t) {
  return _0(Zn(e, { strict: !1 }) ? jo(e) : e);
}
function B0(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = I0(t);
  return i.set([n], 0), r === "bytes" ? i : Se(i);
}
function P0(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(B0({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const fa = 6, il = 32, Qo = 4096, ol = il * Qo, pa = ol * fa - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * Qo * fa, sl = 1;
class $0 extends K {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class al extends K {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class O0 extends K {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class T0 extends K {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${sl}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function L0(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? Bt(e.data) : e.data, r = ce(n);
  if (!r)
    throw new al();
  if (r > pa)
    throw new $0({
      maxSize: pa,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = Yo(new Uint8Array(ol));
    let c = 0;
    for (; c < Qo; ) {
      const u = n.slice(s, s + (il - 1));
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
function R0(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? L0({ data: t, to: r }), o = e.commitments ?? nl({ blobs: i, kzg: n, to: r }), s = e.proofs ?? rl({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function C0(e) {
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
  throw new h0({ transaction: e });
}
class ri extends K {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function z0(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!Dt(i))
        throw new Kt({ address: i });
      if (r < 0)
        throw new ri({ chainId: r });
    }
  es(e);
}
function U0(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new al();
    for (const n of t) {
      const r = ce(n), i = Do(Go(n, 0, 1));
      if (r !== 32)
        throw new O0({ hash: n, size: r });
      if (i !== sl)
        throw new T0({
          hash: n,
          version: i
        });
    }
  }
  es(e);
}
function es(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new ri({ chainId: t });
  if (i && !Dt(i))
    throw new Kt({ address: i });
  if (r && r > Jo)
    throw new ni({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new tl({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function N0(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new ri({ chainId: t });
  if (o && !Dt(o))
    throw new Kt({ address: o });
  if (n || i)
    throw new K("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > Jo)
    throw new ni({ maxFeePerGas: r });
}
function H0(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !Dt(o))
    throw new Kt({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new ri({ chainId: t });
  if (n || i)
    throw new K("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > Jo)
    throw new ni({ maxFeePerGas: r });
}
function ii(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const { address: r, storageKeys: i } = e[n];
    for (let o = 0; o < i.length; o++)
      if (i[o].length - 2 !== 64)
        throw new g0({ storageKey: i[o] });
    if (!Dt(r, { strict: !1 }))
      throw new Kt({ address: r });
    t.push([r, i]);
  }
  return t;
}
function M0(e, t) {
  const n = C0(e);
  return n === "eip1559" ? D0(e, t) : n === "eip2930" ? j0(e, t) : n === "eip4844" ? K0(e, t) : n === "eip7702" ? F0(e, t) : V0(e);
}
function F0(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  z0(e);
  const h = ii(l), f = q0(n);
  return Ne([
    "0x04",
    ln([
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
      ...Xn(e, t)
    ])
  ]);
}
function K0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  U0(e);
  let h = e.blobVersionedHashes, f = e.sidecars;
  if (e.blobs && (typeof h > "u" || typeof f > "u")) {
    const _ = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((O) => Se(O)), I = e.kzg, S = nl({
      blobs: _,
      kzg: I
    });
    if (typeof h > "u" && (h = P0({
      commitments: S
    })), typeof f > "u") {
      const O = rl({ blobs: _, commitments: S, kzg: I });
      f = R0({ blobs: _, commitments: S, proofs: O });
    }
  }
  const b = ii(l), g = [
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
    ...Xn(e, t)
  ], p = [], y = [], x = [];
  if (f)
    for (let _ = 0; _ < f.length; _++) {
      const { blob: I, commitment: S, proof: O } = f[_];
      p.push(I), y.push(S), x.push(O);
    }
  return Ne([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    ln(f ? [g, p, y, x] : g)
  ]);
}
function D0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: u, data: l } = e;
  es(e);
  const d = ii(u), h = [
    F(n),
    i ? F(i) : "0x",
    c ? F(c) : "0x",
    a ? F(a) : "0x",
    r ? F(r) : "0x",
    o ?? "0x",
    s ? F(s) : "0x",
    l ?? "0x",
    d,
    ...Xn(e, t)
  ];
  return Ne([
    "0x02",
    ln(h)
  ]);
}
function j0(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: u } = e;
  N0(e);
  const l = ii(c), d = [
    F(n),
    o ? F(o) : "0x",
    u ? F(u) : "0x",
    r ? F(r) : "0x",
    s ?? "0x",
    a ? F(a) : "0x",
    i ?? "0x",
    l,
    ...Xn(e, t)
  ];
  return Ne([
    "0x01",
    ln(d)
  ]);
}
function V0(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  H0(e);
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
  ]), ln(u);
}
function Xn(e, t) {
  const n = t ?? e, { v: r, yParity: i } = n;
  if (typeof n.r > "u")
    return [];
  if (typeof n.s > "u")
    return [];
  if (typeof r > "u" && typeof i > "u")
    return [];
  const o = Kn(n.r), s = Kn(n.s);
  return [typeof i == "number" ? i ? F(1) : "0x" : r === 0n ? "0x" : r === 1n ? F(1) : r === 27n ? "0x" : F(1), o === "0x00" ? "0x" : o, s === "0x00" ? "0x" : s];
}
function q0(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Dn(r) : "0x",
      s,
      i ? Dn(i) : "0x",
      ...Xn({}, o)
    ]);
  }
  return t;
}
class G0 extends K {
  constructor({ domain: t }) {
    super(`Invalid domain "${l0(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class W0 extends K {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class Z0 extends K {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function X0(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: u, type: l } = c, d = a[u], h = l.match(Ju);
      if (h && (typeof d == "number" || typeof d == "bigint")) {
        const [g, p, y] = h;
        F(d, {
          signed: p === "int",
          size: Number.parseInt(y, 10) / 8
        });
      }
      if (l === "address" && typeof d == "string" && !Dt(d))
        throw new Kt({ address: d });
      const f = l.match(Mb);
      if (f) {
        const [g, p] = f;
        if (p && ce(d) !== Number.parseInt(p, 10))
          throw new Jg({
            expectedSize: Number.parseInt(p, 10),
            givenSize: ce(d)
          });
      }
      const b = i[l];
      b && (J0(l), o(b, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new G0({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new W0({ primaryType: r, types: i });
}
function Y0({ domain: e }) {
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
function J0(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new Z0({ type: e });
}
function Q0(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: Y0({ domain: t }),
    ...e.types
  };
  X0({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(em({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(cl({
    data: n,
    primaryType: r,
    types: i
  })), Ze(Nb(o));
}
function em({ domain: e, types: t }) {
  return cl({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function cl({ data: e, primaryType: t, types: n }) {
  const r = ul({
    data: e,
    primaryType: t,
    types: n
  });
  return Ze(r);
}
function ul({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [tm({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = dl({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return Wo(r, i);
}
function tm({ primaryType: e, types: t }) {
  const n = Dn(nm({ primaryType: e, types: t }));
  return Ze(n);
}
function nm({ primaryType: e, types: t }) {
  let n = "";
  const r = ll({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function ll({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    ll({ primaryType: o.type, types: t }, n);
  return n;
}
function dl({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      Ze(ul({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, Ze(r)];
  if (n === "string")
    return [{ type: "bytes32" }, Ze(Dn(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => dl({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      Ze(Wo(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
function rm(e) {
  const t = Yu(e, 0, 1);
  if (t === "0x04")
    return "eip7702";
  if (t === "0x03")
    return "eip4844";
  if (t === "0x02")
    return "eip1559";
  if (t === "0x01")
    return "eip2930";
  if (t !== "0x" && Do(t) >= 192)
    return "legacy";
  throw new y0({ serializedType: t });
}
const ha = "bitcoin-taproot-keypath-v1", ya = "bip341-sighash-default-keypath", im = ["bitcoin", "testnet", "signet", "regtest"], Vi = 21000000n * 100000000n, fl = 137, pl = /^[0-9a-f]+$/, om = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", sm = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", am = 734539939, cm = 1;
function V(e) {
  throw new w("invalid_payload", e);
}
function ga(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && V(`${t} must be an object`), e;
}
function ba(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && V(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && V(`${n} is missing required fields: ${i.join(", ")}`);
}
function wr(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !pl.test(e)) && V(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function um(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && V(`${t} must be an integer in ${n}..${r}`), e;
}
function Re(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function Zt(e, t, n, r) {
  return t + n > e.length && V(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function dr(e, t, n) {
  t >= e.length && V(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && V(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function vi(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function lm(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function Sn(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function ma(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function hl(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  V("transaction output uses an unsupported script template");
}
function dm(e) {
  (e.length === 0 || e.length % 2 || e.length > fl * 2 || !pl.test(e)) && V("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (L) => Number.parseInt(L, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && V("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = dr(t, n, "input count");
  n = i, r !== 1 && V("transaction must contain exactly one input");
  const [o, s] = Zt(t, n, 32, "outpoint hash");
  n = s, o.every((L) => L === 0) && V("outpoint hash must not be null");
  const [a, c] = Zt(t, n, 4, "outpoint index");
  n = c;
  const u = vi(a), [l, d] = dr(t, n, "scriptSig length");
  n = d, l !== 0 && V("scriptSig must be empty");
  const [h, f] = Zt(t, n, 4, "sequence");
  n = f;
  const b = vi(h);
  b !== 4294967293 && b !== 4294967294 && b !== 4294967295 && V("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [g, p] = dr(t, n, "output count");
  n = p, g !== 1 && g !== 2 && V("transaction must contain one or two outputs");
  const y = [], x = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let L = 0; L < g; L += 1) {
    const [R, U] = Zt(t, n, 8, `output ${L} amount`);
    n = U;
    const j = lm(R);
    (j < 1n || j > Vi) && V(`output ${L} amount is outside the Bitcoin money range`);
    const [z, m] = dr(t, n, `output ${L} script length`);
    n = m;
    const [k, A] = Zt(t, n, z, `output ${L} script`);
    n = A;
    const v = hl(k);
    z !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[v] && V(`output ${L} script length is not canonical for ${v}`), j < x[v] && V(`output ${L} is below the V1 ${v} dust floor`), y.push({ amountSats: j, scriptPubKey: k, kind: v });
  }
  const [_, I] = Zt(t, n, 4, "locktime");
  n = I;
  const S = vi(_);
  S !== 0 && V("locktime must be exactly zero"), n !== t.length && V("transaction has trailing bytes");
  const O = y.reduce((L, R) => L + R.amountSats, 0n);
  return (O < 1n || O > Vi) && V("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: u, sequence: b, outputs: y, locktime: S };
}
function fm(e, t) {
  const n = ae(new TextEncoder().encode(e));
  return ae(Re(n, n, t));
}
function pm(e, t, n) {
  const r = Re(e.prevoutHashLe, Sn(e.prevoutIndex)), i = Re(new Uint8Array([n.length]), n), o = e.outputs.map((a) => Re(ma(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = Re(
    new Uint8Array([0, 0]),
    Sn(2),
    Sn(e.locktime),
    ae(r),
    ae(ma(t)),
    ae(i),
    ae(Sn(e.sequence)),
    ae(Re(...o)),
    new Uint8Array([0]),
    Sn(0)
  );
  return fm("TapSighash", s);
}
function hm(e) {
  return BigInt(`0x${Y(e)}`);
}
function wa(e) {
  return _c(ae(e));
}
function xa(e, t) {
  const n = Re(new Uint8Array([e]), t), r = ae(ae(n)).slice(0, 4), i = Re(n, r);
  let o = hm(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = om[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function ym(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function gm(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1) i >>> o & 1 && (n ^= t[o]);
  }
  return n >>> 0;
}
function Ei(e, t, n) {
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...ym(n, 8, 5)], o = [...r].map((u) => u.charCodeAt(0) >> 5).concat([0], [...r].map((u) => u.charCodeAt(0) & 31)), s = t === 0 ? cm : am, a = gm(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (u, l) => a >>> 5 * (5 - l) & 31);
  return `${r}1${i.concat(c).map((u) => sm[u]).join("")}`;
}
function bm(e, t) {
  const n = hl(t), r = e === "bitcoin";
  return n === "p2pkh" ? xa(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? xa(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? Ei(e, 0, t.slice(2)) : Ei(e, 1, t.slice(2));
}
function mm(e) {
  const t = wa(e), n = Re(new Uint8Array([0, 20]), t);
  return [
    Re(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    Re(new Uint8Array([169, 20]), wa(n), new Uint8Array([135]))
  ];
}
function Si(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function fr(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function wm(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function xm(e) {
  return Y(ae(ae(e.raw)).slice().reverse());
}
function vm(e, t) {
  const n = t.transaction, r = M("bitcoin.network", { network: e.network }), i = [
    M("bitcoin.title"),
    ...t.highFeeWarning ? [M("bitcoin.highFeeWarning"), ""] : [],
    r,
    M("bitcoin.networkWarning"),
    M("bitcoin.input", { txid: Y(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    M("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: fr(BigInt(e.prevout.amountSats)) }),
    M("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(M("bitcoin.output", {
      index: s + 1,
      address: bm(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: fr(o.amountSats),
      role: M(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    M("bitcoin.fee", { sats: t.feeSats.toString(), btc: fr(t.feeSats), rate: wm(t.feeSats, t.signedVsize) }),
    M("bitcoin.vsize", { vsize: t.signedVsize }),
    M(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    M("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: fr(t.netLeavingSats) }),
    M("bitcoin.unsignedTxid", { txid: xm(n) }),
    M("bitcoin.outputKey", { key: Y(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function Em(e, t) {
  const n = ga(e, "signingContext");
  ba(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== ha && V("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !im.includes(n.network)) && V("bitcoin signing_context network is invalid");
  const r = wr(n.unsignedTransaction, "unsignedTransaction");
  r.length > fl * 2 && V("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = ga(n.prevout, "signingContext.prevout");
  ba(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = um(i.amountSats, "prevout.amountSats", 1, Number(Vi)), s = wr(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || V("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== ya && V("unsupported Bitcoin digest algorithm");
  const a = wr(n.digest, "signingContext.digest", 64);
  return a !== t && V("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: ha,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: ya,
    digest: a
  };
}
function yl(e, t, n) {
  const r = Em(e, t), i = dm(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (g) => Number.parseInt(g, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const g = wr(n, "signing public key", 66);
    a = Uint8Array.from(g.match(/../g), (y) => Number.parseInt(y, 16)), a[0] !== 2 && a[0] !== 3 && V("signing public key must be compressed secp256k1");
    const p = Wh(g);
    Si(s, p) || V("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const g of i.outputs)
      mm(a).some((p) => Si(p, g.scriptPubKey)) && V("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((g, p) => Si(g.scriptPubKey, o) ? [p] : []);
  c.length > 1 && V("transaction may contain at most one same-key P2TR return output");
  const u = i.outputs.reduce((g, p) => g + p.amountSats, 0n), l = BigInt(r.prevout.amountSats) - u;
  l <= 0n && V("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, h = Math.ceil(d / 4);
  l > 10000n * BigInt(h) && V("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const f = Y(pm(i, BigInt(r.prevout.amountSats), o));
  f !== r.digest && V("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const b = c.reduce((g, p) => g + i.outputs[p].amountSats, 0n);
  return {
    digest: f,
    display: vm(r, {
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
const va = `avault-agent-operation:v1
`;
function Xt(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function Ea(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function ki(e, t) {
  const n = Ea(e), r = Ea(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function xr(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : nn(e);
}
function nn(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(nn).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${nn(t[n])}`).join(",")}}`;
}
const Sm = Vg([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]), km = {
  approve: "ERC-20/ERC-721 approve",
  transfer: "ERC-20 transfer",
  transferFrom: "ERC-20/ERC-721 transferFrom",
  permit: "ERC-20 permit",
  setApprovalForAll: "ERC-721 setApprovalForAll",
  safeTransferFrom: "ERC-721 safeTransferFrom",
  safeTransferFromWithData: "ERC-721 safeTransferFrom"
}, Am = new Map(
  Sm.map((e) => {
    const t = e.name === "safeTransferFrom" && e.inputs.length === 4 ? "safeTransferFromWithData" : e.name;
    return [Zb(e), { call: t, item: e }];
  })
);
function _m(e) {
  return `${e.name}(${e.inputs.map((t) => t.type).join(",")})`;
}
function Im(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e.toLowerCase();
}
const Bm = /* @__PURE__ */ new Set([
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
]), Pm = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function Ai(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function gl(e) {
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
function $m(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function Om(e) {
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
function Tm(e) {
  if (e.length < 10) return null;
  const t = Am.get(e.slice(0, 10));
  if (!t) return null;
  let n;
  try {
    if (n = n0(t.item.inputs, `0x${e.slice(10)}`), Wo(t.item.inputs, n).toLowerCase() !== `0x${e.slice(10)}`) return null;
  } catch {
    return null;
  }
  return {
    call: t.call,
    signature: _m(t.item),
    arguments: t.item.inputs.map((r, i) => ({
      name: r.name ?? `arg${i}`,
      type: r.type,
      value: xr(n[i])
    }))
  };
}
function Lm(e, t, n) {
  const r = gl(e), i = Im(e.data), o = (c) => (t[c] === void 0 ? 0n : t[c]).toString(), s = e.to === void 0 || e.to === null || e.to === "" ? null : String(e.to), a = s === null ? null : Tm(i);
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
function Rm(e) {
  const t = [M("evm.title", { chainId: e.chainId })];
  if (e.blindSigning && t.push(M("sign.blindNotice")), t.push(
    M("evm.type", { type: e.type }),
    e.to === null ? M("evm.contractCreation") : M("evm.to", { to: e.to }),
    M("evm.value", { value: e.value }),
    M("evm.nonce", { value: e.nonce }),
    M("evm.gas", { value: e.gas })
  ), e.gasPrice !== void 0 && t.push(M("evm.gasPrice", { value: e.gasPrice })), e.maxFeePerGas !== void 0 && t.push(M("evm.maxFeePerGas", { value: e.maxFeePerGas })), e.maxPriorityFeePerGas !== void 0 && t.push(M("evm.maxPriorityFeePerGas", { value: e.maxPriorityFeePerGas })), e.decoded) {
    t.push(M("evm.call", { call: `${km[e.decoded.call]} ${e.decoded.signature}` }));
    for (const n of e.decoded.arguments) t.push(`  ${n.name} (${n.type}): ${n.value}`);
  }
  return t.push(
    e.selector === null ? M("evm.selectorNone") : M("evm.selector", { selector: e.selector }),
    e.calldata === "0x" ? M("evm.calldataNone") : M("evm.calldata", { bytes: e.calldataBytes, calldata: e.calldata })
  ), t.join(`
`);
}
function Cm(e) {
  du(e);
  const t = Xt(e), n = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"]
  }, r = Object.hasOwn(n, e.kind) ? n[e.kind] : void 0;
  if (!r) throw new Error("unsupported signing context");
  if (Ai(t, new Set(r), "signing context"), typeof e.digest != "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(e.digest))
    throw new Error("signing context digest must be 32 bytes");
  switch (e.kind) {
    case "evm-transaction": {
      if (e.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm");
      const i = Xt(e.unsignedTransaction);
      Ai(i, Bm, "EVM transaction"), $m(e, i), gl(i);
      const o = Om(i), s = M0(o), a = ki(e.digest, Ze(s)), c = Lm(i, o, s);
      if (rm(s) !== c.type) throw new Error("EVM transaction type does not match its serialization");
      return {
        digest: a,
        challenge: Ge(a),
        display: Rm(c),
        evm: c
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = Xt(e.typedData);
      Ai(i, Pm, "EIP-712 typed data");
      const o = Xt(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = ki(e.digest, Q0(i));
      return {
        digest: s,
        challenge: Ge(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${xr(o.chainId)}`,
          `domain.verifyingContract: ${xr(o.verifyingContract)}`,
          `domain: ${nn(o)}`,
          `types: ${nn(Xt(i.types))}`,
          `primaryType: ${xr(i.primaryType)}`,
          `message: ${nn(Xt(i.message))}`
        ].join(`
`)
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith(va) || e.canonicalPreimage.slice(va.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = ki(e.digest, sh(ae(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: Ge(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = yl(e, e.digest);
      return {
        digest: i.digest,
        challenge: Ge(i.digest),
        display: i.display
      };
    }
    default:
      throw new Error("unsupported signing context");
  }
}
function Yt(e, t) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new w("invalid_payload", `${t} must be an object`);
  return e;
}
function pr(e, t) {
  if (typeof e != "string" || e.length === 0) throw new w("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Bn(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new w("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function ts(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) ts(t);
    Object.freeze(e);
  }
  return e;
}
function zm(e) {
  const t = Yt(e, "sign request");
  du(t);
  const n = Yt(structuredClone(t), "sign request");
  Bn(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = Yt(n.material, "material");
  Bn(r, ["name", "envelope"], "material");
  const i = Yt(r.envelope, "envelope");
  Bn(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = Uo(n.context);
  Bn(Yt(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = po(n.scheme);
  } catch {
    throw new w("invalid_payload", "unsupported signing scheme");
  }
  return ts({
    material: {
      name: pr(r.name, "material.name"),
      envelope: {
        ciphertext: pr(i.ciphertext, "envelope.ciphertext"),
        nonce: pr(i.nonce, "envelope.nonce"),
        wrap_meta: pr(i.wrap_meta, "envelope.wrap_meta")
      }
    },
    scheme: s,
    signingContext: Yt(n.signingContext, "signingContext"),
    context: o
  });
}
function Sa() {
  throw new w("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request");
}
function bl(e, t, n) {
  Ni({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && Sa(), Bn(r, ["name", "scheme", "digest", "publicKey", "signingContext"], "sign context.release"), (r.name !== e.material.name || r.scheme !== e.scheme || r.digest !== t || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || It(r.signingContext) !== It(e.signingContext)) && Sa();
}
function Um(e, t) {
  if (po(e), !/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === fo ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === Un ? M("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === Xr ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function Nm(e) {
  const t = zm(e);
  let n = Cm(t.signingContext);
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    if (t.scheme !== Un)
      throw new w("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (t.scheme === Un)
      throw new w("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (t.signingContext.kind !== "avault-agent-operation" && t.scheme !== Xr && t.scheme !== lo)
      throw new w("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  const r = an(t.material.envelope), i = yo(t.material.name, r.recordMetadata);
  if (i.kind !== "keypair" || !i.publicKey) throw new Error("protected signing requires a keypair protected record");
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const a = yl(t.signingContext, n.digest, i.publicKey);
    n = { digest: a.digest, challenge: n.challenge, display: a.display };
  }
  bl(t, n.digest, i.publicKey);
  const o = `${Um(t.scheme, i.publicKey)}
scheme: ${t.scheme}
${n.display}`, s = ae(new TextEncoder().encode(Qr(t.context)));
  return ts({ request: t, verified: { digest: n.digest, display: o }, unpacked: r, recordContext: i, challenge: [...s] });
}
async function ml(e, t, n) {
  const r = await bo(n, t);
  Fr({ context: e.request.context, rootMetadata: r, expectedPurpose: "sign" }), bl(e.request, e.verified.digest, e.recordContext.publicKey), Kr([e.request.context]);
}
async function Hm(e, t, n) {
  return await ml(e, t, n), Ch(e.unpacked.sealed, t, e.recordContext, e.verified.digest, e.request.scheme);
}
function wl(e) {
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
async function Mm(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await Uc(t, e.vmk, n);
    return { envelope: Mc(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function Fm(e) {
  const t = Lh();
  let n = t.privateKey;
  try {
    const r = { name: e.name, kind: "keypair", publicKey: t.publicKey }, i = await Uc(n, e.vmk, r);
    return {
      envelope: Mc(i, e.wrapMeta, r),
      publicKey: t.publicKey,
      addresses: Zh(t.publicKey)
    };
  } finally {
    n?.fill(0), n = void 0;
  }
}
function xl(e) {
  return (e?.kind ?? "static") === "static";
}
function Km(e, t) {
  if (typeof e != "object" || e === null) throw new w("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: Uo(n.context)
  };
}
function vl(e) {
  const t = e[0]?.context.display;
  if (!t) throw new w("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new w("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = na(e[0].context), r = ka(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new w("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if (na(s.context) !== n)
      throw new w("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (ka(s.context) !== r)
      throw new w("invalid_context", "approveRelease batch contexts must share one signed recipient");
  }
  const i = new Set(t.secrets.map((s) => `${s.name}:${s.kind}`));
  for (const s of e) {
    const { recordMetadata: a } = an(s.material.envelope), c = a?.kind ?? "static";
    if (!i.has(`${s.material.name}:${c}`))
      throw new w("invalid_context", "signed display block does not cover every release item");
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
function ka(e) {
  if (!e.grantId) throw new w("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new w("invalid_context", "agent delivery context is missing agent key");
  return It({ agent: e.agent, grantId: e.grantId });
}
async function Dm(e) {
  if (e.items.length === 0) throw new w("invalid_payload", "approveRelease requires at least one item");
  const t = vl(e.items), n = await bo(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    Fr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  Kr(r, e.now);
  const i = await ng(r);
  await e.confirm({
    ...t,
    challenge: i
  });
  const o = e.now ?? Date.now();
  for (const a of e.items)
    Fr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: o
    });
  e.onApprovalAccepted?.(o), Kr(r, o);
  const s = [];
  for (const a of e.items) {
    const { sealed: c, recordMetadata: u } = an(a.material.envelope);
    if (!xl(u)) throw new w("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await Th(
        c,
        e.vmk,
        tg(a.context),
        yo(a.material.name, u),
        await eg(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await ei(r, o), { blindBoxes: s };
}
const El = `avibe-vault-setup:v1:${re.buildHash}:`, jm = `avibe-vault-setup-result:${re.buildHash}:`, Vm = `avibe-vault-setup-error:${re.buildHash}:`, qm = 300 * 1e3, Gm = 300 * 1e3, Wm = 30 * 1e3, Zm = 8 * 1e3, ke = new Kl();
let Aa = !1;
function Xm(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function Sl(e) {
  if (!Xm(e))
    throw new w("invalid_payload", "appearance must include locale and theme");
  return e;
}
function Ym(e) {
  return e == null ? null : Sl(e);
}
function oi(e) {
  const t = By(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && Oy();
}
function kl() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: Py(), theme: e };
}
function ve(e) {
  if (typeof e != "object" || e === null)
    throw new w("invalid_payload", "request payload must be an object");
  return e;
}
function Al(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new w("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function we(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new w("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function _l(e, t) {
  if (typeof e != "object" || e === null) throw new w("invalid_payload", `${t} must be an object`);
  return e;
}
function Jm(e) {
  const t = _l(e, "envelope");
  return {
    ciphertext: we(t.ciphertext, "envelope.ciphertext"),
    nonce: we(t.nonce, "envelope.nonce"),
    wrap_meta: we(t.wrap_meta, "envelope.wrap_meta")
  };
}
function Il(e) {
  const t = _l(e, "material");
  return { name: we(t.name, "material.name"), envelope: Jm(t.envelope) };
}
function Qm(e) {
  const t = e == null ? {} : ve(e);
  return { wrapMeta: Al(t.wrapMeta, "wrapMeta") };
}
function Bl(e) {
  const t = ve(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new w("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: we(t.vaultUserHandle, "vaultUserHandle"),
    displayName: we(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: Eo(t.policy) } : {}
  };
}
function ew(e) {
  const t = ve(e);
  return {
    wrapMeta: we(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: Eo(t.policy) } : {}
  };
}
function tw(e) {
  const t = ve(e);
  return { material: Il(t.material), context: Uo(t.context) };
}
function nw(e) {
  const t = ve(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new w("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => Km(n, Il)) };
}
function rw(e) {
  const t = ve(e);
  if (t.operation !== "delete_secret") throw new w("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: we(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: we(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function Pl() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function _a(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function iw(e) {
  return new Promise((t, n) => {
    const r = () => {
      n(yn(e));
    };
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function ow(e) {
  for (const t of e)
    if (t.aborted) return yn(t);
  return new Error("operation-superseded");
}
function $l(e) {
  const t = new AbortController(), n = [], r = (i) => {
    t.signal.aborted || t.abort(yn(i));
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
async function Ol(e) {
  const t = $l(e.abortSignals);
  try {
    await Promise.race([
      Ey(ho(e.wrapMeta), dt(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? ow(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => iw(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function ns(e) {
  await Wn(async (t) => {
    const n = async (i) => {
      const o = $l([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await pw(
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
          await lu({
            wrapMeta: e.wrapMeta,
            currentRpId: dt(),
            assertion: {
              prfOutput: de(s.prfOutput),
              prfSalt: de(s.prfSalt)
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
    await Co(
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
function sw(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: J(t) } : {}
  };
}
function Ut(e, t) {
  if (typeof e == "string" && e.length > 0) return e;
  const n = ve(e);
  if (n && typeof n.text == "string") return ue(n.text);
  if (n && typeof n.key == "string") {
    const r = n.params;
    if (r !== void 0 && (typeof r != "object" || r === null || Array.isArray(r)))
      throw new w("invalid_payload", `${t}.params must be an object`);
    return {
      key: n.key,
      ...r !== void 0 ? { params: r } : {}
    };
  }
  throw new w("invalid_payload", `${t} must be a text spec`);
}
function aw(e) {
  if (e === void 0) return;
  const t = ve(e);
  if (!t || !Array.isArray(t.rows)) throw new w("invalid_payload", "details must contain rows");
  const n = [];
  for (const [r, i] of t.rows.entries()) {
    const o = ve(i);
    if (!o) throw new w("invalid_payload", `details.rows[${r}] must be an object`);
    const s = o.variant;
    if (s !== void 0 && s !== "text" && s !== "command" && s !== "mono" && s !== "chips")
      throw new w("invalid_payload", `details.rows[${r}].variant is invalid`);
    const a = Ut(o.label, `details.rows[${r}].label`);
    if (s === "chips") {
      if (!Array.isArray(o.values)) throw new w("invalid_payload", `details.rows[${r}].values must be an array`);
      const c = o.tone;
      if (c !== void 0 && c !== "default" && c !== "warning")
        throw new w("invalid_payload", `details.rows[${r}].tone is invalid`);
      const u = c === "default" || c === "warning" ? c : void 0;
      n.push({
        label: a,
        values: o.values.map((l, d) => Ut(l, `details.rows[${r}].values[${d}]`)),
        variant: "chips",
        ...u !== void 0 ? { tone: u } : {}
      });
      continue;
    }
    n.push({
      label: a,
      value: Ut(o.value, `details.rows[${r}].value`),
      ...s !== void 0 ? { variant: s } : {}
    });
  }
  return {
    rows: n
  };
}
function cw(e) {
  const t = ve(e);
  if (!t) throw new w("invalid_payload", "authorization prompt must be an object");
  const n = t.challenge === void 0 ? void 0 : de(we(t.challenge, "prompt.challenge"));
  return {
    title: Ut(t.title, "prompt.title"),
    subtitle: Ut(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Ut(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: aw(t.details) } : {},
    ...n ? { challenge: n } : {},
    label: Ut(t.label, "prompt.label")
  };
}
function uw(e) {
  return {
    ...e,
    prompt: sw(e.prompt)
  };
}
function lw(e) {
  const t = ve(e);
  if (!t) throw new w("invalid_payload", "authorization request must be an object");
  const n = t.passkey;
  if (n !== "none" && n !== "unlock" && n !== "uv")
    throw new w("invalid_payload", "authorization passkey requirement is invalid");
  return {
    prompt: cw(t.prompt),
    wrapMeta: we(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function dw(e) {
  return $a("authorize", e, kl());
}
function fw(e) {
  const t = ve(e);
  if (!t) throw new w("authorization_result_invalid", "authorization result is invalid");
  if (t.kind === "confirmed") return { kind: "confirmed" };
  if (t.kind === "unlock")
    return {
      kind: "unlock",
      prfOutput: we(t.prfOutput, "result.prfOutput"),
      prfSalt: we(t.prfSalt, "result.prfSalt")
    };
  throw new w("authorization_result_invalid", "authorization result kind is invalid");
}
function pw(e, t, n) {
  Nt(t);
  const r = n ?? Pl(), i = `avibe-vault-authorization-${r}`;
  return new Promise((o, s) => {
    let a = null, c = !1, u = null, l = null, d = null, h = null;
    const f = () => x(() => s(yn(t))), b = () => x(() => s(new w("authorization_cancelled", "requesting sandbox was unloaded", !0))), g = () => new w("authorization_window_closed", "authorization window was closed", !0), p = (_) => {
      a = _, l = setInterval(() => {
        !_.closed || d || (d = setTimeout(() => x(() => s(g())), 2500));
      }, 500);
    }, y = (_) => {
      if (_.origin !== window.location.origin) return;
      const I = _.data;
      if (!(!I || I.id !== r || !Jt(I.build)) && (!a && n && I.type === "authorization-ready" && _.source && (h && clearTimeout(h), h = null, p(_.source)), _.source === a))
        if (I.type === "authorization-ready")
          try {
            a?.postMessage(
              {
                type: "authorization-request",
                build: re,
                id: r,
                request: uw(e)
              },
              window.location.origin
            );
          } catch (S) {
            x(() => s(S));
          }
        else if (I.type === "authorization-approved")
          try {
            const S = fw(I.result);
            x(() => o(S));
          } catch (S) {
            x(() => s(S));
          }
        else I.type === "authorization-error" && x(() => s(new w(I.code, I.message, !!I.retryable)));
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
      h = setTimeout(() => x(() => s(g())), Wm);
    else {
      const _ = window.open(dw(r), i, "popup,width=520,height=760");
      if (!_) {
        x(() => s(new w("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      _.focus(), p(_);
    }
    if (u = setTimeout(
      () => x(() => s(new w("authorization_window_timeout", "authorization window timed out", !0))),
      Gm
    ), t) {
      if (t.aborted) {
        f();
        return;
      }
      t.addEventListener("abort", f, { once: !0 });
    }
  });
}
function hw(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? Mn("context.minutes", { count: e / 60 }) : Mn("context.seconds", { count: e });
}
function dn(e, t) {
  const n = [];
  e.sessionLabel && n.push({ label: "context.session", value: ue(e.sessionLabel) }), e.command && n.push({ label: "context.command", value: ue(e.command), variant: "command" }), e.egress && n.push({ label: "context.egress", value: ue(e.egress) });
  const r = [
    ...e.source?.env?.map((i) => ue(`${M("context.sourceEnv")}: ${i}`)) ?? [],
    ...e.source?.tags?.map((i) => ue(`${M("context.sourceTag")}: ${i}`)) ?? [],
    ...e.source?.skills?.map((i) => ue(`${M("context.sourceSkill")}: ${i}`)) ?? []
  ];
  return r.length > 0 && n.push({ label: "context.source", values: r, variant: "chips" }), t?.agentFingerprint && n.push({ label: "context.agent", value: ue(t.agentFingerprint), variant: "mono" }), t?.grantId && n.push({ label: "context.grant", value: ue(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && n.push({ label: "context.agentAccess", value: hw(e.grantTtlSeconds) }), n.push({
    label: "context.secrets",
    values: e.secrets.map(
      (i) => ue(`${i.name} · ${M(i.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: n };
}
function yw(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function gw(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function Tl(e, t) {
  return yw(e) ? !0 : gw(e) && lt(t).state === "locked";
}
async function bw(e, t = xe(), n) {
  await uu({ wrapMeta: e, currentRpId: dt(), policy: t, abortSignal: n });
}
async function mw(e, t = xe()) {
  await Wn((n) => bw(e, t, n));
}
async function Ll(e) {
  try {
    await ns({ ...e, passkey: "unlock" });
  } catch (t) {
    throw lt(e.wrapMeta).state === "unlocked" && Ue({ broadcast: !0, reason: "manual-lock" }), t;
  }
}
async function ww(e, t) {
  if (lt(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await mw(e);
  }
  return await _o(t, { renewOnSuccess: !0 });
}
async function Rl(e) {
  const t = lt(e.wrapMeta).state, n = xe(), r = wl({ tier: e.tier, vaultState: t, policy: n });
  let i = !1;
  const o = async () => {
    await Ll({
      ...e.lockedPrompt,
      wrapMeta: e.wrapMeta,
      policy: n,
      parentSurface: e.parentSurface,
      authorizationWindow: e.authorizationWindow
    }), i = !0;
  }, s = async (a, c = !1) => {
    let u = !1;
    try {
      const l = await _o(
        async (d, h, f) => {
          const b = await e.buildPrompt(d, h, f);
          return r.confirm && !c && (await ns({
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
      throw i && !u && lt().state === "unlocked" && Ue({ broadcast: !0, reason: "manual-lock" }), l;
    }
  };
  try {
    return r.passkey === "unlock" ? (await o(), await s("none", !0)) : await s(r.passkey === "uv" ? "uv" : "none");
  } catch (a) {
    if (r.passkey !== "unlock" && Tl(a, e.wrapMeta))
      return await o(), await s("none", !0);
    throw a;
  }
}
function He(e, t) {
  if (e instanceof w) return e;
  if (_y(e)) return new w("passkey_cancelled", "passkey-cancelled", !0);
  const n = e instanceof Error ? e.message : t;
  switch (n) {
    case "passkey-cancelled":
      return new w("passkey_cancelled", n, !0);
    case "passkey-prf-unavailable":
      return new w("passkey_prf_unavailable", n);
    case "passkey-not-configured":
      return new w("passkey_not_configured", n);
    case "passkey-multiple-not-supported":
      return new w("passkey_multiple_not_supported", n);
    case "vault-operation-aborted":
      return new w("vault_operation_aborted", n, !0);
    default:
      return new w(t, n);
  }
}
function xw(e) {
  return J(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function vw(e) {
  return Bl(JSON.parse(new TextDecoder().decode(de(e))));
}
function Ew(e, t) {
  return $a("setup", e, kl(), { req: xw(t) });
}
function _i(e) {
  const t = ve(e);
  return {
    credentialId: we(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function si(e) {
  return `${jm}${e}`;
}
function ai(e) {
  return `${Vm}${e}`;
}
function Ia(e) {
  try {
    localStorage.removeItem(si(e)), localStorage.removeItem(ai(e));
  } catch {
  }
}
function Sw(e, t) {
  try {
    localStorage.setItem(si(e), JSON.stringify({ build: re, result: t })), localStorage.removeItem(ai(e));
  } catch {
  }
}
function kw(e, t) {
  try {
    localStorage.setItem(
      ai(e),
      JSON.stringify({ build: re, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(si(e));
  } catch {
  }
}
function Cl(e) {
  if (window.self === window.top)
    return Po({
      rpId: dt(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = Pl(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${El}${t}`);
  let r = null;
  return Ia(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, u = null;
    const l = () => d(() => o(new w("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (g) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), u && clearTimeout(u), window.removeEventListener("visibilitychange", f), window.removeEventListener("focus", f), window.removeEventListener("storage", f), window.removeEventListener("message", b), window.removeEventListener("pagehide", l), n?.close(), Ia(t);
        try {
          r?.close();
        } catch {
        }
        g();
      }
    }, h = () => {
      let g = null, p = null;
      try {
        g = localStorage.getItem(si(t)), p = localStorage.getItem(ai(t));
      } catch {
        return !1;
      }
      if (g) {
        try {
          const y = ve(JSON.parse(g));
          if (!Jt(y.build)) throw new w("sandbox_build_mismatch");
          const x = _i(y.result);
          d(() => i(x));
        } catch (y) {
          const x = y instanceof Error ? y.message : "stored setup result is invalid";
          d(() => o(new w("setup_storage_invalid", x)));
        }
        return !0;
      }
      if (p) {
        try {
          const y = ve(JSON.parse(p));
          if (!Jt(y.build)) throw new w("sandbox_build_mismatch");
          d(
            () => o(new w(we(y.code, "code"), Al(y.message, "message"), !!y.retryable))
          );
        } catch (y) {
          const x = y instanceof Error ? y.message : "stored setup error is invalid";
          d(() => o(new w("setup_storage_invalid", x)));
        }
        return !0;
      }
      return !1;
    }, f = () => {
      h();
    }, b = (g) => {
      if (g.origin !== window.location.origin || g.source !== r) return;
      const p = g.data;
      !p || p.id !== t || !Jt(p.build) || (p.type === "setup-created" ? d(() => i(_i(p.result))) : p.type === "setup-error" && d(() => o(new w(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      h() || d(() => o(new w("setup_window_timeout", "setup window timed out", !0)));
    }, qm), c = setInterval(() => {
      !r?.closed || u || h() || (u = setTimeout(() => {
        h() || d(() => o(new w("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (g) => {
      const p = g.data;
      !p || p.id !== t || !Jt(p.build) || (p.type === "setup-created" ? d(() => i(_i(p.result))) : p.type === "setup-error" && d(() => o(new w(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", f), window.addEventListener("focus", f), window.addEventListener("storage", f), window.addEventListener("message", b), window.addEventListener("pagehide", l, { once: !0 }), r = window.open(Ew(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
      d(() => o(new w("setup_popup_blocked", "setup window was blocked", !0)));
      return;
    }
    r.focus();
  });
}
function yn(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Nt(e) {
  if (e?.aborted) throw yn(e);
}
function Aw() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function Ba(e) {
  return Aw() && su(e);
}
async function zl(e, t, n, r, i = xe()) {
  const o = uh();
  let s, a;
  try {
    Nt(r), s = (await Bo([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, Nt(r), a = ch();
    const u = await fh(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    Nt(r);
    let l = yh(u, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (l = mh(l, await bh(a, e.rootMetadata, l)), Nt(r));
    const d = tu({
      vmk: a,
      wrapMeta: l,
      freshSetup: !e.existingProtectedVault,
      scopeId: ny(e.vaultUserHandle),
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
function _w(e, t, n) {
  return Wn((r) => {
    const i = To(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody"
    ), o = Fn("setup.createPasskey"), s = cu("setup.ready");
    return Qt(i.card, o), Qt(i.card, s), new Promise((a, c) => {
      let u = !1, l = "create", d = null, h = !1;
      const f = (S) => {
        u || (u = !0, r.removeEventListener("abort", p), Lo(), S());
      }, b = (S) => {
        f(() => c(S));
      }, g = (S) => {
        u || (l = "create", d = null, W(o, "setup.createPasskey"), o.disabled = !1, W(s, S));
      }, p = () => {
        b(yn(r));
      }, y = (S) => {
        if (S instanceof w && S.code === "setup_popup_blocked") {
          g("setup.popupBlocked");
          return;
        }
        b(S);
      }, x = () => {
        h = !0, o.disabled = !0, W(s, "setup.popupPrompt");
        let S;
        try {
          S = Cl(e);
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
        o.disabled = !0, W(s, "setup.passkeyPrompt"), zl(e, t, S, r, n).then(
          (O) => f(() => a(O)),
          (O) => b(O)
        );
      }, I = () => {
        o.disabled = !0, W(s, "setup.passkeyPrompt");
        let S;
        try {
          S = Po({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (O) {
          if (Ba(O)) {
            x();
            return;
          }
          b(O);
          return;
        }
        S.then(
          (O) => _(O),
          (O) => {
            if (Ba(O)) {
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
async function Iw(e) {
  const t = Bl(e);
  try {
    const n = dt(), r = t.policy ?? xe(), i = window.self !== window.top ? await _w(t, n, r) : await zl(t, n, await Cl(t), void 0, r), o = t.policy ? So(r) : xe();
    return { ...i, policy: o };
  } catch (n) {
    throw He(n, "setup_failed");
  }
}
async function Bw(e) {
  const t = ew(e);
  try {
    const n = dt(), r = t.policy ?? xe(), i = await Wn(async (s) => {
      let a;
      if (await Co(
        {
          title: "unlock.sessionTitle",
          subtitle: Mn("unlock.sessionSubtitle", {
            minutes: r.windowSeconds / 60
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue"
        },
        s,
        void 0,
        async () => {
          a = await uu({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? So(r) : xe();
    return { ...i, policy: o };
  } catch (n) {
    throw He(n, "unlock_failed");
  }
}
async function Pw(e) {
  const t = Ky(e);
  t.wrapMeta && Io(t.wrapMeta);
  try {
    if (t.kind === "static" && !xe().parentValueSealAllowed)
      throw new w("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await ww(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await Mm({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await Fm({ name: t.name, vmk: n, wrapMeta: r }), establishingVmk: uy() }));
  } catch (n) {
    throw He(n, "seal_failed");
  }
}
async function $w(e, t) {
  const n = tw(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = an(n.material.envelope);
    if (o?.kind === "keypair") throw new Error("keypair protected records cannot be revealed as plaintext");
    return Ni({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await Rl({
      tier: "R2",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: ue(n.material.name),
        body: "reveal.confirmBody",
        details: dn(n.context.display),
        label: "common.continue"
      },
      buildPrompt: async (s, a) => {
        const c = await bo(a, s);
        return Fr({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), Ni({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), Kr([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: ue(n.material.name),
          body: "reveal.confirmBody",
          details: dn(n.context.display),
          challenge: await _a(Qr(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const u = await Hc(r, s, yo(n.material.name, o));
        try {
          c.assertCurrent(), await ei([n.context]), await Ny({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: xe().strictApprovals ? async (l) => {
              await Ol({
                wrapMeta: a,
                challenge: await _a(`reveal-copy:${n.context.requestId}:${n.material.name}`),
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
    throw He(r, "reveal_failed");
  }
}
async function Ow(e, t) {
  try {
    const n = Nm(e), { request: r, verified: i, unpacked: { vmkWrapMeta: o } } = n;
    return await Rl({
      tier: "R3",
      wrapMeta: o,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "sign.title",
        subtitle: ue(r.material.name),
        body: ue(i.display),
        details: dn(r.context.display),
        label: "sign.confirm"
      },
      buildPrompt: async (s, a) => (await ml(n, s, a), {
        title: "sign.title",
        subtitle: ue(r.material.name),
        body: ue(i.display),
        details: dn(r.context.display),
        challenge: new Uint8Array(n.challenge),
        label: "sign.confirm"
      }),
      operation: (s, a) => Hm(n, s, a),
      beforeSuccess: () => ei([r.context])
    });
  } catch (n) {
    throw He(n, "sign_failed");
  }
}
async function Tw(e, t) {
  const n = nw(e);
  try {
    const i = an(n.items[0].material.envelope).vmkWrapMeta;
    for (const h of n.items) {
      const f = an(h.material.envelope);
      if (f.vmkWrapMeta !== i) throw new w("invalid_payload", "approveRelease items must share one VMK context");
      if (!xl(f.recordMetadata)) throw new w("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = vl(n.items), s = lt(i).state, a = xe(), c = wl({ tier: "R2", vaultState: s, policy: a });
    let u = !1;
    const l = async () => {
      await Ll({
        title: "release.title",
        subtitle: Mn("release.subtitle", { count: n.items.length }),
        details: dn(o.display, o.recipient),
        label: "release.confirm",
        wrapMeta: i,
        policy: a,
        parentSurface: t.latestSurface,
        authorizationWindow: t.takeAuthorizationWindow
      }), u = !0;
    }, d = async (h, f = !1) => {
      let b = !1, g;
      try {
        const p = await _o(
          async (y, x, _) => {
            const I = await Dm({
              items: n.items,
              vmk: y,
              wrapMeta: x,
              consumeReplayIds: !1,
              onApprovalAccepted: (S) => {
                g = S;
              },
              confirm: (S) => !c.confirm || f ? Promise.resolve() : ns({
                title: "release.title",
                subtitle: Mn("release.subtitle", { count: n.items.length }),
                details: dn(S.display, S.recipient),
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
            beforeSuccess: () => ei(n.items.map((y) => y.context), g)
          }
        );
        return b = !0, p;
      } catch (p) {
        throw u && !b && lt().state === "unlocked" && Ue({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await l(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (h) {
      if (c.passkey !== "unlock" && Tl(h, i))
        return await l(), await d("none", !0);
      throw h;
    }
  } catch (r) {
    throw He(r, "approve_release_failed");
  }
}
async function Lw(e) {
  const t = rw(e);
  try {
    const n = await Sy(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw He(n, "delete_authz_failed");
  }
}
function Rw() {
  const e = qi();
  if (e.get("mode") !== "setup") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && oi({ locale: t, theme: n });
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
    h = vw(d);
  } catch {
    u.disabled = !0, W(l, "setup.requestInvalid");
    return;
  }
  const f = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${El}${r}`), b = (g) => {
    const p = He(g, "setup_create_failed"), y = {
      type: "setup-error",
      build: re,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    kw(r, p), f?.postMessage(y);
    try {
      window.opener?.postMessage(y, window.location.origin);
    } catch {
    }
    u.disabled = !1, W(l, ue(p.message));
  };
  u.addEventListener("click", () => {
    u.disabled = !0, W(l, "setup.passkeyPrompt");
    let g;
    try {
      g = Po({
        rpId: dt(),
        vaultUserHandle: h.vaultUserHandle,
        displayName: h.displayName,
        authzCreationOptions: h.authzCreationOptions
      });
    } catch (p) {
      b(p);
      return;
    }
    g.then((p) => {
      const y = { type: "setup-created", build: re, id: r, result: p };
      Sw(r, p), f?.postMessage(y);
      try {
        window.opener?.postMessage(y, window.location.origin);
      } catch {
      }
      W(l, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(b);
  });
}
function Cw() {
  const e = qi();
  if (e.get("mode") !== "authorize") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && oi({ locale: t, theme: n });
  const r = e.get("id"), o = document.getElementById("page")?.querySelector(".card"), s = o?.querySelector(".body");
  if (!r || !o || !s || (s.classList.add("waiting"), W(s, window.opener ? "authorize.waiting" : "authorize.waitingLong"), !window.opener)) return;
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
  const h = setTimeout(() => W(s, "authorize.waitingLong"), Zm), f = () => {
    if (!l)
      for (const p of a())
        try {
          p.postMessage({ type: "authorization-ready", build: re, id: r }, window.location.origin);
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
        if (!p.prompt.challenge) throw new w("invalid_payload", "authorization challenge is missing");
        await Ol({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [y.signal]
        });
        return;
      }
      const I = await Bo(ho(p.wrapMeta), dt(), y.signal);
      x = {
        kind: "unlock",
        prfOutput: J(I.prfOutput),
        prfSalt: J(I.prfSalt)
      }, I.prfOutput.fill(0);
    };
    Co(
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
        u({ type: "authorization-approved", build: re, id: r, result: x }), setTimeout(() => window.close(), 250);
      },
      (I) => {
        const S = He(I, I instanceof Error && I.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed");
        u({
          type: "authorization-error",
          build: re,
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
    if (!y || y.type !== "authorization-request" || y.id !== r || !Jt(y.build)) return;
    const x = a().find((_) => _ === p.source);
    if (x) {
      c = x;
      try {
        b(lw(y.request));
      } catch (_) {
        const I = He(_, "authorization_request_invalid");
        u({
          type: "authorization-error",
          build: re,
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
function zw() {
  if (window.self !== window.top || qi().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && W(e, "sandbox.intro");
}
ke.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new w("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== re.buildHash)
    throw new w("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = Ym(t.appearance);
  r && oi(r);
  const i = Aa ? xe() : So(t.policy === void 0 ? void 0 : Eo(t.policy));
  return Aa = !0, {
    accepted: !0,
    channel: Lt,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: re,
    policy: i
  };
});
ke.register("set-appearance", (e) => (oi(Sl(e)), { accepted: !0 }));
ke.register("status", (e) => {
  const t = Qm(e);
  try {
    t.wrapMeta && lt(t.wrapMeta);
    const n = lt(), r = xe();
    return {
      ...n,
      policy: r,
      session: {
        ...n.expiresAt !== void 0 ? { expiresAt: n.expiresAt } : {},
        strict: r.strictApprovals
      }
    };
  } catch (n) {
    throw He(n, "invalid_wrap_meta");
  }
});
ke.register("setup", Iw);
ke.register("unlock", Bw);
ke.register("lock", () => ({ ...Ue({ broadcast: !0, reason: "manual-lock" }), policy: xe() }));
ke.register("seal", Pw);
ke.register("reveal", $w);
ke.register("sign", Ow);
ke.register("approveRelease", Tw);
ke.register("deleteAuthzAssertion", Lw);
ey((e) => ke.emit("vault.state", e));
Ty((e) => ke.emit(e));
await Dl();
ke.start();
window.addEventListener("pagehide", ly);
Rw();
Cw();
zw();
window.self !== window.top && document.body.classList.add("embedded");
const Ul = globalThis.crypto, Uw = { webcrypto: Ul }, Nl = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Uw,
  webcrypto: Ul
}, Symbol.toStringTag, { value: "Module" }));
