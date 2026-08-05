# 14 - Rollback

In the real pilot, v2 rollback restored v1 fingerprint `208690a5...`; v1
rollback restored baseline fingerprint `328b9f08...`. The final project tree
has the same path set and per-file SHA-256 map as the pristine fixture.

Post-rollback project load, Igor compile and Runner smoke all passed. The visual
capture `evidence/after-rollback.png` is byte-identical to `evidence/before.png`
and shows version 0 with no imported beacon. Corrupt manifests/backups and
external changes fail closed.
