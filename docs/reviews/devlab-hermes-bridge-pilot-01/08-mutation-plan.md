# 08 — Mutation plan

The frozen schema-v1 plan binds transaction, capability, project root,
snapshot hash, project fingerprint, expected HEAD, sorted allowlist, per-file
before/after SHA-256, exact intended bytes, verification policy and mandatory
rollback. `planHash` hashes canonical JSON plus LF.

Apply receives the immutable plan and caller-supplied plan hash. It never
recalculates or silently refreshes a stale plan. A no-change plan returns
`NO_CHANGE` with `changedFiles=[]`.
