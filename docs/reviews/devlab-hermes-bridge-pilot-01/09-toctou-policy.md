# 09 — TOCTOU policy

Plan→apply rechecks project fingerprint, Git HEAD, snapshot hash, file hashes,
allowlist, transaction ID, plan hash, symlinks and IDE state. Apply→verify
checks current fingerprint and every planned after-hash. Rollback requires the
current applied fingerprint and every destination after-hash.

Tests cover file change between plan/apply, altered plan, changed allowlist,
changed file after apply, altered manifest, and project-open preflight. All
preserve the external change and return typed stale/concurrent errors.
