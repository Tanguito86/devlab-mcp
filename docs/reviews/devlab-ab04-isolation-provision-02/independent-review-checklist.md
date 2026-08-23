# Independent review checklist

## Current TOKEN-03 decision

- [x] Authorization is preparation-only.
- [x] Codex was not run elevated.
- [x] No administrator provisioning script was applied.
- [x] No local leg account, firewall rule, AB-04 run root or browser profile was created.
- [x] No commit was authorized or created for TOKEN-03.
- [x] The local-user plus restricted-token architecture is marked `REJECTED_BY_STATIC_FEASIBILITY_GATE / DO_NOT_APPLY`.
- [x] AB-04 remains blocked with its prior state preserved.

## Fail-closed findings that must not be waived

- [x] `H:` generic access through `Authenticated Users` and `BUILTIN\Users` is recognized as an isolation exposure.
- [x] Disabling both generic SIDs has not been shown compatible with loading every required Windows, Chromium, GPU and Crashpad dependency.
- [x] Broad Windows, drive-root or user-data ACL edits are outside scope and are not an acceptable workaround.
- [x] Removing `SeChangeNotifyPrivilege` leaves the fixed leg SID without proven traverse access across every existing `H:` ancestor.
- [x] Adding leg-specific traverse ACEs outside the AB-04 prefix is not authorized.
- [x] Standard-account process creation under the final restricted token is not proven without unavailable token privileges or a privileged broker.
- [x] Immediate-child token inspection is not accepted as attestation of all Chromium, GPU, renderer and Crashpad descendants.
- [x] A normal-token fallback is forbidden.
- [x] The v2 hash-at-open broker and proposed v3 pre-materialized guidance bundle are contractually incompatible until reconciled as one reviewed contract.

## Requirements for any future implementation

- [ ] Credentials enter only as in-memory `PSCredential`/`SecureString` values.
- [ ] No password appears in a file, manifest, receipt, log, command line, persistent environment variable or exported credential object.
- [ ] LEG_A and LEG_B have distinct real identities and cannot read each other or coordinator-private storage.
- [ ] LEG_A cannot read guidance or the external checkout.
- [ ] LEG_B can read only an authenticated, contract-approved guidance surface and cannot write it or reach the checkout directly.
- [ ] Every executor and browser descendant is contained and its effective identity/token policy is verifiably equivalent.
- [ ] IPv4 `127.0.0.1` and IPv6 `::1` both pass.
- [ ] IPv4/IPv6 non-loopback HTTP, HTTPS, DNS and hostile-child egress all fail.
- [ ] No catch-all IPv6 block masks `::1`; blocking ranges or the virtual network exclude loopback explicitly.
- [ ] Separate Chromium profiles and process trees are proven.
- [ ] The contractual Chromium SHA is proven inside each leg.
- [ ] Native NVIDIA/Turing WebGPU is proven with no software fallback.
- [ ] Cleanup/destruction is independently verifiable.

## Backend disposition

- [x] The local-account/restricted-token backend is rejected on this host.
- [ ] A disposable VM or reproducible Windows Sandbox GPU backend is selected by an independent review.
- [ ] The selected backend passes the complete adversarial matrix before AB-04 resumes.
- [ ] A coherent AB-04 v3 contract resolves guidance delivery, `RUN_ROOT` and recorded pre-builder order selection before builder execution.

Until all unchecked acceptance items have evidence, the only valid decision is
`DO_NOT_APPLY`.
