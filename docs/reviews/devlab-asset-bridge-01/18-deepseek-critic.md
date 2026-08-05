# 18 - DeepSeek independent critic

Reviewer: DeepSeek V4 Flash 0731 (`deepseek/deepseek-v4-flash`, variant `high`,
OpenCode `1.14.24`, agent `plan`). Review mode was read-only on detached clean
clone `a712e0bcec60a60dfc3679635edf6b1317fe70a7`, against baseline `9af3d7d`.
HEAD, worktree and index were unchanged after the review.

Initial verdict: `CHANGES REQUIRED`; 1 BLOCKER, 4 REQUIRED, 5 OPTIONAL.

## Mandatory findings

- `F1 BLOCKER`: apply/verify checked a presented plan's self-hash but not the
  stored binding record's `adapterPlanHash`; a forged same-transaction plan
  could substitute content. Minimum resolution: compare both hashes in apply
  and verify, add an exact same-transaction attack test, and revalidate the
  adapter extension policy during apply.
- `F2 REQUIRED`: five compiled-log entries in `SHA256SUMS.txt` did not match the
  committed LF blobs and the sprint lacked explicit line-ending attributes.
- `F3 REQUIRED`: `faultAt` was exposed in the public bridge schema/request,
  allowing callers to intentionally leave partial WRITE_AHEAD state.
- `F4 REQUIRED`: the pilot computed but did not gate a noisy comparison of all
  non-GameMaker system process counts; its false result contradicted the status.
- `F5 REQUIRED`: mixed-case transaction IDs could alias the same NTFS evidence
  directory.

## Optional findings

- `O1`: Forge profile listed six rather than all eight governed operations.
- `O2`: synthetic Forge pilot uses a fixed review secret and one harness drives
  critic/resolver promotion; acceptable only as documented fixture authority.
- `O3`: pilot imported a deeper process module and embedded absolute local paths
  in its summary.
- `O4`: bridge metadata fsynced its file but not its parent directory.
- `O5`: manifest dimensions came from spec without an explicit frame-dimension
  cross-check.

The critic explicitly accepted the documented `gm-ide-adapter/internal`
composition subpath: it exposes read-only primitives, is not re-exported by the
bridge barrel, and does not expand the six public GM capabilities.

Required acceptance state after resolution: `ACCEPTED AFTER RESOLUTION`.
