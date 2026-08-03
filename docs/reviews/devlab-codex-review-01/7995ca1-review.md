# Independent review of 7995ca1

## Disposition

`7995CA1_HOTFIX_REQUIRED` on first review, then
`7995CA1_APPROVED_WITH_CODEX_HARDENING`.

The commit adds the synthetic Three.js fixture, fixed capture contract,
localhost server, deterministic runner, tests, and documentation. It contains
no product content and no dependency on the removed pnpm shim. Three.js is
fixed at `0.185.1`.

## Corrected defects

- Network admission now compares parsed origins, not string prefixes, and any
  blocked external request fails the capture.
- Fixture, output, served-file, vendor, symlink, and junction containment is
  fail-closed, including unsafe ancestor segments.
- PNG signature/IHDR dimensions, RGBA length, requested viewpoint uniqueness,
  and duplicate output names are validated before acceptance.
- Determinism compares the actual recursive output file sets.
- Seed sensitivity uses declared affected viewpoints; unrelated pixel diff is
  measured rather than inferred.
- A/B variants run in one browser, page, and scene without rebuilding or
  advancing the fixed simulation.
- CPU submit time, synchronized render/readback time, rAF interval, and FPS are
  measured separately; no GPU-time claim is made.
- Resize evidence now measures camera, render targets, composer, canvas, and
  DPR instead of copying a canvas boolean into every gate.
- Context restoration captures from the same restored page and records a
  stable session identifier.

The contract remains version 1 with the required methods. `setVariant` is an
optional fixture capability used only when variant capture is requested.

## Provenance

A read-only 8-token shingle comparison covered the 15 files added by the
commit against every hash-verified file in `threejs-skills`, `jungle-trail`,
and `awesome-llm-apps`. The maximum local-file overlap ratio was 1.47%, in the
synthetic scene versus generic Three.js postprocessing examples. Manual
inspection found only ordinary API/import patterns, not substantive copied
text or implementation.
