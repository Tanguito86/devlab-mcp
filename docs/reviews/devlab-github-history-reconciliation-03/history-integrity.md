# History integrity

- Merge parents: exactly 2.
- `origin/master@c458c3b` is an ancestor of the reconciled HEAD.
- old local `master@e3d2046` is an ancestor of the reconciled HEAD.
- Published snapshot `4d542f1` and all 28 original local-only commits remain reachable.
- Bridge tree equals its first-parent tree exactly.
- `git fsck --full`: exit 0, no corrupt or missing objects.

`fsck` reported unreferenced dangling blobs created by prior repository operations. They are not reachable from the reconciled history and are not publication content; no cleanup was performed.
