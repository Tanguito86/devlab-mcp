# ASH RELAY core-loop contract

## Contract boundary

This document records the measurable player-visible contract implemented by
the pilot. Acceptance is established only by the dedicated validation records.

## Mission state model

| State | Entry condition | Required player action | Exit condition |
| --- | --- | --- | --- |
| `TITLE` | clean boot or return from result | start mission | world is rebuilt from seed `424242`; enter `TUTORIAL` |
| `TUTORIAL` | start dock is ready | move and fire the transported core | route to Relay A opens |
| `RELAY_A` | player enters first yard | hold the activation zone, then defeat the initial threat | Relay A is active and its deterministic waves are cleared |
| `CHECKPOINT` | Relay A encounter is cleared | no extra action; a three-second checkpoint banner confirms the save | enter `RELAY_B` |
| `RELAY_B` | player enters second yard | hold the activation zone, then survive the mixed waves | Relay B is active and its deterministic waves are cleared |
| `GUARDIAN` | both nodes are active | read both Relay Guardian phases and damage its exposed weak point | guardian health reaches zero; evacuation lift powers up |
| `EVACUATE` | guardian defeated | reach and hold the extraction pad | extraction reaches 100%; enter `VICTORY` |
| `VICTORY` | extraction completes | restart or return to title | explicit selection only |
| `DEFEAT` | player health reaches zero in an active mission state | retry checkpoint or restart mission | selected recovery path completes |

`PAUSED` is an overlay on any active mission state. It freezes fixed-step
simulation and enemy/projectile timers while leaving pause UI input responsive.
No new simulation-driven audio cue is emitted while paused; an already-started
short Web Audio envelope may finish. Resume returns to the prior simulation
state without an extra fixed step.

## Core interaction rules

1. The player begins carrying the visible core and must demonstrate movement
   plus a directional pulse in the integrated tutorial.
2. The core stays visibly tethered to the unit. It cannot be dropped, lost
   behind geometry, or transferred to an inventory screen.
3. A relay activation requires the player inside the marked ring and
   `ACTIVATE` held for 1.25 continuous seconds. Releasing activation or leaving
   the ring drains progress at 0.7 units/second; it cannot complete offscreen.
4. An activated relay is permanent for the current run, changes from orange to
   cyan, illuminates its outgoing conduit and increments the HUD from `0/2` to
   `1/2` or `2/2`.
5. The guardian remains invulnerable and inaccessible until both relays are
   active. The evacuation pad remains inactive until the guardian is defeated.

## Initial combat values

These are the final implemented combat values for the validated build.

| Rule | Target |
| --- | ---: |
| Player maximum health | 100 |
| Player maximum speed | 8.5 world units/second |
| Post-hit invulnerability | 0.58 seconds |
| Relay pulse cooldown | 0.145 seconds |
| Relay pulse damage | 18 |
| Relay pulse projectile speed | 20.5 world units/second |
| Relay activation hold | 1.25 seconds |
| Extraction hold | 1.50 seconds |
| Enemy pool capacity | 24 |

Projectiles, hit sparks, ash puffs and telegraph rings come from bounded pools.
Pool exhaustion must skip a cosmetic effect or recycle a safely inactive item;
it must not allocate an unbounded stream during combat.

## Progress, defeat and recovery

Visible progression has four simultaneous channels:

- HUD objective text (`CARRY CORE`, `RELAY 1/2`, `RELAY 2/2`, `DEFEAT GUARDIAN`,
  `EVACUATE`);
- the two-node HUD rail;
- cyan conduit lighting in the world; and
- local procedural cues for shots, impacts, nodes, checkpoint, boss phase,
  defeat, and victory.

The functional checkpoint commits after Relay A is active and its encounter is
cleared, when the state transitions to `CHECKPOINT`. A checkpoint retry restores:

- core attached;
- Relay A active and Relay B inactive;
- full checkpoint health at 100;
- guardian alive and evacuation inactive;
- no active enemy, projectile, telegraph or transient effect from the failed
  attempt; and
- the player at the checkpoint marker facing the bridge.

`Restart mission` is distinct. It resets the authoritative CPU world and every
pool, restores seed `424242` and 100 health, turns both relays off, and returns
to the tutorial start without rebinding input, audio, animation-frame, or
resize handlers. Full page shutdown and device-loss rebuild own the separate
GPU create/dispose paths.

Defeat freezes combat after the final impact presentation, then opens a UI that
cannot also fire the pulse underneath it. Victory similarly stops combat and
requires an explicit choice; neither result state auto-restarts.

## Timing contract

The intended first-input-to-victory path remains 3-5 minutes for a competent
first-time player. The perfect-information bot finishes in 165.850-167.300
seconds (average 166.602); this is an automated lower bound, not human timing
evidence.

| Segment | Target elapsed time |
| --- | --- |
| Tutorial | 0:00-0:20 |
| Node 01 and first encounter | 0:20-1:15 |
| Checkpoint transition | 1:15-1:25 |
| Node 02 and mixed encounter | 1:25-2:35 |
| Relay Guardian | 2:35-3:40 |
| Evacuation | 3:40-4:10 |

No mandatory text panel may consume more than five seconds. Tutorial teaching
is performed through play, not a separate manual.

## Determinism and presentation contract

- Simulation: 60 Hz fixed step, maximum eight catch-up steps.
- Rendering: interpolation between the two latest simulation states.
- RNG: one local seeded stream starts at `424242`; a full mission restart
  restores it, while a checkpoint restore deliberately retains the current
  stream position rather than claiming an exact RNG rewind.
- Capture: applying a frozen state sets exact state/time and stops simulation.
  The native-WebGPU settlement path may submit repeated identical renders,
  perform a decoded warm-up readback, await the device queue, and then read the
  evidence frame; no simulation tick or capture-time change occurs.
- Resize: desktop and portrait change layout/camera only, never simulation
  outcome.
- Audio: local procedural Web Audio driven by simulation events; no network
  fetch and no randomness outside the seeded event model.

The loopback-only capture surface supports these exact states:

| Frozen state | Required composition |
| --- | --- |
| `title` | logo, station silhouette, start/control surface |
| `tutorial` | player, docked core and current single-step prompt |
| `encounter-1` | active Relay A, close enemies and counterattack objective |
| `checkpoint` | active cyan Relay A, checkpoint banner and bridge route |
| `encounter-2` | active Relay B with mixed close/ranged counterattack |
| `boss-phase-1` | Relay Guardian phase I, boss health and readable directed telegraph |
| `boss-phase-2` | visually overloaded Relay Guardian with area pressure and secondary hostiles |
| `defeat` | frozen failed arena plus recovery choices |
| `victory` | powered extraction, player/core and result surface |
| `mobile-active` | portrait combat with unobscured touch controls and HUD |

Two captures of every frozen state must match exactly under the same
authenticated runtime; results are recorded in `determinism.md`.
