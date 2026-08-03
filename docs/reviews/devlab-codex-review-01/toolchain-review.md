# Toolchain review

## Windows

Node `24.13.0`, pnpm `9.15.4`. The frozen install succeeded. The exact
Playwright Chromium revision required by the lockfile was installed after the
first browser-suite attempt honestly failed because the executable was absent.

Original baseline after build: 112/112 tests, build 4/4, typecheck 4/4.
Expanded post-hotfix expectation: 120/120 tests, build 4/4, typecheck 4/4.

## WSL

Linux Node `22.22.3` was present, but `corepack` incorrectly resolved to a
Windows executable. No shim or global package was created. Linux Node invoked
the already cached, exact pnpm `9.15.4` JavaScript entry point.

Build and typecheck passed 4/4. The first test attempt failed before Chromium
launch because four shared libraries were absent. Without sudo or system-wide
installation, the corresponding Ubuntu packages were downloaded and extracted
under a user cache; `LD_LIBRARY_PATH` was scoped to the test process. The
second WSL run passed 120/120.

Global installations: 0. Lockfile changes: 0. Package-manifest changes from
installation: 0. The temporary pnpm-workspace mutation made by a different
wrapper was detected and removed; its final blob is identical to HEAD.
