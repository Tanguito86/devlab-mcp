# ASH RELAY encounter plan

## Route

```text
CORE DOCK -> RELAY A YARD -> CHECKPOINT BRIDGE -> RELAY B YARD
          -> GUARDIAN RING -> EVACUATION LIFT
```

The slice is a single forward, contiguous industrial route. Node markers,
cyan conduits, arena composition, HUD objectives, and prompts guide progress;
there is no branch, key hunt, or unskippable cinematic.

## Implemented enemy vocabulary

### Harrier - close pursuit

The Harrier is a small three-pronged maintenance chassis that continuously
pursues with a seeded lateral weave.

- normal/elite health: 30/42 (two/three 18-damage relay shots);
- normal/elite speed: 3.65/4.35 world units/second;
- normal/elite contact damage: 6/7;
- contact cooldown: 0.82 seconds;
- no projectile and no separate lunge state.

Its small silhouette, close pressure, orange jaws, and rapid path distinguish
it from the Ward.

### Ward - ranged moving lane pressure

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

All standard enemies use the preallocated 24-slot enemy pool. The deterministic
wave schedule and pool diagnostics, rather than a fictional six-enemy rule,
bound the encounter.

## Measured beat plan

The final ten-run bot observed these approximate transitions:

| Elapsed | Beat |
| ---: | --- |
| 0:00 | title/start and integrated movement/fire tutorial |
| 0:06 | Node 01 activation, then first Harrier/Ward encounter |
| 0:52.55 | encounter clear and checkpoint commit |
| 0:55.57 | Node 02 activation, then mixed encounter |
| 1:58.08-1:58.23 | Relay Guardian phase 1 |
| 2:18.08-2:18.23 | Relay Guardian phase 2 |
| 2:45.85-2:47.30 | evacuation completes and victory |

The bot has perfect information. Human reading, exploration, and feel remain
separate from this automated lower bound.

## Relay encounters

Node 01 must be activated for 1.25 seconds before its ambush spawns. The first
spawn is two normal Harriers and one normal Ward; deterministic reinforcements
introduce elite variants and new angles. Clearing all scheduled enemies
restores health, removes hostile projectiles, and commits the checkpoint.

Node 02 repeats the activation verb before combat. Its opening group is three
Harriers plus two Wards, including elite variants. Later deterministic waves
increase simultaneous angle pressure. Clearing the schedule opens the Guardian
with both conduits active.

The `stress` performance recipe advances the boss-phase-2 composition by 180
fixed ticks. The `mobile-active` recipe uses the mixed arena at 390x844 with
touch movement and FIRE surfaces visible.

## Relay Guardian

The Guardian has 540 health and alternates aimed bolts with radial salvos.
Vulnerability shutters use a 4.8-second cycle with a 3.1-second opening in
phase 1 and a 4.1-second cycle with a 2.85-second opening in phase 2.

### Phase 1

- aimed bolt cadence: 0.92 seconds, damage 4;
- radial cadence: 3.65 seconds, nine projectiles, damage 3;
- no standard-enemy reinforcement;
- at 270 health, armor becomes explicitly sealed until 20 phase seconds have
  elapsed; the HUD reports `ARMOR SEALED — SURVIVE Ns`.

### Phase 2

- visually distinct orange overburn shell/HUD state;
- aimed bolt cadence: 0.68 seconds, damage 5;
- radial cadence: 2.55 seconds, twelve projectiles, damage 4;
- one elite Harrier every 4.6 seconds;
- at 54 health, armor remains sealed until 25 phase seconds have elapsed, with
  the same explicit countdown.

The two timed armor locks ensure the attack vocabulary is experienced without
adding health alone or silently discarding player hits.

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
