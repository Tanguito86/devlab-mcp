# 15 — Rollback

Rollback validates ledger→manifest SHA-256, transaction/root/plan binding,
current STATE-B fingerprint, each destination after-hash, and each original
blob before-hash. It then moves applied files into evidence, restores verified
blobs by rename, and recomputes the entire project fingerprint/file set.

Positive and negative real pilots both restored
`c012f9eee926df338bdf9b923262f72baf9129a680acd0cc48667bfd9a6698ff`.
Unit coverage supplies additional byte-exact restores and blocks altered
manifests, missing/corrupt blobs and post-apply external changes.
