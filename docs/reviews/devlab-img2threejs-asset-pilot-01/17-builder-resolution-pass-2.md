# Builder resolution pass 2

Every PASS 1 visual finding is resolved by the camera/lighting correction. The
asset factory, geometry, parts, materials, animation, and review thresholds did
not need a third visual builder pass.

A subsequent evidence-only hardening change separated variable operational
timings from deterministic artifact outputs and added explicit first-render,
maximum 1024 capture, and cleanup timing fields. Both runs and both critics were
re-executed at the final source pin. This was harness evidence hardening, not a
visual PASS 3 or an asset alteration.
