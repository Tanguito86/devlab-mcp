# GameMaker Dev MCP

Local stdio MCP server that exposes the governed read-only and plan-only slice of
`@tanguito/devlab-gm-ide-adapter`.

## Public tools

- `gamemaker_status` fixes `GM_STATUS_V1` inside the server and reports project
  state, fingerprint, a sanitized process summary, and the observed adapter gate.
- `gamemaker_inspect` fixes `GM_INSPECT_V1` and returns the canonical project
  file/resource inventory and SHA-256 fingerprints.
- `gamemaker_plan` fixes `GM_PLAN_V1`, requires the exact inspect fingerprint,
  and returns an immutable plan and `planHash` for an edit to existing files.
- `gamemaker_plan_new_script` plans a **new** GML script resource.
- `gamemaker_plan_new_object` plans a **new** object with its event code.
  Supported events: `create`, `destroy`, `alarm`, `step`, `draw`, `other`,
  `cleanup`; anything else is refused rather than guessed.
- `gamemaker_plan_new_room` plans a **new** room, optionally pre-populated with
  object instances, and registers it in the project's room order.
- `gamemaker_plan_place_instance` plans adding instances to a room that already
  exists. The room is patched as text, never re-rendered, so layers and
  settings this server does not model survive untouched.
- `gamemaker_plan_new_tileset` plans a **new** tileset from a sprite already in
  the project. The sprite's pixel size is read from the project rather than
  taken on the caller's word, so the tile count cannot silently disagree with
  the image.
- `gamemaker_plan_tile_layer` plans a run-length encoded tile layer for a room
  that already exists. Cells are row-major tile indices; `-2147483648` leaves a
  cell blank, and index `0` is GameMaker's reserved blank tile. The tile size
  and tile count are read from the tileset and every index is bounds-checked
  against it. The room is patched as text, so unmodelled layers survive.

The server registers exactly these nine tools.

## Plans compose with the write tier

Every plan tool returns a `plan` field holding the complete immutable plan.
Hand it straight to `gamemaker_apply` of `@tanguito/gamemaker-write-mcp`:

```text
gamemaker_inspect        -> fingerprint
gamemaker_plan_new_object -> { plan, planHash }
gamemaker_apply           <- { plan, planHash, confirm: true, dryRun: false }
```

This server still writes nothing. Emitting the plan grants no capability: the
content is what the caller just supplied, and the write tier revalidates the
snapshot hash, every file's before-digest, both allowlists and its own
env-scoped write allowlist before touching a file.

Earlier versions returned only a summary, which meant the two tiers could not
actually be composed — a caller could see what a plan would do but had nothing
it could apply. It has no resources or prompts and
does not expose apply, verify, rollback, import, command execution, GameMaker/Igor
launch, Runner control, Asset Forge, or Asset-GM Bridge operations. A returned
plan cannot be submitted back to this server for execution.

## Configuration

Set one environment variable before calling a tool:

```text
DEVLAB_GM_PROJECTS_DIR=<ABSOLUTE_PROJECTS_ROOT>
```

The root must be an existing absolute real directory, not a symlink or junction.
Every tool accepts only a project path relative to that root. There is no fallback
to the current directory, home directory, repository, or a machine-specific path.
The server can start and answer `tools/list` without this variable; tool calls then
fail closed with `GM_CONFIG_REQUIRED`.

Project paths, allowlists, and hypothetical edit paths are checked by the existing
adapter boundary. Absolute paths, drive paths, UNC paths, traversal, ambiguous
segments, NUL, symlink/junction traversal, invalid projects, stale fingerprints,
non-allowlisted files, forbidden extensions, and excessive inputs fail closed.

## Build and start

From the monorepo root:

```text
corepack pnpm --filter @tanguito/gamemaker-dev-mcp build
corepack pnpm --filter @tanguito/gamemaker-dev-mcp start
```

`stdout` is reserved for MCP framing. Safe startup diagnostics use only `stderr`.

## Local client templates

Claude Code stdio template, derived from the built bin and not executed in this
slice:

```text
claude mcp add --transport stdio --env DEVLAB_GM_PROJECTS_DIR=<ABSOLUTE_PROJECTS_ROOT> gamemaker-dev-mcp -- node <ABSOLUTE_PACKAGE_PATH>/dist/index.js
```

Claude Desktop-style stdio template:

```json
{
  "mcpServers": {
    "gamemaker-dev-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PACKAGE_PATH>/dist/index.js"],
      "env": {
        "DEVLAB_GM_PROJECTS_DIR": "<ABSOLUTE_PROJECTS_ROOT>"
      }
    }
  }
}
```

These are configuration examples only. No Claude or Opus connection was modified
or verified in this slice.

## Platform support and demo scope

File inspection and hypothetical planning work wherever the adapter supports the
host. Complete process inventory requires Windows PowerShell/CIM support; other
hosts may return a reduced process view while retaining the same fail-closed file
boundary.

The verified demo copies `fixtures/gamemaker/hermes-bridge-pilot` to a disposable
temporary directory outside the repository. It does not open a real GameMaker
project, GameMaker itself, Igor, or Runner, and it performs no project writes.
