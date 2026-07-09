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

This repository is public on purpose. It is part of the integrity model: the Avibe local install
pins the expected hash of the built bundle and verifies the served bytes before it will trust this
sandbox. Builds are reproducible and the per-version hash manifest is published. **Avibe's servers
serve code here, never secrets.**

## Architecture at a glance

- **Setup (passkey registration / `create`)** runs in a **top-level** context on this origin
  (popup or full-page redirect) — Safari blocks WebAuthn `create()` in a cross-origin iframe.
- **Daily operations** (unlock, seal, approveRelease, reveal, sign, delete-authz) run **inside the
  cross-origin iframe**.
- **Sensitive approvals** render in the iframe modal. Protocol v2 uses risk tiers: R1 operations are
  silent while unlocked, R2 operations require an in-sandbox confirmation while unlocked, and R3
  signing always requires a fresh passkey. If the vault is locked, the PRF `get()` prompt re-derives
  the VMK before the sandbox verifies and renders daemon-signed operation context.
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
- `seal` accepts parent-provided static values only, while protected keypairs are generated
  silently inside the sandbox and return ciphertext plus public addresses;
- `approveRelease` replaces `releaseDEK` with a batch-first signed-context flow that produces one
  blind box per approved item;
- `reveal` replaces `unseal`; plaintext is displayed only in the sandbox, and copying is an explicit
  second action with a clipboard warning.

## Security posture

- Strict CSP: `default-src 'none'`, `script-src 'self'`, `connect-src 'none'` (no network),
  `worker-src 'none'` (no service workers), `frame-ancestors` limited to Avibe origins.
- No cookies, no sessions, no dynamic data, no APIs — pure static code distribution.
- Immutable, versioned asset paths; reproducible build; published hash manifest.

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # focused crypto tests
npm run build     # → dist/  (static, deployed to sandbox.avibe.bot)
```

## Status

The complete v2 sandbox RPC surface is implemented: VMK lifecycle, parent-value static seal,
sandbox-born keypair seal, reveal, verified signing, daemon-signed batch DEK release, delete
authorization assertions, policy/events, and build hash manifest generation.
