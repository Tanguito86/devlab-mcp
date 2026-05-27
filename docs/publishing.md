# Publishing Guide

DevLab MCP Suite uses [Changesets](https://github.com/changesets/changesets) for independent package versioning within the monorepo. Each package has its own version and CHANGELOG.

## Quick Reference

```bash
pnpm changeset          # Create a changeset
pnpm changeset:version   # Bump versions (consumes changesets)
pnpm changeset:publish   # Publish to npm
pnpm -r pack:dry-run     # Preview package contents
```

## Workflow

### 1. Create a changeset (after making changes)

```bash
pnpm changeset
```

This prompts you to:
- Select which packages changed
- Choose semver bump: `patch`, `minor`, or `major`
- Write a summary of the change

This creates a `.md` file in `.changeset/`. Commit it with your PR.

### 2. Version packages (when ready to release)

```bash
pnpm changeset:version
```

This:
- Reads all pending changesets
- Bumps versions in `package.json` files
- Updates `CHANGELOG.md` per package
- Deletes consumed changesets

Review the changes and commit the version PR.

### 3. Publish to npm

```bash
pnpm changeset:publish
```

This publishes all changed packages to npm with `npm publish`.

**Requirements:**
- npm auth token configured (`npm login` or `NPM_TOKEN` env var)
- 2FA handled (use `--otp` flag or automation token)

## Dry-run before publishing

```bash
# Preview what would be published
pnpm -r pack:dry-run

# Preview version bumps
pnpm changeset version --dry-run
```

## Independent versioning

Each package versions independently. Example scenario:

```
browser-dev-mcp:  1.0.0 → 1.0.1  (bug fix, patch)
android-dev-mcp:  1.2.0 → 1.3.0  (new tool, minor)
shared:            0.1.0 → 0.1.0  (unchanged)
```

Changesets tracks this automatically. You only specify which packages changed when creating a changeset.

## Package listing

| Package | npm name | Current |
|---------|----------|---------|
| Shared | `@tanguito/devlab-shared` | 0.1.0 |
| Android | `@tanguito/android-dev-mcp` | 1.2.0 |
| Browser | `@tanguito/browser-dev-mcp` | 1.0.0 |

## Release notes

Changeset-generated CHANGELOGs use the summary you write when creating the changeset. Write clear, user-facing descriptions:

```
✅ Good:
"Added android_app_info tool that shows version, install date, and permissions for any app."

❌ Bad:
"Fixed stuff"
```

## Publishing from WSL

WSL users need Windows-side npm authentication:

```bash
# npm publish from WSL uses Windows npm binary (auth token in Windows credential manager)
cmd.exe /c "npm publish --access public"

# Changesets publish uses the same mechanism
pnpm changeset:publish
```

## Not ready to publish?

**Current status: foundation frozen. No npm publishing yet.**

When ready:
1. Ensure `NPM_TOKEN` is set in GitHub Secrets
2. Configure the release workflow in `.github/workflows/release.yml`
3. Run `pnpm changeset:version` to create the first version PR
4. Merge and let CI publish
