# DevLab capture harness

Deterministic capture of local Three.js scenes for DevLab. Runs a scene in
headless Chromium, freezes reproducible state (seed + simulation time),
captures canonical viewpoints, and produces PNG + raw RGBA + metrics plus
deterministic A/B comparisons.

**Status:** DEVLAB-THREEJS-CAPTURE-01. Harness is Three.js-version-agnostic;
the bundled fixture pins `three@0.185.1`.

## Architecture

```
scripts/capture-harness.js        CLI entry (capture|determinism|sensitivity|ab|perf|resize|context)
scripts/capture-harness/
  server.js    minimal secure static server (127.0.0.1, ephemeral port, allowlisted root)
  contract.js  DevLabCaptureTarget validation, manifest validation, output-tag policy
  capture.js   Playwright orchestration (frozen-simulation capture flow)
  metrics.js   RGBA visual metrics + deterministic comparison (zero deps)
  runner.js    high-level flows and evidence writing
capture-fixtures/
  threejs-scene/   synthetic scene: PBR, instancing, shader, shadows, transparency,
                   render target, postprocessing, 5 viewpoints (fixture pins three@0.185.1)
tests/
  capture-server.test.js       server security (traversal, symlinks, vendor, MIME)
  capture-contract.test.js     contract/manifest/tag/metrics validation
  capture-metrics.test.js      visual metrics and comparison
  capture-adversarial.test.js  17 integration cases with synthetic fixtures (Playwright)
```

## Scene contract

A page exposes `window.__DEVLAB_CAPTURE__` (version 1):

```typescript
interface DevLabCaptureTarget {
  version: 1;
  ready(): Promise<void>;
  setSeed(seed: number): Promise<void> | void;
  setTime(milliseconds: number): Promise<void> | void;
  setViewpoint(id: string): Promise<void> | void;
  renderOnce(): Promise<void> | void;
  getMetrics(): Promise<CaptureMetrics> | CaptureMetrics;
  // CaptureMetrics: drawCalls, triangles, geometries, textures, programs,
  //                 seedApplied, timeAppliedMs, viewpointApplied (finite numbers)
}
```

The fixture also ships `capture-manifest.json` (viewpoints, defaults, variants)
served by the harness server. The harness rejects: missing contract, unknown
version, missing methods, unknown/duplicate viewpoints, non-local URLs, and
proves seed/time/viewpoint were actually applied (`SEED_NOT_APPLIED`,
`TIME_NOT_APPLIED`, `VIEWPOINT_NOT_APPLIED`).

No `eval`, no `new Function`, no arbitrary JS from the CLI — only the fixed
contract methods are invoked.

## Capture flow (frozen simulation)

1. `ready()` → 2. `setSeed` → 3. `setTime` → 4. `setViewpoint` →
5. `renderOnce()` → 6. GPU sync via 1-px `readPixels` → 7. PNG + full RGBA in
the **same** `page.evaluate` (drawing buffer is not preserved) → 8. metrics.
The animation is never resumed during capture.

Not relied upon: `requestAnimationFrame` timing, `waitForTimeout`,
`gl.finish`. `preserveDrawingBuffer` is never enabled.

## Local-only server

Binds `127.0.0.1` on an ephemeral port; serves only the allowlisted fixture
root (+ optional vendor files/directories under `/vendor/`); rejects `..`,
absolute paths, symlinks, and directory listing; closes guaranteed. Playwright
aborts every request that is not the local origin and records it.

## Determinism evidence

Two independent runs of the same fixture are byte-identical (PNG and RGBA)
with identical normalized metrics. A controlled change (seed 1729 → 1728)
changes only the viewpoints that show the affected geometry — the fixture
isolates the instanced field on camera layer 1 so shader/transparency/
postprocess frames change by 0 pixels.

## Output layout

```
<out>/<tag>/
  <viewpoint>/frame.png  frame.rgba  metrics.json  capture.json
  report.json
```

Flows also emit `determinism.json`, `sensitivity.json`, `comparison/`,
`performance.json`, `resize.json`, `context.json` in `<out>`.

## Requirements for new fixtures

- Expose the contract + manifest; pin the Three.js version (npm import,
  never CDN).
- Deterministic state must derive from `setSeed`/`setTime` only.
- Provide ≥1 canvas; handle `resize` (camera, renderer, composer, render
  targets); handle `webglcontextlost/restored` (recreate GPU resources).
- Keep the console free of warnings/errors.

## Running

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$env:LOCALAPPDATA\DevLab\playwright-browsers"
node scripts/capture-harness.js capture --fixture capture-fixtures/threejs-scene --out <dir> --tag run-1
node scripts/capture-harness.js determinism --fixture capture-fixtures/threejs-scene --out <dir>
node scripts/capture-harness.js sensitivity --fixture capture-fixtures/threejs-scene --out <dir> --seed2 1728
node scripts/capture-harness.js ab --fixture capture-fixtures/threejs-scene --out <dir> --variant-b bloom-off
node scripts/capture-harness.js perf --fixture capture-fixtures/threejs-scene --out <dir>
node scripts/capture-harness.js resize --fixture capture-fixtures/threejs-scene --out <dir>
node scripts/capture-harness.js context --fixture capture-fixtures/threejs-scene --out <dir>
```

`--backend gpu` uses the real adapter (ANGLE/D3D11); the default `cpu`
backend (SwiftShader) maximizes byte determinism. Performance numbers are
labeled by backend; GPU time is not reported without a reliable timer query.

## License

Own implementation (MIT, like the package). Written from official Three.js
documentation; no substantial code copied from external skill sets.
