# npm Publish Checklist

Use this checklist before any public npm publication.

## Name

- Historical note: `npm view android-dev-mcp` returned `E404` and reported the package as unpublished on `2026-02-07`.
- Treat the name as currently unavailable for install but historically used. Confirm ownership and npm policy before publishing.
- First public release uses the scoped package `@tanguito/android-dev-mcp` because the unscoped name is blocked by npm permissions.
- If the name cannot be used, consider:
  - `android-dev-mcp-cli`
  - `adb-android-mcp`
  - `android-adb-mcp`
  - `android-agent-mcp`

## Package

- Confirm `package.json` version is bumped.
- Confirm `main` is `dist/index.js`.
- Confirm `bin.android-dev-mcp` is `dist/index.js`.
- Confirm `files` includes `dist`, `config`, `docs`, `templates`, `scripts`, README, changelog, license, roadmap, contributing, and code of conduct.
- Confirm generated artifacts are not included:
  - `screenshots/`
  - `ui-dumps/`
  - `captures/`
  - `recordings/`
  - `reports/`
  - `failure-reports/`
  - `workflow-reports/`
  - `node_modules/`
  - `*.tgz`

## Validation

- Run `npm install`.
- Run `npm run clean`.
- Run `npm run build`.
- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run doctor`.
- Run `npm publish --dry-run`.
- Confirm package size is reasonable.
- Confirm tarball contents include `dist`, docs, templates, config, and no generated artifacts.
- Install the packed tarball in a temporary folder.
- Confirm the `android-dev-mcp` bin starts and lists MCP tools.
- Confirm bundled `config/apps.json` is used when no project-local config exists.

## Release

- Confirm CI is green.
- Update `CHANGELOG.md`.
- Commit changes.
- Create and push the version tag.
- Create GitHub release notes.

## Publish

- Run `npm login`.
- Run `npm whoami`.
- Run `npm publish --dry-run` one final time.
- Only after explicit maintainer approval, run:

```powershell
npm publish --access public
```

Do not publish from a dirty working tree.
