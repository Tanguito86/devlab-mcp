# Determinism and runtime review

The five-viewpoint synthetic scene was captured with fixed seed `1729`, time
`2500 ms`, CPU/SwiftShader backend, and `960x540` viewport.

## Repeated capture

- PNG byte equality: PASS.
- RGBA equality: PASS.
- Normalized visual/scene metadata equality: PASS.
- Recursive output file set equality: PASS.
- Viewpoint order equality: PASS.

## Controlled change

Seed `1729 -> 1730` changed `overview` (13,812 pixels) and `instancing`
(48,679 pixels). `shader`, `transparency`, and `postprocess` remained
pixel-identical. `UNRELATED_VIEWPOINT_PIXEL_DIFF: 0`.

## A/B and lifecycle

Default versus `bloom-off` ran in the same browser, page, scene, seed, time,
camera table, and resolution. The simulation was not rebuilt or advanced
between variants. Context loss and restoration were both observed, and the
post-restore capture succeeded in the same page session.

All four resize cases (`320x568`, `720x1280`, `960x540`, `1600x900`) passed
measured canvas, camera aspect, composer, render-target, DPR, and output gates.

## Performance semantics

On Windows SwiftShader the measured median CPU submit was about `0.50 ms`; the
median synchronized render plus 1-pixel readback was about `101.10 ms`; the
separate rAF-based estimate was about `3.4 FPS`. These are environment-specific
development measurements, not production thresholds and not GPU timer-query
results. Cross-GPU binary determinism is not claimed.
