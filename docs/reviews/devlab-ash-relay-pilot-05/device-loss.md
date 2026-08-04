# ASH RELAY device-loss validation

## Initial block

The generic DevLab context flow in `device-loss-r2-final/context.json` proved a
real device loss, renderer generation 2, same-page recovery, post-recovery
capture, one canvas, and no duplicate loop. It ran frozen, however, and did not
exercise exact gameplay state, a restarted live loop, trusted input, or audio
after recovery.

The independent technical critic correctly classified that evidence gap as P1
and blocked acceptance. No product code was changed in response.

## Post-recovery closure

A dedicated fail-closed runner then tested the same final dist in one page:

```text
EVIDENCE:
device-loss-r3-final/report.json
REPORT_SHA256:
b3f5fbe79ddee8b0e6d5746fb83bfadfc047b69f0243b4c7f796e25da0134c57
RUNNER_SHA256:
665676a3ba83add885fdd26cbbacd440d178d1b92cd4201f857624595a7c902a
DIST_TREE_SHA256:
0528cd921e83a8ceca22e08d024abb77cf0a75368dc3079ad8033ecf3950746b
STATUS: PASS
```

| Gate | Observation |
| --- | --- |
| native hardware WebGPU | NVIDIA/Turing, no fallback |
| loss/recovery | real destroy, recovery count 1, generation 1 -> 2 |
| exact game state | snapshot JSON byte-equal; SHA `c01857f433bdcbf292821efbd33415d6d0d3465364672b4d22f77e991bd47f56` both sides |
| deterministic hash | `1e6ab6ab` both sides |
| phase/health/checkpoint | exactly equal |
| recovery comparison loop | 0, preventing state advance |
| live loop after rebuild | 1 |
| canvas | 1 |
| listeners | 17 before and after |
| trusted post-loss input | W movement 0.15137 and one new mouse shot |
| post-loss audio | context `running` and shot voice observed |
| post-loss capture | 1280x720, full 3,686,400 RGBA bytes |
| external requests/errors | 0 / 0 |

The technical re-review verified the report, runner, browser and all four dist
file hashes, then changed the sprint verdict from BLOCK to PASS with P0=0 and
P1=0.

Non-blocking limitations remain explicit: the movement measurement does not
record zero-input drift; the post-loss shot and audio voice are the stronger
causal input proof. The `resourcesRebuilt` boolean does not serialize the
positive geometry/program counts it evaluated, but generation 2 plus a valid
native-WebGPU capture demonstrates operational reconstruction. The final
evidence manifest binds the runner hash externally.
