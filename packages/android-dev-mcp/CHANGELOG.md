# Changelog

All notable changes to this project are documented here.

This project follows a simple Keep a Changelog style.

## [Unreleased]

### Added

- `android_device_info` — returns manufacturer, model, Android version, SDK, ABI, battery level, and charging status via `getprop` + `dumpsys battery`.
- `android_set_volume` — sets media volume (or any stream) on the device via `media volume`.
- `android_clear_app_data` — clears all local data for an app via `pm clear` (with clear warning about data loss).
- `android_manage_permissions` — grants or revokes a runtime permission for an app via `pm grant/revoke`.
- `android_set_bluetooth` — enables or disables Bluetooth via `svc bluetooth` + `settings put global` (best-effort, OEM-dependent).
- `android_list_packages` — lists installed packages via `pm list packages` with optional case-insensitive filter.
- `android_current_app` — returns the currently focused package/activity via `dumpsys window` + `dumpsys activity`.
- `android_app_info` — detailed package info (version, install time, permissions) via `dumpsys package`.
- `android_open_app_settings` — opens the system App Info screen via `APPLICATION_DETAILS_SETTINGS` intent.
- `android_uninstall_app` — uninstalls an app via `pm uninstall` with optional `-k` to keep data.
- `android_start_activity` — launches an arbitrary Android component via `am start` (no profile needed).
- `android_send_intent` — sends a generic broadcast intent with `--es`, `--ei`, `--ez` extras.
- `android_start_session` — creates a timestamped testing session with device info capture and optional logcat clear.
- `android_session_step` — records an action within a session with optional screenshot and UI dump evidence.
- `android_stop_session` — finalizes a session: captures logcat, current app, and generates final-report.md.
- `android_list_sessions` — lists existing sessions with name, status, step count, and duration.
- `android_get_session_report` — reads the final-report.md for a completed session.

### Changed
- `android_run_workflow` — now accepts optional `session`, `sessionName`, `captureSteps`, `captureUiDumps`, `clearLogcat` parameters for automatic evidence capture.

### Fixed
- `captureUiDump` and `android_record_video` — `adb pull` local paths are now translated from WSL notation to Windows host paths when running under WSL with a Windows `adb.exe`. Previously caused "No such file or directory" errors.
- `appendAction` in session manager — now correctly appends to `actions.jsonl` instead of overwriting the file (switched from `writeFile` to `appendFile`).

## [1.0.1] - 2026-05-22

### Changed

- Updated the SoundBend example `smoke` workflow to wait for the real visible UI text `Reproduciendo`.

### Validated

- SoundBend `smoke` workflow passes on a physical Android device using the updated profile.

## [1.0.0] - 2026-05-22

### Added

- First public npm release metadata and installation documentation.
- npm badge and package link in the README.
- Post-publish checklist for visibility, install, `npx`, MCP smoke validation, and feedback monitoring.
- Scoped npm package name: `@tanguito/android-dev-mcp`.

### Changed

- Package version bumped to `1.0.0`.
- README now documents npm install and `npx` usage as public distribution paths.

## [0.7.0] - 2026-05-22

### Added

- npm publication checklist for maintainers.
- README npm installation guidance for future global and `npx` usage.
- MCP client setup examples for global install, `npx`, and local node paths.
- Privacy and security documentation covering local-only ADB behavior.

### Changed

- Package version bumped to `0.7.0`.
- Publish dry-run validation now documents package size and included files.
- Removed real screenshot PNG assets from package contents to keep publication lighter.

## [0.6.0] - 2026-05-21

### Added

- MCP API contract documentation covering every tool, expected inputs, outputs, examples, and common errors.
- Versioning policy for MCP compatibility, deprecations, and breaking changes.
- Central validation and error helpers for app profiles, workflow steps, device ids, timeouts, coordinates, and output paths.
- Minimal `node:test` regression coverage for UI parsing, workflow validation, app profile loading, activity parsing, and validation helpers.
- API response examples for launch, workflows, UI search, failure reports, and doctor output.

### Changed

- CI now runs build, typecheck, and the minimal test suite.
- Package version bumped to `0.6.0`.

## [0.5.0] - 2026-05-21

### Added

- `npm run doctor` onboarding checks for Node.js, ADB, connected devices, config, and build output.
- MCP discovery tools: `android_list_apps` and `android_list_workflows`.
- Troubleshooting, contributing, and code of conduct documentation.
- First-run README sections for five-minute setup and MCP capability discovery.
- Lightweight documentation images for onboarding examples.

### Changed

- Package version bumped to `0.5.0`.
- Package files now include onboarding scripts.

## [0.4.0] - 2026-05-21

### Added

- General-purpose app profile examples for standard apps, debug apps, logcat usage, and workflows.
- Reusable `templates/` for basic app profiles, logcat profiles, debug intents, and workflows.
- Dedicated docs for adding Android apps, MCP client setup, debug intents, and workflows.
- Generic workflow examples such as `appSmoke`, `launchAndCapture`, `uiSnapshot`, `logcatSnapshot`, `installAndLaunch`, and `debugCapture`.

### Changed

- README now presents `android-dev-mcp` as a general Android MCP toolkit first.
- SoundBend is documented only as an example profile and optional workflow example.
- npm package files now include `docs/` and `templates/`.

## [0.3.0] - 2026-05-21

### Added

- npm package readiness metadata, including `main`, `bin`, and package `files`.
- MCP client configuration documentation for Claude Desktop, Cursor, OpenCode, and generic stdio clients.
- Future npm usage documentation without publishing the package.
- Clean install and local package validation flow.

### Changed

- CI now uses Node 22 and runs both build and typecheck.
- Package version bumped to `0.3.0`.

## [0.2.0] - 2026-05-21

### Added

- Optional `deviceId` support across tools.
- UI hierarchy dumps, state captures, video recording, reports, and failure reports.
- Minimal UI XML parsing with node search, tap helpers, and wait helpers.
- Debug intents per app profile.
- Reusable declarative workflows with execution reports.
- GitHub issue templates, pull request template, CI, license, roadmap, and public release metadata.

### Changed

- README was reorganized for public adoption.
- Package metadata now includes repository, license, keywords, and maintenance scripts.

## [0.1.0] - 2026-05-21

### Added

- Initial TypeScript MCP server for Android automation through ADB.
- App profile loader with SoundBend as an example profile.
- Core tools for devices, launch, force stop, logcat, screenshots, taps, swipes, text input, APK install, and shell commands.

### Validated

- Fase 2: real physical Android device validation.
- Fase 3: Android inspection usability layer.
- Fase 4: UI interaction intelligence layer.
- Fase 5: reliability and ergonomics.
- Fase 6: reusable Android workflows.
