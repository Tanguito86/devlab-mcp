# AB-04A scaffold design

## Boundary

`devlab-internal-threejs-game-benchmark-v1` is a materializable common
baseline, not an implementation of **ASH RELAY**. It contains no enemies,
objective flow, checkpoint, boss, victory condition, benchmark treatment or
external guidance. Both legs receive the same 22-file tree.

```text
PATH: benchmarks/threejs-game-skills-ab/scaffolds/devlab-internal-threejs-game-benchmark-v1
FILE_COUNT: 22
TREE_SHA256: c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908
CONTRACT_VERSION: ab04-v2
CONTRACT_SHA256: 852676a9255dc01c32828100b8b327bab9337579a43bc4e226be9e8de3f43482
```

## Runtime architecture

| Area | Implementation |
| --- | --- |
| Entry | `src/main.ts` installs the DevLab capture surface and starts one engine. |
| Renderer | `THREE.WebGPURenderer`, `forceWebGL: false`; startup fails unless the active backend is native WebGPU. |
| TSL | Visible node-material use of `uniform`, `color`, `float` and `oscSine`. |
| Determinism | Seeded Mulberry32 RNG; no `Math.random()` for scene state. |
| Simulation | 60 Hz fixed step, at most eight catch-up steps, interpolation and dropped-time reporting. |
| Frozen capture | Exact time application pauses simulation and renders once. |
| Responsive layout | Landscape/portrait resize, DPR cap 2, camera and bounded target updates. |
| Lifecycle | LIFO resource ownership, listener cleanup and idempotent shutdown. |
| Assets/network | Local procedural geometry, colors and lighting; no CDN, R3F or external scaffold. |

The page exposes `window.__DEVLAB_CAPTURE__` with `ready`, `setSeed`,
`setTime`, `setViewpoint`, `renderOnce` and `getMetrics`. The frame adapter
serializes the presented WebGPU canvas to PNG, decodes that exact image and
persists its RGBA bytes. It does not use a WebGL readback path.

## Exact dependencies

| Package | Version | Provenance |
| --- | ---: | --- |
| `vite` | `8.2.0` | Standalone AB-04A resolution; Vite was absent from the root lock. |
| `three` | `0.185.1` | Existing DevLab WebGPU/TSL fixture pin. |
| `typescript` | `6.0.3` | Existing root lock resolution. |
| `tsx` | `4.22.3` | Existing root lock resolution. |
| `@types/node` | `24.12.4` | Existing root lock resolution. |

Vite's standalone exception is explicit: it has an exact version and its own
frozen scaffold lock, and it is not added to the root DevLab dependency graph.

```text
SCAFFOLD_PACKAGE_SHA256: c072981489dd7db31394a7dcf7d39653b0ad436fc62202729fbed5be48d73839
SCAFFOLD_LOCK_SHA256: 34c3f2f1f78a990e59131adecbdc70a9ddac38443b8feaec7588580055a98688
```

## Validation contract

The scaffold owns 17 deterministic unit tests for RNG, fixed-step behavior,
viewport planning and resource lifecycle. R12 materialized two byte-identical
copies; each passed frozen offline install, build, typecheck and all 17 tests.
The native Chromium smoke then rebuilt from authenticated pnpm/Vite bytes and
captured identical desktop and mobile frames on the RTX 2060. It authenticated
the complete four-file local capture-harness closure, the full Playwright and
playwright-core package trees, the exact Chromium identity and all 308 files of
its browser distribution before accepting either leg.

This validates only the shared baseline. It is not gameplay acceptance and no
LEG_A or LEG_B builder ran.
