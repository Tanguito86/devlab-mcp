# THAW

A sliding-ice puzzle, built from nothing by the DevLab MCP servers.

Push a block and it does not move one cell: it travels until a wall or another
block stops it. Every pad has to end up under a block.

```bash
node examples/thaw/build-thaw.mjs --out H:/GameMaker-Projects --clean --run
```

| flag | effect |
| --- | --- |
| `--out <dir>` | where the project is written (default `output/thaw`) |
| `--clean` | rebuild over an existing `Thaw` — see below |
| `--test` | bake the recorded solutions in and let the game play itself |
| `--run` | compile and launch with Igor when the build finishes |

## Nothing here writes a project file

That is the point of the example. Every resource is planned by the read tier and
applied by the write tier; every sprite is drawn by an Aseprite script, ingested,
published to the asset catalog and imported through the bridge. The playable
project is an **output**, not a checked-in asset — this directory holds the
generator, the art scripts and the GML, and that is all.

```
art/thaw-art.lua      tileset, hero and block, as character maps
art/tileset-page.lua  the texture page GameMaker needs beside a tileset
gml/                  the game: rules, levels, and three objects
tools/solve-check.mjs replays the recorded solutions without compiling
build-thaw.mjs        the whole thing, over MCP
```

## It verifies itself

`--test` writes `thaw_testing() -> true`, and the game then feeds the recorded
solution for each level through **the same code path the keyboard uses**. A
passing replay therefore exercises the real rules, not a parallel test harness.
The build fails if any level goes unsolved:

```
THAW SOLVED level=1 moves=1
THAW SOLVED level=2 moves=25
THAW SOLVED level=3 moves=13
THAW ALL SOLVED
```

It also saves one frame of every level, untouched, into the game's save
directory — because "the logic passed" and "it looks right" are different
claims, and only the second one catches a tileset that renders nothing.

`tools/solve-check.mjs` replays the same solutions in Node, reading the levels
straight out of the GML so there is one source of truth. It catches a broken
solution in a second instead of after a two-minute Igor build.

## Two things this example found

**A `GMTileSet` record alone renders nothing.** GameMaker also wants
`output_tileset.png` beside it: each tile re-laid-out into a
`(tile + 2 × border)` cell with its edges bled outward. Without it `tilemap_get`
still returns the right indices and every logical test passes — the level is
simply invisible. `gamemaker_plan_new_tileset` does not emit the page yet, so
`build-thaw.mjs` generates it with `art/tileset-page.lua`.

**Rebuilding is not just deleting the directory.** The write tier records each
project creation in a ledger outside the project, so a bare `rm -rf` looks like
a half-finished creation and the next create is refused. `--clean` removes the
project *and* that ledger, and nothing else: transaction backups and locks are
left alone so a rollback belonging to another project is never destroyed.

## Where it is thin

The levels are sparse — a 20×15 room holding one block reads as a big empty
field. Sliding puzzles are better in tighter spaces with more to bump into, and
that is the next thing to fix. The hero's four facings are also close enough in
silhouette that the left and right poses are hard to tell apart in motion.
