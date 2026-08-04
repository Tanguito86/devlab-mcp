# AB-04 closure

```text
DEVLAB-THREEJS-GAME-SKILLS-AB-04:
CANCELLED / ADVERSARIAL_ISOLATION_COST_EXCEEDED_VALUE

DEVLAB-AB04-ISOLATION-TOKEN-03:
REJECTED / DO_NOT_APPLY

AB04_BUILDERS_EXECUTED:
0

AB04_PROVISIONER_INTEGRATED_IN_ASH_RELAY:
NO

SYSTEM_CHANGES_FROM_TOKEN-03:
0

ASH_RELAY_PILOT_DEPENDS_ON_AB04_ISOLATION:
NO
```

## Closure decision

AB-04 is cancelled. Its fail-closed behavior was correct: the builders did not
run after the host failed to provide a trustworthy, economical separation
boundary. Static TOKEN-03 review rejected the local-user plus restricted-token
architecture because closing generic `H:` access conflicted with narrow host
scope, path traversal and reliable Windows/Chromium execution. The cost of
proving or replacing that boundary exceeded the expected value of the A/B
comparison.

This is not a WebGPU failure, a DevLab failure or evidence for or against the
Three.js game-skills guidance. With zero builder executions, there is no pair
to score and no treatment effect to infer.

## Preserved boundary

The AB-04 contract, scaffold, prompt, manifests, plans and rejected
provisioning artifacts remain historical evidence. They are not merged,
copied, invoked or treated as dependencies of the ASH RELAY pilot. In
particular:

- do not apply TOKEN-03;
- do not create `DevLabAb04LegA` or `DevLabAb04LegB`;
- do not install its ACL or firewall policy;
- do not materialize its blinded leg roots or guidance bundle;
- do not revive LEG_A/LEG_B labels for product work; and
- do not report prior scaffold checks as ASH RELAY gameplay acceptance.

No cleanup of preserved AB-04 evidence is authorized by this closure record.

## Transition to a product pilot

`DEVLAB-ASH-RELAY-PILOT-05` starts independently from clean master
`787748cc0927315e5372af5929b5dfc0ca8714cb`. It uses the original ASH RELAY
creative prompt as a product brief, not as a blinded comparison. The pilot can
reuse the internal DevLab scaffold under the pilot authorization; it cannot
integrate the rejected isolation provisioner. All pilot implementation and
runtime claims remain isolated in the new sprint's own evidence set.
