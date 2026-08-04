# 17 — Final Status — OPS-DEVLAB-TOPDOWN-SHOOTER-KIT-DESIGN-01

## Estado

```text
OPS-DEVLAB-TOPDOWN-SHOOTER-KIT-DESIGN-01:
COMPLETED / KIT_07_DESIGN_READY

IMPLEMENTATION: NOT_STARTED
DEVLAB_CHANGES: 0
GAME_CHANGES: 0
CODE_CHANGES: 0
BROWSER/GPU: 0
```

## Gates

```text
SOURCE_READ_ONLY: PASS
DEVLAB_CHANGES: 0 · GAME_CHANGES: 0 · CODE_CHANGES: 0

RUNTIME_INVENTORY: COMPLETE (26 sistemas, 22 implementados confirmados + 4 PENDING_06B)
GENERIC_SPECIFIC_MATRIX: COMPLETE (GENERIC_CORE 8 · GENERIC_WITH_ADAPTER 13 · SPECIFIC 12 · DO_NOT_EXTRACT 7)
OWNERSHIP_MODEL: COMPLETE (un autor por estado; restart/checkpoint/pause/device-loss por estado)
PUBLIC_API_DRAFT: COMPLETE (12 interfaces con responsabilidad/inputs/outputs/ownership/serialization/pause/restart/device-loss/hooks)

SIMULATION_CONTRACT: READY · INPUT_CONTRACT: READY · POOLING_CONTRACT: READY
ENCOUNTER_CONTRACT: READY · CHECKPOINT_CONTRACT: READY · BOSS_FSM_CONTRACT: READY
LIFECYCLE_CONTRACT: READY · QA_CONTRACTS: READY (13 tests, 6 niveles)

MIGRATION_PLAN: INCREMENTAL (7 pasos, cada uno con diff/rollback/test gate/riesgo)
FULL_REWRITE_REQUIRED: NO
ASH_RELAY_COUPLING_PRESERVED: NO (el desacople es el objetivo; Ash Relay pasa a consumidor)
CODEX_BRIEF: READY (16-codex-kit-07-brief.md)
```

## Decisión de extracción (Fase 9) — resumen

| Decisión | Sistemas |
|---|---|
| EXTRACT_NOW (tras 01C, riesgo nulo/bajo) | fixed-step, random, resource-owner, viewport, loop, pause/resume, restart, device-host, cue-bus, capture contract |
| EXTRACT_AFTER_06B (validar primero) | encounter director, spawn director/hatches, colas, hold-objective con floor, checkpoint provider, boss FSM framework, input touch con intención separada, bot runner |
| KEEP_IN_GAME | kinds de enemigos, stats, patrones del boss, mapa, textos, paleta, audio specs, budgets, viewpoints |
| REWRITE_BEFORE_EXTRACTION | updateGuardian (ciclo temporal → FSM v2), updateNodeActivation (sin floor → floor 75%), touch fusionado (→ intención inequívoca), waves por timeout (→ colas/hatches) |
| REJECT | spawns en coordenadas crudas, `__ASH_RELAY_TEST__` específica, constants duplicadas, CaptureOverlay dibujo (mecanismo sí, dibujo no) |

Criterio aplicado (5/5): validación de Ash Relay ✓ (post-06B) · contrato observable ✓ · sin contenido del juego ✓ · testeable independiente ✓ · determinismo y lifecycle conservados ✓.

## Cambio de baseline observado

- Inicio: master `3a7ab2d769bc5692d8a047d417d866b2bc75e7c3`, worktree 06b en 3a7ab2d, porcelain limpio. Sin cambios observados durante este sprint. (Si Codex integra 06B, registrar aquí y NO releer código nuevo hasta la reanudación.)

## Prioridad vigente

```text
1. OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C — PRIORIDAD ABSOLUTA
   (si CORRECTION_BUILD_READY_FOR_REVIEW: suspender este diseño, ejecutar 01C, reanudar después)
2. DEVLAB-TOPDOWN-SHOOTER-KIT-07 — NO implementar sin autorización
```

## NEXT

```text
esperar cierre de 06B + crítica 01C
→ ajustar este diseño con los hallazgos finales (si el contrato v2 cambió)
→ autorizar DEVLAB-TOPDOWN-SHOOTER-KIT-07 con el brief 16
```

## Entregables (18/18)

`external-evidence:/devlab-topdown-shooter-kit-design\`:
00-baseline.md · 01-runtime-inventory.json · 02-generic-vs-specific-matrix.md · 03-proposed-package-layout.md · 04-public-api-contracts.md · 05-state-ownership.md · 06-simulation-and-input-contract.md · 07-pooling-contract.md · 08-encounter-spawn-contract.md · 09-checkpoint-contract.md · 10-boss-fsm-contract.md · 11-lifecycle-device-loss-contract.md · 12-qa-contracts.md · 13-migration-plan.md · 14-risk-register.md · 15-extension-points.md · 16-codex-kit-07-brief.md · 17-final-status.md · artifact-hashes.sha256
