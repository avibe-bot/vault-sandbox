const zt = "avibe.vault.crypto";
const oe = {
  sandboxVersion: "0.1.0",
  // Resource hashes are the authority; this source-input identity additionally
  // binds ready/handshake and same-release top-level ceremony pairing.
  buildHash: "3b3e8f6b44b083741324e0bb35b4c849568b4462b1666e1eadfbc7769d441e99"
};
class m extends Error {
  code;
  retryable;
  constructor(t, n, r = !1) {
    super(n ?? t), this.code = t, this.retryable = r;
  }
}
function bs(e) {
  let t;
  try {
    t = new URL(e);
  } catch {
    return !1;
  }
  const n = t.hostname.toLowerCase();
  return n === "localhost" || n === "127.0.0.1" || n === "::1" || n === "[::1]" ? t.protocol === "http:" || t.protocol === "https:" : !!(t.protocol === "https:" && (n === "avibe.bot" || n.endsWith(".avibe.bot")));
}
function nd(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return t.channel === zt && t.version === 2 && typeof t.id == "string" && t.id.length > 0 && typeof t.op == "string";
}
const rd = /^[A-Za-z0-9_-]{16,128}$/;
function Ka(e) {
  return typeof e == "object" && e !== null;
}
function id(e) {
  return Ka(e) ? e.channel === zt && e.version === 2 && e.kind === "event" && e.event === "confirm.surface" : !1;
}
class od {
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
        channel: zt,
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
      channel: zt,
      version: 2,
      build: oe,
      capabilities: {
        operations: Array.from(this.handlers.keys())
      }
    });
  }
  async onMessage(t) {
    if (!bs(t.origin)) return;
    if (id(t.data)) {
      if (t.origin === this.pinnedParentOrigin && t.source === this.pinnedSource) {
        const c = t.data.surface ?? t.data.payload;
        c !== void 0 && this.recordParentSurfaceEvent(t.data, c);
      }
      return;
    }
    if (!nd(t.data)) return;
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
    if (n.authorizationWindow !== void 0 && (typeof n.authorizationWindow != "string" || !rd.test(n.authorizationWindow))) {
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
        channel: zt,
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
    if (t.op !== "handshake" || !Ka(t.payload)) return null;
    const r = t.payload.parentOrigin, i = t.payload.nonce;
    return typeof r != "string" || r !== n || !bs(r) || typeof i != "string" || i.length < 16 || i.length > 256 ? null : i;
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
    return { channel: zt, version: 2, id: t, ok: !1, error: { code: n, message: r, retryable: i } };
  }
  reply(t, n) {
    !t || this.pinnedParentOrigin === null || t.postMessage(n, this.pinnedParentOrigin);
  }
  postToParent(t, n) {
    t.postMessage(n, "*");
  }
}
function ro() {
  return new URLSearchParams((window.location.hash ?? "").slice(1));
}
function Da(e, t, n, r = {}) {
  const i = new URL(window.location.href);
  return oe.buildHash !== "dev" && (i.pathname = `/v/${oe.buildHash}/index.html`), i.search = "", i.hash = new URLSearchParams({ mode: e, id: t, ...n, ...r }).toString(), i.toString();
}
function nn(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.buildHash === oe.buildHash && t.sandboxVersion === oe.sandboxVersion;
}
async function sd() {
  if (oe.buildHash === "dev") return;
  const e = new URL(window.location.href);
  if (e.pathname !== `/v/${oe.buildHash}/index.html` || e.search)
    throw new Error("Sandbox release document URL mismatch");
  const t = document.querySelectorAll('link[rel="stylesheet"]');
  if (t.length !== 1 || !t[0].integrity.startsWith("sha256-") || !t[0].href.startsWith(`${e.origin}/v/${oe.buildHash}/assets/`))
    throw new Error("Sandbox release stylesheet is not pinned");
  const n = t[0];
  n.sheet || await new Promise((r, i) => {
    const o = () => a(new Error("Sandbox release stylesheet failed integrity or loading")), s = () => n.sheet ? a() : o(), a = (u) => {
      clearTimeout(c), n.removeEventListener("load", s), n.removeEventListener("error", o), window.removeEventListener("load", s), window.removeEventListener("pagehide", o), u ? i(u) : r();
    }, c = setTimeout(o, 1e4);
    n.addEventListener("load", s, { once: !0 }), n.addEventListener("error", o, { once: !0 }), window.addEventListener("load", s, { once: !0 }), window.addEventListener("pagehide", o, { once: !0 }), (n.sheet || document.readyState === "complete") && s();
  });
}
class je extends Error {
  constructor(t) {
    let n;
    t instanceof Error ? n = t.message : typeof t == "string" ? n = t : n = "", super(n), this.name = this.constructor.name;
  }
}
class We extends je {
}
class Sr extends je {
}
class or extends je {
}
class ad extends je {
}
class cd extends je {
}
class ud extends je {
}
class ld extends je {
}
class dd extends je {
}
class fd extends je {
}
class pd extends je {
}
class io extends je {
}
const hd = {}, ja = yd(globalThis, hd);
function yd(e, t) {
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
async function gd() {
  if (ja !== void 0 && globalThis.crypto !== void 0)
    return globalThis.crypto.subtle;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => td);
    return e.subtle;
  } catch (e) {
    throw new io(e);
  }
}
class oo {
  constructor() {
    Object.defineProperty(this, "_api", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    });
  }
  async _setup() {
    this._api === void 0 && (this._api = await gd());
  }
}
const gt = {
  Base: 0,
  Psk: 1,
  Auth: 2,
  AuthPsk: 3
}, ms = {
  DhkemX25519HkdfSha256: 32
}, Va = {
  HkdfSha256: 1
}, so = {
  Aes128Gcm: 1,
  Aes256Gcm: 2,
  ExportOnly: 65535
}, $r = 8192, wd = 268435456, vs = 32, me = /* @__PURE__ */ new Uint8Array(0), Ze = 0n, Zt = 1n, sr = 2n, bd = /* @__PURE__ */ new Uint8Array([
  75,
  69,
  77,
  0,
  0
]), xs = /* @__PURE__ */ new Uint8Array([
  72,
  80,
  75,
  69,
  45,
  118,
  49
]);
function kr(e) {
  return new Uint8Array(Z(e));
}
function Z(e) {
  return e instanceof ArrayBuffer ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength).slice().buffer : new Uint8Array(e).slice().buffer;
}
class md extends oo {
  constructor() {
    super(), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Va.HkdfSha256
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
    return r.set(xs, 0), r.set(this._suiteId, 7), r.set(t, 7 + this._suiteId.byteLength), r.set(n, 7 + this._suiteId.byteLength + t.byteLength), r;
  }
  buildLabeledInfo(t, n, r) {
    this._checkInit();
    const i = new Uint8Array(9 + this._suiteId.byteLength + t.byteLength + n.byteLength);
    return i.set(new Uint8Array([0, r]), 0), i.set(xs, 2), i.set(this._suiteId, 9), i.set(t, 9 + this._suiteId.byteLength), i.set(n, 9 + this._suiteId.byteLength + t.byteLength), i;
  }
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t);
    if (r.byteLength !== this.hashSize)
      throw new We("The salt length must be the same as the hashSize");
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
    const u = kr(n), l = new Uint8Array(1);
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
class qa extends md {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: Va.HkdfSha256
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
const Sn = (e) => typeof e == "object" && e !== null && typeof e.privateKey == "object" && typeof e.publicKey == "object";
function Cn(e, t) {
  if (t <= 0)
    throw new Error("i2Osp: too small size");
  if (e >= 256 ** t)
    throw new Error("i2Osp: too large integer");
  const n = new Uint8Array(t);
  for (let r = 0; r < t && e; r++)
    n[t - (r + 1)] = e % 256, e = Math.floor(e / 256);
  return n;
}
function ar(e, t) {
  const n = new Uint8Array(e.length + t.length);
  return n.set(e, 0), n.set(t, e.length), n;
}
function Es(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = atob(t), r = new Uint8Array(n.length);
  for (let i = 0; i < n.length; i++)
    r[i] = n.charCodeAt(i);
  return r;
}
async function vd() {
  if (typeof ja < "u" && globalThis.crypto !== void 0)
    return globalThis.crypto;
  try {
    const { webcrypto: e } = await Promise.resolve().then(() => td);
    return e;
  } catch {
    throw new Error("failed to load Crypto");
  }
}
function xd(e, t) {
  if (e.byteLength !== t.byteLength)
    throw new Error("xor: different length inputs");
  const n = new Uint8Array(e.byteLength);
  for (let r = 0; r < e.byteLength; r++)
    n[r] = e[r] ^ t[r];
  return n;
}
const Ed = /* @__PURE__ */ new Uint8Array([
  101,
  97,
  101,
  95,
  112,
  114,
  107
]), Sd = /* @__PURE__ */ new Uint8Array([
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
function kd(e, t, n) {
  const r = new Uint8Array(e.length + t.length + n.length);
  return r.set(e, 0), r.set(t, e.length), r.set(n, e.length + t.length), r;
}
class Ad {
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
    const i = new Uint8Array(bd);
    i.set(Cn(this.id, 2), 3), this._kdf.init(i);
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
    if (n.byteLength > $r)
      throw new We("Too long ikm");
    return await this._prim.deriveKeyPair(n);
  }
  async encap(t) {
    let n;
    t.ekm === void 0 ? n = await this.generateKeyPair() : Sn(t.ekm) ? n = t.ekm : n = await this.deriveKeyPair(t.ekm);
    const r = await this._prim.serializePublicKey(n.publicKey), i = await this._prim.serializePublicKey(t.recipientPublicKey);
    try {
      let o;
      if (t.senderKey === void 0)
        o = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey));
      else {
        const c = Sn(t.senderKey) ? t.senderKey.privateKey : t.senderKey, u = new Uint8Array(await this._prim.dh(n.privateKey, t.recipientPublicKey)), l = new Uint8Array(await this._prim.dh(c, t.recipientPublicKey));
        o = ar(u, l);
      }
      let s;
      if (t.senderKey === void 0)
        s = ar(new Uint8Array(r), new Uint8Array(i));
      else {
        const c = Sn(t.senderKey) ? t.senderKey.publicKey : await this._prim.derivePublicKey(t.senderKey), u = await this._prim.serializePublicKey(c);
        s = kd(new Uint8Array(r), new Uint8Array(i), new Uint8Array(u));
      }
      const a = await this._generateSharedSecret(o, s);
      return {
        enc: r,
        sharedSecret: a
      };
    } catch (o) {
      throw new ad(o);
    }
  }
  async decap(t) {
    const n = Z(t.enc), r = await this._prim.deserializePublicKey(n), i = Sn(t.recipientKey) ? t.recipientKey.privateKey : t.recipientKey, o = Sn(t.recipientKey) ? t.recipientKey.publicKey : await this._prim.derivePublicKey(t.recipientKey), s = await this._prim.serializePublicKey(o);
    try {
      let a;
      if (t.senderPublicKey === void 0)
        a = new Uint8Array(await this._prim.dh(i, r));
      else {
        const u = new Uint8Array(await this._prim.dh(i, r)), l = new Uint8Array(await this._prim.dh(i, t.senderPublicKey));
        a = ar(u, l);
      }
      let c;
      if (t.senderPublicKey === void 0)
        c = ar(new Uint8Array(n), new Uint8Array(s));
      else {
        const u = await this._prim.serializePublicKey(t.senderPublicKey);
        c = new Uint8Array(n.byteLength + s.byteLength + u.byteLength), c.set(new Uint8Array(n), 0), c.set(new Uint8Array(s), n.byteLength), c.set(new Uint8Array(u), n.byteLength + s.byteLength);
      }
      return await this._generateSharedSecret(a, c);
    } catch (a) {
      throw new cd(a);
    }
  }
  async _generateSharedSecret(t, n) {
    const r = this._kdf.buildLabeledIkm(Ed, t), i = this._kdf.buildLabeledInfo(Sd, n, this.secretSize);
    return await this._kdf.extractAndExpand(me, r, i, this.secretSize);
  }
}
const cr = ["deriveBits"], _d = /* @__PURE__ */ new Uint8Array([
  100,
  107,
  112,
  95,
  112,
  114,
  107
]), Id = /* @__PURE__ */ new Uint8Array([115, 107]);
class Xt {
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
      return Promise.reject(new Sr(n));
    }
  }
  async deserializePublicKey(t) {
    try {
      return await this._importRawKey(Z(t), !0);
    } catch (n) {
      throw new or(n);
    }
  }
  serializePrivateKey(t) {
    try {
      return Promise.resolve(t.key.buffer);
    } catch (n) {
      return Promise.reject(new Sr(n));
    }
  }
  async deserializePrivateKey(t) {
    try {
      return await this._importRawKey(Z(t), !1);
    } catch (n) {
      throw new or(n);
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
      throw new or(i);
    }
  }
  async generateKeyPair() {
    try {
      const t = await this._curve.utils.randomSecretKey(), n = new Xt(this._algName, t, "private", cr);
      return { publicKey: await this.derivePublicKey(n), privateKey: n };
    } catch (t) {
      throw new io(t);
    }
  }
  async deriveKeyPair(t) {
    try {
      const n = Z(t), r = await this._hkdf.labeledExtract(me.buffer, _d, new Uint8Array(n)), i = await this._hkdf.labeledExpand(r, Id, me, this._nSk), o = new Xt(this._algName, new Uint8Array(i), "private", cr);
      return {
        privateKey: o,
        publicKey: await this.derivePublicKey(o)
      };
    } catch (n) {
      throw new pd(n);
    }
  }
  derivePublicKey(t) {
    try {
      const n = this._curve.getPublicKey(t.key);
      return Promise.resolve(new Xt(this._algName, n, "public"));
    } catch (n) {
      return Promise.reject(new or(n));
    }
  }
  dh(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t.key, n.key).buffer);
    } catch (r) {
      return Promise.reject(new Sr(r));
    }
  }
  _importRawKey(t, n) {
    return new Promise((r, i) => {
      n && t.byteLength !== this._nPk && i(new Error("Invalid length of the key")), !n && t.byteLength !== this._nSk && i(new Error("Invalid length of the key")), r(new Xt(this._algName, new Uint8Array(t), n ? "public" : "private", n ? [] : cr));
    });
  }
  _importJWK(t, n) {
    return new Promise((r, i) => {
      t.kty !== "OKP" && i(new Error(`Invalid kty: ${t.kty}`)), t.crv !== this._algName && i(new Error(`Invalid crv: ${t.crv}`)), n ? (typeof t.d < "u" && i(new Error("Invalid key: `d` should not be set")), typeof t.x != "string" && i(new Error("Invalid key: `x` not found")), r(new Xt(this._algName, Es(t.x), "public"))) : (typeof t.d != "string" && i(new Error("Invalid key: `d` not found")), r(new Xt(this._algName, Es(t.d), "private", cr)));
    });
  }
}
const Pd = ["encrypt", "decrypt"];
function $d(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function Nn(e, t = "") {
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new Error(`${n}expected integer >0, got ${e}`);
  }
}
function lt(e, t, n = "") {
  const r = $d(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`;
    throw new Error(s + "expected Uint8Array" + a + ", got " + c);
  }
  return e;
}
function Or(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function Od(e, t) {
  lt(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new Error('"digestInto() output" expected to be of length >=' + n);
}
function Td(e) {
  if (typeof e == "bigint") {
    if (!Ar(e))
      throw new Error("positive bigint expected, got " + e);
  } else
    Nn(e);
  return e;
}
function Tr(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
const Ld = /* @__PURE__ */ new Uint32Array([287454020]), Rd = /* @__PURE__ */ new Uint8Array(Ld.buffer);
Rd[0];
function bi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Ve(e, t) {
  return e << 32 - t | e >>> t;
}
const Ga = /* @ts-ignore: to use toHex */ typeof Uint8Array.from([]).toHex == "function" && // @ts-ignore: to use fromHex
typeof Uint8Array.fromHex == "function", Cd = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0")), zd = [
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
function Ud(e) {
  if (lt(e), Ga)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Cd[e[n]];
  return t;
}
const ot = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function Hi(e) {
  if (e >= ot._0 && e <= ot._9)
    return e - ot._0;
  if (e >= ot.A && e <= ot.F)
    return e - (ot.A - 10);
  if (e >= ot.a && e <= ot.f)
    return e - (ot.a - 10);
}
function Hd(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  if (Ga)
    return Uint8Array.fromHex(e);
  const t = e.length, n = t / 2;
  if (t % 2)
    throw new Error("hex string expected, got unpadded hex of length " + t);
  const r = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const s = Hi(e.charCodeAt(o)), a = Hi(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new Error('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Md(e) {
  if (typeof e != "string")
    throw new Error("hex string expected, got " + typeof e);
  let t = Ze;
  for (let n = 0; n < e.length; n++) {
    const r = Hi(e.charCodeAt(n));
    if (r === void 0)
      throw new Error('hex string expected, got non-hex character "' + e[n] + '" at index ' + n);
    t = t << 4n | zd[r];
  }
  return t;
}
function Nd(e) {
  Nn(e, "numberToBigint");
  let t = e, n = Ze, r = 1n;
  for (; t > 0; )
    t % 2 === 1 && (n += r), t = Math.floor(t / 2), r <<= 1n;
  return n;
}
function Ss(e) {
  return Md(Ud(Mi(lt(e)).reverse()));
}
function Fd(e, t) {
  Nn(t), e = Td(e);
  const n = Hd(e.toString(16).padStart(t * 2, "0"));
  if (n.length !== t)
    throw new Error("number too large");
  return n;
}
function Kd(e, t) {
  return Fd(e, t).reverse();
}
function Mi(e) {
  return Uint8Array.from(e);
}
function Ar(e) {
  return typeof e == "bigint" && Ze <= e;
}
function Dd(e, t, n) {
  return Ar(e) && Ar(t) && Ar(n) && t <= e && e < n;
}
function ks(e, t, n, r) {
  if (!Dd(t, n, r))
    throw new Error("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function jd(e, t = {}, n = {}) {
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
async function Vd(e = 32) {
  const t = await vd(), n = new Uint8Array(e);
  return t.getRandomValues(n), n;
}
function qd(e) {
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
function Gd(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new Error("Hash must wrapped by utils.createHasher");
  Nn(e.outputLen), Nn(e.blockLen);
}
function Wd(e, t = {}) {
  const n = (o, s) => e(s).update(o).digest(), r = e(void 0), i = Object.assign(n, {
    outputLen: r.outputLen,
    blockLen: r.blockLen,
    create: (o) => e(o),
    ...t
  });
  return Object.freeze(i);
}
let Wa = class {
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
    }), Gd(t), lt(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), Tr(i);
  }
  update(t) {
    return Or(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    Or(this), lt(t, this.outputLen, "output"), this.finished = !0, this.iHash.digestInto(t), this.oHash.update(t), this.oHash.digestInto(t), this.destroy();
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
const Za = (e, t, n) => new Wa(e, t).update(n).digest();
Za.create = (e, t) => new Wa(e, t);
function Zd(e, t, n) {
  return e & t ^ ~e & n;
}
function Xd(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let Yd = class {
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
    }), this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = bi(this.buffer);
  }
  update(t) {
    Or(this), lt(t);
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
    Or(this), Od(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Tr(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, Nd(this.length * 8), o), this.process(r, 0);
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
const wt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Jd = /* @__PURE__ */ Uint32Array.from([
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
let Qd = class extends Yd {
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
      bt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = bt[d - 15], f = bt[d - 2], w = Ve(h, 7) ^ Ve(h, 18) ^ h >>> 3, g = Ve(f, 17) ^ Ve(f, 19) ^ f >>> 10;
      bt[d] = g + bt[d - 7] + w + bt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = Ve(a, 6) ^ Ve(a, 11) ^ Ve(a, 25), f = l + h + Zd(a, c, u) + Jd[d] + bt[d] | 0, g = (Ve(r, 2) ^ Ve(r, 13) ^ Ve(r, 22)) + Xd(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Tr(bt);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Tr(this.buffer);
  }
}, ef = class extends Qd {
  constructor() {
    super(32), Object.defineProperty(this, "A", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[0] | 0
    }), Object.defineProperty(this, "B", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[1] | 0
    }), Object.defineProperty(this, "C", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[2] | 0
    }), Object.defineProperty(this, "D", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[3] | 0
    }), Object.defineProperty(this, "E", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[4] | 0
    }), Object.defineProperty(this, "F", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[5] | 0
    }), Object.defineProperty(this, "G", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[6] | 0
    }), Object.defineProperty(this, "H", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: wt[7] | 0
    });
  }
};
const tf = /* @__PURE__ */ Wd(
  () => new ef(),
  /* @__PURE__ */ qd(1)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function Xa(e, t) {
  const n = e % t;
  return n >= Ze ? n : t + n;
}
function Le(e, t, n) {
  let r = e;
  for (; t-- > Ze; )
    r *= r, r %= n;
  return r;
}
function nf(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function rf(e) {
  return jd(e, {
    adjustScalarBytes: "function",
    powPminus2: "function"
  }), Object.freeze({ ...e });
}
function of(e) {
  const t = rf(e), { P: n, type: r, adjustScalarBytes: i, powPminus2: o, randomBytes: s } = t, a = r === "x25519";
  if (!a && r !== "x448")
    throw new Error("invalid type");
  const c = s || Vd, u = a ? 255n : 448n, l = a ? 32 : 56, d = a ? 9n : 5n, h = a ? 121665n : 39081n, f = a ? sr ** 254n : sr ** 447n, w = a ? 8n * sr ** 251n - Zt : 4n * sr ** 445n - Zt, g = f + w + Zt, p = (A) => Xa(A, n), y = v(d);
  function v(A) {
    return Kd(p(A), l);
  }
  function _(A) {
    const x = Mi(lt(A, l, "uCoordinate"));
    return a && (x[31] &= 127), p(Ss(x));
  }
  function I(A) {
    return Ss(i(Mi(lt(A, l, "scalar"))));
  }
  function S(A, x) {
    const E = D(_(x), I(A));
    if (E === Ze)
      throw new Error("invalid private or public key received");
    return v(E);
  }
  function O(A) {
    return S(A, y);
  }
  const L = O, R = S;
  function U(A, x, E) {
    const B = p(A * (x - E));
    return x = p(x - B), E = p(E + B), { x_2: x, x_3: E };
  }
  function D(A, x) {
    ks("u", A, Ze, n), ks("scalar", x, f, g);
    const E = x, B = A;
    let $ = Zt, P = Ze, T = A, C = Zt, H = Ze;
    for (let N = u - 1n; N >= Ze; N--) {
      const te = E >> N & Zt;
      H ^= te, { x_2: $, x_3: T } = U(H, $, T), { x_2: P, x_3: C } = U(H, P, C), H = te;
      const ne = $ + P, re = p(ne * ne), Y = $ - P, ye = p(Y * Y), it = re - ye, Tt = T + C, Wt = T - C, xn = p(Wt * ne), En = p(Tt * Y), gs = xn + En, ws = xn - En;
      T = p(gs * gs), C = p(B * p(ws * ws)), $ = p(re * ye), P = p(it * (re + p(h * it)));
    }
    ({ x_2: $, x_3: T } = U(H, $, T)), { x_2: P, x_3: C } = U(H, P, C);
    const q = o(P);
    return p($ * q);
  }
  const z = {
    secretKey: l,
    publicKey: l,
    seed: l
  }, b = async (A) => (A === void 0 && (A = await c(l)), lt(A, z.seed, "seed"), A), k = { randomSecretKey: b };
  return Object.freeze({
    keygen: nf(b, L),
    getSharedSecret: R,
    getPublicKey: L,
    scalarMult: S,
    scalarMultBase: O,
    utils: k,
    GuBytes: y.slice(),
    lengths: z
  });
}
class sf extends oo {
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
    return await this._api.importKey("raw", t, { name: "AES-GCM" }, !0, Pd);
  }
}
class af {
  constructor() {
    Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: so.Aes128Gcm
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
    return new sf(t);
  }
}
class cf extends af {
  constructor() {
    super(...arguments), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: so.Aes256Gcm
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
function As() {
  return new Promise((e, t) => {
    t(new io("Not supported"));
  });
}
const uf = new Uint8Array([115, 101, 99]);
class ao {
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
    return await As();
  }
  async open(t, n) {
    return await As();
  }
  async export(t, n) {
    const r = Z(t);
    if (r.byteLength > $r)
      throw new We("Too long exporter context");
    try {
      return await this._kdf.labeledExpand(this.exporterSecret, uf, new Uint8Array(r), n);
    } catch (i) {
      throw new ud(i);
    }
  }
}
class lf extends ao {
}
class df extends ao {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), this.enc = i;
  }
}
class Ya extends ao {
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
    const n = Cn(t.seq, t.baseNonce.byteLength);
    return xd(t.baseNonce, n).buffer;
  }
  incrementSeq(t) {
    if (t.seq > Number.MAX_SAFE_INTEGER)
      throw new fd("Message limit reached");
    t.seq += 1;
  }
}
var ff = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, pf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, _r;
class Ja {
  constructor() {
    _r.set(this, Promise.resolve());
  }
  async lock() {
    let t;
    const n = new Promise((i) => {
      t = i;
    }), r = ff(this, _r, "f");
    return pf(this, _r, n, "f"), await r, t;
  }
}
_r = /* @__PURE__ */ new WeakMap();
var _s = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, hf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, $n;
class yf extends Ya {
  constructor() {
    super(...arguments), $n.set(this, void 0);
  }
  async open(t, n = me.buffer) {
    hf(this, $n, _s(this, $n, "f") ?? new Ja(), "f");
    const r = await _s(this, $n, "f").lock();
    let i;
    try {
      i = await this._ctx.key.open(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new dd(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
$n = /* @__PURE__ */ new WeakMap();
var Is = function(e, t, n, r) {
  if (n === "a" && !r) throw new TypeError("Private accessor was defined without a getter");
  if (typeof t == "function" ? e !== t || !r : !t.has(e)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? r : n === "a" ? r.call(e) : r ? r.value : t.get(e);
}, gf = function(e, t, n, r, i) {
  if (r === "m") throw new TypeError("Private method is not writable");
  if (r === "a" && !i) throw new TypeError("Private accessor was defined without a setter");
  if (typeof t == "function" ? e !== t || !i : !t.has(e)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return r === "a" ? i.call(e, n) : i ? i.value = n : t.set(e, n), n;
}, On;
class wf extends Ya {
  constructor(t, n, r, i) {
    super(t, n, r), Object.defineProperty(this, "enc", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: void 0
    }), On.set(this, void 0), this.enc = i;
  }
  async seal(t, n = me.buffer) {
    gf(this, On, Is(this, On, "f") ?? new Ja(), "f");
    const r = await Is(this, On, "f").lock();
    let i;
    try {
      i = await this._ctx.key.seal(this.computeNonce(this._ctx), Z(t), Z(n));
    } catch (o) {
      throw new ld(o);
    } finally {
      r();
    }
    return this.incrementSeq(this._ctx), i;
  }
}
On = /* @__PURE__ */ new WeakMap();
const bf = new Uint8Array([
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
]), mf = new Uint8Array([101, 120, 112]), vf = new Uint8Array([
  105,
  110,
  102,
  111,
  95,
  104,
  97,
  115,
  104
]), xf = new Uint8Array([107, 101, 121]), Ef = new Uint8Array([
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
]), Sf = new Uint8Array([115, 101, 99, 114, 101, 116]), kf = new Uint8Array([
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
class Af extends oo {
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
      throw new We("KemId cannot be used");
    if (this._kem = t.kem, typeof t.kdf == "number")
      throw new We("KdfId cannot be used");
    if (this._kdf = t.kdf, typeof t.aead == "number")
      throw new We("AeadId cannot be used");
    this._aead = t.aead, this._suiteId = new Uint8Array(kf), this._suiteId.set(Cn(this._kem.id, 2), 4), this._suiteId.set(Cn(this._kdf.id, 2), 6), this._suiteId.set(Cn(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
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
    return t.psk !== void 0 ? r = t.senderKey !== void 0 ? gt.AuthPsk : gt.Psk : r = t.senderKey !== void 0 ? gt.Auth : gt.Base, await this._keyScheduleS(r, n.sharedSecret, n.enc, t);
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
    return t.psk !== void 0 ? r = t.senderPublicKey !== void 0 ? gt.AuthPsk : gt.Psk : r = t.senderPublicKey !== void 0 ? gt.Auth : gt.Base, await this._keyScheduleR(r, n, t);
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
    const i = r.psk === void 0 ? me : kr(r.psk.id), o = await this._kdf.labeledExtract(me, Ef, i), s = r.info === void 0 ? me : kr(r.info), a = await this._kdf.labeledExtract(me, vf, s), c = new Uint8Array(1 + o.byteLength + a.byteLength);
    c.set(new Uint8Array([t]), 0), c.set(new Uint8Array(o), 1), c.set(new Uint8Array(a), 1 + o.byteLength);
    const u = r.psk === void 0 ? me : kr(r.psk.key), l = this._kdf.buildLabeledIkm(Sf, u), d = this._kdf.buildLabeledInfo(mf, c, this._kdf.hashSize), h = await this._kdf.extractAndExpand(n, l, d, this._kdf.hashSize);
    if (this._aead.id === so.ExportOnly)
      return { aead: this._aead, exporterSecret: h };
    const f = this._kdf.buildLabeledInfo(xf, c, this._aead.keySize), w = await this._kdf.extractAndExpand(n, l, f, this._aead.keySize), g = this._kdf.buildLabeledInfo(bf, c, this._aead.nonceSize), p = await this._kdf.extractAndExpand(n, l, g, this._aead.nonceSize);
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
    return o.key === void 0 ? new df(this._api, this._kdf, o.exporterSecret, r) : new wf(this._api, this._kdf, o, r);
  }
  async _keyScheduleR(t, n, r) {
    const i = await this._keySchedule(t, n, r);
    return i.key === void 0 ? new lf(this._api, this._kdf, i.exporterSecret) : new yf(this._api, this._kdf, i);
  }
  _validateInputLength(t) {
    if (t.info !== void 0 && t.info.byteLength > wd)
      throw new We("Too long info");
    if (t.psk !== void 0) {
      if (t.psk.key.byteLength < vs)
        throw new We(`PSK must have at least ${vs} bytes`);
      if (t.psk.key.byteLength > $r)
        throw new We("Too long psk.key");
      if (t.psk.id.byteLength > $r)
        throw new We("Too long psk.id");
    }
  }
}
class _f extends Af {
}
let If = class extends qa {
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Bf = 1n, Bs = 2n, Pf = 3n, $f = 5n, Qa = 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;
function Of(e) {
  const t = 10n, n = 20n, r = 40n, i = 80n, o = Qa, a = e * e % o * e % o, c = Le(a, Bs, o) * a % o, u = Le(c, Bf, o) * e % o, l = Le(u, $f, o) * u % o, d = Le(l, t, o) * l % o, h = Le(d, n, o) * d % o, f = Le(h, r, o) * h % o, w = Le(f, i, o) * f % o, g = Le(w, i, o) * f % o, p = Le(g, t, o) * l % o;
  return { pow_p_5_8: Le(p, Bs, o) * e % o, b2: a };
}
function Tf(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Lf = /* @__PURE__ */ (() => {
  const e = Qa;
  return of({
    P: e,
    type: "x25519",
    powPminus2: (t) => {
      const { pow_p_5_8: n, b2: r } = Of(t);
      return Xa(Le(n, Pf, e) * r, e);
    },
    adjustScalarBytes: Tf
  });
})();
class Rf extends qa {
  async extract(t, n) {
    await this._setup();
    const r = t.byteLength === 0 ? new ArrayBuffer(this.hashSize) : Z(t), i = Z(n);
    if (r.byteLength !== this.hashSize)
      return Za(tf, new Uint8Array(r), new Uint8Array(i)).buffer;
    const o = await this._api.importKey("raw", r, this.algHash, !1, [
      "sign"
    ]);
    return await this._api.sign("HMAC", o, i);
  }
}
class Cf extends Bd {
  constructor(t) {
    super("X25519", 32, Lf, t);
  }
  derive(t, n) {
    try {
      return Promise.resolve(this._curve.getSharedSecret(t, n));
    } catch (r) {
      return Promise.reject(new Sr(r));
    }
  }
}
class zf extends Ad {
  constructor() {
    const t = new Rf();
    super(ms.DhkemX25519HkdfSha256, new Cf(t), t), Object.defineProperty(this, "id", {
      enumerable: !0,
      configurable: !0,
      writable: !0,
      value: ms.DhkemX25519HkdfSha256
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
function ec(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
function Qe(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(`${n}expected number, got ${typeof e}`);
  }
  if (!Number.isSafeInteger(e) || e < 0) {
    const n = t && `"${t}" `;
    throw new RangeError(`${n}expected integer >= 0, got ${e}`);
  }
}
function et(e, t, n = "") {
  const r = ec(e), i = e?.length, o = t !== void 0;
  if (!r || o && i !== t) {
    const s = n && `"${n}" `, a = o ? ` of length ${t}` : "", c = r ? `length=${i}` : `type=${typeof e}`, u = s + "expected Uint8Array" + a + ", got " + c;
    throw r ? new RangeError(u) : new TypeError(u);
  }
  return e;
}
function tc(e) {
  if (typeof e != "function" || typeof e.create != "function")
    throw new TypeError("Hash must wrapped by utils.createHasher");
  if (Qe(e.outputLen), Qe(e.blockLen), e.outputLen < 1)
    throw new Error('"outputLen" must be >= 1');
  if (e.blockLen < 1)
    throw new Error('"blockLen" must be >= 1');
}
function cn(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function co(e, t) {
  et(e, void 0, "digestInto() output");
  const n = t.outputLen;
  if (e.length < n)
    throw new RangeError('"digestInto() output" expected to be of length >=' + n);
}
function Uf(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function tt(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function mi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function qe(e, t) {
  return e << 32 - t | e >>> t;
}
function ur(e, t) {
  return e << t | e >>> 32 - t >>> 0;
}
const Hf = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Mf(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Nf(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Mf(e[t]);
  return e;
}
const Ps = Hf ? (e) => e : Nf, nc = /* @ts-ignore */ typeof Uint8Array.from([]).toHex == "function" && typeof Uint8Array.fromHex == "function", Ff = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function uo(e) {
  if (et(e), nc)
    return e.toHex();
  let t = "";
  for (let n = 0; n < e.length; n++)
    t += Ff[e[n]];
  return t;
}
const st = { _0: 48, _9: 57, A: 65, F: 70, a: 97, f: 102 };
function $s(e) {
  if (e >= st._0 && e <= st._9)
    return e - st._0;
  if (e >= st.A && e <= st.F)
    return e - (st.A - 10);
  if (e >= st.a && e <= st.f)
    return e - (st.a - 10);
}
function lo(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  if (nc)
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
    const s = $s(e.charCodeAt(o)), a = $s(e.charCodeAt(o + 1));
    if (s === void 0 || a === void 0) {
      const c = e[o] + e[o + 1];
      throw new RangeError('hex string expected, got non-hex character "' + c + '" at index ' + o);
    }
    r[i] = s * 16 + a;
  }
  return r;
}
function Kf(...e) {
  let t = 0;
  for (let r = 0; r < e.length; r++) {
    const i = e[r];
    et(i), t += i.length;
  }
  const n = new Uint8Array(t);
  for (let r = 0, i = 0; r < e.length; r++) {
    const o = e[r];
    n.set(o, i), i += o.length;
  }
  return n;
}
function ei(e, t = {}) {
  const n = (i, o) => e(o).update(i).digest(), r = e(void 0);
  return n.outputLen = r.outputLen, n.blockLen = r.blockLen, n.canXOF = r.canXOF, n.create = (i) => e(i), Object.assign(n, t), Object.freeze(n);
}
function fo(e = 32) {
  Qe(e, "bytesLength");
  const t = typeof globalThis == "object" ? globalThis.crypto : null;
  if (typeof t?.getRandomValues != "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (e > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${e}`);
  return t.getRandomValues(new Uint8Array(e));
}
const rc = (e) => ({
  // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
  // Larger suffix values would need base-128 OID encoding and a different length byte.
  oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, e])
});
function Df(e, t, n) {
  return e & t ^ ~e & n;
}
function jf(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
let po = class {
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
    this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = mi(this.buffer);
  }
  update(t) {
    cn(this), et(t);
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
    cn(this), co(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, tt(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    r.setBigUint64(i - 8, BigInt(this.length * 8), o), this.process(r, 0);
    const a = mi(t), c = this.outputLen;
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
]), ge = /* @__PURE__ */ Uint32Array.from([
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
]), lr = /* @__PURE__ */ BigInt(2 ** 32 - 1), Os = /* @__PURE__ */ BigInt(32);
function Vf(e, t = !1) {
  return t ? { h: Number(e & lr), l: Number(e >> Os & lr) } : { h: Number(e >> Os & lr) | 0, l: Number(e & lr) | 0 };
}
function ic(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Vf(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Ts = (e, t, n) => e >>> n, Ls = (e, t, n) => e << 32 - n | t >>> n, Yt = (e, t, n) => e >>> n | t << 32 - n, Jt = (e, t, n) => e << 32 - n | t >>> n, dr = (e, t, n) => e << 64 - n | t >>> n - 32, fr = (e, t, n) => e >>> n - 32 | t << 64 - n, qf = (e, t, n) => e << n | t >>> 32 - n, Gf = (e, t, n) => t << n | e >>> 32 - n, Wf = (e, t, n) => t << n - 32 | e >>> 64 - n, Zf = (e, t, n) => e << n - 32 | t >>> 64 - n;
function at(e, t, n, r) {
  const i = (t >>> 0) + (r >>> 0);
  return { h: e + n + (i / 2 ** 32 | 0) | 0, l: i | 0 };
}
const Xf = (e, t, n) => (e >>> 0) + (t >>> 0) + (n >>> 0), Yf = (e, t, n, r) => t + n + r + (e / 2 ** 32 | 0) | 0, Jf = (e, t, n, r) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0), Qf = (e, t, n, r, i) => t + n + r + i + (e / 2 ** 32 | 0) | 0, ep = (e, t, n, r, i) => (e >>> 0) + (t >>> 0) + (n >>> 0) + (r >>> 0) + (i >>> 0), tp = (e, t, n, r, i, o) => t + n + r + i + o + (e / 2 ** 32 | 0) | 0, np = /* @__PURE__ */ Uint32Array.from([
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
class rp extends po {
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
      vt[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = vt[d - 15], f = vt[d - 2], w = qe(h, 7) ^ qe(h, 18) ^ h >>> 3, g = qe(f, 17) ^ qe(f, 19) ^ f >>> 10;
      vt[d] = g + vt[d - 7] + w + vt[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = qe(a, 6) ^ qe(a, 11) ^ qe(a, 25), f = l + h + Df(a, c, u) + np[d] + vt[d] | 0, g = (qe(r, 2) ^ qe(r, 13) ^ qe(r, 22)) + jf(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    tt(vt);
  }
  destroy() {
    this.destroyed = !0, this.set(0, 0, 0, 0, 0, 0, 0, 0), tt(this.buffer);
  }
}
class ip extends rp {
  // We cannot use array here since array allows indexing by variable
  // which means optimizer/compiler cannot use registers.
  A = mt[0] | 0;
  B = mt[1] | 0;
  C = mt[2] | 0;
  D = mt[3] | 0;
  E = mt[4] | 0;
  F = mt[5] | 0;
  G = mt[6] | 0;
  H = mt[7] | 0;
  constructor() {
    super(32);
  }
}
const oc = ic([
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
].map((e) => BigInt(e))), op = oc[0], sp = oc[1], xt = /* @__PURE__ */ new Uint32Array(80), Et = /* @__PURE__ */ new Uint32Array(80);
class ap extends po {
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
      xt[_] = t.getUint32(n), Et[_] = t.getUint32(n += 4);
    for (let _ = 16; _ < 80; _++) {
      const I = xt[_ - 15] | 0, S = Et[_ - 15] | 0, O = Yt(I, S, 1) ^ Yt(I, S, 8) ^ Ts(I, S, 7), L = Jt(I, S, 1) ^ Jt(I, S, 8) ^ Ls(I, S, 7), R = xt[_ - 2] | 0, U = Et[_ - 2] | 0, D = Yt(R, U, 19) ^ dr(R, U, 61) ^ Ts(R, U, 6), z = Jt(R, U, 19) ^ fr(R, U, 61) ^ Ls(R, U, 6), b = Jf(L, z, Et[_ - 7], Et[_ - 16]), k = Qf(b, O, D, xt[_ - 7], xt[_ - 16]);
      xt[_] = k | 0, Et[_] = b | 0;
    }
    let { Ah: r, Al: i, Bh: o, Bl: s, Ch: a, Cl: c, Dh: u, Dl: l, Eh: d, El: h, Fh: f, Fl: w, Gh: g, Gl: p, Hh: y, Hl: v } = this;
    for (let _ = 0; _ < 80; _++) {
      const I = Yt(d, h, 14) ^ Yt(d, h, 18) ^ dr(d, h, 41), S = Jt(d, h, 14) ^ Jt(d, h, 18) ^ fr(d, h, 41), O = d & f ^ ~d & g, L = h & w ^ ~h & p, R = ep(v, S, L, sp[_], Et[_]), U = tp(R, y, I, O, op[_], xt[_]), D = R | 0, z = Yt(r, i, 28) ^ dr(r, i, 34) ^ dr(r, i, 39), b = Jt(r, i, 28) ^ fr(r, i, 34) ^ fr(r, i, 39), k = r & o ^ r & a ^ o & a, A = i & s ^ i & c ^ s & c;
      y = g | 0, v = p | 0, g = f | 0, p = w | 0, f = d | 0, w = h | 0, { h: d, l: h } = at(u | 0, l | 0, U | 0, D | 0), u = a | 0, l = c | 0, a = o | 0, c = s | 0, o = r | 0, s = i | 0;
      const x = Xf(D, b, A);
      r = Yf(x, U, z, k), i = x | 0;
    }
    ({ h: r, l: i } = at(this.Ah | 0, this.Al | 0, r | 0, i | 0)), { h: o, l: s } = at(this.Bh | 0, this.Bl | 0, o | 0, s | 0), { h: a, l: c } = at(this.Ch | 0, this.Cl | 0, a | 0, c | 0), { h: u, l } = at(this.Dh | 0, this.Dl | 0, u | 0, l | 0), { h: d, l: h } = at(this.Eh | 0, this.El | 0, d | 0, h | 0), { h: f, l: w } = at(this.Fh | 0, this.Fl | 0, f | 0, w | 0), { h: g, l: p } = at(this.Gh | 0, this.Gl | 0, g | 0, p | 0), { h: y, l: v } = at(this.Hh | 0, this.Hl | 0, y | 0, v | 0), this.set(r, i, o, s, a, c, u, l, d, h, f, w, g, p, y, v);
  }
  roundClean() {
    tt(xt, Et);
  }
  destroy() {
    this.destroyed = !0, tt(this.buffer), this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  }
}
class cp extends ap {
  Ah = ge[0] | 0;
  Al = ge[1] | 0;
  Bh = ge[2] | 0;
  Bl = ge[3] | 0;
  Ch = ge[4] | 0;
  Cl = ge[5] | 0;
  Dh = ge[6] | 0;
  Dl = ge[7] | 0;
  Eh = ge[8] | 0;
  El = ge[9] | 0;
  Fh = ge[10] | 0;
  Fl = ge[11] | 0;
  Gh = ge[12] | 0;
  Gl = ge[13] | 0;
  Hh = ge[14] | 0;
  Hl = ge[15] | 0;
  constructor() {
    super(64);
  }
}
const ue = /* @__PURE__ */ ei(
  () => new ip(),
  /* @__PURE__ */ rc(1)
), up = /* @__PURE__ */ ei(
  () => new cp(),
  /* @__PURE__ */ rc(3)
);
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const V = (e, t, n) => et(e, t, n), sc = Qe, X = uo, Oe = (...e) => Kf(...e), Fn = (e) => lo(e), ho = ec, yo = (e) => fo(e), Lr = /* @__PURE__ */ BigInt(0), Ni = /* @__PURE__ */ BigInt(1);
function Pt(e, t = "") {
  if (typeof e != "boolean") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected boolean, got type=" + typeof e);
  }
  return e;
}
function go(e) {
  if (typeof e == "bigint") {
    if (!Ir(e))
      throw new RangeError("positive bigint expected, got " + e);
  } else
    sc(e);
  return e;
}
function Rr(e, t = "") {
  if (typeof e != "number") {
    const n = t && `"${t}" `;
    throw new TypeError(n + "expected number, got type=" + typeof e);
  }
  if (!Number.isSafeInteger(e)) {
    const n = t && `"${t}" `;
    throw new RangeError(n + "expected safe integer, got " + e);
  }
}
function pr(e) {
  const t = go(e).toString(16);
  return t.length & 1 ? "0" + t : t;
}
function ac(e) {
  if (typeof e != "string")
    throw new TypeError("hex string expected, got " + typeof e);
  return e === "" ? Lr : BigInt("0x" + e);
}
function tr(e) {
  return ac(uo(e));
}
function un(e) {
  return ac(uo(Fi(et(e)).reverse()));
}
function wo(e, t) {
  if (Qe(t), t === 0)
    throw new RangeError("zero length");
  e = go(e);
  const n = e.toString(16);
  if (n.length > t * 2)
    throw new RangeError("number too large");
  return lo(n.padStart(t * 2, "0"));
}
function cc(e, t) {
  return wo(e, t).reverse();
}
function lp(e, t) {
  if (e = V(e), t = V(t), e.length !== t.length)
    return !1;
  let n = 0;
  for (let r = 0; r < e.length; r++)
    n |= e[r] ^ t[r];
  return n === 0;
}
function Fi(e) {
  return Uint8Array.from(V(e));
}
function dp(e) {
  if (typeof e != "string")
    throw new TypeError("ascii string expected, got " + typeof e);
  return Uint8Array.from(e, (t, n) => {
    const r = t.charCodeAt(0);
    if (t.length !== 1 || r > 127)
      throw new RangeError(`string contains non-ASCII character "${e[n]}" with code ${r} at position ${n}`);
    return r;
  });
}
const Ir = (e) => typeof e == "bigint" && Lr <= e;
function fp(e, t, n) {
  return Ir(e) && Ir(t) && Ir(n) && t <= e && e < n;
}
function Cr(e, t, n, r) {
  if (!fp(t, n, r))
    throw new RangeError("expected valid " + e + ": " + n + " <= n < " + r + ", got " + t);
}
function bo(e) {
  if (e < Lr)
    throw new Error("expected non-negative bigint, got " + e);
  let t;
  for (t = 0; e > Lr; e >>= Ni, t += 1)
    ;
  return t;
}
const mo = (e) => (Ni << BigInt(e)) - Ni;
function pp(e, t, n) {
  if (Qe(e, "hashLen"), Qe(t, "qByteLen"), typeof n != "function")
    throw new TypeError("hmacFn must be a function");
  const r = (p) => new Uint8Array(p), i = Uint8Array.of(), o = Uint8Array.of(0), s = Uint8Array.of(1), a = 1e3;
  let c = r(e), u = r(e), l = 0;
  const d = () => {
    c.fill(1), u.fill(0), l = 0;
  }, h = (...p) => n(u, Oe(c, ...p)), f = (p = i) => {
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
    return Oe(...y);
  };
  return (p, y) => {
    d(), f(p);
    let v;
    for (; (v = y(w())) === void 0; )
      f();
    return d(), v;
  };
}
function gn(e, t = {}, n = {}) {
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
const Rs = () => {
  throw new Error("not implemented");
};
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const we = /* @__PURE__ */ BigInt(0), se = /* @__PURE__ */ BigInt(1), Ut = /* @__PURE__ */ BigInt(2), uc = /* @__PURE__ */ BigInt(3), lc = /* @__PURE__ */ BigInt(4), dc = /* @__PURE__ */ BigInt(5), hp = /* @__PURE__ */ BigInt(7), fc = /* @__PURE__ */ BigInt(8), yp = /* @__PURE__ */ BigInt(9), pc = /* @__PURE__ */ BigInt(16);
function ce(e, t) {
  if (t <= we)
    throw new Error("mod: expected positive modulus, got " + t);
  const n = e % t;
  return n >= we ? n : t + n;
}
function ie(e, t, n) {
  if (t < we)
    throw new Error("pow2: expected non-negative exponent, got " + t);
  let r = e;
  for (; t-- > we; )
    r *= r, r %= n;
  return r;
}
function Cs(e, t) {
  if (e === we)
    throw new Error("invert: expected non-zero number");
  if (t <= we)
    throw new Error("invert: expected positive modulus, got " + t);
  let n = ce(e, t), r = t, i = we, o = se;
  for (; n !== we; ) {
    const a = r / n, c = r - n * a, u = i - o * a;
    r = n, n = c, i = o, o = u;
  }
  if (r !== se)
    throw new Error("invert: does not exist");
  return ce(i, t);
}
function vo(e, t, n) {
  const r = e;
  if (!r.eql(r.sqr(t), n))
    throw new Error("Cannot find square root");
}
function hc(e, t) {
  const n = e, r = (n.ORDER + se) / lc, i = n.pow(t, r);
  return vo(n, i, t), i;
}
function gp(e, t) {
  const n = e, r = (n.ORDER - dc) / fc, i = n.mul(t, Ut), o = n.pow(i, r), s = n.mul(t, o), a = n.mul(n.mul(s, Ut), o), c = n.mul(s, n.sub(a, n.ONE));
  return vo(n, c, t), c;
}
function wp(e) {
  const t = ti(e), n = yc(e), r = n(t, t.neg(t.ONE)), i = n(t, r), o = n(t, t.neg(r)), s = (e + hp) / pc;
  return ((a, c) => {
    const u = a;
    let l = u.pow(c, s), d = u.mul(l, r);
    const h = u.mul(l, i), f = u.mul(l, o), w = u.eql(u.sqr(d), c), g = u.eql(u.sqr(h), c);
    l = u.cmov(l, d, w), d = u.cmov(f, h, g);
    const p = u.eql(u.sqr(d), c), y = u.cmov(l, d, p);
    return vo(u, y, c), y;
  });
}
function yc(e) {
  if (e < uc)
    throw new Error("sqrt is not defined for small field");
  let t = e - se, n = 0;
  for (; t % Ut === we; )
    t /= Ut, n++;
  let r = Ut;
  const i = ti(e);
  for (; zs(i, r) === 1; )
    if (r++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  if (n === 1)
    return hc;
  let o = i.pow(r, t);
  const s = (t + se) / Ut;
  return function(c, u) {
    const l = c;
    if (l.is0(u))
      return u;
    if (zs(l, u) !== 1)
      throw new Error("Cannot find square root");
    let d = n, h = l.mul(l.ONE, o), f = l.pow(u, t), w = l.pow(u, s);
    for (; !l.eql(f, l.ONE); ) {
      if (l.is0(f))
        return l.ZERO;
      let g = 1, p = l.sqr(f);
      for (; !l.eql(p, l.ONE); )
        if (g++, p = l.sqr(p), g === d)
          throw new Error("Cannot find square root");
      const y = se << BigInt(d - g - 1), v = l.pow(h, y);
      d = g, h = l.sqr(v), f = l.mul(f, h), w = l.mul(w, v);
    }
    return w;
  };
}
function bp(e) {
  return e % lc === uc ? hc : e % fc === dc ? gp : e % pc === yp ? wp(e) : yc(e);
}
const Lt = (e, t) => (ce(e, t) & se) === se, mp = [
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
function vp(e) {
  const t = {
    ORDER: "bigint",
    BYTES: "number",
    BITS: "number"
  }, n = mp.reduce((r, i) => (r[i] = "function", r), t);
  if (gn(e, n), Rr(e.BYTES, "BYTES"), Rr(e.BITS, "BITS"), e.BYTES < 1 || e.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (e.ORDER <= se)
    throw new Error("invalid field: expected ORDER > 1, got " + e.ORDER);
  return e;
}
function xp(e, t, n) {
  const r = e;
  if (n < we)
    throw new Error("invalid exponent, negatives unsupported");
  if (n === we)
    return r.ONE;
  if (n === se)
    return t;
  let i = r.ONE, o = t;
  for (; n > we; )
    n & se && (i = r.mul(i, o)), o = r.sqr(o), n >>= se;
  return i;
}
function gc(e, t, n = !1) {
  const r = e, i = new Array(t.length).fill(n ? r.ZERO : void 0), o = t.reduce((a, c, u) => r.is0(c) ? a : (i[u] = a, r.mul(a, c)), r.ONE), s = r.inv(o);
  return t.reduceRight((a, c, u) => r.is0(c) ? a : (i[u] = r.mul(a, i[u]), r.mul(a, c)), s), i;
}
function zs(e, t) {
  const n = e, r = (n.ORDER - se) / Ut, i = n.pow(t, r), o = n.eql(i, n.ONE), s = n.eql(i, n.ZERO), a = n.eql(i, n.neg(n.ONE));
  if (!o && !s && !a)
    throw new Error("invalid Legendre symbol result");
  return o ? 1 : s ? 0 : -1;
}
function Ep(e, t) {
  if (t !== void 0 && sc(t), e <= we)
    throw new Error("invalid n length: expected positive n, got " + e);
  if (t !== void 0 && t < 1)
    throw new Error("invalid n length: expected positive bit length, got " + t);
  const n = bo(e);
  if (t !== void 0 && t < n)
    throw new Error(`invalid n length: expected bit length (${n}) >= n.length (${t})`);
  const r = t !== void 0 ? t : n, i = Math.ceil(r / 8);
  return { nBitLength: r, nByteLength: i };
}
const Us = /* @__PURE__ */ new WeakMap();
class wc {
  ORDER;
  BITS;
  BYTES;
  isLE;
  ZERO = we;
  ONE = se;
  _lengths;
  _mod;
  constructor(t, n = {}) {
    if (t <= se)
      throw new Error("invalid field: expected ORDER > 1, got " + t);
    let r;
    this.isLE = !1, n != null && typeof n == "object" && (typeof n.BITS == "number" && (r = n.BITS), typeof n.sqrt == "function" && Object.defineProperty(this, "sqrt", { value: n.sqrt, enumerable: !0 }), typeof n.isLE == "boolean" && (this.isLE = n.isLE), n.allowedLengths && (this._lengths = Object.freeze(n.allowedLengths.slice())), typeof n.modFromBytes == "boolean" && (this._mod = n.modFromBytes));
    const { nBitLength: i, nByteLength: o } = Ep(t, r);
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
    return we <= t && t < this.ORDER;
  }
  is0(t) {
    return t === we;
  }
  // is valid and invertible
  isValidNot0(t) {
    return !this.is0(t) && this.isValid(t);
  }
  isOdd(t) {
    return (t & se) === se;
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
    return xp(this, t, n);
  }
  div(t, n) {
    return ce(t * Cs(n, this.ORDER), this.ORDER);
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
    return Cs(t, this.ORDER);
  }
  sqrt(t) {
    let n = Us.get(this);
    return n || Us.set(this, n = bp(this.ORDER)), n(this, t);
  }
  toBytes(t) {
    return this.isLE ? cc(t, this.BYTES) : wo(t, this.BYTES);
  }
  fromBytes(t, n = !1) {
    V(t);
    const { _lengths: r, BYTES: i, isLE: o, ORDER: s, _mod: a } = this;
    if (r) {
      if (t.length < 1 || !r.includes(t.length) || t.length > i)
        throw new Error("Field.fromBytes: expected " + r + " bytes, got " + t.length);
      const u = new Uint8Array(i);
      u.set(t, o ? 0 : u.length - t.length), t = u;
    }
    if (t.length !== i)
      throw new Error("Field.fromBytes: expected " + i + " bytes, got " + t.length);
    let c = o ? un(t) : tr(t);
    if (a && (c = ce(c, s)), !n && !this.isValid(c))
      throw new Error("invalid field element: outside of range 0..ORDER");
    return c;
  }
  // TODO: we don't need it here, move out to separate fn
  invertBatch(t) {
    return gc(this, t);
  }
  // We can't move this out because Fp6, Fp12 implement it
  // and it's unclear what to return in there.
  cmov(t, n, r) {
    return Pt(r, "condition"), r ? n : t;
  }
}
Object.freeze(wc.prototype);
function ti(e, t = {}) {
  return new wc(e, t);
}
function bc(e) {
  if (typeof e != "bigint")
    throw new Error("field order must be bigint");
  if (e <= se)
    throw new Error("field order must be greater than 1");
  const t = bo(e - se);
  return Math.ceil(t / 8);
}
function mc(e) {
  const t = bc(e);
  return t + Math.ceil(t / 2);
}
function vc(e, t, n = !1) {
  V(e);
  const r = e.length, i = bc(t), o = Math.max(mc(t), 16);
  if (r < o || r > 1024)
    throw new Error("expected " + o + "-1024 bytes of input, got " + r);
  const s = n ? un(e) : tr(e), a = ce(s, t - se) + se;
  return n ? cc(a, i) : wo(a, i);
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const ln = /* @__PURE__ */ BigInt(0), Ht = /* @__PURE__ */ BigInt(1);
function zr(e, t) {
  const n = t.negate();
  return e ? n : t;
}
function zn(e, t) {
  const n = gc(e.Fp, t.map((r) => r.Z));
  return t.map((r, i) => e.fromAffine(r.toAffine(n[i])));
}
function xc(e, t) {
  if (!Number.isSafeInteger(e) || e <= 0 || e > t)
    throw new Error("invalid window size, expected [1.." + t + "], got W=" + e);
}
function vi(e, t) {
  xc(e, t);
  const n = Math.ceil(t / e) + 1, r = 2 ** (e - 1), i = 2 ** e, o = mo(e), s = BigInt(e);
  return { windows: n, windowSize: r, mask: o, maxNumber: i, shiftBy: s };
}
function Hs(e, t, n) {
  const { windowSize: r, mask: i, maxNumber: o, shiftBy: s } = n;
  let a = Number(e & i), c = e >> s;
  a > r && (a -= o, c += Ht);
  const u = t * r, l = u + Math.abs(a) - 1, d = a === 0, h = a < 0, f = t % 2 !== 0;
  return { nextN: c, offset: l, isZero: d, isNeg: h, isNegF: f, offsetF: u };
}
const xi = /* @__PURE__ */ new WeakMap(), Ec = /* @__PURE__ */ new WeakMap();
function Ei(e) {
  return Ec.get(e) || 1;
}
function Ms(e) {
  if (e !== ln)
    throw new Error("invalid wNAF");
}
class Sc {
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
    for (; n > ln; )
      n & Ht && (r = r.add(i)), i = i.double(), n >>= Ht;
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
    const { windows: r, windowSize: i } = vi(n, this.bits), o = [];
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
    const s = vi(t, this.bits);
    for (let a = 0; a < s.windows; a++) {
      const { nextN: c, offset: u, isZero: l, isNeg: d, isNegF: h, offsetF: f } = Hs(r, a, s);
      r = c, l ? o = o.add(zr(h, n[f])) : i = i.add(zr(d, n[u]));
    }
    return Ms(r), { p: i, f: o };
  }
  /**
   * Implements unsafe EC multiplication using precomputed tables
   * and w-ary non-adjacent form.
   * @param acc - accumulator point to add result of multiplication
   * @returns point
   */
  wNAFUnsafe(t, n, r, i = this.ZERO) {
    const o = vi(t, this.bits);
    for (let s = 0; s < o.windows && r !== ln; s++) {
      const { nextN: a, offset: c, isZero: u, isNeg: l } = Hs(r, s, o);
      if (r = a, !u) {
        const d = n[c];
        i = i.add(l ? d.negate() : d);
      }
    }
    return Ms(r), i;
  }
  getPrecomputes(t, n, r) {
    let i = xi.get(n);
    return i || (i = this.precomputeWindow(n, t), t !== 1 && (typeof r == "function" && (i = r(i)), xi.set(n, i))), i;
  }
  cached(t, n, r) {
    const i = Ei(t);
    return this.wNAF(i, this.getPrecomputes(i, t, r), n);
  }
  unsafe(t, n, r, i) {
    const o = Ei(t);
    return o === 1 ? this._unsafeLadder(t, n, i) : this.wNAFUnsafe(o, this.getPrecomputes(o, t, r), n, i);
  }
  // We calculate precomputes for elliptic curve point multiplication
  // using windowed method. This specifies window size and
  // stores precomputed values. Usually only base point would be precomputed.
  createCache(t, n) {
    xc(n, this.bits), Ec.set(t, n), xi.delete(t);
  }
  hasCache(t) {
    return Ei(t) !== 1;
  }
}
function Sp(e, t, n, r) {
  let i = t, o = e.ZERO, s = e.ZERO;
  for (; n > ln || r > ln; )
    n & Ht && (o = o.add(i)), r & Ht && (s = s.add(i)), i = i.double(), n >>= Ht, r >>= Ht;
  return { p1: o, p2: s };
}
function Ns(e, t, n) {
  if (t) {
    if (t.ORDER !== e)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    return vp(t), t;
  } else
    return ti(e, { isLE: n });
}
function kc(e, t, n = {}, r) {
  if (r === void 0 && (r = e === "edwards"), !t || typeof t != "object")
    throw new Error(`expected valid ${e} CURVE object`);
  for (const c of ["p", "n", "h"]) {
    const u = t[c];
    if (!(typeof u == "bigint" && u > ln))
      throw new Error(`CURVE.${c} must be positive bigint`);
  }
  const i = Ns(t.p, n.Fp, r), o = Ns(t.n, n.Fn, r), a = ["Gx", "Gy", "a", e === "weierstrass" ? "b" : "d"];
  for (const c of a)
    if (!i.isValid(t[c]))
      throw new Error(`CURVE.${c} must be valid field element of CURVE.Fp`);
  return t = Object.freeze(Object.assign({}, t)), { CURVE: t, Fp: i, Fn: o };
}
function xo(e, t) {
  return function(r) {
    const i = e(r);
    return { secretKey: i, publicKey: t(i) };
  };
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const St = /* @__PURE__ */ BigInt(0), he = /* @__PURE__ */ BigInt(1), Si = /* @__PURE__ */ BigInt(2), kp = /* @__PURE__ */ BigInt(8);
function Ap(e, t, n, r) {
  const i = e.sqr(n), o = e.sqr(r), s = e.add(e.mul(t.a, i), o), a = e.add(e.ONE, e.mul(t.d, e.mul(i, o)));
  return e.eql(s, a);
}
function _p(e, t = {}) {
  const n = t, r = kc("edwards", e, n, n.FpFnLE), { Fp: i, Fn: o } = r;
  let s = r.CURVE;
  const { h: a } = s;
  gn(n, {}, { uvRatio: "function" });
  const c = Si << BigInt(o.BYTES * 8) - he, u = (g) => i.create(g), l = n.uvRatio === void 0 ? (g, p) => {
    try {
      return { isValid: !0, value: i.sqrt(i.div(g, p)) };
    } catch {
      return { isValid: !1, value: St };
    }
  } : n.uvRatio;
  if (!Ap(i, s, s.Gx, s.Gy))
    throw new Error("bad curve params: generator point");
  function d(g, p, y = !1) {
    const v = y ? he : St;
    return Cr("coordinate " + g, p, v, c), p;
  }
  function h(g) {
    if (!(g instanceof f))
      throw new Error("EdwardsPoint expected");
  }
  class f {
    // base / generator point
    static BASE = new f(s.Gx, s.Gy, he, u(s.Gx * s.Gy));
    // zero / infinity / identity point
    static ZERO = new f(St, he, he, St);
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
      return d("x", y), d("y", v), new f(y, v, he, u(y * v));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(p, y = !1) {
      const v = i.BYTES, { a: _, d: I } = s;
      p = Fi(V(p, v, "point")), Pt(y, "zip215");
      const S = Fi(p), O = p[v - 1];
      S[v - 1] = O & -129;
      const L = un(S), R = y ? c : i.ORDER;
      Cr("point.y", L, St, R);
      const U = u(L * L), D = u(U - he), z = u(I * U - _);
      let { isValid: b, value: k } = l(D, z);
      if (!b)
        throw new Error("bad point: invalid y coordinate");
      const A = (k & he) === he, x = (O & 128) !== 0;
      if (!y && k === St && x)
        throw new Error("bad point: x=0 and x_0=1");
      return x !== A && (k = u(-k)), f.fromAffine({ x: k, y: L });
    }
    static fromHex(p, y = !1) {
      return f.fromBytes(Fn(p), y);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(p = 8, y = !0) {
      return w.createCache(this, p), y || this.multiply(Si), this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this, { a: y, d: v } = s;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X: _, Y: I, Z: S, T: O } = p, L = u(_ * _), R = u(I * I), U = u(S * S), D = u(U * U), z = u(L * y), b = u(U * u(z + R)), k = u(D + u(v * u(L * R)));
      if (b !== k)
        throw new Error("bad point: equation left != right (1)");
      const A = u(_ * I), x = u(S * O);
      if (A !== x)
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(p) {
      h(p);
      const { X: y, Y: v, Z: _ } = this, { X: I, Y: S, Z: O } = p, L = u(y * O), R = u(I * _), U = u(v * O), D = u(S * _);
      return L === R && U === D;
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
      const { a: p } = s, { X: y, Y: v, Z: _ } = this, I = u(y * y), S = u(v * v), O = u(Si * u(_ * _)), L = u(p * I), R = y + v, U = u(u(R * R) - I - S), D = L + S, z = D - O, b = L - S, k = u(U * z), A = u(D * b), x = u(U * b), E = u(z * D);
      return new f(k, A, E, x);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(p) {
      h(p);
      const { a: y, d: v } = s, { X: _, Y: I, Z: S, T: O } = this, { X: L, Y: R, Z: U, T: D } = p, z = u(_ * L), b = u(I * R), k = u(O * v * D), A = u(S * U), x = u((_ + I) * (L + R) - z - b), E = A - k, B = A + k, $ = u(b - y * z), P = u(x * E), T = u(B * $), C = u(x * $), H = u(E * B);
      return new f(P, T, H, C);
    }
    subtract(p) {
      return h(p), this.add(p.negate());
    }
    // Constant-time multiplication.
    multiply(p) {
      if (!o.isValidNot0(p))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p: y, f: v } = w.cached(this, p, (_) => zn(f, _));
      return zn(f, [y, v])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(p) {
      if (!o.isValid(p))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      return p === St ? f.ZERO : this.is0() || p === he ? this : w.unsafe(this, p, (y) => zn(f, y));
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
      v == null && (v = O ? kp : i.inv(S));
      const L = u(_ * v), R = u(I * v), U = i.mul(S, v);
      if (O)
        return { x: St, y: he };
      if (U !== he)
        throw new Error("invZ was invalid");
      return { x: L, y: R };
    }
    clearCofactor() {
      return a === he ? this : this.multiplyUnsafe(a);
    }
    toBytes() {
      const { x: p, y } = this.toAffine(), v = i.toBytes(y);
      return v[v.length - 1] |= p & he ? 128 : 0, v;
    }
    toHex() {
      return X(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const w = new Sc(f, o.BITS);
  return o.BITS >= 8 && f.BASE.precompute(8), Object.freeze(f.prototype), Object.freeze(f), f;
}
class Ip {
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
    Rs();
  }
  static fromHex(t) {
    Rs();
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
  gn(i, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function"
  });
  const { prehash: o } = i, { BASE: s, Fp: a, Fn: c } = e, u = r.outputLen, l = 2 * a.BYTES;
  if (u !== void 0 && (Rr(u, "hash.outputLen"), u !== l))
    throw new Error(`hash.outputLen must be ${l}, got ${u}`);
  const d = i.randomBytes === void 0 ? yo : i.randomBytes, h = i.adjustScalarBytes === void 0 ? (b) => b : i.adjustScalarBytes, f = i.domain === void 0 ? (b, k, A) => {
    if (Pt(A, "phflag"), k.length || A)
      throw new Error("Contexts/pre-hash are not supported");
    return b;
  } : i.domain;
  function w(b) {
    return c.create(un(b));
  }
  function g(b) {
    const k = L.secretKey;
    V(b, L.secretKey, "secretKey");
    const A = V(r(b), 2 * k, "hashedSecretKey"), x = h(A.slice(0, k)), E = A.slice(k, 2 * k), B = w(x);
    return { head: x, prefix: E, scalar: B };
  }
  function p(b) {
    const { head: k, prefix: A, scalar: x } = g(b), E = s.multiply(x), B = E.toBytes();
    return { head: k, prefix: A, scalar: x, point: E, pointBytes: B };
  }
  function y(b) {
    return p(b).pointBytes;
  }
  function v(b = Uint8Array.of(), ...k) {
    const A = Oe(...k);
    return w(r(f(A, V(b, void 0, "context"), !!o)));
  }
  function _(b, k, A = {}) {
    b = V(b, void 0, "message"), o && (b = o(b));
    const { prefix: x, scalar: E, pointBytes: B } = p(k), $ = v(A.context, x, b), P = s.multiply($).toBytes(), T = v(A.context, P, B, b), C = c.create($ + T * E);
    if (!c.isValid(C))
      throw new Error("sign failed: invalid s");
    const H = Oe(P, c.toBytes(C));
    return V(H, L.signature, "result");
  }
  const I = {
    zip215: i.zip215
  };
  function S(b, k, A, x = I) {
    const { context: E } = x, B = x.zip215 === void 0 ? !!I.zip215 : x.zip215, $ = L.signature;
    b = V(b, $, "signature"), k = V(k, void 0, "message"), A = V(A, L.publicKey, "publicKey"), B !== void 0 && Pt(B, "zip215"), o && (k = o(k));
    const P = $ / 2, T = b.subarray(0, P), C = un(b.subarray(P, $));
    let H, q, N;
    try {
      H = e.fromBytes(A, B), q = e.fromBytes(T, B), N = s.multiplyUnsafe(C);
    } catch {
      return !1;
    }
    if (!B && H.isSmallOrder())
      return !1;
    const te = v(E, T, A, k);
    return q.add(H.multiplyUnsafe(te)).subtract(N).clearCofactor().is0();
  }
  const O = a.BYTES, L = {
    secretKey: O,
    publicKey: O,
    signature: 2 * O,
    seed: O
  };
  function R(b) {
    return b = b === void 0 ? d(L.seed) : b, V(b, L.seed, "seed");
  }
  function U(b) {
    return ho(b) && b.length === L.secretKey;
  }
  function D(b, k) {
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
    toMontgomery(b) {
      const { y: k } = e.fromBytes(b), A = L.publicKey, x = A === 32;
      if (!x && A !== 57)
        throw new Error("only defined for 25519 and 448");
      const E = x ? a.div(he + k, he - k) : a.div(k - he, k + he);
      return a.toBytes(E);
    },
    toMontgomerySecret(b) {
      const k = L.secretKey;
      V(b, k);
      const A = r(b.subarray(0, k));
      return h(A).subarray(0, k);
    }
  };
  return Object.freeze(L), Object.freeze(z), Object.freeze({
    keygen: xo(R, y),
    getPublicKey: y,
    sign: _,
    verify: S,
    utils: z,
    Point: e,
    lengths: L
  });
}
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Pp = /* @__PURE__ */ BigInt(0), Un = /* @__PURE__ */ BigInt(1), Fs = /* @__PURE__ */ BigInt(2), $p = /* @__PURE__ */ BigInt(5), Op = /* @__PURE__ */ BigInt(8), Kn = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed"), Ac = {
  p: Kn,
  n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
  h: Op,
  a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
  d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
  Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
  Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
};
function Tp(e) {
  const t = BigInt(10), n = BigInt(20), r = BigInt(40), i = BigInt(80), o = Kn, a = e * e % o * e % o, c = ie(a, Fs, o) * a % o, u = ie(c, Un, o) * e % o, l = ie(u, $p, o) * u % o, d = ie(l, t, o) * l % o, h = ie(d, n, o) * d % o, f = ie(h, r, o) * h % o, w = ie(f, i, o) * f % o, g = ie(w, i, o) * f % o, p = ie(g, t, o) * l % o;
  return { pow_p_5_8: ie(p, Fs, o) * e % o, b2: a };
}
function Lp(e) {
  return e[0] &= 248, e[31] &= 127, e[31] |= 64, e;
}
const Ki = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
function _c(e, t) {
  const n = Kn, r = ce(t * t * t, n), i = ce(r * r * t, n), o = Tp(e * i).pow_p_5_8;
  let s = ce(e * r * o, n);
  const a = ce(t * s * s, n), c = s, u = ce(s * Ki, n), l = a === e, d = a === ce(-e, n), h = a === ce(-e * Ki, n);
  return l && (s = c), (d || h) && (s = u), Lt(s, n) && (s = ce(-s, n)), { isValid: l || d, value: s };
}
const Mt = /* @__PURE__ */ _p(Ac, { uvRatio: _c }), Rt = Mt.Fp, Rp = Mt.Fn;
function Cp(e) {
  return Bp(Mt, up, Object.assign({ adjustScalarBytes: Lp, zip215: !0 }, e));
}
const Ur = /* @__PURE__ */ Cp({}), Ks = Ki, zp = /* @__PURE__ */ BigInt("54469307008909316920995813868745141605393597292927456921205312896311721017578"), Ds = (e) => _c(Un, e), Up = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"), Hp = (e) => Rt.create(un(e) & Up);
class Ie extends Ip {
  // Do NOT change syntax: the following gymnastics is done,
  // because typescript strips comments, which makes bundlers disable tree-shaking.
  // prettier-ignore
  static BASE = new Ie(Mt.BASE);
  // prettier-ignore
  static ZERO = new Ie(Mt.ZERO);
  // prettier-ignore
  static Fp = Rt;
  // prettier-ignore
  static Fn = Rp;
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
    return new Ie(Mt.fromAffine(t));
  }
  assertSame(t) {
    if (!(t instanceof Ie))
      throw new Error("RistrettoPoint expected");
  }
  init(t) {
    return new Ie(t);
  }
  static fromBytes(t) {
    et(t, 32);
    const { a: n, d: r } = Ac, i = Kn, o = (I) => Rt.create(I), s = Hp(t);
    if (!lp(Rt.toBytes(s), t) || Lt(s, i))
      throw new Error("invalid ristretto255 encoding 1");
    const a = o(s * s), c = o(Un + n * a), u = o(Un - n * a), l = o(c * c), d = o(u * u), h = o(n * r * l - d), { isValid: f, value: w } = Ds(o(h * d)), g = o(w * u), p = o(w * g * h);
    let y = o((s + s) * g);
    Lt(y, i) && (y = o(-y));
    const v = o(c * p), _ = o(y * v);
    if (!f || Lt(_, i) || v === Pp)
      throw new Error("invalid ristretto255 encoding 2");
    return new Ie(new Mt(y, v, Un, _));
  }
  /**
   * Converts ristretto-encoded string to ristretto point.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-decode).
   * @param hex - Ristretto-encoded 32 bytes. Not every 32-byte string is valid ristretto encoding
   */
  static fromHex(t) {
    return Ie.fromBytes(lo(t));
  }
  /**
   * Encodes ristretto point to Uint8Array.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-encode).
   */
  toBytes() {
    let { X: t, Y: n, Z: r, T: i } = this.ep;
    const o = Kn, s = (p) => Rt.create(p), a = s(s(r + n) * s(r - n)), c = s(t * n), u = s(c * c), { value: l } = Ds(s(a * u)), d = s(l * a), h = s(l * c), f = s(d * h * i);
    let w;
    if (Lt(i * f, o)) {
      let p = s(n * Ks), y = s(t * Ks);
      t = p, n = y, w = s(d * zp);
    } else
      w = h;
    Lt(t * f, o) && (n = s(-n));
    let g = s((r - n) * w);
    return Lt(g, o) && (g = s(-g)), Rt.toBytes(g);
  }
  /**
   * Compares two Ristretto points.
   * Described in [RFC9496](https://www.rfc-editor.org/rfc/rfc9496#name-equals).
   */
  equals(t) {
    this.assertSame(t);
    const { X: n, Y: r } = this.ep, { X: i, Y: o } = t.ep, s = (u) => Rt.create(u), a = s(n * o) === s(r * i), c = s(r * o) === s(n * i);
    return a || c;
  }
  is0() {
    return this.equals(Ie.ZERO);
  }
}
Object.freeze(Ie.BASE);
Object.freeze(Ie.ZERO);
Object.freeze(Ie.prototype);
Object.freeze(Ie);
class js {
  oHash;
  iHash;
  blockLen;
  outputLen;
  canXOF = !1;
  finished = !1;
  destroyed = !1;
  constructor(t, n) {
    if (tc(t), et(n, void 0, "key"), this.iHash = t.create(), typeof this.iHash.update != "function")
      throw new Error("Expected instance of class which extends utils.Hash");
    this.blockLen = this.iHash.blockLen, this.outputLen = this.iHash.outputLen;
    const r = this.blockLen, i = new Uint8Array(r);
    i.set(n.length > r ? t.create().update(n).digest() : n);
    for (let o = 0; o < i.length; o++)
      i[o] ^= 54;
    this.iHash.update(i), this.oHash = t.create();
    for (let o = 0; o < i.length; o++)
      i[o] ^= 106;
    this.oHash.update(i), tt(i);
  }
  update(t) {
    return cn(this), this.iHash.update(t), this;
  }
  digestInto(t) {
    cn(this), co(t, this), this.finished = !0;
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
const Mp = /* @__PURE__ */ (() => {
  const e = ((t, n, r) => new js(t, n).update(r).digest());
  return e.create = (t, n) => new js(t, n), e;
})();
/*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) */
const Vs = (e, t) => (e + (e >= 0 ? t : -t) / Ic) / t;
function Np(e, t, n) {
  Cr("scalar", e, Xe, n);
  const [[r, i], [o, s]] = t, a = Vs(s * e, n), c = Vs(-i * e, n);
  let u = e - a * r - c * o, l = -a * i - c * s;
  const d = u < Xe, h = l < Xe;
  d && (u = -u), h && (l = -l);
  const f = mo(Math.ceil(bo(n) / 2)) + _t;
  if (u < Xe || u >= f || l < Xe || l >= f)
    throw new Error("splitScalar (endomorphism): failed for k");
  return { k1neg: d, k1: u, k2neg: h, k2: l };
}
function Di(e) {
  if (!["compact", "recovered", "der"].includes(e))
    throw new Error('Signature format must be "compact", "recovered", or "der"');
  return e;
}
function ki(e, t) {
  gn(e);
  const n = {};
  for (let r of Object.keys(t))
    n[r] = e[r] === void 0 ? t[r] : e[r];
  return Pt(n.lowS, "lowS"), Pt(n.prehash, "prehash"), n.format !== void 0 && Di(n.format), n;
}
class Fp extends Error {
  constructor(t = "") {
    super(t);
  }
}
const Ce = {
  // asn.1 DER encoding utils
  Err: Fp,
  // Basic building block is TLV (Tag-Length-Value)
  _tlv: {
    encode: (e, t) => {
      const { Err: n } = Ce;
      if (Rr(e, "tag"), e < 0 || e > 255)
        throw new n("tlv.encode: wrong tag");
      if (typeof t != "string")
        throw new TypeError('"data" expected string, got type=' + typeof t);
      if (t.length & 1)
        throw new n("tlv.encode: unpadded data");
      const r = t.length / 2, i = pr(r);
      if (i.length / 2 & 128)
        throw new n("tlv.encode: long form length too big");
      const o = r > 127 ? pr(i.length / 2 | 128) : "";
      return pr(e) + o + i + t;
    },
    // v - value, l - left bytes (unparsed)
    decode(e, t) {
      const { Err: n } = Ce;
      t = V(t, void 0, "DER data");
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
      if (go(e), e < Xe)
        throw new t("integer: negative integers are not allowed");
      let n = pr(e);
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
      return tr(e);
    }
  },
  toSig(e) {
    const { Err: t, _int: n, _tlv: r } = Ce, i = V(e, void 0, "signature"), { v: o, l: s } = r.decode(48, i);
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
const Xe = /* @__PURE__ */ BigInt(0), _t = /* @__PURE__ */ BigInt(1), Ic = /* @__PURE__ */ BigInt(2), hr = /* @__PURE__ */ BigInt(3), Kp = /* @__PURE__ */ BigInt(4);
function Dp(e, t = {}) {
  const n = kc("weierstrass", e, t), r = n.Fp, i = n.Fn;
  let o = n.CURVE;
  const { h: s, n: a } = o;
  gn(t, {}, {
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
  const l = Pc(r, i);
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
      const B = !r.isOdd(x);
      return Oe(Bc(B), E);
    } else
      return Oe(Uint8Array.of(4), E, r.toBytes(x));
  }
  function f(z) {
    V(z, void 0, "Point");
    const { publicKey: b, publicKeyUncompressed: k } = l, A = z.length, x = z[0], E = z.subarray(1);
    if (u && A === 1 && x === 0)
      return { x: r.ZERO, y: r.ZERO };
    if (A === b && (x === 2 || x === 3)) {
      const B = r.fromBytes(E);
      if (!r.isValid(B))
        throw new Error("bad point: is not on curve, wrong x");
      const $ = p(B);
      let P;
      try {
        P = r.sqrt($);
      } catch (H) {
        const q = H instanceof Error ? ": " + H.message : "";
        throw new Error("bad point: is not on curve, sqrt error" + q);
      }
      d();
      const T = r.isOdd(P);
      return (x & 1) === 1 !== T && (P = r.neg(P)), { x: B, y: P };
    } else if (A === k && x === 4) {
      const B = r.BYTES, $ = r.fromBytes(E.subarray(0, B)), P = r.fromBytes(E.subarray(B, B * 2));
      if (!y($, P))
        throw new Error("bad point: is not on curve");
      return { x: $, y: P };
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
  const v = r.mul(r.pow(o.a, hr), Kp), _ = r.mul(r.sqr(o.b), BigInt(27));
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
    return Np(z, c.basises, i.ORDER);
  }
  function L(z, b, k, A, x) {
    return k = new R(r.mul(k.X, z), k.Y, k.Z), b = zr(A, b), k = zr(x, k), b.add(k);
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
      const k = R.fromAffine(g(V(b, void 0, "point")));
      return k.assertValidity(), k;
    }
    static fromHex(b) {
      return R.fromBytes(Fn(b));
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
      return D.createCache(this, b), k || this.multiply(hr), this;
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
      const { X: k, Y: A, Z: x } = this, { X: E, Y: B, Z: $ } = b, P = r.eql(r.mul(k, $), r.mul(E, x)), T = r.eql(r.mul(A, $), r.mul(B, x));
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
      const { a: b, b: k } = o, A = r.mul(k, hr), { X: x, Y: E, Z: B } = this;
      let $ = r.ZERO, P = r.ZERO, T = r.ZERO, C = r.mul(x, x), H = r.mul(E, E), q = r.mul(B, B), N = r.mul(x, E);
      return N = r.add(N, N), T = r.mul(x, B), T = r.add(T, T), $ = r.mul(b, T), P = r.mul(A, q), P = r.add($, P), $ = r.sub(H, P), P = r.add(H, P), P = r.mul($, P), $ = r.mul(N, $), T = r.mul(A, T), q = r.mul(b, q), N = r.sub(C, q), N = r.mul(b, N), N = r.add(N, T), T = r.add(C, C), C = r.add(T, C), C = r.add(C, q), C = r.mul(C, N), P = r.add(P, C), q = r.mul(E, B), q = r.add(q, q), C = r.mul(q, N), $ = r.sub($, C), T = r.mul(q, H), T = r.add(T, T), T = r.add(T, T), new R($, P, T);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(b) {
      S(b);
      const { X: k, Y: A, Z: x } = this, { X: E, Y: B, Z: $ } = b;
      let P = r.ZERO, T = r.ZERO, C = r.ZERO;
      const H = o.a, q = r.mul(o.b, hr);
      let N = r.mul(k, E), te = r.mul(A, B), ne = r.mul(x, $), re = r.add(k, A), Y = r.add(E, B);
      re = r.mul(re, Y), Y = r.add(N, te), re = r.sub(re, Y), Y = r.add(k, x);
      let ye = r.add(E, $);
      return Y = r.mul(Y, ye), ye = r.add(N, ne), Y = r.sub(Y, ye), ye = r.add(A, x), P = r.add(B, $), ye = r.mul(ye, P), P = r.add(te, ne), ye = r.sub(ye, P), C = r.mul(H, Y), P = r.mul(q, ne), C = r.add(P, C), P = r.sub(te, C), C = r.add(te, C), T = r.mul(P, C), te = r.add(N, N), te = r.add(te, N), ne = r.mul(H, ne), Y = r.mul(q, Y), te = r.add(te, ne), ne = r.sub(N, ne), ne = r.mul(H, ne), Y = r.add(Y, ne), N = r.mul(te, Y), T = r.add(T, N), N = r.mul(ye, Y), P = r.mul(re, P), P = r.sub(P, N), N = r.mul(re, te), C = r.mul(ye, C), C = r.add(C, N), new R(P, T, C);
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
      const E = (B) => D.cached(this, B, ($) => zn(R, $));
      if (k) {
        const { k1neg: B, k1: $, k2neg: P, k2: T } = O(b), { p: C, f: H } = E($), { p: q, f: N } = E(T);
        x = H.add(N), A = L(k.beta, C, q, B, P);
      } else {
        const { p: B, f: $ } = E(b);
        A = B, x = $;
      }
      return zn(R, [A, x])[0];
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
      if (x === Xe || A.is0())
        return R.ZERO;
      if (x === _t)
        return A;
      if (D.hasCache(this))
        return this.multiply(x);
      if (k) {
        const { k1neg: E, k1: B, k2neg: $, k2: P } = O(x), { p1: T, p2: C } = Sp(R, A, B, P);
        return L(k.beta, T, C, E, $);
      } else
        return D.unsafe(A, x);
    }
    /**
     * Converts Projective point to affine (x, y) coordinates.
     * (X, Y, Z) ∋ (x=X/Z, y=Y/Z).
     * @param invertedZ - Z^-1 (inverted zero) - optional, precomputation is useful for invertBatch
     */
    toAffine(b) {
      const k = this;
      let A = b;
      const { X: x, Y: E, Z: B } = k;
      if (r.eql(B, r.ONE))
        return { x, y: E };
      const $ = k.is0();
      A == null && (A = $ ? r.ONE : r.inv(B));
      const P = r.mul(x, A), T = r.mul(E, A), C = r.mul(B, A);
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
      const { isTorsionFree: b } = t;
      return s === _t ? !0 : b ? b(R, this) : D.unsafe(this, a).is0();
    }
    clearCofactor() {
      const { clearCofactor: b } = t;
      return s === _t ? this : b ? b(R, this) : this.multiplyUnsafe(s);
    }
    isSmallOrder() {
      return s === _t ? this.is0() : this.clearCofactor().is0();
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
  const U = i.BITS, D = new Sc(R, t.endo ? Math.ceil(U / 2) : U);
  return U >= 8 && R.BASE.precompute(8), Object.freeze(R.prototype), Object.freeze(R), R;
}
function Bc(e) {
  return Uint8Array.of(e ? 2 : 3);
}
function Pc(e, t) {
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
function jp(e, t = {}) {
  const { Fn: n } = e, r = t.randomBytes === void 0 ? yo : t.randomBytes, i = Object.assign(Pc(e.Fp, n), {
    seed: Math.max(mc(n.ORDER), 16)
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
    return f = f === void 0 ? r(i.seed) : f, vc(V(f, i.seed, "seed"), n.ORDER);
  }
  function c(f, w = !0) {
    return e.BASE.multiply(n.fromBytes(f)).toBytes(w);
  }
  function u(f) {
    const { secretKey: w, publicKey: g, publicKeyUncompressed: p } = i, y = n._lengths;
    if (!ho(f))
      return;
    const v = V(f, void 0, "key").length, _ = v === g || v === p, I = v === w || !!y?.includes(v);
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
  }, h = xo(a, c);
  return Object.freeze(d), Object.freeze(i), Object.freeze({ getPublicKey: c, getSharedSecret: l, keygen: h, Point: e, utils: d, lengths: i });
}
function Vp(e, t, n = {}) {
  const r = t;
  tc(r), gn(n, {}, {
    hmac: "function",
    lowS: "boolean",
    randomBytes: "function",
    bits2int: "function",
    bits2int_modN: "function"
  }), n = Object.assign({}, n);
  const i = n.randomBytes === void 0 ? yo : n.randomBytes, o = n.hmac === void 0 ? (x, E) => Mp(r, x, E) : n.hmac, { Fp: s, Fn: a } = e, { ORDER: c, BITS: u } = a, { keygen: l, getPublicKey: d, getSharedSecret: h, utils: f, lengths: w } = jp(e, n), g = {
    prehash: !0,
    lowS: typeof n.lowS == "boolean" ? n.lowS : !0,
    format: "compact",
    extraEntropy: !1
  }, p = c * Ic + _t < s.ORDER;
  function y(x) {
    const E = c >> _t;
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
    Di(E);
    const B = w.signature, $ = E === "compact" ? B : E === "recovered" ? B + 1 : void 0;
    return V(x, $);
  }
  class S {
    r;
    s;
    recovery;
    constructor(E, B, $) {
      if (this.r = v("r", E), this.s = v("s", B), $ != null) {
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
        const { r: H, s: q } = Ce.toSig(V(E));
        return new S(H, q);
      }
      B === "recovered" && ($ = E[0], B = "compact", E = E.subarray(1));
      const P = w.signature / 2, T = E.subarray(0, P), C = E.subarray(P, P * 2);
      return new S(a.fromBytes(T), a.fromBytes(C), $);
    }
    static fromHex(E, B) {
      return this.fromBytes(Fn(E), B);
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
      const C = s.toBytes(T), H = e.fromBytes(Oe(Bc((P & 1) === 0), C)), q = a.inv(T), N = L(V(E, void 0, "msgHash")), te = a.create(-N * q), ne = a.create($ * q), re = e.BASE.multiplyUnsafe(te).add(H.multiplyUnsafe(ne));
      if (re.is0())
        throw new Error("invalid recovery: point at infinify");
      return re.assertValidity(), re;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return y(this.s);
    }
    toBytes(E = g.format) {
      if (Di(E), E === "der")
        return Fn(Ce.hexFromSig(this));
      const { r: B, s: $ } = this, P = a.toBytes(B), T = a.toBytes($);
      return E === "recovered" ? (_(), Oe(Uint8Array.of(this.assertRecovery()), P, T)) : Oe(P, T);
    }
    toHex(E) {
      return X(this.toBytes(E));
    }
  }
  Object.freeze(S.prototype), Object.freeze(S);
  const O = n.bits2int === void 0 ? function(E) {
    if (E.length > 8192)
      throw new Error("input is too large");
    const B = tr(E), $ = E.length * 8 - u;
    return $ > 0 ? B >> BigInt($) : B;
  } : n.bits2int, L = n.bits2int_modN === void 0 ? function(E) {
    return a.create(O(E));
  } : n.bits2int_modN, R = mo(u);
  function U(x) {
    return Cr("num < 2^" + u, x, Xe, R), a.toBytes(x);
  }
  function D(x, E) {
    return V(x, void 0, "message"), E ? V(r(x), void 0, "prehashed message") : x;
  }
  function z(x, E, B) {
    const { lowS: $, prehash: P, extraEntropy: T } = ki(B, g);
    x = D(x, P);
    const C = L(x), H = a.fromBytes(E);
    if (!a.isValidNot0(H))
      throw new Error("invalid private key");
    const q = [U(H), U(C)];
    if (T != null && T !== !1) {
      const re = T === !0 ? i(w.secretKey) : T;
      q.push(V(re, void 0, "extraEntropy"));
    }
    const N = Oe(...q), te = C;
    function ne(re) {
      const Y = O(re);
      if (!a.isValidNot0(Y))
        return;
      const ye = a.inv(Y), it = e.BASE.multiply(Y).toAffine(), Tt = a.create(it.x);
      if (Tt === Xe)
        return;
      const Wt = a.create(ye * a.create(te + Tt * H));
      if (Wt === Xe)
        return;
      let xn = (it.x === Tt ? 0 : 2) | Number(it.y & _t), En = Wt;
      return $ && y(Wt) && (En = a.neg(Wt), xn ^= 1), new S(Tt, En, p ? void 0 : xn);
    }
    return { seed: N, k2sig: ne };
  }
  function b(x, E, B = {}) {
    const { seed: $, k2sig: P } = z(x, E, B);
    return pp(r.outputLen, a.BYTES, o)($, P).toBytes(B.format);
  }
  function k(x, E, B, $ = {}) {
    const { lowS: P, prehash: T, format: C } = ki($, g);
    if (B = V(B, void 0, "publicKey"), E = D(E, T), !ho(x)) {
      const H = x instanceof S ? ", use sig.toBytes()" : "";
      throw new Error("verify expects Uint8Array signature" + H);
    }
    I(x, C);
    try {
      const H = S.fromBytes(x, C), q = e.fromBytes(B);
      if (P && H.hasHighS())
        return !1;
      const { r: N, s: te } = H, ne = L(E), re = a.inv(te), Y = a.create(ne * re), ye = a.create(N * re), it = e.BASE.multiplyUnsafe(Y).add(q.multiplyUnsafe(ye));
      return it.is0() ? !1 : a.create(it.x) === N;
    } catch {
      return !1;
    }
  }
  function A(x, E, B = {}) {
    const { prehash: $ } = ki(B, g);
    return E = D(E, $), S.fromBytes(x, "recovered").recoverPublicKey(E).toBytes();
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
const ni = {
  p: BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f"),
  n: BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141"),
  h: BigInt(1),
  a: BigInt(0),
  b: BigInt(7),
  Gx: BigInt("0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"),
  Gy: BigInt("0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8")
}, qp = {
  beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
  basises: [
    [BigInt("0x3086d221a7d46bcde86c90e49284eb15"), -BigInt("0xe4437ed6010e88286f547fa90abfe4c3")],
    [BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8"), BigInt("0x3086d221a7d46bcde86c90e49284eb15")]
  ]
}, Gp = /* @__PURE__ */ BigInt(0), ji = /* @__PURE__ */ BigInt(2);
function Wp(e) {
  const t = ni.p, n = BigInt(3), r = BigInt(6), i = BigInt(11), o = BigInt(22), s = BigInt(23), a = BigInt(44), c = BigInt(88), u = e * e * e % t, l = u * u * e % t, d = ie(l, n, t) * l % t, h = ie(d, n, t) * l % t, f = ie(h, ji, t) * u % t, w = ie(f, i, t) * f % t, g = ie(w, o, t) * w % t, p = ie(g, a, t) * g % t, y = ie(p, c, t) * p % t, v = ie(y, a, t) * g % t, _ = ie(v, n, t) * l % t, I = ie(_, s, t) * w % t, S = ie(I, r, t) * u % t, O = ie(S, ji, t);
  if (!Hr.eql(Hr.sqr(O), e))
    throw new Error("Cannot find square root");
  return O;
}
const Hr = ti(ni.p, { sqrt: Wp }), Vt = /* @__PURE__ */ Dp(ni, {
  Fp: Hr,
  endo: qp
}), ke = /* @__PURE__ */ Vp(Vt, ue), qs = {};
function Mr(e, ...t) {
  let n = qs[e];
  if (n === void 0) {
    const r = ue(dp(e));
    n = Oe(r, r), qs[e] = n;
  }
  return ue(Oe(n, ...t));
}
const ri = (e) => e.toBytes(!0).slice(1), ii = (e) => e % ji === Gp;
function $c(e) {
  const { Fn: t, BASE: n } = Vt, r = t.fromBytes(e), i = n.multiply(r);
  return { scalar: ii(i.y) ? r : t.neg(r), bytes: ri(i) };
}
function Oc(e) {
  const t = Hr;
  if (!t.isValidNot0(e))
    throw new Error("invalid x: Fail if x ≥ p");
  const n = t.create(e * e), r = t.create(n * e + BigInt(7));
  let i = t.sqrt(r);
  ii(i) || (i = t.neg(i));
  const o = Vt.fromAffine({ x: e, y: i });
  return o.assertValidity(), o;
}
const on = tr;
function Tc(...e) {
  return Vt.Fn.create(on(Mr("BIP0340/challenge", ...e)));
}
function Gs(e) {
  return $c(e).bytes;
}
function Zp(e, t, n = fo(32)) {
  const { Fn: r, BASE: i } = Vt, o = V(e, void 0, "message"), { bytes: s, scalar: a } = $c(t), c = V(n, 32, "auxRand"), u = r.toBytes(a ^ on(Mr("BIP0340/aux", c))), l = Mr("BIP0340/nonce", u, s, o), d = r.create(on(l));
  if (d === 0n)
    throw new Error("sign failed: k is zero");
  const h = i.multiply(d), f = ii(h.y) ? d : r.neg(d), w = ri(h), g = Tc(w, s, o), p = new Uint8Array(64);
  if (p.set(w, 0), p.set(r.toBytes(r.create(f + g * a)), 32), !Lc(p, o, s))
    throw new Error("sign: Invalid signature produced");
  return p;
}
function Lc(e, t, n) {
  const { Fp: r, Fn: i, BASE: o } = Vt, s = V(e, 64, "signature"), a = V(t, void 0, "message"), c = V(n, 32, "publicKey");
  try {
    const u = Oc(on(c)), l = on(s.subarray(0, 32));
    if (!r.isValidNot0(l))
      return !1;
    const d = on(s.subarray(32, 64));
    if (!i.isValidNot0(d))
      return !1;
    const h = Tc(i.toBytes(l), ri(u), a), f = o.multiplyUnsafe(d).add(u.multiplyUnsafe(i.neg(h))), { x: w, y: g } = f.toAffine();
    return !(f.is0() || !ii(g) || w !== l);
  } catch {
    return !1;
  }
}
const Ct = /* @__PURE__ */ (() => {
  const n = (r) => (r = r === void 0 ? fo(48) : r, vc(r, ni.n));
  return Object.freeze({
    keygen: xo(n, Gs),
    getPublicKey: Gs,
    sign: Zp,
    verify: Lc,
    Point: Vt,
    utils: Object.freeze({
      randomSecretKey: n,
      taggedHash: Mr,
      lift_x: Oc,
      pointToBytes: ri
    }),
    lengths: Object.freeze({
      secretKey: 32,
      publicKey: 32,
      publicKeyHasPrefix: !1,
      signature: 64,
      seed: 48
    })
  });
})(), Xp = /* @__PURE__ */ Uint8Array.from([
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
]), Rc = Uint8Array.from(new Array(16).fill(0).map((e, t) => t)), Yp = Rc.map((e) => (9 * e + 5) % 16), Cc = /* @__PURE__ */ (() => {
  const n = [[Rc], [Yp]];
  for (let r = 0; r < 4; r++)
    for (let i of n)
      i.push(i[r].map((o) => Xp[o]));
  return n;
})(), zc = Cc[0], Uc = Cc[1], Hc = /* @__PURE__ */ [
  [11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8],
  [12, 13, 11, 15, 6, 9, 9, 7, 12, 15, 11, 13, 7, 8, 7, 7],
  [13, 15, 14, 11, 7, 7, 6, 8, 13, 14, 13, 12, 5, 5, 6, 9],
  [14, 11, 12, 14, 8, 6, 5, 5, 15, 12, 15, 14, 9, 9, 8, 6],
  [15, 12, 13, 13, 9, 5, 8, 6, 14, 11, 12, 11, 8, 6, 5, 5]
].map((e) => Uint8Array.from(e)), Jp = /* @__PURE__ */ zc.map((e, t) => e.map((n) => Hc[t][n])), Qp = /* @__PURE__ */ Uc.map((e, t) => e.map((n) => Hc[t][n])), eh = /* @__PURE__ */ Uint32Array.from([
  0,
  1518500249,
  1859775393,
  2400959708,
  2840853838
]), th = /* @__PURE__ */ Uint32Array.from([
  1352829926,
  1548603684,
  1836072691,
  2053994217,
  0
]);
function Ws(e, t, n, r) {
  return e === 0 ? t ^ n ^ r : e === 1 ? t & n | ~t & r : e === 2 ? (t | ~n) ^ r : e === 3 ? t & r | n & ~r : t ^ (n | ~r);
}
const yr = /* @__PURE__ */ new Uint32Array(16);
class nh extends po {
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
      yr[f] = t.getUint32(n, !0);
    let r = this.h0 | 0, i = r, o = this.h1 | 0, s = o, a = this.h2 | 0, c = a, u = this.h3 | 0, l = u, d = this.h4 | 0, h = d;
    for (let f = 0; f < 5; f++) {
      const w = 4 - f, g = eh[f], p = th[f], y = zc[f], v = Uc[f], _ = Jp[f], I = Qp[f];
      for (let S = 0; S < 16; S++) {
        const O = ur(r + Ws(f, o, a, u) + yr[y[S]] + g, _[S]) + d | 0;
        r = d, d = u, u = ur(a, 10) | 0, a = o, o = O;
      }
      for (let S = 0; S < 16; S++) {
        const O = ur(i + Ws(w, s, c, l) + yr[v[S]] + p, I[S]) + h | 0;
        i = h, h = l, l = ur(c, 10) | 0, c = s, s = O;
      }
    }
    this.set(this.h1 + a + l | 0, this.h2 + u + h | 0, this.h3 + d + i | 0, this.h4 + r + s | 0, this.h0 + o + c | 0);
  }
  roundClean() {
    tt(yr);
  }
  destroy() {
    this.destroyed = !0, tt(this.buffer), this.set(0, 0, 0, 0, 0);
  }
}
const Mc = /* @__PURE__ */ ei(() => new nh()), rh = BigInt(0), kn = BigInt(1), ih = BigInt(2), oh = BigInt(7), sh = BigInt(256), ah = BigInt(113), Nc = [], Fc = [], Kc = [];
for (let e = 0, t = kn, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], Nc.push(2 * (5 * r + n)), Fc.push((e + 1) * (e + 2) / 2 % 64);
  let i = rh;
  for (let o = 0; o < 7; o++)
    t = (t << kn ^ (t >> oh) * ah) % sh, t & ih && (i ^= kn << (kn << BigInt(o)) - kn);
  Kc.push(i);
}
const Dc = ic(Kc, !0), ch = Dc[0], uh = Dc[1], Zs = (e, t, n) => n > 32 ? Wf(e, t, n) : qf(e, t, n), Xs = (e, t, n) => n > 32 ? Zf(e, t, n) : Gf(e, t, n);
function lh(e, t = 24) {
  if (Qe(t, "rounds"), t < 1 || t > 24)
    throw new Error('"rounds" expected integer 1..24');
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = Zs(u, l, 1) ^ n[a], h = Xs(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = Fc[s], c = Zs(i, o, a), u = Xs(i, o, a), l = Nc[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      const a = e[s], c = e[s + 1], u = e[s + 2], l = e[s + 3];
      e[s] ^= ~e[s + 2] & e[s + 4], e[s + 1] ^= ~e[s + 3] & e[s + 5], e[s + 2] ^= ~e[s + 4] & e[s + 6], e[s + 3] ^= ~e[s + 5] & e[s + 7], e[s + 4] ^= ~e[s + 6] & e[s + 8], e[s + 5] ^= ~e[s + 7] & e[s + 9], e[s + 6] ^= ~e[s + 8] & a, e[s + 7] ^= ~e[s + 9] & c, e[s + 8] ^= ~a & u, e[s + 9] ^= ~c & l;
    }
    e[0] ^= ch[r], e[1] ^= uh[r];
  }
  tt(n);
}
let dh = class jc {
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
    if (this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.canXOF = i, this.rounds = o, Qe(r, "outputLen"), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Uf(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    Ps(this.state32), lh(this.state32, this.rounds), Ps(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    cn(this), et(t);
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
    cn(this, !1), et(t), this.finish();
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
    return Qe(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (co(t, this), this.finished)
      throw new Error("digest() was already called");
    this.writeInto(t.subarray(0, this.outputLen)), this.destroy();
  }
  digest() {
    const t = new Uint8Array(this.outputLen);
    return this.digestInto(t), t;
  }
  destroy() {
    this.destroyed = !0, tt(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t ||= new jc(n, r, i, s, o), t.blockLen = n, t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.canXOF = this.canXOF, t.destroyed = this.destroyed, t;
  }
};
const fh = (e, t, n, r = {}) => ei(() => new dh(t, e, n), r), Vc = /* @__PURE__ */ fh(1, 136, 32), ph = 1024 * 1024, qc = Object.getPrototypeOf(Uint8Array.prototype);
Object.getOwnPropertyDescriptor(qc, Symbol.toStringTag).get;
Object.getOwnPropertyDescriptor(qc, "byteLength").get;
function hh(e) {
  if (!Number.isSafeInteger(e) || e < 0) throw new Error("exact message byte length is invalid");
  if (e > ph) throw new Error("exact message exceeds the 1 MiB decoded limit");
}
function yh(e) {
  const t = e.startsWith("0x") ? 2 : 0;
  hh(Math.ceil((e.length - t) / 2));
}
const gh = "hpke-x25519-hkdfsha256-aes256gcm-v1", wh = "avault:blind-box:v1", bh = "avault:blind-box:aad:v1", Nr = "machine-aesgcm-v1", oi = 1, si = "ecdsa-secp256k1-recoverable", Dn = "ed25519", Eo = "ecdsa-secp256k1-der", So = "schnorr-secp256k1-bip340", jn = "schnorr-secp256k1-bip341-keypath", fe = 32, Fr = 12, ai = 32, mh = "avault:protected-vmk:kek-passkey:v1", vh = /^[A-Za-z_][A-Za-z0-9_]*$/, xh = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[a-z][a-z0-9_]{0,63})?$/, Eh = "avault:protected-root-meta:v1", Sh = new TextEncoder(), kh = new TextDecoder();
function ko(e) {
  switch (e) {
    case Dn:
    case si:
    case Eo:
    case So:
    case jn:
      return e;
    default:
      throw new Error("unsupported signing scheme");
  }
}
function wn(e) {
  if (e === void 0 || e === "secp256k1") return "secp256k1";
  if (e === "ed25519") return e;
  throw new Error("unsupported signing curve");
}
function Ao(e) {
  if (ko(e), e === Dn) throw new Error("Ed25519 requires exact-message signing, not a digest");
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
function Be(e) {
  const t = ae(e), n = new ArrayBuffer(t.byteLength);
  return new Uint8Array(n).set(t), t.fill(0), n;
}
function ve(e) {
  return Sh.encode(e);
}
function Kr(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(Kr).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${Kr(t[n])}`).join(",")}}`;
}
function Kt(e) {
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
function pe(e) {
  const t = e.replace(/-/g, "+").replace(/_/g, "/"), n = t.padEnd(Math.ceil(t.length / 4) * 4, "=");
  return Uint8Array.from(atob(n), (r) => r.charCodeAt(0));
}
function He(e) {
  return Fn(e.startsWith("0x") ? e.slice(2) : e);
}
function Ys(e) {
  return /^(0x)?[0-9a-fA-F]+$/.test(e) && (e.startsWith("0x"), e.length % 2 === 0) ? He(e) : pe(e);
}
function Ah(e) {
  return X(ae(e));
}
function Gc(e, t = "bytes") {
  return ae(e, t);
}
function be(e, t, n) {
  if (e.length !== t)
    throw new Error(`${n} must be ${t} bytes`);
}
function Me(e) {
  e && new Uint8Array(e).fill(0);
}
async function Dr(e, t, n, r) {
  let i, o, s, a;
  try {
    i = Be(e), o = Be(t), s = Be(n), a = r ? Be(r) : void 0;
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
    Me(i), Me(o), Me(s), Me(a);
  }
}
async function ci(e, t, n, r) {
  let i, o, s, a;
  try {
    i = Be(e), o = Be(t), s = Be(n), a = r ? Be(r) : void 0;
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
    Me(i), Me(o), Me(s), Me(a);
  }
}
async function _h(e, t, n, r) {
  let i, o, s;
  try {
    i = Be(e), o = Be(t), s = Be(n);
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
    Me(i), Me(o), Me(s);
  }
}
async function Wc(e, t) {
  const n = ae(e, "passkey PRF output");
  try {
    const r = ae(t, "passkey PRF salt");
    try {
      if (n.length === 0)
        throw new Error("passkey PRF output is empty");
      return be(r, ai, "passkey PRF salt"), await _h(n, r, ve(mh), fe);
    } finally {
      r.fill(0);
    }
  } finally {
    n.fill(0);
  }
}
function Ih() {
  return Kt(fe);
}
function Bh() {
  return Kt(ai);
}
function Ph(e) {
  const t = ae(e, "passkey PRF salt");
  try {
    return be(t, ai, "passkey PRF salt"), { prf: { eval: { first: Be(t) } } };
  } finally {
    t.fill(0);
  }
}
function nt(e) {
  const t = typeof e == "string" ? JSON.parse(e) : e;
  if (t?.v !== oi || !Array.isArray(t.copies))
    throw new Error("invalid protected wrap_meta");
  return t;
}
async function $h(e, t) {
  const n = ae(e, "VMK"), r = Kt(Fr);
  let i, o;
  try {
    be(n, fe, "VMK"), o = ae(t.prfSalt, "passkey PRF salt"), be(o, ai, "passkey PRF salt"), i = await Wc(t.prfOutput, o);
    const s = await Dr(i, r, n);
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
async function Oh(e, t) {
  const n = ae(e, "VMK");
  try {
    if (be(n, fe, "VMK"), t.length === 0)
      throw new Error("at least one protected unlock factor is required");
    const r = [];
    for (const i of t)
      r.push(await $h(n, i));
    return JSON.stringify({ v: oi, copies: r });
  } finally {
    n.fill(0);
  }
}
async function Th(e, t) {
  const n = pe(e.prf_salt);
  if (t.prfSalt && J(t.prfSalt) !== e.prf_salt)
    throw n.fill(0), new Error("passkey PRF salt does not match copy");
  const r = await Wc(t.prfOutput, n);
  try {
    return await ci(r, pe(e.nonce), pe(e.wrapped));
  } finally {
    r.fill(0), n.fill(0);
  }
}
async function Lh(e, t) {
  const n = nt(e);
  for (const r of n.copies)
    try {
      if (r.kind === "passkey") {
        const i = await Th(r, t);
        try {
          return be(i, fe, "VMK"), i;
        } catch (o) {
          throw i.fill(0), o;
        }
      }
    } catch {
    }
  throw new Error("no protected VMK copy could be unwrapped");
}
function _o(e) {
  return nt(e).copies.filter((t) => t.kind === "passkey").map((t) => ({
    prfSalt: pe(t.prf_salt),
    ...t.credential_id ? { credentialId: t.credential_id } : {}
  }));
}
function Rh(e, t) {
  const n = nt(e);
  return JSON.stringify({
    ...n,
    rp_id: t.rpId,
    vault_user_handle: t.vaultUserHandle
  });
}
function Zc(e) {
  const t = nt(e);
  return delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, JSON.stringify(t);
}
function Io(e) {
  if (!e.kind) {
    if (e.curve !== void 0) throw new Error("protected record curve requires keypair metadata");
    return;
  }
  const t = wn(e.curve);
  if (e.kind === "static") {
    if (e.curve !== void 0) throw new Error("static protected records cannot carry a curve");
    return { kind: "static" };
  }
  if (e.kind === "keypair") {
    if (typeof e.publicKey != "string" || e.publicKey.length === 0)
      throw new Error("keypair protected record requires a public key");
    return t === "ed25519" && iu(e.publicKey), {
      kind: "keypair",
      public_key: e.publicKey.toLowerCase(),
      ...t === "ed25519" ? { curve: t } : {}
    };
  }
  throw new Error("unsupported protected record kind");
}
function Ch(e) {
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
    return Io({ kind: "keypair", publicKey: t.public_key, curve: t.curve });
  throw new Error("protected record metadata kind is invalid");
}
function Bo(e, t) {
  return {
    name: e,
    ...t ? { kind: t.kind } : {},
    ...t?.public_key ? { publicKey: t.public_key } : {},
    ...t?.curve ? { curve: t.curve } : {}
  };
}
function Po(e) {
  return ve(
    Kr({
      domain: "avault:protected-record:aad:v2",
      name: e.kind === "keypair" ? nu(e.name) : fn(e.name),
      scheme: e.scheme ?? Nr,
      version: e.version ?? oi,
      record: Io(e) ?? null
    })
  );
}
async function Xc(e, t, n) {
  const r = ae(t, "VMK"), i = Kt(fe);
  let o;
  try {
    be(r, fe, "VMK"), o = ae(e, "value");
    const s = Po(n), a = Kt(Fr), c = await Dr(i, a, o, s), u = Kt(Fr), l = await Dr(r, u, i, s);
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
async function Yc(e, t, n) {
  const r = ae(t, "VMK");
  try {
    be(r, fe, "VMK");
    const i = await ci(
      r,
      pe(e.dek_nonce),
      pe(e.wrapped_dek),
      Po(n)
    );
    try {
      return be(i, fe, "DEK"), i;
    } catch (o) {
      throw i.fill(0), o;
    }
  } finally {
    r.fill(0);
  }
}
async function Jc(e, t, n) {
  const r = await Yc(e, t, n);
  try {
    return await ci(
      r,
      pe(e.nonce),
      pe(e.ciphertext),
      Po(n)
    );
  } finally {
    r.fill(0);
  }
}
function Qc(e, t, n) {
  const r = nt(t);
  if ("dek_nonce" in r || "wrapped_dek" in r)
    throw new Error("vmk wrap_meta must not already carry a wrapped DEK");
  if ("scheme" in r && r.scheme !== Nr)
    throw new Error("protected wrap_meta has unsupported scheme");
  const i = n ? Io(n) : void 0;
  return {
    ciphertext: e.ciphertext,
    nonce: e.nonce,
    wrap_meta: JSON.stringify({
      ...r,
      scheme: Nr,
      ...i ? { record_meta: i } : {},
      dek_nonce: e.dek_nonce,
      wrapped_dek: e.wrapped_dek
    })
  };
}
function dn(e) {
  const t = nt(e.wrap_meta), { dek_nonce: n, wrapped_dek: r, record_meta: i, ...o } = t;
  if (typeof n != "string" || typeof r != "string")
    throw new Error("protected record wrap_meta is missing the wrapped DEK");
  const s = Ch(i);
  return {
    sealed: { ciphertext: e.ciphertext, nonce: e.nonce, dek_nonce: n, wrapped_dek: r },
    vmkWrapMeta: JSON.stringify(o),
    ...s ? { recordMetadata: s } : {}
  };
}
function eu(e) {
  const t = { ...nt(e) };
  return delete t.root_meta, delete t.dek_nonce, delete t.wrapped_dek, delete t.record_meta, delete t.scheme, ve(Kr({ domain: Eh, vault: t }));
}
async function zh(e, t, n) {
  const r = Kt(Fr), i = ve(JSON.stringify(t));
  try {
    const o = await Dr(e, r, i, eu(n));
    return { v: 1, nonce: J(r), ciphertext: J(o) };
  } finally {
    i.fill(0);
  }
}
async function $o(e, t) {
  const n = nt(e).root_meta;
  if (!n) return null;
  if (n.v !== 1 || typeof n.nonce != "string" || typeof n.ciphertext != "string")
    throw new Error("invalid protected root metadata");
  const r = await ci(t, pe(n.nonce), pe(n.ciphertext), eu(e));
  try {
    const i = JSON.parse(kh.decode(r));
    if (typeof i != "object" || i === null) throw new Error("invalid protected root metadata");
    return i;
  } finally {
    r.fill(0);
  }
}
function Uh(e, t) {
  const n = nt(e);
  return JSON.stringify({ ...n, root_meta: t });
}
function Hh() {
  return new _f({
    kem: new zf(),
    kdf: new If(),
    aead: new cf()
  });
}
function Oo(e) {
  return pe(typeof e == "string" ? e : e.public_key);
}
async function tu(e) {
  const t = await crypto.subtle.digest("SHA-256", Be(e));
  return X(new Uint8Array(t));
}
async function Mh(e) {
  return tu(Oo(e));
}
function Nh(e) {
  if (!e.fingerprint)
    throw new Error("protected DEK release requires a pinned avault public key fingerprint");
  return e;
}
async function Fh(e) {
  const t = Nh(e), n = Oo(t);
  if (be(n, fe, "avault public key"), await tu(n) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  return t;
}
async function Kh(e, t, n) {
  const r = Hh(), i = Oo(t);
  if (be(i, fe, "avault public key"), typeof t != "string" && t.fingerprint && await Mh(t) !== t.fingerprint.toLowerCase())
    throw new Error("avault public key fingerprint mismatch");
  const o = await r.kem.deserializePublicKey(i), s = typeof e == "string" ? ve(e) : ae(e, "plaintext");
  try {
    const a = await r.seal(
      { recipientPublicKey: o, info: ve(wh) },
      s,
      Xh(n)
    );
    return {
      scheme: gh,
      enc: J(new Uint8Array(a.enc)),
      ct: J(new Uint8Array(a.ct))
    };
  } finally {
    s.fill(0);
  }
}
function nu(e) {
  if (typeof e != "string" || !vh.test(e))
    throw new Error("vault secret name must match ^[A-Za-z_][A-Za-z0-9_]*$");
  return e;
}
function fn(e) {
  if (typeof e != "string" || !xh.test(e))
    throw new Error("vault record name must match ^[A-Za-z_][A-Za-z0-9_]*(\\.[a-z][a-z0-9_]{0,63})?$");
  return e;
}
function Js(e, t) {
  if (typeof e != "string" || e.trim() === "")
    throw new Error(`${t} is required`);
  return e;
}
function To(e) {
  const t = typeof e == "string" ? He(e) : ae(e, "digest");
  return be(t, fe, "digest"), t;
}
function Dh(e) {
  const t = typeof e == "string" ? He(e) : ae(e, "private key");
  try {
    if (be(t, fe, "private key"), !ke.utils.isValidSecretKey(t))
      throw new Error("invalid secp256k1 private key");
    return t;
  } catch (n) {
    throw t.fill(0), n;
  }
}
function Vi(e, t) {
  return typeof e == "string" ? He(e) : ae(e, t);
}
function jr(e) {
  const t = Vi(e, "operation hash");
  return be(t, fe, "operation hash"), t;
}
function Vr(e, t) {
  if (typeof e == "number" && (!Number.isSafeInteger(e) || e < 0))
    throw new Error(`${t} out of bounds`);
  const n = typeof e == "bigint" ? e : BigInt(e);
  if (n < 0n || n > 0xffffffffffffffffn)
    throw new Error(`${t} out of bounds`);
  return n;
}
function ru(e, t) {
  const n = Vr(e, t), r = new Uint8Array(8);
  return new DataView(r.buffer).setBigUint64(0, n, !1), r;
}
function jh(e) {
  return ru(e, "approval expiry");
}
function Qs(e) {
  const t = ae(e.nonce, "approval nonce");
  if (t.length < 16 || t.length > 128)
    throw new Error("approval nonce must be 16..128 bytes");
  return { approvalNonce: t, approvalExpiresAtUnix: Vr(e.expiresAtUnix, "approval expiry") };
}
function $e(e, t) {
  const n = ae(t);
  if (n.length > 4294967295)
    throw new Error("blind-box AAD field is too large");
  e.push(n.length >>> 24 & 255, n.length >>> 16 & 255, n.length >>> 8 & 255, n.length & 255), e.push(...n);
}
function Vh(e) {
  switch (e.purpose) {
    case "seal":
      return qh(e.name);
    case "agent-deliver": {
      const t = Qs({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-deliver",
        name: fn(e.name),
        grantId: Js(e.grantId, "grant id"),
        ttlSecs: Vr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: jr(e.operationHash)
      };
    }
    case "agent-sign": {
      Ao(e.signScheme);
      const t = Qs({
        nonce: e.approvalNonce,
        expiresAtUnix: e.approvalExpiresAtUnix
      });
      return {
        purpose: "agent-sign",
        name: nu(e.name),
        grantId: Js(e.grantId, "grant id"),
        signScheme: e.signScheme,
        digest: To(e.digest),
        ttlSecs: Vr(e.ttlSecs, "ttl seconds"),
        approvalNonce: t.approvalNonce,
        approvalExpiresAtUnix: t.approvalExpiresAtUnix,
        operationHash: jr(e.operationHash)
      };
    }
    default:
      throw new Error("unsupported blind-box context purpose");
  }
}
function qh(e) {
  return { purpose: "seal", name: fn(e) };
}
async function Gh(e) {
  const t = jr(e.operationHash), n = await Zh(e.name, e.ttlSecs);
  if (X(t) !== X(n))
    throw new Error("operation hash does not match release operation fields");
}
async function Wh(e) {
  const t = [];
  for (const n of e)
    $e(t, typeof n == "string" ? ve(n) : ae(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(t)));
}
async function Zh(e, t) {
  return Wh(["agent-deliver", fn(e), ru(t, "ttl seconds")]);
}
function Xh(e) {
  const t = Vh(e), n = [...ve(bh)];
  return $e(n, ve(t.purpose)), $e(n, ve(t.name)), $e(n, ve(Nr)), $e(n, new Uint8Array([oi])), $e(n, t.purpose === "agent-deliver" || t.purpose === "agent-sign" ? ve(t.grantId) : new Uint8Array()), $e(n, new Uint8Array()), $e(n, t.purpose === "agent-sign" ? ve(t.signScheme) : new Uint8Array()), $e(n, t.purpose === "agent-sign" ? To(t.digest) : new Uint8Array()), $e(n, t.purpose === "seal" ? new Uint8Array() : ae(t.approvalNonce, "approval nonce")), $e(n, t.purpose === "seal" ? new Uint8Array() : jh(t.approvalExpiresAtUnix)), $e(n, t.purpose === "seal" ? new Uint8Array() : jr(t.operationHash)), new Uint8Array(n);
}
async function Yh(e, t, n, r, i) {
  if (r.kind !== void 0 && r.kind !== "static")
    throw new Error("protected DEK release requires a static protected record");
  if (fn(r.name) !== fn(i.name))
    throw new Error("protected DEK release context name does not match record name");
  await Gh(i);
  const o = await Fh(n), s = await Yc(e, t, r);
  try {
    return await Kh(s, o, i);
  } finally {
    s.fill(0);
  }
}
function Jh(e = "secp256k1") {
  if (wn(e) === "ed25519") {
    const n = Ur.utils.randomSecretKey();
    try {
      return { privateKey: n, publicKey: X(Ur.getPublicKey(n)) };
    } catch (r) {
      throw n.fill(0), r;
    }
  }
  const t = ke.utils.randomSecretKey();
  return { privateKey: t, publicKey: X(ke.getPublicKey(t, !0)) };
}
function ea(e) {
  return He(e.toString(16).padStart(fe * 2, "0"));
}
function Qh(e, t, n, r = {}) {
  if (Ao(n), !r || typeof r != "object" || Array.isArray(r) || Object.keys(r).some((s) => s !== "schnorrAuxRand"))
    throw new Error("unsupported signing option; script trees are not supported");
  const i = Dh(e);
  let o;
  try {
    const s = To(t);
    if (n === si) {
      const a = ke.sign(s, i, { prehash: !1, lowS: !0, format: "recovered" });
      return {
        scheme: n,
        signature: X(a.slice(1)),
        recovery_id: a[0] ?? null
      };
    }
    if (n === Eo)
      return {
        scheme: n,
        signature: X(ke.sign(s, i, { prehash: !1, lowS: !0, format: "der" })),
        recovery_id: null
      };
    if (n === So) {
      o = r.schnorrAuxRand !== void 0 ? Vi(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(fe)), be(o, fe, "schnorr aux randomness");
      const a = Ct.sign(s, i, o);
      if (!Ct.verify(a, s, Ct.getPublicKey(i))) throw new Error("signing self-verification failed");
      return { scheme: n, signature: X(a), recovery_id: null };
    }
    if (n === jn) {
      const a = ke.getPublicKey(i, !0), c = Lo(a.slice(1));
      let u = BigInt(`0x${X(i)}`);
      a[0] === 3 && (u = Tn - u);
      const l = BigInt(`0x${X(Ct.utils.taggedHash("TapTweak", a.slice(1)))}`);
      if (l >= Tn) throw new Error("invalid taproot tweak");
      let d = (u + l) % Tn;
      if (d === 0n) throw new Error("invalid taproot signing key");
      let h = ea(d);
      try {
        c.toBytes(!0)[0] === 3 && (d = Tn - d, h.fill(0), h = ea(d)), o = r.schnorrAuxRand !== void 0 ? Vi(r.schnorrAuxRand, "schnorr aux randomness") : crypto.getRandomValues(new Uint8Array(fe)), be(o, fe, "schnorr aux randomness");
        const f = Ct.sign(s, h, o);
        if (!Ct.verify(f, s, c.toBytes(!0).slice(1))) throw new Error("Taproot signing self-verification failed");
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
async function ey(e, t, n, r, i, o = {}) {
  if (n.kind !== "keypair" || !n.publicKey)
    throw new Error("protected signing requires a keypair protected record");
  if (Ao(i), wn(n.curve) !== "secp256k1") throw new Error("digest signing requires a secp256k1 protected record");
  const s = await Jc(e, t, n);
  try {
    if (X(ke.getPublicKey(s, !0)) !== n.publicKey.toLowerCase())
      throw new Error("protected signing key does not match record public key");
    return Qh(s, r, i, o);
  } finally {
    s.fill(0);
  }
}
function iu(e) {
  if (!/^[0-9a-fA-F]{64}$/.test(e)) throw new Error("expected a 32-byte Ed25519 public key");
  const t = He(e);
  if (!Ur.utils.isValidPublicKey(t, !1)) throw new Error("invalid Ed25519 public key");
  return t;
}
function ty(e) {
  return su(iu(e));
}
function ny(e) {
  const t = e.rootMetadata?.daemon?.verificationKeys?.find(
    (n) => n.alg === "ed25519" && n.keyId === e.keyId
  );
  if (!t)
    throw new Error("daemon verification key is not pinned");
  return Ur.verify(Ys(e.signature), ve(e.message), Ys(t.publicKey));
}
function ou(e) {
  const t = He(e.trim());
  if (t.length === 33 && (t[0] === 2 || t[0] === 3) && ke.utils.isValidPublicKey(t))
    return t;
  if (t.length === 65 && t[0] === 4 && ke.utils.isValidPublicKey(t))
    return ke.Point.fromBytes(t).toBytes(!0);
  throw new Error("expected a valid secp256k1 public key");
}
const ry = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", iy = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", oy = 1, sy = 734539939, Tn = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
function ay(e) {
  return Mc(ue(e));
}
function cy(e) {
  const t = ue(ue(e)).slice(0, 4), n = new Uint8Array(e.length + t.length);
  return n.set(e), n.set(t, e.length), su(n);
}
function su(e) {
  let t = BigInt(`0x${X(e)}`), n = "";
  for (; t > 0n; ) {
    const i = Number(t % 58n);
    t /= 58n, n = ry[i] + n;
  }
  let r = 0;
  for (const i of e) {
    if (i !== 0) break;
    r += 1;
  }
  return "1".repeat(r) + n;
}
function uy(e) {
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
function ly(e) {
  return [...e].map((t) => t.charCodeAt(0) >>> 5).concat([0], [...e].map((t) => t.charCodeAt(0) & 31));
}
function dy(e, t, n) {
  const r = ly(e).concat(t), i = uy(r.concat([0, 0, 0, 0, 0, 0])) ^ n;
  return [0, 1, 2, 3, 4, 5].map((o) => i >>> 5 * (5 - o) & 31);
}
function fy(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >>> i & s);
  return i && o.push(r << n - i & s), o;
}
function ta(e, t, n) {
  const r = t === 0 ? oy : sy, i = [t].concat(fy(n, 8, 5));
  return `${e}1${i.concat(dy(e, i, r)).map((o) => iy[o]).join("")}`;
}
function py(e) {
  const t = e.toLowerCase(), n = X(Vc(ve(t)));
  return [...t].map((r, i) => /[a-f]/.test(r) && Number.parseInt(n[i], 16) >= 8 ? r.toUpperCase() : r).join("");
}
function Lo(e) {
  const t = BigInt(`0x${X(Ct.utils.taggedHash("TapTweak", e))}`);
  if (t >= Tn) throw new Error("invalid taproot tweak");
  const n = ke.Point.fromBytes(new Uint8Array([2, ...e])), r = t === 0n ? n : n.add(ke.Point.BASE.multiply(t));
  if (r.equals(ke.Point.ZERO)) throw new Error("invalid taproot output key");
  return r;
}
function hy(e) {
  return Lo(ou(e).slice(1)).toBytes(!0).slice(1);
}
function yy(e) {
  const t = ou(e), n = ke.Point.fromBytes(t), r = n.toBytes(!1).slice(1), i = Vc(r), o = ay(t), s = new Uint8Array(21);
  s[0] = 0, s.set(o, 1);
  const a = n.toBytes(!1).slice(1, 33), c = Lo(a);
  return {
    eth: `0x${py(X(i.slice(-20)))}`,
    btc_legacy: cy(s),
    btc_segwit: ta("bc", 0, o),
    btc_taproot: ta("bc", 1, c.toBytes(!1).slice(1, 33))
  };
}
const Ro = {
  windowSeconds: 600,
  strictApprovals: !1,
  parentValueSealAllowed: !0
};
let qi = { ...Ro };
function gy(e) {
  return e === 300 || e === 600 || e === 1800 ? e : Ro.windowSeconds;
}
function wy(e, t) {
  if (e === 300 || e === 600 || e === 1800) return e;
  throw new m("invalid_payload", `${t}.windowSeconds must be 300, 600, or 1800`);
}
function Co(e, t = "policy") {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  const n = e;
  if (typeof n.strictApprovals != "boolean") throw new m("invalid_payload", `${t}.strictApprovals must be a boolean`);
  if (typeof n.parentValueSealAllowed != "boolean")
    throw new m("invalid_payload", `${t}.parentValueSealAllowed must be a boolean`);
  return {
    windowSeconds: wy(n.windowSeconds, t),
    strictApprovals: n.strictApprovals,
    parentValueSealAllowed: n.parentValueSealAllowed
  };
}
function by(e) {
  if (typeof e != "object" || e === null) return { ...Ro };
  const t = e;
  return {
    windowSeconds: gy(t.windowSeconds),
    strictApprovals: t.strictApprovals === !0,
    parentValueSealAllowed: t.parentValueSealAllowed !== !1
  };
}
function zo(e) {
  return qi = by(e), qi;
}
function Ee() {
  return { ...qi };
}
const my = "avibe-vault-lock:v1:", K = {
  vmk: null,
  wrapMeta: null,
  freshSetup: !1,
  scopeId: null
};
let ft = null, Hn = null, Vn = null, Gi = null, Uo = 0;
const qr = /* @__PURE__ */ new Set();
let au = null;
function vy(e) {
  au = e;
}
function na() {
  return K.vmk ? "unlocked" : K.wrapMeta ? "locked" : "needs-setup";
}
function cu(e) {
  au?.({
    state: na(),
    ...ft !== null && na() === "unlocked" ? { expiresAt: ft } : {},
    reason: e
  });
}
function Ho() {
  Hn !== null && (clearTimeout(Hn), Hn = null);
}
function Gr() {
  Vn?.close(), Vn = null, Gi = null;
}
function uu(e) {
  const t = new TextEncoder().encode(e);
  let n = "";
  for (const r of t)
    n += String.fromCharCode(r);
  return btoa(n).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function xy(e) {
  let t = 2166136261;
  for (let n = 0; n < e.length; n += 1)
    t ^= e.charCodeAt(n), t = Math.imul(t, 16777619) >>> 0;
  return t.toString(16).padStart(8, "0");
}
function lu(e) {
  const t = nt(e);
  return typeof t.vault_user_handle == "string" && t.vault_user_handle.length > 0 ? uu(t.vault_user_handle) : `wrap-${xy(e)}`;
}
function Ey(e) {
  return uu(e);
}
function du(e) {
  if (typeof window > "u" || typeof BroadcastChannel > "u" || !e) {
    Gr();
    return;
  }
  const t = `${my}${e}`;
  Gi !== t && (Gr(), Gi = t, Vn = new BroadcastChannel(t), Vn.onmessage = (n) => {
    const r = n.data;
    r?.type === "lock" && r.scopeId === e && Fe({ broadcast: !1, reason: "manual-lock" });
  });
}
function Sy() {
  K.scopeId && (du(K.scopeId), Vn?.postMessage({ type: "lock", scopeId: K.scopeId }));
}
function fu() {
  return new Error("vault-operation-aborted");
}
function pu() {
  Uo += 1;
  for (const e of qr)
    e.abort(fu());
  qr.clear();
}
function ky() {
  K.vmk?.fill(0), K.vmk = null, ft = null, Ho(), Gr(), K.freshSetup && (K.wrapMeta = null, K.freshSetup = !1, K.scopeId = null);
}
function Ay() {
  return ft !== null && Date.now() >= ft;
}
function hu() {
  return K.vmk && Ay() ? (Fe({ broadcast: !1, reason: "auto-lock" }), !1) : K.vmk !== null;
}
function yu(e, t = Ee()) {
  if (!K.vmk)
    throw new Error("vault VMK is not loaded");
  const n = t.windowSeconds * 1e3;
  return ft = Date.now() + n, Ho(), Hn = setTimeout(() => {
    Fe({ broadcast: !1, reason: "auto-lock" });
  }, n), cu(e), ft;
}
function _y() {
  const e = ft;
  if (!K.vmk || e === null) return () => {
  };
  Ho();
  let t = !1;
  return () => {
    if (t || !K.vmk) return;
    t = !0;
    const n = e - Date.now();
    if (n <= 0) {
      Fe({ broadcast: !1, reason: "auto-lock" });
      return;
    }
    Hn = setTimeout(() => {
      Fe({ broadcast: !1, reason: "auto-lock" });
    }, n);
  };
}
function Iy(e) {
  if (e instanceof m && e.retryable) return !0;
  const t = e instanceof Error ? e.message : String(e);
  return t === "operation-cancelled" || t === "operation-superseded" || t === "passkey-cancelled" || t === "vault-operation-aborted";
}
function By(e) {
  if (e.signal.aborted || e.epoch !== Uo || !K.vmk)
    throw fu();
}
async function Mo(e, t = {}) {
  if (!hu() || !K.vmk || !K.wrapMeta)
    throw new Error("vault-locked");
  const n = new Uint8Array(K.vmk), r = K.wrapMeta, i = Uo, o = new AbortController();
  qr.add(o);
  const s = {
    epoch: i,
    signal: o.signal,
    assertCurrent: () => By(s)
  };
  let a = null;
  try {
    s.assertCurrent();
    const c = await e(n, r, s);
    return s.assertCurrent(), t.renewOnSuccess !== !1 && yu("renew"), s.assertCurrent(), t.beforeSuccess && (a = _y(), await t.beforeSuccess(), s.assertCurrent(), a(), a = null), c;
  } catch (c) {
    throw Iy(c) || Fe({ broadcast: !0, reason: "manual-lock" }), c;
  } finally {
    a?.(), qr.delete(o), n.fill(0);
  }
}
function Py() {
  return K.vmk !== null && K.freshSetup;
}
function gu(e) {
  return pu(), K.vmk?.fill(0), K.vmk = e.vmk, K.wrapMeta = e.wrapMeta, K.freshSetup = e.freshSetup, K.scopeId = e.scopeId, du(e.scopeId), { state: "unlocked", expiresAt: yu("unlock", e.policy) };
}
function Fe(e = {}) {
  return e.broadcast && Sy(), pu(), ky(), cu(e.reason ?? "manual-lock"), { state: "locked" };
}
function pt(e) {
  return hu(), K.vmk ? {
    state: "unlocked",
    expiresAt: ft ?? void 0,
    ...K.freshSetup ? { freshSetup: !0 } : {}
  } : (e && (K.wrapMeta = Zc(e), K.scopeId = lu(K.wrapMeta)), K.wrapMeta ? { state: "locked" } : { state: "needs-setup" });
}
function No(e) {
  const t = Zc(e), n = lu(t);
  return K.wrapMeta = t, K.scopeId = n, { wrapMeta: t, scopeId: n };
}
function $y() {
  Fe({ broadcast: !1, reason: "unload" }), Gr();
}
const gr = "Avibe Vault", ra = "avibe-vault";
function Ye(e) {
  return typeof e == "object" && e !== null ? e : null;
}
function It(e) {
  const t = new ArrayBuffer(e.byteLength);
  return new Uint8Array(t).set(e), t;
}
function wu() {
  return It(crypto.getRandomValues(new Uint8Array(32)));
}
function Oy(e) {
  try {
    return pe(e);
  } catch {
    return null;
  }
}
function qn(e, t) {
  if (e instanceof ArrayBuffer || ArrayBuffer.isView(e))
    return It(Gc(e));
  if (typeof e == "string") {
    const n = Oy(e);
    return It(n ?? new TextEncoder().encode(e));
  }
  if (Array.isArray(e))
    return It(Uint8Array.from(e));
  if (t !== void 0)
    return It(new TextEncoder().encode(t));
  throw new Error("webauthn bytes are missing");
}
function Ty(e) {
  const t = qn(e);
  if (t.byteLength === 0 || t.byteLength > 64)
    throw new Error("vault user handle must be 1-64 bytes");
  return t;
}
function Wr(e) {
  if (Array.isArray(e))
    return e.map((t) => {
      const n = Ye(t);
      if (!n || n.type !== "public-key")
        throw new Error("invalid WebAuthn credential descriptor");
      return {
        type: "public-key",
        id: qn(n.id),
        ...Array.isArray(n.transports) ? { transports: n.transports } : {}
      };
    });
}
function ia(e) {
  return !Array.isArray(e) || e.length === 0 ? [
    { type: "public-key", alg: -7 },
    { type: "public-key", alg: -257 }
  ] : e.map((t) => {
    const n = Ye(t);
    if (!n || n.type !== "public-key" || typeof n.alg != "number")
      throw new Error("invalid WebAuthn pubKeyCredParams");
    return { type: "public-key", alg: n.alg };
  });
}
function oa(e) {
  return {
    ...Ye(e) ?? {},
    residentKey: "required",
    userVerification: "required"
  };
}
function sa(e) {
  if (e === "none" || e === "indirect" || e === "direct" || e === "enterprise") return e;
}
function Ly(e) {
  const t = Ye(e) ?? {};
  return { ...t, prf: Ye(t.prf) ?? {} };
}
function ht() {
  return window.location.hostname;
}
function Ry(e) {
  const t = Ye(e.authzCreationOptions), r = Ye(t?.webauthn) ?? t, i = typeof t?.challenge_id == "string" ? t.challenge_id : void 0, o = Ye(r?.rp), s = typeof o?.id == "string" ? o.id : void 0;
  if (s && s !== e.rpId)
    throw new Error("webauthn rp_id does not match sandbox host");
  if (!r)
    return {
      options: {
        rp: { name: gr, id: e.rpId },
        user: {
          id: Ty(e.vaultUserHandle),
          name: e.vaultUserHandle || ra,
          displayName: e.displayName || gr
        },
        challenge: wu(),
        pubKeyCredParams: ia(void 0),
        authenticatorSelection: oa(void 0),
        extensions: { prf: {} }
      }
    };
  const a = Ye(r.user);
  if (!a) throw new Error("webauthn user is missing");
  return {
    options: {
      rp: {
        name: typeof o?.name == "string" ? o.name : gr,
        id: e.rpId
      },
      user: {
        id: qn(a.id, e.vaultUserHandle),
        name: typeof a.name == "string" ? a.name : e.vaultUserHandle || ra,
        displayName: typeof a.displayName == "string" ? a.displayName : e.displayName || gr
      },
      challenge: qn(r.challenge),
      pubKeyCredParams: ia(r.pubKeyCredParams),
      authenticatorSelection: oa(r.authenticatorSelection),
      extensions: Ly(r.extensions),
      ...Wr(r.excludeCredentials) ? { excludeCredentials: Wr(r.excludeCredentials) } : {},
      ...typeof r.timeout == "number" ? { timeout: r.timeout } : {},
      ...sa(r.attestation) ? { attestation: sa(r.attestation) } : {}
    },
    ...i ? { challengeId: i } : {}
  };
}
function Cy(e) {
  if (e.length === 0) throw new Error("passkey-not-configured");
  if (e.length > 1) throw new Error("passkey-multiple-not-supported");
  return e[0];
}
function zy(e, t) {
  const n = Cy(e), r = {
    challenge: wu(),
    rpId: t,
    userVerification: "required",
    extensions: Ph(n.prfSalt)
  };
  return n.credentialId && (r.allowCredentials = [
    {
      type: "public-key",
      id: It(pe(n.credentialId))
    }
  ]), r;
}
function Uy(e, t, n) {
  const r = {
    challenge: It(n),
    rpId: t,
    userVerification: "required"
  }, i = e.filter((o) => o.credentialId).map((o) => ({ type: "public-key", id: It(pe(o.credentialId)) }));
  return i.length > 0 && (r.allowCredentials = i), r;
}
function Hy(e, t = ht()) {
  const n = Ye(e);
  if (!n) throw new Error("webauthn assertion options are missing");
  const r = typeof n.rpId == "string" ? n.rpId : typeof n.rp_id == "string" ? n.rp_id : void 0;
  if (r && r !== t)
    throw new Error("webauthn rpId does not match sandbox host");
  return {
    challenge: qn(n.challenge),
    rpId: t,
    userVerification: "required",
    ...Wr(n.allowCredentials) ? { allowCredentials: Wr(n.allowCredentials) } : {},
    ...typeof n.timeout == "number" ? { timeout: n.timeout } : {}
  };
}
function bu(e, t) {
  return {
    publicKey: e,
    ...t ? { signal: t } : {}
  };
}
function mu(e) {
  return {
    id: e.id,
    rawId: J(e.rawId),
    type: e.type
  };
}
function My(e) {
  const t = e.response, n = typeof t.getTransports == "function" ? t.getTransports() : [];
  return {
    ...mu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      attestationObject: J(t.attestationObject),
      transports: n
    }
  };
}
function Ny(e) {
  const t = e.response;
  return {
    ...mu(e),
    response: {
      clientDataJSON: J(t.clientDataJSON),
      authenticatorData: J(t.authenticatorData),
      signature: J(t.signature),
      userHandle: t.userHandle ? J(t.userHandle) : null
    }
  };
}
function Fy(e) {
  const n = e?.getClientExtensionResults()?.prf?.results?.first;
  if (!n) throw new Error("passkey-prf-unavailable");
  const r = Gc(n, "passkey PRF output");
  if (r.byteLength === 0) throw new Error("passkey-prf-unavailable");
  return r;
}
async function Fo(e, t, n) {
  const r = await navigator.credentials.get(
    bu(zy(e, t), n)
  );
  if (!r) throw new Error("passkey-cancelled");
  const i = Fy(r), o = J(r.rawId), s = e.find((a) => a.credentialId === o);
  return { prfOutput: i, prfSalt: s?.prfSalt ?? e[0].prfSalt, credentialId: o };
}
async function Ky(e, t, n, r) {
  if (!await navigator.credentials.get(
    bu(Uy(e, t, n), r)
  )) throw new Error("passkey-cancelled");
}
async function Dy(e) {
  const t = await navigator.credentials.get({
    publicKey: Hy(e)
  });
  if (!t) throw new Error("passkey-cancelled");
  return Ny(t);
}
const jy = /ancestor|not the same as its|cross-?origin|different origin/i;
function vu(e) {
  return typeof e?.name == "string" ? e.name : "";
}
function Vy(e) {
  return e instanceof Error || typeof e?.message == "string" ? e.message : typeof e == "string" ? e : "";
}
function xu(e) {
  const t = vu(e);
  return t === "SecurityError" || t === "NotSupportedError" || jy.test(Vy(e));
}
function qy(e) {
  return vu(e) === "NotAllowedError" && !xu(e);
}
function Ko(e) {
  const { options: t, challengeId: n } = Ry(e);
  return navigator.credentials.create({
    publicKey: t
  }).then((i) => {
    if (!i) throw new Error("passkey-cancelled");
    const o = J(i.rawId), s = My(i), a = e.authzCreationOptions !== void 0;
    return {
      credentialId: o,
      ...a ? { authzRegistration: n ? { challenge_id: n, credential: s } : s } : {}
    };
  });
}
const aa = {
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
let Zr = "en";
function Gy(e) {
  return e === "zh" ? "zh" : "en";
}
function Wy(e) {
  const t = Gy(e);
  return t === Zr ? !1 : (Zr = t, !0);
}
function Zy() {
  return Zr;
}
function Q(e, t = {}) {
  const n = aa[Zr], r = aa.en;
  return (n[e] ?? r[e] ?? e).replace(/\{\{(\w+)\}\}/g, (o, s) => String(t[s] ?? ""));
}
function Xy(e) {
  return JSON.stringify(e ?? {});
}
function ca(e) {
  if (!e) return {};
  try {
    const t = JSON.parse(e);
    return typeof t == "object" && t !== null ? t : {};
  } catch {
    return {};
  }
}
function Pe(e, t, n) {
  e.dataset.i18nKey = t, e.dataset.i18nParams = Xy(n), e.textContent = Q(t, n);
}
function Dt(e, t) {
  delete e.dataset.i18nKey, delete e.dataset.i18nParams, e.textContent = t;
}
function Yy(e = document) {
  e.querySelectorAll("[data-i18n-key]").forEach((t) => {
    const n = t.dataset.i18nKey;
    n && (t.textContent = Q(n, ca(t.dataset.i18nParams)));
  }), e.querySelectorAll("[data-i18n-placeholder-key]").forEach((t) => {
    const n = t.dataset.i18nPlaceholderKey;
    n && (t.placeholder = Q(n, ca(t.dataset.i18nPlaceholderParams)));
  });
}
const Jy = {
  sol: { symbol: "SOL", baseUnit: "lamports", decimals: 9 },
  eth: { symbol: "ETH", baseUnit: "wei", decimals: 18 }
};
function Qy(e, t) {
  const { symbol: n, baseUnit: r, decimals: i } = Jy[t];
  if (!/^(?:0|[1-9][0-9]*)$/.test(e)) return `${e} ${r}`;
  const o = e.padStart(i + 1, "0"), s = o.slice(-i).replace(/0+$/, "");
  return `${o.slice(0, -i)}${s ? `.${s}` : ""} ${n} (${e} ${r})`;
}
function ee(e, t) {
  const n = document.createElement(e);
  return n.className = t, n;
}
const eg = "http://www.w3.org/2000/svg";
function wr(e, t) {
  const n = document.createElementNS(eg, e);
  for (const [r, i] of Object.entries(t)) n.setAttribute(r, i);
  return n;
}
function tg() {
  const e = wr("svg", {
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
    wr("path", { d: "M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }),
    wr("path", { d: "M12 9v4.5" }),
    wr("path", { d: "M12 17h.01" })
  ), e;
}
function ng(e) {
  if (!e.notes?.length) return null;
  const t = ee("span", "review-notes");
  for (const n of e.notes) {
    const r = ee("span", "review-note");
    typeof n == "string" ? Pe(r, n) : Pe(r, n.key, { count: n.count }), t.append(r);
  }
  return t;
}
function ua(e) {
  const t = ee("span", "review-label");
  return Pe(t, e.label, e.index === void 0 ? void 0 : { index: e.index }), t;
}
function rg(e, t) {
  const n = ee("button", "review-copy");
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
function Ai(e) {
  const t = ee("div", e.raw ? "review-field review-field-raw" : "review-field"), n = ng(e);
  if (e.raw) {
    const o = ee("div", "review-raw-head"), s = ee("pre", "review-raw");
    return Dt(s, e.value), o.append(ua(e)), n && o.append(n), o.append(rg(s, e.value)), t.append(o, s), t;
  }
  const r = ee("div", "review-value"), i = ee("span", "review-mono");
  return Dt(i, e.native ? Qy(e.value, e.native) : e.value), r.append(i), n && r.append(n), t.append(ua(e), r), t;
}
function la(e, t, n) {
  const r = ee("section", "review-group"), i = ee("h2", "review-group-title");
  return Pe(i, e, t === void 0 ? void 0 : { index: t }), r.append(i, ...n), r;
}
function ig(e, t, n = {}) {
  Dt(e, "");
  const r = ee("div", "review"), i = ee("div", "review-heading"), o = ee("p", "review-kind");
  if (Pe(o, t.kind), i.append(o), n.session) {
    const l = ee("p", "review-session"), d = ee("span", "review-session-label");
    Pe(d, "context.session");
    const h = ee("span", "review-session-value");
    Dt(h, n.session), l.append(d, h), i.append(l);
  }
  const s = ee("div", "review-summary");
  if (s.append(Ai(t.signer), ...t.summary.map(Ai)), r.append(i, s), t.undecoded) {
    const l = ee("p", "review-notice"), d = ee("span", "review-notice-text");
    Pe(d, "review.notice"), l.append(tg(), d), r.append(l);
  }
  const a = ee("details", "review-details"), c = ee("summary", "review-details-toggle");
  Pe(c, "review.details");
  const u = ee("div", "review-details-body");
  n.rows && u.append(la("review.group.request", void 0, [n.rows]));
  for (const l of t.details) u.append(la(l.title, l.index, l.fields.map(Ai)));
  a.append(c, u), r.append(a), e.append(r);
}
let Do = null;
function og(e) {
  Do = e;
}
function sg() {
  Do?.("ui.show");
}
function ag() {
  Do?.("ui.hide");
}
function cg() {
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
function Eu(e) {
  e.querySelectorAll(".dynamic").forEach((t) => t.remove());
}
function de(e) {
  return { text: e };
}
function Gn(e, t) {
  return { key: e, params: t };
}
function G(e, t) {
  if (typeof t == "string") {
    Pe(e, t);
    return;
  }
  if ("text" in t) {
    Dt(e, t.text);
    return;
  }
  Pe(e, t.key, t.params);
}
function jo(e, t, n) {
  const r = cg();
  return document.body.classList.add("interactive"), document.body.classList.remove("confirming"), sg(), r.card.classList.remove("confirm-card"), G(r.title, e), G(r.subtitle, t), n ? G(r.body, n) : Dt(r.body, ""), Eu(r.card), r;
}
function Vo() {
  document.body.classList.remove("interactive"), document.body.classList.remove("confirming");
  const e = document.getElementById("page")?.querySelector(".card");
  e && (e.classList.remove("confirm-card"), Eu(e)), ag();
}
function rn(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic"), (e.querySelector(".card-scroll") ?? e).append(t);
}
function da(e, t) {
  t instanceof HTMLElement && t.classList.add("dynamic");
  const n = e.querySelector(".card-footer");
  if (!n) throw new Error("sandbox confirmation footer is unavailable");
  n.append(t);
}
function ug(e) {
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
function Su(e) {
  const t = document.createElement("div");
  t.className = "confirmation-details";
  for (const n of e.rows) {
    const r = document.createElement("div");
    r.className = "detail-row";
    const i = document.createElement("span");
    i.className = "detail-label", G(i, n.label), r.append(i, ug(n)), t.append(r);
  }
  return t;
}
function lg(e, t, n) {
  if (Dt(e, ""), e.append(Su(t)), n) {
    const r = document.createElement("p");
    r.className = "confirmation-note", G(r, n), e.append(r);
  }
}
function Wn(e) {
  const t = document.createElement("button");
  return t.type = "button", t.className = "action dynamic", G(t, e), t;
}
function ku(e = de("")) {
  const t = document.createElement("p");
  return t.className = "setup-status dynamic", G(t, e), t;
}
let br = null;
function qo() {
  return new Error("operation-superseded");
}
function Mn(e) {
  const t = e.reason;
  return t instanceof Error ? t : qo();
}
function fa(e) {
  if (e?.aborted) throw Mn(e);
}
function nr(e) {
  br?.abort(qo());
  const t = new AbortController();
  return br = t, Promise.resolve().then(() => e(t.signal)).finally(() => {
    br === t && (br = null);
  });
}
async function dg(e) {
  return nr(async (t) => {
    fa(t), fa(e.abortSignal);
    const n = new TextDecoder().decode(e.plaintext), r = jo("plaintext.title", de(e.name), "plaintext.body"), i = document.createElement("pre");
    i.className = "plaintext dynamic", i.textContent = n;
    const o = Wn("common.done"), s = Wn("plaintext.copy");
    s.classList.add("secondary");
    const a = ku("plaintext.copyWarning");
    rn(r.card, i), rn(r.card, a), rn(r.card, s), rn(r.card, o);
    try {
      await new Promise((c, u) => {
        if (t.aborted) {
          u(Mn(t));
          return;
        }
        if (e.abortSignal?.aborted) {
          u(Mn(e.abortSignal));
          return;
        }
        let l = !1, d = () => {
        }, h = null, f = null, w = !e.prepareCopy;
        const g = () => {
          h?.abort(qo());
        }, p = (I) => {
          l || (l = !0, d(), g(), I());
        }, y = (I) => {
          p(() => u(Mn(I)));
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
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (w = !0, G(a, "plaintext.copyReady"), s.disabled = !1);
          }) : S().then(() => {
            I.signal.aborted || t.aborted || e.abortSignal?.aborted || (e.prepareCopy && (w = !1), G(a, "plaintext.copiedBody"), s.disabled = !1);
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
      Vo();
    }
  });
}
function Go(e, t, n, r) {
  const i = jo(e.title, e.subtitle, e.review ? void 0 : e.body);
  document.body.classList.add("confirming"), i.card.classList.add("confirm-card"), e.review ? ig(i.body, e.review, {
    session: e.reviewSession,
    rows: e.details && Su(e.details)
  }) : e.details && lg(i.body, e.details, e.body);
  const o = Wn(e.confirmLabel), s = Wn("common.cancel");
  return s.classList.add("secondary"), da(i.card, s), da(i.card, o), o.disabled = !0, new Promise((a, c) => {
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
      f(() => c(Mn(t)));
    }, f = (w) => {
      u || (u = !0, clearTimeout(d), l?.dispose(), t.removeEventListener("abort", h), Vo(), w());
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
function Xr(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function fg(e) {
  return new Promise((t, n) => {
    const r = () => n(Xr(e));
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function pa(e) {
  if (e?.aborted) throw Xr(e);
}
async function Au(e) {
  const t = No(e.wrapMeta), n = _o(t.wrapMeta);
  let r;
  try {
    const i = await Promise.race([
      Fo(n, e.currentRpId, e.abortSignal).then(
        (o) => {
          if (e.abortSignal?.aborted)
            throw o.prfOutput.fill(0), Xr(e.abortSignal);
          return o;
        },
        (o) => {
          throw e.abortSignal?.aborted ? Xr(e.abortSignal) : o;
        }
      ),
      ...e.abortSignal ? [fg(e.abortSignal)] : []
    ]);
    return r = i.prfOutput, await _u({
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
async function _u(e) {
  const t = No(e.wrapMeta);
  let n;
  try {
    pa(e.abortSignal), n = await Lh(t.wrapMeta, {
      kind: "passkey",
      prfOutput: e.assertion.prfOutput,
      prfSalt: e.assertion.prfSalt
    }), pa(e.abortSignal);
    const r = gu({
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
function pg(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function hg(e, t) {
  if (e != null) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function ha(e, t) {
  if (typeof e != "string" || e.length === 0)
    throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function yg(e) {
  const t = pg(e), n = t.kind === "keypair" ? "keypair" : t.kind === "static" ? "static" : null;
  if (!n) throw new m("invalid_payload", "kind must be static or keypair");
  const r = ha(t.name, "name");
  if (t.rootMetadata !== void 0) throw new m("invalid_payload", "seal cannot set vault root metadata");
  const i = hg(t.wrapMeta, "wrapMeta");
  if (n === "static") {
    if (t.curve !== void 0) throw new m("invalid_payload", "static seal cannot carry a curve");
    if (t.inputMode !== "parent-value")
      throw new m("invalid_payload", "static seal inputMode must be parent-value");
    return {
      name: r,
      kind: "static",
      inputMode: "parent-value",
      value: ha(t.value, "value"),
      wrapMeta: i
    };
  }
  if (t.inputMode !== void 0)
    throw new m("invalid_payload", "keypair seal is generate-only and does not accept inputMode");
  if (t.value !== void 0)
    throw new m("invalid_payload", "keypair seal cannot accept parent-provided private key material");
  let o;
  try {
    o = wn(t.curve);
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
function Wo(e) {
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
const gg = 512, Iu = "avibe-vault-signed-context-replay:v2", wg = "avibe-vault-signed-context-replay:v2", bg = "avibe-vault-signed-context-replay:v2", Ne = /* @__PURE__ */ new Map();
let ya = !1, Ln = null;
function Re(e) {
  return typeof e == "object" && e !== null;
}
function ut(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function An(e, t) {
  if (e !== void 0) {
    if (typeof e != "string") throw new m("invalid_payload", `${t} must be a string`);
    return e;
  }
}
function _i(e, t) {
  if (e !== void 0) {
    if (!Array.isArray(e) || !e.every((n) => typeof n == "string"))
      throw new m("invalid_payload", `${t} must be a string array`);
    return e;
  }
}
function mg(e, t) {
  if (e !== "static" && e !== "keypair") throw new m("invalid_payload", `${t} must be static or keypair`);
  return e;
}
function vg(e) {
  if (e !== "agent-deliver" && e !== "sign" && e !== "reveal")
    throw new m("invalid_payload", "context purpose is invalid");
  return e;
}
function Wi(e, t) {
  if (typeof e != "number" || !Number.isSafeInteger(e) || e < 0)
    throw new m("invalid_payload", `${t} must be a non-negative integer`);
  return e;
}
function xg(e, t) {
  if (!Array.isArray(e) || e.length < 16 || e.length > 128 || !e.every((n) => Number.isInteger(n) && n >= 0 && n <= 255))
    throw new m("invalid_payload", `${t} must contain 16..128 byte integers`);
  return e;
}
function Zo(e, t) {
  if (!Re(e)) throw new m(t, "agent delivery context.release must be an object");
  return {
    name: ut(e.name, "context.release.name"),
    ttlSecs: Wi(e.ttlSecs, "context.release.ttlSecs"),
    approvalNonce: xg(e.approvalNonce, "context.release.approvalNonce"),
    approvalExpiresAtUnix: Wi(e.approvalExpiresAtUnix, "context.release.approvalExpiresAtUnix"),
    operationHash: ut(e.operationHash, "context.release.operationHash")
  };
}
function $t(e) {
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map($t).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${$t(t[n])}`).join(",")}}`;
}
function Xo(e) {
  const t = Re(e) ? e : null;
  if (!t) throw new m("invalid_payload", "context must be an object");
  if (t.v !== 2) throw new m("invalid_payload", "context version must be 2");
  const n = vg(t.purpose);
  ut(t.requestId, "context.requestId"), t.grantId !== void 0 && An(t.grantId, "context.grantId");
  const r = Re(t.display) ? t.display : null;
  if (!r) throw new m("invalid_payload", "context.display must be an object");
  if (!Array.isArray(r.secrets) || r.secrets.length === 0)
    throw new m("invalid_payload", "context.display.secrets must be a non-empty array");
  r.secrets.forEach((c, u) => {
    if (!Re(c)) throw new m("invalid_payload", `context.display.secrets[${u}] must be an object`);
    ut(c.name, `context.display.secrets[${u}].name`), mg(c.kind, `context.display.secrets[${u}].kind`);
  }), r.sessionLabel !== void 0 && An(r.sessionLabel, "context.display.sessionLabel"), r.command !== void 0 && An(r.command, "context.display.command"), r.egress !== void 0 && An(r.egress, "context.display.egress");
  const i = r.source;
  if (i !== void 0) {
    if (!Re(i)) throw new m("invalid_payload", "context.display.source must be an object");
    i.env !== void 0 && _i(i.env, "context.display.source.env"), i.tags !== void 0 && _i(i.tags, "context.display.source.tags"), i.skills !== void 0 && _i(i.skills, "context.display.source.skills");
  }
  r.grantTtlSeconds !== void 0 && Wi(r.grantTtlSeconds, "context.display.grantTtlSeconds");
  const o = Re(t.signature) ? t.signature : null;
  if (!o) throw new m("invalid_payload", "context.signature must be an object");
  if (o.alg !== "ed25519") throw new m("invalid_payload", "context signature alg must be ed25519");
  ut(o.keyId, "context.signature.keyId"), ut(o.value, "context.signature.value");
  const s = t.agent;
  if (s !== void 0) {
    if (!Re(s)) throw new m("invalid_payload", "context.agent must be an object");
    const c = Re(s.publicKey) ? s.publicKey : null;
    if (!c) throw new m("invalid_payload", "context.agent.publicKey must be an object");
    ut(c.public_key, "context.agent.publicKey.public_key"), c.fingerprint !== void 0 && An(c.fingerprint, "context.agent.publicKey.fingerprint"), ut(s.fingerprint, "context.agent.fingerprint");
  }
  const a = t.release;
  if (n === "agent-deliver") {
    const c = Zo(a, "invalid_payload");
    if (r.grantTtlSeconds === void 0)
      throw new m("invalid_payload", "agent delivery context must display its release TTL");
    if (r.grantTtlSeconds !== c.ttlSecs)
      throw new m("invalid_payload", "signed release TTL does not match display TTL");
  } else if (a !== void 0 && !Re(a))
    throw new m("invalid_payload", "context.release must be an object");
  return ut(t.expiresAt, "context.expiresAt"), t;
}
function ui(e) {
  const { signature: t, ...n } = e;
  return $t(n);
}
function Zi(e) {
  if (e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", `${e.expectedPurpose} context has the wrong purpose`);
  if (!e.context.display.secrets.some(
    (n) => n.name === e.secret.name && n.kind === e.secret.kind
  )) {
    const n = e.secret.kind === "keypair" ? "key" : "secret";
    throw new m("invalid_context", `${e.expectedPurpose} context does not cover the requested ${n}`);
  }
}
function Yr(e) {
  if (e.expectedPurpose && e.context.purpose !== e.expectedPurpose)
    throw new m("invalid_context", "signed context purpose does not match operation");
  const t = e.now ?? Date.now(), n = Date.parse(e.context.expiresAt);
  if (!Number.isFinite(n) || n <= t)
    throw new m("context_expired", "signed context is expired", !0);
  if (!ny({
    rootMetadata: e.rootMetadata,
    keyId: e.context.signature.keyId,
    signature: e.context.signature.value,
    message: ui(e.context)
  })) throw new m("invalid_context_signature", "signed context signature is invalid");
  if (e.context.purpose === "agent-deliver" && Zo(e.context.release, "invalid_context").approvalExpiresAtUnix * 1e3 <= t)
    throw new m("context_expired", "signed release approval is expired", !0);
}
function Yo(e) {
  for (const [t, n] of Ne)
    n <= e && Ne.delete(t);
}
function Eg() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function pn() {
  return typeof window < "u";
}
function Jo() {
  return new m("context_replay_state_unavailable", "signed context replay state is unavailable", !0);
}
function Bu(e) {
  const t = Eg();
  if (!t && e && pn()) throw Jo();
  return t;
}
function Pu(e, t) {
  const n = /* @__PURE__ */ new Map();
  if (!Re(e) || e.version !== 2 || !Array.isArray(e.entries)) return n;
  for (const r of e.entries) {
    if (!Array.isArray(r) || r.length !== 2) continue;
    const [i, o] = r;
    typeof i != "string" || i.length === 0 || typeof o != "number" || !Number.isFinite(o) || o > t && n.set(i, Math.max(n.get(i) ?? 0, o));
  }
  return n;
}
function Qo(e = Date.now(), t = !1) {
  Yo(e);
  const n = Bu(t);
  if (n)
    try {
      n.setItem(Iu, JSON.stringify({ version: 2, entries: [...Ne] }));
    } catch {
      if (t && pn()) throw Jo();
    }
}
function $u(e, t = Date.now(), n = !0) {
  for (const [r, i] of e)
    i > t && Ne.set(r, Math.max(Ne.get(r) ?? 0, i));
  n && Qo(t);
}
function es() {
  if (!(Ln || typeof BroadcastChannel > "u"))
    try {
      Ln = new BroadcastChannel(wg), Ln.addEventListener("message", (e) => {
        const t = Re(e.data) ? e.data : null;
        !t || t.type !== "signed-context-consumed" || $u(Pu({ version: 2, entries: t.entries }, Date.now()));
      });
    } catch {
      Ln = null;
    }
}
function Sg(e = Date.now()) {
  ya || (es(), Ou(e, pn()), ya = !0);
}
function Ou(e = Date.now(), t = !1) {
  es();
  const n = Bu(t);
  if (n)
    try {
      $u(Pu(JSON.parse(n.getItem(Iu) ?? "null"), e), e, !1), Yo(e);
    } catch {
      if (t && pn()) throw Jo();
      Qo(e);
    }
}
function kg(e) {
  es();
  try {
    Ln?.postMessage({ type: "signed-context-consumed", entries: e });
  } catch {
  }
}
function Ag() {
  const t = globalThis.navigator?.locks;
  return !t || typeof t != "object" || typeof t.request != "function" ? null : t;
}
async function _g(e) {
  const t = Ag();
  if (t) return await t.request(bg, { mode: "exclusive" }, e);
  if (typeof window < "u")
    throw new m("context_replay_lock_unavailable", "signed context replay lock is unavailable", !0);
  return await e();
}
function Tu(e, t) {
  Sg(t);
  const n = /* @__PURE__ */ new Map();
  for (const r of e) {
    const i = Date.parse(r.expiresAt);
    if (!Number.isFinite(i) || i <= t)
      throw new m("context_expired", "signed context is expired", !0);
    n.set(r.requestId, Math.max(n.get(r.requestId) ?? 0, i));
  }
  Yo(t);
  for (const r of n.keys())
    if (Ne.has(r))
      throw new m("context_replayed", "signed context requestId was already used", !0);
  if (Ne.size + n.size > gg)
    throw new m("context_replay_cache_full", "signed context replay cache is full", !0);
  return n;
}
function Jr(e, t = Date.now()) {
  Tu(e, t);
}
async function li(e, t = Date.now()) {
  const n = [...e];
  await _g(() => {
    Ou(t, pn());
    const r = Tu(n, t), i = /* @__PURE__ */ new Map();
    for (const o of r.keys()) i.set(o, Ne.get(o));
    for (const [o, s] of r) Ne.set(o, s);
    try {
      Qo(t, pn());
    } catch (o) {
      for (const [s, a] of i)
        a === void 0 ? Ne.delete(s) : Ne.set(s, a);
      throw o;
    }
    kg([...r]);
  });
}
async function Ig(e, t) {
  if (e.purpose !== "agent-deliver") throw new m("invalid_context", "context is not an agent delivery");
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  const n = Zo(e.release, "invalid_context");
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
async function Pg(e) {
  const t = e.map((n) => ui(n));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode($t(t))));
}
function ga(e) {
  return $t(e.display);
}
const $g = "1.2.3";
let Te = class Xi extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof Xi ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof Xi && n.cause.docsPath || n.docsPath, o = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...i ? [`Docs: https://abitype.dev${i}`] : [],
      ...r ? [`Details: ${r}`] : [],
      `Version: abitype@${$g}`
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
function yt(e, t) {
  return e.exec(t)?.groups;
}
const Lu = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, Ru = /^u?int(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/, Cu = /^\(.+?\).*?$/, wa = /^tuple(?<array>(\[(\d*)\])*)$/;
function Yi(e) {
  let t = e.type;
  if (wa.test(e.type) && "components" in e) {
    t = "(";
    const n = e.components.length;
    for (let i = 0; i < n; i++) {
      const o = e.components[i];
      t += Yi(o), i < n - 1 && (t += ", ");
    }
    const r = yt(wa, e.type);
    return t += `)${r?.array || ""}`, Yi({
      ...e,
      type: t
    });
  }
  return "indexed" in e && e.indexed && (t = `${t} indexed`), e.name ? `${t} ${e.name}` : t;
}
function _n(e) {
  let t = "";
  const n = e.length;
  for (let r = 0; r < n; r++) {
    const i = e[r];
    t += Yi(i), r !== n - 1 && (t += ", ");
  }
  return t;
}
function Og(e) {
  return e.type === "function" ? `function ${e.name}(${_n(e.inputs)})${e.stateMutability && e.stateMutability !== "nonpayable" ? ` ${e.stateMutability}` : ""}${e.outputs?.length ? ` returns (${_n(e.outputs)})` : ""}` : e.type === "event" ? `event ${e.name}(${_n(e.inputs)})` : e.type === "error" ? `error ${e.name}(${_n(e.inputs)})` : e.type === "constructor" ? `constructor(${_n(e.inputs)})${e.stateMutability === "payable" ? " payable" : ""}` : e.type === "fallback" ? `fallback() external${e.stateMutability === "payable" ? " payable" : ""}` : "receive() external payable";
}
const zu = /^error (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function Tg(e) {
  return zu.test(e);
}
function Lg(e) {
  return yt(zu, e);
}
const Uu = /^event (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)$/;
function Rg(e) {
  return Uu.test(e);
}
function Cg(e) {
  return yt(Uu, e);
}
const Hu = /^function (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*)\((?<parameters>.*?)\)(?: (?<scope>external|public{1}))?(?: (?<stateMutability>pure|view|nonpayable|payable{1}))?(?: returns\s?\((?<returns>.*?)\))?$/;
function zg(e) {
  return Hu.test(e);
}
function Ug(e) {
  return yt(Hu, e);
}
const Mu = /^struct (?<name>[a-zA-Z$_][a-zA-Z0-9$_]*) \{(?<properties>.*?)\}$/;
function Nu(e) {
  return Mu.test(e);
}
function Hg(e) {
  return yt(Mu, e);
}
const Fu = /^constructor\((?<parameters>.*?)\)(?:\s(?<stateMutability>payable{1}))?$/;
function Mg(e) {
  return Fu.test(e);
}
function Ng(e) {
  return yt(Fu, e);
}
const Ku = /^fallback\(\) external(?:\s(?<stateMutability>payable{1}))?$/;
function Fg(e) {
  return Ku.test(e);
}
function Kg(e) {
  return yt(Ku, e);
}
const Dg = /^receive\(\) external payable$/;
function jg(e) {
  return Dg.test(e);
}
const Vg = /* @__PURE__ */ new Set(["indexed"]), Ji = /* @__PURE__ */ new Set([
  "calldata",
  "memory",
  "storage"
]);
class qg extends Te {
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
class Gg extends Te {
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
class Wg extends Te {
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
class Zg extends Te {
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
class Xg extends Te {
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
class Yg extends Te {
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
class Jg extends Te {
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
class bn extends Te {
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
class Qg extends Te {
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
class ew extends Te {
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
class tw extends Te {
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
class nw extends Te {
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
function rw(e, t, n) {
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
const Ii = /* @__PURE__ */ new Map([
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
function iw(e, t = {}) {
  if (zg(e))
    return ow(e, t);
  if (Rg(e))
    return sw(e, t);
  if (Tg(e))
    return aw(e, t);
  if (Mg(e))
    return cw(e, t);
  if (Fg(e))
    return uw(e);
  if (jg(e))
    return {
      type: "receive",
      stateMutability: "payable"
    };
  throw new Qg({ signature: e });
}
function ow(e, t = {}) {
  const n = Ug(e);
  if (!n)
    throw new bn({ signature: e, type: "function" });
  const r = ze(n.parameters), i = [], o = r.length;
  for (let a = 0; a < o; a++)
    i.push(jt(r[a], {
      modifiers: Ji,
      structs: t,
      type: "function"
    }));
  const s = [];
  if (n.returns) {
    const a = ze(n.returns), c = a.length;
    for (let u = 0; u < c; u++)
      s.push(jt(a[u], {
        modifiers: Ji,
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
function sw(e, t = {}) {
  const n = Cg(e);
  if (!n)
    throw new bn({ signature: e, type: "event" });
  const r = ze(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(jt(r[s], {
      modifiers: Vg,
      structs: t,
      type: "event"
    }));
  return { name: n.name, type: "event", inputs: i };
}
function aw(e, t = {}) {
  const n = Lg(e);
  if (!n)
    throw new bn({ signature: e, type: "error" });
  const r = ze(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(jt(r[s], { structs: t, type: "error" }));
  return { name: n.name, type: "error", inputs: i };
}
function cw(e, t = {}) {
  const n = Ng(e);
  if (!n)
    throw new bn({ signature: e, type: "constructor" });
  const r = ze(n.parameters), i = [], o = r.length;
  for (let s = 0; s < o; s++)
    i.push(jt(r[s], { structs: t, type: "constructor" }));
  return {
    type: "constructor",
    stateMutability: n.stateMutability ?? "nonpayable",
    inputs: i
  };
}
function uw(e) {
  const t = Kg(e);
  if (!t)
    throw new bn({ signature: e, type: "fallback" });
  return {
    type: "fallback",
    stateMutability: t.stateMutability ?? "nonpayable"
  };
}
const lw = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*(?:\spayable)?)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, dw = /^\((?<type>.+?)\)(?<array>(?:\[\d*?\])+?)?(?:\s(?<modifier>calldata|indexed|memory|storage{1}))?(?:\s(?<name>[a-zA-Z$_][a-zA-Z0-9$_]*))?$/, fw = /^u?int$/;
function jt(e, t) {
  const n = rw(e, t?.type, t?.structs);
  if (Ii.has(n))
    return Ii.get(n);
  const r = Cu.test(e), i = yt(r ? dw : lw, e);
  if (!i)
    throw new Wg({ param: e });
  if (i.name && hw(i.name))
    throw new Zg({ param: e, name: i.name });
  const o = i.name ? { name: i.name } : {}, s = i.modifier === "indexed" ? { indexed: !0 } : {}, a = t?.structs ?? {};
  let c, u = {};
  if (r) {
    c = "tuple";
    const d = ze(i.type), h = [], f = d.length;
    for (let w = 0; w < f; w++)
      h.push(jt(d[w], { structs: a }));
    u = { components: h };
  } else if (i.type in a)
    c = "tuple", u = { components: a[i.type] };
  else if (fw.test(i.type))
    c = `${i.type}256`;
  else if (i.type === "address payable")
    c = "address";
  else if (c = i.type, t?.type !== "struct" && !Du(c))
    throw new Gg({ type: c });
  if (i.modifier) {
    if (!t?.modifiers?.has?.(i.modifier))
      throw new Xg({
        param: e,
        type: t?.type,
        modifier: i.modifier
      });
    if (Ji.has(i.modifier) && !yw(c, !!i.array))
      throw new Yg({
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
  return Ii.set(n, l), l;
}
function ze(e, t = [], n = "", r = 0) {
  const i = e.trim().length;
  for (let o = 0; o < i; o++) {
    const s = e[o], a = e.slice(o + 1);
    switch (s) {
      case ",":
        return r === 0 ? ze(a, [...t, n.trim()]) : ze(a, t, `${n}${s}`, r);
      case "(":
        return ze(a, t, `${n}${s}`, r + 1);
      case ")":
        return ze(a, t, `${n}${s}`, r - 1);
      default:
        return ze(a, t, `${n}${s}`, r);
    }
  }
  if (n === "")
    return t;
  if (r !== 0)
    throw new nw({ current: n, depth: r });
  return t.push(n.trim()), t;
}
function Du(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || Lu.test(e) || Ru.test(e);
}
const pw = /^(?:after|alias|anonymous|apply|auto|byte|calldata|case|catch|constant|copyof|default|defined|error|event|external|false|final|function|immutable|implements|in|indexed|inline|internal|let|mapping|match|memory|mutable|null|of|override|partial|private|promise|public|pure|reference|relocatable|return|returns|sizeof|static|storage|struct|super|supports|switch|this|true|try|typedef|typeof|var|view|virtual)$/;
function hw(e) {
  return e === "address" || e === "bool" || e === "function" || e === "string" || e === "tuple" || Lu.test(e) || Ru.test(e) || pw.test(e);
}
function yw(e, t) {
  return t || e === "bytes" || e === "string" || e === "tuple";
}
function gw(e) {
  const t = {}, n = e.length;
  for (let s = 0; s < n; s++) {
    const a = e[s];
    if (!Nu(a))
      continue;
    const c = Hg(a);
    if (!c)
      throw new bn({ signature: a, type: "struct" });
    const u = c.properties.split(";"), l = [], d = u.length;
    for (let h = 0; h < d; h++) {
      const w = u[h].trim();
      if (!w)
        continue;
      const g = jt(w, {
        type: "struct"
      });
      l.push(g);
    }
    if (!l.length)
      throw new ew({ signature: a });
    t[c.name] = l;
  }
  const r = {}, i = Object.entries(t), o = i.length;
  for (let s = 0; s < o; s++) {
    const [a, c] = i[s];
    r[a] = ju(c, t);
  }
  return r;
}
const ww = /^(?<type>[a-zA-Z$_][a-zA-Z0-9$_]*)(?<array>(?:\[\d*?\])+?)?$/;
function ju(e = [], t = {}, n = /* @__PURE__ */ new Set()) {
  const r = [], i = e.length;
  for (let o = 0; o < i; o++) {
    const s = e[o];
    if (Cu.test(s.type))
      r.push(s);
    else {
      const c = yt(ww, s.type);
      if (!c?.type)
        throw new Jg({ abiParameter: s });
      const { array: u, type: l } = c;
      if (l in t) {
        if (n.has(l))
          throw new tw({ type: l });
        r.push({
          ...s,
          type: `tuple${u ?? ""}`,
          components: ju(t[l], t, /* @__PURE__ */ new Set([...n, l]))
        });
      } else if (Du(l))
        r.push(s);
      else
        throw new qg({ type: l });
    }
  }
  return r;
}
function bw(e) {
  const t = gw(e), n = [], r = e.length;
  for (let i = 0; i < r; i++) {
    const o = e[i];
    Nu(o) || n.push(iw(o, t));
  }
  return n;
}
function mw(e, { includeName: t = !1 } = {}) {
  if (e.type !== "function" && e.type !== "event" && e.type !== "error")
    throw new Ow(e.type);
  return `${e.name}(${ts(e.inputs, { includeName: t })})`;
}
function ts(e, { includeName: t = !1 } = {}) {
  return e ? e.map((n) => vw(n, { includeName: t })).join(t ? ", " : ",") : "";
}
function vw(e, { includeName: t }) {
  return e.type.startsWith("tuple") ? `(${ts(e.components, { includeName: t })})${e.type.slice(5)}` : e.type + (t && e.name ? ` ${e.name}` : "");
}
function rr(e, { strict: t = !0 } = {}) {
  return !e || typeof e != "string" ? !1 : t ? /^0x[0-9a-fA-F]*$/.test(e) : e.startsWith("0x");
}
function le(e) {
  return rr(e, { strict: !1 }) ? Math.ceil((e.length - 2) / 2) : e.length;
}
const Vu = "2.54.6";
let Bi = {
  getDocsUrl: ({ docsBaseUrl: e, docsPath: t = "", docsSlug: n }) => t ? `${e ?? "https://viem.sh"}${t}${n ? `#${n}` : ""}` : void 0,
  version: `viem@${Vu}`
};
class M extends Error {
  constructor(t, n = {}) {
    const r = n.cause instanceof M ? n.cause.details : n.cause?.message ? n.cause.message : n.details, i = n.cause instanceof M && n.cause.docsPath || n.docsPath, o = Bi.getDocsUrl?.({ ...n, docsPath: i }), s = [
      t || "An error occurred.",
      "",
      ...n.metaMessages ? [...n.metaMessages, ""] : [],
      ...o ? [`Docs: ${o}`] : [],
      ...r ? [`Details: ${r}`] : [],
      ...Bi.version ? [`Version: ${Bi.version}`] : []
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
    }), this.details = r, this.docsPath = i, this.metaMessages = n.metaMessages, this.name = n.name ?? this.name, this.shortMessage = t, this.version = Vu;
  }
  walk(t) {
    return qu(this, t);
  }
}
function qu(e, t) {
  return t?.(e) ? e : e && typeof e == "object" && "cause" in e && e.cause !== void 0 ? qu(e.cause, t) : t ? null : e;
}
class xw extends M {
  constructor({ data: t, params: n, size: r }) {
    super([`Data size of ${r} bytes is too small for given parameters.`].join(`
`), {
      metaMessages: [
        `Params: (${ts(n, { includeName: !0 })})`,
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
class Ew extends M {
  constructor({ cause: t } = {}) {
    super('Cannot decode zero data ("0x") with ABI parameters.', {
      name: "AbiDecodingZeroDataError",
      cause: t
    });
  }
}
class Sw extends M {
  constructor({ expectedLength: t, givenLength: n, type: r }) {
    super([
      `ABI encoding array length mismatch for type ${r}.`,
      `Expected length: ${t}`,
      `Given length: ${n}`
    ].join(`
`), { name: "AbiEncodingArrayLengthMismatchError" });
  }
}
class kw extends M {
  constructor({ expectedSize: t, value: n }) {
    super(`Size of bytes "${n}" (bytes${le(n)}) does not match expected size (bytes${t}).`, { name: "AbiEncodingBytesSizeMismatchError" });
  }
}
class Aw extends M {
  constructor({ expectedLength: t, givenLength: n }) {
    super([
      "ABI encoding params/values length mismatch.",
      `Expected length (params): ${t}`,
      `Given length (values): ${n}`
    ].join(`
`), { name: "AbiEncodingLengthMismatchError" });
  }
}
class _w extends M {
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
class Iw extends M {
  constructor({ expectedSize: t, givenSize: n }) {
    super(`Expected bytes${t}, got bytes${n}.`, {
      name: "BytesSizeMismatchError"
    });
  }
}
class Bw extends M {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid encoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiEncodingType" });
  }
}
class Pw extends M {
  constructor(t, { docsPath: n }) {
    super([
      `Type "${t}" is not a valid decoding type.`,
      "Please provide a valid ABI type."
    ].join(`
`), { docsPath: n, name: "InvalidAbiDecodingType" });
  }
}
class $w extends M {
  constructor(t) {
    super([`Value "${t}" is not a valid array.`].join(`
`), {
      name: "InvalidArrayError"
    });
  }
}
class Ow extends M {
  constructor(t) {
    super([
      `"${t}" is not a valid definition type.`,
      'Valid types: "function", "event", "error"'
    ].join(`
`), { name: "InvalidDefinitionTypeError" });
  }
}
class Gu extends M {
  constructor({ offset: t, position: n, size: r }) {
    super(`Slice ${n === "start" ? "starting" : "ending"} at offset "${t}" is out-of-bounds (size: ${r}).`, { name: "SliceOffsetOutOfBoundsError" });
  }
}
class Wu extends M {
  constructor({ size: t, targetSize: n, type: r }) {
    super(`${r.charAt(0).toUpperCase()}${r.slice(1).toLowerCase()} size (${t}) exceeds padding size (${n}).`, { name: "SizeExceedsPaddingSizeError" });
  }
}
function mn(e, { dir: t, size: n = 32 } = {}) {
  return typeof e == "string" ? Bt(e, { dir: t, size: n }) : Tw(e, { dir: t, size: n });
}
function Bt(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  const r = e.replace("0x", "");
  if (r.length > n * 2)
    throw new Wu({
      size: Math.ceil(r.length / 2),
      targetSize: n,
      type: "hex"
    });
  return `0x${r[t === "right" ? "padEnd" : "padStart"](n * 2, "0")}`;
}
function Tw(e, { dir: t, size: n = 32 } = {}) {
  if (n === null)
    return e;
  if (e.length > n)
    throw new Wu({
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
class ns extends M {
  constructor({ max: t, min: n, signed: r, size: i, value: o }) {
    super(`Number "${o}" is not in safe ${i ? `${i * 8}-bit ${r ? "signed" : "unsigned"} ` : ""}integer range ${t ? `(${n} to ${t})` : `(above ${n})`}`, { name: "IntegerOutOfRangeError" });
  }
}
class Lw extends M {
  constructor(t) {
    super(`Bytes value "${t}" is not a valid boolean. The bytes array must contain a single byte of either a 0 or 1 value.`, {
      name: "InvalidBytesBooleanError"
    });
  }
}
class Rw extends M {
  constructor({ givenSize: t, maxSize: n }) {
    super(`Size cannot exceed ${n} bytes. Given size: ${t} bytes.`, { name: "SizeOverflowError" });
  }
}
function Zn(e, { dir: t = "left" } = {}) {
  let n = typeof e == "string" ? e.replace("0x", "") : e, r = 0;
  for (let i = 0; i < n.length - 1 && n[t === "left" ? i : n.length - i - 1].toString() === "0"; i++)
    r++;
  return n = t === "left" ? n.slice(r) : n.slice(0, n.length - r), typeof e == "string" ? (n.length === 1 && t === "right" && (n = `${n}0`), `0x${n.length % 2 === 1 ? `0${n}` : n}`) : n;
}
function rt(e, { size: t }) {
  if (le(e) > t)
    throw new Rw({
      givenSize: le(e),
      maxSize: t
    });
}
function Zu(e, t = {}) {
  const { signed: n } = t;
  t.size && rt(e, { size: t.size });
  const r = BigInt(e);
  if (!n)
    return r;
  const i = (e.length - 2) / 2, o = (1n << BigInt(i) * 8n - 1n) - 1n;
  return r <= o ? r : r - BigInt(`0x${"f".padStart(i * 2, "f")}`) - 1n;
}
function Xu(e, t = {}) {
  const n = Zu(e, t), r = Number(n);
  if (!Number.isSafeInteger(r))
    throw new ns({
      max: `${Number.MAX_SAFE_INTEGER}`,
      min: `${Number.MIN_SAFE_INTEGER}`,
      signed: t.signed,
      size: t.size,
      value: `${n}n`
    });
  return r;
}
const Cw = /* @__PURE__ */ Array.from({ length: 256 }, (e, t) => t.toString(16).padStart(2, "0"));
function Xn(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? F(e, t) : typeof e == "string" ? Ju(e, t) : typeof e == "boolean" ? Yu(e, t) : Ae(e, t);
}
function Yu(e, t = {}) {
  const n = `0x${Number(e)}`;
  return typeof t.size == "number" ? (rt(n, { size: t.size }), mn(n, { size: t.size })) : n;
}
function Ae(e, t = {}) {
  let n = "";
  for (let i = 0; i < e.length; i++)
    n += Cw[e[i]];
  const r = `0x${n}`;
  return typeof t.size == "number" ? (rt(r, { size: t.size }), mn(r, { dir: "right", size: t.size })) : r;
}
function F(e, t = {}) {
  const { signed: n, size: r } = t, i = BigInt(e);
  let o;
  r ? n ? o = (1n << BigInt(r) * 8n - 1n) - 1n : o = 2n ** (BigInt(r) * 8n) - 1n : typeof e == "number" && (o = BigInt(Number.MAX_SAFE_INTEGER));
  const s = typeof o == "bigint" && n ? -o - 1n : 0;
  if (o && i > o || i < s) {
    const c = typeof e == "bigint" ? "n" : "";
    throw new ns({
      max: o ? `${o}${c}` : void 0,
      min: `${s}${c}`,
      signed: n,
      size: r,
      value: `${e}${c}`
    });
  }
  const a = `0x${(n && i < 0 ? (1n << BigInt(r * 8)) + BigInt(i) : i).toString(16)}`;
  return r ? mn(a, { size: r }) : a;
}
const zw = /* @__PURE__ */ new TextEncoder();
function Ju(e, t = {}) {
  const n = zw.encode(e);
  return Ae(n, t);
}
const Uw = /* @__PURE__ */ new TextEncoder();
function rs(e, t = {}) {
  return typeof e == "number" || typeof e == "bigint" ? Mw(e, t) : typeof e == "boolean" ? Hw(e, t) : rr(e) ? Ot(e, t) : Qu(e, t);
}
function Hw(e, t = {}) {
  const n = new Uint8Array(1);
  return n[0] = Number(e), typeof t.size == "number" ? (rt(n, { size: t.size }), mn(n, { size: t.size })) : n;
}
const ct = {
  zero: 48,
  nine: 57,
  A: 65,
  F: 70,
  a: 97,
  f: 102
};
function ba(e) {
  if (e >= ct.zero && e <= ct.nine)
    return e - ct.zero;
  if (e >= ct.A && e <= ct.F)
    return e - (ct.A - 10);
  if (e >= ct.a && e <= ct.f)
    return e - (ct.a - 10);
}
function Ot(e, t = {}) {
  let n = e;
  t.size && (rt(n, { size: t.size }), n = mn(n, { dir: "right", size: t.size }));
  let r = n.slice(2);
  r.length % 2 && (r = `0${r}`);
  const i = r.length / 2, o = new Uint8Array(i);
  for (let s = 0, a = 0; s < i; s++) {
    const c = ba(r.charCodeAt(a++)), u = ba(r.charCodeAt(a++));
    if (c === void 0 || u === void 0)
      throw new M(`Invalid byte sequence ("${r[a - 2]}${r[a - 1]}" in "${r}").`);
    o[s] = c * 16 + u;
  }
  return o;
}
function Mw(e, t) {
  const n = F(e, t);
  return Ot(n);
}
function Qu(e, t = {}) {
  const n = Uw.encode(e);
  return typeof t.size == "number" ? (rt(n, { size: t.size }), mn(n, { dir: "right", size: t.size })) : n;
}
const mr = /* @__PURE__ */ BigInt(2 ** 32 - 1), ma = /* @__PURE__ */ BigInt(32);
function Nw(e, t = !1) {
  return t ? { h: Number(e & mr), l: Number(e >> ma & mr) } : { h: Number(e >> ma & mr) | 0, l: Number(e & mr) | 0 };
}
function Fw(e, t = !1) {
  const n = e.length;
  let r = new Uint32Array(n), i = new Uint32Array(n);
  for (let o = 0; o < n; o++) {
    const { h: s, l: a } = Nw(e[o], t);
    [r[o], i[o]] = [s, a];
  }
  return [r, i];
}
const Kw = (e, t, n) => e << n | t >>> 32 - n, Dw = (e, t, n) => t << n | e >>> 32 - n, jw = (e, t, n) => t << n - 32 | e >>> 64 - n, Vw = (e, t, n) => e << n - 32 | t >>> 64 - n;
/*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) */
function qw(e) {
  return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array";
}
function va(e) {
  if (!Number.isSafeInteger(e) || e < 0)
    throw new Error("positive integer expected, got " + e);
}
function Yn(e, ...t) {
  if (!qw(e))
    throw new Error("Uint8Array expected");
  if (t.length > 0 && !t.includes(e.length))
    throw new Error("Uint8Array expected of length " + t + ", got length=" + e.length);
}
function Qr(e, t = !0) {
  if (e.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (t && e.finished)
    throw new Error("Hash#digest() has already been called");
}
function el(e, t) {
  Yn(e);
  const n = t.outputLen;
  if (e.length < n)
    throw new Error("digestInto() expects output buffer of length at least " + n);
}
function Gw(e) {
  return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function Jn(...e) {
  for (let t = 0; t < e.length; t++)
    e[t].fill(0);
}
function Pi(e) {
  return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
function Ge(e, t) {
  return e << 32 - t | e >>> t;
}
const Ww = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function Zw(e) {
  return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function Xw(e) {
  for (let t = 0; t < e.length; t++)
    e[t] = Zw(e[t]);
  return e;
}
const xa = Ww ? (e) => e : Xw;
function Yw(e) {
  if (typeof e != "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(e));
}
function is(e) {
  return typeof e == "string" && (e = Yw(e)), Yn(e), e;
}
class tl {
}
function nl(e) {
  const t = (r) => e().update(is(r)).digest(), n = e();
  return t.outputLen = n.outputLen, t.blockLen = n.blockLen, t.create = () => e(), t;
}
const Jw = BigInt(0), In = BigInt(1), Qw = BigInt(2), eb = BigInt(7), tb = BigInt(256), nb = BigInt(113), rl = [], il = [], ol = [];
for (let e = 0, t = In, n = 1, r = 0; e < 24; e++) {
  [n, r] = [r, (2 * n + 3 * r) % 5], rl.push(2 * (5 * r + n)), il.push((e + 1) * (e + 2) / 2 % 64);
  let i = Jw;
  for (let o = 0; o < 7; o++)
    t = (t << In ^ (t >> eb) * nb) % tb, t & Qw && (i ^= In << (In << /* @__PURE__ */ BigInt(o)) - In);
  ol.push(i);
}
const sl = Fw(ol, !0), rb = sl[0], ib = sl[1], Ea = (e, t, n) => n > 32 ? jw(e, t, n) : Kw(e, t, n), Sa = (e, t, n) => n > 32 ? Vw(e, t, n) : Dw(e, t, n);
function ob(e, t = 24) {
  const n = new Uint32Array(10);
  for (let r = 24 - t; r < 24; r++) {
    for (let s = 0; s < 10; s++)
      n[s] = e[s] ^ e[s + 10] ^ e[s + 20] ^ e[s + 30] ^ e[s + 40];
    for (let s = 0; s < 10; s += 2) {
      const a = (s + 8) % 10, c = (s + 2) % 10, u = n[c], l = n[c + 1], d = Ea(u, l, 1) ^ n[a], h = Sa(u, l, 1) ^ n[a + 1];
      for (let f = 0; f < 50; f += 10)
        e[s + f] ^= d, e[s + f + 1] ^= h;
    }
    let i = e[2], o = e[3];
    for (let s = 0; s < 24; s++) {
      const a = il[s], c = Ea(i, o, a), u = Sa(i, o, a), l = rl[s];
      i = e[l], o = e[l + 1], e[l] = c, e[l + 1] = u;
    }
    for (let s = 0; s < 50; s += 10) {
      for (let a = 0; a < 10; a++)
        n[a] = e[s + a];
      for (let a = 0; a < 10; a++)
        e[s + a] ^= ~n[(a + 2) % 10] & n[(a + 4) % 10];
    }
    e[0] ^= rb[r], e[1] ^= ib[r];
  }
  Jn(n);
}
class os extends tl {
  // NOTE: we accept arguments in bytes instead of bits here.
  constructor(t, n, r, i = !1, o = 24) {
    if (super(), this.pos = 0, this.posOut = 0, this.finished = !1, this.destroyed = !1, this.enableXOF = !1, this.blockLen = t, this.suffix = n, this.outputLen = r, this.enableXOF = i, this.rounds = o, va(r), !(0 < t && t < 200))
      throw new Error("only keccak-f1600 function is supported");
    this.state = new Uint8Array(200), this.state32 = Gw(this.state);
  }
  clone() {
    return this._cloneInto();
  }
  keccak() {
    xa(this.state32), ob(this.state32, this.rounds), xa(this.state32), this.posOut = 0, this.pos = 0;
  }
  update(t) {
    Qr(this), t = is(t), Yn(t);
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
    Qr(this, !1), Yn(t), this.finish();
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
    return va(t), this.xofInto(new Uint8Array(t));
  }
  digestInto(t) {
    if (el(t, this), this.finished)
      throw new Error("digest() was already called");
    return this.writeInto(t), this.destroy(), t;
  }
  digest() {
    return this.digestInto(new Uint8Array(this.outputLen));
  }
  destroy() {
    this.destroyed = !0, Jn(this.state);
  }
  _cloneInto(t) {
    const { blockLen: n, suffix: r, outputLen: i, rounds: o, enableXOF: s } = this;
    return t || (t = new os(n, r, i, s, o)), t.state32.set(this.state32), t.pos = this.pos, t.posOut = this.posOut, t.finished = this.finished, t.rounds = o, t.suffix = r, t.outputLen = i, t.enableXOF = s, t.destroyed = this.destroyed, t;
  }
}
const sb = (e, t, n) => nl(() => new os(t, e, n)), ab = sb(1, 136, 256 / 8);
function Je(e, t) {
  const n = t || "hex", r = ab(rr(e, { strict: !1 }) ? rs(e) : e);
  return n === "bytes" ? r : Xn(r);
}
const cb = (e) => Je(rs(e));
function ub(e) {
  return cb(e);
}
function lb(e) {
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
const db = (e) => {
  const t = typeof e == "string" ? e : Og(e);
  return lb(t);
};
function fb(e) {
  return ub(db(e));
}
class qt extends M {
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
class al extends Map {
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
const $i = /* @__PURE__ */ new al(8192);
function cl(e, t) {
  if ($i.has(`${e}.${t}`))
    return $i.get(`${e}.${t}`);
  const n = e.substring(2).toLowerCase(), r = Je(Qu(n), "bytes"), i = n.split("");
  for (let s = 0; s < 40; s += 2)
    r[s >> 1] >> 4 >= 8 && i[s] && (i[s] = i[s].toUpperCase()), (r[s >> 1] & 15) >= 8 && i[s + 1] && (i[s + 1] = i[s + 1].toUpperCase());
  const o = `0x${i.join("")}`;
  return $i.set(`${e}.${t}`, o), o;
}
const pb = /^0x[a-fA-F0-9]{40}$/, Oi = /* @__PURE__ */ new al(8192);
function Gt(e, t) {
  const { strict: n = !0 } = t ?? {}, r = `${e}.${n}`;
  if (Oi.has(r))
    return Oi.get(r);
  const i = pb.test(e) ? e.toLowerCase() === e ? !0 : n ? cl(e) === e : !0 : !1;
  return Oi.set(r, i), i;
}
function hb(e) {
  return typeof e[0] == "string" ? Ke(e) : yb(e);
}
function yb(e) {
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
function Qn(e, t, n, { strict: r } = {}) {
  return rr(e, { strict: !1 }) ? gb(e, t, n, {
    strict: r
  }) : dl(e, t, n, {
    strict: r
  });
}
function ul(e, t) {
  if (typeof t == "number" && t > 0 && t > le(e) - 1)
    throw new Gu({
      offset: t,
      position: "start",
      size: le(e)
    });
}
function ll(e, t, n) {
  if (typeof t == "number" && typeof n == "number" && le(e) !== n - t)
    throw new Gu({
      offset: n,
      position: "end",
      size: le(e)
    });
}
function dl(e, t, n, { strict: r } = {}) {
  ul(e, t);
  const i = e.slice(t, n);
  return r && ll(i, t, n), i;
}
function gb(e, t, n, { strict: r } = {}) {
  ul(e, t);
  const i = `0x${e.replace("0x", "").slice((t ?? 0) * 2, (n ?? e.length) * 2)}`;
  return r && ll(i, t, n), i;
}
const wb = /^bytes([1-9]|1[0-9]|2[0-9]|3[0-2])?$/, fl = /^(u?int)(8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)?$/;
function pl(e, t) {
  if (e.length !== t.length)
    throw new Aw({
      expectedLength: e.length,
      givenLength: t.length
    });
  const n = bb({
    params: e,
    values: t
  });
  return as(n);
}
function bb({ params: e, values: t }) {
  const n = [];
  for (let r = 0; r < e.length; r++)
    n.push(ss({ param: e[r], value: t[r] }));
  return n;
}
function ss({ param: e, value: t }) {
  const n = di(e.type);
  if (n) {
    const [r, i] = n;
    return vb(t, { length: r, param: { ...e, type: i } });
  }
  if (e.type === "tuple")
    return Ab(t, {
      param: e
    });
  if (e.type === "address")
    return mb(t);
  if (e.type === "bool")
    return Eb(t);
  if (e.type.startsWith("uint") || e.type.startsWith("int")) {
    const r = e.type.startsWith("int"), [, , i = "256"] = fl.exec(e.type) ?? [];
    return Sb(t, {
      signed: r,
      size: Number(i)
    });
  }
  if (e.type.startsWith("bytes"))
    return xb(t, { param: e });
  if (e.type === "string")
    return kb(t);
  throw new Bw(e.type, {
    docsPath: "/docs/contract/encodeAbiParameters"
  });
}
function as(e) {
  let t = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? t += 32 : t += le(a);
  }
  const n = [], r = [];
  let i = 0;
  for (let o = 0; o < e.length; o++) {
    const { dynamic: s, encoded: a } = e[o];
    s ? (n.push(F(t + i, { size: 32 })), r.push(a), i += le(a)) : n.push(a);
  }
  return Ke([...n, ...r]);
}
function mb(e) {
  if (!Gt(e))
    throw new qt({ address: e });
  return { dynamic: !1, encoded: Bt(e.toLowerCase()) };
}
function vb(e, { length: t, param: n }) {
  const r = t === null;
  if (!Array.isArray(e))
    throw new $w(e);
  if (!r && e.length !== t)
    throw new Sw({
      expectedLength: t,
      givenLength: e.length,
      type: `${n.type}[${t}]`
    });
  let i = e.length === 0 && Qi(n);
  const o = [];
  for (let s = 0; s < e.length; s++) {
    const a = ss({ param: n, value: e[s] });
    a.dynamic && (i = !0), o.push(a);
  }
  if (r || i) {
    const s = as(o);
    if (r) {
      const a = F(o.length, { size: 32 });
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
function xb(e, { param: t }) {
  const [, n] = t.type.split("bytes"), r = le(e);
  if (!n) {
    let i = e;
    return r % 32 !== 0 && (i = Bt(i, {
      dir: "right",
      size: Math.ceil((e.length - 2) / 2 / 32) * 32
    })), {
      dynamic: !0,
      encoded: Ke([
        Bt(F(r, { size: 32 })),
        i
      ])
    };
  }
  if (r !== Number.parseInt(n, 10))
    throw new kw({
      expectedSize: Number.parseInt(n, 10),
      value: e
    });
  return { dynamic: !1, encoded: Bt(e, { dir: "right" }) };
}
function Eb(e) {
  if (typeof e != "boolean")
    throw new M(`Invalid boolean value: "${e}" (type: ${typeof e}). Expected: \`true\` or \`false\`.`);
  return { dynamic: !1, encoded: Bt(Yu(e)) };
}
function Sb(e, { signed: t, size: n = 256 }) {
  if (typeof n == "number") {
    const r = 2n ** (BigInt(n) - (t ? 1n : 0n)) - 1n, i = t ? -r - 1n : 0n;
    if (e > r || e < i)
      throw new ns({
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
function kb(e) {
  const t = Ju(e), n = Math.ceil(le(t) / 32), r = [];
  for (let i = 0; i < n; i++)
    r.push(Bt(Qn(t, i * 32, (i + 1) * 32), {
      dir: "right"
    }));
  return {
    dynamic: !0,
    encoded: Ke([
      Bt(F(le(t), { size: 32 })),
      ...r
    ])
  };
}
function Ab(e, { param: t }) {
  let n = !1;
  const r = [];
  for (let i = 0; i < t.components.length; i++) {
    const o = t.components[i], s = Array.isArray(e) ? i : o.name, a = ss({
      param: o,
      value: e[s]
    });
    r.push(a), a.dynamic && (n = !0);
  }
  return {
    dynamic: n,
    encoded: n ? as(r) : Ke(r.map(({ encoded: i }) => i))
  };
}
function di(e) {
  const t = e.match(/^(.*)\[(\d+)?\]$/);
  return t ? (
    // Return `null` if the array is dynamic.
    [t[2] ? Number(t[2]) : null, t[1]]
  ) : void 0;
}
function Qi(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components.some(Qi);
  const n = di(t);
  return n ? Qi({ ...e, type: n[1] }) : !1;
}
const _b = (e) => Qn(fb(e), 0, 4);
class ka extends M {
  constructor({ offset: t }) {
    super(`Offset \`${t}\` cannot be negative.`, {
      name: "NegativeOffsetError"
    });
  }
}
class Ib extends M {
  constructor({ length: t, position: n }) {
    super(`Position \`${n}\` is out of bounds (\`0 < position < ${t}\`).`, { name: "PositionOutOfBoundsError" });
  }
}
class Bb extends M {
  constructor({ count: t, limit: n }) {
    super(`Recursive read limit of \`${n}\` exceeded (recursive read count: \`${t}\`).`, { name: "RecursiveReadLimitExceededError" });
  }
}
const Pb = {
  bytes: new Uint8Array(),
  dataView: new DataView(new ArrayBuffer(0)),
  position: 0,
  positionReadCount: /* @__PURE__ */ new Map(),
  recursiveReadCount: 0,
  recursiveReadLimit: Number.POSITIVE_INFINITY,
  assertReadLimit() {
    if (this.recursiveReadCount >= this.recursiveReadLimit)
      throw new Bb({
        count: this.recursiveReadCount + 1,
        limit: this.recursiveReadLimit
      });
  },
  assertPosition(e) {
    if (e < 0 || e > this.bytes.length - 1)
      throw new Ib({
        length: this.bytes.length,
        position: e
      });
  },
  decrementPosition(e) {
    if (e < 0)
      throw new ka({ offset: e });
    const t = this.position - e;
    this.assertPosition(t), this.position = t;
  },
  getReadCount(e) {
    return this.positionReadCount.get(e || this.position) || 0;
  },
  incrementPosition(e) {
    if (e < 0)
      throw new ka({ offset: e });
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
function cs(e, { recursiveReadLimit: t = 8192 } = {}) {
  const n = Object.create(Pb);
  return n.bytes = e, n.dataView = new DataView(e.buffer ?? e, e.byteOffset, e.byteLength), n.positionReadCount = /* @__PURE__ */ new Map(), n.recursiveReadLimit = t, n;
}
function $b(e, t = {}) {
  typeof t.size < "u" && rt(e, { size: t.size });
  const n = Ae(e, t);
  return Zu(n, t);
}
function Ob(e, t = {}) {
  let n = e;
  if (typeof t.size < "u" && (rt(n, { size: t.size }), n = Zn(n)), n.length > 1 || n[0] > 1)
    throw new Lw(n);
  return !!n[0];
}
function dt(e, t = {}) {
  typeof t.size < "u" && rt(e, { size: t.size });
  const n = Ae(e, t);
  return Xu(n, t);
}
function Tb(e, t = {}) {
  let n = e;
  return typeof t.size < "u" && (rt(n, { size: t.size }), n = Zn(n, { dir: "right" })), new TextDecoder().decode(n);
}
function Lb(e, t) {
  const n = typeof t == "string" ? Ot(t) : t, r = cs(n);
  if (le(n) === 0 && e.length > 0)
    throw new Ew();
  if (le(t) && le(t) < 32)
    throw new xw({
      data: typeof t == "string" ? t : Ae(t),
      params: e,
      size: le(t)
    });
  let i = 0;
  const o = [];
  for (let s = 0; s < e.length; ++s) {
    const a = e[s];
    i < n.length && r.setPosition(i);
    const [c, u] = sn(r, a, {
      staticPosition: 0
    });
    i += u, o.push(c);
  }
  return o;
}
function sn(e, t, { staticPosition: n }) {
  const r = di(t.type);
  if (r) {
    const [i, o] = r;
    return Cb(e, { ...t, type: o }, { length: i, staticPosition: n });
  }
  if (t.type === "tuple")
    return Mb(e, t, { staticPosition: n });
  if (t.type === "address")
    return Rb(e);
  if (t.type === "bool")
    return zb(e);
  if (t.type.startsWith("bytes"))
    return Ub(e, t, { staticPosition: n });
  if (t.type.startsWith("uint") || t.type.startsWith("int"))
    return Hb(e, t);
  if (t.type === "string")
    return Nb(e, { staticPosition: n });
  throw new Pw(t.type, {
    docsPath: "/docs/contract/decodeAbiParameters"
  });
}
const Aa = 32, eo = 32;
function Rb(e) {
  const t = e.readBytes(32);
  return [cl(Ae(dl(t, -20))), 32];
}
function Cb(e, t, { length: n, staticPosition: r }) {
  if (n === null) {
    const s = dt(e.readBytes(eo)), a = r + s, c = a + Aa;
    e.setPosition(a);
    const u = dt(e.readBytes(Aa)), l = er(t);
    let d = 0;
    const h = [];
    for (let f = 0; f < u; ++f) {
      e.setPosition(c + (l ? f * 32 : d));
      const [w, g] = sn(e, t, {
        staticPosition: c
      });
      d += g, h.push(w), g === 0 && (e.assertReadLimit(), e._touch());
    }
    return e.setPosition(r + 32), [h, 32];
  }
  if (er(t)) {
    const s = dt(e.readBytes(eo)), a = r + s, c = [];
    for (let u = 0; u < n; ++u) {
      e.setPosition(a + u * 32);
      const [l] = sn(e, t, {
        staticPosition: a
      });
      c.push(l);
    }
    return e.setPosition(r + 32), [c, 32];
  }
  let i = 0;
  const o = [];
  for (let s = 0; s < n; ++s) {
    const [a, c] = sn(e, t, {
      staticPosition: r + i
    });
    i += c, o.push(a), c === 0 && (e.assertReadLimit(), e._touch());
  }
  return [o, i];
}
function zb(e) {
  return [Ob(e.readBytes(32), { size: 32 }), 32];
}
function Ub(e, t, { staticPosition: n }) {
  const [r, i] = t.type.split("bytes");
  if (!i) {
    const s = dt(e.readBytes(32));
    e.setPosition(n + s);
    const a = dt(e.readBytes(32));
    if (a === 0)
      return e.setPosition(n + 32), ["0x", 32];
    const c = e.readBytes(a);
    return e.setPosition(n + 32), [Ae(c), 32];
  }
  return [Ae(e.readBytes(Number.parseInt(i, 10), 32)), 32];
}
function Hb(e, t) {
  const n = t.type.startsWith("int"), r = Number.parseInt(t.type.split("int")[1] || "256", 10), i = e.readBytes(32);
  return [
    r > 48 ? $b(i, { signed: n }) : dt(i, { signed: n }),
    32
  ];
}
function Mb(e, t, { staticPosition: n }) {
  const r = t.components.length === 0 || t.components.some(({ name: s }) => !s), i = r ? [] : {};
  let o = 0;
  if (er(t)) {
    const s = dt(e.readBytes(eo)), a = n + s;
    for (let c = 0; c < t.components.length; ++c) {
      const u = t.components[c];
      e.setPosition(a + o);
      const [l, d] = sn(e, u, {
        staticPosition: a
      });
      o += d, i[r ? c : u?.name] = l;
    }
    return e.setPosition(n + 32), [i, 32];
  }
  for (let s = 0; s < t.components.length; ++s) {
    const a = t.components[s], [c, u] = sn(e, a, {
      staticPosition: n
    });
    i[r ? s : a?.name] = c, o += u;
  }
  return [i, o];
}
function Nb(e, { staticPosition: t }) {
  const n = dt(e.readBytes(32)), r = t + n;
  e.setPosition(r);
  const i = dt(e.readBytes(32));
  if (i === 0)
    return e.setPosition(t + 32), ["", 32];
  const o = e.readBytes(i, 32), s = Tb(Zn(o));
  return e.setPosition(t + 32), [s, 32];
}
function er(e) {
  const { type: t } = e;
  if (t === "string" || t === "bytes" || t.endsWith("[]"))
    return !0;
  if (t === "tuple")
    return e.components?.some(er);
  const n = di(e.type);
  return !!(n && er({ ...e, type: n[1] }));
}
const Fb = (e, t, n) => JSON.stringify(e, (r, i) => typeof i == "bigint" ? i.toString() : i, n), Kb = {
  ether: -9,
  wei: 9
};
function Db(e, t) {
  let n = e.toString();
  const r = n.startsWith("-");
  r && (n = n.slice(1)), n = n.padStart(t, "0");
  let [i, o] = [
    n.slice(0, n.length - t),
    n.slice(n.length - t)
  ];
  return o = o.replace(/(0+)$/, ""), `${r ? "-" : ""}${i || "0"}${o ? `.${o}` : ""}`;
}
function to(e, t = "wei") {
  return Db(e, Kb[t]);
}
function jb(e) {
  const t = Object.entries(e).map(([r, i]) => i === void 0 || i === !1 ? null : [r, i]).filter(Boolean), n = t.reduce((r, [i]) => Math.max(r, i.length), 0);
  return t.map(([r, i]) => `  ${`${r}:`.padEnd(n + 1)}  ${i}`).join(`
`);
}
class Vb extends M {
  constructor({ transaction: t }) {
    super("Cannot infer a transaction type from provided transaction.", {
      metaMessages: [
        "Provided Transaction:",
        "{",
        jb(t),
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
class qb extends M {
  constructor({ storageKey: t }) {
    super(`Size for storage key "${t}" is invalid. Expected 32 bytes. Got ${Math.floor((t.length - 2) / 2)} bytes.`, { name: "InvalidStorageKeySizeError" });
  }
}
function hn(e, t = "hex") {
  const n = hl(e), r = cs(new Uint8Array(n.length));
  return n.encode(r), t === "hex" ? Ae(r.bytes) : r.bytes;
}
function hl(e) {
  return Array.isArray(e) ? Gb(e.map((t) => hl(t))) : Wb(e);
}
function Gb(e) {
  const t = e.reduce((i, o) => i + o.length, 0), n = yl(t);
  return {
    length: t <= 55 ? 1 + t : 1 + n + t,
    encode(i) {
      t <= 55 ? i.pushByte(192 + t) : (i.pushByte(247 + n), n === 1 ? i.pushUint8(t) : n === 2 ? i.pushUint16(t) : n === 3 ? i.pushUint24(t) : i.pushUint32(t));
      for (const { encode: o } of e)
        o(i);
    }
  };
}
function Wb(e) {
  const t = typeof e == "string" ? Ot(e) : e, n = yl(t.length);
  return {
    length: t.length === 1 && t[0] < 128 ? 1 : t.length <= 55 ? 1 + t.length : 1 + n + t.length,
    encode(i) {
      t.length === 1 && t[0] < 128 ? i.pushBytes(t) : t.length <= 55 ? (i.pushByte(128 + t.length), i.pushBytes(t)) : (i.pushByte(183 + n), n === 1 ? i.pushUint8(t.length) : n === 2 ? i.pushUint16(t.length) : n === 3 ? i.pushUint24(t.length) : i.pushUint32(t.length), i.pushBytes(t));
    }
  };
}
function yl(e) {
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
class fi extends M {
  constructor({ cause: t, maxFeePerGas: n } = {}) {
    super(`The fee cap (\`maxFeePerGas\`${n ? ` = ${to(n)} gwei` : ""}) cannot be higher than the maximum allowed value (2^256-1).`, {
      cause: t,
      name: "FeeCapTooHighError"
    });
  }
}
Object.defineProperty(fi, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max fee per gas higher than 2\^256-1|fee cap higher than 2\^256-1/
});
class gl extends M {
  constructor({ cause: t, maxPriorityFeePerGas: n, maxFeePerGas: r } = {}) {
    super([
      `The provided tip (\`maxPriorityFeePerGas\`${n ? ` = ${to(n)} gwei` : ""}) cannot be higher than the fee cap (\`maxFeePerGas\`${r ? ` = ${to(r)} gwei` : ""}).`
    ].join(`
`), {
      cause: t,
      name: "TipAboveFeeCapError"
    });
  }
}
Object.defineProperty(gl, "nodeMessage", {
  enumerable: !0,
  configurable: !0,
  writable: !0,
  value: /max priority fee per gas higher than max fee per gas|tip higher than fee cap/
});
const us = 2n ** 256n - 1n;
function wl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((o) => Ot(o)) : e.blobs, i = [];
  for (const o of r)
    i.push(Uint8Array.from(t.blobToKzgCommitment(o)));
  return n === "bytes" ? i : i.map((o) => Ae(o));
}
function bl(e) {
  const { kzg: t } = e, n = e.to ?? (typeof e.blobs[0] == "string" ? "hex" : "bytes"), r = typeof e.blobs[0] == "string" ? e.blobs.map((s) => Ot(s)) : e.blobs, i = typeof e.commitments[0] == "string" ? e.commitments.map((s) => Ot(s)) : e.commitments, o = [];
  for (let s = 0; s < r.length; s++) {
    const a = r[s], c = i[s];
    o.push(Uint8Array.from(t.computeBlobKzgProof(a, c)));
  }
  return n === "bytes" ? o : o.map((s) => Ae(s));
}
function Zb(e, t, n, r) {
  if (typeof e.setBigUint64 == "function")
    return e.setBigUint64(t, n, r);
  const i = BigInt(32), o = BigInt(4294967295), s = Number(n >> i & o), a = Number(n & o), c = r ? 4 : 0, u = r ? 0 : 4;
  e.setUint32(t + c, s, r), e.setUint32(t + u, a, r);
}
function Xb(e, t, n) {
  return e & t ^ ~e & n;
}
function Yb(e, t, n) {
  return e & t ^ e & n ^ t & n;
}
class Jb extends tl {
  constructor(t, n, r, i) {
    super(), this.finished = !1, this.length = 0, this.pos = 0, this.destroyed = !1, this.blockLen = t, this.outputLen = n, this.padOffset = r, this.isLE = i, this.buffer = new Uint8Array(t), this.view = Pi(this.buffer);
  }
  update(t) {
    Qr(this), t = is(t), Yn(t);
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
    Qr(this), el(t, this), this.finished = !0;
    const { buffer: n, view: r, blockLen: i, isLE: o } = this;
    let { pos: s } = this;
    n[s++] = 128, Jn(this.buffer.subarray(s)), this.padOffset > i - s && (this.process(r, 0), s = 0);
    for (let d = s; d < i; d++)
      n[d] = 0;
    Zb(r, i - 8, BigInt(this.length * 8), o), this.process(r, 0);
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
const kt = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]), Qb = /* @__PURE__ */ Uint32Array.from([
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
]), At = /* @__PURE__ */ new Uint32Array(64);
class e0 extends Jb {
  constructor(t = 32) {
    super(64, t, 8, !1), this.A = kt[0] | 0, this.B = kt[1] | 0, this.C = kt[2] | 0, this.D = kt[3] | 0, this.E = kt[4] | 0, this.F = kt[5] | 0, this.G = kt[6] | 0, this.H = kt[7] | 0;
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
      At[d] = t.getUint32(n, !1);
    for (let d = 16; d < 64; d++) {
      const h = At[d - 15], f = At[d - 2], w = Ge(h, 7) ^ Ge(h, 18) ^ h >>> 3, g = Ge(f, 17) ^ Ge(f, 19) ^ f >>> 10;
      At[d] = g + At[d - 7] + w + At[d - 16] | 0;
    }
    let { A: r, B: i, C: o, D: s, E: a, F: c, G: u, H: l } = this;
    for (let d = 0; d < 64; d++) {
      const h = Ge(a, 6) ^ Ge(a, 11) ^ Ge(a, 25), f = l + h + Xb(a, c, u) + Qb[d] + At[d] | 0, g = (Ge(r, 2) ^ Ge(r, 13) ^ Ge(r, 22)) + Yb(r, i, o) | 0;
      l = u, u = c, c = a, a = s + f | 0, s = o, o = i, i = r, r = f + g | 0;
    }
    r = r + this.A | 0, i = i + this.B | 0, o = o + this.C | 0, s = s + this.D | 0, a = a + this.E | 0, c = c + this.F | 0, u = u + this.G | 0, l = l + this.H | 0, this.set(r, i, o, s, a, c, u, l);
  }
  roundClean() {
    Jn(At);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0), Jn(this.buffer);
  }
}
const t0 = /* @__PURE__ */ nl(() => new e0()), n0 = t0;
function r0(e, t) {
  return n0(rr(e, { strict: !1 }) ? rs(e) : e);
}
function i0(e) {
  const { commitment: t, version: n = 1 } = e, r = e.to ?? (typeof t == "string" ? "hex" : "bytes"), i = r0(t);
  return i.set([n], 0), r === "bytes" ? i : Ae(i);
}
function o0(e) {
  const { commitments: t, version: n } = e, r = e.to ?? (typeof t[0] == "string" ? "hex" : "bytes"), i = [];
  for (const o of t)
    i.push(i0({
      commitment: o,
      to: r,
      version: n
    }));
  return i;
}
const _a = 6, ml = 32, ls = 4096, vl = ml * ls, Ia = vl * _a - // terminator byte (0x80).
1 - // zero byte (0x00) appended to each field element.
1 * ls * _a, xl = 1;
class s0 extends M {
  constructor({ maxSize: t, size: n }) {
    super("Blob size is too large.", {
      metaMessages: [`Max: ${t} bytes`, `Given: ${n} bytes`],
      name: "BlobSizeTooLargeError"
    });
  }
}
class El extends M {
  constructor() {
    super("Blob data must not be empty.", { name: "EmptyBlobError" });
  }
}
class a0 extends M {
  constructor({ hash: t, size: n }) {
    super(`Versioned hash "${t}" size is invalid.`, {
      metaMessages: ["Expected: 32", `Received: ${n}`],
      name: "InvalidVersionedHashSizeError"
    });
  }
}
class c0 extends M {
  constructor({ hash: t, version: n }) {
    super(`Versioned hash "${t}" version is invalid.`, {
      metaMessages: [
        `Expected: ${xl}`,
        `Received: ${n}`
      ],
      name: "InvalidVersionedHashVersionError"
    });
  }
}
function u0(e) {
  const t = e.to ?? (typeof e.data == "string" ? "hex" : "bytes"), n = typeof e.data == "string" ? Ot(e.data) : e.data, r = le(n);
  if (!r)
    throw new El();
  if (r > Ia)
    throw new s0({
      maxSize: Ia,
      size: r
    });
  const i = [];
  let o = !0, s = 0;
  for (; o; ) {
    const a = cs(new Uint8Array(vl));
    let c = 0;
    for (; c < ls; ) {
      const u = n.slice(s, s + (ml - 1));
      if (a.pushByte(0), a.pushBytes(u), u.length < 31) {
        a.pushByte(128), o = !1;
        break;
      }
      c++, s += 31;
    }
    i.push(a);
  }
  return t === "bytes" ? i.map((a) => a.bytes) : i.map((a) => Ae(a.bytes));
}
function l0(e) {
  const { data: t, kzg: n, to: r } = e, i = e.blobs ?? u0({ data: t, to: r }), o = e.commitments ?? wl({ blobs: i, kzg: n, to: r }), s = e.proofs ?? bl({ blobs: i, commitments: o, kzg: n, to: r }), a = [];
  for (let c = 0; c < i.length; c++)
    a.push({
      blob: i[c],
      commitment: o[c],
      proof: s[c]
    });
  return a;
}
function d0(e) {
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
  throw new Vb({ transaction: e });
}
class pi extends M {
  constructor({ chainId: t }) {
    super(typeof t == "number" ? `Chain ID "${t}" is invalid.` : "Chain ID is invalid.", { name: "InvalidChainIdError" });
  }
}
function f0(e) {
  const { abi: t, data: n } = e, r = Qn(n, 0, 4), i = t.find((o) => o.type === "function" && r === _b(mw(o)));
  if (!i)
    throw new _w(r, {
      docsPath: "/docs/contract/decodeFunctionData"
    });
  return {
    functionName: i.name,
    args: "inputs" in i && i.inputs && i.inputs.length > 0 ? Lb(i.inputs, Qn(n, 4)) : void 0
  };
}
function p0(e) {
  const { authorizationList: t } = e;
  if (t)
    for (const n of t) {
      const { chainId: r } = n, i = n.address;
      if (!Gt(i))
        throw new qt({ address: i });
      if (r < 0)
        throw new pi({ chainId: r });
    }
  ds(e);
}
function h0(e) {
  const { blobVersionedHashes: t } = e;
  if (t) {
    if (t.length === 0)
      throw new El();
    for (const n of t) {
      const r = le(n), i = Xu(Qn(n, 0, 1));
      if (r !== 32)
        throw new a0({ hash: n, size: r });
      if (i !== xl)
        throw new c0({
          hash: n,
          version: i
        });
    }
  }
  ds(e);
}
function ds(e) {
  const { chainId: t, maxPriorityFeePerGas: n, maxFeePerGas: r, to: i } = e;
  if (t <= 0)
    throw new pi({ chainId: t });
  if (i && !Gt(i))
    throw new qt({ address: i });
  if (r && r > us)
    throw new fi({ maxFeePerGas: r });
  if (n && r && n > r)
    throw new gl({ maxFeePerGas: r, maxPriorityFeePerGas: n });
}
function y0(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (t <= 0)
    throw new pi({ chainId: t });
  if (o && !Gt(o))
    throw new qt({ address: o });
  if (n || i)
    throw new M("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid EIP-2930 Transaction attribute.");
  if (r && r > us)
    throw new fi({ maxFeePerGas: r });
}
function g0(e) {
  const { chainId: t, maxPriorityFeePerGas: n, gasPrice: r, maxFeePerGas: i, to: o } = e;
  if (o && !Gt(o))
    throw new qt({ address: o });
  if (typeof t < "u" && t <= 0)
    throw new pi({ chainId: t });
  if (n || i)
    throw new M("`maxFeePerGas`/`maxPriorityFeePerGas` is not a valid Legacy Transaction attribute.");
  if (r && r > us)
    throw new fi({ maxFeePerGas: r });
}
function hi(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const { address: r, storageKeys: i } = e[n];
    for (let o = 0; o < i.length; o++)
      if (i[o].length - 2 !== 64)
        throw new qb({ storageKey: i[o] });
    if (!Gt(r, { strict: !1 }))
      throw new qt({ address: r });
    t.push([r, i]);
  }
  return t;
}
function w0(e, t) {
  const n = d0(e);
  return n === "eip1559" ? v0(e, t) : n === "eip2930" ? x0(e, t) : n === "eip4844" ? m0(e, t) : n === "eip7702" ? b0(e, t) : E0(e);
}
function b0(e, t) {
  const { authorizationList: n, chainId: r, gas: i, nonce: o, to: s, value: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  p0(e);
  const h = hi(l), f = S0(n);
  return Ke([
    "0x04",
    hn([
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
      ...ir(e, t)
    ])
  ]);
}
function m0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerBlobGas: a, maxFeePerGas: c, maxPriorityFeePerGas: u, accessList: l, data: d } = e;
  h0(e);
  let h = e.blobVersionedHashes, f = e.sidecars;
  if (e.blobs && (typeof h > "u" || typeof f > "u")) {
    const _ = typeof e.blobs[0] == "string" ? e.blobs : e.blobs.map((O) => Ae(O)), I = e.kzg, S = wl({
      blobs: _,
      kzg: I
    });
    if (typeof h > "u" && (h = o0({
      commitments: S
    })), typeof f > "u") {
      const O = bl({ blobs: _, commitments: S, kzg: I });
      f = l0({ blobs: _, commitments: S, proofs: O });
    }
  }
  const w = hi(l), g = [
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
    ...ir(e, t)
  ], p = [], y = [], v = [];
  if (f)
    for (let _ = 0; _ < f.length; _++) {
      const { blob: I, commitment: S, proof: O } = f[_];
      p.push(I), y.push(S), v.push(O);
    }
  return Ke([
    "0x03",
    // If sidecars are enabled, envelope turns into a "wrapper":
    hn(f ? [g, p, y, v] : g)
  ]);
}
function v0(e, t) {
  const { chainId: n, gas: r, nonce: i, to: o, value: s, maxFeePerGas: a, maxPriorityFeePerGas: c, accessList: u, data: l } = e;
  ds(e);
  const d = hi(u), h = [
    F(n),
    i ? F(i) : "0x",
    c ? F(c) : "0x",
    a ? F(a) : "0x",
    r ? F(r) : "0x",
    o ?? "0x",
    s ? F(s) : "0x",
    l ?? "0x",
    d,
    ...ir(e, t)
  ];
  return Ke([
    "0x02",
    hn(h)
  ]);
}
function x0(e, t) {
  const { chainId: n, gas: r, data: i, nonce: o, to: s, value: a, accessList: c, gasPrice: u } = e;
  y0(e);
  const l = hi(c), d = [
    F(n),
    o ? F(o) : "0x",
    u ? F(u) : "0x",
    r ? F(r) : "0x",
    s ?? "0x",
    a ? F(a) : "0x",
    i ?? "0x",
    l,
    ...ir(e, t)
  ];
  return Ke([
    "0x01",
    hn(d)
  ]);
}
function E0(e, t) {
  const { chainId: n = 0, gas: r, data: i, nonce: o, to: s, value: a, gasPrice: c } = e;
  g0(e);
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
  ]), hn(u);
}
function ir(e, t) {
  const n = t ?? e, { v: r, yParity: i } = n;
  if (typeof n.r > "u")
    return [];
  if (typeof n.s > "u")
    return [];
  if (typeof r > "u" && typeof i > "u")
    return [];
  const o = Zn(n.r), s = Zn(n.s);
  return [typeof i == "number" ? i ? F(1) : "0x" : r === 0n ? "0x" : r === 1n ? F(1) : r === 27n ? "0x" : F(1), o === "0x00" ? "0x" : o, s === "0x00" ? "0x" : s];
}
function S0(e) {
  if (!e || e.length === 0)
    return [];
  const t = [];
  for (const n of e) {
    const { chainId: r, nonce: i, ...o } = n, s = n.address;
    t.push([
      r ? Xn(r) : "0x",
      s,
      i ? Xn(i) : "0x",
      ...ir({}, o)
    ]);
  }
  return t;
}
class k0 extends M {
  constructor({ domain: t }) {
    super(`Invalid domain "${Fb(t)}".`, {
      metaMessages: ["Must be a valid EIP-712 domain."]
    });
  }
}
class A0 extends M {
  constructor({ primaryType: t, types: n }) {
    super(`Invalid primary type \`${t}\` must be one of \`${JSON.stringify(Object.keys(n))}\`.`, {
      docsPath: "/api/glossary/Errors#typeddatainvalidprimarytypeerror",
      metaMessages: ["Check that the primary type is a key in `types`."]
    });
  }
}
class _0 extends M {
  constructor({ type: t }) {
    super(`Struct type "${t}" is invalid.`, {
      metaMessages: ["Struct type must not be a Solidity type."],
      name: "InvalidStructTypeError"
    });
  }
}
function I0(e) {
  const { domain: t, message: n, primaryType: r, types: i } = e, o = (s, a) => {
    for (const c of s) {
      const { name: u, type: l } = c, d = a[u], h = l.match(fl);
      if (h && (typeof d == "number" || typeof d == "bigint")) {
        const [g, p, y] = h;
        F(d, {
          signed: p === "int",
          size: Number.parseInt(y, 10) / 8
        });
      }
      if (l === "address" && typeof d == "string" && !Gt(d))
        throw new qt({ address: d });
      const f = l.match(wb);
      if (f) {
        const [g, p] = f;
        if (p && le(d) !== Number.parseInt(p, 10))
          throw new Iw({
            expectedSize: Number.parseInt(p, 10),
            givenSize: le(d)
          });
      }
      const w = i[l];
      w && (P0(l), o(w, d));
    }
  };
  if (i.EIP712Domain && t) {
    if (typeof t != "object")
      throw new k0({ domain: t });
    o(i.EIP712Domain, t);
  }
  if (r !== "EIP712Domain")
    if (i[r])
      o(i[r], n);
    else
      throw new A0({ primaryType: r, types: i });
}
function B0({ domain: e }) {
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
function P0(e) {
  if (e === "address" || e === "bool" || e === "string" || e.startsWith("bytes") || e.startsWith("uint") || e.startsWith("int"))
    throw new _0({ type: e });
}
function $0(e) {
  const { domain: t = {}, message: n, primaryType: r } = e, i = {
    EIP712Domain: B0({ domain: t }),
    ...e.types
  };
  I0({
    domain: t,
    message: n,
    primaryType: r,
    types: i
  });
  const o = ["0x1901"];
  return t && o.push(O0({
    domain: t,
    types: i
  })), r !== "EIP712Domain" && o.push(Sl({
    data: n,
    primaryType: r,
    types: i
  })), Je(hb(o));
}
function O0({ domain: e, types: t }) {
  return Sl({
    data: e,
    primaryType: "EIP712Domain",
    types: t
  });
}
function Sl({ data: e, primaryType: t, types: n }) {
  const r = kl({
    data: e,
    primaryType: t,
    types: n
  });
  return Je(r);
}
function kl({ data: e, primaryType: t, types: n }) {
  const r = [{ type: "bytes32" }], i = [T0({ primaryType: t, types: n })];
  for (const o of n[t]) {
    const [s, a] = _l({
      types: n,
      name: o.name,
      type: o.type,
      value: e[o.name]
    });
    r.push(s), i.push(a);
  }
  return pl(r, i);
}
function T0({ primaryType: e, types: t }) {
  const n = Xn(L0({ primaryType: e, types: t }));
  return Je(n);
}
function L0({ primaryType: e, types: t }) {
  let n = "";
  const r = Al({ primaryType: e, types: t });
  r.delete(e);
  const i = [e, ...Array.from(r).sort()];
  for (const o of i)
    n += `${o}(${t[o].map(({ name: s, type: a }) => `${a} ${s}`).join(",")})`;
  return n;
}
function Al({ primaryType: e, types: t }, n = /* @__PURE__ */ new Set()) {
  const i = e.match(/^\w*/u)?.[0];
  if (n.has(i) || t[i] === void 0)
    return n;
  n.add(i);
  for (const o of t[i])
    Al({ primaryType: o.type, types: t }, n);
  return n;
}
function _l({ types: e, name: t, type: n, value: r }) {
  if (e[n] !== void 0)
    return [
      { type: "bytes32" },
      Je(kl({ data: r, primaryType: n, types: e }))
    ];
  if (n === "bytes")
    return [{ type: "bytes32" }, Je(r)];
  if (n === "string")
    return [{ type: "bytes32" }, Je(Xn(r))];
  if (n.lastIndexOf("]") === n.length - 1) {
    const i = n.slice(0, n.lastIndexOf("[")), o = r.map((s) => _l({
      name: t,
      type: i,
      types: e,
      value: s
    }));
    return [
      { type: "bytes32" },
      Je(pl(o.map(([s]) => s), o.map(([, s]) => s)))
    ];
  }
  return [{ type: n }, r];
}
const Ba = "bitcoin-taproot-keypath-v1", Pa = "bip341-sighash-default-keypath", R0 = ["bitcoin", "testnet", "signet", "regtest"], no = 21000000n * 100000000n, Il = 137, Bl = /^[0-9a-f]+$/, C0 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", z0 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l", U0 = 734539939, H0 = 1;
function j(e) {
  throw new m("invalid_payload", e);
}
function $a(e, t) {
  return (!e || typeof e != "object" || Array.isArray(e)) && j(`${t} must be an object`), e;
}
function Oa(e, t, n) {
  const r = Object.keys(e).filter((o) => !t.includes(o));
  r.length > 0 && j(`${n} carries unsupported fields: ${r.sort().join(", ")}`);
  const i = t.filter((o) => !(o in e));
  i.length > 0 && j(`${n} is missing required fields: ${i.join(", ")}`);
}
function Br(e, t, n) {
  return (typeof e != "string" || n !== void 0 && e.length !== n || e.length === 0 || !Bl.test(e)) && j(`${t} must be lowercase hexadecimal${n === void 0 ? "" : ` of length ${n}`}`), e;
}
function M0(e, t, n, r) {
  return (typeof e != "number" || !Number.isSafeInteger(e) || e < n || e > r) && j(`${t} must be an integer in ${n}..${r}`), e;
}
function Ue(...e) {
  const t = new Uint8Array(e.reduce((r, i) => r + i.length, 0));
  let n = 0;
  for (const r of e)
    t.set(r, n), n += r.length;
  return t;
}
function Qt(e, t, n, r) {
  return t + n > e.length && j(`transaction is truncated while reading ${r}`), [e.slice(t, t + n), t + n];
}
function vr(e, t, n) {
  t >= e.length && j(`transaction is truncated before ${n}`);
  const r = e[t];
  return r >= 253 && j(`${n} must use a single-byte CompactSize`), [r, t + 1];
}
function Ti(e) {
  return ((e[0] ?? 0) | (e[1] ?? 0) << 8 | (e[2] ?? 0) << 16 | (e[3] ?? 0) << 24) >>> 0;
}
function N0(e) {
  let t = 0n;
  for (let n = 0; n < 8; n += 1) t |= BigInt(e[n] ?? 0) << BigInt(n * 8);
  return t;
}
function Bn(e) {
  return new Uint8Array([e & 255, e >>> 8 & 255, e >>> 16 & 255, e >>> 24 & 255]);
}
function Ta(e) {
  const t = new Uint8Array(8);
  let n = e;
  for (let r = 0; r < 8; r += 1)
    t[r] = Number(n & 0xffn), n >>= 8n;
  return t;
}
function Pl(e) {
  if (e.length === 25 && e[0] === 118 && e[1] === 169 && e[2] === 20 && e[23] === 136 && e[24] === 172) return "p2pkh";
  if (e.length === 23 && e[0] === 169 && e[1] === 20 && e[22] === 135) return "p2sh";
  if (e.length === 22 && e[0] === 0 && e[1] === 20) return "p2wpkh";
  if (e.length === 34 && e[0] === 0 && e[1] === 32) return "p2wsh";
  if (e.length === 34 && e[0] === 81 && e[1] === 32) return "p2tr";
  j("transaction output uses an unsupported script template");
}
function F0(e) {
  (e.length === 0 || e.length % 2 || e.length > Il * 2 || !Bl.test(e)) && j("unsignedTransaction must be lowercase hex, without 0x or whitespace, and at most 137 bytes");
  const t = Uint8Array.from(e.match(/../g), (L) => Number.parseInt(L, 16));
  (t.length < 4 || t[0] !== 2 || t[1] !== 0 || t[2] !== 0 || t[3] !== 0) && j("transaction version must be exactly 2");
  let n = 4;
  const [r, i] = vr(t, n, "input count");
  n = i, r !== 1 && j("transaction must contain exactly one input");
  const [o, s] = Qt(t, n, 32, "outpoint hash");
  n = s, o.every((L) => L === 0) && j("outpoint hash must not be null");
  const [a, c] = Qt(t, n, 4, "outpoint index");
  n = c;
  const u = Ti(a), [l, d] = vr(t, n, "scriptSig length");
  n = d, l !== 0 && j("scriptSig must be empty");
  const [h, f] = Qt(t, n, 4, "sequence");
  n = f;
  const w = Ti(h);
  w !== 4294967293 && w !== 4294967294 && w !== 4294967295 && j("sequence must be 0xfffffffd, 0xfffffffe, or 0xffffffff");
  const [g, p] = vr(t, n, "output count");
  n = p, g !== 1 && g !== 2 && j("transaction must contain one or two outputs");
  const y = [], v = { p2pkh: 546n, p2sh: 540n, p2wpkh: 294n, p2wsh: 330n, p2tr: 330n };
  for (let L = 0; L < g; L += 1) {
    const [R, U] = Qt(t, n, 8, `output ${L} amount`);
    n = U;
    const D = N0(R);
    (D < 1n || D > no) && j(`output ${L} amount is outside the Bitcoin money range`);
    const [z, b] = vr(t, n, `output ${L} script length`);
    n = b;
    const [k, A] = Qt(t, n, z, `output ${L} script`);
    n = A;
    const x = Pl(k);
    z !== { p2pkh: 25, p2sh: 23, p2wpkh: 22, p2wsh: 34, p2tr: 34 }[x] && j(`output ${L} script length is not canonical for ${x}`), D < v[x] && j(`output ${L} is below the V1 ${x} dust floor`), y.push({ amountSats: D, scriptPubKey: k, kind: x });
  }
  const [_, I] = Qt(t, n, 4, "locktime");
  n = I;
  const S = Ti(_);
  S !== 0 && j("locktime must be exactly zero"), n !== t.length && j("transaction has trailing bytes");
  const O = y.reduce((L, R) => L + R.amountSats, 0n);
  return (O < 1n || O > no) && j("output total is outside the Bitcoin money range"), { raw: t, prevoutHashLe: o, prevoutIndex: u, sequence: w, outputs: y, locktime: S };
}
function K0(e, t) {
  const n = ue(new TextEncoder().encode(e));
  return ue(Ue(n, n, t));
}
function D0(e, t, n) {
  const r = Ue(e.prevoutHashLe, Bn(e.prevoutIndex)), i = Ue(new Uint8Array([n.length]), n), o = e.outputs.map((a) => Ue(Ta(a.amountSats), new Uint8Array([a.scriptPubKey.length]), a.scriptPubKey)), s = Ue(
    new Uint8Array([0, 0]),
    Bn(2),
    Bn(e.locktime),
    ue(r),
    ue(Ta(t)),
    ue(i),
    ue(Bn(e.sequence)),
    ue(Ue(...o)),
    new Uint8Array([0]),
    Bn(0)
  );
  return K0("TapSighash", s);
}
function j0(e) {
  return BigInt(`0x${X(e)}`);
}
function La(e) {
  return Mc(ue(e));
}
function Ra(e, t) {
  const n = Ue(new Uint8Array([e]), t), r = ue(ue(n)).slice(0, 4), i = Ue(n, r);
  let o = j0(i), s = "";
  for (; o > 0n; ) {
    const a = Number(o % 58n);
    s = C0[a] + s, o /= 58n;
  }
  for (const a of i) {
    if (a !== 0) break;
    s = `1${s}`;
  }
  return s;
}
function V0(e, t, n) {
  let r = 0, i = 0;
  const o = [], s = (1 << n) - 1;
  for (const a of e)
    for (r = r << t | a, i += t; i >= n; )
      i -= n, o.push(r >> i & s);
  return i > 0 && o.push(r << n - i & s), o;
}
function q0(e) {
  const t = [996825010, 642813549, 513874426, 1027748829, 705979059];
  let n = 1;
  for (const r of e) {
    const i = n >>> 25;
    n = (n & 33554431) << 5 ^ r;
    for (let o = 0; o < 5; o += 1) i >>> o & 1 && (n ^= t[o]);
  }
  return n >>> 0;
}
function Li(e, t, n) {
  const r = e === "bitcoin" ? "bc" : e === "regtest" ? "bcrt" : "tb", i = [t, ...V0(n, 8, 5)], o = [...r].map((u) => u.charCodeAt(0) >> 5).concat([0], [...r].map((u) => u.charCodeAt(0) & 31)), s = t === 0 ? H0 : U0, a = q0(o.concat(i, [0, 0, 0, 0, 0, 0])) ^ s, c = Array.from({ length: 6 }, (u, l) => a >>> 5 * (5 - l) & 31);
  return `${r}1${i.concat(c).map((u) => z0[u]).join("")}`;
}
function G0(e, t) {
  const n = Pl(t), r = e === "bitcoin";
  return n === "p2pkh" ? Ra(r ? 0 : 111, t.slice(3, 23)) : n === "p2sh" ? Ra(r ? 5 : 196, t.slice(2, 22)) : n === "p2wpkh" || n === "p2wsh" ? Li(e, 0, t.slice(2)) : Li(e, 1, t.slice(2));
}
function W0(e) {
  const t = La(e), n = Ue(new Uint8Array([0, 20]), t);
  return [
    Ue(new Uint8Array([118, 169, 20]), t, new Uint8Array([136, 172])),
    n,
    Ue(new Uint8Array([169, 20]), La(n), new Uint8Array([135]))
  ];
}
function Ri(e, t) {
  return e.length === t.length && e.every((n, r) => n === t[r]);
}
function xr(e) {
  const t = e / 100000000n, n = e % 100000000n;
  return n === 0n ? `${t}.00000000` : `${t}.${n.toString().padStart(8, "0")}`;
}
function Z0(e, t) {
  const n = e / BigInt(t), r = e % BigInt(t);
  if (r === 0n) return `${n.toString()} sat/vB`;
  const i = (r * 10000n / BigInt(t)).toString().padStart(4, "0").replace(/0+$/, "");
  return `${n.toString()}.${i} sat/vB`;
}
function X0(e) {
  return X(ue(ue(e.raw)).slice().reverse());
}
function Y0(e, t) {
  const n = t.transaction, r = Q("bitcoin.network", { network: e.network }), i = [
    Q("bitcoin.title"),
    ...t.highFeeWarning ? [Q("bitcoin.highFeeWarning"), ""] : [],
    r,
    Q("bitcoin.networkWarning"),
    Q("bitcoin.input", { txid: X(n.prevoutHashLe.slice().reverse()), vout: n.prevoutIndex }),
    Q("bitcoin.inputAmount", { sats: e.prevout.amountSats, btc: xr(BigInt(e.prevout.amountSats)) }),
    Q("bitcoin.outputs")
  ];
  return n.outputs.forEach((o, s) => {
    const a = t.sameKeyOutputIndexes.includes(s);
    i.push(Q("bitcoin.output", {
      index: s + 1,
      address: G0(e.network, o.scriptPubKey),
      sats: o.amountSats.toString(),
      btc: xr(o.amountSats),
      role: Q(a ? "bitcoin.sameKeyReturn" : "bitcoin.recipient")
    }));
  }), i.push(
    Q("bitcoin.fee", { sats: t.feeSats.toString(), btc: xr(t.feeSats), rate: Z0(t.feeSats, t.signedVsize) }),
    Q("bitcoin.vsize", { vsize: t.signedVsize }),
    Q(n.sequence === 4294967293 ? "bitcoin.rbfSignals" : "bitcoin.rbfDoesNotSignal"),
    Q("bitcoin.netLeaving", { sats: t.netLeavingSats.toString(), btc: xr(t.netLeavingSats) }),
    Q("bitcoin.unsignedTxid", { txid: X0(n) }),
    Q("bitcoin.outputKey", { key: X(t.outputKeyXOnly) })
  ), i.join(`
`);
}
function J0(e, t) {
  const n = $a(e, "signingContext");
  Oa(n, ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"], "bitcoin signingContext"), n.kind !== Ba && j("unsupported Bitcoin signing_context kind"), (typeof n.network != "string" || !R0.includes(n.network)) && j("bitcoin signing_context network is invalid");
  const r = Br(n.unsignedTransaction, "unsignedTransaction");
  r.length > Il * 2 && j("unsignedTransaction exceeds the 137-byte V1 limit");
  const i = $a(n.prevout, "signingContext.prevout");
  Oa(i, ["amountSats", "scriptPubKey"], "signingContext.prevout");
  const o = M0(i.amountSats, "prevout.amountSats", 1, Number(no)), s = Br(i.scriptPubKey, "prevout.scriptPubKey", 68);
  s.startsWith("5120") || j("prevout.scriptPubKey must be a lowercase P2TR output key script"), n.digestAlgorithm !== Pa && j("unsupported Bitcoin digest algorithm");
  const a = Br(n.digest, "signingContext.digest", 64);
  return a !== t && j("Bitcoin signing_context digest must match the sign request digest exactly"), {
    kind: Ba,
    network: n.network,
    unsignedTransaction: r,
    prevout: { amountSats: o, scriptPubKey: s },
    digestAlgorithm: Pa,
    digest: a
  };
}
function $l(e, t, n) {
  const r = J0(e, t), i = F0(r.unsignedTransaction), o = Uint8Array.from(r.prevout.scriptPubKey.match(/../g), (g) => Number.parseInt(g, 16)), s = o.slice(2);
  let a;
  if (n !== void 0) {
    const g = Br(n, "signing public key", 66);
    a = Uint8Array.from(g.match(/../g), (y) => Number.parseInt(y, 16)), a[0] !== 2 && a[0] !== 3 && j("signing public key must be compressed secp256k1");
    const p = hy(g);
    Ri(s, p) || j("prevout.scriptPubKey does not bind to the signing key's BIP86 output key");
  }
  if (a)
    for (const g of i.outputs)
      W0(a).some((p) => Ri(p, g.scriptPubKey)) && j("transaction sends to a same-key legacy or SegWit-v0 address this workflow cannot spend");
  const c = i.outputs.flatMap((g, p) => Ri(g.scriptPubKey, o) ? [p] : []);
  c.length > 1 && j("transaction may contain at most one same-key P2TR return output");
  const u = i.outputs.reduce((g, p) => g + p.amountSats, 0n), l = BigInt(r.prevout.amountSats) - u;
  l <= 0n && j("transaction fee must be positive");
  const d = i.raw.length * 4 + 68, h = Math.ceil(d / 4);
  l > 10000n * BigInt(h) && j("transaction fee rate exceeds the 10,000 sat/vB V1 safety ceiling");
  const f = X(D0(i, BigInt(r.prevout.amountSats), o));
  f !== r.digest && j("Bitcoin signing_context digest does not match the independently computed BIP341 digest");
  const w = c.reduce((g, p) => g + i.outputs[p].amountSats, 0n);
  return {
    digest: f,
    display: Y0(r, {
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
const Ca = `avault-agent-operation:v1
`;
function en(e) {
  if (typeof e != "object" || e === null || Array.isArray(e)) throw new Error("signing context is malformed");
  return e;
}
function za(e) {
  return e.startsWith("0x") ? e.toLowerCase() : `0x${e.toLowerCase()}`;
}
function Ci(e, t) {
  const n = za(e), r = za(t);
  if (n !== r)
    throw new Error("signing digest does not match verified context");
  return r.slice(2);
}
function W(e) {
  return typeof e == "bigint" ? e.toString() : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : e == null ? "" : an(e);
}
function an(e) {
  if (typeof e == "bigint") return JSON.stringify(e.toString());
  if (e === null || typeof e != "object") return JSON.stringify(e);
  if (Array.isArray(e)) return `[${e.map(an).join(",")}]`;
  const t = e;
  return `{${Object.keys(t).sort().filter((n) => t[n] !== void 0).map((n) => `${JSON.stringify(n)}:${an(t[n])}`).join(",")}}`;
}
const Q0 = bw([
  "function approve(address spender,uint256 amount)",
  "function transfer(address to,uint256 amount)",
  "function transferFrom(address from,address to,uint256 amount)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function safeTransferFrom(address from,address to,uint256 tokenId)",
  "function safeTransferFrom(address from,address to,uint256 tokenId,bytes data)"
]);
function em(e) {
  if (e == null || e === "" || e === "0x") return "0x";
  if (typeof e != "string" || !/^0x[0-9a-fA-F]*$/.test(e) || e.length % 2 !== 0)
    throw new Error("EVM transaction calldata is malformed");
  return e;
}
const tm = /* @__PURE__ */ new Set([
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
]), nm = /* @__PURE__ */ new Set(["domain", "types", "primaryType", "message"]);
function zi(e, t, n) {
  const r = Object.keys(e).filter((i) => !t.has(i));
  if (r.length > 0)
    throw new Error(`${n} carries unsupported field: ${r.sort().join(", ")}`);
}
function Ol(e) {
  if (e.type !== void 0 && e.type !== "legacy" && e.type !== "eip1559")
    throw new Error("unsupported EVM transaction type");
  return e.type === "eip1559" || e.maxFeePerGas !== void 0 || e.maxPriorityFeePerGas !== void 0 ? "eip1559" : "legacy";
}
function rm(e, t) {
  if (t.chainId === void 0 || t.chainId === null || t.chainId === "")
    throw new Error("EVM transaction chain id is required");
  if (String(t.chainId) !== String(e.chainId))
    throw new Error("EVM transaction chain id mismatch");
}
function im(e) {
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
function om(e) {
  if (e === "0x") return "calldata: none";
  let t;
  try {
    t = f0({ abi: Q0, data: e });
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
function sm(e) {
  const t = em(e.data), n = Ol(e);
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
    om(t)
  ].filter((i) => !i.endsWith(": ")).join(`
`);
}
function am(e) {
  Wo(e);
  const t = en(e), n = {
    "evm-transaction": ["kind", "chainId", "unsignedTransaction", "digestAlgorithm", "digest"],
    "eip-712-typed-data": ["kind", "typedData", "digestAlgorithm", "digest"],
    "avault-agent-operation": ["kind", "canonicalPreimage", "digestAlgorithm", "digest"],
    "bitcoin-taproot-keypath-v1": ["kind", "network", "unsignedTransaction", "prevout", "digestAlgorithm", "digest"]
  }, r = Object.hasOwn(n, e.kind) ? n[e.kind] : void 0;
  if (!r) throw new Error("unsupported signing context");
  if (zi(t, new Set(r), "signing context"), typeof e.digest != "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(e.digest))
    throw new Error("signing context digest must be 32 bytes");
  switch (e.kind) {
    case "evm-transaction": {
      if (e.digestAlgorithm !== "keccak256") throw new Error("unsupported EVM digest algorithm");
      const i = en(e.unsignedTransaction);
      zi(i, tm, "EVM transaction"), rm(e, i), Ol(i);
      const o = w0(im(i)), s = Ci(e.digest, Je(o));
      return {
        digest: s,
        challenge: He(s),
        display: sm(i)
      };
    }
    case "eip-712-typed-data": {
      if (e.digestAlgorithm !== "eip712") throw new Error("unsupported EIP-712 digest algorithm");
      const i = en(e.typedData);
      zi(i, nm, "EIP-712 typed data");
      const o = en(i.domain);
      if (o.chainId === void 0 || o.verifyingContract === void 0)
        throw new Error("EIP-712 domain must include chainId and verifyingContract");
      const s = Ci(e.digest, $0(i));
      return {
        digest: s,
        challenge: He(s),
        display: [
          "EIP-712 typed data",
          `domain.chainId: ${W(o.chainId)}`,
          `domain.verifyingContract: ${W(o.verifyingContract)}`,
          `domain: ${an(o)}`,
          `types: ${an(en(i.types))}`,
          `primaryType: ${W(i.primaryType)}`,
          `message: ${an(en(i.message))}`
        ].join(`
`)
      };
    }
    case "avault-agent-operation": {
      if (e.digestAlgorithm !== "avault-operation-hash-v1") throw new Error("unsupported avault digest algorithm");
      if (typeof e.canonicalPreimage != "string" || !e.canonicalPreimage.startsWith(Ca) || e.canonicalPreimage.slice(Ca.length).trim().length === 0)
        throw new Error("canonical preimage must start with avault-agent-operation:v1\\n followed by operation text; recreate the request");
      const i = Ci(e.digest, Ah(ue(new TextEncoder().encode(e.canonicalPreimage))));
      return {
        digest: i,
        challenge: He(i),
        display: ["Avault agent operation", e.canonicalPreimage].join(`
`)
      };
    }
    case "bitcoin-taproot-keypath-v1": {
      const i = $l(e, e.digest);
      return {
        digest: i.digest,
        challenge: He(i.digest),
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
      yh(t);
    } catch {
      throw new m("invalid_payload", "signing messageHex exceeds the 1 MiB decoded limit");
    }
}
function fs(e) {
  if (Pr(e), Wo(e), !e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", "Solana signing context must be an object");
  const t = e;
  if (t.kind !== "solana-transaction-v1" || Object.keys(t).some((n) => n !== "kind" && n !== "messageHex") || typeof t.messageHex != "string" || t.messageHex.length === 0 || t.messageHex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(t.messageHex))
    throw new m("invalid_payload", "Solana context requires only kind and nonempty lowercase even messageHex; no digest alias");
  return { kind: "solana-transaction-v1", messageHex: t.messageHex };
}
function Tl(e, t, n) {
  if (n.kind !== "keypair" || !n.publicKey) throw new Error("protected signing requires a keypair protected record");
  const r = wn(n.curve);
  if (e === Dn || t.kind === "solana-transaction-v1" || r === "ed25519") {
    if (e !== Dn || t.kind !== "solana-transaction-v1" || r !== "ed25519")
      throw new m("invalid_payload", "Ed25519 signing requires an Ed25519 record, ed25519 scheme and Solana context together");
    fs(t);
  }
}
function Ll(e, t) {
  if (e === Dn || t.kind === "solana-transaction-v1")
    throw new m("unsupported_signing_context", "protected Solana signing is not enabled in this sandbox release");
}
function tn(e, t) {
  if (!e || typeof e != "object" || Array.isArray(e)) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function Er(e, t) {
  if (typeof e != "string" || e.length === 0) throw new m("invalid_payload", `${t} must be a non-empty string`);
  return e;
}
function Rn(e, t, n) {
  if (Object.keys(e).some((r) => !t.includes(r)))
    throw new m("invalid_payload", `${n} carries unsupported fields; script trees are not supported`);
}
function ps(e) {
  if (e && typeof e == "object") {
    for (const t of Object.values(e)) ps(t);
    Object.freeze(e);
  }
  return e;
}
function hs(e, t) {
  if (Pr(e), t && typeof t == "object") {
    const n = t.release;
    Pr(n), n && typeof n == "object" && Pr(n.signingContext);
  }
}
function cm(e) {
  const t = tn(e, "sign request");
  hs(t.signingContext, t.context), Wo(t);
  const n = tn(structuredClone(t), "sign request");
  Rn(n, ["material", "scheme", "signingContext", "context"], "sign request");
  const r = tn(n.material, "material");
  Rn(r, ["name", "envelope"], "material");
  const i = tn(r.envelope, "envelope");
  Rn(i, ["ciphertext", "nonce", "wrap_meta"], "envelope");
  const o = Xo(n.context);
  Rn(tn(o, "context"), ["v", "purpose", "requestId", "grantId", "display", "release", "agent", "expiresAt", "signature"], "sign context");
  let s;
  try {
    s = ko(n.scheme);
  } catch {
    throw new m("invalid_payload", "unsupported signing scheme");
  }
  const a = tn(n.signingContext, "signingContext");
  return a.kind === "solana-transaction-v1" && fs(a), ps({
    material: {
      name: Er(r.name, "material.name"),
      envelope: {
        ciphertext: Er(i.ciphertext, "envelope.ciphertext"),
        nonce: Er(i.nonce, "envelope.nonce"),
        wrap_meta: Er(i.wrap_meta, "envelope.wrap_meta")
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
function Rl(e, t, n) {
  hs(e.signingContext, e.context), Zi({ context: e.context, expectedPurpose: "sign", secret: { name: e.material.name, kind: "keypair" } });
  const r = e.context.release;
  (!r || Array.isArray(r)) && Pn();
  const i = t.kind === "message";
  if (!i && (t.kind !== "digest" || !/^[0-9a-f]{64}$/.test(t.digest)) && Pn(), Rn(r, ["name", "scheme", i ? "messageHex" : "digest", "publicKey", "signingContext"], "sign context.release"), i) {
    const o = fs(e.signingContext);
    (t.messageHex !== o.messageHex || r.messageHex !== t.messageHex || e.scheme !== "ed25519" || !/^[0-9a-f]{64}$/.test(n) || r.publicKey !== n) && Pn();
  } else (e.scheme === "ed25519" || e.signingContext.kind === "solana-transaction-v1" || r.digest !== t.digest) && Pn();
  (r.name !== e.material.name || r.scheme !== e.scheme || typeof r.publicKey != "string" || r.publicKey.toLowerCase() !== n.toLowerCase() || !r.signingContext || $t(r.signingContext) !== $t(e.signingContext)) && Pn();
}
function um(e) {
  return hs(e.signingContext, e.context), ue(new TextEncoder().encode(ui(e.context)));
}
function lm(e, t) {
  if (ko(e), e === "ed25519") throw new Error("Ed25519 approval is not enabled in this sandbox release");
  if (!/^(02|03)[0-9a-fA-F]{64}$/.test(t)) throw new Error("signing public key must be compressed secp256k1");
  return e === So ? `BIP340 raw Schnorr (untweaked internal key)
internal key: ${t.slice(2).toLowerCase()}` : e === jn ? Q("bitcoin.signingIdentity", { key: t.slice(2).toLowerCase() }) : `${e === si ? "ECDSA secp256k1 recoverable" : "ECDSA secp256k1 DER"}
public key: ${t.toLowerCase()}`;
}
function dm(e) {
  const t = cm(e), n = dn(t.material.envelope), r = Bo(t.material.name, n.recordMetadata);
  Tl(t.scheme, t.signingContext, r), Ll(t.scheme, t.signingContext);
  let i = am(t.signingContext);
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    if (t.scheme !== jn)
      throw new m("invalid_payload", "Bitcoin Taproot contexts require the BIP341 key-path signing scheme");
  } else {
    if (t.scheme === jn)
      throw new m("invalid_payload", "the BIP341 key-path signing scheme requires a Bitcoin Taproot context");
    if (t.signingContext.kind !== "avault-agent-operation" && t.scheme !== si && t.scheme !== Eo)
      throw new m("invalid_payload", "EVM signing contexts require an ECDSA scheme");
  }
  if (t.signingContext.kind === "bitcoin-taproot-keypath-v1") {
    const a = $l(t.signingContext, i.digest, r.publicKey);
    i = { digest: a.digest, challenge: i.challenge, display: a.display };
  }
  Rl(t, { kind: "digest", digest: i.digest }, r.publicKey);
  const o = `${lm(t.scheme, r.publicKey)}
scheme: ${t.scheme}
${i.display}`, s = um(t);
  return ps({ request: t, verified: { digest: i.digest, display: o }, unpacked: n, recordContext: r, challenge: [...s] });
}
async function Cl(e, t, n) {
  Ll(e.request.scheme, e.request.signingContext), Tl(e.request.scheme, e.request.signingContext, e.recordContext);
  const r = await $o(n, t);
  Yr({ context: e.request.context, rootMetadata: r, expectedPurpose: "sign" }), Rl(e.request, { kind: "digest", digest: e.verified.digest }, e.recordContext.publicKey), Jr([e.request.context]);
}
async function fm(e, t, n) {
  return await Cl(e, t, n), ey(e.unpacked.sealed, t, e.recordContext, e.verified.digest, e.request.scheme);
}
function zl(e) {
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
async function pm(e) {
  let t = new TextEncoder().encode(e.value);
  try {
    const n = { name: e.name, kind: "static" }, r = await Xc(t, e.vmk, n);
    return { envelope: Qc(r, e.wrapMeta, n) };
  } finally {
    t?.fill(0), t = void 0;
  }
}
async function hm(e) {
  const t = wn(e.curve), n = Jh(t);
  let r = n.privateKey;
  try {
    const i = {
      name: e.name,
      kind: "keypair",
      publicKey: n.publicKey,
      ...t === "ed25519" ? { curve: t } : {}
    }, o = await Xc(r, e.vmk, i);
    return {
      envelope: Qc(o, e.wrapMeta, i),
      publicKey: n.publicKey,
      addresses: t === "ed25519" ? { solana: ty(n.publicKey) } : yy(n.publicKey)
    };
  } finally {
    r?.fill(0), r = void 0;
  }
}
function Ul(e) {
  return (e?.kind ?? "static") === "static";
}
function ym(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", "approveRelease item must be an object");
  const n = e;
  return {
    material: t(n.material),
    context: Xo(n.context)
  };
}
function Hl(e) {
  const t = e[0]?.context.display;
  if (!t) throw new m("invalid_payload", "approveRelease requires at least one item");
  if (e[0].context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
  const n = ga(e[0].context), r = Ua(e[0].context);
  for (const s of e) {
    if (s.context.purpose !== "agent-deliver") throw new m("invalid_context", "approveRelease only accepts agent-deliver contexts");
    if (ga(s.context) !== n)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed display block");
    if (Ua(s.context) !== r)
      throw new m("invalid_context", "approveRelease batch contexts must share one signed recipient");
  }
  const i = new Set(t.secrets.map((s) => `${s.name}:${s.kind}`));
  for (const s of e) {
    const { recordMetadata: a } = dn(s.material.envelope), c = a?.kind ?? "static";
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
function Ua(e) {
  if (!e.grantId) throw new m("invalid_context", "agent delivery context is missing grantId");
  if (!e.agent) throw new m("invalid_context", "agent delivery context is missing agent key");
  return $t({ agent: e.agent, grantId: e.grantId });
}
async function gm(e) {
  if (e.items.length === 0) throw new m("invalid_payload", "approveRelease requires at least one item");
  const t = Hl(e.items), n = await $o(e.wrapMeta, e.vmk), r = e.items.map((a) => a.context);
  for (const a of e.items)
    Yr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: e.now
    });
  Jr(r, e.now);
  const i = await Pg(r);
  await e.confirm({
    ...t,
    challenge: i
  });
  const o = e.now ?? Date.now();
  for (const a of e.items)
    Yr({
      context: a.context,
      rootMetadata: n,
      expectedPurpose: "agent-deliver",
      now: o
    });
  e.onApprovalAccepted?.(o), Jr(r, o);
  const s = [];
  for (const a of e.items) {
    const { sealed: c, recordMetadata: u } = dn(a.material.envelope);
    if (!Ul(u)) throw new m("invalid_payload", "approveRelease requires static protected records");
    s.push(
      await Yh(
        c,
        e.vmk,
        Bg(a.context),
        Bo(a.material.name, u),
        await Ig(a.context, a.material.name)
      )
    );
  }
  return e.consumeReplayIds !== !1 && await li(r, o), { blindBoxes: s };
}
const Ml = `avibe-vault-setup:v1:${oe.buildHash}:`, wm = `avibe-vault-setup-result:${oe.buildHash}:`, bm = `avibe-vault-setup-error:${oe.buildHash}:`, mm = 300 * 1e3, vm = 300 * 1e3, xm = 30 * 1e3, Em = 8 * 1e3, _e = new od();
let Ha = !1;
function Sm(e) {
  if (typeof e != "object" || e === null) return !1;
  const t = e;
  return (t.locale === "en" || t.locale === "zh") && (t.theme === "light" || t.theme === "dark");
}
function Nl(e) {
  if (!Sm(e))
    throw new m("invalid_payload", "appearance must include locale and theme");
  return e;
}
function km(e) {
  return e == null ? null : Nl(e);
}
function yi(e) {
  const t = Wy(e.locale);
  document.documentElement.setAttribute("data-theme", e.theme), t && Yy();
}
function Fl() {
  const e = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  return { locale: Zy(), theme: e };
}
function Se(e) {
  if (typeof e != "object" || e === null)
    throw new m("invalid_payload", "request payload must be an object");
  return e;
}
function Kl(e, t) {
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
function Dl(e, t) {
  if (typeof e != "object" || e === null) throw new m("invalid_payload", `${t} must be an object`);
  return e;
}
function Am(e) {
  const t = Dl(e, "envelope");
  return {
    ciphertext: xe(t.ciphertext, "envelope.ciphertext"),
    nonce: xe(t.nonce, "envelope.nonce"),
    wrap_meta: xe(t.wrap_meta, "envelope.wrap_meta")
  };
}
function jl(e) {
  const t = Dl(e, "material");
  return { name: xe(t.name, "material.name"), envelope: Am(t.envelope) };
}
function _m(e) {
  const t = e == null ? {} : Se(e);
  return { wrapMeta: Kl(t.wrapMeta, "wrapMeta") };
}
function Vl(e) {
  const t = Se(e), n = !!t.existingProtectedVault;
  if (n && t.rootMetadata !== void 0)
    throw new m("invalid_payload", "vault root metadata cannot be replaced during setup");
  return {
    vaultUserHandle: xe(t.vaultUserHandle, "vaultUserHandle"),
    displayName: xe(t.displayName, "displayName"),
    existingProtectedVault: n,
    authzCreationOptions: t.authzCreationOptions,
    ...t.rootMetadata !== void 0 ? { rootMetadata: t.rootMetadata } : {},
    ...t.policy !== void 0 ? { policy: Co(t.policy) } : {}
  };
}
function Im(e) {
  const t = Se(e);
  return {
    wrapMeta: xe(t.wrapMeta, "wrapMeta"),
    ...t.policy !== void 0 ? { policy: Co(t.policy) } : {}
  };
}
function Bm(e) {
  const t = Se(e);
  return { material: jl(t.material), context: Xo(t.context) };
}
function Pm(e) {
  const t = Se(e);
  if (!Array.isArray(t.items) || t.items.length === 0)
    throw new m("invalid_payload", "approveRelease requires a non-empty items array");
  return { items: t.items.map((n) => ym(n, jl)) };
}
function $m(e) {
  const t = Se(e);
  if (t.operation !== "delete_secret") throw new m("invalid_payload", "deleteAuthzAssertion only supports delete_secret");
  return {
    challengeId: xe(t.challengeId, "challengeId"),
    operation: "delete_secret",
    secretName: xe(t.secretName, "secretName"),
    webauthn: t.webauthn
  };
}
function ql() {
  if (typeof crypto.randomUUID == "function") return crypto.randomUUID();
  const e = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(e, (t) => t.toString(16).padStart(2, "0")).join("");
}
async function Ma(e) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e)));
}
function Om(e) {
  return new Promise((t, n) => {
    const r = () => {
      n(vn(e));
    };
    if (e.aborted) {
      r();
      return;
    }
    e.addEventListener("abort", r, { once: !0 });
  });
}
function Tm(e) {
  for (const t of e)
    if (t.aborted) return vn(t);
  return new Error("operation-superseded");
}
function Gl(e) {
  const t = new AbortController(), n = [], r = (i) => {
    t.signal.aborted || t.abort(vn(i));
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
async function Wl(e) {
  const t = Gl(e.abortSignals);
  try {
    await Promise.race([
      Ky(_o(e.wrapMeta), ht(), e.challenge, t.signal).catch((n) => {
        throw t.signal.aborted ? Tm(e.abortSignals) : n;
      }),
      ...e.abortSignals.map((n) => Om(n))
    ]);
  } finally {
    t.cleanup();
  }
}
async function ys(e) {
  await nr(async (t) => {
    const n = async (i) => {
      const o = Gl([t, ...e.abortSignal ? [e.abortSignal] : []]);
      try {
        const s = await Nm(
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
          await _u({
            wrapMeta: e.wrapMeta,
            currentRpId: ht(),
            assertion: {
              prfOutput: pe(s.prfOutput),
              prfSalt: pe(s.prfSalt)
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
    await Go(
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
function Lm(e) {
  const { challenge: t, ...n } = e;
  return {
    ...n,
    ...t ? { challenge: J(t) } : {}
  };
}
function Nt(e, t) {
  if (typeof e == "string" && e.length > 0) return e;
  const n = Se(e);
  if (n && typeof n.text == "string") return de(n.text);
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
function Rm(e) {
  if (e === void 0) return;
  const t = Se(e);
  if (!t || !Array.isArray(t.rows)) throw new m("invalid_payload", "details must contain rows");
  const n = [];
  for (const [r, i] of t.rows.entries()) {
    const o = Se(i);
    if (!o) throw new m("invalid_payload", `details.rows[${r}] must be an object`);
    const s = o.variant;
    if (s !== void 0 && s !== "text" && s !== "command" && s !== "mono" && s !== "chips")
      throw new m("invalid_payload", `details.rows[${r}].variant is invalid`);
    const a = Nt(o.label, `details.rows[${r}].label`);
    if (s === "chips") {
      if (!Array.isArray(o.values)) throw new m("invalid_payload", `details.rows[${r}].values must be an array`);
      const c = o.tone;
      if (c !== void 0 && c !== "default" && c !== "warning")
        throw new m("invalid_payload", `details.rows[${r}].tone is invalid`);
      const u = c === "default" || c === "warning" ? c : void 0;
      n.push({
        label: a,
        values: o.values.map((l, d) => Nt(l, `details.rows[${r}].values[${d}]`)),
        variant: "chips",
        ...u !== void 0 ? { tone: u } : {}
      });
      continue;
    }
    n.push({
      label: a,
      value: Nt(o.value, `details.rows[${r}].value`),
      ...s !== void 0 ? { variant: s } : {}
    });
  }
  return {
    rows: n
  };
}
function Cm(e) {
  const t = Se(e);
  if (!t) throw new m("invalid_payload", "authorization prompt must be an object");
  const n = t.challenge === void 0 ? void 0 : pe(xe(t.challenge, "prompt.challenge"));
  return {
    title: Nt(t.title, "prompt.title"),
    subtitle: Nt(t.subtitle, "prompt.subtitle"),
    ...t.body !== void 0 ? { body: Nt(t.body, "prompt.body") } : {},
    ...t.details !== void 0 ? { details: Rm(t.details) } : {},
    ...n ? { challenge: n } : {},
    label: Nt(t.label, "prompt.label")
  };
}
function zm(e) {
  return {
    ...e,
    prompt: Lm(e.prompt)
  };
}
function Um(e) {
  const t = Se(e);
  if (!t) throw new m("invalid_payload", "authorization request must be an object");
  const n = t.passkey;
  if (n !== "none" && n !== "unlock" && n !== "uv")
    throw new m("invalid_payload", "authorization passkey requirement is invalid");
  return {
    prompt: Cm(t.prompt),
    wrapMeta: xe(t.wrapMeta, "wrapMeta"),
    passkey: n
  };
}
function Hm(e) {
  return Da("authorize", e, Fl());
}
function Mm(e) {
  const t = Se(e);
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
function Nm(e, t, n) {
  Ft(t);
  const r = n ?? ql(), i = `avibe-vault-authorization-${r}`;
  return new Promise((o, s) => {
    let a = null, c = !1, u = null, l = null, d = null, h = null;
    const f = () => v(() => s(vn(t))), w = () => v(() => s(new m("authorization_cancelled", "requesting sandbox was unloaded", !0))), g = () => new m("authorization_window_closed", "authorization window was closed", !0), p = (_) => {
      a = _, l = setInterval(() => {
        !_.closed || d || (d = setTimeout(() => v(() => s(g())), 2500));
      }, 500);
    }, y = (_) => {
      if (_.origin !== window.location.origin) return;
      const I = _.data;
      if (!(!I || I.id !== r || !nn(I.build)) && (!a && n && I.type === "authorization-ready" && _.source && (h && clearTimeout(h), h = null, p(_.source)), _.source === a))
        if (I.type === "authorization-ready")
          try {
            a?.postMessage(
              {
                type: "authorization-request",
                build: oe,
                id: r,
                request: zm(e)
              },
              window.location.origin
            );
          } catch (S) {
            v(() => s(S));
          }
        else if (I.type === "authorization-approved")
          try {
            const S = Mm(I.result);
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
      h = setTimeout(() => v(() => s(g())), xm);
    else {
      const _ = window.open(Hm(r), i, "popup,width=520,height=760");
      if (!_) {
        v(() => s(new m("authorization_popup_blocked", "authorization window was blocked", !0)));
        return;
      }
      _.focus(), p(_);
    }
    if (u = setTimeout(
      () => v(() => s(new m("authorization_window_timeout", "authorization window timed out", !0))),
      vm
    ), t) {
      if (t.aborted) {
        f();
        return;
      }
      t.addEventListener("abort", f, { once: !0 });
    }
  });
}
function Fm(e) {
  return e === 0 ? "context.oneTime" : e % 60 === 0 ? Gn("context.minutes", { count: e / 60 }) : Gn("context.seconds", { count: e });
}
function yn(e, t) {
  const n = [];
  e.sessionLabel && n.push({ label: "context.session", value: de(e.sessionLabel) }), e.command && n.push({ label: "context.command", value: de(e.command), variant: "command" }), e.egress && n.push({ label: "context.egress", value: de(e.egress) });
  const r = [
    ...e.source?.env?.map((i) => de(`${Q("context.sourceEnv")}: ${i}`)) ?? [],
    ...e.source?.tags?.map((i) => de(`${Q("context.sourceTag")}: ${i}`)) ?? [],
    ...e.source?.skills?.map((i) => de(`${Q("context.sourceSkill")}: ${i}`)) ?? []
  ];
  return r.length > 0 && n.push({ label: "context.source", values: r, variant: "chips" }), t?.agentFingerprint && n.push({ label: "context.agent", value: de(t.agentFingerprint), variant: "mono" }), t?.grantId && n.push({ label: "context.grant", value: de(t.grantId), variant: "mono" }), e.grantTtlSeconds !== void 0 && n.push({ label: "context.agentAccess", value: Fm(e.grantTtlSeconds) }), n.push({
    label: "context.secrets",
    values: e.secrets.map(
      (i) => de(`${i.name} · ${Q(i.kind === "static" ? "context.kindStatic" : "context.kindKeypair")}`)
    ),
    variant: "chips",
    tone: "warning"
  }), { rows: n };
}
function Km(e) {
  return e instanceof Error && e.message === "vault-locked";
}
function Dm(e) {
  return e instanceof Error && e.message === "vault-operation-aborted";
}
function Zl(e, t) {
  return Km(e) ? !0 : Dm(e) && pt(t).state === "locked";
}
async function jm(e, t = Ee(), n) {
  await Au({ wrapMeta: e, currentRpId: ht(), policy: t, abortSignal: n });
}
async function Vm(e, t = Ee()) {
  await nr((n) => jm(e, t, n));
}
async function Xl(e) {
  try {
    await ys({ ...e, passkey: "unlock" });
  } catch (t) {
    throw pt(e.wrapMeta).state === "unlocked" && Fe({ broadcast: !0, reason: "manual-lock" }), t;
  }
}
async function qm(e, t) {
  if (pt(e).state !== "unlocked") {
    if (!e) throw new Error("vault-locked");
    await Vm(e);
  }
  return await Mo(t, { renewOnSuccess: !0 });
}
async function Yl(e) {
  const t = pt(e.wrapMeta).state, n = Ee(), r = zl({ tier: e.tier, vaultState: t, policy: n });
  let i = !1;
  const o = async () => {
    await Xl({
      ...e.lockedPrompt,
      wrapMeta: e.wrapMeta,
      policy: n,
      parentSurface: e.parentSurface,
      authorizationWindow: e.authorizationWindow
    }), i = !0;
  }, s = async (a, c = !1) => {
    let u = !1;
    try {
      const l = await Mo(
        async (d, h, f) => {
          const w = await e.buildPrompt(d, h, f);
          return r.confirm && !c && (await ys({
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
      throw i && !u && pt().state === "unlocked" && Fe({ broadcast: !0, reason: "manual-lock" }), l;
    }
  };
  try {
    return r.passkey === "unlock" ? (await o(), await s("none", !0)) : await s(r.passkey === "uv" ? "uv" : "none");
  } catch (a) {
    if (r.passkey !== "unlock" && Zl(a, e.wrapMeta))
      return await o(), await s("none", !0);
    throw a;
  }
}
function De(e, t) {
  if (e instanceof m) return e;
  if (qy(e)) return new m("passkey_cancelled", "passkey-cancelled", !0);
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
function Gm(e) {
  return J(new TextEncoder().encode(JSON.stringify(e))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function Wm(e) {
  return Vl(JSON.parse(new TextDecoder().decode(pe(e))));
}
function Zm(e, t) {
  return Da("setup", e, Fl(), { req: Gm(t) });
}
function Ui(e) {
  const t = Se(e);
  return {
    credentialId: xe(t.credentialId, "credentialId"),
    ...t.authzRegistration !== void 0 ? { authzRegistration: t.authzRegistration } : {}
  };
}
function gi(e) {
  return `${wm}${e}`;
}
function wi(e) {
  return `${bm}${e}`;
}
function Na(e) {
  try {
    localStorage.removeItem(gi(e)), localStorage.removeItem(wi(e));
  } catch {
  }
}
function Xm(e, t) {
  try {
    localStorage.setItem(gi(e), JSON.stringify({ build: oe, result: t })), localStorage.removeItem(wi(e));
  } catch {
  }
}
function Ym(e, t) {
  try {
    localStorage.setItem(
      wi(e),
      JSON.stringify({ build: oe, code: t.code, message: t.message, retryable: t.retryable })
    ), localStorage.removeItem(gi(e));
  } catch {
  }
}
function Jl(e) {
  if (window.self === window.top)
    return Ko({
      rpId: ht(),
      vaultUserHandle: e.vaultUserHandle,
      displayName: e.displayName,
      authzCreationOptions: e.authzCreationOptions
    });
  const t = ql(), n = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Ml}${t}`);
  let r = null;
  return Na(t), new Promise((i, o) => {
    let s = !1, a = null, c = null, u = null;
    const l = () => d(() => o(new m("setup_window_closed", "requesting sandbox was unloaded", !0))), d = (g) => {
      if (!s) {
        s = !0, a && clearTimeout(a), c && clearInterval(c), u && clearTimeout(u), window.removeEventListener("visibilitychange", f), window.removeEventListener("focus", f), window.removeEventListener("storage", f), window.removeEventListener("message", w), window.removeEventListener("pagehide", l), n?.close(), Na(t);
        try {
          r?.close();
        } catch {
        }
        g();
      }
    }, h = () => {
      let g = null, p = null;
      try {
        g = localStorage.getItem(gi(t)), p = localStorage.getItem(wi(t));
      } catch {
        return !1;
      }
      if (g) {
        try {
          const y = Se(JSON.parse(g));
          if (!nn(y.build)) throw new m("sandbox_build_mismatch");
          const v = Ui(y.result);
          d(() => i(v));
        } catch (y) {
          const v = y instanceof Error ? y.message : "stored setup result is invalid";
          d(() => o(new m("setup_storage_invalid", v)));
        }
        return !0;
      }
      if (p) {
        try {
          const y = Se(JSON.parse(p));
          if (!nn(y.build)) throw new m("sandbox_build_mismatch");
          d(
            () => o(new m(xe(y.code, "code"), Kl(y.message, "message"), !!y.retryable))
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
      !p || p.id !== t || !nn(p.build) || (p.type === "setup-created" ? d(() => i(Ui(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    };
    if (a = setTimeout(() => {
      h() || d(() => o(new m("setup_window_timeout", "setup window timed out", !0)));
    }, mm), c = setInterval(() => {
      !r?.closed || u || h() || (u = setTimeout(() => {
        h() || d(() => o(new m("setup_window_closed", "setup window was closed", !0)));
      }, 2500));
    }, 500), n && (n.onmessage = (g) => {
      const p = g.data;
      !p || p.id !== t || !nn(p.build) || (p.type === "setup-created" ? d(() => i(Ui(p.result))) : p.type === "setup-error" && d(() => o(new m(p.code, p.message, !!p.retryable))));
    }), window.addEventListener("visibilitychange", f), window.addEventListener("focus", f), window.addEventListener("storage", f), window.addEventListener("message", w), window.addEventListener("pagehide", l, { once: !0 }), r = window.open(Zm(t, e), "avibe-vault-setup", "popup,width=440,height=620"), !r) {
      d(() => o(new m("setup_popup_blocked", "setup window was blocked", !0)));
      return;
    }
    r.focus();
  });
}
function vn(e) {
  const t = e.reason;
  return t instanceof Error ? t : new Error("operation-superseded");
}
function Ft(e) {
  if (e?.aborted) throw vn(e);
}
function Jm() {
  const e = window.navigator;
  return /iP(?:hone|ad|od)/.test(e.userAgent) || e.platform === "MacIntel" && e.maxTouchPoints > 1;
}
function Fa(e) {
  return Jm() && xu(e);
}
async function Ql(e, t, n, r, i = Ee()) {
  const o = Bh();
  let s, a;
  try {
    Ft(r), s = (await Fo([{ credentialId: n.credentialId, prfSalt: o }], t, r)).prfOutput, Ft(r), a = Ih();
    const u = await Oh(a, [{ kind: "passkey", prfOutput: s, prfSalt: o, credentialId: n.credentialId }]);
    Ft(r);
    let l = Rh(u, {
      rpId: t,
      vaultUserHandle: e.vaultUserHandle
    });
    e.rootMetadata && (l = Uh(l, await zh(a, e.rootMetadata, l)), Ft(r));
    const d = gu({
      vmk: a,
      wrapMeta: l,
      freshSetup: !e.existingProtectedVault,
      scopeId: Ey(e.vaultUserHandle),
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
function Qm(e, t, n) {
  return nr((r) => {
    const i = jo(
      "setup.title",
      "setup.subtitle",
      "setup.iframeBody"
    ), o = Wn("setup.createPasskey"), s = ku("setup.ready");
    return rn(i.card, o), rn(i.card, s), new Promise((a, c) => {
      let u = !1, l = "create", d = null, h = !1;
      const f = (S) => {
        u || (u = !0, r.removeEventListener("abort", p), Vo(), S());
      }, w = (S) => {
        f(() => c(S));
      }, g = (S) => {
        u || (l = "create", d = null, G(o, "setup.createPasskey"), o.disabled = !1, G(s, S));
      }, p = () => {
        w(vn(r));
      }, y = (S) => {
        if (S instanceof m && S.code === "setup_popup_blocked") {
          g("setup.popupBlocked");
          return;
        }
        w(S);
      }, v = () => {
        h = !0, o.disabled = !0, G(s, "setup.popupPrompt");
        let S;
        try {
          S = Jl(e);
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
        o.disabled = !0, G(s, "setup.passkeyPrompt"), Ql(e, t, S, r, n).then(
          (O) => f(() => a(O)),
          (O) => w(O)
        );
      }, I = () => {
        o.disabled = !0, G(s, "setup.passkeyPrompt");
        let S;
        try {
          S = Ko({
            rpId: t,
            vaultUserHandle: e.vaultUserHandle,
            displayName: e.displayName,
            authzCreationOptions: e.authzCreationOptions
          });
        } catch (O) {
          if (Fa(O)) {
            v();
            return;
          }
          w(O);
          return;
        }
        S.then(
          (O) => _(O),
          (O) => {
            if (Fa(O)) {
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
async function ev(e) {
  const t = Vl(e);
  try {
    const n = ht(), r = t.policy ?? Ee(), i = window.self !== window.top ? await Qm(t, n, r) : await Ql(t, n, await Jl(t), void 0, r), o = t.policy ? zo(r) : Ee();
    return { ...i, policy: o };
  } catch (n) {
    throw De(n, "setup_failed");
  }
}
async function tv(e) {
  const t = Im(e);
  try {
    const n = ht(), r = t.policy ?? Ee(), i = await nr(async (s) => {
      let a;
      if (await Go(
        {
          title: "unlock.sessionTitle",
          subtitle: Gn("unlock.sessionSubtitle", {
            minutes: r.windowSeconds / 60
          }),
          body: "unlock.sessionBody",
          confirmLabel: "common.continue"
        },
        s,
        void 0,
        async () => {
          a = await Au({ wrapMeta: t.wrapMeta, currentRpId: n, abortSignal: s, policy: r });
        }
      ), !a) throw new Error("vault unlock did not complete");
      return a;
    }), o = t.policy ? zo(r) : Ee();
    return { ...i, policy: o };
  } catch (n) {
    throw De(n, "unlock_failed");
  }
}
async function nv(e) {
  const t = yg(e);
  t.wrapMeta && No(t.wrapMeta);
  try {
    if (t.kind === "static" && !Ee().parentValueSealAllowed)
      throw new m("parent_value_seal_disabled", "parent-value sealing is disabled by policy");
    return await qm(t.wrapMeta, async (n, r) => ({ ...t.kind === "static" ? await pm({ name: t.name, value: t.value, vmk: n, wrapMeta: r }) : await hm({ name: t.name, curve: t.curve, vmk: n, wrapMeta: r }), establishingVmk: Py() }));
  } catch (n) {
    throw De(n, "seal_failed");
  }
}
async function rv(e, t) {
  const n = Bm(e);
  try {
    const { sealed: r, vmkWrapMeta: i, recordMetadata: o } = dn(n.material.envelope);
    if (o?.kind === "keypair") throw new Error("keypair protected records cannot be revealed as plaintext");
    return Zi({
      context: n.context,
      expectedPurpose: "reveal",
      secret: { name: n.material.name, kind: "static" }
    }), await Yl({
      tier: "R2",
      wrapMeta: i,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "reveal.showConfirmTitle",
        subtitle: de(n.material.name),
        body: "reveal.confirmBody",
        details: yn(n.context.display),
        label: "common.continue"
      },
      buildPrompt: async (s, a) => {
        const c = await $o(a, s);
        return Yr({ context: n.context, rootMetadata: c, expectedPurpose: "reveal" }), Zi({
          context: n.context,
          expectedPurpose: "reveal",
          secret: { name: n.material.name, kind: "static" }
        }), Jr([n.context]), {
          title: "reveal.showConfirmTitle",
          subtitle: de(n.material.name),
          body: "reveal.confirmBody",
          details: yn(n.context.display),
          challenge: await Ma(ui(n.context)),
          label: "common.continue"
        };
      },
      operation: async (s, a, c) => {
        const u = await Jc(r, s, Bo(n.material.name, o));
        try {
          c.assertCurrent(), await li([n.context]), await dg({
            name: n.material.name,
            plaintext: u,
            abortSignal: c.signal,
            prepareCopy: Ee().strictApprovals ? async (l) => {
              await Wl({
                wrapMeta: a,
                challenge: await Ma(`reveal-copy:${n.context.requestId}:${n.material.name}`),
                abortSignals: [l, c.signal]
              }), Ft(l), Ft(c.signal);
            } : void 0
          });
        } finally {
          u.fill(0);
        }
        return { completed: !0 };
      }
    });
  } catch (r) {
    throw De(r, "reveal_failed");
  }
}
async function iv(e, t) {
  try {
    const n = dm(e), { request: r, verified: i, unpacked: { vmkWrapMeta: o } } = n;
    return await Yl({
      tier: "R3",
      wrapMeta: o,
      parentSurface: t.latestSurface,
      authorizationWindow: t.takeAuthorizationWindow,
      lockedPrompt: {
        title: "sign.title",
        subtitle: de(r.material.name),
        body: de(i.display),
        details: yn(r.context.display),
        label: "sign.confirm"
      },
      buildPrompt: async (s, a) => (await Cl(n, s, a), {
        title: "sign.title",
        subtitle: de(r.material.name),
        body: de(i.display),
        details: yn(r.context.display),
        challenge: new Uint8Array(n.challenge),
        label: "sign.confirm"
      }),
      operation: (s, a) => fm(n, s, a),
      beforeSuccess: () => li([r.context])
    });
  } catch (n) {
    throw De(n, "sign_failed");
  }
}
async function ov(e, t) {
  const n = Pm(e);
  try {
    const i = dn(n.items[0].material.envelope).vmkWrapMeta;
    for (const h of n.items) {
      const f = dn(h.material.envelope);
      if (f.vmkWrapMeta !== i) throw new m("invalid_payload", "approveRelease items must share one VMK context");
      if (!Ul(f.recordMetadata)) throw new m("invalid_payload", "approveRelease only supports static protected records");
    }
    const o = Hl(n.items), s = pt(i).state, a = Ee(), c = zl({ tier: "R2", vaultState: s, policy: a });
    let u = !1;
    const l = async () => {
      await Xl({
        title: "release.title",
        subtitle: Gn("release.subtitle", { count: n.items.length }),
        details: yn(o.display, o.recipient),
        label: "release.confirm",
        wrapMeta: i,
        policy: a,
        parentSurface: t.latestSurface,
        authorizationWindow: t.takeAuthorizationWindow
      }), u = !0;
    }, d = async (h, f = !1) => {
      let w = !1, g;
      try {
        const p = await Mo(
          async (y, v, _) => {
            const I = await gm({
              items: n.items,
              vmk: y,
              wrapMeta: v,
              consumeReplayIds: !1,
              onApprovalAccepted: (S) => {
                g = S;
              },
              confirm: (S) => !c.confirm || f ? Promise.resolve() : ys({
                title: "release.title",
                subtitle: Gn("release.subtitle", { count: n.items.length }),
                details: yn(S.display, S.recipient),
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
            beforeSuccess: () => li(n.items.map((y) => y.context), g)
          }
        );
        return w = !0, p;
      } catch (p) {
        throw u && !w && pt().state === "unlocked" && Fe({ broadcast: !0, reason: "manual-lock" }), p;
      }
    };
    try {
      return c.passkey === "unlock" ? (await l(), await d("none", !0)) : await d(c.passkey === "uv" ? "uv" : "none");
    } catch (h) {
      if (c.passkey !== "unlock" && Zl(h, i))
        return await l(), await d("none", !0);
      throw h;
    }
  } catch (r) {
    throw De(r, "approve_release_failed");
  }
}
async function sv(e) {
  const t = $m(e);
  try {
    const n = await Dy(t.webauthn);
    return { challengeId: t.challengeId, assertion: n };
  } catch (n) {
    throw De(n, "delete_authz_failed");
  }
}
function av() {
  const e = ro();
  if (e.get("mode") !== "setup") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && yi({ locale: t, theme: n });
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
    h = Wm(d);
  } catch {
    u.disabled = !0, G(l, "setup.requestInvalid");
    return;
  }
  const f = typeof BroadcastChannel > "u" ? null : new BroadcastChannel(`${Ml}${r}`), w = (g) => {
    const p = De(g, "setup_create_failed"), y = {
      type: "setup-error",
      build: oe,
      id: r,
      code: p.code,
      message: p.message,
      retryable: p.retryable
    };
    Ym(r, p), f?.postMessage(y);
    try {
      window.opener?.postMessage(y, window.location.origin);
    } catch {
    }
    u.disabled = !1, G(l, de(p.message));
  };
  u.addEventListener("click", () => {
    u.disabled = !0, G(l, "setup.passkeyPrompt");
    let g;
    try {
      g = Ko({
        rpId: ht(),
        vaultUserHandle: h.vaultUserHandle,
        displayName: h.displayName,
        authzCreationOptions: h.authzCreationOptions
      });
    } catch (p) {
      w(p);
      return;
    }
    g.then((p) => {
      const y = { type: "setup-created", build: oe, id: r, result: p };
      Xm(r, p), f?.postMessage(y);
      try {
        window.opener?.postMessage(y, window.location.origin);
      } catch {
      }
      G(l, "setup.created"), setTimeout(() => window.close(), 250);
    }).catch(w);
  });
}
function cv() {
  const e = ro();
  if (e.get("mode") !== "authorize") return;
  const t = e.get("locale"), n = e.get("theme");
  (t === "en" || t === "zh") && (n === "light" || n === "dark") && yi({ locale: t, theme: n });
  const r = e.get("id"), o = document.getElementById("page")?.querySelector(".card"), s = o?.querySelector(".body");
  if (!r || !o || !s || (s.classList.add("waiting"), G(s, window.opener ? "authorize.waiting" : "authorize.waitingLong"), !window.opener)) return;
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
  const h = setTimeout(() => G(s, "authorize.waitingLong"), Em), f = () => {
    if (!l)
      for (const p of a())
        try {
          p.postMessage({ type: "authorization-ready", build: oe, id: r }, window.location.origin);
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
        await Wl({
          wrapMeta: p.wrapMeta,
          challenge: p.prompt.challenge,
          abortSignals: [y.signal]
        });
        return;
      }
      const I = await Fo(_o(p.wrapMeta), ht(), y.signal);
      v = {
        kind: "unlock",
        prfOutput: J(I.prfOutput),
        prfSalt: J(I.prfSalt)
      }, I.prfOutput.fill(0);
    };
    Go(
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
        u({ type: "authorization-approved", build: oe, id: r, result: v }), setTimeout(() => window.close(), 250);
      },
      (I) => {
        const S = De(I, I instanceof Error && I.message === "operation-cancelled" ? "authorization_cancelled" : "authorization_failed");
        u({
          type: "authorization-error",
          build: oe,
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
    if (!y || y.type !== "authorization-request" || y.id !== r || !nn(y.build)) return;
    const v = a().find((_) => _ === p.source);
    if (v) {
      c = v;
      try {
        w(Um(y.request));
      } catch (_) {
        const I = De(_, "authorization_request_invalid");
        u({
          type: "authorization-error",
          build: oe,
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
function uv() {
  if (window.self !== window.top || ro().has("mode")) return;
  const e = document.querySelector("#page .body");
  e && G(e, "sandbox.intro");
}
_e.register("handshake", (e) => {
  const t = e ?? {}, n = typeof t.expectedBuildHash == "string" ? t.expectedBuildHash : null;
  if (typeof t.parentOrigin != "string" || typeof t.nonce != "string" || t.nonce.length < 16)
    throw new m("invalid_handshake", "handshake must include parentOrigin and nonce");
  if (n !== null && n !== oe.buildHash)
    throw new m("build_hash_mismatch", "sandbox build hash does not match parent expectation");
  const r = km(t.appearance);
  r && yi(r);
  const i = Ha ? Ee() : zo(t.policy === void 0 ? void 0 : Co(t.policy));
  return Ha = !0, {
    accepted: !0,
    channel: zt,
    version: 2,
    sandboxOrigin: window.location.origin,
    build: oe,
    policy: i
  };
});
_e.register("set-appearance", (e) => (yi(Nl(e)), { accepted: !0 }));
_e.register("status", (e) => {
  const t = _m(e);
  try {
    t.wrapMeta && pt(t.wrapMeta);
    const n = pt(), r = Ee();
    return {
      ...n,
      policy: r,
      session: {
        ...n.expiresAt !== void 0 ? { expiresAt: n.expiresAt } : {},
        strict: r.strictApprovals
      }
    };
  } catch (n) {
    throw De(n, "invalid_wrap_meta");
  }
});
_e.register("setup", ev);
_e.register("unlock", tv);
_e.register("lock", () => ({ ...Fe({ broadcast: !0, reason: "manual-lock" }), policy: Ee() }));
_e.register("seal", nv);
_e.register("reveal", rv);
_e.register("sign", iv);
_e.register("approveRelease", ov);
_e.register("deleteAuthzAssertion", sv);
vy((e) => _e.emit("vault.state", e));
og((e) => _e.emit(e));
await sd();
_e.start();
window.addEventListener("pagehide", $y);
av();
cv();
uv();
window.self !== window.top && document.body.classList.add("embedded");
const ed = globalThis.crypto, lv = { webcrypto: ed }, td = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: lv,
  webcrypto: ed
}, Symbol.toStringTag, { value: "Module" }));
