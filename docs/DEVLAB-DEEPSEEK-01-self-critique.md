# DEVLAB-DEEPSEEK-01 — Self-critique and resolution

Date: 2026-08-03
Agent: DeepSeek (Hermes), sprint DEVLAB-DEEPSEEK-01
Purpose: second, separate pass before commit. Every answer below was
re-verified against the working tree, not asserted from memory.

## 1. Did I create duplicated infrastructure?

**No.** The existing GENERIC-LLM-REF-01 design was extended in place:
`scripts/validate-external-source.mjs` keeps every legacy export and check
name (`SOURCE_ID`, `validateManifest`, `validateRepositoryIsolation`, ...),
and the new source of truth is a single `external-sources/registry.json`.
The alternative — a second validator or a per-source fork — was explicitly
rejected. Evidence: the original 15 tests run unmodified and pass.

## 2. Did I trust file names without checking them?

**No.** Every allowlisted path was confirmed to exist at the pin by
re-hashing from the physical checkouts in `%LOCALAPPDATA%\DevLab\external-sources`
(11/11 threejs-skills files, 8/8 jungle-trail files, including LICENSE), and
the manifest `verified_files` were computed from those checks, not copied
from the OPS-EXTERNAL-REPOS-01 report. The validator itself enforces this
(`allowlisted_paths_exist`, `verified_file_hashes`).

## 3. Did I treat the declared license as verified?

**No.** threejs-skills declares MIT in its README but has no LICENSE file;
the manifest records `status: UNRESOLVED`, `reuse_authorized: false`, and the
validator now has a dedicated check (`license_unresolved_required`) that
rejects any attempt to mark it verified. jungle-trail's MIT was verified
materially (file present, SPDX text detected, SHA-256 recorded) before being
marked VERIFIED. A test asserts the UNRESOLVED recording stays.

## 4. Does any test depend on my personal checkout?

**No.** All tests either validate manifests offline or build **synthetic
fixtures** in a temporary directory (`git init` + local commits, no network).
The real external checkouts are only ever read by the CLI
(`--checkout`/`--configured-checkout`) and are never modified by any test.
`tests/external-source-adversarial.test.mjs` creates and destroys its own
repos under `os.tmpdir()`.

## 5. Did any absolute path get versioned?

**No.** `git grep` for drive letters and `C:\` in the new files returns
nothing; all paths in manifests, registry, and code are registry-relative
(`README.md`, `skills/.../SKILL.md`, ...). The validator rejects absolute
paths in manifests (`safe_component_paths`), and the local cache path lives
only in the ignored `.external-sources.local.json`.

## 6. Could the registry execute external code?

**No.** `execution_policy` must be all-false (validator check
`external_execution_disabled`), `integration_mode` is restricted to
reference-only values, `automatic_updates` must be false, and the validator
itself only runs `git` read-only commands (`rev-parse`, `status`,
`symbolic-ref`, `remote get-url`) against checkouts — never scripts inside
them. The CLI has no eval/exec of upstream files.

## 7. Can the validator escape the checkout?

**No.** Paths are validated by `isSafeRegistryPath` (no `..`, no absolute
paths, no backslashes, no drive letters, no colons — closing NTFS ADS too —
no wildcards), then joined under the checkout root. File inventory uses
`lstatSync`, which reports symlinks and junctions on Windows as unsafe
entries; a junction-escape adversarial test exists and passes. The static
server pattern from upstream is not copied here; this validator never serves
anything.

## 8. Did I alter awesome-llm-apps?

**No.** Its manifest, intake, license review, and validation report are
byte-identical to the pre-sprint state (`git status` on that directory is
empty; the legacy manifest still passes validation unchanged). Its pin
`779e9f9bcf87fa8cd95870a438b70b84e47d3173` and allowlist are also recorded in
the new registry.json — the registry mirrors it, it does not modify it.

## 9. Did I touch the original worktree?

**No.** All work happened in a separate, isolated review worktree outside the
original checkout. The original
worktree's 154 pre-existing deletions were never staged, restored, or
modified; staged count remains 0 and its porcelain output hash is unchanged
from the F0 baseline (`1c1253cd...`). The reference hash
`99816064999d938aa0e792e544909babb563e561` was not reproducible with any of
~20 standard pipelines (LF/CRLF, porcelain variants, diff variants) — this is
documented as a finding, and the F0 baseline hash is used for pre/post
comparison instead. Note: one junction/symlink test creates a fixture in the
temp dir; nothing outside it is touched.

## 10. Is the change generic enough?

**Yes, with a documented limit.** The validator, registry, and adversarial
tests are source-agnostic: adding a fourth source means adding one registry
entry + one manifest + re-running validation. The remaining non-generic part
is the legacy `SOURCE_ID`/`ALLOWLIST` constants, kept deliberately for
backward compatibility with the pre-existing awesome-llm-apps tests (removing
them would have broken GENERIC-LLM-REF-01's own contract). This is the
correct trade-off: compatibility over cosmetic purity.

## Resolution summary

All ten questions resolve cleanly. Two honest findings stand out: (a) the
F0 reference diff-hash is not reproducible and a verified baseline was
substituted; (b) the legacy constants remain as the only non-generic residue,
by design. Neither blocks the commit; both are recorded for Codex review.
