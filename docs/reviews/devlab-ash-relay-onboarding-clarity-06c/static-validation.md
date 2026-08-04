# Static validation

| Check | Result |
| --- | --- |
| Game typecheck | PASS |
| Game build | PASS |
| Game tests | 46/46 PASS |
| DevLab typecheck | PASS after building `shared` types first |
| DevLab build | PASS |
| DevLab tests | 173/173 PASS |
| Lockfile | unchanged; SHA-256 `34c3f2f1f78a990e59131adecbdc70a9ddac38443b8feaec7588580055a98688` |
| Product package | SHA-256 `847b0780300c3001a40ff1f7e8c8d59e1bb4693a71d74a851ef3ec66d8878971` |
| Product tree | 41 files, 355981 bytes, `91753c41697b89c77d08d5a08b7a4458806ad49ddbc1a141371fb80c5416b3ef` |
| Dist tree | 4 files, 997019 bytes, `0e7a533837dffc12930da3b340471a70d85d189c6762bd9a3d05452d9244344d` |

An initial root-script invocation resolved the environment fallback `pnpm` 11.9.0 inside recursive scripts and stopped before tests because it wanted a non-interactive modules purge. Running the workspace commands directly through the contractual Corepack `pnpm` 9.15.4 passed typecheck, build, and 173/173 tests without reinstalling dependencies. No product code was changed in response.

The Vite build emits only its pre-existing chunk-size warning. Final `git diff --check` passes in the DevLab worktree; product no-index comparison reports only the expected changed files and Windows autocrlf notices, with no whitespace error annotation.
