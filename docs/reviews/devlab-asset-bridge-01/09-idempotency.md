# 09 - Idempotency

Reapplying the identical bound v1 plan returned `NO_CHANGE`, `changedFiles: 0`,
and the same project fingerprint
`208690a5a73ec9095897a192c717f2607cce7ab444912ecd01bba89d26ed80e6`.
No new id, resource entry, file, hash, ordering change, or transaction backup was
created. A different plan under the same transaction id remains rejected.

The Forge rerun also returned `NO_CHANGE` for both catalog versions while
preserving catalog SHA-256 `dc3a83...`.
