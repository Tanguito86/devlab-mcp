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

Exactly these three. No resources, no prompts.

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

**Ingest never approves its own output.** Entries are emitted `DRAFT`; the
bridge imports only `APPROVED`, so promotion stays a human decision. The tool
contract cannot express any other status.

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
