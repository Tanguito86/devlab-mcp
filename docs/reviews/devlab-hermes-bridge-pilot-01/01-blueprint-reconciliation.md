# 01 — Blueprint reconciliation

| BLUEPRINT REQUIREMENT | CURRENT DEVLAB CONTRACT | DECISION | IMPLEMENTATION PATH | JUSTIFICATION |
|---|---|---|---|---|
| capability registry | governed single registry | UNCHANGED/EXTENDED | six `GM_*_V1` entries | no parallel registry |
| path safety | fail-closed containment patterns | ADAPTED | `paths/index.ts` | GameMaker permits Unicode but rejects traversal, links, ADS, UNC, drives |
| deterministic manifests/SHA-256 | canonical DevLab artifacts | ADAPTED | `canonical.ts`, plan and manifest hashes | no timestamps or absolute paths in deterministic content |
| atomic staging | same-volume staging/promotion | ADAPTED | `transactions/index.ts` | write-ahead, verified backup, rename retry |
| status/plan/apply | absent in DevLab | ADAPTED | adapter public contract | new domain capability |
| rollback | absent for engine projects | ADAPTED | verified blobs and inverse rename | byte-exact and fail-closed |
| process ownership | absent | ADAPTED | `ProcessLedger` | PID, start token, executable, command hash, transaction |
| compile/runtime verification | absent | ADAPTED | explicit Igor/ProjectTool invocation | current process evidence, not old logs |
| Hermes tools/content | not a DevLab contract | REJECTED | zero exposed/imported tools | preserves no-copy boundary |
| destructive actions | outside pilot | REJECTED | gate vocabulary only; disabled | no pilot requirement authorizes deletion |

All 13 mandatory blueprint documents were read. The blueprint status and pin
were verified, and its `SHA256SUMS.txt` passed `25/25` before implementation.
