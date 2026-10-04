# StageSelect Outcome Evaluation

The outcome evaluator turns a private StageSelect JSON export into a
reproducible report grouped by recommendation model and surface. It reads a
local file and makes no network requests.

From `frontend/`, run:

```bash
npm run analyze:stageselect-outcomes -- /path/to/stageselect-export.json
npm run analyze:stageselect-outcomes -- /path/to/stageselect-export.json --json
```

The readable report shows outcome rates and matured denominators. JSON output
also includes 95% Wilson score intervals, terminal-outcome breakdowns,
attribution counts, and data-quality counters.

## Maturity windows

Analysis version `outcome-funnel-v1` uses:

| Outcome | Minimum impression age | Reason |
| --- | ---: | --- |
| Saved | 1 day | Usually immediate, with a short decision allowance. |
| Started | 14 days | Starting is delayed by backlog and availability. |
| Finished or left | 90 days | Terminal outcomes require substantially more time. |
| Rated | 90 days | Ratings generally arrive with a terminal outcome. |

An impression younger than a signal's window is excluded from that signal's
denominator. This handles right censoring: the outcome is not yet observed, but
it may still happen later. Counting every recent impression as a failure would
systematically penalize the newest model version.

## Statistical interpretation

Each rate includes a Wilson interval in JSON output. Unlike a symmetric normal
interval, the Wilson interval remains bounded between zero and one and behaves
sensibly for small or extreme samples.

A group remains `collecting` until every matured denominator contains at least
100 impressions. This is a conservative data-hygiene threshold, not a power
calculation and not proof of statistical significance. A model decision still
needs comparable cohorts, a declared primary metric, guardrails, and preferably
random assignment.

The report is observational. Rank position, surface, repeated exposure,
catalogue availability, and user intent can all confound outcome rates. It is
appropriate for monitoring and hypothesis generation; causal lift requires a
controlled experiment.

## Data-quality checks

The report counts outcomes that cannot be matched to an exported impression and
duplicate impression/outcome pairs. Either count should normally be zero.
Unknown future outcome types are ignored so an older evaluator does not silently
reinterpret a newer schema.
