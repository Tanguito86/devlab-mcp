# 03 — Adapter contract

`GovernedGameMakerIdeAdapter` implements exactly `status`, `inspect`, `plan`,
`applySafe`, `verify`, and `rollback`. Each request carries explicit relative
`projectRoot`, expected fingerprint, expected Git HEAD, allowlist, capability,
transaction ID, timeout/cancellation, verification policy, and evidence root.

The constructor requires an explicit `projectsDir`; no operation derives a
project from the current working directory. Compile configuration additionally
requires explicit absolute Igor, runtime, user, and ProjectTool paths.

Schema: `packages/gm-ide-adapter/schemas/gm-adapter-v1.schema.json`.
