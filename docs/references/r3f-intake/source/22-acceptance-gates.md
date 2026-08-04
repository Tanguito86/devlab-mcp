# 22 — Acceptance gates para DEVLAB-R3F-ARCHITECTURE-AB-05

> Diseñados en OPS-R3F-INTAKE-01. Gates que se evaluarán cuando Codex ejecute el benchmark.

## Gate 1 — Paridad de setup

- [ ] LEG_A y LEG_B corren sobre el mismo navegador (misma versión), misma RTX 2060, mismos viewports.
- [ ] Misma versión de three en ambas piernas (0.172.x), mismo backend (WebGPURenderer), mismos shaders TSL.
- [ ] Mismo seed inicial y misma secuencia de input del bot.
- [ ] Cero código compartido entre piernas (verificable por diff de árboles: ningún archivo idéntico salvo assets).

## Gate 2 — Completitud funcional

- [ ] Las 15 features de EMBER CIRCUIT presentes y jugables en ambas piernas (player, movement, aim/action, 2 enemy types, projectile pool, checkpoint, pause, defeat, restart, mini boss, victory, desktop, touch, HUD, frozen capture).
- [ ] Bot completa la slice en ambas piernas (bot_completion = 100%).
- [ ] 0 softlocks en 30 minutos de bot en cada pierna.

## Gate 3 — Rendimiento y memoria

- [ ] cpu/gpu frame time: delta LEG_B vs LEG_A < +15% (P1) en media y p95; < +25% (P0).
- [ ] input_latency delta < +16ms.
- [ ] heap_growth 60s idle < +20%; restart_growth sin crecimiento monotónico.
- [ ] draw_calls/triangles/textures sin inflado > +20%.

## Gate 4 — Robustez y determinismo

- [ ] Device loss forzado: recuperación en < 5s con re-upload de recursos y loop reiniciado en ambas piernas.
- [ ] frozen_determinism: 100% de frames capturados idénticos con mismo seed (hash por frame).
- [ ] Pause/checkpoint/restart consistentes (estado sim no diverge del visual).
- [ ] mobile_correctness ≥ 90% (touch controls operativos, sin safe-area rotos).

## Gate 5 — Proceso y arquitectura

- [ ] LEG_B: maintenability_score + production_score ≥ 1.10 × LEG_A.
- [ ] react_commits medidos y reportados (solo LEG_B) — sin setState por entidad por frame (ver antipatrones de 08).
- [ ] El harness DevLab capturó ambas piernas con la misma configuración; evidencia de captura archivada.

## Gate 6 — WebGPU (requisito especial)

- [ ] LEG_B renderiza con WebGPURenderer real (no WebGL fallback): verificado por runtime, no por claim.
- [ ] TSL node materials ejecutan (shaders compilados OK) en LEG_B.
- [ ] Device loss WebGPU (no solo WebGL context loss) probado explícitamente en LEG_B.

## Veredicto final

- PASS: Gates 1–6 con regla de aceptación (mejora ≥10% sin regresión P0/P1).
- FAIL: cualquier P0 (device loss >5s, softlock, determinismo <100%, regresión GPU ≥25%) o fallo de Gate 6.
- INCONCLUSIVE: métricas faltantes o setup no paritario → re-run, no veredicto.

## Post-condiciones del benchmark

- Reporte de Codex con tablas pierna vs métrica y deltas %.
- Los artefactos de captura (frames, hashes) archivados en DevLab evidence.
- Si PASS: habilitar discusión de integración R3F en DevLab (nuevo sprint, fuera de este intake).
- Si FAIL: R3F queda REFERENCE_ONLY (ver 18) y el issue se documenta para upstream.
