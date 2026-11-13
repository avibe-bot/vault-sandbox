# Sandbox release integrity

## Invariants and limits

The local Avibe package, not a live host, selects the trusted release. Production
releases use `/v/<source-input-sha256>/index.html` on **sandbox.avibe.bot**; the
WebAuthn RP ID, encrypted records, v2 RPC and signing semantics do not change.
The input digest is a reproducible build identity, not a signature or a claim
that a Git commit can include its own SHA. `source.json` lists the exact input
hashes; the commit containing that snapshot locates the corresponding source.

`release.mjs` builds one closed executable and one stylesheet. Rollup's emitted
graph must have no imports, dynamic chunks, workers or network/code loaders.
CSS cannot import other resources. The loader has native SHA-256 SRI and
anonymous CORS on both dependencies. Its manifest pins the HTML and **all** runtime
files. The parent separately pins the exact manifest bytes. The non-dev runtime
refuses ready/RPC **and** top-level ceremony initialization if its sole SRI
stylesheet did not load. The stylesheet lives in `head`, but WebKit can still run
an ES module before delayed SRI CSS is ready. Startup therefore awaits its load
with a ten-second deadline and load/error/unload cleanup; no ready/RPC or ceremony
starts during that wait. CSS failure alone does not stop JavaScript automatically.

The parent fetches and hashes before each new frame or parent-created popup,
rejecting redirects, HTTP/CORS/network/parse failures, missing Web Crypto, wrong
bytes and identity. A gesture opens only inert `about:blank` while verification
runs. Reset/cancel prevents stale navigation and cleans that attempt's resources.
There is no successful verification cache, opt-out or standard-tier fallback.
Ready and handshake both validate exact identity and acceptance before RPC use.

Sandbox-owned setup/authorization windows are opened by the **already verified**
frame at its compiled exact same-release document URL. They do **not** add another
parent preflight or fetch a circular self-manifest. All routing parameters use
fragments, never query-selected HTTP bytes. Every actual loader again applies
browser SRI; same-origin popup, setup storage and channel pairing also require
matching build hash and sandbox version. These identities are diagnostic/version
gates, not a substitute for hashes. Unload/reset closes in-flight owned windows.
`connect-src 'none'` remains unchanged.

**Accepted residual:** browsers do not enforce SRI on iframe/popup HTML navigation.
A fully malicious central host can return honest bytes to the verifier and a
modified document/headers to a later navigation, including omitting the CSP and
installing a Service Worker. Loader SRI and `worker-src 'none'` defend honest
serving and asset substitution, not this per-request document/header equivocation.
The graph check is a build regression guard, not a proof that arbitrary malicious
reviewed JavaScript is safe. Local install compromise and browser compromise are
also outside this boundary. Never claim iframe SRI eliminates central-host trust.

## Source-derived snapshots, not provider URL retention

`retained/v/<id>/` contains reviewed immutable artifacts. Every deployment copies
**all** retained versions, so publishing B keeps A byte-for-byte. A conflicting
snapshot write fails. CI compares every existing `retained/` file with its base
revision and refuses deletion/modification. It permits only one new version:
the current source-input identity, which CI reproduces twice. Unpublished work-in-
progress candidates must be removed before review; they are not releases.

The source-input list uses tracked/staged source paths and fixed build inputs,
including the lockfile and build scripts. Ignored editor/OS files are excluded;
new source files must be staged. No timestamp, absolute path or live host is an
input. Use Node **22.23.4**, npm **11.6.2**, and the committed lockfile. CI rebuilds
on Linux; the same bytes are checked locally on macOS. Vercel's build command
only assembles snapshots; it does not recompile or assign new pins.

The deliberate compatibility root is `retained/legacy/`, built twice from
`415435548e63ae08942c5b26b0844d5504824d6f` (sandbox #25), not downloaded from a
live endpoint. Its receipt and `npm run legacy:check` reproduce that source with
its own lockfile. It retains `dev`, query routing and the old split shim graph for
installed old parents. It does **not** acquire enforced integrity retroactively.
New parents cannot select this root: their packaged pin and daemon frame CSP
allow only their exact version path (plus first-party frames). Do not recompile
legacy from current sources or make a versioned release pretend to be `dev`.

## Commands and review

```sh
npm ci --ignore-scripts
# Finish implementation; stage newly added build/source files first.
git add src scripts package.json package-lock.json vite.config.ts tsconfig.json index.html
npm run release:stage              # two clean source builds; append only
npm run release:guard -- origin/main
npm run build                      # reproduce twice, compare, assemble all versions
npm test                           # crypto/RPC and release/retention negatives
npm run legacy:check               # independently reproduce frozen compatibility root
npm run release:pin -- /path/to/avibe/vibe/data/vault_sandbox_release.json
```

The generated pin is the single packaged authority for Avibe Python CSP and UI.
Copy that exact retained release to Avibe's `ui/e2e/vault-integrity/release/` and
`vercel.json` to the sibling `hosting.json`; the browser fixture verifies/loads
those actual artifacts, not a reimplementation. Review source, provenance,
manifest, artifact diff and the parent pin together. Never derive the pin from
`curl sandbox.avibe.bot` or a Preview URL. For historical releases, check out the
commit whose input list matches their provenance; do not expect today's source
to rebuild yesterday's release.

## Rollout is a separate authorized operation

1. Review sandbox and parent changes independently on their default branches;
   v2 transport is already merged, so no stacked/unmerged wire contract is needed.
2. **Merging stages Production; promotion publishes it.** A merge to `main`
   (reviewed PR, green `build-test`) builds a staged Production deployment; the
   production domain keeps serving the current deployment until promotion. A PR
   Preview is allowed for review; neither a Preview nor a merge authorizes
   promotion.
3. Before promotion, find the staged deployment built from the merged commit and
   verify its served bytes against the reviewed retained build: manifest plus
   every resource hash, at exact paths, with no redirect. Any mismatch stops the
   rollout.
4. Promotion is a separate owner-approved step. It uses a protected,
   project-scoped credential that the owner approves with his Passkey; the
   request names the deployment, commit and build hash, and asks for the
   shortest grant.
5. After promotion, check that the stable production origin serves the promoted
   deployment: every pinned resource and manifest at exact URLs with correct
   bytes, SRI/CSP/CORS and no redirect, equal to the pin; also verify retained A
   and legacy root. A live check proves equality to the reviewed pin; it never
   creates one.
6. Only then merge/ship the Avibe package containing that exact pin. Shipping it
   early fails closed and temporarily makes protected Vault unavailable.
7. Roll back by shipping a previously reviewed local pin deliberately, never by
   mutating a release path. Retention does not imply that a vulnerable version
   remains approved. Revocation means a reviewed replacement pin plus deliberate
   fail-closed unavailability for affected old installs if necessary; this task
   revokes/removes nothing. Old disabled-verifier parents cannot be made enforced
   by a central asset change alone.

## Host app association

`/.well-known/apple-app-site-association` names the Avibe iOS app
(`68B2SQ6YK3.bot.avibe.ios`) under `webcredentials`. iOS offers a passkey inside
an app's web view only when the relying party lists that app, so without this file
the app cannot run any protected ceremony for **sandbox.avibe.bot**. The RP ID,
enrolled passkeys and encrypted records do not change.

The file is host metadata, not a release. `scripts/association.mjs` copies
`hosting/apple-app-site-association.json` to that one path after
`release:assemble`; neither file is a release identity input, so no build hash,
retained byte or parent pin changes. The step accepts only a `webcredentials.apps`
list and refuses to replace an assembled path. It must stay that narrow: it is not
a route for publishing executable bytes outside `retained/`.

**What it grants:** the listed app may ask the system for this RP's passkeys, as a
browser can. The app already hosts this sandbox in its web view and is trusted to
run it unmodified, so no new party is trusted. Ceremonies still run in sandbox
code; PRF output, VMK and plaintext stay in this origin. Adding an app identifier
is a security change that needs the owner's authorization. Do **not** publish
`/.well-known/webauthn`: related-origin requests would let other origins use this
RP ID directly.

## Registration identity compatibility

Server-supplied creation options use the existing v2 `authzCreationOptions`
object, either the daemon response with a `webauthn` object or direct creation
options. Supplied options and their `user` must be objects, not arrays or scalar
fallbacks. `user.id` is a base64/base64url **string** encoding 1–64 bytes;
canonical padded and unpadded forms are accepted byte-exactly. Mixed alphabets,
whitespace, nonzero unused bits, malformed padding, missing/wrong-type IDs and
oversized inputs fail before `navigator.credentials.create`. Only undefined or
omitted options select the historical no-options compatibility path. Other
WebAuthn byte fields retain their existing decoder.

This accepts both old daemon options encoding `avibe-vault` and new opaque
32-byte per-instance registration IDs, without a new protocol field. Credential
`user.id` is separate from the existing `vaultUserHandle` / `vault_user_handle`
root-metadata AAD and session scope. Those values, stored credential IDs, RP,
resident-key/UV/PRF policy, unlock and signing authorization are unchanged; there
is no new user-handle equality gate on unlock/sign and no credential migration.
The old immutable e7be runtime already transports valid new IDs; successor
validation is defense-in-depth, not a prerequisite for valid new IDs.

Mocked adapter and `main.ts` tests cover old/new IDs, independent A/B public
values, bounds/encodings, direct/iframe/popup callers, and fragment transport
with a separate unchanged scope. They stop before PRF/VMK establishment and do
not prove real authenticator coexistence, successful enrollment, old-binary
rollback, or a browser's use of the issued ID. Registration attestation does not
sign `user.id`. Existing root-AAD, credential-ID, fresh-UV and signed-context
negative tests remain required. Frozen legacy and existing versioned snapshots
remain byte-for-byte unchanged; new validation does not retrofit them. Actual
two-instance coexistence requires separately approved isolated authenticator
acceptance, not the owner's active credential store.

## Validation boundary

Release tests cover native SRI emission, runtime closure, malformed metadata,
changed/missing bytes, immutable collisions, A retention after B, old-file mutation
and extra unpublished versions. Avibe tests cover fresh verification, redirects,
missing Web Crypto, resets, cleanup, wrong ready/handshake, popup cancellation and
localized failure presentation. Its Chromium/WebKit fixture runs the real client
and this actual source-built sandbox with external network denied, synthetic public
metadata and credential APIs denied. It covers parent preopen and sandbox-owned
setup/auth loader paths, post-preflight JS/CSS SRI tampering, stylesheet load/error/
timeout, and wrong-build window pairing. It never approves, signs, decrypts or
creates a real credential. Offline E2E is not a live deployment, real iOS/PWA
activation test, physical passkey acceptance or authorization to use real keys.
