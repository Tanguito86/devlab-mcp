# DevLab GameMaker Authoring

Renders GameMaker resource records and the minimal project-file splices that
register them. Pure functions: this package reads nothing, writes nothing and
starts no process. It hands back a list of files for a caller to plan.

Used by `@tanguito/gamemaker-dev-mcp` to back `gamemaker_plan_new_script` and
`gamemaker_plan_new_object`.

## The records are compiler-verified, not inferred

Both shapes were validated by compiling a project that contains them with the
installed Igor (GameMaker LTS 2026, runtime `2024.14.3.260`) — not read off
documentation and hoped for:

- **`GMObject`** mirrors the structure of the shipped pilot fixture, which
  builds today.
- **`GMScript`** was probed by generating a script, calling it from an object,
  and observing the compiled game print the expected return value.

The package's own suite then compiles a generated script *and* a generated
object end to end, including a ranged `alarm` event and `Draw_64` (Draw GUI),
and asserts the game reaches both.

## Supported events

| Name | eventType | Accepted numbers | File |
|---|---|---|---|
| `create` | 0 | 0 | `Create_0.gml` |
| `destroy` | 1 | 0 | `Destroy_0.gml` |
| `alarm` | 2 | 0–11 | `Alarm_<n>.gml` |
| `step` | 3 | 0, 1, 2 | `Step_<n>.gml` |
| `draw` | 8 | 0, 64, 72–77 | `Draw_<n>.gml` |
| `other` | 7 | 0–25 | `Other_<n>.gml` |
| `cleanup` | 12 | 0 | `CleanUp_0.gml` |

Anything outside this table is **refused**, not guessed. A wrong
`eventType`/`eventNum` pairing produces either a project the compiler rejects
or — worse — an event that silently never fires.

## What it refuses

- Names that are not valid GML identifiers (`/^[A-Za-z_][A-Za-z0-9_]{0,63}$/`).
  A path-safe name is not enough; it has to be callable from GML.
- A resource name already in the project, **or one differing only by case or
  Unicode form** — Windows and macOS filesystems would merge the two folders
  and quietly corrupt the project.
- Attaching a sprite the project does not already contain.
- Duplicate events on one object, more than 24 events, or GML over 256 kB.

## Project-file splices

`.yyp` and `.resource_order` are patched by minimal text insertions that
preserve every other byte, so a project edited here still reads as the IDE
wrote it. Insertion is idempotent: planning the same resource twice yields the
same text.

`.resource_order` is IDE ordering metadata and is **not** required to compile —
measured, not assumed. It is patched only when the project already has one;
conjuring the file would mean inventing a layout no IDE wrote.

## Rooms

`authorRoom` creates a room with one instance layer above one background layer,
optionally pre-populated, and registers it in both the project's `resources`
and its `RoomOrderNodes` — a room missing from the room order leaves the game
with nothing to launch.

`authorPlaceInstance` adds instances to a room that **already exists**. The room
is patched as text, never re-rendered: re-rendering would silently discard any
layer, effect or setting this package does not model. A room with more than one
instance layer is refused rather than guessed at, since there would be no way
to know which layer the caller meant.

Instance identity is derived (`inst_<object>`, then `_2`, `_3`) rather than
random, because the whole plan-hash model depends on two identical plans being
byte-identical. GameMaker's own `inst_<hex>` naming would break that.

Verified at runtime, not just compiled: a placed instance reports its exact
coordinates via `instance_find`, and a generated room reports the right
`instance_number` once the game enters it.

## Record versions are pinned to the toolchain

Every tag-and-version this package writes is a claim about the project format.
The installed ProjectTool will state the truth directly:

```text
ProjectTool.exe SHOWVERSIONEDTYPES DESTINATION=<file>
```

Its answer for all 140 record classes is committed as
`fixtures/gamemaker/ide-versioned-types.json`, and a test asserts every tag this
package emits matches it. The grammar is `"v<N>"` for 1..1000 and **`""` for
version 0** — writing the literal `"v0"` is rejected with "Failed to parse
tag-and-version field".

## Not covered

Tile layers, sprite and asset layers, room inheritance, views beyond the single
default, and creation code. A room authored here is a plain instance surface.

### What a tile-layer sprint already knows

An attempt was made and stopped rather than shipping a guess. Findings, so the
next one does not rediscover them:

- There is **no tileset or tile layer anywhere on a typical dev machine** to
  copy from — 343 rooms across 20 real projects, the GameMaker install and the
  bundled templates all came up empty.
- Authoritative versions: `GMRTileLayer` is **0** (tag `""`), `GMTileSet` is
  **1**, `GMTileAnimation` and `GMAutoTileSet` are **0**.
- `ProjectTool PROJECT OPEN` + `PROJECT SAVE` is a fast round-trip that reports
  clearer errors than a full compile, and would emit canonical form for any
  record it can load.
- A project with **no tileset and no tile layer round-trips cleanly**, which
  proves the sprite, room, layer and project shapes here are correct.
- Adding a `GMTileSet` fails with `Failed to parse run-length encoded data`
  **even when `macroPageTiles` and `tileAnimation` are both omitted**. The
  blocker is inside `GMTileSet`, not the room layer, and there is no "absent"
  form of the payload that satisfies the reader.
- `TileCompressedData` is genuinely run-length encoded; eight candidate
  encodings were rejected. `PackageZip`, which might have offered another
  diagnostic path, is licence-gated on this install.

The cheap unblock is to create one tileset and one painted tile layer in the
IDE by hand and read the resulting `.yy`. That file is the ground truth this
package normally works from, and every record it already emits was derived the
same way.

## A note on duplication

The GameMaker JSON helpers here (`renderGmJson`, `insertIntoGmArray`,
`parseGmJson`) also exist in `asset-gm-bridge` for its sprite renderer.
Importing them from there would drag the whole Asset Forge dependency tree into
the read-only MCP server, which is a worse trade than sixty duplicated lines.
Consolidating the two — with this package as the canonical home — is tracked
separately.
