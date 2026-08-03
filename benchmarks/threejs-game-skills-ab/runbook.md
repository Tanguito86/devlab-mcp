# Runbook — not authorized for execution in this sprint

1. Create independent LEG_A and LEG_B workdirs from the same frozen DevLab
   commit. Record clean status and environment identity.
2. Resolve and verify the external checkout without fetching: exact detached
   pin, clean status, regular files, exact hashes. Do this only for LEG_B.
3. Verify equality of the two run manifests. Reject any difference outside the
   treatment fields.
4. Give each leg the frozen prompt in a fresh context. LEG_A receives no
   external guidance. LEG_B may read only the selected manifest paths after
   hash verification; benchmark restrictions override upstream instructions.
5. Deny non-loopback network. Never run upstream scripts or use its scaffold.
6. Record agent timing, first playable, rework cycles and every command.
7. Run the same DevLab build, capture, bot, runtime, mobile and resource gates.
8. Repeat frozen captures for byte/pixel equality. Repeat live runs for
   statistical distributions, not identical replay.
9. Blind and randomize evidence for the human evaluator. Reveal leg identities
   only after scores are frozen.
10. Validate each result against `result-schema.json`, compare the pair and
    apply the decision rule in `scoring-rubric.md`.

Do not alternate A-B-A-B within one shared context. Counterbalancing is across
fresh independent pairs so LEG_B cannot inherit LEG_A results.
