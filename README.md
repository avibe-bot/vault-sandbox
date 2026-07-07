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

Full design lives in the Avibe repo: `docs/plans/vault-crypto-sandbox.md`.

## Public & auditable by design

This repository is public on purpose. It is part of the integrity model: the Avibe local install
pins the expected hash of the built bundle and verifies the served bytes before it will trust this
sandbox. Builds are reproducible and the per-version hash manifest is published. **Avibe's servers
serve code here, never secrets.**

## Architecture at a glance

- **Setup (passkey registration / `create`)** runs in a **top-level** context on this origin
  (popup or full-page redirect) — Safari blocks WebAuthn `create()` in a cross-origin iframe.
- **Daily operations** (unlock, sign, releaseDEK, delete-authz — all WebAuthn `get()` + PRF) run
  **inside the cross-origin iframe**.
- **RP ID is this origin** (`sandbox.avibe.bot`), stable regardless of how the main app is reached
  (localhost / tunnel / raw IP), and isolated from the main-app origin.

## Security posture

- Strict CSP: `default-src 'none'`, `script-src 'self'`, `connect-src 'none'` (no network),
  `worker-src 'none'` (no service workers), `frame-ancestors` limited to Avibe origins.
- No cookies, no sessions, no dynamic data, no APIs — pure static code distribution.
- Immutable, versioned asset paths; reproducible build; published hash manifest.

## Develop

```bash
npm install
npm run dev       # local dev server
npm run build     # → dist/  (static, deployed to sandbox.avibe.bot)
```

## Status

**Phase 1 — postMessage RPC skeleton** (handshake, origin allow-listing, request IDs, timeouts,
structured errors). No crypto yet; crypto operations land in later phases per the design doc.
