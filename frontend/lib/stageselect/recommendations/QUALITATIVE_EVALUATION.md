# StageSelect Blind Ranking Evaluation

This check compares the global-profile hybrid ranker with the multi-interest
hybrid ranker on real Discover candidates. It is a qualitative complement to
the synthetic offline metrics, not a replacement for them.

## Protocol

The optional `Compare ranking approaches` section appears in Discover only
when:

- the profile has enough positive evidence to form taste groups; and
- the two approaches produce different visible top-six orders.

Both approaches use the same candidate set, semantic scores, platform filter,
feedback, and Familiar/Balanced/Adventurous setting. The only difference is
whether taste-group affinity contributes to the structured facet score.

The two ordered lists are assigned to `A` and `B` using a stable hash of the
model version, controls, and rankings. The interface never reveals that
assignment. A reviewer can prefer A, prefer B, or record a tie, and can revise
the choice while that comparison remains active.

## Stored record

`stageselect_ranking_evaluations` stores:

- the model and two variant identifiers;
- the active controls and candidate count;
- the randomized left/right assignment;
- the ordered IGDB ids shown on each side; and
- the reviewer's choice.

Records are private under RLS, cascade with account deletion, and are included
in the user's StageSelect export. Review text, raw embeddings, and hidden
profile vectors are not stored.

## Aggregate review

After collecting multiple comparisons, this SQL reveals the winning variant:

```sql
select
  case
    when choice = 'tie' then 'tie'
    when choice = 'left' then left_variant
    else right_variant
  end as preferred_variant,
  count(*) as comparisons
from public.stageselect_ranking_evaluations
group by preferred_variant
order by comparisons desc;
```

Do not treat one comparison as a performance result. Review several candidate
refreshes and control settings, retain ties, and report the sample size. A
promotion decision should also keep the offline eligibility and diversity
guardrails at zero violations.
