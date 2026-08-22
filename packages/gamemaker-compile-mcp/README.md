# GameMaker Compile MCP

Local stdio MCP server that verifies a GameMaker project **builds**, using the
real Igor compiler through `@tanguito/devlab-gm-ide-adapter`'s `GM_VERIFY_V1`.

Third and last tier of the GameMaker stack, kept in its own package and server
so that enabling inspection or writes never implicitly enables starting a
compiler and a game.

| Server | Tier | Starts a process |
|---|---|---|
| `@tanguito/gamemaker-dev-mcp` | read / plan | no |
| `@tanguito/gamemaker-write-mcp` | write / rollback | no |
| `@tanguito/gamemaker-compile-mcp` | build | **yes — Igor and the game** |

## Igor runs the game. This server says so.

A build verification **compiles the project and briefly launches it**. Owned
Runners are terminated once the run settles.

This is why there is no separate, scarier "run" tool: runtime verification is
one extra assertion over the same invocation, not a second capability. It is
also why `gamemaker_verify_build` is annotated `readOnlyHint: false` even though
it modifies no project file — "read-only" would be a false promise for
something that spawns a compiler and a game.

### Why there is no compile-only tool

Igor does expose verbs other than `Run` — `Package`, `PackageZip`, `Clean` and
friends. Both alternatives were measured on GameMaker LTS 2026 with runtime
`2024.14.3.260`, and neither yields a compile-only check:

| Verb | Result |
|---|---|
| `Package` | exits **0 in ~1 s even with a deliberate GML syntax error** — it packages, it does not invoke the asset compiler |
| `PackageZip` | does invoke the asset compiler, then fails with `Permission Error : Unable to obtain permission to execute` (reason code `0000002A`) — export is licence-gated |
| `Run` | invokes the asset compiler and reports real errors |

So on this licence `Run` is the only verb that actually compiles. If a licence
that permits packaging is ever available, `PackageZip` becomes a candidate for
a genuine compile-only lane.

One consolation, also measured: **a build that fails to compile short-circuits
in a few seconds and never launches the game.** The window only appears when
the code is already valid.

## Public tools

- `gamemaker_toolchain_status` — reports whether this host can build: platform,
  opt-in flag, configured paths and whether they exist. Starts no process and
  returns **booleans plus a runtime label**, never a filesystem path.
- `gamemaker_verify_build` — runs Igor against one project and reports
  `TEXT_VALID`, `PROJECT_LOAD_VALID` and `COMPILE_VALID`, with the Igor exit
  code, **parsed compiler diagnostics** and an evidence path. Supply
  `expectedRuntimeSignal` to additionally assert `RUNTIME_VALID` (the running
  game must print that text).

### Diagnostics

A failing build returns what the compiler said, not just that it failed:

```json
{
  "severity": "error",
  "symbol": "gml_Object_obj_player_Create_0",
  "object": "obj_player",
  "event": "Create_0",
  "line": 12,
  "message": "unexpected symbol \";\" in expression"
}
```

Object events and scripts are decomposed where the symbol allows it; an
unrecognised symbol is still reported verbatim rather than dropped. Duplicates
are collapsed, the list is capped at 50 with `diagnosticsTruncated` and
`errorCount` reporting the real totals, and messages are scrubbed of anything
path-shaped before they leave the server.

Diagnostics also ride on the **error** envelope, so a build that times out or is
cancelled still tells the caller what the compiler had found before time ran
out — the case where a bare `TIMEOUT` would be least useful.

Exactly these two tools. No resources, no prompts, no apply, verify-text,
rollback, import, Asset Forge or Asset-GM Bridge operation.

## Configuration

```text
DEVLAB_GM_PROJECTS_DIR=<ABSOLUTE_PROJECTS_ROOT>
DEVLAB_GM_ALLOW_IGOR=1
DEVLAB_GM_IGOR=<ABSOLUTE>\Igor.exe
DEVLAB_GM_RUNTIME=<ABSOLUTE_RUNTIME_DIR>
DEVLAB_GM_PROJECT_TOOL=<ABSOLUTE>\ProjectTool.exe
DEVLAB_GM_USER_DIR=<ABSOLUTE_GAMEMAKER_USER_DIR>
DEVLAB_GM_EVIDENCE_ROOT=<RELATIVE_PATH>   # optional
DEVLAB_GM_TIMEOUT_MS=<30000..900000>      # optional, default 180000
```

**The toolchain comes only from the environment.** No tool contract has a field
for an executable, runtime, user directory, worker, runtime kind, verification
level or timeout, so a caller cannot point Igor anywhere or widen what it does.
The tool schemas are closed; an unrecognised key is rejected rather than
ignored.

`DEVLAB_GM_ALLOW_IGOR` has no default. Without it every build fails closed with
`GM_IGOR_NOT_ENABLED`, so starting a compiler is always a deliberate act by
whoever configured the host.

Igor paths are additionally checked by the adapter: both must be absolute and
named `Igor.exe` and `ProjectTool.exe`.

## Safety properties

- **No project mutation.** The build reads the project; evidence is written to
  `DEVLAB_GM_EVIDENCE_ROOT`, which must resolve outside the project being built.
- **Fingerprint bound.** The caller must pass the project's current fingerprint;
  a stale one is refused before Igor starts.
- **Foreign Runners are preserved, not killed.** If a Runner is already running
  the build is refused with `RUN_BLOCKED_EXTERNAL_RUNNER` and the existing
  process is left alone.
- **Owned processes only.** Termination requires PID *and* OS creation token
  *and* executable to still match the process this server started.
- **Bounded.** The timeout is server-configured and clamped to 30s–900s; on
  expiry the owned process is terminated and `TIMEOUT` is returned.
- **Sanitized errors.** Adapter codes map to fixed public messages; unknown
  failures collapse to `GM_INTERNAL_ERROR`. Nothing echoes back a path.

## Platform

Windows only. Process ownership relies on the Windows CIM process inventory to
acquire an OS creation token; on other hosts the adapter cannot establish
ownership, so this server refuses up front with `GM_PLATFORM_UNSUPPORTED`
rather than running a process it could not prove it owns.

## Build, check and start

```text
corepack pnpm --filter @tanguito/gamemaker-compile-mcp build
corepack pnpm --filter @tanguito/gamemaker-compile-mcp doctor
corepack pnpm --filter @tanguito/gamemaker-compile-mcp start
```

The doctor never starts Igor. It verifies the server, the two tools and the
absence of other surfaces, and reports missing toolchain configuration as
warnings.

## Local client template

```json
{
  "mcpServers": {
    "gamemaker-compile-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PACKAGE_PATH>/dist/index.js"],
      "env": {
        "DEVLAB_GM_PROJECTS_DIR": "<ABSOLUTE_PROJECTS_ROOT>",
        "DEVLAB_GM_ALLOW_IGOR": "1",
        "DEVLAB_GM_IGOR": "<ABSOLUTE>\\Igor.exe",
        "DEVLAB_GM_RUNTIME": "<ABSOLUTE_RUNTIME_DIR>",
        "DEVLAB_GM_PROJECT_TOOL": "<ABSOLUTE>\\ProjectTool.exe",
        "DEVLAB_GM_USER_DIR": "<ABSOLUTE_GAMEMAKER_USER_DIR>"
      }
    }
  }
}
```

## Verification scope

The real-Igor test lane runs only where a Windows GameMaker toolchain is
configured; CI is Ubuntu with no GameMaker and exercises the fail-closed lanes
instead. A skip means "not verifiable on this host", never "assumed to pass".

Verified locally against GameMaker LTS 2026 with runtime `2024.14.3.260` on a
disposable copy of `fixtures/gamemaker/hermes-bridge-pilot`: Igor exit 0,
`COMPILE_VALID` pass, project tree byte-identical before and after, and no Igor
or Runner process left behind.
