# 09 — Contrato de checkpoints — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Heredado de core-loop-contract.md v2 (Progress, defeat and recovery) + checkpoint real (simulation.ts) + corrección 06B (floors, colas).

## CheckpointProvider — cláusulas

| Cláusula | Regla v2 | Fuente validada |
|---|---|---|
| commit | SOLO en estado permitido (Relay A activo + encuentro limpio); el banner de 3s confirma | core-loop v2 (CHECKPOINT) + sim transitionTo |
| allowed state | fase CHECKPOINT; commit único (checkpointSaves=1 por run) | sim + crítica 01B en vivo |
| forbidden transients | NADA de: enemigos, proyectiles, telegráficos, efectos, hatch requests, floors armados | core-loop v2 (checkpoint retry restores) + probes SH-06 |
| health | restore a 100 (v2; no 75) | core-loop v2 + brief v2 #5 |
| RNG | retiene la POSICIÓN ACTUAL del stream (sin rewind) | core-loop v2 (Determinism) + brief v2 (obsoleto: rewind) |
| core attached | el jugador restaura con el core | core-loop v2 |
| relay state | Relay A activo, Relay B inactivo (sin floor armado de B filtrado del intento fallido) | core-loop v2 + brief v2 #1 |
| guardian | vivo (540 HP), evacuación inactiva | core-loop v2 |
| player placement | en el marcador, mirando el puente | core-loop v2 + crítica 01B en vivo (0,-3.8) |
| pool cleanup | clear de pools en el mismo tick del restore (orden: enemigos → hostiles → transitorios) | sim restoreCheckpoint |

## RNG substreams (contrato v2)

- El checkpoint NO resetea el RNG: el flujo continúa desde donde quedó (posible en la práctica porque las waves de Relay B son deterministas por seed y posición del stream).
- Consecuencia de QA: la reproducibilidad post-restore se verifica por hash del estado (deterministicStateHash), NO por "rewind exacto" (obsoleto).
- El kit provee `rngPolicy: "retain-current-stream"` como única política soportada en v1.

## Floors y activación (interacción checkpoint ↔ floor)

- Un floor armado (≥75%) pertenece al relay PENDIENTE; el restore NO lo hereda (se recrea solo el estado contractual).
- Restart completo: floors y progreso se limpian (probe AF-05).
- El kit expone el floor como parte del estado del hold-objective; el CheckpointProvider lo excluye del restore.

## Serialización

```ts
interface CheckpointRecord {
  coreAttached: boolean;
  relays: { a: boolean; b: boolean };      // activos
  health: number;                          // 100
  rngPosition: number;                     // estado del stream (retenido)
  playerPosition: Vec2;                    // marcador
  pendingFloor: never;                     // PROHIBIDO (type-level)
  transients: never;                       // PROHIBIDO
}
```

## Gates de QA asociados

- CHECKPOINT_RESTORE (rúbrica v2): restore exacto con 0 residuos.
- Probes: AF-06 (floor no filtrado), SH-06 (cola/hatch sin residuos), adversarial AV-08.
- Determinismo: 2 capturas por estado idénticas (report del builder).
