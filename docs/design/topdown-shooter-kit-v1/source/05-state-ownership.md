# 05 — Modelo de ownership de estado — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Quién posee qué estado, y qué pasa con cada estado en restart, checkpoint, pause y device-loss. Derivado de la build real (simulation.ts, engine.ts) y los contratos v2.

## Tabla de ownership

| Estado | Owner (hoy en Ash Relay) | Owner (kit) | Restart | Checkpoint restore | Pause | Device-loss |
|---|---|---|---|---|---|---|
| fixed-step accumulator (tiempo de sim) | FixedStepAccumulator (core) | kit: simulation/fixed-step | reset (0) | retiene posición | congela | intacto |
| RNG stream (Mulberry32, seed 424242) | SeededRandom (sim) | kit: simulation/random | reseed 424242 | **retiene posición actual (v2, sin rewind)** | congela | intacto |
| player (pos/vel/facing/health/i-frames) | sim | consumidor (via PlayerController) | reset (100 HP) | restaura (100 HP, marcador) | congela | intacto |
| nodes/relays (activation, active, unlocked, floor) | sim | consumidor | reset (off, floors clear) | solo estado contractual (A on, B off, sin floor) | congela | intacto |
| enemies (pool slots) | sim | consumidor (via EnemyLifecycle + pools) | clear | clear (0 residuos) | congela | intacto |
| projectiles/impacts/particles (pools) | sim | kit: pooling (slots) | clear | clear | congela | intacto |
| encounter phase/waves | sim | kit: EncounterDirector (defs del consumidor) | reset | estado contractual | congela | intacto |
| spawn queues + hatches | v2: 06B | kit: SpawnDirector/queue | clear | clear | congela | intacto |
| guardian (boss) | sim | consumidor (via BossStateMachine) | reset | estado contractual (vivo, 540) | congela | intacto |
| checkpoint record | sim | kit: CheckpointProvider | sin cambios (se mantiene o se limpia según contrato) | — | — | intacto |
| input state (keys, touch) | InputController (engine) | kit: input adapters | **sin rebind** (contrato) | sin rebind | edge-triggered | intacto |
| audio (context, voices) | ProceduralAudio | kit: audio cue-bus | sin duplicar (dispose/limpiar si aplica) | sin cues nuevos | sin cues nuevos | intacto (o rebuild) |
| rAF loop | engine | kit: loop | sin duplicar (1 solo loop) | sin duplicar | congela | rebuild tras recovery |
| GPU device/generation | WebGpuDeviceHost | kit: gpu/device-host | intacto | intacto | intacto | **rebuild generación +1** |
| renderer/visuals | engine/visuals | consumidor (render adapter) | intacto (re-sync) | re-sync | congela | rebuild |
| HUD/overlay model | ui/overlay | consumidor (vía hud-model) | derivado del snapshot | derivado | overlay pausa | re-sync |
| viewport plan | engine | kit: viewport | intacto | intacto | intacto | re-aplicar |

## Reglas de ownership (heredadas de los contratos v2 validados)

1. **Un solo autor**: cada estado tiene UN owner; nadie más lo muta. Los snapshots son lecturas.
2. **Restart = reset total del mundo autoritativo** (seed, pools, floors, colas, relays, HP) SIN tocar infraestructura (input/audio/rAF/resize handlers no se rebinden).
3. **Checkpoint = proyección**: el restore reconstruye SOLO el estado contractual (core, relay A, HP 100, RNG en posición actual, jugador en marcador) y prohíbe residuos transitorios (enemigos, proyectiles, telegráficos, efectos, hatch requests, floors armados).
4. **Pause = congelación global**: nada avanza (sim, pools, director, spawns, boss, audio); el resume no produce paso extra.
5. **Device-loss = separación de planos**: el GPU es infraestructura; su pérdida NO toca el estado de juego. La sim continúa; el render se reconstruye por generación (recoveryCount).
6. **Determinismo**: el estado observable es un hash (deterministicStateHash); cualquier mutación fuera de la sim (render, HUD, audio) NO altera el hash.

## Diagrama de dependencias de ownership (kit)

```text
GameLifecycle (orquesta)
 ├─ loop (rAF) ──► FixedStepAccumulator ──► TopdownSimulation.step
 │                                        ├─ PlayerController (consumidor)
 │                                        ├─ EncounterDirector (kit) ──► SpawnDirector ──► hatches/cola
 │                                        ├─ BossStateMachine (kit)
 │                                        ├─ CheckpointProvider (kit)
 │                                        └─ pools (kit)
 ├─ input adapters ──► InputSnapshot
 ├─ audio cue-bus (eventos de sim)
 ├─ gpu/device-host (planos separados)
 └─ capture (frozen, loopback)
```

## Riesgos de ownership a vigilar en la extracción

- **Fuga de transitorios al restore**: el pool de enemigos debe limpiarse en el mismo tick del restore (hoy: clearEnemies + clearHostileProjectiles + clearTransientPools — mantener ese orden).
- **Fuga de floors**: el floor de activación es por-relay; un restore no debe heredar un floor armado del intento fallido (06B).
- **Doble dueño del clock**: el engine NO debe poseer tiempo de sim; solo el FixedStepAccumulator (hoy ya es así).
- **Audio en pause**: ningún cue nuevo durante pause (contrato PAUSED) — el cue-bus filtra por estado.
