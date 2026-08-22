# GameMaker Asset MCP

Local stdio MCP server that imports **Asset Forge** sprites into GameMaker
projects, over the governed `ASSET_GM_BRIDGE_V1` capability.

Fourth tier of the GameMaker stack, in its own package and server so that
enabling inspection, code writes or builds never implicitly enables pulling
assets into a project:

| Server | Tier | Writes the project | Starts a process |
|---|---|---|---|
| `gamemaker-dev-mcp` | read / plan / author | no | no |
| `gamemaker-write-mcp` | write / rollback | yes | no |
| `gamemaker-compile-mcp` | build | no | **yes** |
| `gamemaker-asset-mcp` | asset import | yes | no |

## Public tools

- `asset_status` — is this asset approved, is the project ready, are there
  pending import transactions, and is writing enabled on this host?
- `asset_inspect` — a catalog sprite's dimensions, frames, bounding box, budget
  verdict and lifecycle status. Touches no project.
- `asset_plan_import` — bind an **APPROVED** sprite to a project and return an
  immutable plan summary with its `planHash` and `bindingHash`.
- `asset_apply_import` — import inside a locked transaction with a verified
  byte-exact backup. **Defaults to a dry run.**
- `asset_rollback_import` — restore from that backup and report whether the
  restoration was byte-exact.

Exactly these five. No resources, no prompts.

## What is deliberately absent

**Compilation.** The bridge can verify an import by compiling, but that belongs
to `gamemaker-compile-mcp`, which is separately gated because it starts Igor and
launches the game. This server's verification policy is fixed in code, so no
caller can request a compile through it.

**Pilot instrumentation.** The bridge supports a mode that rewrites the GML of a
fixture-only object; it is scaffolding for the bridge's own pilot and would
overwrite object code in a real project. The mode is pinned to `NONE` in the
server and has **no field in any tool contract**.

## Configuration

```text
DEVLAB_GM_PROJECTS_DIR=<ABSOLUTE_PROJECTS_ROOT>
DEVLAB_GM_ASSET_CATALOG=<ABSOLUTE>/assets/catalog/asset-catalog.json
DEVLAB_GM_ASSET_REPO_ROOT=<ABSOLUTE_ROOT_OWNING_assets/>
DEVLAB_GM_ASSET_WRITE=1
DEVLAB_GM_EVIDENCE_ROOT=<RELATIVE_PATH>   # optional
```

`DEVLAB_GM_ASSET_WRITE` has no default. Without it, `asset_apply_import` and
`asset_rollback_import` fail closed with `GM_ASSET_WRITE_NOT_ENABLED`, so
importing into a project is always a deliberate host decision. `asset_status`
reports the flag, so a caller can tell before it tries.

## The plan never crosses the transport

`asset_plan_import` stores its manifest, binding record and plan as evidence and
returns only hashes and a change summary. `asset_apply_import` re-derives the
plan from that evidence and checks the hashes match.

This differs from the write tier, where the plan travels by value, and the
reason is the binding chain: the bridge re-reads the **asset** at apply time and
refuses if its spec, export or manifest changed since planning. Passing a plan
by value would let a caller apply against an asset that had since moved.

## Safety

- Only `APPROVED` catalog assets can be planned; a `DRAFT` asset is refused at
  the gate and never reaches a plan.
- Path safety, case and Unicode collision detection, asset budgets, TOCTOU
  checks and byte-exact rollback all come from the bridge and adapter unchanged.
- Errors carry the bridge's public, path-free vocabulary. Nothing echoes a host
  path back to the caller.
- The tool schemas are closed; an unrecognised key is rejected rather than
  ignored.

## Build, check and start

```text
corepack pnpm --filter @tanguito/gamemaker-asset-mcp build
corepack pnpm --filter @tanguito/gamemaker-asset-mcp doctor
corepack pnpm --filter @tanguito/gamemaker-asset-mcp start
```

## Local client template

```json
{
  "mcpServers": {
    "gamemaker-asset-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PACKAGE_PATH>/dist/index.js"],
      "env": {
        "DEVLAB_GM_PROJECTS_DIR": "<ABSOLUTE_PROJECTS_ROOT>",
        "DEVLAB_GM_ASSET_CATALOG": "<ABSOLUTE>/assets/catalog/asset-catalog.json",
        "DEVLAB_GM_ASSET_REPO_ROOT": "<ABSOLUTE_ROOT>",
        "DEVLAB_GM_ASSET_WRITE": "1"
      }
    }
  }
}
```

Register it alongside the other tiers only when asset imports are actually
intended, and prefer a host that confirms each write.
