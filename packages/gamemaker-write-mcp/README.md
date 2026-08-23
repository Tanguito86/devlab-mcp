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
  It reloads the transaction's verified manifest and re-applies
  `DEVLAB_GM_WRITE_ALLOW` to every recorded path before restoring anything.

- `gamemaker_create_project` fixes `GM_CREATE_PROJECT_V1`. Writes the two files
  an empty GameMaker project consists of, byte-identical to what ProjectTool's
  `PROJECT NEW` produces, at an absent path whose real parent directory already
  exists. **Defaults to a dry run.** Follow it with `gamemaker_inspect` on the
  read tier to get the fingerprint every plan tool requires.

The server registers exactly these four tools. It has no resources and no
prompts, and exposes no compile, run, Igor, Runner, Asset Forge, Asset-GM Bridge,
import, or command-execution operation. `COMPILE_VALID` and `RUNTIME_VALID` are
unreachable: the verification policy is fixed in the server and the tool
contracts have no field for a toolchain.

The adapter's fault-injection hook (`faultAt`) is a test seam and is rejected by
the tool contract.

### Creating a project is the one write without a plan

Every other tool here binds to a fingerprint and can be rolled back. A project
that does not exist yet has neither: nothing to fingerprint, and nothing to
restore. What remains is the safety that still applies -- the path policy, the
env-scoped write allowlist, an explicit `confirm`, and a refusal to replace any
existing path (including an empty directory). Parent directories are never
created implicitly. Removing a project is **not** offered:
deleting is the destructive tier's business, and this server has none. Undoing a
creation means deleting the directory yourself.

Creation prepares a server evidence ledger outside the target, claims the absent
target with an exclusive `mkdir`, and then durably records the exact request, an
ownership nonce, physical parent/target/ledger identities, and the ordered file
hashes in that external ledger. The marker inside the new project is secondary:
it is never sufficient authority by itself, even if every calculable field in it
was forged.

Before each create-only promotion the server fsyncs a separate `WRITING` phase
record. File bytes are first fsynced to a unique evidence-side stage and then
hard-linked create-only into the project, so an interruption cannot expose a
partially written GameMaker file. A retry of the same request can validate and
resume missing or exact files; an unknown entry, a changed byte, a different
request, or an expected file without its phase record is refused and preserved.
Failures never trigger path-based cleanup of authored files. The target can be
visible in a recoverable `PREPARING` state until a later identical request
finishes it. Once every file and entry is validated, a durable finalizing record
makes removal of the target metadata resumable. The ledger uses separate,
immutable `PREPARING` and `COMPLETED` records; the latter remains as a terminal
receipt. A retry after the final marker was removed or its response was lost is
acknowledged only when the completed project is still byte-exact. A completed
receipt never reopens an emptied or altered directory for writing.

There is one deliberately fail-closed crash window: portable Node cannot make
`mkdir(target)` and creation of the external authority record atomic. A crash
between those operations leaves an empty directory with no authority record, so
a retry preserves and refuses it exactly as it would any other pre-existing
directory. An empty directory introduced by another actor is likewise never
replaced. A crash while producing a unique evidence-side stage may leave that
stage as inert recovery evidence, but a later retry uses a fresh stage and no
partial file is promoted into the project.

Create-only promotion requires native hard-link support. The server checks that
the evidence ledger and target parent are on the same filesystem before claiming
the target. If the filesystem or its policy still refuses a hard link, creation
fails closed in `PREPARING`; it never falls back to a copying write that could
expose partial content.

The evidence root is part of the server's trust boundary. Project targets are
refused when they overlap it, and the MCP surface never exposes a way to write
the ledger. An operator must not grant project actors an independent write path
to that evidence directory and then treat its receipts as provenance.

Node does not expose portable directory-handle-relative `openat`/no-follow APIs.
The server revalidates physical directory identity and durable metadata
immediately around each feasible mutation, but it does not claim to eliminate
the final hostile symlink/junction race against an actor concurrently rewriting
the filesystem tree.

Until this existed the stack could not start a game. Every tool took an existing
`projectPath`, so the first file of any new project had to be written by hand,
outside the governed surface -- which is exactly the thing the surface is for.

## Configuration

```text
DEVLAB_GM_PROJECTS_DIR=<ABSOLUTE_PROJECTS_ROOT>
DEVLAB_GM_WRITE_ALLOW=<PATH_LIST or *>
DEVLAB_GM_EVIDENCE_ROOT=<RELATIVE_PATH>   # optional; transactions and creation receipts
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

The write server also fixes the plan policy to canonical-base64 UTF-8 text in
`gml`, `json`, `resource_order`, `yy`, and `yyp` files. Its allowlist must match
the planned file identities exactly, with no extra or duplicate aliases. A
caller-fabricated plan cannot add a new extension, binary payload, or
action/before-state mismatch. Binary asset import remains on the separate asset
bridge surface.

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
  allowlist, the server's fixed text-extension policy, and
  `DEVLAB_GM_WRITE_ALLOW`;
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
