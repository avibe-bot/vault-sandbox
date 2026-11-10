# Independent public Solana / EVM acceptance corpus

**Published unsafe keys. Never fund them. Offline test data only.** No live Vault
state, credential store, browser profile, RPC, external metadata service, chain
history, simulation, quote, or broadcasting is used. We do not assert these
public addresses have never received funds. The Solana blockhash and all token
accounts/mints/table addresses are invented; token accounts are not asserted to
be associated token accounts. Chain labels do not make signed bytes test-only.

## What is independently produced

`corpus.json` is the single source of serialized bytes for this acceptance lane.
It does not import or execute the sandbox parser. `generate.mjs` uses:

- Official `@solana/web3.js` **1.98.4**, git revision
  `c26c13bf841821d9bbf83bb476c567fe29d13821`, for real legacy/v0 message and
  transaction serialization, including compiled account indexes and ALTs.
- Official `@solana/spl-token` **0.4.14** instruction constructors for SPL
  Transfer and TransferChecked bytes. System instructions come from
  web3.js. Both package tarball integrity values are recorded in the corpus.
- Native Node `node:crypto` **OpenSSL Ed25519**, not the SDK signer, for every
  expected Solana signature over the **exact serialized message**, never its
  SHA256. Seeds/public keys are RFC8032 section 7.1 TEST 1 and TEST 2 constants.
  `verify.test.ts` verifies signatures and deterministically reproduces them with
  a second implementation, repository `@noble/curves` **2.2.0**; it also checks
  the published RFC empty-message signature and rejects hash/message/key changes.
- **ethers 6.15.0**, git revision
  `9944ec94b154b4f8fdfeefb81a1e47b28fd907bc`, for independent EVM serialization,
  ABI construction and signatures. The production parser instead uses viem.
  The corpus tests cross-check exact envelope bytes/digests using viem and verify
  ECDSA with the repository's noble implementation. The EIP155 example adds a
  primary-source byte/hash anchor independent of either library. Its optional
  signature uses public scalar 1, **not** the EIP's scalar `46` repeated 32 times.

The keys are from <https://www.rfc-editor.org/rfc/rfc8032#section-7.1>; the public
EVM signing bytes/hash are from <https://eips.ethereum.org/EIPS/eip-155>.
Generator code is original; no upstream SDK source is vendored. Its exact SHA256,
the entire generator dependency-lock SHA256, package versions and npm integrity
values are carried by the corpus. `package.json` / `package-lock.json` in this
folder isolate generation-only dependencies: **no production dependency changes**.

Decoded expectations are explicit construction inputs, not parser output and
not a production-parser serialize/parse roundtrip. A small independent wire
indexer locates fields only to generate byte mutations; it neither assigns
semantic expectations nor claims to validate/reject those mutations.

## Source distinctions and corpus schema

`schemaVersion: 1`, `publicFixturesOnly: true`:

- `keys`: published RFC seed, exact public-key hex, and SDK Base58 encoding.
- `solana[]`: `id`, `version`, honest provenance, and requested signer;
  `message.{hex,base64,byteLength,sha256}`;
  `transaction.{unsignedHex,unsignedBase64,signedHex,signedBase64,messageOffset}`;
  independently signed `signatures[]`; construction-derived `expected` values;
  valid-message `offsets` solely for byte mutations.
- `expected.instructions[].decoded.kind`: `system-transfer`, `spl-transfer`,
  `spl-transfer-checked`, or `raw`. SPL Transfer encodes **no mint or decimals**;
  these are null, not looked up. TransferChecked contains the encoded mint and
  decimals, not verified mint metadata. Amounts are exact integer strings.
- `expected.addressTableLookups`: original table key plus writable/readonly
  indexes only. `accountAddressesFromConstruction` records **generator knowledge**
  for provenance, not verifier inputs or authority to resolve ALTs. A consumer
  must not use those addresses to display resolved loaded accounts.
- `negative[]`: target (`message` or `transaction`), original vector id, explicit
  byte splice, complete resulting hex/Base64, and structural rejection reason.
  Message-level negatives do not assert an outer-transaction API exists. Outer
  mutations are reserved for an API that accepts full transaction wire bytes.
- `signerChecks[]`: unchanged positive message plus a published key that is
  absent or present only as a non-signer; isolate membership failure from a
  message-format error.
- `evmNegative[]`: explicit legacy envelopes with a forbidden EIP1559 field set
  to zero. Their digest remains the independently correct legacy-envelope hash,
  so future rejection tests cannot pass merely for a digest mismatch.
- `evm[]`: independent unsigned serialization and digest, JSON `context`, exact
  calldata/selector, expected semantic/raw category and a public ECDSA signature.
  `expected.decoded` is a fixture-level semantic expectation, not the production
  `EvmTransactionReview` API shape.
- `blindSigningNotice`: exact agreed English/Chinese summary sentence, to be
  shown once when any content remains undecoded. All original bytes must remain
  complete and copyable; fixture tests do not prove a UI exposes them.

The repeated-static-key positive deliberately separates wire structure from a
bank's account-lock `AccountLoadedTwice` rejection: repetition alone is not a
wire rejection. Required-signature identity must still be unambiguous at its
owning custody boundary. Known-program near misses keep a canonical message but
malformed/unhandled instruction bodies; those instructions remain raw, not a
reason to reject the entire message. Exact 1232/1233 signed-packet boundary
vectors distinguish packet size from semantic policy.

The `v0-unresolved-alt-synthetic-jupiter-shaped` vector uses the published
Jupiter program ID and an Anchor `global:route` discriminator followed by
**invented bytes**. It is not a real Jupiter instruction/transaction, quote,
route, or onchain event. The EVM Uniswap-shaped vectors likewise use ordinary
ABI construction with invented addresses/arguments. They are raw-only examples,
not a swap decoder or evidence of valid protocol execution.

## Reproduce without network execution

From the repository root, using the locked existing root test dependencies:

```sh
npm ci --ignore-scripts
npm test -- src/fixtures/solana-acceptance/verify.test.ts
npm run build
```

Generator dependencies are optional for consumers. To regenerate or check the
source corpus (npm installation retrieves packages; fixture generation itself
makes no network requests):

```sh
cd src/fixtures/solana-acceptance
npm ci --ignore-scripts --no-audit --no-fund
npm run check
# Only when intentionally changing construction inputs:
npm run generate
```

The optional native bigint addon is not required; the SDK's pure-JS fallback
produces the same deterministic bytes. Generator check compares the entire
file, including provenance hashes. Ordinary CI tests need no SDK installation.

## Acceptance contract and evidence limits

This PR owns **source corpus + independent integrity/provenance tests only**.
The observable behavior protected here is that consumers receive immutable
external-SDK bytes with independently verifiable signatures and construction
expectations. Credible regressions include stale/manual byte edits, unsafe
integer truncation, losing ALT data, conflating mint metadata with encoded
fields, or signing a digest instead of the Solana message. Existing Bitcoin
vectors cover none of those Solana/EVM source-corpus risks.

| Boundary | Evidence in this folder now | Separate consumer/integration gate |
| --- | --- | --- |
| Official legacy/v0 / SPL serialized bytes | Locked independent SDK generation | Real strict production parser must consume all positives/reject applicable negatives |
| Exact Ed25519 message and signer | Native OpenSSL output + noble verification and deterministic equality | Real encrypted-record selection, curve, membership and RPC signing |
| EVM envelopes / canonical and malformed ABI | ethers bytes + independent viem serialization/hash + EIP155 anchor | Actual context verifier raw fallback, no false decoded prefix |
| ALT raw preservation / unknown calls | Complete original message and table/index bytes in corpus | Production review must avoid lookup/service/semantic inference |
| Daemon signature / whole operation binding | **Not asserted by this corpus** | Avibe-owned canonical `protected-solana-sign-context.json`; verify independently rather than duplicate it |
| Fresh approval / replay / expiry | **Not asserted by this corpus** | Actual request → trusted verifier → approval/UV-stub boundary → signature → daemon verification |
| Passkey UI, RP/origin and hardware ceremony | **Not automated here** | Owner-controlled isolated browser/manual ceremony; a stub is not physical passkey proof |
| Local Incus end-to-end | **Not run by corpus tests** | Existing repository runner, isolated worktree target, proved test-owned HOME/state, hold and cleanup |
| Solana/EVM node acceptance, funds, broadcast | **Not attempted or claimed** | Outside authorized scope |

Consumer tests must depend only on contracts already merged to the default
branch: no stacked PRs or imports from unmerged lanes. Sandbox `main` merges
trigger Production deployment, so neither this fixture PR nor later consumer
PRs authorize merge, publishing a trust pin, deployment, restart or real keys.
