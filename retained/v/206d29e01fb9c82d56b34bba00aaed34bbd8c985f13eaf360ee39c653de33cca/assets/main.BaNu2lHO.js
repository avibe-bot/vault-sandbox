const Nn = "avibe.vault.crypto";
const de = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "206d29e01fb9c82d56b34bba00aaed34bbd8c985f13eaf360ee39c653de33cca"
};
class A extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function id(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function Pg(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === Nn && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const Og = /^[A-Za-z0-9_-]{16,128}$/;
function $f(e) {
  return typeof e == "object" && e !== null;
}
function Rg(e) {
  return $f(e) ? e.channel === Nn && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class Cg {
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
        channel: Nn,
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
      channel: Nn,
      version: 2,
      build: de,
      capabilities: {
        operations: Array.from(this.handlers.keys())
      }
    });
  }
  async onMessage(t) {
    if (window.parent === window || t.source !== window.parent || !id(t.origin)) return;
    if (Rg(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!Pg(t.data)) return;
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
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !Og.test(n.authorizationWindow))) {
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
        channel: Nn,
        version: 2,
        id: n.id,
        ok: !0,
        result: c
      });
    } catch (c) {
      const l = c instanceof A ? c.code : "internal_error", u = c instanceof A ? c.retryable : !1, d = c instanceof A ? c.message : void 0;
      this.reply(t.source, this.fail(n.id, l, d, u)), r && this.clearPin();
    } finally {
      this.activeSurfaceSlots.delete(n.id);
    }
  }
  validateInitialHandshake(t, n) {
    if (t.op !== "handshake" || !$f(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !id(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
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
    return { channel: Nn, version: 2, id: t, ok: !1, error: { code: n, message: r, retryable: i } };
  }
  reply(t, n) {
    !t || this.pinnedParentOrigin === null || t.postMessage(n, this.pinnedParentOrigin);
  }
  postToParent(t, n) {
    t.postMessage(n, "*");
  }
}
function Ec() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function Tf(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return de.buildHash !== "dev" && (i.pathname = `/v/${de.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function kr(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === de.buildHash && t.sandboxVersion === de.sandboxVersion;
}
async function Lg() {
  if (de.buildHash === "dev") return;
  const e = new URL(window.location.href);
  if (e.pathname !== `/v/${de.buildHash}/index.html` || e.search)
    throw new Error("Sandbox release document URL mismatch");
  const t = document.querySelectorAll('link[rel="stylesheet"]');
  if (t.length !== 1 || !t[0].integrity.startsWith("sha256-") || !t[0].href.startsWith(`${e.origin}/v/${de.buildHash}/assets/`))
    throw new Error("Sandbox release stylesheet is not pinned");
  const n = t[0];
  n.sheet || await new Promise((r, i) => {
    const o = () => a(new Error("Sandbox release stylesheet failed integrity or loading")), s = () => n.sheet ? a() : o(), a = (l) => {
      clearTimeout(c), n.removeEventListener("load", s), n.removeEventListener("error", o), window.removeEventListener("load", s), window.removeEventListener("pagehide", o), l ? i(l) : r();
    }, c = setTimeout(o, 1e4);
    n.addEventListener("load", s, { once: !0 }), n.addEventListener("error", o, { once: !0 }), window.addEventListener("load", s, { once: !0 }), window.addEventListener("pagehide", o, { once: !0 }), (n.sheet || document.readyState === "complete") && s();
  });
}
class ft extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class vt extends ft {
}
class Ao extends ft {
}
class Ki extends ft {
}
class Hg extends ft {
}
class Ug extends ft {
}
class Ng extends ft {
}
class Dg extends ft {
}
class zg extends ft {
}
class Mg extends ft {
}
class Kg extends ft {
}
class Ac extends ft {
}
const Fg = {}, Pf = jg(globalThis, Fg);
function jg(e, t) {
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
async function Vg() {
  if (Pf !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Tg);
    return e.subtle;
  } catch (e) {
    throw new Ac(e);
  }
}
class Sc {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await Vg());
  }
}
const en = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, od = {
  DhkemX25519HkdfSha256: 32
}, Of = {
  HkdfSha256: 1
}, _c = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, Lo = 8192, qg = 268435456, sd = 32, Pe = /* @__PURE__ */ new Uint8Array(0), kt = 0n, lr = 1n, Fi = 2n, Gg = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), ad = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function So(e) {
  return new Uint8Array(ie(e));
}
function ie(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class Wg extends Sc {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Of.HkdfSha256
    }), Object.defineProperty(this, "hashSize", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: 0
    }), Object.defineProperty(this, "_suiteId", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Pe
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
    return r.set(ad, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(ad, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : ie(t);
    if (r.byteLength !== this.hashSize)
      throw new vt("The salt length must be the same as the hashSize");
    const i = ie(n), o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
  async expand(t, n, r) {
    await this._setup();
    const i = ie(t), o = await this._api.importKey("raw", i, this.algHash, !1, [
      "sign"
    ]), s = new ArrayBuffer(r), a = new Uint8Array(s);
    let c = Pe;
    const l = So(n), u = new Uint8Array(1);
    if (r > 255 * this.hashSize)
      throw new Error("Entropy limit reached");
    const d = new Uint8Array(this.hashSize + l.length + 1);
    for (let f = 1, h = 0; h < a.length; f++)
      u[0] = f, d.set(c, 0), d.set(l, c.length), d.set(u, c.length + l.length), c = new Uint8Array(await this._api.sign("HMAC", o, d.slice(0, c.length + l.length + 1))), a.length - h >= c.length ? (a.set(c, h), h += c.length) : (a.set(c.slice(0, a.length - h), h), h += a.length - h);
    return s;
  }
  async extractAndExpand(t, n, r, i) {
    await this._setup();
    const o = ie(n), s = await this._api.importKey("raw", o, "HKDF", !1, ["deriveBits"]);
    return await this._api.deriveBits({
      name: "HKDF",
      hash: this.algHash.hash,
      salt: ie(t),
      info: ie(r)
    }, s, i * 8);
  }
  async labeledExtract(t, n, r) {
    return await this.extract(t, this.buildLabeledIkm(n, r));
  }
  async labeledExpand(t, n, r, i) {
    return await this.expand(t, this.buildLabeledInfo(n, r, i), i);
  }
  _checkInit() {
    if (this._suiteId === Pe)
      throw new Error("Not initialized. Call init()");
  }
}
class Rf extends Wg {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Of.HkdfSha256
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
const Zr = (e) => typeof e == "object" && e !== null && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function fi(e, t) {
  if (t <= 0)
    throw new Error("i2Osp: too small size");
  if (e >= 256 ** t)
    throw new Error("i2Osp: too large integer");
  const n = new Uint8Array(t);
  for (let r = 0; r < t && e; r++)
    n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
  return n;
}
function ji(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function cd(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function Zg() {
  if (typeof Pf < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Tg);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function Yg(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const Xg = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), Jg = /* @__PURE__ */ new Uint8Array([
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
function Qg(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class em {
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
    const i = new Uint8Array(Gg);
    i.set(fi(this.id, 2), 3), this._kdf.init(i);
  }
  async serializePublicKey(t) {
    return await this._prim.serializePublicKey(t);
  }
  async deserializePublicKey(t) {
    return await this._prim.deserializePublicKey(ie(t));
  }
  async serializePrivateKey(t) {
    return await this._prim.serializePrivateKey(t);
  }
  async deserializePrivateKey(t) {
    return await this._prim.deserializePrivateKey(ie(t));
  }
  async importKey(t, n, r = !0) {
    return await this._prim.importKey(t, n, r);
  }
  async generateKeyPair() {
    return await this._prim.generateKeyPair();
  }
  async deriveKeyPair(t) {
    const n = ie(t);
    if (n.byteLength > Lo)
      throw new vt("Too long ikm");
    return await this._prim.deriveKeyPair(n);
  }
  async encap(t) {
    let n;
    t.ekm === void 0 ? n = await this.generateKeyPair() : Zr(t.ekm) ? n = t.ekm : n = await this.deriveKeyPair(t.ekm);
    const r = await this._prim.serializePublicKey(n.publicKey), i = await this._prim.serializePublicKey(t.recipientPublicKey);
    try {
      let o;
      if (t.senderKey === void 0)
        o = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey));
      else {
        const c = Zr(t.senderKey) ? t.senderKey.privateKey : t.senderKey, l = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey)), u = new Uint8Array(await this._prim.dh(c, t.recipientPublicKey));
        o = ji(l, u);
      }
      let s;
      if (t.senderKey === void 0)
        s = ji(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = Zr(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), l = await this._prim.serializePublicKey(c);
        s = Qg(new Uint8Array(r), new Uint8Array(i), new Uint8Array(l));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new Hg(o);
    }
  }
  async decap(t) {
    const n = ie(t.enc), r = await this._prim.deserializePublicKey(n), i = Zr(t.recipientKey) ? t.recipientKey.privateKey : t.recipientKey, o = Zr(t.recipientKey) ? t.recipientKey.publicKey : await this._prim.derivePublicKey(t.recipientKey), s = await this._prim.serializePublicKey(o);
    try {
      let a;
      if (t.senderPublicKey === void 0)
        a = new Uint8Array(await this._prim.dh(i, r));
      else {
        const l = new Uint8Array(await this._prim.dh(i, r)), u = new Uint8Array(await this._prim.dh(i, t.senderPublicKey));
        a = ji(l, u);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = ji(new Uint8Array(n), new Uint8Array(s));
      else {
        const l = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + l.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(l), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new Ug(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(Xg, t), i = this._kdf.buildLabeledInfo(Jg, n, this.secretSize);
    return await this._kdf.extractAndExpand(Pe, r, i, this.secretSize);
  }
}
const Vi = ["deriveBits"], tm = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), nm = /* @__PURE__ */ new Uint8Array([115, 107]);
class dr {
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
class rm {
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
      return Promise.reject(new Ao(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(ie(t), !0);
    } catch (n) {
      throw new Ki(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new Ao(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(ie(t), !1);
    } catch (n) {
      throw new Ki(n);
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
      throw new Ki(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new dr(this._algName, t, "private", Vi);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new Ac(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = ie(t), r = await this._hkdf.labeledExtract(Pe.buffer, tm, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, nm, Pe, this._nSk), o = new dr(this._algName, new Uint8Array(i), "private", Vi);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new Kg(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new dr(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new Ki(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new Ao(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new dr(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : Vi));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new dr(this._algName, cd(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new dr(this._algName, cd(t.d), "private", Vi)));
    });
  }
}
const im = ["encrypt", "decrypt"];
function om(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function mi(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function Gt(e, t, n = "") {
  const r = om(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Ho(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function sm(e, t) {
  Gt(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function am(e) {
  if (typeof e == "bigint") {
    if (!_o(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    mi(e);
  return e;
}
function Uo(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const cm = /* @__PURE__ */ new Uint32Array([287454020]), lm = /* @__PURE__ */ new Uint8Array(cm.buffer);
lm[0];
function ia(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function yt(e, t) {
  return e << 32 - t | e >>> t;
}
const Cf = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", dm = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), um = [
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
function fm(e) {
  if (Gt(e), Cf)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += dm[e[n]];
  return t;
}
const Lt = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Ka(e) {
  if (e >= Lt._0 && e <= Lt._9)
    return e - Lt._0;
  if (e >= Lt.A && e <= Lt.F)
    return e - (Lt.A - 10);
  if (e >= Lt.a && e <= Lt.f)
    return e - (Lt.a - 10);
}
function hm(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Cf)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Ka(e.charCodeAt(o)), a = Ka(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function pm(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = kt;
  for (let n = 0; n < e.length; n++) {
    const r = Ka(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | um[r];
  }
  return t;
}
function ym(e) {
  mi(e, "numberToBigint");
  let t = e, n = kt, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function ld(e) {
  return pm(fm(Fa(Gt(e)).reverse()));
}
function wm(e, t) {
  mi(t), e = am(e);
  const n = hm(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function gm(e, t) {
  return wm(e, t).reverse();
}
function Fa(e) {
  return Uint8Array.from(e);
}
function _o(e) {
  return typeof e == "bigint" && kt <= e;
}
function mm(e, t, n) {
  return _o(e) && _o(t) && _o(n) && t <= e && e < n;
}
function dd(e, t, n, r) {
  if (!mm(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function bm(e, t = {}, n = {}) {
  if (!e || typeof e != "object")
    throw new Error("expected valid options object");
  function r(o, s, a) {
    const c = e[o];
    if (a && c === void 0)
      return;
    const l = typeof c;
    if (l !== s || c === null)
      throw new Error(`param "${o}" is invalid: expected ${s}, got ${l}`);
  }
  const i = (o, s) => Object.entries(o).forEach(([a, c]) => r(a, c, s));
  i(t, !1), i(n, !0);
}
async function vm(e = 32) {
  const t = await Zg(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function xm(e) {
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
function km(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  mi(e.outputLen), mi(e.blockLen);
}
function Em(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let Lf = class {
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
    }), km(t), Gt(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Uo(i);
  }
  update(t) {
    return Ho(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Ho(this), Gt(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const Hf = (e, t, n) => new Lf(e, t).update(n).digest();
Hf.create = (e, t) => new Lf(e, t);
function Am(e, t, n) {
  return e & t ^ ~e & n;
}
function Sm(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let _m = class {
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
    }), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = ia(this.buffer);
  }
  update(t) {
    Ho(this), Gt(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = ia(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Ho(this), sm(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Uo(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, ym(this.length * 8), o), this.process(r, 0);
    const a = ia(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const l = c / 4, u = this.get();
    if (l > u.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < l; d++)
      a.setUint32(4 * d, u[d], o);
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
const tn = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Im = /* @__PURE__ */ Uint32Array.from([
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
]), nn = /* @__PURE__ */ new Uint32Array(64);
let Bm = class extends _m {
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
      nn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = nn[d - 15], h = nn[d - 2], y = yt(f, 7) ^ yt(f, 18) ^ f >>> 3, w = yt(h, 17) ^ yt(h, 19) ^ h >>> 10;
      nn[d] = w + nn[d - 7] + y + nn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = yt(a, 6) ^ yt(a, 11) ^ yt(a, 25), h = u + f + Am(a, c, l) + Im[d] + nn[d] | 0, w = (yt(r, 2) ^ yt(r, 13) ^ yt(r, 22)) + Sm(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Uo(nn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Uo(this.buffer);
  }
}, $m = class extends Bm {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: tn[7] | 0
    });
  }
};
const Tm = /* @__PURE__ */ Em(
  () => new $m(),
  /* @__PURE__ */ xm(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Uf(e, t) {
  const n = e % t;
  return n >= kt ? n : t + n;
}
function Qe(e, t, n) {
  let r = e;
  for (; t-- > kt; )
    r *= r, r %= n;
  return r;
}
function Pm(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Om(e) {
  return bm(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function Rm(e) {
  const t = Om(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || vm, l = a ? 255n : 448n, u = a ? 32 : 56, d = a ? 9n : 5n, f = a ? 121665n : 39081n, h = a ? Fi ** 254n : Fi ** 447n, y = a ? 8n * Fi ** 251n - lr : 4n * Fi ** 445n - lr, w = h + y + lr, p = (b) => Uf(b, n), m = S(d);
  function S(b) {
    return gm(p(b), u);
  }
  function E(b) {
    const g = Fa(Gt(b, u, "uCoordinate"));
    return a && (g[31] &= 127), p(ld(g));
  }
  function P(b) {
    return ld(i(Fa(Gt(b, u, "scalar"))));
  }
  function I(b, g) {
    const k = D(E(g), P(b));
    if (k === kt)
      throw new Error("invalid private or public key received");
    return S(k);
  }
  function R(b) {
    return I(b, m);
  }
  const U = R, H = I;
  function B(b, g, k) {
    const _ = p(b * (g - k));
    return g = p(g - _), k = p(k + _), { x_2: g, x_3: k };
  }
  function D(b, g) {
    dd("u", b, kt, n), dd("scalar", g, h, w);
    const k = g, _ = b;
    let $ = lr, T = kt, O = b, C = lr, N = kt;
    for (let z = l - 1n; z >= kt; z--) {
      const M = k >> z & lr;
      N ^= M, { x_2: $, x_3: O } = B(N, $, O), { x_2: T, x_3: C } = B(N, T, C), N = M;
      const F = $ + T, j = p(F * F), q = $ - T, W = p(q * q), se = j - W, Fe = O + C, Ct = O - C, Qt = p(Ct * F), Wr = p(Fe * q), nd = Qt + Wr, rd = Qt - Wr;
      O = p(nd * nd), C = p(_ * p(rd * rd)), $ = p(j * W), T = p(se * (j + p(f * se)));
    }
    ({ x_2: $, x_3: O } = B(N, $, O)), { x_2: T, x_3: C } = B(N, T, C);
    const K = o(T);
    return p($ * K);
  }
  const L = {
    secretKey: u,
    publicKey: u,
    seed: u
  }, x = async (b) => (b === void 0 && (b = await c(u)), Gt(b, L.seed, "seed"), b), v = { randomSecretKey: x };
  return Object.freeze({
    keygen: Pm(x, U),
    getSharedSecret: H,
    getPublicKey: U,
    scalarMult: I,
    scalarMultBase: R,
    utils: v,
    GuBytes: m.slice(),
    lengths: L
  });
}
class Cm extends Sc {
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
    }), this._rawKey = ie(t);
  }
  async seal(t, n, r) {
    await this._setupKey();
    const i = {
      name: "AES-GCM",
      iv: ie(t),
      additionalData: ie(r)
    };
    return await this._api.encrypt(i, this._key, ie(n));
  }
  async open(t, n, r) {
    await this._setupKey();
    const i = {
      name: "AES-GCM",
      iv: ie(t),
      additionalData: ie(r)
    };
    return await this._api.decrypt(i, this._key, ie(n));
  }
  async _setupKey() {
    if (this._key !== void 0)
      return;
    await this._setup();
    const t = await this._importKey(this._rawKey);
    new Uint8Array(this._rawKey).fill(0), this._key = t;
  }
  async _importKey(t) {
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, im);
  }
}
class Lm {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: _c.Aes128Gcm
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
    return new Cm(t);
  }
}
class Hm extends Lm {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: _c.Aes256Gcm
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
function ud() {
  return new Promise((e, t) => {
    t(new Ac("Not supported"));
  });
}
const Um = new Uint8Array([115, 101, 99]);
class Ic {
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
    return await ud();
  }
  async open(t, n) {
    return await ud();
  }
  async export(t, n) {
    const r = ie(t);
    if (r.byteLength > Lo)
      throw new vt("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, Um, new Uint8Array(r), n);
    } catch (i) {
      throw new Ng(i);
    }
  }
}
class Nm extends Ic {
}
class Dm extends Ic {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Nf extends Ic {
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
    const n = fi(t.seq, t.baseNonce.byteLength);
    return Yg(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new Mg("Message limit reached");
    t.seq += 1;
  }
}
var zm = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Mm = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, Io;
class Df {
  constructor() {
    Io.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = zm(this, Io, "f");
    return Mm(this, Io, n, "f"), await r, t;
  }
}
Io = /* @__PURE__ */ new WeakMap();
var fd = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Km = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, oi;
class Fm extends Nf {
  constructor() {
    super(...arguments), oi.set(this, void 0);
  }
  async open(t, n = Pe.buffer) {
    Km(this, oi, fd(this, oi, "f") ?? new Df(), "f");
    const r = await fd(this, oi, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), ie(t), ie(n));
    } catch (o) {
      throw new zg(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
oi = /* @__PURE__ */ new WeakMap();
var hd = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, jm = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, si;
class Vm extends Nf {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), si.set(this, void 0), this.enc = i;
  }
  async seal(t, n = Pe.buffer) {
    jm(this, si, hd(this, si, "f") ?? new Df(), "f");
    const r = await hd(this, si, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), ie(t), ie(n));
    } catch (o) {
      throw new Dg(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
si = /* @__PURE__ */ new WeakMap();
const qm = new Uint8Array([
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
]), Gm = new Uint8Array([101, 120, 112]), Wm = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), Zm = new Uint8Array([107, 101, 121]), Ym = new Uint8Array([
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
]), Xm = new Uint8Array([115, 101, 99, 114, 101, 116]), Jm = new Uint8Array([
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
class Qm extends Sc {
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
      throw new vt("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new vt("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new vt("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(Jm), this._suiteId.set(fi(this._kem.id, 2), 4), this._suiteId.set(fi(this._kdf.id, 2), 6), this._suiteId.set(fi(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
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
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? en.AuthPsk : en.Psk : r = t.senderKey !== void 0 ? en.Auth : en.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
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
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? en.AuthPsk : en.Psk : r = t.senderPublicKey !== void 0 ? en.Auth : en.Base, await this._keyScheduleR(r, n, t);
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
  async seal(t, n, r = Pe.buffer) {
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
  async open(t, n, r = Pe.buffer) {
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
    const i = r.psk === void 0 ? Pe : So(r.psk.id), o = await this._kdf.labeledExtract(Pe, Ym, i), s = r.info === void 0 ? Pe : So(r.info), a = await this._kdf.labeledExtract(Pe, Wm, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const l = r.psk === void 0 ? Pe : So(r.psk.key), u = this._kdf.buildLabeledIkm(Xm, l), d = this._kdf.buildLabeledInfo(Gm, c, this._kdf.hashSize), f = await this._kdf.extractAndExpand(n, u, d, this._kdf.hashSize);
    if (this._aead.id === _c.ExportOnly)
      return { aead: this._aead, exporterSecret: f };
    const h = this._kdf.buildLabeledInfo(Zm, c, this._aead.keySize), y = await this._kdf.extractAndExpand(n, u, h, this._aead.keySize), w = this._kdf.buildLabeledInfo(qm, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, u, w, this._aead.nonceSize);
    return {
      aead: this._aead,
      exporterSecret: f,
      key: y,
      baseNonce: new Uint8Array(p),
      seq: 0
    };
  }
  async _keyScheduleS(t, n, r, i) {
    const o = await this._keySchedule(t, n, i);
    return o.key === void 0 ? new Dm(this._api, this._kdf, o.exporterSecret, r) : new Vm(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new Nm(this._api, this._kdf, i.exporterSecret) : new Fm(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > qg)
      throw new vt("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < sd)
        throw new vt(`PSK must have at least ${sd} bytes`);
      if (t.psk.key.byteLength > Lo)
        throw new vt("Too long psk.key");
      if (t.psk.id.byteLength > Lo)
        throw new vt("Too long psk.id");
    }
  }
}
class e0 extends Qm {
}
let t0 = class extends Rf {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const n0 = 1n, pd = 2n, r0 = 3n, i0 = 5n, zf = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function o0(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = zf, a = e * e % o * e % o, c = Qe(a, pd, o) * a % o, l = Qe(c, n0, o) * e % o, u = Qe(l, i0, o) * l % o, d = Qe(u, t, o) * u % o, f = Qe(d, n, o) * d % o, h = Qe(f, r, o) * f % o, y = Qe(h, i, o) * h % o, w = Qe(y, i, o) * h % o, p = Qe(w, t, o) * u % o;
  return { pow_p_5_8: Qe(p, pd, o) * e % o, b2: a };
}
function s0(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const a0 = /* @__PURE__ */ (() => {
  const e = zf;
  return Rm({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = o0(t);
      return Uf(Qe(n, r0, e) * r, e);
    },
    adjustScalarBytes: s0
  });
})();
class c0 extends Rf {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : ie(t), i = ie(n);
    if (r.byteLength !== this.hashSize)
      return Hf(Tm, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class l0 extends rm {
  constructor(t) {
    super("X25519", 32, a0, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new Ao(r));
    }
  }
}
class d0 extends em {
  constructor() {
    const t = new c0();
    super(od.DhkemX25519HkdfSha256, new l0(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: od.DhkemX25519HkdfSha256
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
function Mf(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Bt(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function $t(e, t, n = "") {
  const r = Mf(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, l = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function Kf(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (Bt(e.outputLen), Bt(e.blockLen), e.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (e.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function Or(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Bc(e, t) {
  $t(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function u0(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Tt(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function oa(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function wt(e, t) {
  return e << 32 - t | e >>> t;
}
function qi(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const f0 = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function h0(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function p0(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = h0(e[t]);
  return e;
}
const yd = f0 ? (e) => e : p0, Ff = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", y0 = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function $c(e) {
  if ($t(e), Ff)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += y0[e[n]];
  return t;
}
const Ht = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function wd(e) {
  if (e >= Ht._0 && e <= Ht._9)
    return e - Ht._0;
  if (e >= Ht.A && e <= Ht.F)
    return e - (Ht.A - 10);
  if (e >= Ht.a && e <= Ht.f)
    return e - (Ht.a - 10);
}
function Tc(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Ff)
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
    const s = wd(e.charCodeAt(o)), a = wd(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function w0(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    $t(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function Ss(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function Pc(e = 32) {
  Bt(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const jf = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function g0(e, t, n) {
  return e & t ^ ~e & n;
}
function m0(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Oc = class {
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
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = oa(this.buffer);
  }
  update(t) {
    Or(this), $t(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = oa(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Or(this), Bc(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Tt(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = oa(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen must be aligned to 32bit");
    const l = c / 4, u = this.get();
    if (l > u.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < l; d++)
      a.setUint32(4 * d, u[d], o);
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
const rn = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Ae = /* @__PURE__ */ Uint32Array.from([
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
]), Gi = /* @__PURE__ */ BigInt(2 ** 32 - 1), gd = /* @__PURE__ */ BigInt(32);
function b0(e, t = !1) {
  return t ? { h: Number(e & Gi), l: Number(e >> gd & Gi) } : { h: Number(e >> gd & Gi) | 0, l: Number(e & Gi) | 0 };
}
function Vf(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = b0(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const md = (e, t, n) => e >>> n, bd = (e, t, n) => e << 32 - n | t >>> n, ur = (e, t, n) => e >>> n | t << 32 - n, fr = (e, t, n) => e << 32 - n | t >>> n, Wi = (e, t, n) => e << 64 - n | t >>> n - 32, Zi = (e, t, n) => e >>> n - 32 | t << 64 - n, v0 = (e, t, n) => e << n | t >>> 32 - n, x0 = (e, t, n) => t << n | e >>> 32 - n, k0 = (e, t, n) => t << n - 32 | e >>> 64 - n, E0 = (e, t, n) => e << n - 32 | t >>> 64 - n;
function Ut(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const A0 = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), S0 = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, _0 = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), I0 = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, B0 = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), $0 = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, T0 = /* @__PURE__ */ Uint32Array.from([
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
]), on = /* @__PURE__ */ new Uint32Array(64);
class P0 extends Oc {
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
      on[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = on[d - 15], h = on[d - 2], y = wt(f, 7) ^ wt(f, 18) ^ f >>> 3, w = wt(h, 17) ^ wt(h, 19) ^ h >>> 10;
      on[d] = w + on[d - 7] + y + on[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = wt(a, 6) ^ wt(a, 11) ^ wt(a, 25), h = u + f + g0(a, c, l) + T0[d] + on[d] | 0, w = (wt(r, 2) ^ wt(r, 13) ^ wt(r, 22)) + m0(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Tt(on);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), Tt(this.buffer);
  }
}
class O0 extends P0 {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = rn[0] | 0;
  B = rn[1] | 0;
  C = rn[2] | 0;
  D = rn[3] | 0;
  E = rn[4] | 0;
  F = rn[5] | 0;
  G = rn[6] | 0;
  H = rn[7] | 0;
  constructor() {
    super(32);
  }
}
const qf = Vf([
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
].map((e) => BigInt(e))), R0 = qf[0], C0 = qf[1], sn = /* @__PURE__ */ new Uint32Array(80), an = /* @__PURE__ */ new Uint32Array(80);
class L0 extends Oc {
  constructor(t) {
    super(128, t, 16, !1);
  }
  // prettier-ignore
  get() {
    const { Ah: t, Al: n, Bh: r, Bl: i, Ch: o, Cl: s, Dh: a, Dl: c, Eh: l, El: u, Fh: d, Fl: f, Gh: h, Gl: y, Hh: w, Hl: p } = this;
    return [t, n, r, i, o, s, a, c, l, u, d, f, h, y, w, p];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c, l, u, d, f, h, y, w, p) {
    this.Ah = t | 0, this.Al = n | 0, this.Bh = r | 0, this.Bl = i | 0, this.Ch = o | 0, this.Cl = s | 0, this.Dh = a | 0, this.Dl = c | 0, this.Eh = l | 0, this.El = u | 0, this.Fh = d | 0, this.Fl = f | 0, this.Gh = h | 0, this.Gl = y | 0, this.Hh = w | 0, this.Hl = p | 0;
  }
  process(t, n) {
    for (let E = 0; E < 16; E++, n += 4)
      sn[E] = t.getUint32(n), an[E] = t.getUint32(n += 4);
    for (let E = 16; E < 80; E++) {
      const P = sn[E - 15] | 0, I = an[E - 15] | 0, R = ur(P, I, 1) ^ ur(P, I, 8) ^ md(P, I, 7), U = fr(P, I, 1) ^ fr(P, I, 8) ^ bd(P, I, 7), H = sn[E - 2] | 0, B = an[E - 2] | 0, D = ur(H, B, 19) ^ Wi(H, B, 61) ^ md(H, B, 6), L = fr(H, B, 19) ^ Zi(H, B, 61) ^ bd(H, B, 6), x = _0(U, L, an[E - 7], an[E - 16]), v = I0(x, R, D, sn[E - 7], sn[E - 16]);
      sn[E] = v | 0, an[E] = x | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: l, Dl: u, Eh: d, El: f, Fh: h, Fl: y, Gh: w, Gl: p, Hh: m, Hl: S } = this;
    for (let E = 0; E < 80; E++) {
      const P = ur(d, f, 14) ^ ur(d, f, 18) ^ Wi(d, f, 41), I = fr(d, f, 14) ^ fr(d, f, 18) ^ Zi(d, f, 41), R = d & h ^ ~d & w, U = f & y ^ ~f & p, H = B0(S, I, U, C0[E], an[E]), B = $0(H, m, P, R, R0[E], sn[E]), D = H | 0, L = ur(r, i, 28) ^ Wi(r, i, 34) ^ Wi(r, i, 39), x = fr(r, i, 28) ^ Zi(r, i, 34) ^ Zi(r, i, 39), v = r & o ^ r & a ^ o & a, b = i & s ^ i & c ^ s & c;
      m = w | 0, S = p | 0, w = h | 0, p = y | 0, h = d | 0, y = f | 0, { h: d, l: f } = Ut(l | 0, u | 0, B | 0, D | 0), l = a | 0, u = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const g = A0(D, x, b);
      r = S0(g, B, L, v), i = g | 0;
    }
    ({ h: r, l: i } = Ut(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = Ut(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = Ut(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: l, l: u } = Ut(this.Dh | 0, this.Dl | 0, l | 0, u | 0), { h: d, l: f } = Ut(this.Eh | 0, this.El | 0, d | 0, f | 0), { h, l: y } = Ut(this.Fh | 0, this.Fl | 0, h | 0, y | 0), { h: w, l: p } = Ut(this.Gh | 0, this.Gl | 0, w | 0, p | 0), { h: m, l: S } = Ut(this.Hh | 0, this.Hl | 0, m | 0, S | 0), this.set(r, i, o, s, a, c, l, u, d, f, h, y, w, p, m, S);
  }
  roundClean() {
    Tt(sn, an);
  }
  destroy() {
    this.destroyed = !0, Tt(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class H0 extends L0 {
  Ah = Ae[0] | 0;
  Al = Ae[1] | 0;
  Bh = Ae[2] | 0;
  Bl = Ae[3] | 0;
  Ch = Ae[4] | 0;
  Cl = Ae[5] | 0;
  Dh = Ae[6] | 0;
  Dl = Ae[7] | 0;
  Eh = Ae[8] | 0;
  El = Ae[9] | 0;
  Fh = Ae[10] | 0;
  Fl = Ae[11] | 0;
  Gh = Ae[12] | 0;
  Gl = Ae[13] | 0;
  Hh = Ae[14] | 0;
  Hl = Ae[15] | 0;
  constructor() {
    super(64);
  }
}
const ae = /* @__PURE__ */ Ss(
  () => new O0(),
  /* @__PURE__ */ jf(1)
), ja = /* @__PURE__ */ Ss(
  () => new H0(),
  /* @__PURE__ */ jf(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ne = (e, t, n) => $t(e, t, n), Gf = Bt, J = $c, Ye = (...e) => w0(...e), ot = (e) => Tc(e), Rc = Mf, Cc = (e) => Pc(e), No = /* @__PURE__ */ BigInt(0), Va = /* @__PURE__ */ BigInt(1);
function Tn(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function Lc(e) {
  if (typeof e == "bigint") {
    if (!Bo(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    Gf(e);
  return e;
}
function Do(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function Yi(e) {
  const t = Lc(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Wf(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? No : BigInt("0x" + e);
}
function Li(e) {
  return Wf($c(e));
}
function Rr(e) {
  return Wf($c(qa($t(e)).reverse()));
}
function Hc(e, t) {
  if (Bt(t), t === 0)
    throw new RangeError("zero length");
  e = Lc(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return Tc(n.padStart(t * 2, "0"));
}
function Zf(e, t) {
  return Hc(e, t).reverse();
}
function U0(e, t) {
  if (e = ne(e), t = ne(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function qa(e) {
  return Uint8Array.from(ne(e));
}
function N0(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const Bo = (e) => typeof e == "bigint" && No <= e;
function D0(e, t, n) {
  return Bo(e) && Bo(t) && Bo(n) && t <= e && e < n;
}
function zo(e, t, n, r) {
  if (!D0(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Uc(e) {
  if (e < No)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > No; e >>= Va, t += 1)
    ;
  return t;
}
const Nc = (e) => (Va << BigInt(e)) - Va;
function z0(e, t, n) {
  if (Bt(e, "hashLen"), Bt(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), l = r(e), u = 0;
  const d = () => {
    c.fill(1), l.fill(0), u = 0;
  }, f = (...p) => n(l, Ye(c, ...p)), h = (p = i) => {
    l = f(o, p), c = f(), p.length !== 0 && (l = f(s, p), c = f());
  }, y = () => {
    if (u++ >= a)
      throw new Error("drbg: tried max amount of iterations");
    let p = 0;
    const m = [];
    for (; p < t; ) {
      c = f();
      const S = c.slice();
      m.push(S), p += c.length;
    }
    return Ye(...m);
  };
  return (p, m) => {
    d(), h(p);
    let S;
    for (; (S = m(y())) === void 0; )
      h();
    return d(), S;
  };
}
function Mr(e, t = {}, n = {}) {
  if (Object.prototype.toString.call(e) !== "[object Object]")
    throw new TypeError("expected valid options object");
  function r(o, s, a) {
    if (!a && s !== "function" && !Object.hasOwn(e, o))
      throw new TypeError(`param "${o}" is invalid: expected own property`);
    const c = e[o];
    if (a && c === void 0)
      return;
    const l = typeof c;
    if (l !== s || c === null)
      throw new TypeError(`param "${o}" is invalid: expected ${s}, got ${l}`);
  }
  const i = (o, s) => Object.entries(o).forEach(([a, c]) => r(a, c, s));
  i(t, !1), i(n, !0);
}
const vd = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Be = /* @__PURE__ */ BigInt(0), he = /* @__PURE__ */ BigInt(1), Dn = /* @__PURE__ */ BigInt(2), Yf = /* @__PURE__ */ BigInt(3), Xf = /* @__PURE__ */ BigInt(4), Jf = /* @__PURE__ */ BigInt(5), M0 = /* @__PURE__ */ BigInt(7), Qf = /* @__PURE__ */ BigInt(8), K0 = /* @__PURE__ */ BigInt(9), eh = /* @__PURE__ */ BigInt(16);
function ge(e, t) {
  if (t <= Be)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= Be ? n : t + n;
}
function ce(e, t, n) {
  if (t < Be)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let r = e;
  for (; t-- > Be; )
    r *= r, r %= n;
  return r;
}
function xd(e, t) {
  if (e === Be)
    throw new Error("invert: expected non-zero number");
  if (t <= Be)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = ge(e, t), r = t, i = Be, o = he;
  for (; n !== Be; ) {
    const a = r / n, c = r - n * a, l = i - o * a;
    r = n, n = c, i = o, o = l;
  }
  if (r !== he)
    throw new Error("invert: does not exist");
  return ge(i, t);
}
function Dc(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function th(e, t) {
  const n = e, r = (n.ORDER + he) / Xf, i = n.pow(t, r);
  return Dc(n, i, t), i;
}
function F0(e, t) {
  const n = e, r = (n.ORDER - Jf) / Qf, i = n.mul(t, Dn), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, Dn), o), c = n.mul(s, n.sub(a, n.ONE));
  return Dc(n, c, t), c;
}
function j0(e) {
  const t = _s(e), n = nh(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + M0) / eh;
  return ((a, c) => {
    const l = a;
    let u = l.pow(c, s), d = l.mul(u, r);
    const f = l.mul(u, i), h = l.mul(u, o), y = l.eql(l.sqr(d), c), w = l.eql(l.sqr(f), c);
    u = l.cmov(u, d, y), d = l.cmov(h, f, w);
    const p = l.eql(l.sqr(d), c), m = l.cmov(u, d, p);
    return Dc(l, m, c), m;
  });
}
function nh(e) {
  if (e < Yf)
    throw new Error("sqrt is not defined for small field");
  let t = e - he, n = 0;
  for (; t % Dn === Be; )
    t /= Dn, n++;
  let r = Dn;
  const i = _s(e);
  for (; kd(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return th;
  let o = i.pow(r, t);
  const s = (t + he) / Dn;
  return function(c, l) {
    const u = c;
    if (u.is0(l))
      return l;
    if (kd(u, l) !== 1)
      throw new Error("Cannot find square root");
    let d = n, f = u.mul(u.ONE, o), h = u.pow(l, t), y = u.pow(l, s);
    for (; !u.eql(h, u.ONE); ) {
      if (u.is0(h))
        return u.ZERO;
      let w = 1, p = u.sqr(h);
      for (; !u.eql(p, u.ONE); )
        if (w++, p = u.sqr(p), w === d)
          throw new Error("Cannot find square root");
      const m = he << BigInt(d - w - 1), S = u.pow(f, m);
      d = w, f = u.sqr(S), h = u.mul(h, f), y = u.mul(y, S);
    }
    return y;
  };
}
function V0(e) {
  return e % Xf === Yf ? th : e % Qf === Jf ? F0 : e % eh === K0 ? j0(e) : nh(e);
}
const Cn = (e, t) => (ge(e, t) & he) === he, q0 = [
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
function G0(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = q0.reduce((r, i) => (r[i] = "function", r), t);
  if (Mr(e, n), Do(e.BYTES, "BYTES"), Do(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= he)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function W0(e, t, n) {
  const r = e;
  if (n < Be)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === Be)
    return r.ONE;
  if (n === he)
    return t;
  let i = r.ONE, o = t;
  for (; n > Be; )
    n & he && (i = r.mul(i, o)), o = r.sqr(o), n >>= he;
  return i;
}
function rh(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, l) => r.is0(c) ? a : (i[l] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, l) => r.is0(c) ? a : (i[l] = r.mul(a, i[l]), r.mul(a, c)), s), i;
}
function kd(e, t) {
  const n = e, r = (n.ORDER - he) / Dn, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function Z0(e, t) {
  if (t !== void 0 && Gf(t), e <= Be)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = Uc(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const Ed = /* @__PURE__ */ new WeakMap();
class ih {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = Be;
  ONE = he;
  _lengths;
  _mod;
  constructor(t, n = {}) {
    if (t <= he)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: n.sqrt, enumerable: !0 }), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = Object.freeze(n.allowedLengths.slice())), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: i, nByteLength: o } = Z0(t, r);
    if (o > 2048)
      throw new Error("invalid field: expected ORDER of <= 2048 bytes");
    this.ORDER = t, this.BITS = i, this.BYTES = o, Object.freeze(this);
  }
  create(t) {
    return ge(t, this.ORDER);
  }
  isValid(t) {
    if (typeof t != "bigint")
      throw new TypeError("invalid field element: expected bigint, got " + typeof t);
    return Be <= t && t < this.ORDER;
  }
  is0(t) {
    return t === Be;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & he) === he;
  }
  neg(t) {
    return ge(-t, this.ORDER);
  }
  eql(t, n) {
    return t === n;
  }
  sqr(t) {
    return ge(t * t, this.ORDER);
  }
  add(t, n) {
    return ge(t + n, this.ORDER);
  }
  sub(t, n) {
    return ge(t - n, this.ORDER);
  }
  mul(t, n) {
    return ge(t * n, this.ORDER);
  }
  pow(t, n) {
    return W0(this, t, n);
  }
  div(t, n) {
    return ge(t * xd(n, this.ORDER), this.ORDER);
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
    return xd(t, this.ORDER);
  }
  sqrt(t) {
    let n = Ed.get(this);
    return n || Ed.set(this, n = V0(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? Zf(t, this.BYTES) : Hc(t, this.BYTES);
  }
  fromBytes(t, n = !1) {
    ne(t);
    const { _lengths: r, BYTES: i, isLE: o, ORDER: s, _mod: a } = this;
    if (r) {
      if (t.length < 1 || !r.includes(t.length) || t.length > i)
        throw new Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
      const l = new Uint8Array(i);
      l.set(t, o ? 0 : l.length - t.length), t = l;
    }
    if (t.length !== i)
      throw new Error("Field.fromBytes: expected " + i + " bytes, got " + t.length);
    let c = o ? Rr(t) : Li(t);
    if (a && (c = ge(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return rh(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return Tn(r, "condition"), r ? n : t;
  }
}
Object.freeze(ih.prototype);
function _s(e, t = {}) {
  return new ih(e, t);
}
function oh(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= he)
    throw new Error("field order must be greater than 1");
  const t = Uc(e - he);
  return Math.ceil(t / 8);
}
function sh(e) {
  const t = oh(e);
  return t + Math.ceil(t / 2);
}
function ah(e, t, n = !1) {
  ne(e);
  const r = e.length, i = oh(t), o = Math.max(sh(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? Rr(e) : Li(e), a = ge(s, t - he) + he;
  return n ? Zf(a, i) : Hc(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Cr = /* @__PURE__ */ BigInt(0), zn = /* @__PURE__ */ BigInt(1);
function Mo(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function hi(e, t) {
  const n = rh(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function ch(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function sa(e, t) {
  ch(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = Nc(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function Ad(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += zn);
  const l = t * r, u = l + Math.abs(a) - 1, d = a === 0, f = a < 0, h = t % 2 !== 0;
  return { nextN: c, offset: u, isZero: d, isNeg: f, isNegF: h, offsetF: l };
}
const aa = /* @__PURE__ */ new WeakMap(), lh = /* @__PURE__ */ new WeakMap();
function ca(e) {
  return lh.get(e) || 1;
}
function Sd(e) {
  if (e !== Cr)
    throw new Error("invalid wNAF");
}
let dh = class {
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
    for (; n > Cr; )
      n & zn && (r = r.add(i)), i = i.double(), n >>= zn;
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
    const { windows: r, windowSize: i } = sa(n, this.bits), o = [];
    let s = t, a = s;
    for (let c = 0; c < r; c++) {
      a = s, o.push(a);
      for (let l = 1; l < i; l++)
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
    const s = sa(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: l, isZero: u, isNeg: d, isNegF: f, offsetF: h } = Ad(r, a, s);
      r = c, u ? o = o.add(Mo(f, n[h])) : i = i.add(Mo(d, n[l]));
    }
    return Sd(r), { p: i, f: o };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = sa(t, this.bits);
    for (let s = 0; s < o.windows && r !== Cr; s++) {
      const { nextN: a, offset: c, isZero: l, isNeg: u } = Ad(r, s, o);
      if (r = a, !l) {
        const d = n[c];
        i = i.add(u ? d.negate() : d);
      }
    }
    return Sd(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = aa.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), aa.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = ca(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = ca(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    ch(n, this.bits), lh.set(t, n), aa.delete(t);
  }
  hasCache(t) {
    return ca(t) !== 1;
  }
};
function Y0(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > Cr || r > Cr; )
    n & zn && (o = o.add(i)), r & zn && (s = s.add(i)), i = i.double(), n >>= zn, r >>= zn;
  return { p1: o, p2: s };
}
function _d(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return G0(t), t;
  } else
    return _s(e, { isLE: n });
}
function uh(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const l = t[c];
    if (!(typeof l == "bigint" && l > Cr))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = _d(t.p, n.Fp, r), o = _d(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function zc(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const cn = /* @__PURE__ */ BigInt(0), ke = /* @__PURE__ */ BigInt(1), la = /* @__PURE__ */ BigInt(2), X0 = /* @__PURE__ */ BigInt(8);
function J0(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function Q0(e, t = {}) {
  const n = t, r = uh("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  Mr(n, {}, { uvRatio: "function" });
  const c = la << BigInt(o.BYTES * 8) - ke, l = (w) => i.create(w), u = n.uvRatio === void 0 ? (w, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(w, p)) };
    } catch {
      return { isValid: !1, value: cn };
    }
  } : n.uvRatio;
  if (!J0(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(w, p, m = !1) {
    const S = m ? ke : cn;
    return zo("coordinate " + w, p, S, c), p;
  }
  function f(w) {
    if (!(w instanceof h))
      throw new Error("EdwardsPoint expected");
  }
  class h {
    // base / generator point
    static BASE = new h(s.Gx, s.Gy, ke, l(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new h(cn, ke, ke, cn);
    // 0, 1, 1, 0
    // math field
    static Fp = i;
    // scalar field
    static Fn = o;
    X;
    Y;
    Z;
    T;
    constructor(p, m, S, E) {
      this.X = d("x", p), this.Y = d("y", m), this.Z = d("z", S, !0), this.T = d("t", E), Object.freeze(this);
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
      if (p instanceof h)
        throw new Error("extended point not allowed");
      const { x: m, y: S } = p || {};
      return d("x", m), d("y", S), new h(m, S, ke, l(m * S));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(p, m = !1) {
      const S = i.BYTES, { a: E, d: P } = s;
      p = qa(ne(p, S, "point")), Tn(m, "zip215");
      const I = qa(p), R = p[S - 1];
      I[S - 1] = R & -129;
      const U = Rr(I), H = m ? c : i.ORDER;
      zo("point.y", U, cn, H);
      const B = l(U * U), D = l(B - ke), L = l(P * B - E);
      let { isValid: x, value: v } = u(D, L);
      if (!x)
        throw new Error("bad point: invalid y coordinate");
      const b = (v & ke) === ke, g = (R & 128) !== 0;
      if (!m && v === cn && g)
        throw new Error("bad point: x=0 and x_0=1");
      return g !== b && (v = l(-v)), h.fromAffine({ x: v, y: U });
    }
    static fromHex(p, m = !1) {
      return h.fromBytes(ot(p), m);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, m = !0) {
      return y.createCache(this, p), m || this.multiply(la), this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this, { a: m, d: S } = s;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X: E, Y: P, Z: I, T: R } = p, U = l(E * E), H = l(P * P), B = l(I * I), D = l(B * B), L = l(U * m), x = l(B * l(L + H)), v = l(D + l(S * l(U * H)));
      if (x !== v)
        throw new Error("bad point: equation left != right (1)");
      const b = l(E * P), g = l(I * R);
      if (b !== g)
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(p) {
      f(p);
      const { X: m, Y: S, Z: E } = this, { X: P, Y: I, Z: R } = p, U = l(m * R), H = l(P * E), B = l(S * R), D = l(I * E);
      return U === H && B === D;
    }
    is0() {
      return this.equals(h.ZERO);
    }
    negate() {
      return new h(l(-this.X), this.Y, this.Z, l(-this.T));
    }
    // Fast algo for doubling Extended Point.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    // Cost: 4M + 4S + 1*a + 6add + 1*2.
    double() {
      const { a: p } = s, { X: m, Y: S, Z: E } = this, P = l(m * m), I = l(S * S), R = l(la * l(E * E)), U = l(p * P), H = m + S, B = l(l(H * H) - P - I), D = U + I, L = D - R, x = U - I, v = l(B * L), b = l(D * x), g = l(B * x), k = l(L * D);
      return new h(v, b, k, g);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      f(p);
      const { a: m, d: S } = s, { X: E, Y: P, Z: I, T: R } = this, { X: U, Y: H, Z: B, T: D } = p, L = l(E * U), x = l(P * H), v = l(R * S * D), b = l(I * B), g = l((E + P) * (U + H) - L - x), k = b - v, _ = b + v, $ = l(x - m * L), T = l(g * k), O = l(_ * $), C = l(g * $), N = l(k * _);
      return new h(T, O, N, C);
    }
    subtract(p) {
      return f(p), this.add(p.negate());
    }
    // Constant-time multiplication.
    multiply(p) {
      if (!o.isValidNot0(p))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p: m, f: S } = y.cached(this, p, (E) => hi(h, E));
      return hi(h, [m, S])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(p) {
      if (!o.isValid(p))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      return p === cn ? h.ZERO : this.is0() || p === ke ? this : y.unsafe(this, p, (m) => hi(h, m));
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
      return y.unsafe(this, s.n).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(p) {
      const m = this;
      let S = p;
      const { X: E, Y: P, Z: I } = m, R = m.is0();
      S == null && (S = R ? X0 : i.inv(I));
      const U = l(E * S), H = l(P * S), B = i.mul(I, S);
      if (R)
        return { x: cn, y: ke };
      if (B !== ke)
        throw new Error("invZ was invalid");
      return { x: U, y: H };
    }
    clearCofactor() {
      return a === ke ? this : this.multiplyUnsafe(a);
    }
    toBytes() {
      const { x: p, y: m } = this.toAffine(), S = i.toBytes(m);
      return S[S.length - 1] |= p & ke ? 128 : 0, S;
    }
    toHex() {
      return J(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const y = new dh(h, o.BITS);
  return o.BITS >= 8 && h.BASE.precompute(8), Object.freeze(h.prototype), Object.freeze(h), h;
}
class eb {
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
    vd();
  }
  static fromHex(t) {
    vd();
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
    return J(this.toBytes());
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
function tb(e, t, n = {}) {
  if (typeof t != "function")
    throw new Error('"hash" function param is required');
  const r = t, i = n;
  Mr(i, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function"
  });
  const { prehash: o } = i, { BASE: s, Fp: a, Fn: c } = e, l = r.outputLen, u = 2 * a.BYTES;
  if (l !== void 0 && (Do(l, "hash.outputLen"), l !== u))
    throw new Error(`hash.outputLen must be ${u}, got ${l}`);
  const d = i.randomBytes === void 0 ? Cc : i.randomBytes, f = i.adjustScalarBytes === void 0 ? (x) => x : i.adjustScalarBytes, h = i.domain === void 0 ? (x, v, b) => {
    if (Tn(b, "phflag"), v.length || b)
      throw new Error("Contexts/pre-hash are not supported");
    return x;
  } : i.domain;
  function y(x) {
    return c.create(Rr(x));
  }
  function w(x) {
    const v = U.secretKey;
    ne(x, U.secretKey, "secretKey");
    const b = ne(r(x), 2 * v, "hashedSecretKey"), g = f(b.slice(0, v)), k = b.slice(v, 2 * v), _ = y(g);
    return { head: g, prefix: k, scalar: _ };
  }
  function p(x) {
    const { head: v, prefix: b, scalar: g } = w(x), k = s.multiply(g), _ = k.toBytes();
    return { head: v, prefix: b, scalar: g, point: k, pointBytes: _ };
  }
  function m(x) {
    return p(x).pointBytes;
  }
  function S(x = Uint8Array.of(), ...v) {
    const b = Ye(...v);
    return y(r(h(b, ne(x, void 0, "context"), !!o)));
  }
  function E(x, v, b = {}) {
    x = ne(x, void 0, "message"), o && (x = o(x));
    const { prefix: g, scalar: k, pointBytes: _ } = p(v), $ = S(b.context, g, x), T = s.multiply($).toBytes(), O = S(b.context, T, _, x), C = c.create($ + O * k);
    if (!c.isValid(C))
      throw new Error("sign failed: invalid s");
    const N = Ye(T, c.toBytes(C));
    return ne(N, U.signature, "result");
  }
  const P = {
    zip215: i.zip215
  };
  function I(x, v, b, g = P) {
    const { context: k } = g, _ = g.zip215 === void 0 ? !!P.zip215 : g.zip215, $ = U.signature;
    x = ne(x, $, "signature"), v = ne(v, void 0, "message"), b = ne(b, U.publicKey, "publicKey"), _ !== void 0 && Tn(_, "zip215"), o && (v = o(v));
    const T = $ / 2, O = x.subarray(0, T), C = Rr(x.subarray(T, $));
    let N, K, z;
    try {
      N = e.fromBytes(b, _), K = e.fromBytes(O, _), z = s.multiplyUnsafe(C);
    } catch {
      return !1;
    }
    if (!_ && N.isSmallOrder())
      return !1;
    const M = S(k, O, b, v);
    return K.add(N.multiplyUnsafe(M)).subtract(z).clearCofactor().is0();
  }
  const R = a.BYTES, U = {
    secretKey: R,
    publicKey: R,
    signature: 2 * R,
    seed: R
  };
  function H(x) {
    return x = x === void 0 ? d(U.seed) : x, ne(x, U.seed, "seed");
  }
  function B(x) {
    return Rc(x) && x.length === U.secretKey;
  }
  function D(x, v) {
    try {
      return !!e.fromBytes(x, v === void 0 ? P.zip215 : v);
    } catch {
      return !1;
    }
  }
  const L = {
    getExtendedPublicKey: p,
    randomSecretKey: H,
    isValidSecretKey: B,
    isValidPublicKey: D,
    /**
     * Converts ed public key to x public key. Uses formula:
     * - ed25519:
     *   - `(u, v) = ((1+y)/(1-y), sqrt(-486664)*u/x)`
     *   - `(x, y) = (sqrt(-486664)*u/v, (u-1)/(u+1))`
     * - ed448:
     *   - `(u, v) = ((y-1)/(y+1), sqrt(156324)*u/x)`
     *   - `(x, y) = (sqrt(156324)*u/v, (1+u)/(1-u))`
     */
    toMontgomery(x) {
      const { y: v } = e.fromBytes(x), b = U.publicKey, g = b === 32;
      if (!g && b !== 57)
        throw new Error("only defined for 25519 and 448");
      const k = g ? a.div(ke + v, ke - v) : a.div(v - ke, v + ke);
      return a.toBytes(k);
    },
    toMontgomerySecret(x) {
      const v = U.secretKey;
      ne(x, v);
      const b = r(x.subarray(0, v));
      return f(b).subarray(0, v);
    }
  };
  return Object.freeze(U), Object.freeze(L), Object.freeze({
    keygen: zc(H, m),
    getPublicKey: m,
    sign: E,
    verify: I,
    utils: L,
    Point: e,
    lengths: U
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const nb = /* @__PURE__ */ BigInt(0), pi = /* @__PURE__ */ BigInt(1), Id = /* @__PURE__ */ BigInt(2), rb = /* @__PURE__ */ BigInt(5), ib = /* @__PURE__ */ BigInt(8), bi = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), fh = {
  p: bi,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: ib,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function ob(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = bi, a = e * e % o * e % o, c = ce(a, Id, o) * a % o, l = ce(c, pi, o) * e % o, u = ce(l, rb, o) * l % o, d = ce(u, t, o) * u % o, f = ce(d, n, o) * d % o, h = ce(f, r, o) * f % o, y = ce(h, i, o) * h % o, w = ce(y, i, o) * h % o, p = ce(w, t, o) * u % o;
  return { pow_p_5_8: ce(p, Id, o) * e % o, b2: a };
}
function sb(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Ga = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function hh(e, t) {
  const n = bi, r = ge(t * t * t, n), i = ge(r * r * t, n), o = ob(e * i).pow_p_5_8;
  let s = ge(e * r * o, n);
  const a = ge(t * s * s, n), c = s, l = ge(s * Ga, n), u = a === e, d = a === ge(-e, n), f = a === ge(-e * Ga, n);
  return u && (s = c), (d || f) && (s = l), Cn(s, n) && (s = ge(-s, n)), { isValid: u || d, value: s };
}
const Mn = /* @__PURE__ */ Q0(fh, { uvRatio: hh }), Ln = Mn.Fp, ab = Mn.Fn;
function cb(e) {
  return tb(Mn, ja, Object.assign({ adjustScalarBytes: sb, zip215: !0 }, e));
}
const ct = /* @__PURE__ */ cb({}), Bd = Ga, lb = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), $d = (e) => hh(pi, e), db = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), ub = (e) => Ln.create(Rr(e) & db);
class De extends eb {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new De(Mn.BASE);
  // prettier-ignore
  static ZERO = new De(Mn.ZERO);
  // prettier-ignore
  static Fp = Ln;
  // prettier-ignore
  static Fn = ab;
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
    return new De(Mn.fromAffine(t));
  }
  assertSame(t) {
    if (!(t instanceof De))
      throw new Error("RistrettoPoint expected");
  }
  init(t) {
    return new De(t);
  }
  static fromBytes(t) {
    $t(t, 32);
    const { a: n, d: r } = fh, i = bi, o = (P) => Ln.create(P), s = ub(t);
    if (!U0(Ln.toBytes(s), t) || Cn(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(pi + n * a), l = o(pi - n * a), u = o(c * c), d = o(l * l), f = o(n * r * u - d), { isValid: h, value: y } = $d(o(f * d)), w = o(y * l), p = o(y * w * f);
    let m = o((s + s) * w);
    Cn(m, i) && (m = o(-m));
    const S = o(c * p), E = o(m * S);
    if (!h || Cn(E, i) || S === nb)
      throw new Error("invalid ristretto255 encoding 2");
    return new De(new Mn(m, S, pi, E));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return De.fromBytes(Tc(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = bi, s = (p) => Ln.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), l = s(c * c), { value: u } = $d(s(a * l)), d = s(u * a), f = s(u * c), h = s(d * f * i);
    let y;
    if (Cn(i * h, o)) {
      let p = s(n * Bd), m = s(t * Bd);
      t = p, n = m, y = s(d * lb);
    } else
      y = f;
    Cn(t * h, o) && (n = s(-n));
    let w = s((r - n) * y);
    return Cn(w, o) && (w = s(-w)), Ln.toBytes(w);
  }
  /**
   * Compares two Ristretto points.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
   */
  equals(t) {
    this.assertSame(t);
    const { X: n, Y: r } = this.ep, { X: i, Y: o } = t.ep, s = (l) => Ln.create(l), a = s(n * o) === s(r * i), c = s(r * o) === s(n * i);
    return a || c;
  }
  is0() {
    return this.equals(De.ZERO);
  }
}
Object.freeze(De.BASE);
Object.freeze(De.ZERO);
Object.freeze(De.prototype);
Object.freeze(De);
class Td {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (Kf(t), $t(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Tt(i);
  }
  update(t) {
    return Or(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Or(this), Bc(t, this), this.finished = !0;
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
const Wa = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new Td(t, n).update(r).digest());
  return e.create = (t, n) => new Td(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Pd = (e, t) => (e + (e >= 0 ? t : -t) / ph) / t;
function fb(e, t, n) {
  zo("scalar", e, Et, n);
  const [[r, i], [o, s]] = t, a = Pd(s * e, n), c = Pd(-i * e, n);
  let l = e - a * r - c * o, u = -a * i - c * s;
  const d = l < Et, f = u < Et;
  d && (l = -l), f && (u = -u);
  const h = Nc(Math.ceil(Uc(n) / 2)) + En;
  if (l < Et || l >= h || u < Et || u >= h)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: l, k2neg: f, k2: u };
}
function Za(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function da(e, t) {
  Mr(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return Tn(n.lowS, "lowS"), Tn(n.prehash, "prehash"), n.format !== void 0 && Za(n.format), n;
}
let hb = class extends Error {
  constructor(t = "") {
    super(t);
  }
};
const tt = {
  // asn.1 DER encoding utils
  Err: hb,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = tt;
      if (Do(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = Yi(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? Yi(i.length / 2 | 128) : "";
      return Yi(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = tt;
      t = ne(t, void 0, "DER data");
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
        const l = t.subarray(r, r + c);
        if (l.length !== c)
          throw new n("tlv.decode: length bytes not complete");
        if (l[0] === 0)
          throw new n("tlv.decode(long): zero leftmost byte");
        for (const u of l)
          s = s << 8 | u;
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
      const { Err: t } = tt;
      if (Lc(e), e < Et)
        throw new t("integer: negative integers are not allowed");
      let n = Yi(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = tt;
      if (e.length < 1)
        throw new t("invalid signature integer: empty");
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e.length > 1 && e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Li(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = tt, i = ne(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: l, l: u } = r.decode(2, c);
    if (u.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(l) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = tt, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
};
Object.freeze(tt._tlv);
Object.freeze(tt._int);
Object.freeze(tt);
const Et = /* @__PURE__ */ BigInt(0), En = /* @__PURE__ */ BigInt(1), ph = /* @__PURE__ */ BigInt(2), Xi = /* @__PURE__ */ BigInt(3), pb = /* @__PURE__ */ BigInt(4);
function yb(e, t = {}) {
  const n = uh("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  Mr(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object"
  });
  const { endo: c, allowInfinityPoint: l } = t;
  if (c && (!r.is0(o.a) || typeof c.beta != "bigint" || !Array.isArray(c.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const u = wh(r, i);
  function d() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function f(L, x, v) {
    if (l && x.is0())
      return Uint8Array.of(0);
    const { x: b, y: g } = x.toAffine(), k = r.toBytes(b);
    if (Tn(v, "isCompressed"), v) {
      d();
      const _ = !r.isOdd(g);
      return Ye(yh(_), k);
    } else
      return Ye(Uint8Array.of(4), k, r.toBytes(g));
  }
  function h(L) {
    ne(L, void 0, "Point");
    const { publicKey: x, publicKeyUncompressed: v } = u, b = L.length, g = L[0], k = L.subarray(1);
    if (l && b === 1 && g === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (b === x && (g === 2 || g === 3)) {
      const _ = r.fromBytes(k);
      if (!r.isValid(_))
        throw new Error("bad point: is not on curve, wrong x");
      const $ = p(_);
      let T;
      try {
        T = r.sqrt($);
      } catch (N) {
        const K = N instanceof Error ? ": " + N.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + K);
      }
      d();
      const O = r.isOdd(T);
      return (g & 1) === 1 !== O && (T = r.neg(T)), { x: _, y: T };
    } else if (b === v && g === 4) {
      const _ = r.BYTES, $ = r.fromBytes(k.subarray(0, _)), T = r.fromBytes(k.subarray(_, _ * 2));
      if (!m($, T))
        throw new Error("bad point: is not on curve");
      return { x: $, y: T };
    } else
      throw new Error(`bad point: got length ${b}, expected compressed=${x} or uncompressed=${v}`);
  }
  const y = t.toBytes === void 0 ? f : t.toBytes, w = t.fromBytes === void 0 ? h : t.fromBytes;
  function p(L) {
    const x = r.sqr(L), v = r.mul(x, L);
    return r.add(r.add(v, r.mul(L, o.a)), o.b);
  }
  function m(L, x) {
    const v = r.sqr(x), b = p(L);
    return r.eql(v, b);
  }
  if (!m(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const S = r.mul(r.pow(o.a, Xi), pb), E = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(S, E)))
    throw new Error("bad curve params: a or b");
  function P(L, x, v = !1) {
    if (!r.isValid(x) || v && r.is0(x))
      throw new Error(`bad point coordinate ${L}`);
    return x;
  }
  function I(L) {
    if (!(L instanceof H))
      throw new Error("Weierstrass Point expected");
  }
  function R(L) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return fb(L, c.basises, i.ORDER);
  }
  function U(L, x, v, b, g) {
    return v = new H(r.mul(v.X, L), v.Y, v.Z), x = Mo(b, x), v = Mo(g, v), x.add(v);
  }
  class H {
    // base / generator point
    static BASE = new H(o.Gx, o.Gy, r.ONE);
    // zero / infinity / identity point
    static ZERO = new H(r.ZERO, r.ONE, r.ZERO);
    // 0, 1, 0
    // math field
    static Fp = r;
    // scalar field
    static Fn = i;
    X;
    Y;
    Z;
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(x, v, b) {
      this.X = P("x", x), this.Y = P("y", v, !0), this.Z = P("z", b), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(x) {
      const { x: v, y: b } = x || {};
      if (!x || !r.isValid(v) || !r.isValid(b))
        throw new Error("invalid affine point");
      if (x instanceof H)
        throw new Error("projective point not allowed");
      return r.is0(v) && r.is0(b) ? H.ZERO : new H(v, b, r.ONE);
    }
    static fromBytes(x) {
      const v = H.fromAffine(w(ne(x, void 0, "point")));
      return v.assertValidity(), v;
    }
    static fromHex(x) {
      return H.fromBytes(ot(x));
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
    precompute(x = 8, v = !0) {
      return D.createCache(this, x), v || this.multiply(Xi), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      const x = this;
      if (x.is0()) {
        if (t.allowInfinityPoint && r.is0(x.X) && r.eql(x.Y, r.ONE) && r.is0(x.Z))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x: v, y: b } = x.toAffine();
      if (!r.isValid(v) || !r.isValid(b))
        throw new Error("bad point: x or y not field elements");
      if (!m(v, b))
        throw new Error("bad point: equation left != right");
      if (!x.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y: x } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(x);
    }
    /** Compare one point to another. */
    equals(x) {
      I(x);
      const { X: v, Y: b, Z: g } = this, { X: k, Y: _, Z: $ } = x, T = r.eql(r.mul(v, $), r.mul(k, g)), O = r.eql(r.mul(b, $), r.mul(_, g));
      return T && O;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new H(this.X, r.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a: x, b: v } = o, b = r.mul(v, Xi), { X: g, Y: k, Z: _ } = this;
      let $ = r.ZERO, T = r.ZERO, O = r.ZERO, C = r.mul(g, g), N = r.mul(k, k), K = r.mul(_, _), z = r.mul(g, k);
      return z = r.add(z, z), O = r.mul(g, _), O = r.add(O, O), $ = r.mul(x, O), T = r.mul(b, K), T = r.add($, T), $ = r.sub(N, T), T = r.add(N, T), T = r.mul($, T), $ = r.mul(z, $), O = r.mul(b, O), K = r.mul(x, K), z = r.sub(C, K), z = r.mul(x, z), z = r.add(z, O), O = r.add(C, C), C = r.add(O, C), C = r.add(C, K), C = r.mul(C, z), T = r.add(T, C), K = r.mul(k, _), K = r.add(K, K), C = r.mul(K, z), $ = r.sub($, C), O = r.mul(K, N), O = r.add(O, O), O = r.add(O, O), new H($, T, O);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(x) {
      I(x);
      const { X: v, Y: b, Z: g } = this, { X: k, Y: _, Z: $ } = x;
      let T = r.ZERO, O = r.ZERO, C = r.ZERO;
      const N = o.a, K = r.mul(o.b, Xi);
      let z = r.mul(v, k), M = r.mul(b, _), F = r.mul(g, $), j = r.add(v, b), q = r.add(k, _);
      j = r.mul(j, q), q = r.add(z, M), j = r.sub(j, q), q = r.add(v, g);
      let W = r.add(k, $);
      return q = r.mul(q, W), W = r.add(z, F), q = r.sub(q, W), W = r.add(b, g), T = r.add(_, $), W = r.mul(W, T), T = r.add(M, F), W = r.sub(W, T), C = r.mul(N, q), T = r.mul(K, F), C = r.add(T, C), T = r.sub(M, C), C = r.add(M, C), O = r.mul(T, C), M = r.add(z, z), M = r.add(M, z), F = r.mul(N, F), q = r.mul(K, q), M = r.add(M, F), F = r.sub(z, F), F = r.mul(N, F), q = r.add(q, F), z = r.mul(M, q), O = r.add(O, z), z = r.mul(W, q), T = r.mul(j, T), T = r.sub(T, z), z = r.mul(j, M), C = r.mul(W, C), C = r.add(C, z), new H(T, O, C);
    }
    subtract(x) {
      return I(x), this.add(x.negate());
    }
    is0() {
      return this.equals(H.ZERO);
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
    multiply(x) {
      const { endo: v } = t;
      if (!i.isValidNot0(x))
        throw new RangeError("invalid scalar: out of range");
      let b, g;
      const k = (_) => D.cached(this, _, ($) => hi(H, $));
      if (v) {
        const { k1neg: _, k1: $, k2neg: T, k2: O } = R(x), { p: C, f: N } = k($), { p: K, f: z } = k(O);
        g = N.add(z), b = U(v.beta, C, K, _, T);
      } else {
        const { p: _, f: $ } = k(x);
        b = _, g = $;
      }
      return hi(H, [b, g])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(x) {
      const { endo: v } = t, b = this, g = x;
      if (!i.isValid(g))
        throw new RangeError("invalid scalar: out of range");
      if (g === Et || b.is0())
        return H.ZERO;
      if (g === En)
        return b;
      if (D.hasCache(this))
        return this.multiply(g);
      if (v) {
        const { k1neg: k, k1: _, k2neg: $, k2: T } = R(g), { p1: O, p2: C } = Y0(H, b, _, T);
        return U(v.beta, O, C, k, $);
      } else
        return D.unsafe(b, g);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(x) {
      const v = this;
      let b = x;
      const { X: g, Y: k, Z: _ } = v;
      if (r.eql(_, r.ONE))
        return { x: g, y: k };
      const $ = v.is0();
      b == null && (b = $ ? r.ONE : r.inv(_));
      const T = r.mul(g, b), O = r.mul(k, b), C = r.mul(_, b);
      if ($)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(C, r.ONE))
        throw new Error("invZ was invalid");
      return { x: T, y: O };
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: x } = t;
      return s === En ? !0 : x ? x(H, this) : D.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: x } = t;
      return s === En ? this : x ? x(H, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === En ? this.is0() : this.clearCofactor().is0();
    }
    toBytes(x = !0) {
      return Tn(x, "isCompressed"), this.assertValidity(), y(H, this, x);
    }
    toHex(x = !0) {
      return J(this.toBytes(x));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const B = i.BITS, D = new dh(H, t.endo ? Math.ceil(B / 2) : B);
  return B >= 8 && H.BASE.precompute(8), Object.freeze(H.prototype), Object.freeze(H), H;
}
function yh(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function wh(e, t) {
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
function wb(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? Cc : t.randomBytes, i = Object.assign(wh(e.Fp, n), {
    seed: Math.max(sh(n.ORDER), 16)
  });
  function o(h) {
    try {
      const y = n.fromBytes(h);
      return n.isValidNot0(y);
    } catch {
      return !1;
    }
  }
  function s(h, y) {
    const { publicKey: w, publicKeyUncompressed: p } = i;
    try {
      const m = h.length;
      return y === !0 && m !== w || y === !1 && m !== p ? !1 : !!e.fromBytes(h);
    } catch {
      return !1;
    }
  }
  function a(h) {
    return h = h === void 0 ? r(i.seed) : h, ah(ne(h, i.seed, "seed"), n.ORDER);
  }
  function c(h, y = !0) {
    return e.BASE.multiply(n.fromBytes(h)).toBytes(y);
  }
  function l(h) {
    const { secretKey: y, publicKey: w, publicKeyUncompressed: p } = i, m = n._lengths;
    if (!Rc(h))
      return;
    const S = ne(h, void 0, "key").length, E = S === w || S === p, P = S === y || !!m?.includes(S);
    if (!(E && P))
      return E;
  }
  function u(h, y, w = !0) {
    if (l(h) === !0)
      throw new Error("first arg must be private key");
    if (l(y) === !1)
      throw new Error("second arg must be public key");
    const p = n.fromBytes(h);
    return e.fromBytes(y).multiply(p).toBytes(w);
  }
  const d = {
    isValidSecretKey: o,
    isValidPublicKey: s,
    randomSecretKey: a
  }, f = zc(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: u, keygen: f, Point: e, utils: d, lengths: i });
}
function gb(e, t, n = {}) {
  const r = t;
  Kf(r), Mr(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? Cc : n.randomBytes, o = n.hmac === void 0 ? (g, k) => Wa(r, g, k) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: l } = a, { keygen: u, getPublicKey: d, getSharedSecret: f, utils: h, lengths: y } = wb(e, n), w = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * ph + En < s.ORDER;
  function m(g) {
    const k = c >> En;
    return g > k;
  }
  function S(g, k) {
    if (!a.isValidNot0(k))
      throw new Error(`invalid signature ${g}: out of range 1..Point.Fn.ORDER`);
    return k;
  }
  function E() {
    if (p)
      throw new Error('"recovered" sig type is not supported for cofactor >2 curves');
  }
  function P(g, k) {
    Za(k);
    const _ = y.signature, $ = k === "compact" ? _ : k === "recovered" ? _ + 1 : void 0;
    return ne(g, $);
  }
  class I {
    r;
    s;
    recovery;
    constructor(k, _, $) {
      if (this.r = S("r", k), this.s = S("s", _), $ != null) {
        if (E(), ![0, 1, 2, 3].includes($))
          throw new Error("invalid recovery id");
        this.recovery = $;
      }
      Object.freeze(this);
    }
    static fromBytes(k, _ = w.format) {
      P(k, _);
      let $;
      if (_ === "der") {
        const { r: N, s: K } = tt.toSig(ne(k));
        return new I(N, K);
      }
      _ === "recovered" && ($ = k[0], _ = "compact", k = k.subarray(1));
      const T = y.signature / 2, O = k.subarray(0, T), C = k.subarray(T, T * 2);
      return new I(a.fromBytes(O), a.fromBytes(C), $);
    }
    static fromHex(k, _) {
      return this.fromBytes(ot(k), _);
    }
    assertRecovery() {
      const { recovery: k } = this;
      if (k == null)
        throw new Error("invalid recovery id: must be present");
      return k;
    }
    addRecoveryBit(k) {
      return new I(this.r, this.s, k);
    }
    // Unlike the top-level helper below, this method expects a digest that has
    // already been hashed to the curve's message representative.
    recoverPublicKey(k) {
      const { r: _, s: $ } = this, T = this.assertRecovery(), O = T === 2 || T === 3 ? _ + c : _;
      if (!s.isValid(O))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const C = s.toBytes(O), N = e.fromBytes(Ye(yh((T & 1) === 0), C)), K = a.inv(O), z = U(ne(k, void 0, "msgHash")), M = a.create(-z * K), F = a.create($ * K), j = e.BASE.multiplyUnsafe(M).add(N.multiplyUnsafe(F));
      if (j.is0())
        throw new Error("invalid recovery: point at infinify");
      return j.assertValidity(), j;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return m(this.s);
    }
    toBytes(k = w.format) {
      if (Za(k), k === "der")
        return ot(tt.hexFromSig(this));
      const { r: _, s: $ } = this, T = a.toBytes(_), O = a.toBytes($);
      return k === "recovered" ? (E(), Ye(Uint8Array.of(this.assertRecovery()), T, O)) : Ye(T, O);
    }
    toHex(k) {
      return J(this.toBytes(k));
    }
  }
  Object.freeze(I.prototype), Object.freeze(I);
  const R = n.bits2int === void 0 ? function(k) {
    if (k.length > 8192)
      throw new Error("input is too large");
    const _ = Li(k), $ = k.length * 8 - l;
    return $ > 0 ? _ >> BigInt($) : _;
  } : n.bits2int, U = n.bits2int_modN === void 0 ? function(k) {
    return a.create(R(k));
  } : n.bits2int_modN, H = Nc(l);
  function B(g) {
    return zo("num < 2^" + l, g, Et, H), a.toBytes(g);
  }
  function D(g, k) {
    return ne(g, void 0, "message"), k ? ne(r(g), void 0, "prehashed message") : g;
  }
  function L(g, k, _) {
    const { lowS: $, prehash: T, extraEntropy: O } = da(_, w);
    g = D(g, T);
    const C = U(g), N = a.fromBytes(k);
    if (!a.isValidNot0(N))
      throw new Error("invalid private key");
    const K = [B(N), B(C)];
    if (O != null && O !== !1) {
      const j = O === !0 ? i(y.secretKey) : O;
      K.push(ne(j, void 0, "extraEntropy"));
    }
    const z = Ye(...K), M = C;
    function F(j) {
      const q = R(j);
      if (!a.isValidNot0(q))
        return;
      const W = a.inv(q), se = e.BASE.multiply(q).toAffine(), Fe = a.create(se.x);
      if (Fe === Et)
        return;
      const Ct = a.create(W * a.create(M + Fe * N));
      if (Ct === Et)
        return;
      let Qt = (se.x === Fe ? 0 : 2) | Number(se.y & En), Wr = Ct;
      return $ && m(Ct) && (Wr = a.neg(Ct), Qt ^= 1), new I(Fe, Wr, p ? void 0 : Qt);
    }
    return { seed: z, k2sig: F };
  }
  function x(g, k, _ = {}) {
    const { seed: $, k2sig: T } = L(g, k, _);
    return z0(r.outputLen, a.BYTES, o)($, T).toBytes(_.format);
  }
  function v(g, k, _, $ = {}) {
    const { lowS: T, prehash: O, format: C } = da($, w);
    if (_ = ne(_, void 0, "publicKey"), k = D(k, O), !Rc(g)) {
      const N = g instanceof I ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + N);
    }
    P(g, C);
    try {
      const N = I.fromBytes(g, C), K = e.fromBytes(_);
      if (T && N.hasHighS())
        return !1;
      const { r: z, s: M } = N, F = U(k), j = a.inv(M), q = a.create(F * j), W = a.create(z * j), se = e.BASE.multiplyUnsafe(q).add(K.multiplyUnsafe(W));
      return se.is0() ? !1 : a.create(se.x) === z;
    } catch {
      return !1;
    }
  }
  function b(g, k, _ = {}) {
    const { prehash: $ } = da(_, w);
    return k = D(k, $), I.fromBytes(g, "recovered").recoverPublicKey(k).toBytes();
  }
  return Object.freeze({
    keygen: u,
    getPublicKey: d,
    getSharedSecret: f,
    utils: h,
    lengths: y,
    Point: e,
    sign: x,
    verify: v,
    recoverPublicKey: b,
    Signature: I,
    hash: r
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Is = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, mb = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, bb = /* @__PURE__ */ BigInt(0), Ya = /* @__PURE__ */ BigInt(2);
function vb(e) {
  const t = Is.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), l = e * e * e % t, u = l * l * e % t, d = ce(u, n, t) * u % t, f = ce(d, n, t) * u % t, h = ce(f, Ya, t) * l % t, y = ce(h, i, t) * h % t, w = ce(y, o, t) * y % t, p = ce(w, a, t) * w % t, m = ce(p, c, t) * p % t, S = ce(m, a, t) * w % t, E = ce(S, n, t) * u % t, P = ce(E, s, t) * y % t, I = ce(P, r, t) * l % t, R = ce(I, Ya, t);
  if (!Ko.eql(Ko.sqr(R), e))
    throw new Error("Cannot find square root");
  return R;
}
const Ko = _s(Is.p, { sqrt: vb }), ir = /* @__PURE__ */ yb(Is, {
  Fp: Ko,
  endo: mb
}), fe = /* @__PURE__ */ gb(ir, ae), Od = {};
function Fo(e, ...t) {
  let n = Od[e];
  if (n === void 0) {
    const r = ae(N0(e));
    n = Ye(r, r), Od[e] = n;
  }
  return ae(Ye(n, ...t));
}
const Bs = (e) => e.toBytes(!0).slice(1), $s = (e) => e % Ya === bb;
function gh(e) {
  const { Fn: t, BASE: n } = ir, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: $s(i.y) ? r : t.neg(r), bytes: Bs(i) };
}
function mh(e) {
  const t = Ko;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  $s(i) || (i = t.neg(i));
  const o = ir.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const _r = Li;
function bh(...e) {
  return ir.Fn.create(_r(Fo("BIP0340/challenge", ...e)));
}
function Rd(e) {
  return gh(e).bytes;
}
function xb(e, t, n = Pc(32)) {
  const { Fn: r, BASE: i } = ir, o = ne(e, void 0, "message"), { bytes: s, scalar: a } = gh(t), c = ne(n, 32, "auxRand"), l = r.toBytes(a ^ _r(Fo("BIP0340/aux", c))), u = Fo("BIP0340/nonce", l, s, o), d = r.create(_r(u));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const f = i.multiply(d), h = $s(f.y) ? d : r.neg(d), y = Bs(f), w = bh(y, s, o), p = new Uint8Array(64);
  if (p.set(y, 0), p.set(r.toBytes(r.create(h + w * a)), 32), !vh(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function vh(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = ir, s = ne(e, 64, "signature"), a = ne(t, void 0, "message"), c = ne(n, 32, "publicKey");
  try {
    const l = mh(_r(c)), u = _r(s.subarray(0, 32));
    if (!r.isValidNot0(u))
      return !1;
    const d = _r(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const f = bh(i.toBytes(u), Bs(l), a), h = o.multiplyUnsafe(d).add(l.multiplyUnsafe(i.neg(f))), { x: y, y: w } = h.toAffine();
    return !(h.is0() || !$s(w) || y !== u);
  } catch {
    return !1;
  }
}
const bn = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? Pc(48) : r, ah(r, Is.n));
  return Object.freeze({
    keygen: zc(n, Rd),
    getPublicKey: Rd,
    sign: xb,
    verify: vh,
    Point: ir,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: Fo,
      lift_x: mh,
      pointToBytes: Bs
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), kb = /* @__PURE__ */ Uint8Array.from([
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
]), xh = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Eb = xh.map((e) => (9 * e + 5) % 16), kh = /* @__PURE__ */ (() => {
  const n = [[xh], [Eb]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => kb[o]));
  return n;
})(), Eh = kh[0], Ah = kh[1], Sh = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Ab = /* @__PURE__ */ Eh.map((e, t) => e.map((n) => Sh[t][n])), Sb = /* @__PURE__ */ Ah.map((e, t) => e.map((n) => Sh[t][n])), _b = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Ib = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Cd(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const Ji = /* @__PURE__ */ new Uint32Array(16);
class Bb extends Oc {
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
    for (let h = 0; h < 16; h++, n += 4)
      Ji[h] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, l = this.h3 | 0, u = l, d = this.h4 | 0, f = d;
    for (let h = 0; h < 5; h++) {
      const y = 4 - h, w = _b[h], p = Ib[h], m = Eh[h], S = Ah[h], E = Ab[h], P = Sb[h];
      for (let I = 0; I < 16; I++) {
        const R = qi(r + Cd(h, o, a, l) + Ji[m[I]] + w, E[I]) + d | 0;
        r = d, d = l, l = qi(a, 10) | 0, a = o, o = R;
      }
      for (let I = 0; I < 16; I++) {
        const R = qi(i + Cd(y, s, c, u) + Ji[S[I]] + p, P[I]) + f | 0;
        i = f, f = u, u = qi(c, 10) | 0, c = s, s = R;
      }
    }
    this.set(this.h1 + a + u | 0, this.h2 + l + f | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    Tt(Ji);
  }
  destroy() {
    this.destroyed = !0, Tt(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Mc = /* @__PURE__ */ Ss(() => new Bb()), $b = BigInt(0), Yr = BigInt(1), Tb = BigInt(2), Pb = BigInt(7), Ob = BigInt(256), Rb = BigInt(113), _h = [], Ih = [], Bh = [];
for (let e = 0, t = Yr, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], _h.push(2 * (5 * r + n)), Ih.push((e + 1) * (e + 2) / 2 % 64);
  let i = $b;
  for (let o = 0; o < 7; o++)
    t = (t << Yr ^ (t >> Pb) * Rb) % Ob, t & Tb && (i ^= Yr << (Yr << BigInt(o)) - Yr);
  Bh.push(i);
}
const $h = Vf(Bh, !0), Cb = $h[0], Lb = $h[1], Ld = (e, t, n) => n > 32 ? k0(e, t, n) : v0(e, t, n), Hd = (e, t, n) => n > 32 ? E0(e, t, n) : x0(e, t, n);
function Hb(e, t = 24) {
  if (Bt(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, l = n[c], u = n[c + 1], d = Ld(l, u, 1) ^ n[a], f = Hd(l, u, 1) ^ n[a + 1];
      for (let h = 0; h < 50; h += 10)
        e[s + h] ^= d, e[s + h + 1] ^= f;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Ih[s], c = Ld(i, o, a), l = Hd(i, o, a), u = _h[s];
      i = e[u], o = e[u + 1], e[u] = c, e[u + 1] = l;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], l = e[s + 2], u = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & l, e[s + 9] ^= ~c & u;
    }
    e[0] ^= Cb[r], e[1] ^= Lb[r];
  }
  Tt(n);
}
let Ub = class Th {
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
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, Bt(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = u0(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    yd(this.state32), Hb(this.state32, this.rounds), yd(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Or(this), $t(t);
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
    Or(this, !1), $t(t), this.finish();
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
    return Bt(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (Bc(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, Tt(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new Th(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const Nb = (e, t, n, r = {}) => Ss(() => new Ub(t, e, n), r), jo = /* @__PURE__ */ Nb(1, 136, 32), Db = 1024 * 1024, Ph = Object.getPrototypeOf(Uint8Array.prototype), zb = Object.getOwnPropertyDescriptor(Ph, Symbol.toStringTag).get, Mb = Object.getOwnPropertyDescriptor(Ph, "byteLength").get, Kb = Uint8Array.prototype.set;
function Oh(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("exact message byte length is invalid");
  if (e > Db) throw new Error("exact message exceeds the 1 MiB decoded limit");
}
function Rh(e) {
  const t = e.startsWith("0x") ? 2 : 0;
  Oh(Math.ceil((e.length - t) / 2));
}
function Kc(e) {
  if (typeof e == "string")
    return Rh(e), ot(e.startsWith("0x") ? e.slice(2) : e);
  if (zb.call(e) !== "Uint8Array") throw new TypeError("exact message must be hex or Uint8Array");
  const t = Mb.call(e);
  Oh(t);
  const n = new Uint8Array(t);
  return Kb.call(n, e), n;
}
const hr = typeof globalThis == "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Ts(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Xa(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function ze(e, ...t) {
  if (!Ts(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function Ch(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  Xa(e.outputLen), Xa(e.blockLen);
}
function Vo(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Fb(e, t) {
  ze(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function Pn(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Ir(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function gt(e, t) {
  return e << 32 - t | e >>> t;
}
function Qi(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const Lh = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", jb = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Yn(e) {
  if (ze(e), Lh)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += jb[e[n]];
  return t;
}
const Nt = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Ud(e) {
  if (e >= Nt._0 && e <= Nt._9)
    return e - Nt._0;
  if (e >= Nt.A && e <= Nt.F)
    return e - (Nt.A - 10);
  if (e >= Nt.a && e <= Nt.f)
    return e - (Nt.a - 10);
}
function vi(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Lh)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Ud(e.charCodeAt(o)), a = Ud(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Hh(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function Fc(e) {
  return typeof e == "string" && (e = Hh(e)), ze(e), e;
}
function We(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    ze(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
let Uh = class {
};
function jc(e) {
  const t = (r) => e().update(Fc(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
function Nh(e = 32) {
  if (hr && typeof hr.getRandomValues == "function")
    return hr.getRandomValues(new Uint8Array(e));
  if (hr && typeof hr.randomBytes == "function")
    return Uint8Array.from(hr.randomBytes(e));
  throw new Error("crypto.getRandomValues must be defined");
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Vc = /* @__PURE__ */ BigInt(0), Ja = /* @__PURE__ */ BigInt(1);
function qo(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}"`;
    throw new Error(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function Kn(e, t, n = "") {
  const r = Ts(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function eo(e) {
  const t = e.toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Dh(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  return e === "" ? Vc : BigInt("0x" + e);
}
function Ps(e) {
  return Dh(Yn(e));
}
function zh(e) {
  return ze(e), Dh(Yn(Uint8Array.from(e).reverse()));
}
function qc(e, t) {
  return vi(e.toString(16).padStart(t * 2, "0"));
}
function Mh(e, t) {
  return qc(e, t).reverse();
}
function Ce(e, t, n) {
  let r;
  if (typeof t == "string")
    try {
      r = vi(t);
    } catch (i) {
      throw new Error(e + " must be hex string or Uint8Array, cause: " + i);
    }
  else if (Ts(t))
    r = Uint8Array.from(t);
  else
    throw new Error(e + " must be hex string or Uint8Array");
  return r.length, r;
}
const ua = (e) => typeof e == "bigint" && Vc <= e;
function Vb(e, t, n) {
  return ua(e) && ua(t) && ua(n) && t <= e && e < n;
}
function qb(e, t, n, r) {
  if (!Vb(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Kh(e) {
  let t;
  for (t = 0; e > Vc; e >>= Ja, t += 1)
    ;
  return t;
}
const Hi = (e) => (Ja << BigInt(e)) - Ja;
function Gb(e, t, n) {
  if (typeof e != "number" || e < 2)
    throw new Error("hashLen must be a number");
  if (typeof t != "number" || t < 2)
    throw new Error("qByteLen must be a number");
  if (typeof n != "function")
    throw new Error("hmacFn must be a function");
  const r = (h) => new Uint8Array(h), i = (h) => Uint8Array.of(h);
  let o = r(e), s = r(e), a = 0;
  const c = () => {
    o.fill(1), s.fill(0), a = 0;
  }, l = (...h) => n(s, o, ...h), u = (h = r(0)) => {
    s = l(i(0), h), o = l(), h.length !== 0 && (s = l(i(1), h), o = l());
  }, d = () => {
    if (a++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let h = 0;
    const y = [];
    for (; h < t; ) {
      o = l();
      const w = o.slice();
      y.push(w), h += o.length;
    }
    return We(...y);
  };
  return (h, y) => {
    c(), u(h);
    let w;
    for (; !(w = y(d())); )
      u();
    return c(), w;
  };
}
function Gc(e, t, n = {}) {
  if (!e || typeof e != "object")
    throw new Error("expected valid options object");
  function r(i, o, s) {
    const a = e[i];
    if (s && a === void 0)
      return;
    const c = typeof a;
    if (c !== o || a === null)
      throw new Error(`param "${i}" is invalid: expected ${o}, got ${c}`);
  }
  Object.entries(t).forEach(([i, o]) => r(i, o, !1)), Object.entries(n).forEach(([i, o]) => r(i, o, !0));
}
function Nd(e) {
  const t = /* @__PURE__ */ new WeakMap();
  return (n, ...r) => {
    const i = t.get(n);
    if (i !== void 0)
      return i;
    const o = e(n, ...r);
    return t.set(n, o), o;
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const He = BigInt(0), Re = BigInt(1), Fn = /* @__PURE__ */ BigInt(2), Fh = /* @__PURE__ */ BigInt(3), jh = /* @__PURE__ */ BigInt(4), Vh = /* @__PURE__ */ BigInt(5), Wb = /* @__PURE__ */ BigInt(7), qh = /* @__PURE__ */ BigInt(8), Zb = /* @__PURE__ */ BigInt(9), Gh = /* @__PURE__ */ BigInt(16);
function Ge(e, t) {
  const n = e % t;
  return n >= He ? n : t + n;
}
function je(e, t, n) {
  let r = e;
  for (; t-- > He; )
    r *= r, r %= n;
  return r;
}
function Dd(e, t) {
  if (e === He)
    throw new Error("invert: expected non-zero number");
  if (t <= He)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = Ge(e, t), r = t, i = He, o = Re;
  for (; n !== He; ) {
    const a = r / n, c = r % n, l = i - o * a;
    r = n, n = c, i = o, o = l;
  }
  if (r !== Re)
    throw new Error("invert: does not exist");
  return Ge(i, t);
}
function Wc(e, t, n) {
  if (!e.eql(e.sqr(t), n))
    throw new Error("Cannot find square root");
}
function Wh(e, t) {
  const n = (e.ORDER + Re) / jh, r = e.pow(t, n);
  return Wc(e, r, t), r;
}
function Yb(e, t) {
  const n = (e.ORDER - Vh) / qh, r = e.mul(t, Fn), i = e.pow(r, n), o = e.mul(t, i), s = e.mul(e.mul(o, Fn), i), a = e.mul(o, e.sub(s, e.ONE));
  return Wc(e, a, t), a;
}
function Xb(e) {
  const t = Ui(e), n = Zh(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + Wb) / Gh;
  return (a, c) => {
    let l = a.pow(c, s), u = a.mul(l, r);
    const d = a.mul(l, i), f = a.mul(l, o), h = a.eql(a.sqr(u), c), y = a.eql(a.sqr(d), c);
    l = a.cmov(l, u, h), u = a.cmov(f, d, y);
    const w = a.eql(a.sqr(u), c), p = a.cmov(l, u, w);
    return Wc(a, p, c), p;
  };
}
function Zh(e) {
  if (e < Fh)
    throw new Error("sqrt is not defined for small field");
  let t = e - Re, n = 0;
  for (; t % Fn === He; )
    t /= Fn, n++;
  let r = Fn;
  const i = Ui(e);
  for (; zd(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return Wh;
  let o = i.pow(r, t);
  const s = (t + Re) / Fn;
  return function(c, l) {
    if (c.is0(l))
      return l;
    if (zd(c, l) !== 1)
      throw new Error("Cannot find square root");
    let u = n, d = c.mul(c.ONE, o), f = c.pow(l, t), h = c.pow(l, s);
    for (; !c.eql(f, c.ONE); ) {
      if (c.is0(f))
        return c.ZERO;
      let y = 1, w = c.sqr(f);
      for (; !c.eql(w, c.ONE); )
        if (y++, w = c.sqr(w), y === u)
          throw new Error("Cannot find square root");
      const p = Re << BigInt(u - y - 1), m = c.pow(d, p);
      u = y, d = c.sqr(m), f = c.mul(f, d), h = c.mul(h, m);
    }
    return h;
  };
}
function Jb(e) {
  return e % jh === Fh ? Wh : e % qh === Vh ? Yb : e % Gh === Zb ? Xb(e) : Zh(e);
}
const Qb = [
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
function ev(e) {
  const t = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = Qb.reduce((r, i) => (r[i] = "function", r), t);
  return Gc(e, n), e;
}
function tv(e, t, n) {
  if (n < He)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === He)
    return e.ONE;
  if (n === Re)
    return t;
  let r = e.ONE, i = t;
  for (; n > He; )
    n & Re && (r = e.mul(r, i)), i = e.sqr(i), n >>= Re;
  return r;
}
function Yh(e, t, n = !1) {
  const r = new Array(t.length).fill(n ? e.ZERO : void 0), i = t.reduce((s, a, c) => e.is0(a) ? s : (r[c] = s, e.mul(s, a)), e.ONE), o = e.inv(i);
  return t.reduceRight((s, a, c) => e.is0(a) ? s : (r[c] = e.mul(s, r[c]), e.mul(s, a)), o), r;
}
function zd(e, t) {
  const n = (e.ORDER - Re) / Fn, r = e.pow(t, n), i = e.eql(r, e.ONE), o = e.eql(r, e.ZERO), s = e.eql(r, e.neg(e.ONE));
  if (!i && !o && !s)
    throw new Error("invalid Legendre symbol result");
  return i ? 1 : o ? 0 : -1;
}
function Xh(e, t) {
  t !== void 0 && Xa(t);
  const n = t !== void 0 ? t : e.toString(2).length, r = Math.ceil(n / 8);
  return { nBitLength: n, nByteLength: r };
}
function Ui(e, t, n = !1, r = {}) {
  if (e <= He)
    throw new Error("invalid field: expected ORDER > 0, got " + e);
  let i, o, s = !1, a;
  if (typeof t == "object" && t != null) {
    if (r.sqrt || n)
      throw new Error("cannot specify opts in two arguments");
    const f = t;
    f.BITS && (i = f.BITS), f.sqrt && (o = f.sqrt), typeof f.isLE == "boolean" && (n = f.isLE), typeof f.modFromBytes == "boolean" && (s = f.modFromBytes), a = f.allowedLengths;
  } else
    typeof t == "number" && (i = t), r.sqrt && (o = r.sqrt);
  const { nBitLength: c, nByteLength: l } = Xh(e, i);
  if (l > 2048)
    throw new Error("invalid field: expected ORDER of <= 2048 bytes");
  let u;
  const d = Object.freeze({
    ORDER: e,
    isLE: n,
    BITS: c,
    BYTES: l,
    MASK: Hi(c),
    ZERO: He,
    ONE: Re,
    allowedLengths: a,
    create: (f) => Ge(f, e),
    isValid: (f) => {
      if (typeof f != "bigint")
        throw new Error("invalid field element: expected bigint, got " + typeof f);
      return He <= f && f < e;
    },
    is0: (f) => f === He,
    // is valid and invertible
    isValidNot0: (f) => !d.is0(f) && d.isValid(f),
    isOdd: (f) => (f & Re) === Re,
    neg: (f) => Ge(-f, e),
    eql: (f, h) => f === h,
    sqr: (f) => Ge(f * f, e),
    add: (f, h) => Ge(f + h, e),
    sub: (f, h) => Ge(f - h, e),
    mul: (f, h) => Ge(f * h, e),
    pow: (f, h) => tv(d, f, h),
    div: (f, h) => Ge(f * Dd(h, e), e),
    // Same as above, but doesn't normalize
    sqrN: (f) => f * f,
    addN: (f, h) => f + h,
    subN: (f, h) => f - h,
    mulN: (f, h) => f * h,
    inv: (f) => Dd(f, e),
    sqrt: o || ((f) => (u || (u = Jb(e)), u(d, f))),
    toBytes: (f) => n ? Mh(f, l) : qc(f, l),
    fromBytes: (f, h = !0) => {
      if (a) {
        if (!a.includes(f.length) || f.length > l)
          throw new Error("Field.fromBytes: expected " + a + " bytes, got " + f.length);
        const w = new Uint8Array(l);
        w.set(f, n ? 0 : w.length - f.length), f = w;
      }
      if (f.length !== l)
        throw new Error("Field.fromBytes: expected " + l + " bytes, got " + f.length);
      let y = n ? zh(f) : Ps(f);
      if (s && (y = Ge(y, e)), !h && !d.isValid(y))
        throw new Error("invalid field element: outside of range 0..ORDER");
      return y;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (f) => Yh(d, f),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (f, h, y) => y ? h : f
  });
  return Object.freeze(d);
}
function Jh(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  const t = e.toString(2).length;
  return Math.ceil(t / 8);
}
function Qh(e) {
  const t = Jh(e);
  return t + Math.ceil(t / 2);
}
function nv(e, t, n = !1) {
  const r = e.length, i = Jh(t), o = Qh(t);
  if (r < 16 || r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? zh(e) : Ps(e), a = Ge(s, t - Re) + Re;
  return n ? Mh(a, i) : qc(a, i);
}
function rv(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, l = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + l, a, r);
}
function iv(e, t, n) {
  return e & t ^ ~e & n;
}
function ov(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Zc = class extends Uh {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Ir(this.buffer);
  }
  update(t) {
    Vo(this), t = Fc(t), ze(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = Ir(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Vo(this), Fb(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Pn(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    rv(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = Ir(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const l = c / 4, u = this.get();
    if (l > u.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < l; d++)
      a.setUint32(4 * d, u[d], o);
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
};
const ln = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Se = /* @__PURE__ */ Uint32Array.from([
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
]), to = /* @__PURE__ */ BigInt(2 ** 32 - 1), Md = /* @__PURE__ */ BigInt(32);
function sv(e, t = !1) {
  return t ? { h: Number(e & to), l: Number(e >> Md & to) } : { h: Number(e >> Md & to) | 0, l: Number(e & to) | 0 };
}
function av(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = sv(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Kd = (e, t, n) => e >>> n, Fd = (e, t, n) => e << 32 - n | t >>> n, pr = (e, t, n) => e >>> n | t << 32 - n, yr = (e, t, n) => e << 32 - n | t >>> n, no = (e, t, n) => e << 64 - n | t >>> n - 32, ro = (e, t, n) => e >>> n - 32 | t << 64 - n;
function Dt(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const cv = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), lv = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, dv = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), uv = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, fv = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), hv = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, pv = /* @__PURE__ */ Uint32Array.from([
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
]), dn = /* @__PURE__ */ new Uint32Array(64);
let yv = class extends Zc {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = ln[0] | 0, this.B = ln[1] | 0, this.C = ln[2] | 0, this.D = ln[3] | 0, this.E = ln[4] | 0, this.F = ln[5] | 0, this.G = ln[6] | 0, this.H = ln[7] | 0;
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
      dn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = dn[d - 15], h = dn[d - 2], y = gt(f, 7) ^ gt(f, 18) ^ f >>> 3, w = gt(h, 17) ^ gt(h, 19) ^ h >>> 10;
      dn[d] = w + dn[d - 7] + y + dn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = gt(a, 6) ^ gt(a, 11) ^ gt(a, 25), h = u + f + iv(a, c, l) + pv[d] + dn[d] | 0, w = (gt(r, 2) ^ gt(r, 13) ^ gt(r, 22)) + ov(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Pn(dn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Pn(this.buffer);
  }
};
const ep = av([
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
].map((e) => BigInt(e))), wv = ep[0], gv = ep[1], un = /* @__PURE__ */ new Uint32Array(80), fn = /* @__PURE__ */ new Uint32Array(80);
let mv = class extends Zc {
  constructor(t = 64) {
    super(128, t, 16, !1), this.Ah = Se[0] | 0, this.Al = Se[1] | 0, this.Bh = Se[2] | 0, this.Bl = Se[3] | 0, this.Ch = Se[4] | 0, this.Cl = Se[5] | 0, this.Dh = Se[6] | 0, this.Dl = Se[7] | 0, this.Eh = Se[8] | 0, this.El = Se[9] | 0, this.Fh = Se[10] | 0, this.Fl = Se[11] | 0, this.Gh = Se[12] | 0, this.Gl = Se[13] | 0, this.Hh = Se[14] | 0, this.Hl = Se[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: t, Al: n, Bh: r, Bl: i, Ch: o, Cl: s, Dh: a, Dl: c, Eh: l, El: u, Fh: d, Fl: f, Gh: h, Gl: y, Hh: w, Hl: p } = this;
    return [t, n, r, i, o, s, a, c, l, u, d, f, h, y, w, p];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c, l, u, d, f, h, y, w, p) {
    this.Ah = t | 0, this.Al = n | 0, this.Bh = r | 0, this.Bl = i | 0, this.Ch = o | 0, this.Cl = s | 0, this.Dh = a | 0, this.Dl = c | 0, this.Eh = l | 0, this.El = u | 0, this.Fh = d | 0, this.Fl = f | 0, this.Gh = h | 0, this.Gl = y | 0, this.Hh = w | 0, this.Hl = p | 0;
  }
  process(t, n) {
    for (let E = 0; E < 16; E++, n += 4)
      un[E] = t.getUint32(n), fn[E] = t.getUint32(n += 4);
    for (let E = 16; E < 80; E++) {
      const P = un[E - 15] | 0, I = fn[E - 15] | 0, R = pr(P, I, 1) ^ pr(P, I, 8) ^ Kd(P, I, 7), U = yr(P, I, 1) ^ yr(P, I, 8) ^ Fd(P, I, 7), H = un[E - 2] | 0, B = fn[E - 2] | 0, D = pr(H, B, 19) ^ no(H, B, 61) ^ Kd(H, B, 6), L = yr(H, B, 19) ^ ro(H, B, 61) ^ Fd(H, B, 6), x = dv(U, L, fn[E - 7], fn[E - 16]), v = uv(x, R, D, un[E - 7], un[E - 16]);
      un[E] = v | 0, fn[E] = x | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: l, Dl: u, Eh: d, El: f, Fh: h, Fl: y, Gh: w, Gl: p, Hh: m, Hl: S } = this;
    for (let E = 0; E < 80; E++) {
      const P = pr(d, f, 14) ^ pr(d, f, 18) ^ no(d, f, 41), I = yr(d, f, 14) ^ yr(d, f, 18) ^ ro(d, f, 41), R = d & h ^ ~d & w, U = f & y ^ ~f & p, H = fv(S, I, U, gv[E], fn[E]), B = hv(H, m, P, R, wv[E], un[E]), D = H | 0, L = pr(r, i, 28) ^ no(r, i, 34) ^ no(r, i, 39), x = yr(r, i, 28) ^ ro(r, i, 34) ^ ro(r, i, 39), v = r & o ^ r & a ^ o & a, b = i & s ^ i & c ^ s & c;
      m = w | 0, S = p | 0, w = h | 0, p = y | 0, h = d | 0, y = f | 0, { h: d, l: f } = Dt(l | 0, u | 0, B | 0, D | 0), l = a | 0, u = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const g = cv(D, x, b);
      r = lv(g, B, L, v), i = g | 0;
    }
    ({ h: r, l: i } = Dt(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = Dt(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = Dt(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: l, l: u } = Dt(this.Dh | 0, this.Dl | 0, l | 0, u | 0), { h: d, l: f } = Dt(this.Eh | 0, this.El | 0, d | 0, f | 0), { h, l: y } = Dt(this.Fh | 0, this.Fl | 0, h | 0, y | 0), { h: w, l: p } = Dt(this.Gh | 0, this.Gl | 0, w | 0, p | 0), { h: m, l: S } = Dt(this.Hh | 0, this.Hl | 0, m | 0, S | 0), this.set(r, i, o, s, a, c, l, u, d, f, h, y, w, p, m, S);
  }
  roundClean() {
    Pn(un, fn);
  }
  destroy() {
    Pn(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
const Yc = /* @__PURE__ */ jc(() => new yv()), jd = /* @__PURE__ */ jc(() => new mv());
let tp = class extends Uh {
  constructor(t, n) {
    super(), this.finished = !1, this.destroyed = !1, Ch(t);
    const r = Fc(n);
    if (this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const i = this.blockLen, o = new Uint8Array(i);
    o.set(r.length > i ? t.create().update(r).digest() : r);
    for (let s = 0; s < o.length; s++)
      o[s] ^= 54;
    this.iHash.update(o), this.oHash = t.create();
    for (let s = 0; s < o.length; s++)
      o[s] ^= 106;
    this.oHash.update(o), Pn(o);
  }
  update(t) {
    return Vo(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Vo(this), ze(t, this.outputLen), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t || (t = Object.create(Object.getPrototypeOf(this), {}));
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
const Go = (e, t, n) => new tp(e, t).update(n).digest();
Go.create = (e, t) => new tp(e, t);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Lr = BigInt(0), jn = BigInt(1);
function Wo(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function fa(e, t) {
  const n = Yh(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function np(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function ha(e, t) {
  np(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = Hi(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function Vd(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += jn);
  const l = t * r, u = l + Math.abs(a) - 1, d = a === 0, f = a < 0, h = t % 2 !== 0;
  return { nextN: c, offset: u, isZero: d, isNeg: f, isNegF: h, offsetF: l };
}
function bv(e, t) {
  if (!Array.isArray(e))
    throw new Error("array expected");
  e.forEach((n, r) => {
    if (!(n instanceof t))
      throw new Error("invalid point at index " + r);
  });
}
function vv(e, t) {
  if (!Array.isArray(e))
    throw new Error("array of scalars expected");
  e.forEach((n, r) => {
    if (!t.isValid(n))
      throw new Error("invalid scalar at index " + r);
  });
}
const pa = /* @__PURE__ */ new WeakMap(), rp = /* @__PURE__ */ new WeakMap();
function ya(e) {
  return rp.get(e) || 1;
}
function qd(e) {
  if (e !== Lr)
    throw new Error("invalid wNAF");
}
class xv {
  // Parametrized with a given Point class (not individual point)
  constructor(t, n) {
    this.BASE = t.BASE, this.ZERO = t.ZERO, this.Fn = t.Fn, this.bits = n;
  }
  // non-const time multiplication ladder
  _unsafeLadder(t, n, r = this.ZERO) {
    let i = t;
    for (; n > Lr; )
      n & jn && (r = r.add(i)), i = i.double(), n >>= jn;
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
   * @param point Point instance
   * @param W window size
   * @returns precomputed point tables flattened to a single array
   */
  precomputeWindow(t, n) {
    const { windows: r, windowSize: i } = ha(n, this.bits), o = [];
    let s = t, a = s;
    for (let c = 0; c < r; c++) {
      a = s, o.push(a);
      for (let l = 1; l < i; l++)
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
    const s = ha(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: l, isZero: u, isNeg: d, isNegF: f, offsetF: h } = Vd(r, a, s);
      r = c, u ? o = o.add(Wo(f, n[h])) : i = i.add(Wo(d, n[l]));
    }
    return qd(r), { p: i, f: o };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = ha(t, this.bits);
    for (let s = 0; s < o.windows && r !== Lr; s++) {
      const { nextN: a, offset: c, isZero: l, isNeg: u } = Vd(r, s, o);
      if (r = a, !l) {
        const d = n[c];
        i = i.add(u ? d.negate() : d);
      }
    }
    return qd(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = pa.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), pa.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = ya(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = ya(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    np(n, this.bits), rp.set(t, n), pa.delete(t);
  }
  hasCache(t) {
    return ya(t) !== 1;
  }
}
function kv(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > Lr || r > Lr; )
    n & jn && (o = o.add(i)), r & jn && (s = s.add(i)), i = i.double(), n >>= jn, r >>= jn;
  return { p1: o, p2: s };
}
function Ev(e, t, n, r) {
  bv(n, e), vv(r, t);
  const i = n.length, o = r.length;
  if (i !== o)
    throw new Error("arrays of points and scalars must have equal length");
  const s = e.ZERO, a = Kh(BigInt(i));
  let c = 1;
  a > 12 ? c = a - 3 : a > 4 ? c = a - 2 : a > 0 && (c = 2);
  const l = Hi(c), u = new Array(Number(l) + 1).fill(s), d = Math.floor((t.BITS - 1) / c) * c;
  let f = s;
  for (let h = d; h >= 0; h -= c) {
    u.fill(s);
    for (let w = 0; w < o; w++) {
      const p = r[w], m = Number(p >> BigInt(h) & l);
      u[m] = u[m].add(n[w]);
    }
    let y = s;
    for (let w = u.length - 1, p = s; w > 0; w--)
      p = p.add(u[w]), y = y.add(p);
    if (f = f.add(y), h !== 0)
      for (let w = 0; w < c; w++)
        f = f.double();
  }
  return f;
}
function Gd(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return ev(t), t;
  } else
    return Ui(e, { isLE: n });
}
function Av(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const l = t[c];
    if (!(typeof l == "bigint" && l > Lr))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = Gd(t.p, n.Fp, r), o = Gd(t.n, n.Fn, r), a = ["Gx", "Gy", "a", "b"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Wd = (e, t) => (e + (e >= 0 ? t : -t) / ip) / t;
function Sv(e, t, n) {
  const [[r, i], [o, s]] = t, a = Wd(s * e, n), c = Wd(-i * e, n);
  let l = e - a * r - c * o, u = -a * i - c * s;
  const d = l < qt, f = u < qt;
  d && (l = -l), f && (u = -u);
  const h = Hi(Math.ceil(Kh(n) / 2)) + Br;
  if (l < qt || l >= h || u < qt || u >= h)
    throw new Error("splitScalar (endomorphism): failed, k=" + e);
  return { k1neg: d, k1: l, k2neg: f, k2: u };
}
function Qa(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function wa(e, t) {
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return qo(n.lowS, "lowS"), qo(n.prehash, "prehash"), n.format !== void 0 && Qa(n.format), n;
}
class _v extends Error {
  constructor(t = "") {
    super(t);
  }
}
const jt = {
  // asn.1 DER encoding utils
  Err: _v,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = jt;
      if (e < 0 || e > 256)
        throw new n("tlv.encode: wrong tag");
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = eo(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? eo(i.length / 2 | 128) : "";
      return eo(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = jt;
      let r = 0;
      if (e < 0 || e > 256)
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
        const l = t.subarray(r, r + c);
        if (l.length !== c)
          throw new n("tlv.decode: length bytes not complete");
        if (l[0] === 0)
          throw new n("tlv.decode(long): zero leftmost byte");
        for (const u of l)
          s = s << 8 | u;
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
      const { Err: t } = jt;
      if (e < qt)
        throw new t("integer: negative integers are not allowed");
      let n = eo(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = jt;
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Ps(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = jt, i = Ce("signature", e), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: l, l: u } = r.decode(2, c);
    if (u.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(l) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = jt, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
}, qt = BigInt(0), Br = BigInt(1), ip = BigInt(2), io = BigInt(3), Iv = BigInt(4);
function Er(e, t) {
  const { BYTES: n } = e;
  let r;
  if (typeof t == "bigint")
    r = t;
  else {
    let i = Ce("private key", t);
    try {
      r = e.fromBytes(i);
    } catch {
      throw new Error(`invalid private key: expected ui8a of size ${n}, got ${typeof t}`);
    }
  }
  if (!e.isValidNot0(r))
    throw new Error("invalid private key: out of range [1..N-1]");
  return r;
}
function Bv(e, t = {}) {
  const n = Av("weierstrass", e, t), { Fp: r, Fn: i } = n;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  Gc(t, {}, {
    allowInfinityPoint: "boolean",
    clearCofactor: "function",
    isTorsionFree: "function",
    fromBytes: "function",
    toBytes: "function",
    endo: "object",
    wrapPrivateKey: "boolean"
  });
  const { endo: c } = t;
  if (c && (!r.is0(o.a) || typeof c.beta != "bigint" || !Array.isArray(c.basises)))
    throw new Error('invalid endo: expected "beta": bigint and "basises": array');
  const l = sp(r, i);
  function u() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function d(x, v, b) {
    const { x: g, y: k } = v.toAffine(), _ = r.toBytes(g);
    if (qo(b, "isCompressed"), b) {
      u();
      const $ = !r.isOdd(k);
      return We(op($), _);
    } else
      return We(Uint8Array.of(4), _, r.toBytes(k));
  }
  function f(x) {
    Kn(x, void 0, "Point");
    const { publicKey: v, publicKeyUncompressed: b } = l, g = x.length, k = x[0], _ = x.subarray(1);
    if (g === v && (k === 2 || k === 3)) {
      const $ = r.fromBytes(_);
      if (!r.isValid($))
        throw new Error("bad point: is not on curve, wrong x");
      const T = w($);
      let O;
      try {
        O = r.sqrt(T);
      } catch (K) {
        const z = K instanceof Error ? ": " + K.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + z);
      }
      u();
      const C = r.isOdd(O);
      return (k & 1) === 1 !== C && (O = r.neg(O)), { x: $, y: O };
    } else if (g === b && k === 4) {
      const $ = r.BYTES, T = r.fromBytes(_.subarray(0, $)), O = r.fromBytes(_.subarray($, $ * 2));
      if (!p(T, O))
        throw new Error("bad point: is not on curve");
      return { x: T, y: O };
    } else
      throw new Error(`bad point: got length ${g}, expected compressed=${v} or uncompressed=${b}`);
  }
  const h = t.toBytes || d, y = t.fromBytes || f;
  function w(x) {
    const v = r.sqr(x), b = r.mul(v, x);
    return r.add(r.add(b, r.mul(x, o.a)), o.b);
  }
  function p(x, v) {
    const b = r.sqr(v), g = w(x);
    return r.eql(b, g);
  }
  if (!p(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const m = r.mul(r.pow(o.a, io), Iv), S = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(m, S)))
    throw new Error("bad curve params: a or b");
  function E(x, v, b = !1) {
    if (!r.isValid(v) || b && r.is0(v))
      throw new Error(`bad point coordinate ${x}`);
    return v;
  }
  function P(x) {
    if (!(x instanceof B))
      throw new Error("ProjectivePoint expected");
  }
  function I(x) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return Sv(x, c.basises, i.ORDER);
  }
  const R = Nd((x, v) => {
    const { X: b, Y: g, Z: k } = x;
    if (r.eql(k, r.ONE))
      return { x: b, y: g };
    const _ = x.is0();
    v == null && (v = _ ? r.ONE : r.inv(k));
    const $ = r.mul(b, v), T = r.mul(g, v), O = r.mul(k, v);
    if (_)
      return { x: r.ZERO, y: r.ZERO };
    if (!r.eql(O, r.ONE))
      throw new Error("invZ was invalid");
    return { x: $, y: T };
  }), U = Nd((x) => {
    if (x.is0()) {
      if (t.allowInfinityPoint && !r.is0(x.Y))
        return;
      throw new Error("bad point: ZERO");
    }
    const { x: v, y: b } = x.toAffine();
    if (!r.isValid(v) || !r.isValid(b))
      throw new Error("bad point: x or y not field elements");
    if (!p(v, b))
      throw new Error("bad point: equation left != right");
    if (!x.isTorsionFree())
      throw new Error("bad point: not in prime-order subgroup");
    return !0;
  });
  function H(x, v, b, g, k) {
    return b = new B(r.mul(b.X, x), b.Y, b.Z), v = Wo(g, v), b = Wo(k, b), v.add(b);
  }
  class B {
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    constructor(v, b, g) {
      this.X = E("x", v), this.Y = E("y", b, !0), this.Z = E("z", g), Object.freeze(this);
    }
    static CURVE() {
      return o;
    }
    /** Does NOT validate if the point is valid. Use `.assertValidity()`. */
    static fromAffine(v) {
      const { x: b, y: g } = v || {};
      if (!v || !r.isValid(b) || !r.isValid(g))
        throw new Error("invalid affine point");
      if (v instanceof B)
        throw new Error("projective point not allowed");
      return r.is0(b) && r.is0(g) ? B.ZERO : new B(b, g, r.ONE);
    }
    static fromBytes(v) {
      const b = B.fromAffine(y(Kn(v, void 0, "point")));
      return b.assertValidity(), b;
    }
    static fromHex(v) {
      return B.fromBytes(Ce("pointHex", v));
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
     * @param isLazy true will defer table computation until the first multiplication
     * @returns
     */
    precompute(v = 8, b = !0) {
      return L.createCache(this, v), b || this.multiply(io), this;
    }
    // TODO: return `this`
    /** A point on curve is valid if it conforms to equation. */
    assertValidity() {
      U(this);
    }
    hasEvenY() {
      const { y: v } = this.toAffine();
      if (!r.isOdd)
        throw new Error("Field doesn't support isOdd");
      return !r.isOdd(v);
    }
    /** Compare one point to another. */
    equals(v) {
      P(v);
      const { X: b, Y: g, Z: k } = this, { X: _, Y: $, Z: T } = v, O = r.eql(r.mul(b, T), r.mul(_, k)), C = r.eql(r.mul(g, T), r.mul($, k));
      return O && C;
    }
    /** Flips point to one corresponding to (x, -y) in Affine coordinates. */
    negate() {
      return new B(this.X, r.neg(this.Y), this.Z);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a: v, b } = o, g = r.mul(b, io), { X: k, Y: _, Z: $ } = this;
      let T = r.ZERO, O = r.ZERO, C = r.ZERO, N = r.mul(k, k), K = r.mul(_, _), z = r.mul($, $), M = r.mul(k, _);
      return M = r.add(M, M), C = r.mul(k, $), C = r.add(C, C), T = r.mul(v, C), O = r.mul(g, z), O = r.add(T, O), T = r.sub(K, O), O = r.add(K, O), O = r.mul(T, O), T = r.mul(M, T), C = r.mul(g, C), z = r.mul(v, z), M = r.sub(N, z), M = r.mul(v, M), M = r.add(M, C), C = r.add(N, N), N = r.add(C, N), N = r.add(N, z), N = r.mul(N, M), O = r.add(O, N), z = r.mul(_, $), z = r.add(z, z), N = r.mul(z, M), T = r.sub(T, N), C = r.mul(z, K), C = r.add(C, C), C = r.add(C, C), new B(T, O, C);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(v) {
      P(v);
      const { X: b, Y: g, Z: k } = this, { X: _, Y: $, Z: T } = v;
      let O = r.ZERO, C = r.ZERO, N = r.ZERO;
      const K = o.a, z = r.mul(o.b, io);
      let M = r.mul(b, _), F = r.mul(g, $), j = r.mul(k, T), q = r.add(b, g), W = r.add(_, $);
      q = r.mul(q, W), W = r.add(M, F), q = r.sub(q, W), W = r.add(b, k);
      let se = r.add(_, T);
      return W = r.mul(W, se), se = r.add(M, j), W = r.sub(W, se), se = r.add(g, k), O = r.add($, T), se = r.mul(se, O), O = r.add(F, j), se = r.sub(se, O), N = r.mul(K, W), O = r.mul(z, j), N = r.add(O, N), O = r.sub(F, N), N = r.add(F, N), C = r.mul(O, N), F = r.add(M, M), F = r.add(F, M), j = r.mul(K, j), W = r.mul(z, W), F = r.add(F, j), j = r.sub(M, j), j = r.mul(K, j), W = r.add(W, j), M = r.mul(F, W), C = r.add(C, M), M = r.mul(se, W), O = r.mul(q, O), O = r.sub(O, M), M = r.mul(q, F), N = r.mul(se, N), N = r.add(N, M), new B(O, C, N);
    }
    subtract(v) {
      return this.add(v.negate());
    }
    is0() {
      return this.equals(B.ZERO);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(v) {
      const { endo: b } = t;
      if (!i.isValidNot0(v))
        throw new Error("invalid scalar: out of range");
      let g, k;
      const _ = ($) => L.cached(this, $, (T) => fa(B, T));
      if (b) {
        const { k1neg: $, k1: T, k2neg: O, k2: C } = I(v), { p: N, f: K } = _(T), { p: z, f: M } = _(C);
        k = K.add(M), g = H(b.beta, N, z, $, O);
      } else {
        const { p: $, f: T } = _(v);
        g = $, k = T;
      }
      return fa(B, [g, k])[0];
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed secret key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(v) {
      const { endo: b } = t, g = this;
      if (!i.isValid(v))
        throw new Error("invalid scalar: out of range");
      if (v === qt || g.is0())
        return B.ZERO;
      if (v === Br)
        return g;
      if (L.hasCache(this))
        return this.multiply(v);
      if (b) {
        const { k1neg: k, k1: _, k2neg: $, k2: T } = I(v), { p1: O, p2: C } = kv(B, g, _, T);
        return H(b.beta, O, C, k, $);
      } else
        return L.unsafe(g, v);
    }
    multiplyAndAddUnsafe(v, b, g) {
      const k = this.multiplyUnsafe(b).add(v.multiplyUnsafe(g));
      return k.is0() ? void 0 : k;
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * @param invertedZ Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(v) {
      return R(this, v);
    }
    /**
     * Checks whether Point is free of torsion elements (is in prime subgroup).
     * Always torsion-free for cofactor=1 curves.
     */
    isTorsionFree() {
      const { isTorsionFree: v } = t;
      return s === Br ? !0 : v ? v(B, this) : L.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: v } = t;
      return s === Br ? this : v ? v(B, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(s).is0();
    }
    toBytes(v = !0) {
      return qo(v, "isCompressed"), this.assertValidity(), h(B, this, v);
    }
    toHex(v = !0) {
      return Yn(this.toBytes(v));
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
    // TODO: remove
    get px() {
      return this.X;
    }
    get py() {
      return this.X;
    }
    get pz() {
      return this.Z;
    }
    toRawBytes(v = !0) {
      return this.toBytes(v);
    }
    _setWindowSize(v) {
      this.precompute(v);
    }
    static normalizeZ(v) {
      return fa(B, v);
    }
    static msm(v, b) {
      return Ev(B, i, v, b);
    }
    static fromPrivateKey(v) {
      return B.BASE.multiply(Er(i, v));
    }
  }
  B.BASE = new B(o.Gx, o.Gy, r.ONE), B.ZERO = new B(r.ZERO, r.ONE, r.ZERO), B.Fp = r, B.Fn = i;
  const D = i.BITS, L = new xv(B, t.endo ? Math.ceil(D / 2) : D);
  return B.BASE.precompute(8), B;
}
function op(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function sp(e, t) {
  return {
    secretKey: t.BYTES,
    publicKey: 1 + e.BYTES,
    publicKeyUncompressed: 1 + 2 * e.BYTES,
    publicKeyHasPrefix: !0,
    signature: 2 * t.BYTES
  };
}
function $v(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes || Nh, i = Object.assign(sp(e.Fp, n), { seed: Qh(n.ORDER) });
  function o(h) {
    try {
      return !!Er(n, h);
    } catch {
      return !1;
    }
  }
  function s(h, y) {
    const { publicKey: w, publicKeyUncompressed: p } = i;
    try {
      const m = h.length;
      return y === !0 && m !== w || y === !1 && m !== p ? !1 : !!e.fromBytes(h);
    } catch {
      return !1;
    }
  }
  function a(h = r(i.seed)) {
    return nv(Kn(h, i.seed, "seed"), n.ORDER);
  }
  function c(h, y = !0) {
    return e.BASE.multiply(Er(n, h)).toBytes(y);
  }
  function l(h) {
    const y = a(h);
    return { secretKey: y, publicKey: c(y) };
  }
  function u(h) {
    if (typeof h == "bigint")
      return !1;
    if (h instanceof e)
      return !0;
    const { secretKey: y, publicKey: w, publicKeyUncompressed: p } = i;
    if (n.allowedLengths || y === w)
      return;
    const m = Ce("key", h).length;
    return m === w || m === p;
  }
  function d(h, y, w = !0) {
    if (u(h) === !0)
      throw new Error("first arg must be private key");
    if (u(y) === !1)
      throw new Error("second arg must be public key");
    const p = Er(n, h);
    return e.fromHex(y).multiply(p).toBytes(w);
  }
  return Object.freeze({ getPublicKey: c, getSharedSecret: d, keygen: l, Point: e, utils: {
    isValidSecretKey: o,
    isValidPublicKey: s,
    randomSecretKey: a,
    // TODO: remove
    isValidPrivateKey: o,
    randomPrivateKey: a,
    normPrivateKeyToScalar: (h) => Er(n, h),
    precompute(h = 8, y = e.BASE) {
      return y.precompute(h, !1);
    }
  }, lengths: i });
}
function Tv(e, t, n = {}) {
  Ch(t), Gc(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const r = n.randomBytes || Nh, i = n.hmac || ((b, ...g) => Go(t, b, We(...g))), { Fp: o, Fn: s } = e, { ORDER: a, BITS: c } = s, { keygen: l, getPublicKey: u, getSharedSecret: d, utils: f, lengths: h } = $v(e, n), y = {
    prehash: !1,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !1,
    format: void 0,
    //'compact' as ECDSASigFormat,
    extraEntropy: !1
  }, w = "compact";
  function p(b) {
    const g = a >> Br;
    return b > g;
  }
  function m(b, g) {
    if (!s.isValidNot0(g))
      throw new Error(`invalid signature ${b}: out of range 1..Point.Fn.ORDER`);
    return g;
  }
  function S(b, g) {
    Qa(g);
    const k = h.signature, _ = g === "compact" ? k : g === "recovered" ? k + 1 : void 0;
    return Kn(b, _, `${g} signature`);
  }
  class E {
    constructor(g, k, _) {
      this.r = m("r", g), this.s = m("s", k), _ != null && (this.recovery = _), Object.freeze(this);
    }
    static fromBytes(g, k = w) {
      S(g, k);
      let _;
      if (k === "der") {
        const { r: C, s: N } = jt.toSig(Kn(g));
        return new E(C, N);
      }
      k === "recovered" && (_ = g[0], k = "compact", g = g.subarray(1));
      const $ = s.BYTES, T = g.subarray(0, $), O = g.subarray($, $ * 2);
      return new E(s.fromBytes(T), s.fromBytes(O), _);
    }
    static fromHex(g, k) {
      return this.fromBytes(vi(g), k);
    }
    addRecoveryBit(g) {
      return new E(this.r, this.s, g);
    }
    recoverPublicKey(g) {
      const k = o.ORDER, { r: _, s: $, recovery: T } = this;
      if (T == null || ![0, 1, 2, 3].includes(T))
        throw new Error("recovery id invalid");
      if (a * ip < k && T > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const C = T === 2 || T === 3 ? _ + a : _;
      if (!o.isValid(C))
        throw new Error("recovery id 2 or 3 invalid");
      const N = o.toBytes(C), K = e.fromBytes(We(op((T & 1) === 0), N)), z = s.inv(C), M = I(Ce("msgHash", g)), F = s.create(-M * z), j = s.create($ * z), q = e.BASE.multiplyUnsafe(F).add(K.multiplyUnsafe(j));
      if (q.is0())
        throw new Error("point at infinify");
      return q.assertValidity(), q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return p(this.s);
    }
    toBytes(g = w) {
      if (Qa(g), g === "der")
        return vi(jt.hexFromSig(this));
      const k = s.toBytes(this.r), _ = s.toBytes(this.s);
      if (g === "recovered") {
        if (this.recovery == null)
          throw new Error("recovery bit must be present");
        return We(Uint8Array.of(this.recovery), k, _);
      }
      return We(k, _);
    }
    toHex(g) {
      return Yn(this.toBytes(g));
    }
    // TODO: remove
    assertValidity() {
    }
    static fromCompact(g) {
      return E.fromBytes(Ce("sig", g), "compact");
    }
    static fromDER(g) {
      return E.fromBytes(Ce("sig", g), "der");
    }
    normalizeS() {
      return this.hasHighS() ? new E(this.r, s.neg(this.s), this.recovery) : this;
    }
    toDERRawBytes() {
      return this.toBytes("der");
    }
    toDERHex() {
      return Yn(this.toBytes("der"));
    }
    toCompactRawBytes() {
      return this.toBytes("compact");
    }
    toCompactHex() {
      return Yn(this.toBytes("compact"));
    }
  }
  const P = n.bits2int || function(g) {
    if (g.length > 8192)
      throw new Error("input is too large");
    const k = Ps(g), _ = g.length * 8 - c;
    return _ > 0 ? k >> BigInt(_) : k;
  }, I = n.bits2int_modN || function(g) {
    return s.create(P(g));
  }, R = Hi(c);
  function U(b) {
    return qb("num < 2^" + c, b, qt, R), s.toBytes(b);
  }
  function H(b, g) {
    return Kn(b, void 0, "message"), g ? Kn(t(b), void 0, "prehashed message") : b;
  }
  function B(b, g, k) {
    if (["recovered", "canonical"].some((F) => F in k))
      throw new Error("sign() legacy options not supported");
    const { lowS: _, prehash: $, extraEntropy: T } = wa(k, y);
    b = H(b, $);
    const O = I(b), C = Er(s, g), N = [U(C), U(O)];
    if (T != null && T !== !1) {
      const F = T === !0 ? r(h.secretKey) : T;
      N.push(Ce("extraEntropy", F));
    }
    const K = We(...N), z = O;
    function M(F) {
      const j = P(F);
      if (!s.isValidNot0(j))
        return;
      const q = s.inv(j), W = e.BASE.multiply(j).toAffine(), se = s.create(W.x);
      if (se === qt)
        return;
      const Fe = s.create(q * s.create(z + se * C));
      if (Fe === qt)
        return;
      let Ct = (W.x === se ? 0 : 2) | Number(W.y & Br), Qt = Fe;
      return _ && p(Fe) && (Qt = s.neg(Fe), Ct ^= 1), new E(se, Qt, Ct);
    }
    return { seed: K, k2sig: M };
  }
  function D(b, g, k = {}) {
    b = Ce("message", b);
    const { seed: _, k2sig: $ } = B(b, g, k);
    return Gb(t.outputLen, s.BYTES, i)(_, $);
  }
  function L(b) {
    let g;
    const k = typeof b == "string" || Ts(b), _ = !k && b !== null && typeof b == "object" && typeof b.r == "bigint" && typeof b.s == "bigint";
    if (!k && !_)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (_)
      g = new E(b.r, b.s);
    else if (k) {
      try {
        g = E.fromBytes(Ce("sig", b), "der");
      } catch ($) {
        if (!($ instanceof jt.Err))
          throw $;
      }
      if (!g)
        try {
          g = E.fromBytes(Ce("sig", b), "compact");
        } catch {
          return !1;
        }
    }
    return g || !1;
  }
  function x(b, g, k, _ = {}) {
    const { lowS: $, prehash: T, format: O } = wa(_, y);
    if (k = Ce("publicKey", k), g = H(Ce("message", g), T), "strict" in _)
      throw new Error("options.strict was renamed to lowS");
    const C = O === void 0 ? L(b) : E.fromBytes(Ce("sig", b), O);
    if (C === !1)
      return !1;
    try {
      const N = e.fromBytes(k);
      if ($ && C.hasHighS())
        return !1;
      const { r: K, s: z } = C, M = I(g), F = s.inv(z), j = s.create(M * F), q = s.create(K * F), W = e.BASE.multiplyUnsafe(j).add(N.multiplyUnsafe(q));
      return W.is0() ? !1 : s.create(W.x) === K;
    } catch {
      return !1;
    }
  }
  function v(b, g, k = {}) {
    const { prehash: _ } = wa(k, y);
    return g = H(g, _), E.fromBytes(b, "recovered").recoverPublicKey(g).toBytes();
  }
  return Object.freeze({
    keygen: l,
    getPublicKey: u,
    getSharedSecret: d,
    utils: f,
    lengths: h,
    Point: e,
    sign: D,
    verify: x,
    recoverPublicKey: v,
    Signature: E,
    hash: t
  });
}
function Pv(e) {
  const t = {
    a: e.a,
    b: e.b,
    p: e.Fp.ORDER,
    n: e.n,
    h: e.h,
    Gx: e.Gx,
    Gy: e.Gy
  }, n = e.Fp;
  let r = e.allowedPrivateKeyLengths ? Array.from(new Set(e.allowedPrivateKeyLengths.map((s) => Math.ceil(s / 2)))) : void 0;
  const i = Ui(t.n, {
    BITS: e.nBitLength,
    allowedLengths: r,
    modFromBytes: e.wrapPrivateKey
  }), o = {
    Fp: n,
    Fn: i,
    allowInfinityPoint: e.allowInfinityPoint,
    endo: e.endo,
    isTorsionFree: e.isTorsionFree,
    clearCofactor: e.clearCofactor,
    fromBytes: e.fromBytes,
    toBytes: e.toBytes
  };
  return { CURVE: t, curveOpts: o };
}
function Ov(e) {
  const { CURVE: t, curveOpts: n } = Pv(e), r = {
    hmac: e.hmac,
    randomBytes: e.randomBytes,
    lowS: e.lowS,
    bits2int: e.bits2int,
    bits2int_modN: e.bits2int_modN
  };
  return { CURVE: t, curveOpts: n, hash: e.hash, ecdsaOpts: r };
}
function Rv(e, t) {
  const n = t.Point;
  return Object.assign({}, t, {
    ProjectivePoint: n,
    CURVE: Object.assign({}, e, Xh(n.Fn.ORDER, n.Fn.BITS))
  });
}
function Cv(e) {
  const { CURVE: t, curveOpts: n, hash: r, ecdsaOpts: i } = Ov(e), o = Bv(t, n), s = Tv(o, r, i);
  return Rv(e, s);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Lv(e, t) {
  const n = (r) => Cv({ ...e, hash: r });
  return { ...n(t), create: n };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Xc = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Hv = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Zd = /* @__PURE__ */ BigInt(2);
function Uv(e) {
  const t = Xc.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), l = e * e * e % t, u = l * l * e % t, d = je(u, n, t) * u % t, f = je(d, n, t) * u % t, h = je(f, Zd, t) * l % t, y = je(h, i, t) * h % t, w = je(y, o, t) * y % t, p = je(w, a, t) * w % t, m = je(p, c, t) * p % t, S = je(m, a, t) * w % t, E = je(S, n, t) * u % t, P = je(E, s, t) * y % t, I = je(P, r, t) * l % t, R = je(I, Zd, t);
  if (!ec.eql(ec.sqr(R), e))
    throw new Error("Cannot find square root");
  return R;
}
const ec = Ui(Xc.p, { sqrt: Uv }), Kt = Lv({ ...Xc, Fp: ec, lowS: !0, endo: Hv }, Yc), Nv = /* @__PURE__ */ Uint8Array.from([
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
]), ap = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Dv = ap.map((e) => (9 * e + 5) % 16), cp = /* @__PURE__ */ (() => {
  const n = [[ap], [Dv]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Nv[o]));
  return n;
})(), lp = cp[0], dp = cp[1], up = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), zv = /* @__PURE__ */ lp.map((e, t) => e.map((n) => up[t][n])), Mv = /* @__PURE__ */ dp.map((e, t) => e.map((n) => up[t][n])), Kv = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Fv = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Yd(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const oo = /* @__PURE__ */ new Uint32Array(16);
class jv extends Zc {
  constructor() {
    super(64, 20, 8, !0), this.h0 = 1732584193, this.h1 = -271733879, this.h2 = -1732584194, this.h3 = 271733878, this.h4 = -1009589776;
  }
  get() {
    const { h0: t, h1: n, h2: r, h3: i, h4: o } = this;
    return [t, n, r, i, o];
  }
  set(t, n, r, i, o) {
    this.h0 = t | 0, this.h1 = n | 0, this.h2 = r | 0, this.h3 = i | 0, this.h4 = o | 0;
  }
  process(t, n) {
    for (let h = 0; h < 16; h++, n += 4)
      oo[h] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, l = this.h3 | 0, u = l, d = this.h4 | 0, f = d;
    for (let h = 0; h < 5; h++) {
      const y = 4 - h, w = Kv[h], p = Fv[h], m = lp[h], S = dp[h], E = zv[h], P = Mv[h];
      for (let I = 0; I < 16; I++) {
        const R = Qi(r + Yd(h, o, a, l) + oo[m[I]] + w, E[I]) + d | 0;
        r = d, d = l, l = Qi(a, 10) | 0, a = o, o = R;
      }
      for (let I = 0; I < 16; I++) {
        const R = Qi(i + Yd(y, s, c, u) + oo[S[I]] + p, P[I]) + f | 0;
        i = f, f = u, u = Qi(c, 10) | 0, c = s, s = R;
      }
    }
    this.set(this.h1 + a + u | 0, this.h2 + l + f | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    Pn(oo);
  }
  destroy() {
    this.destroyed = !0, Pn(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Vv = /* @__PURE__ */ jc(() => new jv());
/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function xi(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function fp(e, t) {
  return Array.isArray(t) ? t.length === 0 ? !0 : e ? t.every((n) => typeof n == "string") : t.every((n) => Number.isSafeInteger(n)) : !1;
}
function hp(e) {
  if (typeof e != "function")
    throw new Error("function expected");
  return !0;
}
function Hr(e, t) {
  if (typeof t != "string")
    throw new Error(`${e}: string expected`);
  return !0;
}
function Kr(e) {
  if (!Number.isSafeInteger(e))
    throw new Error(`invalid integer: ${e}`);
}
function Zo(e) {
  if (!Array.isArray(e))
    throw new Error("array expected");
}
function Yo(e, t) {
  if (!fp(!0, t))
    throw new Error(`${e}: array of strings expected`);
}
function Jc(e, t) {
  if (!fp(!1, t))
    throw new Error(`${e}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function Os(...e) {
  const t = (o) => o, n = (o, s) => (a) => o(s(a)), r = e.map((o) => o.encode).reduceRight(n, t), i = e.map((o) => o.decode).reduce(n, t);
  return { encode: r, decode: i };
}
// @__NO_SIDE_EFFECTS__
function Qc(e) {
  const t = typeof e == "string" ? e.split("") : e, n = t.length;
  Yo("alphabet", t);
  const r = new Map(t.map((i, o) => [i, o]));
  return {
    encode: (i) => (Zo(i), i.map((o) => {
      if (!Number.isSafeInteger(o) || o < 0 || o >= n)
        throw new Error(`alphabet.encode: digit index outside alphabet "${o}". Allowed: ${e}`);
      return t[o];
    })),
    decode: (i) => (Zo(i), i.map((o) => {
      Hr("alphabet.decode", o);
      const s = r.get(o);
      if (s === void 0)
        throw new Error(`Unknown letter: "${o}". Allowed: ${e}`);
      return s;
    }))
  };
}
// @__NO_SIDE_EFFECTS__
function el(e = "") {
  return Hr("join", e), {
    encode: (t) => (Yo("join.decode", t), t.join(e)),
    decode: (t) => (Hr("join.decode", t), t.split(e))
  };
}
// @__NO_SIDE_EFFECTS__
function qv(e, t = "=") {
  return Kr(e), Hr("padding", t), {
    encode(n) {
      for (Yo("padding.encode", n); n.length * e % 8; )
        n.push(t);
      return n;
    },
    decode(n) {
      Yo("padding.decode", n);
      let r = n.length;
      if (r * e % 8)
        throw new Error("padding: invalid, string should have whole number of bytes");
      for (; r > 0 && n[r - 1] === t; r--)
        if ((r - 1) * e % 8 === 0)
          throw new Error("padding: invalid, string has too much padding");
      return n.slice(0, r);
    }
  };
}
function tc(e, t, n) {
  if (t < 2)
    throw new Error(`convertRadix: invalid from=${t}, base cannot be less than 2`);
  if (n < 2)
    throw new Error(`convertRadix: invalid to=${n}, base cannot be less than 2`);
  if (Zo(e), !e.length)
    return [];
  let r = 0;
  const i = [], o = Array.from(e, (a) => {
    if (Kr(a), a < 0 || a >= t)
      throw new Error(`invalid integer: ${a}`);
    return a;
  }), s = o.length;
  for (; ; ) {
    let a = 0, c = !0;
    for (let l = r; l < s; l++) {
      const u = o[l], d = t * a, f = d + u;
      if (!Number.isSafeInteger(f) || d / t !== a || f - u !== d)
        throw new Error("convertRadix: carry overflow");
      const h = f / n;
      a = f % n;
      const y = Math.floor(h);
      if (o[l] = y, !Number.isSafeInteger(y) || y * n + a !== f)
        throw new Error("convertRadix: carry overflow");
      if (c)
        y ? c = !1 : r = l;
      else continue;
    }
    if (i.push(a), c)
      break;
  }
  for (let a = 0; a < e.length - 1 && e[a] === 0; a++)
    i.push(0);
  return i.reverse();
}
const pp = (e, t) => t === 0 ? e : pp(t, e % t), Xo = /* @__NO_SIDE_EFFECTS__ */ (e, t) => e + (t - pp(e, t)), $o = /* @__PURE__ */ (() => {
  let e = [];
  for (let t = 0; t < 40; t++)
    e.push(2 ** t);
  return e;
})();
function Jo(e, t, n, r) {
  if (Zo(e), t <= 0 || t > 32)
    throw new Error(`convertRadix2: wrong from=${t}`);
  if (n <= 0 || n > 32)
    throw new Error(`convertRadix2: wrong to=${n}`);
  if (/* @__PURE__ */ Xo(t, n) > 32)
    throw new Error(`convertRadix2: carry overflow from=${t} to=${n} carryBits=${/* @__PURE__ */ Xo(t, n)}`);
  let i = 0, o = 0;
  const s = $o[t], a = $o[n] - 1, c = [];
  for (const l of e) {
    if (Kr(l), l >= s)
      throw new Error(`convertRadix2: invalid data word=${l} from=${t}`);
    if (i = i << t | l, o + t > 32)
      throw new Error(`convertRadix2: carry overflow pos=${o} from=${t}`);
    for (o += t; o >= n; o -= n)
      c.push((i >> o - n & a) >>> 0);
    const u = $o[o];
    if (u === void 0)
      throw new Error("invalid carry");
    i &= u - 1;
  }
  if (i = i << n - o & a, !r && o >= t)
    throw new Error("Excess padding");
  if (!r && i > 0)
    throw new Error(`Non-zero padding: ${i}`);
  return r && o > 0 && c.push(i >>> 0), c;
}
// @__NO_SIDE_EFFECTS__
function yp(e) {
  Kr(e);
  const t = 2 ** 8;
  return {
    encode: (n) => {
      if (!xi(n))
        throw new Error("radix.encode input should be Uint8Array");
      return tc(Array.from(n), t, e);
    },
    decode: (n) => (Jc("radix.decode", n), Uint8Array.from(tc(n, e, t)))
  };
}
// @__NO_SIDE_EFFECTS__
function wp(e, t = !1) {
  if (Kr(e), e <= 0 || e > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ Xo(8, e) > 32 || /* @__PURE__ */ Xo(e, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (n) => {
      if (!xi(n))
        throw new Error("radix2.encode input should be Uint8Array");
      return Jo(Array.from(n), 8, e, !t);
    },
    decode: (n) => (Jc("radix2.decode", n), Uint8Array.from(Jo(n, e, 8, t)))
  };
}
function Xd(e) {
  return hp(e), function(...t) {
    try {
      return e.apply(null, t);
    } catch {
    }
  };
}
function gp(e, t) {
  return Kr(e), hp(t), {
    encode(n) {
      if (!xi(n))
        throw new Error("checksum.encode: input should be Uint8Array");
      const r = t(n).slice(0, e), i = new Uint8Array(n.length + e);
      return i.set(n), i.set(r, n.length), i;
    },
    decode(n) {
      if (!xi(n))
        throw new Error("checksum.decode: input should be Uint8Array");
      const r = n.slice(0, -e), i = n.slice(-e), o = t(r).slice(0, e);
      for (let s = 0; s < e; s++)
        if (o[s] !== i[s])
          throw new Error("Invalid checksum");
      return r;
    }
  };
}
const so = {
  alphabet: Qc,
  chain: Os,
  checksum: gp,
  convertRadix: tc,
  convertRadix2: Jo,
  radix: yp,
  radix2: wp,
  join: el,
  padding: qv
}, Gv = /* @__NO_SIDE_EFFECTS__ */ (e) => /* @__PURE__ */ Os(/* @__PURE__ */ yp(58), /* @__PURE__ */ Qc(e), /* @__PURE__ */ el("")), mp = /* @__PURE__ */ Gv("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"), bp = (e) => /* @__PURE__ */ Os(gp(4, (t) => e(e(t))), mp), Wv = bp, nc = /* @__PURE__ */ Os(/* @__PURE__ */ Qc("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), /* @__PURE__ */ el("")), Jd = [996825010, 642813549, 513874426, 1027748829, 705979059];
function Xr(e) {
  const t = e >> 25;
  let n = (e & 33554431) << 5;
  for (let r = 0; r < Jd.length; r++)
    (t >> r & 1) === 1 && (n ^= Jd[r]);
  return n;
}
function Qd(e, t, n = 1) {
  const r = e.length;
  let i = 1;
  for (let o = 0; o < r; o++) {
    const s = e.charCodeAt(o);
    if (s < 33 || s > 126)
      throw new Error(`Invalid prefix (${e})`);
    i = Xr(i) ^ s >> 5;
  }
  i = Xr(i);
  for (let o = 0; o < r; o++)
    i = Xr(i) ^ e.charCodeAt(o) & 31;
  for (let o of t)
    i = Xr(i) ^ o;
  for (let o = 0; o < 6; o++)
    i = Xr(i);
  return i ^= n, nc.encode(Jo([i % $o[30]], 30, 5, !1));
}
// @__NO_SIDE_EFFECTS__
function vp(e) {
  const t = e === "bech32" ? 1 : 734539939, n = /* @__PURE__ */ wp(5), r = n.decode, i = n.encode, o = Xd(r);
  function s(d, f, h = 90) {
    Hr("bech32.encode prefix", d), xi(f) && (f = Array.from(f)), Jc("bech32.encode", f);
    const y = d.length;
    if (y === 0)
      throw new TypeError(`Invalid prefix length ${y}`);
    const w = y + 7 + f.length;
    if (h !== !1 && w > h)
      throw new TypeError(`Length ${w} exceeds limit ${h}`);
    const p = d.toLowerCase(), m = Qd(p, f, t);
    return `${p}1${nc.encode(f)}${m}`;
  }
  function a(d, f = 90) {
    Hr("bech32.decode input", d);
    const h = d.length;
    if (h < 8 || f !== !1 && h > f)
      throw new TypeError(`invalid string length: ${h} (${d}). Expected (8..${f})`);
    const y = d.toLowerCase();
    if (d !== y && d !== d.toUpperCase())
      throw new Error("String must be lowercase or uppercase");
    const w = y.lastIndexOf("1");
    if (w === 0 || w === -1)
      throw new Error('Letter "1" must be present between prefix and data only');
    const p = y.slice(0, w), m = y.slice(w + 1);
    if (m.length < 6)
      throw new Error("Data must be at least 6 characters long");
    const S = nc.decode(m).slice(0, -6), E = Qd(p, S, t);
    if (!m.endsWith(E))
      throw new Error(`Invalid checksum in ${d}: expected "${E}"`);
    return { prefix: p, words: S };
  }
  const c = Xd(a);
  function l(d) {
    const { prefix: f, words: h } = a(d, !1);
    return { prefix: f, words: h, bytes: r(h) };
  }
  function u(d, f) {
    return s(d, i(f));
  }
  return {
    encode: s,
    decode: a,
    encodeFromBytes: u,
    decodeToBytes: l,
    decodeUnsafe: c,
    fromWords: r,
    fromWordsUnsafe: o,
    toWords: i
  };
}
const eu = /* @__PURE__ */ vp("bech32"), tu = /* @__PURE__ */ vp("bech32m");
/*! scure-bip32 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const ao = Kt.ProjectivePoint, ga = bp(Yc);
function nu(e) {
  ze(e);
  const t = e.length === 0 ? "0" : Yn(e);
  return BigInt("0x" + t);
}
function Zv(e) {
  if (typeof e != "bigint")
    throw new Error("bigint expected");
  return vi(e.toString(16).padStart(64, "0"));
}
const Yv = Hh("Bitcoin seed"), ma = { private: 76066276, public: 76067358 }, ba = 2147483648, Xv = (e) => Vv(Yc(e)), Jv = (e) => Ir(e).getUint32(0, !1), co = (e) => {
  if (!Number.isSafeInteger(e) || e < 0 || e > 2 ** 32 - 1)
    throw new Error("invalid number, should be from 0 to 2**32-1, got " + e);
  const t = new Uint8Array(4);
  return Ir(t).setUint32(0, e, !1), t;
};
class vn {
  get fingerprint() {
    if (!this.pubHash)
      throw new Error("No publicKey set!");
    return Jv(this.pubHash);
  }
  get identifier() {
    return this.pubHash;
  }
  get pubKeyHash() {
    return this.pubHash;
  }
  get privateKey() {
    return this.privKeyBytes || null;
  }
  get publicKey() {
    return this.pubKey || null;
  }
  get privateExtendedKey() {
    const t = this.privateKey;
    if (!t)
      throw new Error("No private key");
    return ga.encode(this.serialize(this.versions.private, We(new Uint8Array([0]), t)));
  }
  get publicExtendedKey() {
    if (!this.pubKey)
      throw new Error("No public key");
    return ga.encode(this.serialize(this.versions.public, this.pubKey));
  }
  static fromMasterSeed(t, n = ma) {
    if (ze(t), 8 * t.length < 128 || 8 * t.length > 512)
      throw new Error("HDKey: seed length must be between 128 and 512 bits; 256 bits is advised, got " + t.length);
    const r = Go(jd, Yv, t);
    return new vn({
      versions: n,
      chainCode: r.slice(32),
      privateKey: r.slice(0, 32)
    });
  }
  static fromExtendedKey(t, n = ma) {
    const r = ga.decode(t), i = Ir(r), o = i.getUint32(0, !1), s = {
      versions: n,
      depth: r[4],
      parentFingerprint: i.getUint32(5, !1),
      index: i.getUint32(9, !1),
      chainCode: r.slice(13, 45)
    }, a = r.slice(45), c = a[0] === 0;
    if (o !== n[c ? "private" : "public"])
      throw new Error("Version mismatch");
    return c ? new vn({ ...s, privateKey: a.slice(1) }) : new vn({ ...s, publicKey: a });
  }
  static fromJSON(t) {
    return vn.fromExtendedKey(t.xpriv);
  }
  constructor(t) {
    if (this.depth = 0, this.index = 0, this.chainCode = null, this.parentFingerprint = 0, !t || typeof t != "object")
      throw new Error("HDKey.constructor must not be called directly");
    if (this.versions = t.versions || ma, this.depth = t.depth || 0, this.chainCode = t.chainCode || null, this.index = t.index || 0, this.parentFingerprint = t.parentFingerprint || 0, !this.depth && (this.parentFingerprint || this.index))
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    if (t.publicKey && t.privateKey)
      throw new Error("HDKey: publicKey and privateKey at same time.");
    if (t.privateKey) {
      if (!Kt.utils.isValidPrivateKey(t.privateKey))
        throw new Error("Invalid private key");
      this.privKey = typeof t.privateKey == "bigint" ? t.privateKey : nu(t.privateKey), this.privKeyBytes = Zv(this.privKey), this.pubKey = Kt.getPublicKey(t.privateKey, !0);
    } else if (t.publicKey)
      this.pubKey = ao.fromHex(t.publicKey).toRawBytes(!0);
    else
      throw new Error("HDKey: no public or private key provided");
    this.pubHash = Xv(this.pubKey);
  }
  derive(t) {
    if (!/^[mM]'?/.test(t))
      throw new Error('Path must start with "m" or "M"');
    if (/^[mM]'?$/.test(t))
      return this;
    const n = t.replace(/^[mM]'?\//, "").split("/");
    let r = this;
    for (const i of n) {
      const o = /^(\d+)('?)$/.exec(i), s = o && o[1];
      if (!o || o.length !== 3 || typeof s != "string")
        throw new Error("invalid child index: " + i);
      let a = +s;
      if (!Number.isSafeInteger(a) || a >= ba)
        throw new Error("Invalid index");
      o[2] === "'" && (a += ba), r = r.deriveChild(a);
    }
    return r;
  }
  deriveChild(t) {
    if (!this.pubKey || !this.chainCode)
      throw new Error("No publicKey or chainCode set");
    let n = co(t);
    if (t >= ba) {
      const a = this.privateKey;
      if (!a)
        throw new Error("Could not derive hardened child key");
      n = We(new Uint8Array([0]), a, n);
    } else
      n = We(this.pubKey, n);
    const r = Go(jd, this.chainCode, n), i = nu(r.slice(0, 32)), o = r.slice(32);
    if (!Kt.utils.isValidPrivateKey(i))
      throw new Error("Tweak bigger than curve order");
    const s = {
      versions: this.versions,
      chainCode: o,
      depth: this.depth + 1,
      parentFingerprint: this.fingerprint,
      index: t
    };
    try {
      if (this.privateKey) {
        const a = Ge(this.privKey + i, Kt.CURVE.n);
        if (!Kt.utils.isValidPrivateKey(a))
          throw new Error("The tweak was out of range or the resulted private key is invalid");
        s.privateKey = a;
      } else {
        const a = ao.fromHex(this.pubKey).add(ao.fromPrivateKey(i));
        if (a.equals(ao.ZERO))
          throw new Error("The tweak was equal to negative P, which made the result key invalid");
        s.publicKey = a.toRawBytes(!0);
      }
      return new vn(s);
    } catch {
      return this.deriveChild(t + 1);
    }
  }
  sign(t) {
    if (!this.privateKey)
      throw new Error("No privateKey set!");
    return ze(t, 32), Kt.sign(t, this.privKey).toCompactRawBytes();
  }
  verify(t, n) {
    if (ze(t, 32), ze(n, 64), !this.publicKey)
      throw new Error("No publicKey set!");
    let r;
    try {
      r = Kt.Signature.fromCompact(n);
    } catch {
      return !1;
    }
    return Kt.verify(r, t, this.publicKey);
  }
  wipePrivateData() {
    return this.privKey = void 0, this.privKeyBytes && (this.privKeyBytes.fill(0), this.privKeyBytes = void 0), this;
  }
  toJSON() {
    return {
      xpriv: this.privateExtendedKey,
      xpub: this.publicExtendedKey
    };
  }
  serialize(t, n) {
    if (!this.chainCode)
      throw new Error("No chainCode set");
    return ze(n, 33), We(co(t), new Uint8Array([this.depth]), co(this.parentFingerprint), co(this.index), this.chainCode, n);
  }
}
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Qv(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function yi(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Fr(e, ...t) {
  if (!Qv(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function xp(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  yi(e.outputLen), yi(e.blockLen);
}
function Qo(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function e1(e, t) {
  Fr(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function er(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function To(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function mt(e, t) {
  return e << 32 - t | e >>> t;
}
function kp(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function tl(e) {
  return typeof e == "string" && (e = kp(e)), Fr(e), e;
}
function ru(e) {
  return typeof e == "string" && (e = kp(e)), Fr(e), e;
}
function t1(e, t) {
  if (t !== void 0 && {}.toString.call(t) !== "[object Object]")
    throw new Error("options should be object or undefined");
  return Object.assign(e, t);
}
let Ep = class {
};
function Ap(e) {
  const t = (r) => e().update(tl(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
class Sp extends Ep {
  constructor(t, n) {
    super(), this.finished = !1, this.destroyed = !1, xp(t);
    const r = tl(n);
    if (this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const i = this.blockLen, o = new Uint8Array(i);
    o.set(r.length > i ? t.create().update(r).digest() : r);
    for (let s = 0; s < o.length; s++)
      o[s] ^= 54;
    this.iHash.update(o), this.oHash = t.create();
    for (let s = 0; s < o.length; s++)
      o[s] ^= 106;
    this.oHash.update(o), er(o);
  }
  update(t) {
    return Qo(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Qo(this), Fr(t, this.outputLen), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.oHash.outputLen);
    return this.digestInto(t), t;
  }
  _cloneInto(t) {
    t || (t = Object.create(Object.getPrototypeOf(this), {}));
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
const _p = (e, t, n) => new Sp(e, t).update(n).digest();
_p.create = (e, t) => new Sp(e, t);
function n1(e, t, n, r) {
  xp(e);
  const i = t1({ dkLen: 32, asyncTick: 10 }, r), { c: o, dkLen: s, asyncTick: a } = i;
  if (yi(o), yi(s), yi(a), o < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = ru(t), l = ru(n), u = new Uint8Array(s), d = _p.create(e, c), f = d._cloneInto().update(l);
  return { c: o, dkLen: s, asyncTick: a, DK: u, PRF: d, PRFSalt: f };
}
function r1(e, t, n, r, i) {
  return e.destroy(), t.destroy(), r && r.destroy(), er(i), n;
}
function i1(e, t, n, r) {
  const { c: i, dkLen: o, DK: s, PRF: a, PRFSalt: c } = n1(e, t, n, r);
  let l;
  const u = new Uint8Array(4), d = To(u), f = new Uint8Array(a.outputLen);
  for (let h = 1, y = 0; y < o; h++, y += a.outputLen) {
    const w = s.subarray(y, y + a.outputLen);
    d.setInt32(0, h, !1), (l = c._cloneInto(l)).update(u).digestInto(f), w.set(f.subarray(0, w.length));
    for (let p = 1; p < i; p++) {
      a._cloneInto(l).update(f).digestInto(f);
      for (let m = 0; m < w.length; m++)
        w[m] ^= f[m];
    }
  }
  return r1(a, c, s, l, f);
}
function o1(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, l = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + l, a, r);
}
function s1(e, t, n) {
  return e & t ^ ~e & n;
}
function a1(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Ip = class extends Ep {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = To(this.buffer);
  }
  update(t) {
    Qo(this), t = tl(t), Fr(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = To(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Qo(this), e1(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, er(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    o1(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = To(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const l = c / 4, u = this.get();
    if (l > u.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < l; d++)
      a.setUint32(4 * d, u[d], o);
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
};
const hn = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), _e = /* @__PURE__ */ Uint32Array.from([
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
]), lo = /* @__PURE__ */ BigInt(2 ** 32 - 1), iu = /* @__PURE__ */ BigInt(32);
function c1(e, t = !1) {
  return t ? { h: Number(e & lo), l: Number(e >> iu & lo) } : { h: Number(e >> iu & lo) | 0, l: Number(e & lo) | 0 };
}
function l1(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = c1(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const ou = (e, t, n) => e >>> n, su = (e, t, n) => e << 32 - n | t >>> n, wr = (e, t, n) => e >>> n | t << 32 - n, gr = (e, t, n) => e << 32 - n | t >>> n, uo = (e, t, n) => e << 64 - n | t >>> n - 32, fo = (e, t, n) => e >>> n - 32 | t << 64 - n;
function zt(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const d1 = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), u1 = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, f1 = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), h1 = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, p1 = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), y1 = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, w1 = /* @__PURE__ */ Uint32Array.from([
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
]), pn = /* @__PURE__ */ new Uint32Array(64);
let g1 = class extends Ip {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = hn[0] | 0, this.B = hn[1] | 0, this.C = hn[2] | 0, this.D = hn[3] | 0, this.E = hn[4] | 0, this.F = hn[5] | 0, this.G = hn[6] | 0, this.H = hn[7] | 0;
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
      pn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = pn[d - 15], h = pn[d - 2], y = mt(f, 7) ^ mt(f, 18) ^ f >>> 3, w = mt(h, 17) ^ mt(h, 19) ^ h >>> 10;
      pn[d] = w + pn[d - 7] + y + pn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = mt(a, 6) ^ mt(a, 11) ^ mt(a, 25), h = u + f + s1(a, c, l) + w1[d] + pn[d] | 0, w = (mt(r, 2) ^ mt(r, 13) ^ mt(r, 22)) + a1(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    er(pn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), er(this.buffer);
  }
};
const Bp = l1([
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
].map((e) => BigInt(e))), m1 = Bp[0], b1 = Bp[1], yn = /* @__PURE__ */ new Uint32Array(80), wn = /* @__PURE__ */ new Uint32Array(80);
class v1 extends Ip {
  constructor(t = 64) {
    super(128, t, 16, !1), this.Ah = _e[0] | 0, this.Al = _e[1] | 0, this.Bh = _e[2] | 0, this.Bl = _e[3] | 0, this.Ch = _e[4] | 0, this.Cl = _e[5] | 0, this.Dh = _e[6] | 0, this.Dl = _e[7] | 0, this.Eh = _e[8] | 0, this.El = _e[9] | 0, this.Fh = _e[10] | 0, this.Fl = _e[11] | 0, this.Gh = _e[12] | 0, this.Gl = _e[13] | 0, this.Hh = _e[14] | 0, this.Hl = _e[15] | 0;
  }
  // prettier-ignore
  get() {
    const { Ah: t, Al: n, Bh: r, Bl: i, Ch: o, Cl: s, Dh: a, Dl: c, Eh: l, El: u, Fh: d, Fl: f, Gh: h, Gl: y, Hh: w, Hl: p } = this;
    return [t, n, r, i, o, s, a, c, l, u, d, f, h, y, w, p];
  }
  // prettier-ignore
  set(t, n, r, i, o, s, a, c, l, u, d, f, h, y, w, p) {
    this.Ah = t | 0, this.Al = n | 0, this.Bh = r | 0, this.Bl = i | 0, this.Ch = o | 0, this.Cl = s | 0, this.Dh = a | 0, this.Dl = c | 0, this.Eh = l | 0, this.El = u | 0, this.Fh = d | 0, this.Fl = f | 0, this.Gh = h | 0, this.Gl = y | 0, this.Hh = w | 0, this.Hl = p | 0;
  }
  process(t, n) {
    for (let E = 0; E < 16; E++, n += 4)
      yn[E] = t.getUint32(n), wn[E] = t.getUint32(n += 4);
    for (let E = 16; E < 80; E++) {
      const P = yn[E - 15] | 0, I = wn[E - 15] | 0, R = wr(P, I, 1) ^ wr(P, I, 8) ^ ou(P, I, 7), U = gr(P, I, 1) ^ gr(P, I, 8) ^ su(P, I, 7), H = yn[E - 2] | 0, B = wn[E - 2] | 0, D = wr(H, B, 19) ^ uo(H, B, 61) ^ ou(H, B, 6), L = gr(H, B, 19) ^ fo(H, B, 61) ^ su(H, B, 6), x = f1(U, L, wn[E - 7], wn[E - 16]), v = h1(x, R, D, yn[E - 7], yn[E - 16]);
      yn[E] = v | 0, wn[E] = x | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: l, Dl: u, Eh: d, El: f, Fh: h, Fl: y, Gh: w, Gl: p, Hh: m, Hl: S } = this;
    for (let E = 0; E < 80; E++) {
      const P = wr(d, f, 14) ^ wr(d, f, 18) ^ uo(d, f, 41), I = gr(d, f, 14) ^ gr(d, f, 18) ^ fo(d, f, 41), R = d & h ^ ~d & w, U = f & y ^ ~f & p, H = p1(S, I, U, b1[E], wn[E]), B = y1(H, m, P, R, m1[E], yn[E]), D = H | 0, L = wr(r, i, 28) ^ uo(r, i, 34) ^ uo(r, i, 39), x = gr(r, i, 28) ^ fo(r, i, 34) ^ fo(r, i, 39), v = r & o ^ r & a ^ o & a, b = i & s ^ i & c ^ s & c;
      m = w | 0, S = p | 0, w = h | 0, p = y | 0, h = d | 0, y = f | 0, { h: d, l: f } = zt(l | 0, u | 0, B | 0, D | 0), l = a | 0, u = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const g = d1(D, x, b);
      r = u1(g, B, L, v), i = g | 0;
    }
    ({ h: r, l: i } = zt(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = zt(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = zt(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: l, l: u } = zt(this.Dh | 0, this.Dl | 0, l | 0, u | 0), { h: d, l: f } = zt(this.Eh | 0, this.El | 0, d | 0, f | 0), { h, l: y } = zt(this.Fh | 0, this.Fl | 0, h | 0, y | 0), { h: w, l: p } = zt(this.Gh | 0, this.Gl | 0, w | 0, p | 0), { h: m, l: S } = zt(this.Hh | 0, this.Hl | 0, m | 0, S | 0), this.set(r, i, o, s, a, c, l, u, d, f, h, y, w, p, m, S);
  }
  roundClean() {
    er(yn, wn);
  }
  destroy() {
    er(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
const x1 = /* @__PURE__ */ Ap(() => new g1()), k1 = /* @__PURE__ */ Ap(() => new v1());
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const E1 = (e) => e[0] === "あいこくしん";
function $p(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function Tp(e) {
  const t = $p(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Pp(e) {
  Fr(e, 16, 20, 24, 28, 32);
}
const A1 = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([x1(e)[0] >> t << t]);
};
function Op(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), so.chain(so.checksum(1, A1), so.radix2(11, !0), so.alphabet(e));
}
function Rp(e, t) {
  const { words: n } = Tp(e), r = Op(t).decode(n);
  return Pp(r), r;
}
function S1(e, t) {
  return Pp(e), Op(t).encode(e).join(E1(t) ? "　" : " ");
}
function _1(e, t) {
  try {
    Rp(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const I1 = (e) => $p("mnemonic" + e);
function B1(e, t = "") {
  return i1(k1, Tp(e).nfkd, I1(t), { c: 2048, dkLen: 64 });
}
const Ni = `abandon
ability
able
about
above
absent
absorb
abstract
absurd
abuse
access
accident
account
accuse
achieve
acid
acoustic
acquire
across
act
action
actor
actress
actual
adapt
add
addict
address
adjust
admit
adult
advance
advice
aerobic
affair
afford
afraid
again
age
agent
agree
ahead
aim
air
airport
aisle
alarm
album
alcohol
alert
alien
all
alley
allow
almost
alone
alpha
already
also
alter
always
amateur
amazing
among
amount
amused
analyst
anchor
ancient
anger
angle
angry
animal
ankle
announce
annual
another
answer
antenna
antique
anxiety
any
apart
apology
appear
apple
approve
april
arch
arctic
area
arena
argue
arm
armed
armor
army
around
arrange
arrest
arrive
arrow
art
artefact
artist
artwork
ask
aspect
assault
asset
assist
assume
asthma
athlete
atom
attack
attend
attitude
attract
auction
audit
august
aunt
author
auto
autumn
average
avocado
avoid
awake
aware
away
awesome
awful
awkward
axis
baby
bachelor
bacon
badge
bag
balance
balcony
ball
bamboo
banana
banner
bar
barely
bargain
barrel
base
basic
basket
battle
beach
bean
beauty
because
become
beef
before
begin
behave
behind
believe
below
belt
bench
benefit
best
betray
better
between
beyond
bicycle
bid
bike
bind
biology
bird
birth
bitter
black
blade
blame
blanket
blast
bleak
bless
blind
blood
blossom
blouse
blue
blur
blush
board
boat
body
boil
bomb
bone
bonus
book
boost
border
boring
borrow
boss
bottom
bounce
box
boy
bracket
brain
brand
brass
brave
bread
breeze
brick
bridge
brief
bright
bring
brisk
broccoli
broken
bronze
broom
brother
brown
brush
bubble
buddy
budget
buffalo
build
bulb
bulk
bullet
bundle
bunker
burden
burger
burst
bus
business
busy
butter
buyer
buzz
cabbage
cabin
cable
cactus
cage
cake
call
calm
camera
camp
can
canal
cancel
candy
cannon
canoe
canvas
canyon
capable
capital
captain
car
carbon
card
cargo
carpet
carry
cart
case
cash
casino
castle
casual
cat
catalog
catch
category
cattle
caught
cause
caution
cave
ceiling
celery
cement
census
century
cereal
certain
chair
chalk
champion
change
chaos
chapter
charge
chase
chat
cheap
check
cheese
chef
cherry
chest
chicken
chief
child
chimney
choice
choose
chronic
chuckle
chunk
churn
cigar
cinnamon
circle
citizen
city
civil
claim
clap
clarify
claw
clay
clean
clerk
clever
click
client
cliff
climb
clinic
clip
clock
clog
close
cloth
cloud
clown
club
clump
cluster
clutch
coach
coast
coconut
code
coffee
coil
coin
collect
color
column
combine
come
comfort
comic
common
company
concert
conduct
confirm
congress
connect
consider
control
convince
cook
cool
copper
copy
coral
core
corn
correct
cost
cotton
couch
country
couple
course
cousin
cover
coyote
crack
cradle
craft
cram
crane
crash
crater
crawl
crazy
cream
credit
creek
crew
cricket
crime
crisp
critic
crop
cross
crouch
crowd
crucial
cruel
cruise
crumble
crunch
crush
cry
crystal
cube
culture
cup
cupboard
curious
current
curtain
curve
cushion
custom
cute
cycle
dad
damage
damp
dance
danger
daring
dash
daughter
dawn
day
deal
debate
debris
decade
december
decide
decline
decorate
decrease
deer
defense
define
defy
degree
delay
deliver
demand
demise
denial
dentist
deny
depart
depend
deposit
depth
deputy
derive
describe
desert
design
desk
despair
destroy
detail
detect
develop
device
devote
diagram
dial
diamond
diary
dice
diesel
diet
differ
digital
dignity
dilemma
dinner
dinosaur
direct
dirt
disagree
discover
disease
dish
dismiss
disorder
display
distance
divert
divide
divorce
dizzy
doctor
document
dog
doll
dolphin
domain
donate
donkey
donor
door
dose
double
dove
draft
dragon
drama
drastic
draw
dream
dress
drift
drill
drink
drip
drive
drop
drum
dry
duck
dumb
dune
during
dust
dutch
duty
dwarf
dynamic
eager
eagle
early
earn
earth
easily
east
easy
echo
ecology
economy
edge
edit
educate
effort
egg
eight
either
elbow
elder
electric
elegant
element
elephant
elevator
elite
else
embark
embody
embrace
emerge
emotion
employ
empower
empty
enable
enact
end
endless
endorse
enemy
energy
enforce
engage
engine
enhance
enjoy
enlist
enough
enrich
enroll
ensure
enter
entire
entry
envelope
episode
equal
equip
era
erase
erode
erosion
error
erupt
escape
essay
essence
estate
eternal
ethics
evidence
evil
evoke
evolve
exact
example
excess
exchange
excite
exclude
excuse
execute
exercise
exhaust
exhibit
exile
exist
exit
exotic
expand
expect
expire
explain
expose
express
extend
extra
eye
eyebrow
fabric
face
faculty
fade
faint
faith
fall
false
fame
family
famous
fan
fancy
fantasy
farm
fashion
fat
fatal
father
fatigue
fault
favorite
feature
february
federal
fee
feed
feel
female
fence
festival
fetch
fever
few
fiber
fiction
field
figure
file
film
filter
final
find
fine
finger
finish
fire
firm
first
fiscal
fish
fit
fitness
fix
flag
flame
flash
flat
flavor
flee
flight
flip
float
flock
floor
flower
fluid
flush
fly
foam
focus
fog
foil
fold
follow
food
foot
force
forest
forget
fork
fortune
forum
forward
fossil
foster
found
fox
fragile
frame
frequent
fresh
friend
fringe
frog
front
frost
frown
frozen
fruit
fuel
fun
funny
furnace
fury
future
gadget
gain
galaxy
gallery
game
gap
garage
garbage
garden
garlic
garment
gas
gasp
gate
gather
gauge
gaze
general
genius
genre
gentle
genuine
gesture
ghost
giant
gift
giggle
ginger
giraffe
girl
give
glad
glance
glare
glass
glide
glimpse
globe
gloom
glory
glove
glow
glue
goat
goddess
gold
good
goose
gorilla
gospel
gossip
govern
gown
grab
grace
grain
grant
grape
grass
gravity
great
green
grid
grief
grit
grocery
group
grow
grunt
guard
guess
guide
guilt
guitar
gun
gym
habit
hair
half
hammer
hamster
hand
happy
harbor
hard
harsh
harvest
hat
have
hawk
hazard
head
health
heart
heavy
hedgehog
height
hello
helmet
help
hen
hero
hidden
high
hill
hint
hip
hire
history
hobby
hockey
hold
hole
holiday
hollow
home
honey
hood
hope
horn
horror
horse
hospital
host
hotel
hour
hover
hub
huge
human
humble
humor
hundred
hungry
hunt
hurdle
hurry
hurt
husband
hybrid
ice
icon
idea
identify
idle
ignore
ill
illegal
illness
image
imitate
immense
immune
impact
impose
improve
impulse
inch
include
income
increase
index
indicate
indoor
industry
infant
inflict
inform
inhale
inherit
initial
inject
injury
inmate
inner
innocent
input
inquiry
insane
insect
inside
inspire
install
intact
interest
into
invest
invite
involve
iron
island
isolate
issue
item
ivory
jacket
jaguar
jar
jazz
jealous
jeans
jelly
jewel
job
join
joke
journey
joy
judge
juice
jump
jungle
junior
junk
just
kangaroo
keen
keep
ketchup
key
kick
kid
kidney
kind
kingdom
kiss
kit
kitchen
kite
kitten
kiwi
knee
knife
knock
know
lab
label
labor
ladder
lady
lake
lamp
language
laptop
large
later
latin
laugh
laundry
lava
law
lawn
lawsuit
layer
lazy
leader
leaf
learn
leave
lecture
left
leg
legal
legend
leisure
lemon
lend
length
lens
leopard
lesson
letter
level
liar
liberty
library
license
life
lift
light
like
limb
limit
link
lion
liquid
list
little
live
lizard
load
loan
lobster
local
lock
logic
lonely
long
loop
lottery
loud
lounge
love
loyal
lucky
luggage
lumber
lunar
lunch
luxury
lyrics
machine
mad
magic
magnet
maid
mail
main
major
make
mammal
man
manage
mandate
mango
mansion
manual
maple
marble
march
margin
marine
market
marriage
mask
mass
master
match
material
math
matrix
matter
maximum
maze
meadow
mean
measure
meat
mechanic
medal
media
melody
melt
member
memory
mention
menu
mercy
merge
merit
merry
mesh
message
metal
method
middle
midnight
milk
million
mimic
mind
minimum
minor
minute
miracle
mirror
misery
miss
mistake
mix
mixed
mixture
mobile
model
modify
mom
moment
monitor
monkey
monster
month
moon
moral
more
morning
mosquito
mother
motion
motor
mountain
mouse
move
movie
much
muffin
mule
multiply
muscle
museum
mushroom
music
must
mutual
myself
mystery
myth
naive
name
napkin
narrow
nasty
nation
nature
near
neck
need
negative
neglect
neither
nephew
nerve
nest
net
network
neutral
never
news
next
nice
night
noble
noise
nominee
noodle
normal
north
nose
notable
note
nothing
notice
novel
now
nuclear
number
nurse
nut
oak
obey
object
oblige
obscure
observe
obtain
obvious
occur
ocean
october
odor
off
offer
office
often
oil
okay
old
olive
olympic
omit
once
one
onion
online
only
open
opera
opinion
oppose
option
orange
orbit
orchard
order
ordinary
organ
orient
original
orphan
ostrich
other
outdoor
outer
output
outside
oval
oven
over
own
owner
oxygen
oyster
ozone
pact
paddle
page
pair
palace
palm
panda
panel
panic
panther
paper
parade
parent
park
parrot
party
pass
patch
path
patient
patrol
pattern
pause
pave
payment
peace
peanut
pear
peasant
pelican
pen
penalty
pencil
people
pepper
perfect
permit
person
pet
phone
photo
phrase
physical
piano
picnic
picture
piece
pig
pigeon
pill
pilot
pink
pioneer
pipe
pistol
pitch
pizza
place
planet
plastic
plate
play
please
pledge
pluck
plug
plunge
poem
poet
point
polar
pole
police
pond
pony
pool
popular
portion
position
possible
post
potato
pottery
poverty
powder
power
practice
praise
predict
prefer
prepare
present
pretty
prevent
price
pride
primary
print
priority
prison
private
prize
problem
process
produce
profit
program
project
promote
proof
property
prosper
protect
proud
provide
public
pudding
pull
pulp
pulse
pumpkin
punch
pupil
puppy
purchase
purity
purpose
purse
push
put
puzzle
pyramid
quality
quantum
quarter
question
quick
quit
quiz
quote
rabbit
raccoon
race
rack
radar
radio
rail
rain
raise
rally
ramp
ranch
random
range
rapid
rare
rate
rather
raven
raw
razor
ready
real
reason
rebel
rebuild
recall
receive
recipe
record
recycle
reduce
reflect
reform
refuse
region
regret
regular
reject
relax
release
relief
rely
remain
remember
remind
remove
render
renew
rent
reopen
repair
repeat
replace
report
require
rescue
resemble
resist
resource
response
result
retire
retreat
return
reunion
reveal
review
reward
rhythm
rib
ribbon
rice
rich
ride
ridge
rifle
right
rigid
ring
riot
ripple
risk
ritual
rival
river
road
roast
robot
robust
rocket
romance
roof
rookie
room
rose
rotate
rough
round
route
royal
rubber
rude
rug
rule
run
runway
rural
sad
saddle
sadness
safe
sail
salad
salmon
salon
salt
salute
same
sample
sand
satisfy
satoshi
sauce
sausage
save
say
scale
scan
scare
scatter
scene
scheme
school
science
scissors
scorpion
scout
scrap
screen
script
scrub
sea
search
season
seat
second
secret
section
security
seed
seek
segment
select
sell
seminar
senior
sense
sentence
series
service
session
settle
setup
seven
shadow
shaft
shallow
share
shed
shell
sheriff
shield
shift
shine
ship
shiver
shock
shoe
shoot
shop
short
shoulder
shove
shrimp
shrug
shuffle
shy
sibling
sick
side
siege
sight
sign
silent
silk
silly
silver
similar
simple
since
sing
siren
sister
situate
six
size
skate
sketch
ski
skill
skin
skirt
skull
slab
slam
sleep
slender
slice
slide
slight
slim
slogan
slot
slow
slush
small
smart
smile
smoke
smooth
snack
snake
snap
sniff
snow
soap
soccer
social
sock
soda
soft
solar
soldier
solid
solution
solve
someone
song
soon
sorry
sort
soul
sound
soup
source
south
space
spare
spatial
spawn
speak
special
speed
spell
spend
sphere
spice
spider
spike
spin
spirit
split
spoil
sponsor
spoon
sport
spot
spray
spread
spring
spy
square
squeeze
squirrel
stable
stadium
staff
stage
stairs
stamp
stand
start
state
stay
steak
steel
stem
step
stereo
stick
still
sting
stock
stomach
stone
stool
story
stove
strategy
street
strike
strong
struggle
student
stuff
stumble
style
subject
submit
subway
success
such
sudden
suffer
sugar
suggest
suit
summer
sun
sunny
sunset
super
supply
supreme
sure
surface
surge
surprise
surround
survey
suspect
sustain
swallow
swamp
swap
swarm
swear
sweet
swift
swim
swing
switch
sword
symbol
symptom
syrup
system
table
tackle
tag
tail
talent
talk
tank
tape
target
task
taste
tattoo
taxi
teach
team
tell
ten
tenant
tennis
tent
term
test
text
thank
that
theme
then
theory
there
they
thing
this
thought
three
thrive
throw
thumb
thunder
ticket
tide
tiger
tilt
timber
time
tiny
tip
tired
tissue
title
toast
tobacco
today
toddler
toe
together
toilet
token
tomato
tomorrow
tone
tongue
tonight
tool
tooth
top
topic
topple
torch
tornado
tortoise
toss
total
tourist
toward
tower
town
toy
track
trade
traffic
tragic
train
transfer
trap
trash
travel
tray
treat
tree
trend
trial
tribe
trick
trigger
trim
trip
trophy
trouble
truck
true
truly
trumpet
trust
truth
try
tube
tuition
tumble
tuna
tunnel
turkey
turn
turtle
twelve
twenty
twice
twin
twist
two
type
typical
ugly
umbrella
unable
unaware
uncle
uncover
under
undo
unfair
unfold
unhappy
uniform
unique
unit
universe
unknown
unlock
until
unusual
unveil
update
upgrade
uphold
upon
upper
upset
urban
urge
usage
use
used
useful
useless
usual
utility
vacant
vacuum
vague
valid
valley
valve
van
vanish
vapor
various
vast
vault
vehicle
velvet
vendor
venture
venue
verb
verify
version
very
vessel
veteran
viable
vibrant
vicious
victory
video
view
village
vintage
violin
virtual
virus
visa
visit
visual
vital
vivid
vocal
voice
void
volcano
volume
vote
voyage
wage
wagon
wait
walk
wall
walnut
want
warfare
warm
warrior
wash
wasp
waste
water
wave
way
wealth
weapon
wear
weasel
weather
web
wedding
weekend
weird
welcome
west
wet
whale
what
wheat
wheel
when
where
whip
whisper
wide
width
wife
wild
will
win
window
wine
wing
wink
winner
winter
wire
wisdom
wise
wish
witness
wolf
woman
wonder
wood
wool
word
work
world
worry
worth
wrap
wreck
wrestle
wrist
write
wrong
yard
year
yellow
you
young
youth
zebra
zero
zone
zoo`.split(`
`), es = "bitcoin-address-types-v1", nl = 20, Cp = new TextEncoder().encode(`avibe:protected-hd-wallet:v1
`), Lp = [16, 20, 24, 28, 32], $1 = ["account", "evm", "bitcoin", "bitcoin_p2pkh", "bitcoin_p2wpkh", "solana"];
function lt(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new Error("invalid protected HD object");
  return e;
}
function It(e, t) {
  if (Object.keys(e).length !== t.length || t.some((n) => !Object.hasOwn(e, n))) throw new Error("invalid protected HD fields");
}
function rl(e) {
  if (typeof e != "number" || !Number.isInteger(e) || e < 0 || e >= nl) throw new Error("invalid protected HD account");
  return e;
}
function Hp(e) {
  const t = lt(e), n = rl(t.account);
  if (t.chain === "bitcoin") {
    if (It(t, ["chain", "account", "address_type"]), t.address_type !== "p2tr") throw new Error("protected HD Bitcoin only supports explicit p2tr");
    return { chain: "bitcoin", account: n, address_type: "p2tr" };
  }
  if (It(t, ["chain", "account"]), t.chain !== "evm" && t.chain !== "solana") throw new Error("invalid protected HD chain");
  return { chain: t.chain, account: n };
}
function Xn(e, t) {
  if (rl(t), e === "evm") return `m/44'/60'/0'/0/${t}`;
  if (e === "bitcoin") return `m/86'/0'/0'/0/${t}`;
  if (e === "solana") return `m/44'/501'/${t}'/0'`;
  throw new Error("invalid protected HD chain");
}
function Vt(e, t = !1) {
  if (typeof e != "string" || !(t ? /^[0-9a-f]{64}$/ : /^(02|03)[0-9a-f]{64}$/).test(e)) throw new Error("invalid protected HD public key");
  const n = ot(e);
  if (t ? !ct.utils.isValidPublicKey(n, !1) : !fe.utils.isValidPublicKey(n)) throw new Error("invalid protected HD public key");
  return e;
}
function Rs(e) {
  const t = lt(e);
  if (It(t, ["kind", "profile", "accounts"]), t.kind !== "hd-seed" || t.profile !== es || !Array.isArray(t.accounts) || t.accounts.length !== nl) throw new Error("invalid protected HD profile/table");
  return { kind: "hd-seed", profile: es, accounts: t.accounts.map((n, r) => {
    const i = lt(n);
    if (It(i, $1), rl(i.account) !== r) throw new Error("protected HD accounts must be ordered 0..19");
    return { account: r, evm: Vt(i.evm), bitcoin: Vt(i.bitcoin), solana: Vt(i.solana, !0), bitcoin_p2pkh: Vt(i.bitcoin_p2pkh), bitcoin_p2wpkh: Vt(i.bitcoin_p2wpkh) };
  }) };
}
function T1(e) {
  if (!Lp.includes(e.entropy.length) || e.seed.length !== 64 || typeof e.passphraseRequired != "boolean") throw new Error("invalid protected HD payload");
  const t = new Uint8Array(95 + e.entropy.length);
  return t.set(Cp), t[29] = e.entropy.length, t.set(e.entropy, 30), t.set(e.seed, 30 + e.entropy.length), t[t.length - 1] = Number(e.passphraseRequired), t;
}
function Up(e) {
  const t = e[29];
  if (!Lp.includes(t) || e.length !== 95 + t || Cp.some((n, r) => n !== e[r]) || ![0, 1].includes(e[e.length - 1])) throw new Error("invalid protected HD payload");
  return { entropy: e.slice(30, 30 + t), seed: e.slice(30 + t, 94 + t), passphraseRequired: e[e.length - 1] === 1 };
}
function ts(e) {
  e?.entropy.fill(0), e?.seed.fill(0);
}
function il(e) {
  return e.normalize("NFKD").toLowerCase().trim().split(/\s+/u).filter(Boolean).join(" ");
}
function P1(e) {
  return S1(e, Ni);
}
function Np(e, t) {
  const n = il(e), r = Rp(n, Ni);
  try {
    return { entropy: r, seed: B1(n, t), passphraseRequired: t.normalize("NFKD").length > 0 };
  } catch (i) {
    throw r.fill(0), i;
  }
}
function Dp(e, t) {
  let n = Wa(ja, new TextEncoder().encode("ed25519 seed"), e);
  try {
    for (const r of [44, 501, t, 0]) {
      const i = new Uint8Array(37);
      i.set(n.subarray(0, 32), 1), new DataView(i.buffer).setUint32(33, 2147483648 + r, !1);
      let o;
      try {
        o = Wa(ja, n.subarray(32), i);
      } finally {
        i.fill(0);
      }
      n.fill(0), n = o;
    }
    return n.slice(0, 32);
  } finally {
    n.fill(0);
  }
}
function O1(e, t, n) {
  if (e.length !== 64) throw new Error("protected HD seed must be 64 bytes");
  const r = vn.fromMasterSeed(e);
  let i, o;
  try {
    if (i = r.derive(t), !i.privateKey) throw new Error("protected HD derivation failed");
    return o = new Uint8Array(i.privateKey), n(o);
  } finally {
    o?.fill(0), i?.wipePrivateData(), r.wipePrivateData();
  }
}
function R1(e, t, n) {
  const r = Hp(t);
  if (e.length !== 64) throw new Error("protected HD seed must be 64 bytes");
  if (r.chain !== "solana") return O1(e, Xn(r.chain, r.account), n);
  const i = Dp(e, r.account);
  try {
    return n(i);
  } finally {
    i.fill(0);
  }
}
function rc(e) {
  if (e.length !== 64) throw new Error("protected HD seed must be 64 bytes");
  const t = vn.fromMasterSeed(e);
  try {
    return Array.from({ length: nl }, (n, r) => {
      const i = (s) => {
        const a = t.derive(s);
        try {
          if (!a.publicKey) throw new Error("protected HD derivation failed");
          return J(a.publicKey);
        } finally {
          a.wipePrivateData();
        }
      }, o = Dp(e, r);
      try {
        return { account: r, evm: i(Xn("evm", r)), bitcoin: i(Xn("bitcoin", r)), solana: J(ct.getPublicKey(o)), bitcoin_p2pkh: i(`m/44'/0'/0'/0/${r}`), bitcoin_p2wpkh: i(`m/84'/0'/0'/0/${r}`) };
      } finally {
        o.fill(0);
      }
    });
  } finally {
    t.wipePrivateData();
  }
}
function ol(e) {
  const t = ot(Vt(e.evm)), n = J(jo(fe.Point.fromBytes(t).toBytes(!1).slice(1)).slice(-20)), r = J(jo(new TextEncoder().encode(n))), i = (l) => Mc(ae(ot(Vt(l)))), o = ot(Vt(e.bitcoin)).slice(1), s = BigInt(`0x${J(bn.utils.taggedHash("TapTweak", o))}`);
  if (s >= fe.Point.Fn.ORDER) throw new Error("invalid protected HD Taproot tweak");
  const a = fe.Point.fromBytes(new Uint8Array([2, ...o])), c = s === 0n ? a : a.add(fe.Point.BASE.multiply(s));
  if (c.equals(fe.Point.ZERO)) throw new Error("invalid protected HD Taproot output");
  return {
    eth: "0x" + [...n].map((l, u) => parseInt(r[u], 16) >= 8 ? l.toUpperCase() : l).join(""),
    btc_legacy: Wv(ae).encode(new Uint8Array([0, ...i(e.bitcoin_p2pkh)])),
    btc_segwit: eu.encode("bc", [0, ...eu.toWords(i(e.bitcoin_p2wpkh))]),
    btc_taproot: tu.encode("bc", [1, ...tu.toWords(c.toBytes(!0).slice(1))]),
    solana: mp.encode(ot(Vt(e.solana, !0)))
  };
}
function C1(e) {
  const t = JSON.stringify([e.ciphertext, e.nonce, e.wrap_meta]).replace(/[\u007f-\uffff]/g, (n) => "\\u" + n.charCodeAt(0).toString(16).padStart(4, "0"));
  return J(ae(new TextEncoder().encode(t)));
}
function ns(e) {
  if (typeof e != "string" || e.length === 0 || e.length > 65536 || new TextEncoder().encode(e).length > 65536) throw new Error("invalid protected HD wrap_meta size/type");
  let t;
  try {
    t = JSON.parse(e);
  } catch {
    throw new Error("invalid protected HD wrap_meta JSON");
  }
  const n = (i) => {
    for (let o = 0; o < i.length; o++) {
      const s = i.charCodeAt(o);
      if (s >= 55296 && s <= 56319) {
        const a = i.charCodeAt(++o);
        if (!(a >= 56320 && a <= 57343)) throw new Error("invalid protected HD Unicode");
      } else if (s >= 56320 && s <= 57343) throw new Error("invalid protected HD Unicode");
    }
  }, r = (i, o) => {
    if (typeof i == "string") n(i);
    else {
      if (typeof i == "number" && !Number.isFinite(i)) throw new Error("invalid protected HD JSON number");
      if (i && typeof i == "object") {
        if (o > 64) throw new Error("protected HD JSON is too deep");
        for (const [s, a] of Object.entries(i))
          n(s), r(a, o + 1);
      }
    }
  };
  return r(t, 1), lt(t);
}
function Vn(e, t) {
  if (typeof e != "string" || e.length > Math.ceil(Math.max(...t) / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) throw new Error("invalid protected HD base64");
  const n = Uint8Array.from(atob(e), (r) => r.charCodeAt(0));
  if (!t.includes(n.length) || btoa(String.fromCharCode(...n)) !== e) throw new Error("invalid protected HD field length/encoding");
  return n;
}
function L1(e, t) {
  if (t.v !== 1 || t.scheme !== "machine-aesgcm-v1") throw new Error("invalid protected HD envelope version/scheme");
  Vn(e.nonce, [12]), Vn(e.ciphertext, [127, 131, 135, 139, 143]), Vn(t.dek_nonce, [12]), Vn(t.wrapped_dek, [48]);
}
const au = { '"': 34, "\\": 92, "/": 47, b: 8, f: 12, n: 10, r: 13, t: 9 };
function H1(e) {
  if (typeof e != "string") return !1;
  let t = 0;
  const n = () => {
    for (; t < e.length && /[\x20\t\r\n]/.test(e[t]); ) t += 1;
  }, r = (a) => {
    if (e[t++] !== '"') return !1;
    let c = 0, l = a !== void 0;
    for (; t < e.length; ) {
      let u = e.charCodeAt(t++);
      if (u === 34) return l && c === a.length;
      if (u === 92) {
        if (t >= e.length) return !1;
        const d = e[t++];
        if (d === "u") {
          const f = e.slice(t, t + 4);
          if (f.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(f)) return !1;
          u = Number.parseInt(f, 16), t += 4;
        } else {
          if (!Object.hasOwn(au, d)) return !1;
          u = au[d];
        }
      }
      (a === void 0 || c >= a.length || u !== a.charCodeAt(c)) && (l = !1), c += 1;
    }
    return !1;
  }, i = () => {
    if (n(), e[t] === '"') {
      r();
      return;
    }
    if (e[t] !== "{" && e[t] !== "[") {
      for (; t < e.length && !/[,}\]\x20\t\r\n]/.test(e[t]); ) t += 1;
      return;
    }
    let a = 0;
    for (; t < e.length; ) {
      const c = e[t];
      if (c === '"') {
        r();
        continue;
      }
      if (t += 1, (c === "{" || c === "[") && (a += 1), (c === "}" || c === "]") && (a -= 1, a === 0))
        return;
    }
  }, o = () => {
    if (n(), e[t] !== "{")
      return i(), !1;
    t += 1;
    let a = !1;
    for (; ; ) {
      if (n(), e[t] === "}")
        return t += 1, a;
      if (e[t] !== '"') return !1;
      const c = r("kind");
      if (n(), e[t++] !== ":") return !1;
      if (n(), c && e[t] === '"' ? a = r("hd-seed") : (i(), c && (a = !1)), n(), e[t] === "}")
        return t += 1, a;
      if (e[t++] !== ",") return !1;
    }
  };
  if (n(), e[t++] !== "{") return !1;
  let s = !1;
  for (; ; ) {
    if (n(), e[t] === "}") return s;
    if (e[t] !== '"') return !1;
    const a = r("record_meta");
    if (n(), e[t++] !== ":") return !1;
    if (a ? s = o() : i(), n(), e[t] === "}") return s;
    if (e[t++] !== ",") return !1;
  }
}
const U1 = "hpke-x25519-hkdfsha256-aes256gcm-v1", N1 = "avault:blind-box:v1", D1 = "avault:blind-box:aad:v1", rs = "machine-aesgcm-v1", Cs = 1, Ls = "ecdsa-secp256k1-recoverable", ki = "ed25519", sl = "ecdsa-secp256k1-der", al = "schnorr-secp256k1-bip340", Ei = "schnorr-secp256k1-bip341-keypath", pe = 32, is = 12, Hs = 32, z1 = "avault:protected-vmk:kek-passkey:v1", M1 = /^[A-Za-z_][A-Za-z0-9_]*$/, K1 = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, F1 = "avault:protected-root-meta:v1", j1 = new TextEncoder(), V1 = new TextDecoder();
function cl(e) {
  switch (e) {
    case ki:
    case Ls:
    case sl:
    case al:
    case Ei:
      return e;
    default:
      throw new Error("unsupported signing scheme");
  }
}
function jr(e) {
  if (e === void 0 || e === "secp256k1") return "secp256k1";
  if (e === "ed25519") return e;
  throw new Error("unsupported signing curve");
}
function ll(e) {
  if (cl(e), e === ki) throw new Error("Ed25519 requires exact-message signing, not a digest");
}
function ye(e, t = "bytes") {
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
function Me(e) {
  const t = ye(e), n = new ArrayBuffer(t.byteLength);
  return new Uint8Array(n).set(t), t.fill(0), n;
}
function Oe(e) {
  return j1.encode(e);
}
function os(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(os).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${os(t[n])}`).join(",")}}`;
}
function Jn(e) {
  const t = new Uint8Array(e);
  return crypto.getRandomValues(t), t;
}
function oe(e) {
  const t = ye(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return t.fill(0), btoa(n);
}
function be(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Uint8Array.from(atob(n), (r) => r.charCodeAt(0));
}
function Xe(e) {
  return ot(e.startsWith("0x") ? e.slice(2) : e);
}
function cu(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? Xe(e) : be(e);
}
function q1(e) {
  return J(ye(e));
}
function zp(e, t = "bytes") {
  return ye(e, t);
}
function Ee(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function st(e) {
  e && new Uint8Array(e).fill(0);
}
async function ss(e, t, n, r) {
  let i, o, s, a;
  try {
    i = Me(e), o = Me(t), s = Me(n), a = r ? Me(r) : void 0;
    const c = await crypto.subtle.importKey("raw", i, "AES-GCM", !1, ["encrypt"]), l = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: o,
        ...a ? { additionalData: a } : {}
      },
      c,
      s
    );
    return new Uint8Array(l);
  } finally {
    st(i), st(o), st(s), st(a);
  }
}
async function Us(e, t, n, r) {
  let i, o, s, a;
  try {
    i = Me(e), o = Me(t), s = Me(n), a = r ? Me(r) : void 0;
    const c = await crypto.subtle.importKey("raw", i, "AES-GCM", !1, ["decrypt"]), l = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: o,
        ...a ? { additionalData: a } : {}
      },
      c,
      s
    );
    return new Uint8Array(l);
  } finally {
    st(i), st(o), st(s), st(a);
  }
}
async function G1(e, t, n, r) {
  let i, o, s;
  try {
    i = Me(e), o = Me(t), s = Me(n);
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
    st(i), st(o), st(s);
  }
}
async function Mp(e, t) {
  const n = ye(e, "passkey PRF output");
  try {
    const r = ye(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return Ee(r, Hs, "passkey PRF salt"), await G1(n, r, Oe(z1), pe);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function W1() {
  return Jn(pe);
}
function Z1() {
  return Jn(Hs);
}
function Y1(e) {
  const t = ye(e, "passkey PRF salt");
  try {
    return Ee(t, Hs, "passkey PRF salt"), { prf: { eval: { first: Me(t) } } };
  } finally {
    t.fill(0);
  }
}
function ht(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== Cs || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function X1(e, t) {
  const n = ye(e, "VMK"), r = Jn(is);
  let i, o;
  try {
    Ee(n, pe, "VMK"), o = ye(t.prfSalt, "passkey PRF salt"), Ee(o, Hs, "passkey PRF salt"), i = await Mp(t.prfOutput, o);
    const s = await ss(i, r, n);
    return {
      kind: "passkey",
      kdf: "webauthn-prf-hkdf-sha256",
      prf_salt: oe(o),
      nonce: oe(r),
      wrapped: oe(s),
      ...t.credentialId ? { credential_id: t.credentialId } : {}
    };
  } finally {
    i?.fill(0), o?.fill(0), n.fill(0);
  }
}
async function J1(e, t) {
  const n = ye(e, "VMK");
  try {
    if (Ee(n, pe, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await X1(n, i));
    return JSON.stringify({ v: Cs, copies: r });
  } finally {
    n.fill(0);
  }
}
async function Q1(e, t) {
  const n = be(e.prf_salt);
  if (t.prfSalt && oe(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await Mp(t.prfOutput, n);
  try {
    return await Us(r, be(e.nonce), be(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function Kp(e, t) {
  const n = ht(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await Q1(r, t);
        try {
          return Ee(i, pe, "VMK"), i;
        } catch (o) {
          throw i.fill(0), o;
        }
      }
    } catch {
    }
  throw new Error("no protected VMK copy could be unwrapped");
}
function Ns(e) {
  return ht(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: be(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function ex(e, t) {
  const n = ht(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Fp(e) {
  const t = ht(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function dl(e) {
  if (e.kind === "hd-seed") {
    if (e.publicKey !== void 0 || e.curve !== void 0 || !e.hd) throw new Error("invalid protected HD context");
    return Rs(e.hd);
  }
  if (e.hd !== void 0) throw new Error("protected HD table requires HD metadata");
  if (!e.kind) {
    if (e.curve !== void 0) throw new Error("protected record curve requires keypair metadata");
    return;
  }
  const t = jr(e.curve);
  if (e.kind === "static") {
    if (e.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (e.kind === "keypair") {
    if (typeof e.publicKey != "string" || e.publicKey.length === 0)
      throw new Error("keypair protected record requires a public key");
    return t === "ed25519" && wl(e.publicKey), {
      kind: "keypair",
      public_key: e.publicKey.toLowerCase(),
      ...t === "ed25519" ? { curve: t } : {}
    };
  }
  throw new Error("unsupported protected record kind");
}
function tx(e) {
  if (e === void 0) return;
  if (typeof e != "object" || e === null)
    throw new Error("protected record metadata is invalid");
  const t = e;
  if (t.kind === "hd-seed") return Rs(t);
  if (t.curve !== void 0 && t.curve !== "ed25519")
    throw new Error("protected record metadata curve is invalid");
  if (t.kind === "static") {
    if (t.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (t.kind === "keypair")
    return dl({ kind: "keypair", publicKey: t.public_key, curve: t.curve });
  throw new Error("protected record metadata kind is invalid");
}
function Ds(e, t) {
  return t?.kind === "hd-seed" ? { name: e, kind: "hd-seed", hd: Rs(t) } : {
    name: e,
    ...t ? { kind: t.kind } : {},
    ...t?.public_key ? { publicKey: t.public_key } : {},
    ...t?.curve ? { curve: t.curve } : {}
  };
}
function ul(e) {
  return Oe(
    os({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" || e.kind === "hd-seed" ? Gp(e.name) : Ur(e.name),
      scheme: e.scheme ?? rs,
      version: e.version ?? Cs,
      record: dl(e) ?? null
    })
  );
}
async function fl(e, t, n) {
  const r = ye(t, "VMK"), i = Jn(pe);
  let o;
  try {
    Ee(r, pe, "VMK"), o = ye(e, "value");
    const s = ul(n), a = Jn(is), c = await ss(i, a, o, s), l = Jn(is), u = await ss(r, l, i, s);
    return {
      ciphertext: oe(c),
      nonce: oe(a),
      dek_nonce: oe(l),
      wrapped_dek: oe(u)
    };
  } finally {
    i.fill(0), r.fill(0), o?.fill(0);
  }
}
async function jp(e, t, n) {
  const r = ye(t, "VMK");
  try {
    Ee(r, pe, "VMK");
    const i = await Us(
      r,
      be(e.dek_nonce),
      be(e.wrapped_dek),
      ul(n)
    );
    try {
      return Ee(i, pe, "DEK"), i;
    } catch (o) {
      throw i.fill(0), o;
    }
  } finally {
    r.fill(0);
  }
}
async function Di(e, t, n) {
  const r = await jp(e, t, n);
  try {
    return await Us(
      r,
      be(e.nonce),
      be(e.ciphertext),
      ul(n)
    );
  } finally {
    r.fill(0);
  }
}
function hl(e, t, n) {
  const r = ht(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== rs)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? dl(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: rs,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function On(e) {
  const t = H1(e.wrap_meta), n = ht(t ? ns(e.wrap_meta) : e.wrap_meta);
  if (n.record_meta?.kind === "hd-seed") {
    const c = t ? n : ns(e.wrap_meta);
    L1(e, c);
  }
  const { dek_nonce: r, wrapped_dek: i, record_meta: o, ...s } = n;
  if (typeof r != "string" || typeof i != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const a = tx(o);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: r, wrapped_dek: i },
    vmkWrapMeta: JSON.stringify(s),
    ...a ? { recordMetadata: a } : {}
  };
}
function Vp(e) {
  const t = { ...ht(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, Oe(os({ domain: F1, vault: t }));
}
async function nx(e, t, n) {
  const r = Jn(is), i = Oe(JSON.stringify(t));
  try {
    const o = await ss(e, r, i, Vp(n));
    return { v: 1, nonce: oe(r), ciphertext: oe(o) };
  } finally {
    i.fill(0);
  }
}
async function as(e, t) {
  const n = ht(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await Us(t, be(n.nonce), be(n.ciphertext), Vp(e));
  try {
    const i = JSON.parse(V1.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function rx(e, t) {
  const n = ht(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function ix() {
  return new e0({
    kem: new d0(),
    kdf: new t0(),
    aead: new Hm()
  });
}
function pl(e) {
  return be(typeof e == "string" ? e : e.public_key);
}
async function qp(e) {
  const t = await crypto.subtle.digest("SHA-256", Me(e));
  return J(new Uint8Array(t));
}
async function ox(e) {
  return qp(pl(e));
}
function sx(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function ax(e) {
  const t = sx(e), n = pl(t);
  if (Ee(n, pe, "avault public key"), await qp(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function cx(e, t, n) {
  const r = ix(), i = pl(t);
  if (Ee(i, pe, "avault public key"), typeof t != "string" && t.fingerprint && await ox(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? Oe(e) : ye(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: Oe(N1) },
      s,
      wx(n)
    );
    return {
      scheme: U1,
      enc: oe(new Uint8Array(a.enc)),
      ct: oe(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function Gp(e) {
  if (typeof e != "string" || !M1.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function Ur(e) {
  if (typeof e != "string" || !K1.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function lu(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function yl(e) {
  const t = typeof e == "string" ? Xe(e) : ye(e, "digest");
  return Ee(t, pe, "digest"), t;
}
function lx(e) {
  const t = typeof e == "string" ? Xe(e) : ye(e, "private key");
  try {
    if (Ee(t, pe, "private key"), !fe.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function cs(e, t) {
  return typeof e == "string" ? Xe(e) : ye(e, t);
}
function ls(e) {
  const t = cs(e, "operation hash");
  return Ee(t, pe, "operation hash"), t;
}
function ds(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function Wp(e, t) {
  const n = ds(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function dx(e) {
  return Wp(e, "approval expiry");
}
function du(e) {
  const t = ye(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: ds(e.expiresAtUnix, "approval expiry") };
}
function qe(e, t) {
  const n = ye(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function ux(e) {
  switch (e.purpose) {
    case "seal":
      return fx(e.name);
    case "agent-deliver": {
      const t = du({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: Ur(e.name),
        grantId: lu(e.grantId, "grant id"),
        ttlSecs: ds(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: ls(e.operationHash)
      };
    }
    case "agent-sign": {
      ll(e.signScheme);
      const t = du({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: Gp(e.name),
        grantId: lu(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: yl(e.digest),
        ttlSecs: ds(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: ls(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function fx(e) {
  return { purpose: "seal", name: Ur(e) };
}
async function hx(e) {
  const t = ls(e.operationHash), n = await yx(e.name, e.ttlSecs);
  if (J(t) !== J(n))
    throw new Error("operation hash does not match release operation fields");
}
async function px(e) {
  const t = [];
  for (const n of e)
    qe(t, typeof n == "string" ? Oe(n) : ye(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function yx(e, t) {
  return px(["agent-deliver", Ur(e), Wp(t, "ttl seconds")]);
}
function wx(e) {
  const t = ux(e), n = [...Oe(D1)];
  return qe(n, Oe(t.purpose)), qe(n, Oe(t.name)), qe(n, Oe(rs)), qe(n, new Uint8Array([Cs])), qe(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? Oe(t.grantId) : new Uint8Array()), qe(n, new Uint8Array()), qe(n, t.purpose === "agent-sign" ? Oe(t.signScheme) : new Uint8Array()), qe(n, t.purpose === "agent-sign" ? yl(t.digest) : new Uint8Array()), qe(n, t.purpose === "seal" ? new Uint8Array() : ye(t.approvalNonce, "approval nonce")), qe(n, t.purpose === "seal" ? new Uint8Array() : dx(t.approvalExpiresAtUnix)), qe(n, t.purpose === "seal" ? new Uint8Array() : ls(t.operationHash)), new Uint8Array(n);
}
async function gx(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (Ur(r.name) !== Ur(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await hx(i);
  const o = await ax(n), s = await jp(e, t, r);
  try {
    return await cx(s, o, i);
  } finally {
    s.fill(0);
  }
}
function mx(e = "secp256k1") {
  if (jr(e) === "ed25519") {
    const n = ct.utils.randomSecretKey();
    try {
      return { privateKey: n, publicKey: J(ct.getPublicKey(n)) };
    } catch (r) {
      throw n.fill(0), r;
    }
  }
  const t = fe.utils.randomSecretKey();
  return { privateKey: t, publicKey: J(fe.getPublicKey(t, !0)) };
}
function uu(e) {
  return Xe(e.toString(16).padStart(pe * 2, "0"));
}
function Zp(e, t, n, r = {}) {
  if (ll(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = lx(e);
  let o;
  try {
    const s = yl(t);
    if (n === Ls) {
      const a = fe.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: J(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === sl)
      return {
        scheme: n,
        signature: J(fe.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === al) {
      o = r.schnorrAuxRand !== void 0 ? cs(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(pe)), Ee(o, pe, "schnorr aux randomness");
      const a = bn.sign(s, i, o);
      if (!bn.verify(a, s, bn.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: J(a), recovery_id: null };
    }
    if (n === Ei) {
      const a = fe.getPublicKey(i, !0), c = gl(a.slice(1));
      let l = BigInt(`0x${J(i)}`);
      a[0] === 3 && (l = ai - l);
      const u = BigInt(`0x${J(bn.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (u >= ai) throw new Error("invalid taproot tweak");
      let d = (l + u) % ai;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let f = uu(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = ai - d, f.fill(0), f = uu(d)), o = r.schnorrAuxRand !== void 0 ? cs(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(pe)), Ee(o, pe, "schnorr aux randomness");
        const h = bn.sign(s, f, o);
        if (!bn.verify(h, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
        return { scheme: n, signature: J(h), recovery_id: null };
      } finally {
        f.fill(0);
      }
    }
    throw new Error("unsupported signing scheme");
  } finally {
    o?.fill(0), i.fill(0);
  }
}
async function bx(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  if (ll(i), jr(n.curve) !== "secp256k1") throw new Error("digest signing requires a secp256k1 protected record");
  const s = await Di(e, t, n);
  try {
    if (J(fe.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Zp(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function Yp(e, t) {
  const n = Kc(t), r = cs(e, "Ed25519 seed");
  try {
    Ee(r, pe, "Ed25519 seed");
    const i = ct.sign(n, r);
    if (!ct.verify(i, n, ct.getPublicKey(r), { zip215: !1 }))
      throw new Error("Ed25519 signing self-verification failed");
    return { scheme: ki, signature: J(i), recovery_id: null };
  } finally {
    r.fill(0);
  }
}
function wl(e) {
  if (!/^[0-9a-fA-F]{64}$/.test(e)) throw new Error("expected a 32-byte Ed25519 public key");
  const t = Xe(e);
  if (!ct.utils.isValidPublicKey(t, !1)) throw new Error("invalid Ed25519 public key");
  return t;
}
async function vx(e, t, n, r) {
  if (n.kind !== "keypair" || n.curve !== "ed25519" || !n.publicKey)
    throw new Error("exact-message signing requires an Ed25519 keypair protected record");
  const i = Kc(r);
  if (i.length === 0) throw new Error("protected Ed25519 message must not be empty");
  wl(n.publicKey);
  const o = await Di(e, t, n);
  try {
    if (Ee(o, pe, "Ed25519 seed"), J(ct.getPublicKey(o)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Yp(o, i);
  } finally {
    o.fill(0);
  }
}
function xx(e) {
  return Qp(wl(e));
}
function kx(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return ct.verify(cu(e.signature), Oe(e.message), cu(t.publicKey));
}
function Xp(e) {
  const t = Xe(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && fe.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && fe.utils.isValidPublicKey(t))
    return fe.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const Ex = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", Ax = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", Sx = 1, _x = 734539939, ai = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function Ix(e) {
  return Mc(ae(e));
}
function Jp(e) {
  const t = ae(ae(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  return n.set(e), n.set(t, e.length), Qp(n);
}
function Qp(e) {
  let t = BigInt(`0x${J(e)}`), n = "";
  for (; t > 0n; ) {
    const i = Number(t % 58n);
    t /= 58n, n = Ex[i] + n;
  }
  let r = 0;
  for (const i of e) {
    if (i !== 0) break;
    r += 1;
  }
  return "1".repeat(r) + n;
}
function Bx(e) {
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
function $x(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function Tx(e, t, n) {
  const r = $x(e).concat(t), i = Bx(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function Px(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function ic(e, t, n) {
  const r = t === 0 ? Sx : _x, i = [t].concat(Px(n, 8, 5));
  return `${e}1${i.concat(Tx(e, i, r)).map((o) => Ax[o]).join("")}`;
}
function ey(e) {
  const t = e.toLowerCase(), n = J(jo(Oe(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function gl(e) {
  const t = BigInt(`0x${J(bn.utils.taggedHash("TapTweak", e))}`);
  if (t >= ai) throw new Error("invalid taproot tweak");
  const n = fe.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(fe.Point.BASE.multiply(t));
  if (r.equals(fe.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function Ox(e) {
  return gl(Xp(e).slice(1)).toBytes(!0).slice(1);
}
function zs(e) {
  const t = Xp(e), n = fe.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = jo(r), o = Ix(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = gl(a);
  return {
    eth: `0x${ey(J(i.slice(-20)))}`,
    btc_legacy: Jp(s),
    btc_segwit: ic("bc", 0, o),
    btc_taproot: ic("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const ml = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let oc = { ...ml };
function Rx(e) {
  return e === 300 || e === 600 || e === 1800 ? e : ml.windowSeconds;
}
function Cx(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new A("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function bl(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new A("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new A("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: Cx(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function Lx(e) {
  if (typeof e != "object" || e === null) return { ...ml };
  const t = e;
  return {
    windowSeconds: Rx(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function vl(e) {
  return oc = Lx(e), oc;
}
function $e() {
  return { ...oc };
}
const Hx = "avibe-vault-lock:v1:", V = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let Wt = null, Nr = null, Qn = null, Ai = null, sc = null, Xt = 0;
const us = /* @__PURE__ */ new Set();
let wi = 0, ty = null;
function Ux(e) {
  ty = e;
}
function fu() {
  return V.vmk ? "unlocked" : V.wrapMeta ? "locked" : "needs-setup";
}
function ny(e) {
  ty?.({
    state: fu(),
    ...Wt !== null && fu() === "unlocked" ? { expiresAt: Wt } : {},
    reason: e
  });
}
function xl() {
  Qn !== null && (clearTimeout(Qn), Qn = null);
}
function Si() {
  Ai?.close(), Ai = null, sc = null;
}
function ry(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function Nx(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function iy(e) {
  const t = ht(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? ry(t.vault_user_handle) : `wrap-${Nx(e)}`;
}
function Dx(e) {
  return ry(e);
}
function kl(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    Si();
    return;
  }
  const t = `${Hx}${e}`;
  sc !== t && (Si(), sc = t, Ai = new BroadcastChannel(t), Ai.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && pt({ broadcast: !1, reason: "manual-lock" });
  });
}
function zx() {
  V.scopeId && (kl(V.scopeId), Ai?.postMessage({ type: "lock", scopeId: V.scopeId }));
}
function At() {
  return new Error("vault-operation-aborted");
}
function oy() {
  Xt += 1;
  for (const e of us)
    e.abort(At());
  us.clear();
  for (const e of nt.keys()) e.abort(At());
  nt.clear();
}
function An(e) {
  const t = { ...ht(e) };
  for (const n of ["scheme", "record_meta", "dek_nonce", "wrapped_dek"]) delete t[n];
  return t;
}
function $r(e, t) {
  const n = [[e, t]];
  for (; n.length; ) {
    const [r, i] = n.pop();
    if (r === i) continue;
    if (r === null || i === null || typeof r != "object" || typeof i != "object" || Array.isArray(r) !== Array.isArray(i)) return !1;
    const o = Object.keys(r);
    if (o.length !== Object.keys(i).length) return !1;
    for (const s of o) {
      if (!Object.hasOwn(i, s)) return !1;
      n.push([r[s], i[s]]);
    }
  }
  return !0;
}
const nt = /* @__PURE__ */ new Map();
function sy(e) {
  if (nt.size === 0) return;
  const t = An(e);
  for (const [n, r] of nt)
    $r(r, t) || n.abort(At());
}
function Ms(e) {
  fs();
  const t = An(e);
  if (V.wrapMeta && !$r(An(V.wrapMeta), t) || (dt(e), !V.wrapMeta || !$r(An(V.wrapMeta), t))) throw At();
  for (const s of nt.keys()) s.abort(At());
  nt.clear();
  const n = ++wi, r = Xt, i = ac(), o = new AbortController();
  return nt.set(o, t), kl(V.scopeId), {
    freshSetup: i,
    signal: o.signal,
    assertCurrent: () => {
      if (fs(), o.signal.aborted || r !== Xt || n !== wi || i !== ac() || !V.wrapMeta || !$r(An(V.wrapMeta), t)) throw At();
    },
    lockIfCurrent: (s = {}) => o.signal.aborted || n !== wi ? !1 : ay(r, t, s),
    release: () => {
      nt.delete(o), o.abort(At()), !V.vmk && nt.size === 0 && Si();
    }
  };
}
function ay(e, t, n = {}) {
  return e !== Xt || !V.vmk || !V.wrapMeta || !$r(An(V.wrapMeta), t) ? !1 : (pt(n), !0);
}
function Mx() {
  V.vmk?.fill(0), V.vmk = null, Wt = null, Nr = null, xl(), Si(), V.freshSetup && (V.wrapMeta = null, V.freshSetup = !1, V.scopeId = null);
}
function Kx() {
  return Wt !== null && Date.now() >= Wt;
}
function fs() {
  return V.vmk && Kx() ? (pt({ broadcast: !1, reason: "auto-lock" }), !1) : V.vmk !== null;
}
function cy(e) {
  const t = setTimeout(() => {
    Qn !== t || Nr !== e || e.epoch !== Xt || !V.vmk || (Qn = null, pt({ broadcast: !1, reason: "auto-lock" }));
  }, Math.max(0, e.expiresAt - Date.now()));
  Qn = t;
}
function ly(e, t = $e()) {
  if (!V.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return Wt = Date.now() + n, Nr = { epoch: Xt, expiresAt: Wt, pendingCommits: 0 }, xl(), cy(Nr), ny(e), Wt;
}
function Fx() {
  const e = Nr;
  if (!V.vmk || !e) return () => {
  };
  e.pendingCommits += 1, xl();
  let t = !1;
  return () => {
    if (!t && (t = !0, e.pendingCommits -= 1, !(Nr !== e || e.epoch !== Xt || !V.vmk || e.pendingCommits !== 0 || Qn !== null))) {
      if (e.expiresAt <= Date.now()) {
        pt({ broadcast: !1, reason: "auto-lock" });
        return;
      }
      cy(e);
    }
  };
}
function jx(e) {
  if (e instanceof A && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function Vx(e) {
  if (e.signal.aborted || e.epoch !== Xt || !V.vmk)
    throw At();
}
async function Ks(e, t = {}) {
  if (!fs() || !V.vmk || !V.wrapMeta)
    throw new Error("vault-locked");
  const n = V.wrapMeta, r = t.expectedWrapMeta === void 0 ? void 0 : An(t.expectedWrapMeta);
  if (r !== void 0 && !$r(An(n), r)) throw At();
  const i = new Uint8Array(V.vmk), o = Xt, s = wi, a = new AbortController();
  us.add(a), r !== void 0 && nt.set(a, r);
  const c = {
    epoch: o,
    signal: a.signal,
    assertCurrent: () => Vx(c)
  };
  let l = null;
  try {
    c.assertCurrent();
    const u = await e(i, n, c);
    return c.assertCurrent(), t.renewOnSuccess !== !1 && ly("renew"), c.assertCurrent(), t.beforeSuccess && (l = Fx(), await t.beforeSuccess(), c.assertCurrent(), l(), l = null), u;
  } catch (u) {
    throw jx(u) || (r !== void 0 ? !a.signal.aborted && s === wi && ay(o, r, { broadcast: !0, reason: "manual-lock" }) : pt({ broadcast: !0, reason: "manual-lock" })), u;
  } finally {
    l?.(), us.delete(a), nt.delete(a), i.fill(0);
  }
}
function ac() {
  return V.vmk !== null && V.freshSetup;
}
function dy(e) {
  oy(), V.vmk?.fill(0), V.vmk = e.vmk, V.wrapMeta = e.wrapMeta, V.freshSetup = e.freshSetup, V.scopeId = e.scopeId, kl(e.scopeId);
  const t = { state: "unlocked", expiresAt: ly("unlock", e.policy) };
  if (e.onCommitted) {
    const n = Ms(e.wrapMeta);
    try {
      e.onCommitted(n);
    } catch (r) {
      throw n.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), n.release(), r;
    }
  }
  return t;
}
function pt(e = {}) {
  return e.broadcast && zx(), oy(), Mx(), ny(e.reason ?? "manual-lock"), { state: "locked" };
}
function dt(e) {
  fs();
  const t = e ? Fp(e) : void 0;
  return t && sy(t), V.vmk ? {
    state: "unlocked",
    expiresAt: Wt ?? void 0,
    ...V.freshSetup ? { freshSetup: !0 } : {}
  } : (t && (V.wrapMeta = t, V.scopeId = iy(t)), V.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function El(e) {
  const t = Fp(e), n = iy(t);
  return sy(t), V.wrapMeta = t, V.scopeId = n, { wrapMeta: t, scopeId: n };
}
function qx() {
  pt({ broadcast: !1, reason: "unload" }), Si();
}
const ho = "Avibe Vault", hu = "avibe-vault";
function tr(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function Sn(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function uy() {
  return Sn(crypto.getRandomValues(new Uint8Array(32)));
}
function fy(e) {
  try {
    return be(e);
  } catch {
    return null;
  }
}
function Fs(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return Sn(zp(e));
  if (typeof e == "string") {
    const n = fy(e);
    return Sn(n ?? new TextEncoder().encode(e));
  }
  if (Array.isArray(e))
    return Sn(Uint8Array.from(e));
  throw new Error("webauthn bytes are missing");
}
function va(e) {
  if (typeof e != "object" || e === null || Object.getPrototypeOf(e) !== Object.prototype && Object.getPrototypeOf(e) !== null)
    throw new Error("invalid webauthn creation options object");
  return e;
}
function Gx(e) {
  if (typeof e != "string" || e.length === 0 || e.length > 88 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(e) || /[+/]/.test(e) && /[-_]/.test(e))
    throw new Error("invalid webauthn user.id encoding");
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = fy(t);
  if (!n || n.byteLength === 0 || n.byteLength > 64)
    throw new Error("webauthn user.id must be 1-64 bytes");
  const r = oe(n);
  if (t !== r && t !== r.replace(/=+$/, ""))
    throw new Error("invalid webauthn user.id encoding");
  return Sn(n);
}
function Wx(e) {
  const t = Fs(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function hs(e) {
  if (Array.isArray(e))
    return e.map((t) => {
      const n = tr(t);
      if (!n || n.type !== "public-key")
        throw new Error("invalid WebAuthn credential descriptor");
      return {
        type: "public-key",
        id: Fs(n.id),
        ...Array.isArray(n.transports) ? { transports: n.transports } : {}
      };
    });
}
function pu(e) {
  return !Array.isArray(e) || e.length === 0 ? [
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 }
  ] : e.map((t) => {
    const n = tr(t);
    if (!n || n.type !== "public-key" || typeof n.alg != "number")
      throw new Error("invalid WebAuthn pubKeyCredParams");
    return { type: "public-key", alg: n.alg };
  });
}
function yu(e) {
  return {
    ...tr(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function wu(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function Zx(e) {
  const t = tr(e) ?? {};
  return { ...t, prf: tr(t.prf) ?? {} };
}
function Ot() {
  return window.location.hostname;
}
function Yx(e) {
  const t = e.authzCreationOptions === void 0 ? void 0 : va(e.authzCreationOptions), n = t && Object.prototype.hasOwnProperty.call(t, "webauthn") ? va(t.webauthn) : t, r = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, i = tr(n?.rp), o = typeof i?.id == "string" ? i.id : void 0;
  if (o && o !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!n)
    return {
      options: {
        rp: { name: ho, id: e.rpId },
        user: {
          id: Wx(e.vaultUserHandle),
          name: e.vaultUserHandle || hu,
          displayName: e.displayName || ho
        },
        challenge: uy(),
        pubKeyCredParams: pu(void 0),
        authenticatorSelection: yu(void 0),
        extensions: { prf: {} }
      }
    };
  const s = va(n.user);
  return {
    options: {
      rp: {
        name: typeof i?.name == "string" ? i.name : ho,
        id: e.rpId
      },
      user: {
        id: Gx(s.id),
        name: typeof s.name == "string" ? s.name : e.vaultUserHandle || hu,
        displayName: typeof s.displayName == "string" ? s.displayName : e.displayName || ho
      },
      challenge: Fs(n.challenge),
      pubKeyCredParams: pu(n.pubKeyCredParams),
      authenticatorSelection: yu(n.authenticatorSelection),
      extensions: Zx(n.extensions),
      ...hs(n.excludeCredentials) ? { excludeCredentials: hs(n.excludeCredentials) } : {},
      ...typeof n.timeout == "number" ? { timeout: n.timeout } : {},
      ...wu(n.attestation) ? { attestation: wu(n.attestation) } : {}
    },
    ...r ? { challengeId: r } : {}
  };
}
function Xx(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function Jx(e, t) {
  const n = Xx(e), r = {
    challenge: uy(),
    rpId: t,
    userVerification: "required",
    extensions: Y1(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: Sn(be(n.credentialId))
    }
  ]), r;
}
function Qx(e, t, n) {
  const r = {
    challenge: Sn(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: Sn(be(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function e2(e, t = Ot()) {
  const n = tr(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: Fs(n.challenge),
    rpId: t,
    userVerification: "required",
    ...hs(n.allowCredentials) ? { allowCredentials: hs(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function hy(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function py(e) {
  return {
    id: e.id,
    rawId: oe(e.rawId),
    type: e.type
  };
}
function t2(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...py(e),
    response: {
      clientDataJSON: oe(t.clientDataJSON),
      attestationObject: oe(t.attestationObject),
      transports: n
    }
  };
}
function yy(e) {
  const t = e.response;
  return {
    ...py(e),
    response: {
      clientDataJSON: oe(t.clientDataJSON),
      authenticatorData: oe(t.authenticatorData),
      signature: oe(t.signature),
      userHandle: t.userHandle ? oe(t.userHandle) : null
    }
  };
}
function n2(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = zp(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function js(e, t, n) {
  const r = await navigator.credentials.get(
    hy(Jx(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = n2(r), o = oe(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function r2(e, t, n, r) {
  if (!await navigator.credentials.get(
    hy(Qx(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function i2(e) {
  const t = await navigator.credentials.get({
    publicKey: e2(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return yy(t);
}
const o2 = /ancestor|not the same as its|cross-?origin|different origin/i;
function wy(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function s2(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function gy(e) {
  const t = wy(e);
  return t === "SecurityError" || t === "NotSupportedError" || o2.test(s2(e));
}
function my(e) {
  return wy(e) === "NotAllowedError" && !gy(e);
}
function Al(e) {
  const { options: t, challengeId: n } = Yx(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = oe(i.rawId), s = t2(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const cc = {
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
    "hd.wordsTitle": "Write the words down",
    "hd.wordsBody": "They appear only in this secure window and aren't shown again after saving. If this computer or your passkey is lost, only they (and the passphrase, if any) recover the wallet.",
    "hd.wordsWritten": "I wrote them down",
    "hd.quizTitle": "Check",
    "hd.quizBody": "Using your paper, pick these 3 words.",
    "hd.quizPosition": "Word #{{position}}",
    "hd.quizWrong": "Word #{{position}} doesn't match; check it against your paper.",
    "hd.passphraseTitle": "Passphrase (optional)",
    "hd.passphraseBody": "The passphrase and the words together decide the addresses. Recovery needs the words plus this exact passphrase; forget it and the wallet can't be recovered. Most people don't need one.",
    "hd.importPassphraseHint": "Only if your old wallet used one. A wrong passphrase gives no error, just different addresses; you compare them next.",
    "hd.passphrase": "Passphrase",
    "hd.passphraseConfirm": "Enter it again",
    "hd.showPassphrase": "Show passphrase",
    "hd.hidePassphrase": "Hide passphrase",
    "hd.passphraseNotStored": "Case and spaces count. The passphrase is never stored.",
    "hd.passphraseMismatch": "The two entries don't match.",
    "hd.skipNext": "Skip, next",
    "hd.importTitle": "Import a seed phrase",
    "hd.importBody": "Paste it in this separate secure window; the words are never handed to the main Avibe page or an Agent.",
    "hd.importWords": "Seed phrase (12, 15, 18, 21 or 24 words)",
    "hd.phraseEmpty": "Enter the seed phrase.",
    "hd.phraseUnknown": "Word #{{position}} isn't a BIP39 English word.",
    "hd.phraseCount": "{{count}} words entered; a seed phrase has 12, 15, 18, 21 or 24.",
    "hd.phraseChecksum": "These words fail the BIP39 checksum. Check their order and spelling.",
    "hd.reviewTitleCreate": "Save the wallet",
    "hd.reviewTitleImport": "Compare, then save",
    "hd.reviewBodyCreate": "Account #0's addresses:",
    "hd.reviewBodyImport": "These should match your old wallet's first account:",
    "hd.reviewEvm": "ETH",
    "hd.reviewBitcoin": "BTC · Taproot",
    "hd.reviewSolana": "Solana",
    "hd.passkeyNote": "Saving is confirmed with your passkey; the secure window then reopens the encrypted result to check it before handing the encrypted result to Avibe.",
    "hd.saveCta": "Save with passkey",
    "hd.working": "Saving and checking…",
    "hd.next": "Next",
    "hd.back": "Back",
    "hd.unlockTitle": "Unlock protected wallet",
    "hd.unlockBody": "First unlock with your passkey. Then review the actual account and derivation path and use your passkey again to approve this signature.",
    "review.field.walletAccount": "Wallet account",
    "review.group.hdAccount": "Protected wallet account",
    "sign.confirm": "Confirm sign",
    "review.details": "Details",
    "review.copy": "Copy",
    "review.copied": "Copied",
    "review.copySelected": "Selected; copy with the keyboard",
    "review.kind.solanaSystemTransfer": "Solana · SOL transfer",
    "review.kind.solanaTokenTransfer": "Solana · token transfer",
    "review.kind.solanaTransaction": "Solana transaction",
    "review.kind.evmTransaction": "EVM transaction",
    "review.kind.bitcoinTransfer": "Bitcoin · transfer",
    "review.kind.eip712": "Ethereum · typed data (EIP-712)",
    "review.kind.erc2612Permit": "Token authorization · ERC-2612 permit",
    "review.kind.permit2Allowance": "Token authorization · Permit2 allowance",
    "review.kind.permit2Transfer": "Token transfer authorization · Permit2 (one-time)",
    "review.field.typedField": "{{name}}",
    "review.field.domainName": "Domain name",
    "review.field.verifyingContract": "Verifying contract",
    "review.field.primaryType": "Primary type",
    "review.field.spender": "Spender",
    "review.field.permitAmount": "Allowance amount",
    "review.field.permitOwner": "Owner (in message)",
    "review.field.permitDeadline": "Signature deadline",
    "review.field.permitNonce": "Permit nonce",
    "review.field.permitToken": "Token {{index}}",
    "review.field.permitTokenAmount": "Token {{index}} amount",
    "review.field.permitExpiration": "Token {{index}} allowance expires",
    "review.field.moreTokens": "More tokens",
    "review.field.signatureDeadline": "Signature deadline",
    "review.field.moreFields": "More fields",
    "review.field.notInTypedHash": "Outside the typed-data hash",
    "review.field.typedTypes": "Types",
    "review.field.typedData": "Complete typed data",
    "review.note.unknownChain": "unrecognized chain ID",
    "review.note.notInTypedHash": "not in the typed-data hash",
    "review.note.messageNotHashed": "the message is not hashed",
    "review.note.fieldsOutsideHash": "{{count}} values present but not signed by the typed data; see Details",
    "review.note.rawTokenUnits": "raw token units",
    "review.note.permitDeadline": "the permit must be used by this time; not how long the allowance lasts",
    "review.note.permit2Expiration": "allowance expiry; 0 means it expires in the block it is used",
    "review.note.signatureDeadline": "the signature must be used by this time",
    "review.note.moreInRawData": "and {{count}} more in the complete typed data",
    "review.note.pathShortened": "path shortened; complete in the typed data",
    "review.warning.tokenAuthorization": "This signature lets the spender move your tokens.",
    "review.warning.unlimitedAllowance": "Unlimited amount: the allowance is the largest value the field can hold.",
    "review.warning.oneTimeTransfer": "This signature lets the spender make one transfer of your tokens.",
    "review.warning.maximumOneTimeTransfer": "The permitted amount is the largest value the field can hold, for that one transfer.",
    "review.group.typedDomain": "Domain",
    "review.group.typedMessage": "Message",
    "review.group.notInTypedHash": "Outside the typed-data hash",
    "review.field.network": "Network",
    "review.field.returnToKey": "Returning to this key",
    "review.field.returnAmount": "Return amount",
    "review.field.fee": "Fee",
    "review.field.feeRate": "Fee rate",
    "review.field.netLeaving": "Net leaving this key",
    "review.field.send": "Send",
    "review.field.recipientAddress": "Recipient address",
    "review.value.unlimited": "Unlimited",
    "review.value.maximumOneTime": "Maximum, for one transfer only",
    "review.note.exactInDetails": "exact value in Details",
    "review.kind.erc20Transfer": "Token transfer (ERC-20 format)",
    "review.kind.tokenApprove": "Token authorization · approve",
    "review.kind.tokenIncreaseAllowance": "Token authorization · increaseAllowance",
    "review.field.transferTo": "To",
    "review.field.tokenContract": "Token contract",
    "review.field.approvalValue": "Allowance or NFT token ID",
    "review.field.allowanceIncrease": "Allowance increase",
    "review.field.nativeTransfer": "Transfer",
    "review.field.maxEntries": "Entries at the maximum",
    "review.value.maximum": "Maximum",
    "review.value.maximumIncrease": "Maximum increase",
    "review.note.addedToAllowance": "added to the current allowance; the resulting total is not in this transaction",
    "review.note.moreEntriesInDetails": "{{count}} more, see Details",
    "review.note.ofEntries": "of {{count}} entries",
    "review.warning.maximumApproval": "This value is the largest uint256. If it is an ERC-20 allowance, that usually means unlimited; it may also be an NFT token ID.",
    "review.amount.baseUnitsDecimals": "({{value}} base units, decimals {{count}})",
    "review.time.raw": "({{value}})",
    "review.time.noDate": "(no calendar date for this value)",
    "review.field.internalKey": "Internal key",
    "review.field.outputKey": "Taproot output key",
    "review.field.input": "Input",
    "review.field.inputAmount": "Input amount",
    "review.field.outputIndexed": "Output {{index}}",
    "review.field.outputAmountIndexed": "Output {{index}} amount",
    "review.field.signedVsize": "Signed size",
    "review.field.sequence": "Sequence",
    "review.field.locktime": "Locktime",
    "review.field.unsignedTxid": "Unsigned transaction ID",
    "review.field.prevoutScript": "Spent output script",
    "review.note.requesterNetwork": "selected by the requester, not proven on chain",
    "review.note.networkNotChainProof": "selected by the requester; not chain proof. Verify the destination and funding independently, and do not treat testnet or Signet as safer.",
    "review.note.recipient": "recipient",
    "review.note.sameKeyReturn": "returns to this key",
    "review.note.vbytes": "vB",
    "review.note.rbfSignals": "signals RBF",
    "review.note.rbfDoesNotSignal": "does not signal RBF",
    "review.warning.highFee": "This fee is above the V1 review threshold (100 sat/vB or 2% of the input).",
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
    "review.field.undecodedInstruction": "Undecoded instruction",
    "review.field.durableNonce": "Includes a durable-nonce advance instruction",
    "review.field.nonceAccount": "Nonce account",
    "review.field.nonceAuthority": "Nonce authority (as encoded)",
    "review.field.recentBlockhashesSysvar": "RecentBlockhashes sysvar",
    "review.field.instruction": "Instruction",
    "review.field.instructions": "Instructions",
    "review.field.transferSol": "{{index}} · SOL transfer",
    "review.field.transferToken": "{{index}} · Token transfer",
    "review.field.transferTokenNoMint": "{{index}} · Token transfer · mint not in instruction",
    "review.field.moreTransfers": "More transfers",
    "review.field.moreUndecoded": "More undecoded instructions",
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
    "review.note.nonceAdvances": "{{count}} nonce advances",
    "review.note.moreInDetails": "and {{count}} more, see Details",
    "review.note.moreInstructionsInDetails": "and {{count}} more, see Details",
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
    "policyDowngrade.title": 'Turn off "Ask before signing"',
    "policyDowngrade.confirm": "Turn off confirmation",
    "policyDowngrade.standardWarning": "After this, Agents can sign with it without asking you. This confirmation only guards against mistakes; to protect funds, use the protected tier.",
    "policyDowngrade.protectedNotice": "Protected keys still need your Passkey approval in the browser for every signature.",
    "policyDowngrade.setting": "Setting",
    "policyDowngrade.settingValue": "Ask before signing: On → Off",
    "policyDowngrade.key": "Key",
    "policyDowngrade.tier": "Tier",
    "policyDowngrade.standard": "Standard",
    "policyDowngrade.protected": "Protected",
    "policyDowngrade.account": "Account",
    "policyDowngrade.accountNamed": "#{{index}} {{name}}",
    "policyDowngrade.accountUnnamed": "#{{index}} (no name)",
    "policyDowngrade.appliesTo": "Applies to",
    "policyDowngrade.appliesToValue": "This account's signing on ETH, BTC and Solana",
    "policyDowngrade.onlyPolicy": "This only changes the setting. It doesn't sign anything or touch the key.",
    "policyDowngrade.details": "Request details",
    "policyDowngrade.serverFacts": "Server-asserted target facts",
    "policyDowngrade.eth": "EVM address",
    "policyDowngrade.btcLegacy": "Bitcoin legacy address",
    "policyDowngrade.btcSegwit": "Bitcoin SegWit address",
    "policyDowngrade.btcTaproot": "Bitcoin Taproot address",
    "policyDowngrade.solana": "Solana address",
    "policyDowngrade.recordId": "Record ID",
    "policyDowngrade.identity": "Identity digest",
    "policyDowngrade.revision": "Record revision",
    "policyDowngrade.expires": "Approval expires",
    "policyDowngrade.challengeId": "Challenge ID",
    "policyDowngrade.notUsed": "Not used for this signer",
    "context.session": "Session",
    "context.command": "Command",
    "context.egress": "Egress",
    "context.source": "Source",
    "context.sourceEnv": "env",
    "context.signReturns": "Returns",
    "context.sourceRequestedName": "requested as",
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
    "hd.wordsTitle": "抄下助记词",
    "hd.wordsBody": "只在这个安全窗口里出现，保存后不会再显示。这台电脑丢了或 Passkey 丢了，只能靠它们（和 Passphrase，如有）找回。",
    "hd.wordsWritten": "我已抄好",
    "hd.quizTitle": "核对",
    "hd.quizBody": "看着你的纸，选出这 3 个词。",
    "hd.quizPosition": "第 {{position}} 个词",
    "hd.quizWrong": "第 {{position}} 个词不对，对照纸再看一遍。",
    "hd.passphraseTitle": "Passphrase（可选）",
    "hd.passphraseBody": "Passphrase 和这些词一起决定钱包的地址。恢复时需要词加上一字不差的 Passphrase；忘了它，钱包就找不回来。大多数人不需要。",
    "hd.importPassphraseHint": "只有原钱包用过才填。填错不会报错，只会得到不同的地址，下一步核对。",
    "hd.passphrase": "Passphrase",
    "hd.passphraseConfirm": "再输入一次",
    "hd.showPassphrase": "显示 Passphrase",
    "hd.hidePassphrase": "隐藏 Passphrase",
    "hd.passphraseNotStored": "区分大小写和空格。Passphrase 不会被保存。",
    "hd.passphraseMismatch": "两次输入不一样。",
    "hd.skipNext": "不设置，下一步",
    "hd.importTitle": "导入助记词",
    "hd.importBody": "在这个独立的安全窗口里粘贴；助记词不会交给 Avibe 主页面或 Agent。",
    "hd.importWords": "助记词（12、15、18、21 或 24 个词）",
    "hd.phraseEmpty": "请输入助记词。",
    "hd.phraseUnknown": "第 {{position}} 个词不是 BIP39 英文词表里的词。",
    "hd.phraseCount": "输入了 {{count}} 个词；助记词应为 12、15、18、21 或 24 个。",
    "hd.phraseChecksum": "这组词没有通过 BIP39 校验，请检查顺序和拼写。",
    "hd.reviewTitleCreate": "保存钱包",
    "hd.reviewTitleImport": "和原钱包核对，然后保存",
    "hd.reviewBodyCreate": "账户 #0 的地址：",
    "hd.reviewBodyImport": "应该和原钱包的第一个账户一样：",
    "hd.reviewEvm": "ETH",
    "hd.reviewBitcoin": "BTC · Taproot",
    "hd.reviewSolana": "Solana",
    "hd.passkeyNote": "保存时用 Passkey 确认；随后在安全窗口里重新打开加密结果核对，再把加密结果交给 Avibe。",
    "hd.saveCta": "用 Passkey 保存",
    "hd.working": "正在保存并核对…",
    "hd.next": "下一步",
    "hd.back": "返回",
    "hd.unlockTitle": "解锁保护档钱包",
    "hd.unlockBody": "先使用 Passkey 解锁，再核对实际账户和派生路径，并再次使用 Passkey 批准本次签名。",
    "review.field.walletAccount": "钱包账户",
    "review.group.hdAccount": "保护档钱包账户",
    "sign.confirm": "确认签名",
    "review.details": "详情",
    "review.copy": "复制",
    "review.copied": "已复制",
    "review.copySelected": "已选中，请用键盘复制",
    "review.kind.solanaSystemTransfer": "Solana · SOL 转账",
    "review.kind.solanaTokenTransfer": "Solana · 代币转账",
    "review.kind.solanaTransaction": "Solana 交易",
    "review.kind.evmTransaction": "EVM 交易",
    "review.kind.bitcoinTransfer": "Bitcoin · 转账",
    "review.kind.eip712": "以太坊 · 结构化签名（EIP-712）",
    "review.kind.erc2612Permit": "代币授权 · ERC-2612 Permit",
    "review.kind.permit2Allowance": "代币授权 · Permit2 额度",
    "review.kind.permit2Transfer": "代币转账授权 · Permit2（一次性）",
    "review.field.typedField": "{{name}}",
    "review.field.domainName": "域名称（domain.name）",
    "review.field.verifyingContract": "验证合约",
    "review.field.primaryType": "主类型",
    "review.field.spender": "被授权方（spender）",
    "review.field.permitAmount": "授权额度",
    "review.field.permitOwner": "所有者（消息中）",
    "review.field.permitDeadline": "签名截止时间",
    "review.field.permitNonce": "Permit nonce",
    "review.field.permitToken": "代币 {{index}}",
    "review.field.permitTokenAmount": "代币 {{index}} 数额",
    "review.field.permitExpiration": "代币 {{index}} 额度到期",
    "review.field.moreTokens": "其余代币",
    "review.field.signatureDeadline": "签名截止时间",
    "review.field.moreFields": "其余字段",
    "review.field.notInTypedHash": "未纳入结构化签名哈希",
    "review.field.typedTypes": "类型定义",
    "review.field.typedData": "完整结构化数据",
    "review.note.unknownChain": "未识别的链 ID",
    "review.note.notInTypedHash": "未纳入结构化签名哈希",
    "review.note.messageNotHashed": "消息未被哈希",
    "review.note.fieldsOutsideHash": "有 {{count}} 个值未被结构化签名覆盖，见详情",
    "review.note.rawTokenUnits": "代币最小单位",
    "review.note.permitDeadline": "须在此时间前使用该授权；不是额度的有效期",
    "review.note.permit2Expiration": "额度到期时间；0 表示在使用的区块内到期",
    "review.note.signatureDeadline": "须在此时间前使用该签名",
    "review.note.moreInRawData": "另有 {{count}} 项，见完整结构化数据",
    "review.note.pathShortened": "路径已缩略，完整路径见结构化数据",
    "review.warning.tokenAuthorization": "代币授权：此签名允许被授权方动用你的代币。",
    "review.warning.unlimitedAllowance": "无限授权：额度为该字段能表示的最大值。",
    "review.warning.oneTimeTransfer": "代币转账授权：此签名允许被授权方转走你的代币一次。",
    "review.warning.maximumOneTimeTransfer": "许可数额为该字段能表示的最大值，仅限这一次转账。",
    "review.group.typedDomain": "域（domain）",
    "review.group.typedMessage": "消息（message）",
    "review.group.notInTypedHash": "未纳入结构化签名哈希",
    "review.field.network": "网络",
    "review.field.returnToKey": "退回此密钥",
    "review.field.returnAmount": "退回金额",
    "review.field.fee": "手续费",
    "review.field.feeRate": "费率",
    "review.field.netLeaving": "实际离开此密钥",
    "review.field.send": "转出",
    "review.field.recipientAddress": "收款地址",
    "review.value.unlimited": "无限",
    "review.value.maximumOneTime": "最大值，仅限这一次转账",
    "review.note.exactInDetails": "原始数值见详情",
    "review.kind.erc20Transfer": "代币转账（ERC-20 格式）",
    "review.kind.tokenApprove": "代币授权 · approve",
    "review.kind.tokenIncreaseAllowance": "代币授权 · 增加额度（increaseAllowance）",
    "review.field.transferTo": "转给",
    "review.field.tokenContract": "代币合约",
    "review.field.approvalValue": "额度或 NFT 编号",
    "review.field.allowanceIncrease": "增加额度",
    "review.field.nativeTransfer": "转账",
    "review.field.maxEntries": "最大值条目",
    "review.value.maximum": "最大值",
    "review.value.maximumIncrease": "最大增量",
    "review.note.addedToAllowance": "在现有额度上增加；结果总额不在此交易中",
    "review.note.moreEntriesInDetails": "另外 {{count}} 项，见详情",
    "review.note.ofEntries": "共 {{count}} 项",
    "review.warning.maximumApproval": "该值为 uint256 最大值：若为 ERC-20 额度，通常表示无限授权；也可能是 NFT 编号。",
    "review.amount.baseUnitsDecimals": "（{{value}} 最小单位，小数位 {{count}}）",
    "review.time.raw": "（{{value}}）",
    "review.time.noDate": "（该数值无法换算为日期）",
    "review.field.internalKey": "内部公钥",
    "review.field.outputKey": "Taproot 输出公钥",
    "review.field.input": "输入",
    "review.field.inputAmount": "输入金额",
    "review.field.outputIndexed": "输出 {{index}}",
    "review.field.outputAmountIndexed": "输出 {{index}} 金额",
    "review.field.signedVsize": "签名后大小",
    "review.field.sequence": "Sequence",
    "review.field.locktime": "Locktime",
    "review.field.unsignedTxid": "未签名交易 ID",
    "review.field.prevoutScript": "被花费输出脚本",
    "review.note.requesterNetwork": "请求方标注，未经链上证明",
    "review.note.networkNotChainProof": "由请求方标注，不是链上证明。请独立核对收款地址和资金来源；不要因为是测试网或 Signet 就降低警惕。",
    "review.note.recipient": "收款方",
    "review.note.sameKeyReturn": "退回此密钥",
    "review.note.vbytes": "vB",
    "review.note.rbfSignals": "发出 RBF 信号",
    "review.note.rbfDoesNotSignal": "不发出 RBF 信号",
    "review.warning.highFee": "手续费高于 V1 审核阈值（100 sat/vB 或输入金额的 2%）。",
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
    "review.field.undecodedInstruction": "未解析指令",
    "review.field.durableNonce": "包含持久 nonce 推进指令",
    "review.field.nonceAccount": "Nonce 账户",
    "review.field.nonceAuthority": "Nonce 授权账户（指令所列）",
    "review.field.recentBlockhashesSysvar": "RecentBlockhashes 系统变量",
    "review.field.instruction": "指令",
    "review.field.instructions": "指令数",
    "review.field.transferSol": "{{index}} · SOL 转账",
    "review.field.transferToken": "{{index}} · 代币转账",
    "review.field.transferTokenNoMint": "{{index}} · 代币转账 · 指令未包含 mint",
    "review.field.moreTransfers": "其余转账",
    "review.field.moreUndecoded": "其余未解析指令",
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
    "review.note.nonceAdvances": "共 {{count}} 次 nonce 推进",
    "review.note.moreInDetails": "还有 {{count}} 笔，见详情",
    "review.note.moreInstructionsInDetails": "还有 {{count}} 条，见详情",
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
    "policyDowngrade.title": "关闭「签名前问我」",
    "policyDowngrade.confirm": "关闭确认",
    "policyDowngrade.standardWarning": "关闭后，Agent 用它签名时不再问你。这个确认只防误操作；要保护资金，请用保护档。",
    "policyDowngrade.protectedNotice": "保护档密钥每次签名仍要在浏览器里用 Passkey 批准。",
    "policyDowngrade.setting": "设置",
    "policyDowngrade.settingValue": "签名前问我：开 → 关",
    "policyDowngrade.key": "密钥",
    "policyDowngrade.tier": "档位",
    "policyDowngrade.standard": "标准档",
    "policyDowngrade.protected": "保护档",
    "policyDowngrade.account": "账户",
    "policyDowngrade.accountNamed": "#{{index}} {{name}}",
    "policyDowngrade.accountUnnamed": "#{{index}}（未命名）",
    "policyDowngrade.appliesTo": "适用于",
    "policyDowngrade.appliesToValue": "这个账户在 ETH、BTC、Solana 上的签名",
    "policyDowngrade.onlyPolicy": "这一步只改这个设置，不会签名，也不会动密钥。",
    "policyDowngrade.details": "请求信息",
    "policyDowngrade.serverFacts": "服务器断言的目标信息",
    "policyDowngrade.eth": "EVM 地址",
    "policyDowngrade.btcLegacy": "Bitcoin Legacy 地址",
    "policyDowngrade.btcSegwit": "Bitcoin SegWit 地址",
    "policyDowngrade.btcTaproot": "Bitcoin Taproot 地址",
    "policyDowngrade.solana": "Solana 地址",
    "policyDowngrade.recordId": "记录 ID",
    "policyDowngrade.identity": "身份摘要",
    "policyDowngrade.revision": "记录修订号",
    "policyDowngrade.expires": "授权过期时间",
    "policyDowngrade.challengeId": "挑战 ID",
    "policyDowngrade.notUsed": "此签名者未使用",
    "context.session": "会话",
    "context.command": "命令",
    "context.egress": "外联",
    "context.source": "来源",
    "context.sourceEnv": "环境变量",
    "context.signReturns": "返回内容",
    "context.sourceRequestedName": "请求名称",
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
let ps = "en";
function a2(e) {
  return e === "zh" ? "zh" : "en";
}
function c2(e) {
  const t = a2(e);
  return t === ps ? !1 : (ps = t, !0);
}
function l2() {
  return ps;
}
function d2(e) {
  return typeof e == "string" && Object.hasOwn(cc.en, e);
}
function G(e, t = {}) {
  const n = cc[ps], r = cc.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function u2(e) {
  return JSON.stringify(e ?? {});
}
function gu(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function le(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = u2(n), e.textContent = G(t, n);
}
function Ie(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function f2(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = G(n, gu(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = G(n, gu(t.dataset.i18nPlaceholderParams)));
  });
}
function by(e) {
  return {
    title: "policyDowngrade.title",
    subtitle: { text: e.target.name },
    confirmLabel: "policyDowngrade.confirm",
    policyDowngrade: e
  };
}
function St(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
function Ve(e, t, n = "mono") {
  const r = St("div", "review-field"), i = St("span", "review-label");
  le(i, e);
  const o = St("div", "review-value"), s = St("span", n === "word" ? "review-word" : "review-mono");
  return typeof t == "string" ? Ie(s, t) : le(s, t.key, t.params), o.append(s), r.append(i, o), r;
}
function po(e, t) {
  const n = St("p", t);
  return le(n, e), n;
}
function h2(e, t) {
  Ie(e, "");
  const { target: n } = t, r = St("div", "review policy-downgrade-review");
  r.append(n.protection === "standard" ? po("policyDowngrade.standardWarning", "review-warning") : po("policyDowngrade.protectedNotice", "review-info"));
  const i = St("div", "review-summary");
  i.append(
    Ve("policyDowngrade.setting", { key: "policyDowngrade.settingValue" }, "word"),
    Ve("policyDowngrade.key", n.name),
    Ve("policyDowngrade.tier", { key: n.protection === "standard" ? "policyDowngrade.standard" : "policyDowngrade.protected" }, "word")
  ), n.account !== null && i.append(
    Ve("policyDowngrade.account", n.accountName !== null ? { key: "policyDowngrade.accountNamed", params: { index: n.account, name: n.accountName } } : { key: "policyDowngrade.accountUnnamed", params: { index: n.account } }, "word"),
    Ve("policyDowngrade.appliesTo", { key: "policyDowngrade.appliesToValue" }, "word")
  ), r.append(i, po("policyDowngrade.onlyPolicy", "confirmation-note"));
  const o = St("details", "review-details"), s = St("summary", "review-details-toggle");
  le(s, "policyDowngrade.details");
  const a = St("div", "review-details-body"), c = [
    ["eth", "policyDowngrade.eth"],
    ["btc_legacy", "policyDowngrade.btcLegacy"],
    ["btc_segwit", "policyDowngrade.btcSegwit"],
    ["btc_taproot", "policyDowngrade.btcTaproot"],
    ["solana", "policyDowngrade.solana"]
  ];
  a.append(po("policyDowngrade.serverFacts", "confirmation-note"));
  for (const [l, u] of c) {
    const d = n.addresses[l];
    d !== null ? a.append(Ve(u, d)) : n.signerKind === "hd-seed" && a.append(Ve(u, { key: "policyDowngrade.notUsed" }));
  }
  a.append(
    Ve("policyDowngrade.recordId", n.secretId),
    Ve("policyDowngrade.identity", n.identitySha256),
    Ve("policyDowngrade.revision", t.change.revision),
    Ve("policyDowngrade.expires", t.expiresAt),
    Ve("policyDowngrade.challengeId", t.challengeId)
  ), o.append(s, a), r.append(o), e.append(r);
}
const vy = {
  sol: { symbol: "SOL", baseUnit: "lamports", decimals: 9 },
  eth: { symbol: "ETH", baseUnit: "wei", decimals: 18 },
  btc: { symbol: "BTC", baseUnit: "sats", decimals: 8 }
}, Sl = /^(?:0|[1-9][0-9]*)$/;
function xy(e, t) {
  if (t === 0) return e;
  const n = e.padStart(t + 1, "0"), r = n.slice(-t).replace(/0+$/, "");
  return `${n.slice(0, -t)}${r ? `.${r}` : ""}`;
}
function mu(e, t, n) {
  const { symbol: r, baseUnit: i, decimals: o } = vy[t];
  if (!Sl.test(e) || n === "base") return `${e} ${i}`;
  const s = `${xy(e, o)} ${r}`;
  return n === "symbol" ? s : `${s} (${e} ${i})`;
}
const p2 = 253402300799n;
function y2(e) {
  if (!Sl.test(e) || e.length > 12 || BigInt(e) > p2) return null;
  const t = new Date(Number(e) * 1e3).toISOString(), n = t.slice(17, 19);
  return `${t.slice(0, 10)} ${t.slice(11, 16)}${n === "00" ? "" : `:${n}`} UTC`;
}
const ys = 8, ws = 6, bu = 28;
function vu(e, t) {
  if (!t || e.length <= ys + ws + 2) {
    const r = te("span", "review-mono");
    return Ie(r, e), r;
  }
  const n = te("button", "review-mono review-elided");
  return n.type = "button", n.setAttribute("aria-expanded", "false"), n.title = e, Ie(n, `${e.slice(0, ys)}…${e.slice(-ws)}`), n.addEventListener("click", () => {
    n.getAttribute("aria-expanded") !== "true" && (n.setAttribute("aria-expanded", "true"), Ie(n, e));
  }), n;
}
function te(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
const w2 = "http://www.w3.org/2000/svg";
function yo(e, t) {
  const n = document.createElementNS(w2, e);
  for (const [r, i] of Object.entries(t)) n.setAttribute(r, i);
  return n;
}
function xu() {
  const e = yo("svg", {
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
    yo("path", { d: "M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }),
    yo("path", { d: "M12 9v4.5" }),
    yo("path", { d: "M12 17h.01" })
  ), e;
}
function g2(e) {
  if (!e.notes?.length) return null;
  const t = te("span", "review-notes");
  for (const n of e.notes) {
    const r = te("span", "review-note");
    typeof n == "string" ? le(r, n) : le(r, n.key, { count: n.count }), t.append(r);
  }
  return t;
}
function xa(e, t = "review-label") {
  const n = te(e.heading ? "p" : "span", t), r = {
    ...e.index === void 0 ? {} : { index: e.index },
    ...e.name === void 0 ? {} : { name: e.name }
  };
  return le(n, e.label, Object.keys(r).length > 0 ? r : void 0), n;
}
function m2(e, t) {
  const n = te("button", "review-copy");
  return n.type = "button", le(n, "review.copy"), n.addEventListener("click", () => {
    const r = () => {
      window.getSelection()?.selectAllChildren(e), le(n, "review.copySelected");
    };
    let i;
    try {
      i = navigator.clipboard.writeText(t);
    } catch {
      r();
      return;
    }
    i.then(() => le(n, "review.copied"), r);
  }), n;
}
function wo(e, t = !1) {
  if (e.heading) return xa(e, "review-subheading");
  const n = te("div", e.raw ? "review-field review-field-raw" : "review-field"), r = g2(e);
  if (e.raw) {
    const c = te("div", "review-raw-head"), l = te("pre", "review-raw");
    return Ie(l, e.value), c.append(xa(e)), r && c.append(r), c.append(m2(l, e.value)), n.append(c, l), n;
  }
  const i = te("div", "review-value"), o = e.decimals !== void 0 && Sl.test(e.value) ? xy(e.value, e.decimals) : null, s = e.time ? y2(e.value) : null, a = t && e.shownAs ? 0 : e.native ? mu(e.value, e.native, e.unit).length : o !== null || e.time ? bu + 1 : t && e.elide && e.value.length > ys + ws + 2 ? ys + ws + 1 : e.value.length;
  if (t && e.to === void 0 && a + (e.secondary?.length ?? 0) <= bu && n.classList.add("review-field-inline"), t && e.shownAs) {
    const c = te("span", "review-word");
    le(c, e.shownAs), i.append(c);
  } else if (e.native) {
    const c = te("span", "review-mono");
    Ie(c, mu(e.value, e.native, e.unit)), i.append(c);
  } else if (o !== null) {
    const c = te("span", "review-mono");
    Ie(c, o);
    const l = te("span", "review-exact");
    le(l, "review.amount.baseUnitsDecimals", { value: e.value, count: e.decimals }), i.append(c, l);
  } else if (e.time) {
    const c = te("span", "review-mono");
    Ie(c, s ?? e.value);
    const l = te("span", "review-exact");
    s === null ? le(l, "review.time.noDate") : le(l, "review.time.raw", { value: e.value }), i.append(c, l);
  } else
    i.append(vu(e.value, t && e.elide === !0));
  if (e.secondary !== void 0) {
    const c = te("span", "review-mono review-secondary");
    Ie(c, e.secondary), i.append(c);
  }
  if (e.to !== void 0) {
    const c = te("span", "review-arrow");
    Ie(c, "→"), i.append(c, vu(e.to, t));
  }
  return r && i.append(r), n.append(xa(e), i), n;
}
function ku(e, t, n) {
  const r = te("section", "review-group"), i = te("h2", "review-group-title");
  return le(i, e, t === void 0 ? void 0 : { index: t }), r.append(i, ...n), r;
}
function b2(e, t, n = {}) {
  Ie(e, "");
  const r = te("div", "review"), i = te("div", "review-heading"), o = te("p", "review-kind");
  if (le(o, t.kind), i.append(o), n.session) {
    const u = te("p", "review-session"), d = te("span", "review-session-label");
    le(d, "context.session");
    const f = te("span", "review-session-value");
    Ie(f, n.session), u.append(d, f), i.append(u);
  }
  r.append(i);
  for (const u of t.warnings ?? []) {
    const d = te("p", "review-warning"), f = te("span", "review-warning-text");
    le(f, u), d.append(xu(), f), r.append(d);
  }
  if (t.undecoded) {
    const u = te("p", "review-notice"), d = te("span", "review-notice-text");
    le(d, "sign.blindNotice"), u.append(xu(), d), r.append(u);
  }
  const s = te("div", "review-summary");
  s.append(...t.summary.map((u) => wo(u, !0)), wo(t.signer, !0)), r.append(s);
  const a = te("details", "review-details"), c = te("summary", "review-details-toggle");
  le(c, "review.details");
  const l = te("div", "review-details-body");
  t.details.forEach((u, d) => {
    const f = u.fields.map((h) => wo(h));
    l.append(ku(u.title, u.index, d === 0 ? [wo(t.signer), ...f] : f));
  }), n.rows && l.append(ku("review.group.request", void 0, [n.rows])), a.append(c, l), r.append(a), e.append(r);
}
function ve(e) {
  throw new Error(`signing review is malformed: ${e}`);
}
function gs(e, t, n) {
  (typeof e != "object" || e === null || Array.isArray(e)) && ve(`${n} must be an object`);
  const r = e;
  for (const i of Object.keys(r)) t.includes(i) || ve(`${n}.${i} is not a review field`);
  return r;
}
function qn(e, t, n) {
  return (!d2(e) || !e.startsWith(`${t}.`)) && ve(`${n} must be a ${t} translation key`), e;
}
function lc(e, t) {
  if (e !== void 0)
    return (typeof e != "number" || !Number.isSafeInteger(e) || e < 0) && ve(`${t} must be a non-negative integer`), e;
}
function ci(e, t) {
  return Array.isArray(e) || ve(`${t} must be a list`), e;
}
const v2 = 4096, x2 = /^[A-Za-z_][A-Za-z0-9_]{0,63} \([a-z][a-z0-9[\]]{0,31}\)$/;
function ka(e, t) {
  const n = gs(e, ["label", "index", "name", "value", "native", "unit", "decimals", "time", "to", "secondary", "elide", "shownAs", "notes", "raw", "heading"], t), r = lc(n.index, `${t}.index`);
  n.name !== void 0 && (typeof n.name != "string" || (n.label === "review.field.typedField" ? n.name.length > v2 : !x2.test(n.name))) && ve(`${t}.name is not a valid field name`), typeof n.value != "string" && ve(`${t}.value must be a string`), n.native !== void 0 && !Object.hasOwn(vy, n.native) && ve(`${t}.native is not a native currency`), n.unit !== void 0 && (n.native === void 0 || n.unit !== "symbol" && n.unit !== "base") && ve(`${t}.unit is not a unit of its currency`), n.decimals !== void 0 && (typeof n.decimals != "number" || !Number.isInteger(n.decimals) || n.decimals < 0 || n.decimals > 255 || n.native !== void 0) && ve(`${t}.decimals must be an encoded decimal count`), n.time !== void 0 && (n.time !== "unix-seconds" || n.native !== void 0 || n.decimals !== void 0) && ve(`${t}.time is not a time form`), n.to !== void 0 && typeof n.to != "string" && ve(`${t}.to must be a string`), n.secondary !== void 0 && typeof n.secondary != "string" && ve(`${t}.secondary must be a string`), n.elide !== void 0 && typeof n.elide != "boolean" && ve(`${t}.elide must be a boolean`);
  const i = n.shownAs === void 0 ? void 0 : qn(n.shownAs, "review.value", `${t}.shownAs`);
  n.raw !== void 0 && typeof n.raw != "boolean" && ve(`${t}.raw must be a boolean`), n.heading !== void 0 && typeof n.heading != "boolean" && ve(`${t}.heading must be a boolean`), n.heading && (n.value !== "" || n.native !== void 0 || n.decimals !== void 0 || n.time !== void 0 || n.notes !== void 0 || n.raw !== void 0 || n.to !== void 0 || n.secondary !== void 0 || n.elide !== void 0 || i !== void 0) && ve(`${t} is a heading and cannot carry a value`);
  const o = n.notes === void 0 ? void 0 : ci(n.notes, `${t}.notes`).map((s, a) => {
    const c = `${t}.notes[${a}]`;
    if (typeof s == "string") return qn(s, "review.note", c);
    const l = gs(s, ["key", "count"], c), u = lc(l.count, `${c}.count`);
    return u === void 0 && ve(`${c}.count is required`), { key: qn(l.key, "review.note", `${c}.key`), count: u };
  });
  return {
    label: qn(n.label, "review.field", `${t}.label`),
    ...r === void 0 ? {} : { index: r },
    ...n.name === void 0 ? {} : { name: n.name },
    value: n.value,
    ...n.native === void 0 ? {} : { native: n.native },
    ...n.unit === void 0 ? {} : { unit: n.unit },
    ...n.decimals === void 0 ? {} : { decimals: n.decimals },
    ...n.time === void 0 ? {} : { time: "unix-seconds" },
    ...n.to === void 0 ? {} : { to: n.to },
    ...n.secondary === void 0 ? {} : { secondary: n.secondary },
    ...n.elide === void 0 ? {} : { elide: n.elide },
    ...i === void 0 ? {} : { shownAs: i },
    ...o === void 0 ? {} : { notes: o },
    ...n.raw === void 0 ? {} : { raw: n.raw },
    ...n.heading === void 0 ? {} : { heading: n.heading }
  };
}
function ky(e) {
  const t = gs(e, ["kind", "signer", "summary", "undecoded", "warnings", "details"], "review");
  typeof t.undecoded != "boolean" && ve("review.undecoded must be a boolean");
  const n = t.warnings === void 0 ? void 0 : ci(t.warnings, "review.warnings").map((r, i) => qn(r, "review.warning", `review.warnings[${i}]`));
  return {
    kind: qn(t.kind, "review.kind", "review.kind"),
    signer: ka(t.signer, "review.signer"),
    summary: ci(t.summary, "review.summary").map((r, i) => ka(r, `review.summary[${i}]`)),
    undecoded: t.undecoded,
    ...n === void 0 ? {} : { warnings: n },
    details: ci(t.details, "review.details").map((r, i) => {
      const o = `review.details[${i}]`, s = gs(r, ["title", "index", "fields"], o), a = lc(s.index, `${o}.index`);
      return {
        title: qn(s.title, "review.group", `${o}.title`),
        ...a === void 0 ? {} : { index: a },
        fields: ci(s.fields, `${o}.fields`).map((c, l) => ka(c, `${o}.fields[${l}]`))
      };
    })
  };
}
let _l = null, Il = 0;
function k2(e) {
  _l = e;
}
function Ey() {
  return Date.now() < Il;
}
function E2() {
  Il = Date.now() + 150, _l?.("ui.show");
}
function A2() {
  Il = 0, _l?.("ui.hide");
}
function S2() {
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
function Ay(e) {
  e.querySelectorAll(".dynamic").forEach((t) => t.remove());
}
function we(e) {
  return { text: e };
}
function _n(e, t) {
  return { key: e, params: t };
}
function Z(e, t) {
  if (typeof t == "string") {
    le(e, t);
    return;
  }
  if ("text" in t) {
    Ie(e, t.text);
    return;
  }
  le(e, t.key, t.params);
}
function Vs(e, t, n) {
  const r = S2();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), E2(), r.card.classList.remove("confirm-card"), Z(r.title, e), Z(r.subtitle, t), n ? Z(r.body, n) : Ie(r.body, ""), Ay(r.card), r;
}
function qs() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), Ay(e)), A2();
}
function re(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function Eu(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function _2(e) {
  const t = document.createElement("div");
  if (t.className = "detail-value", e.variant === "chips") {
    t.classList.add("detail-chips");
    for (const r of e.values) {
      const i = document.createElement("span");
      i.className = `detail-chip${e.tone === "warning" ? " detail-chip-warning" : ""}`, Z(i, r), t.append(i);
    }
    return t;
  }
  const n = document.createElement(e.variant === "command" ? "code" : "span");
  return n.className = e.variant === "command" ? "detail-command" : e.variant === "mono" ? "detail-mono" : "detail-text", Z(n, e.value), e.variant === "mono" && (n.title = n.textContent ?? ""), t.append(n), t;
}
function Sy(e) {
  const t = document.createElement("div");
  t.className = "confirmation-details";
  for (const n of e.rows) {
    const r = document.createElement("div");
    r.className = "detail-row";
    const i = document.createElement("span");
    i.className = "detail-label", Z(i, n.label), r.append(i, _2(n)), t.append(r);
  }
  return t;
}
function I2(e, t, n) {
  if (Ie(e, ""), e.append(Sy(t)), n) {
    const r = document.createElement("p");
    r.className = "confirmation-note", Z(r, n), e.append(r);
  }
}
function Le(e) {
  const t = document.createElement("button");
  return t.type = "button", t.className = "action dynamic", Z(t, e), t;
}
function Ar(e = we("")) {
  const t = document.createElement("p");
  return t.className = "setup-status dynamic", Z(t, e), t;
}
let go = null;
function Bl() {
  return new Error("operation-superseded");
}
function gi(e) {
  const t = e.reason;
  return t instanceof Error ? t : Bl();
}
function Au(e) {
  if (e?.aborted) throw gi(e);
}
function or(e) {
  go?.abort(Bl());
  const t = new AbortController();
  return go = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    go === t && (go = null);
  });
}
async function B2(e) {
  return or(async (t) => {
    Au(t), Au(e.abortSignal);
    const n = new TextDecoder().decode(e.plaintext), r = Vs("plaintext.title", we(e.name), "plaintext.body"), i = document.createElement("pre");
    i.className = "plaintext dynamic", i.textContent = n;
    const o = Le("common.done"), s = Le("plaintext.copy");
    s.classList.add("secondary");
    const a = Ar("plaintext.copyWarning");
    re(r.card, i), re(r.card, a), re(r.card, s), re(r.card, o);
    try {
      await new Promise((c, l) => {
        if (t.aborted) {
          l(gi(t));
          return;
        }
        if (e.abortSignal?.aborted) {
          l(gi(e.abortSignal));
          return;
        }
        let u = !1, d = () => {
        }, f = null, h = null, y = !e.prepareCopy;
        const w = () => {
          f?.abort(Bl());
        }, p = (P) => {
          u || (u = !0, d(), w(), P());
        }, m = (P) => {
          p(() => l(gi(P)));
        }, S = () => m(t), E = () => {
          e.abortSignal && m(e.abortSignal);
        };
        d = () => {
          t.removeEventListener("abort", S), e.abortSignal?.removeEventListener("abort", E);
        }, t.addEventListener("abort", S, { once: !0 }), e.abortSignal?.addEventListener("abort", E, { once: !0 }), s.addEventListener("click", () => {
          if (h) return;
          if (t.aborted) {
            m(t);
            return;
          }
          if (e.abortSignal?.aborted) {
            m(e.abortSignal);
            return;
          }
          s.disabled = !0;
          const P = new AbortController();
          f = P;
          const I = () => {
            try {
              return Promise.resolve(e.onCopy ? e.onCopy(n, P.signal) : navigator.clipboard.writeText(n));
            } catch (U) {
              return Promise.reject(U);
            }
          }, R = e.prepareCopy && !y ? Promise.resolve(e.prepareCopy(P.signal)).then(() => {
            P.signal.aborted || t.aborted || e.abortSignal?.aborted || (y = !0, Z(a, "plaintext.copyReady"), s.disabled = !1);
          }) : I().then(() => {
            P.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (y = !1), Z(a, "plaintext.copiedBody"), s.disabled = !1);
          });
          h = R, R.then(
            () => {
              P.signal.aborted;
            },
            (U) => {
              if (!(P.signal.aborted || u)) {
                if (t.aborted) {
                  m(t);
                  return;
                }
                if (e.abortSignal?.aborted) {
                  m(e.abortSignal);
                  return;
                }
                s.disabled = !1, Z(a, "plaintext.copyFailed");
              }
            }
          ).finally(() => {
            f === P && (f = null), h === R && (h = null);
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
      qs();
    }
  });
}
function _i(e, t, n, r) {
  const i = Vs(e.title, e.subtitle, e.review ? void 0 : e.body);
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.policyDowngrade ? h2(i.body, e.policyDowngrade) : e.review ? b2(i.body, e.review, {
    session: e.reviewSession,
    rows: e.details && Sy(e.details)
  }) : e.details && I2(i.body, e.details, e.body);
  const o = Le(e.confirmLabel), s = Le("common.cancel");
  return s.classList.add("secondary"), Eu(i.card, s), Eu(i.card, o), o.disabled = !0, new Promise((a, c) => {
    let l = !1, u;
    const d = setTimeout(() => {
      try {
        u = n?.(i.card);
      } catch (w) {
        h(() => c(w));
        return;
      }
      (u?.ready ?? Promise.resolve()).then(
        () => {
          !l && !t.aborted && (o.disabled = !1);
        },
        (w) => h(() => c(w))
      );
    }, 500), f = () => {
      h(() => c(gi(t)));
    }, h = (y) => {
      l || (l = !0, clearTimeout(d), u?.dispose(), t.removeEventListener("abort", f), qs(), y());
    };
    if (t.aborted) {
      f();
      return;
    }
    t.addEventListener("abort", f, { once: !0 }), o.addEventListener("click", () => {
      if (o.disabled) return;
      o.disabled = !0, s.disabled = !0;
      let y;
      try {
        u?.assertCurrent(), y = r ? r() : Promise.resolve();
      } catch (w) {
        h(() => c(w));
        return;
      }
      y.then(
        () => h(a),
        (w) => h(() => c(w))
      );
    }), s.addEventListener(
      "click",
      () => {
        h(() => c(new Error("operation-cancelled")));
      },
      { once: !0 }
    );
  });
}
function ms(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function $2(e) {
  return new Promise((t, n) => {
    const r = () => n(ms(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function Su(e) {
  if (e?.aborted) throw ms(e);
}
async function _y(e) {
  const t = El(e.wrapMeta), n = Ns(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      js(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), ms(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? ms(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [$2(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await Iy({
      wrapMeta: t.wrapMeta,
      currentRpId: e.currentRpId,
      assertion: i,
      ...e.abortSignal ? { abortSignal: e.abortSignal } : {},
      ...e.policy ? { policy: e.policy } : {},
      ...e.onCommitted ? { onCommitted: e.onCommitted } : {}
    });
  } finally {
    r?.fill(0);
  }
}
async function Iy(e) {
  const t = El(e.wrapMeta);
  let n;
  try {
    Su(e.abortSignal), n = await Kp(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), Su(e.abortSignal);
    const r = dy({
      vmk: n,
      wrapMeta: t.wrapMeta,
      freshSetup: !1,
      scopeId: t.scopeId,
      ...e.policy ? { policy: e.policy } : {},
      ...e.onCommitted ? { onCommitted: e.onCommitted } : {}
    });
    return n = void 0, { state: r.state, rpId: e.currentRpId, expiresAt: r.expiresAt };
  } finally {
    e.assertion.prfOutput.fill(0), n?.fill(0);
  }
}
function T2(e) {
  if (typeof e != "object" || e === null)
    throw new A("invalid_payload", "request payload must be an object");
  return e;
}
function P2(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new A("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function _u(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new A("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function O2(e) {
  const t = T2(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new A("invalid_payload", "kind must be static or keypair");
  const r = _u(t.name, "name");
  if (t.rootMetadata !== void 0) throw new A("invalid_payload", "seal cannot set vault root metadata");
  const i = P2(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.curve !== void 0) throw new A("invalid_payload", "static seal cannot carry a curve");
    if (t.inputMode !== "parent-value")
      throw new A("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: _u(t.value, "value"),
      wrapMeta: i
    };
  }
  if (t.inputMode !== void 0)
    throw new A("invalid_payload", "keypair seal is generate-only and does not accept inputMode");
  if (t.value !== void 0)
    throw new A("invalid_payload", "keypair seal cannot accept parent-provided private key material");
  let o;
  try {
    o = jr(t.curve);
  } catch {
    throw new A("invalid_payload", "unsupported signing curve");
  }
  return {
    name: r,
    kind: "keypair",
    ...t.curve !== void 0 ? { curve: o } : {},
    wrapMeta: i
  };
}
function Vr(e) {
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
const R2 = 512, By = "avibe-vault-signed-context-replay:v2", C2 = "avibe-vault-signed-context-replay:v2", L2 = "avibe-vault-signed-context-replay:v2", at = /* @__PURE__ */ new Map();
let Iu = !1, li = null;
function et(e) {
  return typeof e == "object" && e !== null;
}
function Ft(e, t) {
  if (typeof e != "string" || e.length === 0) throw new A("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Jr(e, t) {
  if (e !== void 0) {
    if (typeof e != "string") throw new A("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function Ea(e, t) {
  if (e !== void 0) {
    if (!Array.isArray(e) || !e.every((n) => typeof n == "string"))
      throw new A("invalid_payload", `${t} must be a string array`);
    return e;
  }
}
function H2(e, t) {
  if (e !== "static" && e !== "keypair") throw new A("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function U2(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new A("invalid_payload", "context purpose is invalid");
  return e;
}
function dc(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new A("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function N2(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new A("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function $l(e, t) {
  if (!et(e)) throw new A(t, "agent delivery context.release must be an object");
  return {
    name: Ft(e.name, "context.release.name"),
    ttlSecs: dc(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: N2(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: dc(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: Ft(e.operationHash, "context.release.operationHash")
  };
}
function ue(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(ue).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${ue(t[n])}`).join(",")}}`;
}
function Tl(e) {
  const t = et(e) ? e : null;
  if (!t) throw new A("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new A("invalid_payload", "context version must be 2");
  const n = U2(t.purpose);
  Ft(t.requestId, "context.requestId"), t.grantId !== void 0 && Jr(t.grantId, "context.grantId");
  const r = et(t.display) ? t.display : null;
  if (!r) throw new A("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new A("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, l) => {
    if (!et(c)) throw new A("invalid_payload", `context.display.secrets[${l}] must be an object`);
    Ft(c.name, `context.display.secrets[${l}].name`), H2(c.kind, `context.display.secrets[${l}].kind`);
  }), r.sessionLabel !== void 0 && Jr(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && Jr(r.command, "context.display.command"), r.egress !== void 0 && Jr(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!et(i)) throw new A("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && Ea(i.env, "context.display.source.env"), i.tags !== void 0 && Ea(i.tags, "context.display.source.tags"), i.skills !== void 0 && Ea(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && dc(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = et(t.signature) ? t.signature : null;
  if (!o) throw new A("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new A("invalid_payload", "context signature alg must be ed25519");
  Ft(o.keyId, "context.signature.keyId"), Ft(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!et(s)) throw new A("invalid_payload", "context.agent must be an object");
    const c = et(s.publicKey) ? s.publicKey : null;
    if (!c) throw new A("invalid_payload", "context.agent.publicKey must be an object");
    Ft(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && Jr(c.fingerprint, "context.agent.publicKey.fingerprint"), Ft(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = $l(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new A("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new A("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !et(a))
    throw new A("invalid_payload", "context.release must be an object");
  return Ft(t.expiresAt, "context.expiresAt"), t;
}
function Gs(e) {
  const { signature: t, ...n } = e;
  return ue(n);
}
function bs(e) {
  if (e.context.purpose !== e.expectedPurpose)
    throw new A("invalid_context", `${e.expectedPurpose} context has the wrong purpose`);
  if (!e.context.display.secrets.some(
    (n) => n.name === e.secret.name && n.kind === e.secret.kind
  )) {
    const n = e.secret.kind === "keypair" ? "key" : "secret";
    throw new A("invalid_context", `${e.expectedPurpose} context does not cover the requested ${n}`);
  }
}
function Gn(e) {
  if (e.expectedPurpose && e.context.purpose !== e.expectedPurpose)
    throw new A("invalid_context", "signed context purpose does not match operation");
  const t = e.now ?? Date.now(), n = Date.parse(e.context.expiresAt);
  if (!Number.isFinite(n) || n <= t)
    throw new A("context_expired", "signed context is expired", !0);
  if (!kx({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: Gs(e.context)
  })) throw new A("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && $l(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new A("context_expired", "signed release approval is expired", !0);
}
function Pl(e) {
  for (const [t, n] of at)
    n <= e && at.delete(t);
}
function D2() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function Dr() {
  return typeof window < "u";
}
function Ol() {
  return new A("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function $y(e) {
  const t = D2();
  if (!t && e && Dr()) throw Ol();
  return t;
}
function Ty(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!et(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function Rl(e = Date.now(), t = !1) {
  Pl(e);
  const n = $y(t);
  if (n)
    try {
      n.setItem(By, JSON.stringify({ version: 2, entries: [...at] }));
    } catch {
      if (t && Dr()) throw Ol();
    }
}
function Py(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && at.set(r, Math.max(at.get(r) ?? 0, i));
  n && Rl(t);
}
function Cl() {
  if (!(li || typeof BroadcastChannel > "u"))
    try {
      li = new BroadcastChannel(C2), li.addEventListener("message", (e) => {
        const t = et(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || Py(Ty({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      li = null;
    }
}
function z2(e = Date.now()) {
  Iu || (Cl(), Oy(e, Dr()), Iu = !0);
}
function Oy(e = Date.now(), t = !1) {
  Cl();
  const n = $y(t);
  if (n)
    try {
      Py(Ty(JSON.parse(n.getItem(By) ?? "null"), e), e, !1), Pl(e);
    } catch {
      if (t && Dr()) throw Ol();
      Rl(e);
    }
}
function M2(e) {
  Cl();
  try {
    li?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function K2() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function F2(e) {
  const t = K2();
  if (t) return await t.request(L2, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new A("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function Ry(e, t) {
  z2(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new A("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  Pl(t);
  for (const r of n.keys())
    if (at.has(r))
      throw new A("context_replayed", "signed context requestId was already used", !0);
  if (at.size + n.size > R2)
    throw new A("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function Ii(e, t = Date.now()) {
  Ry(e, t);
}
async function Bi(e, t = Date.now()) {
  const n = [...e];
  await F2(() => {
    Oy(t, Dr());
    const r = Ry(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, at.get(o));
    for (const [o, s] of r) at.set(o, s);
    try {
      Rl(t, Dr());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? at.delete(s) : at.set(s, a);
      throw o;
    }
    M2([...r]);
  });
}
async function j2(e, t) {
  if (e.purpose !== "agent-deliver") throw new A("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new A("invalid_context", "agent delivery context is missing grantId");
  const n = $l(e.release, "invalid_context");
  if (n.name !== t) throw new A("invalid_context", "signed release name does not match release item");
  if (e.display.grantTtlSeconds === void 0 || e.display.grantTtlSeconds !== n.ttlSecs)
    throw new A("invalid_context", "signed release TTL does not match display TTL");
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
function V2(e) {
  if (!e.agent) throw new A("invalid_context", "agent delivery context is missing agent key");
  if (e.agent.publicKey.fingerprint && e.agent.publicKey.fingerprint !== e.agent.fingerprint)
    throw new A("invalid_context", "agent public key fingerprint mismatch");
  return { ...e.agent.publicKey, fingerprint: e.agent.fingerprint };
}
async function q2(e) {
  const t = e.map((n) => Gs(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ue(t))));
}
function Bu(e) {
  return ue(e.display);
}
const G2 = "1.2.3";
let Je = class uc extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof uc ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof uc && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${G2}`
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
function Jt(e, t) {
  return e.exec(t)?.groups;
}
const Cy = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Ly = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, Hy = /^\(.+?\).*?$/, $u = /^tuple(?<array>(\[(\d*)\])*)$/;
function fc(e) {
  let t = e.type;
  if ($u.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += fc(o), i < n - 1 && (t += ", ");
    }
    const r = Jt($u, e.type);
    return t += `)${r?.array || ""}`, fc({
      ...e,
      type: t
    });
  }
  return "indexed" in e && e.indexed && (t = `${t} indexed`), e.name ? `${t} ${e.name}` : t;
}
function Qr(e) {
  let t = "";
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r];
    t += fc(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function W2(e) {
  return e.type === "function" ? `function ${e.name}(${Qr(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${Qr(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${Qr(e.inputs)})` : e.type === "error" ? `error ${e.name}(${Qr(e.inputs)})` : e.type === "constructor" ? `constructor(${Qr(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const Uy = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function Z2(e) {
  return Uy.test(e);
}
function Y2(e) {
  return Jt(Uy, e);
}
const Ny = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function X2(e) {
  return Ny.test(e);
}
function J2(e) {
  return Jt(Ny, e);
}
const Dy = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function Q2(e) {
  return Dy.test(e);
}
function ek(e) {
  return Jt(Dy, e);
}
const zy = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function My(e) {
  return zy.test(e);
}
function tk(e) {
  return Jt(zy, e);
}
const Ky = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function nk(e) {
  return Ky.test(e);
}
function rk(e) {
  return Jt(Ky, e);
}
const Fy = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function ik(e) {
  return Fy.test(e);
}
function ok(e) {
  return Jt(Fy, e);
}
const sk = /^receive\(\) external payable$/;
function ak(e) {
  return sk.test(e);
}
const ck = /* @__PURE__ */ new Set(["indexed"]), hc = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class lk extends Je {
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
class dk extends Je {
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
class uk extends Je {
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
class fk extends Je {
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
class hk extends Je {
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
class pk extends Je {
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
class yk extends Je {
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
class qr extends Je {
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
class wk extends Je {
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
class gk extends Je {
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
class mk extends Je {
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
class bk extends Je {
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
function vk(e, t, n) {
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
const Aa = /* @__PURE__ */ new Map([
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
function xk(e, t = {}) {
  if (Q2(e))
    return kk(e, t);
  if (X2(e))
    return Ek(e, t);
  if (Z2(e))
    return Ak(e, t);
  if (nk(e))
    return Sk(e, t);
  if (ik(e))
    return _k(e);
  if (ak(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new wk({ signature: e });
}
function kk(e, t = {}) {
  const n = ek(e);
  if (!n)
    throw new qr({ signature: e, type: "function" });
  const r = rt(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(nr(r[a], {
      modifiers: hc,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = rt(n.returns), c = a.length;
    for (let l = 0; l < c; l++)
      s.push(nr(a[l], {
        modifiers: hc,
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
function Ek(e, t = {}) {
  const n = J2(e);
  if (!n)
    throw new qr({ signature: e, type: "event" });
  const r = rt(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(nr(r[s], {
      modifiers: ck,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function Ak(e, t = {}) {
  const n = Y2(e);
  if (!n)
    throw new qr({ signature: e, type: "error" });
  const r = rt(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(nr(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function Sk(e, t = {}) {
  const n = rk(e);
  if (!n)
    throw new qr({ signature: e, type: "constructor" });
  const r = rt(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(nr(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function _k(e) {
  const t = ok(e);
  if (!t)
    throw new qr({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const Ik = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Bk = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, $k = /^u?int$/;
function nr(e, t) {
  const n = vk(e, t?.type, t?.structs);
  if (Aa.has(n))
    return Aa.get(n);
  const r = Hy.test(e), i = Jt(r ? Bk : Ik, e);
  if (!i)
    throw new uk({ param: e });
  if (i.name && Pk(i.name))
    throw new fk({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, l = {};
  if (r) {
    c = "tuple";
    const d = rt(i.type), f = [], h = d.length;
    for (let y = 0; y < h; y++)
      f.push(nr(d[y], { structs: a }));
    l = { components: f };
  } else if (i.type in a)
    c = "tuple", l = { components: a[i.type] };
  else if ($k.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !jy(c))
    throw new dk({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new hk({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (hc.has(i.modifier) && !Ok(c, !!i.array))
      throw new pk({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
  }
  const u = {
    type: `${c}${i.array ?? ""}`,
    ...o,
    ...s,
    ...l
  };
  return Aa.set(n, u), u;
}
function rt(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? rt(a, [...t, n.trim()]) : rt(a, t, `${n}${s}`, r);
      case "(":
        return rt(a, t, `${n}${s}`, r + 1);
      case ")":
        return rt(a, t, `${n}${s}`, r - 1);
      default:
        return rt(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new bk({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function jy(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || Cy.test(e) || Ly.test(e);
}
const Tk = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function Pk(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || Cy.test(e) || Ly.test(e) || Tk.test(e);
}
function Ok(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function Rk(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!My(a))
      continue;
    const c = tk(a);
    if (!c)
      throw new qr({ signature: a, type: "struct" });
    const l = c.properties.split(";"), u = [], d = l.length;
    for (let f = 0; f < d; f++) {
      const y = l[f].trim();
      if (!y)
        continue;
      const w = nr(y, {
        type: "struct"
      });
      u.push(w);
    }
    if (!u.length)
      throw new gk({ signature: a });
    t[c.name] = u;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = Vy(c, t);
  }
  return r;
}
const Ck = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function Vy(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (Hy.test(s.type))
      r.push(s);
    else {
      const c = Jt(Ck, s.type);
      if (!c?.type)
        throw new yk({ abiParameter: s });
      const { array: l, type: u } = c;
      if (u in t) {
        if (n.has(u))
          throw new mk({ type: u });
        r.push({
          ...s,
          type: `tuple${l ?? ""}`,
          components: Vy(t[u], t, /* @__PURE__ */ new Set([...n, u]))
        });
      } else if (jy(u))
        r.push(s);
      else
        throw new lk({ type: u });
    }
  }
  return r;
}
function Lk(e) {
  const t = Rk(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    My(o) || n.push(xk(o, t));
  }
  return n;
}
function qy(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => Hk(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function Hk(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${qy(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function zi(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function me(e) {
  return zi(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const Gy = "2.54.6";
let Sa = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${Gy}`
};
class X extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof X ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof X && n.cause.docsPath || n.docsPath, o = Sa.getDocsUrl?.({ ...n, docsPath: i }), s = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...o ? [`Docs: ${o}`] : [],
      ...r ? [`Details: ${r}`] : [],
      ...Sa.version ? [`Version: ${Sa.version}`] : []
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
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = Gy;
  }
  walk(t) {
    return Wy(this, t);
  }
}
function Wy(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? Wy(e.cause, t) : t ? null : e;
}
class Uk extends X {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${qy(n, { includeName: !0 })})`,
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
class Nk extends X {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class Dk extends X {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class zk extends X {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${me(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class Mk extends X {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class Kk extends X {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class Fk extends X {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class jk extends X {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class Vk extends X {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class Zy extends X {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class Yy extends X {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function Gr(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? In(e, { dir: t, size: n }) : qk(e, { dir: t, size: n });
}
function In(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new Yy({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function qk(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new Yy({
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
class Ll extends X {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class Gk extends X {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class Wk extends X {
  constructor({ givenSize: t, maxSize: n }) {
    super(`Size cannot exceed ${n} bytes. Given size: ${t} bytes.`, { name: "SizeOverflowError" });
  }
}
function $i(e, { dir: t = "left" } = {}) {
  let n = typeof e == "string" ? e.replace("0x", "") : e, r = 0;
  for (let i = 0; i < n.length - 1 && n[t === "left" ? i : n.length - i - 1].toString() === "0"; i++)
    r++;
  return n = t === "left" ? n.slice(r) : n.slice(0, n.length - r), typeof e == "string" ? (n.length === 1 && t === "right" && (n = `${n}0`), `0x${n.length % 2 === 1 ? `0${n}` : n}`) : n;
}
function Rt(e, { size: t }) {
  if (me(e) > t)
    throw new Wk({
      givenSize: me(e),
      maxSize: t
    });
}
function Xy(e, t = {}) {
  const { signed: n } = t;
  t.size && Rt(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function Hl(e, t = {}) {
  const n = Xy(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new Ll({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const Zk = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Ti(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? Y(e, t) : typeof e == "string" ? Qy(e, t) : typeof e == "boolean" ? Jy(e, t) : Ne(e, t);
}
function Jy(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (Rt(n, { size: t.size }), Gr(n, { size: t.size })) : n;
}
function Ne(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += Zk[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (Rt(r, { size: t.size }), Gr(r, { dir: "right", size: t.size })) : r;
}
function Y(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new Ll({
      max: o ? `${o}${c}` : void 0,
      min: `${s}${c}`,
      signed: n,
      size: r,
      value: `${e}${c}`
    });
  }
  const a = `0x${(n && i < 0 ? (1n << BigInt(r * 8)) + BigInt(i) : i).toString(16)}`;
  return r ? Gr(a, { size: r }) : a;
}
const Yk = /* @__PURE__ */ new TextEncoder();
function Qy(e, t = {}) {
  const n = Yk.encode(e);
  return Ne(n, t);
}
const Xk = /* @__PURE__ */ new TextEncoder();
function Ul(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? Qk(e, t) : typeof e == "boolean" ? Jk(e, t) : zi(e) ? Rn(e, t) : ew(e, t);
}
function Jk(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (Rt(n, { size: t.size }), Gr(n, { size: t.size })) : n;
}
const Mt = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function Tu(e) {
  if (e >= Mt.zero && e <= Mt.nine)
    return e - Mt.zero;
  if (e >= Mt.A && e <= Mt.F)
    return e - (Mt.A - 10);
  if (e >= Mt.a && e <= Mt.f)
    return e - (Mt.a - 10);
}
function Rn(e, t = {}) {
  let n = e;
  t.size && (Rt(n, { size: t.size }), n = Gr(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = Tu(r.charCodeAt(a++)), l = Tu(r.charCodeAt(a++));
    if (c === void 0 || l === void 0)
      throw new X(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + l;
  }
  return o;
}
function Qk(e, t) {
  const n = Y(e, t);
  return Rn(n);
}
function ew(e, t = {}) {
  const n = Xk.encode(e);
  return typeof t.size == "number" ? (Rt(n, { size: t.size }), Gr(n, { dir: "right", size: t.size })) : n;
}
const mo = /* @__PURE__ */ BigInt(2 ** 32 - 1), Pu = /* @__PURE__ */ BigInt(32);
function eE(e, t = !1) {
  return t ? { h: Number(e & mo), l: Number(e >> Pu & mo) } : { h: Number(e >> Pu & mo) | 0, l: Number(e & mo) | 0 };
}
function tE(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = eE(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const nE = (e, t, n) => e << n | t >>> 32 - n, rE = (e, t, n) => t << n | e >>> 32 - n, iE = (e, t, n) => t << n - 32 | e >>> 64 - n, oE = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function sE(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Ou(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Pi(e, ...t) {
  if (!sE(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function vs(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function tw(e, t) {
  Pi(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function aE(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Oi(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function _a(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function bt(e, t) {
  return e << 32 - t | e >>> t;
}
const cE = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function lE(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function dE(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = lE(e[t]);
  return e;
}
const Ru = cE ? (e) => e : dE;
function uE(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function Nl(e) {
  return typeof e == "string" && (e = uE(e)), Pi(e), e;
}
class nw {
}
function rw(e) {
  const t = (r) => e().update(Nl(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const fE = BigInt(0), ei = BigInt(1), hE = BigInt(2), pE = BigInt(7), yE = BigInt(256), wE = BigInt(113), iw = [], ow = [], sw = [];
for (let e = 0, t = ei, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], iw.push(2 * (5 * r + n)), ow.push((e + 1) * (e + 2) / 2 % 64);
  let i = fE;
  for (let o = 0; o < 7; o++)
    t = (t << ei ^ (t >> pE) * wE) % yE, t & hE && (i ^= ei << (ei << /* @__PURE__ */ BigInt(o)) - ei);
  sw.push(i);
}
const aw = tE(sw, !0), gE = aw[0], mE = aw[1], Cu = (e, t, n) => n > 32 ? iE(e, t, n) : nE(e, t, n), Lu = (e, t, n) => n > 32 ? oE(e, t, n) : rE(e, t, n);
function bE(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, l = n[c], u = n[c + 1], d = Cu(l, u, 1) ^ n[a], f = Lu(l, u, 1) ^ n[a + 1];
      for (let h = 0; h < 50; h += 10)
        e[s + h] ^= d, e[s + h + 1] ^= f;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = ow[s], c = Cu(i, o, a), l = Lu(i, o, a), u = iw[s];
      i = e[u], o = e[u + 1], e[u] = c, e[u + 1] = l;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= gE[r], e[1] ^= mE[r];
  }
  Oi(n);
}
class Dl extends nw {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, Ou(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = aE(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Ru(this.state32), bE(this.state32, this.rounds), Ru(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    vs(this), t = Nl(t), Pi(t);
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
    vs(this, !1), Pi(t), this.finish();
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
    return Ou(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (tw(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, Oi(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new Dl(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const vE = (e, t, n) => rw(() => new Dl(t, e, n)), xE = vE(1, 136, 256 / 8);
function _t(e, t) {
  const n = t || "hex", r = xE(zi(e, { strict: !1 }) ? Ul(e) : e);
  return n === "bytes" ? r : Ti(r);
}
const kE = (e) => _t(Ul(e));
function EE(e) {
  return kE(e);
}
function AE(e) {
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
    throw new X("Unable to normalize signature.");
  return i;
}
const SE = (e) => {
  const t = typeof e == "string" ? e : W2(e);
  return AE(t);
};
function _E(e) {
  return EE(SE(e));
}
class sr extends X {
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
class cw extends Map {
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
const Ia = /* @__PURE__ */ new cw(8192);
function lw(e, t) {
  if (Ia.has(`${e}.${t}`))
    return Ia.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = _t(ew(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return Ia.set(`${e}.${t}`, o), o;
}
const IE = /^0x[a-fA-F0-9]{40}$/, Ba = /* @__PURE__ */ new cw(8192);
function ar(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if (Ba.has(r))
    return Ba.get(r);
  const i = IE.test(e) ? e.toLowerCase() === e ? !0 : n ? lw(e) === e : !0 : !1;
  return Ba.set(r, i), i;
}
function BE(e) {
  return typeof e[0] == "string" ? ut(e) : $E(e);
}
function $E(e) {
  let t = 0;
  for (const i of e)
    t += i.length;
  const n = new Uint8Array(t);
  let r = 0;
  for (const i of e)
    n.set(i, r), r += i.length;
  return n;
}
function ut(e) {
  return `0x${e.reduce((t, n) => t + n.replace("0x", ""), "")}`;
}
function zl(e, t, n, { strict: r } = {}) {
  return zi(e, { strict: !1 }) ? hw(e, t, n, {
    strict: r
  }) : fw(e, t, n, {
    strict: r
  });
}
function dw(e, t) {
  if (typeof t == "number" && t > 0 && t > me(e) - 1)
    throw new Zy({
      offset: t,
      position: "start",
      size: me(e)
    });
}
function uw(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && me(e) !== n - t)
    throw new Zy({
      offset: n,
      position: "end",
      size: me(e)
    });
}
function fw(e, t, n, { strict: r } = {}) {
  dw(e, t);
  const i = e.slice(t, n);
  return r && uw(i, t, n), i;
}
function hw(e, t, n, { strict: r } = {}) {
  dw(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && uw(i, t, n), i;
}
const TE = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, pw = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function Ml(e, t) {
  if (e.length !== t.length)
    throw new Mk({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = PE({
    params: e,
    values: t
  });
  return Fl(n);
}
function PE({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(Kl({ param: e[r], value: t[r] }));
  return n;
}
function Kl({ param: e, value: t }) {
  const n = Ws(e.type);
  if (n) {
    const [r, i] = n;
    return RE(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return NE(t, {
      param: e
    });
  if (e.type === "address")
    return OE(t);
  if (e.type === "bool")
    return LE(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = pw.exec(e.type) ?? [];
    return HE(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return CE(t, { param: e });
  if (e.type === "string")
    return UE(t);
  throw new Fk(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function Fl(e) {
  let t = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? t += 32 : t += me(a);
  }
  const n = [], r = [];
  let i = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? (n.push(Y(t + i, { size: 32 })), r.push(a), i += me(a)) : n.push(a);
  }
  return ut([...n, ...r]);
}
function OE(e) {
  if (!ar(e))
    throw new sr({ address: e });
  return { dynamic: !1, encoded: In(e.toLowerCase()) };
}
function RE(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new Vk(e);
  if (!r && e.length !== t)
    throw new Dk({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && pc(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = Kl({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = Fl(o);
    if (r) {
      const a = Y(o.length, { size: 32 });
      return {
        dynamic: !0,
        encoded: ut([a, s])
      };
    }
    if (i)
      return { dynamic: !0, encoded: s };
  }
  return {
    dynamic: !1,
    encoded: ut(o.map(({ encoded: s }) => s))
  };
}
function CE(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = me(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = In(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: ut([
        In(Y(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new zk({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: In(e, { dir: "right" }) };
}
function LE(e) {
  if (typeof e != "boolean")
    throw new X(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: In(Jy(e)) };
}
function HE(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new Ll({
        max: r.toString(),
        min: i.toString(),
        signed: t,
        size: n / 8,
        value: e.toString()
      });
  }
  return {
    dynamic: !1,
    encoded: Y(e, {
      size: 32,
      signed: t
    })
  };
}
function UE(e) {
  const t = Qy(e), n = Math.ceil(me(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(In(zl(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: ut([
      In(Y(me(t), { size: 32 })),
      ...r
    ])
  };
}
function NE(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = Kl({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? Fl(r) : ut(r.map(({ encoded: i }) => i))
  };
}
function Ws(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function pc(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(pc);
  const n = Ws(t);
  return n ? pc({ ...e, type: n[1] }) : !1;
}
const DE = (e) => zl(_E(e), 0, 4);
class Hu extends X {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class zE extends X {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class ME extends X {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const KE = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new ME({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new zE({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new Hu({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new Hu({ offset: e });
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
function jl(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(KE);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function FE(e, t = {}) {
  typeof t.size < "u" && Rt(e, { size: t.size });
  const n = Ne(e, t);
  return Xy(n, t);
}
function jE(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (Rt(n, { size: t.size }), n = $i(n)), n.length > 1 || n[0] > 1)
    throw new Gk(n);
  return !!n[0];
}
function Zt(e, t = {}) {
  typeof t.size < "u" && Rt(e, { size: t.size });
  const n = Ne(e, t);
  return Hl(n, t);
}
function VE(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (Rt(n, { size: t.size }), n = $i(n, { dir: "right" })), new TextDecoder().decode(n);
}
function qE(e, t) {
  const n = typeof t == "string" ? Rn(t) : t, r = jl(n);
  if (me(n) === 0 && e.length > 0)
    throw new Nk();
  if (me(t) && me(t) < 32)
    throw new Uk({
      data: typeof t == "string" ? t : Ne(t),
      params: e,
      size: me(t)
    });
  let i = 0;
  const o = [];
  for (let s = 0; s < e.length; ++s) {
    const a = e[s];
    i < n.length && r.setPosition(i);
    const [c, l] = Tr(r, a, {
      staticPosition: 0
    });
    i += l, o.push(c);
  }
  return o;
}
function Tr(e, t, { staticPosition: n }) {
  const r = Ws(t.type);
  if (r) {
    const [i, o] = r;
    return WE(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return JE(e, t, { staticPosition: n });
  if (t.type === "address")
    return GE(e);
  if (t.type === "bool")
    return ZE(e);
  if (t.type.startsWith("bytes"))
    return YE(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return XE(e, t);
  if (t.type === "string")
    return QE(e, { staticPosition: n });
  throw new jk(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const Uu = 32, yc = 32;
function GE(e) {
  const t = e.readBytes(32);
  return [lw(Ne(fw(t, -20))), 32];
}
function WE(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = Zt(e.readBytes(yc)), a = r + s, c = a + Uu;
    e.setPosition(a);
    const l = Zt(e.readBytes(Uu)), u = Ri(t);
    let d = 0;
    const f = [];
    for (let h = 0; h < l; ++h) {
      e.setPosition(c + (u ? h * 32 : d));
      const [y, w] = Tr(e, t, {
        staticPosition: c
      });
      d += w, f.push(y), w === 0 && (e.assertReadLimit(), e._touch());
    }
    return e.setPosition(r + 32), [f, 32];
  }
  if (Ri(t)) {
    const s = Zt(e.readBytes(yc)), a = r + s, c = [];
    for (let l = 0; l < n; ++l) {
      e.setPosition(a + l * 32);
      const [u] = Tr(e, t, {
        staticPosition: a
      });
      c.push(u);
    }
    return e.setPosition(r + 32), [c, 32];
  }
  let i = 0;
  const o = [];
  for (let s = 0; s < n; ++s) {
    const [a, c] = Tr(e, t, {
      staticPosition: r + i
    });
    i += c, o.push(a), c === 0 && (e.assertReadLimit(), e._touch());
  }
  return [o, i];
}
function ZE(e) {
  return [jE(e.readBytes(32), { size: 32 }), 32];
}
function YE(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = Zt(e.readBytes(32));
    e.setPosition(n + s);
    const a = Zt(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [Ne(c), 32];
  }
  return [Ne(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function XE(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? FE(i, { signed: n }) : Zt(i, { signed: n }),
    32
  ];
}
function JE(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (Ri(t)) {
    const s = Zt(e.readBytes(yc)), a = n + s;
    for (let c = 0; c < t.components.length; ++c) {
      const l = t.components[c];
      e.setPosition(a + o);
      const [u, d] = Tr(e, l, {
        staticPosition: a
      });
      o += d, i[r ? c : l?.name] = u;
    }
    return e.setPosition(n + 32), [i, 32];
  }
  for (let s = 0; s < t.components.length; ++s) {
    const a = t.components[s], [c, l] = Tr(e, a, {
      staticPosition: n
    });
    i[r ? s : a?.name] = c, o += l;
  }
  return [i, o];
}
function QE(e, { staticPosition: t }) {
  const n = Zt(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = Zt(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = VE($i(o));
  return e.setPosition(t + 32), [s, 32];
}
function Ri(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components?.some(Ri);
  const n = Ws(e.type);
  return !!(n && Ri({ ...e, type: n[1] }));
}
const eA = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), tA = {
  ether: -9,
  wei: 9
};
function nA(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function wc(e, t = "wei") {
  return nA(e, tA[t]);
}
function rA(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class iA extends X {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        rA(t),
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
class oA extends X {
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
class sA extends X {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function zr(e, t = "hex") {
  const n = yw(e), r = jl(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? Ne(r.bytes) : r.bytes;
}
function yw(e) {
  return Array.isArray(e) ? aA(e.map((t) => yw(t))) : cA(e);
}
function aA(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = ww(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function cA(e) {
  const t = typeof e == "string" ? Rn(e) : e, n = ww(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function ww(e) {
  if (e < 2 ** 8)
    return 1;
  if (e < 2 ** 16)
    return 2;
  if (e < 2 ** 24)
    return 3;
  if (e < 2 ** 32)
    return 4;
  throw new X("Length is too large.");
}
class Zs extends X {
  constructor({ cause: t, maxFeePerGas: n } = {}) {
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${wc(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
      cause: t,
      name: "FeeCapTooHighError"
    });
  }
}
Object.defineProperty(Zs, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
class gw extends X {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${wc(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${wc(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(gw, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const Vl = 2n ** 256n - 1n;
function mw(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => Rn(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => Ne(o));
}
function bw(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => Rn(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => Rn(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => Ne(s));
}
function lA(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, l = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + l, a, r);
}
function dA(e, t, n) {
  return e & t ^ ~e & n;
}
function uA(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class fA extends nw {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = _a(this.buffer);
  }
  update(t) {
    vs(this), t = Nl(t), Pi(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = _a(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    vs(this), tw(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Oi(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    lA(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = _a(t), c = this.outputLen;
    if (c % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const l = c / 4, u = this.get();
    if (l > u.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let d = 0; d < l; d++)
      a.setUint32(4 * d, u[d], o);
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
const gn = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), hA = /* @__PURE__ */ Uint32Array.from([
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
]), mn = /* @__PURE__ */ new Uint32Array(64);
class pA extends fA {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = gn[0] | 0, this.B = gn[1] | 0, this.C = gn[2] | 0, this.D = gn[3] | 0, this.E = gn[4] | 0, this.F = gn[5] | 0, this.G = gn[6] | 0, this.H = gn[7] | 0;
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
      mn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = mn[d - 15], h = mn[d - 2], y = bt(f, 7) ^ bt(f, 18) ^ f >>> 3, w = bt(h, 17) ^ bt(h, 19) ^ h >>> 10;
      mn[d] = w + mn[d - 7] + y + mn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = bt(a, 6) ^ bt(a, 11) ^ bt(a, 25), h = u + f + dA(a, c, l) + hA[d] + mn[d] | 0, w = (bt(r, 2) ^ bt(r, 13) ^ bt(r, 22)) + uA(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Oi(mn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Oi(this.buffer);
  }
}
const yA = /* @__PURE__ */ rw(() => new pA()), wA = yA;
function gA(e, t) {
  return wA(zi(e, { strict: !1 }) ? Ul(e) : e);
}
function mA(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = gA(t);
  return i.set([n], 0), r === "bytes" ? i : Ne(i);
}
function bA(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(mA({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const Nu = 6, vw = 32, ql = 4096, xw = vw * ql, Du = xw * Nu - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * ql * Nu, kw = 1;
class vA extends X {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class Ew extends X {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class xA extends X {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class kA extends X {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${kw}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function EA(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? Rn(e.data) : e.data, r = me(n);
  if (!r)
    throw new Ew();
  if (r > Du)
    throw new vA({
      maxSize: Du,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = jl(new Uint8Array(xw));
    let c = 0;
    for (; c < ql; ) {
      const l = n.slice(s, s + (vw - 1));
      if (a.pushByte(0), a.pushBytes(l), l.length < 31) {
        a.pushByte(128), o = !1;
        break;
      }
      c++, s += 31;
    }
    i.push(a);
  }
  return t === "bytes" ? i.map((a) => a.bytes) : i.map((a) => Ne(a.bytes));
}
function AA(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? EA({ data: t, to: r }), o = e.commitments ?? mw({ blobs: i, kzg: n, to: r }), s = e.proofs ?? bw({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function SA(e) {
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
  throw new iA({ transaction: e });
}
class Ys extends X {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function _A(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!ar(i))
        throw new sr({ address: i });
      if (r < 0)
        throw new Ys({ chainId: r });
    }
  Gl(e);
}
function IA(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new Ew();
    for (const n of t) {
      const r = me(n), i = Hl(zl(n, 0, 1));
      if (r !== 32)
        throw new xA({ hash: n, size: r });
      if (i !== kw)
        throw new kA({
          hash: n,
          version: i
        });
    }
  }
  Gl(e);
}
function Gl(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new Ys({ chainId: t });
  if (i && !ar(i))
    throw new sr({ address: i });
  if (r && r > Vl)
    throw new Zs({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new gw({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function BA(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new Ys({ chainId: t });
  if (o && !ar(o))
    throw new sr({ address: o });
  if (n || i)
    throw new X("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > Vl)
    throw new Zs({ maxFeePerGas: r });
}
function $A(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !ar(o))
    throw new sr({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new Ys({ chainId: t });
  if (n || i)
    throw new X("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > Vl)
    throw new Zs({ maxFeePerGas: r });
}
function Xs(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const { address: r, storageKeys: i } = e[n];
    for (let o = 0; o < i.length; o++)
      if (i[o].length - 2 !== 64)
        throw new sA({ storageKey: i[o] });
    if (!ar(r, { strict: !1 }))
      throw new sr({ address: r });
    t.push([r, i]);
  }
  return t;
}
function TA(e, t) {
  const n = SA(e);
  return n === "eip1559" ? RA(e, t) : n === "eip2930" ? CA(e, t) : n === "eip4844" ? OA(e, t) : n === "eip7702" ? PA(e, t) : LA(e);
}
function PA(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: l, accessList: u, data: d } = e;
  _A(e);
  const f = Xs(u), h = HA(n);
  return ut([
    "0x04",
    zr([
      Y(r),
      o ? Y(o) : "0x",
      l ? Y(l) : "0x",
      c ? Y(c) : "0x",
      i ? Y(i) : "0x",
      s ?? "0x",
      a ? Y(a) : "0x",
      d ?? "0x",
      f,
      h,
      ...Mi(e, t)
    ])
  ]);
}
function OA(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: l, accessList: u, data: d } = e;
  IA(e);
  let f = e.blobVersionedHashes, h = e.sidecars;
  if (e.blobs && (typeof f > "u" || typeof h > "u")) {
    const E = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((R) => Ne(R)), P = e.kzg, I = mw({
      blobs: E,
      kzg: P
    });
    if (typeof f > "u" && (f = bA({
      commitments: I
    })), typeof h > "u") {
      const R = bw({ blobs: E, commitments: I, kzg: P });
      h = AA({ blobs: E, commitments: I, proofs: R });
    }
  }
  const y = Xs(u), w = [
    Y(n),
    i ? Y(i) : "0x",
    l ? Y(l) : "0x",
    c ? Y(c) : "0x",
    r ? Y(r) : "0x",
    o ?? "0x",
    s ? Y(s) : "0x",
    d ?? "0x",
    y,
    a ? Y(a) : "0x",
    f ?? [],
    ...Mi(e, t)
  ], p = [], m = [], S = [];
  if (h)
    for (let E = 0; E < h.length; E++) {
      const { blob: P, commitment: I, proof: R } = h[E];
      p.push(P), m.push(I), S.push(R);
    }
  return ut([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    zr(h ? [w, p, m, S] : w)
  ]);
}
function RA(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: l, data: u } = e;
  Gl(e);
  const d = Xs(l), f = [
    Y(n),
    i ? Y(i) : "0x",
    c ? Y(c) : "0x",
    a ? Y(a) : "0x",
    r ? Y(r) : "0x",
    o ?? "0x",
    s ? Y(s) : "0x",
    u ?? "0x",
    d,
    ...Mi(e, t)
  ];
  return ut([
    "0x02",
    zr(f)
  ]);
}
function CA(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: l } = e;
  BA(e);
  const u = Xs(c), d = [
    Y(n),
    o ? Y(o) : "0x",
    l ? Y(l) : "0x",
    r ? Y(r) : "0x",
    s ?? "0x",
    a ? Y(a) : "0x",
    i ?? "0x",
    u,
    ...Mi(e, t)
  ];
  return ut([
    "0x01",
    zr(d)
  ]);
}
function LA(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  $A(e);
  let l = [
    o ? Y(o) : "0x",
    c ? Y(c) : "0x",
    r ? Y(r) : "0x",
    s ?? "0x",
    a ? Y(a) : "0x",
    i ?? "0x"
  ];
  return n > 0 && (l = [
    ...l,
    Y(n),
    "0x",
    "0x"
  ]), zr(l);
}
function Mi(e, t) {
  const n = t ?? e, { v: r, yParity: i } = n;
  if (typeof n.r > "u")
    return [];
  if (typeof n.s > "u")
    return [];
  if (typeof r > "u" && typeof i > "u")
    return [];
  const o = $i(n.r), s = $i(n.s);
  return [typeof i == "number" ? i ? Y(1) : "0x" : r === 0n ? "0x" : r === 1n ? Y(1) : r === 27n ? "0x" : Y(1), o === "0x00" ? "0x" : o, s === "0x00" ? "0x" : s];
}
function HA(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Ti(r) : "0x",
      s,
      i ? Ti(i) : "0x",
      ...Mi({}, o)
    ]);
  }
  return t;
}
class UA extends X {
  constructor({ domain: t }) {
    super(`Invalid domain "${eA(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class NA extends X {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class DA extends X {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function zA(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: l, type: u } = c, d = a[l], f = u.match(pw);
      if (f && (typeof d == "number" || typeof d == "bigint")) {
        const [w, p, m] = f;
        Y(d, {
          signed: p === "int",
          size: Number.parseInt(m, 10) / 8
        });
      }
      if (u === "address" && typeof d == "string" && !ar(d))
        throw new sr({ address: d });
      const h = u.match(TE);
      if (h) {
        const [w, p] = h;
        if (p && me(d) !== Number.parseInt(p, 10))
          throw new Kk({
            expectedSize: Number.parseInt(p, 10),
            givenSize: me(d)
          });
      }
      const y = i[u];
      y && (MA(u), o(y, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new UA({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new NA({ primaryType: r, types: i });
}
function Aw({ domain: e }) {
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
function MA(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new DA({ type: e });
}
function KA(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: Aw({ domain: t }),
    ...e.types
  };
  zA({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(FA({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(Sw({
    data: n,
    primaryType: r,
    types: i
  })), _t(BE(o));
}
function FA({ domain: e, types: t }) {
  return Sw({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function Sw({ data: e, primaryType: t, types: n }) {
  const r = _w({
    data: e,
    primaryType: t,
    types: n
  });
  return _t(r);
}
function _w({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [jA({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = Bw({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return Ml(r, i);
}
function jA({ primaryType: e, types: t }) {
  const n = Ti(VA({ primaryType: e, types: t }));
  return _t(n);
}
function VA({ primaryType: e, types: t }) {
  let n = "";
  const r = Iw({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function Iw({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    Iw({ primaryType: o.type, types: t }, n);
  return n;
}
function Bw({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      _t(_w({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, _t(r)];
  if (n === "string")
    return [{ type: "bytes32" }, _t(Ti(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => Bw({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      _t(Ml(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
function qA(e) {
  const t = hw(e, 0, 1);
  if (t === "0x04")
    return "eip7702";
  if (t === "0x03")
    return "eip4844";
  if (t === "0x02")
    return "eip1559";
  if (t === "0x01")
    return "eip2930";
  if (t !== "0x" && Hl(t) >= 192)
    return "legacy";
  throw new oA({ serializedType: t });
}
const zu = "bitcoin-taproot-keypath-v1", Mu = "bip341-sighash-default-keypath", GA = ["bitcoin", "testnet", "signet", "regtest"], gc = 21000000n * 100000000n, $w = 137, Tw = /^[0-9a-f]+$/, WA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", ZA = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", YA = 734539939, XA = 1;
function ee(e) {
  throw new A("invalid_payload", e);
}
function Ku(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && ee(`${t} must be an object`), e;
}
function Fu(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && ee(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && ee(`${n} is missing required fields: ${i.join(", ")}`);
}
function Po(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !Tw.test(e)) && ee(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function JA(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && ee(`${t} must be an integer in ${n}..${r}`), e;
}
function it(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function mr(e, t, n, r) {
  return t + n > e.length && ee(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function bo(e, t, n) {
  t >= e.length && ee(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && ee(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function $a(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function QA(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function ti(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function ju(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function Pw(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  ee("transaction output uses an unsupported script template");
}
function eS(e) {
  (e.length === 0 || e.length % 2 || e.length > $w * 2 || !Tw.test(e)) && ee("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (U) => Number.parseInt(U, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && ee("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = bo(t, n, "input count");
  n = i, r !== 1 && ee("transaction must contain exactly one input");
  const [o, s] = mr(t, n, 32, "outpoint hash");
  n = s, o.every((U) => U === 0) && ee("outpoint hash must not be null");
  const [a, c] = mr(t, n, 4, "outpoint index");
  n = c;
  const l = $a(a), [u, d] = bo(t, n, "scriptSig length");
  n = d, u !== 0 && ee("scriptSig must be empty");
  const [f, h] = mr(t, n, 4, "sequence");
  n = h;
  const y = $a(f);
  y !== 4294967293 && y !== 4294967294 && y !== 4294967295 && ee("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [w, p] = bo(t, n, "output count");
  n = p, w !== 1 && w !== 2 && ee("transaction must contain one or two outputs");
  const m = [], S = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let U = 0; U < w; U += 1) {
    const [H, B] = mr(t, n, 8, `output ${U} amount`);
    n = B;
    const D = QA(H);
    (D < 1n || D > gc) && ee(`output ${U} amount is outside the Bitcoin money range`);
    const [L, x] = bo(t, n, `output ${U} script length`);
    n = x;
    const [v, b] = mr(t, n, L, `output ${U} script`);
    n = b;
    const g = Pw(v);
    L !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[g] && ee(`output ${U} script length is not canonical for ${g}`), D < S[g] && ee(`output ${U} is below the V1 ${g} dust floor`), m.push({ amountSats: D, scriptPubKey: v, kind: g });
  }
  const [E, P] = mr(t, n, 4, "locktime");
  n = P;
  const I = $a(E);
  I !== 0 && ee("locktime must be exactly zero"), n !== t.length && ee("transaction has trailing bytes");
  const R = m.reduce((U, H) => U + H.amountSats, 0n);
  return (R < 1n || R > gc) && ee("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: l, sequence: y, outputs: m, locktime: I };
}
function tS(e, t) {
  const n = ae(new TextEncoder().encode(e));
  return ae(it(n, n, t));
}
function nS(e, t, n) {
  const r = it(e.prevoutHashLe, ti(e.prevoutIndex)), i = it(new Uint8Array([n.length]), n), o = e.outputs.map((a) => it(ju(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = it(
    new Uint8Array([0, 0]),
    ti(2),
    ti(e.locktime),
    ae(r),
    ae(ju(t)),
    ae(i),
    ae(ti(e.sequence)),
    ae(it(...o)),
    new Uint8Array([0]),
    ti(0)
  );
  return tS("TapSighash", s);
}
function rS(e) {
  return BigInt(`0x${J(e)}`);
}
function Vu(e) {
  return Mc(ae(e));
}
function qu(e, t) {
  const n = it(new Uint8Array([e]), t), r = ae(ae(n)).slice(0, 4), i = it(n, r);
  let o = rS(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = WA[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function iS(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function oS(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1) i >>> o & 1 && (n ^= t[o]);
  }
  return n >>> 0;
}
function Ta(e, t, n) {
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...iS(n, 8, 5)], o = [...r].map((l) => l.charCodeAt(0) >> 5).concat([0], [...r].map((l) => l.charCodeAt(0) & 31)), s = t === 0 ? XA : YA, a = oS(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (l, u) => a >>> 5 * (5 - u) & 31);
  return `${r}1${i.concat(c).map((l) => ZA[l]).join("")}`;
}
function mc(e, t) {
  const n = Pw(t), r = e === "bitcoin";
  return n === "p2pkh" ? qu(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? qu(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? Ta(e, 0, t.slice(2)) : Ta(e, 1, t.slice(2));
}
function sS(e) {
  const t = Vu(e), n = it(new Uint8Array([0, 20]), t);
  return [
    it(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    it(new Uint8Array([169, 20]), Vu(n), new Uint8Array([135]))
  ];
}
function Pa(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function vo(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function Ow(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function Rw(e) {
  return J(ae(ae(e.raw)).slice().reverse());
}
function aS(e, t) {
  const n = t.transaction, r = G("bitcoin.network", { network: e.network }), i = [
    G("bitcoin.title"),
    ...t.highFeeWarning ? [G("bitcoin.highFeeWarning"), ""] : [],
    r,
    G("bitcoin.networkWarning"),
    G("bitcoin.input", { txid: J(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    G("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: vo(BigInt(e.prevout.amountSats)) }),
    G("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(G("bitcoin.output", {
      index: s + 1,
      address: mc(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: vo(o.amountSats),
      role: G(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    G("bitcoin.fee", { sats: t.feeSats.toString(), btc: vo(t.feeSats), rate: Ow(t.feeSats, t.signedVsize) }),
    G("bitcoin.vsize", { vsize: t.signedVsize }),
    G(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    G("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: vo(t.netLeavingSats) }),
    G("bitcoin.unsignedTxid", { txid: Rw(n) }),
    G("bitcoin.outputKey", { key: J(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function cS(e, t) {
  const n = Ku(e, "signingContext");
  Fu(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== zu && ee("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !GA.includes(n.network)) && ee("bitcoin signing_context network is invalid");
  const r = Po(n.unsignedTransaction, "unsignedTransaction");
  r.length > $w * 2 && ee("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = Ku(n.prevout, "signingContext.prevout");
  Fu(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = JA(i.amountSats, "prevout.amountSats", 1, Number(gc)), s = Po(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || ee("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== Mu && ee("unsupported Bitcoin digest algorithm");
  const a = Po(n.digest, "signingContext.digest", 64);
  return a !== t && ee("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: zu,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: Mu,
    digest: a
  };
}
function Cw(e, t, n) {
  const r = cS(e, t), i = eS(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (m) => Number.parseInt(m, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const m = Po(n, "signing public key", 66);
    a = Uint8Array.from(m.match(/../g), (E) => Number.parseInt(E, 16)), a[0] !== 2 && a[0] !== 3 && ee("signing public key must be compressed secp256k1");
    const S = Ox(m);
    Pa(s, S) || ee("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const m of i.outputs)
      sS(a).some((S) => Pa(S, m.scriptPubKey)) && ee("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((m, S) => Pa(m.scriptPubKey, o) ? [S] : []);
  c.length > 1 && ee("transaction may contain at most one same-key P2TR return output");
  const l = i.outputs.reduce((m, S) => m + S.amountSats, 0n), u = BigInt(r.prevout.amountSats) - l;
  u <= 0n && ee("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, f = Math.ceil(d / 4);
  u > 10000n * BigInt(f) && ee("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const h = J(nS(i, BigInt(r.prevout.amountSats), o));
  h !== r.digest && ee("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const y = c.reduce((m, S) => m + i.outputs[S].amountSats, 0n), w = u > 100n * BigInt(f) || u * 100n > BigInt(r.prevout.amountSats) * 2n, p = BigInt(r.prevout.amountSats) - y;
  return {
    digest: h,
    display: aS(r, {
      transaction: i,
      outputKeyXOnly: s,
      feeSats: u,
      signedVsize: f,
      sameKeyOutputIndexes: c,
      highFeeWarning: w,
      netLeavingSats: p
    }),
    facts: {
      network: r.network,
      spendingAddress: mc(r.network, o),
      inputTxid: J(i.prevoutHashLe.slice().reverse()),
      inputVout: i.prevoutIndex,
      inputAmountSats: BigInt(r.prevout.amountSats),
      outputs: i.outputs.map((m, S) => ({
        address: mc(r.network, m.scriptPubKey),
        amountSats: m.amountSats,
        sameKey: c.includes(S)
      })),
      feeSats: u,
      feeRate: Ow(u, f),
      signedVsize: f,
      netLeavingSats: p,
      highFeeWarning: w,
      sequence: i.sequence,
      signalsRbf: i.sequence === 4294967293,
      locktime: i.locktime,
      unsignedTxid: Rw(i),
      ...n !== void 0 ? { internalKeyXOnly: n.slice(2).toLowerCase() } : {},
      outputKeyXOnly: J(s),
      unsignedTransaction: r.unsignedTransaction,
      prevoutScriptPubKey: r.prevout.scriptPubKey
    },
    transaction: i,
    outputKeyXOnly: s
  };
}
const Gu = `avault-agent-operation:v1
`;
function br(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function Wu(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function Oa(e, t) {
  const n = Wu(e), r = Wu(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function Oo(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : Pr(e);
}
function Pr(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Pr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Pr(t[n])}`).join(",")}}`;
}
const lS = Lk([
  "function approve(address spender,uint256 amount)",
  // A common extension, not an EIP-20 method: the amount is added to the current allowance.
  "function increaseAllowance(address spender,uint256 addedValue)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]), dS = {
  approve: "ERC-20/ERC-721 approve",
  increaseAllowance: "ERC-20 increaseAllowance (extension)",
  transfer: "ERC-20 transfer",
  transferFrom: "ERC-20/ERC-721 transferFrom",
  permit: "ERC-20 permit",
  setApprovalForAll: "ERC-721 setApprovalForAll",
  safeTransferFrom: "ERC-721 safeTransferFrom",
  safeTransferFromWithData: "ERC-721 safeTransferFrom"
}, uS = new Map(
  lS.map((e) => {
    const t = e.name === "safeTransferFrom" && e.inputs.length === 4 ? "safeTransferFromWithData" : e.name;
    return [DE(e), { call: t, item: e }];
  })
);
function fS(e) {
  return `${e.name}(${e.inputs.map((t) => t.type).join(",")})`;
}
function hS(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e.toLowerCase();
}
const pS = /* @__PURE__ */ new Set([
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
]), yS = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function Ra(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function Lw(e) {
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
function wS(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function gS(e) {
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
function mS(e) {
  if (e.length < 10) return null;
  const t = uS.get(e.slice(0, 10));
  if (!t) return null;
  let n;
  try {
    if (n = qE(t.item.inputs, `0x${e.slice(10)}`), Ml(t.item.inputs, n).toLowerCase() !== `0x${e.slice(10)}`) return null;
  } catch {
    return null;
  }
  return {
    call: t.call,
    signature: fS(t.item),
    arguments: t.item.inputs.map((r, i) => ({
      name: r.name ?? `arg${i}`,
      type: r.type,
      value: Oo(n[i])
    }))
  };
}
function bS(e, t, n) {
  const r = Lw(e), i = hS(e.data), o = (c) => (t[c] === void 0 ? 0n : t[c]).toString(), s = e.to === void 0 || e.to === null || e.to === "" ? null : String(e.to), a = s === null ? null : mS(i);
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
function vS(e) {
  const t = [G("evm.title", { chainId: e.chainId })];
  if (e.blindSigning && t.push(G("sign.blindNotice")), t.push(
    G("evm.type", { type: e.type }),
    e.to === null ? G("evm.contractCreation") : G("evm.to", { to: e.to }),
    G("evm.value", { value: e.value }),
    G("evm.nonce", { value: e.nonce }),
    G("evm.gas", { value: e.gas })
  ), e.gasPrice !== void 0 && t.push(G("evm.gasPrice", { value: e.gasPrice })), e.maxFeePerGas !== void 0 && t.push(G("evm.maxFeePerGas", { value: e.maxFeePerGas })), e.maxPriorityFeePerGas !== void 0 && t.push(G("evm.maxPriorityFeePerGas", { value: e.maxPriorityFeePerGas })), e.decoded) {
    t.push(G("evm.call", { call: `${dS[e.decoded.call]} ${e.decoded.signature}` }));
    for (const n of e.decoded.arguments) t.push(`  ${n.name} (${n.type}): ${n.value}`);
  }
  return t.push(
    e.selector === null ? G("evm.selectorNone") : G("evm.selector", { selector: e.selector }),
    e.calldata === "0x" ? G("evm.calldataNone") : G("evm.calldata", { bytes: e.calldataBytes, calldata: e.calldata })
  ), t.join(`
`);
}
function xS(e) {
  Vr(e);
  const t = br(e), n = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"]
  }, r = Object.hasOwn(n, e.kind) ? n[e.kind] : void 0;
  if (!r) throw new Error("unsupported signing context");
  if (Ra(t, new Set(r), "signing context"), typeof e.digest != "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(e.digest))
    throw new Error("signing context digest must be 32 bytes");
  switch (e.kind) {
    case "evm-transaction": {
      if (e.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm");
      const i = br(e.unsignedTransaction);
      Ra(i, pS, "EVM transaction"), wS(e, i), Lw(i);
      const o = gS(i), s = TA(o), a = Oa(e.digest, _t(s)), c = bS(i, o, s);
      if (qA(s) !== c.type) throw new Error("EVM transaction type does not match its serialization");
      return {
        digest: a,
        challenge: Xe(a),
        display: vS(c),
        evm: c
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = br(e.typedData);
      Ra(i, yS, "EIP-712 typed data");
      const o = br(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = Oa(e.digest, KA(i));
      return {
        digest: s,
        challenge: Xe(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${Oo(o.chainId)}`,
          `domain.verifyingContract: ${Oo(o.verifyingContract)}`,
          `domain: ${Pr(o)}`,
          `types: ${Pr(br(i.types))}`,
          `primaryType: ${Oo(i.primaryType)}`,
          `message: ${Pr(br(i.message))}`
        ].join(`
`),
        typedData: i
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith(Gu) || e.canonicalPreimage.slice(Gu.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = Oa(e.digest, q1(ae(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: Xe(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = Cw(e, e.digest);
      return {
        digest: i.digest,
        challenge: Xe(i.digest),
        display: i.display
      };
    }
    default:
      throw new Error("unsupported signing context");
  }
}
function Ro(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return;
  const t = e.messageHex;
  if (typeof t == "string")
    try {
      Rh(t);
    } catch {
      throw new A("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit");
    }
}
function Js(e) {
  if (Ro(e), Vr(e), !e || typeof e != "object" || Array.isArray(e)) throw new A("invalid_payload", "Solana signing context must be an object");
  const t = e;
  if (t.kind !== "solana-transaction-v1" || Object.keys(t).some((n) => n !== "kind" && n !== "messageHex") || typeof t.messageHex != "string" || t.messageHex.length === 0 || t.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(t.messageHex))
    throw new A("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias");
  return { kind: "solana-transaction-v1", messageHex: t.messageHex };
}
function kS(e, t, n) {
  if (n.kind !== "keypair" || !n.publicKey) throw new Error("protected signing requires a keypair protected record");
  const r = jr(n.curve);
  if (e === ki || t.kind === "solana-transaction-v1" || r === "ed25519") {
    if (e !== ki || t.kind !== "solana-transaction-v1" || r !== "ed25519")
      throw new A("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together");
    Js(t);
  }
}
const Hw = "11111111111111111111111111111111", Uw = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", ES = "SysvarRecentB1ockHashes11111111111111111111", AS = 2, SS = 4, _S = 3, IS = 12;
function Yt(e) {
  return { decoded: null, undecodedReason: e };
}
function Nw(e, t) {
  let n = 0n;
  for (let r = 7; r >= 0; r -= 1) n = n << 8n | BigInt(e[t + r]);
  return n.toString();
}
function Wl(e) {
  const t = [];
  for (const n of e) {
    if (n.source !== "static") return null;
    t.push(n.address);
  }
  return t;
}
function BS(e, t) {
  const n = t.length >= 4 ? (t[0] | t[1] << 8 | t[2] << 16 | t[3] << 24) >>> 0 : -1;
  return n === AS && t.length === 12 ? $S(e, t) : n === SS && t.length === 4 ? TS(e) : Yt("unsupported_instruction");
}
function $S(e, t) {
  if (e.length !== 2) return Yt("unsupported_instruction");
  const n = Wl(e);
  if (!n) return Yt("unresolved_account");
  const [r, i] = n;
  return { decoded: { kind: "system-transfer", source: r, destination: i, lamports: Nw(t, 4) }, undecodedReason: null };
}
function TS(e) {
  if (e.length !== 3) return Yt("unsupported_instruction");
  const t = Wl(e);
  if (!t) return Yt("unresolved_account");
  const [n, r, i] = t;
  return r !== ES ? Yt("unsupported_instruction") : { decoded: { kind: "system-advance-nonce", nonceAccount: n, recentBlockhashesSysvar: r, nonceAuthority: i }, undecodedReason: null };
}
function PS(e, t) {
  const n = t.length === 9 && t[0] === _S && e.length === 3, r = t.length === 10 && t[0] === IS && e.length === 4;
  if (!n && !r) return Yt("unsupported_instruction");
  const i = Wl(e);
  if (!i) return Yt("unresolved_account");
  const o = Nw(t, 1);
  if (n) {
    const [u, d, f] = i;
    return { decoded: { kind: "spl-transfer", sourceTokenAccount: u, destinationTokenAccount: d, authority: f, amount: o }, undecodedReason: null };
  }
  const [s, a, c, l] = i;
  return {
    decoded: { kind: "spl-transfer-checked", sourceTokenAccount: s, mint: a, destinationTokenAccount: c, authority: l, amount: o, decimals: t[9] },
    undecodedReason: null
  };
}
function OS(e, t, n) {
  return e === Hw ? BS(t, n) : e === Uw ? PS(t, n) : Yt("unsupported_program");
}
const RS = 32, Ca = 512, ni = 256, Zu = 8, Dw = 3, zw = /* @__PURE__ */ new Map([
  ["1", "Ethereum"],
  ["10", "OP Mainnet"],
  ["56", "BNB Smart Chain"],
  ["137", "Polygon"],
  ["8453", "Base"],
  ["42161", "Arbitrum One"],
  ["11155111", "Sepolia"],
  ["11155420", "OP Sepolia"],
  ["84532", "Base Sepolia"],
  ["421614", "Arbitrum Sepolia"]
]), Mw = /* @__PURE__ */ new Set(["1", "10", "8453", "42161", "11155111", "11155420", "84532", "421614"]);
function Kw(e) {
  return zw.has(e) ? [] : ["review.note.unknownChain"];
}
function Fw(e) {
  const t = zw.get(e);
  return t === void 0 ? e : `${e} · ${t}`;
}
function xs(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e);
}
function jw(e) {
  if (typeof e == "bigint") return e;
  if (typeof e != "string" && typeof e != "number" && typeof e != "boolean" && !Array.isArray(e)) return null;
  try {
    return BigInt(e);
  } catch {
    return null;
  }
}
function Bn(e, t) {
  if (/^u?int\d*$/.test(e)) {
    const n = jw(t);
    return n === null ? JSON.stringify(t) ?? String(t) : n.toString();
  }
  return typeof t == "string" ? t : JSON.stringify(t) ?? String(t);
}
class Yu extends Error {
}
function ks(e, t, n, r, i, o) {
  if (i > RS) {
    o.omitted += 1;
    return;
  }
  const s = e[t];
  if (s !== void 0) {
    if (!Object.hasOwn(e, t) || !Array.isArray(s) || n === null || n === void 0) throw new Yu(r);
    const a = Object(n), c = new Set(s.map((l) => l.name));
    for (const l of s) ks(e, l.type, a[l.name], r ? `${r}.${l.name}` : l.name, i + 1, o);
    if (typeof n == "object")
      for (const l of Object.keys(n)) c.has(l) || o.uncovered.push(r ? `${r}.${l}` : l);
    return;
  }
  if (t !== "bytes" && t !== "string" && t.endsWith("]")) {
    if (!Array.isArray(n)) throw new Yu(r);
    const a = t.slice(0, t.lastIndexOf("["));
    n.length === 0 && o.covered.push({ path: r, type: t, value: "[]" }), n.forEach((c, l) => ks(e, a, c, `${r}[${l}]`, i + 1, o));
    return;
  }
  o.covered.push({ path: r, type: t, value: Bn(t, n) });
}
function CS(e, t) {
  const n = /* @__PURE__ */ new Set(), r = (i) => {
    const o = /^\w*/.exec(i)[0];
    if (!(n.has(o) || !e[o])) {
      n.add(o);
      for (const s of e[o]) r(s.type);
    }
  };
  return r(t), n;
}
const Vw = [["token", "address"], ["amount", "uint160"], ["expiration", "uint48"], ["nonce", "uint48"]], qw = [["token", "address"], ["amount", "uint256"]], LS = { primaryType: "Permit", types: { Permit: [["owner", "address"], ["spender", "address"], ["value", "uint256"], ["nonce", "uint256"], ["deadline", "uint256"]] } }, HS = { primaryType: "PermitSingle", types: { PermitSingle: [["details", "PermitDetails"], ["spender", "address"], ["sigDeadline", "uint256"]], PermitDetails: Vw } }, US = { primaryType: "PermitBatch", types: { PermitBatch: [["details", "PermitDetails[]"], ["spender", "address"], ["sigDeadline", "uint256"]], PermitDetails: Vw } }, NS = {
  primaryType: "PermitTransferFrom",
  types: { PermitTransferFrom: [["permitted", "TokenPermissions"], ["spender", "address"], ["nonce", "uint256"], ["deadline", "uint256"]], TokenPermissions: qw }
}, DS = {
  primaryType: "PermitBatchTransferFrom",
  types: { PermitBatchTransferFrom: [["permitted", "TokenPermissions[]"], ["spender", "address"], ["nonce", "uint256"], ["deadline", "uint256"]], TokenPermissions: qw }
};
function ri(e, t, n) {
  if (t !== n.primaryType) return !1;
  const r = CS(e, t), i = Object.keys(n.types);
  return r.size !== i.length || !i.every((o) => r.has(o)) ? !1 : i.every((o) => {
    const s = e[o], a = n.types[o];
    return Array.isArray(s) && s.length === a.length && s.every((c, l) => c.name === a[l][0] && c.type === a[l][1]);
  });
}
const Xu = (1n << 256n) - 1n, zS = (1n << 160n) - 1n;
function La(e, t, n, r, i) {
  const o = jw(t), s = o === n;
  return {
    field: {
      label: e,
      ...i === void 0 ? {} : { index: i },
      value: o === null ? Bn("string", t) : o.toString(),
      ...s ? { shownAs: r, notes: ["review.note.exactInDetails"] } : { notes: ["review.note.rawTokenUnits"] }
    },
    isMax: s
  };
}
function Hn(e) {
  return typeof e == "string" ? e : Bn("string", e);
}
function Ha(e, t, n) {
  return { label: e, value: Bn("uint256", t), time: "unix-seconds", notes: [n] };
}
function Ju(e) {
  const t = e.filter((o) => o.isMax), n = e.filter((o) => !o.isMax), r = n.slice(0, Math.max(0, Dw - t.length)), i = n.length - r.length;
  return {
    rows: [
      ...[...t, ...r].flatMap((o) => o.rows()),
      ...i > 0 ? [{ label: "review.field.moreTokens", value: "", notes: [{ key: "review.note.moreEntriesInDetails", count: i }] }] : []
    ],
    maxima: t.length
  };
}
function Qu(e, t, n, r) {
  return t.maxima <= Dw ? [e, ...t.rows, r] : [
    e,
    { label: "review.field.maxEntries", value: String(t.maxima), notes: [{ key: "review.note.ofEntries", count: n }] },
    r,
    ...t.rows
  ];
}
function MS(e, t, n) {
  const r = ["review.warning.tokenAuthorization"];
  if (ri(e, t, LS)) {
    const s = La("review.field.permitAmount", n.value, Xu, "review.value.unlimited");
    return {
      kind: "review.kind.erc2612Permit",
      warnings: s.isMax ? [...r, "review.warning.unlimitedAllowance"] : r,
      summary: [
        { label: "review.field.spender", value: Hn(n.spender), elide: !0 },
        s.field,
        Ha("review.field.permitDeadline", n.deadline, "review.note.permitDeadline")
      ],
      identity: [
        { label: "review.field.permitOwner", value: Hn(n.owner), elide: !0 },
        { label: "review.field.permitNonce", value: Bn("uint256", n.nonce) }
      ]
    };
  }
  const i = ri(e, t, HS);
  if (i || ri(e, t, US)) {
    const s = i ? [n.details] : Array.isArray(n.details) ? n.details : [], a = Ju(s.map((c, l) => {
      const u = xs(c) ? c : {}, d = La("review.field.permitTokenAmount", u.amount, zS, "review.value.unlimited", l + 1);
      return {
        isMax: d.isMax,
        rows: () => [
          d.field,
          { label: "review.field.permitToken", index: l + 1, value: Hn(u.token), elide: !0 },
          { label: "review.field.permitExpiration", index: l + 1, value: Bn("uint48", u.expiration), notes: ["review.note.permit2Expiration"] }
        ]
      };
    }));
    return {
      kind: "review.kind.permit2Allowance",
      warnings: a.maxima > 0 ? [...r, "review.warning.unlimitedAllowance"] : r,
      summary: Qu(
        { label: "review.field.spender", value: Hn(n.spender), elide: !0 },
        a,
        s.length,
        Ha("review.field.signatureDeadline", n.sigDeadline, "review.note.signatureDeadline")
      ),
      identity: []
    };
  }
  const o = ri(e, t, NS);
  if (o || ri(e, t, DS)) {
    const s = o ? [n.permitted] : Array.isArray(n.permitted) ? n.permitted : [], a = Ju(s.map((c, l) => {
      const u = xs(c) ? c : {}, d = La("review.field.permitTokenAmount", u.amount, Xu, "review.value.maximumOneTime", l + 1);
      return {
        isMax: d.isMax,
        rows: () => [d.field, { label: "review.field.permitToken", index: l + 1, value: Hn(u.token), elide: !0 }]
      };
    }));
    return {
      kind: "review.kind.permit2Transfer",
      warnings: a.maxima > 0 ? ["review.warning.oneTimeTransfer", "review.warning.maximumOneTimeTransfer"] : ["review.warning.oneTimeTransfer"],
      summary: Qu(
        // The Permit2 contract signs msg.sender as the spender; this is the value in the message.
        { label: "review.field.spender", value: Hn(n.spender), elide: !0 },
        a,
        s.length,
        Ha("review.field.permitDeadline", n.deadline, "review.note.signatureDeadline")
      ),
      identity: [{ label: "review.field.permitNonce", value: Bn("uint256", n.nonce) }]
    };
  }
  return null;
}
function Gw(e) {
  return e.length <= Ca ? { name: e } : { name: `${e.slice(0, Ca / 2)} … ${e.slice(-Ca / 4)}`, notes: ["review.note.pathShortened"] };
}
function Ua(e) {
  const { name: t, notes: n } = Gw(`${e.path} (${e.type})`);
  return { label: "review.field.typedField", name: t, value: e.value, ...n ? { notes: n } : {} };
}
function KS(e, t) {
  const n = e, r = xs(n.domain) ? n.domain : {}, i = n.types, o = {
    EIP712Domain: Aw({ domain: r }),
    ...i
  }, s = zs(t.publicKey).eth;
  if (!s) throw new Error("EIP-712 review requires a secp256k1 signing key");
  const a = { covered: [], uncovered: [], omitted: 0 };
  ks(o, "EIP712Domain", r, "domain", 0, a);
  const c = a.covered, l = a.uncovered, u = new Set(o.EIP712Domain.map((U) => U.name)), d = (U, H) => {
    if (!Object.hasOwn(r, U)) return [];
    const B = u.has(U), D = o.EIP712Domain.find((x) => x.name === U), L = B && D ? Bn(D.type, r[U]) : Hn(r[U]);
    return [{
      label: H,
      value: U === "chainId" ? Fw(L) : L,
      notes: [...U === "chainId" ? Kw(L) : [], ...B ? [] : ["review.note.notInTypedHash"]]
    }];
  }, f = n.primaryType !== "EIP712Domain", h = xs(n.message) ? n.message : {}, y = { covered: [], uncovered: l, omitted: 0 };
  f ? ks(o, n.primaryType, n.message, "", 0, y) : n.message !== void 0 && l.push("message");
  const w = y.covered, p = a.omitted + y.omitted;
  let m = null;
  try {
    m = f ? MS(o, n.primaryType, h) : null;
  } catch {
    m = null;
  }
  const S = w.slice(0, Zu).map((U) => U.type === "address" ? { ...Ua(U), elide: !0 } : Ua(U)), E = Math.max(0, w.length - Zu) + p;
  E > 0 && S.push({ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: E }] });
  const P = (U, H = 0) => {
    const B = Math.max(0, U.length - ni) + H;
    return [
      ...U.slice(0, ni).map(Ua),
      ...B > 0 ? [{ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInRawData", count: B }] }] : []
    ];
  }, I = JSON.stringify(n, null, 2), R = [
    { title: "review.group.typedDomain", fields: P(c, a.omitted) },
    ...f ? [{ title: "review.group.typedMessage", fields: P(w, y.omitted) }] : [],
    ...l.length > 0 ? [{
      title: "review.group.notInTypedHash",
      fields: [
        ...l.slice(0, ni).map((U) => {
          const H = Gw(U);
          return { label: "review.field.typedField", name: H.name, value: "", notes: ["review.note.notInTypedHash", ...H.notes ?? []] };
        }),
        ...l.length > ni ? [{ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInRawData", count: l.length - ni }] }] : []
      ]
    }] : [],
    {
      title: "review.group.transaction",
      fields: [
        { label: "review.field.publicKey", value: t.publicKey.toLowerCase() },
        { label: "review.field.scheme", value: t.scheme },
        { label: "review.field.primaryType", value: n.primaryType },
        { label: "review.field.digest", value: `0x${t.digest}` }
      ]
    },
    {
      title: "review.group.exact",
      fields: [
        { label: "review.field.typedTypes", value: JSON.stringify(i, null, 2), raw: !0 },
        { label: "review.field.typedData", value: I, notes: [{ key: "review.note.bytes", count: new TextEncoder().encode(I).length }], raw: !0 }
      ]
    }
  ];
  return {
    kind: m?.kind ?? "review.kind.eip712",
    signer: { label: "review.field.signingAddress", value: s, elide: !0 },
    // What the signature grants first, then where it applies, then who; the signer last.
    summary: [
      ...m ? m.summary : S,
      ...l.length > 0 ? [{ label: "review.field.notInTypedHash", value: "", notes: [{ key: "review.note.fieldsOutsideHash", count: l.length }] }] : [],
      ...d("chainId", "review.field.chainId"),
      ...d("name", "review.field.domainName"),
      ...d("verifyingContract", "review.field.verifyingContract").map((U) => ({ ...U, elide: !0 })),
      { label: "review.field.primaryType", value: n.primaryType, ...f ? {} : { notes: ["review.note.messageNotHashed"] } },
      ...m ? m.identity : []
    ],
    // Every hashed value is shown; nothing is blind.
    undecoded: !1,
    ...m ? { warnings: m.warnings } : {},
    details: R
  };
}
const ef = 3, tf = 3, FS = 3;
function Ww(e) {
  return e === Hw ? ["review.note.systemProgram"] : e === Uw ? ["review.note.tokenProgram"] : [];
}
function Qs(e) {
  return e.length / 2;
}
function Zw(e) {
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
        // The instruction encodes its decimals: the exact decimal amount, then the integer and the count.
        { label: "review.field.amount", value: e.amount, decimals: e.decimals }
      ];
  }
}
function jS(e) {
  return e.kind === "spl-transfer-checked" ? "TransferChecked" : "Transfer";
}
function nf(e) {
  return {
    label: "review.field.undecodedInstruction",
    value: e.programId,
    notes: [{ key: "review.note.dataBytes", count: Qs(e.dataHex) }, "review.note.notDecoded"]
  };
}
function VS(e, t) {
  const n = (r) => ({ label: r, index: t, value: "", heading: !0 });
  switch (e.kind) {
    case "system-transfer":
      return [
        n("review.field.transferSol"),
        { label: "review.field.amount", value: e.lamports, native: "sol" },
        { label: "review.field.to", value: e.destination, elide: !0 }
      ];
    case "spl-transfer":
      return [
        n("review.field.transferTokenNoMint"),
        { label: "review.field.amount", value: e.amount, notes: ["review.note.baseUnits"] },
        { label: "review.field.toTokenAccount", value: e.destinationTokenAccount, elide: !0 }
      ];
    case "spl-transfer-checked":
      return [
        n("review.field.transferToken"),
        { label: "review.field.amount", value: e.amount, decimals: e.decimals },
        { label: "review.field.toTokenAccount", value: e.destinationTokenAccount, elide: !0 },
        { label: "review.field.mint", value: e.mint, elide: !0 }
      ];
  }
}
function rf(e) {
  return e === 0 ? [] : [{ label: "review.field.durableNonce", value: "", ...e > 1 ? { notes: [{ key: "review.note.nonceAdvances", count: e }] } : {} }];
}
function qS(e) {
  const t = Zw(e).map((r) => r.label === "review.field.amount" ? r : { ...r, elide: !0 }), n = ["review.field.amount", "review.field.to", "review.field.toTokenAccount", "review.field.mint", "review.field.from", "review.field.fromTokenAccount"];
  return [...t].sort((r, i) => n.indexOf(r.label) - n.indexOf(i.label));
}
const Es = (e) => e.kind !== "system-advance-nonce";
function GS(e) {
  if (e.instructions.length === 1) {
    const [s] = e.instructions;
    return s.decoded ? Es(s.decoded) ? qS(s.decoded) : rf(1) : [{ ...nf(s), elide: !0 }];
  }
  let t = 0, n = 0, r = 0;
  const i = e.instructions.flatMap((s) => {
    const a = s.decoded;
    return a && Es(a) ? (t += 1, t <= ef ? VS(a, t) : []) : a ? (n += 1, []) : (r += 1, r <= tf ? [{ ...nf(s), elide: !0 }] : []);
  }), o = (s, a, c, l) => c > l ? [{ label: s, value: "", notes: [{ key: a, count: c - l }] }] : [];
  return [
    {
      label: "review.field.instructions",
      value: String(e.instructions.length),
      notes: [
        ...t > 0 ? [{ key: "review.note.transfersDecoded", count: t }] : [],
        ...r > 0 ? [{ key: "review.note.instructionsNotDecoded", count: r }] : []
      ]
    },
    ...i,
    ...o("review.field.moreTransfers", "review.note.moreInDetails", t, ef),
    ...o("review.field.moreUndecoded", "review.note.moreInstructionsInDetails", r, tf),
    ...rf(n)
  ];
}
function WS(e) {
  return Es(e) ? [
    { label: "review.field.instruction", value: jS(e) },
    ...Zw(e),
    ...e.kind === "system-transfer" ? [] : [{ label: "review.field.authority", value: e.authority }]
  ] : [
    { label: "review.field.instruction", value: "AdvanceNonceAccount" },
    { label: "review.field.nonceAccount", value: e.nonceAccount },
    { label: "review.field.recentBlockhashesSysvar", value: e.recentBlockhashesSysvar },
    { label: "review.field.nonceAuthority", value: e.nonceAuthority }
  ];
}
function ZS(e) {
  return e.map((t) => t.index).join(", ");
}
function YS(e) {
  const t = e.decoded, n = {
    label: "review.field.data",
    value: e.dataHex,
    notes: [{ key: "review.note.bytes", count: Qs(e.dataHex) }, ...t ? [] : ["review.note.notDecoded"]]
  };
  return {
    title: "review.group.instruction",
    index: e.index + 1,
    fields: [
      { label: "review.field.program", value: e.programId, notes: Ww(e.programId) },
      ...t ? WS(t) : [],
      { label: "review.field.accountIndexes", value: ZS(e.accounts) },
      n
    ]
  };
}
function XS(e) {
  const t = e.instructions.length === 1 ? e.instructions[0].decoded : null;
  return {
    kind: !t || !Es(t) ? "review.kind.solanaTransaction" : t.kind === "system-transfer" ? "review.kind.solanaSystemTransfer" : "review.kind.solanaTokenTransfer",
    signer: { label: "review.field.signingKey", value: e.expectedSigner.address, elide: !0 },
    summary: GS(e),
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
            ...Ww(n.address)
          ]
        }))
      },
      ...e.instructions.map(YS),
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
function bc(e) {
  return Mw.has(e.chainId) ? { label: "review.field.value", value: e.value, native: "eth" } : { label: "review.field.value", value: e.value, notes: ["review.note.wei"] };
}
function Yw(e) {
  return e.to === null ? { label: "review.field.contract", value: "", notes: ["review.note.contractCreation"] } : { label: "review.field.contract", value: e.to };
}
function Xw(e) {
  return (e.decoded?.arguments ?? []).map((t, n) => ({
    label: "review.field.argument",
    index: n + 1,
    name: `${t.name} (${t.type})`,
    value: t.value
  }));
}
function JS(e) {
  if (e.decoded) {
    const n = { label: "review.field.call", value: e.decoded.signature }, r = Xw(e).map((i) => i.name?.endsWith(" (address)") ? { ...i, elide: !0 } : i);
    return r.length <= FS ? [n, ...r] : [{ ...n, notes: [{ key: "review.note.argumentsInDetails", count: r.length }] }];
  }
  if (e.calldata === "0x") return [];
  const t = [{ key: "review.note.dataBytes", count: e.calldataBytes }, "review.note.notDecoded"];
  return e.to === null || e.selector === null ? [{ label: "review.field.initCode", value: "", notes: t }] : [{ label: "review.field.selector", value: e.selector, notes: t }];
}
const of = ((1n << 256n) - 1n).toString();
function QS(e) {
  const t = e.decoded;
  if (!t || e.to === null) return null;
  const [n, r] = t.arguments;
  if (t.call === "transfer")
    return {
      kind: "review.kind.erc20Transfer",
      lead: [
        { label: "review.field.transferTo", value: n.value, elide: !0 },
        { label: "review.field.amount", value: r.value, notes: ["review.note.rawTokenUnits"] }
      ]
    };
  if (t.call === "approve") {
    const i = r.value === of;
    return {
      kind: "review.kind.tokenApprove",
      warnings: i ? ["review.warning.tokenAuthorization", "review.warning.maximumApproval"] : ["review.warning.tokenAuthorization"],
      lead: [
        { label: "review.field.spender", value: n.value, elide: !0 },
        i ? { label: "review.field.approvalValue", value: r.value, shownAs: "review.value.maximum", notes: ["review.note.exactInDetails"] } : { label: "review.field.approvalValue", value: r.value }
      ]
    };
  }
  if (t.call === "increaseAllowance") {
    const i = r.value === of;
    return {
      kind: "review.kind.tokenIncreaseAllowance",
      warnings: ["review.warning.tokenAuthorization"],
      lead: [
        { label: "review.field.spender", value: n.value, elide: !0 },
        i ? { label: "review.field.allowanceIncrease", value: r.value, shownAs: "review.value.maximumIncrease", notes: ["review.note.exactInDetails", "review.note.addedToAllowance"] } : { label: "review.field.allowanceIncrease", value: r.value, notes: ["review.note.rawTokenUnits", "review.note.addedToAllowance"] }
      ]
    };
  }
  return null;
}
function e_(e) {
  const t = { label: "review.field.chainId", value: Fw(e.chainId), notes: Kw(e.chainId) };
  if (e.to !== null && e.calldata === "0x")
    return { kind: "review.kind.evmTransaction", summary: [Mw.has(e.chainId) ? { label: "review.field.nativeTransfer", value: e.value, native: "eth", unit: "symbol", to: e.to } : { label: "review.field.nativeTransfer", value: e.value, notes: ["review.note.wei"], to: e.to }, t] };
  const n = QS(e);
  return n ? {
    kind: n.kind,
    ...n.warnings ? { warnings: n.warnings } : {},
    // The native value the transaction carries, as encoded, never assumed to be zero.
    summary: [...n.lead, { label: "review.field.tokenContract", value: e.to, elide: !0 }, bc(e), t]
  } : { kind: "review.kind.evmTransaction", summary: [{ ...Yw(e), elide: !0 }, bc(e), ...JS(e), t] };
}
function t_(e, t) {
  const n = zs(t.publicKey).eth;
  if (!n) throw new Error("EVM review requires a secp256k1 signing key");
  const r = (a, c) => c === void 0 ? [] : [{ label: a, value: c, notes: ["review.note.wei"] }], { kind: i, summary: o, warnings: s } = e_(e);
  return {
    kind: i,
    signer: { label: "review.field.signingAddress", value: n, elide: !0 },
    summary: o,
    undecoded: e.blindSigning,
    ...s ? { warnings: s } : {},
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.publicKey", value: t.publicKey.toLowerCase() },
          { label: "review.field.scheme", value: t.scheme },
          { label: "review.field.type", value: e.type },
          { label: "review.field.chainId", value: e.chainId },
          Yw(e),
          bc(e),
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
          ...Xw(e)
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
            notes: [{ key: "review.note.bytes", count: Qs(e.unsignedTransactionHex) - 1 }],
            raw: !0
          },
          { label: "review.field.digest", value: `0x${t.digest}` }
        ]
      }
    ]
  };
}
function n_(e, t) {
  const n = (s) => s.toString(), r = { label: "review.field.network", value: e.network, notes: ["review.note.requesterNetwork"] }, i = e.outputs.map((s) => s.sameKey ? { label: "review.field.returnToKey", value: n(s.amountSats), native: "btc", unit: "symbol" } : { label: "review.field.send", value: n(s.amountSats), native: "btc", unit: "symbol", to: s.address }), o = e.outputs.filter((s) => !s.sameKey).map((s) => ({ label: "review.field.recipientAddress", value: s.address }));
  return {
    kind: "review.kind.bitcoinTransfer",
    signer: { label: "review.field.signingAddress", value: e.spendingAddress, elide: !0 },
    summary: [
      ...i,
      { label: "review.field.fee", value: n(e.feeSats), native: "btc", unit: "base", secondary: e.feeRate },
      { label: "review.field.netLeaving", value: n(e.netLeavingSats), native: "btc", unit: "symbol" },
      ...o,
      r
    ],
    // Every byte is parsed by the bounded verifier; nothing here is blind.
    undecoded: !1,
    ...e.highFeeWarning ? { warnings: ["review.warning.highFee"] } : {},
    details: [
      {
        title: "review.group.transaction",
        fields: [
          { label: "review.field.scheme", value: t.scheme },
          ...e.internalKeyXOnly ? [{ label: "review.field.internalKey", value: e.internalKeyXOnly }] : [],
          { label: "review.field.outputKey", value: e.outputKeyXOnly },
          { label: "review.field.network", value: e.network, notes: ["review.note.networkNotChainProof"] },
          { label: "review.field.input", value: `${e.inputTxid}:${e.inputVout}` },
          { label: "review.field.inputAmount", value: n(e.inputAmountSats), native: "btc" },
          ...e.outputs.flatMap((s, a) => [
            { label: "review.field.outputIndexed", index: a + 1, value: s.address, notes: [s.sameKey ? "review.note.sameKeyReturn" : "review.note.recipient"] },
            { label: "review.field.outputAmountIndexed", index: a + 1, value: n(s.amountSats), native: "btc" }
          ]),
          { label: "review.field.fee", value: n(e.feeSats), native: "btc" },
          { label: "review.field.feeRate", value: e.feeRate },
          { label: "review.field.signedVsize", value: String(e.signedVsize), notes: ["review.note.vbytes"] },
          { label: "review.field.netLeaving", value: n(e.netLeavingSats), native: "btc" },
          {
            label: "review.field.sequence",
            value: `0x${e.sequence.toString(16).padStart(8, "0")}`,
            notes: [e.signalsRbf ? "review.note.rbfSignals" : "review.note.rbfDoesNotSignal"]
          },
          { label: "review.field.locktime", value: String(e.locktime) },
          { label: "review.field.unsignedTxid", value: e.unsignedTxid },
          { label: "review.field.digest", value: t.digest }
        ]
      },
      {
        title: "review.group.exact",
        fields: [
          {
            label: "review.field.unsignedTransaction",
            value: e.unsignedTransaction,
            notes: [{ key: "review.note.bytes", count: Qs(e.unsignedTransaction) }],
            raw: !0
          },
          { label: "review.field.prevoutScript", value: e.prevoutScriptPubKey }
        ]
      }
    ]
  };
}
function Zl(e, t) {
  try {
    const n = Hp(e.context.release?.derivation), r = t.accounts[n.account][n.chain], i = e.signingContext.kind;
    if (n.chain === "bitcoin" ? e.scheme !== "schnorr-secp256k1-bip341-keypath" || i !== "bitcoin-taproot-keypath-v1" : n.chain === "solana" ? e.scheme !== "ed25519" || i !== "solana-transaction-v1" : e.scheme !== "ecdsa-secp256k1-recoverable" || i !== "evm-transaction" && i !== "eip-712-typed-data") throw new Error("protected HD chain/scheme/context mismatch");
    const o = e.context.release?.signingKey;
    if (!o || typeof o != "object" || Array.isArray(o)) throw new Error("missing protected HD signing key binding");
    const s = o;
    if (Object.keys(s).length !== 3 || typeof s.secret_id != "string" || s.secret_id.length === 0 || s.public_key !== r || e.context.release?.publicKey !== r || typeof s.envelope_sha256 != "string" || !/^[0-9a-f]{64}$/.test(s.envelope_sha256) || s.envelope_sha256 !== C1(e.material.envelope)) throw new Error("protected HD signing identity mismatch");
    return { selection: n, publicKey: r, path: Xn(n.chain, n.account) };
  } catch {
    throw new A("invalid_sign_binding", "protected HD signing requires the exact signed selection/key/envelope binding");
  }
}
async function Jw(e, t) {
  if (e.context.kind !== "hd-seed") throw new Error("protected HD custody requires HD metadata");
  const n = await Di(e.sealed, e.vmk, e.context);
  let r;
  try {
    return r = Up(n), R1(r.seed, e.identity.selection, (i) => {
      if (J(e.identity.selection.chain === "solana" ? ct.getPublicKey(i) : fe.getPublicKey(i, !0)) !== e.identity.publicKey) throw new A("invalid_sign_binding", "protected HD seed does not match the selected authenticated public key");
      return t(i);
    });
  } finally {
    n.fill(0), ts(r);
  }
}
async function r_(e) {
  return Jw(e, (t) => e.payload.kind === "message" ? Yp(t, e.payload.messageHex) : Zp(t, e.payload.digest, e.request.scheme));
}
const i_ = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function di(e) {
  let t = 0;
  for (; t < e.length && e[t] === 0; ) t += 1;
  let n = 0n;
  for (const i of e) n = n << 8n | BigInt(i);
  let r = "";
  for (; n > 0n; )
    r = i_[Number(n % 58n)] + r, n /= 58n;
  return "1".repeat(t) + r;
}
class Qw extends Error {
  code;
  constructor(t, n) {
    super(n), this.name = "SolanaMessageError", this.code = t;
  }
}
const xo = 1232, sf = 64, ii = 32, o_ = 32, af = 128, cf = 256;
function xe(e, t) {
  throw new Qw(e, t);
}
function lf(e) {
  let t = "";
  for (const n of e) t += n.toString(16).padStart(2, "0");
  return t;
}
function s_(e) {
  return e < 128 ? 1 : e < 16384 ? 2 : 3;
}
function a_(e, t, n = "compact-u16") {
  let r = 0;
  for (let i = 0; ; i += 1) {
    t + i >= e.length && xe("truncated", `message ends inside ${n}`);
    const o = e[t + i];
    o === 0 && i !== 0 && xe("invalid_compact_u16", `${n} is not minimally encoded`);
    const s = (o & 128) === 0;
    if (i === 2 && !s && xe("invalid_compact_u16", `${n} is longer than three bytes`), r |= (o & 127) << 7 * i, r > 65535 && xe("invalid_compact_u16", `${n} exceeds 65535`), s) return { value: r, length: i + 1 };
  }
}
class c_ {
  bytes;
  offset = 0;
  constructor(t) {
    this.bytes = t;
  }
  get remaining() {
    return this.bytes.length - this.offset;
  }
  u8(t) {
    return this.remaining < 1 && xe("truncated", `message ends before ${t}`), this.bytes[this.offset++];
  }
  take(t, n) {
    this.remaining < t && xe("truncated", `message ends inside ${n}`);
    const r = this.bytes.subarray(this.offset, this.offset + t);
    return this.offset += t, r;
  }
  compactU16(t) {
    const { value: n, length: r } = a_(this.bytes, this.offset, t);
    return this.offset += r, n;
  }
}
function eg(e) {
  if (typeof e == "object" && e !== null) {
    for (const t of Object.values(e)) eg(t);
    Object.freeze(e);
  }
  return e;
}
function l_(e, t) {
  e instanceof Uint8Array || xe("invalid_input", "message must be a byte array"), (!(t instanceof Uint8Array) || t.length !== ii) && xe("invalid_input", "expected public key must be 32 bytes"), e.length > xo - 1 - sf && xe("packet_too_large", `message of ${e.length} bytes cannot fit a ${xo}-byte transaction`);
  const n = new Uint8Array(e), r = di(new Uint8Array(t)), i = new c_(n), o = i.u8("message prefix");
  let s = "legacy", a = o;
  if ((o & af) !== 0) {
    const B = o & ~af;
    B !== 0 && xe("unsupported_version", `Solana message version ${B} is not supported`), s = "v0", a = i.u8("required signature count");
  }
  const c = i.u8("read-only signed account count"), l = i.u8("read-only unsigned account count"), u = i.compactU16("account key count"), d = i.take(u * ii, "account keys"), f = Array.from({ length: u }, (B, D) => di(d.subarray(D * ii, (D + 1) * ii))), h = di(i.take(o_, "recent blockhash")), y = [];
  for (let B = i.compactU16("instruction count"); B > 0; B -= 1) {
    const D = i.u8("instruction program id index"), L = i.take(i.compactU16("instruction account count"), "instruction account indexes"), x = i.take(i.compactU16("instruction data length"), "instruction data");
    y.push({ programIdIndex: D, accountIndexes: L, data: x });
  }
  const w = [];
  if (s === "v0")
    for (let B = i.compactU16("address table lookup count"); B > 0; B -= 1) {
      const D = i.take(ii, "address table key"), L = i.take(i.compactU16("writable lookup index count"), "writable lookup indexes"), x = i.take(i.compactU16("read-only lookup index count"), "read-only lookup indexes");
      w.push({ accountKey: D, writableIndexes: L, readonlyIndexes: x });
    }
  i.remaining !== 0 && xe("trailing_bytes", `${i.remaining} bytes follow the message`), a + l > u && xe("invalid_header", "header counts more signed and read-only unsigned accounts than the message carries"), c >= a && xe("invalid_header", "header leaves no writable signer to pay the fee");
  let p = 0, m = 0;
  for (const B of w)
    B.writableIndexes.length + B.readonlyIndexes.length === 0 && xe("invalid_address_table_lookup", "an address table lookup loads no account"), p += B.writableIndexes.length, m += B.readonlyIndexes.length;
  const S = u + p + m;
  S > cf && xe("invalid_address_table_lookup", `message addresses ${S} accounts; the limit is ${cf}`);
  for (const B of y) {
    (B.programIdIndex === 0 || B.programIdIndex >= u) && xe("invalid_program_id_index", `instruction program id index ${B.programIdIndex} is not a static non-payer key`);
    for (const D of B.accountIndexes)
      D >= S && xe("invalid_account_index", `instruction account index ${D} is outside the message's ${S} accounts`);
  }
  const E = s_(a) + a * sf + n.length;
  E > xo && xe("packet_too_large", `signed transaction would be ${E} bytes; the limit is ${xo}`);
  const P = f.indexOf(r);
  (P === -1 || P >= a) && xe("signer_not_required", "the expected key is not a required signer of this message");
  const I = f.map((B, D) => ({
    index: D,
    address: B,
    signer: D < a,
    writable: D < a ? D < a - c : D < u - l
  })), R = w.map((B) => ({
    accountKey: di(B.accountKey),
    writableIndexes: Array.from(B.writableIndexes),
    readonlyIndexes: Array.from(B.readonlyIndexes)
  })), U = (B) => {
    if (B < u) return { source: "static", ...I[B] };
    const D = B - u < p;
    let L = B - u - (D ? 0 : p);
    for (const [x, v] of R.entries()) {
      const b = D ? v.writableIndexes : v.readonlyIndexes;
      if (L < b.length)
        return { source: "lookup", index: B, lookupIndex: x, accountKey: v.accountKey, tableIndex: b[L], writable: D };
      L -= b.length;
    }
    throw new Error("account index was validated against the lookup tables");
  }, H = y.map((B, D) => {
    const L = f[B.programIdIndex], x = Array.from(B.accountIndexes, U);
    return {
      index: D,
      programIdIndex: B.programIdIndex,
      programId: L,
      accounts: x,
      dataHex: lf(B.data),
      ...OS(L, x, B.data)
    };
  });
  return eg({
    version: s,
    messageHex: lf(n),
    messageLength: n.length,
    transactionLength: E,
    header: { numRequiredSignatures: a, numReadonlySignedAccounts: c, numReadonlyUnsignedAccounts: l },
    feePayer: f[0],
    expectedSigner: { index: P, address: r, isFeePayer: P === 0 },
    staticAccountKeys: I,
    recentBlockhash: h,
    instructions: H,
    addressTableLookups: R,
    hasUndecodedContent: R.length > 0 || H.some((B) => B.decoded === null)
  });
}
function vr(e, t) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new A("invalid_payload", `${t} must be an object`);
  return e;
}
function ko(e, t) {
  if (typeof e != "string" || e.length === 0) throw new A("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function ui(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new A("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function Yl(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) Yl(t);
    Object.freeze(e);
  }
  return e;
}
function Xl(e, t) {
  if (Ro(e), t && typeof t == "object") {
    const n = t.release;
    Ro(n), n && typeof n == "object" && Ro(n.signingContext);
  }
}
function tg(e) {
  const t = vr(e, "sign request");
  Xl(t.signingContext, t.context), Vr(t);
  const n = vr(structuredClone(t), "sign request");
  ui(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = vr(n.material, "material");
  ui(r, ["name", "envelope"], "material");
  const i = vr(r.envelope, "envelope");
  ui(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = Tl(n.context);
  ui(vr(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = cl(n.scheme);
  } catch {
    throw new A("invalid_payload", "unsupported signing scheme");
  }
  const a = vr(n.signingContext, "signingContext");
  return a.kind === "solana-transaction-v1" && Js(a), Yl({
    material: {
      name: ko(r.name, "material.name"),
      envelope: {
        ciphertext: ko(i.ciphertext, "envelope.ciphertext"),
        nonce: ko(i.nonce, "envelope.nonce"),
        wrap_meta: ko(i.wrap_meta, "envelope.wrap_meta")
      }
    },
    scheme: s,
    signingContext: a,
    context: o
  });
}
function xt() {
  throw new A("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request");
}
function ng(e, t, n) {
  Xl(e.signingContext, e.context), bs({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && xt();
  const i = t.kind === "message";
  !i && (t.kind !== "digest" || !/^[0-9a-f]{64}$/.test(t.digest)) && xt();
  const o = On(e.material.envelope).recordMetadata, s = o?.kind === "hd-seed" ? Zl(e, o) : void 0;
  if (s && s.publicKey !== n && xt(), ui(r, ["name", "scheme", i ? "messageHex" : "digest", "publicKey", "signingContext", ...s ? ["derivation", "signingKey"] : []], "sign context.release"), i) {
    const a = Js(e.signingContext);
    (t.messageHex !== a.messageHex || r.messageHex !== t.messageHex || e.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(n) || r.publicKey !== n) && xt();
  } else (e.scheme === "ed25519" || e.signingContext.kind === "solana-transaction-v1" || r.digest !== t.digest) && xt();
  (r.name !== e.material.name || r.scheme !== e.scheme || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || ue(r.signingContext) !== ue(e.signingContext)) && xt();
}
function d_(e) {
  return Xl(e.signingContext, e.context), ae(new TextEncoder().encode(Gs(e.context)));
}
function u_(e, t) {
  if (cl(e), e === "ed25519") throw new Error("Ed25519 exact-message signing is reviewed structurally and has no prose description");
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === al ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === Ei ? G("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === Ls ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function f_(e, t) {
  const n = Js(e.signingContext);
  ng(e, { kind: "message", messageHex: n.messageHex }, t);
  let r;
  try {
    r = l_(Kc(n.messageHex), Xe(t));
  } catch (i) {
    throw i instanceof Qw ? new A("invalid_payload", `Solana message cannot be signed (${i.code}): ${i.message}`) : i;
  }
  return r.messageHex !== n.messageHex && xt(), { payload: { kind: "message", messageHex: r.messageHex }, review: XS(r) };
}
function h_(e, t) {
  const n = e.signingContext;
  n.kind === "solana-transaction-v1" && xt();
  let r = xS(n);
  if (n.kind === "bitcoin-taproot-keypath-v1") {
    if (e.scheme !== Ei)
      throw new A("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (e.scheme === Ei)
      throw new A("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (n.kind !== "avault-agent-operation" && e.scheme !== Ls && e.scheme !== sl)
      throw new A("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  let i;
  if (n.kind === "bitcoin-taproot-keypath-v1") {
    const o = Cw(n, r.digest, t);
    r = { digest: o.digest, challenge: r.challenge, display: o.display }, i = o.facts;
  }
  return ng(e, { kind: "digest", digest: r.digest }, t), {
    payload: { kind: "digest", digest: r.digest },
    display: `${u_(e.scheme, t)}
scheme: ${e.scheme}
${r.display}`,
    ...r.evm ? { review: t_(r.evm, { publicKey: t, scheme: e.scheme, digest: r.digest }) } : {},
    ...i ? { review: n_(i, { scheme: e.scheme, digest: r.digest }) } : {},
    ...p_(r.typedData, { publicKey: t, scheme: e.scheme, digest: r.digest })
  };
}
function p_(e, t) {
  if (e === void 0) return {};
  try {
    const n = KS(e, t);
    return ky(JSON.parse(JSON.stringify(n))), { review: n };
  } catch {
    return {};
  }
}
function rg(e) {
  const t = On(e.material.envelope), n = Ds(e.material.name, t.recordMetadata), r = t.recordMetadata?.kind === "hd-seed" ? Zl(e, t.recordMetadata) : void 0, i = r ? {
    name: e.material.name,
    kind: "keypair",
    publicKey: r.publicKey,
    ...r.selection.chain === "solana" ? { curve: "ed25519" } : {}
  } : n;
  kS(e.scheme, e.signingContext, i);
  const o = i.publicKey, s = e.signingContext.kind === "solana-transaction-v1" ? f_(e, o) : h_(e, o);
  if (r) {
    const a = `#${r.selection.account} · ${r.path}${r.selection.chain === "bitcoin" ? " · Taproot" : ""}`;
    if (s.review) {
      const c = [{ label: "review.field.walletAccount", value: a }];
      s.review = { ...s.review, summary: [...s.review.summary, ...c], details: [{ title: "review.group.hdAccount", fields: c }, ...s.review.details] };
    } else if (typeof s.display == "string") {
      const c = zs(r.publicKey).eth;
      (!c || r.selection.chain !== "evm") && xt(), s.display = `${G("review.field.walletAccount")}: ${a}
${G("review.field.signingAddress")}: ${c}

${s.display}`;
    }
  }
  return { unpacked: t, recordContext: n, content: s, ...r ? { hd: r } : {} };
}
function y_(e) {
  const t = tg(e), { unpacked: n, recordContext: r, content: i } = rg(t), o = d_(t);
  return Yl({ request: t, verified: i, unpacked: n, recordContext: r, challenge: [...o], ...n.recordMetadata?.kind === "hd-seed" ? { hd: Zl(t, n.recordMetadata) } : {} });
}
async function ig(e, t, n) {
  const r = tg(e.request), i = rg(r);
  (!e.verified || ue(e.verified.payload) !== ue(i.content.payload)) && xt();
  const o = await as(n, t);
  return Gn({ context: r.context, rootMetadata: o, expectedPurpose: "sign" }), Ii([r.context]), i.hd && await Jw({ sealed: i.unpacked.sealed, vmk: t, context: i.recordContext, identity: i.hd }, () => {
  }), { request: r, ...i };
}
async function df(e, t, n) {
  return (await ig(e, t, n)).content;
}
async function uf(e, t, n) {
  const { request: r, content: i, unpacked: o, recordContext: s, hd: a } = await ig(e, t, n);
  return a ? r_({ request: r, sealed: o.sealed, vmk: t, context: s, identity: a, payload: i.payload }) : i.payload.kind === "message" ? vx(o.sealed, t, s, i.payload.messageHex) : bx(o.sealed, t, s, i.payload.digest, r.scheme);
}
function og(e, t = e.label) {
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
function w_(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: oe(t) } : {}
  };
}
function vc(e, t) {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", `${t} must be an object`);
  return e;
}
function Wn(e, t) {
  if (typeof e == "string" && e.length > 0) return e;
  if (typeof e != "object" || e === null) throw new A("invalid_payload", `${t} must be a text spec`);
  const n = e;
  if (typeof n.text == "string") return we(n.text);
  if (typeof n.key == "string") {
    const r = n.params;
    if (r !== void 0 && (typeof r != "object" || r === null || Array.isArray(r)))
      throw new A("invalid_payload", `${t}.params must be an object`);
    return {
      key: n.key,
      ...r !== void 0 ? { params: r } : {}
    };
  }
  throw new A("invalid_payload", `${t} must be a text spec`);
}
function g_(e) {
  const t = vc(e, "details");
  if (!Array.isArray(t.rows)) throw new A("invalid_payload", "details must contain rows");
  const n = [];
  for (const [r, i] of t.rows.entries()) {
    const o = vc(i, `details.rows[${r}]`), s = o.variant;
    if (s !== void 0 && s !== "text" && s !== "command" && s !== "mono" && s !== "chips")
      throw new A("invalid_payload", `details.rows[${r}].variant is invalid`);
    const a = Wn(o.label, `details.rows[${r}].label`);
    if (s === "chips") {
      if (!Array.isArray(o.values)) throw new A("invalid_payload", `details.rows[${r}].values must be an array`);
      const c = o.tone;
      if (c !== void 0 && c !== "default" && c !== "warning")
        throw new A("invalid_payload", `details.rows[${r}].tone is invalid`);
      const l = c === "default" || c === "warning" ? c : void 0;
      n.push({
        label: a,
        values: o.values.map((u, d) => Wn(u, `details.rows[${r}].values[${d}]`)),
        variant: "chips",
        ...l !== void 0 ? { tone: l } : {}
      });
      continue;
    }
    n.push({
      label: a,
      value: Wn(o.value, `details.rows[${r}].value`),
      ...s !== void 0 ? { variant: s } : {}
    });
  }
  return { rows: n };
}
function m_(e) {
  try {
    return ky(e);
  } catch (t) {
    throw new A("invalid_payload", t instanceof Error ? t.message : "signing review is malformed");
  }
}
function b_(e) {
  const t = vc(e, "authorization prompt");
  if (t.challenge !== void 0 && (typeof t.challenge != "string" || t.challenge.length === 0))
    throw new A("invalid_payload", "prompt.challenge must be a non-empty string");
  if (t.reviewSession !== void 0 && typeof t.reviewSession != "string")
    throw new A("invalid_payload", "prompt.reviewSession must be a string");
  const n = t.challenge === void 0 ? void 0 : be(t.challenge);
  return {
    title: Wn(t.title, "prompt.title"),
    subtitle: Wn(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Wn(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: g_(t.details) } : {},
    ...t.review !== void 0 ? { review: m_(t.review) } : {},
    ...t.reviewSession !== void 0 ? { reviewSession: t.reviewSession } : {},
    ...n ? { challenge: n } : {},
    label: Wn(t.label, "prompt.label")
  };
}
const ff = 320, hf = 220, v_ = 6e4, x_ = 1e3;
function k_(e, t = {}) {
  if (e.uiShowPending) return { ok: !1, code: "sandbox_not_visible", detail: "ui show is still pending" };
  if (!e.documentVisible) return { ok: !1, code: "sandbox_not_visible", detail: "document is not visible" };
  if ((t.requireFocus ?? !0) && !e.documentFocused)
    return { ok: !1, code: "sandbox_not_visible", detail: "document is not focused" };
  if (e.frameWidth < ff || e.frameHeight < hf)
    return { ok: !1, code: "sandbox_not_visible", detail: "sandbox frame is too small" };
  if (!e.visibleByIntersectionObserver || e.intersectionRatio < 0.99)
    return { ok: !1, code: "sandbox_not_visible", detail: "sandbox frame is not fully visible" };
  const n = [];
  if (e.embedded) {
    const r = e.parent;
    r ? (r.ageMs > v_ && n.push("parent frame visibility is stale"), (r.frameWidth < ff || r.frameHeight < hf) && n.push("parent frame is too small"), (!r.visibleByIntersectionObserver || r.intersectionRatio < 0.99) && n.push("parent frame is not fully visible"), (r.opacity < 0.99 || !r.pointerEvents) && n.push("parent frame is visually occluded")) : n.push("parent frame visibility is not attested");
  }
  return n.length > 0 ? { ok: !0, warnings: n } : { ok: !0 };
}
function pf(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function Un(e) {
  if (typeof e == "number") return Number.isFinite(e) ? e : void 0;
  if (typeof e != "string" || e.trim() === "") return;
  const t = Number(e);
  return Number.isFinite(t) ? t : void 0;
}
function xr(e) {
  const t = Un(e);
  if (t !== void 0) return t;
  if (typeof e != "string" || e.trim() === "") return;
  const n = Date.parse(e);
  return Number.isFinite(n) ? n : void 0;
}
function Na(e) {
  return typeof e == "boolean" ? e : void 0;
}
function E_(e) {
  if (typeof e == "boolean") return e;
  if (typeof e == "string")
    return e.toLowerCase() !== "none";
}
function A_(e) {
  if (!e) return;
  const t = pf(e.value);
  if (!t) return;
  const n = pf(t.frame) ?? t, r = Un(n.frameWidth) ?? Un(n.width), i = Un(n.frameHeight) ?? Un(n.height), o = Un(n.intersectionRatio), s = Na(n.visibleByIntersectionObserver) ?? Na(n.isVisible) ?? Na(n.visible), a = Un(n.opacity), c = E_(n.pointerEvents), l = xr(t.sampledAt) ?? xr(t.measuredAt) ?? xr(t.timestamp) ?? xr(n.sampledAt) ?? xr(n.measuredAt) ?? xr(n.timestamp);
  if (r === void 0 || i === void 0 || o === void 0 || s === void 0 || a === void 0 || c === void 0 || l === void 0)
    return;
  const u = Date.now();
  if (!(l > u + x_))
    return {
      frameWidth: r,
      frameHeight: i,
      intersectionRatio: o,
      visibleByIntersectionObserver: s,
      opacity: a,
      pointerEvents: c,
      ageMs: Math.max(0, u - l)
    };
}
function sg(e) {
  const t = e.visibilityTarget ?? document.body ?? document.documentElement;
  let n = { ratio: 0, visible: !1 }, r = !1, i = !1, o, s;
  const a = () => ({
    documentVisible: document.visibilityState === "visible",
    documentFocused: typeof document.hasFocus == "function" ? document.hasFocus() : !1,
    frameWidth: window.innerWidth,
    frameHeight: window.innerHeight,
    intersectionRatio: n.ratio,
    visibleByIntersectionObserver: n.visible,
    uiShowPending: e.uiShowPending(),
    embedded: window.parent !== window,
    parent: A_(e.parentSurface?.())
  }), c = (y) => {
    const w = a(), p = k_(w, { requireFocus: y });
    if (!p.ok) throw new A(p.code, p.detail, !0);
    if (e.requireParentSurface && w.embedded && (p.warnings?.length ?? 0) > 0)
      throw new A("sandbox_not_visible", p.warnings[0], !0);
    for (const m of p.warnings ?? []) console.warn(`[vault-sandbox] Confirm surface advisory: ${m}`);
  }, l = () => c(!0), u = new Promise((y, w) => {
    o = y, s = w;
  }), d = () => {
    if (!(i || r)) {
      i = !0;
      try {
        c(!1), o();
      } catch (y) {
        s(y);
      }
    }
  }, f = typeof IntersectionObserver > "u" ? null : new IntersectionObserver(
    (y) => {
      const w = y[0], p = w?.isVisible;
      n = w ? {
        ratio: w.intersectionRatio,
        visible: p === void 0 ? w.intersectionRatio >= 0.99 : p === !0
      } : { ratio: 0, visible: !1 }, d();
    },
    {
      threshold: [0, 0.99, 1],
      trackVisibility: !0,
      delay: 100
    }
  );
  f?.observe(t);
  const h = setTimeout(d, 250);
  return {
    ready: u,
    assertCurrent: l,
    dispose: () => {
      r || (r = !0, clearTimeout(h), f?.disconnect());
    }
  };
}
function ag(e) {
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
async function S_(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await fl(t, e.vmk, n);
    return { envelope: hl(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function __(e) {
  const t = jr(e.curve), n = mx(t);
  let r = n.privateKey;
  try {
    const i = {
      name: e.name,
      kind: "keypair",
      publicKey: n.publicKey,
      ...t === "ed25519" ? { curve: t } : {}
    }, o = await fl(r, e.vmk, i);
    return {
      envelope: hl(o, e.wrapMeta, i),
      publicKey: n.publicKey,
      addresses: t === "ed25519" ? { solana: xx(n.publicKey) } : zs(n.publicKey)
    };
  } finally {
    r?.fill(0), r = void 0;
  }
}
function Jl(e) {
  return (e?.kind ?? "static") === "static";
}
function I_(e, t) {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: Tl(n.context)
  };
}
function cg(e) {
  const t = e[0]?.context.display;
  if (!t) throw new A("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new A("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = Bu(e[0].context), r = yf(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new A("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if (Bu(s.context) !== n)
      throw new A("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (yf(s.context) !== r)
      throw new A("invalid_context", "approveRelease batch contexts must share one signed recipient");
  }
  const i = new Set(t.secrets.map((s) => `${s.name}:${s.kind}`));
  for (const s of e) {
    const { recordMetadata: a } = On(s.material.envelope), c = a?.kind ?? "static";
    if (!i.has(`${s.material.name}:${c}`))
      throw new A("invalid_context", "signed display block does not cover every release item");
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
function yf(e) {
  if (!e.grantId) throw new A("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new A("invalid_context", "agent delivery context is missing agent key");
  return ue({ agent: e.agent, grantId: e.grantId });
}
async function B_(e) {
  if (e.items.length === 0) throw new A("invalid_payload", "approveRelease requires at least one item");
  const t = cg(e.items), n = await as(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    Gn({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  Ii(r, e.now);
  const i = await q2(r);
  await e.confirm({
    ...t,
    challenge: i
  });
  const o = e.now ?? Date.now();
  for (const a of e.items)
    Gn({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: o
    });
  e.onApprovalAccepted?.(o), Ii(r, o);
  const s = [];
  for (const a of e.items) {
    const { sealed: c, recordMetadata: l } = On(a.material.envelope);
    if (!Jl(l)) throw new A("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await gx(
        c,
        e.vmk,
        V2(a.context),
        Ds(a.material.name, l),
        await j2(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await Bi(r, o), { blindBoxes: s };
}
const wf = "vault-signing-policy-downgrade", $_ = `avibe:vault:signing-policy-downgrade:v1
`, Sr = 65536, T_ = /^[A-Za-z0-9_-]{1,80}$/, gf = ["eth", "btc_legacy", "btc_segwit", "btc_taproot", "solana"];
function Q(e) {
  throw new A("policy_context_invalid", e);
}
function xn(e, t, n) {
  (e === null || typeof e != "object" || Array.isArray(e) || Object.getPrototypeOf(e) !== Object.prototype && Object.getPrototypeOf(e) !== null) && Q(`${n} must be an object`);
  const r = e;
  return (Object.keys(r).length !== t.length || !t.every((i) => Object.hasOwn(r, i))) && Q(`${n} has missing or unknown fields`), r;
}
function xc(e, t) {
  return (typeof e != "string" || e.length === 0) && Q(`${t} must be a nonempty string`), e;
}
function Da(e, t) {
  return (typeof e != "string" || !T_.test(e)) && Q(`${t} is not a valid ID`), e;
}
function kn(e, t, n) {
  (typeof e != "string" || e.length > 4 * Math.ceil(n / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) && Q("noncanonical policy base64");
  const r = be(e);
  return (r.length < t || r.length > n || oe(r) !== e) && Q("policy base64 length or padding is invalid"), r;
}
const P_ = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function O_(e) {
  let t = 0n;
  for (const i of e) {
    const o = P_.indexOf(i);
    o < 0 && Q("invalid Base58 address"), t = t * 58n + BigInt(o);
  }
  const n = [];
  for (; t > 0n; )
    n.push(Number(t & 255n)), t >>= 8n;
  const r = /^1*/.exec(e)[0].length;
  return Uint8Array.from([...new Array(r).fill(0), ...n.reverse()]);
}
const mf = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function bf(e, t, n) {
  (!e.startsWith(`bc1${mf[t]}`) || e.length !== (n === 20 ? 42 : 62)) && Q("invalid mainnet witness address");
  const r = [...e.slice(4, -6)].map((c) => {
    const l = mf.indexOf(c);
    return l < 0 && Q("invalid Bech32 address character"), l;
  });
  let i = 0, o = 0;
  const s = [];
  for (const c of r)
    i = (i << 5 | c) & 65535, o += 5, o >= 8 && (o -= 8, s.push(i >>> o & 255));
  (o >= 5 || (i & (1 << o) - 1) !== 0 || s.length !== n) && Q("noncanonical witness address padding");
  const a = Uint8Array.from(s);
  return ic("bc", t, a) !== e && Q("invalid witness address checksum"), a;
}
function R_(e, t) {
  if (e === null) return null;
  const n = xc(e, `addresses.${t}`);
  if (n.length > 128 && Q("policy address is too long"), t === "eth")
    (!/^0x[0-9a-fA-F]{40}$/.test(n) || `0x${ey(n.slice(2))}` !== n) && Q("noncanonical EIP-55 address");
  else if (t === "btc_segwit") bf(n, 0, 20);
  else if (t === "btc_taproot") bf(n, 1, 32);
  else {
    const r = O_(n);
    t === "solana" ? (r.length !== 32 || di(r) !== n) && Q("noncanonical Solana address") : (r.length !== 25 || r[0] !== 0 || Jp(r.slice(0, 21)) !== n) && Q("invalid mainnet P2PKH address");
  }
  return n;
}
function C_(e) {
  return $_ + ue(e);
}
function lg(e) {
  return ae(new TextEncoder().encode(C_(e)));
}
function $n(e, t = Date.now()) {
  const n = Date.parse(e.expiresAt) - t;
  if (Number.isFinite(n) || Q("invalid policy expiry"), n <= 0) throw new A("policy_context_expired", "policy context has expired", !0);
  if (n > 15e4) throw new A("policy_context_clock_skew", "check this device's clock and retry", !0);
  return n;
}
function dg(e, t, n = Date.now()) {
  try {
    const r = JSON.stringify(e);
    (r === void 0 || r.length > Sr) && Q("policy context exceeds its size bound"), Vr(e);
    const i = xn(e, ["v", "purpose", "challengeId", "nonce", "expiresAt", "rpId", "origin", "target", "change", "factors"], "context");
    (i.v !== 1 || i.purpose !== wf) && Q("unsupported policy context version or purpose"), (i.origin !== t.origin || i.rpId !== t.hostname) && Q("policy origin or RP does not match this sandbox");
    const o = xc(i.expiresAt, "expiresAt"), s = Date.parse(o);
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(o) || !Number.isFinite(s) || new Date(s).toISOString() !== o) && Q("policy expiry must be an exact UTC millisecond date"), kn(i.nonce, 32, 32);
    const a = xn(i.target, ["secretId", "name", "protection", "signerKind", "account", "accountName", "addresses", "identitySha256"], "target");
    a.protection !== "standard" && a.protection !== "protected" && Q("invalid protection tier"), a.signerKind !== "local" && a.signerKind !== "hd-seed" && Q("unsupported signer kind"), (typeof a.identitySha256 != "string" || !/^[0-9a-f]{64}$/.test(a.identitySha256)) && Q("invalid identity digest");
    const c = xn(a.addresses, gf, "addresses"), l = Object.fromEntries(gf.map((w) => [w, R_(c[w], w)]));
    if (a.signerKind === "hd-seed")
      (a.protection !== "standard" || typeof a.account != "number" || !Number.isSafeInteger(a.account) || a.account < 0 || a.account > 19) && Q("invalid shared HD account"), a.accountName !== null && (typeof a.accountName != "string" || [...a.accountName].length < 1 || [...a.accountName].length > 80) && Q("invalid HD account name"), (l.eth === null || l.btc_taproot === null || l.solana === null || l.btc_legacy !== null || l.btc_segwit !== null) && Q("invalid shared HD address set");
    else {
      (a.account !== null || a.accountName !== null) && Q("ordinary keys cannot carry an HD account");
      const w = l.eth !== null && l.btc_legacy !== null && l.btc_segwit !== null && l.btc_taproot !== null && l.solana === null, p = l.solana !== null && l.eth === null && l.btc_legacy === null && l.btc_segwit === null && l.btc_taproot === null;
      !w && !p && Q("invalid ordinary key address set");
    }
    const u = xn(i.change, ["field", "from", "to", "revision"], "change");
    (u.field !== "always_ask" || u.from !== !0 || u.to !== !1 || typeof u.revision != "string" || !/^(?:legacy|[0-9a-f]{32})$/.test(u.revision)) && Q("only true-to-false always_ask changes are supported"), (!Array.isArray(i.factors) || i.factors.length === 0) && Q("policy factors must be nonempty");
    const d = /* @__PURE__ */ new Set();
    let f = "";
    const h = i.factors.map((w) => {
      const p = xn(w, ["factorId", "credentialId"], "factor"), m = Da(p.factorId, "factorId");
      kn(p.credentialId, 1, 1023);
      const S = p.credentialId;
      return (m <= f || d.has(S)) && Q("policy factors must have unique credentials and sorted unique IDs"), f = m, d.add(S), { factorId: m, credentialId: S };
    }), y = {
      v: 1,
      purpose: wf,
      challengeId: Da(i.challengeId, "challengeId"),
      nonce: i.nonce,
      expiresAt: o,
      rpId: i.rpId,
      origin: i.origin,
      target: {
        secretId: Da(a.secretId, "secretId"),
        name: xc(a.name, "name"),
        protection: a.protection,
        signerKind: a.signerKind,
        account: a.account,
        accountName: a.accountName,
        addresses: l,
        identitySha256: a.identitySha256
      },
      change: { field: "always_ask", from: !0, to: !1, revision: u.revision },
      factors: h
    };
    return new TextEncoder().encode(ue(y)).length > Sr && Q("policy context exceeds its UTF-8 size bound"), $n(y, n), y;
  } catch (r) {
    if (r instanceof A) throw r;
    Q("policy context is not canonical JSON");
  }
}
function L_(e, t) {
  return dg(xn(e, ["context"], "payload").context, t);
}
function H_(e) {
  const t = $n(e), n = Math.min(12e4, Math.floor(t));
  if (n <= 0) throw new A("policy_context_expired", "policy context has expired", !0);
  return {
    challenge: new Uint8Array(lg(e)).buffer,
    rpId: e.rpId,
    userVerification: "required",
    timeout: n,
    allowCredentials: e.factors.map((r) => ({ type: "public-key", id: new Uint8Array(kn(r.credentialId, 1, 1023)).buffer }))
  };
}
function vf(e) {
  return oe(e).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function kc(e, t) {
  try {
    const n = xn(e, ["id", "rawId", "type", "response"], "assertion"), r = kn(n.rawId, 1, 1023);
    (n.type !== "public-key" || n.id !== vf(r) || !t.factors.some((l) => l.credentialId === n.rawId)) && Q("assertion does not identify a frozen factor");
    const i = xn(n.response, ["clientDataJSON", "authenticatorData", "signature", "userHandle"], "assertion.response"), o = kn(i.clientDataJSON, 1, Sr), s = JSON.parse(new TextDecoder("utf-8", { fatal: !0 }).decode(o));
    (s.type !== "webauthn.get" || s.challenge !== vf(lg(t)) || s.origin !== t.origin || s.crossOrigin !== void 0 && s.crossOrigin !== !1) && Q("assertion client data does not bind this policy context");
    const a = kn(i.authenticatorData, 37, Sr), c = ae(new TextEncoder().encode(t.rpId));
    return ((a[32] & 5) !== 5 || !a.slice(0, 32).every((l, u) => l === c[u])) && Q("assertion RP or UP/UV flags are invalid"), kn(i.signature, 1, Sr), i.userHandle !== null && kn(i.userHandle, 0, Sr), $n(t), { id: n.id, rawId: n.rawId, type: "public-key", response: { ...i } };
  } catch (n) {
    throw n instanceof A && n.code !== "policy_context_invalid" ? n : new A("authorization_result_invalid", "invalid policy assertion");
  }
}
async function U_(e, t) {
  if (t.aborted) throw t.reason;
  const n = await navigator.credentials.get({ publicKey: H_(e), signal: t });
  if (t.aborted) throw t.reason;
  if (!n) throw new Error("passkey-cancelled");
  return kc(yy(n), e);
}
function za(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new A("invalid_payload", "reveal material must be an object");
  return e;
}
function Eo(e) {
  if (typeof e != "string" || e.length === 0) throw new A("invalid_payload", "reveal material requires nonempty strings");
  return e;
}
function ug(e) {
  return e && typeof e == "object" && (Object.values(e).forEach(ug), Object.freeze(e)), e;
}
function N_(e) {
  const t = { ciphertext: e.ciphertext, nonce: e.nonce, wrap_meta: e.wrap_meta };
  return Vr(t), J(ae(new TextEncoder().encode(ue(t))));
}
function Co(e) {
  bs({ context: e.context, expectedPurpose: "reveal", secret: { name: e.material.name, kind: "static" } });
  const t = e.context.release, n = t?.envelopeHash;
  if (!t || t.name !== e.material.name || !n || typeof n != "object" || Array.isArray(n))
    throw new A("invalid_reveal_binding", "reveal approval does not bind this envelope");
  const r = n;
  if (Object.keys(r).length !== 2 || r.alg !== "sha256" || typeof r.digest != "string" || !/^[0-9a-f]{64}$/.test(r.digest) || r.digest !== N_(e.material.envelope))
    throw new A("invalid_reveal_binding", "reveal approval does not bind this envelope");
}
function D_(e) {
  Vr(e);
  const t = za(structuredClone(e)), n = za(t.material), r = za(n.envelope), i = ug({
    material: { name: Eo(n.name), envelope: {
      ciphertext: Eo(r.ciphertext),
      nonce: Eo(r.nonce),
      wrap_meta: Eo(r.wrap_meta)
    } },
    context: Tl(t.context)
  });
  return Co(i), i;
}
function fg(e) {
  const t = ns(e);
  if (t.v !== 1 || !Array.isArray(t.copies) || t.copies.length === 0 || ["record_meta", "dek_nonce", "wrapped_dek"].some((n) => Object.hasOwn(t, n)) || t.scheme !== void 0 && t.scheme !== "machine-aesgcm-v1") throw new Error("protected HD requires an existing base/root wrap");
  for (const n of t.copies) {
    const r = lt(n);
    if (r.kind !== "passkey" || r.kdf !== "webauthn-prf-hkdf-sha256" || r.credential_id !== void 0 && (typeof r.credential_id != "string" || r.credential_id.length === 0)) throw new Error("invalid protected HD passkey copy");
    Vn(r.prf_salt, [32]), Vn(r.nonce, [12]), Vn(r.wrapped, [48]);
  }
  return e;
}
function xf(e) {
  const t = ns(e);
  for (const n of ["scheme", "record_meta", "dek_nonce", "wrapped_dek"]) delete t[n];
  return ue(t);
}
function hg(e, t, n) {
  const r = lt(e);
  It(r, ["envelope", "accounts", "expectedAccount0"]);
  const i = lt(r.envelope);
  if (It(i, ["ciphertext", "nonce", "wrap_meta"]), typeof i.ciphertext != "string" || typeof i.nonce != "string" || typeof i.wrap_meta != "string") throw new Error("invalid protected HD envelope");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) throw new Error("invalid protected HD name");
  const o = i, s = On(o);
  if (s.recordMetadata?.kind !== "hd-seed" || xf(o.wrap_meta) !== xf(n)) throw new Error("protected HD result root mismatch");
  const a = Rs({ kind: "hd-seed", profile: es, accounts: r.accounts });
  if (ue(a) !== ue(s.recordMetadata)) throw new Error("protected HD result table mismatch");
  const c = lt(r.expectedAccount0);
  It(c, ["eth", "btc_legacy", "btc_segwit", "btc_taproot", "solana"]);
  const l = ol(a.accounts[0]);
  if (ue(c) !== ue(l)) throw new Error("protected HD result account0 mismatch");
  return { envelope: { ...o }, accounts: a.accounts, expectedAccount0: l };
}
async function z_(e) {
  e.assertCurrent(), fg(e.wrapMeta);
  const t = Np(e.words, e.passphrase);
  let n, r, i;
  try {
    const o = rc(t.seed);
    e.assertCurrent();
    const s = { kind: "hd-seed", profile: es, accounts: o }, a = Ds(e.name, s);
    n = T1(t);
    const c = await fl(n, e.vmk, a);
    e.assertCurrent();
    const u = { envelope: hl(c, e.wrapMeta, a), accounts: o, expectedAccount0: ol(o[0]) };
    r = await Di(c, e.vmk, a), e.assertCurrent(), i = Up(r);
    const d = (h, y) => h.length === y.length && h.every((w, p) => w === y[p]);
    if (!d(i.entropy, t.entropy) || !d(i.seed, t.seed) || i.passphraseRequired !== t.passphraseRequired || ue(rc(i.seed)) !== ue(o)) throw new Error("protected HD creation reopen mismatch");
    const f = hg(u, e.name, e.wrapMeta);
    return e.assertCurrent(), f;
  } finally {
    n?.fill(0), r?.fill(0), ts(i), ts(t);
  }
}
const pg = 3e5;
function yg(e) {
  try {
    const t = lt(e);
    if (It(t, ["name", "mode", "wrapMeta"]), typeof t.name != "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.name) || t.mode !== "create" && t.mode !== "import") throw new Error("invalid protected HD name/mode");
    return { name: t.name, mode: t.mode, wrapMeta: fg(t.wrapMeta) };
  } catch {
    throw new A("invalid_payload", "sealHdWallet requires only name, create/import mode and an existing base root");
  }
}
function rr(e) {
  const t = e.deadlineAt - Date.now();
  if (!Number.isSafeInteger(e.deadlineAt) || t <= 0 || t > pg) throw new A("authorization_window_timeout", "protected HD window expired", !0);
  return t;
}
function M_(e) {
  const t = lt(e);
  if (It(t, ["kind", "name", "mode", "wrapMeta", "deadlineAt"]), t.kind !== "protected-hd-wallet" || typeof t.deadlineAt != "number") throw new A("invalid_payload", "invalid protected HD window request");
  const r = { ...yg({ name: t.name, mode: t.mode, wrapMeta: t.wrapMeta }), kind: "protected-hd-wallet", deadlineAt: t.deadlineAt };
  return rr(r), Object.freeze(r);
}
function As(e, t) {
  try {
    const n = lt(e);
    if (It(n, ["kind", "envelope", "accounts", "expectedAccount0"]), n.kind !== "sealed-hd-wallet") throw new Error("invalid result kind");
    return rr(t), { kind: "sealed-hd-wallet", ...hg({ envelope: n.envelope, accounts: n.accounts, expectedAccount0: n.expectedAccount0 }, t.name, t.wrapMeta) };
  } catch (n) {
    throw n instanceof A ? n : new A("authorization_result_invalid", "protected HD result is invalid");
  }
}
async function K_(e, t, n) {
  const r = new AbortController(), i = () => t.reason instanceof Error ? t.reason : new A("authorization_cancelled", "protected HD operation cancelled", !0), o = () => r.abort(i());
  t.addEventListener("abort", o, { once: !0 }), t.aborted && o();
  const s = () => {
    if (r.signal.aborted) throw r.signal.reason;
    rr(e);
  };
  let a, c;
  const l = (u) => c ? Promise.reject(new A("authorization_result_invalid", "protected HD wallet is already being sealed")) : (c = (async () => {
    let d, f, h, y = [];
    try {
      s(), y = Ns(e.wrapMeta);
      const w = await js(y, Ot(), r.signal);
      d = w.prfOutput, f = w.prfSalt, s(), h = await Kp(e.wrapMeta, { kind: "passkey", prfOutput: d, prfSalt: f }), s();
      const p = await z_({ name: e.name, words: u.words, passphrase: u.passphrase, vmk: h, wrapMeta: e.wrapMeta, assertCurrent: s });
      if (s(), ue(p.accounts) !== ue(u.reviewedAccounts)) throw new A("authorization_result_invalid", "protected HD reviewed account table changed");
      a = As({ kind: "sealed-hd-wallet", ...p }, e);
    } finally {
      d?.fill(0), f?.fill(0), h?.fill(0), y.forEach((w) => w.prfSalt.fill(0)), u.words = "", u.passphrase = "", u.reviewedAccounts = [];
    }
  })(), c);
  try {
    if (s(), await n(e, r.signal, l), c && await c, s(), !a) throw new A("authorization_result_invalid", "protected HD wallet was not sealed");
    return As(a, e);
  } catch (u) {
    throw r.abort(u), c && await c.catch(() => {
    }), u;
  } finally {
    t.removeEventListener("abort", o);
  }
}
const F_ = [12, 15, 18, 21, 24], j_ = new Set(Ni);
function V_(e) {
  const t = il(e).split(" ").filter(Boolean);
  if (t.length === 0) return { key: "hd.phraseEmpty" };
  const n = t.findIndex((r) => !j_.has(r));
  return n >= 0 ? { key: "hd.phraseUnknown", params: { position: n + 1 } } : F_.includes(t.length) ? _1(t.join(" "), Ni) ? null : { key: "hd.phraseChecksum" } : { key: "hd.phraseCount", params: { count: t.length } };
}
function q_(e) {
  const t = new Uint32Array(1);
  return crypto.getRandomValues(t), t[0] % e;
}
function G_(e, t = q_) {
  const n = /* @__PURE__ */ new Set();
  for (; n.size < 3; ) n.add(1 + t(e.length));
  const r = [...n].sort((c, l) => c - l), i = new Set(r.map((c) => e[c - 1])), o = [...new Set(e)].filter((c) => !i.has(c)), s = /* @__PURE__ */ new Set(), a = () => {
    const c = o.length > 0 ? o : Ni.filter((u) => !i.has(u) && !s.has(u)), l = c.splice(t(c.length), 1)[0];
    return s.add(l), l;
  };
  return r.map((c) => {
    const l = e[c - 1], u = [l, a(), a()];
    for (let d = u.length - 1; d > 0; d -= 1) {
      const f = t(d + 1);
      [u[d], u[f]] = [u[f], u[d]];
    }
    return { position: c, options: u, answer: l };
  });
}
function Ze(e, t, n) {
  const r = document.createElement(e);
  return r.className = `${t} dynamic`, n !== void 0 && Z(r, n), r;
}
function wg(e) {
  const t = document.createElement(e);
  return t.className = e === "textarea" ? "field textarea" : "field", t.setAttribute("autocomplete", "off"), t.setAttribute("autocapitalize", "off"), t.setAttribute("autocorrect", "off"), t.setAttribute("spellcheck", "false"), t instanceof HTMLInputElement && (t.type = "password"), t;
}
function W_(e, t) {
  const n = Ze("label", "hd-field"), r = Ze("span", "hd-field-label", t), i = wg(e);
  return n.append(r, i), { wrap: n, input: i };
}
const kf = "http://www.w3.org/2000/svg", Z_ = ["M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"], Y_ = [
  "M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",
  "M14.084 14.158a3 3 0 0 1-4.242-4.242",
  "M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",
  "m2 2 20 20"
];
function X_(e) {
  const t = document.createElementNS(kf, "svg"), n = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true"
  };
  for (const [r, i] of Object.entries(n)) t.setAttribute(r, i);
  for (const r of e ? Y_ : Z_) {
    const i = document.createElementNS(kf, "path");
    i.setAttribute("d", r), t.append(i);
  }
  return t;
}
let J_ = 0;
function Ef(e) {
  const t = Ze("div", "hd-field"), n = `hd-passphrase-${++J_}`, r = Ze("label", "hd-field-label", e);
  r.htmlFor = n;
  const i = Ze("div", "hd-secret-row"), o = wg("input");
  o.id = n;
  const s = document.createElement("button");
  s.type = "button", s.className = "hd-reveal", s.setAttribute("aria-controls", n);
  const a = Ze("span", "hd-reveal-label"), c = (l) => {
    o.type = l ? "text" : "password", s.setAttribute("aria-pressed", String(l)), Z(a, l ? "hd.hidePassphrase" : "hd.showPassphrase"), s.textContent = "", s.append(X_(l), a);
  };
  return s.addEventListener("click", () => c(o.type === "password")), c(!1), i.append(o, s), t.append(r, i), { wrap: t, input: o, toggle: s, hide: () => c(!1) };
}
function Q_(e) {
  const t = ol(e), n = Ze("div", "hd-addresses"), r = [
    ["hd.reviewEvm", t.eth, Xn("evm", 0)],
    ["hd.reviewBitcoin", t.btc_taproot, Xn("bitcoin", 0)],
    ["hd.reviewSolana", t.solana, Xn("solana", 0)]
  ];
  for (const [i, o, s] of r) {
    const a = document.createElement("div");
    a.className = "hd-address";
    const c = document.createElement("span");
    c.className = "hd-address-label", Z(c, i);
    const l = document.createElement("span");
    l.className = "hd-address-value", l.textContent = o;
    const u = document.createElement("span");
    u.className = "hd-path", u.textContent = s, a.append(c, l, u), n.append(a);
  }
  return n;
}
const e3 = (e, t, n) => new Promise((r, i) => {
  const o = [];
  let s = [], a = "", c = !1, l = 0;
  const u = () => {
    for (const L of o.splice(0)) L();
  }, d = (...L) => (u(), l += 1, Vs(...L)), f = (L) => {
    c || (c = !0, t.removeEventListener("abort", h), u(), s = [], a = "", qs(), L());
  }, h = () => f(() => i(t.reason instanceof Error ? t.reason : new Error("operation-cancelled")));
  if (t.aborted) {
    h();
    return;
  }
  t.addEventListener("abort", h, { once: !0 });
  const y = e.mode === "create" ? 4 : 3, w = (L) => we(`${e.name} · ${L}/${y}`), p = (L, x, v = !1) => {
    const b = l;
    L.addEventListener("click", () => {
      if (!(c || b !== l))
        try {
          x();
        } catch (g) {
          f(() => i(g));
        }
    }, { once: v });
  }, m = () => {
    const L = Le("common.cancel");
    return L.classList.add("secondary"), p(L, () => f(() => i(new Error("operation-cancelled"))), !0), L;
  }, S = (L) => {
    o.push(() => {
      L.value = "";
    });
  }, E = (L) => {
    let x;
    const v = Np(s.join(" "), a);
    try {
      x = rc(v.seed);
    } finally {
      ts(v);
    }
    const b = d(
      e.mode === "create" ? "hd.reviewTitleCreate" : "hd.reviewTitleImport",
      w(y),
      e.mode === "create" ? "hd.reviewBodyCreate" : "hd.reviewBodyImport"
    );
    re(b.card, Q_(x[0])), re(b.card, Ze("p", "setup-status", "hd.passkeyNote"));
    const g = Ar(), k = Le("hd.saveCta"), _ = Le("hd.back");
    _.classList.add("secondary"), p(_, L, !0);
    const $ = m();
    p(k, () => {
      if (k.disabled) return;
      k.disabled = !0, _.disabled = !0, Z(g, "hd.working"), n({ words: s.join(" "), passphrase: a, reviewedAccounts: x }).then(() => f(r), (O) => f(() => i(O)));
    }), re(b.card, g), re(b.card, k), re(b.card, _), re(b.card, $);
  }, P = (L, x, v) => {
    const b = d("hd.passphraseTitle", w(L ? 3 : 2), L ? "hd.passphraseBody" : "hd.importPassphraseHint"), g = Ef("hd.passphrase"), k = L ? Ef("hd.passphraseConfirm") : void 0;
    g.input.value = a, k && (k.input.value = "");
    for (const O of k ? [g, k] : [g])
      S(O.input), o.push(O.hide);
    const _ = Ar();
    _.classList.add("hd-error");
    const $ = Le(a ? "hd.next" : "hd.skipNext");
    g.input.addEventListener("input", () => Z($, g.input.value ? "hd.next" : "hd.skipNext"));
    const T = Le("hd.back");
    T.classList.add("secondary"), p(T, () => {
      a = g.input.value, x();
    }, !0), p($, () => {
      if (k && g.input.value !== k.input.value) {
        Z(_, "hd.passphraseMismatch");
        return;
      }
      a = g.input.value, g.input.value = "", k && (k.input.value = ""), v();
    }), re(b.card, g.wrap), k && re(b.card, k.wrap), re(b.card, Ze("p", "setup-status", "hd.passphraseNotStored")), re(b.card, _), re(b.card, $), re(b.card, T), re(b.card, m());
  }, I = (L, x) => {
    const v = G_(s), b = /* @__PURE__ */ new Map(), g = d("hd.quizTitle", w(2), "hd.quizBody"), k = Ar();
    k.classList.add("hd-error");
    const _ = /* @__PURE__ */ new Map(), $ = Le("hd.next");
    $.classList.add("hd-gated"), $.disabled = !0;
    const T = () => {
      const C = v.find((N) => b.has(N.position) && b.get(N.position) !== N.answer);
      Z(k, C ? _n("hd.quizWrong", { position: C.position }) : we("")), $.disabled = !v.every((N) => b.get(N.position) === N.answer);
    };
    for (const C of v) {
      const N = Ze("div", "hd-quiz");
      N.setAttribute("role", "radiogroup");
      const K = Ze("span", "hd-field-label", _n("hd.quizPosition", { position: C.position }));
      K.id = `hd-quiz-${C.position}`, N.setAttribute("aria-labelledby", K.id), N.append(K);
      const z = C.options.map((M) => {
        const F = document.createElement("button");
        return F.type = "button", F.className = "hd-option", F.setAttribute("role", "radio"), F.setAttribute("aria-checked", "false"), F.textContent = M, p(F, () => {
          b.set(C.position, M), z.forEach((j) => {
            const q = j === F;
            j.setAttribute("aria-checked", String(q)), j.classList.remove("selected", "wrong"), q && j.classList.add(M === C.answer ? "selected" : "wrong");
          }), T();
        }), F;
      });
      N.append(...z), _.set(C.position, z), o.push(() => {
        N.textContent = "", C.answer = "", C.options.fill(""), b.clear(), _.clear();
      }), re(g.card, N);
    }
    const O = Le("hd.back");
    O.classList.add("secondary"), p(O, L, !0), p($, () => {
      $.disabled || !v.every((C) => b.get(C.position) === C.answer) || x();
    }), re(g.card, k), re(g.card, $), re(g.card, O), re(g.card, m());
  }, R = () => {
    const L = d("hd.wordsTitle", w(1), "hd.wordsBody"), x = Ze("ol", "hd-words");
    s.forEach((b, g) => {
      const k = document.createElement("li"), _ = document.createElement("span");
      _.className = "hd-word-index", _.textContent = String(g + 1);
      const $ = document.createElement("span");
      $.textContent = b, k.append(_, $), x.append(k);
    }), o.push(() => {
      x.textContent = "";
    });
    const v = Le("hd.wordsWritten");
    p(v, B, !0), re(L.card, x), re(L.card, v), re(L.card, m());
  }, U = () => {
    const L = d("hd.importTitle", w(1), "hd.importBody"), x = W_("textarea", "hd.importWords");
    x.input.value = s.join(" "), S(x.input);
    const v = Ar();
    v.classList.add("hd-error");
    const b = Le("hd.next");
    p(b, () => {
      const g = V_(x.input.value);
      if (g) {
        Z(v, _n(g.key, g.params));
        return;
      }
      s = il(x.input.value).split(" "), x.input.value = "", D();
    }), re(L.card, x.wrap), re(L.card, v), re(L.card, b), re(L.card, m());
  };
  function H() {
    P(!0, B, () => E(H));
  }
  function B() {
    I(R, H);
  }
  function D() {
    P(!1, U, () => E(D));
  }
  try {
    if (e.mode === "create") {
      const L = new Uint8Array(16);
      try {
        crypto.getRandomValues(L), s = P1(L).split(" ");
      } finally {
        L.fill(0);
      }
      R();
    } else
      U();
  } catch (L) {
    f(() => i(L));
  }
}), gg = `avibe-vault-setup:v1:${de.buildHash}:`, t3 = `avibe-vault-setup-result:${de.buildHash}:`, n3 = `avibe-vault-setup-error:${de.buildHash}:`, r3 = 300 * 1e3, i3 = 300 * 1e3, o3 = 30 * 1e3, s3 = 8 * 1e3, Te = new Cg();
let Af = !1;
function a3(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function mg(e) {
  if (!a3(e))
    throw new A("invalid_payload", "appearance must include locale and theme");
  return e;
}
function c3(e) {
  return e == null ? null : mg(e);
}
function ea(e) {
  const t = c2(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && f2();
}
function bg() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: l2(), theme: e };
}
function Pt(e) {
  if (typeof e != "object" || e === null)
    throw new A("invalid_payload", "request payload must be an object");
  return e;
}
function vg(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new A("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function Ue(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new A("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function xg(e, t) {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", `${t} must be an object`);
  return e;
}
function l3(e) {
  const t = xg(e, "envelope");
  return {
    ciphertext: Ue(t.ciphertext, "envelope.ciphertext"),
    nonce: Ue(t.nonce, "envelope.nonce"),
    wrap_meta: Ue(t.wrap_meta, "envelope.wrap_meta")
  };
}
function d3(e) {
  const t = xg(e, "material");
  return { name: Ue(t.name, "material.name"), envelope: l3(t.envelope) };
}
function u3(e) {
  const t = e == null ? {} : Pt(e);
  return { wrapMeta: vg(t.wrapMeta, "wrapMeta") };
}
function kg(e) {
  const t = Pt(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new A("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: Ue(t.vaultUserHandle, "vaultUserHandle"),
    displayName: Ue(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: bl(t.policy) } : {}
  };
}
function f3(e) {
  const t = Pt(e);
  return {
    wrapMeta: Ue(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: bl(t.policy) } : {}
  };
}
function h3(e) {
  const t = Pt(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new A("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => I_(n, d3)) };
}
function p3(e) {
  const t = Pt(e);
  if (t.operation !== "delete_secret") throw new A("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: Ue(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: Ue(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function Eg() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function Sf(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function y3(e) {
  return new Promise((t, n) => {
    const r = () => {
      n(cr(e));
    };
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function w3(e) {
  for (const t of e)
    if (t.aborted) return cr(t);
  return new Error("operation-superseded");
}
function Ql(e) {
  const t = new AbortController(), n = [], r = (i) => {
    t.signal.aborted || t.abort(cr(i));
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
async function Ag(e) {
  const t = Ql(e.abortSignals);
  try {
    await Promise.race([
      r2(Ns(e.wrapMeta), Ot(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? w3(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => y3(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function ta(e) {
  await or(async (t) => {
    const n = async (i) => {
      const o = Ql([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await ed(
          {
            prompt: _f(e),
            wrapMeta: e.wrapMeta,
            passkey: e.passkey
          },
          o.signal,
          i
        );
        if (e.passkey === "unlock") {
          if (s.kind !== "unlock") throw new Error("authorization unlock result is missing");
          await Iy({
            wrapMeta: e.wrapMeta,
            currentRpId: Ot(),
            assertion: {
              prfOutput: be(s.prfOutput),
              prfSalt: be(s.prfSalt)
            },
            abortSignal: o.signal,
            ...e.policy ? { policy: e.policy } : {},
            ...e.onUnlocked ? { onCommitted: e.onUnlocked } : {}
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
    await _i(og(_f(e), "common.continue"), t, void 0, n);
  });
}
function _f(e) {
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
function g3(e) {
  return "kind" in e ? e : {
    ...e,
    prompt: w_(e.prompt)
  };
}
function m3(e) {
  const t = Pt(e);
  if (!t) throw new A("invalid_payload", "authorization request must be an object");
  if (t.kind === "protected-hd-wallet") return M_(t);
  if (t.kind === "signing-policy-downgrade") {
    if (Object.keys(t).length !== 2 || !Object.hasOwn(t, "context"))
      throw new A("invalid_payload", "policy authorization request has unknown fields");
    return {
      kind: "signing-policy-downgrade",
      context: dg(t.context, {
        origin: window.location.origin,
        hostname: window.location.hostname
      })
    };
  }
  if (t.kind !== void 0) throw new A("invalid_payload", "authorization request kind is invalid");
  const n = t.passkey;
  if (n !== "none" && n !== "unlock" && n !== "uv")
    throw new A("invalid_payload", "authorization passkey requirement is invalid");
  return {
    prompt: b_(t.prompt),
    wrapMeta: Ue(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function b3(e) {
  return Tf("authorize", e, bg());
}
function v3(e, t) {
  const n = Pt(e);
  if (!n) throw new A("authorization_result_invalid", "authorization result is invalid");
  if ("kind" in t) {
    if (t.kind === "protected-hd-wallet") return As(n, t);
    if (t.kind !== "signing-policy-downgrade")
      throw new A("authorization_result_invalid", "authorization request kind is invalid");
    if (n.kind !== "assertion" || !Object.hasOwn(n, "assertion"))
      throw new A("authorization_result_invalid", "policy authorization result kind is invalid");
    return { kind: "assertion", assertion: n.assertion };
  }
  if (n.kind === "confirmed") return { kind: "confirmed" };
  if (n.kind === "unlock")
    return {
      kind: "unlock",
      prfOutput: Ue(n.prfOutput, "result.prfOutput"),
      prfSalt: Ue(n.prfSalt, "result.prfSalt")
    };
  throw new A("authorization_result_invalid", "authorization result kind is invalid");
}
function ed(e, t, n) {
  Zn(t);
  const r = "kind" in e && e.kind === "protected-hd-wallet" ? e : void 0;
  r && rr(r);
  const i = n ?? Eg(), o = `avibe-vault-authorization-${i}`;
  return new Promise((s, a) => {
    let c = null, l = !1, u = null, d = null, f = null, h = null;
    const y = () => E(() => a(cr(t))), w = () => E(() => a(new A("authorization_cancelled", "requesting sandbox was unloaded", !0))), p = () => new A("authorization_window_closed", "authorization window was closed", !0), m = (P) => {
      c = P, d = setInterval(() => {
        !P.closed || f || (f = setTimeout(() => E(() => a(p())), 2500));
      }, 500);
    }, S = (P) => {
      if (P.origin !== window.location.origin) return;
      const I = P.data;
      if (!(!I || I.id !== i || !kr(I.build)) && (!c && n && I.type === "authorization-ready" && P.source && (h && clearTimeout(h), h = null, m(P.source)), P.source === c))
        if (I.type === "authorization-ready")
          try {
            c?.postMessage(
              {
                type: "authorization-request",
                build: de,
                id: i,
                request: g3(e)
              },
              window.location.origin
            );
          } catch (R) {
            E(() => a(R));
          }
        else if (I.type === "authorization-approved")
          try {
            const R = v3(I.result, e);
            E(() => s(R));
          } catch (R) {
            E(() => a(R));
          }
        else I.type === "authorization-error" && E(() => a(new A(I.code, I.message, !!I.retryable)));
    }, E = (P) => {
      if (!l) {
        l = !0, u && clearTimeout(u), d && clearInterval(d), f && clearTimeout(f), h && clearTimeout(h), window.removeEventListener("message", S), window.removeEventListener("pagehide", w), t?.removeEventListener("abort", y);
        try {
          c && !c.closed && c.close();
        } catch {
        }
        P();
      }
    };
    if (window.addEventListener("message", S), window.addEventListener("pagehide", w, { once: !0 }), n)
      h = setTimeout(() => E(() => a(p())), o3);
    else {
      const P = window.open(b3(i), o, "popup,width=520,height=760");
      if (!P) {
        E(() => a(new A("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      P.focus(), m(P);
    }
    if (u = setTimeout(
      () => E(() => a(new A("authorization_window_timeout", "authorization window timed out", !0))),
      r ? rr(r) : i3
    ), t) {
      if (t.aborted) {
        y();
        return;
      }
      t.addEventListener("abort", y, { once: !0 });
    }
  });
}
function x3(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? _n("context.minutes", { count: e / 60 }) : _n("context.seconds", { count: e });
}
function Ci(e, t, n = "access") {
  const r = [];
  e.sessionLabel && r.push({ label: "context.session", value: we(e.sessionLabel) }), e.command && r.push({ label: "context.command", value: we(e.command), variant: "command" }), e.egress && r.push({ label: n === "sign" ? "context.signReturns" : "context.egress", value: we(e.egress) });
  const i = [
    ...e.source?.env?.map((o) => we(`${G(n === "sign" ? "context.sourceRequestedName" : "context.sourceEnv")}: ${o}`)) ?? [],
    ...e.source?.tags?.map((o) => we(`${G("context.sourceTag")}: ${o}`)) ?? [],
    ...e.source?.skills?.map((o) => we(`${G("context.sourceSkill")}: ${o}`)) ?? []
  ];
  return i.length > 0 && r.push({ label: "context.source", values: i, variant: "chips" }), t?.agentFingerprint && r.push({ label: "context.agent", value: we(t.agentFingerprint), variant: "mono" }), t?.grantId && r.push({ label: "context.grant", value: we(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && r.push({ label: "context.agentAccess", value: x3(e.grantTtlSeconds) }), r.push({
    label: "context.secrets",
    values: e.secrets.map(
      (o) => we(`${o.name} · ${G(o.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: r };
}
function k3(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function E3(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function Sg(e, t) {
  return k3(e) ? !0 : E3(e) && dt(t).state === "locked";
}
async function A3(e, t = $e(), n) {
  await _y({ wrapMeta: e, currentRpId: Ot(), policy: t, abortSignal: n });
}
async function S3(e, t = $e()) {
  await or((n) => A3(e, t, n));
}
async function td(e) {
  let t;
  try {
    await ta({
      ...e,
      passkey: "unlock",
      ...e.abortSignal ? { onUnlocked: (n) => {
        t = n, e.onUnlocked?.(n);
      } } : {}
    });
  } catch (n) {
    throw e.abortSignal ? (t?.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), t?.release()) : dt(e.wrapMeta).state === "unlocked" && pt({ broadcast: !0, reason: "manual-lock" }), n;
  } finally {
    e.onUnlocked || t?.release();
  }
}
async function _3(e, t) {
  if (dt(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await S3(e);
  }
  return await Ks(t, { renewOnSuccess: !0 });
}
async function _g(e) {
  const t = dt(e.bindRoot ? void 0 : e.wrapMeta).state, n = $e(), r = ag({ tier: e.tier, vaultState: t, policy: n });
  let i = !1, o;
  const s = async () => {
    const c = e.bindRoot ? Ms(e.wrapMeta) : void 0;
    try {
      await td({
        ...e.lockedPrompt,
        wrapMeta: e.wrapMeta,
        policy: n,
        ...c ? { abortSignal: c.signal, onUnlocked: (l) => {
          o = l;
        } } : {},
        parentSurface: e.parentSurface,
        authorizationWindow: e.authorizationWindow
      }), i = !0;
    } finally {
      c?.release();
    }
  }, a = async (c, l = !1) => {
    let u = !1;
    try {
      o?.assertCurrent();
      const d = await Ks(
        async (f, h, y) => {
          const w = await e.buildPrompt(f, h, y);
          return r.confirm && !l && (await ta({
            ...w,
            wrapMeta: h,
            passkey: c,
            abortSignal: y.signal,
            parentSurface: e.parentSurface,
            authorizationWindow: e.authorizationWindow
          }), y.assertCurrent()), e.operation(f, h, y);
        },
        {
          renewOnSuccess: r.renewOnSuccess,
          beforeSuccess: e.beforeSuccess,
          ...e.bindRoot ? { expectedWrapMeta: e.wrapMeta } : {}
        }
      );
      return u = !0, d;
    } catch (d) {
      throw !e.bindRoot && i && !u && dt().state === "unlocked" && pt({ broadcast: !0, reason: "manual-lock" }), d;
    }
  };
  try {
    return r.passkey === "unlock" ? (await s(), await a("none", !0)) : await a(r.passkey === "uv" ? "uv" : "none");
  } catch (c) {
    if (!e.bindRoot && r.passkey !== "unlock" && Sg(c, e.wrapMeta))
      return await s(), await a("none", !0);
    throw e.bindRoot && o?.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    o?.release();
  }
}
function Ke(e, t) {
  if (e instanceof A) return e;
  if (my(e)) return new A("passkey_cancelled", "passkey-cancelled", !0);
  const n = e instanceof Error ? e.message : t;
  switch (n) {
    case "passkey-cancelled":
      return new A("passkey_cancelled", n, !0);
    case "passkey-prf-unavailable":
      return new A("passkey_prf_unavailable", n);
    case "passkey-not-configured":
      return new A("passkey_not_configured", n);
    case "passkey-multiple-not-supported":
      return new A("passkey_multiple_not_supported", n);
    case "vault-operation-aborted":
      return new A("vault_operation_aborted", n, !0);
    default:
      return new A(t, n);
  }
}
function I3(e) {
  return oe(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function B3(e) {
  return kg(JSON.parse(new TextDecoder().decode(be(e))));
}
function $3(e, t) {
  return Tf("setup", e, bg(), { req: I3(t) });
}
function Ma(e) {
  const t = Pt(e);
  return {
    credentialId: Ue(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function na(e) {
  return `${t3}${e}`;
}
function ra(e) {
  return `${n3}${e}`;
}
function If(e) {
  try {
    localStorage.removeItem(na(e)), localStorage.removeItem(ra(e));
  } catch {
  }
}
function T3(e, t) {
  try {
    localStorage.setItem(na(e), JSON.stringify({ build: de, result: t })), localStorage.removeItem(ra(e));
  } catch {
  }
}
function P3(e, t) {
  try {
    localStorage.setItem(
      ra(e),
      JSON.stringify({ build: de, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(na(e));
  } catch {
  }
}
function Ig(e) {
  if (window.self === window.top)
    return Al({
      rpId: Ot(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = Eg(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${gg}${t}`);
  let r = null;
  return If(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, l = null;
    const u = () => d(() => o(new A("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (w) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), l && clearTimeout(l), window.removeEventListener("visibilitychange", h), window.removeEventListener("focus", h), window.removeEventListener("storage", h), window.removeEventListener("message", y), window.removeEventListener("pagehide", u), n?.close(), If(t);
        try {
          r?.close();
        } catch {
        }
        w();
      }
    }, f = () => {
      let w = null, p = null;
      try {
        w = localStorage.getItem(na(t)), p = localStorage.getItem(ra(t));
      } catch {
        return !1;
      }
      if (w) {
        try {
          const m = Pt(JSON.parse(w));
          if (!kr(m.build)) throw new A("sandbox_build_mismatch");
          const S = Ma(m.result);
          d(() => i(S));
        } catch (m) {
          const S = m instanceof Error ? m.message : "stored setup result is invalid";
          d(() => o(new A("setup_storage_invalid", S)));
        }
        return !0;
      }
      if (p) {
        try {
          const m = Pt(JSON.parse(p));
          if (!kr(m.build)) throw new A("sandbox_build_mismatch");
          d(
            () => o(new A(Ue(m.code, "code"), vg(m.message, "message"), !!m.retryable))
          );
        } catch (m) {
          const S = m instanceof Error ? m.message : "stored setup error is invalid";
          d(() => o(new A("setup_storage_invalid", S)));
        }
        return !0;
      }
      return !1;
    }, h = () => {
      f();
    }, y = (w) => {
      if (w.origin !== window.location.origin || w.source !== r) return;
      const p = w.data;
      !p || p.id !== t || !kr(p.build) || (p.type === "setup-created" ? d(() => i(Ma(p.result))) : p.type === "setup-error" && d(() => o(new A(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      f() || d(() => o(new A("setup_window_timeout", "setup window timed out", !0)));
    }, r3), c = setInterval(() => {
      !r?.closed || l || f() || (l = setTimeout(() => {
        f() || d(() => o(new A("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (w) => {
      const p = w.data;
      !p || p.id !== t || !kr(p.build) || (p.type === "setup-created" ? d(() => i(Ma(p.result))) : p.type === "setup-error" && d(() => o(new A(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", h), window.addEventListener("focus", h), window.addEventListener("storage", h), window.addEventListener("message", y), window.addEventListener("pagehide", u, { once: !0 }), r = window.open($3(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
      d(() => o(new A("setup_popup_blocked", "setup window was blocked", !0)));
      return;
    }
    r.focus();
  });
}
function cr(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Zn(e) {
  if (e?.aborted) throw cr(e);
}
function O3() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function Bf(e) {
  return O3() && gy(e);
}
async function Bg(e, t, n, r, i = $e()) {
  const o = Z1();
  let s, a;
  try {
    Zn(r), s = (await js([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, Zn(r), a = W1();
    const l = await J1(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    Zn(r);
    let u = ex(l, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (u = rx(u, await nx(a, e.rootMetadata, u)), Zn(r));
    const d = dy({
      vmk: a,
      wrapMeta: u,
      freshSetup: !e.existingProtectedVault,
      scopeId: Dx(e.vaultUserHandle),
      policy: i
    });
    return a = void 0, {
      wrapMeta: u,
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
function R3(e, t, n) {
  return or((r) => {
    const i = Vs(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody"
    ), o = Le("setup.createPasskey"), s = Ar("setup.ready");
    return re(i.card, o), re(i.card, s), new Promise((a, c) => {
      let l = !1, u = "create", d = null, f = !1;
      const h = (I) => {
        l || (l = !0, r.removeEventListener("abort", p), qs(), I());
      }, y = (I) => {
        h(() => c(I));
      }, w = (I) => {
        l || (u = "create", d = null, Z(o, "setup.createPasskey"), o.disabled = !1, Z(s, I));
      }, p = () => {
        y(cr(r));
      }, m = (I) => {
        if (I instanceof A && I.code === "setup_popup_blocked") {
          w("setup.popupBlocked");
          return;
        }
        y(I);
      }, S = () => {
        f = !0, o.disabled = !0, Z(s, "setup.popupPrompt");
        let I;
        try {
          I = Ig(e);
        } catch (R) {
          m(R);
          return;
        }
        I.then(
          (R) => {
            l || (d = R, u = "finish", Z(o, "setup.finish"), o.disabled = !1, Z(s, "setup.createdFinish"));
          },
          (R) => {
            m(R);
          }
        );
      }, E = (I) => {
        o.disabled = !0, Z(s, "setup.passkeyPrompt"), Bg(e, t, I, r, n).then(
          (R) => h(() => a(R)),
          (R) => y(R)
        );
      }, P = () => {
        o.disabled = !0, Z(s, "setup.passkeyPrompt");
        let I;
        try {
          I = Al({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (R) {
          if (Bf(R)) {
            S();
            return;
          }
          y(R);
          return;
        }
        I.then(
          (R) => E(R),
          (R) => {
            if (Bf(R)) {
              S();
              return;
            }
            y(R);
          }
        );
      };
      if (r.aborted) {
        p();
        return;
      }
      r.addEventListener("abort", p, { once: !0 }), o.addEventListener("click", () => {
        if (!(l || o.disabled)) {
          if (u === "finish" && d) {
            E(d);
            return;
          }
          if (f) {
            S();
            return;
          }
          P();
        }
      });
    });
  });
}
async function C3(e) {
  const t = kg(e);
  try {
    const n = Ot(), r = t.policy ?? $e(), i = window.self !== window.top ? await R3(t, n, r) : await Bg(t, n, await Ig(t), void 0, r), o = t.policy ? vl(r) : $e();
    return { ...i, policy: o };
  } catch (n) {
    throw Ke(n, "setup_failed");
  }
}
async function L3(e) {
  const t = f3(e);
  try {
    const n = Ot(), r = t.policy ?? $e(), i = await or(async (s) => {
      let a;
      if (await _i(
        {
          title: "unlock.sessionTitle",
          subtitle: _n("unlock.sessionSubtitle", {
            minutes: r.windowSeconds / 60
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue"
        },
        s,
        void 0,
        async () => {
          a = await _y({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? vl(r) : $e();
    return { ...i, policy: o };
  } catch (n) {
    throw Ke(n, "unlock_failed");
  }
}
async function H3(e) {
  const t = O2(e);
  t.wrapMeta && El(t.wrapMeta);
  try {
    if (t.kind === "static" && !$e().parentValueSealAllowed)
      throw new A("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await _3(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await S_({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await __({ name: t.name, curve: t.curve, vmk: n, wrapMeta: r }), establishingVmk: ac() }));
  } catch (n) {
    throw Ke(n, "seal_failed");
  }
}
async function U3(e, t) {
  try {
    const n = yg(e), r = t.takeAuthorizationWindow();
    if (!r) throw new A("invalid_payload", "sealHdWallet requires a parent-opened authorization window");
    const i = Ms(n.wrapMeta), o = { ...n, kind: "protected-hd-wallet", deadlineAt: Date.now() + pg };
    try {
      return await or(async (s) => {
        const a = Ql([s, i.signal]);
        try {
          i.assertCurrent();
          const c = await ed(o, a.signal, r);
          i.assertCurrent();
          const l = As(c, o);
          return i.assertCurrent(), { envelope: l.envelope, accounts: l.accounts, expectedAccount0: l.expectedAccount0, establishingVmk: i.freshSetup };
        } finally {
          a.cleanup();
        }
      });
    } finally {
      i.release();
    }
  } catch (n) {
    throw Ke(n, "seal_hd_failed");
  }
}
async function N3(e, t) {
  const n = D_(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = On(n.material.envelope);
    if (!Jl(o)) throw new Error("only static protected records can be revealed as plaintext");
    return bs({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await _g({
      tier: "R2",
      wrapMeta: i,
      bindRoot: !0,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: we(n.material.name),
        body: "reveal.confirmBody",
        details: Ci(n.context.display),
        label: "common.continue"
      },
      buildPrompt: async (s, a) => {
        const c = await as(a, s);
        return Gn({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), Co(n), bs({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), Ii([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: we(n.material.name),
          body: "reveal.confirmBody",
          details: Ci(n.context.display),
          challenge: await Sf(Gs(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const l = await as(a, s);
        c.assertCurrent(), Gn({ context: n.context, rootMetadata: l, expectedPurpose: "reveal" }), Co(n), Ii([n.context]);
        const u = await Di(r, s, Ds(n.material.name, o));
        try {
          c.assertCurrent(), Gn({ context: n.context, rootMetadata: l, expectedPurpose: "reveal" }), Co(n), await Bi([n.context]), c.assertCurrent(), Gn({ context: n.context, rootMetadata: l, expectedPurpose: "reveal" }), await B2({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: $e().strictApprovals ? async (d) => {
              await Ag({
                wrapMeta: a,
                challenge: await Sf(`reveal-copy:${n.context.requestId}:${n.material.name}`),
                abortSignals: [d, c.signal]
              }), Zn(d), Zn(c.signal);
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
async function D3(e, t) {
  try {
    const n = y_(e), { request: r, unpacked: { vmkWrapMeta: i } } = n, o = (s) => {
      const a = r.context.display.sessionLabel;
      if (!s.review && s.display === void 0) throw new A("invalid_payload", "signing request has no reviewable content");
      return {
        title: "sign.title",
        subtitle: we(r.material.name),
        ...s.review ? { review: s.review, ...a ? { reviewSession: a } : {} } : { body: we(s.display ?? "") },
        details: Ci(r.context.display, void 0, "sign"),
        label: "sign.confirm"
      };
    };
    if (n.hd) {
      let s;
      try {
        if (dt().state !== "unlocked") {
          const a = Ms(i);
          try {
            await td({
              title: "hd.unlockTitle",
              subtitle: we(r.material.name),
              body: "hd.unlockBody",
              label: "common.continue",
              wrapMeta: i,
              policy: $e(),
              abortSignal: a.signal,
              onUnlocked: (c) => {
                s = c;
              },
              parentSurface: t.latestSurface,
              authorizationWindow: t.takeAuthorizationWindow
            });
          } finally {
            a.release();
          }
        }
        return s?.assertCurrent(), await Ks(async (a, c, l) => {
          const u = await df(n, a, c);
          return l.assertCurrent(), await ta({
            ...o(u),
            wrapMeta: c,
            passkey: "uv",
            challenge: new Uint8Array(n.challenge),
            abortSignal: l.signal,
            parentSurface: t.latestSurface,
            authorizationWindow: t.takeAuthorizationWindow
          }), l.assertCurrent(), uf(n, a, c);
        }, { renewOnSuccess: !1, expectedWrapMeta: i, beforeSuccess: () => Bi([r.context]) });
      } catch (a) {
        throw s?.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), a;
      } finally {
        s?.release();
      }
    }
    return await _g({
      tier: "R3",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: o(n.verified),
      // Shown only after the daemon signature, expiry and replay state are
      // verified with the vault key, from content re-derived at that moment.
      buildPrompt: async (s, a) => ({
        ...o(await df(n, s, a)),
        challenge: new Uint8Array(n.challenge)
      }),
      operation: (s, a) => uf(n, s, a),
      beforeSuccess: () => Bi([r.context])
    });
  } catch (n) {
    throw Ke(n, "sign_failed");
  }
}
async function z3(e, t) {
  const n = h3(e);
  try {
    const i = On(n.items[0].material.envelope).vmkWrapMeta;
    for (const f of n.items) {
      const h = On(f.material.envelope);
      if (h.vmkWrapMeta !== i) throw new A("invalid_payload", "approveRelease items must share one VMK context");
      if (!Jl(h.recordMetadata)) throw new A("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = cg(n.items), s = dt(i).state, a = $e(), c = ag({ tier: "R2", vaultState: s, policy: a });
    let l = !1;
    const u = async () => {
      await td({
        title: "release.title",
        subtitle: _n("release.subtitle", { count: n.items.length }),
        details: Ci(o.display, o.recipient),
        label: "release.confirm",
        wrapMeta: i,
        policy: a,
        parentSurface: t.latestSurface,
        authorizationWindow: t.takeAuthorizationWindow
      }), l = !0;
    }, d = async (f, h = !1) => {
      let y = !1, w;
      try {
        const p = await Ks(
          async (m, S, E) => {
            const P = await B_({
              items: n.items,
              vmk: m,
              wrapMeta: S,
              consumeReplayIds: !1,
              onApprovalAccepted: (I) => {
                w = I;
              },
              confirm: (I) => !c.confirm || h ? Promise.resolve() : ta({
                title: "release.title",
                subtitle: _n("release.subtitle", { count: n.items.length }),
                details: Ci(I.display, I.recipient),
                challenge: I.challenge,
                label: "release.confirm",
                wrapMeta: S,
                passkey: f,
                abortSignal: E.signal,
                parentSurface: t.latestSurface,
                authorizationWindow: t.takeAuthorizationWindow
              })
            });
            return E.assertCurrent(), P;
          },
          {
            renewOnSuccess: c.renewOnSuccess,
            beforeSuccess: () => Bi(n.items.map((m) => m.context), w)
          }
        );
        return y = !0, p;
      } catch (p) {
        throw l && !y && dt().state === "unlocked" && pt({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await u(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (f) {
      if (c.passkey !== "unlock" && Sg(f, i))
        return await u(), await d("none", !0);
      throw f;
    }
  } catch (r) {
    throw Ke(r, "approve_release_failed");
  }
}
async function M3(e, t) {
  let n;
  if (await or(async (r) => {
    $n(e);
    const i = { kind: "signing-policy-downgrade", context: e }, o = async (c) => {
      $n(e);
      const l = await ed(i, r, c);
      if (l.kind !== "assertion") throw new A("authorization_result_invalid", "policy assertion is missing");
      n = kc(l.assertion, e);
    }, s = t.takeAuthorizationWindow();
    if (s) {
      await o(s);
      return;
    }
    $n(e);
    const a = by(e);
    await _i(
      a,
      r,
      (c) => sg({
        uiShowPending: Ey,
        parentSurface: () => t.latestSurface(),
        visibilityTarget: c,
        requireParentSurface: !0
      }),
      () => o()
    );
  }), !n) throw new A("authorization_result_invalid", "policy assertion is missing");
  return kc(n, e);
}
async function K3(e, t) {
  try {
    const n = L_(e, {
      origin: window.location.origin,
      hostname: window.location.hostname
    }), r = await M3(n, t);
    return { challengeId: n.challengeId, assertion: r };
  } catch (n) {
    throw Ke(n, "policy_authorization_failed");
  }
}
async function F3(e) {
  const t = p3(e);
  try {
    const n = await i2(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw Ke(n, "delete_authz_failed");
  }
}
function j3() {
  const e = Ec();
  if (e.get("mode") !== "setup") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && ea({ locale: t, theme: n });
  const r = e.get("id"), i = document.getElementById("page"), o = i?.querySelector(".card"), s = i?.querySelector("h1"), a = i?.querySelector(".sub"), c = i?.querySelector(".body");
  if (!r || !o || !s || !a || !c) return;
  document.body.classList.add("setup-mode"), Z(s, "setup.title"), Z(a, "setup.subtitle"), Z(c, "setup.topLevelBody");
  const l = document.createElement("button");
  l.type = "button", l.className = "action", Z(l, "setup.createPasskey");
  const u = document.createElement("p");
  u.className = "setup-status", Z(u, "setup.readyOnOrigin"), o.append(l, u);
  const d = new URLSearchParams(window.location.hash.slice(1)).get("req");
  if (!d) {
    l.disabled = !0, Z(u, "setup.requestMissing");
    return;
  }
  let f;
  try {
    f = B3(d);
  } catch {
    l.disabled = !0, Z(u, "setup.requestInvalid");
    return;
  }
  const h = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${gg}${r}`), y = (w) => {
    const p = Ke(w, "setup_create_failed"), m = {
      type: "setup-error",
      build: de,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    P3(r, p), h?.postMessage(m);
    try {
      window.opener?.postMessage(m, window.location.origin);
    } catch {
    }
    l.disabled = !1, Z(u, we(p.message));
  };
  l.addEventListener("click", () => {
    l.disabled = !0, Z(u, "setup.passkeyPrompt");
    let w;
    try {
      w = Al({
        rpId: Ot(),
        vaultUserHandle: f.vaultUserHandle,
        displayName: f.displayName,
        authzCreationOptions: f.authzCreationOptions
      });
    } catch (p) {
      y(p);
      return;
    }
    w.then((p) => {
      const m = { type: "setup-created", build: de, id: r, result: p };
      T3(r, p), h?.postMessage(m);
      try {
        window.opener?.postMessage(m, window.location.origin);
      } catch {
      }
      Z(u, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(y);
  });
}
function V3() {
  const e = Ec();
  if (e.get("mode") !== "authorize") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && ea({ locale: t, theme: n });
  const r = e.get("id"), o = document.getElementById("page")?.querySelector(".card"), s = o?.querySelector(".body");
  if (!r || !o || !s || (s.classList.add("waiting"), Z(s, window.opener ? "authorize.waiting" : "authorize.waitingLong"), !window.opener)) return;
  const a = () => {
    const p = window.opener;
    if (!p) return [];
    const m = [p];
    try {
      for (let S = 0; S < p.frames.length; S += 1) m.push(p.frames[S]);
    } catch {
    }
    return m;
  };
  let c = null;
  const l = (p) => {
    try {
      c?.postMessage(p, window.location.origin);
    } catch {
    }
  };
  let u = !1, d = null;
  const f = setTimeout(() => Z(s, "authorize.waitingLong"), s3), h = () => {
    if (!u)
      for (const p of a())
        try {
          p.postMessage({ type: "authorization-ready", build: de, id: r }, window.location.origin);
        } catch {
        }
  }, y = (p) => {
    if (u) return;
    u = !0, d && clearInterval(d), clearTimeout(f), s.classList.remove("waiting"), window.removeEventListener("message", w), document.body.classList.add("setup-mode");
    const m = new AbortController(), S = (R) => {
      const U = Ke(R, R instanceof Error && R.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed");
      l({
        type: "authorization-error",
        build: de,
        id: r,
        code: U.code,
        message: U.message,
        retryable: U.retryable
      }), setTimeout(() => window.close(), 250);
    }, E = (R, U) => {
      R.then(
        () => {
          try {
            l({ type: "authorization-approved", build: de, id: r, result: U() }), setTimeout(() => window.close(), 250);
          } catch (H) {
            S(H);
          }
        },
        S
      );
    };
    if ("kind" in p) {
      if (p.kind === "protected-hd-wallet") {
        let H;
        const B = () => m.abort(new A("authorization_cancelled", "protected HD window closed", !0)), D = setTimeout(() => m.abort(new A("authorization_window_timeout", "protected HD window expired", !0)), rr(p));
        window.addEventListener("pagehide", B, { once: !0 });
        const L = K_(p, m.signal, e3).then((x) => {
          H = x;
        }).catch((x) => {
          throw my(x) || x instanceof Error && ["operation-cancelled", "passkey-cancelled"].includes(x.message) ? new A("authorization_cancelled", "protected HD operation cancelled", !0) : x;
        }).finally(() => {
          clearTimeout(D), window.removeEventListener("pagehide", B);
        });
        E(L, () => {
          if (m.signal.aborted) throw cr(m.signal);
          if (rr(p), !H) throw new A("authorization_result_invalid", "protected HD result is missing");
          return H;
        });
        return;
      }
      if (p.kind !== "signing-policy-downgrade") {
        S(new A("authorization_request_invalid", "authorization request kind is invalid"));
        return;
      }
      try {
        $n(p.context);
      } catch (H) {
        S(H);
        return;
      }
      let R;
      const U = by(p.context);
      E(
        _i(
          U,
          m.signal,
          (H) => sg({
            uiShowPending: Ey,
            visibilityTarget: H,
            requireParentSurface: !0
          }),
          async () => {
            $n(p.context), R = await U_(p.context, m.signal);
          }
        ),
        () => {
          if (!R) throw new A("authorization_result_invalid", "policy assertion is missing");
          return { kind: "assertion", assertion: R };
        }
      );
      return;
    }
    let P = { kind: "confirmed" };
    const I = async () => {
      if (p.passkey === "none") return;
      if (p.passkey === "uv") {
        if (!p.prompt.challenge) throw new A("invalid_payload", "authorization challenge is missing");
        await Ag({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [m.signal]
        });
        return;
      }
      const R = await js(Ns(p.wrapMeta), Ot(), m.signal);
      P = {
        kind: "unlock",
        prfOutput: oe(R.prfOutput),
        prfSalt: oe(R.prfSalt)
      }, R.prfOutput.fill(0);
    };
    E(_i(og(p.prompt), m.signal, void 0, I), () => P);
  }, w = (p) => {
    if (p.origin !== window.location.origin) return;
    const m = p.data;
    if (!m || m.type !== "authorization-request" || m.id !== r || !kr(m.build)) return;
    const S = a().find((E) => E === p.source);
    if (S) {
      c = S;
      try {
        y(m3(m.request));
      } catch (E) {
        const P = Ke(E, "authorization_request_invalid");
        l({
          type: "authorization-error",
          build: de,
          id: r,
          code: P.code,
          message: P.message,
          retryable: P.retryable
        });
      }
    }
  };
  window.addEventListener("message", w), h(), d = setInterval(h, 500);
}
function q3() {
  if (window.self !== window.top || Ec().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && Z(e, "sandbox.intro");
}
Te.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new A("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== de.buildHash)
    throw new A("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = c3(t.appearance);
  r && ea(r);
  const i = Af ? $e() : vl(t.policy === void 0 ? void 0 : bl(t.policy));
  return Af = !0, {
    accepted: !0,
    channel: Nn,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: de,
    policy: i
  };
});
Te.register("set-appearance", (e) => (ea(mg(e)), { accepted: !0 }));
Te.register("status", (e) => {
  const t = u3(e);
  try {
    t.wrapMeta && dt(t.wrapMeta);
    const n = dt(), r = $e();
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
Te.register("setup", C3);
Te.register("unlock", L3);
Te.register("lock", () => ({ ...pt({ broadcast: !0, reason: "manual-lock" }), policy: $e() }));
Te.register("seal", H3);
Te.register("sealHdWallet", U3);
Te.register("reveal", N3);
Te.register("sign", D3);
Te.register("approveRelease", z3);
Te.register("deleteAuthzAssertion", F3);
Te.register("authorizeSigningPolicyDowngrade", K3);
Ux((e) => Te.emit("vault.state", e));
k2((e) => Te.emit(e));
await Lg();
Te.start();
window.addEventListener("pagehide", qx);
j3();
V3();
q3();
window.self !== window.top && document.body.classList.add("embedded");
const $g = globalThis.crypto, G3 = { webcrypto: $g }, Tg = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: G3,
  webcrypto: $g
}, Symbol.toStringTag, { value: "Module" }));
