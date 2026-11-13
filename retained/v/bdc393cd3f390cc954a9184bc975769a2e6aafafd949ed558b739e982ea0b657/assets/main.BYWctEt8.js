const Nn = "avibe.vault.crypto";
const de = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "bdc393cd3f390cc954a9184bc975769a2e6aafafd949ed558b739e982ea0b657"
};
class A extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function od(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function $g(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === Nn && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const Tg = /^[A-Za-z0-9_-]{16,128}$/;
function Bf(e) {
  return typeof e == "object" && e !== null;
}
function Pg(e) {
  return Bf(e) ? e.channel === Nn && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class Og {
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
    if (window.parent === window || t.source !== window.parent || !od(t.origin)) return;
    if (Pg(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!$g(t.data)) return;
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
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !Tg.test(n.authorizationWindow))) {
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
    if (t.op !== "handshake" || !Bf(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !od(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
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
function Ac() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function $f(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return de.buildHash !== "dev" && (i.pathname = `/v/${de.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function kr(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === de.buildHash && t.sandboxVersion === de.sandboxVersion;
}
async function Rg() {
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
class ut extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class bt extends ut {
}
class Eo extends ut {
}
class Mi extends ut {
}
class Cg extends ut {
}
class Lg extends ut {
}
class Hg extends ut {
}
class Ug extends ut {
}
class Ng extends ut {
}
class Dg extends ut {
}
class zg extends ut {
}
class Sc extends ut {
}
const Mg = {}, Tf = Kg(globalThis, Mg);
function Kg(e, t) {
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
async function Fg() {
  if (Tf !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Bg);
    return e.subtle;
  } catch (e) {
    throw new Sc(e);
  }
}
class _c {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await Fg());
  }
}
const Qt = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, sd = {
  DhkemX25519HkdfSha256: 32
}, Pf = {
  HkdfSha256: 1
}, Ic = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, Co = 8192, jg = 268435456, ad = 32, Pe = /* @__PURE__ */ new Uint8Array(0), xt = 0n, lr = 1n, Ki = 2n, Vg = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), cd = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function Ao(e) {
  return new Uint8Array(ie(e));
}
function ie(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class qg extends _c {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Pf.HkdfSha256
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
    return r.set(cd, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(cd, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : ie(t);
    if (r.byteLength !== this.hashSize)
      throw new bt("The salt length must be the same as the hashSize");
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
    const l = Ao(n), u = new Uint8Array(1);
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
class Of extends qg {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Pf.HkdfSha256
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
function Fi(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function ld(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function Gg() {
  if (typeof Tf < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => Bg);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function Wg(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const Zg = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), Yg = /* @__PURE__ */ new Uint8Array([
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
function Xg(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class Jg {
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
    const i = new Uint8Array(Vg);
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
    if (n.byteLength > Co)
      throw new bt("Too long ikm");
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
        o = Fi(l, u);
      }
      let s;
      if (t.senderKey === void 0)
        s = Fi(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = Zr(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), l = await this._prim.serializePublicKey(c);
        s = Xg(new Uint8Array(r), new Uint8Array(i), new Uint8Array(l));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new Cg(o);
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
        a = Fi(l, u);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = Fi(new Uint8Array(n), new Uint8Array(s));
      else {
        const l = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + l.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(l), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new Lg(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(Zg, t), i = this._kdf.buildLabeledInfo(Yg, n, this.secretSize);
    return await this._kdf.extractAndExpand(Pe, r, i, this.secretSize);
  }
}
const ji = ["deriveBits"], Qg = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), em = /* @__PURE__ */ new Uint8Array([115, 107]);
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
class tm {
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
      return Promise.reject(new Eo(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(ie(t), !0);
    } catch (n) {
      throw new Mi(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new Eo(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(ie(t), !1);
    } catch (n) {
      throw new Mi(n);
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
      throw new Mi(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new dr(this._algName, t, "private", ji);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new Sc(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = ie(t), r = await this._hkdf.labeledExtract(Pe.buffer, Qg, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, em, Pe, this._nSk), o = new dr(this._algName, new Uint8Array(i), "private", ji);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new zg(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new dr(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new Mi(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new Eo(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new dr(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : ji));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new dr(this._algName, ld(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new dr(this._algName, ld(t.d), "private", ji)));
    });
  }
}
const nm = ["encrypt", "decrypt"];
function rm(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function mi(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function qt(e, t, n = "") {
  const r = rm(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Lo(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function im(e, t) {
  qt(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function om(e) {
  if (typeof e == "bigint") {
    if (!So(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    mi(e);
  return e;
}
function Ho(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const sm = /* @__PURE__ */ new Uint32Array([287454020]), am = /* @__PURE__ */ new Uint8Array(sm.buffer);
am[0];
function ia(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function pt(e, t) {
  return e << 32 - t | e >>> t;
}
const Rf = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", cm = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), lm = [
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
function dm(e) {
  if (qt(e), Rf)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += cm[e[n]];
  return t;
}
const Ct = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Fa(e) {
  if (e >= Ct._0 && e <= Ct._9)
    return e - Ct._0;
  if (e >= Ct.A && e <= Ct.F)
    return e - (Ct.A - 10);
  if (e >= Ct.a && e <= Ct.f)
    return e - (Ct.a - 10);
}
function um(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Rf)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Fa(e.charCodeAt(o)), a = Fa(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function fm(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = xt;
  for (let n = 0; n < e.length; n++) {
    const r = Fa(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | lm[r];
  }
  return t;
}
function hm(e) {
  mi(e, "numberToBigint");
  let t = e, n = xt, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function dd(e) {
  return fm(dm(ja(qt(e)).reverse()));
}
function pm(e, t) {
  mi(t), e = om(e);
  const n = um(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function ym(e, t) {
  return pm(e, t).reverse();
}
function ja(e) {
  return Uint8Array.from(e);
}
function So(e) {
  return typeof e == "bigint" && xt <= e;
}
function wm(e, t, n) {
  return So(e) && So(t) && So(n) && t <= e && e < n;
}
function ud(e, t, n, r) {
  if (!wm(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function gm(e, t = {}, n = {}) {
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
async function mm(e = 32) {
  const t = await Gg(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function bm(e) {
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
function vm(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  mi(e.outputLen), mi(e.blockLen);
}
function xm(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let Cf = class {
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
    }), vm(t), qt(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Ho(i);
  }
  update(t) {
    return Lo(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Lo(this), qt(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const Lf = (e, t, n) => new Cf(e, t).update(n).digest();
Lf.create = (e, t) => new Cf(e, t);
function km(e, t, n) {
  return e & t ^ ~e & n;
}
function Em(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Am = class {
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
    Lo(this), qt(t);
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
    Lo(this), im(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Ho(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, hm(this.length * 8), o), this.process(r, 0);
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
const en = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Sm = /* @__PURE__ */ Uint32Array.from([
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
]), tn = /* @__PURE__ */ new Uint32Array(64);
let _m = class extends Am {
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
      tn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = tn[d - 15], h = tn[d - 2], y = pt(f, 7) ^ pt(f, 18) ^ f >>> 3, w = pt(h, 17) ^ pt(h, 19) ^ h >>> 10;
      tn[d] = w + tn[d - 7] + y + tn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = pt(a, 6) ^ pt(a, 11) ^ pt(a, 25), h = u + f + km(a, c, l) + Sm[d] + tn[d] | 0, w = (pt(r, 2) ^ pt(r, 13) ^ pt(r, 22)) + Em(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Ho(tn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Ho(this.buffer);
  }
}, Im = class extends _m {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: en[7] | 0
    });
  }
};
const Bm = /* @__PURE__ */ xm(
  () => new Im(),
  /* @__PURE__ */ bm(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Hf(e, t) {
  const n = e % t;
  return n >= xt ? n : t + n;
}
function Je(e, t, n) {
  let r = e;
  for (; t-- > xt; )
    r *= r, r %= n;
  return r;
}
function $m(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Tm(e) {
  return gm(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function Pm(e) {
  const t = Tm(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || mm, l = a ? 255n : 448n, u = a ? 32 : 56, d = a ? 9n : 5n, f = a ? 121665n : 39081n, h = a ? Ki ** 254n : Ki ** 447n, y = a ? 8n * Ki ** 251n - lr : 4n * Ki ** 445n - lr, w = h + y + lr, p = (b) => Hf(b, n), m = S(d);
  function S(b) {
    return ym(p(b), u);
  }
  function E(b) {
    const g = ja(qt(b, u, "uCoordinate"));
    return a && (g[31] &= 127), p(dd(g));
  }
  function O(b) {
    return dd(i(ja(qt(b, u, "scalar"))));
  }
  function I(b, g) {
    const k = D(E(g), O(b));
    if (k === xt)
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
    ud("u", b, xt, n), ud("scalar", g, h, w);
    const k = g, _ = b;
    let $ = lr, T = xt, P = b, L = lr, N = xt;
    for (let z = l - 1n; z >= xt; z--) {
      const M = k >> z & lr;
      N ^= M, { x_2: $, x_3: P } = B(N, $, P), { x_2: T, x_3: L } = B(N, T, L), N = M;
      const j = $ + T, V = p(j * j), G = $ - T, W = p(G * G), se = V - W, Fe = P + L, Rt = P - L, Jt = p(Rt * j), Wr = p(Fe * G), rd = Jt + Wr, id = Jt - Wr;
      P = p(rd * rd), L = p(_ * p(id * id)), $ = p(V * W), T = p(se * (V + p(f * se)));
    }
    ({ x_2: $, x_3: P } = B(N, $, P)), { x_2: T, x_3: L } = B(N, T, L);
    const K = o(T);
    return p($ * K);
  }
  const C = {
    secretKey: u,
    publicKey: u,
    seed: u
  }, x = async (b) => (b === void 0 && (b = await c(u)), qt(b, C.seed, "seed"), b), v = { randomSecretKey: x };
  return Object.freeze({
    keygen: $m(x, U),
    getSharedSecret: H,
    getPublicKey: U,
    scalarMult: I,
    scalarMultBase: R,
    utils: v,
    GuBytes: m.slice(),
    lengths: C
  });
}
class Om extends _c {
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
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, nm);
  }
}
class Rm {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Ic.Aes128Gcm
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
    return new Om(t);
  }
}
class Cm extends Rm {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Ic.Aes256Gcm
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
function fd() {
  return new Promise((e, t) => {
    t(new Sc("Not supported"));
  });
}
const Lm = new Uint8Array([115, 101, 99]);
class Bc {
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
    return await fd();
  }
  async open(t, n) {
    return await fd();
  }
  async export(t, n) {
    const r = ie(t);
    if (r.byteLength > Co)
      throw new bt("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, Lm, new Uint8Array(r), n);
    } catch (i) {
      throw new Hg(i);
    }
  }
}
class Hm extends Bc {
}
class Um extends Bc {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Uf extends Bc {
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
    return Wg(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new Dg("Message limit reached");
    t.seq += 1;
  }
}
var Nm = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Dm = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, _o;
class Nf {
  constructor() {
    _o.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = Nm(this, _o, "f");
    return Dm(this, _o, n, "f"), await r, t;
  }
}
_o = /* @__PURE__ */ new WeakMap();
var hd = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, zm = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, oi;
class Mm extends Uf {
  constructor() {
    super(...arguments), oi.set(this, void 0);
  }
  async open(t, n = Pe.buffer) {
    zm(this, oi, hd(this, oi, "f") ?? new Nf(), "f");
    const r = await hd(this, oi, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), ie(t), ie(n));
    } catch (o) {
      throw new Ng(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
oi = /* @__PURE__ */ new WeakMap();
var pd = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, Km = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, si;
class Fm extends Uf {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), si.set(this, void 0), this.enc = i;
  }
  async seal(t, n = Pe.buffer) {
    Km(this, si, pd(this, si, "f") ?? new Nf(), "f");
    const r = await pd(this, si, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), ie(t), ie(n));
    } catch (o) {
      throw new Ug(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
si = /* @__PURE__ */ new WeakMap();
const jm = new Uint8Array([
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
]), Vm = new Uint8Array([101, 120, 112]), qm = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), Gm = new Uint8Array([107, 101, 121]), Wm = new Uint8Array([
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
]), Zm = new Uint8Array([115, 101, 99, 114, 101, 116]), Ym = new Uint8Array([
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
class Xm extends _c {
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
      throw new bt("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new bt("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new bt("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(Ym), this._suiteId.set(fi(this._kem.id, 2), 4), this._suiteId.set(fi(this._kdf.id, 2), 6), this._suiteId.set(fi(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
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
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? Qt.AuthPsk : Qt.Psk : r = t.senderKey !== void 0 ? Qt.Auth : Qt.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
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
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? Qt.AuthPsk : Qt.Psk : r = t.senderPublicKey !== void 0 ? Qt.Auth : Qt.Base, await this._keyScheduleR(r, n, t);
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
    const i = r.psk === void 0 ? Pe : Ao(r.psk.id), o = await this._kdf.labeledExtract(Pe, Wm, i), s = r.info === void 0 ? Pe : Ao(r.info), a = await this._kdf.labeledExtract(Pe, qm, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const l = r.psk === void 0 ? Pe : Ao(r.psk.key), u = this._kdf.buildLabeledIkm(Zm, l), d = this._kdf.buildLabeledInfo(Vm, c, this._kdf.hashSize), f = await this._kdf.extractAndExpand(n, u, d, this._kdf.hashSize);
    if (this._aead.id === Ic.ExportOnly)
      return { aead: this._aead, exporterSecret: f };
    const h = this._kdf.buildLabeledInfo(Gm, c, this._aead.keySize), y = await this._kdf.extractAndExpand(n, u, h, this._aead.keySize), w = this._kdf.buildLabeledInfo(jm, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, u, w, this._aead.nonceSize);
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
    return o.key === void 0 ? new Um(this._api, this._kdf, o.exporterSecret, r) : new Fm(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new Hm(this._api, this._kdf, i.exporterSecret) : new Mm(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > jg)
      throw new bt("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < ad)
        throw new bt(`PSK must have at least ${ad} bytes`);
      if (t.psk.key.byteLength > Co)
        throw new bt("Too long psk.key");
      if (t.psk.id.byteLength > Co)
        throw new bt("Too long psk.id");
    }
  }
}
class Jm extends Xm {
}
let Qm = class extends Of {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const e0 = 1n, yd = 2n, t0 = 3n, n0 = 5n, Df = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function r0(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = Df, a = e * e % o * e % o, c = Je(a, yd, o) * a % o, l = Je(c, e0, o) * e % o, u = Je(l, n0, o) * l % o, d = Je(u, t, o) * u % o, f = Je(d, n, o) * d % o, h = Je(f, r, o) * f % o, y = Je(h, i, o) * h % o, w = Je(y, i, o) * h % o, p = Je(w, t, o) * u % o;
  return { pow_p_5_8: Je(p, yd, o) * e % o, b2: a };
}
function i0(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const o0 = /* @__PURE__ */ (() => {
  const e = Df;
  return Pm({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = r0(t);
      return Hf(Je(n, t0, e) * r, e);
    },
    adjustScalarBytes: i0
  });
})();
class s0 extends Of {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : ie(t), i = ie(n);
    if (r.byteLength !== this.hashSize)
      return Lf(Bm, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class a0 extends tm {
  constructor(t) {
    super("X25519", 32, o0, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new Eo(r));
    }
  }
}
class c0 extends Jg {
  constructor() {
    const t = new s0();
    super(sd.DhkemX25519HkdfSha256, new a0(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: sd.DhkemX25519HkdfSha256
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
function zf(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function It(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function Bt(e, t, n = "") {
  const r = zf(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, l = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(l) : new TypeError(l);
  }
  return e;
}
function Mf(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (It(e.outputLen), It(e.blockLen), e.outputLen < 1)
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
function $c(e, t) {
  Bt(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function l0(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function $t(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function oa(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function yt(e, t) {
  return e << 32 - t | e >>> t;
}
function Vi(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const d0 = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function u0(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function f0(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = u0(e[t]);
  return e;
}
const wd = d0 ? (e) => e : f0, Kf = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", h0 = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Tc(e) {
  if (Bt(e), Kf)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += h0[e[n]];
  return t;
}
const Lt = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function gd(e) {
  if (e >= Lt._0 && e <= Lt._9)
    return e - Lt._0;
  if (e >= Lt.A && e <= Lt.F)
    return e - (Lt.A - 10);
  if (e >= Lt.a && e <= Lt.f)
    return e - (Lt.a - 10);
}
function Pc(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (Kf)
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
    const s = gd(e.charCodeAt(o)), a = gd(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function p0(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    Bt(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function As(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function Oc(e = 32) {
  It(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const Ff = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function y0(e, t, n) {
  return e & t ^ ~e & n;
}
function w0(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Rc = class {
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
    Or(this), Bt(t);
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
    Or(this), $c(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, $t(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
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
const nn = /* @__PURE__ */ Uint32Array.from([
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
]), qi = /* @__PURE__ */ BigInt(2 ** 32 - 1), md = /* @__PURE__ */ BigInt(32);
function g0(e, t = !1) {
  return t ? { h: Number(e & qi), l: Number(e >> md & qi) } : { h: Number(e >> md & qi) | 0, l: Number(e & qi) | 0 };
}
function jf(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = g0(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const bd = (e, t, n) => e >>> n, vd = (e, t, n) => e << 32 - n | t >>> n, ur = (e, t, n) => e >>> n | t << 32 - n, fr = (e, t, n) => e << 32 - n | t >>> n, Gi = (e, t, n) => e << 64 - n | t >>> n - 32, Wi = (e, t, n) => e >>> n - 32 | t << 64 - n, m0 = (e, t, n) => e << n | t >>> 32 - n, b0 = (e, t, n) => t << n | e >>> 32 - n, v0 = (e, t, n) => t << n - 32 | e >>> 64 - n, x0 = (e, t, n) => e << n - 32 | t >>> 64 - n;
function Ht(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const k0 = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), E0 = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, A0 = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), S0 = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, _0 = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), I0 = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, B0 = /* @__PURE__ */ Uint32Array.from([
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
]), rn = /* @__PURE__ */ new Uint32Array(64);
class $0 extends Rc {
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
      rn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = rn[d - 15], h = rn[d - 2], y = yt(f, 7) ^ yt(f, 18) ^ f >>> 3, w = yt(h, 17) ^ yt(h, 19) ^ h >>> 10;
      rn[d] = w + rn[d - 7] + y + rn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = yt(a, 6) ^ yt(a, 11) ^ yt(a, 25), h = u + f + y0(a, c, l) + B0[d] + rn[d] | 0, w = (yt(r, 2) ^ yt(r, 13) ^ yt(r, 22)) + w0(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    $t(rn);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), $t(this.buffer);
  }
}
class T0 extends $0 {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = nn[0] | 0;
  B = nn[1] | 0;
  C = nn[2] | 0;
  D = nn[3] | 0;
  E = nn[4] | 0;
  F = nn[5] | 0;
  G = nn[6] | 0;
  H = nn[7] | 0;
  constructor() {
    super(32);
  }
}
const Vf = jf([
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
].map((e) => BigInt(e))), P0 = Vf[0], O0 = Vf[1], on = /* @__PURE__ */ new Uint32Array(80), sn = /* @__PURE__ */ new Uint32Array(80);
class R0 extends Rc {
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
      on[E] = t.getUint32(n), sn[E] = t.getUint32(n += 4);
    for (let E = 16; E < 80; E++) {
      const O = on[E - 15] | 0, I = sn[E - 15] | 0, R = ur(O, I, 1) ^ ur(O, I, 8) ^ bd(O, I, 7), U = fr(O, I, 1) ^ fr(O, I, 8) ^ vd(O, I, 7), H = on[E - 2] | 0, B = sn[E - 2] | 0, D = ur(H, B, 19) ^ Gi(H, B, 61) ^ bd(H, B, 6), C = fr(H, B, 19) ^ Wi(H, B, 61) ^ vd(H, B, 6), x = A0(U, C, sn[E - 7], sn[E - 16]), v = S0(x, R, D, on[E - 7], on[E - 16]);
      on[E] = v | 0, sn[E] = x | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: l, Dl: u, Eh: d, El: f, Fh: h, Fl: y, Gh: w, Gl: p, Hh: m, Hl: S } = this;
    for (let E = 0; E < 80; E++) {
      const O = ur(d, f, 14) ^ ur(d, f, 18) ^ Gi(d, f, 41), I = fr(d, f, 14) ^ fr(d, f, 18) ^ Wi(d, f, 41), R = d & h ^ ~d & w, U = f & y ^ ~f & p, H = _0(S, I, U, O0[E], sn[E]), B = I0(H, m, O, R, P0[E], on[E]), D = H | 0, C = ur(r, i, 28) ^ Gi(r, i, 34) ^ Gi(r, i, 39), x = fr(r, i, 28) ^ Wi(r, i, 34) ^ Wi(r, i, 39), v = r & o ^ r & a ^ o & a, b = i & s ^ i & c ^ s & c;
      m = w | 0, S = p | 0, w = h | 0, p = y | 0, h = d | 0, y = f | 0, { h: d, l: f } = Ht(l | 0, u | 0, B | 0, D | 0), l = a | 0, u = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const g = k0(D, x, b);
      r = E0(g, B, C, v), i = g | 0;
    }
    ({ h: r, l: i } = Ht(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = Ht(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = Ht(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: l, l: u } = Ht(this.Dh | 0, this.Dl | 0, l | 0, u | 0), { h: d, l: f } = Ht(this.Eh | 0, this.El | 0, d | 0, f | 0), { h, l: y } = Ht(this.Fh | 0, this.Fl | 0, h | 0, y | 0), { h: w, l: p } = Ht(this.Gh | 0, this.Gl | 0, w | 0, p | 0), { h: m, l: S } = Ht(this.Hh | 0, this.Hl | 0, m | 0, S | 0), this.set(r, i, o, s, a, c, l, u, d, f, h, y, w, p, m, S);
  }
  roundClean() {
    $t(on, sn);
  }
  destroy() {
    this.destroyed = !0, $t(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class C0 extends R0 {
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
const ae = /* @__PURE__ */ As(
  () => new T0(),
  /* @__PURE__ */ Ff(1)
), Va = /* @__PURE__ */ As(
  () => new C0(),
  /* @__PURE__ */ Ff(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ne = (e, t, n) => Bt(e, t, n), qf = It, J = Tc, Ze = (...e) => p0(...e), it = (e) => Pc(e), Cc = zf, Lc = (e) => Oc(e), Uo = /* @__PURE__ */ BigInt(0), qa = /* @__PURE__ */ BigInt(1);
function Tn(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function Hc(e) {
  if (typeof e == "bigint") {
    if (!Io(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    qf(e);
  return e;
}
function No(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function Zi(e) {
  const t = Hc(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Gf(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? Uo : BigInt("0x" + e);
}
function Li(e) {
  return Gf(Tc(e));
}
function Rr(e) {
  return Gf(Tc(Ga(Bt(e)).reverse()));
}
function Uc(e, t) {
  if (It(t), t === 0)
    throw new RangeError("zero length");
  e = Hc(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return Pc(n.padStart(t * 2, "0"));
}
function Wf(e, t) {
  return Uc(e, t).reverse();
}
function L0(e, t) {
  if (e = ne(e), t = ne(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function Ga(e) {
  return Uint8Array.from(ne(e));
}
function H0(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const Io = (e) => typeof e == "bigint" && Uo <= e;
function U0(e, t, n) {
  return Io(e) && Io(t) && Io(n) && t <= e && e < n;
}
function Do(e, t, n, r) {
  if (!U0(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Nc(e) {
  if (e < Uo)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > Uo; e >>= qa, t += 1)
    ;
  return t;
}
const Dc = (e) => (qa << BigInt(e)) - qa;
function N0(e, t, n) {
  if (It(e, "hashLen"), It(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), l = r(e), u = 0;
  const d = () => {
    c.fill(1), l.fill(0), u = 0;
  }, f = (...p) => n(l, Ze(c, ...p)), h = (p = i) => {
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
    return Ze(...m);
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
const xd = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Be = /* @__PURE__ */ BigInt(0), he = /* @__PURE__ */ BigInt(1), Dn = /* @__PURE__ */ BigInt(2), Zf = /* @__PURE__ */ BigInt(3), Yf = /* @__PURE__ */ BigInt(4), Xf = /* @__PURE__ */ BigInt(5), D0 = /* @__PURE__ */ BigInt(7), Jf = /* @__PURE__ */ BigInt(8), z0 = /* @__PURE__ */ BigInt(9), Qf = /* @__PURE__ */ BigInt(16);
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
function kd(e, t) {
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
function zc(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function eh(e, t) {
  const n = e, r = (n.ORDER + he) / Yf, i = n.pow(t, r);
  return zc(n, i, t), i;
}
function M0(e, t) {
  const n = e, r = (n.ORDER - Xf) / Jf, i = n.mul(t, Dn), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, Dn), o), c = n.mul(s, n.sub(a, n.ONE));
  return zc(n, c, t), c;
}
function K0(e) {
  const t = Ss(e), n = th(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + D0) / Qf;
  return ((a, c) => {
    const l = a;
    let u = l.pow(c, s), d = l.mul(u, r);
    const f = l.mul(u, i), h = l.mul(u, o), y = l.eql(l.sqr(d), c), w = l.eql(l.sqr(f), c);
    u = l.cmov(u, d, y), d = l.cmov(h, f, w);
    const p = l.eql(l.sqr(d), c), m = l.cmov(u, d, p);
    return zc(l, m, c), m;
  });
}
function th(e) {
  if (e < Zf)
    throw new Error("sqrt is not defined for small field");
  let t = e - he, n = 0;
  for (; t % Dn === Be; )
    t /= Dn, n++;
  let r = Dn;
  const i = Ss(e);
  for (; Ed(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return eh;
  let o = i.pow(r, t);
  const s = (t + he) / Dn;
  return function(c, l) {
    const u = c;
    if (u.is0(l))
      return l;
    if (Ed(u, l) !== 1)
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
function F0(e) {
  return e % Yf === Zf ? eh : e % Jf === Xf ? M0 : e % Qf === z0 ? K0(e) : th(e);
}
const Cn = (e, t) => (ge(e, t) & he) === he, j0 = [
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
function V0(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = j0.reduce((r, i) => (r[i] = "function", r), t);
  if (Mr(e, n), No(e.BYTES, "BYTES"), No(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= he)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function q0(e, t, n) {
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
function nh(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, l) => r.is0(c) ? a : (i[l] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, l) => r.is0(c) ? a : (i[l] = r.mul(a, i[l]), r.mul(a, c)), s), i;
}
function Ed(e, t) {
  const n = e, r = (n.ORDER - he) / Dn, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function G0(e, t) {
  if (t !== void 0 && qf(t), e <= Be)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = Nc(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const Ad = /* @__PURE__ */ new WeakMap();
class rh {
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
    const { nBitLength: i, nByteLength: o } = G0(t, r);
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
    return q0(this, t, n);
  }
  div(t, n) {
    return ge(t * kd(n, this.ORDER), this.ORDER);
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
    return kd(t, this.ORDER);
  }
  sqrt(t) {
    let n = Ad.get(this);
    return n || Ad.set(this, n = F0(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? Wf(t, this.BYTES) : Uc(t, this.BYTES);
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
    return nh(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return Tn(r, "condition"), r ? n : t;
  }
}
Object.freeze(rh.prototype);
function Ss(e, t = {}) {
  return new rh(e, t);
}
function ih(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= he)
    throw new Error("field order must be greater than 1");
  const t = Nc(e - he);
  return Math.ceil(t / 8);
}
function oh(e) {
  const t = ih(e);
  return t + Math.ceil(t / 2);
}
function sh(e, t, n = !1) {
  ne(e);
  const r = e.length, i = ih(t), o = Math.max(oh(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? Rr(e) : Li(e), a = ge(s, t - he) + he;
  return n ? Wf(a, i) : Uc(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Cr = /* @__PURE__ */ BigInt(0), zn = /* @__PURE__ */ BigInt(1);
function zo(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function hi(e, t) {
  const n = nh(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function ah(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function sa(e, t) {
  ah(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = Dc(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function Sd(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += zn);
  const l = t * r, u = l + Math.abs(a) - 1, d = a === 0, f = a < 0, h = t % 2 !== 0;
  return { nextN: c, offset: u, isZero: d, isNeg: f, isNegF: h, offsetF: l };
}
const aa = /* @__PURE__ */ new WeakMap(), ch = /* @__PURE__ */ new WeakMap();
function ca(e) {
  return ch.get(e) || 1;
}
function _d(e) {
  if (e !== Cr)
    throw new Error("invalid wNAF");
}
let lh = class {
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
      const { nextN: c, offset: l, isZero: u, isNeg: d, isNegF: f, offsetF: h } = Sd(r, a, s);
      r = c, u ? o = o.add(zo(f, n[h])) : i = i.add(zo(d, n[l]));
    }
    return _d(r), { p: i, f: o };
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
      const { nextN: a, offset: c, isZero: l, isNeg: u } = Sd(r, s, o);
      if (r = a, !l) {
        const d = n[c];
        i = i.add(u ? d.negate() : d);
      }
    }
    return _d(r), i;
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
    ah(n, this.bits), ch.set(t, n), aa.delete(t);
  }
  hasCache(t) {
    return ca(t) !== 1;
  }
};
function W0(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > Cr || r > Cr; )
    n & zn && (o = o.add(i)), r & zn && (s = s.add(i)), i = i.double(), n >>= zn, r >>= zn;
  return { p1: o, p2: s };
}
function Id(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return V0(t), t;
  } else
    return Ss(e, { isLE: n });
}
function dh(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const l = t[c];
    if (!(typeof l == "bigint" && l > Cr))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = Id(t.p, n.Fp, r), o = Id(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function Mc(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const an = /* @__PURE__ */ BigInt(0), ke = /* @__PURE__ */ BigInt(1), la = /* @__PURE__ */ BigInt(2), Z0 = /* @__PURE__ */ BigInt(8);
function Y0(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function X0(e, t = {}) {
  const n = t, r = dh("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  Mr(n, {}, { uvRatio: "function" });
  const c = la << BigInt(o.BYTES * 8) - ke, l = (w) => i.create(w), u = n.uvRatio === void 0 ? (w, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(w, p)) };
    } catch {
      return { isValid: !1, value: an };
    }
  } : n.uvRatio;
  if (!Y0(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(w, p, m = !1) {
    const S = m ? ke : an;
    return Do("coordinate " + w, p, S, c), p;
  }
  function f(w) {
    if (!(w instanceof h))
      throw new Error("EdwardsPoint expected");
  }
  class h {
    // base / generator point
    static BASE = new h(s.Gx, s.Gy, ke, l(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new h(an, ke, ke, an);
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
      const S = i.BYTES, { a: E, d: O } = s;
      p = Ga(ne(p, S, "point")), Tn(m, "zip215");
      const I = Ga(p), R = p[S - 1];
      I[S - 1] = R & -129;
      const U = Rr(I), H = m ? c : i.ORDER;
      Do("point.y", U, an, H);
      const B = l(U * U), D = l(B - ke), C = l(O * B - E);
      let { isValid: x, value: v } = u(D, C);
      if (!x)
        throw new Error("bad point: invalid y coordinate");
      const b = (v & ke) === ke, g = (R & 128) !== 0;
      if (!m && v === an && g)
        throw new Error("bad point: x=0 and x_0=1");
      return g !== b && (v = l(-v)), h.fromAffine({ x: v, y: U });
    }
    static fromHex(p, m = !1) {
      return h.fromBytes(it(p), m);
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
      const { X: E, Y: O, Z: I, T: R } = p, U = l(E * E), H = l(O * O), B = l(I * I), D = l(B * B), C = l(U * m), x = l(B * l(C + H)), v = l(D + l(S * l(U * H)));
      if (x !== v)
        throw new Error("bad point: equation left != right (1)");
      const b = l(E * O), g = l(I * R);
      if (b !== g)
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(p) {
      f(p);
      const { X: m, Y: S, Z: E } = this, { X: O, Y: I, Z: R } = p, U = l(m * R), H = l(O * E), B = l(S * R), D = l(I * E);
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
      const { a: p } = s, { X: m, Y: S, Z: E } = this, O = l(m * m), I = l(S * S), R = l(la * l(E * E)), U = l(p * O), H = m + S, B = l(l(H * H) - O - I), D = U + I, C = D - R, x = U - I, v = l(B * C), b = l(D * x), g = l(B * x), k = l(C * D);
      return new h(v, b, k, g);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      f(p);
      const { a: m, d: S } = s, { X: E, Y: O, Z: I, T: R } = this, { X: U, Y: H, Z: B, T: D } = p, C = l(E * U), x = l(O * H), v = l(R * S * D), b = l(I * B), g = l((E + O) * (U + H) - C - x), k = b - v, _ = b + v, $ = l(x - m * C), T = l(g * k), P = l(_ * $), L = l(g * $), N = l(k * _);
      return new h(T, P, N, L);
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
      return p === an ? h.ZERO : this.is0() || p === ke ? this : y.unsafe(this, p, (m) => hi(h, m));
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
      const { X: E, Y: O, Z: I } = m, R = m.is0();
      S == null && (S = R ? Z0 : i.inv(I));
      const U = l(E * S), H = l(O * S), B = i.mul(I, S);
      if (R)
        return { x: an, y: ke };
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
  const y = new lh(h, o.BITS);
  return o.BITS >= 8 && h.BASE.precompute(8), Object.freeze(h.prototype), Object.freeze(h), h;
}
class J0 {
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
    xd();
  }
  static fromHex(t) {
    xd();
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
function Q0(e, t, n = {}) {
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
  if (l !== void 0 && (No(l, "hash.outputLen"), l !== u))
    throw new Error(`hash.outputLen must be ${u}, got ${l}`);
  const d = i.randomBytes === void 0 ? Lc : i.randomBytes, f = i.adjustScalarBytes === void 0 ? (x) => x : i.adjustScalarBytes, h = i.domain === void 0 ? (x, v, b) => {
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
    const b = Ze(...v);
    return y(r(h(b, ne(x, void 0, "context"), !!o)));
  }
  function E(x, v, b = {}) {
    x = ne(x, void 0, "message"), o && (x = o(x));
    const { prefix: g, scalar: k, pointBytes: _ } = p(v), $ = S(b.context, g, x), T = s.multiply($).toBytes(), P = S(b.context, T, _, x), L = c.create($ + P * k);
    if (!c.isValid(L))
      throw new Error("sign failed: invalid s");
    const N = Ze(T, c.toBytes(L));
    return ne(N, U.signature, "result");
  }
  const O = {
    zip215: i.zip215
  };
  function I(x, v, b, g = O) {
    const { context: k } = g, _ = g.zip215 === void 0 ? !!O.zip215 : g.zip215, $ = U.signature;
    x = ne(x, $, "signature"), v = ne(v, void 0, "message"), b = ne(b, U.publicKey, "publicKey"), _ !== void 0 && Tn(_, "zip215"), o && (v = o(v));
    const T = $ / 2, P = x.subarray(0, T), L = Rr(x.subarray(T, $));
    let N, K, z;
    try {
      N = e.fromBytes(b, _), K = e.fromBytes(P, _), z = s.multiplyUnsafe(L);
    } catch {
      return !1;
    }
    if (!_ && N.isSmallOrder())
      return !1;
    const M = S(k, P, b, v);
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
    return Cc(x) && x.length === U.secretKey;
  }
  function D(x, v) {
    try {
      return !!e.fromBytes(x, v === void 0 ? O.zip215 : v);
    } catch {
      return !1;
    }
  }
  const C = {
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
  return Object.freeze(U), Object.freeze(C), Object.freeze({
    keygen: Mc(H, m),
    getPublicKey: m,
    sign: E,
    verify: I,
    utils: C,
    Point: e,
    lengths: U
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const eb = /* @__PURE__ */ BigInt(0), pi = /* @__PURE__ */ BigInt(1), Bd = /* @__PURE__ */ BigInt(2), tb = /* @__PURE__ */ BigInt(5), nb = /* @__PURE__ */ BigInt(8), bi = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), uh = {
  p: bi,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: nb,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function rb(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = bi, a = e * e % o * e % o, c = ce(a, Bd, o) * a % o, l = ce(c, pi, o) * e % o, u = ce(l, tb, o) * l % o, d = ce(u, t, o) * u % o, f = ce(d, n, o) * d % o, h = ce(f, r, o) * f % o, y = ce(h, i, o) * h % o, w = ce(y, i, o) * h % o, p = ce(w, t, o) * u % o;
  return { pow_p_5_8: ce(p, Bd, o) * e % o, b2: a };
}
function ib(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Wa = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function fh(e, t) {
  const n = bi, r = ge(t * t * t, n), i = ge(r * r * t, n), o = rb(e * i).pow_p_5_8;
  let s = ge(e * r * o, n);
  const a = ge(t * s * s, n), c = s, l = ge(s * Wa, n), u = a === e, d = a === ge(-e, n), f = a === ge(-e * Wa, n);
  return u && (s = c), (d || f) && (s = l), Cn(s, n) && (s = ge(-s, n)), { isValid: u || d, value: s };
}
const Mn = /* @__PURE__ */ X0(uh, { uvRatio: fh }), Ln = Mn.Fp, ob = Mn.Fn;
function sb(e) {
  return Q0(Mn, Va, Object.assign({ adjustScalarBytes: ib, zip215: !0 }, e));
}
const at = /* @__PURE__ */ sb({}), $d = Wa, ab = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), Td = (e) => fh(pi, e), cb = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), lb = (e) => Ln.create(Rr(e) & cb);
class De extends J0 {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new De(Mn.BASE);
  // prettier-ignore
  static ZERO = new De(Mn.ZERO);
  // prettier-ignore
  static Fp = Ln;
  // prettier-ignore
  static Fn = ob;
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
    Bt(t, 32);
    const { a: n, d: r } = uh, i = bi, o = (O) => Ln.create(O), s = lb(t);
    if (!L0(Ln.toBytes(s), t) || Cn(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(pi + n * a), l = o(pi - n * a), u = o(c * c), d = o(l * l), f = o(n * r * u - d), { isValid: h, value: y } = Td(o(f * d)), w = o(y * l), p = o(y * w * f);
    let m = o((s + s) * w);
    Cn(m, i) && (m = o(-m));
    const S = o(c * p), E = o(m * S);
    if (!h || Cn(E, i) || S === eb)
      throw new Error("invalid ristretto255 encoding 2");
    return new De(new Mn(m, S, pi, E));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return De.fromBytes(Pc(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = bi, s = (p) => Ln.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), l = s(c * c), { value: u } = Td(s(a * l)), d = s(u * a), f = s(u * c), h = s(d * f * i);
    let y;
    if (Cn(i * h, o)) {
      let p = s(n * $d), m = s(t * $d);
      t = p, n = m, y = s(d * ab);
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
class Pd {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (Mf(t), Bt(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), $t(i);
  }
  update(t) {
    return Or(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Or(this), $c(t, this), this.finished = !0;
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
const Za = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new Pd(t, n).update(r).digest());
  return e.create = (t, n) => new Pd(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Od = (e, t) => (e + (e >= 0 ? t : -t) / hh) / t;
function db(e, t, n) {
  Do("scalar", e, kt, n);
  const [[r, i], [o, s]] = t, a = Od(s * e, n), c = Od(-i * e, n);
  let l = e - a * r - c * o, u = -a * i - c * s;
  const d = l < kt, f = u < kt;
  d && (l = -l), f && (u = -u);
  const h = Dc(Math.ceil(Nc(n) / 2)) + En;
  if (l < kt || l >= h || u < kt || u >= h)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: l, k2neg: f, k2: u };
}
function Ya(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function da(e, t) {
  Mr(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return Tn(n.lowS, "lowS"), Tn(n.prehash, "prehash"), n.format !== void 0 && Ya(n.format), n;
}
let ub = class extends Error {
  constructor(t = "") {
    super(t);
  }
};
const et = {
  // asn.1 DER encoding utils
  Err: ub,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = et;
      if (No(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = Zi(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? Zi(i.length / 2 | 128) : "";
      return Zi(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = et;
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
      const { Err: t } = et;
      if (Hc(e), e < kt)
        throw new t("integer: negative integers are not allowed");
      let n = Zi(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = et;
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
    const { Err: t, _int: n, _tlv: r } = et, i = ne(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: l, l: u } = r.decode(2, c);
    if (u.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(l) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = et, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
};
Object.freeze(et._tlv);
Object.freeze(et._int);
Object.freeze(et);
const kt = /* @__PURE__ */ BigInt(0), En = /* @__PURE__ */ BigInt(1), hh = /* @__PURE__ */ BigInt(2), Yi = /* @__PURE__ */ BigInt(3), fb = /* @__PURE__ */ BigInt(4);
function hb(e, t = {}) {
  const n = dh("weierstrass", e, t), r = n.Fp, i = n.Fn;
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
  const u = yh(r, i);
  function d() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function f(C, x, v) {
    if (l && x.is0())
      return Uint8Array.of(0);
    const { x: b, y: g } = x.toAffine(), k = r.toBytes(b);
    if (Tn(v, "isCompressed"), v) {
      d();
      const _ = !r.isOdd(g);
      return Ze(ph(_), k);
    } else
      return Ze(Uint8Array.of(4), k, r.toBytes(g));
  }
  function h(C) {
    ne(C, void 0, "Point");
    const { publicKey: x, publicKeyUncompressed: v } = u, b = C.length, g = C[0], k = C.subarray(1);
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
      const P = r.isOdd(T);
      return (g & 1) === 1 !== P && (T = r.neg(T)), { x: _, y: T };
    } else if (b === v && g === 4) {
      const _ = r.BYTES, $ = r.fromBytes(k.subarray(0, _)), T = r.fromBytes(k.subarray(_, _ * 2));
      if (!m($, T))
        throw new Error("bad point: is not on curve");
      return { x: $, y: T };
    } else
      throw new Error(`bad point: got length ${b}, expected compressed=${x} or uncompressed=${v}`);
  }
  const y = t.toBytes === void 0 ? f : t.toBytes, w = t.fromBytes === void 0 ? h : t.fromBytes;
  function p(C) {
    const x = r.sqr(C), v = r.mul(x, C);
    return r.add(r.add(v, r.mul(C, o.a)), o.b);
  }
  function m(C, x) {
    const v = r.sqr(x), b = p(C);
    return r.eql(v, b);
  }
  if (!m(o.Gx, o.Gy))
    throw new Error("bad curve params: generator point");
  const S = r.mul(r.pow(o.a, Yi), fb), E = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(S, E)))
    throw new Error("bad curve params: a or b");
  function O(C, x, v = !1) {
    if (!r.isValid(x) || v && r.is0(x))
      throw new Error(`bad point coordinate ${C}`);
    return x;
  }
  function I(C) {
    if (!(C instanceof H))
      throw new Error("Weierstrass Point expected");
  }
  function R(C) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return db(C, c.basises, i.ORDER);
  }
  function U(C, x, v, b, g) {
    return v = new H(r.mul(v.X, C), v.Y, v.Z), x = zo(b, x), v = zo(g, v), x.add(v);
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
      this.X = O("x", x), this.Y = O("y", v, !0), this.Z = O("z", b), Object.freeze(this);
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
      return H.fromBytes(it(x));
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
      return D.createCache(this, x), v || this.multiply(Yi), this;
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
      const { X: v, Y: b, Z: g } = this, { X: k, Y: _, Z: $ } = x, T = r.eql(r.mul(v, $), r.mul(k, g)), P = r.eql(r.mul(b, $), r.mul(_, g));
      return T && P;
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
      const { a: x, b: v } = o, b = r.mul(v, Yi), { X: g, Y: k, Z: _ } = this;
      let $ = r.ZERO, T = r.ZERO, P = r.ZERO, L = r.mul(g, g), N = r.mul(k, k), K = r.mul(_, _), z = r.mul(g, k);
      return z = r.add(z, z), P = r.mul(g, _), P = r.add(P, P), $ = r.mul(x, P), T = r.mul(b, K), T = r.add($, T), $ = r.sub(N, T), T = r.add(N, T), T = r.mul($, T), $ = r.mul(z, $), P = r.mul(b, P), K = r.mul(x, K), z = r.sub(L, K), z = r.mul(x, z), z = r.add(z, P), P = r.add(L, L), L = r.add(P, L), L = r.add(L, K), L = r.mul(L, z), T = r.add(T, L), K = r.mul(k, _), K = r.add(K, K), L = r.mul(K, z), $ = r.sub($, L), P = r.mul(K, N), P = r.add(P, P), P = r.add(P, P), new H($, T, P);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(x) {
      I(x);
      const { X: v, Y: b, Z: g } = this, { X: k, Y: _, Z: $ } = x;
      let T = r.ZERO, P = r.ZERO, L = r.ZERO;
      const N = o.a, K = r.mul(o.b, Yi);
      let z = r.mul(v, k), M = r.mul(b, _), j = r.mul(g, $), V = r.add(v, b), G = r.add(k, _);
      V = r.mul(V, G), G = r.add(z, M), V = r.sub(V, G), G = r.add(v, g);
      let W = r.add(k, $);
      return G = r.mul(G, W), W = r.add(z, j), G = r.sub(G, W), W = r.add(b, g), T = r.add(_, $), W = r.mul(W, T), T = r.add(M, j), W = r.sub(W, T), L = r.mul(N, G), T = r.mul(K, j), L = r.add(T, L), T = r.sub(M, L), L = r.add(M, L), P = r.mul(T, L), M = r.add(z, z), M = r.add(M, z), j = r.mul(N, j), G = r.mul(K, G), M = r.add(M, j), j = r.sub(z, j), j = r.mul(N, j), G = r.add(G, j), z = r.mul(M, G), P = r.add(P, z), z = r.mul(W, G), T = r.mul(V, T), T = r.sub(T, z), z = r.mul(V, M), L = r.mul(W, L), L = r.add(L, z), new H(T, P, L);
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
        const { k1neg: _, k1: $, k2neg: T, k2: P } = R(x), { p: L, f: N } = k($), { p: K, f: z } = k(P);
        g = N.add(z), b = U(v.beta, L, K, _, T);
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
      if (g === kt || b.is0())
        return H.ZERO;
      if (g === En)
        return b;
      if (D.hasCache(this))
        return this.multiply(g);
      if (v) {
        const { k1neg: k, k1: _, k2neg: $, k2: T } = R(g), { p1: P, p2: L } = W0(H, b, _, T);
        return U(v.beta, P, L, k, $);
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
      const T = r.mul(g, b), P = r.mul(k, b), L = r.mul(_, b);
      if ($)
        return { x: r.ZERO, y: r.ZERO };
      if (!r.eql(L, r.ONE))
        throw new Error("invZ was invalid");
      return { x: T, y: P };
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
  const B = i.BITS, D = new lh(H, t.endo ? Math.ceil(B / 2) : B);
  return B >= 8 && H.BASE.precompute(8), Object.freeze(H.prototype), Object.freeze(H), H;
}
function ph(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function yh(e, t) {
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
function pb(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? Lc : t.randomBytes, i = Object.assign(yh(e.Fp, n), {
    seed: Math.max(oh(n.ORDER), 16)
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
    return h = h === void 0 ? r(i.seed) : h, sh(ne(h, i.seed, "seed"), n.ORDER);
  }
  function c(h, y = !0) {
    return e.BASE.multiply(n.fromBytes(h)).toBytes(y);
  }
  function l(h) {
    const { secretKey: y, publicKey: w, publicKeyUncompressed: p } = i, m = n._lengths;
    if (!Cc(h))
      return;
    const S = ne(h, void 0, "key").length, E = S === w || S === p, O = S === y || !!m?.includes(S);
    if (!(E && O))
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
  }, f = Mc(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: u, keygen: f, Point: e, utils: d, lengths: i });
}
function yb(e, t, n = {}) {
  const r = t;
  Mf(r), Mr(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? Lc : n.randomBytes, o = n.hmac === void 0 ? (g, k) => Za(r, g, k) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: l } = a, { keygen: u, getPublicKey: d, getSharedSecret: f, utils: h, lengths: y } = pb(e, n), w = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * hh + En < s.ORDER;
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
  function O(g, k) {
    Ya(k);
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
      O(k, _);
      let $;
      if (_ === "der") {
        const { r: N, s: K } = et.toSig(ne(k));
        return new I(N, K);
      }
      _ === "recovered" && ($ = k[0], _ = "compact", k = k.subarray(1));
      const T = y.signature / 2, P = k.subarray(0, T), L = k.subarray(T, T * 2);
      return new I(a.fromBytes(P), a.fromBytes(L), $);
    }
    static fromHex(k, _) {
      return this.fromBytes(it(k), _);
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
      const { r: _, s: $ } = this, T = this.assertRecovery(), P = T === 2 || T === 3 ? _ + c : _;
      if (!s.isValid(P))
        throw new Error("invalid recovery id: sig.r+curve.n != R.x");
      const L = s.toBytes(P), N = e.fromBytes(Ze(ph((T & 1) === 0), L)), K = a.inv(P), z = U(ne(k, void 0, "msgHash")), M = a.create(-z * K), j = a.create($ * K), V = e.BASE.multiplyUnsafe(M).add(N.multiplyUnsafe(j));
      if (V.is0())
        throw new Error("invalid recovery: point at infinify");
      return V.assertValidity(), V;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return m(this.s);
    }
    toBytes(k = w.format) {
      if (Ya(k), k === "der")
        return it(et.hexFromSig(this));
      const { r: _, s: $ } = this, T = a.toBytes(_), P = a.toBytes($);
      return k === "recovered" ? (E(), Ze(Uint8Array.of(this.assertRecovery()), T, P)) : Ze(T, P);
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
  } : n.bits2int_modN, H = Dc(l);
  function B(g) {
    return Do("num < 2^" + l, g, kt, H), a.toBytes(g);
  }
  function D(g, k) {
    return ne(g, void 0, "message"), k ? ne(r(g), void 0, "prehashed message") : g;
  }
  function C(g, k, _) {
    const { lowS: $, prehash: T, extraEntropy: P } = da(_, w);
    g = D(g, T);
    const L = U(g), N = a.fromBytes(k);
    if (!a.isValidNot0(N))
      throw new Error("invalid private key");
    const K = [B(N), B(L)];
    if (P != null && P !== !1) {
      const V = P === !0 ? i(y.secretKey) : P;
      K.push(ne(V, void 0, "extraEntropy"));
    }
    const z = Ze(...K), M = L;
    function j(V) {
      const G = R(V);
      if (!a.isValidNot0(G))
        return;
      const W = a.inv(G), se = e.BASE.multiply(G).toAffine(), Fe = a.create(se.x);
      if (Fe === kt)
        return;
      const Rt = a.create(W * a.create(M + Fe * N));
      if (Rt === kt)
        return;
      let Jt = (se.x === Fe ? 0 : 2) | Number(se.y & En), Wr = Rt;
      return $ && m(Rt) && (Wr = a.neg(Rt), Jt ^= 1), new I(Fe, Wr, p ? void 0 : Jt);
    }
    return { seed: z, k2sig: j };
  }
  function x(g, k, _ = {}) {
    const { seed: $, k2sig: T } = C(g, k, _);
    return N0(r.outputLen, a.BYTES, o)($, T).toBytes(_.format);
  }
  function v(g, k, _, $ = {}) {
    const { lowS: T, prehash: P, format: L } = da($, w);
    if (_ = ne(_, void 0, "publicKey"), k = D(k, P), !Cc(g)) {
      const N = g instanceof I ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + N);
    }
    O(g, L);
    try {
      const N = I.fromBytes(g, L), K = e.fromBytes(_);
      if (T && N.hasHighS())
        return !1;
      const { r: z, s: M } = N, j = U(k), V = a.inv(M), G = a.create(j * V), W = a.create(z * V), se = e.BASE.multiplyUnsafe(G).add(K.multiplyUnsafe(W));
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
const _s = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, wb = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, gb = /* @__PURE__ */ BigInt(0), Xa = /* @__PURE__ */ BigInt(2);
function mb(e) {
  const t = _s.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), l = e * e * e % t, u = l * l * e % t, d = ce(u, n, t) * u % t, f = ce(d, n, t) * u % t, h = ce(f, Xa, t) * l % t, y = ce(h, i, t) * h % t, w = ce(y, o, t) * y % t, p = ce(w, a, t) * w % t, m = ce(p, c, t) * p % t, S = ce(m, a, t) * w % t, E = ce(S, n, t) * u % t, O = ce(E, s, t) * y % t, I = ce(O, r, t) * l % t, R = ce(I, Xa, t);
  if (!Mo.eql(Mo.sqr(R), e))
    throw new Error("Cannot find square root");
  return R;
}
const Mo = Ss(_s.p, { sqrt: mb }), ir = /* @__PURE__ */ hb(_s, {
  Fp: Mo,
  endo: wb
}), fe = /* @__PURE__ */ yb(ir, ae), Rd = {};
function Ko(e, ...t) {
  let n = Rd[e];
  if (n === void 0) {
    const r = ae(H0(e));
    n = Ze(r, r), Rd[e] = n;
  }
  return ae(Ze(n, ...t));
}
const Is = (e) => e.toBytes(!0).slice(1), Bs = (e) => e % Xa === gb;
function wh(e) {
  const { Fn: t, BASE: n } = ir, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: Bs(i.y) ? r : t.neg(r), bytes: Is(i) };
}
function gh(e) {
  const t = Mo;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  Bs(i) || (i = t.neg(i));
  const o = ir.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const _r = Li;
function mh(...e) {
  return ir.Fn.create(_r(Ko("BIP0340/challenge", ...e)));
}
function Cd(e) {
  return wh(e).bytes;
}
function bb(e, t, n = Oc(32)) {
  const { Fn: r, BASE: i } = ir, o = ne(e, void 0, "message"), { bytes: s, scalar: a } = wh(t), c = ne(n, 32, "auxRand"), l = r.toBytes(a ^ _r(Ko("BIP0340/aux", c))), u = Ko("BIP0340/nonce", l, s, o), d = r.create(_r(u));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const f = i.multiply(d), h = Bs(f.y) ? d : r.neg(d), y = Is(f), w = mh(y, s, o), p = new Uint8Array(64);
  if (p.set(y, 0), p.set(r.toBytes(r.create(h + w * a)), 32), !bh(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function bh(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = ir, s = ne(e, 64, "signature"), a = ne(t, void 0, "message"), c = ne(n, 32, "publicKey");
  try {
    const l = gh(_r(c)), u = _r(s.subarray(0, 32));
    if (!r.isValidNot0(u))
      return !1;
    const d = _r(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const f = mh(i.toBytes(u), Is(l), a), h = o.multiplyUnsafe(d).add(l.multiplyUnsafe(i.neg(f))), { x: y, y: w } = h.toAffine();
    return !(h.is0() || !Bs(w) || y !== u);
  } catch {
    return !1;
  }
}
const mn = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? Oc(48) : r, sh(r, _s.n));
  return Object.freeze({
    keygen: Mc(n, Cd),
    getPublicKey: Cd,
    sign: bb,
    verify: bh,
    Point: ir,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: Ko,
      lift_x: gh,
      pointToBytes: Is
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), vb = /* @__PURE__ */ Uint8Array.from([
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
]), vh = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), xb = vh.map((e) => (9 * e + 5) % 16), xh = /* @__PURE__ */ (() => {
  const n = [[vh], [xb]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => vb[o]));
  return n;
})(), kh = xh[0], Eh = xh[1], Ah = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), kb = /* @__PURE__ */ kh.map((e, t) => e.map((n) => Ah[t][n])), Eb = /* @__PURE__ */ Eh.map((e, t) => e.map((n) => Ah[t][n])), Ab = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Sb = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Ld(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const Xi = /* @__PURE__ */ new Uint32Array(16);
class _b extends Rc {
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
      Xi[h] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, l = this.h3 | 0, u = l, d = this.h4 | 0, f = d;
    for (let h = 0; h < 5; h++) {
      const y = 4 - h, w = Ab[h], p = Sb[h], m = kh[h], S = Eh[h], E = kb[h], O = Eb[h];
      for (let I = 0; I < 16; I++) {
        const R = Vi(r + Ld(h, o, a, l) + Xi[m[I]] + w, E[I]) + d | 0;
        r = d, d = l, l = Vi(a, 10) | 0, a = o, o = R;
      }
      for (let I = 0; I < 16; I++) {
        const R = Vi(i + Ld(y, s, c, u) + Xi[S[I]] + p, O[I]) + f | 0;
        i = f, f = u, u = Vi(c, 10) | 0, c = s, s = R;
      }
    }
    this.set(this.h1 + a + u | 0, this.h2 + l + f | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    $t(Xi);
  }
  destroy() {
    this.destroyed = !0, $t(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Kc = /* @__PURE__ */ As(() => new _b()), Ib = BigInt(0), Yr = BigInt(1), Bb = BigInt(2), $b = BigInt(7), Tb = BigInt(256), Pb = BigInt(113), Sh = [], _h = [], Ih = [];
for (let e = 0, t = Yr, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Sh.push(2 * (5 * r + n)), _h.push((e + 1) * (e + 2) / 2 % 64);
  let i = Ib;
  for (let o = 0; o < 7; o++)
    t = (t << Yr ^ (t >> $b) * Pb) % Tb, t & Bb && (i ^= Yr << (Yr << BigInt(o)) - Yr);
  Ih.push(i);
}
const Bh = jf(Ih, !0), Ob = Bh[0], Rb = Bh[1], Hd = (e, t, n) => n > 32 ? v0(e, t, n) : m0(e, t, n), Ud = (e, t, n) => n > 32 ? x0(e, t, n) : b0(e, t, n);
function Cb(e, t = 24) {
  if (It(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, l = n[c], u = n[c + 1], d = Hd(l, u, 1) ^ n[a], f = Ud(l, u, 1) ^ n[a + 1];
      for (let h = 0; h < 50; h += 10)
        e[s + h] ^= d, e[s + h + 1] ^= f;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = _h[s], c = Hd(i, o, a), l = Ud(i, o, a), u = Sh[s];
      i = e[u], o = e[u + 1], e[u] = c, e[u + 1] = l;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], l = e[s + 2], u = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & l, e[s + 9] ^= ~c & u;
    }
    e[0] ^= Ob[r], e[1] ^= Rb[r];
  }
  $t(n);
}
let Lb = class $h {
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
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, It(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = l0(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    wd(this.state32), Cb(this.state32, this.rounds), wd(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Or(this), Bt(t);
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
    Or(this, !1), Bt(t), this.finish();
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
    return It(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if ($c(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, $t(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new $h(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const Hb = (e, t, n, r = {}) => As(() => new Lb(t, e, n), r), Fo = /* @__PURE__ */ Hb(1, 136, 32), Ub = 1024 * 1024, Th = Object.getPrototypeOf(Uint8Array.prototype), Nb = Object.getOwnPropertyDescriptor(Th, Symbol.toStringTag).get, Db = Object.getOwnPropertyDescriptor(Th, "byteLength").get, zb = Uint8Array.prototype.set;
function Ph(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("exact message byte length is invalid");
  if (e > Ub) throw new Error("exact message exceeds the 1 MiB decoded limit");
}
function Oh(e) {
  const t = e.startsWith("0x") ? 2 : 0;
  Ph(Math.ceil((e.length - t) / 2));
}
function Fc(e) {
  if (typeof e == "string")
    return Oh(e), it(e.startsWith("0x") ? e.slice(2) : e);
  if (Nb.call(e) !== "Uint8Array") throw new TypeError("exact message must be hex or Uint8Array");
  const t = Db.call(e);
  Ph(t);
  const n = new Uint8Array(t);
  return zb.call(n, e), n;
}
const hr = typeof globalThis == "object" && "crypto" in globalThis ? globalThis.crypto : void 0;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function $s(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Ja(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function ze(e, ...t) {
  if (!$s(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function Rh(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  Ja(e.outputLen), Ja(e.blockLen);
}
function jo(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Mb(e, t) {
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
function wt(e, t) {
  return e << 32 - t | e >>> t;
}
function Ji(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const Ch = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Kb = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Yn(e) {
  if (ze(e), Ch)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Kb[e[n]];
  return t;
}
const Ut = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Nd(e) {
  if (e >= Ut._0 && e <= Ut._9)
    return e - Ut._0;
  if (e >= Ut.A && e <= Ut.F)
    return e - (Ut.A - 10);
  if (e >= Ut.a && e <= Ut.f)
    return e - (Ut.a - 10);
}
function vi(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Ch)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Nd(e.charCodeAt(o)), a = Nd(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Lh(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function jc(e) {
  return typeof e == "string" && (e = Lh(e)), ze(e), e;
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
let Hh = class {
};
function Vc(e) {
  const t = (r) => e().update(jc(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
function Uh(e = 32) {
  if (hr && typeof hr.getRandomValues == "function")
    return hr.getRandomValues(new Uint8Array(e));
  if (hr && typeof hr.randomBytes == "function")
    return Uint8Array.from(hr.randomBytes(e));
  throw new Error("crypto.getRandomValues must be defined");
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const qc = /* @__PURE__ */ BigInt(0), Qa = /* @__PURE__ */ BigInt(1);
function Vo(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}"`;
    throw new Error(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function Kn(e, t, n = "") {
  const r = $s(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Qi(e) {
  const t = e.toString(16);
  return t.length & 1 ? "0" + t : t;
}
function Nh(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  return e === "" ? qc : BigInt("0x" + e);
}
function Ts(e) {
  return Nh(Yn(e));
}
function Dh(e) {
  return ze(e), Nh(Yn(Uint8Array.from(e).reverse()));
}
function Gc(e, t) {
  return vi(e.toString(16).padStart(t * 2, "0"));
}
function zh(e, t) {
  return Gc(e, t).reverse();
}
function Ce(e, t, n) {
  let r;
  if (typeof t == "string")
    try {
      r = vi(t);
    } catch (i) {
      throw new Error(e + " must be hex string or Uint8Array, cause: " + i);
    }
  else if ($s(t))
    r = Uint8Array.from(t);
  else
    throw new Error(e + " must be hex string or Uint8Array");
  return r.length, r;
}
const ua = (e) => typeof e == "bigint" && qc <= e;
function Fb(e, t, n) {
  return ua(e) && ua(t) && ua(n) && t <= e && e < n;
}
function jb(e, t, n, r) {
  if (!Fb(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function Mh(e) {
  let t;
  for (t = 0; e > qc; e >>= Qa, t += 1)
    ;
  return t;
}
const Hi = (e) => (Qa << BigInt(e)) - Qa;
function Vb(e, t, n) {
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
function Wc(e, t, n = {}) {
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
function Dd(e) {
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
const He = BigInt(0), Re = BigInt(1), Fn = /* @__PURE__ */ BigInt(2), Kh = /* @__PURE__ */ BigInt(3), Fh = /* @__PURE__ */ BigInt(4), jh = /* @__PURE__ */ BigInt(5), qb = /* @__PURE__ */ BigInt(7), Vh = /* @__PURE__ */ BigInt(8), Gb = /* @__PURE__ */ BigInt(9), qh = /* @__PURE__ */ BigInt(16);
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
function zd(e, t) {
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
function Zc(e, t, n) {
  if (!e.eql(e.sqr(t), n))
    throw new Error("Cannot find square root");
}
function Gh(e, t) {
  const n = (e.ORDER + Re) / Fh, r = e.pow(t, n);
  return Zc(e, r, t), r;
}
function Wb(e, t) {
  const n = (e.ORDER - jh) / Vh, r = e.mul(t, Fn), i = e.pow(r, n), o = e.mul(t, i), s = e.mul(e.mul(o, Fn), i), a = e.mul(o, e.sub(s, e.ONE));
  return Zc(e, a, t), a;
}
function Zb(e) {
  const t = Ui(e), n = Wh(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + qb) / qh;
  return (a, c) => {
    let l = a.pow(c, s), u = a.mul(l, r);
    const d = a.mul(l, i), f = a.mul(l, o), h = a.eql(a.sqr(u), c), y = a.eql(a.sqr(d), c);
    l = a.cmov(l, u, h), u = a.cmov(f, d, y);
    const w = a.eql(a.sqr(u), c), p = a.cmov(l, u, w);
    return Zc(a, p, c), p;
  };
}
function Wh(e) {
  if (e < Kh)
    throw new Error("sqrt is not defined for small field");
  let t = e - Re, n = 0;
  for (; t % Fn === He; )
    t /= Fn, n++;
  let r = Fn;
  const i = Ui(e);
  for (; Md(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return Gh;
  let o = i.pow(r, t);
  const s = (t + Re) / Fn;
  return function(c, l) {
    if (c.is0(l))
      return l;
    if (Md(c, l) !== 1)
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
function Yb(e) {
  return e % Fh === Kh ? Gh : e % Vh === jh ? Wb : e % qh === Gb ? Zb(e) : Wh(e);
}
const Xb = [
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
function Jb(e) {
  const t = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = Xb.reduce((r, i) => (r[i] = "function", r), t);
  return Wc(e, n), e;
}
function Qb(e, t, n) {
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
function Zh(e, t, n = !1) {
  const r = new Array(t.length).fill(n ? e.ZERO : void 0), i = t.reduce((s, a, c) => e.is0(a) ? s : (r[c] = s, e.mul(s, a)), e.ONE), o = e.inv(i);
  return t.reduceRight((s, a, c) => e.is0(a) ? s : (r[c] = e.mul(s, r[c]), e.mul(s, a)), o), r;
}
function Md(e, t) {
  const n = (e.ORDER - Re) / Fn, r = e.pow(t, n), i = e.eql(r, e.ONE), o = e.eql(r, e.ZERO), s = e.eql(r, e.neg(e.ONE));
  if (!i && !o && !s)
    throw new Error("invalid Legendre symbol result");
  return i ? 1 : o ? 0 : -1;
}
function Yh(e, t) {
  t !== void 0 && Ja(t);
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
  const { nBitLength: c, nByteLength: l } = Yh(e, i);
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
    pow: (f, h) => Qb(d, f, h),
    div: (f, h) => Ge(f * zd(h, e), e),
    // Same as above, but doesn't normalize
    sqrN: (f) => f * f,
    addN: (f, h) => f + h,
    subN: (f, h) => f - h,
    mulN: (f, h) => f * h,
    inv: (f) => zd(f, e),
    sqrt: o || ((f) => (u || (u = Yb(e)), u(d, f))),
    toBytes: (f) => n ? zh(f, l) : Gc(f, l),
    fromBytes: (f, h = !0) => {
      if (a) {
        if (!a.includes(f.length) || f.length > l)
          throw new Error("Field.fromBytes: expected " + a + " bytes, got " + f.length);
        const w = new Uint8Array(l);
        w.set(f, n ? 0 : w.length - f.length), f = w;
      }
      if (f.length !== l)
        throw new Error("Field.fromBytes: expected " + l + " bytes, got " + f.length);
      let y = n ? Dh(f) : Ts(f);
      if (s && (y = Ge(y, e)), !h && !d.isValid(y))
        throw new Error("invalid field element: outside of range 0..ORDER");
      return y;
    },
    // TODO: we don't need it here, move out to separate fn
    invertBatch: (f) => Zh(d, f),
    // We can't move this out because Fp6, Fp12 implement it
    // and it's unclear what to return in there.
    cmov: (f, h, y) => y ? h : f
  });
  return Object.freeze(d);
}
function Xh(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  const t = e.toString(2).length;
  return Math.ceil(t / 8);
}
function Jh(e) {
  const t = Xh(e);
  return t + Math.ceil(t / 2);
}
function ev(e, t, n = !1) {
  const r = e.length, i = Xh(t), o = Jh(t);
  if (r < 16 || r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? Dh(e) : Ts(e), a = Ge(s, t - Re) + Re;
  return n ? zh(a, i) : Gc(a, i);
}
function tv(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, l = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + l, a, r);
}
function nv(e, t, n) {
  return e & t ^ ~e & n;
}
function rv(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Yc = class extends Hh {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Ir(this.buffer);
  }
  update(t) {
    jo(this), t = jc(t), ze(t);
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
    jo(this), Mb(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Pn(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    tv(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
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
const cn = /* @__PURE__ */ Uint32Array.from([
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
]), eo = /* @__PURE__ */ BigInt(2 ** 32 - 1), Kd = /* @__PURE__ */ BigInt(32);
function iv(e, t = !1) {
  return t ? { h: Number(e & eo), l: Number(e >> Kd & eo) } : { h: Number(e >> Kd & eo) | 0, l: Number(e & eo) | 0 };
}
function ov(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = iv(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Fd = (e, t, n) => e >>> n, jd = (e, t, n) => e << 32 - n | t >>> n, pr = (e, t, n) => e >>> n | t << 32 - n, yr = (e, t, n) => e << 32 - n | t >>> n, to = (e, t, n) => e << 64 - n | t >>> n - 32, no = (e, t, n) => e >>> n - 32 | t << 64 - n;
function Nt(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const sv = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), av = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, cv = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), lv = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, dv = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), uv = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, fv = /* @__PURE__ */ Uint32Array.from([
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
]), ln = /* @__PURE__ */ new Uint32Array(64);
let hv = class extends Yc {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = cn[0] | 0, this.B = cn[1] | 0, this.C = cn[2] | 0, this.D = cn[3] | 0, this.E = cn[4] | 0, this.F = cn[5] | 0, this.G = cn[6] | 0, this.H = cn[7] | 0;
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
      ln[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = ln[d - 15], h = ln[d - 2], y = wt(f, 7) ^ wt(f, 18) ^ f >>> 3, w = wt(h, 17) ^ wt(h, 19) ^ h >>> 10;
      ln[d] = w + ln[d - 7] + y + ln[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = wt(a, 6) ^ wt(a, 11) ^ wt(a, 25), h = u + f + nv(a, c, l) + fv[d] + ln[d] | 0, w = (wt(r, 2) ^ wt(r, 13) ^ wt(r, 22)) + rv(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Pn(ln);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Pn(this.buffer);
  }
};
const Qh = ov([
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
].map((e) => BigInt(e))), pv = Qh[0], yv = Qh[1], dn = /* @__PURE__ */ new Uint32Array(80), un = /* @__PURE__ */ new Uint32Array(80);
let wv = class extends Yc {
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
      dn[E] = t.getUint32(n), un[E] = t.getUint32(n += 4);
    for (let E = 16; E < 80; E++) {
      const O = dn[E - 15] | 0, I = un[E - 15] | 0, R = pr(O, I, 1) ^ pr(O, I, 8) ^ Fd(O, I, 7), U = yr(O, I, 1) ^ yr(O, I, 8) ^ jd(O, I, 7), H = dn[E - 2] | 0, B = un[E - 2] | 0, D = pr(H, B, 19) ^ to(H, B, 61) ^ Fd(H, B, 6), C = yr(H, B, 19) ^ no(H, B, 61) ^ jd(H, B, 6), x = cv(U, C, un[E - 7], un[E - 16]), v = lv(x, R, D, dn[E - 7], dn[E - 16]);
      dn[E] = v | 0, un[E] = x | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: l, Dl: u, Eh: d, El: f, Fh: h, Fl: y, Gh: w, Gl: p, Hh: m, Hl: S } = this;
    for (let E = 0; E < 80; E++) {
      const O = pr(d, f, 14) ^ pr(d, f, 18) ^ to(d, f, 41), I = yr(d, f, 14) ^ yr(d, f, 18) ^ no(d, f, 41), R = d & h ^ ~d & w, U = f & y ^ ~f & p, H = dv(S, I, U, yv[E], un[E]), B = uv(H, m, O, R, pv[E], dn[E]), D = H | 0, C = pr(r, i, 28) ^ to(r, i, 34) ^ to(r, i, 39), x = yr(r, i, 28) ^ no(r, i, 34) ^ no(r, i, 39), v = r & o ^ r & a ^ o & a, b = i & s ^ i & c ^ s & c;
      m = w | 0, S = p | 0, w = h | 0, p = y | 0, h = d | 0, y = f | 0, { h: d, l: f } = Nt(l | 0, u | 0, B | 0, D | 0), l = a | 0, u = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const g = sv(D, x, b);
      r = av(g, B, C, v), i = g | 0;
    }
    ({ h: r, l: i } = Nt(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = Nt(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = Nt(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: l, l: u } = Nt(this.Dh | 0, this.Dl | 0, l | 0, u | 0), { h: d, l: f } = Nt(this.Eh | 0, this.El | 0, d | 0, f | 0), { h, l: y } = Nt(this.Fh | 0, this.Fl | 0, h | 0, y | 0), { h: w, l: p } = Nt(this.Gh | 0, this.Gl | 0, w | 0, p | 0), { h: m, l: S } = Nt(this.Hh | 0, this.Hl | 0, m | 0, S | 0), this.set(r, i, o, s, a, c, l, u, d, f, h, y, w, p, m, S);
  }
  roundClean() {
    Pn(dn, un);
  }
  destroy() {
    Pn(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
};
const Xc = /* @__PURE__ */ Vc(() => new hv()), Vd = /* @__PURE__ */ Vc(() => new wv());
let ep = class extends Hh {
  constructor(t, n) {
    super(), this.finished = !1, this.destroyed = !1, Rh(t);
    const r = jc(n);
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
    return jo(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    jo(this), ze(t, this.outputLen), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const qo = (e, t, n) => new ep(e, t).update(n).digest();
qo.create = (e, t) => new ep(e, t);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Lr = BigInt(0), jn = BigInt(1);
function Go(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function fa(e, t) {
  const n = Zh(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function tp(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function ha(e, t) {
  tp(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = Hi(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function qd(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += jn);
  const l = t * r, u = l + Math.abs(a) - 1, d = a === 0, f = a < 0, h = t % 2 !== 0;
  return { nextN: c, offset: u, isZero: d, isNeg: f, isNegF: h, offsetF: l };
}
function gv(e, t) {
  if (!Array.isArray(e))
    throw new Error("array expected");
  e.forEach((n, r) => {
    if (!(n instanceof t))
      throw new Error("invalid point at index " + r);
  });
}
function mv(e, t) {
  if (!Array.isArray(e))
    throw new Error("array of scalars expected");
  e.forEach((n, r) => {
    if (!t.isValid(n))
      throw new Error("invalid scalar at index " + r);
  });
}
const pa = /* @__PURE__ */ new WeakMap(), np = /* @__PURE__ */ new WeakMap();
function ya(e) {
  return np.get(e) || 1;
}
function Gd(e) {
  if (e !== Lr)
    throw new Error("invalid wNAF");
}
class bv {
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
      const { nextN: c, offset: l, isZero: u, isNeg: d, isNegF: f, offsetF: h } = qd(r, a, s);
      r = c, u ? o = o.add(Go(f, n[h])) : i = i.add(Go(d, n[l]));
    }
    return Gd(r), { p: i, f: o };
  }
  /**
   * Implements ec unsafe (non const-time) multiplication using precomputed tables and w-ary non-adjacent form.
   * @param acc accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = ha(t, this.bits);
    for (let s = 0; s < o.windows && r !== Lr; s++) {
      const { nextN: a, offset: c, isZero: l, isNeg: u } = qd(r, s, o);
      if (r = a, !l) {
        const d = n[c];
        i = i.add(u ? d.negate() : d);
      }
    }
    return Gd(r), i;
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
    tp(n, this.bits), np.set(t, n), pa.delete(t);
  }
  hasCache(t) {
    return ya(t) !== 1;
  }
}
function vv(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > Lr || r > Lr; )
    n & jn && (o = o.add(i)), r & jn && (s = s.add(i)), i = i.double(), n >>= jn, r >>= jn;
  return { p1: o, p2: s };
}
function xv(e, t, n, r) {
  gv(n, e), mv(r, t);
  const i = n.length, o = r.length;
  if (i !== o)
    throw new Error("arrays of points and scalars must have equal length");
  const s = e.ZERO, a = Mh(BigInt(i));
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
function Wd(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return Jb(t), t;
  } else
    return Ui(e, { isLE: n });
}
function kv(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const l = t[c];
    if (!(typeof l == "bigint" && l > Lr))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = Wd(t.p, n.Fp, r), o = Wd(t.n, n.Fn, r), a = ["Gx", "Gy", "a", "b"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Zd = (e, t) => (e + (e >= 0 ? t : -t) / rp) / t;
function Ev(e, t, n) {
  const [[r, i], [o, s]] = t, a = Zd(s * e, n), c = Zd(-i * e, n);
  let l = e - a * r - c * o, u = -a * i - c * s;
  const d = l < Vt, f = u < Vt;
  d && (l = -l), f && (u = -u);
  const h = Hi(Math.ceil(Mh(n) / 2)) + Br;
  if (l < Vt || l >= h || u < Vt || u >= h)
    throw new Error("splitScalar (endomorphism): failed, k=" + e);
  return { k1neg: d, k1: l, k2neg: f, k2: u };
}
function ec(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function wa(e, t) {
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return Vo(n.lowS, "lowS"), Vo(n.prehash, "prehash"), n.format !== void 0 && ec(n.format), n;
}
class Av extends Error {
  constructor(t = "") {
    super(t);
  }
}
const Ft = {
  // asn.1 DER encoding utils
  Err: Av,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = Ft;
      if (e < 0 || e > 256)
        throw new n("tlv.encode: wrong tag");
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = Qi(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? Qi(i.length / 2 | 128) : "";
      return Qi(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = Ft;
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
      const { Err: t } = Ft;
      if (e < Vt)
        throw new t("integer: negative integers are not allowed");
      let n = Qi(e);
      if (Number.parseInt(n[0], 16) & 8 && (n = "00" + n), n.length & 1)
        throw new t("unexpected DER parsing assertion: unpadded hex");
      return n;
    },
    decode(e) {
      const { Err: t } = Ft;
      if (e[0] & 128)
        throw new t("invalid signature integer: negative");
      if (e[0] === 0 && !(e[1] & 128))
        throw new t("invalid signature integer: unnecessary leading zero");
      return Ts(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = Ft, i = Ce("signature", e), { v: o, l: s } = r.decode(48, i);
    if (s.length)
      throw new t("invalid signature: left bytes after parsing");
    const { v: a, l: c } = r.decode(2, o), { v: l, l: u } = r.decode(2, c);
    if (u.length)
      throw new t("invalid signature: left bytes after parsing");
    return { r: n.decode(a), s: n.decode(l) };
  },
  hexFromSig(e) {
    const { _tlv: t, _int: n } = Ft, r = t.encode(2, n.encode(e.r)), i = t.encode(2, n.encode(e.s)), o = r + i;
    return t.encode(48, o);
  }
}, Vt = BigInt(0), Br = BigInt(1), rp = BigInt(2), ro = BigInt(3), Sv = BigInt(4);
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
function _v(e, t = {}) {
  const n = kv("weierstrass", e, t), { Fp: r, Fn: i } = n;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  Wc(t, {}, {
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
  const l = op(r, i);
  function u() {
    if (!r.isOdd)
      throw new Error("compression is not supported: Field does not have .isOdd()");
  }
  function d(x, v, b) {
    const { x: g, y: k } = v.toAffine(), _ = r.toBytes(g);
    if (Vo(b, "isCompressed"), b) {
      u();
      const $ = !r.isOdd(k);
      return We(ip($), _);
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
      let P;
      try {
        P = r.sqrt(T);
      } catch (K) {
        const z = K instanceof Error ? ": " + K.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + z);
      }
      u();
      const L = r.isOdd(P);
      return (k & 1) === 1 !== L && (P = r.neg(P)), { x: $, y: P };
    } else if (g === b && k === 4) {
      const $ = r.BYTES, T = r.fromBytes(_.subarray(0, $)), P = r.fromBytes(_.subarray($, $ * 2));
      if (!p(T, P))
        throw new Error("bad point: is not on curve");
      return { x: T, y: P };
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
  const m = r.mul(r.pow(o.a, ro), Sv), S = r.mul(r.sqr(o.b), BigInt(27));
  if (r.is0(r.add(m, S)))
    throw new Error("bad curve params: a or b");
  function E(x, v, b = !1) {
    if (!r.isValid(v) || b && r.is0(v))
      throw new Error(`bad point coordinate ${x}`);
    return v;
  }
  function O(x) {
    if (!(x instanceof B))
      throw new Error("ProjectivePoint expected");
  }
  function I(x) {
    if (!c || !c.basises)
      throw new Error("no endo");
    return Ev(x, c.basises, i.ORDER);
  }
  const R = Dd((x, v) => {
    const { X: b, Y: g, Z: k } = x;
    if (r.eql(k, r.ONE))
      return { x: b, y: g };
    const _ = x.is0();
    v == null && (v = _ ? r.ONE : r.inv(k));
    const $ = r.mul(b, v), T = r.mul(g, v), P = r.mul(k, v);
    if (_)
      return { x: r.ZERO, y: r.ZERO };
    if (!r.eql(P, r.ONE))
      throw new Error("invZ was invalid");
    return { x: $, y: T };
  }), U = Dd((x) => {
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
    return b = new B(r.mul(b.X, x), b.Y, b.Z), v = Go(g, v), b = Go(k, b), v.add(b);
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
      return C.createCache(this, v), b || this.multiply(ro), this;
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
      O(v);
      const { X: b, Y: g, Z: k } = this, { X: _, Y: $, Z: T } = v, P = r.eql(r.mul(b, T), r.mul(_, k)), L = r.eql(r.mul(g, T), r.mul($, k));
      return P && L;
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
      const { a: v, b } = o, g = r.mul(b, ro), { X: k, Y: _, Z: $ } = this;
      let T = r.ZERO, P = r.ZERO, L = r.ZERO, N = r.mul(k, k), K = r.mul(_, _), z = r.mul($, $), M = r.mul(k, _);
      return M = r.add(M, M), L = r.mul(k, $), L = r.add(L, L), T = r.mul(v, L), P = r.mul(g, z), P = r.add(T, P), T = r.sub(K, P), P = r.add(K, P), P = r.mul(T, P), T = r.mul(M, T), L = r.mul(g, L), z = r.mul(v, z), M = r.sub(N, z), M = r.mul(v, M), M = r.add(M, L), L = r.add(N, N), N = r.add(L, N), N = r.add(N, z), N = r.mul(N, M), P = r.add(P, N), z = r.mul(_, $), z = r.add(z, z), N = r.mul(z, M), T = r.sub(T, N), L = r.mul(z, K), L = r.add(L, L), L = r.add(L, L), new B(T, P, L);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(v) {
      O(v);
      const { X: b, Y: g, Z: k } = this, { X: _, Y: $, Z: T } = v;
      let P = r.ZERO, L = r.ZERO, N = r.ZERO;
      const K = o.a, z = r.mul(o.b, ro);
      let M = r.mul(b, _), j = r.mul(g, $), V = r.mul(k, T), G = r.add(b, g), W = r.add(_, $);
      G = r.mul(G, W), W = r.add(M, j), G = r.sub(G, W), W = r.add(b, k);
      let se = r.add(_, T);
      return W = r.mul(W, se), se = r.add(M, V), W = r.sub(W, se), se = r.add(g, k), P = r.add($, T), se = r.mul(se, P), P = r.add(j, V), se = r.sub(se, P), N = r.mul(K, W), P = r.mul(z, V), N = r.add(P, N), P = r.sub(j, N), N = r.add(j, N), L = r.mul(P, N), j = r.add(M, M), j = r.add(j, M), V = r.mul(K, V), W = r.mul(z, W), j = r.add(j, V), V = r.sub(M, V), V = r.mul(K, V), W = r.add(W, V), M = r.mul(j, W), L = r.add(L, M), M = r.mul(se, W), P = r.mul(G, P), P = r.sub(P, M), M = r.mul(G, j), N = r.mul(se, N), N = r.add(N, M), new B(P, L, N);
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
      const _ = ($) => C.cached(this, $, (T) => fa(B, T));
      if (b) {
        const { k1neg: $, k1: T, k2neg: P, k2: L } = I(v), { p: N, f: K } = _(T), { p: z, f: M } = _(L);
        k = K.add(M), g = H(b.beta, N, z, $, P);
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
      if (v === Vt || g.is0())
        return B.ZERO;
      if (v === Br)
        return g;
      if (C.hasCache(this))
        return this.multiply(v);
      if (b) {
        const { k1neg: k, k1: _, k2neg: $, k2: T } = I(v), { p1: P, p2: L } = vv(B, g, _, T);
        return H(b.beta, P, L, k, $);
      } else
        return C.unsafe(g, v);
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
      return s === Br ? !0 : v ? v(B, this) : C.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: v } = t;
      return s === Br ? this : v ? v(B, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return this.multiplyUnsafe(s).is0();
    }
    toBytes(v = !0) {
      return Vo(v, "isCompressed"), this.assertValidity(), h(B, this, v);
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
      return xv(B, i, v, b);
    }
    static fromPrivateKey(v) {
      return B.BASE.multiply(Er(i, v));
    }
  }
  B.BASE = new B(o.Gx, o.Gy, r.ONE), B.ZERO = new B(r.ZERO, r.ONE, r.ZERO), B.Fp = r, B.Fn = i;
  const D = i.BITS, C = new bv(B, t.endo ? Math.ceil(D / 2) : D);
  return B.BASE.precompute(8), B;
}
function ip(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function op(e, t) {
  return {
    secretKey: t.BYTES,
    publicKey: 1 + e.BYTES,
    publicKeyUncompressed: 1 + 2 * e.BYTES,
    publicKeyHasPrefix: !0,
    signature: 2 * t.BYTES
  };
}
function Iv(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes || Uh, i = Object.assign(op(e.Fp, n), { seed: Jh(n.ORDER) });
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
    return ev(Kn(h, i.seed, "seed"), n.ORDER);
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
function Bv(e, t, n = {}) {
  Rh(t), Wc(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  });
  const r = n.randomBytes || Uh, i = n.hmac || ((b, ...g) => qo(t, b, We(...g))), { Fp: o, Fn: s } = e, { ORDER: a, BITS: c } = s, { keygen: l, getPublicKey: u, getSharedSecret: d, utils: f, lengths: h } = Iv(e, n), y = {
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
    ec(g);
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
        const { r: L, s: N } = Ft.toSig(Kn(g));
        return new E(L, N);
      }
      k === "recovered" && (_ = g[0], k = "compact", g = g.subarray(1));
      const $ = s.BYTES, T = g.subarray(0, $), P = g.subarray($, $ * 2);
      return new E(s.fromBytes(T), s.fromBytes(P), _);
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
      if (a * rp < k && T > 1)
        throw new Error("recovery id is ambiguous for h>1 curve");
      const L = T === 2 || T === 3 ? _ + a : _;
      if (!o.isValid(L))
        throw new Error("recovery id 2 or 3 invalid");
      const N = o.toBytes(L), K = e.fromBytes(We(ip((T & 1) === 0), N)), z = s.inv(L), M = I(Ce("msgHash", g)), j = s.create(-M * z), V = s.create($ * z), G = e.BASE.multiplyUnsafe(j).add(K.multiplyUnsafe(V));
      if (G.is0())
        throw new Error("point at infinify");
      return G.assertValidity(), G;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return p(this.s);
    }
    toBytes(g = w) {
      if (ec(g), g === "der")
        return vi(Ft.hexFromSig(this));
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
  const O = n.bits2int || function(g) {
    if (g.length > 8192)
      throw new Error("input is too large");
    const k = Ts(g), _ = g.length * 8 - c;
    return _ > 0 ? k >> BigInt(_) : k;
  }, I = n.bits2int_modN || function(g) {
    return s.create(O(g));
  }, R = Hi(c);
  function U(b) {
    return jb("num < 2^" + c, b, Vt, R), s.toBytes(b);
  }
  function H(b, g) {
    return Kn(b, void 0, "message"), g ? Kn(t(b), void 0, "prehashed message") : b;
  }
  function B(b, g, k) {
    if (["recovered", "canonical"].some((j) => j in k))
      throw new Error("sign() legacy options not supported");
    const { lowS: _, prehash: $, extraEntropy: T } = wa(k, y);
    b = H(b, $);
    const P = I(b), L = Er(s, g), N = [U(L), U(P)];
    if (T != null && T !== !1) {
      const j = T === !0 ? r(h.secretKey) : T;
      N.push(Ce("extraEntropy", j));
    }
    const K = We(...N), z = P;
    function M(j) {
      const V = O(j);
      if (!s.isValidNot0(V))
        return;
      const G = s.inv(V), W = e.BASE.multiply(V).toAffine(), se = s.create(W.x);
      if (se === Vt)
        return;
      const Fe = s.create(G * s.create(z + se * L));
      if (Fe === Vt)
        return;
      let Rt = (W.x === se ? 0 : 2) | Number(W.y & Br), Jt = Fe;
      return _ && p(Fe) && (Jt = s.neg(Fe), Rt ^= 1), new E(se, Jt, Rt);
    }
    return { seed: K, k2sig: M };
  }
  function D(b, g, k = {}) {
    b = Ce("message", b);
    const { seed: _, k2sig: $ } = B(b, g, k);
    return Vb(t.outputLen, s.BYTES, i)(_, $);
  }
  function C(b) {
    let g;
    const k = typeof b == "string" || $s(b), _ = !k && b !== null && typeof b == "object" && typeof b.r == "bigint" && typeof b.s == "bigint";
    if (!k && !_)
      throw new Error("invalid signature, expected Uint8Array, hex string or Signature instance");
    if (_)
      g = new E(b.r, b.s);
    else if (k) {
      try {
        g = E.fromBytes(Ce("sig", b), "der");
      } catch ($) {
        if (!($ instanceof Ft.Err))
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
    const { lowS: $, prehash: T, format: P } = wa(_, y);
    if (k = Ce("publicKey", k), g = H(Ce("message", g), T), "strict" in _)
      throw new Error("options.strict was renamed to lowS");
    const L = P === void 0 ? C(b) : E.fromBytes(Ce("sig", b), P);
    if (L === !1)
      return !1;
    try {
      const N = e.fromBytes(k);
      if ($ && L.hasHighS())
        return !1;
      const { r: K, s: z } = L, M = I(g), j = s.inv(z), V = s.create(M * j), G = s.create(K * j), W = e.BASE.multiplyUnsafe(V).add(N.multiplyUnsafe(G));
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
function $v(e) {
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
function Tv(e) {
  const { CURVE: t, curveOpts: n } = $v(e), r = {
    hmac: e.hmac,
    randomBytes: e.randomBytes,
    lowS: e.lowS,
    bits2int: e.bits2int,
    bits2int_modN: e.bits2int_modN
  };
  return { CURVE: t, curveOpts: n, hash: e.hash, ecdsaOpts: r };
}
function Pv(e, t) {
  const n = t.Point;
  return Object.assign({}, t, {
    ProjectivePoint: n,
    CURVE: Object.assign({}, e, Yh(n.Fn.ORDER, n.Fn.BITS))
  });
}
function Ov(e) {
  const { CURVE: t, curveOpts: n, hash: r, ecdsaOpts: i } = Tv(e), o = _v(t, n), s = Bv(o, r, i);
  return Pv(e, s);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Rv(e, t) {
  const n = (r) => Ov({ ...e, hash: r });
  return { ...n(t), create: n };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Jc = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, Cv = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Yd = /* @__PURE__ */ BigInt(2);
function Lv(e) {
  const t = Jc.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), l = e * e * e % t, u = l * l * e % t, d = je(u, n, t) * u % t, f = je(d, n, t) * u % t, h = je(f, Yd, t) * l % t, y = je(h, i, t) * h % t, w = je(y, o, t) * y % t, p = je(w, a, t) * w % t, m = je(p, c, t) * p % t, S = je(m, a, t) * w % t, E = je(S, n, t) * u % t, O = je(E, s, t) * y % t, I = je(O, r, t) * l % t, R = je(I, Yd, t);
  if (!tc.eql(tc.sqr(R), e))
    throw new Error("Cannot find square root");
  return R;
}
const tc = Ui(Jc.p, { sqrt: Lv }), Mt = Rv({ ...Jc, Fp: tc, lowS: !0, endo: Cv }, Xc), Hv = /* @__PURE__ */ Uint8Array.from([
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
]), sp = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Uv = sp.map((e) => (9 * e + 5) % 16), ap = /* @__PURE__ */ (() => {
  const n = [[sp], [Uv]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Hv[o]));
  return n;
})(), cp = ap[0], lp = ap[1], dp = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Nv = /* @__PURE__ */ cp.map((e, t) => e.map((n) => dp[t][n])), Dv = /* @__PURE__ */ lp.map((e, t) => e.map((n) => dp[t][n])), zv = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), Mv = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Xd(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const io = /* @__PURE__ */ new Uint32Array(16);
class Kv extends Yc {
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
      io[h] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, l = this.h3 | 0, u = l, d = this.h4 | 0, f = d;
    for (let h = 0; h < 5; h++) {
      const y = 4 - h, w = zv[h], p = Mv[h], m = cp[h], S = lp[h], E = Nv[h], O = Dv[h];
      for (let I = 0; I < 16; I++) {
        const R = Ji(r + Xd(h, o, a, l) + io[m[I]] + w, E[I]) + d | 0;
        r = d, d = l, l = Ji(a, 10) | 0, a = o, o = R;
      }
      for (let I = 0; I < 16; I++) {
        const R = Ji(i + Xd(y, s, c, u) + io[S[I]] + p, O[I]) + f | 0;
        i = f, f = u, u = Ji(c, 10) | 0, c = s, s = R;
      }
    }
    this.set(this.h1 + a + u | 0, this.h2 + l + f | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    Pn(io);
  }
  destroy() {
    this.destroyed = !0, Pn(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Fv = /* @__PURE__ */ Vc(() => new Kv());
/*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function xi(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function up(e, t) {
  return Array.isArray(t) ? t.length === 0 ? !0 : e ? t.every((n) => typeof n == "string") : t.every((n) => Number.isSafeInteger(n)) : !1;
}
function fp(e) {
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
function Wo(e) {
  if (!Array.isArray(e))
    throw new Error("array expected");
}
function Zo(e, t) {
  if (!up(!0, t))
    throw new Error(`${e}: array of strings expected`);
}
function Qc(e, t) {
  if (!up(!1, t))
    throw new Error(`${e}: array of numbers expected`);
}
// @__NO_SIDE_EFFECTS__
function Ps(...e) {
  const t = (o) => o, n = (o, s) => (a) => o(s(a)), r = e.map((o) => o.encode).reduceRight(n, t), i = e.map((o) => o.decode).reduce(n, t);
  return { encode: r, decode: i };
}
// @__NO_SIDE_EFFECTS__
function el(e) {
  const t = typeof e == "string" ? e.split("") : e, n = t.length;
  Zo("alphabet", t);
  const r = new Map(t.map((i, o) => [i, o]));
  return {
    encode: (i) => (Wo(i), i.map((o) => {
      if (!Number.isSafeInteger(o) || o < 0 || o >= n)
        throw new Error(`alphabet.encode: digit index outside alphabet "${o}". Allowed: ${e}`);
      return t[o];
    })),
    decode: (i) => (Wo(i), i.map((o) => {
      Hr("alphabet.decode", o);
      const s = r.get(o);
      if (s === void 0)
        throw new Error(`Unknown letter: "${o}". Allowed: ${e}`);
      return s;
    }))
  };
}
// @__NO_SIDE_EFFECTS__
function tl(e = "") {
  return Hr("join", e), {
    encode: (t) => (Zo("join.decode", t), t.join(e)),
    decode: (t) => (Hr("join.decode", t), t.split(e))
  };
}
// @__NO_SIDE_EFFECTS__
function jv(e, t = "=") {
  return Kr(e), Hr("padding", t), {
    encode(n) {
      for (Zo("padding.encode", n); n.length * e % 8; )
        n.push(t);
      return n;
    },
    decode(n) {
      Zo("padding.decode", n);
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
function nc(e, t, n) {
  if (t < 2)
    throw new Error(`convertRadix: invalid from=${t}, base cannot be less than 2`);
  if (n < 2)
    throw new Error(`convertRadix: invalid to=${n}, base cannot be less than 2`);
  if (Wo(e), !e.length)
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
const hp = (e, t) => t === 0 ? e : hp(t, e % t), Yo = /* @__NO_SIDE_EFFECTS__ */ (e, t) => e + (t - hp(e, t)), Bo = /* @__PURE__ */ (() => {
  let e = [];
  for (let t = 0; t < 40; t++)
    e.push(2 ** t);
  return e;
})();
function Xo(e, t, n, r) {
  if (Wo(e), t <= 0 || t > 32)
    throw new Error(`convertRadix2: wrong from=${t}`);
  if (n <= 0 || n > 32)
    throw new Error(`convertRadix2: wrong to=${n}`);
  if (/* @__PURE__ */ Yo(t, n) > 32)
    throw new Error(`convertRadix2: carry overflow from=${t} to=${n} carryBits=${/* @__PURE__ */ Yo(t, n)}`);
  let i = 0, o = 0;
  const s = Bo[t], a = Bo[n] - 1, c = [];
  for (const l of e) {
    if (Kr(l), l >= s)
      throw new Error(`convertRadix2: invalid data word=${l} from=${t}`);
    if (i = i << t | l, o + t > 32)
      throw new Error(`convertRadix2: carry overflow pos=${o} from=${t}`);
    for (o += t; o >= n; o -= n)
      c.push((i >> o - n & a) >>> 0);
    const u = Bo[o];
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
function pp(e) {
  Kr(e);
  const t = 2 ** 8;
  return {
    encode: (n) => {
      if (!xi(n))
        throw new Error("radix.encode input should be Uint8Array");
      return nc(Array.from(n), t, e);
    },
    decode: (n) => (Qc("radix.decode", n), Uint8Array.from(nc(n, e, t)))
  };
}
// @__NO_SIDE_EFFECTS__
function yp(e, t = !1) {
  if (Kr(e), e <= 0 || e > 32)
    throw new Error("radix2: bits should be in (0..32]");
  if (/* @__PURE__ */ Yo(8, e) > 32 || /* @__PURE__ */ Yo(e, 8) > 32)
    throw new Error("radix2: carry overflow");
  return {
    encode: (n) => {
      if (!xi(n))
        throw new Error("radix2.encode input should be Uint8Array");
      return Xo(Array.from(n), 8, e, !t);
    },
    decode: (n) => (Qc("radix2.decode", n), Uint8Array.from(Xo(n, e, 8, t)))
  };
}
function Jd(e) {
  return fp(e), function(...t) {
    try {
      return e.apply(null, t);
    } catch {
    }
  };
}
function wp(e, t) {
  return Kr(e), fp(t), {
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
const oo = {
  alphabet: el,
  chain: Ps,
  checksum: wp,
  convertRadix: nc,
  convertRadix2: Xo,
  radix: pp,
  radix2: yp,
  join: tl,
  padding: jv
}, Vv = /* @__NO_SIDE_EFFECTS__ */ (e) => /* @__PURE__ */ Ps(/* @__PURE__ */ pp(58), /* @__PURE__ */ el(e), /* @__PURE__ */ tl("")), gp = /* @__PURE__ */ Vv("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"), mp = (e) => /* @__PURE__ */ Ps(wp(4, (t) => e(e(t))), gp), qv = mp, rc = /* @__PURE__ */ Ps(/* @__PURE__ */ el("qpzry9x8gf2tvdw0s3jn54khce6mua7l"), /* @__PURE__ */ tl("")), Qd = [996825010, 642813549, 513874426, 1027748829, 705979059];
function Xr(e) {
  const t = e >> 25;
  let n = (e & 33554431) << 5;
  for (let r = 0; r < Qd.length; r++)
    (t >> r & 1) === 1 && (n ^= Qd[r]);
  return n;
}
function eu(e, t, n = 1) {
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
  return i ^= n, rc.encode(Xo([i % Bo[30]], 30, 5, !1));
}
// @__NO_SIDE_EFFECTS__
function bp(e) {
  const t = e === "bech32" ? 1 : 734539939, n = /* @__PURE__ */ yp(5), r = n.decode, i = n.encode, o = Jd(r);
  function s(d, f, h = 90) {
    Hr("bech32.encode prefix", d), xi(f) && (f = Array.from(f)), Qc("bech32.encode", f);
    const y = d.length;
    if (y === 0)
      throw new TypeError(`Invalid prefix length ${y}`);
    const w = y + 7 + f.length;
    if (h !== !1 && w > h)
      throw new TypeError(`Length ${w} exceeds limit ${h}`);
    const p = d.toLowerCase(), m = eu(p, f, t);
    return `${p}1${rc.encode(f)}${m}`;
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
    const S = rc.decode(m).slice(0, -6), E = eu(p, S, t);
    if (!m.endsWith(E))
      throw new Error(`Invalid checksum in ${d}: expected "${E}"`);
    return { prefix: p, words: S };
  }
  const c = Jd(a);
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
const tu = /* @__PURE__ */ bp("bech32"), nu = /* @__PURE__ */ bp("bech32m");
/*! scure-bip32 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const so = Mt.ProjectivePoint, ga = mp(Xc);
function ru(e) {
  ze(e);
  const t = e.length === 0 ? "0" : Yn(e);
  return BigInt("0x" + t);
}
function Gv(e) {
  if (typeof e != "bigint")
    throw new Error("bigint expected");
  return vi(e.toString(16).padStart(64, "0"));
}
const Wv = Lh("Bitcoin seed"), ma = { private: 76066276, public: 76067358 }, ba = 2147483648, Zv = (e) => Fv(Xc(e)), Yv = (e) => Ir(e).getUint32(0, !1), ao = (e) => {
  if (!Number.isSafeInteger(e) || e < 0 || e > 2 ** 32 - 1)
    throw new Error("invalid number, should be from 0 to 2**32-1, got " + e);
  const t = new Uint8Array(4);
  return Ir(t).setUint32(0, e, !1), t;
};
class bn {
  get fingerprint() {
    if (!this.pubHash)
      throw new Error("No publicKey set!");
    return Yv(this.pubHash);
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
    const r = qo(Vd, Wv, t);
    return new bn({
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
    return c ? new bn({ ...s, privateKey: a.slice(1) }) : new bn({ ...s, publicKey: a });
  }
  static fromJSON(t) {
    return bn.fromExtendedKey(t.xpriv);
  }
  constructor(t) {
    if (this.depth = 0, this.index = 0, this.chainCode = null, this.parentFingerprint = 0, !t || typeof t != "object")
      throw new Error("HDKey.constructor must not be called directly");
    if (this.versions = t.versions || ma, this.depth = t.depth || 0, this.chainCode = t.chainCode || null, this.index = t.index || 0, this.parentFingerprint = t.parentFingerprint || 0, !this.depth && (this.parentFingerprint || this.index))
      throw new Error("HDKey: zero depth with non-zero index/parent fingerprint");
    if (t.publicKey && t.privateKey)
      throw new Error("HDKey: publicKey and privateKey at same time.");
    if (t.privateKey) {
      if (!Mt.utils.isValidPrivateKey(t.privateKey))
        throw new Error("Invalid private key");
      this.privKey = typeof t.privateKey == "bigint" ? t.privateKey : ru(t.privateKey), this.privKeyBytes = Gv(this.privKey), this.pubKey = Mt.getPublicKey(t.privateKey, !0);
    } else if (t.publicKey)
      this.pubKey = so.fromHex(t.publicKey).toRawBytes(!0);
    else
      throw new Error("HDKey: no public or private key provided");
    this.pubHash = Zv(this.pubKey);
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
    let n = ao(t);
    if (t >= ba) {
      const a = this.privateKey;
      if (!a)
        throw new Error("Could not derive hardened child key");
      n = We(new Uint8Array([0]), a, n);
    } else
      n = We(this.pubKey, n);
    const r = qo(Vd, this.chainCode, n), i = ru(r.slice(0, 32)), o = r.slice(32);
    if (!Mt.utils.isValidPrivateKey(i))
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
        const a = Ge(this.privKey + i, Mt.CURVE.n);
        if (!Mt.utils.isValidPrivateKey(a))
          throw new Error("The tweak was out of range or the resulted private key is invalid");
        s.privateKey = a;
      } else {
        const a = so.fromHex(this.pubKey).add(so.fromPrivateKey(i));
        if (a.equals(so.ZERO))
          throw new Error("The tweak was equal to negative P, which made the result key invalid");
        s.publicKey = a.toRawBytes(!0);
      }
      return new bn(s);
    } catch {
      return this.deriveChild(t + 1);
    }
  }
  sign(t) {
    if (!this.privateKey)
      throw new Error("No privateKey set!");
    return ze(t, 32), Mt.sign(t, this.privKey).toCompactRawBytes();
  }
  verify(t, n) {
    if (ze(t, 32), ze(n, 64), !this.publicKey)
      throw new Error("No publicKey set!");
    let r;
    try {
      r = Mt.Signature.fromCompact(n);
    } catch {
      return !1;
    }
    return Mt.verify(r, t, this.publicKey);
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
    return ze(n, 33), We(ao(t), new Uint8Array([this.depth]), ao(this.parentFingerprint), ao(this.index), this.chainCode, n);
  }
}
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Xv(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function yi(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Fr(e, ...t) {
  if (!Xv(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function vp(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash should be wrapped by utils.createHasher");
  yi(e.outputLen), yi(e.blockLen);
}
function Jo(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Jv(e, t) {
  Fr(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function er(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function $o(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function gt(e, t) {
  return e << 32 - t | e >>> t;
}
function xp(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function nl(e) {
  return typeof e == "string" && (e = xp(e)), Fr(e), e;
}
function iu(e) {
  return typeof e == "string" && (e = xp(e)), Fr(e), e;
}
function Qv(e, t) {
  if (t !== void 0 && {}.toString.call(t) !== "[object Object]")
    throw new Error("options should be object or undefined");
  return Object.assign(e, t);
}
let kp = class {
};
function Ep(e) {
  const t = (r) => e().update(nl(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
class Ap extends kp {
  constructor(t, n) {
    super(), this.finished = !1, this.destroyed = !1, vp(t);
    const r = nl(n);
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
    return Jo(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Jo(this), Fr(t, this.outputLen), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const Sp = (e, t, n) => new Ap(e, t).update(n).digest();
Sp.create = (e, t) => new Ap(e, t);
function e1(e, t, n, r) {
  vp(e);
  const i = Qv({ dkLen: 32, asyncTick: 10 }, r), { c: o, dkLen: s, asyncTick: a } = i;
  if (yi(o), yi(s), yi(a), o < 1)
    throw new Error("iterations (c) should be >= 1");
  const c = iu(t), l = iu(n), u = new Uint8Array(s), d = Sp.create(e, c), f = d._cloneInto().update(l);
  return { c: o, dkLen: s, asyncTick: a, DK: u, PRF: d, PRFSalt: f };
}
function t1(e, t, n, r, i) {
  return e.destroy(), t.destroy(), r && r.destroy(), er(i), n;
}
function n1(e, t, n, r) {
  const { c: i, dkLen: o, DK: s, PRF: a, PRFSalt: c } = e1(e, t, n, r);
  let l;
  const u = new Uint8Array(4), d = $o(u), f = new Uint8Array(a.outputLen);
  for (let h = 1, y = 0; y < o; h++, y += a.outputLen) {
    const w = s.subarray(y, y + a.outputLen);
    d.setInt32(0, h, !1), (l = c._cloneInto(l)).update(u).digestInto(f), w.set(f.subarray(0, w.length));
    for (let p = 1; p < i; p++) {
      a._cloneInto(l).update(f).digestInto(f);
      for (let m = 0; m < w.length; m++)
        w[m] ^= f[m];
    }
  }
  return t1(a, c, s, l, f);
}
function r1(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, l = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + l, a, r);
}
function i1(e, t, n) {
  return e & t ^ ~e & n;
}
function o1(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let _p = class extends kp {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = $o(this.buffer);
  }
  update(t) {
    Jo(this), t = nl(t), Fr(t);
    const { view: n, buffer: r, blockLen: i } = this, o = t.length;
    for (let s = 0; s < o; ) {
      const a = Math.min(i - this.pos, o - s);
      if (a === i) {
        const c = $o(t);
        for (; i <= o - s; s += i)
          this.process(c, s);
        continue;
      }
      r.set(t.subarray(s, s + a), this.pos), this.pos += a, s += a, this.pos === i && (this.process(n, 0), this.pos = 0);
    }
    return this.length += t.length, this.roundClean(), this;
  }
  digestInto(t) {
    Jo(this), Jv(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, er(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r1(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = $o(t), c = this.outputLen;
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
const fn = /* @__PURE__ */ Uint32Array.from([
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
]), co = /* @__PURE__ */ BigInt(2 ** 32 - 1), ou = /* @__PURE__ */ BigInt(32);
function s1(e, t = !1) {
  return t ? { h: Number(e & co), l: Number(e >> ou & co) } : { h: Number(e >> ou & co) | 0, l: Number(e & co) | 0 };
}
function a1(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = s1(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const su = (e, t, n) => e >>> n, au = (e, t, n) => e << 32 - n | t >>> n, wr = (e, t, n) => e >>> n | t << 32 - n, gr = (e, t, n) => e << 32 - n | t >>> n, lo = (e, t, n) => e << 64 - n | t >>> n - 32, uo = (e, t, n) => e >>> n - 32 | t << 64 - n;
function Dt(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const c1 = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), l1 = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, d1 = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), u1 = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, f1 = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), h1 = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, p1 = /* @__PURE__ */ Uint32Array.from([
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
]), hn = /* @__PURE__ */ new Uint32Array(64);
let y1 = class extends _p {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = fn[0] | 0, this.B = fn[1] | 0, this.C = fn[2] | 0, this.D = fn[3] | 0, this.E = fn[4] | 0, this.F = fn[5] | 0, this.G = fn[6] | 0, this.H = fn[7] | 0;
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
      hn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = hn[d - 15], h = hn[d - 2], y = gt(f, 7) ^ gt(f, 18) ^ f >>> 3, w = gt(h, 17) ^ gt(h, 19) ^ h >>> 10;
      hn[d] = w + hn[d - 7] + y + hn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = gt(a, 6) ^ gt(a, 11) ^ gt(a, 25), h = u + f + i1(a, c, l) + p1[d] + hn[d] | 0, w = (gt(r, 2) ^ gt(r, 13) ^ gt(r, 22)) + o1(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    er(hn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), er(this.buffer);
  }
};
const Ip = a1([
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
].map((e) => BigInt(e))), w1 = Ip[0], g1 = Ip[1], pn = /* @__PURE__ */ new Uint32Array(80), yn = /* @__PURE__ */ new Uint32Array(80);
class m1 extends _p {
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
      pn[E] = t.getUint32(n), yn[E] = t.getUint32(n += 4);
    for (let E = 16; E < 80; E++) {
      const O = pn[E - 15] | 0, I = yn[E - 15] | 0, R = wr(O, I, 1) ^ wr(O, I, 8) ^ su(O, I, 7), U = gr(O, I, 1) ^ gr(O, I, 8) ^ au(O, I, 7), H = pn[E - 2] | 0, B = yn[E - 2] | 0, D = wr(H, B, 19) ^ lo(H, B, 61) ^ su(H, B, 6), C = gr(H, B, 19) ^ uo(H, B, 61) ^ au(H, B, 6), x = d1(U, C, yn[E - 7], yn[E - 16]), v = u1(x, R, D, pn[E - 7], pn[E - 16]);
      pn[E] = v | 0, yn[E] = x | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: l, Dl: u, Eh: d, El: f, Fh: h, Fl: y, Gh: w, Gl: p, Hh: m, Hl: S } = this;
    for (let E = 0; E < 80; E++) {
      const O = wr(d, f, 14) ^ wr(d, f, 18) ^ lo(d, f, 41), I = gr(d, f, 14) ^ gr(d, f, 18) ^ uo(d, f, 41), R = d & h ^ ~d & w, U = f & y ^ ~f & p, H = f1(S, I, U, g1[E], yn[E]), B = h1(H, m, O, R, w1[E], pn[E]), D = H | 0, C = wr(r, i, 28) ^ lo(r, i, 34) ^ lo(r, i, 39), x = gr(r, i, 28) ^ uo(r, i, 34) ^ uo(r, i, 39), v = r & o ^ r & a ^ o & a, b = i & s ^ i & c ^ s & c;
      m = w | 0, S = p | 0, w = h | 0, p = y | 0, h = d | 0, y = f | 0, { h: d, l: f } = Dt(l | 0, u | 0, B | 0, D | 0), l = a | 0, u = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const g = c1(D, x, b);
      r = l1(g, B, C, v), i = g | 0;
    }
    ({ h: r, l: i } = Dt(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = Dt(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = Dt(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: l, l: u } = Dt(this.Dh | 0, this.Dl | 0, l | 0, u | 0), { h: d, l: f } = Dt(this.Eh | 0, this.El | 0, d | 0, f | 0), { h, l: y } = Dt(this.Fh | 0, this.Fl | 0, h | 0, y | 0), { h: w, l: p } = Dt(this.Gh | 0, this.Gl | 0, w | 0, p | 0), { h: m, l: S } = Dt(this.Hh | 0, this.Hl | 0, m | 0, S | 0), this.set(r, i, o, s, a, c, l, u, d, f, h, y, w, p, m, S);
  }
  roundClean() {
    er(pn, yn);
  }
  destroy() {
    er(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
const b1 = /* @__PURE__ */ Ep(() => new y1()), v1 = /* @__PURE__ */ Ep(() => new m1());
/*! scure-bip39 - MIT License (c) 2022 Patricio Palladino, Paul Miller (paulmillr.com) */
const x1 = (e) => e[0] === "あいこくしん";
function Bp(e) {
  if (typeof e != "string")
    throw new TypeError("invalid mnemonic type: " + typeof e);
  return e.normalize("NFKD");
}
function $p(e) {
  const t = Bp(e), n = t.split(" ");
  if (![12, 15, 18, 21, 24].includes(n.length))
    throw new Error("Invalid mnemonic");
  return { nfkd: t, words: n };
}
function Tp(e) {
  Fr(e, 16, 20, 24, 28, 32);
}
const k1 = (e) => {
  const t = 8 - e.length / 4;
  return new Uint8Array([b1(e)[0] >> t << t]);
};
function Pp(e) {
  if (!Array.isArray(e) || e.length !== 2048 || typeof e[0] != "string")
    throw new Error("Wordlist: expected array of 2048 strings");
  return e.forEach((t) => {
    if (typeof t != "string")
      throw new Error("wordlist: non-string element: " + t);
  }), oo.chain(oo.checksum(1, k1), oo.radix2(11, !0), oo.alphabet(e));
}
function Op(e, t) {
  const { words: n } = $p(e), r = Pp(t).decode(n);
  return Tp(r), r;
}
function E1(e, t) {
  return Tp(e), Pp(t).encode(e).join(x1(t) ? "　" : " ");
}
function A1(e, t) {
  try {
    Op(e, t);
  } catch {
    return !1;
  }
  return !0;
}
const S1 = (e) => Bp("mnemonic" + e);
function _1(e, t = "") {
  return n1(v1, $p(e).nfkd, S1(t), { c: 2048, dkLen: 64 });
}
const Os = `abandon
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
`), Qo = "bitcoin-address-types-v1", rl = 20, Rp = new TextEncoder().encode(`avibe:protected-hd-wallet:v1
`), Cp = [16, 20, 24, 28, 32], I1 = ["account", "evm", "bitcoin", "bitcoin_p2pkh", "bitcoin_p2wpkh", "solana"];
function ct(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new Error("invalid protected HD object");
  return e;
}
function _t(e, t) {
  if (Object.keys(e).length !== t.length || t.some((n) => !Object.hasOwn(e, n))) throw new Error("invalid protected HD fields");
}
function il(e) {
  if (typeof e != "number" || !Number.isInteger(e) || e < 0 || e >= rl) throw new Error("invalid protected HD account");
  return e;
}
function Lp(e) {
  const t = ct(e), n = il(t.account);
  if (t.chain === "bitcoin") {
    if (_t(t, ["chain", "account", "address_type"]), t.address_type !== "p2tr") throw new Error("protected HD Bitcoin only supports explicit p2tr");
    return { chain: "bitcoin", account: n, address_type: "p2tr" };
  }
  if (_t(t, ["chain", "account"]), t.chain !== "evm" && t.chain !== "solana") throw new Error("invalid protected HD chain");
  return { chain: t.chain, account: n };
}
function Xn(e, t) {
  if (il(t), e === "evm") return `m/44'/60'/0'/0/${t}`;
  if (e === "bitcoin") return `m/86'/0'/0'/0/${t}`;
  if (e === "solana") return `m/44'/501'/${t}'/0'`;
  throw new Error("invalid protected HD chain");
}
function jt(e, t = !1) {
  if (typeof e != "string" || !(t ? /^[0-9a-f]{64}$/ : /^(02|03)[0-9a-f]{64}$/).test(e)) throw new Error("invalid protected HD public key");
  const n = it(e);
  if (t ? !at.utils.isValidPublicKey(n, !1) : !fe.utils.isValidPublicKey(n)) throw new Error("invalid protected HD public key");
  return e;
}
function Rs(e) {
  const t = ct(e);
  if (_t(t, ["kind", "profile", "accounts"]), t.kind !== "hd-seed" || t.profile !== Qo || !Array.isArray(t.accounts) || t.accounts.length !== rl) throw new Error("invalid protected HD profile/table");
  return { kind: "hd-seed", profile: Qo, accounts: t.accounts.map((n, r) => {
    const i = ct(n);
    if (_t(i, I1), il(i.account) !== r) throw new Error("protected HD accounts must be ordered 0..19");
    return { account: r, evm: jt(i.evm), bitcoin: jt(i.bitcoin), solana: jt(i.solana, !0), bitcoin_p2pkh: jt(i.bitcoin_p2pkh), bitcoin_p2wpkh: jt(i.bitcoin_p2wpkh) };
  }) };
}
function B1(e) {
  if (!Cp.includes(e.entropy.length) || e.seed.length !== 64 || typeof e.passphraseRequired != "boolean") throw new Error("invalid protected HD payload");
  const t = new Uint8Array(95 + e.entropy.length);
  return t.set(Rp), t[29] = e.entropy.length, t.set(e.entropy, 30), t.set(e.seed, 30 + e.entropy.length), t[t.length - 1] = Number(e.passphraseRequired), t;
}
function Hp(e) {
  const t = e[29];
  if (!Cp.includes(t) || e.length !== 95 + t || Rp.some((n, r) => n !== e[r]) || ![0, 1].includes(e[e.length - 1])) throw new Error("invalid protected HD payload");
  return { entropy: e.slice(30, 30 + t), seed: e.slice(30 + t, 94 + t), passphraseRequired: e[e.length - 1] === 1 };
}
function es(e) {
  e?.entropy.fill(0), e?.seed.fill(0);
}
function ol(e) {
  return e.normalize("NFKD").toLowerCase().trim().split(/\s+/u).filter(Boolean).join(" ");
}
function $1(e) {
  return E1(e, Os);
}
function Up(e, t) {
  const n = ol(e), r = Op(n, Os);
  try {
    return { entropy: r, seed: _1(n, t), passphraseRequired: t.normalize("NFKD").length > 0 };
  } catch (i) {
    throw r.fill(0), i;
  }
}
function Np(e, t) {
  let n = Za(Va, new TextEncoder().encode("ed25519 seed"), e);
  try {
    for (const r of [44, 501, t, 0]) {
      const i = new Uint8Array(37);
      i.set(n.subarray(0, 32), 1), new DataView(i.buffer).setUint32(33, 2147483648 + r, !1);
      let o;
      try {
        o = Za(Va, n.subarray(32), i);
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
function T1(e, t, n) {
  if (e.length !== 64) throw new Error("protected HD seed must be 64 bytes");
  const r = bn.fromMasterSeed(e);
  let i, o;
  try {
    if (i = r.derive(t), !i.privateKey) throw new Error("protected HD derivation failed");
    return o = new Uint8Array(i.privateKey), n(o);
  } finally {
    o?.fill(0), i?.wipePrivateData(), r.wipePrivateData();
  }
}
function P1(e, t, n) {
  const r = Lp(t);
  if (e.length !== 64) throw new Error("protected HD seed must be 64 bytes");
  if (r.chain !== "solana") return T1(e, Xn(r.chain, r.account), n);
  const i = Np(e, r.account);
  try {
    return n(i);
  } finally {
    i.fill(0);
  }
}
function ic(e) {
  if (e.length !== 64) throw new Error("protected HD seed must be 64 bytes");
  const t = bn.fromMasterSeed(e);
  try {
    return Array.from({ length: rl }, (n, r) => {
      const i = (s) => {
        const a = t.derive(s);
        try {
          if (!a.publicKey) throw new Error("protected HD derivation failed");
          return J(a.publicKey);
        } finally {
          a.wipePrivateData();
        }
      }, o = Np(e, r);
      try {
        return { account: r, evm: i(Xn("evm", r)), bitcoin: i(Xn("bitcoin", r)), solana: J(at.getPublicKey(o)), bitcoin_p2pkh: i(`m/44'/0'/0'/0/${r}`), bitcoin_p2wpkh: i(`m/84'/0'/0'/0/${r}`) };
      } finally {
        o.fill(0);
      }
    });
  } finally {
    t.wipePrivateData();
  }
}
function sl(e) {
  const t = it(jt(e.evm)), n = J(Fo(fe.Point.fromBytes(t).toBytes(!1).slice(1)).slice(-20)), r = J(Fo(new TextEncoder().encode(n))), i = (l) => Kc(ae(it(jt(l)))), o = it(jt(e.bitcoin)).slice(1), s = BigInt(`0x${J(mn.utils.taggedHash("TapTweak", o))}`);
  if (s >= fe.Point.Fn.ORDER) throw new Error("invalid protected HD Taproot tweak");
  const a = fe.Point.fromBytes(new Uint8Array([2, ...o])), c = s === 0n ? a : a.add(fe.Point.BASE.multiply(s));
  if (c.equals(fe.Point.ZERO)) throw new Error("invalid protected HD Taproot output");
  return {
    eth: "0x" + [...n].map((l, u) => parseInt(r[u], 16) >= 8 ? l.toUpperCase() : l).join(""),
    btc_legacy: qv(ae).encode(new Uint8Array([0, ...i(e.bitcoin_p2pkh)])),
    btc_segwit: tu.encode("bc", [0, ...tu.toWords(i(e.bitcoin_p2wpkh))]),
    btc_taproot: nu.encode("bc", [1, ...nu.toWords(c.toBytes(!0).slice(1))]),
    solana: gp.encode(it(jt(e.solana, !0)))
  };
}
function O1(e) {
  const t = JSON.stringify([e.ciphertext, e.nonce, e.wrap_meta]).replace(/[\u007f-\uffff]/g, (n) => "\\u" + n.charCodeAt(0).toString(16).padStart(4, "0"));
  return J(ae(new TextEncoder().encode(t)));
}
function ts(e) {
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
  return r(t, 1), ct(t);
}
function Vn(e, t) {
  if (typeof e != "string" || e.length > Math.ceil(Math.max(...t) / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) throw new Error("invalid protected HD base64");
  const n = Uint8Array.from(atob(e), (r) => r.charCodeAt(0));
  if (!t.includes(n.length) || btoa(String.fromCharCode(...n)) !== e) throw new Error("invalid protected HD field length/encoding");
  return n;
}
function R1(e, t) {
  if (t.v !== 1 || t.scheme !== "machine-aesgcm-v1") throw new Error("invalid protected HD envelope version/scheme");
  Vn(e.nonce, [12]), Vn(e.ciphertext, [127, 131, 135, 139, 143]), Vn(t.dek_nonce, [12]), Vn(t.wrapped_dek, [48]);
}
const cu = { '"': 34, "\\": 92, "/": 47, b: 8, f: 12, n: 10, r: 13, t: 9 };
function C1(e) {
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
          if (!Object.hasOwn(cu, d)) return !1;
          u = cu[d];
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
const L1 = "hpke-x25519-hkdfsha256-aes256gcm-v1", H1 = "avault:blind-box:v1", U1 = "avault:blind-box:aad:v1", ns = "machine-aesgcm-v1", Cs = 1, Ls = "ecdsa-secp256k1-recoverable", ki = "ed25519", al = "ecdsa-secp256k1-der", cl = "schnorr-secp256k1-bip340", Ei = "schnorr-secp256k1-bip341-keypath", pe = 32, rs = 12, Hs = 32, N1 = "avault:protected-vmk:kek-passkey:v1", D1 = /^[A-Za-z_][A-Za-z0-9_]*$/, z1 = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, M1 = "avault:protected-root-meta:v1", K1 = new TextEncoder(), F1 = new TextDecoder();
function ll(e) {
  switch (e) {
    case ki:
    case Ls:
    case al:
    case cl:
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
function dl(e) {
  if (ll(e), e === ki) throw new Error("Ed25519 requires exact-message signing, not a digest");
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
  return K1.encode(e);
}
function is(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(is).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${is(t[n])}`).join(",")}}`;
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
function Ye(e) {
  return it(e.startsWith("0x") ? e.slice(2) : e);
}
function lu(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? Ye(e) : be(e);
}
function j1(e) {
  return J(ye(e));
}
function Dp(e, t = "bytes") {
  return ye(e, t);
}
function Ee(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function ot(e) {
  e && new Uint8Array(e).fill(0);
}
async function os(e, t, n, r) {
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
    ot(i), ot(o), ot(s), ot(a);
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
    ot(i), ot(o), ot(s), ot(a);
  }
}
async function V1(e, t, n, r) {
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
    ot(i), ot(o), ot(s);
  }
}
async function zp(e, t) {
  const n = ye(e, "passkey PRF output");
  try {
    const r = ye(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return Ee(r, Hs, "passkey PRF salt"), await V1(n, r, Oe(N1), pe);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function q1() {
  return Jn(pe);
}
function G1() {
  return Jn(Hs);
}
function W1(e) {
  const t = ye(e, "passkey PRF salt");
  try {
    return Ee(t, Hs, "passkey PRF salt"), { prf: { eval: { first: Me(t) } } };
  } finally {
    t.fill(0);
  }
}
function ft(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== Cs || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function Z1(e, t) {
  const n = ye(e, "VMK"), r = Jn(rs);
  let i, o;
  try {
    Ee(n, pe, "VMK"), o = ye(t.prfSalt, "passkey PRF salt"), Ee(o, Hs, "passkey PRF salt"), i = await zp(t.prfOutput, o);
    const s = await os(i, r, n);
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
async function Y1(e, t) {
  const n = ye(e, "VMK");
  try {
    if (Ee(n, pe, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await Z1(n, i));
    return JSON.stringify({ v: Cs, copies: r });
  } finally {
    n.fill(0);
  }
}
async function X1(e, t) {
  const n = be(e.prf_salt);
  if (t.prfSalt && oe(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await zp(t.prfOutput, n);
  try {
    return await Us(r, be(e.nonce), be(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function Mp(e, t) {
  const n = ft(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await X1(r, t);
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
  return ft(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: be(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function J1(e, t) {
  const n = ft(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Kp(e) {
  const t = ft(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function ul(e) {
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
    return t === "ed25519" && gl(e.publicKey), {
      kind: "keypair",
      public_key: e.publicKey.toLowerCase(),
      ...t === "ed25519" ? { curve: t } : {}
    };
  }
  throw new Error("unsupported protected record kind");
}
function Q1(e) {
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
    return ul({ kind: "keypair", publicKey: t.public_key, curve: t.curve });
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
function fl(e) {
  return Oe(
    is({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" || e.kind === "hd-seed" ? qp(e.name) : Ur(e.name),
      scheme: e.scheme ?? ns,
      version: e.version ?? Cs,
      record: ul(e) ?? null
    })
  );
}
async function hl(e, t, n) {
  const r = ye(t, "VMK"), i = Jn(pe);
  let o;
  try {
    Ee(r, pe, "VMK"), o = ye(e, "value");
    const s = fl(n), a = Jn(rs), c = await os(i, a, o, s), l = Jn(rs), u = await os(r, l, i, s);
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
async function Fp(e, t, n) {
  const r = ye(t, "VMK");
  try {
    Ee(r, pe, "VMK");
    const i = await Us(
      r,
      be(e.dek_nonce),
      be(e.wrapped_dek),
      fl(n)
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
async function Ni(e, t, n) {
  const r = await Fp(e, t, n);
  try {
    return await Us(
      r,
      be(e.nonce),
      be(e.ciphertext),
      fl(n)
    );
  } finally {
    r.fill(0);
  }
}
function pl(e, t, n) {
  const r = ft(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== ns)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? ul(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: ns,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function On(e) {
  const t = C1(e.wrap_meta), n = ft(t ? ts(e.wrap_meta) : e.wrap_meta);
  if (n.record_meta?.kind === "hd-seed") {
    const c = t ? n : ts(e.wrap_meta);
    R1(e, c);
  }
  const { dek_nonce: r, wrapped_dek: i, record_meta: o, ...s } = n;
  if (typeof r != "string" || typeof i != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const a = Q1(o);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: r, wrapped_dek: i },
    vmkWrapMeta: JSON.stringify(s),
    ...a ? { recordMetadata: a } : {}
  };
}
function jp(e) {
  const t = { ...ft(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, Oe(is({ domain: M1, vault: t }));
}
async function ex(e, t, n) {
  const r = Jn(rs), i = Oe(JSON.stringify(t));
  try {
    const o = await os(e, r, i, jp(n));
    return { v: 1, nonce: oe(r), ciphertext: oe(o) };
  } finally {
    i.fill(0);
  }
}
async function ss(e, t) {
  const n = ft(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await Us(t, be(n.nonce), be(n.ciphertext), jp(e));
  try {
    const i = JSON.parse(F1.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function tx(e, t) {
  const n = ft(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function nx() {
  return new Jm({
    kem: new c0(),
    kdf: new Qm(),
    aead: new Cm()
  });
}
function yl(e) {
  return be(typeof e == "string" ? e : e.public_key);
}
async function Vp(e) {
  const t = await crypto.subtle.digest("SHA-256", Me(e));
  return J(new Uint8Array(t));
}
async function rx(e) {
  return Vp(yl(e));
}
function ix(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function ox(e) {
  const t = ix(e), n = yl(t);
  if (Ee(n, pe, "avault public key"), await Vp(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function sx(e, t, n) {
  const r = nx(), i = yl(t);
  if (Ee(i, pe, "avault public key"), typeof t != "string" && t.fingerprint && await rx(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? Oe(e) : ye(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: Oe(H1) },
      s,
      px(n)
    );
    return {
      scheme: L1,
      enc: oe(new Uint8Array(a.enc)),
      ct: oe(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function qp(e) {
  if (typeof e != "string" || !D1.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function Ur(e) {
  if (typeof e != "string" || !z1.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function du(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function wl(e) {
  const t = typeof e == "string" ? Ye(e) : ye(e, "digest");
  return Ee(t, pe, "digest"), t;
}
function ax(e) {
  const t = typeof e == "string" ? Ye(e) : ye(e, "private key");
  try {
    if (Ee(t, pe, "private key"), !fe.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function as(e, t) {
  return typeof e == "string" ? Ye(e) : ye(e, t);
}
function cs(e) {
  const t = as(e, "operation hash");
  return Ee(t, pe, "operation hash"), t;
}
function ls(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function Gp(e, t) {
  const n = ls(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function cx(e) {
  return Gp(e, "approval expiry");
}
function uu(e) {
  const t = ye(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: ls(e.expiresAtUnix, "approval expiry") };
}
function qe(e, t) {
  const n = ye(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function lx(e) {
  switch (e.purpose) {
    case "seal":
      return dx(e.name);
    case "agent-deliver": {
      const t = uu({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: Ur(e.name),
        grantId: du(e.grantId, "grant id"),
        ttlSecs: ls(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: cs(e.operationHash)
      };
    }
    case "agent-sign": {
      dl(e.signScheme);
      const t = uu({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: qp(e.name),
        grantId: du(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: wl(e.digest),
        ttlSecs: ls(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: cs(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function dx(e) {
  return { purpose: "seal", name: Ur(e) };
}
async function ux(e) {
  const t = cs(e.operationHash), n = await hx(e.name, e.ttlSecs);
  if (J(t) !== J(n))
    throw new Error("operation hash does not match release operation fields");
}
async function fx(e) {
  const t = [];
  for (const n of e)
    qe(t, typeof n == "string" ? Oe(n) : ye(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function hx(e, t) {
  return fx(["agent-deliver", Ur(e), Gp(t, "ttl seconds")]);
}
function px(e) {
  const t = lx(e), n = [...Oe(U1)];
  return qe(n, Oe(t.purpose)), qe(n, Oe(t.name)), qe(n, Oe(ns)), qe(n, new Uint8Array([Cs])), qe(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? Oe(t.grantId) : new Uint8Array()), qe(n, new Uint8Array()), qe(n, t.purpose === "agent-sign" ? Oe(t.signScheme) : new Uint8Array()), qe(n, t.purpose === "agent-sign" ? wl(t.digest) : new Uint8Array()), qe(n, t.purpose === "seal" ? new Uint8Array() : ye(t.approvalNonce, "approval nonce")), qe(n, t.purpose === "seal" ? new Uint8Array() : cx(t.approvalExpiresAtUnix)), qe(n, t.purpose === "seal" ? new Uint8Array() : cs(t.operationHash)), new Uint8Array(n);
}
async function yx(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (Ur(r.name) !== Ur(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await ux(i);
  const o = await ox(n), s = await Fp(e, t, r);
  try {
    return await sx(s, o, i);
  } finally {
    s.fill(0);
  }
}
function wx(e = "secp256k1") {
  if (jr(e) === "ed25519") {
    const n = at.utils.randomSecretKey();
    try {
      return { privateKey: n, publicKey: J(at.getPublicKey(n)) };
    } catch (r) {
      throw n.fill(0), r;
    }
  }
  const t = fe.utils.randomSecretKey();
  return { privateKey: t, publicKey: J(fe.getPublicKey(t, !0)) };
}
function fu(e) {
  return Ye(e.toString(16).padStart(pe * 2, "0"));
}
function Wp(e, t, n, r = {}) {
  if (dl(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = ax(e);
  let o;
  try {
    const s = wl(t);
    if (n === Ls) {
      const a = fe.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: J(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === al)
      return {
        scheme: n,
        signature: J(fe.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === cl) {
      o = r.schnorrAuxRand !== void 0 ? as(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(pe)), Ee(o, pe, "schnorr aux randomness");
      const a = mn.sign(s, i, o);
      if (!mn.verify(a, s, mn.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: J(a), recovery_id: null };
    }
    if (n === Ei) {
      const a = fe.getPublicKey(i, !0), c = ml(a.slice(1));
      let l = BigInt(`0x${J(i)}`);
      a[0] === 3 && (l = ai - l);
      const u = BigInt(`0x${J(mn.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (u >= ai) throw new Error("invalid taproot tweak");
      let d = (l + u) % ai;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let f = fu(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = ai - d, f.fill(0), f = fu(d)), o = r.schnorrAuxRand !== void 0 ? as(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(pe)), Ee(o, pe, "schnorr aux randomness");
        const h = mn.sign(s, f, o);
        if (!mn.verify(h, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
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
async function gx(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  if (dl(i), jr(n.curve) !== "secp256k1") throw new Error("digest signing requires a secp256k1 protected record");
  const s = await Ni(e, t, n);
  try {
    if (J(fe.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Wp(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function Zp(e, t) {
  const n = Fc(t), r = as(e, "Ed25519 seed");
  try {
    Ee(r, pe, "Ed25519 seed");
    const i = at.sign(n, r);
    if (!at.verify(i, n, at.getPublicKey(r), { zip215: !1 }))
      throw new Error("Ed25519 signing self-verification failed");
    return { scheme: ki, signature: J(i), recovery_id: null };
  } finally {
    r.fill(0);
  }
}
function gl(e) {
  if (!/^[0-9a-fA-F]{64}$/.test(e)) throw new Error("expected a 32-byte Ed25519 public key");
  const t = Ye(e);
  if (!at.utils.isValidPublicKey(t, !1)) throw new Error("invalid Ed25519 public key");
  return t;
}
async function mx(e, t, n, r) {
  if (n.kind !== "keypair" || n.curve !== "ed25519" || !n.publicKey)
    throw new Error("exact-message signing requires an Ed25519 keypair protected record");
  const i = Fc(r);
  if (i.length === 0) throw new Error("protected Ed25519 message must not be empty");
  gl(n.publicKey);
  const o = await Ni(e, t, n);
  try {
    if (Ee(o, pe, "Ed25519 seed"), J(at.getPublicKey(o)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Zp(o, i);
  } finally {
    o.fill(0);
  }
}
function bx(e) {
  return Jp(gl(e));
}
function vx(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return at.verify(lu(e.signature), Oe(e.message), lu(t.publicKey));
}
function Yp(e) {
  const t = Ye(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && fe.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && fe.utils.isValidPublicKey(t))
    return fe.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const xx = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", kx = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", Ex = 1, Ax = 734539939, ai = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function Sx(e) {
  return Kc(ae(e));
}
function Xp(e) {
  const t = ae(ae(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  return n.set(e), n.set(t, e.length), Jp(n);
}
function Jp(e) {
  let t = BigInt(`0x${J(e)}`), n = "";
  for (; t > 0n; ) {
    const i = Number(t % 58n);
    t /= 58n, n = xx[i] + n;
  }
  let r = 0;
  for (const i of e) {
    if (i !== 0) break;
    r += 1;
  }
  return "1".repeat(r) + n;
}
function _x(e) {
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
function Ix(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function Bx(e, t, n) {
  const r = Ix(e).concat(t), i = _x(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function $x(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function oc(e, t, n) {
  const r = t === 0 ? Ex : Ax, i = [t].concat($x(n, 8, 5));
  return `${e}1${i.concat(Bx(e, i, r)).map((o) => kx[o]).join("")}`;
}
function Qp(e) {
  const t = e.toLowerCase(), n = J(Fo(Oe(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function ml(e) {
  const t = BigInt(`0x${J(mn.utils.taggedHash("TapTweak", e))}`);
  if (t >= ai) throw new Error("invalid taproot tweak");
  const n = fe.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(fe.Point.BASE.multiply(t));
  if (r.equals(fe.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function Tx(e) {
  return ml(Yp(e).slice(1)).toBytes(!0).slice(1);
}
function zs(e) {
  const t = Yp(e), n = fe.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = Fo(r), o = Sx(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = ml(a);
  return {
    eth: `0x${Qp(J(i.slice(-20)))}`,
    btc_legacy: Xp(s),
    btc_segwit: oc("bc", 0, o),
    btc_taproot: oc("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const bl = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let sc = { ...bl };
function Px(e) {
  return e === 300 || e === 600 || e === 1800 ? e : bl.windowSeconds;
}
function Ox(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new A("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function vl(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new A("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new A("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: Ox(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function Rx(e) {
  if (typeof e != "object" || e === null) return { ...bl };
  const t = e;
  return {
    windowSeconds: Px(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function xl(e) {
  return sc = Rx(e), sc;
}
function $e() {
  return { ...sc };
}
const Cx = "avibe-vault-lock:v1:", F = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let Gt = null, Nr = null, Qn = null, Ai = null, ac = null, Yt = 0;
const ds = /* @__PURE__ */ new Set();
let wi = 0, ey = null;
function Lx(e) {
  ey = e;
}
function hu() {
  return F.vmk ? "unlocked" : F.wrapMeta ? "locked" : "needs-setup";
}
function ty(e) {
  ey?.({
    state: hu(),
    ...Gt !== null && hu() === "unlocked" ? { expiresAt: Gt } : {},
    reason: e
  });
}
function kl() {
  Qn !== null && (clearTimeout(Qn), Qn = null);
}
function Si() {
  Ai?.close(), Ai = null, ac = null;
}
function ny(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function Hx(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function ry(e) {
  const t = ft(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? ny(t.vault_user_handle) : `wrap-${Hx(e)}`;
}
function Ux(e) {
  return ny(e);
}
function El(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    Si();
    return;
  }
  const t = `${Cx}${e}`;
  ac !== t && (Si(), ac = t, Ai = new BroadcastChannel(t), Ai.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && ht({ broadcast: !1, reason: "manual-lock" });
  });
}
function Nx() {
  F.scopeId && (El(F.scopeId), Ai?.postMessage({ type: "lock", scopeId: F.scopeId }));
}
function Et() {
  return new Error("vault-operation-aborted");
}
function iy() {
  Yt += 1;
  for (const e of ds)
    e.abort(Et());
  ds.clear();
  for (const e of tt.keys()) e.abort(Et());
  tt.clear();
}
function An(e) {
  const t = { ...ft(e) };
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
const tt = /* @__PURE__ */ new Map();
function oy(e) {
  if (tt.size === 0) return;
  const t = An(e);
  for (const [n, r] of tt)
    $r(r, t) || n.abort(Et());
}
function Ms(e) {
  us();
  const t = An(e);
  if (F.wrapMeta && !$r(An(F.wrapMeta), t) || (lt(e), !F.wrapMeta || !$r(An(F.wrapMeta), t))) throw Et();
  for (const s of tt.keys()) s.abort(Et());
  tt.clear();
  const n = ++wi, r = Yt, i = cc(), o = new AbortController();
  return tt.set(o, t), El(F.scopeId), {
    freshSetup: i,
    signal: o.signal,
    assertCurrent: () => {
      if (us(), o.signal.aborted || r !== Yt || n !== wi || i !== cc() || !F.wrapMeta || !$r(An(F.wrapMeta), t)) throw Et();
    },
    lockIfCurrent: (s = {}) => o.signal.aborted || n !== wi ? !1 : sy(r, t, s),
    release: () => {
      tt.delete(o), o.abort(Et()), !F.vmk && tt.size === 0 && Si();
    }
  };
}
function sy(e, t, n = {}) {
  return e !== Yt || !F.vmk || !F.wrapMeta || !$r(An(F.wrapMeta), t) ? !1 : (ht(n), !0);
}
function Dx() {
  F.vmk?.fill(0), F.vmk = null, Gt = null, Nr = null, kl(), Si(), F.freshSetup && (F.wrapMeta = null, F.freshSetup = !1, F.scopeId = null);
}
function zx() {
  return Gt !== null && Date.now() >= Gt;
}
function us() {
  return F.vmk && zx() ? (ht({ broadcast: !1, reason: "auto-lock" }), !1) : F.vmk !== null;
}
function ay(e) {
  const t = setTimeout(() => {
    Qn !== t || Nr !== e || e.epoch !== Yt || !F.vmk || (Qn = null, ht({ broadcast: !1, reason: "auto-lock" }));
  }, Math.max(0, e.expiresAt - Date.now()));
  Qn = t;
}
function cy(e, t = $e()) {
  if (!F.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return Gt = Date.now() + n, Nr = { epoch: Yt, expiresAt: Gt, pendingCommits: 0 }, kl(), ay(Nr), ty(e), Gt;
}
function Mx() {
  const e = Nr;
  if (!F.vmk || !e) return () => {
  };
  e.pendingCommits += 1, kl();
  let t = !1;
  return () => {
    if (!t && (t = !0, e.pendingCommits -= 1, !(Nr !== e || e.epoch !== Yt || !F.vmk || e.pendingCommits !== 0 || Qn !== null))) {
      if (e.expiresAt <= Date.now()) {
        ht({ broadcast: !1, reason: "auto-lock" });
        return;
      }
      ay(e);
    }
  };
}
function Kx(e) {
  if (e instanceof A && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function Fx(e) {
  if (e.signal.aborted || e.epoch !== Yt || !F.vmk)
    throw Et();
}
async function Ks(e, t = {}) {
  if (!us() || !F.vmk || !F.wrapMeta)
    throw new Error("vault-locked");
  const n = F.wrapMeta, r = t.expectedWrapMeta === void 0 ? void 0 : An(t.expectedWrapMeta);
  if (r !== void 0 && !$r(An(n), r)) throw Et();
  const i = new Uint8Array(F.vmk), o = Yt, s = wi, a = new AbortController();
  ds.add(a), r !== void 0 && tt.set(a, r);
  const c = {
    epoch: o,
    signal: a.signal,
    assertCurrent: () => Fx(c)
  };
  let l = null;
  try {
    c.assertCurrent();
    const u = await e(i, n, c);
    return c.assertCurrent(), t.renewOnSuccess !== !1 && cy("renew"), c.assertCurrent(), t.beforeSuccess && (l = Mx(), await t.beforeSuccess(), c.assertCurrent(), l(), l = null), u;
  } catch (u) {
    throw Kx(u) || (r !== void 0 ? !a.signal.aborted && s === wi && sy(o, r, { broadcast: !0, reason: "manual-lock" }) : ht({ broadcast: !0, reason: "manual-lock" })), u;
  } finally {
    l?.(), ds.delete(a), tt.delete(a), i.fill(0);
  }
}
function cc() {
  return F.vmk !== null && F.freshSetup;
}
function ly(e) {
  iy(), F.vmk?.fill(0), F.vmk = e.vmk, F.wrapMeta = e.wrapMeta, F.freshSetup = e.freshSetup, F.scopeId = e.scopeId, El(e.scopeId);
  const t = { state: "unlocked", expiresAt: cy("unlock", e.policy) };
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
function ht(e = {}) {
  return e.broadcast && Nx(), iy(), Dx(), ty(e.reason ?? "manual-lock"), { state: "locked" };
}
function lt(e) {
  us();
  const t = e ? Kp(e) : void 0;
  return t && oy(t), F.vmk ? {
    state: "unlocked",
    expiresAt: Gt ?? void 0,
    ...F.freshSetup ? { freshSetup: !0 } : {}
  } : (t && (F.wrapMeta = t, F.scopeId = ry(t)), F.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function Al(e) {
  const t = Kp(e), n = ry(t);
  return oy(t), F.wrapMeta = t, F.scopeId = n, { wrapMeta: t, scopeId: n };
}
function jx() {
  ht({ broadcast: !1, reason: "unload" }), Si();
}
const fo = "Avibe Vault", pu = "avibe-vault";
function tr(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function Sn(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function dy() {
  return Sn(crypto.getRandomValues(new Uint8Array(32)));
}
function uy(e) {
  try {
    return be(e);
  } catch {
    return null;
  }
}
function Fs(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return Sn(Dp(e));
  if (typeof e == "string") {
    const n = uy(e);
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
function Vx(e) {
  if (typeof e != "string" || e.length === 0 || e.length > 88 || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(e) || /[+/]/.test(e) && /[-_]/.test(e))
    throw new Error("invalid webauthn user.id encoding");
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = uy(t);
  if (!n || n.byteLength === 0 || n.byteLength > 64)
    throw new Error("webauthn user.id must be 1-64 bytes");
  const r = oe(n);
  if (t !== r && t !== r.replace(/=+$/, ""))
    throw new Error("invalid webauthn user.id encoding");
  return Sn(n);
}
function qx(e) {
  const t = Fs(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function fs(e) {
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
function yu(e) {
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
function wu(e) {
  return {
    ...tr(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function gu(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function Gx(e) {
  const t = tr(e) ?? {};
  return { ...t, prf: tr(t.prf) ?? {} };
}
function Pt() {
  return window.location.hostname;
}
function Wx(e) {
  const t = e.authzCreationOptions === void 0 ? void 0 : va(e.authzCreationOptions), n = t && Object.prototype.hasOwnProperty.call(t, "webauthn") ? va(t.webauthn) : t, r = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, i = tr(n?.rp), o = typeof i?.id == "string" ? i.id : void 0;
  if (o && o !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!n)
    return {
      options: {
        rp: { name: fo, id: e.rpId },
        user: {
          id: qx(e.vaultUserHandle),
          name: e.vaultUserHandle || pu,
          displayName: e.displayName || fo
        },
        challenge: dy(),
        pubKeyCredParams: yu(void 0),
        authenticatorSelection: wu(void 0),
        extensions: { prf: {} }
      }
    };
  const s = va(n.user);
  return {
    options: {
      rp: {
        name: typeof i?.name == "string" ? i.name : fo,
        id: e.rpId
      },
      user: {
        id: Vx(s.id),
        name: typeof s.name == "string" ? s.name : e.vaultUserHandle || pu,
        displayName: typeof s.displayName == "string" ? s.displayName : e.displayName || fo
      },
      challenge: Fs(n.challenge),
      pubKeyCredParams: yu(n.pubKeyCredParams),
      authenticatorSelection: wu(n.authenticatorSelection),
      extensions: Gx(n.extensions),
      ...fs(n.excludeCredentials) ? { excludeCredentials: fs(n.excludeCredentials) } : {},
      ...typeof n.timeout == "number" ? { timeout: n.timeout } : {},
      ...gu(n.attestation) ? { attestation: gu(n.attestation) } : {}
    },
    ...r ? { challengeId: r } : {}
  };
}
function Zx(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function Yx(e, t) {
  const n = Zx(e), r = {
    challenge: dy(),
    rpId: t,
    userVerification: "required",
    extensions: W1(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: Sn(be(n.credentialId))
    }
  ]), r;
}
function Xx(e, t, n) {
  const r = {
    challenge: Sn(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: Sn(be(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function Jx(e, t = Pt()) {
  const n = tr(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: Fs(n.challenge),
    rpId: t,
    userVerification: "required",
    ...fs(n.allowCredentials) ? { allowCredentials: fs(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function fy(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function hy(e) {
  return {
    id: e.id,
    rawId: oe(e.rawId),
    type: e.type
  };
}
function Qx(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...hy(e),
    response: {
      clientDataJSON: oe(t.clientDataJSON),
      attestationObject: oe(t.attestationObject),
      transports: n
    }
  };
}
function py(e) {
  const t = e.response;
  return {
    ...hy(e),
    response: {
      clientDataJSON: oe(t.clientDataJSON),
      authenticatorData: oe(t.authenticatorData),
      signature: oe(t.signature),
      userHandle: t.userHandle ? oe(t.userHandle) : null
    }
  };
}
function e2(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = Dp(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function js(e, t, n) {
  const r = await navigator.credentials.get(
    fy(Yx(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = e2(r), o = oe(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function t2(e, t, n, r) {
  if (!await navigator.credentials.get(
    fy(Xx(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function n2(e) {
  const t = await navigator.credentials.get({
    publicKey: Jx(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return py(t);
}
const r2 = /ancestor|not the same as its|cross-?origin|different origin/i;
function yy(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function i2(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function wy(e) {
  const t = yy(e);
  return t === "SecurityError" || t === "NotSupportedError" || r2.test(i2(e));
}
function gy(e) {
  return yy(e) === "NotAllowedError" && !wy(e);
}
function Sl(e) {
  const { options: t, challengeId: n } = Wx(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = oe(i.rawId), s = Qx(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const lc = {
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
    "hd.wordsBody": "只在这个安全窗口里出现，保存后不会再显示。这台电脑丢了或通行密钥丢了，只能靠它们（和 Passphrase，如有）找回。",
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
    "hd.passkeyNote": "保存时用通行密钥确认；随后在安全窗口里重新打开加密结果核对，再把加密结果交给 Avibe。",
    "hd.saveCta": "用通行密钥保存",
    "hd.working": "正在保存并核对…",
    "hd.next": "下一步",
    "hd.back": "返回",
    "hd.unlockTitle": "解锁保护档钱包",
    "hd.unlockBody": "先使用通行密钥解锁，再核对实际账户和派生路径，并再次使用通行密钥批准本次签名。",
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
    "policyDowngrade.account": "账号",
    "policyDowngrade.accountNamed": "#{{index}} {{name}}",
    "policyDowngrade.accountUnnamed": "#{{index}}（未命名）",
    "policyDowngrade.appliesTo": "适用于",
    "policyDowngrade.appliesToValue": "这个账号在 ETH、BTC、Solana 上的签名",
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
let hs = "en";
function o2(e) {
  return e === "zh" ? "zh" : "en";
}
function s2(e) {
  const t = o2(e);
  return t === hs ? !1 : (hs = t, !0);
}
function a2() {
  return hs;
}
function c2(e) {
  return typeof e == "string" && Object.hasOwn(lc.en, e);
}
function q(e, t = {}) {
  const n = lc[hs], r = lc.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function l2(e) {
  return JSON.stringify(e ?? {});
}
function mu(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function le(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = l2(n), e.textContent = q(t, n);
}
function Ie(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function d2(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = q(n, mu(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = q(n, mu(t.dataset.i18nPlaceholderParams)));
  });
}
function my(e) {
  return {
    title: "policyDowngrade.title",
    subtitle: { text: e.target.name },
    confirmLabel: "policyDowngrade.confirm",
    policyDowngrade: e
  };
}
function At(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
function Ve(e, t, n = "mono") {
  const r = At("div", "review-field"), i = At("span", "review-label");
  le(i, e);
  const o = At("div", "review-value"), s = At("span", n === "word" ? "review-word" : "review-mono");
  return typeof t == "string" ? Ie(s, t) : le(s, t.key, t.params), o.append(s), r.append(i, o), r;
}
function ho(e, t) {
  const n = At("p", t);
  return le(n, e), n;
}
function u2(e, t) {
  Ie(e, "");
  const { target: n } = t, r = At("div", "review policy-downgrade-review");
  r.append(n.protection === "standard" ? ho("policyDowngrade.standardWarning", "review-warning") : ho("policyDowngrade.protectedNotice", "review-info"));
  const i = At("div", "review-summary");
  i.append(
    Ve("policyDowngrade.setting", { key: "policyDowngrade.settingValue" }, "word"),
    Ve("policyDowngrade.key", n.name),
    Ve("policyDowngrade.tier", { key: n.protection === "standard" ? "policyDowngrade.standard" : "policyDowngrade.protected" }, "word")
  ), n.account !== null && i.append(
    Ve("policyDowngrade.account", n.accountName !== null ? { key: "policyDowngrade.accountNamed", params: { index: n.account, name: n.accountName } } : { key: "policyDowngrade.accountUnnamed", params: { index: n.account } }, "word"),
    Ve("policyDowngrade.appliesTo", { key: "policyDowngrade.appliesToValue" }, "word")
  ), r.append(i, ho("policyDowngrade.onlyPolicy", "confirmation-note"));
  const o = At("details", "review-details"), s = At("summary", "review-details-toggle");
  le(s, "policyDowngrade.details");
  const a = At("div", "review-details-body"), c = [
    ["eth", "policyDowngrade.eth"],
    ["btc_legacy", "policyDowngrade.btcLegacy"],
    ["btc_segwit", "policyDowngrade.btcSegwit"],
    ["btc_taproot", "policyDowngrade.btcTaproot"],
    ["solana", "policyDowngrade.solana"]
  ];
  a.append(ho("policyDowngrade.serverFacts", "confirmation-note"));
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
const by = {
  sol: { symbol: "SOL", baseUnit: "lamports", decimals: 9 },
  eth: { symbol: "ETH", baseUnit: "wei", decimals: 18 },
  btc: { symbol: "BTC", baseUnit: "sats", decimals: 8 }
}, _l = /^(?:0|[1-9][0-9]*)$/;
function vy(e, t) {
  if (t === 0) return e;
  const n = e.padStart(t + 1, "0"), r = n.slice(-t).replace(/0+$/, "");
  return `${n.slice(0, -t)}${r ? `.${r}` : ""}`;
}
function bu(e, t, n) {
  const { symbol: r, baseUnit: i, decimals: o } = by[t];
  if (!_l.test(e) || n === "base") return `${e} ${i}`;
  const s = `${vy(e, o)} ${r}`;
  return n === "symbol" ? s : `${s} (${e} ${i})`;
}
const f2 = 253402300799n;
function h2(e) {
  if (!_l.test(e) || e.length > 12 || BigInt(e) > f2) return null;
  const t = new Date(Number(e) * 1e3).toISOString(), n = t.slice(17, 19);
  return `${t.slice(0, 10)} ${t.slice(11, 16)}${n === "00" ? "" : `:${n}`} UTC`;
}
const ps = 8, ys = 6, vu = 28;
function xu(e, t) {
  if (!t || e.length <= ps + ys + 2) {
    const r = te("span", "review-mono");
    return Ie(r, e), r;
  }
  const n = te("button", "review-mono review-elided");
  return n.type = "button", n.setAttribute("aria-expanded", "false"), n.title = e, Ie(n, `${e.slice(0, ps)}…${e.slice(-ys)}`), n.addEventListener("click", () => {
    n.getAttribute("aria-expanded") !== "true" && (n.setAttribute("aria-expanded", "true"), Ie(n, e));
  }), n;
}
function te(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
const p2 = "http://www.w3.org/2000/svg";
function po(e, t) {
  const n = document.createElementNS(p2, e);
  for (const [r, i] of Object.entries(t)) n.setAttribute(r, i);
  return n;
}
function ku() {
  const e = po("svg", {
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
    po("path", { d: "M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }),
    po("path", { d: "M12 9v4.5" }),
    po("path", { d: "M12 17h.01" })
  ), e;
}
function y2(e) {
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
function w2(e, t) {
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
function yo(e, t = !1) {
  if (e.heading) return xa(e, "review-subheading");
  const n = te("div", e.raw ? "review-field review-field-raw" : "review-field"), r = y2(e);
  if (e.raw) {
    const c = te("div", "review-raw-head"), l = te("pre", "review-raw");
    return Ie(l, e.value), c.append(xa(e)), r && c.append(r), c.append(w2(l, e.value)), n.append(c, l), n;
  }
  const i = te("div", "review-value"), o = e.decimals !== void 0 && _l.test(e.value) ? vy(e.value, e.decimals) : null, s = e.time ? h2(e.value) : null, a = t && e.shownAs ? 0 : e.native ? bu(e.value, e.native, e.unit).length : o !== null || e.time ? vu + 1 : t && e.elide && e.value.length > ps + ys + 2 ? ps + ys + 1 : e.value.length;
  if (t && e.to === void 0 && a + (e.secondary?.length ?? 0) <= vu && n.classList.add("review-field-inline"), t && e.shownAs) {
    const c = te("span", "review-word");
    le(c, e.shownAs), i.append(c);
  } else if (e.native) {
    const c = te("span", "review-mono");
    Ie(c, bu(e.value, e.native, e.unit)), i.append(c);
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
    i.append(xu(e.value, t && e.elide === !0));
  if (e.secondary !== void 0) {
    const c = te("span", "review-mono review-secondary");
    Ie(c, e.secondary), i.append(c);
  }
  if (e.to !== void 0) {
    const c = te("span", "review-arrow");
    Ie(c, "→"), i.append(c, xu(e.to, t));
  }
  return r && i.append(r), n.append(xa(e), i), n;
}
function Eu(e, t, n) {
  const r = te("section", "review-group"), i = te("h2", "review-group-title");
  return le(i, e, t === void 0 ? void 0 : { index: t }), r.append(i, ...n), r;
}
function g2(e, t, n = {}) {
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
    le(f, u), d.append(ku(), f), r.append(d);
  }
  if (t.undecoded) {
    const u = te("p", "review-notice"), d = te("span", "review-notice-text");
    le(d, "sign.blindNotice"), u.append(ku(), d), r.append(u);
  }
  const s = te("div", "review-summary");
  s.append(...t.summary.map((u) => yo(u, !0)), yo(t.signer, !0)), r.append(s);
  const a = te("details", "review-details"), c = te("summary", "review-details-toggle");
  le(c, "review.details");
  const l = te("div", "review-details-body");
  t.details.forEach((u, d) => {
    const f = u.fields.map((h) => yo(h));
    l.append(Eu(u.title, u.index, d === 0 ? [yo(t.signer), ...f] : f));
  }), n.rows && l.append(Eu("review.group.request", void 0, [n.rows])), a.append(c, l), r.append(a), e.append(r);
}
function ve(e) {
  throw new Error(`signing review is malformed: ${e}`);
}
function ws(e, t, n) {
  (typeof e != "object" || e === null || Array.isArray(e)) && ve(`${n} must be an object`);
  const r = e;
  for (const i of Object.keys(r)) t.includes(i) || ve(`${n}.${i} is not a review field`);
  return r;
}
function qn(e, t, n) {
  return (!c2(e) || !e.startsWith(`${t}.`)) && ve(`${n} must be a ${t} translation key`), e;
}
function dc(e, t) {
  if (e !== void 0)
    return (typeof e != "number" || !Number.isSafeInteger(e) || e < 0) && ve(`${t} must be a non-negative integer`), e;
}
function ci(e, t) {
  return Array.isArray(e) || ve(`${t} must be a list`), e;
}
const m2 = 4096, b2 = /^[A-Za-z_][A-Za-z0-9_]{0,63} \([a-z][a-z0-9[\]]{0,31}\)$/;
function ka(e, t) {
  const n = ws(e, ["label", "index", "name", "value", "native", "unit", "decimals", "time", "to", "secondary", "elide", "shownAs", "notes", "raw", "heading"], t), r = dc(n.index, `${t}.index`);
  n.name !== void 0 && (typeof n.name != "string" || (n.label === "review.field.typedField" ? n.name.length > m2 : !b2.test(n.name))) && ve(`${t}.name is not a valid field name`), typeof n.value != "string" && ve(`${t}.value must be a string`), n.native !== void 0 && !Object.hasOwn(by, n.native) && ve(`${t}.native is not a native currency`), n.unit !== void 0 && (n.native === void 0 || n.unit !== "symbol" && n.unit !== "base") && ve(`${t}.unit is not a unit of its currency`), n.decimals !== void 0 && (typeof n.decimals != "number" || !Number.isInteger(n.decimals) || n.decimals < 0 || n.decimals > 255 || n.native !== void 0) && ve(`${t}.decimals must be an encoded decimal count`), n.time !== void 0 && (n.time !== "unix-seconds" || n.native !== void 0 || n.decimals !== void 0) && ve(`${t}.time is not a time form`), n.to !== void 0 && typeof n.to != "string" && ve(`${t}.to must be a string`), n.secondary !== void 0 && typeof n.secondary != "string" && ve(`${t}.secondary must be a string`), n.elide !== void 0 && typeof n.elide != "boolean" && ve(`${t}.elide must be a boolean`);
  const i = n.shownAs === void 0 ? void 0 : qn(n.shownAs, "review.value", `${t}.shownAs`);
  n.raw !== void 0 && typeof n.raw != "boolean" && ve(`${t}.raw must be a boolean`), n.heading !== void 0 && typeof n.heading != "boolean" && ve(`${t}.heading must be a boolean`), n.heading && (n.value !== "" || n.native !== void 0 || n.decimals !== void 0 || n.time !== void 0 || n.notes !== void 0 || n.raw !== void 0 || n.to !== void 0 || n.secondary !== void 0 || n.elide !== void 0 || i !== void 0) && ve(`${t} is a heading and cannot carry a value`);
  const o = n.notes === void 0 ? void 0 : ci(n.notes, `${t}.notes`).map((s, a) => {
    const c = `${t}.notes[${a}]`;
    if (typeof s == "string") return qn(s, "review.note", c);
    const l = ws(s, ["key", "count"], c), u = dc(l.count, `${c}.count`);
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
function xy(e) {
  const t = ws(e, ["kind", "signer", "summary", "undecoded", "warnings", "details"], "review");
  typeof t.undecoded != "boolean" && ve("review.undecoded must be a boolean");
  const n = t.warnings === void 0 ? void 0 : ci(t.warnings, "review.warnings").map((r, i) => qn(r, "review.warning", `review.warnings[${i}]`));
  return {
    kind: qn(t.kind, "review.kind", "review.kind"),
    signer: ka(t.signer, "review.signer"),
    summary: ci(t.summary, "review.summary").map((r, i) => ka(r, `review.summary[${i}]`)),
    undecoded: t.undecoded,
    ...n === void 0 ? {} : { warnings: n },
    details: ci(t.details, "review.details").map((r, i) => {
      const o = `review.details[${i}]`, s = ws(r, ["title", "index", "fields"], o), a = dc(s.index, `${o}.index`);
      return {
        title: qn(s.title, "review.group", `${o}.title`),
        ...a === void 0 ? {} : { index: a },
        fields: ci(s.fields, `${o}.fields`).map((c, l) => ka(c, `${o}.fields[${l}]`))
      };
    })
  };
}
let Il = null, Bl = 0;
function v2(e) {
  Il = e;
}
function ky() {
  return Date.now() < Bl;
}
function x2() {
  Bl = Date.now() + 150, Il?.("ui.show");
}
function k2() {
  Bl = 0, Il?.("ui.hide");
}
function E2() {
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
function Ey(e) {
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
  const r = E2();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), x2(), r.card.classList.remove("confirm-card"), Z(r.title, e), Z(r.subtitle, t), n ? Z(r.body, n) : Ie(r.body, ""), Ey(r.card), r;
}
function qs() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), Ey(e)), k2();
}
function re(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function Au(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function A2(e) {
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
function Ay(e) {
  const t = document.createElement("div");
  t.className = "confirmation-details";
  for (const n of e.rows) {
    const r = document.createElement("div");
    r.className = "detail-row";
    const i = document.createElement("span");
    i.className = "detail-label", Z(i, n.label), r.append(i, A2(n)), t.append(r);
  }
  return t;
}
function S2(e, t, n) {
  if (Ie(e, ""), e.append(Ay(t)), n) {
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
let wo = null;
function $l() {
  return new Error("operation-superseded");
}
function gi(e) {
  const t = e.reason;
  return t instanceof Error ? t : $l();
}
function Su(e) {
  if (e?.aborted) throw gi(e);
}
function or(e) {
  wo?.abort($l());
  const t = new AbortController();
  return wo = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    wo === t && (wo = null);
  });
}
async function _2(e) {
  return or(async (t) => {
    Su(t), Su(e.abortSignal);
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
          f?.abort($l());
        }, p = (O) => {
          u || (u = !0, d(), w(), O());
        }, m = (O) => {
          p(() => l(gi(O)));
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
          const O = new AbortController();
          f = O;
          const I = () => {
            try {
              return Promise.resolve(e.onCopy ? e.onCopy(n, O.signal) : navigator.clipboard.writeText(n));
            } catch (U) {
              return Promise.reject(U);
            }
          }, R = e.prepareCopy && !y ? Promise.resolve(e.prepareCopy(O.signal)).then(() => {
            O.signal.aborted || t.aborted || e.abortSignal?.aborted || (y = !0, Z(a, "plaintext.copyReady"), s.disabled = !1);
          }) : I().then(() => {
            O.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (y = !1), Z(a, "plaintext.copiedBody"), s.disabled = !1);
          });
          h = R, R.then(
            () => {
              O.signal.aborted;
            },
            (U) => {
              if (!(O.signal.aborted || u)) {
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
            f === O && (f = null), h === R && (h = null);
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
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.policyDowngrade ? u2(i.body, e.policyDowngrade) : e.review ? g2(i.body, e.review, {
    session: e.reviewSession,
    rows: e.details && Ay(e.details)
  }) : e.details && S2(i.body, e.details, e.body);
  const o = Le(e.confirmLabel), s = Le("common.cancel");
  return s.classList.add("secondary"), Au(i.card, s), Au(i.card, o), o.disabled = !0, new Promise((a, c) => {
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
function gs(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function I2(e) {
  return new Promise((t, n) => {
    const r = () => n(gs(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function _u(e) {
  if (e?.aborted) throw gs(e);
}
async function Sy(e) {
  const t = Al(e.wrapMeta), n = Ns(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      js(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), gs(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? gs(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [I2(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await _y({
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
async function _y(e) {
  const t = Al(e.wrapMeta);
  let n;
  try {
    _u(e.abortSignal), n = await Mp(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), _u(e.abortSignal);
    const r = ly({
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
function B2(e) {
  if (typeof e != "object" || e === null)
    throw new A("invalid_payload", "request payload must be an object");
  return e;
}
function $2(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new A("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function Iu(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new A("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function T2(e) {
  const t = B2(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new A("invalid_payload", "kind must be static or keypair");
  const r = Iu(t.name, "name");
  if (t.rootMetadata !== void 0) throw new A("invalid_payload", "seal cannot set vault root metadata");
  const i = $2(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.curve !== void 0) throw new A("invalid_payload", "static seal cannot carry a curve");
    if (t.inputMode !== "parent-value")
      throw new A("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: Iu(t.value, "value"),
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
const P2 = 512, Iy = "avibe-vault-signed-context-replay:v2", O2 = "avibe-vault-signed-context-replay:v2", R2 = "avibe-vault-signed-context-replay:v2", st = /* @__PURE__ */ new Map();
let Bu = !1, li = null;
function Qe(e) {
  return typeof e == "object" && e !== null;
}
function Kt(e, t) {
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
function C2(e, t) {
  if (e !== "static" && e !== "keypair") throw new A("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function L2(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new A("invalid_payload", "context purpose is invalid");
  return e;
}
function uc(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new A("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function H2(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new A("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function Tl(e, t) {
  if (!Qe(e)) throw new A(t, "agent delivery context.release must be an object");
  return {
    name: Kt(e.name, "context.release.name"),
    ttlSecs: uc(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: H2(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: uc(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: Kt(e.operationHash, "context.release.operationHash")
  };
}
function ue(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(ue).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${ue(t[n])}`).join(",")}}`;
}
function Pl(e) {
  const t = Qe(e) ? e : null;
  if (!t) throw new A("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new A("invalid_payload", "context version must be 2");
  const n = L2(t.purpose);
  Kt(t.requestId, "context.requestId"), t.grantId !== void 0 && Jr(t.grantId, "context.grantId");
  const r = Qe(t.display) ? t.display : null;
  if (!r) throw new A("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new A("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, l) => {
    if (!Qe(c)) throw new A("invalid_payload", `context.display.secrets[${l}] must be an object`);
    Kt(c.name, `context.display.secrets[${l}].name`), C2(c.kind, `context.display.secrets[${l}].kind`);
  }), r.sessionLabel !== void 0 && Jr(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && Jr(r.command, "context.display.command"), r.egress !== void 0 && Jr(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!Qe(i)) throw new A("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && Ea(i.env, "context.display.source.env"), i.tags !== void 0 && Ea(i.tags, "context.display.source.tags"), i.skills !== void 0 && Ea(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && uc(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = Qe(t.signature) ? t.signature : null;
  if (!o) throw new A("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new A("invalid_payload", "context signature alg must be ed25519");
  Kt(o.keyId, "context.signature.keyId"), Kt(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!Qe(s)) throw new A("invalid_payload", "context.agent must be an object");
    const c = Qe(s.publicKey) ? s.publicKey : null;
    if (!c) throw new A("invalid_payload", "context.agent.publicKey must be an object");
    Kt(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && Jr(c.fingerprint, "context.agent.publicKey.fingerprint"), Kt(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = Tl(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new A("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new A("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !Qe(a))
    throw new A("invalid_payload", "context.release must be an object");
  return Kt(t.expiresAt, "context.expiresAt"), t;
}
function Gs(e) {
  const { signature: t, ...n } = e;
  return ue(n);
}
function ms(e) {
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
  if (!vx({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: Gs(e.context)
  })) throw new A("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && Tl(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new A("context_expired", "signed release approval is expired", !0);
}
function Ol(e) {
  for (const [t, n] of st)
    n <= e && st.delete(t);
}
function U2() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function Dr() {
  return typeof window < "u";
}
function Rl() {
  return new A("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function By(e) {
  const t = U2();
  if (!t && e && Dr()) throw Rl();
  return t;
}
function $y(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!Qe(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function Cl(e = Date.now(), t = !1) {
  Ol(e);
  const n = By(t);
  if (n)
    try {
      n.setItem(Iy, JSON.stringify({ version: 2, entries: [...st] }));
    } catch {
      if (t && Dr()) throw Rl();
    }
}
function Ty(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && st.set(r, Math.max(st.get(r) ?? 0, i));
  n && Cl(t);
}
function Ll() {
  if (!(li || typeof BroadcastChannel > "u"))
    try {
      li = new BroadcastChannel(O2), li.addEventListener("message", (e) => {
        const t = Qe(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || Ty($y({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      li = null;
    }
}
function N2(e = Date.now()) {
  Bu || (Ll(), Py(e, Dr()), Bu = !0);
}
function Py(e = Date.now(), t = !1) {
  Ll();
  const n = By(t);
  if (n)
    try {
      Ty($y(JSON.parse(n.getItem(Iy) ?? "null"), e), e, !1), Ol(e);
    } catch {
      if (t && Dr()) throw Rl();
      Cl(e);
    }
}
function D2(e) {
  Ll();
  try {
    li?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function z2() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function M2(e) {
  const t = z2();
  if (t) return await t.request(R2, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new A("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function Oy(e, t) {
  N2(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new A("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  Ol(t);
  for (const r of n.keys())
    if (st.has(r))
      throw new A("context_replayed", "signed context requestId was already used", !0);
  if (st.size + n.size > P2)
    throw new A("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function Ii(e, t = Date.now()) {
  Oy(e, t);
}
async function Bi(e, t = Date.now()) {
  const n = [...e];
  await M2(() => {
    Py(t, Dr());
    const r = Oy(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, st.get(o));
    for (const [o, s] of r) st.set(o, s);
    try {
      Cl(t, Dr());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? st.delete(s) : st.set(s, a);
      throw o;
    }
    D2([...r]);
  });
}
async function K2(e, t) {
  if (e.purpose !== "agent-deliver") throw new A("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new A("invalid_context", "agent delivery context is missing grantId");
  const n = Tl(e.release, "invalid_context");
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
function F2(e) {
  if (!e.agent) throw new A("invalid_context", "agent delivery context is missing agent key");
  if (e.agent.publicKey.fingerprint && e.agent.publicKey.fingerprint !== e.agent.fingerprint)
    throw new A("invalid_context", "agent public key fingerprint mismatch");
  return { ...e.agent.publicKey, fingerprint: e.agent.fingerprint };
}
async function j2(e) {
  const t = e.map((n) => Gs(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ue(t))));
}
function $u(e) {
  return ue(e.display);
}
const V2 = "1.2.3";
let Xe = class fc extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof fc ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof fc && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${V2}`
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
function Xt(e, t) {
  return e.exec(t)?.groups;
}
const Ry = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Cy = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, Ly = /^\(.+?\).*?$/, Tu = /^tuple(?<array>(\[(\d*)\])*)$/;
function hc(e) {
  let t = e.type;
  if (Tu.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += hc(o), i < n - 1 && (t += ", ");
    }
    const r = Xt(Tu, e.type);
    return t += `)${r?.array || ""}`, hc({
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
    t += hc(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function q2(e) {
  return e.type === "function" ? `function ${e.name}(${Qr(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${Qr(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${Qr(e.inputs)})` : e.type === "error" ? `error ${e.name}(${Qr(e.inputs)})` : e.type === "constructor" ? `constructor(${Qr(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const Hy = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function G2(e) {
  return Hy.test(e);
}
function W2(e) {
  return Xt(Hy, e);
}
const Uy = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function Z2(e) {
  return Uy.test(e);
}
function Y2(e) {
  return Xt(Uy, e);
}
const Ny = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function X2(e) {
  return Ny.test(e);
}
function J2(e) {
  return Xt(Ny, e);
}
const Dy = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function zy(e) {
  return Dy.test(e);
}
function Q2(e) {
  return Xt(Dy, e);
}
const My = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function ek(e) {
  return My.test(e);
}
function tk(e) {
  return Xt(My, e);
}
const Ky = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function nk(e) {
  return Ky.test(e);
}
function rk(e) {
  return Xt(Ky, e);
}
const ik = /^receive\(\) external payable$/;
function ok(e) {
  return ik.test(e);
}
const sk = /* @__PURE__ */ new Set(["indexed"]), pc = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class ak extends Xe {
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
class ck extends Xe {
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
class lk extends Xe {
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
class dk extends Xe {
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
class uk extends Xe {
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
class fk extends Xe {
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
class hk extends Xe {
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
class qr extends Xe {
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
class pk extends Xe {
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
class yk extends Xe {
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
class wk extends Xe {
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
class gk extends Xe {
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
function mk(e, t, n) {
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
function bk(e, t = {}) {
  if (X2(e))
    return vk(e, t);
  if (Z2(e))
    return xk(e, t);
  if (G2(e))
    return kk(e, t);
  if (ek(e))
    return Ek(e, t);
  if (nk(e))
    return Ak(e);
  if (ok(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new pk({ signature: e });
}
function vk(e, t = {}) {
  const n = J2(e);
  if (!n)
    throw new qr({ signature: e, type: "function" });
  const r = nt(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(nr(r[a], {
      modifiers: pc,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = nt(n.returns), c = a.length;
    for (let l = 0; l < c; l++)
      s.push(nr(a[l], {
        modifiers: pc,
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
function xk(e, t = {}) {
  const n = Y2(e);
  if (!n)
    throw new qr({ signature: e, type: "event" });
  const r = nt(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(nr(r[s], {
      modifiers: sk,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function kk(e, t = {}) {
  const n = W2(e);
  if (!n)
    throw new qr({ signature: e, type: "error" });
  const r = nt(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(nr(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function Ek(e, t = {}) {
  const n = tk(e);
  if (!n)
    throw new qr({ signature: e, type: "constructor" });
  const r = nt(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(nr(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function Ak(e) {
  const t = rk(e);
  if (!t)
    throw new qr({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const Sk = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, _k = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, Ik = /^u?int$/;
function nr(e, t) {
  const n = mk(e, t?.type, t?.structs);
  if (Aa.has(n))
    return Aa.get(n);
  const r = Ly.test(e), i = Xt(r ? _k : Sk, e);
  if (!i)
    throw new lk({ param: e });
  if (i.name && $k(i.name))
    throw new dk({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, l = {};
  if (r) {
    c = "tuple";
    const d = nt(i.type), f = [], h = d.length;
    for (let y = 0; y < h; y++)
      f.push(nr(d[y], { structs: a }));
    l = { components: f };
  } else if (i.type in a)
    c = "tuple", l = { components: a[i.type] };
  else if (Ik.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !Fy(c))
    throw new ck({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new uk({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (pc.has(i.modifier) && !Tk(c, !!i.array))
      throw new fk({
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
function nt(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? nt(a, [...t, n.trim()]) : nt(a, t, `${n}${s}`, r);
      case "(":
        return nt(a, t, `${n}${s}`, r + 1);
      case ")":
        return nt(a, t, `${n}${s}`, r - 1);
      default:
        return nt(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new gk({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function Fy(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || Ry.test(e) || Cy.test(e);
}
const Bk = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function $k(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || Ry.test(e) || Cy.test(e) || Bk.test(e);
}
function Tk(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function Pk(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!zy(a))
      continue;
    const c = Q2(a);
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
      throw new yk({ signature: a });
    t[c.name] = u;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = jy(c, t);
  }
  return r;
}
const Ok = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function jy(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (Ly.test(s.type))
      r.push(s);
    else {
      const c = Xt(Ok, s.type);
      if (!c?.type)
        throw new hk({ abiParameter: s });
      const { array: l, type: u } = c;
      if (u in t) {
        if (n.has(u))
          throw new wk({ type: u });
        r.push({
          ...s,
          type: `tuple${l ?? ""}`,
          components: jy(t[u], t, /* @__PURE__ */ new Set([...n, u]))
        });
      } else if (Fy(u))
        r.push(s);
      else
        throw new ak({ type: u });
    }
  }
  return r;
}
function Rk(e) {
  const t = Pk(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    zy(o) || n.push(bk(o, t));
  }
  return n;
}
function Vy(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => Ck(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function Ck(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${Vy(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function Di(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function me(e) {
  return Di(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const qy = "2.54.6";
let Sa = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${qy}`
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
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = qy;
  }
  walk(t) {
    return Gy(this, t);
  }
}
function Gy(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? Gy(e.cause, t) : t ? null : e;
}
class Lk extends X {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${Vy(n, { includeName: !0 })})`,
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
class Hk extends X {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class Uk extends X {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class Nk extends X {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${me(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class Dk extends X {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class zk extends X {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class Mk extends X {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class Kk extends X {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class Fk extends X {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class Wy extends X {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class Zy extends X {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function Gr(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? In(e, { dir: t, size: n }) : jk(e, { dir: t, size: n });
}
function In(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new Zy({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function jk(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new Zy({
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
class Hl extends X {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class Vk extends X {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class qk extends X {
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
function Ot(e, { size: t }) {
  if (me(e) > t)
    throw new qk({
      givenSize: me(e),
      maxSize: t
    });
}
function Yy(e, t = {}) {
  const { signed: n } = t;
  t.size && Ot(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function Ul(e, t = {}) {
  const n = Yy(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new Hl({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const Gk = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Ti(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? Y(e, t) : typeof e == "string" ? Jy(e, t) : typeof e == "boolean" ? Xy(e, t) : Ne(e, t);
}
function Xy(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (Ot(n, { size: t.size }), Gr(n, { size: t.size })) : n;
}
function Ne(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += Gk[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (Ot(r, { size: t.size }), Gr(r, { dir: "right", size: t.size })) : r;
}
function Y(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new Hl({
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
const Wk = /* @__PURE__ */ new TextEncoder();
function Jy(e, t = {}) {
  const n = Wk.encode(e);
  return Ne(n, t);
}
const Zk = /* @__PURE__ */ new TextEncoder();
function Nl(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? Xk(e, t) : typeof e == "boolean" ? Yk(e, t) : Di(e) ? Rn(e, t) : Qy(e, t);
}
function Yk(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (Ot(n, { size: t.size }), Gr(n, { size: t.size })) : n;
}
const zt = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function Pu(e) {
  if (e >= zt.zero && e <= zt.nine)
    return e - zt.zero;
  if (e >= zt.A && e <= zt.F)
    return e - (zt.A - 10);
  if (e >= zt.a && e <= zt.f)
    return e - (zt.a - 10);
}
function Rn(e, t = {}) {
  let n = e;
  t.size && (Ot(n, { size: t.size }), n = Gr(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = Pu(r.charCodeAt(a++)), l = Pu(r.charCodeAt(a++));
    if (c === void 0 || l === void 0)
      throw new X(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + l;
  }
  return o;
}
function Xk(e, t) {
  const n = Y(e, t);
  return Rn(n);
}
function Qy(e, t = {}) {
  const n = Zk.encode(e);
  return typeof t.size == "number" ? (Ot(n, { size: t.size }), Gr(n, { dir: "right", size: t.size })) : n;
}
const go = /* @__PURE__ */ BigInt(2 ** 32 - 1), Ou = /* @__PURE__ */ BigInt(32);
function Jk(e, t = !1) {
  return t ? { h: Number(e & go), l: Number(e >> Ou & go) } : { h: Number(e >> Ou & go) | 0, l: Number(e & go) | 0 };
}
function Qk(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Jk(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const eE = (e, t, n) => e << n | t >>> 32 - n, tE = (e, t, n) => t << n | e >>> 32 - n, nE = (e, t, n) => t << n - 32 | e >>> 64 - n, rE = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function iE(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Ru(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Pi(e, ...t) {
  if (!iE(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function bs(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function ew(e, t) {
  Pi(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function oE(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Oi(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function _a(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function mt(e, t) {
  return e << 32 - t | e >>> t;
}
const sE = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function aE(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function cE(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = aE(e[t]);
  return e;
}
const Cu = sE ? (e) => e : cE;
function lE(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function Dl(e) {
  return typeof e == "string" && (e = lE(e)), Pi(e), e;
}
class tw {
}
function nw(e) {
  const t = (r) => e().update(Dl(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const dE = BigInt(0), ei = BigInt(1), uE = BigInt(2), fE = BigInt(7), hE = BigInt(256), pE = BigInt(113), rw = [], iw = [], ow = [];
for (let e = 0, t = ei, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], rw.push(2 * (5 * r + n)), iw.push((e + 1) * (e + 2) / 2 % 64);
  let i = dE;
  for (let o = 0; o < 7; o++)
    t = (t << ei ^ (t >> fE) * pE) % hE, t & uE && (i ^= ei << (ei << /* @__PURE__ */ BigInt(o)) - ei);
  ow.push(i);
}
const sw = Qk(ow, !0), yE = sw[0], wE = sw[1], Lu = (e, t, n) => n > 32 ? nE(e, t, n) : eE(e, t, n), Hu = (e, t, n) => n > 32 ? rE(e, t, n) : tE(e, t, n);
function gE(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, l = n[c], u = n[c + 1], d = Lu(l, u, 1) ^ n[a], f = Hu(l, u, 1) ^ n[a + 1];
      for (let h = 0; h < 50; h += 10)
        e[s + h] ^= d, e[s + h + 1] ^= f;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = iw[s], c = Lu(i, o, a), l = Hu(i, o, a), u = rw[s];
      i = e[u], o = e[u + 1], e[u] = c, e[u + 1] = l;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= yE[r], e[1] ^= wE[r];
  }
  Oi(n);
}
class zl extends tw {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, Ru(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = oE(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Cu(this.state32), gE(this.state32, this.rounds), Cu(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    bs(this), t = Dl(t), Pi(t);
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
    bs(this, !1), Pi(t), this.finish();
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
    return Ru(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (ew(t, this), this.finished)
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
    return t || (t = new zl(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const mE = (e, t, n) => nw(() => new zl(t, e, n)), bE = mE(1, 136, 256 / 8);
function St(e, t) {
  const n = t || "hex", r = bE(Di(e, { strict: !1 }) ? Nl(e) : e);
  return n === "bytes" ? r : Ti(r);
}
const vE = (e) => St(Nl(e));
function xE(e) {
  return vE(e);
}
function kE(e) {
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
const EE = (e) => {
  const t = typeof e == "string" ? e : q2(e);
  return kE(t);
};
function AE(e) {
  return xE(EE(e));
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
class aw extends Map {
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
const Ia = /* @__PURE__ */ new aw(8192);
function cw(e, t) {
  if (Ia.has(`${e}.${t}`))
    return Ia.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = St(Qy(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return Ia.set(`${e}.${t}`, o), o;
}
const SE = /^0x[a-fA-F0-9]{40}$/, Ba = /* @__PURE__ */ new aw(8192);
function ar(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if (Ba.has(r))
    return Ba.get(r);
  const i = SE.test(e) ? e.toLowerCase() === e ? !0 : n ? cw(e) === e : !0 : !1;
  return Ba.set(r, i), i;
}
function _E(e) {
  return typeof e[0] == "string" ? dt(e) : IE(e);
}
function IE(e) {
  let t = 0;
  for (const i of e)
    t += i.length;
  const n = new Uint8Array(t);
  let r = 0;
  for (const i of e)
    n.set(i, r), r += i.length;
  return n;
}
function dt(e) {
  return `0x${e.reduce((t, n) => t + n.replace("0x", ""), "")}`;
}
function Ml(e, t, n, { strict: r } = {}) {
  return Di(e, { strict: !1 }) ? fw(e, t, n, {
    strict: r
  }) : uw(e, t, n, {
    strict: r
  });
}
function lw(e, t) {
  if (typeof t == "number" && t > 0 && t > me(e) - 1)
    throw new Wy({
      offset: t,
      position: "start",
      size: me(e)
    });
}
function dw(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && me(e) !== n - t)
    throw new Wy({
      offset: n,
      position: "end",
      size: me(e)
    });
}
function uw(e, t, n, { strict: r } = {}) {
  lw(e, t);
  const i = e.slice(t, n);
  return r && dw(i, t, n), i;
}
function fw(e, t, n, { strict: r } = {}) {
  lw(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && dw(i, t, n), i;
}
const BE = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, hw = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function Kl(e, t) {
  if (e.length !== t.length)
    throw new Dk({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = $E({
    params: e,
    values: t
  });
  return jl(n);
}
function $E({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(Fl({ param: e[r], value: t[r] }));
  return n;
}
function Fl({ param: e, value: t }) {
  const n = Ws(e.type);
  if (n) {
    const [r, i] = n;
    return PE(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return HE(t, {
      param: e
    });
  if (e.type === "address")
    return TE(t);
  if (e.type === "bool")
    return RE(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = hw.exec(e.type) ?? [];
    return CE(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return OE(t, { param: e });
  if (e.type === "string")
    return LE(t);
  throw new Mk(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function jl(e) {
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
  return dt([...n, ...r]);
}
function TE(e) {
  if (!ar(e))
    throw new sr({ address: e });
  return { dynamic: !1, encoded: In(e.toLowerCase()) };
}
function PE(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new Fk(e);
  if (!r && e.length !== t)
    throw new Uk({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && yc(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = Fl({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = jl(o);
    if (r) {
      const a = Y(o.length, { size: 32 });
      return {
        dynamic: !0,
        encoded: dt([a, s])
      };
    }
    if (i)
      return { dynamic: !0, encoded: s };
  }
  return {
    dynamic: !1,
    encoded: dt(o.map(({ encoded: s }) => s))
  };
}
function OE(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = me(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = In(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: dt([
        In(Y(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new Nk({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: In(e, { dir: "right" }) };
}
function RE(e) {
  if (typeof e != "boolean")
    throw new X(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: In(Xy(e)) };
}
function CE(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new Hl({
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
function LE(e) {
  const t = Jy(e), n = Math.ceil(me(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(In(Ml(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: dt([
      In(Y(me(t), { size: 32 })),
      ...r
    ])
  };
}
function HE(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = Fl({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? jl(r) : dt(r.map(({ encoded: i }) => i))
  };
}
function Ws(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function yc(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(yc);
  const n = Ws(t);
  return n ? yc({ ...e, type: n[1] }) : !1;
}
const UE = (e) => Ml(AE(e), 0, 4);
class Uu extends X {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class NE extends X {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class DE extends X {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const zE = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new DE({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new NE({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new Uu({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new Uu({ offset: e });
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
function Vl(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(zE);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function ME(e, t = {}) {
  typeof t.size < "u" && Ot(e, { size: t.size });
  const n = Ne(e, t);
  return Yy(n, t);
}
function KE(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (Ot(n, { size: t.size }), n = $i(n)), n.length > 1 || n[0] > 1)
    throw new Vk(n);
  return !!n[0];
}
function Wt(e, t = {}) {
  typeof t.size < "u" && Ot(e, { size: t.size });
  const n = Ne(e, t);
  return Ul(n, t);
}
function FE(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (Ot(n, { size: t.size }), n = $i(n, { dir: "right" })), new TextDecoder().decode(n);
}
function jE(e, t) {
  const n = typeof t == "string" ? Rn(t) : t, r = Vl(n);
  if (me(n) === 0 && e.length > 0)
    throw new Hk();
  if (me(t) && me(t) < 32)
    throw new Lk({
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
    return qE(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return YE(e, t, { staticPosition: n });
  if (t.type === "address")
    return VE(e);
  if (t.type === "bool")
    return GE(e);
  if (t.type.startsWith("bytes"))
    return WE(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return ZE(e, t);
  if (t.type === "string")
    return XE(e, { staticPosition: n });
  throw new Kk(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const Nu = 32, wc = 32;
function VE(e) {
  const t = e.readBytes(32);
  return [cw(Ne(uw(t, -20))), 32];
}
function qE(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = Wt(e.readBytes(wc)), a = r + s, c = a + Nu;
    e.setPosition(a);
    const l = Wt(e.readBytes(Nu)), u = Ri(t);
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
    const s = Wt(e.readBytes(wc)), a = r + s, c = [];
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
function GE(e) {
  return [KE(e.readBytes(32), { size: 32 }), 32];
}
function WE(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = Wt(e.readBytes(32));
    e.setPosition(n + s);
    const a = Wt(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [Ne(c), 32];
  }
  return [Ne(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function ZE(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? ME(i, { signed: n }) : Wt(i, { signed: n }),
    32
  ];
}
function YE(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (Ri(t)) {
    const s = Wt(e.readBytes(wc)), a = n + s;
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
function XE(e, { staticPosition: t }) {
  const n = Wt(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = Wt(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = FE($i(o));
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
const JE = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), QE = {
  ether: -9,
  wei: 9
};
function eA(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function gc(e, t = "wei") {
  return eA(e, QE[t]);
}
function tA(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class nA extends X {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        tA(t),
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
class rA extends X {
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
class iA extends X {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function zr(e, t = "hex") {
  const n = pw(e), r = Vl(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? Ne(r.bytes) : r.bytes;
}
function pw(e) {
  return Array.isArray(e) ? oA(e.map((t) => pw(t))) : sA(e);
}
function oA(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = yw(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function sA(e) {
  const t = typeof e == "string" ? Rn(e) : e, n = yw(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function yw(e) {
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
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${gc(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
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
class ww extends X {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${gc(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${gc(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(ww, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const ql = 2n ** 256n - 1n;
function gw(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => Rn(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => Ne(o));
}
function mw(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => Rn(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => Rn(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => Ne(s));
}
function aA(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, l = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + l, a, r);
}
function cA(e, t, n) {
  return e & t ^ ~e & n;
}
function lA(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class dA extends tw {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = _a(this.buffer);
  }
  update(t) {
    bs(this), t = Dl(t), Pi(t);
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
    bs(this), ew(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Oi(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    aA(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
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
const wn = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), uA = /* @__PURE__ */ Uint32Array.from([
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
]), gn = /* @__PURE__ */ new Uint32Array(64);
class fA extends dA {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = wn[0] | 0, this.B = wn[1] | 0, this.C = wn[2] | 0, this.D = wn[3] | 0, this.E = wn[4] | 0, this.F = wn[5] | 0, this.G = wn[6] | 0, this.H = wn[7] | 0;
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
      gn[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const f = gn[d - 15], h = gn[d - 2], y = mt(f, 7) ^ mt(f, 18) ^ f >>> 3, w = mt(h, 17) ^ mt(h, 19) ^ h >>> 10;
      gn[d] = w + gn[d - 7] + y + gn[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: l, H: u } = this;
    for (let d = 0; d < 64; d++) {
      const f = mt(a, 6) ^ mt(a, 11) ^ mt(a, 25), h = u + f + cA(a, c, l) + uA[d] + gn[d] | 0, w = (mt(r, 2) ^ mt(r, 13) ^ mt(r, 22)) + lA(r, i, o) | 0;
      u = l, l = c, c = a, a = s + h | 0, s = o, o = i, i = r, r = h + w | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, l = l + this.G | 0, u = u + this.H | 0, this.set(r, i, o, s, a, c, l, u);
  }
  roundClean() {
    Oi(gn);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Oi(this.buffer);
  }
}
const hA = /* @__PURE__ */ nw(() => new fA()), pA = hA;
function yA(e, t) {
  return pA(Di(e, { strict: !1 }) ? Nl(e) : e);
}
function wA(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = yA(t);
  return i.set([n], 0), r === "bytes" ? i : Ne(i);
}
function gA(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(wA({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const Du = 6, bw = 32, Gl = 4096, vw = bw * Gl, zu = vw * Du - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * Gl * Du, xw = 1;
class mA extends X {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class kw extends X {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class bA extends X {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class vA extends X {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${xw}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function xA(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? Rn(e.data) : e.data, r = me(n);
  if (!r)
    throw new kw();
  if (r > zu)
    throw new mA({
      maxSize: zu,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = Vl(new Uint8Array(vw));
    let c = 0;
    for (; c < Gl; ) {
      const l = n.slice(s, s + (bw - 1));
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
function kA(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? xA({ data: t, to: r }), o = e.commitments ?? gw({ blobs: i, kzg: n, to: r }), s = e.proofs ?? mw({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function EA(e) {
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
  throw new nA({ transaction: e });
}
class Ys extends X {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function AA(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!ar(i))
        throw new sr({ address: i });
      if (r < 0)
        throw new Ys({ chainId: r });
    }
  Wl(e);
}
function SA(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new kw();
    for (const n of t) {
      const r = me(n), i = Ul(Ml(n, 0, 1));
      if (r !== 32)
        throw new bA({ hash: n, size: r });
      if (i !== xw)
        throw new vA({
          hash: n,
          version: i
        });
    }
  }
  Wl(e);
}
function Wl(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new Ys({ chainId: t });
  if (i && !ar(i))
    throw new sr({ address: i });
  if (r && r > ql)
    throw new Zs({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new ww({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function _A(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new Ys({ chainId: t });
  if (o && !ar(o))
    throw new sr({ address: o });
  if (n || i)
    throw new X("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > ql)
    throw new Zs({ maxFeePerGas: r });
}
function IA(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !ar(o))
    throw new sr({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new Ys({ chainId: t });
  if (n || i)
    throw new X("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > ql)
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
        throw new iA({ storageKey: i[o] });
    if (!ar(r, { strict: !1 }))
      throw new sr({ address: r });
    t.push([r, i]);
  }
  return t;
}
function BA(e, t) {
  const n = EA(e);
  return n === "eip1559" ? PA(e, t) : n === "eip2930" ? OA(e, t) : n === "eip4844" ? TA(e, t) : n === "eip7702" ? $A(e, t) : RA(e);
}
function $A(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: l, accessList: u, data: d } = e;
  AA(e);
  const f = Xs(u), h = CA(n);
  return dt([
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
      ...zi(e, t)
    ])
  ]);
}
function TA(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: l, accessList: u, data: d } = e;
  SA(e);
  let f = e.blobVersionedHashes, h = e.sidecars;
  if (e.blobs && (typeof f > "u" || typeof h > "u")) {
    const E = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((R) => Ne(R)), O = e.kzg, I = gw({
      blobs: E,
      kzg: O
    });
    if (typeof f > "u" && (f = gA({
      commitments: I
    })), typeof h > "u") {
      const R = mw({ blobs: E, commitments: I, kzg: O });
      h = kA({ blobs: E, commitments: I, proofs: R });
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
    ...zi(e, t)
  ], p = [], m = [], S = [];
  if (h)
    for (let E = 0; E < h.length; E++) {
      const { blob: O, commitment: I, proof: R } = h[E];
      p.push(O), m.push(I), S.push(R);
    }
  return dt([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    zr(h ? [w, p, m, S] : w)
  ]);
}
function PA(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: l, data: u } = e;
  Wl(e);
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
    ...zi(e, t)
  ];
  return dt([
    "0x02",
    zr(f)
  ]);
}
function OA(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: l } = e;
  _A(e);
  const u = Xs(c), d = [
    Y(n),
    o ? Y(o) : "0x",
    l ? Y(l) : "0x",
    r ? Y(r) : "0x",
    s ?? "0x",
    a ? Y(a) : "0x",
    i ?? "0x",
    u,
    ...zi(e, t)
  ];
  return dt([
    "0x01",
    zr(d)
  ]);
}
function RA(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  IA(e);
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
function zi(e, t) {
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
function CA(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Ti(r) : "0x",
      s,
      i ? Ti(i) : "0x",
      ...zi({}, o)
    ]);
  }
  return t;
}
class LA extends X {
  constructor({ domain: t }) {
    super(`Invalid domain "${JE(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class HA extends X {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class UA extends X {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function NA(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: l, type: u } = c, d = a[l], f = u.match(hw);
      if (f && (typeof d == "number" || typeof d == "bigint")) {
        const [w, p, m] = f;
        Y(d, {
          signed: p === "int",
          size: Number.parseInt(m, 10) / 8
        });
      }
      if (u === "address" && typeof d == "string" && !ar(d))
        throw new sr({ address: d });
      const h = u.match(BE);
      if (h) {
        const [w, p] = h;
        if (p && me(d) !== Number.parseInt(p, 10))
          throw new zk({
            expectedSize: Number.parseInt(p, 10),
            givenSize: me(d)
          });
      }
      const y = i[u];
      y && (DA(u), o(y, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new LA({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new HA({ primaryType: r, types: i });
}
function Ew({ domain: e }) {
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
function DA(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new UA({ type: e });
}
function zA(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: Ew({ domain: t }),
    ...e.types
  };
  NA({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(MA({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(Aw({
    data: n,
    primaryType: r,
    types: i
  })), St(_E(o));
}
function MA({ domain: e, types: t }) {
  return Aw({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function Aw({ data: e, primaryType: t, types: n }) {
  const r = Sw({
    data: e,
    primaryType: t,
    types: n
  });
  return St(r);
}
function Sw({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [KA({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = Iw({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return Kl(r, i);
}
function KA({ primaryType: e, types: t }) {
  const n = Ti(FA({ primaryType: e, types: t }));
  return St(n);
}
function FA({ primaryType: e, types: t }) {
  let n = "";
  const r = _w({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function _w({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    _w({ primaryType: o.type, types: t }, n);
  return n;
}
function Iw({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      St(Sw({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, St(r)];
  if (n === "string")
    return [{ type: "bytes32" }, St(Ti(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => Iw({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      St(Kl(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
function jA(e) {
  const t = fw(e, 0, 1);
  if (t === "0x04")
    return "eip7702";
  if (t === "0x03")
    return "eip4844";
  if (t === "0x02")
    return "eip1559";
  if (t === "0x01")
    return "eip2930";
  if (t !== "0x" && Ul(t) >= 192)
    return "legacy";
  throw new rA({ serializedType: t });
}
const Mu = "bitcoin-taproot-keypath-v1", Ku = "bip341-sighash-default-keypath", VA = ["bitcoin", "testnet", "signet", "regtest"], mc = 21000000n * 100000000n, Bw = 137, $w = /^[0-9a-f]+$/, qA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", GA = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", WA = 734539939, ZA = 1;
function ee(e) {
  throw new A("invalid_payload", e);
}
function Fu(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && ee(`${t} must be an object`), e;
}
function ju(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && ee(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && ee(`${n} is missing required fields: ${i.join(", ")}`);
}
function To(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !$w.test(e)) && ee(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function YA(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && ee(`${t} must be an integer in ${n}..${r}`), e;
}
function rt(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function mr(e, t, n, r) {
  return t + n > e.length && ee(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function mo(e, t, n) {
  t >= e.length && ee(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && ee(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function $a(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function XA(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function ti(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function Vu(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function Tw(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  ee("transaction output uses an unsupported script template");
}
function JA(e) {
  (e.length === 0 || e.length % 2 || e.length > Bw * 2 || !$w.test(e)) && ee("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (U) => Number.parseInt(U, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && ee("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = mo(t, n, "input count");
  n = i, r !== 1 && ee("transaction must contain exactly one input");
  const [o, s] = mr(t, n, 32, "outpoint hash");
  n = s, o.every((U) => U === 0) && ee("outpoint hash must not be null");
  const [a, c] = mr(t, n, 4, "outpoint index");
  n = c;
  const l = $a(a), [u, d] = mo(t, n, "scriptSig length");
  n = d, u !== 0 && ee("scriptSig must be empty");
  const [f, h] = mr(t, n, 4, "sequence");
  n = h;
  const y = $a(f);
  y !== 4294967293 && y !== 4294967294 && y !== 4294967295 && ee("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [w, p] = mo(t, n, "output count");
  n = p, w !== 1 && w !== 2 && ee("transaction must contain one or two outputs");
  const m = [], S = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let U = 0; U < w; U += 1) {
    const [H, B] = mr(t, n, 8, `output ${U} amount`);
    n = B;
    const D = XA(H);
    (D < 1n || D > mc) && ee(`output ${U} amount is outside the Bitcoin money range`);
    const [C, x] = mo(t, n, `output ${U} script length`);
    n = x;
    const [v, b] = mr(t, n, C, `output ${U} script`);
    n = b;
    const g = Tw(v);
    C !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[g] && ee(`output ${U} script length is not canonical for ${g}`), D < S[g] && ee(`output ${U} is below the V1 ${g} dust floor`), m.push({ amountSats: D, scriptPubKey: v, kind: g });
  }
  const [E, O] = mr(t, n, 4, "locktime");
  n = O;
  const I = $a(E);
  I !== 0 && ee("locktime must be exactly zero"), n !== t.length && ee("transaction has trailing bytes");
  const R = m.reduce((U, H) => U + H.amountSats, 0n);
  return (R < 1n || R > mc) && ee("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: l, sequence: y, outputs: m, locktime: I };
}
function QA(e, t) {
  const n = ae(new TextEncoder().encode(e));
  return ae(rt(n, n, t));
}
function eS(e, t, n) {
  const r = rt(e.prevoutHashLe, ti(e.prevoutIndex)), i = rt(new Uint8Array([n.length]), n), o = e.outputs.map((a) => rt(Vu(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = rt(
    new Uint8Array([0, 0]),
    ti(2),
    ti(e.locktime),
    ae(r),
    ae(Vu(t)),
    ae(i),
    ae(ti(e.sequence)),
    ae(rt(...o)),
    new Uint8Array([0]),
    ti(0)
  );
  return QA("TapSighash", s);
}
function tS(e) {
  return BigInt(`0x${J(e)}`);
}
function qu(e) {
  return Kc(ae(e));
}
function Gu(e, t) {
  const n = rt(new Uint8Array([e]), t), r = ae(ae(n)).slice(0, 4), i = rt(n, r);
  let o = tS(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = qA[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function nS(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function rS(e) {
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
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...nS(n, 8, 5)], o = [...r].map((l) => l.charCodeAt(0) >> 5).concat([0], [...r].map((l) => l.charCodeAt(0) & 31)), s = t === 0 ? ZA : WA, a = rS(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (l, u) => a >>> 5 * (5 - u) & 31);
  return `${r}1${i.concat(c).map((l) => GA[l]).join("")}`;
}
function bc(e, t) {
  const n = Tw(t), r = e === "bitcoin";
  return n === "p2pkh" ? Gu(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? Gu(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? Ta(e, 0, t.slice(2)) : Ta(e, 1, t.slice(2));
}
function iS(e) {
  const t = qu(e), n = rt(new Uint8Array([0, 20]), t);
  return [
    rt(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    rt(new Uint8Array([169, 20]), qu(n), new Uint8Array([135]))
  ];
}
function Pa(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function bo(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function Pw(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function Ow(e) {
  return J(ae(ae(e.raw)).slice().reverse());
}
function oS(e, t) {
  const n = t.transaction, r = q("bitcoin.network", { network: e.network }), i = [
    q("bitcoin.title"),
    ...t.highFeeWarning ? [q("bitcoin.highFeeWarning"), ""] : [],
    r,
    q("bitcoin.networkWarning"),
    q("bitcoin.input", { txid: J(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    q("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: bo(BigInt(e.prevout.amountSats)) }),
    q("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(q("bitcoin.output", {
      index: s + 1,
      address: bc(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: bo(o.amountSats),
      role: q(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    q("bitcoin.fee", { sats: t.feeSats.toString(), btc: bo(t.feeSats), rate: Pw(t.feeSats, t.signedVsize) }),
    q("bitcoin.vsize", { vsize: t.signedVsize }),
    q(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    q("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: bo(t.netLeavingSats) }),
    q("bitcoin.unsignedTxid", { txid: Ow(n) }),
    q("bitcoin.outputKey", { key: J(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function sS(e, t) {
  const n = Fu(e, "signingContext");
  ju(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== Mu && ee("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !VA.includes(n.network)) && ee("bitcoin signing_context network is invalid");
  const r = To(n.unsignedTransaction, "unsignedTransaction");
  r.length > Bw * 2 && ee("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = Fu(n.prevout, "signingContext.prevout");
  ju(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = YA(i.amountSats, "prevout.amountSats", 1, Number(mc)), s = To(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || ee("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== Ku && ee("unsupported Bitcoin digest algorithm");
  const a = To(n.digest, "signingContext.digest", 64);
  return a !== t && ee("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: Mu,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: Ku,
    digest: a
  };
}
function Rw(e, t, n) {
  const r = sS(e, t), i = JA(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (m) => Number.parseInt(m, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const m = To(n, "signing public key", 66);
    a = Uint8Array.from(m.match(/../g), (E) => Number.parseInt(E, 16)), a[0] !== 2 && a[0] !== 3 && ee("signing public key must be compressed secp256k1");
    const S = Tx(m);
    Pa(s, S) || ee("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const m of i.outputs)
      iS(a).some((S) => Pa(S, m.scriptPubKey)) && ee("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((m, S) => Pa(m.scriptPubKey, o) ? [S] : []);
  c.length > 1 && ee("transaction may contain at most one same-key P2TR return output");
  const l = i.outputs.reduce((m, S) => m + S.amountSats, 0n), u = BigInt(r.prevout.amountSats) - l;
  u <= 0n && ee("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, f = Math.ceil(d / 4);
  u > 10000n * BigInt(f) && ee("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const h = J(eS(i, BigInt(r.prevout.amountSats), o));
  h !== r.digest && ee("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const y = c.reduce((m, S) => m + i.outputs[S].amountSats, 0n), w = u > 100n * BigInt(f) || u * 100n > BigInt(r.prevout.amountSats) * 2n, p = BigInt(r.prevout.amountSats) - y;
  return {
    digest: h,
    display: oS(r, {
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
      spendingAddress: bc(r.network, o),
      inputTxid: J(i.prevoutHashLe.slice().reverse()),
      inputVout: i.prevoutIndex,
      inputAmountSats: BigInt(r.prevout.amountSats),
      outputs: i.outputs.map((m, S) => ({
        address: bc(r.network, m.scriptPubKey),
        amountSats: m.amountSats,
        sameKey: c.includes(S)
      })),
      feeSats: u,
      feeRate: Pw(u, f),
      signedVsize: f,
      netLeavingSats: p,
      highFeeWarning: w,
      sequence: i.sequence,
      signalsRbf: i.sequence === 4294967293,
      locktime: i.locktime,
      unsignedTxid: Ow(i),
      ...n !== void 0 ? { internalKeyXOnly: n.slice(2).toLowerCase() } : {},
      outputKeyXOnly: J(s),
      unsignedTransaction: r.unsignedTransaction,
      prevoutScriptPubKey: r.prevout.scriptPubKey
    },
    transaction: i,
    outputKeyXOnly: s
  };
}
const Wu = `avault-agent-operation:v1
`;
function br(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function Zu(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function Oa(e, t) {
  const n = Zu(e), r = Zu(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function Po(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : Pr(e);
}
function Pr(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Pr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Pr(t[n])}`).join(",")}}`;
}
const aS = Rk([
  "function approve(address spender,uint256 amount)",
  // A common extension, not an EIP-20 method: the amount is added to the current allowance.
  "function increaseAllowance(address spender,uint256 addedValue)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]), cS = {
  approve: "ERC-20/ERC-721 approve",
  increaseAllowance: "ERC-20 increaseAllowance (extension)",
  transfer: "ERC-20 transfer",
  transferFrom: "ERC-20/ERC-721 transferFrom",
  permit: "ERC-20 permit",
  setApprovalForAll: "ERC-721 setApprovalForAll",
  safeTransferFrom: "ERC-721 safeTransferFrom",
  safeTransferFromWithData: "ERC-721 safeTransferFrom"
}, lS = new Map(
  aS.map((e) => {
    const t = e.name === "safeTransferFrom" && e.inputs.length === 4 ? "safeTransferFromWithData" : e.name;
    return [UE(e), { call: t, item: e }];
  })
);
function dS(e) {
  return `${e.name}(${e.inputs.map((t) => t.type).join(",")})`;
}
function uS(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e.toLowerCase();
}
const fS = /* @__PURE__ */ new Set([
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
]), hS = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function Ra(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function Cw(e) {
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
function pS(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function yS(e) {
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
function wS(e) {
  if (e.length < 10) return null;
  const t = lS.get(e.slice(0, 10));
  if (!t) return null;
  let n;
  try {
    if (n = jE(t.item.inputs, `0x${e.slice(10)}`), Kl(t.item.inputs, n).toLowerCase() !== `0x${e.slice(10)}`) return null;
  } catch {
    return null;
  }
  return {
    call: t.call,
    signature: dS(t.item),
    arguments: t.item.inputs.map((r, i) => ({
      name: r.name ?? `arg${i}`,
      type: r.type,
      value: Po(n[i])
    }))
  };
}
function gS(e, t, n) {
  const r = Cw(e), i = uS(e.data), o = (c) => (t[c] === void 0 ? 0n : t[c]).toString(), s = e.to === void 0 || e.to === null || e.to === "" ? null : String(e.to), a = s === null ? null : wS(i);
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
function mS(e) {
  const t = [q("evm.title", { chainId: e.chainId })];
  if (e.blindSigning && t.push(q("sign.blindNotice")), t.push(
    q("evm.type", { type: e.type }),
    e.to === null ? q("evm.contractCreation") : q("evm.to", { to: e.to }),
    q("evm.value", { value: e.value }),
    q("evm.nonce", { value: e.nonce }),
    q("evm.gas", { value: e.gas })
  ), e.gasPrice !== void 0 && t.push(q("evm.gasPrice", { value: e.gasPrice })), e.maxFeePerGas !== void 0 && t.push(q("evm.maxFeePerGas", { value: e.maxFeePerGas })), e.maxPriorityFeePerGas !== void 0 && t.push(q("evm.maxPriorityFeePerGas", { value: e.maxPriorityFeePerGas })), e.decoded) {
    t.push(q("evm.call", { call: `${cS[e.decoded.call]} ${e.decoded.signature}` }));
    for (const n of e.decoded.arguments) t.push(`  ${n.name} (${n.type}): ${n.value}`);
  }
  return t.push(
    e.selector === null ? q("evm.selectorNone") : q("evm.selector", { selector: e.selector }),
    e.calldata === "0x" ? q("evm.calldataNone") : q("evm.calldata", { bytes: e.calldataBytes, calldata: e.calldata })
  ), t.join(`
`);
}
function bS(e) {
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
      Ra(i, fS, "EVM transaction"), pS(e, i), Cw(i);
      const o = yS(i), s = BA(o), a = Oa(e.digest, St(s)), c = gS(i, o, s);
      if (jA(s) !== c.type) throw new Error("EVM transaction type does not match its serialization");
      return {
        digest: a,
        challenge: Ye(a),
        display: mS(c),
        evm: c
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = br(e.typedData);
      Ra(i, hS, "EIP-712 typed data");
      const o = br(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = Oa(e.digest, zA(i));
      return {
        digest: s,
        challenge: Ye(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${Po(o.chainId)}`,
          `domain.verifyingContract: ${Po(o.verifyingContract)}`,
          `domain: ${Pr(o)}`,
          `types: ${Pr(br(i.types))}`,
          `primaryType: ${Po(i.primaryType)}`,
          `message: ${Pr(br(i.message))}`
        ].join(`
`),
        typedData: i
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith(Wu) || e.canonicalPreimage.slice(Wu.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = Oa(e.digest, j1(ae(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: Ye(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = Rw(e, e.digest);
      return {
        digest: i.digest,
        challenge: Ye(i.digest),
        display: i.display
      };
    }
    default:
      throw new Error("unsupported signing context");
  }
}
function Oo(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return;
  const t = e.messageHex;
  if (typeof t == "string")
    try {
      Oh(t);
    } catch {
      throw new A("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit");
    }
}
function Js(e) {
  if (Oo(e), Vr(e), !e || typeof e != "object" || Array.isArray(e)) throw new A("invalid_payload", "Solana signing context must be an object");
  const t = e;
  if (t.kind !== "solana-transaction-v1" || Object.keys(t).some((n) => n !== "kind" && n !== "messageHex") || typeof t.messageHex != "string" || t.messageHex.length === 0 || t.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(t.messageHex))
    throw new A("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias");
  return { kind: "solana-transaction-v1", messageHex: t.messageHex };
}
function vS(e, t, n) {
  if (n.kind !== "keypair" || !n.publicKey) throw new Error("protected signing requires a keypair protected record");
  const r = jr(n.curve);
  if (e === ki || t.kind === "solana-transaction-v1" || r === "ed25519") {
    if (e !== ki || t.kind !== "solana-transaction-v1" || r !== "ed25519")
      throw new A("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together");
    Js(t);
  }
}
const Lw = "11111111111111111111111111111111", Hw = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", xS = "SysvarRecentB1ockHashes11111111111111111111", kS = 2, ES = 4, AS = 3, SS = 12;
function Zt(e) {
  return { decoded: null, undecodedReason: e };
}
function Uw(e, t) {
  let n = 0n;
  for (let r = 7; r >= 0; r -= 1) n = n << 8n | BigInt(e[t + r]);
  return n.toString();
}
function Zl(e) {
  const t = [];
  for (const n of e) {
    if (n.source !== "static") return null;
    t.push(n.address);
  }
  return t;
}
function _S(e, t) {
  const n = t.length >= 4 ? (t[0] | t[1] << 8 | t[2] << 16 | t[3] << 24) >>> 0 : -1;
  return n === kS && t.length === 12 ? IS(e, t) : n === ES && t.length === 4 ? BS(e) : Zt("unsupported_instruction");
}
function IS(e, t) {
  if (e.length !== 2) return Zt("unsupported_instruction");
  const n = Zl(e);
  if (!n) return Zt("unresolved_account");
  const [r, i] = n;
  return { decoded: { kind: "system-transfer", source: r, destination: i, lamports: Uw(t, 4) }, undecodedReason: null };
}
function BS(e) {
  if (e.length !== 3) return Zt("unsupported_instruction");
  const t = Zl(e);
  if (!t) return Zt("unresolved_account");
  const [n, r, i] = t;
  return r !== xS ? Zt("unsupported_instruction") : { decoded: { kind: "system-advance-nonce", nonceAccount: n, recentBlockhashesSysvar: r, nonceAuthority: i }, undecodedReason: null };
}
function $S(e, t) {
  const n = t.length === 9 && t[0] === AS && e.length === 3, r = t.length === 10 && t[0] === SS && e.length === 4;
  if (!n && !r) return Zt("unsupported_instruction");
  const i = Zl(e);
  if (!i) return Zt("unresolved_account");
  const o = Uw(t, 1);
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
function TS(e, t, n) {
  return e === Lw ? _S(t, n) : e === Hw ? $S(t, n) : Zt("unsupported_program");
}
const PS = 32, Ca = 512, ni = 256, Yu = 8, Nw = 3, Dw = /* @__PURE__ */ new Map([
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
]), zw = /* @__PURE__ */ new Set(["1", "10", "8453", "42161", "11155111", "11155420", "84532", "421614"]);
function Mw(e) {
  return Dw.has(e) ? [] : ["review.note.unknownChain"];
}
function Kw(e) {
  const t = Dw.get(e);
  return t === void 0 ? e : `${e} · ${t}`;
}
function vs(e) {
  return typeof e == "object" && e !== null && !Array.isArray(e);
}
function Fw(e) {
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
    const n = Fw(t);
    return n === null ? JSON.stringify(t) ?? String(t) : n.toString();
  }
  return typeof t == "string" ? t : JSON.stringify(t) ?? String(t);
}
class Xu extends Error {
}
function xs(e, t, n, r, i, o) {
  if (i > PS) {
    o.omitted += 1;
    return;
  }
  const s = e[t];
  if (s !== void 0) {
    if (!Object.hasOwn(e, t) || !Array.isArray(s) || n === null || n === void 0) throw new Xu(r);
    const a = Object(n), c = new Set(s.map((l) => l.name));
    for (const l of s) xs(e, l.type, a[l.name], r ? `${r}.${l.name}` : l.name, i + 1, o);
    if (typeof n == "object")
      for (const l of Object.keys(n)) c.has(l) || o.uncovered.push(r ? `${r}.${l}` : l);
    return;
  }
  if (t !== "bytes" && t !== "string" && t.endsWith("]")) {
    if (!Array.isArray(n)) throw new Xu(r);
    const a = t.slice(0, t.lastIndexOf("["));
    n.length === 0 && o.covered.push({ path: r, type: t, value: "[]" }), n.forEach((c, l) => xs(e, a, c, `${r}[${l}]`, i + 1, o));
    return;
  }
  o.covered.push({ path: r, type: t, value: Bn(t, n) });
}
function OS(e, t) {
  const n = /* @__PURE__ */ new Set(), r = (i) => {
    const o = /^\w*/.exec(i)[0];
    if (!(n.has(o) || !e[o])) {
      n.add(o);
      for (const s of e[o]) r(s.type);
    }
  };
  return r(t), n;
}
const jw = [["token", "address"], ["amount", "uint160"], ["expiration", "uint48"], ["nonce", "uint48"]], Vw = [["token", "address"], ["amount", "uint256"]], RS = { primaryType: "Permit", types: { Permit: [["owner", "address"], ["spender", "address"], ["value", "uint256"], ["nonce", "uint256"], ["deadline", "uint256"]] } }, CS = { primaryType: "PermitSingle", types: { PermitSingle: [["details", "PermitDetails"], ["spender", "address"], ["sigDeadline", "uint256"]], PermitDetails: jw } }, LS = { primaryType: "PermitBatch", types: { PermitBatch: [["details", "PermitDetails[]"], ["spender", "address"], ["sigDeadline", "uint256"]], PermitDetails: jw } }, HS = {
  primaryType: "PermitTransferFrom",
  types: { PermitTransferFrom: [["permitted", "TokenPermissions"], ["spender", "address"], ["nonce", "uint256"], ["deadline", "uint256"]], TokenPermissions: Vw }
}, US = {
  primaryType: "PermitBatchTransferFrom",
  types: { PermitBatchTransferFrom: [["permitted", "TokenPermissions[]"], ["spender", "address"], ["nonce", "uint256"], ["deadline", "uint256"]], TokenPermissions: Vw }
};
function ri(e, t, n) {
  if (t !== n.primaryType) return !1;
  const r = OS(e, t), i = Object.keys(n.types);
  return r.size !== i.length || !i.every((o) => r.has(o)) ? !1 : i.every((o) => {
    const s = e[o], a = n.types[o];
    return Array.isArray(s) && s.length === a.length && s.every((c, l) => c.name === a[l][0] && c.type === a[l][1]);
  });
}
const Ju = (1n << 256n) - 1n, NS = (1n << 160n) - 1n;
function La(e, t, n, r, i) {
  const o = Fw(t), s = o === n;
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
function Qu(e) {
  const t = e.filter((o) => o.isMax), n = e.filter((o) => !o.isMax), r = n.slice(0, Math.max(0, Nw - t.length)), i = n.length - r.length;
  return {
    rows: [
      ...[...t, ...r].flatMap((o) => o.rows()),
      ...i > 0 ? [{ label: "review.field.moreTokens", value: "", notes: [{ key: "review.note.moreEntriesInDetails", count: i }] }] : []
    ],
    maxima: t.length
  };
}
function ef(e, t, n, r) {
  return t.maxima <= Nw ? [e, ...t.rows, r] : [
    e,
    { label: "review.field.maxEntries", value: String(t.maxima), notes: [{ key: "review.note.ofEntries", count: n }] },
    r,
    ...t.rows
  ];
}
function DS(e, t, n) {
  const r = ["review.warning.tokenAuthorization"];
  if (ri(e, t, RS)) {
    const s = La("review.field.permitAmount", n.value, Ju, "review.value.unlimited");
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
  const i = ri(e, t, CS);
  if (i || ri(e, t, LS)) {
    const s = i ? [n.details] : Array.isArray(n.details) ? n.details : [], a = Qu(s.map((c, l) => {
      const u = vs(c) ? c : {}, d = La("review.field.permitTokenAmount", u.amount, NS, "review.value.unlimited", l + 1);
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
      summary: ef(
        { label: "review.field.spender", value: Hn(n.spender), elide: !0 },
        a,
        s.length,
        Ha("review.field.signatureDeadline", n.sigDeadline, "review.note.signatureDeadline")
      ),
      identity: []
    };
  }
  const o = ri(e, t, HS);
  if (o || ri(e, t, US)) {
    const s = o ? [n.permitted] : Array.isArray(n.permitted) ? n.permitted : [], a = Qu(s.map((c, l) => {
      const u = vs(c) ? c : {}, d = La("review.field.permitTokenAmount", u.amount, Ju, "review.value.maximumOneTime", l + 1);
      return {
        isMax: d.isMax,
        rows: () => [d.field, { label: "review.field.permitToken", index: l + 1, value: Hn(u.token), elide: !0 }]
      };
    }));
    return {
      kind: "review.kind.permit2Transfer",
      warnings: a.maxima > 0 ? ["review.warning.oneTimeTransfer", "review.warning.maximumOneTimeTransfer"] : ["review.warning.oneTimeTransfer"],
      summary: ef(
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
function qw(e) {
  return e.length <= Ca ? { name: e } : { name: `${e.slice(0, Ca / 2)} … ${e.slice(-Ca / 4)}`, notes: ["review.note.pathShortened"] };
}
function Ua(e) {
  const { name: t, notes: n } = qw(`${e.path} (${e.type})`);
  return { label: "review.field.typedField", name: t, value: e.value, ...n ? { notes: n } : {} };
}
function zS(e, t) {
  const n = e, r = vs(n.domain) ? n.domain : {}, i = n.types, o = {
    EIP712Domain: Ew({ domain: r }),
    ...i
  }, s = zs(t.publicKey).eth;
  if (!s) throw new Error("EIP-712 review requires a secp256k1 signing key");
  const a = { covered: [], uncovered: [], omitted: 0 };
  xs(o, "EIP712Domain", r, "domain", 0, a);
  const c = a.covered, l = a.uncovered, u = new Set(o.EIP712Domain.map((U) => U.name)), d = (U, H) => {
    if (!Object.hasOwn(r, U)) return [];
    const B = u.has(U), D = o.EIP712Domain.find((x) => x.name === U), C = B && D ? Bn(D.type, r[U]) : Hn(r[U]);
    return [{
      label: H,
      value: U === "chainId" ? Kw(C) : C,
      notes: [...U === "chainId" ? Mw(C) : [], ...B ? [] : ["review.note.notInTypedHash"]]
    }];
  }, f = n.primaryType !== "EIP712Domain", h = vs(n.message) ? n.message : {}, y = { covered: [], uncovered: l, omitted: 0 };
  f ? xs(o, n.primaryType, n.message, "", 0, y) : n.message !== void 0 && l.push("message");
  const w = y.covered, p = a.omitted + y.omitted;
  let m = null;
  try {
    m = f ? DS(o, n.primaryType, h) : null;
  } catch {
    m = null;
  }
  const S = w.slice(0, Yu).map((U) => U.type === "address" ? { ...Ua(U), elide: !0 } : Ua(U)), E = Math.max(0, w.length - Yu) + p;
  E > 0 && S.push({ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInstructionsInDetails", count: E }] });
  const O = (U, H = 0) => {
    const B = Math.max(0, U.length - ni) + H;
    return [
      ...U.slice(0, ni).map(Ua),
      ...B > 0 ? [{ label: "review.field.moreFields", value: "", notes: [{ key: "review.note.moreInRawData", count: B }] }] : []
    ];
  }, I = JSON.stringify(n, null, 2), R = [
    { title: "review.group.typedDomain", fields: O(c, a.omitted) },
    ...f ? [{ title: "review.group.typedMessage", fields: O(w, y.omitted) }] : [],
    ...l.length > 0 ? [{
      title: "review.group.notInTypedHash",
      fields: [
        ...l.slice(0, ni).map((U) => {
          const H = qw(U);
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
const tf = 3, nf = 3, MS = 3;
function Gw(e) {
  return e === Lw ? ["review.note.systemProgram"] : e === Hw ? ["review.note.tokenProgram"] : [];
}
function Qs(e) {
  return e.length / 2;
}
function Ww(e) {
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
function KS(e) {
  return e.kind === "spl-transfer-checked" ? "TransferChecked" : "Transfer";
}
function rf(e) {
  return {
    label: "review.field.undecodedInstruction",
    value: e.programId,
    notes: [{ key: "review.note.dataBytes", count: Qs(e.dataHex) }, "review.note.notDecoded"]
  };
}
function FS(e, t) {
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
function of(e) {
  return e === 0 ? [] : [{ label: "review.field.durableNonce", value: "", ...e > 1 ? { notes: [{ key: "review.note.nonceAdvances", count: e }] } : {} }];
}
function jS(e) {
  const t = Ww(e).map((r) => r.label === "review.field.amount" ? r : { ...r, elide: !0 }), n = ["review.field.amount", "review.field.to", "review.field.toTokenAccount", "review.field.mint", "review.field.from", "review.field.fromTokenAccount"];
  return [...t].sort((r, i) => n.indexOf(r.label) - n.indexOf(i.label));
}
const ks = (e) => e.kind !== "system-advance-nonce";
function VS(e) {
  if (e.instructions.length === 1) {
    const [s] = e.instructions;
    return s.decoded ? ks(s.decoded) ? jS(s.decoded) : of(1) : [{ ...rf(s), elide: !0 }];
  }
  let t = 0, n = 0, r = 0;
  const i = e.instructions.flatMap((s) => {
    const a = s.decoded;
    return a && ks(a) ? (t += 1, t <= tf ? FS(a, t) : []) : a ? (n += 1, []) : (r += 1, r <= nf ? [{ ...rf(s), elide: !0 }] : []);
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
    ...o("review.field.moreTransfers", "review.note.moreInDetails", t, tf),
    ...o("review.field.moreUndecoded", "review.note.moreInstructionsInDetails", r, nf),
    ...of(n)
  ];
}
function qS(e) {
  return ks(e) ? [
    { label: "review.field.instruction", value: KS(e) },
    ...Ww(e),
    ...e.kind === "system-transfer" ? [] : [{ label: "review.field.authority", value: e.authority }]
  ] : [
    { label: "review.field.instruction", value: "AdvanceNonceAccount" },
    { label: "review.field.nonceAccount", value: e.nonceAccount },
    { label: "review.field.recentBlockhashesSysvar", value: e.recentBlockhashesSysvar },
    { label: "review.field.nonceAuthority", value: e.nonceAuthority }
  ];
}
function GS(e) {
  return e.map((t) => t.index).join(", ");
}
function WS(e) {
  const t = e.decoded, n = {
    label: "review.field.data",
    value: e.dataHex,
    notes: [{ key: "review.note.bytes", count: Qs(e.dataHex) }, ...t ? [] : ["review.note.notDecoded"]]
  };
  return {
    title: "review.group.instruction",
    index: e.index + 1,
    fields: [
      { label: "review.field.program", value: e.programId, notes: Gw(e.programId) },
      ...t ? qS(t) : [],
      { label: "review.field.accountIndexes", value: GS(e.accounts) },
      n
    ]
  };
}
function ZS(e) {
  const t = e.instructions.length === 1 ? e.instructions[0].decoded : null;
  return {
    kind: !t || !ks(t) ? "review.kind.solanaTransaction" : t.kind === "system-transfer" ? "review.kind.solanaSystemTransfer" : "review.kind.solanaTokenTransfer",
    signer: { label: "review.field.signingKey", value: e.expectedSigner.address, elide: !0 },
    summary: VS(e),
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
            ...Gw(n.address)
          ]
        }))
      },
      ...e.instructions.map(WS),
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
function vc(e) {
  return zw.has(e.chainId) ? { label: "review.field.value", value: e.value, native: "eth" } : { label: "review.field.value", value: e.value, notes: ["review.note.wei"] };
}
function Zw(e) {
  return e.to === null ? { label: "review.field.contract", value: "", notes: ["review.note.contractCreation"] } : { label: "review.field.contract", value: e.to };
}
function Yw(e) {
  return (e.decoded?.arguments ?? []).map((t, n) => ({
    label: "review.field.argument",
    index: n + 1,
    name: `${t.name} (${t.type})`,
    value: t.value
  }));
}
function YS(e) {
  if (e.decoded) {
    const n = { label: "review.field.call", value: e.decoded.signature }, r = Yw(e).map((i) => i.name?.endsWith(" (address)") ? { ...i, elide: !0 } : i);
    return r.length <= MS ? [n, ...r] : [{ ...n, notes: [{ key: "review.note.argumentsInDetails", count: r.length }] }];
  }
  if (e.calldata === "0x") return [];
  const t = [{ key: "review.note.dataBytes", count: e.calldataBytes }, "review.note.notDecoded"];
  return e.to === null || e.selector === null ? [{ label: "review.field.initCode", value: "", notes: t }] : [{ label: "review.field.selector", value: e.selector, notes: t }];
}
const sf = ((1n << 256n) - 1n).toString();
function XS(e) {
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
    const i = r.value === sf;
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
    const i = r.value === sf;
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
function JS(e) {
  const t = { label: "review.field.chainId", value: Kw(e.chainId), notes: Mw(e.chainId) };
  if (e.to !== null && e.calldata === "0x")
    return { kind: "review.kind.evmTransaction", summary: [zw.has(e.chainId) ? { label: "review.field.nativeTransfer", value: e.value, native: "eth", unit: "symbol", to: e.to } : { label: "review.field.nativeTransfer", value: e.value, notes: ["review.note.wei"], to: e.to }, t] };
  const n = XS(e);
  return n ? {
    kind: n.kind,
    ...n.warnings ? { warnings: n.warnings } : {},
    // The native value the transaction carries, as encoded, never assumed to be zero.
    summary: [...n.lead, { label: "review.field.tokenContract", value: e.to, elide: !0 }, vc(e), t]
  } : { kind: "review.kind.evmTransaction", summary: [{ ...Zw(e), elide: !0 }, vc(e), ...YS(e), t] };
}
function QS(e, t) {
  const n = zs(t.publicKey).eth;
  if (!n) throw new Error("EVM review requires a secp256k1 signing key");
  const r = (a, c) => c === void 0 ? [] : [{ label: a, value: c, notes: ["review.note.wei"] }], { kind: i, summary: o, warnings: s } = JS(e);
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
          Zw(e),
          vc(e),
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
          ...Yw(e)
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
function e_(e, t) {
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
function Yl(e, t) {
  try {
    const n = Lp(e.context.release?.derivation), r = t.accounts[n.account][n.chain], i = e.signingContext.kind;
    if (n.chain === "bitcoin" ? e.scheme !== "schnorr-secp256k1-bip341-keypath" || i !== "bitcoin-taproot-keypath-v1" : n.chain === "solana" ? e.scheme !== "ed25519" || i !== "solana-transaction-v1" : e.scheme !== "ecdsa-secp256k1-recoverable" || i !== "evm-transaction" && i !== "eip-712-typed-data") throw new Error("protected HD chain/scheme/context mismatch");
    const o = e.context.release?.signingKey;
    if (!o || typeof o != "object" || Array.isArray(o)) throw new Error("missing protected HD signing key binding");
    const s = o;
    if (Object.keys(s).length !== 3 || typeof s.secret_id != "string" || s.secret_id.length === 0 || s.public_key !== r || e.context.release?.publicKey !== r || typeof s.envelope_sha256 != "string" || !/^[0-9a-f]{64}$/.test(s.envelope_sha256) || s.envelope_sha256 !== O1(e.material.envelope)) throw new Error("protected HD signing identity mismatch");
    return { selection: n, publicKey: r, path: Xn(n.chain, n.account) };
  } catch {
    throw new A("invalid_sign_binding", "protected HD signing requires the exact signed selection/key/envelope binding");
  }
}
async function Xw(e, t) {
  if (e.context.kind !== "hd-seed") throw new Error("protected HD custody requires HD metadata");
  const n = await Ni(e.sealed, e.vmk, e.context);
  let r;
  try {
    return r = Hp(n), P1(r.seed, e.identity.selection, (i) => {
      if (J(e.identity.selection.chain === "solana" ? at.getPublicKey(i) : fe.getPublicKey(i, !0)) !== e.identity.publicKey) throw new A("invalid_sign_binding", "protected HD seed does not match the selected authenticated public key");
      return t(i);
    });
  } finally {
    n.fill(0), es(r);
  }
}
async function t_(e) {
  return Xw(e, (t) => e.payload.kind === "message" ? Zp(t, e.payload.messageHex) : Wp(t, e.payload.digest, e.request.scheme));
}
const n_ = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function di(e) {
  let t = 0;
  for (; t < e.length && e[t] === 0; ) t += 1;
  let n = 0n;
  for (const i of e) n = n << 8n | BigInt(i);
  let r = "";
  for (; n > 0n; )
    r = n_[Number(n % 58n)] + r, n /= 58n;
  return "1".repeat(t) + r;
}
class Jw extends Error {
  code;
  constructor(t, n) {
    super(n), this.name = "SolanaMessageError", this.code = t;
  }
}
const vo = 1232, af = 64, ii = 32, r_ = 32, cf = 128, lf = 256;
function xe(e, t) {
  throw new Jw(e, t);
}
function df(e) {
  let t = "";
  for (const n of e) t += n.toString(16).padStart(2, "0");
  return t;
}
function i_(e) {
  return e < 128 ? 1 : e < 16384 ? 2 : 3;
}
function o_(e, t, n = "compact-u16") {
  let r = 0;
  for (let i = 0; ; i += 1) {
    t + i >= e.length && xe("truncated", `message ends inside ${n}`);
    const o = e[t + i];
    o === 0 && i !== 0 && xe("invalid_compact_u16", `${n} is not minimally encoded`);
    const s = (o & 128) === 0;
    if (i === 2 && !s && xe("invalid_compact_u16", `${n} is longer than three bytes`), r |= (o & 127) << 7 * i, r > 65535 && xe("invalid_compact_u16", `${n} exceeds 65535`), s) return { value: r, length: i + 1 };
  }
}
class s_ {
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
    const { value: n, length: r } = o_(this.bytes, this.offset, t);
    return this.offset += r, n;
  }
}
function Qw(e) {
  if (typeof e == "object" && e !== null) {
    for (const t of Object.values(e)) Qw(t);
    Object.freeze(e);
  }
  return e;
}
function a_(e, t) {
  e instanceof Uint8Array || xe("invalid_input", "message must be a byte array"), (!(t instanceof Uint8Array) || t.length !== ii) && xe("invalid_input", "expected public key must be 32 bytes"), e.length > vo - 1 - af && xe("packet_too_large", `message of ${e.length} bytes cannot fit a ${vo}-byte transaction`);
  const n = new Uint8Array(e), r = di(new Uint8Array(t)), i = new s_(n), o = i.u8("message prefix");
  let s = "legacy", a = o;
  if ((o & cf) !== 0) {
    const B = o & ~cf;
    B !== 0 && xe("unsupported_version", `Solana message version ${B} is not supported`), s = "v0", a = i.u8("required signature count");
  }
  const c = i.u8("read-only signed account count"), l = i.u8("read-only unsigned account count"), u = i.compactU16("account key count"), d = i.take(u * ii, "account keys"), f = Array.from({ length: u }, (B, D) => di(d.subarray(D * ii, (D + 1) * ii))), h = di(i.take(r_, "recent blockhash")), y = [];
  for (let B = i.compactU16("instruction count"); B > 0; B -= 1) {
    const D = i.u8("instruction program id index"), C = i.take(i.compactU16("instruction account count"), "instruction account indexes"), x = i.take(i.compactU16("instruction data length"), "instruction data");
    y.push({ programIdIndex: D, accountIndexes: C, data: x });
  }
  const w = [];
  if (s === "v0")
    for (let B = i.compactU16("address table lookup count"); B > 0; B -= 1) {
      const D = i.take(ii, "address table key"), C = i.take(i.compactU16("writable lookup index count"), "writable lookup indexes"), x = i.take(i.compactU16("read-only lookup index count"), "read-only lookup indexes");
      w.push({ accountKey: D, writableIndexes: C, readonlyIndexes: x });
    }
  i.remaining !== 0 && xe("trailing_bytes", `${i.remaining} bytes follow the message`), a + l > u && xe("invalid_header", "header counts more signed and read-only unsigned accounts than the message carries"), c >= a && xe("invalid_header", "header leaves no writable signer to pay the fee");
  let p = 0, m = 0;
  for (const B of w)
    B.writableIndexes.length + B.readonlyIndexes.length === 0 && xe("invalid_address_table_lookup", "an address table lookup loads no account"), p += B.writableIndexes.length, m += B.readonlyIndexes.length;
  const S = u + p + m;
  S > lf && xe("invalid_address_table_lookup", `message addresses ${S} accounts; the limit is ${lf}`);
  for (const B of y) {
    (B.programIdIndex === 0 || B.programIdIndex >= u) && xe("invalid_program_id_index", `instruction program id index ${B.programIdIndex} is not a static non-payer key`);
    for (const D of B.accountIndexes)
      D >= S && xe("invalid_account_index", `instruction account index ${D} is outside the message's ${S} accounts`);
  }
  const E = i_(a) + a * af + n.length;
  E > vo && xe("packet_too_large", `signed transaction would be ${E} bytes; the limit is ${vo}`);
  const O = f.indexOf(r);
  (O === -1 || O >= a) && xe("signer_not_required", "the expected key is not a required signer of this message");
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
    let C = B - u - (D ? 0 : p);
    for (const [x, v] of R.entries()) {
      const b = D ? v.writableIndexes : v.readonlyIndexes;
      if (C < b.length)
        return { source: "lookup", index: B, lookupIndex: x, accountKey: v.accountKey, tableIndex: b[C], writable: D };
      C -= b.length;
    }
    throw new Error("account index was validated against the lookup tables");
  }, H = y.map((B, D) => {
    const C = f[B.programIdIndex], x = Array.from(B.accountIndexes, U);
    return {
      index: D,
      programIdIndex: B.programIdIndex,
      programId: C,
      accounts: x,
      dataHex: df(B.data),
      ...TS(C, x, B.data)
    };
  });
  return Qw({
    version: s,
    messageHex: df(n),
    messageLength: n.length,
    transactionLength: E,
    header: { numRequiredSignatures: a, numReadonlySignedAccounts: c, numReadonlyUnsignedAccounts: l },
    feePayer: f[0],
    expectedSigner: { index: O, address: r, isFeePayer: O === 0 },
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
function xo(e, t) {
  if (typeof e != "string" || e.length === 0) throw new A("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function ui(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new A("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function Xl(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) Xl(t);
    Object.freeze(e);
  }
  return e;
}
function Jl(e, t) {
  if (Oo(e), t && typeof t == "object") {
    const n = t.release;
    Oo(n), n && typeof n == "object" && Oo(n.signingContext);
  }
}
function eg(e) {
  const t = vr(e, "sign request");
  Jl(t.signingContext, t.context), Vr(t);
  const n = vr(structuredClone(t), "sign request");
  ui(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = vr(n.material, "material");
  ui(r, ["name", "envelope"], "material");
  const i = vr(r.envelope, "envelope");
  ui(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = Pl(n.context);
  ui(vr(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = ll(n.scheme);
  } catch {
    throw new A("invalid_payload", "unsupported signing scheme");
  }
  const a = vr(n.signingContext, "signingContext");
  return a.kind === "solana-transaction-v1" && Js(a), Xl({
    material: {
      name: xo(r.name, "material.name"),
      envelope: {
        ciphertext: xo(i.ciphertext, "envelope.ciphertext"),
        nonce: xo(i.nonce, "envelope.nonce"),
        wrap_meta: xo(i.wrap_meta, "envelope.wrap_meta")
      }
    },
    scheme: s,
    signingContext: a,
    context: o
  });
}
function vt() {
  throw new A("invalid_sign_binding", "signing approval is missing or does not match its signed binding; update Avibe and recreate the request");
}
function tg(e, t, n) {
  Jl(e.signingContext, e.context), ms({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && vt();
  const i = t.kind === "message";
  !i && (t.kind !== "digest" || !/^[0-9a-f]{64}$/.test(t.digest)) && vt();
  const o = On(e.material.envelope).recordMetadata, s = o?.kind === "hd-seed" ? Yl(e, o) : void 0;
  if (s && s.publicKey !== n && vt(), ui(r, ["name", "scheme", i ? "messageHex" : "digest", "publicKey", "signingContext", ...s ? ["derivation", "signingKey"] : []], "sign context.release"), i) {
    const a = Js(e.signingContext);
    (t.messageHex !== a.messageHex || r.messageHex !== t.messageHex || e.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(n) || r.publicKey !== n) && vt();
  } else (e.scheme === "ed25519" || e.signingContext.kind === "solana-transaction-v1" || r.digest !== t.digest) && vt();
  (r.name !== e.material.name || r.scheme !== e.scheme || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || ue(r.signingContext) !== ue(e.signingContext)) && vt();
}
function c_(e) {
  return Jl(e.signingContext, e.context), ae(new TextEncoder().encode(Gs(e.context)));
}
function l_(e, t) {
  if (ll(e), e === "ed25519") throw new Error("Ed25519 exact-message signing is reviewed structurally and has no prose description");
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === cl ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === Ei ? q("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === Ls ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function d_(e, t) {
  const n = Js(e.signingContext);
  tg(e, { kind: "message", messageHex: n.messageHex }, t);
  let r;
  try {
    r = a_(Fc(n.messageHex), Ye(t));
  } catch (i) {
    throw i instanceof Jw ? new A("invalid_payload", `Solana message cannot be signed (${i.code}): ${i.message}`) : i;
  }
  return r.messageHex !== n.messageHex && vt(), { payload: { kind: "message", messageHex: r.messageHex }, review: ZS(r) };
}
function u_(e, t) {
  const n = e.signingContext;
  n.kind === "solana-transaction-v1" && vt();
  let r = bS(n);
  if (n.kind === "bitcoin-taproot-keypath-v1") {
    if (e.scheme !== Ei)
      throw new A("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (e.scheme === Ei)
      throw new A("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (n.kind !== "avault-agent-operation" && e.scheme !== Ls && e.scheme !== al)
      throw new A("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  let i;
  if (n.kind === "bitcoin-taproot-keypath-v1") {
    const o = Rw(n, r.digest, t);
    r = { digest: o.digest, challenge: r.challenge, display: o.display }, i = o.facts;
  }
  return tg(e, { kind: "digest", digest: r.digest }, t), {
    payload: { kind: "digest", digest: r.digest },
    display: `${l_(e.scheme, t)}
scheme: ${e.scheme}
${r.display}`,
    ...r.evm ? { review: QS(r.evm, { publicKey: t, scheme: e.scheme, digest: r.digest }) } : {},
    ...i ? { review: e_(i, { scheme: e.scheme, digest: r.digest }) } : {},
    ...f_(r.typedData, { publicKey: t, scheme: e.scheme, digest: r.digest })
  };
}
function f_(e, t) {
  if (e === void 0) return {};
  try {
    const n = zS(e, t);
    return xy(JSON.parse(JSON.stringify(n))), { review: n };
  } catch {
    return {};
  }
}
function ng(e) {
  const t = On(e.material.envelope), n = Ds(e.material.name, t.recordMetadata), r = t.recordMetadata?.kind === "hd-seed" ? Yl(e, t.recordMetadata) : void 0, i = r ? {
    name: e.material.name,
    kind: "keypair",
    publicKey: r.publicKey,
    ...r.selection.chain === "solana" ? { curve: "ed25519" } : {}
  } : n;
  vS(e.scheme, e.signingContext, i);
  const o = i.publicKey, s = e.signingContext.kind === "solana-transaction-v1" ? d_(e, o) : u_(e, o);
  if (r) {
    const a = `#${r.selection.account} · ${r.path}${r.selection.chain === "bitcoin" ? " · Taproot" : ""}`;
    if (s.review) {
      const c = [{ label: "review.field.walletAccount", value: a }];
      s.review = { ...s.review, summary: [...s.review.summary, ...c], details: [{ title: "review.group.hdAccount", fields: c }, ...s.review.details] };
    } else if (typeof s.display == "string") {
      const c = zs(r.publicKey).eth;
      (!c || r.selection.chain !== "evm") && vt(), s.display = `${q("review.field.walletAccount")}: ${a}
${q("review.field.signingAddress")}: ${c}

${s.display}`;
    }
  }
  return { unpacked: t, recordContext: n, content: s, ...r ? { hd: r } : {} };
}
function h_(e) {
  const t = eg(e), { unpacked: n, recordContext: r, content: i } = ng(t), o = c_(t);
  return Xl({ request: t, verified: i, unpacked: n, recordContext: r, challenge: [...o], ...n.recordMetadata?.kind === "hd-seed" ? { hd: Yl(t, n.recordMetadata) } : {} });
}
async function rg(e, t, n) {
  const r = eg(e.request), i = ng(r);
  (!e.verified || ue(e.verified.payload) !== ue(i.content.payload)) && vt();
  const o = await ss(n, t);
  return Gn({ context: r.context, rootMetadata: o, expectedPurpose: "sign" }), Ii([r.context]), i.hd && await Xw({ sealed: i.unpacked.sealed, vmk: t, context: i.recordContext, identity: i.hd }, () => {
  }), { request: r, ...i };
}
async function uf(e, t, n) {
  return (await rg(e, t, n)).content;
}
async function ff(e, t, n) {
  const { request: r, content: i, unpacked: o, recordContext: s, hd: a } = await rg(e, t, n);
  return a ? t_({ request: r, sealed: o.sealed, vmk: t, context: s, identity: a, payload: i.payload }) : i.payload.kind === "message" ? mx(o.sealed, t, s, i.payload.messageHex) : gx(o.sealed, t, s, i.payload.digest, r.scheme);
}
function ig(e, t = e.label) {
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
function p_(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: oe(t) } : {}
  };
}
function xc(e, t) {
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
function y_(e) {
  const t = xc(e, "details");
  if (!Array.isArray(t.rows)) throw new A("invalid_payload", "details must contain rows");
  const n = [];
  for (const [r, i] of t.rows.entries()) {
    const o = xc(i, `details.rows[${r}]`), s = o.variant;
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
function w_(e) {
  try {
    return xy(e);
  } catch (t) {
    throw new A("invalid_payload", t instanceof Error ? t.message : "signing review is malformed");
  }
}
function g_(e) {
  const t = xc(e, "authorization prompt");
  if (t.challenge !== void 0 && (typeof t.challenge != "string" || t.challenge.length === 0))
    throw new A("invalid_payload", "prompt.challenge must be a non-empty string");
  if (t.reviewSession !== void 0 && typeof t.reviewSession != "string")
    throw new A("invalid_payload", "prompt.reviewSession must be a string");
  const n = t.challenge === void 0 ? void 0 : be(t.challenge);
  return {
    title: Wn(t.title, "prompt.title"),
    subtitle: Wn(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Wn(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: y_(t.details) } : {},
    ...t.review !== void 0 ? { review: w_(t.review) } : {},
    ...t.reviewSession !== void 0 ? { reviewSession: t.reviewSession } : {},
    ...n ? { challenge: n } : {},
    label: Wn(t.label, "prompt.label")
  };
}
const hf = 320, pf = 220, m_ = 6e4, b_ = 1e3;
function v_(e, t = {}) {
  if (e.uiShowPending) return { ok: !1, code: "sandbox_not_visible", detail: "ui show is still pending" };
  if (!e.documentVisible) return { ok: !1, code: "sandbox_not_visible", detail: "document is not visible" };
  if ((t.requireFocus ?? !0) && !e.documentFocused)
    return { ok: !1, code: "sandbox_not_visible", detail: "document is not focused" };
  if (e.frameWidth < hf || e.frameHeight < pf)
    return { ok: !1, code: "sandbox_not_visible", detail: "sandbox frame is too small" };
  if (!e.visibleByIntersectionObserver || e.intersectionRatio < 0.99)
    return { ok: !1, code: "sandbox_not_visible", detail: "sandbox frame is not fully visible" };
  const n = [];
  if (e.embedded) {
    const r = e.parent;
    r ? (r.ageMs > m_ && n.push("parent frame visibility is stale"), (r.frameWidth < hf || r.frameHeight < pf) && n.push("parent frame is too small"), (!r.visibleByIntersectionObserver || r.intersectionRatio < 0.99) && n.push("parent frame is not fully visible"), (r.opacity < 0.99 || !r.pointerEvents) && n.push("parent frame is visually occluded")) : n.push("parent frame visibility is not attested");
  }
  return n.length > 0 ? { ok: !0, warnings: n } : { ok: !0 };
}
function yf(e) {
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
function x_(e) {
  if (typeof e == "boolean") return e;
  if (typeof e == "string")
    return e.toLowerCase() !== "none";
}
function k_(e) {
  if (!e) return;
  const t = yf(e.value);
  if (!t) return;
  const n = yf(t.frame) ?? t, r = Un(n.frameWidth) ?? Un(n.width), i = Un(n.frameHeight) ?? Un(n.height), o = Un(n.intersectionRatio), s = Na(n.visibleByIntersectionObserver) ?? Na(n.isVisible) ?? Na(n.visible), a = Un(n.opacity), c = x_(n.pointerEvents), l = xr(t.sampledAt) ?? xr(t.measuredAt) ?? xr(t.timestamp) ?? xr(n.sampledAt) ?? xr(n.measuredAt) ?? xr(n.timestamp);
  if (r === void 0 || i === void 0 || o === void 0 || s === void 0 || a === void 0 || c === void 0 || l === void 0)
    return;
  const u = Date.now();
  if (!(l > u + b_))
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
function og(e) {
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
    parent: k_(e.parentSurface?.())
  }), c = (y) => {
    const w = a(), p = v_(w, { requireFocus: y });
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
function sg(e) {
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
async function E_(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await hl(t, e.vmk, n);
    return { envelope: pl(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function A_(e) {
  const t = jr(e.curve), n = wx(t);
  let r = n.privateKey;
  try {
    const i = {
      name: e.name,
      kind: "keypair",
      publicKey: n.publicKey,
      ...t === "ed25519" ? { curve: t } : {}
    }, o = await hl(r, e.vmk, i);
    return {
      envelope: pl(o, e.wrapMeta, i),
      publicKey: n.publicKey,
      addresses: t === "ed25519" ? { solana: bx(n.publicKey) } : zs(n.publicKey)
    };
  } finally {
    r?.fill(0), r = void 0;
  }
}
function Ql(e) {
  return (e?.kind ?? "static") === "static";
}
function S_(e, t) {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: Pl(n.context)
  };
}
function ag(e) {
  const t = e[0]?.context.display;
  if (!t) throw new A("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new A("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = $u(e[0].context), r = wf(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new A("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if ($u(s.context) !== n)
      throw new A("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (wf(s.context) !== r)
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
function wf(e) {
  if (!e.grantId) throw new A("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new A("invalid_context", "agent delivery context is missing agent key");
  return ue({ agent: e.agent, grantId: e.grantId });
}
async function __(e) {
  if (e.items.length === 0) throw new A("invalid_payload", "approveRelease requires at least one item");
  const t = ag(e.items), n = await ss(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    Gn({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  Ii(r, e.now);
  const i = await j2(r);
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
    if (!Ql(l)) throw new A("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await yx(
        c,
        e.vmk,
        F2(a.context),
        Ds(a.material.name, l),
        await K2(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await Bi(r, o), { blindBoxes: s };
}
const gf = "vault-signing-policy-downgrade", I_ = `avibe:vault:signing-policy-downgrade:v1
`, Sr = 65536, B_ = /^[A-Za-z0-9_-]{1,80}$/, mf = ["eth", "btc_legacy", "btc_segwit", "btc_taproot", "solana"];
function Q(e) {
  throw new A("policy_context_invalid", e);
}
function vn(e, t, n) {
  (e === null || typeof e != "object" || Array.isArray(e) || Object.getPrototypeOf(e) !== Object.prototype && Object.getPrototypeOf(e) !== null) && Q(`${n} must be an object`);
  const r = e;
  return (Object.keys(r).length !== t.length || !t.every((i) => Object.hasOwn(r, i))) && Q(`${n} has missing or unknown fields`), r;
}
function kc(e, t) {
  return (typeof e != "string" || e.length === 0) && Q(`${t} must be a nonempty string`), e;
}
function Da(e, t) {
  return (typeof e != "string" || !B_.test(e)) && Q(`${t} is not a valid ID`), e;
}
function xn(e, t, n) {
  (typeof e != "string" || e.length > 4 * Math.ceil(n / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e)) && Q("noncanonical policy base64");
  const r = be(e);
  return (r.length < t || r.length > n || oe(r) !== e) && Q("policy base64 length or padding is invalid"), r;
}
const $_ = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function T_(e) {
  let t = 0n;
  for (const i of e) {
    const o = $_.indexOf(i);
    o < 0 && Q("invalid Base58 address"), t = t * 58n + BigInt(o);
  }
  const n = [];
  for (; t > 0n; )
    n.push(Number(t & 255n)), t >>= 8n;
  const r = /^1*/.exec(e)[0].length;
  return Uint8Array.from([...new Array(r).fill(0), ...n.reverse()]);
}
const bf = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
function vf(e, t, n) {
  (!e.startsWith(`bc1${bf[t]}`) || e.length !== (n === 20 ? 42 : 62)) && Q("invalid mainnet witness address");
  const r = [...e.slice(4, -6)].map((c) => {
    const l = bf.indexOf(c);
    return l < 0 && Q("invalid Bech32 address character"), l;
  });
  let i = 0, o = 0;
  const s = [];
  for (const c of r)
    i = (i << 5 | c) & 65535, o += 5, o >= 8 && (o -= 8, s.push(i >>> o & 255));
  (o >= 5 || (i & (1 << o) - 1) !== 0 || s.length !== n) && Q("noncanonical witness address padding");
  const a = Uint8Array.from(s);
  return oc("bc", t, a) !== e && Q("invalid witness address checksum"), a;
}
function P_(e, t) {
  if (e === null) return null;
  const n = kc(e, `addresses.${t}`);
  if (n.length > 128 && Q("policy address is too long"), t === "eth")
    (!/^0x[0-9a-fA-F]{40}$/.test(n) || `0x${Qp(n.slice(2))}` !== n) && Q("noncanonical EIP-55 address");
  else if (t === "btc_segwit") vf(n, 0, 20);
  else if (t === "btc_taproot") vf(n, 1, 32);
  else {
    const r = T_(n);
    t === "solana" ? (r.length !== 32 || di(r) !== n) && Q("noncanonical Solana address") : (r.length !== 25 || r[0] !== 0 || Xp(r.slice(0, 21)) !== n) && Q("invalid mainnet P2PKH address");
  }
  return n;
}
function O_(e) {
  return I_ + ue(e);
}
function cg(e) {
  return ae(new TextEncoder().encode(O_(e)));
}
function $n(e, t = Date.now()) {
  const n = Date.parse(e.expiresAt) - t;
  if (Number.isFinite(n) || Q("invalid policy expiry"), n <= 0) throw new A("policy_context_expired", "policy context has expired", !0);
  if (n > 15e4) throw new A("policy_context_clock_skew", "check this device's clock and retry", !0);
  return n;
}
function lg(e, t, n = Date.now()) {
  try {
    const r = JSON.stringify(e);
    (r === void 0 || r.length > Sr) && Q("policy context exceeds its size bound"), Vr(e);
    const i = vn(e, ["v", "purpose", "challengeId", "nonce", "expiresAt", "rpId", "origin", "target", "change", "factors"], "context");
    (i.v !== 1 || i.purpose !== gf) && Q("unsupported policy context version or purpose"), (i.origin !== t.origin || i.rpId !== t.hostname) && Q("policy origin or RP does not match this sandbox");
    const o = kc(i.expiresAt, "expiresAt"), s = Date.parse(o);
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(o) || !Number.isFinite(s) || new Date(s).toISOString() !== o) && Q("policy expiry must be an exact UTC millisecond date"), xn(i.nonce, 32, 32);
    const a = vn(i.target, ["secretId", "name", "protection", "signerKind", "account", "accountName", "addresses", "identitySha256"], "target");
    a.protection !== "standard" && a.protection !== "protected" && Q("invalid protection tier"), a.signerKind !== "local" && a.signerKind !== "hd-seed" && Q("unsupported signer kind"), (typeof a.identitySha256 != "string" || !/^[0-9a-f]{64}$/.test(a.identitySha256)) && Q("invalid identity digest");
    const c = vn(a.addresses, mf, "addresses"), l = Object.fromEntries(mf.map((w) => [w, P_(c[w], w)]));
    if (a.signerKind === "hd-seed")
      (a.protection !== "standard" || typeof a.account != "number" || !Number.isSafeInteger(a.account) || a.account < 0 || a.account > 19) && Q("invalid shared HD account"), a.accountName !== null && (typeof a.accountName != "string" || [...a.accountName].length < 1 || [...a.accountName].length > 80) && Q("invalid HD account name"), (l.eth === null || l.btc_taproot === null || l.solana === null || l.btc_legacy !== null || l.btc_segwit !== null) && Q("invalid shared HD address set");
    else {
      (a.account !== null || a.accountName !== null) && Q("ordinary keys cannot carry an HD account");
      const w = l.eth !== null && l.btc_legacy !== null && l.btc_segwit !== null && l.btc_taproot !== null && l.solana === null, p = l.solana !== null && l.eth === null && l.btc_legacy === null && l.btc_segwit === null && l.btc_taproot === null;
      !w && !p && Q("invalid ordinary key address set");
    }
    const u = vn(i.change, ["field", "from", "to", "revision"], "change");
    (u.field !== "always_ask" || u.from !== !0 || u.to !== !1 || typeof u.revision != "string" || !/^(?:legacy|[0-9a-f]{32})$/.test(u.revision)) && Q("only true-to-false always_ask changes are supported"), (!Array.isArray(i.factors) || i.factors.length === 0) && Q("policy factors must be nonempty");
    const d = /* @__PURE__ */ new Set();
    let f = "";
    const h = i.factors.map((w) => {
      const p = vn(w, ["factorId", "credentialId"], "factor"), m = Da(p.factorId, "factorId");
      xn(p.credentialId, 1, 1023);
      const S = p.credentialId;
      return (m <= f || d.has(S)) && Q("policy factors must have unique credentials and sorted unique IDs"), f = m, d.add(S), { factorId: m, credentialId: S };
    }), y = {
      v: 1,
      purpose: gf,
      challengeId: Da(i.challengeId, "challengeId"),
      nonce: i.nonce,
      expiresAt: o,
      rpId: i.rpId,
      origin: i.origin,
      target: {
        secretId: Da(a.secretId, "secretId"),
        name: kc(a.name, "name"),
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
function R_(e, t) {
  return lg(vn(e, ["context"], "payload").context, t);
}
function C_(e) {
  const t = $n(e), n = Math.min(12e4, Math.floor(t));
  if (n <= 0) throw new A("policy_context_expired", "policy context has expired", !0);
  return {
    challenge: new Uint8Array(cg(e)).buffer,
    rpId: e.rpId,
    userVerification: "required",
    timeout: n,
    allowCredentials: e.factors.map((r) => ({ type: "public-key", id: new Uint8Array(xn(r.credentialId, 1, 1023)).buffer }))
  };
}
function xf(e) {
  return oe(e).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function Ec(e, t) {
  try {
    const n = vn(e, ["id", "rawId", "type", "response"], "assertion"), r = xn(n.rawId, 1, 1023);
    (n.type !== "public-key" || n.id !== xf(r) || !t.factors.some((l) => l.credentialId === n.rawId)) && Q("assertion does not identify a frozen factor");
    const i = vn(n.response, ["clientDataJSON", "authenticatorData", "signature", "userHandle"], "assertion.response"), o = xn(i.clientDataJSON, 1, Sr), s = JSON.parse(new TextDecoder("utf-8", { fatal: !0 }).decode(o));
    (s.type !== "webauthn.get" || s.challenge !== xf(cg(t)) || s.origin !== t.origin || s.crossOrigin !== void 0 && s.crossOrigin !== !1) && Q("assertion client data does not bind this policy context");
    const a = xn(i.authenticatorData, 37, Sr), c = ae(new TextEncoder().encode(t.rpId));
    return ((a[32] & 5) !== 5 || !a.slice(0, 32).every((l, u) => l === c[u])) && Q("assertion RP or UP/UV flags are invalid"), xn(i.signature, 1, Sr), i.userHandle !== null && xn(i.userHandle, 0, Sr), $n(t), { id: n.id, rawId: n.rawId, type: "public-key", response: { ...i } };
  } catch (n) {
    throw n instanceof A && n.code !== "policy_context_invalid" ? n : new A("authorization_result_invalid", "invalid policy assertion");
  }
}
async function L_(e, t) {
  if (t.aborted) throw t.reason;
  const n = await navigator.credentials.get({ publicKey: C_(e), signal: t });
  if (t.aborted) throw t.reason;
  if (!n) throw new Error("passkey-cancelled");
  return Ec(py(n), e);
}
function za(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new A("invalid_payload", "reveal material must be an object");
  return e;
}
function ko(e) {
  if (typeof e != "string" || e.length === 0) throw new A("invalid_payload", "reveal material requires nonempty strings");
  return e;
}
function dg(e) {
  return e && typeof e == "object" && (Object.values(e).forEach(dg), Object.freeze(e)), e;
}
function H_(e) {
  const t = { ciphertext: e.ciphertext, nonce: e.nonce, wrap_meta: e.wrap_meta };
  return Vr(t), J(ae(new TextEncoder().encode(ue(t))));
}
function Ro(e) {
  ms({ context: e.context, expectedPurpose: "reveal", secret: { name: e.material.name, kind: "static" } });
  const t = e.context.release, n = t?.envelopeHash;
  if (!t || t.name !== e.material.name || !n || typeof n != "object" || Array.isArray(n))
    throw new A("invalid_reveal_binding", "reveal approval does not bind this envelope");
  const r = n;
  if (Object.keys(r).length !== 2 || r.alg !== "sha256" || typeof r.digest != "string" || !/^[0-9a-f]{64}$/.test(r.digest) || r.digest !== H_(e.material.envelope))
    throw new A("invalid_reveal_binding", "reveal approval does not bind this envelope");
}
function U_(e) {
  Vr(e);
  const t = za(structuredClone(e)), n = za(t.material), r = za(n.envelope), i = dg({
    material: { name: ko(n.name), envelope: {
      ciphertext: ko(r.ciphertext),
      nonce: ko(r.nonce),
      wrap_meta: ko(r.wrap_meta)
    } },
    context: Pl(t.context)
  });
  return Ro(i), i;
}
function ug(e) {
  const t = ts(e);
  if (t.v !== 1 || !Array.isArray(t.copies) || t.copies.length === 0 || ["record_meta", "dek_nonce", "wrapped_dek"].some((n) => Object.hasOwn(t, n)) || t.scheme !== void 0 && t.scheme !== "machine-aesgcm-v1") throw new Error("protected HD requires an existing base/root wrap");
  for (const n of t.copies) {
    const r = ct(n);
    if (r.kind !== "passkey" || r.kdf !== "webauthn-prf-hkdf-sha256" || r.credential_id !== void 0 && (typeof r.credential_id != "string" || r.credential_id.length === 0)) throw new Error("invalid protected HD passkey copy");
    Vn(r.prf_salt, [32]), Vn(r.nonce, [12]), Vn(r.wrapped, [48]);
  }
  return e;
}
function kf(e) {
  const t = ts(e);
  for (const n of ["scheme", "record_meta", "dek_nonce", "wrapped_dek"]) delete t[n];
  return ue(t);
}
function fg(e, t, n) {
  const r = ct(e);
  _t(r, ["envelope", "accounts", "expectedAccount0"]);
  const i = ct(r.envelope);
  if (_t(i, ["ciphertext", "nonce", "wrap_meta"]), typeof i.ciphertext != "string" || typeof i.nonce != "string" || typeof i.wrap_meta != "string") throw new Error("invalid protected HD envelope");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) throw new Error("invalid protected HD name");
  const o = i, s = On(o);
  if (s.recordMetadata?.kind !== "hd-seed" || kf(o.wrap_meta) !== kf(n)) throw new Error("protected HD result root mismatch");
  const a = Rs({ kind: "hd-seed", profile: Qo, accounts: r.accounts });
  if (ue(a) !== ue(s.recordMetadata)) throw new Error("protected HD result table mismatch");
  const c = ct(r.expectedAccount0);
  _t(c, ["eth", "btc_legacy", "btc_segwit", "btc_taproot", "solana"]);
  const l = sl(a.accounts[0]);
  if (ue(c) !== ue(l)) throw new Error("protected HD result account0 mismatch");
  return { envelope: { ...o }, accounts: a.accounts, expectedAccount0: l };
}
async function N_(e) {
  e.assertCurrent(), ug(e.wrapMeta);
  const t = Up(e.words, e.passphrase);
  let n, r, i;
  try {
    const o = ic(t.seed);
    e.assertCurrent();
    const s = { kind: "hd-seed", profile: Qo, accounts: o }, a = Ds(e.name, s);
    n = B1(t);
    const c = await hl(n, e.vmk, a);
    e.assertCurrent();
    const u = { envelope: pl(c, e.wrapMeta, a), accounts: o, expectedAccount0: sl(o[0]) };
    r = await Ni(c, e.vmk, a), e.assertCurrent(), i = Hp(r);
    const d = (h, y) => h.length === y.length && h.every((w, p) => w === y[p]);
    if (!d(i.entropy, t.entropy) || !d(i.seed, t.seed) || i.passphraseRequired !== t.passphraseRequired || ue(ic(i.seed)) !== ue(o)) throw new Error("protected HD creation reopen mismatch");
    const f = fg(u, e.name, e.wrapMeta);
    return e.assertCurrent(), f;
  } finally {
    n?.fill(0), r?.fill(0), es(i), es(t);
  }
}
const hg = 3e5;
function pg(e) {
  try {
    const t = ct(e);
    if (_t(t, ["name", "mode", "wrapMeta"]), typeof t.name != "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t.name) || t.mode !== "create" && t.mode !== "import") throw new Error("invalid protected HD name/mode");
    return { name: t.name, mode: t.mode, wrapMeta: ug(t.wrapMeta) };
  } catch {
    throw new A("invalid_payload", "sealHdWallet requires only name, create/import mode and an existing base root");
  }
}
function rr(e) {
  const t = e.deadlineAt - Date.now();
  if (!Number.isSafeInteger(e.deadlineAt) || t <= 0 || t > hg) throw new A("authorization_window_timeout", "protected HD window expired", !0);
  return t;
}
function D_(e) {
  const t = ct(e);
  if (_t(t, ["kind", "name", "mode", "wrapMeta", "deadlineAt"]), t.kind !== "protected-hd-wallet" || typeof t.deadlineAt != "number") throw new A("invalid_payload", "invalid protected HD window request");
  const r = { ...pg({ name: t.name, mode: t.mode, wrapMeta: t.wrapMeta }), kind: "protected-hd-wallet", deadlineAt: t.deadlineAt };
  return rr(r), Object.freeze(r);
}
function Es(e, t) {
  try {
    const n = ct(e);
    if (_t(n, ["kind", "envelope", "accounts", "expectedAccount0"]), n.kind !== "sealed-hd-wallet") throw new Error("invalid result kind");
    return rr(t), { kind: "sealed-hd-wallet", ...fg({ envelope: n.envelope, accounts: n.accounts, expectedAccount0: n.expectedAccount0 }, t.name, t.wrapMeta) };
  } catch (n) {
    throw n instanceof A ? n : new A("authorization_result_invalid", "protected HD result is invalid");
  }
}
async function z_(e, t, n) {
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
      const w = await js(y, Pt(), r.signal);
      d = w.prfOutput, f = w.prfSalt, s(), h = await Mp(e.wrapMeta, { kind: "passkey", prfOutput: d, prfSalt: f }), s();
      const p = await N_({ name: e.name, words: u.words, passphrase: u.passphrase, vmk: h, wrapMeta: e.wrapMeta, assertCurrent: s });
      if (s(), ue(p.accounts) !== ue(u.reviewedAccounts)) throw new A("authorization_result_invalid", "protected HD reviewed account table changed");
      a = Es({ kind: "sealed-hd-wallet", ...p }, e);
    } finally {
      d?.fill(0), f?.fill(0), h?.fill(0), y.forEach((w) => w.prfSalt.fill(0)), u.words = "", u.passphrase = "", u.reviewedAccounts = [];
    }
  })(), c);
  try {
    if (s(), await n(e, r.signal, l), c && await c, s(), !a) throw new A("authorization_result_invalid", "protected HD wallet was not sealed");
    return Es(a, e);
  } catch (u) {
    throw r.abort(u), c && await c.catch(() => {
    }), u;
  } finally {
    t.removeEventListener("abort", o);
  }
}
const M_ = [12, 15, 18, 21, 24], K_ = new Set(Os);
function F_(e) {
  const t = ol(e).split(" ").filter(Boolean);
  if (t.length === 0) return { key: "hd.phraseEmpty" };
  const n = t.findIndex((r) => !K_.has(r));
  return n >= 0 ? { key: "hd.phraseUnknown", params: { position: n + 1 } } : M_.includes(t.length) ? A1(t.join(" "), Os) ? null : { key: "hd.phraseChecksum" } : { key: "hd.phraseCount", params: { count: t.length } };
}
function j_(e) {
  const t = new Uint32Array(1);
  return crypto.getRandomValues(t), t[0] % e;
}
function V_(e, t = j_) {
  const n = /* @__PURE__ */ new Set();
  for (; n.size < 3; ) n.add(1 + t(e.length));
  return [...n].sort((r, i) => r - i).map((r) => {
    const i = e[r - 1], o = [...new Set(e.filter((a) => a !== i))], s = [i];
    for (; s.length < 3 && o.length > 0; ) s.push(o.splice(t(o.length), 1)[0]);
    for (let a = s.length - 1; a > 0; a -= 1) {
      const c = t(a + 1);
      [s[a], s[c]] = [s[c], s[a]];
    }
    return { position: r, options: s, answer: i };
  });
}
function kn(e, t, n) {
  const r = document.createElement(e);
  return r.className = `${t} dynamic`, n !== void 0 && Z(r, n), r;
}
function Ma(e, t) {
  const n = kn("label", "hd-field"), r = kn("span", "hd-field-label", t), i = document.createElement(e);
  return i.className = e === "textarea" ? "field textarea" : "field", i.setAttribute("autocomplete", "off"), i.setAttribute("autocapitalize", "off"), i.setAttribute("autocorrect", "off"), i.setAttribute("spellcheck", "false"), i instanceof HTMLInputElement && (i.type = "password"), n.append(r, i), { wrap: n, input: i };
}
function q_(e) {
  const t = sl(e), n = kn("div", "hd-addresses"), r = [
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
const G_ = (e, t, n) => new Promise((r, i) => {
  const o = [];
  let s = [], a = "", c = !1, l = 0;
  const u = () => {
    for (const C of o.splice(0)) C();
  }, d = (...C) => (u(), l += 1, Vs(...C)), f = (C) => {
    c || (c = !0, t.removeEventListener("abort", h), u(), s = [], a = "", qs(), C());
  }, h = () => f(() => i(t.reason instanceof Error ? t.reason : new Error("operation-cancelled")));
  if (t.aborted) {
    h();
    return;
  }
  t.addEventListener("abort", h, { once: !0 });
  const y = e.mode === "create" ? 4 : 3, w = (C) => we(`${e.name} · ${C}/${y}`), p = (C, x, v = !1) => {
    const b = l;
    C.addEventListener("click", () => {
      if (!(c || b !== l))
        try {
          x();
        } catch (g) {
          f(() => i(g));
        }
    }, { once: v });
  }, m = () => {
    const C = Le("common.cancel");
    return C.classList.add("secondary"), p(C, () => f(() => i(new Error("operation-cancelled"))), !0), C;
  }, S = (C) => {
    o.push(() => {
      C.value = "";
    });
  }, E = (C) => {
    let x;
    const v = Up(s.join(" "), a);
    try {
      x = ic(v.seed);
    } finally {
      es(v);
    }
    const b = d(
      e.mode === "create" ? "hd.reviewTitleCreate" : "hd.reviewTitleImport",
      w(y),
      e.mode === "create" ? "hd.reviewBodyCreate" : "hd.reviewBodyImport"
    );
    re(b.card, q_(x[0])), re(b.card, kn("p", "setup-status", "hd.passkeyNote"));
    const g = Ar(), k = Le("hd.saveCta"), _ = Le("hd.back");
    _.classList.add("secondary"), p(_, C, !0);
    const $ = m();
    p(k, () => {
      if (k.disabled) return;
      k.disabled = !0, _.disabled = !0, Z(g, "hd.working"), n({ words: s.join(" "), passphrase: a, reviewedAccounts: x }).then(() => f(r), (P) => f(() => i(P)));
    }), re(b.card, g), re(b.card, k), re(b.card, _), re(b.card, $);
  }, O = (C, x, v) => {
    const b = d("hd.passphraseTitle", w(C ? 3 : 2), C ? "hd.passphraseBody" : "hd.importPassphraseHint"), g = Ma("input", "hd.passphrase"), k = C ? Ma("input", "hd.passphraseConfirm") : void 0;
    g.input.value = a, k && (k.input.value = ""), S(g.input), k && S(k.input);
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
    }), re(b.card, g.wrap), k && re(b.card, k.wrap), re(b.card, kn("p", "setup-status", "hd.passphraseNotStored")), re(b.card, _), re(b.card, $), re(b.card, T), re(b.card, m());
  }, I = (C, x) => {
    const v = V_(s), b = /* @__PURE__ */ new Map(), g = d("hd.quizTitle", w(2), "hd.quizBody"), k = Ar();
    k.classList.add("hd-error");
    const _ = /* @__PURE__ */ new Map(), $ = Le("hd.next");
    $.disabled = !0;
    for (const P of v) {
      const L = kn("div", "hd-quiz");
      L.append(kn("span", "hd-field-label", _n("hd.quizPosition", { position: P.position })));
      const N = P.options.map((K) => {
        const z = document.createElement("button");
        return z.type = "button", z.className = "hd-option", z.textContent = K, p(z, () => {
          b.set(P.position, K), N.forEach((M) => {
            M.classList.remove("wrong"), M === z ? M.classList.add("selected") : M.classList.remove("selected");
          }), Z(k, we("")), $.disabled = b.size !== v.length;
        }), z;
      });
      L.append(...N), _.set(P.position, N), o.push(() => {
        L.textContent = "", P.answer = "", P.options.fill(""), b.clear(), _.clear();
      }), re(g.card, L);
    }
    const T = Le("hd.back");
    T.classList.add("secondary"), p(T, C, !0), p($, () => {
      const P = v.find((L) => b.get(L.position) !== L.answer);
      if (P) {
        _.get(P.position)?.forEach((L) => {
          L.classList.contains("selected") && L.classList.add("wrong");
        }), Z(k, _n("hd.quizWrong", { position: P.position }));
        return;
      }
      x();
    }), re(g.card, k), re(g.card, $), re(g.card, T), re(g.card, m());
  }, R = () => {
    const C = d("hd.wordsTitle", w(1), "hd.wordsBody"), x = kn("ol", "hd-words");
    s.forEach((b, g) => {
      const k = document.createElement("li"), _ = document.createElement("span");
      _.className = "hd-word-index", _.textContent = String(g + 1);
      const $ = document.createElement("span");
      $.textContent = b, k.append(_, $), x.append(k);
    }), o.push(() => {
      x.textContent = "";
    });
    const v = Le("hd.wordsWritten");
    p(v, B, !0), re(C.card, x), re(C.card, v), re(C.card, m());
  }, U = () => {
    const C = d("hd.importTitle", w(1), "hd.importBody"), x = Ma("textarea", "hd.importWords");
    x.input.value = s.join(" "), S(x.input);
    const v = Ar();
    v.classList.add("hd-error");
    const b = Le("hd.next");
    p(b, () => {
      const g = F_(x.input.value);
      if (g) {
        Z(v, _n(g.key, g.params));
        return;
      }
      s = ol(x.input.value).split(" "), x.input.value = "", D();
    }), re(C.card, x.wrap), re(C.card, v), re(C.card, b), re(C.card, m());
  };
  function H() {
    O(!0, B, () => E(H));
  }
  function B() {
    I(R, H);
  }
  function D() {
    O(!1, U, () => E(D));
  }
  try {
    if (e.mode === "create") {
      const C = new Uint8Array(16);
      try {
        crypto.getRandomValues(C), s = $1(C).split(" ");
      } finally {
        C.fill(0);
      }
      R();
    } else
      U();
  } catch (C) {
    f(() => i(C));
  }
}), yg = `avibe-vault-setup:v1:${de.buildHash}:`, W_ = `avibe-vault-setup-result:${de.buildHash}:`, Z_ = `avibe-vault-setup-error:${de.buildHash}:`, Y_ = 300 * 1e3, X_ = 300 * 1e3, J_ = 30 * 1e3, Q_ = 8 * 1e3, Te = new Og();
let Ef = !1;
function e3(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function wg(e) {
  if (!e3(e))
    throw new A("invalid_payload", "appearance must include locale and theme");
  return e;
}
function t3(e) {
  return e == null ? null : wg(e);
}
function ea(e) {
  const t = s2(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && d2();
}
function gg() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: a2(), theme: e };
}
function Tt(e) {
  if (typeof e != "object" || e === null)
    throw new A("invalid_payload", "request payload must be an object");
  return e;
}
function mg(e, t) {
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
function bg(e, t) {
  if (typeof e != "object" || e === null) throw new A("invalid_payload", `${t} must be an object`);
  return e;
}
function n3(e) {
  const t = bg(e, "envelope");
  return {
    ciphertext: Ue(t.ciphertext, "envelope.ciphertext"),
    nonce: Ue(t.nonce, "envelope.nonce"),
    wrap_meta: Ue(t.wrap_meta, "envelope.wrap_meta")
  };
}
function r3(e) {
  const t = bg(e, "material");
  return { name: Ue(t.name, "material.name"), envelope: n3(t.envelope) };
}
function i3(e) {
  const t = e == null ? {} : Tt(e);
  return { wrapMeta: mg(t.wrapMeta, "wrapMeta") };
}
function vg(e) {
  const t = Tt(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new A("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: Ue(t.vaultUserHandle, "vaultUserHandle"),
    displayName: Ue(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: vl(t.policy) } : {}
  };
}
function o3(e) {
  const t = Tt(e);
  return {
    wrapMeta: Ue(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: vl(t.policy) } : {}
  };
}
function s3(e) {
  const t = Tt(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new A("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => S_(n, r3)) };
}
function a3(e) {
  const t = Tt(e);
  if (t.operation !== "delete_secret") throw new A("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: Ue(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: Ue(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function xg() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function Af(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function c3(e) {
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
function l3(e) {
  for (const t of e)
    if (t.aborted) return cr(t);
  return new Error("operation-superseded");
}
function ed(e) {
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
async function kg(e) {
  const t = ed(e.abortSignals);
  try {
    await Promise.race([
      t2(Ns(e.wrapMeta), Pt(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? l3(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => c3(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function ta(e) {
  await or(async (t) => {
    const n = async (i) => {
      const o = ed([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await td(
          {
            prompt: Sf(e),
            wrapMeta: e.wrapMeta,
            passkey: e.passkey
          },
          o.signal,
          i
        );
        if (e.passkey === "unlock") {
          if (s.kind !== "unlock") throw new Error("authorization unlock result is missing");
          await _y({
            wrapMeta: e.wrapMeta,
            currentRpId: Pt(),
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
    await _i(ig(Sf(e), "common.continue"), t, void 0, n);
  });
}
function Sf(e) {
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
function d3(e) {
  return "kind" in e ? e : {
    ...e,
    prompt: p_(e.prompt)
  };
}
function u3(e) {
  const t = Tt(e);
  if (!t) throw new A("invalid_payload", "authorization request must be an object");
  if (t.kind === "protected-hd-wallet") return D_(t);
  if (t.kind === "signing-policy-downgrade") {
    if (Object.keys(t).length !== 2 || !Object.hasOwn(t, "context"))
      throw new A("invalid_payload", "policy authorization request has unknown fields");
    return {
      kind: "signing-policy-downgrade",
      context: lg(t.context, {
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
    prompt: g_(t.prompt),
    wrapMeta: Ue(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function f3(e) {
  return $f("authorize", e, gg());
}
function h3(e, t) {
  const n = Tt(e);
  if (!n) throw new A("authorization_result_invalid", "authorization result is invalid");
  if ("kind" in t) {
    if (t.kind === "protected-hd-wallet") return Es(n, t);
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
function td(e, t, n) {
  Zn(t);
  const r = "kind" in e && e.kind === "protected-hd-wallet" ? e : void 0;
  r && rr(r);
  const i = n ?? xg(), o = `avibe-vault-authorization-${i}`;
  return new Promise((s, a) => {
    let c = null, l = !1, u = null, d = null, f = null, h = null;
    const y = () => E(() => a(cr(t))), w = () => E(() => a(new A("authorization_cancelled", "requesting sandbox was unloaded", !0))), p = () => new A("authorization_window_closed", "authorization window was closed", !0), m = (O) => {
      c = O, d = setInterval(() => {
        !O.closed || f || (f = setTimeout(() => E(() => a(p())), 2500));
      }, 500);
    }, S = (O) => {
      if (O.origin !== window.location.origin) return;
      const I = O.data;
      if (!(!I || I.id !== i || !kr(I.build)) && (!c && n && I.type === "authorization-ready" && O.source && (h && clearTimeout(h), h = null, m(O.source)), O.source === c))
        if (I.type === "authorization-ready")
          try {
            c?.postMessage(
              {
                type: "authorization-request",
                build: de,
                id: i,
                request: d3(e)
              },
              window.location.origin
            );
          } catch (R) {
            E(() => a(R));
          }
        else if (I.type === "authorization-approved")
          try {
            const R = h3(I.result, e);
            E(() => s(R));
          } catch (R) {
            E(() => a(R));
          }
        else I.type === "authorization-error" && E(() => a(new A(I.code, I.message, !!I.retryable)));
    }, E = (O) => {
      if (!l) {
        l = !0, u && clearTimeout(u), d && clearInterval(d), f && clearTimeout(f), h && clearTimeout(h), window.removeEventListener("message", S), window.removeEventListener("pagehide", w), t?.removeEventListener("abort", y);
        try {
          c && !c.closed && c.close();
        } catch {
        }
        O();
      }
    };
    if (window.addEventListener("message", S), window.addEventListener("pagehide", w, { once: !0 }), n)
      h = setTimeout(() => E(() => a(p())), J_);
    else {
      const O = window.open(f3(i), o, "popup,width=520,height=760");
      if (!O) {
        E(() => a(new A("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      O.focus(), m(O);
    }
    if (u = setTimeout(
      () => E(() => a(new A("authorization_window_timeout", "authorization window timed out", !0))),
      r ? rr(r) : X_
    ), t) {
      if (t.aborted) {
        y();
        return;
      }
      t.addEventListener("abort", y, { once: !0 });
    }
  });
}
function p3(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? _n("context.minutes", { count: e / 60 }) : _n("context.seconds", { count: e });
}
function Ci(e, t, n = "access") {
  const r = [];
  e.sessionLabel && r.push({ label: "context.session", value: we(e.sessionLabel) }), e.command && r.push({ label: "context.command", value: we(e.command), variant: "command" }), e.egress && r.push({ label: n === "sign" ? "context.signReturns" : "context.egress", value: we(e.egress) });
  const i = [
    ...e.source?.env?.map((o) => we(`${q(n === "sign" ? "context.sourceRequestedName" : "context.sourceEnv")}: ${o}`)) ?? [],
    ...e.source?.tags?.map((o) => we(`${q("context.sourceTag")}: ${o}`)) ?? [],
    ...e.source?.skills?.map((o) => we(`${q("context.sourceSkill")}: ${o}`)) ?? []
  ];
  return i.length > 0 && r.push({ label: "context.source", values: i, variant: "chips" }), t?.agentFingerprint && r.push({ label: "context.agent", value: we(t.agentFingerprint), variant: "mono" }), t?.grantId && r.push({ label: "context.grant", value: we(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && r.push({ label: "context.agentAccess", value: p3(e.grantTtlSeconds) }), r.push({
    label: "context.secrets",
    values: e.secrets.map(
      (o) => we(`${o.name} · ${q(o.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: r };
}
function y3(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function w3(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function Eg(e, t) {
  return y3(e) ? !0 : w3(e) && lt(t).state === "locked";
}
async function g3(e, t = $e(), n) {
  await Sy({ wrapMeta: e, currentRpId: Pt(), policy: t, abortSignal: n });
}
async function m3(e, t = $e()) {
  await or((n) => g3(e, t, n));
}
async function nd(e) {
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
    throw e.abortSignal ? (t?.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), t?.release()) : lt(e.wrapMeta).state === "unlocked" && ht({ broadcast: !0, reason: "manual-lock" }), n;
  } finally {
    e.onUnlocked || t?.release();
  }
}
async function b3(e, t) {
  if (lt(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await m3(e);
  }
  return await Ks(t, { renewOnSuccess: !0 });
}
async function Ag(e) {
  const t = lt(e.bindRoot ? void 0 : e.wrapMeta).state, n = $e(), r = sg({ tier: e.tier, vaultState: t, policy: n });
  let i = !1, o;
  const s = async () => {
    const c = e.bindRoot ? Ms(e.wrapMeta) : void 0;
    try {
      await nd({
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
      throw !e.bindRoot && i && !u && lt().state === "unlocked" && ht({ broadcast: !0, reason: "manual-lock" }), d;
    }
  };
  try {
    return r.passkey === "unlock" ? (await s(), await a("none", !0)) : await a(r.passkey === "uv" ? "uv" : "none");
  } catch (c) {
    if (!e.bindRoot && r.passkey !== "unlock" && Eg(c, e.wrapMeta))
      return await s(), await a("none", !0);
    throw e.bindRoot && o?.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    o?.release();
  }
}
function Ke(e, t) {
  if (e instanceof A) return e;
  if (gy(e)) return new A("passkey_cancelled", "passkey-cancelled", !0);
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
function v3(e) {
  return oe(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function x3(e) {
  return vg(JSON.parse(new TextDecoder().decode(be(e))));
}
function k3(e, t) {
  return $f("setup", e, gg(), { req: v3(t) });
}
function Ka(e) {
  const t = Tt(e);
  return {
    credentialId: Ue(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function na(e) {
  return `${W_}${e}`;
}
function ra(e) {
  return `${Z_}${e}`;
}
function _f(e) {
  try {
    localStorage.removeItem(na(e)), localStorage.removeItem(ra(e));
  } catch {
  }
}
function E3(e, t) {
  try {
    localStorage.setItem(na(e), JSON.stringify({ build: de, result: t })), localStorage.removeItem(ra(e));
  } catch {
  }
}
function A3(e, t) {
  try {
    localStorage.setItem(
      ra(e),
      JSON.stringify({ build: de, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(na(e));
  } catch {
  }
}
function Sg(e) {
  if (window.self === window.top)
    return Sl({
      rpId: Pt(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = xg(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${yg}${t}`);
  let r = null;
  return _f(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, l = null;
    const u = () => d(() => o(new A("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (w) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), l && clearTimeout(l), window.removeEventListener("visibilitychange", h), window.removeEventListener("focus", h), window.removeEventListener("storage", h), window.removeEventListener("message", y), window.removeEventListener("pagehide", u), n?.close(), _f(t);
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
          const m = Tt(JSON.parse(w));
          if (!kr(m.build)) throw new A("sandbox_build_mismatch");
          const S = Ka(m.result);
          d(() => i(S));
        } catch (m) {
          const S = m instanceof Error ? m.message : "stored setup result is invalid";
          d(() => o(new A("setup_storage_invalid", S)));
        }
        return !0;
      }
      if (p) {
        try {
          const m = Tt(JSON.parse(p));
          if (!kr(m.build)) throw new A("sandbox_build_mismatch");
          d(
            () => o(new A(Ue(m.code, "code"), mg(m.message, "message"), !!m.retryable))
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
      !p || p.id !== t || !kr(p.build) || (p.type === "setup-created" ? d(() => i(Ka(p.result))) : p.type === "setup-error" && d(() => o(new A(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      f() || d(() => o(new A("setup_window_timeout", "setup window timed out", !0)));
    }, Y_), c = setInterval(() => {
      !r?.closed || l || f() || (l = setTimeout(() => {
        f() || d(() => o(new A("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (w) => {
      const p = w.data;
      !p || p.id !== t || !kr(p.build) || (p.type === "setup-created" ? d(() => i(Ka(p.result))) : p.type === "setup-error" && d(() => o(new A(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", h), window.addEventListener("focus", h), window.addEventListener("storage", h), window.addEventListener("message", y), window.addEventListener("pagehide", u, { once: !0 }), r = window.open(k3(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
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
function S3() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function If(e) {
  return S3() && wy(e);
}
async function _g(e, t, n, r, i = $e()) {
  const o = G1();
  let s, a;
  try {
    Zn(r), s = (await js([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, Zn(r), a = q1();
    const l = await Y1(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    Zn(r);
    let u = J1(l, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (u = tx(u, await ex(a, e.rootMetadata, u)), Zn(r));
    const d = ly({
      vmk: a,
      wrapMeta: u,
      freshSetup: !e.existingProtectedVault,
      scopeId: Ux(e.vaultUserHandle),
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
function _3(e, t, n) {
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
          I = Sg(e);
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
        o.disabled = !0, Z(s, "setup.passkeyPrompt"), _g(e, t, I, r, n).then(
          (R) => h(() => a(R)),
          (R) => y(R)
        );
      }, O = () => {
        o.disabled = !0, Z(s, "setup.passkeyPrompt");
        let I;
        try {
          I = Sl({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (R) {
          if (If(R)) {
            S();
            return;
          }
          y(R);
          return;
        }
        I.then(
          (R) => E(R),
          (R) => {
            if (If(R)) {
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
          O();
        }
      });
    });
  });
}
async function I3(e) {
  const t = vg(e);
  try {
    const n = Pt(), r = t.policy ?? $e(), i = window.self !== window.top ? await _3(t, n, r) : await _g(t, n, await Sg(t), void 0, r), o = t.policy ? xl(r) : $e();
    return { ...i, policy: o };
  } catch (n) {
    throw Ke(n, "setup_failed");
  }
}
async function B3(e) {
  const t = o3(e);
  try {
    const n = Pt(), r = t.policy ?? $e(), i = await or(async (s) => {
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
          a = await Sy({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? xl(r) : $e();
    return { ...i, policy: o };
  } catch (n) {
    throw Ke(n, "unlock_failed");
  }
}
async function $3(e) {
  const t = T2(e);
  t.wrapMeta && Al(t.wrapMeta);
  try {
    if (t.kind === "static" && !$e().parentValueSealAllowed)
      throw new A("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await b3(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await E_({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await A_({ name: t.name, curve: t.curve, vmk: n, wrapMeta: r }), establishingVmk: cc() }));
  } catch (n) {
    throw Ke(n, "seal_failed");
  }
}
async function T3(e, t) {
  try {
    const n = pg(e), r = t.takeAuthorizationWindow();
    if (!r) throw new A("invalid_payload", "sealHdWallet requires a parent-opened authorization window");
    const i = Ms(n.wrapMeta), o = { ...n, kind: "protected-hd-wallet", deadlineAt: Date.now() + hg };
    try {
      return await or(async (s) => {
        const a = ed([s, i.signal]);
        try {
          i.assertCurrent();
          const c = await td(o, a.signal, r);
          i.assertCurrent();
          const l = Es(c, o);
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
async function P3(e, t) {
  const n = U_(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = On(n.material.envelope);
    if (!Ql(o)) throw new Error("only static protected records can be revealed as plaintext");
    return ms({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await Ag({
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
        const c = await ss(a, s);
        return Gn({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), Ro(n), ms({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), Ii([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: we(n.material.name),
          body: "reveal.confirmBody",
          details: Ci(n.context.display),
          challenge: await Af(Gs(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const l = await ss(a, s);
        c.assertCurrent(), Gn({ context: n.context, rootMetadata: l, expectedPurpose: "reveal" }), Ro(n), Ii([n.context]);
        const u = await Ni(r, s, Ds(n.material.name, o));
        try {
          c.assertCurrent(), Gn({ context: n.context, rootMetadata: l, expectedPurpose: "reveal" }), Ro(n), await Bi([n.context]), c.assertCurrent(), Gn({ context: n.context, rootMetadata: l, expectedPurpose: "reveal" }), await _2({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: $e().strictApprovals ? async (d) => {
              await kg({
                wrapMeta: a,
                challenge: await Af(`reveal-copy:${n.context.requestId}:${n.material.name}`),
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
async function O3(e, t) {
  try {
    const n = h_(e), { request: r, unpacked: { vmkWrapMeta: i } } = n, o = (s) => {
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
        if (lt().state !== "unlocked") {
          const a = Ms(i);
          try {
            await nd({
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
          const u = await uf(n, a, c);
          return l.assertCurrent(), await ta({
            ...o(u),
            wrapMeta: c,
            passkey: "uv",
            challenge: new Uint8Array(n.challenge),
            abortSignal: l.signal,
            parentSurface: t.latestSurface,
            authorizationWindow: t.takeAuthorizationWindow
          }), l.assertCurrent(), ff(n, a, c);
        }, { renewOnSuccess: !1, expectedWrapMeta: i, beforeSuccess: () => Bi([r.context]) });
      } catch (a) {
        throw s?.lockIfCurrent({ broadcast: !0, reason: "manual-lock" }), a;
      } finally {
        s?.release();
      }
    }
    return await Ag({
      tier: "R3",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: o(n.verified),
      // Shown only after the daemon signature, expiry and replay state are
      // verified with the vault key, from content re-derived at that moment.
      buildPrompt: async (s, a) => ({
        ...o(await uf(n, s, a)),
        challenge: new Uint8Array(n.challenge)
      }),
      operation: (s, a) => ff(n, s, a),
      beforeSuccess: () => Bi([r.context])
    });
  } catch (n) {
    throw Ke(n, "sign_failed");
  }
}
async function R3(e, t) {
  const n = s3(e);
  try {
    const i = On(n.items[0].material.envelope).vmkWrapMeta;
    for (const f of n.items) {
      const h = On(f.material.envelope);
      if (h.vmkWrapMeta !== i) throw new A("invalid_payload", "approveRelease items must share one VMK context");
      if (!Ql(h.recordMetadata)) throw new A("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = ag(n.items), s = lt(i).state, a = $e(), c = sg({ tier: "R2", vaultState: s, policy: a });
    let l = !1;
    const u = async () => {
      await nd({
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
            const O = await __({
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
            return E.assertCurrent(), O;
          },
          {
            renewOnSuccess: c.renewOnSuccess,
            beforeSuccess: () => Bi(n.items.map((m) => m.context), w)
          }
        );
        return y = !0, p;
      } catch (p) {
        throw l && !y && lt().state === "unlocked" && ht({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await u(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (f) {
      if (c.passkey !== "unlock" && Eg(f, i))
        return await u(), await d("none", !0);
      throw f;
    }
  } catch (r) {
    throw Ke(r, "approve_release_failed");
  }
}
async function C3(e, t) {
  let n;
  if (await or(async (r) => {
    $n(e);
    const i = { kind: "signing-policy-downgrade", context: e }, o = async (c) => {
      $n(e);
      const l = await td(i, r, c);
      if (l.kind !== "assertion") throw new A("authorization_result_invalid", "policy assertion is missing");
      n = Ec(l.assertion, e);
    }, s = t.takeAuthorizationWindow();
    if (s) {
      await o(s);
      return;
    }
    $n(e);
    const a = my(e);
    await _i(
      a,
      r,
      (c) => og({
        uiShowPending: ky,
        parentSurface: () => t.latestSurface(),
        visibilityTarget: c,
        requireParentSurface: !0
      }),
      () => o()
    );
  }), !n) throw new A("authorization_result_invalid", "policy assertion is missing");
  return Ec(n, e);
}
async function L3(e, t) {
  try {
    const n = R_(e, {
      origin: window.location.origin,
      hostname: window.location.hostname
    }), r = await C3(n, t);
    return { challengeId: n.challengeId, assertion: r };
  } catch (n) {
    throw Ke(n, "policy_authorization_failed");
  }
}
async function H3(e) {
  const t = a3(e);
  try {
    const n = await n2(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw Ke(n, "delete_authz_failed");
  }
}
function U3() {
  const e = Ac();
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
    f = x3(d);
  } catch {
    l.disabled = !0, Z(u, "setup.requestInvalid");
    return;
  }
  const h = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${yg}${r}`), y = (w) => {
    const p = Ke(w, "setup_create_failed"), m = {
      type: "setup-error",
      build: de,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    A3(r, p), h?.postMessage(m);
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
      w = Sl({
        rpId: Pt(),
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
      E3(r, p), h?.postMessage(m);
      try {
        window.opener?.postMessage(m, window.location.origin);
      } catch {
      }
      Z(u, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(y);
  });
}
function N3() {
  const e = Ac();
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
  const f = setTimeout(() => Z(s, "authorize.waitingLong"), Q_), h = () => {
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
        const C = z_(p, m.signal, G_).then((x) => {
          H = x;
        }).catch((x) => {
          throw gy(x) || x instanceof Error && ["operation-cancelled", "passkey-cancelled"].includes(x.message) ? new A("authorization_cancelled", "protected HD operation cancelled", !0) : x;
        }).finally(() => {
          clearTimeout(D), window.removeEventListener("pagehide", B);
        });
        E(C, () => {
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
      const U = my(p.context);
      E(
        _i(
          U,
          m.signal,
          (H) => og({
            uiShowPending: ky,
            visibilityTarget: H,
            requireParentSurface: !0
          }),
          async () => {
            $n(p.context), R = await L_(p.context, m.signal);
          }
        ),
        () => {
          if (!R) throw new A("authorization_result_invalid", "policy assertion is missing");
          return { kind: "assertion", assertion: R };
        }
      );
      return;
    }
    let O = { kind: "confirmed" };
    const I = async () => {
      if (p.passkey === "none") return;
      if (p.passkey === "uv") {
        if (!p.prompt.challenge) throw new A("invalid_payload", "authorization challenge is missing");
        await kg({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [m.signal]
        });
        return;
      }
      const R = await js(Ns(p.wrapMeta), Pt(), m.signal);
      O = {
        kind: "unlock",
        prfOutput: oe(R.prfOutput),
        prfSalt: oe(R.prfSalt)
      }, R.prfOutput.fill(0);
    };
    E(_i(ig(p.prompt), m.signal, void 0, I), () => O);
  }, w = (p) => {
    if (p.origin !== window.location.origin) return;
    const m = p.data;
    if (!m || m.type !== "authorization-request" || m.id !== r || !kr(m.build)) return;
    const S = a().find((E) => E === p.source);
    if (S) {
      c = S;
      try {
        y(u3(m.request));
      } catch (E) {
        const O = Ke(E, "authorization_request_invalid");
        l({
          type: "authorization-error",
          build: de,
          id: r,
          code: O.code,
          message: O.message,
          retryable: O.retryable
        });
      }
    }
  };
  window.addEventListener("message", w), h(), d = setInterval(h, 500);
}
function D3() {
  if (window.self !== window.top || Ac().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && Z(e, "sandbox.intro");
}
Te.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new A("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== de.buildHash)
    throw new A("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = t3(t.appearance);
  r && ea(r);
  const i = Ef ? $e() : xl(t.policy === void 0 ? void 0 : vl(t.policy));
  return Ef = !0, {
    accepted: !0,
    channel: Nn,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: de,
    policy: i
  };
});
Te.register("set-appearance", (e) => (ea(wg(e)), { accepted: !0 }));
Te.register("status", (e) => {
  const t = i3(e);
  try {
    t.wrapMeta && lt(t.wrapMeta);
    const n = lt(), r = $e();
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
Te.register("setup", I3);
Te.register("unlock", B3);
Te.register("lock", () => ({ ...ht({ broadcast: !0, reason: "manual-lock" }), policy: $e() }));
Te.register("seal", $3);
Te.register("sealHdWallet", T3);
Te.register("reveal", P3);
Te.register("sign", O3);
Te.register("approveRelease", R3);
Te.register("deleteAuthzAssertion", H3);
Te.register("authorizeSigningPolicyDowngrade", L3);
Lx((e) => Te.emit("vault.state", e));
v2((e) => Te.emit(e));
await Rg();
Te.start();
window.addEventListener("pagehide", jx);
U3();
N3();
D3();
window.self !== window.top && document.body.classList.add("embedded");
const Ig = globalThis.crypto, z3 = { webcrypto: Ig }, Bg = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: z3,
  webcrypto: Ig
}, Symbol.toStringTag, { value: "Module" }));
