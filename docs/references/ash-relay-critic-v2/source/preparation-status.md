# Preparation Status — OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C

## Estado

```text
OPS-ASH-RELAY-GAMEPLAY-CRITIC-01C:
PREPARED / WAITING_FOR_CORRECTION_BUILD

CONTRACT_V2:
SYNCED (core-loop-contract v2 + encounter-plan v2 + rubric v2 + brief v2, leídos 2026-08-04)

STALE_VALUES:
0 operativos (todos marcados en sección histórica del ledger y de la rúbrica v2)

CODE_CHANGES:
0

BROWSER/GPU:
0 (prohibidos hasta CORRECTION_BUILD_READY_FOR_REVIEW)
```

## Baseline

- Fecha/hora: 2026-08-04 (post-01B).
- Contratos v2 leídos (read-only):
  - `devlab-mcp/docs/reviews/devlab-ash-relay-pilot-05/core-loop-contract.md` (v2, 162 líneas)
  - `devlab-mcp/docs/reviews/devlab-ash-relay-pilot-05/encounter-plan.md` (v2, 191 líneas)
  - `devlab-mcp/docs/reviews/devlab-ash-relay-gameplay-correction-06a/gameplay-rubric-v2.md` (106 líneas)
  - `devlab-mcp/docs/reviews/devlab-ash-relay-gameplay-correction-06a/codex-correction-brief-v2.md` (73 líneas)
- Paquete v1 (`ash-relay-critic/`): marcado como histórico (cabeceras SUPERSEDED en los archivos con valores stale: gameplay-rubric.md, encounter-matrix.md, boss-review.md, bot-run-contract.json, codex-handoff.md, final-status.md). El score 70/100 de 01B NO es comparable con la rúbrica v2.
- DevLab master baseline declarado en el sprint: `9ef8b08bd8a643fc74776a5ce56814d47c4efe9d`.
- Build: NO se tocó (Codex implementando 06B). BROWSER/GPU: 0.

## Entregables de preparación (12/12)

`external-evidence:/ash-relay-critic-v2\`:
1. contract-v2-ledger.md ✓ — ledger completo (A. progresión, B. activación, C. encounter-1, D. spawns/hatches, E. boss FSM, F. checkpoint/restart/pausa, G. timing/móvil, H. feedback) + sección histórica de stale values
2. gameplay-rubric-v2-execution.md ✓ — 8 gates v2 + pesos/anclas + veredicto v2 (PASS / GAMEPLAY_ACCEPTED_POLISH_PENDING / FAIL)
3. activation-floor-probes.json ✓ — 7 probes (AF-01…AF-07) + gates LAST_QUARTER_FLOOR y DUPLICATE_COMPLETE_EVENTS
4. encounter-1-probes.json ✓ — 7 probes (E1-01…E1-07) onboarding/response/A<B
5. boss-fsm-probes.json ✓ — 10 probes (BF-01…BF-10) FSM + 5 gates (BOSS_HP 540, VULNERABILITY_CAUSED_BY_ATTACK, CLOSED_RADIAL_RING 0, PERMANENT_INVULNERABILITY 0, DOUBLE_PHASE_TRANSITION 0)
6. spawn-hatch-probes.json ✓ — 8 probes (SH-01…SH-08) lifecycle + budgets + pool 24 ≠ cap
7. timing-contract-v2.json ✓ — segmentos v2 + BOT/HUMAN_DESKTOP/HUMAN_MOBILE separados
8. adversarial-plan-v2.md ✓ — 15 casos × 3 = 45/45 esperado
9. mobile-checklist-v2.md ✓ — checklist táctil v2 (412×915 y 390×844, intención inequívoca)
10. evidence-schema-v2.json ✓ — entregables de Codex + verificación de hashes + esquema hallazgos v2
11. codex-handoff-v2.md ✓ — brief para Codex con puntos de vigilancia
12. preparation-status.md ✓ — este archivo

## Valores canónicos v2 (operativos)

PLAYER_SPEED 8.5 · CHECKPOINT_HEALTH 100 · BOSS_HEALTH 540 (provisional vs duración) · POOL_CAPACITY 24 (storage) · RELAY_FLOOR 75% · ENCOUNTER_1: 2 Scrappers antes de Node 01 · SPAWNS: budgets locales + hatches (≥0.65s, 2 canales) · BOSS: FSM ligada a ataques comprometidos · budgets A 2/2+2/2, B 5/5, P2 2 activos/3 requests · sin cap global 6 · RNG: restore retiene posición actual.

## Gate de arranque de la ejecución

```text
CORRECTION_BUILD_READY_FOR_REVIEW (declarado por Codex) + 12 entregables del evidence-schema-v2.json
+ hash del tree/build verificado
→ Hermes ejecuta: 1 victoria desktop humana, 1 victoria móvil humana, 10 bot runs,
  45 adversariales, derrotas pre/post checkpoint, restore, restart durante hatch,
  device loss por fase del boss, rúbrica v2 + gates v2, hallazgos P0-P3
  → final-execution-status-v2.md
```

## Cierre esperado

```text
Ideal:    P0 0 · P1 0 · gates 8/8 · score ≥ 80 → PASS
Aceptable: P0 0 · P1 0 · score 75-79.9 → GAMEPLAY_ACCEPTED / VISUAL_POLISH_PENDING
FAIL:     gate roto, P0/P1 presente o score < 75
```
