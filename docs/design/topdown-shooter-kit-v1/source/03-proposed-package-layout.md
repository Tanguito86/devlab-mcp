# 03 — Layout propuesto del paquete — DEVLAB-TOPDOWN-SHOOTER-KIT-07

Estructura de REFERENCIA (no implementación obligatoria). Monorepo pnpm, TypeScript ESM estricto, zero-dependency runtime salvo `three` (render) en el adaptador visual.

```text
packages/topdown-shooter-kit/
├── package.json                 # name: @devlab/topdown-shooter-kit
├── tsconfig.json
├── src/
│   ├── simulation/
│   │   ├── fixed-step.ts        # SYS-02 FixedStepAccumulator (puro)
│   │   ├── random.ts            # SeededRandom (puro)
│   │   └── state-hash.ts        # deterministicStateHash (fingerprint de snapshot)
│   ├── input/
│   │   ├── input-snapshot.ts    # InputSnapshot (moveX/Z, aim, attack, activate, start, restart, pause)
│   │   ├── keyboard-adapter.ts  # SYS-04 (bindings por config)
│   │   ├── touch-adapter.ts     # SYS-05 (joystick + FIRE + ACTIVATE separados, pointer-cancel, multi-touch)
│   │   └── gamepad-stub.ts      # futuro (interfaz sin implementación obligatoria)
│   ├── combat/
│   │   ├── player-controller.ts # SYS-06/07 (movimiento + aim + cadencia; config)
│   │   └── projectile.ts        # kinds por adapter
│   ├── pooling/
│   │   ├── pool.ts              # SYS-09/10 pool genérico (capacity, active, acquire/release, highWater, dropped)
│   │   └── pool-snapshot.ts     # diagnóstico {active, capacity, highWater, dropped}
│   ├── encounters/
│   │   ├── encounter-director.ts# SYS-12/13 (fases, beats, budgets, cola acotada)
│   │   └── encounter-def.ts     # definición declarativa de encuentros
│   ├── spawning/
│   │   ├── spawn-director.ts    # SYS-14 (lifecycle HATCH_IDLE→TELEGRAPH→COMMIT→ACTIVE)
│   │   ├── hatch.ts             # estado de hatch + commit seguro (nunca en el jugador)
│   │   └── queue.ts             # cola acotada con defer/reject determinista
│   ├── checkpoints/
│   │   ├── checkpoint-provider.ts # SYS-16 (commit/restore; qué serializar por adapter)
│   │   └── checkpoint-state.ts  # snapshot proyectado
│   ├── boss-fsm/
│   │   ├── boss-state-machine.ts# SYS-19 (TELEGRAPH→COMMITTED_ATTACK→RECOVERY→VULNERABLE)
│   │   ├── boss-phase.ts        # definición de fase (patrones, budgets, transiciones)
│   │   └── boss-metrics.ts      # duración por fase, ataques, ventanas, daño en telegraph/safe-zone
│   ├── lifecycle/
│   │   ├── game-lifecycle.ts    # SYS-17/18 (start, pause, resume, restart, restore, dispose)
│   │   ├── resource-owner.ts    # SYS-25
│   │   ├── loop.ts              # SYS-01 (rAF único, con conteo de loops activos)
│   │   └── viewport.ts          # SYS-26
│   ├── gpu/
│   │   ├── device-host.ts       # SYS-24 (WebGPU fail-closed, device-loss, generaciones)
│   │   └── device-loss-tracker.ts
│   ├── audio/
│   │   ├── cue-bus.ts           # SYS-21 (cue(name, intensity), unlock, dispose, voice count)
│   │   └── cue-spec.ts          # specs por adapter
│   ├── capture/
│   │   ├── capture-state-provider.ts # SYS-22 (viewpoints, seed offsets, frozen)
│   │   ├── capture-contract.ts  # surface loopback versionada
│   │   └── frame-reader.ts      # PNG/RGBA readback (settlement)
│   ├── hud/
│   │   ├── hud-model.ts         # OverlayModel genérico (objetivo, health, boss, threat, prompt)
│   │   ├── dom-hud-adapter.ts   # espejo DOM (accesible)
│   │   └── canvas-hud.ts        # overlay determinista (mecanismo; dibujo por adapter)
│   ├── testing/
│   │   ├── autopilot.ts         # BotObjectiveAdapter + bot runner
│   │   ├── test-surface.ts      # snapshot/diagnostics/runAutopilot/stepTicks/restart/restore (loopback)
│   │   └── seed-plan.ts         # 10 seeds + gates
│   └── contracts/
│       ├── simulation-contract.ts
│       ├── input-contract.ts
│       ├── pooling-contract.ts
│       ├── encounter-contract.ts
│       ├── checkpoint-contract.ts
│       ├── boss-contract.ts
│       ├── lifecycle-contract.ts
│       └── qa-contracts.ts
├── tests/                       # unit + contract tests del kit (sin contenido del juego)
└── README.md                    # guía de consumo (primer consumidor: Ash Relay)
```

## Principios del layout

1. **Núcleo sin Three**: simulation/input/pooling/encounters/spawning/checkpoints/boss-fsm/lifecycle NO importan Three.js. El render (visuals, cámara, overlay) vive en el consumidor; el kit solo expone snapshots.
2. **Contratos como código**: `contracts/` son tipos + invariantes ejecutables (checks), no solo markdown.
3. **Adaptadores en el consumidor**: cada juego provee sus adapters (kinds, stats, bindings, textos). El kit entrega interfaces + implementaciones genéricas.
4. **Test surface genérica**: `testing/` reemplaza a `__ASH_RELAY_TEST__` con un BotObjectiveAdapter declarativo.
5. **Sin R3F**: el kit no depende de react-three-fiber. R3F es una arquitectura alternativa futura (ver 15-extension-points.md).
6. **Un solo paquete**: kit monopaquete; si un segundo juego lo confirma, se puede dividir (core/render-adapters) — no antes.

## Origen de cada archivo (mapeo a la build actual)

| Archivo del kit | Origen en Ash Relay |
|---|---|
| fixed-step.ts, random.ts, resource-owner.ts, viewport.ts | src/core/* (copy puro, sin cambios) |
| loop.ts, game-lifecycle.ts | engine.ts (extraer loop + pause/restart/dispose) |
| device-host.ts | webgpu-device.ts (copy puro) |
| input-snapshot + adapters | input.ts (desacoplar bindings) |
| pool.ts | simulation.ts pools (extraer patrón de slots) |
| boss-state-machine.ts | simulation.ts updateGuardian (REESCRITO en 06B; extraer tras validar) |
| capture-contract.ts | capture-contract.ts (copy) |
| autopilot.ts | simulation.ts AshRelayAutopilot (generalizar objetivos) |
