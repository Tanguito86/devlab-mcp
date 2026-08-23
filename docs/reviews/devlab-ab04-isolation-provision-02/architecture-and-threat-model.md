# Architecture and threat model

## Static feasibility decision

`DEVLAB-AB04-ISOLATION-TOKEN-03` restarted preparation from the preserved
baseline and evaluated a dedicated-local-user plus restricted-token backend.
The backend is `REJECTED_BY_STATIC_FEASIBILITY_GATE / DO_NOT_APPLY` on this
host. No account, ACL, firewall rule, run root or browser profile was created.

The rejection is not authorization to weaken the benchmark. It means the
local-user proposal cannot simultaneously satisfy the host path topology,
Windows/Chromium execution and the original isolation gates with narrowly
scoped AB-04 changes.

## Boundary that was attempted

The coordinator would retain mapping, HMAC key, score inputs, order record and
orchestration ledger in private storage. LEG_A and LEG_B would use distinct
standard local-account SIDs, distinct roots, separate Chromium copies and
profiles, and a restricted primary token for the executor and every child.

The proposed token would make these authorization SIDs disabled or deny-only:

- `S-1-5-11` (`Authenticated Users`);
- `S-1-5-32-545` (`BUILTIN\Users`);
- `S-1-5-32-544` (`BUILTIN\Administrators`).

It would also remove or disable `SeChangeNotifyPrivilege`, retain medium
integrity, and launch the complete Chromium/Crashpad process tree without a
breakaway path. Credentials would exist only as `PSCredential`/`SecureString`
values in coordinator memory. Passwords must never enter a repository file,
manifest, receipt, log, command line, persistent environment variable or DPAPI
credential file.

## Blocking findings

### Generic host grants collide with required runtime access

The current `H:` DACL grants `Authenticated Users` modify rights and
`BUILTIN\Users` read/execute rights. A normal local account can therefore read
protected checkouts unless both generic authorization paths are removed from
its effective token.

Making `BUILTIN\Users` and `Authenticated Users` deny-only also removes their
positive authorization contribution when Windows loads the launcher,
system DLLs, fonts, GPU components and the Chromium distribution. The proposal
does not establish a complete set of explicit per-leg ACEs for those runtime
dependencies. Adding such ACEs across Windows or user data would exceed the
DevLab AB-04 prefix and would turn a narrow benchmark provisioner into a host
policy migration. This is a fail-closed incompatibility, not an installer
detail.

### Traverse privilege versus the fixed `H:` hierarchy

Removing `SeChangeNotifyPrivilege` removes the normal bypass-traverse
privilege. Every ancestor between the volume root and a leg root then needs an
effective traverse grant for that leg token. The fixed leg SID has no explicit
ACE on the existing `H:` ancestors, while the generic SIDs that supply access
must be disabled to protect the other checkouts. Granting both leg SIDs on
those ancestors would modify paths outside the approved AB-04 root and widen
the attack surface. Retaining `SeChangeNotifyPrivilege` would violate the
TOKEN-03 gate. Neither option is acceptable.

### Restricted process creation is not proven for a standard account

`CreateProcessAsUser` can require `SeIncreaseQuotaPrivilege` and, depending on
the token relationship, `SeAssignPrimaryTokenPrivilege`.
`CreateProcessWithTokenW` can require `SeImpersonatePrivilege`. A standard leg
account is not entitled to acquire those privileges. A trusted bootstrap may
log on the user and derive a restricted token, but the current design has not
proved that it can create the final suspended child under that token on the
target host without elevation, a service or a privileged broker. Falling back
to a normal-token builder would invalidate the isolation boundary.

### Immediate-child inspection is not descendant attestation

Inspecting the first executor token before resume does not prove the effective
token of later Chromium utility, GPU, renderer and Crashpad processes. A job
object can provide lifetime containment, but it does not by itself attest each
descendant's user SID, disabled groups, privileges and integrity level, nor
prove that no broker or alternate executable can be used for escape. The
architecture lacks a complete fail-closed descendant-attestation mechanism.

### Guidance delivery conflicts with the canonical contract

The canonical AB-04 v2 artifacts specify hash-at-open/HMAC broker delivery.
TOKEN-03 proposes a pre-materialized `guidance-readonly` bundle for LEG_B.
Those are different security and scoring contracts. A hybrid implementation
would silently change what the benchmark measures. Bundle materialization must
remain non-authoritative until a coherent AB-04 v3 contract, manifest, hashes,
runbook and tests are approved together.

## Network requirement, if another backend is evaluated

Egress must be default-deny for the entire leg identity/process boundary while
preserving both `127.0.0.1` and `::1`. Windows Firewall block rules override
allow rules, so an IPv6 `::/0` block cannot be paired with an effective `::1`
allow. Any design must use disjoint non-loopback ranges or an isolated virtual
network, then independently prove IPv4 loopback, IPv6 loopback, external
HTTP/HTTPS denial, DNS denial and denial for hostile descendants.

## Required fallback

The local-user architecture must be discarded for this host. A future sprint
may evaluate a disposable VM or a reproducible Windows Sandbox configuration
with explicit per-leg mounts, private coordinator storage, disabled or
loopback-only networking, isolated browser profiles and verifiable cleanup.
That backend is acceptable only if the contractual Chromium SHA and native
NVIDIA/Turing WebGPU path work without software fallback and every original
adversarial filesystem, process and network gate passes.
