# ASH RELAY lifecycle

## Ten-cycle result

`runtime-gauntlet-r3-final/lifecycle.json` completed 10/10 cycles and every
cycle passed. SHA-256:
`025d435768d04fe5a04713aee0eb2d6a67d6ebf15a6042b39b3e88f4b1aa4a15`.

Every cycle exercised:

```text
start -> play -> pause -> resume -> defeat -> restart
      -> checkpoint restore -> victory -> reload
```

Observed invariants:

- canvas count remained one;
- active animation loops remained zero or one, never duplicated;
- input listener count remained 17;
- audio voice count remained bounded;
- reload geometry/texture/program growth was `0/0/0`;
- reload heap deltas ranged from -15,686,218 to +23,081,026 bytes and every
  cycle met the harness bound;
- phase sequence, defeat, restart, checkpoint restore, and victory autopilots
  were correct;
- blocked requests, console errors, and page errors were zero.

The lifecycle samples observed zero active voices at their collection points;
the bound does not count `AudioContext` instances directly. Source ownership
creates one audio owner per engine, and the dedicated device-loss R3 test
separately observes a live procedural voice before and after recovery. The
indirect context count remains a non-blocking evidence limitation.

## Frozen resource stability

`runtime-gauntlet-r3-final/resource-stability/resource-stability.json` sampled
60 boss-phase-2 frames. Before and after values were exactly 74 geometries, 4
textures, and 15 programs; growth was zero, duplicate canvases zero, and
duplicate loops zero. SHA-256:
`7ccb7225c695ebb38c8be581f6e1864875a45ea80aa033695a3648b92b98e9fe`.
