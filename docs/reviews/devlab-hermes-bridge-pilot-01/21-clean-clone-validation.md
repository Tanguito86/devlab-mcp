# 21 — Clean-clone validation

The final tracked tree was cloned with:

```powershell
git -c core.autocrlf=true clone --no-local <local-devlab-repository> <external-clean-clone>
```

Validation used `corepack pnpm 9.15.4`, an offline frozen-lockfile install and
explicit external pilot output. Results:

| Gate | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile --offline` | PASS; no network download |
| `corepack pnpm -r build` | 7/7 PASS |
| `corepack pnpm -r typecheck` | 7/7 PASS |
| `corepack pnpm -r test` | 339/339 PASS |
| root contract/security tests | 76 PASS / 1 intentional skip / 0 fail |
| capability registry | 4/4 PASS; 14 governed entries, exactly six GM entries |
| GameMaker positive | project load, compile and runtime PASS; signal `GM_BRIDGE_PILOT_VALUE=2` |
| GameMaker negative | Igor exit 1 observed as FAIL; no false PASS |
| rollback | positive and negative byte-exact PASS |
| process cleanup | zero Igor/Runner remaining |
| tracked worktree/index | CLEAN / EMPTY |

The pilot required explicit installed-toolchain paths and wrote its copied
fixture, evidence, cache and output only below an external `--work-root`.
