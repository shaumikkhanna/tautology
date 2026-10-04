import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRecommendations,
  getEligibleCandidates,
  recommendationEvaluationCases,
  recommendationEvaluationVariants,
} from "./index.ts";

test("evaluation is deterministic for a fixed fixture and model version", () => {
  assert.deepEqual(evaluateRecommendations(), evaluateRecommendations());
});

test("the versioned synthetic baseline stays stable", () => {
  const report = evaluateRecommendations();
  const summary = report.variants.map((variant) => ({
    id: variant.id,
    recallAtK: rounded(variant.metrics.recallAtK),
    ndcgAtK: rounded(variant.metrics.ndcgAtK),
    mrr: rounded(variant.metrics.mrr),
    catalogueCoverage: rounded(variant.metrics.catalogueCoverage),
    intraListDiversity: rounded(variant.metrics.intraListDiversity),
    novelty: rounded(variant.metrics.novelty),
  }));

  assert.equal(report.fixtureVersion, "synthetic-tastes-v1");
  assert.equal(report.modelVersion, "hybrid-semantic-multitaste-mmr-v2");
  assert.deepEqual(summary, [
    {
      id: "compatible-popularity",
      recallAtK: 0.583,
      ndcgAtK: 0.384,
      mrr: 0.417,
      catalogueCoverage: 0.75,
      intraListDiversity: 0.756,
      novelty: 0.1,
    },
    {
      id: "genre-overlap",
      recallAtK: 1,
      ndcgAtK: 0.866,
      mrr: 0.806,
      catalogueCoverage: 0.75,
      intraListDiversity: 0.649,
      novelty: 0.162,
    },
    {
      id: "structured-content",
      recallAtK: 1,
      ndcgAtK: 0.917,
      mrr: 0.889,
      catalogueCoverage: 0.75,
      intraListDiversity: 0.638,
      novelty: 0.182,
    },
		{
			id: "hybrid-semantic-content",
			recallAtK: 1,
			ndcgAtK: 0.917,
			mrr: 0.889,
			catalogueCoverage: 0.75,
			intraListDiversity: 0.638,
			novelty: 0.182,
		},
    {
      id: "hybrid-multi-interest-content",
      recallAtK: 1,
      ndcgAtK: 0.917,
      mrr: 0.889,
      catalogueCoverage: 0.75,
      intraListDiversity: 0.638,
      novelty: 0.182,
    },
    {
      id: "hybrid-multi-interest-mmr",
      recallAtK: 1,
      ndcgAtK: 0.917,
      mrr: 0.889,
      catalogueCoverage: 0.75,
      intraListDiversity: 0.764,
      novelty: 0.153,
    },
  ]);
});

test("the harness computes ranking metrics from labels hidden from rankers", () => {
  const evaluationCase = metricCase();
  const perfect = {
    id: "perfect",
    label: "Perfect",
    rank: ({ candidates }) => [...candidates],
  };
  const reverse = {
    id: "reverse",
    label: "Reverse",
    rank: ({ candidates }) => [...candidates].reverse(),
  };
  const report = evaluateRecommendations([evaluationCase], {
    k: 2,
    variants: [perfect, reverse],
  });

  assert.equal(report.variants[0].metrics.recallAtK, 1);
  assert.equal(report.variants[0].metrics.ndcgAtK, 1);
  assert.equal(report.variants[0].metrics.mrr, 1);
  assert.equal(report.variants[1].metrics.recallAtK, 0);
  assert.equal(report.variants[1].metrics.ndcgAtK, 0);
  assert.equal(report.variants[1].metrics.mrr, 1 / 3);
});

test("duplicates are violations and cannot inflate relevance metrics", () => {
  const duplicateRelevant = {
    id: "duplicate",
    label: "Duplicate",
    rank: ({ candidates }) => [candidates[0], candidates[0]],
  };
  const report = evaluateRecommendations([metricCase()], {
    k: 2,
    variants: [duplicateRelevant],
  });
  const metrics = report.variants[0].metrics;

  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.ndcgAtK, 1);
  assert.equal(metrics.duplicateViolations, 1);
});

test("all built-in variants satisfy exclusion, duplicate, and platform guardrails", () => {
  const report = evaluateRecommendations();

  for (const variant of report.variants) {
    assert.equal(variant.metrics.duplicateViolations, 0, variant.label);
    assert.equal(variant.metrics.exclusionViolations, 0, variant.label);
    assert.equal(variant.metrics.platformEligibilityRate, 1, variant.label);
  }
});

test("the structured baseline beats compatible popularity on ranking quality", () => {
  const report = evaluateRecommendations();
  const popularity = report.variants.find(
    (item) => item.id === "compatible-popularity",
  );
  const structured = report.variants.find(
    (item) => item.id === "structured-content",
  );

  assert.ok(structured.metrics.ndcgAtK > popularity.metrics.ndcgAtK);
  assert.ok(structured.metrics.mrr > popularity.metrics.mrr);
});

test("the hybrid variant improves placement when semantic evidence separates tied metadata", () => {
	const variants = recommendationEvaluationVariants.filter((variant) =>
		["structured-content", "hybrid-semantic-content"].includes(variant.id),
	);
	const report = evaluateRecommendations(
		[
			{
				id: "semantic-tie-break",
				description: "Equal metadata with distinct precomputed semantic evidence.",
				library: [],
				relevantGameIds: ["semantic-relevant"],
				candidates: [
					{
						...candidate("metadata-first", 10, ["Action"]),
						semanticPositiveSimilarity: 0.1,
						semanticSignalCount: 4,
					},
					{
						...candidate("semantic-relevant", 11, ["Action"]),
						semanticPositiveSimilarity: 0.9,
						semanticSignalCount: 4,
					},
				],
			},
		],
		{ k: 1, variants },
	);
	const structured = report.variants.find(
		(variant) => variant.id === "structured-content",
	);
	const hybrid = report.variants.find(
		(variant) => variant.id === "hybrid-semantic-content",
	);

	assert.ok(hybrid.metrics.ndcgAtK > structured.metrics.ndcgAtK);
});

test("multi-interest affinity preserves a distinct taste instead of rewarding a blended candidate", () => {
  const variants = recommendationEvaluationVariants.filter((variant) =>
    ["hybrid-semantic-content", "hybrid-multi-interest-content"].includes(
      variant.id,
    ),
  );
  const library = [
    ...positiveClusterGames("action", ["Action"], "Mythology"),
    ...positiveClusterGames("puzzle", ["Puzzle"], "Mystery"),
  ];
  const report = evaluateRecommendations(
    [
      {
        id: "multi-interest-bridge",
        description:
          "A blended candidate should not outrank a strong member of one established taste group.",
        library,
        relevantGameIds: ["pure-action"],
        candidates: [
          candidate("blended-popular", 20, ["Action", "Puzzle"], {
            themes: ["Mythology", "Mystery"],
            popularityScore: 1_000,
          }),
          candidate("pure-action", 21, ["Action"], {
            themes: ["Mythology"],
            popularityScore: 20,
          }),
        ],
      },
    ],
    { k: 1, variants },
  );
  const globalProfile = report.variants.find(
    (variant) => variant.id === "hybrid-semantic-content",
  );
  const multiInterest = report.variants.find(
    (variant) => variant.id === "hybrid-multi-interest-content",
  );

  assert.equal(globalProfile.metrics.ndcgAtK, 0);
  assert.equal(multiInterest.metrics.ndcgAtK, 1);
});

test("MMR increases or preserves list diversity on the fixed fixture", () => {
  const report = evaluateRecommendations();
  const structured = report.variants.find(
    (item) => item.id === "structured-content",
  );
  const diversified = report.variants.find(
    (item) => item.id === "hybrid-multi-interest-mmr",
  );

  assert.ok(
    diversified.metrics.intraListDiversity >
      structured.metrics.intraListDiversity,
  );
});

test("eligibility removes owned, rejected, dismissed, excluded, and incompatible games", () => {
  const eligibleIds = recommendationEvaluationCases.flatMap((evaluationCase) =>
    getEligibleCandidates(evaluationCase).map((candidate) => candidate.id),
  );

  assert.equal(eligibleIds.includes("sg-hades"), false);
  assert.equal(eligibleIds.includes("tc-horror"), false);
  assert.equal(eligibleIds.includes("nf-rejected-night"), false);
  assert.equal(eligibleIds.includes("pr-console-rpg"), false);
});

function metricCase() {
  return {
    id: "metric-case",
    description: "A minimal metric fixture.",
    library: [],
    relevantGameIds: ["relevant"],
    candidates: [
      candidate("relevant", 1, ["Puzzle"]),
      candidate("middle", 2, ["Action"]),
      candidate("last", 3, ["Sport"]),
    ],
  };
}

function candidate(id, igdbId, genres, overrides = {}) {
  return {
    id,
    igdbId,
    title: id,
    genres,
    platforms: ["PC"],
    popularityScore: 1,
    relatedSeedTitles: [],
    ...overrides,
  };
}

function positiveClusterGames(prefix, genres, theme) {
  return Array.from({ length: 4 }, (_, index) => ({
    id: `${prefix}-${index}`,
    title: `${prefix} ${index}`,
    status: "finished",
    platform: "PC",
    genres,
    themes: [theme],
    keywords: [],
    gameModes: ["Single player"],
    playerPerspectives: [],
    rating: 5,
    releaseYear: 2024,
  }));
}

function rounded(value) {
  return Number(value.toFixed(3));
}
