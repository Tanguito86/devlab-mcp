# 16 — Brief para Codex — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Para: Codex (futuro DEVLAB-TOPDOWN-SHOOTER-KIT-07)
De: Hermes (OPS-DEVLAB-TOPDOWN-SHOOTER-KIT-DESIGN-01)
Estado del diseño: KIT_07_DESIGN_READY (implementación NO autorizada todavía)

## Qué construir

Un paquete monorepo `packages/topdown-shooter-kit` (TypeScript ESM, pnpm) con los mecanismos genéricos extraídos de Ash Relay. Ver `03-proposed-package-layout.md` y `04-public-api-contracts.md` (interfaces de referencia).

## Orden de implementación (alineado con 13-migration-plan.md)

1. **Contratos + tests** (copy de core/* puro + tests): fixed-step, random, resource-owner, viewport.
2. **Simulación e input**: FixedStepAccumulator, SeededRandom, InputSnapshot, adapters keyboard/touch (con ACTIVATE separado de FIRE — intención inequívoca).
3. **Pooling + lifecycle**: Pool<T> (capacity/active/highWater/dropped, overflow policy), GameLifecycle (start/pause/resume/restart/restore/dispose, no-duplicación), loop único, viewport.
4. **Encounters/spawning/checkpoints**: EncounterDirector (defs declarativas, budgets, cola acotada), SpawnDirector (HATCH_IDLE→TELEGRAPH→COMMIT→ACTIVE, ≥0.65s, 2 canales, commit seguro), CheckpointProvider (restore exacto, RNG posición actual, floors prohibidos en restore).
5. **Boss FSM**: BossStateMachine (INTRO→TELEGRAPH→COMMITTED_ATTACK→RECOVERY→VULNERABLE→TRANSITION→DEFEATED, causalidad de vulnerabilidad, sin locks por tiempo) + BossMetrics.
6. **GPU/capture/audio/testing**: device-host (fail-closed, device-loss, generaciones), CaptureStateProvider (frozen loopback, frame-reader), cue-bus, autopilot runner + test surface.

## Reglas de hierro

1. **Núcleo sin Three.js** (snapshots numéricos; render en el consumidor).
2. **Sin Math.random** en runtime; todo por SeededRandom inyectado.
3. **Pool ≠ presión**: sin cap global; budgets por encuentro en las defs del consumidor.
4. **Sin contenido**: ningún nombre de enemigo, valor de balance, texto, color, mapa o audio concreto en el kit (solo en adapters del consumidor).
5. **Determinismo**: cada mecanismo expone hash/estado observable; los tests de no-duplicación (listeners/loops/audio) son parte del kit.
6. **Captura y device-loss**: contrato de captura loopback + recovery por generación sin tocar sim.
7. **Sin R3F, sin IMG2THREEJS, sin GVF, sin splats** en este sprint (sockets definidos, no dependencias).

## Límites explícitos del kit (qué NO debe entrar)

```text
arte · modelos · shaders específicos · historia · mapas · balance ·
nombres de enemigos · misiones · HUD final · audio concreto
```

DevLab provee infraestructura; no se convierte en un juego disfrazado de framework.

## Gates de QA del kit (12-qa-contracts.md)

UNIT: fixed-step, random, resource-owner, viewport, pool-bounds, lifecycle · CONTRACT: restart-clean, checkpoint-restore, pause-freeze, frozen-determinism, listener/loop/audio-duplication · BOT: runner con BotObjectiveAdapter de ejemplo (nunca objetivos de Ash Relay) · BROWSER/GPU: device-loss, capture determinism.

## Condiciones de arranque

- **NO implementar** hasta: cierre de 06B + crítica 01C + autorización explícita del usuario (NEXT del sprint).
- Si el contrato v2 cambia con los hallazgos de 01C, ajustar defs/contratos del diseño antes de codificar.
- Primer consumidor obligatorio: Ash Relay (paso 6 de la migración) — el kit no se publica sin un consumidor real.

## Entregables del brief

- Paquete del kit + tests + README de consumo.
- Adaptadores de Ash Relay como primer consumidor (kinds, stats, bindings, hud, bot objectives).
- Validación: suite del juego verde + bot 10/10 + capturas byte-equivalentes pre/post migración (QA-06).
