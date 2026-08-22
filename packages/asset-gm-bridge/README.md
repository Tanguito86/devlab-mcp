# @tanguito/devlab-asset-gm-bridge

Governed composition bridge between the DevLab **Asset Forge** catalog and the
**GameMaker IDE adapter**. Public capability: `ASSET_GM_BRIDGE_V1`.

The bridge composes only the public Asset Forge operations/contracts and the
public six-operation gm-ide-adapter surface. It exposes no raw filesystem,
GameMaker, Igor or Asset Forge tools.

- Deterministic sprite imports (PNG + .yy + .yyp + .resource_order) with
  stable identities (no UUIDs), canonical immutable manifests and a full
  SHA-256 plan binding (`STALE_OR_TAMPERED_PLAN` on any drift).
- **Any** catalog sprite, not just the synthetic pilot asset. Specs are checked
  by the generic `validateSpriteSpec` (closed field set, semantic version,
  bounded dimensions and frame count, origin inside bounds, explicit collision,
  compression and budget policies). `palette` stays optional so the pilot
  beacon spec still validates.
- Imports touch **only** the sprite: `.yy`, the two images per frame, the
  `.yyp` and the `.resource_order`. Rewriting the pilot object's GML is opt-in
  via `instrumentation: "PILOT_BEACON_V1"` and is refused unless that object
  already exists. The default, `NONE`, never touches object code.
- APPROVED-only lifecycle gate (all six catalog states tested; no bypass).
- Reuses the gm-ide-adapter transaction model: lock, WRITE_AHEAD, recovery,
  byte-exact rollback, TOCTOU and concurrency protection.
- Explicit asset budgets evaluated before any write.
- Path safety reuses `safeRelativePath`/`resolveInsideRoot` and adds
  case/Unicode (NFKC) collision detection.

Sprint evidence: `docs/reviews/devlab-asset-bridge-01/`.
