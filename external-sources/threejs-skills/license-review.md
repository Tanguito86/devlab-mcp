# threejs-skills license review

Review date: 2026-08-03

Pinned commit: `b1c623076c661fc9b03dac19292e825a5d106823`

Declared license: **MIT**

## Material license status

The README declares "MIT License - Feel free to use, modify, and distribute"
(line 140), but the pinned tree contains **no `LICENSE` file** and the GitHub
API reports no license for the repository.

Classification recorded in the manifest:

```text
DECLARED_LICENSE:      MIT
LICENSE_FILE_PRESENT:  NO
LICENSE_STATUS:        UNRESOLVED / REUSE_NOT_AUTHORIZED
```

This permits referencing and auditing the repository, but does **not**
authorize copying substantial portions of the skills until the license is
resolved (e.g. a LICENSE file is added upstream, or the author grants explicit
permission).

## Current use

This sprint stores only original registry metadata, review notes, validation
code, and hashes. It does not redistribute upstream source code or create a
derivative component.

## Requirements for later adaptation

If the license becomes resolvable and a component is adapted later, the
component audit must:

1. preserve applicable copyright and attribution notices;
2. include a copy of the license text when redistribution requires it;
3. mark locally modified upstream-derived files prominently;
4. review again for any component-level or third-party notices;
5. keep the upstream origin and pinned revision in the adaptation record.

This is a technical intake review, not legal advice or production approval.
