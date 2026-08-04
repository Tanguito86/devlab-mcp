# DevLab internal Three.js game benchmark scaffold v1

Minimal, original common baseline for the DevLab A/B benchmark. It deliberately
contains no enemies, objectives, checkpoint, boss, victory state, or other game
content.

## Included foundation

- Vite + TypeScript with exact dependency versions and a standalone lockfile
  expected at materialization time.
- `three/webgpu` `WebGPURenderer` with native-backend fail-closed validation.
- A visible TSL material and deterministic seeded presentation scene.
- A 60 Hz fixed-step accumulator with bounded catch-up and render interpolation.
- Explicit pause, resume, frozen-time capture, responsive resize, owned GPU
  resources, and idempotent shutdown.
- DevLab capture contract v1 and the WebGPU-safe `window.__DEVLAB_FRAME__`
  PNG/RGBA provider.

All assets are procedural and local. The scaffold has no CDN, remote asset,
React, React Three Fiber, or external generator dependency.

## Commands

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm run build
corepack pnpm run typecheck
corepack pnpm run test
```

Vite copies `public/capture-manifest.json` into `dist/`. DevLab's AB-04 verifier
must serve that built `dist/` directory through the loopback-only capture
harness and provide the benchmark seed and viewports from the canonical
benchmark contract. The neutral manifest defaults are fixture fallbacks, not
benchmark configuration.

The capture surface is:

```text
window.__DEVLAB_CAPTURE__.ready()
window.__DEVLAB_CAPTURE__.setSeed(seed)
window.__DEVLAB_CAPTURE__.setTime(milliseconds)
window.__DEVLAB_CAPTURE__.setViewpoint("title")
window.__DEVLAB_CAPTURE__.renderOnce()
window.__DEVLAB_CAPTURE__.getMetrics()
window.__DEVLAB_FRAME__()
```

Optional lifecycle methods `pause`, `resume`, `setFrozen`, and `shutdown` are
provided without changing the six-method DevLab contract.
