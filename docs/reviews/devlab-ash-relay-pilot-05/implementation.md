# ASH RELAY implementation

## Product artifact

The single materialized game is located at:

```text
H:/UserData/Deposito/Documents/devlab-runs/ash-relay-pilot-05/game
```

It began as the one canonical materialization of
`devlab-internal-threejs-game-benchmark-v1`. The materialized application was
then developed in place; no upstream scaffold, generator, asset, or executable
from `threejs-game-skills` was copied or run.

All presentation assets are local and procedural. No Galaxy Raiders,
Hellbullet, or other product names, code, or assets are present in the game.

## Read-only textual guidance consumed

The pilot used selected texts from the verified 25-file allowlist as open
planning/review guidance, never as a blinded treatment and never by executing
their commands or scripts:

| Allowlisted text | Applied purpose |
| --- | --- |
| `skills/threejs-game-director/SKILL.md` and `skills/threejs-game-director/references/phase-playbook.md` | phase boundaries and evidence discipline |
| `skills/threejs-gameplay-systems/SKILL.md`, `skills/threejs-gameplay-systems/references/gameplay-workflows.md`, `skills/threejs-gameplay-systems/references/game-design-level-design.md`, and `skills/threejs-gameplay-systems/references/game-feel.md` | core loop, encounters, feedback, and completeness |
| `skills/threejs-aaa-graphics-builder/references/visual-scorecard.md` and `skills/threejs-aaa-graphics-builder/references/technical-art.md` | full-set visual criticism and budgets |
| `skills/threejs-game-ui-designer/references/ui-patterns.md` and `skills/threejs-game-ui-designer/references/checklists/mobile-input.md` | stateful HUD and portrait input review |
| `skills/threejs-debug-profiler/references/checklists/performance-profile.md` | six-state performance matrix |
| `skills/threejs-qa-release/SKILL.md`, `skills/threejs-qa-release/references/playtest-bot.md`, and `skills/threejs-qa-release/references/visual-test-harness.md` | bot reachability, softlocks, and frozen regression |

The canonical source pin is
`7221c1f4a6d2ae189a4d85d058d24f3228499d46`. The remaining allowlisted files
were verified for integrity but are not claimed as consumed.

## Runtime structure

| Area | Implementation |
| --- | --- |
| bootstrap and protected hooks | `src/main.ts` |
| engine loop, capture, rebuild, input mapping | `src/engine.ts` |
| fixed-step clock | `src/core/fixed-step.ts` |
| seeded RNG | `src/core/random.ts` |
| ownership stack | `src/core/resource-owner.ts` |
| deterministic gameplay and pools | `src/game/simulation.ts` |
| desktop and touch input | `src/game/input.ts` |
| procedural Web Audio | `src/game/audio.ts` |
| DOM UI and accessibility | `src/game/ui.ts` |
| WebGPU world and TSL effects | `src/game/visuals.ts` |
| capture-visible HUD overlay | `src/game/overlay.ts` |
| native adapter/device ownership | `src/game/webgpu-device.ts` |

The application uses one `WebGPURenderer` canvas. The CPU simulation owns the
authoritative mission state independently of the renderer so that a device-loss
rebuild can replace the adapter, device, renderer, scene resources, resize
target, and capture overlay without resetting progress.

## Gameplay delivered

The playable route is:

```text
TITLE -> TUTORIAL -> ACTIVATE NODE 01 -> HARRIER/WARD AMBUSH
      -> CHECKPOINT -> ACTIVATE NODE 02 -> MIXED SURVIVAL
      -> RELAY GUARDIAN PHASE 1 -> PHASE 2 -> EVACUATION -> VICTORY
```

The player transports a visible cyan core, moves with acceleration and damping,
aims a directional relay weapon, takes damage with a brief invulnerability
window, and receives flash, particle, shake, and procedural-audio feedback.
Harriers are small continuous-pursuit units with a lateral weave. Wards are
heavy mobile ranged units with an orange aperture telegraph. The Relay Guardian changes attack vocabulary and
presentation between two phases; phase two adds area pressure and secondary
enemies instead of relying only on health.

Defeat, clean restart, checkpoint restore, pause/resume, evacuation, and
victory are explicit states. Desktop uses keyboard plus pointer aim. Portrait
uses a movement pad and an auto-aim FIRE control, with the same FIRE control
also serving node and extraction activation while inside the marked zone.

## Deterministic and resource contracts

- simulation step: `1/60` second;
- maximum catch-up: eight fixed steps;
- rendering: interpolation between previous and current positions;
- default seed: `424242`, using a local seeded generator;
- runtime `Math.random`: zero calls;
- frozen capture: simulation loop stopped while render remains callable;
- frozen readback: decoded warm-up, identical submissions, GPU queue fence, and
  final byte read while seed/time/viewpoint remain unchanged;
- enemy pool: 24;
- projectile pool: 96;
- impact pool: 48;
- frequent-particle pool: 192;
- per-shot geometry/material allocation: none;
- renderer backend: native WebGPU or initialization fails closed;
- TSL: animated node/core/conduit and danger-pulse presentation;
- network dependencies and remote assets: none.

Guardian health floors are explicit survival mechanics rather than hidden
damage suppression. Phase 1 locks armor at 50% until 20 seconds; phase 2 locks
at 10% until 25 seconds. During each window simulation, HUD, prompt, and
capture overlay expose the remaining lock time.

The loopback-only test surfaces provide the ten required frozen recipes,
autopilot diagnostics, and destructive device-loss hooks. They are not exposed
when the built application is served from a non-loopback hostname.

## Build boundary

`dist/`, `node_modules/`, browser profiles, raw RGBA frames, and other heavy
runtime evidence remain outside Git. The DevLab worktree versions this review
record and its reproducible validation runner; the product source stays in the
explicit run root required by the sprint.
