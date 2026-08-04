# Port decisions

One real port was required. Commit `63ffcf2b4e66a560fa00a14b620e2385326767aa` removes `version: 9` from both `pnpm/action-setup@v4` steps while retaining `packageManager: pnpm@9.15.4` in the root package.

The action's official contract documents that the `version` input is optional when `package.json` supplies `packageManager`, allowing CI to use the exact repository pin: <https://github.com/pnpm/action-setup#readme>.

No lockfile or product source changed. The remote commit was not cherry-picked because its base belongs to the unrelated published history.
