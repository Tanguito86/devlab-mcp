# DEVLAB-AB04-ISOLATION-TOKEN-03

```text
AUTHORIZATION: PREPARATION_ONLY
STATIC_PREPARATION: RESTARTED
CODEX_ELEVATED_SESSION: NO
ADMINISTRATIVE_APPLY: NO
COMMIT: NO
SYSTEM_CHANGES: 0
LOCAL_USER_RESTRICTED_TOKEN_BACKEND:
  REJECTED_BY_STATIC_FEASIBILITY_GATE
DECISION: DO_NOT_APPLY
```

This directory records the restarted TOKEN-03 static assessment. The presence
of provisioning scripts, a compilable launcher or matching hashes is not
evidence that the proposed backend is safe to install. No script in this
worktree is authorized for elevated execution.

The design attempted to combine two standard local accounts with a restricted
token that removes the generic groups exposing `H:`. Static review found that
the same generic `BUILTIN\Users` and `Authenticated Users` grants participate
in access to Windows and Chromium dependencies. Removing
`SeChangeNotifyPrivilege` also makes the existing `H:` ancestor traversal
unsatisfied by the leg-specific SIDs. Fixing either issue would require broad
host ACL changes outside the DevLab AB-04 prefix.

The review additionally found unresolved privilege requirements for creating
the final restricted-token process, no complete attestation story for all
Chromium/Crashpad descendants, and an unreconciled contract conflict between
the v2 hash-at-open broker and the proposed v3 pre-materialized guidance
bundle. These are architecture blockers, not deferred tests.

Credentials remain a memory-only input requirement. Any future network design
must preserve both IPv4 and IPv6 loopback while denying all non-loopback
traffic for every descendant. The supported next direction is a disposable VM
or a reproducible Windows Sandbox backend with GPU access, explicit mounts and
verifiable destruction. It must prove the contractual Chromium SHA and native
hardware WebGPU without relaxing any benchmark gate.

## Review entry points

- `architecture-and-threat-model.md`
- `independent-review-checklist.md`
- `operation-and-recovery.md`
- `validation-evidence.md`
- `final-status.md`

The AB-04 benchmark remains blocked and preserved. No commit or apply is part
of this restarted preparation.
