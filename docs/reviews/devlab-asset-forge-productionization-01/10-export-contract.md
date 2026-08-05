# Export contract

The public `AssetExporter` contract exposes `id`, `validate(request)` and `export(request)` without consumer or renderer internals. `CANONICAL_JSON`, `GLTF`, and `GLB` are implemented. `ATLAS_BRIDGE_MANIFEST` is schema-only. Every result binds format, bytes, SHA-256, byte size, source and license.
