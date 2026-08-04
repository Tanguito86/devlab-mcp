# ASH RELAY gameplay critic

## Initial independent verdict

```text
GAMEPLAY_CRITIC: BLOCK
P0: 0
P1: 1
MODIFIED_CODE: NO
```

The initial read-only review found that Guardian health floors could look like
ignored player hits. That was a gameplay-clarity P1: the bot could complete the
fight, but the survival requirement was not communicated as an intentional
invulnerable state.

Cycle 2 resolved it in product code by making the floors explicit armor locks,
preventing hit credit while sealed, and showing `ARMOR SEALED — SURVIVE Ns` in
HUD, prompt, and capture overlay. The critic did not make that change.

## Final re-review verdict

```text
GAMEPLAY_CRITIC: PASS
P0: 0
P1: 0
P2: 3
MODIFIED_CODE: NO
```

The read-only critic reviewed the final simulation, bot report, controls,
objective/UI behavior, encounter route, checkpoint, both Guardian phases,
defeat/restart, and victory.

Confirmed strengths:

- the objective sequence is reachable and remains visible from title through
  evacuation;
- desktop and touch input exercise movement and attack;
- Harrier close pursuit and Ward ranged pressure create distinct decisions;
- checkpoint restore is separate from a clean restart and passed 10/10;
- the Guardian changes cadence, area pattern, presentation, and secondary
  pressure between phases;
- its two survival floors are explicit invulnerable armor locks with countdowns,
  not hidden ignored damage;
- ten seeds reached victory with zero softlocks and final health 51-74.

## Non-blocking P2 findings

1. The tutorial says move, aim, and fire, but automation directly proves
   movement and firing rather than a distinct aim-comprehension checkpoint.
2. The perfect-information bot finishes in 165.850-167.300 seconds, slightly
   below three minutes; the 3-5 minute new-player target remains plausible but
   was not measured with humans.
3. Subjective fun, control feel, and learning clarity require a human playtest;
   automated reachability cannot establish them.

The critic did not claim premium gameplay quality and made no code changes.
