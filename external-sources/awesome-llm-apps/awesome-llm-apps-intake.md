# awesome-llm-apps curated intake

Review date: 2026-08-03

Status: **REFERENCE_ONLY**

Repository: `https://github.com/Shubhamsaboo/awesome-llm-apps`

Pinned commit: `779e9f9bcf87fa8cd95870a438b70b84e47d3173`

Default branch at intake: `main`

## Purpose

This entry makes selected material discoverable for later audits. It does not
install a skill, execute upstream code, add an upstream dependency, or approve
any component for production.

Only these paths are in scope:

| Path | Intake status |
|---|---|
| `agent_skills/scope-creep-detector` | `CANDIDATE_FOR_AUDIT` |
| `agent_skills/commit-archaeologist` | `CANDIDATE_FOR_AUDIT` |
| `agent_skills/dependency-doctor` | `CANDIDATE_FOR_AUDIT` |
| `agent_skills/evals` | `REFERENCE_ARCHITECTURE_ONLY` |

No Streamlit application, agent swarm, provider configuration, model prompt,
dataset, vector store, credential file, or monorepo dependency is admitted by
this record.

## Provenance verification

The commit page, local Git object, detached checkout, and manifest all resolve
to the same full SHA. The detached checkout is stored outside this repository
and has no local modifications. The four allowlisted trees contain 32 regular
files in total and no symbolic links. A manual `refs/heads/main` lookup on the
review date also resolved to the pin; no upstream drift was observed.

Central file hashes are recorded in `external-source-manifest.json`. Upstream
changes are never pulled or adopted automatically. A manual reviewer may fetch
upstream into an external cache, but validation must continue to target the
pinned commit until a separately reviewed manifest change is committed.

## Why membership is not trust

Recent upstream history contains serious defects in applications outside this
allowlist:

- Commit `b96d19ad0509cdc5ea1bdd24f68fd047bedf3ade` fixed a governance
  approval bypass: an allowlisted path could return `ALLOW` before a later
  approval rule was evaluated, allowing `delete_file` to run without approval.
- Commit `8d619a82f447a6a8a8517e93ea57dcebd06dafd4` fixed a delegation
  privilege escalation: an empty intersection of parent and child actions was
  interpreted as unrestricted access.

Both fixes are ancestors of the selected pin. Their presence is useful, but it
also demonstrates that repository popularity and a passing example are not a
security boundary. Every candidate still requires complete reading, network/
shell/credential/write analysis, dependency review, adversarial fixtures,
local tests, namespace adaptation, attribution, and human approval.

## Adoption boundary

The external checkout is reference material only. No code may be executed,
copied into a package, exposed as an MCP tool, or installed with
`npx skills add` under this sprint. `scope-creep-detector` is merely the next
recommended audit; its adaptation is a separate sprint.
