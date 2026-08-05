# Clean clone validation

Status: `PASS`.

The first evidence clone correctly exposed CRLF materialization under the required
`core.autocrlf=true`; PNGs matched but text manifests did not. Approval remained
withheld. Narrow pilot-only `eol=lf` rules were added and the evidence was
regenerated.

The corrected gate cloned commit `4f74bf07f3e05446a3d8fa9dd19c7c155883616e`
with `git -c core.autocrlf=true clone --no-local`. Effective pnpm was `9.15.4`.
`corepack pnpm install --frozen-lockfile --offline` reused 193/193 packages,
downloaded zero, and left tracked files clean.

Build/typecheck passed 6/6; workspace tests passed 253/253. A complete Cinder
rerun in a repository-relative clone evidence directory returned `APPROVED`.
All 28 PNGs matched. Artifact manifest, both capture manifests, technical bundle,
both authenticated critic reports, final resolution, geometry/material/resource
reports, and device-loss report were byte-identical. Tracked clone status remained
clean after build, tests, and reproduction.
