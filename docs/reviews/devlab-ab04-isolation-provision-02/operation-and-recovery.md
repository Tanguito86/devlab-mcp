# Operation and recovery

## Current operating decision

```text
SPRINT: DEVLAB-AB04-ISOLATION-TOKEN-03
MODE: PREPARATION_ONLY
STATIC_FEASIBILITY: REJECTED
DECISION: DO_NOT_APPLY
ELEVATION: NO
COMMIT: NO
SYSTEM_CHANGES: 0
```

Do not execute `Install-Ab04Isolation.ps1`, do not create either local user,
and do not install ACL or firewall policy from this worktree. Post-provision
adversarial commands are also inapplicable because no approved backend exists.
The launcher and provisioner are review artifacts only.

## Permitted review activity

From a normal, non-elevated session, reviewers may inspect files, parse
PowerShell, compile C# into a uniquely named temporary file, verify hashes and
run repository-local static tests. Temporary compiler output must be removed
after its exact path is checked. Read-only host inventory may confirm that the
named users, firewall rules and run root remain absent.

None of those activities authorizes provisioning. A parser pass, compilation
pass, hash match or unit-test pass cannot satisfy the rejected feasibility
gate. Do not change the manifest to `applyAuthorized: true`, generate a commit,
or run Codex as administrator.

## Credential rule

If a later, independently approved backend needs local credentials, each one
must be supplied interactively as a `PSCredential` whose password remains a
`SecureString`. The password may be consumed only in memory by the narrow
one-shot operation that needs it. It must not be:

- generated into or recovered from the repository;
- exported with `Export-Clixml` or another persistent credential store;
- written to a manifest, plan, receipt, HMAC ledger or log;
- serialized to JSON;
- placed on a process command line;
- stored in a persistent environment variable; or
- echoed in normal or error output.

The current sprint does not request credentials because application is
forbidden.

## Why the local-user procedure stops here

The proposed restricted token must disable generic authorization through
`Authenticated Users` and `BUILTIN\Users` to close `H:`. That leaves Windows
and Chromium dependency access unproven. It must also remove
`SeChangeNotifyPrivilege`, which makes every parent traverse check effective;
the leg SID has no narrow in-scope way to traverse the existing `H:` hierarchy.

Creating the executor under the final restricted primary token is also not
proved for a standard account without process-token privileges or a privileged
broker. Even if the first child starts, inspecting that token does not attest
the later Chromium/Crashpad process tree. Finally, pre-materializing LEG_B
guidance would contradict the canonical v2 hash-at-open/HMAC broker unless a
complete v3 contract is approved. No operational parameter can repair these
architecture conflicts.

## Network acceptance for a replacement backend

A replacement backend must default-deny all non-loopback traffic for the full
leg process tree while keeping both IPv4 `127.0.0.1` and IPv6 `::1` available.
Because a firewall block overrides an allow, do not combine an IPv6 `::/0`
block with an `::1` allow and claim loopback success. Use disjoint ranges or a
virtual network that excludes loopback, then test IPv4 and IPv6 separately,
including external HTTP, HTTPS, DNS and hostile child processes.

## Recovery

There is no host rollback to run: TOKEN-03 created zero users, zero firewall
rules and no AB-04 run root. Preserve the worktree and its review evidence. If
an inventory unexpectedly finds a matching system resource, stop and obtain an
independent ownership decision; do not assume this preparation created it and
do not delete it.

## Next backend

The next authorized architecture sprint should evaluate disposable VMs first,
or a reproducible Windows Sandbox configuration if it can expose the required
GPU safely. Each leg needs explicit mounts, private coordinator storage,
separate profiles/processes, loopback-only or disabled networking and
verifiable destruction. Before resuming AB-04, the backend must prove the exact
Chromium SHA, native NVIDIA/Turing WebGPU without software fallback, full
filesystem and egress isolation, descendant containment, and a reconciled v3
guidance contract.
