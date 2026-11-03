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
2. **Sandbox `main` is connected to automatic Vercel Production deployment.**
   A PR Preview is allowed for review, but merging this security PR is deployment
   authorization and must wait for the owner. No task here deploys or merges.
3. After separately authorized sandbox publication, check the stable production
   origin serves every pinned resource and manifest at exact URLs with correct
   bytes, SRI/CSP/CORS and no redirect; also verify retained A and legacy root.
   A live check proves equality to the reviewed pin; it never creates one.
4. Only then merge/ship the Avibe package containing that exact pin. Shipping it
   early fails closed and temporarily makes protected Vault unavailable.
5. Roll back by shipping a previously reviewed local pin deliberately, never by
   mutating a release path. Retention does not imply that a vulnerable version
   remains approved. Revocation means a reviewed replacement pin plus deliberate
   fail-closed unavailability for affected old installs if necessary; this task
   revokes/removes nothing. Old disabled-verifier parents cannot be made enforced
   by a central asset change alone.

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
