# P-01 lifecycle decision

Verdict: `APPROVED / ADAPT_BEHIND_DEVLAB_LIFECYCLE`

## Decision

Add one renderer-agnostic visibility adapter to the Topdown Shooter Kit. A browser document is represented through a small `VisibilitySource`; experiences do not bind `visibilitychange` themselves.

The adapter coordinates the existing `GameLifecycle` and `FixedStepAccumulator` rather than replacing either:

- hidden state contributes a central pause reason;
- manual pause is a separate reason and survives hide/show;
- the accumulator is not reset or advanced while hidden;
- the first external delta after visibility resumes is discarded;
- timestamps come from an injected monotonic clock;
- transitions are emitted as auditable lifecycle events;
- restart and device recovery remain owned by their existing contracts.

An initially hidden source uses `GameLifecycle.startPaused()`, so even a synchronous subscription notification cannot start the loop before the hidden state is applied.

## Exact-freeze invariant

The adapter never calls `FixedStepAccumulator.resume()` during a visibility transition. Therefore a partial accumulator survives unchanged. Hidden elapsed time is represented as zero accepted elapsed, and the first resumed frame is also zero. RNG and gameplay timers advance only inside fixed-step updates, so neither changes while hidden.

## Compatibility

This is additive. `GameLifecycle`, device generation recovery, fixed timestep, and consumers that do not opt into the central document source retain their current API. New browser experiences must create one adapter and route manual pause and frame elapsed through it.
