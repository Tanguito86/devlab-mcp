# Shmup bullet benchmark

How many bullets GameMaker carries inside a 60 fps frame, and what the choice of
representation costs. Built to decide whether a DoDonPachi-class danmaku can
live in GameMaker instead of being argued about.

```bash
node examples/shmup-bench/build-bench.mjs --out H:/GameMaker-Projects --clean --run
```

Three modes doing identical work — move, wrap at the room edge, and test one
small circular hitbox against every bullet:

| mode | representation |
| --- | --- |
| `aos` | one array of structs, iterated by a controller |
| `soa` | parallel flat arrays, iterated by a controller |
| `instances` | one object per bullet, with its own Step event |

## Result

Measured on the author's machine, GameMaker LTS 2026, **VM runtime**, 384×448
room, 8×8 bullets on one texture page, no rotation or blending.

| mode | µs per bullet | bullets at 60 fps | pass-to-pass spread |
| --- | --- | --- | --- |
| `instances` | 0.999 | ~16,700 | 10.8% |
| `soa` | 1.085 | ~15,400 | 2.1% |
| `aos` | 1.171 | ~14,200 | 5.5% |

**Around 15,000 bullets, whichever way you store them.** DoDonPachi peaks in the
hundreds, so the headroom is one to two orders of magnitude. The engine is not
the constraint.

The three modes sit within 17% of each other, and the fastest one has the widest
spread, so treat `instances` and `soa` as tied and `aos` as slightly behind.
Do **not** read a decisive winner out of this table.

## The advice this refuted

The received wisdom, which this benchmark was written to confirm, is *never use
instances for bullets — iterate a flat array instead*. On the VM runtime that is
wrong. Instances measured at least as fast as hand-rolled arrays, and probably
faster.

The reason is that the comparison is not "engine overhead versus no engine
overhead". It is "compiled engine dispatch and batched engine drawing" versus
"a GML loop paying interpreter cost on every array index and struct field". The
engine side wins that trade.

Array-of-structs and struct-of-arrays came out nearly identical on update cost
and differed only in drawing, where `soa` avoids a field lookup per bullet.

## How it avoids lying

The first run reported `6.944 ms` for five consecutive bullet counts. That is
144 fps exactly — the display was pacing the loop, not the work. `game_set_speed`
lifts the engine's own cap and `display_reset(0, false)` did **not** lift vsync
on this host, so any frame time near the display period is a floor rather than a
reading.

What the numbers above use instead:

- a ladder that starts at 8,000, well clear of the floor, since the cost is
  linear and the answer for 1,000 bullets is read off the slope;
- a **least-squares slope** over every rung above 14,000 µs, which cancels the
  floor and the engine's fixed per-frame cost together;
- **three full passes**, because a single two-point slope ranked the three modes
  differently on every run, by as much as thirty per cent;
- the pass-to-pass spread printed beside every result, so a ranking is never
  read off noise.

## What is not measured

- **YYC.** The compiled runtime is what a performance-sensitive game ships with,
  and it plausibly changes the ranking, because it is the GML side of the trade
  that YYC makes faster. It could not be built here: Igor reports
  `No Visual Studio location is set`, which is an IDE preference this example
  will not change on someone's behalf. This is the most valuable missing number.
- **Realistic bullets.** These move in a straight line. Real ones run scripted
  per-bullet behaviour, which shifts the balance toward whatever makes per-bullet
  logic cheap.
- **Rotation, blending, additive glow, multiple texture pages.** All of these add
  to the draw side.
- **Anything but this machine.**
