# 04 — Capability mapping

| Public capability | Method | Gate | Effects | Reversible |
|---|---|---|---|---|
| GM_STATUS_V1 | status | READ_ONLY | project/process read | n/a |
| GM_INSPECT_V1 | inspect | READ_ONLY | canonical snapshot/hash | n/a |
| GM_PLAN_V1 | plan | PLAN_ONLY | immutable returned plan | no project write |
| GM_APPLY_SAFE_V1 | applySafe | SAFE_WRITE | stage/backup/promote | required |
| GM_VERIFY_V1 | verify | RUN maximum | parse/Igor/Runner evidence | rollback retained |
| GM_ROLLBACK_V1 | rollback | SAFE_WRITE | verified restore | byte-exact |

The capability artifact declares input/output schema, effects, roots,
determinism, timeout, reversibility, evidence, and typed errors. The public set
has six entries; it is not a projection of Hermes's 251 tools.
