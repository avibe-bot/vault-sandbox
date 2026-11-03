# Vault sandbox repository

This repository owns the protected-Vault browser runtime and immutable static
releases on `sandbox.avibe.bot`. The RP ID and existing encrypted records must
remain stable. The Avibe parent owns the locally packaged trust pin.

- `README.md`: runtime and v2 protocol surface.
- `docs/integrity.md`: canonical integrity invariants, reproducible snapshot
  procedure, retained-version/legacy policy, threat residuals and rollout gates.
- `src/fixtures/README.md`: public cryptographic vector provenance.
- `docs/bitcoin-acceptance.md`: isolated Bitcoin acceptance evidence.

Use `pr-delivery-loop` for implementation. A sandbox `main` merge automatically
deploys Production: security merge/deployment authorization is required. Preview
CI is not authorization to publish a pin or operate real Vault keys.

Published `retained/` bytes are append-only. Use the explicit release tools,
never deployed bytes as the source of trust. Run focused tests and `npm run build`
(two deterministic builds plus snapshot verification); CI also protects retention
and reproduces the frozen legacy root. Do not introduce query-selected versioned
loader URLs, dynamic executable edges, permissive integrity switches or mutable
release fallbacks.
