import {
  evaluateRecommendations,
  recommendationEvaluationCases,
} from "../lib/stageselect/recommendations/index.ts";

const args = new Set(process.argv.slice(2));
const report = evaluateRecommendations();

if (args.has("--json")) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log("StageSelect recommendation evaluation");
console.log(`Fixture: ${report.fixtureVersion}`);
console.log(`Model: ${report.modelVersion}`);
console.log(`Cases: ${report.caseCount}`);
console.log(`K: ${report.k}`);
console.log("");
console.log(
  `| Variant | Recall@${report.k} | NDCG@${report.k} | MRR | Coverage | Diversity | Novelty | Platform eligible | Violations |`,
);
console.log(
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
);

for (const variant of report.variants) {
  const metrics = variant.metrics;
  const violations =
    metrics.duplicateViolations + metrics.exclusionViolations;

  console.log(
    `| ${variant.label} | ${format(metrics.recallAtK)} | ${format(metrics.ndcgAtK)} | ${format(metrics.mrr)} | ${format(metrics.catalogueCoverage)} | ${format(metrics.intraListDiversity)} | ${format(metrics.novelty)} | ${format(metrics.platformEligibilityRate)} | ${violations} |`,
  );
}

if (args.has("--details")) {
  console.log("");
  console.log("Case rankings");

  for (const variant of report.variants) {
    console.log("");
    console.log(variant.label);

    for (const result of variant.cases) {
      const evaluationCase = recommendationEvaluationCases.find(
        (item) => item.id === result.id,
      );
      const titlesById = new Map(
        evaluationCase?.candidates.map((item) => [item.id, item.title]) ?? [],
      );
      const titles = result.rankedGameIds
        .slice(0, report.k)
        .map((id) => titlesById.get(id) ?? id);

      console.log(`- ${result.id}: ${titles.join(" > ")}`);
    }
  }
}

function format(value) {
  return value.toFixed(3);
}
