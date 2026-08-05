# 17 - Clean-clone validation

Status at builder handoff: `PENDING FINAL HEAD` by design. The independent
critic must review a committed implementation before Codex resolves findings;
the final clean clone must therefore run after the resolution commit.

Planned final gate, from a detached clone of final HEAD:

1. `corepack pnpm install --offline --frozen-lockfile`;
2. build, typecheck, workspace/root/focused/registry suites and pack dry-run;
3. fresh Forge v1/v2 production and identical rerun;
4. fresh composed GameMaker pilot with explicit installed toolchain;
5. assert APPLIED/NO_CHANGE/v2, four runtime captures, negative exit nonzero,
   two byte-exact rollbacks, zero owned processes;
6. secret, large-file and no-copy scans;
7. assert clone worktree clean and index empty.

No final clean-clone PASS is claimed in this pre-critic document.
