# ASH RELAY design brief

## Product statement

**ASH RELAY** is a 3-5 minute elevated-view 3D arcade-action slice set in an
abandoned relay station on an ash-covered moon. The player carries a volatile
energy core through two relay yards, powers both nodes, survives escalating
machine attacks, defeats the station's final guardian and evacuates through a
newly energized lift.

The core is simultaneously the mission object, the source of the player's
primary weapon and the visual anchor for progression. The experience should be
understandable within seconds, restart cleanly, and remain readable on both a
1280x720 desktop viewport and a 390x844 touch viewport.

This brief records the implemented product direction. Runtime acceptance is
claimed only in the validation and critic documents, not by this brief alone.

## Player promise

The player should feel like a fast salvage courier forcing a dead industrial
site back to life under pressure. Every successful relay activation visibly
changes the station: dark rails illuminate cyan, orange warning systems wake,
and the evacuation route becomes clearer. Combat is compact and responsive,
with deliberate telegraphs rather than visual noise.

## Design pillars

1. **Carry the power.** The floating core stays visibly tethered to the player,
   drives the pulse weapon and plugs into each relay without becoming an
   inventory abstraction.
2. **Read, aim, react.** Enemy roles are separated by silhouette and behavior:
   close-range pursuit versus ranged lane denial. Harrier proximity and
   silhouette communicate contact pressure; ranged and Guardian attacks expose
   shape, direction, and timing cues.
3. **Wake the station.** Progress from zero to two relays is visible in the
   world, HUD, lighting and audio, culminating in the guardian and extraction.
4. **Lose quickly, recover cleanly.** Defeat offers an exact checkpoint retry
   and a true mission restart. Pause, resize and repeated restarts cannot leave
   simulation or resource state behind.

## Presentation

### Camera and space

- Elevated three-quarter perspective with no manual camera control.
- Camera follows through bounded rooms and eases to frame the active relay or
  guardian without changing the player's input frame.
- Combat occurs on broad, readable floors with low cover and waist-height
  machinery; no foreground object may hide the player for more than a moment.
- Portrait framing narrows the visible route and shifts HUD/touch controls, but
  does not alter simulation rules, enemy counts or attack timings.

### Visual direction

All forms are original and built from local procedural geometry: plated floors,
hexagonal relay collars, conduit ribs, gantries, maintenance chassis and a
compact rail-mounted guardian. No borrowed game code or assets are part of the
direction.

| Function | Direction |
| --- | --- |
| World base | charcoal ash, near-black pits and matte steel structures |
| Safe/player energy | bright cyan core, projectiles, route traces and active relays |
| Threat/interaction | orange telegraphs, enemy weak points and warning strobes |
| Neutral detail | cool steel edges, pale ash deposits and sparse white UI text |
| Player silhouette | compact dark suit beneath a hovering cyan core and directional emitter |
| Harrier | low, fast, three-pronged maintenance chassis |
| Ward | tall, heavy mast with a rotating orange aperture |
| Guardian | broad hexagonal body on a rail ring, clearly larger than standard enemies |

The core and activated conduits use a visibly animated TSL effect. The intended
look is pulsing energy traveling along node-material bands, not an invisible
technical checkbox.

## Player verbs and controls

| Verb | Desktop | Touch |
| --- | --- | --- |
| Move | `WASD` or arrow keys | left virtual stick |
| Aim | pointer projected onto the play plane | contextual nearest-hostile direction |
| Relay pulse | left mouse or `Space` | dedicated `FIRE` button |
| Activate | `E` | hold `FIRE` inside an unlocked node |
| Pause/resume | `Escape` or `P` | pause button in the safe top corner |

Aim direction is visible as a short floor reticle and emitter rotation. Touch
buttons stay outside the central combat field and respect portrait safe areas.
The integrated tutorial uses one combined `MOVE + FIRE` prompt and advances
after both actions have been observed and its six-second minimum has elapsed.

## Required experience surfaces

- Title screen with `Start`, control summary and local WebGPU status area.
- In-world tutorial for movement and aim/pulse while carrying the core.
- HUD with health, two-node progression, current objective, checkpoint feedback
  and contextual activation progress.
- Two standard enemy types with distinct movement and attack logic.
- One final-guardian encounter serving as the compact mini-boss.
- Pause overlay that stops gameplay and resumes the exact state.
- Defeat overlay whose explicit retry performs a clean mission restart before
  Node 01 or a checkpoint restore after Node 01.
- Victory state after guardian defeat and successful evacuation.
- Pooled projectile, spark, ash-puff and warning-ring feedback.
- Local procedural audio for shots, impacts, player damage, node/checkpoint,
  boss phase, defeat, and victory; no fetched audio files or network
  dependency.

## Technical implementation intent

The base is the internal `devlab-internal-threejs-game-benchmark-v1`
scaffold with TypeScript, Three.js `WebGPURenderer` and native WebGPU. WebGL or
software-adapter presentation is not an acceptable substitute. Simulation runs
at 60 Hz with at most eight catch-up steps, render interpolation, seeded RNG
from world seed `424242`, and pools for projectiles and frequent effects.

The DevLab capture surface exposes deterministic
title, tutorial, encounter, checkpoint, boss, defeat, victory and mobile-active
states. Dependencies and content remain local, and runtime network requests
remain zero.

These implementation facts are checked independently by the static, runtime,
determinism, lifecycle, and device-loss records.

## Explicit exclusions

- No React Three Fiber, external scaffold, CDN or external service.
- No paid API, commercial asset or upstream generator.
- No Galaxy Raiders, Hellbullet or other-game code or art.
- No blinded AB-04 treatment machinery, builder leg, scoring, or isolation
  provisioner. Selected allowlisted textual guidance was consumed openly in
  read-only mode as recorded in `implementation.md`.
- No feature expansion beyond the short single-route arcade slice.
