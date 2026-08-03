# Intake integrity review

Codex reviewed the complete Hermes evidence set and independently compared its
source manifest with the physical checkout.

```text
TRACKED_FILES: 112
MANIFEST_ENTRIES: 112
MISSING_FILES: 0
EXTRA_TRACKED_FILES: 0
SHA256_MISMATCHES: 0
SKILLS: 9
SYMLINKS_OR_JUNCTIONS: 0
BROKEN_REQUIRED_EVIDENCE_FILES: 0
RESULT: INTAKE_PARTIALLY_CONFIRMED
```

Confirmed findings include the exact detached pin, root MIT text, nine skills,
47 reference/checklist files, external generators, installer, scaffold, seeded
RNG, unconditional test hooks, variable timestep, dead disposal helper,
Playwright templates and browser inspector.

Corrections:

- Hermes compared against older DevLab `38ae493`; this review uses `2879485`,
  where native WebGPU/TSL/compute/post/device-loss are already verified.
- `install.sh --prune-managed` is not safe enough for adoption. A same-named
  preexisting skill skipped during install is still written to the managed
  manifest and can later be deleted if the upstream skill disappears.
- The inspector's alpha sample count is not a meaningful nonblank percentage
  for an opaque canvas. Its variance/color tests remain a useful smoke signal.
- The inspector permits software fallback with a warning. It cannot own native
  performance acceptance; DevLab's hardware adapter gate remains authoritative.

Hermes evidence was not modified.
