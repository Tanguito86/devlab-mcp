# Determinism results

RUN-A and RUN-B were executed in fresh Chromium contexts with the same committed
factory pin `9f1c797a567284376a91456630eebff5b24d25e0`, canonical spec, seed,
camera/lighting hashes, dimensions, pixel ratio, WebGL backend, and logical frame
indices.

- 14/14 PNG SHA-256 values match exactly.
- 14/14 raw top-down RGBA SHA-256 values match exactly.
- `captures/run-a/manifest.json` and `run-b/manifest.json` are byte-identical.
- The four `relay-pulse` samples are frame-indexed at 0/30/60/90 and repeat on
  the fixed 120-frame cycle.

No encoder exception or silent tolerance was used. Operational timings are
stored separately and are deliberately excluded from the deterministic artifact
manifest outputs.
