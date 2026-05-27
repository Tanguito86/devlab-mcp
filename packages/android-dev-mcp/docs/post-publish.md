# Post-Publish Checklist

Use this checklist after each public npm release.

## npm Visibility

- Confirm `npm view @tanguito/android-dev-mcp` returns the expected version.
- Confirm the npm package page renders README, license, repository, and keywords.
- Confirm `latest` dist-tag points to the release version.

## Installation

- Install globally in a clean shell:

```powershell
npm install -g @tanguito/android-dev-mcp
android-dev-mcp
```

- Run one-off through `npx`:

```powershell
npx @tanguito/android-dev-mcp
```

## MCP Verification

- Confirm the installed bin starts as an MCP stdio server.
- Confirm an MCP client can list tools.
- Confirm the bundled app profiles are available when no local `config/apps.json` exists.

## Android Smoke Check

- Confirm `adb devices` works.
- Confirm `adb_devices` returns connected devices.
- Confirm `android_list_apps` returns configured profiles.
- Confirm `android_list_workflows` returns sample workflows.
- If a physical device is connected, run a basic workflow such as `systemUiSmoke`.

## Monitoring

- Watch GitHub issues for first-install friction.
- Watch npm package page for metadata problems.
- Collect feedback around MCP client setup, Windows PATH, ADB authorization, and config discovery.
