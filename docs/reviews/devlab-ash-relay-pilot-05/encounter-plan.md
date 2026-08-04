# ASH RELAY encounter plan v2

This version reconciles the live gameplay findings with the validated pilot
values. It is normative for `DEVLAB-ASH-RELAY-GAMEPLAY-CORRECTION-06B` and
supersedes the earlier ordering, timed Guardian shutters, invisible fixed-point
spawns, and any claimed global six-hostile limit.

## Route

```text
CORE DOCK -> RELAY A YARD -> CHECKPOINT BRIDGE -> RELAY B YARD
          -> GUARDIAN RING -> EVACUATION LIFT
```

The slice is a single forward, contiguous industrial route. Node markers,
cyan conduits, arena composition, HUD objectives, and prompts guide progress;
there is no branch, key hunt, or unskippable cinematic.

## Implemented enemy vocabulary

### Cinder Scrapper (implemented as Harrier) - close pursuit

The Harrier is a small three-pronged maintenance chassis that continuously
pursues with a seeded lateral weave.

- normal/elite health: 30/42 (two/three 18-damage relay shots);
- normal/elite speed: 3.65/4.35 world units/second;
- normal/elite contact damage: 6/7;
- contact cooldown: 0.82 seconds;
- no projectile and no separate lunge state.

Its small silhouette, close pressure, orange jaws, and rapid path distinguish
it from the Ward.

### Arc Sentry (implemented as Ward) - ranged moving lane pressure

The Ward is a heavy aperture unit that tries to hold a five-to-eight-unit
standoff while orbiting at 2.4 world units/second.

- normal/elite health: 44/56 (three/four relay shots);
- final 0.32 seconds of the firing timer expose a growing orange aperture
  telegraph;
- normal/elite firing cadence: 1.38/1.05 seconds after each shot;
- normal/elite bolt damage: 5/6;
- bolt speed: 8.3 world units/second.

The implementation does not claim solid-geometry projectile occlusion. The
Ward instead creates readable moving lanes in the open arena.

All standard enemies use the preallocated 24-slot enemy pool. Pool capacity is
independent from simultaneous encounter pressure. Every request first enters a
bounded encounter-owned queue, then a visible hatch telegraph, and only then
commits an enemy while that encounter has active budget available.

| Context | Standard-enemy active budget | Pending queue capacity | Bounded schedule |
| --- | ---: | ---: | --- |
| Relay A onboarding | 2 | 2 | exactly two Cinder Scrappers |
| Relay A post-activation response | 2 | 2 | one Scrapper and one Arc Sentry; no reinforcements |
| Relay B mixed encounter | 5 | 5 | deterministic authored waves; at most five queued requests |
| Guardian phase 1 | 0 | 0 | no standard-enemy reinforcement |
| Guardian phase 2 | 2 | 3 | at most three reinforcement requests in the entire phase |

These are local pressure budgets, not a global active-hostile cap. The Guardian
and projectiles do not consume standard-enemy slots. A queue at capacity must
defer or reject an additional request deterministically; it must never grow
without bound.

Every standard-enemy spawn uses this lifecycle:

```text
HATCH_IDLE -> HATCH_TELEGRAPH -> SPAWN_COMMIT -> ENEMY_ACTIVE
```

`HATCH_TELEGRAPH` lasts at least 0.65 seconds and uses both animated shape and
high-contrast color. At commit time the enemy may not overlap the player or the
player collision radius. An invalid hatch remains queued and is retried at a
valid authored hatch; it may not silently spawn at a raw coordinate. Telegraphs
must remain visible against the dark floor and in the contractual portrait
composition.

## Measured beat plan

The final ten-run bot observed these approximate transitions:

| Elapsed | Beat |
| ---: | --- |
| 0:00 | title/start and integrated movement/fire tutorial |
| 0:06 | historical build: Node 01 activation, then first Harrier/Ward encounter |
| 0:52.55 | encounter clear and checkpoint commit |
| 0:55.57 | Node 02 activation, then mixed encounter |
| 1:58.08-1:58.23 | Relay Guardian phase 1 |
| 2:18.08-2:18.23 | Relay Guardian phase 2 |
| 2:45.85-2:47.30 | evacuation completes and victory |

These measurements describe the original build and are retained as historical
evidence only. The bot has perfect information. Human reading, exploration,
and feel remain separate from this automated lower bound. Version 2 must be
remeasured after implementation; it targets the 3-5 minute mission contract.

## Relay encounters

Node 01 begins disabled. Two normal Cinder Scrappers emerge through opposite
telegraphed hatches and teach movement, attack, and kiting. Defeating both
enables the activation ring. Activation then follows the 75% floor contract in
`core-loop-contract.md`. Completion triggers a bounded response of exactly one
normal Cinder Scrapper and one normal Arc Sentry, with no reinforcement wave.
Clearing both restores health, removes hostile projectiles, and commits the
checkpoint. Relay A must remain measurably less demanding than Relay B: it has
fewer active hostiles, fewer total hostiles, and no elite variant.

Node 02 repeats the activation verb before combat. Its opening group is three
Cinder Scrappers plus two Arc Sentries, including elite variants. Later
deterministic authored waves may increase angle pressure but must respect its
five-active budget and five-request pending queue. Clearing the finite schedule
opens the Guardian with both conduits active.

The `stress` performance recipe advances the boss-phase-2 composition by 180
fixed ticks. The `mobile-active` recipe uses the mixed arena at 390x844 with
touch movement and FIRE surfaces visible.

## Relay Guardian

The Relay Custodian starts with 540 health. This value remains provisional only
against measured duration: it may change after 06B solely when repeatable
metrics place the mission outside 3-5 minutes or the boss outside its 70-100
second budget. HP may not be changed merely to imitate the obsolete 360 value.

Each phase runs the explicit attack FSM below:

```text
TELEGRAPH -> COMMITTED_ATTACK -> RECOVERY -> VULNERABLE -> TELEGRAPH
```

Phase transition is an explicit event between completed FSM states. Telegraphs
must precede damage and identify a reachable safe response. `RECOVERY` begins
only after the committed pattern has finished producing damage. `VULNERABLE`
opens the weak point as a consequence of that completed attack and cannot be
opened by an unrelated global clock. Every transition, committed attack, and
vulnerability window is recorded by boss metrics.

### Phase 1

- readable directed attack with a distinct warning;
- a legible sweep with advance warning and a reachable safe zone;
- clear recovery followed by an attack-linked vulnerability window;
- no standard-enemy reinforcement;
- no timed armor lock and no global shutter cycle.

### Phase 2

- visually distinct orange overburn shell/HUD state;
- a projectile fan with stable, recognizable gaps that are reachable from the
  telegraphed player position;
- a committed phase-2 pattern, clear recovery, then an attack-linked
  vulnerability window;
- at most two simultaneous secondary standard enemies and three total
  reinforcement requests in the phase, all using telegraphed hatches;
- no infinite reinforcement timer, timed armor lock, or global shutter cycle.

The attack vocabulary, rather than passive waits or invulnerability timers,
owns the fight's rhythm. Validation records phase time, attacks executed,
windows opened, damage received during telegraphs, damage received while in a
signaled safe zone, total boss time, and total mission time.

## Defeat, evacuation, and feedback

At zero player health combat enters `DEFEAT`. Before the checkpoint, recovery
performs a clean mission restart; afterward it restores the checkpoint state.
The full-restart action remains distinct.

After the Guardian is defeated, the player retains control and must reach the
cyan evacuation marker and hold activation for 1.50 seconds. There is no
unimplemented final ash-vent hazard.

Feedback implemented by simulation and presentation includes:

- 0.58-second player post-hit invulnerability;
- orange damage edge flash and moderate camera impulse;
- emissive enemy hit flash;
- pooled impacts and particles;
- local procedural shot, impact, damage, relay, checkpoint, boss, defeat, and
  victory cues.

There is no hit-stop mechanic, so none is claimed as validated.

## Acceptance boundary

Bot, runtime, lifecycle, determinism, and critic results are recorded in their
dedicated reports. Automated evidence proves route reachability, 0 softlocks,
restart/checkpoint behavior, and the 165.850-167.300-second bot range. A
first-time human 3-5-minute timing and subjective fun/feel were not measured.
