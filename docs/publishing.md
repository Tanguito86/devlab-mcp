# Publishing Guide

DevLab MCP Suite uses [Changesets](https://github.com/changesets/changesets) for independent package versioning within the monorepo. Each package has its own version and CHANGELOG.

## Quick Reference

```bash
pnpm changeset          # Create a changeset
pnpm changeset:version   # Bump versions (consumes changesets)
pnpm changeset:publish   # Publish to npm
pnpm -r pack:dry-run     # Preview package contents
```

## First Publish (v1 Release)

### Package Status

| Package | npm name | Version | Published? |
|---------|----------|---------|------------|
| Shared | `@tanguito/devlab-shared` | 0.1.0 | ❌ Pending |
| Android | `@tanguito/android-dev-mcp` | 1.2.0 | ✅ Published |
| Browser | `@tanguito/browser-dev-mcp` | 1.0.0 | ❌ Pending |
| Visual | `@tanguito/visual-regression-mcp` | 0.1.0 | ❌ Pending |

### Exact Publish Commands

**Prerequisites:**
- npm auth token configured (`npm login` or `NPM_TOKEN` env var)
- 2FA handled (use `--otp` flag or automation token)
- All packages build and test cleanly (`pnpm build && pnpm test`)

```bash
# 1. Login to npm (one-time)
npm login

# 2. Publish shared first (dependency of other packages)
pnpm --filter @tanguito/devlab-shared publish --access public

# 3. Publish browser-dev-mcp
pnpm --filter @tanguito/browser-dev-mcp publish --access public

# 4. Publish visual-regression-mcp
pnpm --filter @tanguito/visual-regression-mcp publish --access public
```

> **Note:** `@tanguito/android-dev-mcp` is already published. Do not re-publish unless version has changed.

### WSL Users

WSL users need Windows-side npm authentication:

```bash
# npm publish from WSL uses Windows npm binary (auth token in Windows credential manager)
cmd.exe /c "npm publish --access public"

# Or use npm login from WSL directly
npm login
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
browser-dev-mcp:       1.0.0 → 1.0.1  (bug fix, patch)
android-dev-mcp:       1.2.0 → 1.3.0  (new tool, minor)
visual-regression-mcp: 0.1.0 → 0.1.0  (unchanged)
shared:                0.1.0 → 0.1.0  (unchanged)
```

Changesets tracks this automatically. You only specify which packages changed when creating a changeset.

## Release notes

Changeset-generated CHANGELOGs use the summary you write when creating the changeset. Write clear, user-facing descriptions:

```
✅ Good:
"Added android_app_info tool that shows version, install date, and permissions for any app."

❌ Bad:
"Fixed stuff"
```

## Not ready to publish?

**Current status: foundation frozen. Publish-ready.**

When ready:
1. Ensure `NPM_TOKEN` is set in GitHub Secrets
2. Configure the release workflow in `.github/workflows/release.yml`
3. Run `pnpm changeset:version` to create the first version PR
4. Merge and let CI publish
