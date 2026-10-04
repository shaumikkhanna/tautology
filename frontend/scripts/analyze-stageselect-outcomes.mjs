import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeRecommendationOutcomes } from "../lib/stageselect/recommendations/outcomeAnalysis.ts";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const inputArg = args.find((arg) => !arg.startsWith("--"));

if (!inputArg) {
  console.error(
    "Usage: npm run analyze:stageselect-outcomes -- <export.json> [--json]",
  );
  process.exit(1);
}

try {
  const inputPath = resolve(process.cwd(), inputArg);
  const contents = await readFile(inputPath, "utf8");
  const report = analyzeRecommendationOutcomes(JSON.parse(contents));

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  printReport(report);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Could not analyze the export.",
  );
  process.exit(1);
}

function printReport(report) {
  console.log("StageSelect recommendation outcome analysis");
  console.log(`Analysis: ${report.analysisVersion}`);
  console.log(`As of: ${report.asOf}`);
  console.log(
    `Maturity windows: save ${report.maturityDays.saved}d, start ${report.maturityDays.started}d, terminal ${report.maturityDays.terminal}d, rating ${report.maturityDays.rated}d`,
  );
  console.log(
    `Data: ${report.quality.totalRuns} runs, ${report.quality.totalImpressions} impressions, ${report.quality.matchedOutcomes}/${report.quality.totalOutcomes} matched outcomes`,
  );

  if (
    report.quality.unmatchedOutcomes > 0 ||
    report.quality.duplicateOutcomes > 0
  ) {
    console.log(
      `Quality warning: ${report.quality.unmatchedOutcomes} unmatched and ${report.quality.duplicateOutcomes} duplicate outcomes`,
    );
  }

  console.log("");
  console.log(
    "| Model | Surface | Impressions | Saved | Started | Finished/left | Rated | Mean rating | Evidence |",
  );
  console.log(
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  );

  for (const group of report.groups) {
    console.log(
      `| ${group.modelVersion} | ${group.surface} | ${group.impressions} | ${formatMetric(group.metrics.saved)} | ${formatMetric(group.metrics.started)} | ${formatMetric(group.metrics.terminal)} | ${formatMetric(group.metrics.rated)} | ${group.meanRating === null ? "-" : group.meanRating.toFixed(2)} | ${group.comparisonReady ? "comparison-ready" : "collecting"} |`,
    );
  }

  console.log("");
  console.log(
    `“Collecting” means at least one matured denominator is below ${report.minimumSampleSize}; this is a data-sufficiency guardrail, not a statistical power calculation.`,
  );
  console.log(
    "Rates are observational. Compare like-aged cohorts and inspect confidence intervals in --json output before making model decisions.",
  );
}

function formatMetric(metric) {
  if (metric.rate === null) {
    return `- (0 eligible)`;
  }

  return `${(metric.rate * 100).toFixed(1)}% (${metric.successes}/${metric.eligibleImpressions})`;
}
