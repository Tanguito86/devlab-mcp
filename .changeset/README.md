# Changesets

This directory contains changesets — small markdown files that describe what changed and which packages should be version bumped.

## Quick reference

```bash
# Create a changeset (describes your change)
pnpm changeset

# Version packages (consumes changesets, updates CHANGELOGs)
pnpm changeset version

# Publish changed packages to npm
pnpm changeset publish
```

Changesets are consumed when you run `pnpm changeset version` and deleted after being applied.
