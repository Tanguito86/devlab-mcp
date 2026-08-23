# Validation evidence

## Current TOKEN-03 evidence boundary

```text
STATIC_PREPARATION: RESTARTED
STATIC_FEASIBILITY_GATE: REJECTED
LOCAL_USER_RESTRICTED_TOKEN_BACKEND: DO_NOT_APPLY
ADMINISTRATIVE_APPLY: NOT_RUN
COMMIT: NOT_CREATED
SYSTEM_CHANGES: 0
```

The earlier PROVISION-02 parser, hash, repository-test, build and typecheck
counts predate the restarted restricted-token design. They are historical
artifact evidence only and must not be reported as current TOKEN-03 acceptance.
Any new compilation, hash or unit-test result can establish that a review
artifact is internally consistent; it cannot overturn the static architecture
rejection below.

## Fresh TOKEN-03 static validation

```text
POWERSHELL_PARSE: PASS (10 scripts/modules)
NODE_SYNTAX: PASS
CSHARP_COMPILE_CHECK: PASS
CSHARP_TEMPORARY_OUTPUT_REMOVED: YES
RESTRICTED_TOKEN_STATIC_TEST: PASS
SCRIPT_HASHES: 10/10
TOKEN03_POLICY_TESTS: 8/8
AB04_CONTRACT_V2: PASS
AB04_SCAFFOLD: PASS
ALLOWLIST: 25/25
FULL_REPOSITORY_TESTS: 181/181
BUILD: 4/4
TYPECHECK: 4/4
PLAN_DECISION: DO_NOT_APPLY
PLAN_CAN_APPLY: FALSE
PLAN_HOST_CHANGED: FALSE
```

The launcher source SHA-256 is
`30733a71531e52c16a0b5e40e1bca2243befe6fc82ad271e6add2673075c8fd5`.
The static plan reproduced both decisive filesystem findings:
`BUILTIN_USERS_AUTHORIZES_H_READ` and
`WINDOWS_RUNTIME_DEPENDS_ON_BUILTIN_USERS`.
An ephemeral canonical-LF materialization independently verified the guidance
bundle as 25 files, 128391 bytes and tree SHA-256
`316359c4eb750d156113791927651c45982fcd21c6d91ec8f402a680d2ddc5f3`;
the temporary tree was removed immediately.

## Static findings

```text
H_AUTHENTICATED_USERS_MODIFY: PRESENT
H_BUILTIN_USERS_READ_EXECUTE: PRESENT
DISABLE_GENERIC_SIDS_REQUIRED_FOR_CHECKOUT_ISOLATION: YES
WINDOWS_CHROMIUM_DEPENDENCY_ACCESS_AFTER_DISABLE: NOT_PROVEN
SE_CHANGE_NOTIFY_REMOVAL_REQUIRED: YES
LEG_SID_TRAVERSE_ACROSS_H_ANCESTORS: NOT_PROVEN
NARROW_IN_SCOPE_ACL_REPAIR: NONE_IDENTIFIED
STANDARD_USER_RESTRICTED_PROCESS_CREATION: NOT_PROVEN
ALL_DESCENDANT_TOKEN_ATTESTATION: NOT_PROVEN
GUIDANCE_V2_V3_CONTRACT: CONFLICT
```

The findings combine into a fail-closed result. `BUILTIN\Users` cannot remain
an effective allow SID because it exposes the protected `H:` content, yet
removing its authorization contribution leaves required Windows and Chromium
access unproven. Removing `SeChangeNotifyPrivilege` then exposes unsatisfied
ancestor traverse checks. Broad host ACL changes, a privileged broker or a
normal-token fallback are outside the authorized design.

Checking only the initial executor process is not evidence that Chromium GPU,
renderer, utility and Crashpad descendants retained the same restricted token.
Likewise, a pre-materialized LEG_B guidance bundle cannot be acceptance
evidence while the canonical v2 contract still requires hash-at-open/HMAC
broker delivery.

## Live-state preservation

```text
BASELINE: 787748cc0927315e5372af5929b5dfc0ca8714cb
DevLabAb04LegA: ABSENT
DevLabAb04LegB: ABSENT
DevLab AB04 firewall rules: 0
production run root: ABSENT
CODEX elevated session: NO
```

No real isolation, Chromium or WebGPU acceptance test was run under the
rejected backend. Therefore there is no claim that local-user TOKEN-03 passes
filesystem isolation, dual-stack loopback, egress denial, child containment or
native WebGPU.

## Evidence required from a replacement backend

A disposable VM or reproducible Windows Sandbox GPU implementation must add
fresh evidence for all original gates. At minimum it must demonstrate distinct
leg identities, explicit mount isolation, coordinator-private storage,
read-only contract-approved LEG_B guidance, IPv4 `127.0.0.1`, IPv6 `::1`,
non-loopback HTTP/HTTPS/DNS denial, hostile-descendant containment, exact
Chromium hashes, separate profiles/processes, native NVIDIA/Turing WebGPU with
no software fallback, and verifiable destruction. Until then AB-04 remains
blocked and preserved.
