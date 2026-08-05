# 05 - Fixture

`fixtures/gamemaker/asset-bridge-pilot/` is a minimal GameMaker project named
`AssetBridgePilot`. Its baseline draws and logs
`GM_ASSET_BRIDGE_BEACON_VERSION=0`, saves a deterministic runtime capture, and
terminates itself. It contains no third-party or consumer asset.

Asset `bridge-test-beacon` is generated in code. v1 is a cyan diamond beacon;
v2 is a magenta circular beacon. Both are 64x64 RGBA, two frames, origin
32/32, auto bounding box, stored-deflate PNG, and MIT provenance.

The fixture is copied to an explicit external work root for every pilot. The
repository fixture remains unchanged; the final rollback tree hash equals it.
