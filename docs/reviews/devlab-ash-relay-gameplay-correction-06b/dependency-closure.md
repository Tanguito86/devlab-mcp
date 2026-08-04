# Dependency closure

No install, purge, lockfile update, or script-policy change was performed.

| Item | Result |
| --- | --- |
| package.json SHA-256 | `28bbfe60961a9e233a00ab9b855363c19cbed1c61200abe0d40fdb3f24dd32d5` |
| pnpm-lock.yaml SHA-256 | `34c3f2f1f78a990e59131adecbdc70a9ddac38443b8feaec7588580055a98688` |
| Vite | 8.2.0 |
| TypeScript | 6.0.3 |
| Three.js | 0.185.1 |
| Chromium | 148.0.7778.96 |
| Chromium SHA-256 | `290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635` |

The copied pnpm junctions were not usable as a package-manager closure. Build and test commands therefore invoked the already authenticated baseline binaries directly. The lock and package hashes remain byte-identical.
