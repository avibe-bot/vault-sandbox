# Protected Bitcoin acceptance

The retained public receipt is `acceptance/bitcoin-core.json` (SHA256
`7581ebc684ad3ce531d48e352d7a91153e93d405143b95f4cfb8c673fde74ed9`).
It records actual source hashes, public transactions and native Core results,
not an assertion inferred from fixture verification.

## Reproduce

With dependencies installed in this checkout, Bitcoin Core **31.1**, and its
unchanged functional test framework at commit
`9be056a8a72b624dae9623b2f7bded92c2a21c91`:

```sh
npm test
npm run build
python -B scripts/core-acceptance.py \
  --bin-dir /path/to/bitcoin-core/bin \
  --framework /path/to/bitcoin-core/test/functional \
  --output /new/disposable/receipt-directory
```

The runner requires a new output directory, hashes the upstream primitives and
local source/binaries, replaces HOME/XDG/config/datadir, disables network peers,
listening and discovery, and starts no wallet. It mines disposable regtest
coinbases to public keys only. It invokes `src/signRpc.test.ts` with test-only
input/output paths; that test dispatches through the actual `main.ts` RPC,
synthetic encrypted records and actual signing code. Only user-click and
same-origin authorization-window UV responses are simulated. Shutdown is scoped
to the process the runner started; the temporary node/config/cookie is removed.

## Observed results

For public signing scalars **1, 2, 6 and 11** (all P/Q parity combinations):

| Candidate | Signing boundary | Core result |
| --- | --- | --- |
| Exact synthetic transaction | Actual `main.ts` RPC after simulated fresh UV | Accepted, 4/4 |
| Plausible false supplied amount, independently recomputed digest | Actual `main.ts` RPC after simulated fresh UV | Signature invalid, 4/4 |
| False supplied script, independently recomputed digest | Real primitive only; typed RPC separately rejects Q mismatch before UV | Signature invalid, 4/4 |
| Raw-P signature instead of BIP86 Q signature | Real raw-BIP340 primitive | Signature invalid, 4/4 |
| Output changed after signing | Original actual-RPC signature | Signature invalid, 4/4 |

The positive signature is exactly 64 bytes and the witness has one stack item,
without an appended sighash byte. `testmempoolaccept` does not submit anything;
the final mempool remained empty and the owned node exited cleanly.

This proves neither chain membership for a requester-supplied context nor actual
hardware-passkey behavior. It does not authorize funding, broadcasting, changing
origins/pins/integrity policy, deploying, promoting or using an existing Vault key.
The network label cannot make a transaction cryptographically test-only.

## Other boundaries

- Core/codec/policy fixtures pin parser, hashing, address, same-key refusal and
  exact policy thresholds independently; provenance is in `src/fixtures/README.md`.
- Actual RPC tests separately protect immutable release binding, matching secret
  and record public keys, fresh UV, cancellation, expiry and replay rejection.
- Avibe's parent hook/client test optionally bundles the actual sandbox strict
  parser and signing-context verifier. That is a transport/parser gate, not a
  substitute for daemon-signature or encrypted-key tests.
- `design/bitcoin.html` uses the real shell, styles, parser and confirmation view
  with public fixtures. English/Chinese, light/dark and high-fee views were
  captured in an isolated browser; no horizontal overflow or page error occurred.
  This frame imports no `main.ts`, has no custody or WebAuthn call, and is not a
  functioning signing surface. The Avibe parent frame renders its own shared
  production `VaultSigningIdentity` view without loading a hosted sandbox.

Real Signet and physical passkey testing remain a later owner-controlled gate
once compatible producer and consumer builds are available at the correct origin.
