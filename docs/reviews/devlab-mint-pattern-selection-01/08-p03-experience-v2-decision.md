# P-03 `experience.json` v2 decision

Verdict: `APPROVED / PRODUCT_CAPSULE_V2`

## Decision

Define a concise product capsule with the exact required groups: identity, entry capability, session, primary input, deterministic simulation, lifecycle, local asset registry, offline policy, and provenance.

Deliverables:

- JSON Schema draft 2020-12;
- a dependency-free runtime validator with readable path-based errors;
- minimum and complete examples;
- capability-registry cross-check helper;
- explicit v2 version policy.

## Version policy

- `schemaVersion: 2` is exact for this validator.
- Backward-compatible clarifications may update documentation and validator messages without changing the schema number.
- Any field addition, removal, or meaning change requires schema v3 because v2 deliberately uses a closed key set.
- A v2 validator rejects unknown schema versions instead of guessing.

## Capability relationship

`entryCapability` is an identifier from `capabilities/hermes-capability-manifest.json`. Capsule validation is independent of that file; the explicit cross-check receives the allowed capability IDs so tooling can produce a clear error without coupling the package to repository layout.

The capsule describes product-facing contracts. It does not duplicate encounter data, render configuration, balance, maps, or internal simulation state.

## Resource base

`assetsRegistry` and `provenance.manifest` are resolved only against an explicit experience distribution root supplied by the consumer. They are never implicitly relative to the directory containing the capsule JSON. The packaged examples declare the package root as that distribution root and tests load both resources through it.
