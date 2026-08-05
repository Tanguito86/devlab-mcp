# 10 — Atomic apply

The evidence root is a same-volume sibling outside the project. Apply acquires
an exclusive per-project lock, removes stale `.next` files, writes and fsyncs
staged bytes, verifies staged hashes, copies and verifies original blobs,
writes the `WRITE_AHEAD` manifest before the first destination mutation, then
promotes with bounded atomic-renaming retries. Each destination hash is checked
again immediately before its rename. Files and, where supported, directories
are fsynced before success is recorded as `APPLIED`.

Injected failures before staging, during staging and before promotion restore
STATE-A automatically. The hard-crash injection after the first replace leaves
a durable `WRITE_AHEAD` transaction; a later `rollback` acquires the project
lock, classifies each file as before/after, restores only promoted files and
proves byte-exact STATE-A. No partial state is ever reported as success.
