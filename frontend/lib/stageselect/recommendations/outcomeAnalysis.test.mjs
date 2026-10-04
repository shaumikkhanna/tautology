import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeRecommendationOutcomes,
  getWilsonInterval,
} from "./outcomeAnalysis.ts";

const matureExport = {
  exportedAt: "2026-09-23T12:00:00.000Z",
  recommendationRuns: [
    {
      modelVersion: "model-v1",
      surface: "discover",
      impressions: [
        { id: "discover-1", shownAt: "2026-01-01T00:00:00.000Z" },
        { id: "discover-2", shownAt: "2026-01-01T00:00:00.000Z" },
      ],
    },
    {
      modelVersion: "model-v1",
      surface: "play_next",
      impressions: [
        { id: "play-1", shownAt: "2026-01-02T00:00:00.000Z" },
      ],
    },
  ],
  recommendationOutcomes: [
    outcome("discover-1", "saved", null, "direct"),
    outcome("play-1", "left", null, "recent_impression"),
    outcome("play-1", "rated", 3, "recent_impression"),
  ],
};

test("analysis separates model surfaces and outcome stages", () => {
  const report = analyzeRecommendationOutcomes(matureExport, {
    minimumSampleSize: 1,
  });
  const discover = report.groups.find((group) => group.surface === "discover");
  const playNext = report.groups.find((group) => group.surface === "play_next");

  assert.equal(discover.metrics.saved.successes, 1);
  assert.equal(discover.metrics.saved.eligibleImpressions, 2);
  assert.equal(discover.metrics.saved.rate, 0.5);
  assert.equal(discover.attribution.direct, 1);
  assert.equal(playNext.metrics.terminal.successes, 1);
  assert.deepEqual(playNext.terminalBreakdown, { finished: 0, left: 1 });
  assert.equal(playNext.metrics.rated.successes, 1);
  assert.equal(playNext.meanRating, 3);
  assert.equal(playNext.attribution.recentImpression, 2);
  assert.equal(playNext.comparisonReady, true);
});

test("recent impressions are excluded from slow-signal denominators", () => {
  const report = analyzeRecommendationOutcomes({
    exportedAt: "2026-09-23T12:00:00.000Z",
    recommendationRuns: [
      {
        modelVersion: "model-v1",
        surface: "discover",
        impressions: [
          { id: "recent", shownAt: "2026-09-20T12:00:00.000Z" },
        ],
      },
    ],
    recommendationOutcomes: [
      outcome("recent", "saved", null, "direct", "2026-09-20T12:01:00.000Z"),
    ],
  });
  const group = report.groups[0];

  assert.equal(group.metrics.saved.eligibleImpressions, 1);
  assert.equal(group.metrics.saved.successes, 1);
  assert.equal(group.metrics.started.eligibleImpressions, 0);
  assert.equal(group.metrics.terminal.eligibleImpressions, 0);
  assert.equal(group.metrics.rated.eligibleImpressions, 0);
  assert.equal(group.comparisonReady, false);
});

test("data-quality counters identify orphaned and duplicate outcomes", () => {
  const report = analyzeRecommendationOutcomes({
    ...matureExport,
    recommendationOutcomes: [
      outcome("discover-1", "saved", null, "direct"),
      outcome("discover-1", "saved", null, "direct"),
      outcome("missing", "started", null, "recent_impression"),
    ],
  });

  assert.deepEqual(report.quality, {
    totalRuns: 2,
    totalImpressions: 3,
    totalOutcomes: 3,
    matchedOutcomes: 1,
    unmatchedOutcomes: 1,
    duplicateOutcomes: 1,
  });
});

test("Wilson intervals remain bounded and express small-sample uncertainty", () => {
  const interval = getWilsonInterval(1, 1);

  assert.ok(interval.lower > 0.2 && interval.lower < 0.21);
  assert.equal(interval.upper, 1);
  assert.equal(getWilsonInterval(0, 0), null);
});

function outcome(
  impressionId,
  name,
  rating,
  attributionMethod,
  occurredAt = "2026-02-01T00:00:00.000Z",
) {
  return {
    impressionId,
    outcome: name,
    rating,
    attributionMethod,
    occurredAt,
  };
}
