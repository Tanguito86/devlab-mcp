# 15 — Rollback

Rollback validates ledger-to-manifest SHA-256, transaction/root/plan binding,
current STATE-B fingerprint, each destination after-hash, and each original
blob before-hash. It then moves applied files into evidence, restores verified
blobs by rename, and recomputes the entire project fingerprint/file set.

Positive and negative real pilots both restored
`4f1a56b8f71b148fb9d990d2893d8bd45d8379256584ba6949ee4604fd515dfe`.
Unit coverage supplies additional byte-exact restores and blocks altered
manifests, missing/corrupt blobs and post-apply external changes. Durable
`WRITE_AHEAD` recovery uses the same locked, concurrent-change-safe path.
