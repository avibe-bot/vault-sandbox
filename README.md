# Avibe Vault Sandbox

The cross-origin crypto sandbox for [Avibe](https://avibe.bot) Vaults, served at
`https://sandbox.avibe.bot`.

## Why this exists

Protected Vault secrets are end-to-end encrypted **in the browser**. This sandbox isolates all
protected-vault crypto — passkey (WebAuthn-PRF) ceremonies, the Vault Master Key (VMK), signing,
and DEK release — into a **separate origin** that the main Avibe web app cannot script into. An XSS
in the main app cannot read the VMK, because the VMK lives only in this iframe's JavaScript realm.

The main app talks to this sandbox **only** through a narrow, typed `postMessage` RPC. The VMK, PRF
output, private keys, and plaintext **never** cross that boundary — only operation results (sealed
envelopes, signatures, blind boxes, status, WebAuthn assertions) do.

Full design lives in the Avibe repo: `docs/plans/vault-sandbox-protocol-v2.md`.

## Public & auditable by design

This repository is public on purpose. It is part of the integrity model: builds
publish source-derived immutable releases and exact hash manifests. New Avibe
parents verify the locally packaged pin before protected execution; old installed
parents remain on an explicitly frozen compatibility root. See
[`docs/integrity.md`](docs/integrity.md) for the source/build/retention contract,
accepted HTML-navigation equivocation residual and separately authorized rollout.
This source change is not a claim that a release has been deployed. **Avibe's
servers serve code here, never secrets.**

## Architecture at a glance

- **Setup (passkey registration / `create`)** runs in a **top-level** context on this origin
  (popup or full-page redirect) — Safari blocks WebAuthn `create()` in a cross-origin iframe.
- **Daily operations** (unlock, seal, approveRelease, reveal, sign, delete-authz) run **inside the
  cross-origin iframe**.
- **Sensitive approvals** render in a top-level authorization window on this origin. The parent app
  opens that window from its own approval click and names it in the request; without one, the
  iframe shows a launcher card that opens it. Protocol v2 uses risk tiers: R1 operations are silent
  while unlocked, R2 operations require an in-sandbox confirmation while unlocked, and R3 signing
  always requires a fresh passkey. If the vault is locked, the confirmation click in that window
  invokes the PRF `get()` prompt, then the sandbox verifies the daemon-signed context before
  releasing or using any protected material.
- **RP ID is this origin** (`sandbox.avibe.bot`), stable regardless of how the main app is reached
  (localhost / tunnel / raw IP), and isolated from the main-app origin.

## Protocol v2

The sandbox serves only the v2 postMessage protocol on `avibe.vault.crypto`:

- request envelopes use `version: 2`; v1 operations are not accepted;
- `ready` advertises the v2 operation list, and `handshake` returns the enforced vault session
  policy (`windowSeconds`, `strictApprovals`, `parentValueSealAllowed`);
- sandbox-to-parent events use `kind: "event"` for `vault.state`, `ui.show`, and `ui.hide`;
- R2/R3 request envelopes carry a request-scoped parent-frame `surface` attestation, and parents
  may refresh it after `ui.show` with a pinned-source `kind: "event"`,
  `event: "confirm.surface"`, `id: <request id>` message;
  the attestation includes a parent measurement timestamp (`sampledAt` / `measuredAt`) plus
  (`frame.width`, `frame.height`, `frame.intersectionRatio`, `frame.visibleByIntersectionObserver`,
  `frame.opacity`, `frame.pointerEvents`); embedded confirmations fail closed if that attestation is
  missing, stale, clipped, or visually hidden;
- R2/R3 request envelopes may carry `authorizationWindow`, the id of the authorization window the
  parent reserved for that request (`/v/<source-id>/index.html#mode=authorize&id=<id>`);
  the parent navigates its inert preopen only after integrity verification. The
  sandbox skips its launcher card and pairs only with a matching-build window;
- `seal` accepts parent-provided static values only, while protected keypairs are generated
  silently inside the sandbox and return ciphertext plus public addresses;
- `approveRelease` replaces `releaseDEK` with a batch-first signed-context flow that produces one
  blind box per approved item;
- `reveal` replaces `unseal`; plaintext is displayed only in the sandbox, and copying is an explicit
  second action with a clipboard warning.

## Signing schemes and approval binding

- `ecdsa-secp256k1-recoverable` and `ecdsa-secp256k1-der` keep their existing digest-signing behavior.
- `schnorr-secp256k1-bip340` remains **raw, untweaked BIP340**. Its approval describes the internal x-only key, not the tweaked `btc_taproot` receiving address.
- `schnorr-secp256k1-bip341-keypath` is supported only for the bounded `bitcoin-taproot-keypath-v1` context: the sandbox independently parses the one-input, one-or-two-output BIP86 key-path payment, checks the supplied prevout and Q binding, shows the complete review, and signs only after fresh R3 authorization. There is no raw-digest fallback, generic operation fallback, script tree, annex or full-transaction/PSBT path.
- Protected Bitcoin spending is limited to this typed workflow and compatible sandbox bundle. Existing `btc_legacy` and `btc_segwit` addresses remain unsupported as protected inputs; `btc_taproot` addresses should not be treated as safe new deposit destinations until the matching sandbox bundle is deployed and the user's funding/chain state is independently verified. Public BIP341/BIP86 address derivation keeps the same output Q and correctly handles zero tweak, overflow and infinity edge cases.

There is **no Merkle-root/script-tree option**. Unsupported options are rejected, not ignored. Mutable private-key and auxiliary-randomness buffers owned by the signer are cleared on success and failure. JavaScript BigInts, engine copies and library internals cannot be reliably zeroized; this is best-effort hygiene, not a claim of guaranteed memory erasure or constant-time JavaScript.

The RPC verifies EVM transactions, EIP-712 typed data, bounded Bitcoin Taproot key-path contexts and domain-separated `avault-agent-operation` canonical preimages. Bitcoin contexts require `schnorr-secp256k1-bip341-keypath`; EVM contexts require ECDSA. An agent operation must start with the exact prefix `avault-agent-operation:v1\n` (including a newline) followed by nonempty operation text. Its digest remains SHA256 of the entire UTF-8 preimage, prefix included. Unprefixed legacy contexts are rejected: arbitrary UTF-8 SHA256 preimages are not a safe substitute for typed transaction approval. Generic operation prompts show the bound scheme and public key, not a chain address. There is no raw-digest or Bitcoin-context fallback.

Signing contexts accept only plain JSON, finite safe-integer numbers and well-formed Unicode; large EVM quantities must be strings. Floats, unsafe integers, lone UTF-16 surrogates and unexpected top-level keys are rejected before approval. Canonical signing uses compact JSON with JavaScript UTF-16 code-unit key ordering; the Avibe producer must match it.

For every protected sign request, the daemon's existing v2 signed context must contain:

```text
purpose: "sign"
release: { name, scheme, digest, publicKey, signingContext }
```

Here `digest` is lowercase 64-digit hex; `publicKey` is the record's compressed secp256k1 public key; `signingContext` is the complete persisted verifiable context. The sandbox compares all five fields to the immutable request snapshot and protected record metadata, verifies the pinned daemon signature, and revalidates at use time after fresh R3 passkey approval. Its UV challenge hashes the whole signed operation message. Decryption still authenticates record metadata and verifies that the decrypted private key matches the record's public key. Expiry and replay checks remain mandatory; no signature is returned if the final replay claim fails.

Missing/legacy semantic bindings fail with `invalid_sign_binding`; recreate those pending requests. **Rollout order:** update the Avibe producer to emit these fields before enabling this hardened sandbox bundle. The transport and encrypted record formats are unchanged, but an old producer cannot satisfy the new consumer. An old sandbox remains vulnerable to parent-side scheme/context substitution until its actual pinned bundle is updated. This source change does not deploy a bundle, update a pin, or disable integrity verification.

Offline tests cover published BIP340 signatures, BIP341/86 public-address vectors, public Core BIP341 digest/signature vectors, independent Bitcoin address/policy vectors across supported networks, parser mutation negatives, both input and output parities, zero/invalid public tweaks, real supported signatures through encrypted key envelopes, a Python producer binding fixture, the concrete unprefixed-preimage regression, and the actual `main.ts` RPC with a simulated authorization-window ceremony. The latter tests fresh-UV policy and fail-closed binding/cancellation/replay behavior, not physical passkey hardware or chain membership. Vector provenance is in `src/fixtures/README.md`.

### Isolated Core acceptance and design review

`python scripts/core-acceptance.py --bin-dir /path/to/core/bin --framework /path/to/core/test/functional --output /new/receipt/directory`
runs the actual `main.ts` RPC against disposable, locally mined regtest coins.
Only public scalars 1/2/6/11 are used. It disables peers/listening/discovery,
redirects HOME/XDG/config/datadir, starts no wallet, and shuts down only the
process it started. Four RPC signatures must pass Core `testmempoolaccept`;
false-amount RPC signatures, false-script primitive signatures, raw-P primitive
signatures and post-sign output tampering must fail. The typed RPC itself rejects
a wrong script before UV. No transaction is broadcast or added to the mempool.
The receipt records public transactions, Core results and source/binary hashes.
This optional test needs existing Core binaries/framework and is not part of the
ordinary CI suite; Node type declarations are a test-only dev dependency.

`design/bitcoin.html` renders the real confirmation component, shell and tokens
with public codec/policy fixtures (`?locale=zh&theme=dark` or `?high-fee=1`).
Serve with the repository Vite dev server; it never imports the main runtime,
creates a key, calls WebAuthn or signs. The parent card design lives in Avibe's
`ui/design/frames/vault/signing.design.tsx`. Both are previews, not an approval
of an actual request. A retained acceptance report is in `docs/bitcoin-acceptance.md`.

## Security posture

- Strict CSP: `default-src 'none'`, `script-src 'self'`, `connect-src 'none'` (no network),
  `worker-src 'none'` (no service workers), `frame-ancestors` limited to Avibe origins.
- No cookies, no sessions, no dynamic data, no APIs — pure static code distribution.
- Immutable, versioned asset paths; reproducible build; published hash manifest.
- One piece of host metadata outside the releases: an Apple app association that lets the Avibe
  iOS app use this origin's passkeys in its web view (`docs/integrity.md`, "Host app association").

## Develop

```bash
npm ci --ignore-scripts
npm run dev       # local dev server only; dev is never a versioned release identity
npm test          # crypto/RPC and immutable release negative tests
npm run build     # reproduce retained current release twice, then assemble all → dist/
```

When build inputs change, stage the source files and run `npm run release:stage`
first. Production runs `npm run release:assemble` to copy only reviewed static
snapshots; it does not recompile. The full release/legacy/pin workflow and merge
boundary are in `docs/integrity.md`.

## Status

The complete v2 sandbox RPC surface is implemented: VMK lifecycle, parent-value static seal,
sandbox-born keypair seal, reveal, verified signing, daemon-signed batch DEK release, delete
authorization assertions, policy/events, and build hash manifest generation.
