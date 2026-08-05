# Clean clone validation

Status: pending the first commit containing complete capture/review evidence.

The gate will use `git -c core.autocrlf=true clone --no-local`, confirm exact HEAD,
run `corepack pnpm install --frozen-lockfile --offline`, build/typecheck/tests,
rerun the Cinder pilot into a repository-relative reproduction directory, and
compare its deterministic artifact/capture manifests and every PNG hash against
the committed evidence. The clone must remain independent of untracked files in
the primary checkout.
