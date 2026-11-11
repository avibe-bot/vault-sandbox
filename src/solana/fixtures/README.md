# Solana message vectors (upstream Rust)

`upstream-rust-vectors.json` is the output of `generator/`, a small Rust program
built on the upstream crates. It never runs the parser under test. Bytes come
from the upstream serializers, structure from the upstream decoder, and the
meaning of each transfer from the arguments given to the upstream builders.

Public and offline: no private key, funded account, RPC, simulation or chain
state. Signer addresses are the RFC 8032 section 7.1 TEST 1-3 public keys; every
other address and the blockhash are byte patterns. These vectors show how bytes
decode. They do not show that a transaction would execute.

## Sources

| Part | Source |
| --- | --- |
| `compactU16` | `test_short_vec_encode_len` and `test_deserialize` in `short-vec/src/lib.rs`, `anza-xyz/solana-sdk` `617887a6f8a306a6ca94b5907eaa3772db43a54b`. The generator re-checks each case with `solana-short-vec`. |
| `upstream-test-sdk-serialize` | Transaction bytes asserted by `test_sdk_serialize` in `transaction/src/lib.rs`, same commit, copied by script into `generator/src/sdk_serialize.in`. The vector is its message (the bytes after the one signature). |
| Other accepted vectors | Built with `solana-message` 6.0.0, `solana-system-interface` 3.3.0 and `spl-token-interface` 3.0.0, then serialized by both upstream serializers (bincode 1.3.3 and wincode 0.6.3), which must agree. |
| `rejected` | Byte edits of those bytes, or unsanitary messages serialized by upstream as they are. |

Exact dependency versions are pinned by `generator/Cargo.lock`
(SHA-256 `34970d4619e3d6c5a66effa741261188e0e166179b669f066c9b518d109a5a21`).
Generated with rustc 1.92.0; fixture SHA-256
`8b666bc9a408f87aa12e363b8b3d88d599caaa146d649c2b694f0d39832dce30`.

## Reading a vector

- `accepted[].facts` is the complete expected result of `parseSolanaMessage`.
  Header, keys, privileges, blockhash, instructions, lookups and the signed
  transaction length are read back from the upstream decoder. A lookup account
  reference is traced by address: upstream resolves the account index against
  known table contents, and the table slot holding that address is the
  expectation. `decoded` and `undecodedReason` state what was built.
- `upstream` records what the validator-side decoder (`Packet::deserialize_slice`
  options) and `sanitize()` say about the bytes. For `rejected` vectors, `code` is
  this parser's rejection. Upstream accepts three of them: the parser adds only
  the 1232-byte packet bound and required-signer membership.
- Static `writable` is upstream's `is_maybe_writable`. It equals the header
  privilege here because no vector invokes a writable key as a program.

## Regenerating

```sh
cd src/solana/fixtures/generator
CARGO_TARGET_DIR=/tmp/solana-vectors-target cargo run --locked > ../upstream-rust-vectors.json
```

Keep the build directory outside `src/`: untracked files there block a release
snapshot. `cargo run --locked -- verdict` reads `<message hex> <public key hex>`
lines and prints the upstream verdict and structure for each; it supports local
differential runs against the parser and is not part of CI.
