# DEVLAB-THREEJS-GAME-SKILLS-AB-04 runbook

```text
EXECUTION_AUTHORIZED: YES
CONTRACT_VERSION: ab04-v2
FILESYSTEM_CONTAINMENT_REQUIRED: YES
SIBLING_DIRECTORIES_ARE_NOT_A_SANDBOX: YES
```

1. Check out the authorized DevLab commit on a clean worktree. Do not infer or
   duplicate shared values from a conversation; read `benchmark-contract.json`.
2. Run `corepack pnpm run benchmark:ab04:verify`. Stop without correction if
   contract, derived files, scaffold, source allowlist or hashes fail.
3. Create the benchmark evidence root and freeze the verified contract, prompt,
   rubric, gates and leg policies with canonical hashes.
4. Materialize each baseline with `benchmark:ab04:materialize`, passing the
   authorized run root and exactly one leg identifier. Never use an upstream
   scaffold, installer, script, generator or copied game.
5. Run `benchmark:ab04:compare-baselines`; both complete trees, including
   generated baseline metadata, must be byte-identical before builders start.
6. Give each leg the generated prompt and its minimal policy in a fresh isolated
   context. The sibling baseline directories are not an ACL or sandbox boundary:
   the executor must enforce leg-only filesystem access before starting either
   builder. LEG_A must never access the external checkout. LEG_B may consume an
   allowlisted file only through
   `corepack pnpm run benchmark:ab04:read-guidance -- --path <manifest-path> --pair-id <pair-id> --run-id <run-id>`.
   The coordinator must provide an executor-only 32-byte hexadecimal
   `DEVLAB_AB04_BROKER_HMAC_KEY`, keep it outside both builder contexts, and
   protect `coordinator/guidance-broker/<pairId>/<runId>.jsonl` with OS ACLs.
   Stop on any broker, checkout, pin, cleanliness, path, HMAC or hash failure.
7. Deny non-loopback network at the OS/process boundary, including package
   lifecycle subprocesses. Browser routing and offline package-manager flags
   are required evidence but do not replace this executor control. Record
   model/build identity, active time,
   passes, commands, changed files, first playable, failures and corrections.
8. Execute the static, native WebGPU, capture, bot, performance, mobile,
   lifecycle and device-loss gates using the repetitions in the contract.
9. Anonymize complete evidence, evaluate in a fresh blind context, then reveal
   the private mapping and apply the contract decision rule.
10. From the trusted coordinator context, validate each result with
    `benchmark:ab04:verify-result` while the same executor-only HMAC key is
    available. LEG_B evidence must contain an exact copy of the trusted ledger;
    the verifier authenticates every ordered receipt. Compare the eligible pair
    with `benchmark:ab04:compare-results`; it recomputes scoring and applies the
    decision rule in `scoring-rubric.md`. Run the complete DevLab suite and
    integrate only by the separately authorized fast-forward procedure.

Any contract drift, unequal baseline, model/build mismatch, source hash failure,
cross-leg contamination or incomplete evidence invalidates the benchmark.
