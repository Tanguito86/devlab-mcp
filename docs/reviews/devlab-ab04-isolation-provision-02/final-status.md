# Final status

```text
DEVLAB-AB04-ISOLATION-TOKEN-03:
STATIC_PREPARATION_RESTARTED /
REJECTED_BY_STATIC_FEASIBILITY_GATE /
DO_NOT_APPLY

BASELINE:
787748cc0927315e5372af5929b5dfc0ca8714cb

LOCAL_USER_PLUS_RESTRICTED_TOKEN_ARCHITECTURE:
REJECTED_ON_CURRENT_HOST

CODEX_ELEVATED_SESSION:
NO

ADMINISTRATIVE_APPLY:
NO

COMMIT:
NO

SYSTEM_CHANGES:
0

LOCAL_USERS_CREATED:
0

FIREWALL_RULES_CREATED:
0

AB04_RUN_ROOT_CREATED:
NO

AB-04:
BLOCKED / STATE_PRESERVED

STATIC_VALIDATION:
TOKEN POLICY PASS
SCRIPT HASHES 10/10
POLICY TESTS 8/8
DEVLAB TESTS 181/181
BUILD 4/4
TYPECHECK 4/4
```

The rejection is architectural, not a failure of WebGPU or DevLab. Disabling
the generic `Authenticated Users` and `BUILTIN\Users` authorization paths is
necessary to close the readable `H:` checkout surface, but those same generic
grants are part of the path by which a standard user reaches Windows runtime
files and Chromium dependencies. Removing `SeChangeNotifyPrivilege` also makes
every parent-directory traverse decision material; the fixed leg roots cannot
be reached without granting each leg identity rights outside the permitted
AB-04 prefix.

Process creation under the final restricted primary token, reliable
attestation of Chromium/Crashpad descendants, and the incompatible AB-04 v2
versus proposed v3 guidance delivery models remain unresolved. Script presence
or successful compilation cannot override those findings.

The local-user design must not be provisioned. A future sprint may evaluate a
disposable VM or a reproducible Windows Sandbox configuration with GPU access,
explicit mounts, private coordinator storage and independently verified native
WebGPU. The benchmark remains blocked until that backend passes every original
gate without relaxing one.
