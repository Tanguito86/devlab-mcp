# 20 — Prompt del benchmark DEVLAB-R3F-ARCHITECTURE-AB-05

> Estado: DISEÑADO / NO EJECUTADO (OPS-R3F-INTAKE-01). La ejecución queda reservada a Codex con autorización explícita. Este documento es el prompt reproducible que se le entrega.

---

## Prompt (reproducible)

```text
SPRINT: DEVLAB-R3F-ARCHITECTURE-AB-05
STATUS: AUTHORIZED / READY_TO_START
AGENTE: Codex CLI
TIPO: Benchmark arquitectónico A/B, ejecución real (browser + GPU autorizados)

OBJETIVO
Construir la vertical slice "EMBER CIRCUIT" DOS veces, una por pierna, sin
compartir código entre ellas, y medir producción, arquitectura, runtime,
memoria, robustez y jugabilidad. Veredicto según regla de aceptación.

PIERNAS
- LEG_A: Vanilla Three.js + WebGPURenderer + TSL + DevLab harness
- LEG_B: React 19.2.0 + @react-three/fiber@9.7.0 + WebGPURenderer + TSL + DevLab harness

IGUALDAD OBLIGATORIA
- mismo gameplay contract, mismo arte, mismos shaders, mismo audio, mismo seed
- mismo navegador, misma RTX 2060, mismo backend, mismos viewports
- mismo modelo y configuración de agente, mismo esfuerzo/tiempo/ciclos
- mismo evaluador humano para maintainability y gameplay
- NO reutilizar código entre piernas después del inicio

SLICE: EMBER CIRCUIT
- 3D arcade arena, 2-3 minutos, player + movement + aim/action
- dos tipos de enemigo, projectile pool, checkpoint, pause, defeat, restart
- mini boss, victory, desktop + touch controls, HUD, frozen capture states
- NO usar ASH RELAY (mantener independencia de benchmarks previos)

MÉTRICAS (registrar todas)
- producción: time to first playable, tiempo total, archivos, LOC, componentes
- arquitectura: complejidad del scene graph, commits React (solo LEG_B),
  maintainability score humano (1-10)
- runtime: CPU frame time, GPU frame time, p95/p99, draw calls, triangles,
  textures, input latency
- memoria: heap growth (idle 60s), restart growth (10 restarts)
- robustez: device-loss recovery (forzar pérdida y verificar re-upload),
  softlocks, bot completion (bot scripted juega la slice), mobile correctness
  (viewport táctil emulado), frozen determinism (captura congelada en N frames
  idénticos con mismo seed)
- humano: gameplay score (1-10)

REGLAS DE CAPTURA (DevLab)
- determinismo congelado: mismo seed → frames idénticos (hash por frame)
- usar el harness de captura de DevLab en ambas piernas, misma configuración
- sin optimizaciones manuales post-hoc: registrar el estado "as-built"

REPORTE
- tables pierna vs métrica, delta %, P0/P1 checklist por dominio
- veredicto: PASS si LEG_B mejora arquitectura/proceso >=10% sin regresión
  P0/P1 en gameplay, frame pacing, memoria, input, WebGPU, device loss,
  mobile o determinismo congelado; FAIL en caso contrario

NO HACER
- no modificar DevLab fuera del harness de captura
- no mezclar código entre piernas
- no declarar R3F_WEBGPU_RUNTIME_VERIFIED fuera de este benchmark con
  evidencia de runtime (device loss incluido)
```

## Notas de ejecución para Codex

1. El pin de referencia para LEG_B es `@react-three/fiber@9.7.0` publicado (npm) — **no** el checkout del monorepo (ver 06-install-and-script-review: el paquete publicado no ejecuta lifecycle scripts).
2. Three.js: `three@0.172.x` (misma versión en ambas piernas).
3. El harness DevLab debe tratar a ambas piernas como cajas negras de render: captura por `requestAnimationFrame`/`setAnimationLoop` con timestamp fijo.
4. Reportar por separado: tiempo de implementación humano-vs-agente si aplica, y el delta de LOC normalizado por features.
5. El evaluador humano es el mismo (José) para maintainability y gameplay.
