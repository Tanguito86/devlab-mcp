# 16 - Registry validation

The governed registry now has 15 unique entries: the previous 14 plus
`ASSET_GM_BRIDGE_V1`. The new entry is `IMPLEMENTING` until independent review
and final integration. Its evidence hash points to this builder-stage handoff.

The bridge contract declares one public capability, zero Hermes tools, offline
runtime, no destructive action, dependencies `ASSET_FORGE` and `GM_ADAPTER`,
16 public errors, explicit gates and roots, and the JSON schema.

The six existing GM capabilities and eight Asset Forge public operations are
unchanged. `node --test tests/hermes-capability-registry.test.mjs` passes 5/5,
including normalized evidence SHA-256 checks for all 15 entries.

The adapter public barrel still exposes only the governed adapter class and
contracts. The documented `./internal` subpath is consumed only by the in-repo
bridge and is never re-exported to bridge callers.
