# 12 — Contratos de QA reutilizables — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Los 13 tests de QA del sprint, clasificados por nivel (UNIT / CONTRACT / BOT / BROWSER / GPU / HUMAN REVIEW) y por pertenencia (KIT = se reutiliza en todo consumidor; GAME = requiere el contenido del juego).

| # | QA Test | Criterio | Nivel | Pertenencia | Origen validado |
|---|---|---|---|---|---|
| QA-01 | TITLE_TO_VICTORY | ruta completa alcanzable sin intervención de debug | BOT + HUMAN | GAME (objetivos) + KIT (runner) | bot-playtest 10/10 + crítica 01B |
| QA-02 | SOFTLOCKS | 0 softlocks en 10 bot runs + adversariales; floors/budgets/colas en sus casos | BOT + CONTRACT | KIT (runner, window) + GAME (defs) | bot 10/10, 0 softlocks |
| QA-03 | RESTART_CLEAN | seed 424242, HP 100, relays off, activation 0, floors clear, colas vacías, pools clear | UNIT + CONTRACT | KIT (lifecycle) + GAME (estado) | restart 10/10 + 60.86Hz |
| QA-04 | CHECKPOINT_RESTORE | restore exacto: estado contractual, 0 residuos, RNG posición actual | UNIT + CONTRACT | KIT (CheckpointProvider) + GAME (proyección) | checkpoint-restore 10/10 |
| QA-05 | PAUSE_FREEZE | pause congela fixed-step y eventos; resume sin paso extra | UNIT + CONTRACT | KIT | fixed-step.test + crítica 01B |
| QA-06 | FROZEN_DETERMINISM | 2 capturas por estado bit-for-bit idénticas (10 estados) | CONTRACT + GPU | KIT (capture) + GAME (viewpoints) | simulation.test + determinism report |
| QA-07 | POOL_BOUNDS | pools preasignados; sin crecimiento; dropped contabilizado; overflow policy | UNIT + CONTRACT | KIT | scaffold test "pools preallocated" |
| QA-08 | LISTENER_DUPLICATION | inputListenerCount estable entre restarts; sin rebind | CONTRACT + BROWSER | KIT | capture metrics inputListenerCount |
| QA-09 | LOOP_DUPLICATION | activeLoopCount = 1 tras restart/pause/resume | CONTRACT + BROWSER | KIT | capture metrics activeLoopCount + 60.86Hz |
| QA-10 | AUDIO_DUPLICATION | audioVoiceCount sin huérfanas; sin cues en pause; dispose cierra | CONTRACT + BROWSER | KIT | capture metrics audioVoiceCount |
| QA-11 | RESOURCE_GROWTH | ResourceOwner LIFO idempotente; shutdown con AggregateError | UNIT | KIT | resource-owner.test |
| QA-12 | DEVICE_LOSS_RECOVERY | destroy → recovery generación +1; sim intacta; sin corrupción silenciosa | GPU + BROWSER | KIT | crítica 01B en vivo (RECOVERED) |
| QA-13 | TOUCH_MAIN_PATH | main path completable en touch; pointer-cancel; multi-touch; intención activation/pulse inequívoca | BROWSER + HUMAN | GAME (path) + KIT (adapters) | checklist móvil v2 (parcial 01B) |

## Distribución por nivel

| Nivel | Tests | Quién lo corre |
|---|---|---|
| UNIT TEST (node:test, sin browser) | QA-03, QA-05, QA-07, QA-11 | kit CI + game CI |
| CONTRACT TEST (contratos ejecutables) | QA-02 (parte), QA-04, QA-06, QA-08, QA-09, QA-10 | kit CI + game CI |
| BOT TEST (autopilot 10 seeds) | QA-01, QA-02 | game CI (runner del kit) |
| BROWSER TEST (WebGPU loopback) | QA-08, QA-09, QA-10, QA-12, QA-13 | game CI + harness DevLab |
| GPU TEST (device loss, frozen readback) | QA-06, QA-12 | harness DevLab (GPU real) |
| HUMAN REVIEW | QA-01 (timing humano), QA-13 (touch real) | crítico independiente (01C) |

## Reglas de pertenencia

- **Al KIT**: runner del bot (10 seeds, softlock window, gates), fixed-step/random/pool/lifecycle tests, capture determinism, device-loss, listener/loop/audio duplication (el kit expone las métricas; el test de no-duplicación es genérico).
- **Al JUEGO consumidor**: objetivos del bot (BotObjectiveAdapter), defs de encuentros/boss, proyección de checkpoint, viewpoints de captura, recorrido humano, timing humano.
- NO mover todos los tests al núcleo: el kit testea MECANISMOS; el juego testea CONTENIDO. Un test de contenido en el kit = acoplamiento (prohibido).

## Plantillas del kit (tests reutilizables)

1. `fixed-step.test.ts` → copy (puro).
2. `random.test.ts` → copy (puro).
3. `resource-owner.test.ts` → copy (puro).
4. `viewport.test.ts` → copy (puro).
5. `pool-bounds.test.ts` → nuevo (genérico sobre Pool<T>).
6. `lifecycle.test.ts` → nuevo (restart/pause/resume/restore/dispose + no-duplicación).
7. `capture-determinism.test.ts` → del simulation.test (generalizado: N estados → 2 capturas idénticas).
8. `bot-runner.test.ts` → del bot-playtest.ts (runner genérico; objetivos por adapter).
9. `device-loss.test.ts` → del scaffold/crítica (destroy → recoveryCount+1, sim hash intacto).

## Gates del consumidor (Ash Relay, rúbrica v2)

Los 8 gates funcionales de gameplay-rubric-v2.md se evalúan con estas QA + probes del paquete crítico v2. La crítica 01C los ejecuta sobre la build corregida.
