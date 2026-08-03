# Independent review of c10aee1

## Disposition

`C10AEE1_HOTFIX_REQUIRED` on first review, then
`C10AEE1_APPROVED_WITH_CODEX_HARDENING`.

The original commit is limited to the external-source registry, manifests,
documentation, validator, and registry tests. It installs and enables zero
external components, executes zero external code, adds no runtime dependency,
submodule, or product change.

## Source classifications

`threejs-skills` remains `external-curated-reference`, with automatic updates
and execution disabled. MIT is only declared upstream: no license file exists
at the pin, status remains `UNRESOLVED`, and substantive reuse remains
unauthorized.

`jungle-trail` remains `REFERENCE_ARCHITECTURE / EXECUTION_NOT_AUTHORIZED`.
Its allowlist is inspectable data only and does not invoke npm, Playwright,
CDNs, or upstream scripts.

## Findings

The intake already recorded the wrong clone target, wrong skill path, missing
license material, nonexistent `THREE.PostProcessing`, and unresolved
version/import coherence. The review added the omitted findings required by
the sprint: nonexistent official `ContactShadows` module, a numeric morph
weight presented with `StringKeyframeTrack`, and an incomplete selective-bloom
composition example.

One personal worktree path in the self-critique was replaced by a generic
description.

## Validator hotfix

The original validator could accept duplicate or incomplete verified-file
coverage, evaluate checkout paths after structural failure, follow an
allowlisted file through a junction ancestor, and resolve an unregistered
`--source` before proving it safe. The hotfix adds exact file-component hash
coverage, uniqueness, structural short-circuiting, per-segment and realpath
containment, safe registered source IDs, and non-reuse enforcement for new
material-license records.

Result: 57/57 registry tests pass. Offline validation and physical detached
checkout validation pass for all three registered sources.
