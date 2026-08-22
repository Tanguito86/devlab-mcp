# GameMaker Dev MCP

Local stdio MCP server that exposes the governed read-only and plan-only slice of
`@tanguito/devlab-gm-ide-adapter`.

## Public tools

- `gamemaker_status` fixes `GM_STATUS_V1` inside the server and reports project
  state, fingerprint, a sanitized process summary, and the observed adapter gate.
- `gamemaker_inspect` fixes `GM_INSPECT_V1` and returns the canonical project
  file/resource inventory and SHA-256 fingerprints.
- `gamemaker_plan` fixes `GM_PLAN_V1`, requires the exact inspect fingerprint,
  and returns a sanitized immutable plan summary and `planHash`.

The server registers exactly these three tools. It has no resources or prompts and
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
