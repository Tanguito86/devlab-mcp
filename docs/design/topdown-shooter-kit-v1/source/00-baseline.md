# 00 — Baseline — OPS-DEVLAB-TOPDOWN-SHOOTER-KIT-DESIGN-01

Fecha: 2026-08-04 · Rol: diseño arquitectónico read-only · CODE_CHANGES: 0 · DEVLAB_CHANGES: 0 · GAME_CHANGES: 0 · BROWSER/GPU: NO

## Estado verificado al iniciar

| Ítem | Valor verificado |
|---|---|
| DevLab master | `3a7ab2d769bc5692d8a047d417d866b2bc75e7c3` (porcelain limpio) |
| Worktrees | ab04-contract @787748c · reconciliation-06a @3a7ab2d · **gameplay-correction-06b @3a7ab2d** (sin integrar; worktree limpio) · pilot-05 @9ef8b08 |
| devlab-runs | ash-relay-pilot-05/ (build 01B evaluada) · ash-relay-gameplay-correction-06b/ (vacío/en preparación) |
| Build de referencia | `devlab-runs/ash-relay-pilot-05/game` (vite dev del builder, seed 424242) — solo lectura |
| Contratos v2 leídos | core-loop-contract.md v2 · encounter-plan.md v2 · gameplay-rubric-v2.md · codex-correction-brief-v2.md (devlab-mcp/docs/reviews) |
| Paquete crítico v2 | `ash-relay-critic-v2/` (PREPARED / WAITING_FOR_CORRECTION_BUILD) |
| Paquete crítico v1 | `ash-relay-critic/` (histórico, SUPERSEDED) |

## Fuentes de código inspeccionadas (todas read-only)

- `game/src/core/`: fixed-step.ts (124 L), random.ts (31 L), resource-owner.ts (38 L), viewport.ts (23 L)
- `game/src/game/`: simulation.ts (1798 L), engine.ts (744 L), input.ts (187 L), audio.ts (102 L), ui.ts (186 L), overlay.ts (473 L), visuals.ts (957 L), webgpu-device.ts (112 L)
- `game/src/`: main.ts (44 L), capture-contract.ts (114 L)
- `game/scripts/bot-playtest.ts` (296 L) · `game/tests/` (6 suites, 25 tests, 25/25 PASS)
- Resultados de ejecución 01B (evidencia runtime del crítico): bot 10/10, 0 softlocks, restart/checkpoint verificados en vivo

## Prioridad de sprint

```text
1. OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C — PRIORIDAD ABSOLUTA
   Si Codex declara CORRECTION_BUILD_READY_FOR_REVIEW:
   suspender este sprint, preservar documentos parciales,
   ejecutar 01C, reanudar este diseño después del veredicto.
2. OPS-DEVLAB-TOPDOWN-SHOOTER-KIT-DESIGN-01 (este sprint)
```

## Cambio de baseline esperado (sin acción)

Si Codex integra 06B durante este sprint, se registra el nuevo baseline en `17-final-status.md` (sección "cambio de baseline observado") pero NO se relee código nuevo hasta finalizar o suspender este análisis.

## Rutas protegidas (verificadas, sin escrituras)

`devlab-mcp` · `devlab-runs/ash-relay-pilot-05` · `devlab-runs/ash-relay-gameplay-correction-06b` · `ash-relay-critic` · `ash-relay-critic-v2` · `GalaxyRaidersPixelGMS` · `game-visual-forge` · `Hellbullet`

Única ruta de escritura: `external-evidence:/devlab-topdown-shooter-kit-design\` (este paquete).
