# Remote/local diff

Before reconciliation, the remote had 176 tracked files and the local tree had 530. Every remote path existed locally; 171 were initially identical and 5 differed.

After porting the CI metadata, the final pre-documentation tree differs from `origin/master` by 354 local additions and 4 evolved files:

| Path | Local state | Decision |
| --- | --- | --- |
| `.gitignore` | Adds external-cache/source protections. | `ALREADY_SUPERSEDED` |
| `package.json` | Preserves exact `pnpm@9.15.4` and adds current contracts/scripts. | `ALREADY_SUPERSEDED` |
| `packages/browser-dev-mcp/package.json` | Current validated capture/runtime package metadata. | `ALREADY_SUPERSEDED` |
| `pnpm-lock.yaml` | Current six-workspace lockfile. | `ALREADY_SUPERSEDED` |

The CI workflow matches the useful remote change after the explicit port.
