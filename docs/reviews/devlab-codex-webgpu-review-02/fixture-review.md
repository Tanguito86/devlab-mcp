# Fixture and harness review

All four manifests declare `requiresNativeWebGPU: true`. This selects a full,
version-pinned Chromium executable, rejects `chromium-headless-shell`, records
the executable SHA-256, and runs a native adapter/device probe after navigating
to the actual `127.0.0.1` page.

WebGPU frame acquisition is:

```text
renderOnce()
-> canvas.toDataURL("image/png")
-> Image.decode()
-> dimension check
-> decoded-image RGBA extraction
-> Node PNG signature/IHDR validation
-> exact width*height*4 RGBA validation
```

The top-level allowlisted HTML is fulfilled directly by Playwright under the
real loopback origin. This prevents host security software from rewriting the
local HTTP response. Main modules, manifests and Three vendor files remain
served by the loopback-only server. Every non-local request still aborts and
fails the capture.

Runtime results:

| Fixture | Native render | Determinism | Stability (60 frames) |
|---|---:|---:|---:|
| basic | PASS, 5 viewpoints | PNG/RGBA/metrics/files PASS | 8→8 geometry, 5→5 textures |
| compute | PASS, 2 viewpoints | PNG/RGBA/metrics/files PASS | 2→2 geometry, 2→2 textures |
| post | PASS, 5 viewpoints | PNG/RGBA/metrics/files PASS | 4→4 geometry, 14→14 textures |
| device-loss | PASS | PNG/RGBA/metrics/files PASS | 3→3 geometry, 3→3 textures |

Compute seed `1729→1730` changed 155,195 pixels in overview and 319,021
pixels in closeup, with zero unrelated-viewpoint changes. Bloom A/B ran in
the same page/browser/scene and changed every declared viewpoint.

Device loss was forced through the pinned private device handle. Recovery
advanced renderer generation `1→2`, retained one canvas, retained zero active
loops and produced a valid post-recovery capture.
