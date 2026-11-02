# Public Bitcoin test vectors

Upstream: `bitcoin/bips`, revision `5aadddb511a5dcfe4599531bd8ae5e5b96d0f793` (retrieved 2026-11-02).

- `bip340.csv`: `bip-0340/test-vectors.csv` with CRLF normalized to LF only. Upstream SHA256 `34c9d1d9c3a88d524bc80778540dc43f8306ec249a7485293063c376db851c2d`; local SHA256 `01c8cabba63b4c9b2f44c975902990086a4fe56eee9d265b187d1e2c1d98ccfb` (BIP340 BSD-2-Clause).
- `bip341.json`: verbatim `bip-0341/wallet-test-vectors.json`, SHA256 `403e19fb81dd1f31e745699216308f61fb403774b2aafa87b631b8f7c042d37f` (BIP341 BSD-3-Clause).
- `bip86.json`: the three address vectors in `bip-0086.mediawiki` (BSD-2-Clause), preserving published xprv, internal key, output key and address. `privateKey` is the final 32-byte key-data portion of the Base58Check-decoded published xprv (not a derived or independently invented expected key).

All secret scalars here are **published, unsafe test keys**, never wallet funds or user credentials. Tests are offline. BIP341 fixtures test empty-tree public-address derivation; private keypath signing is deliberately unsupported in this protected runtime. BIP340's variable-length message vectors exercise the verifier, not this API's fixed 32-byte digest contract.

- `protected-sign-context.json`: deterministic Python Avibe producer fixture, generated with the public synthetic Ed25519 seed `11` repeated 32 times and the public secp256k1 scalar 1. Includes exact canonical message bytes and signature. Consumer tests pin time, verify the producer's signature, and sign through an authenticated synthetic protected envelope.
- `canonical-json-utf16.json`: output of the Avibe producer's actual `_vault_sandbox_canonical_json` and two pure helper functions (extracted via Python AST to avoid importing runtime services), including astral/BMP key ordering and safe integer boundaries. Includes exact canonical bytes and SHA256.
- `bip143-agent-op-hit.json`: synthetic, offline adjacent-boundary regression. Its unprefixed UTF-8 preimage hashes to a BIP143 sighash and passed the old generic operation validator. The new mandatory domain prefix rejects it. No real wallet, funds, or live service was used.
