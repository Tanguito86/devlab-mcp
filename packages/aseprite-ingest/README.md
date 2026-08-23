# DevLab Aseprite Ingest

Turns an Aseprite source into an Asset Forge catalog entry the
`asset-gm-bridge` can import into a GameMaker project.

This is the front of the pipeline. It closes the loop that the three GameMaker
MCP tiers open:

```
.aseprite  →  ingest  →  Forge catalog  →  asset-gm-bridge  →  GameMaker project
                                                             ↳ byte-exact rollback
```

A library plus a CLI, deliberately **not** an MCP server: ingest starts a
third-party process and writes into a repository's asset tree, which is a
different authorization question from inspecting or editing a project. Exposing
it to an agent deserves its own decision.

## Use

```text
DEVLAB_ASEPRITE=<ABSOLUTE>\Aseprite.exe
devlab-aseprite-ingest --source hero.aseprite --repo-root . --asset-id hero --version 1.0.0 --origin bottom-centre
```

| Flag | Meaning |
|---|---|
| `--source` | the `.aseprite` / `.ase` file |
| `--repo-root` | root that owns `assets/`; every write is confined inside it |
| `--asset-id` | lowercase kebab-case identity |
| `--version` | semantic version |
| `--origin` | `top-left`, `top-centre`, `centre` (default), `bottom-centre` |
| `--timeout-ms` | 5000–600000, default 120000 |

Emitted layout:

```text
assets/pilots/<assetId>/<version>.spec.json
assets/builds/artifacts/<assetId>/<version>/artifact-manifest.json
assets/builds/artifacts/<assetId>/<version>/exports/<assetId>-<version>_<i>.png
```

The catalog entry is printed on stdout for you to merge into
`assets/catalog/asset-catalog.json`.

## What this guarantees

**The determinism gate is earned, not asserted.** Every ingest exports the
frames **twice**, into separate scratch directories, and refuses to write
anything unless the two sets are byte-identical. `DETERMINISM_GATE: "PASS"` in
the artifact manifest therefore reports a check that actually ran. Aseprite
1.3.18.1 is byte-stable across runs in practice; this gate is what notices if
that ever stops being true.

**Ingested implies importable.** The spec is validated with the bridge's own
`validateSpriteSpec` before anything is written. If the bridge would reject it,
the ingest fails instead of leaving an unusable asset in the catalog.

**Ingest never approves its own output, and never registers it either.** The
catalog entry is emitted with status `DRAFT` and handed back; putting it in the
index is `publishAsepriteAsset`'s job.

**Publishing can grant `APPROVED` without a human.** That was previously
reserved for one, and the repository owner asked for it to be available without
one; the change is deliberate and is recorded in the capability manifest. What
replaces the human review is verification rather than trust:

- the entry is **rebuilt from the files on disk**, not accepted from the caller,
- every exported frame's digest and byte length must still match what the
  artifact manifest recorded at ingest, so an asset whose pixels changed after
  ingest cannot be published at all,
- any ingest gate that did not pass blocks the publish,
- and every promotion is appended to `assets/catalog/approvals.jsonl`, which a
  republish cannot rewrite.

The catalog header is written rather than carried through, so a publish can
never leave an index the bridge is unable to read.

**RGBA8888 only.** Indexed and greyscale sources are refused with a clear
message rather than silently converted, because the GameMaker sprite gate
requires four channels. Frames must also share one canvas size; trimmed sheets
are rejected.

## Safety

- **The executable comes only from `DEVLAB_ASEPRITE`.** No API or CLI argument
  names a binary, and the basename must be Aseprite's.
- **No caller-supplied flags.** Argument arrays are constructed inside this
  package, so `--script` and other code-execution switches are unreachable
  through this surface.
- **Writes are confined.** Destinations are resolved with the adapter's
  `resolveInsideRoot`, so an ingest cannot write outside `--repo-root`, and
  symlinked destinations are rejected.
- **Bounded.** Every Aseprite invocation runs under a clamped timeout.
- Scratch export directories are removed even when an ingest fails.

## Origin

`--origin` reaches the engine. Verified by importing a sprite through the
bridge and asking the running game: a spec origin of (32, 64) produces
`sprite_get_xoffset() == 32` and `sprite_get_yoffset() == 64`.

This was broken until `asset-gm-bridge` 1.2.0, which hard-coded the origin and
silently gave every imported sprite a pivot of (0, 0).

## Verification

The real-Aseprite lane runs only where `DEVLAB_ASEPRITE` points at a working
install; CI has none and exercises the pure lanes instead. A skip means "not
verifiable on this host", never "assumed to pass".

Verified locally with Aseprite 1.3.18.1 against
`fixtures/aseprite/ingest-pilot.aseprite` (16×24, 3 frames): deterministic
re-ingest, a spec the bridge accepts, and a full import into a disposable
GameMaker project where the PNG bytes on disk match the Aseprite export digest
and rollback returns the project to its exact fingerprint.
