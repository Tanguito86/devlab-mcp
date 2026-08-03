# jungle-trail architecture review

Review date: 2026-08-03

Pinned commit: `073e6eb8efc6d6915efacc611a6e5ba91c89e34c`

Status: **REFERENCE_ARCHITECTURE / EXECUTION_NOT_AUTHORIZED**

This review is read-only. Nothing was executed (`npm install`, `npm run
serve`, `npm run shoot` all unauthorized and not run).

## General architecture

First-person procedural Three.js scene: ~12,000 lines across 51 `src/` files
plus 18 CLI tools in `tools/`. No build step — plain ES modules behind an
importmap, served by a static server.

- `src/main.js` — bootstrap; exposes `window.__game` (goTo, warp, setSun,
  setPaused, renderOnce, probe, info).
- `src/audio/` — DSP as pure functions (Float32Array in/out, no Web Audio in
  the synthesis path); `engine.js` is the only Web Audio touch point;
  `bakeWorker.js` bakes 60 buffers in a local worker.
- `src/gfx/` — GPU texture baking (GLSL `surf()` → render targets).
- `src/player/`, `src/render/` (atmosphere, canopy, field, grade, mirror,
  sky), `src/world/` (terrain, vegetation, plants, ruins, water, noise).
- `tools/` — capture, analysis, and performance tooling (see below).

## Capture tooling

| Tool | Role |
|---|---|
| `serve.mjs` | Minimal static server (MIME map, anti path-traversal) |
| `shoot.mjs` | Deterministic capture: fixed stops along the trail, fixed sun, tier/fov flags, writes `shots/<tag>/*.png` + `report.json` |
| `harness.mjs` | Headless plumbing: ephemeral server, Chromium on real GPU (ANGLE/D3D11) or SwiftShader, process pinning, guaranteed teardown, page error collection |
| `px.mjs` | Zero-dependency PNG viewer/diff (own codec, zlib only), `--diff` with code-value statistics |
| `fx.mjs` | A/B effect isolation: controlled frame pairs from a frozen world state, one shader term switched |
| `perf.mjs` / `p1cost.mjs` | Frame timing synchronized by 1-px `readPixels`, not `glFinish` |
| `check.mjs` | Parse check of `src/` before launching a browser |

## Playwright dependency

`devDependencies: { "playwright": "^1.62.0" }` — the only dependency in the
lockfile. Used solely by `tools/` (harness.mjs launches headless Chromium).
The README states the game itself does not need `npm install`.

## Three.js runtime

`index.html` importmap loads `three@0.170.0` from jsDelivr
(`three.module.js` + `examples/jsm` mapped as `three/addons/`). This is the
only runtime network dependency; `src/` itself has no fetch/XHR/Image/
TextureLoader/GLTFLoader/RGBELoader/AudioLoader usage (verified by grep).

## Shell / filesystem / workers / network

- `src/` (runtime): no fs, no child_process, no external network. One local
  module worker for audio baking (same origin).
- `tools/` (CLI, outside the game runtime): `node:fs` writes (shots,
  reports), `node:child_process` (parse check; PowerShell process pinning on
  Windows), and an optional `--js` debug flag in shoot.mjs that evaluates
  arbitrary JS against `window.__game` (author tooling; not active by
  default). None of this runs under this sprint.

## Deterministic capture strategy

The authoritative pattern is in `harness.mjs::capture()`:

1. `page.screenshot()` is rejected as non-deterministic (it races the game
   loop for the GL context).
2. Instead: **one** `page.evaluate` that pauses the loop (`setPaused(true)`),
   renders exactly once (`renderOnce()`), reads the drawing buffer
   (`toDataURL`), and resumes — required to be a single evaluate because the
   drawing buffer is not preserved between tasks.
3. Before each stop: `goTo(t)` + `warp(2.0)` (lets the camera spring and
   adaptive state settle) + fixed wait.
4. Fixed sun azimuth/elevation, fixed viewpoint stops, `deviceScaleFactor: 1`.
5. Frame sync for timing via 1-px `readPixels` (cannot return before the
   frame exists), explicitly because `glFinish` does not wait for the GPU in
   Chromium.
6. pageerror / console error / failed requests / crashes are collected as
   evidence into `report.json`.

## Builder → blind critic pattern

`PROMPT.md` (kept unedited) documents the build process: seven systems built
sequentially; each is reviewed by a **separate critic that sees only rendered
screenshots, never source**, scoring photorealism against real jungle
photography; iteration continues until it passes. Honest scores are recorded
(vegetation 5/10 after six rounds, lighting 6/10, water 6/10 after four
passes, post-processing 7/10). The README lists real bugs the critic caught
that source reading would not have (inverted quad winding, premultiplied
alpha outlines, wrong canopy distance axis for volumetric shafts).

## License

MIT — `LICENSE` present (Copyright (c) 2026 Prasenjit (StarKnightt)),
consistent with the README declaration and the GitHub API. SHA-256 recorded
in the manifest and verified.

## Generic tooling inspiration (candidates for a separate DevLab sprint)

- `harness.mjs` — ephemeral server + browser + guaranteed teardown + error
  collection (browser-dev-mcp orchestration).
- `shoot.mjs` — reproducible capture sequences with structured `report.json`.
- `px.mjs` — zero-dependency PNG codec + diff with code-value statistics
  (visual-regression-mcp is already pure-Node pixel diff; this validates the
  approach).
- `fx.mjs` — controlled-pair A/B methodology for isolating one effect.
- `check.mjs` — fail-fast parse gate before launching a browser.
- readPixels-vs-glFinish — honest frame synchronization (same lesson as
  gfxinfo on Android).
