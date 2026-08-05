# 16 — Pilot results

```text
POSITIVE: inspect -> plan -> apply -> project load -> compile -> runtime -> rollback PASS
STATE-A: 4f1a56b8f71b148fb9d990d2893d8bd45d8379256584ba6949ee4604fd515dfe
STATE-B: 88c69c29c558d05e00335dfca6b80edb28fd4d8d53def82de88a9a261a5d79fc
COMPILE EXIT: 0
RUNTIME SIGNAL: GM_BRIDGE_PILOT_VALUE=2
STATE-A-RESTORED: byte-exact PASS
NEGATIVE COMPILE EXIT: 1
NEGATIVE ROLLBACK: byte-exact PASS
FINAL IGOR/RUNNER: 0
```

The reproducible root entrypoint is `corepack pnpm gm-bridge:pilot -- ...`.
It builds the package first and requires explicit `--work-root`, `--igor`,
`--project-tool`, `--runtime-root` and `--user-dir` arguments. Runtime artifacts
are written only beneath the external work root. Durable evidence is committed
under `evidence/`, including both current Igor invocations and compile logs.
