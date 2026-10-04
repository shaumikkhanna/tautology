# StageSelect Recommendation Outcome Measurement

StageSelect records what happens after a recommendation so ranking changes can
eventually be evaluated against behavior beyond a click or preference button.
This is observational product measurement, not proof that a recommendation
caused the outcome.

## Outcome funnel

The private `stageselect_recommendation_outcomes` table can record:

1. `saved` when a Discover recommendation is added to the wishlist;
2. `started` when its library status becomes Playing;
3. `finished` or `left` when it reaches either terminal status; and
4. `rated` when a rating is supplied.

Each outcome is stored at most once per recommendation impression. A rating is
kept on the `rated` record; the other outcomes deliberately carry no inferred
sentiment.

## Attribution

A save from Discover normally carries its exact impression id and is marked
`direct`. If the client does not yet have that id, the server uses the most
recent matching impression when one is available.

Later library changes use the most recent matching impression from the prior
90 days and are marked `recent_impression`. The window is intentionally bounded
to avoid crediting a recommendation indefinitely. Changing this window changes
measurement semantics and should be treated as an evaluation-version change.

Outcome logging is best-effort: a logging failure must never prevent a library
save or edit. Records are protected by RLS, removed with the account, and
included in the user's StageSelect JSON export.

## Interpreting results

Useful descriptive rates include saves per impression, starts per save, and
finishes per start. Segment these by model version, surface, rank, and controls,
and always report sample sizes. Avoid calling these causal lift without a
randomized experiment: position, user intent, catalogue availability, and time
all confound the observed rates.

The reproducible export-based analysis command and its maturity rules are
documented in `OUTCOME_EVALUATION.md`.
