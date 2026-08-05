# 16 — Pilot results

```text
POSITIVE: inspect→plan→apply→project load→compile→runtime→rollback PASS
STATE-A: c012f9eee926df338bdf9b923262f72baf9129a680acd0cc48667bfd9a6698ff
STATE-B: 9139012d37f9f10a77bba7a3c9ffadbdd4c2a40f182b7fe591bf56a25f2e5732
COMPILE EXIT: 0
RUNTIME SIGNAL: GM_BRIDGE_PILOT_VALUE=2
STATE-A-RESTORED: byte-exact PASS
NEGATIVE COMPILE EXIT: 1
NEGATIVE ROLLBACK: byte-exact PASS
FINAL IGOR/RUNNER: 0
```

The reproducible entrypoint is `scripts/gm-hermes-bridge-pilot.mjs`; runtime
artifacts are written only beneath the explicit external `--work-root`.
