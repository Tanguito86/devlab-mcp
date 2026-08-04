# DEVLAB-ASH-RELAY-PILOT-05 baseline

## Repository inventory

```text
AUTHORITATIVE_REPOSITORY:
H:/UserData/Deposito/Documents/devlab-mcp

MASTER_HEAD:
787748cc0927315e5372af5929b5dfc0ca8714cb

MASTER_WORKTREE:
CLEAN

PILOT_WORKTREE:
H:/UserData/Deposito/Documents/devlab-mcp-ash-relay-pilot

PILOT_BRANCH:
devlab-ash-relay-pilot-05

PILOT_BASE_HEAD:
787748cc0927315e5372af5929b5dfc0ca8714cb

PILOT_INITIAL_STATE:
CLEAN
```

The inventory above records the clean starting point inspected on 2026-08-04.
It is baseline evidence only; it is not gameplay, browser or GPU validation.

## Authorized scope

The sprint authorizes one real **ASH RELAY** product pilot: design,
implementation in one canonical materialization, native WebGPU validation, a
three-critic gauntlet, and conditional fast-forward integration. It does not
authorize resuming the A/B benchmark or applying hostile-isolation machinery.

The following remain outside scope:

- creation of users, ACLs, firewall rules, restricted tokens, AppContainer,
  virtual machines, or Windows Sandbox;
- integration, invocation, or repair of the rejected AB-04 provisioner;
- resumption of LEG_A or LEG_B, blinded mapping, A/B scoring, or a conclusion
  about which treatment wins;
- imports from Galaxy Raiders, Hellbullet, or another game; and
- external services, CDNs, paid APIs, upstream generators, or commercial assets.

## Design inputs and authority

The frozen `ASH RELAY` benchmark prompt and `ab04-v2` contract are used as
inputs for the pilot's setting, loop, required states, and technical quality
bar. Historical AB-04 validation establishes only facts about the shared
scaffold. Pilot implementation claims are supported separately by this
sprint's own static and runtime evidence.

The new pilot is not an A/B benchmark leg and does not inherit treatment
mapping, blinded order, scoring or isolation machinery. This PILOT-05
authorization covers its product implementation, validation, documentation,
and conditional fast-forward integration.

The final canonical verifier reconfirmed:

```text
AB04_CONTRACT: PASS
SOURCE_HEAD: 7221c1f4a6d2ae189a4d85d058d24f3228499d46
SOURCE_CHECKOUT: DETACHED / CLEAN
ALLOWLIST_PATHS: 25/25
ALLOWLIST_CANONICAL_UTF8_LF_SHA256: 25/25
SELECTED_GUIDANCE_CANONICAL_SHA256:
443f510cd4021cc43f0a0d0a53a6f40faad34f45767d6137c6d1ef23c93037ee
```

The selected-guidance value above is the canonical hash reported by the AB-04
verifier, not a raw PowerShell text-file hash.

## Materialization boundary

The canonical materializer verified contract v2, the source pin, the scaffold,
and the 25-file allowlist before writing. Its older AB-04 root-name guard did
not accept the pilot's mandated root name. It therefore materialized exactly
once into a new compliant staging root; that complete byte-preserving directory
was moved to the mandated game path and the empty staging parent was removed.
The materialized report remained unchanged:

```text
RUN_ROOT: H:/UserData/Deposito/Documents/devlab-runs/ash-relay-pilot-05
GAME: H:/UserData/Deposito/Documents/devlab-runs/ash-relay-pilot-05/game
MATERIALIZATION_REPORT_SHA256:
e939be5096f803d54ad29bce5337751e8f769067191eb1dcf033b97cb023e69c
SCAFFOLD_TREE_SHA256:
c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908
MATERIALIZED_COPIES: 1
```

The application was subsequently developed in that game directory. Companion
documents distinguish design targets from validation results and do not reuse
historical AB-04 evidence as pilot acceptance.
