# Aseprite Ingest MCP

Local stdio MCP server that turns Aseprite sources into Asset Forge catalog
entries, over `@tanguito/devlab-aseprite-ingest`.

Fifth tier of the GameMaker stack, and the front of the pipeline:

```
.aseprite → aseprite-ingest-mcp → Forge catalog → gamemaker-asset-mcp → project
```

It is a separate package and server for the same reason the build tier is: it
**starts a third-party process**. Enabling asset imports should not implicitly
enable running Aseprite.

## Public tools

- `aseprite_status` — can this host ingest? Executable, source root, catalog
  root, the write opt-in and the available origin presets. Starts nothing and
  returns **no filesystem path**.
- `aseprite_inspect` — one source's frame count, canvas size, colour format and
  frame timings. Runs Aseprite headlessly against a throwaway scratch directory
  and writes nothing to the catalog.
- `aseprite_ingest` — export the frames and write a spec, artifact manifest and
  PNGs into the catalog layout, returning a **DRAFT** catalog entry.

- `aseprite_publish` — register an already-ingested asset in the catalog
  **index** at the status you ask for, `DRAFT` or `APPROVED`. Defaults to a dry
  run.

Exactly these four. No resources, no prompts.

## Approval is autonomous, and bounded by verification

Promotion to `APPROVED` — the status the Asset-GM bridge requires before an
import — used to be a human decision, and the code said so. The repository
owner asked for it to be available without one, so it is. The change is
recorded in `capabilities/aseprite-ingest-mcp-v1.json` and asserted by the
registry test, so it shows up in a diff rather than drifting quietly.

What replaces the human review is verification, not trust:

- the catalog entry is **rebuilt from the spec and artifact manifest on disk**,
  never accepted from the caller;
- every exported frame's digest and byte length must still match what the
  manifest recorded at ingest, so an asset whose pixels changed after ingest
  cannot be published at all — the check a person skimming a JSON file would
  not have performed;
- the manifest must contain exactly the five ingest gates (`SPEC`, `BUDGET`,
  `PNG`, `DETERMINISM`, and `LIFECYCLE`) and every one must be `PASS`;
- the catalog header is rewritten to what the bridge's validator demands, so a
  publish can never leave an index that fails to load and takes every other
  asset down with it;
- and every promotion records durable `PREPARED` and `COMMITTED` phases in
  `assets/catalog/approvals.jsonl` before the atomic catalog replacement can
  expose `APPROVED`; concurrent catalog publishers are serialized, while an
  out-of-band catalog edit aborts the publish instead of being overwritten.

Ingest itself is unchanged: it still emits `DRAFT` and still does not register
its own entry.

## Sources are confined, and that is new here

The underlying library takes an **absolute** source path, because its CLI caller
is trusted. A tool caller is not. This server accepts only a path **relative to
`DEVLAB_ASEPRITE_SOURCE_ROOT`**, resolved with the adapter's path policy:
traversal, drive letters, UNC paths, NUL bytes, reserved names and symlinked
segments are all refused, and the file must actually be an `.aseprite` or
`.ase`. The contract has no way to express an absolute path at all.

The boundary is checked **before the toolchain is resolved**, so a hostile path
is refused for the right reason even on a host with no Aseprite installed —
which is where CI runs, and where a weaker ordering would let the test pass for
free.

## Configuration

```text
DEVLAB_ASEPRITE=<ABSOLUTE>\Aseprite.exe
DEVLAB_ASEPRITE_SOURCE_ROOT=<ABSOLUTE_ART_ROOT>
DEVLAB_ASEPRITE_REPO_ROOT=<ABSOLUTE_ROOT_OWNING_assets/>
DEVLAB_ASEPRITE_WRITE=1
```

The executable comes only from `DEVLAB_ASEPRITE`; no tool argument names a
binary, and the argument arrays are built inside the library, so `--script` —
arbitrary Lua execution — is unreachable through this surface.

`DEVLAB_ASEPRITE_WRITE` has no default. Without it `aseprite_ingest` fails
closed with `GM_INGEST_WRITE_NOT_ENABLED`, and `aseprite_status` reports the
flag so a caller can tell before it tries.

## What ingesting guarantees

**The determinism gate is earned.** Every ingest exports the frames twice into
separate scratch directories and refuses to write unless the two sets are
byte-identical.

**Ingested implies importable.** The spec is validated with the asset bridge's
own `validateSpriteSpec` before anything is written.

**Ingest itself never emits an approved entry.** Entries are emitted `DRAFT`.
A later, explicit `aseprite_publish` call can promote that disk-backed result
to `APPROVED` only after rebuilding the entry, rechecking every frame digest
and the exact ingest-gate set, and durably recording the two-phase approval
audit before the catalog changes. The publish contract accepts either `DRAFT`
or `APPROVED`; approval is autonomous
but remains a separate, verified operation from ingest.

**RGBA8888 and one canvas size only.** Indexed, greyscale and trimmed sources
are refused with a clear message rather than silently converted.

## Build, check and start

```text
corepack pnpm --filter @tanguito/aseprite-ingest-mcp build
corepack pnpm --filter @tanguito/aseprite-ingest-mcp doctor
corepack pnpm --filter @tanguito/aseprite-ingest-mcp start
```

The doctor never starts Aseprite.

## Local client template

```json
{
  "mcpServers": {
    "aseprite-ingest-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PACKAGE_PATH>/dist/index.js"],
      "env": {
        "DEVLAB_ASEPRITE": "<ABSOLUTE>\\Aseprite.exe",
        "DEVLAB_ASEPRITE_SOURCE_ROOT": "<ABSOLUTE_ART_ROOT>",
        "DEVLAB_ASEPRITE_REPO_ROOT": "<ABSOLUTE_ROOT>",
        "DEVLAB_ASEPRITE_WRITE": "1"
      }
    }
  }
}
```

## Verification scope

The real-Aseprite lane runs only where `DEVLAB_ASEPRITE` points at a working
install; CI has none and exercises the boundary and fail-closed lanes instead. A
skip means "not verifiable on this host", never "assumed to pass".

Verified locally with Aseprite 1.3.18.1: inspection of a nested source, a full
ingest whose PNG digests match the files on disk, a re-ingest reproducing
identical digests, writes confined to the catalog root, and eight hostile source
paths refused with `GM_SOURCE_NOT_ALLOWED`.
