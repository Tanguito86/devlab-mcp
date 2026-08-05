# 10 — Atomic apply

The evidence root is a same-volume sibling outside the project. Apply acquires
an exclusive per-project lock, writes staged bytes, verifies staged hashes,
copies original blobs, verifies backup hashes, writes the manifest before the
first destination mutation, promotes with bounded rename retries, and verifies
destination hashes.

Injected failures before staging, during staging, before promotion and after
the first replace all left the canonical project at STATE-A. No partial state
was reported as success.
