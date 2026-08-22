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

## Not covered

Rooms, and placing an instance into a room. Room records carry layers, views
and instance lists — a much larger surface than an object or a script, and one
worth its own verified pass rather than a rushed appendix to this one. Until
then, an authored object has to be instantiated from GML
(`instance_create_depth`).

## A note on duplication

The GameMaker JSON helpers here (`renderGmJson`, `insertIntoGmArray`,
`parseGmJson`) also exist in `asset-gm-bridge` for its sprite renderer.
Importing them from there would drag the whole Asset Forge dependency tree into
the read-only MCP server, which is a worse trade than sixty duplicated lines.
Consolidating the two — with this package as the canonical home — is tracked
separately.
