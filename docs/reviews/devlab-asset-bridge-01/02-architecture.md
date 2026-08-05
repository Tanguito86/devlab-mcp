# 02 - Architecture

`ASSET_GM_BRIDGE_V1` is a governed composition package:

```text
ASSET_FORGE catalog and production contracts
  -> @tanguito/devlab-asset-gm-bridge
  -> six governed operations of @tanguito/devlab-gm-ide-adapter
```

The public bridge class exposes `status`, `inspectAsset`, `inspectTarget`,
`planImport`, `applyImport`, `verifyImport`, and `rollbackImport`. It exposes no
raw Asset Forge, filesystem, GameMaker, Igor, or Hermes tool.

The package depends only on the two workspace packages. Runtime is offline and
uses Node built-ins. The GameMaker adapter root barrel remains the same six
governed operations. A documented `./internal` composition subpath provides
path resolution, plan hashing, and process inventory types to the in-repo
bridge; it is not exported by the bridge and grants callers no raw authority.

Planning produces ten allowlisted files for the two-frame pilot: `.yyp`,
`.resource_order`, three fixture GML files, one sprite `.yy`, two compiler
composites (`sprites/<name>/<frame>.png`), and two editable layer images
(`sprites/<name>/layers/<frame>/default.png`). Both image forms are required by
the installed GameMaker resource model; Igor otherwise substitutes blank
textures.

The adapter owns locking, staging, backups, WRITE_AHEAD, fsync, atomic rename,
process ownership, verification, recovery, and rollback. The bridge owns the
APPROVED lifecycle gate, Asset Forge hash/provenance validation, sprite budget,
GameMaker resource rendering, minimal project splices, manifest, and binding.

No consumer project or production asset is in scope.
