# 13 — Plan de migración incremental — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Migración de BAJO RIESGO: copiar contratos/tests primero, extraer runtime por capas, adaptar Ash Relay como primer consumidor, y validar byte-equivalencia de los estados congelados. SIN reescritura total (FULL_REWRITE_REQUIRED: NO).

## Paso 1 — Copiar contratos y tests (sin mover runtime)

| Campo | Valor |
|---|---|
| FILES AFFECTED | kit: contracts/*, tests/* (copies de fixed-step/random/resource-owner/viewport tests) — 0 archivos del juego tocados |
| EXPECTED DIFF | kit nuevo (add-only); game: 0 |
| ROLLBACK | borrar el paquete del kit (nada más depende de él) |
| TEST GATE | kit tests verdes + game tests verdes (25/25) + bot 10/10 sin cambios |
| RISK | NULO |

## Paso 2 — Extraer fixed timestep + input

| Campo | Valor |
|---|---|
| FILES AFFECTED | kit: simulation/fixed-step.ts, simulation/random.ts, input/*; game: src/core/* pasa a importar del kit (o copy-sync) |
| EXPECTED DIFF | game: imports + deleciones de src/core; comportamiento idéntico |
| ROLLBACK | revert imports (los archivos del juego se mantienen como copia local hasta paso 6) |
| TEST GATE | fixed-step/random tests del kit + game 25/25 + determinismo bit-for-bit |
| RISK | BAJO (módulos puros, cero acoplamiento) |

## Paso 3 — Extraer pooling + lifecycle

| Campo | Valor |
|---|---|
| FILES AFFECTED | kit: pooling/pool.ts, lifecycle/*; game: simulation.ts pools → Pool<T>, engine loop/pause/restart/dispose → GameLifecycle |
| EXPECTED DIFF | game: reemplazo de slots manuales por Pool<T> (mismo contrato de datos); engine: delegación a GameLifecycle |
| ROLLBACK | revert del commit de extracción |
| TEST GATE | pool-bounds + lifecycle tests + bot 10/10 + no-duplicación (listeners/loops/audio) |
| RISK | MEDIO-BAJO (el patrón de slots ya es idéntico; riesgo de tocar el hot path del render → mitigar con determinismo por hash) |

## Paso 4 — Extraer encounter/spawn/checkpoint

| Campo | Valor |
|---|---|
| FILES AFFECTED | kit: encounters/, spawning/, checkpoints/; game: updatePhaseLogic → EncounterDirector + defs; spawns → SpawnDirector + hatches; checkpoint → CheckpointProvider |
| EXPECTED DIFF | game: la lógica de fases se vuelve declarativa (defs); el comportamiento v2 (budgets, colas, hatches) YA debe estar en 06B — este paso lo mueve, no lo reinventa |
| ROLLBACK | revert; las defs del juego quedan como datos |
| TEST GATE | encounter/spawn/checkpoint contract tests + probes v2 (SH-*, E1-*, AF-*) + bot 10/10 |
| RISK | MEDIO (es la lógica más acoplada; SOLO tras validar 06B + crítica 01C) |

## Paso 5 — Extraer boss FSM

| Campo | Valor |
|---|---|
| FILES AFFECTED | kit: boss-fsm/; game: updateGuardian → BossStateMachine + patrones por def |
| EXPECTED DIFF | game: la IA del Custodian se convierte en defs (sweep/fan/directed) sobre el framework del kit |
| ROLLBACK | revert |
| TEST GATE | boss-fsm contract tests + probes BF-* + boss gates v2 (540, causalidad, gaps, sin locks) |
| RISK | MEDIO (solo tras 06B; el framework se extrae, los patrones quedan en el juego) |

## Paso 6 — Adaptar Ash Relay como primer consumidor

| Campo | Valor |
|---|---|
| FILES AFFECTED | game: imports del kit; adapters (kinds, stats, bindings, hud, bot objectives); borrado de código movido |
| EXPECTED DIFF | game: -X L de mecánica movida, +Y L de adapters/defs; el kit queda como única fuente de mecanismos |
| ROLLBACK | el juego sigue siendo autónomo si el kit se congela (defs + adapters en el repo del juego) |
| TEST GATE | suite completa del juego (25+ tests) + bot + capturas + crítica |
| RISK | MEDIO (es el momento de mayor diff; se hace DESPUÉS de 01C, con la build ya validada) |

## Paso 7 — Validar byte-equivalencia en estados congelados

| Campo | Valor |
|---|---|
| FILES AFFECTED | ninguno (validación) |
| EXPECTED DIFF | 0 — los 10 estados frozen del contrato deben dar capturas bit-for-bit idénticas ANTES y DESPUÉS de la migración (mismo seed/time/viewpoint) |
| ROLLBACK | n/a (validación) |
| TEST GATE | QA-06 FROZEN_DETERMINISM: hash idéntico + PNG idéntico por estado (pre-migración vs post-migración) |
| RISK | el gate final; si falla, el paso culpable se revierte individualmente |

## Orden de ejecución sugerido

```text
06B + crítica 01C (validación del contrato v2) ──► Pasos 1-2 (inmediatos, riesgo nulo)
──► Paso 3 ──► (validar con bot) ──► Pasos 4-5 (solo con v2 validado) ──► Paso 6 ──► Paso 7
```

## Reglas del plan

1. Cada paso es un commit atómico con su test gate; si el gate falla → rollback del paso, no parchear encima.
2. El juego NUNCA queda roto entre pasos (cada paso termina con suite verde).
3. Determinismo por hash en cada paso (QA-06) — el hash del snapshot no debe cambiar al extraer mecanismos.
4. No reescribir lógica al moverla: primero validar (06B/01C), después mover.
5. FULL_REWRITE_REQUIRED: NO. ASH_RELAY_COUPLING_PRESERVED: NO (la extracción desacopla por diseño; el juego queda como consumidor).
