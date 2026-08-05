# Versioning and immutability

SemVer is validated. Duplicate identities and accidental lower versions are rejected. Entries at `CANDIDATE`, `APPROVED`, or `DEPRECATED` are immutable; regeneration of an existing artifact directory is admitted only when the production manifest hash is identical. Tests cover mutation rejection, new-version admission, duplicates, downgrade rejection and deprecated lookup.
