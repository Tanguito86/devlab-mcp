# 17 - Clean-clone validation

Final closure gate: `PASS`. The closure HEAD was cloned detached into fresh root
`H:\Temp\Deposito\devlab-asset-bridge-01-clean-final-20260805-2030` and used no
untracked state from the source checkout.

Validated in the clone:

1. `corepack pnpm install --offline --frozen-lockfile`;
2. build and typecheck for 8/8 workspace packages;
3. workspace tests 403/403 and root tests 77 PASS + 1 intentional skip;
4. capability registry 5/5 and package dry-runs, including Asset Bridge 43 files;
5. fresh Forge v1/v2: APPROVED, REGISTERED then identical NO_CHANGE;
6. fresh composed GameMaker pilot: APPLIED v1, identical NO_CHANGE, APPLIED v2,
   initial/v1/v2/post-rollback real compile+runtime PASS, negative compile exit 1,
   two byte-exact rollbacks, initial/final GameMaker PID sets empty;
7. secret, >1 MiB and forbidden-copy scans clean;
8. clone worktree clean, index empty and zero Igor/Runner processes.

The clean clone used only the committed lockfile, offline pnpm store, explicit
installed GameMaker toolchain, and fresh external work roots. It did not depend
on the Hermes checkout, the original pilot work roots, network runtime access,
consumer repositories, secrets or hidden global project state.
