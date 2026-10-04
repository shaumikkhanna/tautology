# StageSelect Recommendation Evaluation

This directory contains a deterministic offline evaluation harness for the
structured recommendation model. It exists to catch ranking regressions, make
tradeoffs visible, and provide a stable gate before semantic representations
are considered.

Run it from `frontend/`:

```bash
npm run evaluate:stageselect-recommendations
npm run evaluate:stageselect-recommendations -- --details
npm run evaluate:stageselect-recommendations -- --json
```

## Fixture contract

Fixture version: `synthetic-tastes-v1`

The fixture contains six deliberately small profiles:

1. Single-genre specialist.
2. Two-cluster user.
3. Contrarian low rater.
4. Wishlist-only cold start.
5. Strong negative feedback.
6. Platform-restricted user.

Each case separates the visible history and candidate metadata from the held-out
relevance labels. Ranking functions receive no relevance labels. Owned,
explicitly excluded, rejected, dismissed, and platform-incompatible games are
removed by the common eligibility stage.

This is a versioned regression set, not a statistically representative sample
of players. Its results should not be presented as real-world recommendation
quality.

## Metrics

- `Recall@3`: fraction of held-out relevant games recovered in the first three.
- `NDCG@3`: rewards relevant games more when they occur near the top.
- `MRR`: reciprocal rank of the first relevant result.
- `Coverage`: distinct top-three games divided by the eligible fixture catalogue.
- `Diversity`: mean pairwise facet distance within each top-three list, using
  genres, themes, keywords, modes, and perspectives.
- `Novelty`: inverse log-popularity normalized within each case. It is a
  diagnostic, not an optimization target by itself.
- `Platform eligible`: fraction of recommendations satisfying the active
  platform constraint.
- `Violations`: duplicate or excluded recommendations in the evaluated lists.

## Baseline result

Model version: `hybrid-semantic-multitaste-mmr-v2`  
K: `3`

| Variant | Recall@3 | NDCG@3 | MRR | Coverage | Diversity | Novelty | Platform eligible | Violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Compatible popularity | 0.583 | 0.384 | 0.417 | 0.750 | 0.756 | 0.100 | 1.000 | 0 |
| Positive genre overlap | 1.000 | 0.866 | 0.806 | 0.750 | 0.649 | 0.162 | 1.000 | 0 |
| Structured content | 1.000 | 0.917 | 0.889 | 0.750 | 0.638 | 0.182 | 1.000 | 0 |
| Structured content + semantic similarity (global profile) | 1.000 | 0.917 | 0.889 | 0.750 | 0.638 | 0.182 | 1.000 | 0 |
| Hybrid content + multi-interest affinity | 1.000 | 0.917 | 0.889 | 0.750 | 0.638 | 0.182 | 1.000 | 0 |
| Hybrid multi-interest + diversity (adventurous) | 1.000 | 0.917 | 0.889 | 0.750 | 0.764 | 0.153 | 1.000 | 0 |

The structured ranker improves placement over compatible popularity and the
genre-only baseline on this set. Maximum diversification preserves the fixture's
ranking metrics while increasing list diversity from `0.638` to `0.764`. It
also lowers the novelty diagnostic slightly, which is a useful reminder that
diversity and obscurity are different properties.

The fixed fixture has no model-generated vectors and its profiles are below the
multi-interest threshold, so the hybrid, global-profile, and multi-interest
variants intentionally tie here. Separate held-out tests supply precomputed
semantic evidence and a sufficiently rich two-interest history. They verify
that semantic evidence can improve a metadata tie and that cluster affinity can
preserve a distinct interest instead of rewarding a blended candidate. These
are regression checks, not evidence of real-world model quality.

## How to use the gate

When ranking behavior changes:

1. Run the recommendation tests and evaluation command.
2. Compare every variant against this file, not only the highest metric.
3. Investigate per-case rankings with `--details`.
4. Update the model version when score meaning or ordering materially changes.
5. Update this baseline only when the behavior change is intentional and the
   guardrails still report zero violations.

The semantic variant should not be considered fully validated until real-vector
recommendations show a declared benefit without unacceptable relevance,
diversity, eligibility, or latency regressions. Once enough organic interactions
exist, this synthetic gate should be supplemented with temporal holdout
evaluation from privacy-safe exports.

For small-data qualitative validation, the optional blind comparison in
Discover applies both the global-profile and multi-interest variants to the same
real candidate set. Its protocol and aggregation query are documented in
`QUALITATIVE_EVALUATION.md`.

Recommendation saves and later library outcomes are measured using the bounded,
observational attribution described in `OUTCOME_MEASUREMENT.md`.
