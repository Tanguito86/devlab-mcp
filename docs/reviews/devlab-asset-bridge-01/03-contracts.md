# 03 - Contracts

Public capability: `ASSET_GM_BRIDGE_V1`, package version `0.1.0`, bridge
contract version `1.0.0`. Its schema is
`packages/asset-gm-bridge/schemas/asset-gm-bridge-v1.schema.json`.

Only lifecycle `APPROVED` may reach apply. `DRAFT`, `PILOT`, `CANDIDATE`,
`DEPRECATED`, and `REJECTED` fail with `ASSET_NOT_APPROVED`; there is no bypass
field.

The immutable manifest includes every field required by the sprint: asset and
bridge versions, lifecycle, spec/export/manifest hashes, Forge profile and
provenance, target identity and snapshot, planned paths, resource metadata,
dimensions, frames, origin, bounding box, collision/compression policies,
decoded-byte estimate, allowlist, transaction id, and creator capability. It
contains no clock, absolute path, username, or secret.

The SHA-256 binding covers the canonical manifest hash, adapter plan hash,
target snapshot, expected HEAD, allowlist, every planned before/after content
hash, transaction id, resource name, and bridge version. Revalidation occurs
at apply/verify/rollback; drift returns `STALE_OR_TAMPERED_PLAN` rather than
silently replanning.

The closed public error vocabulary contains 16 codes:

`ASSET_NOT_APPROVED`, `ASSET_NOT_FOUND`, `ASSET_HASH_MISMATCH`,
`ASSET_BUDGET_EXCEEDED`, `INVALID_ASSET_MANIFEST`,
`TARGET_PROJECT_MISMATCH`, `TARGET_SNAPSHOT_CHANGED`,
`STALE_OR_TAMPERED_PLAN`, `PATH_NOT_ALLOWED`, `RESOURCE_COLLISION`,
`CASE_COLLISION`, `APPLY_FAILED_RECOVERED`,
`APPLY_FAILED_RECOVERY_REQUIRED`, `ROLLBACK_BLOCKED_CONCURRENT_CHANGE`,
`VERIFY_COMPILE_FAILED`, and `VERIFY_RUNTIME_FAILED`.

The adapter plan contract was extended compatibly with optional binary
`contentBase64` and optional `allowedExtensions`. Existing text callers retain
their previous defaults. The bridge uses this formal plan input for PNG and
`.resource_order` bytes; the public six-operation adapter surface is unchanged.
