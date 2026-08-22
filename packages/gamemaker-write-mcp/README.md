# GameMaker Write MCP

Local stdio MCP server that exposes the governed **write tier** of
`@tanguito/devlab-gm-ide-adapter`: transactional mutation, text verification and
byte-exact rollback. It never compiles and never launches a game runtime.

This is a separate package and a separate server from `@tanguito/gamemaker-dev-mcp`
on purpose. Hosts commonly authorize per server rather than per tool, so
enabling read-only inspection must not implicitly enable writes.

## Public tools

- `gamemaker_apply` fixes `GM_APPLY_SAFE_V1`. Takes an immutable plan produced by
  `gamemaker_plan` and applies it inside a locked write-ahead transaction with a
  verified byte-exact backup. **Defaults to a dry run**; pass `dryRun: false` to
  actually write.
- `gamemaker_verify_text` fixes `GM_VERIFY_V1` at `TEXT_VALID` only. Parses every
  GameMaker JSON file and checks basic GML structure. Writes verification
  evidence outside the project.
- `gamemaker_rollback` fixes `GM_ROLLBACK_V1`. Restores an applied transaction
  from its verified backup blobs and reports whether the result was byte-exact.

The server registers exactly these three tools. It has no resources and no
prompts, and exposes no compile, run, Igor, Runner, Asset Forge, Asset-GM Bridge,
import, or command-execution operation. `COMPILE_VALID` and `RUNTIME_VALID` are
unreachable: the verification policy is fixed in the server and the tool
contracts have no field for a toolchain.

The adapter's fault-injection hook (`faultAt`) is a test seam and is rejected by
the tool contract.

## Configuration

```text
DEVLAB_GM_PROJECTS_DIR=<ABSOLUTE_PROJECTS_ROOT>
DEVLAB_GM_WRITE_ALLOW=<PATH_LIST or *>
DEVLAB_GM_EVIDENCE_ROOT=<RELATIVE_PATH>   # optional
```

`DEVLAB_GM_PROJECTS_DIR` must be an existing absolute real directory, not a
symlink or junction. Every tool accepts only a project path relative to it.
There is no fallback to the current directory, home directory, or repository.

### The write allowlist is the boundary the caller cannot widen

Each request carries its own allowlist, but that list is supplied by the caller,
so on its own it is a coherence check rather than an authorization boundary — a
model can widen it at will. `DEVLAB_GM_WRITE_ALLOW` is the part the caller cannot
change, and every planned path must satisfy it.

It has no default. An unset or empty value fails closed with
`GM_CONFIG_REQUIRED`, so the operator opts out deliberately rather than by
forgetting to configure it.

- `DEVLAB_GM_WRITE_ALLOW=objects/;scripts/util.gml` — entries are separated by
  `;`. An entry ending in `/` matches anything below that directory; any other
  entry must match a path exactly.
- `DEVLAB_GM_WRITE_ALLOW=*` — deliberate opt-out; the whole project is writable.

Path safety is enforced in every mode, including `*`. "Unrestricted" means
anywhere inside the project, never unchecked.

`DEVLAB_GM_EVIDENCE_ROOT` defaults to `.devlab-gamemaker-mcp-write` and is always
resolved relative to the projects root, never inside a project.

## Plan provenance, stated plainly

Plans travel by value so the read-only server never has to persist anything.
`planHash` is a digest, not a signature: this server **cannot** distinguish a
plan issued by `gamemaker_plan` from one a caller fabricated, and it does not
pretend to. Safety does not rest on plan provenance. It rests on the adapter
re-validating every plan against real on-disk state before writing:

- the plan's `snapshotHash` must match the project's current snapshot;
- each file's `beforeSha256` must match the bytes actually on disk;
- each file's content must hash to its declared `afterSha256`;
- every path must pass the path-safety policy, the plan allowlist, the request
  allowlist, the extension policy, and `DEVLAB_GM_WRITE_ALLOW`;
- writing is refused while GameMaker, Igor or Runner is running.

## Build and start

From the monorepo root:

```text
corepack pnpm --filter @tanguito/gamemaker-write-mcp build
corepack pnpm --filter @tanguito/gamemaker-write-mcp doctor
corepack pnpm --filter @tanguito/gamemaker-write-mcp start
```

`stdout` is reserved for MCP framing. Safe startup diagnostics use only `stderr`.

## Local client templates

Claude Desktop-style stdio template:

```json
{
  "mcpServers": {
    "gamemaker-write-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PACKAGE_PATH>/dist/index.js"],
      "env": {
        "DEVLAB_GM_PROJECTS_DIR": "<ABSOLUTE_PROJECTS_ROOT>",
        "DEVLAB_GM_WRITE_ALLOW": "objects/"
      }
    }
  }
}
```

Configuration examples only. Register this server alongside the read-only one
only when writes are actually intended, and prefer a host that asks for
confirmation before each write tool call.

## Platform support and verification scope

File mutation, text verification and rollback work wherever the adapter supports
the host. The guard that refuses to write while GameMaker, Igor or Runner is
running relies on the Windows CIM process inventory; on other hosts that
inventory is empty, so the guard passes vacuously while every file boundary
still holds.

Verified against a disposable copy of `fixtures/gamemaker/hermes-bridge-pilot`.
No real GameMaker project, GameMaker IDE, Igor or Runner is involved.
