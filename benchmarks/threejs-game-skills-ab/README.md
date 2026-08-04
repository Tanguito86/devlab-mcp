# DEVLAB-THREEJS-GAME-SKILLS-AB-04

`benchmark-contract.json` is the only manually maintained source of shared
benchmark configuration. The prompt, acceptance gates and leg policies are
derived from its canonical UTF-8/LF content and rejected if they drift.

```text
CONTRACT_VERSION: ab04-v2
EXECUTION_AUTHORIZED: YES
EXTERNAL_INSTALL: FORBIDDEN
EXTERNAL_SCRIPTS: FORBIDDEN
EXTERNAL_SCAFFOLD: FORBIDDEN
NETWORK: DENY_EXCEPT_LOOPBACK
```

The internal scaffold is a real, hash-locked project under `scaffolds/`. The
stdlib-only materializer copies it to an authorized run root through a staging
directory, writes reproducibility manifests and requires the two initial trees
to be byte-identical.

Run `corepack pnpm run benchmark:ab04:verify` before creating either leg. Do not
copy values from chat text into a builder prompt; use the generated prompt and
the contract at the verified commit.

LEG_B guidance is broker-only. Each read requires `--path`, `--pair-id` and
`--run-id`, and produces an HMAC-authenticated receipt in a coordinator ledger.
The future executor must keep the broker key and trusted ledger outside both
builder contexts and enforce leg ACLs plus OS-level egress denial. Directory
layout, browser routing and package-manager offline flags are not substitutes
for that containment.
