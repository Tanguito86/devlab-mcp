# FORTYTWO

A vertical scrolling shooter, built from nothing by the DevLab MCP servers.
Scrolling sea, waves on a timetable, enemies on parametric paths, and the
loop-the-loop.

```bash
node examples/fortytwo/build-fortytwo.mjs --out H:/GameMaker-Projects --clean --run
```

| flag | effect |
| --- | --- |
| `--out <dir>` | where the project is written (default `output/fortytwo`) |
| `--clean` | rebuild over an existing `Fortytwo` |
| `--test` | fly the autopilot instead of the keyboard, and assert the outcome |
| `--run` | compile and launch with Igor when the build finishes |

Arrows or WASD to fly, `Z` or space to fire, `X` or shift to roll, `R` to
restart.

## Why this before a danmaku

It is the whole shmup skeleton — scroll, spawn timetable, enemy paths, player,
collision, scoring, lives — without the bullet-count problem. Every piece is
reused by a bullet-hell game; only the bullet system and the pattern
interpreter get replaced.

The two pieces meant to outlive it are **data read by an interpreter**, not code
per enemy:

```gml
{ at: 430, kind: "dive_centre", count: 6, gap: 9, fires: true }
```

and a pure path function, `ft_path(kind, t)`, giving where an enemy of that kind
is `t` frames after it entered. Pure means a run is reproducible, which is what
makes the autopilot usable as a test.

## The autopilot is the test

A recorded input string is the obvious way to make a shooter testable, and it is
a trap: nobody authors a good one by hand, and it breaks the moment a wave is
retimed. `--test` instead flies an autopilot that reads the live game state —
deterministic for the same reasons the game is — and it survives design changes,
which is what a regression test has to do.

It is not meant to play well. It proves the systems connect: input moves the
plane, shots kill enemies, kills score, formations pay a bonus, and the roll
fires. The build fails unless the run reaches the end with kills, a formation
bonus and at least one roll.

**The roll is triggered on a timer, and that is a finding rather than a
shortcut.** Rolling when threatened never fired once. The pilot lines up under
each enemy and kills it long before it descends, so nothing ever came within the
danger radius — not at 22 pixels, and not at 46. Two runs with different radii
produced *byte-identical* scores, kills and end frame, which is what gave it
away: neither the roll branch nor the dodge branch was running at all. Had the
assertion not existed, the test would have passed while touching neither.

So the pilot rolls on a clock, and the comment in the source says exactly what
that is: an instrument exercising the roll path — charge spent, invulnerability,
the spin, no firing while rolling — not a pilot making a decision.

**It still does not cover dying.** The pilot finishes every run with all three
lives, so the collision-with-player, life-loss and respawn paths are exercised
by nothing here. The way to close that is not a worse pilot; it is a harder
game, which this one needs anyway — see below.

It also saves a frame of every wave's opening, because the logic passing and the
game looking right are different claims. That is how the second finding below
was caught: everything reported success and the screen was black.

## Two things an authored room does to you

Neither is a bug in the game, and both cost a debugging cycle.

**Its background layer has no element to fetch.** `gamemaker_plan_new_room`
declares the layer with `spriteId: null`, and `layer_background_get_id` on such
a layer **faults rather than returning `-1`** — so guarding for `-1` does not
help. Headless, a GML fault is an invisible dialog and a hang with no output at
all: the only visible symptom was the Runner window being titled `Code Error`.

**Its background layer is opaque black, at depth 100.** Draw Begin runs before
any layer is painted, so a sea tiled there is drawn and then covered. Nothing
errors; the screen is simply black with sprites on it — and the depth is 100,
not the 200 the IDE writes, so a first fix at 150 put the sea *behind* the
black and looked identical to no fix at all. Higher depth is further back.

Both are avoided the same way: `obj_game` sits at depth 50 and tiles the sea in
its ordinary Draw event — in front of the black layer, behind everything that
plays, and needing no layer element to exist.

## No tileset here

The sea is a tiled sprite, not a tile layer, which is the natural way to build a
scrolling shooter. It also sidesteps the `output_tileset.png` that
`gamemaker_plan_new_tileset` does not emit yet — see `examples/thaw`.

## Where it is thin

**It is too easy, and that is measured, not felt.** Nothing in six waves ever
gets within forty-six pixels of a pilot that does nothing cleverer than sit
under the lowest enemy and hold the trigger. Enemies die on the way down, before
they are close enough to matter, and the two firing waves land nothing. Until
that changes the roll is decorative and the three lives are furniture.

Six waves and one enemy type. No boss, no power-up, no second stage. The enemy
sprite is also muddier than the player's: olive on olive at 16×16 gives up a lot
of contrast and would read better with a lighter topside.
