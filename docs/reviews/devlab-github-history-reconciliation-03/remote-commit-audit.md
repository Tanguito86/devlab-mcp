# Remote commit audit

| Commit | Finding | Decision | Action |
| --- | --- | --- | --- |
| `4d542f1` — published snapshot | Its 176-file tree `18349d4...` is byte-identical to local historical commit `e9ec971`; all remote paths remain present locally. | `PRESERVE_HISTORY_ONLY` | Preserve as second-parent history; port no files. |
| `c458c3b` — packageManager pnpm version | Changes only `.github/workflows/ci.yml`, removing two broad `version: 9` inputs. Local `package.json` already pins `pnpm@9.15.4`. | `PORT_REQUIRED` | Manually remove the two broad inputs, then validate. |

No remote change remained unresolved. The published snapshot does not replace the current local tree.
