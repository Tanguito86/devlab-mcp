# 07 - GameMaker import plan

The v1 plan contains ten sorted, unique, relative allowlisted paths. It binds
the exact Asset Forge spec, export and artifact manifest; the target project
identity, snapshot and HEAD; the immutable bridge manifest; the adapter plan;
all planned bytes; resource name; transaction id; and bridge version.

The `.yyp` and `.resource_order` changes are minimal text splices. Resource
identity is stable by name/path and no UUID is generated. The sprite `.yy`
matches installed GameMaker strict serialization: `GMSprite v2`,
`GMSpriteFrame v1`, `GMSequence v1`, five nine-slice tile modes, uint swatches,
compiler composites, and editable layer PNGs.

Identical workspaces yield byte-identical plans. PNG, manifest, lifecycle,
HEAD, target, allowlist, resource-name, or path-normalization changes invalidate
the existing plan with `STALE_OR_TAMPERED_PLAN`.
