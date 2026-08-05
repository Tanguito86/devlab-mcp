# Camera and capture plan

Ten fixed views are declared in the local runtime: front/rear three-quarter,
left/right profile, top, bottom, orthographic front, game scale, thumbnail, and
material diagnostic. Every declaration fixes position, target, projection,
FOV or orthographic bounds, near/far planes, scale, background, rig, width, and
height. Top/bottom also fix camera up-vectors.

Inspection and diagnostic views are `1024x1024`; game scale is `256x256`; the
thumbnail is `128x128`. Pixel ratio is always one. `relay-pulse` is captured at
logical frames 0, 30, 60, and 90.

Each PNG and raw RGBA readback crosses `DevLabCaptureTarget`, which validates
dimensions/format before sequencing evidence. RUN-A and RUN-B use fresh browser
contexts and fresh factories.
