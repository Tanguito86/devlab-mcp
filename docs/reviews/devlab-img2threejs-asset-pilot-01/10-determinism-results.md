# Determinism results

RUN-A and RUN-B were executed in fresh Chromium contexts with the same committed
factory pin `3ffcf0631fcb86f65b9649a5b73e6ca2f996247f`, canonical spec, seed,
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
