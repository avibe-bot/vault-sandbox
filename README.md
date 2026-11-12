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

### Ed25519 / Solana exact-message signing

The generate-only `seal` request accepts `curve: "ed25519"` for sandbox-born
32-byte seeds. The response contains only the encrypted envelope, lowercase
32-byte public-key hex and `addresses.solana` (raw Base58 public key). Only these
new records add `record_meta.curve: "ed25519"` to authenticated metadata. Existing
secp256k1 records keep their original metadata and byte-identical AAD; omitted
curve still means secp256k1. There is no protected private-key import or creation
picker in the sandbox.

The discriminated wire contract:

```json
{
  "scheme": "ed25519",
  "signingContext": { "kind": "solana-transaction-v1", "messageHex": "72" }
}
```

`messageHex` is nonempty lowercase even hex of the exact serialized unsigned
Solana **message**, not a signed transaction, digest, prehash or UTF-8 string.
One shared transport/custody limit caps decoded exact messages at **1 MiB**;
wire fields are length-checked before canonical traversal/sandbox snapshot cloning/hex scanning,
and primitives before decoding/copying/crypto or protected-key decryption. Primitive
message inputs are hex strings or native Uint8Array only; other buffer/ArrayLike forms
are rejected rather than delegated to an unbounded generic converter. They
reject, never truncate or hash oversized input. This is not structural acceptance:
the Solana parser separately enforces the signed-packet size including signatures.
The byte `72` above is only a wire example, **not** a valid Solana structure, and
such a request is refused.
`v1` versions the Avibe contract, not the Solana message format. CLI/API producers
may use `message_hex` at their own request boundary, but the sandbox context and
signed release use camelCase `messageHex` only. The daemon's existing signed v2
operation must bind:

```text
purpose: "sign"
release: { name, scheme: "ed25519", messageHex, publicKey, signingContext }
```

The key is lowercase Ed25519 public-key hex and `signingContext` is the complete
context. No `digest`/`digestAlgorithm` alias, generic `avault-agent-operation`
Ed25519 path or secp256k1/standard fallback exists. The shared binding helper and
whole-operation UV challenge support this shape; exact-message crypto/custody
primitives self-check signatures and decrypted seed/public-key consistency.

**What is verified before any approval.** `prepareSignRequest` reads the record
identity from the envelope's authenticated metadata and requires an Ed25519
record, the `ed25519` scheme and a `solana-transaction-v1` context together; any
other combination is refused, in both directions. The bytes must be one canonical
legacy or v0 Solana message (`src/solana/message.ts`: upstream decode and
sanitize rules, full consumption, the 1232-byte packet with its signature slots)
in which **the protected record's own public key is a required signer**. v1 and
every later version are unsupported. The signed release must name the same bytes,
key, scheme and context. A refusal is `invalid_payload` with the parser's reason
in the message; nothing is shown and no key is touched.

**What is not policed.** Instruction content. Exact System `Transfer`, SPL
Token `Transfer` / `TransferChecked` and System `AdvanceNonceAccount` layouts are
decoded; everything else (Token-2022, compute budget, memo, swaps, any other
program, near misses of the decoded layouts, accounts loaded through address
tables) is valid, reviewed as raw bytes, and approvable with the single
blind-signing notice. There is no RPC, token list, address-table resolution or
execution claim.

`AdvanceNonceAccount` is decoded only in its exact layout: data is the u32 LE
discriminator 4 alone, and the three accounts are the nonce account, the
RecentBlockhashes sysvar (`SysvarRecentB1ockHashes11111111111111111111`) and the
nonce authority, all carried in the message. The review shows the nonce account
and the authority as encoded; it does not claim the nonce's stored value, its
current authority, that the instruction will succeed, or that the transaction
cannot expire. A nonce advance is never counted or labelled as a transfer, and
account privileges are not narrowed (the authority may also be the fee payer).

**At use.** After the asynchronous approval, `signPreparedRequest` re-derives
everything from the request and its envelope (record identity, structure,
binding) and verifies the daemon signature, expiry and replay state with the
vault key. The prepared object is a cache for the prompt: its payload must equal
the re-derived one, and its record identity, review and display are not inputs.
Ed25519 then signs the exact message bytes; the decrypted seed must match the
record key and the signature is self-verified. The record name is bound by the
envelope's associated data, so a renamed request fails when the key is opened.
Signing always takes the R3 route: a fresh passkey over the whole daemon-signed
operation when the vault is unlocked, or the unlocking passkey when it is locked.

The returned signature is public proof over the message and key. It is not a
server-verifiable proof that a particular passkey ceremony took place; the
sandbox's own key-use path is what enforces it.

### Signing review

Solana and EVM transaction approvals show a structured review
(`src/signingReview.ts`) built by `src/signingReviewFacts.ts` from verified facts
only: the parser's facts for Solana, the verified transaction for EVM. Labels are
sandbox translation keys; values are shown unchanged.

- Summary: the transaction kind, the requesting session's label when the signed
  request has one, the signer (the Base58 key for Solana; for EVM the `0x`
  address derived from the record key, with the public key in Details), then
  the decoded facts. A System transfer shows exact SOL beside raw lamports. SPL
  transfers show token accounts and raw base units, with the mint and decimals
  only when the instruction encodes them: no symbol, owner or converted token
  amount. EVM shows chain id, destination and value (ether only for chain id 1,
  raw wei otherwise), then the decoded call or the raw selector.
- One notice, `Some content is not decoded; approving it is blind signing.` /
  `部分内容未解析，批准即为盲签。`, when any part is undecoded. It sits directly
  under the headline and session line, before the signer and every summary row,
  so it is on the first screen however long the summary is.
- One collapsed Details section: the daemon-signed request rows, every account
  and instruction with its exact data, and the complete copyable bytes to sign.
  A summary is kept short by counting, never by dropping facts, and a request is
  never refused because its summary would be long.
- A message of exactly one instruction shows that instruction: the transfer's
  facts above, a nonce advance, or one `Undecoded instruction` row. Any other
  message follows one rule: the instruction count, then in message order a
  headed block for each of the first three decoded transfers (numbered among the
  transfers: destination, amount, and mint when the instruction encodes one), an
  unnumbered `Advance nonce` block (nonce account, authority as encoded) for
  each of the first three nonce advances, and an unnumbered `Undecoded
  instruction` row with the program address for each of the first three
  undecoded instructions, then `and N more, see Details` for each kind that has
  more. A plain SPL `Transfer` encodes no mint; its heading reads
  `Token transfer · mint not in instruction` and it has no mint row. Details
  number every instruction by its position and carry sources, authorities and
  every remaining fact.
- Bitcoin: `Bitcoin · transfer`, the high-fee warning first when the verifier
  flags it, the signing address (this key's Taproot output, encoded for the
  selected network), a one-line network badge marked as the requester's
  selection and not chain proof, then each output in order: a recipient's
  address and amount, or `Returning to this key` for the one output whose script
  equals the spent output; fee, fee rate and net leaving this key. Amounts are
  exact BTC beside sats. Details carry the scheme, internal and output keys,
  input outpoint and amount, every output, signed size, sequence and RBF,
  locktime, unsigned transaction ID, digest and the complete unsigned
  transaction. The values are the verifier's own: no change to parsing, bounds,
  fee rules, thresholds or the digest.
- EVM transactions keep their structured review (destination, value, decoded
  call or raw selector first; gas and nonce in Details). The chain ID shows a
  static name only for a few well-known ids (`1 · Ethereum`); an unknown id is
  shown as it is and marked unrecognized. A name describes the encoded id; it
  does not prove the network. Ether is named only for chain id 1.
- EIP-712 typed data (`src/eip712Review.ts`), after the unchanged verifier has
  hashed it to the signed digest: the signing address from the record key, the
  chain ID, domain name and verifying contract, the primary type, then each
  hashed message field by path and type (first eight; all in Details). Coverage
  follows viem's `hashTypedData` exactly: a domain value outside the effective
  `EIP712Domain` type (for example a string `chainId` with an inferred type),
  any message key the primary type does not declare, and the whole message when
  the primary type is `EIP712Domain` are marked as outside the typed-data hash.
  They remain part of the daemon-signed request. Details carry every hashed
  field, the public key, scheme, digest, and the complete types and typed data.
  The traversal takes viem's `encodeField` branches in its order (a declared
  type name is a struct, read by property even from an array; then `bytes` and
  `string`; then arrays, an empty one shown as `[]`; then atomic values). Fields
  nested deeper than 32 levels are counted as more in the raw data, never as
  outside the hash; a field path over 512 characters is shortened with a note.
  Chain names are looked up as own entries only.
- Token authorizations are recognized only by the exact hashed structure (type
  names, field names, order and types, and every referenced type), never by a
  name or a field key: ERC-2612 `Permit`, Permit2 `PermitSingle` / `PermitBatch`
  (uint160 amounts) and Permit2 `PermitTransferFrom` / `PermitBatchTransferFrom`.
  They get a red token-authorization warning; an amount equal to its field's
  maximum (as viem encodes it, `BigInt(value)`) adds an unlimited-allowance
  warning, or for the one-time transfer families a maximum-one-time-amount
  warning. Every batch entry is checked, also past the three listed. Amounts are
  raw token units; deadlines and Permit2 expirations are explained, not
  converted. Any other shape, including witness transfers and DAI-style permits,
  is generic typed data. The review never changes what is accepted: a shape it
  cannot describe keeps the prose review.
- Warnings the verified facts establish (the Bitcoin high fee, a token
  authorization) are alert lines first in the card, before the blind-signing
  notice and every row.
- The daemon-signed request rows come last in Details, after every verified
  fact. In a signing prompt the egress row reads `Returns` and an environment
  source reads `requested as`; release and reveal prompts are unchanged. The
  session line is one line and never pushes a warning off the first screen; its
  full text is in the request rows.

The review travels with the prompt through every surface (in-frame launcher card,
serialized request to the authorization window, locked and unlocked paths;
`src/authorizationPrompt.ts`). The window rebuilds it with `parseSigningReview`,
which accepts only this build's translation keys and plain values. Agent
operations keep their prose review.

### Existing secp256k1 signing

- `ecdsa-secp256k1-recoverable` and `ecdsa-secp256k1-der` keep their existing digest-signing behavior.
- `schnorr-secp256k1-bip340` remains **raw, untweaked BIP340**. Its approval describes the internal x-only key, not the tweaked `btc_taproot` receiving address.
- `schnorr-secp256k1-bip341-keypath` is supported only for the bounded `bitcoin-taproot-keypath-v1` context: the sandbox independently parses the one-input, one-or-two-output BIP86 key-path payment, checks the supplied prevout and Q binding, shows the complete review, and signs only after fresh R3 authorization. There is no raw-digest fallback, generic operation fallback, script tree, annex or full-transaction/PSBT path.
- Protected Bitcoin spending is limited to this typed workflow and compatible sandbox bundle. Existing `btc_legacy` and `btc_segwit` addresses remain unsupported as protected inputs; `btc_taproot` addresses should not be treated as safe new deposit destinations until the matching sandbox bundle is deployed and the user's funding/chain state is independently verified. Public BIP341/BIP86 address derivation keeps the same output Q and correctly handles zero tweak, overflow and infinity edge cases.

There is **no Merkle-root/script-tree option**. Unsupported options are rejected, not ignored. Mutable private-key and auxiliary-randomness buffers owned by the signer are cleared on success and failure. JavaScript BigInts, engine copies and library internals cannot be reliably zeroized; this is best-effort hygiene, not a claim of guaranteed memory erasure or constant-time JavaScript.

The RPC verifies EVM transactions, EIP-712 typed data, bounded Bitcoin Taproot key-path contexts and domain-separated `avault-agent-operation` canonical preimages. Bitcoin contexts require `schnorr-secp256k1-bip341-keypath`; EVM contexts require ECDSA. An agent operation must start with the exact prefix `avault-agent-operation:v1\n` (including a newline) followed by nonempty operation text. Its digest remains SHA256 of the entire UTF-8 preimage, prefix included. Unprefixed legacy contexts are rejected: arbitrary UTF-8 SHA256 preimages are not a safe substitute for typed transaction approval. Generic operation prompts show the bound scheme and public key, not a chain address. There is no raw-digest or Bitcoin-context fallback.

EVM transaction review shows every serialized legacy/EIP-1559 field (absent quantities as the zero they serialize to), the destination or contract creation, the selector (up to four leading bytes) and the complete calldata, never truncated. Built-in ERC-20/ERC-721 calls are summarized only when the calldata is byte-for-byte their canonical ABI encoding; that is a structural decode, not verification of the contract's behavior. Contract-creation init code is never ABI-interpreted. Any other well-formed calldata (unknown selector, short data, trailing bytes, noncanonical arguments, init code) is signable as raw bytes after one notice that approving it is blind signing. There is no ABI registry, RPC or network lookup. Malformed hex, unsupported envelope types or fields (access lists, authorizations, blobs, `gasPrice` on EIP-1559, EIP-1559 fee fields on an explicit legacy type, even when zero), chain mismatch and digest mismatch remain errors. `VerifiedSigningContext.evm` carries the same review as structured fields with stable call identifiers, plus the exact serialized unsigned transaction whose keccak256 is the digest.

Signing contexts accept only plain JSON, finite safe-integer numbers and well-formed Unicode; large EVM quantities must be strings. Floats, unsafe integers, lone UTF-16 surrogates and unexpected top-level keys are rejected before approval. Canonical signing uses compact JSON with JavaScript UTF-16 code-unit key ordering; the Avibe producer must match it.

For every protected **secp256k1** sign request, the daemon's existing v2 signed context must contain:

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

`design/bitcoin.html` renders the structured Bitcoin review through the real
verifier, review adapter and confirmation component with public codec/policy
fixtures (`?locale=zh&theme=dark`, `?high-fee`, `?open`).
Serve with the repository Vite dev server; it never imports the main runtime,
creates a key, calls WebAuthn or signs. The parent card design lives in Avibe's
`ui/design/frames/vault/signing.design.tsx`. Both are previews, not an approval
of an actual request. A retained acceptance report is in `docs/bitcoin-acceptance.md`.

`design/signing.html` renders the structured signing review (`src/signingReview.ts`)
in the same real confirmation component: a compact summary of verified facts, at
most one blind-signing notice, and one collapsed Details section holding the
complete copyable content. Its cases
(`?case=sol-transfer|token-transfer-checked|solana-unknown|evm-unknown`, with
`&locale=zh`, `&theme=light`, `&open`) use synthetic public values from
`design/signingFixtures.ts`, not the acceptance corpus. The notice is a single
alert-coloured line with a warning icon. The review is a display contract: labels are sandbox translation keys and values
are shown unchanged. A native amount (SOL, or ETH when the verified chain id is
1) is shown as the exact decimal figure beside the unchanged base-unit integer;
every other amount stays a raw integer.

`design/sign-flow.html` is a test parent for the real runtime: it embeds
`index.html`, performs the handshake and sends one `sign` request built from the
public acceptance corpus (`?case=<solana corpus id>` or `?case=evm:<evm corpus
id>`, with `&locale=zh`, `&theme=light`, `&session=<label>`), or from a
synthetic multi-instruction message (`?case=transfers:sol,spl-checked,spl,raw`). The frame verifies
the request and shows its launcher card; Continue opens the real authorization
window with the serialized review. Only the transport is a stand-in: keys are
published test keys, the vault stays locked and no passkey exists, so nothing is
unlocked, decrypted or signed.

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
