# Galaxy Raiders Canvas2D render benchmark

This adapter measures the fixed 700, 1,400 and 2,000 enemy-bullet loads without modifying the Galaxy Raiders checkout.

## Why rAF intervals are primary

Canvas2D calls can be queued. A `performance.now()` timer wrapped only around `Renderer.draw()` can stop before rasterization/composition finishes, so it is retained as a secondary command-submission diagnostic. The primary metric is the distribution of successive `requestAnimationFrame` callback timestamps while each full Galaxy frame is rendered.

The methodology was checked with a 1,920 x 1,080, 20,000-`fillRect` probe. Thirty samples gave a 2.4 ms p50 around command submission and a 9.6 ms p50 when a one-pixel `getImageData` forced completion. That delta demonstrates why internal draw timers alone are insufficient. A readback is not included in the production benchmark because it changes the workload being measured.

## Contract

- A headed, visible Chromium window is mandatory. Headless or hidden-page rAF is rejected.
- CDP must attest enabled GPU compositing and Canvas2D on a non-software renderer.
- The normal Galaxy game loop is stopped, then the real `Renderer.draw()` path is driven once per rAF. This isolates render cost from simulation/update cost.
- Deterministically tiled 4 x 8 `basic`/`alien1` enemy bullets are injected into the existing `window.enemyBullets` array. The count is checked before and after every load. Other bullet styles are deliberately outside this count-scaling benchmark.
- Each load gets 180 warm-up frames and 900 measured intervals by default.
- Reports include rAF p50/p95/p99 plus secondary `Renderer.draw()` p50/p95/p99. Budget verdicts use rAF p95.
- Nominal budgets are `1000 / 120` and `1000 / 60` ms. A 0.1 ms tolerance is used only for Chromium timestamp quantization (for example, 8.333 ms represented as 8.4 ms).
- An unloaded baseline must first qualify the attached display at the target refresh rate. A load is not called a failure at 120 Hz when the baseline itself cannot present 120 Hz.
- The report records OS, CPU, memory, GPU/driver, active resolution/refresh rate, browser metadata, source Git HEAD/status and `index.html` SHA-256.

## Run

From the DevLab repository root on the machine connected to the target display:

```powershell
corepack pnpm benchmark:galaxy-render -- --game-root "H:\DEV\AGENTE\GALAXY\GALAXY RAIDERS\www"
```

For an exclusive, non-overwriting JSON evidence file:

```powershell
corepack pnpm benchmark:galaxy-render -- --game-root "H:\DEV\AGENTE\GALAXY\GALAXY RAIDERS\www" --out "H:\evidence\galaxy-render.json"
```

The current `galaxy-raiders` browser profile remains useful for ordinary interactive automation, but its default URL (`http://localhost:5173`) requires a separately running server. The old `galaxy-performance-sample` workflow neither fixes exact bullet counts nor samples a real rAF distribution and must not be used for this gate.

## Compatibility names

- `browser_record_trace` captures a timed screenshot sequence. It is not a Chrome performance trace.
- `browser_capture_fps` reads counters provided by the page. It does not measure rAF FPS.
