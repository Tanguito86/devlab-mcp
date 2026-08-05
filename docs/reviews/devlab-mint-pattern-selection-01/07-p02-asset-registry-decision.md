# P-02 asset registry decision

Verdict: `APPROVED / ADDITIVE_LOCAL_REGISTRY_V1`

## Decision

Add a small, dependency-free registry contract to the Topdown Shooter Kit. It is an additive product/runtime boundary, not a replacement for procedural catalogs or benchmark manifests.

The registry core is platform-neutral:

- validation is pure TypeScript;
- file access is injected through an `AssetByteLoader`;
- SHA-256 uses the standard Web Crypto API;
- paths are canonical relative POSIX paths;
- remote URLs, network-path references, encoded traversal, query strings, and fragments are rejected;
- IDs and runtime paths are unique;
- entries serialize in canonical `assetId` order;
- byte size and hash are verified from actual bytes;
- provenance metadata and runtime flags are mandatory.

The schema and examples live beside the package. A Node test adapter reads local fixture bytes, while browser consumers may provide their own local loader. No network implementation exists. Integrity verification covers local bytes, size, and SHA-256; `source.kind` and `source.reference` are mandatory auditable metadata, not an assertion that DevLab independently verified a license or derivation chain.

## Compatibility

Existing catalogs remain authoritative for their current consumers. Adoption is per experience through `assetsRegistry` in P-03. No migration or destructive rewrite is authorized.
