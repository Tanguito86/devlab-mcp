# Bundle verification

Two complete-history rollback bundles were generated under `external-evidence:/DevLab/history-reconciliation/DEVLAB-GITHUB-HISTORY-RECONCILIATION-03-20260804T183630-0300/` and passed `git bundle verify`.

| Bundle | Ref | SHA-256 | Result |
| --- | --- | --- | --- |
| `devlab-local-before-reconciliation.bundle` | `master@e3d2046` | `bc293a46235d3b815602001a7b87dbf307f1313bab72e5cbb0b52ebdfa512d59` | complete / verified |
| `devlab-remote-before-reconciliation.bundle` | `origin/master@c458c3b` | `f7df248125e002580ffd1d872dcd7e68d74a6c2791b6ba94bd9b24f9350a116f` | complete / verified |

Private local archive ref `refs/archive/origin-master-before-reconciliation` resolves to `c458c3b87770fbf9c351d9ae939c0cdc51e5773c` and is not a publication target.
