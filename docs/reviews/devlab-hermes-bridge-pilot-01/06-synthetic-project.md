# 06 — Synthetic project

Path: `fixtures/gamemaker/hermes-bridge-pilot/`.

The project contains one room, one object, Create/Step/Draw events, main and
Windows options, no sprites/sounds/external assets, and no product code.
STATE-A declares `GM_BRIDGE_PILOT_VALUE 1`; STATE-B declares value `2`.
Both the debug log and on-screen Draw event expose the value. The Step event
ends the Runner after a bounded 120 frames.

Canonical STATE-A fingerprint:
`c012f9eee926df338bdf9b923262f72baf9129a680acd0cc48667bfd9a6698ff`.
