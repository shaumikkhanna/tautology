export const defaultOutcomeMaturityDays = {
	saved: 1,
	started: 14,
	terminal: 90,
	rated: 90,
} as const;

export const defaultMinimumOutcomeSampleSize = 100;
export const outcomeAnalysisVersion = "outcome-funnel-v1";

type OutcomeName = "saved" | "started" | "finished" | "left" | "rated";

type ExportImpression = {
	id: string;
	shownAt: string;
};

type ExportRun = {
	modelVersion: string;
	surface: string;
	impressions: ExportImpression[];
};

type ExportOutcome = {
	impressionId: string;
	outcome: string;
	rating: number | null;
	attributionMethod: string;
	occurredAt: string;
};

export type RecommendationOutcomeExport = {
	exportedAt: string;
	recommendationRuns: ExportRun[];
	recommendationOutcomes?: ExportOutcome[];
};

export type BinomialOutcomeMetric = {
	successes: number;
	eligibleImpressions: number;
	rate: number | null;
	wilson95: {
		lower: number;
		upper: number;
	} | null;
};

export type OutcomeAnalysisGroup = {
	modelVersion: string;
	surface: string;
	impressions: number;
	metrics: {
		saved: BinomialOutcomeMetric;
		started: BinomialOutcomeMetric;
		terminal: BinomialOutcomeMetric;
		rated: BinomialOutcomeMetric;
	};
	terminalBreakdown: {
		finished: number;
		left: number;
	};
	meanRating: number | null;
	attribution: {
		direct: number;
		recentImpression: number;
	};
	comparisonReady: boolean;
};

export type RecommendationOutcomeAnalysis = {
	analysisVersion: string;
	asOf: string;
	maturityDays: {
		saved: number;
		started: number;
		terminal: number;
		rated: number;
	};
	minimumSampleSize: number;
	quality: {
		totalRuns: number;
		totalImpressions: number;
		totalOutcomes: number;
		matchedOutcomes: number;
		unmatchedOutcomes: number;
		duplicateOutcomes: number;
	};
	groups: OutcomeAnalysisGroup[];
};

type AnalysisOptions = {
	minimumSampleSize?: number;
	maturityDays?: Partial<RecommendationOutcomeAnalysis["maturityDays"]>;
};

type ImpressionWithContext = ExportImpression & {
	modelVersion: string;
	surface: string;
};

const knownOutcomes = new Set<OutcomeName>([
	"saved",
	"started",
	"finished",
	"left",
	"rated",
]);

export function analyzeRecommendationOutcomes(
	data: RecommendationOutcomeExport,
	options: AnalysisOptions = {},
): RecommendationOutcomeAnalysis {
	const asOfMs = parseDate(data.exportedAt, "exportedAt");
	const maturityDays = {
		...defaultOutcomeMaturityDays,
		...options.maturityDays,
	};
	const minimumSampleSize =
		options.minimumSampleSize ?? defaultMinimumOutcomeSampleSize;

	validateNonNegativeInteger(minimumSampleSize, "minimumSampleSize");

	for (const [name, days] of Object.entries(maturityDays)) {
		validateNonNegativeNumber(days, `${name} maturity days`);
	}

	if (!Array.isArray(data.recommendationRuns)) {
		throw new Error("The export does not contain recommendationRuns.");
	}

	const impressionsById = new Map<string, ImpressionWithContext>();

	for (const run of data.recommendationRuns) {
		if (
			typeof run.modelVersion !== "string" ||
			typeof run.surface !== "string" ||
			!Array.isArray(run.impressions)
		) {
			throw new Error("The export contains an invalid recommendation run.");
		}

		for (const impression of run.impressions) {
			if (typeof impression.id !== "string") {
				throw new Error("The export contains an impression without an id.");
			}

			const shownAtMs = parseDate(
				impression.shownAt,
				`shownAt for impression ${impression.id}`,
			);

			if (shownAtMs > asOfMs) {
				throw new Error(`Impression ${impression.id} occurs after exportedAt.`);
			}

			if (impressionsById.has(impression.id)) {
				throw new Error(`Duplicate impression id: ${impression.id}.`);
			}

			impressionsById.set(impression.id, {
				...impression,
				modelVersion: run.modelVersion,
				surface: run.surface,
			});
		}
	}

	const outcomes = data.recommendationOutcomes ?? [];

	if (!Array.isArray(outcomes)) {
		throw new Error("recommendationOutcomes must be an array.");
	}

	const outcomesByImpression = new Map<string, Map<OutcomeName, ExportOutcome>>();
	let matchedOutcomes = 0;
	let unmatchedOutcomes = 0;
	let duplicateOutcomes = 0;

	for (const outcome of outcomes) {
		if (
			typeof outcome.impressionId !== "string" ||
			typeof outcome.outcome !== "string" ||
			typeof outcome.occurredAt !== "string"
		) {
			throw new Error("The export contains an invalid recommendation outcome.");
		}

		if (!knownOutcomes.has(outcome.outcome as OutcomeName)) {
			continue;
		}

		const occurredAtMs = parseDate(
			outcome.occurredAt,
			`occurredAt for ${outcome.outcome}`,
		);

		if (occurredAtMs > asOfMs) {
			throw new Error(`Outcome ${outcome.outcome} occurs after exportedAt.`);
		}

		if (!impressionsById.has(outcome.impressionId)) {
			unmatchedOutcomes += 1;
			continue;
		}

		const outcomeName = outcome.outcome as OutcomeName;
		const impressionOutcomes =
			outcomesByImpression.get(outcome.impressionId) ?? new Map();

		if (impressionOutcomes.has(outcomeName)) {
			duplicateOutcomes += 1;
			continue;
		}

		impressionOutcomes.set(outcomeName, outcome);
		outcomesByImpression.set(outcome.impressionId, impressionOutcomes);
		matchedOutcomes += 1;
	}

	const groupedImpressions = new Map<string, ImpressionWithContext[]>();

	for (const impression of impressionsById.values()) {
		const key = `${impression.modelVersion}\u0000${impression.surface}`;
		const group = groupedImpressions.get(key) ?? [];
		group.push(impression);
		groupedImpressions.set(key, group);
	}

	const groups = Array.from(groupedImpressions.values())
		.map((impressions) =>
			analyzeGroup(
				impressions,
				outcomesByImpression,
				asOfMs,
				maturityDays,
				minimumSampleSize,
			),
		)
		.sort(
			(left, right) =>
				left.modelVersion.localeCompare(right.modelVersion) ||
				left.surface.localeCompare(right.surface),
		);

	return {
		analysisVersion: outcomeAnalysisVersion,
		asOf: new Date(asOfMs).toISOString(),
		maturityDays,
		minimumSampleSize,
		quality: {
			totalRuns: data.recommendationRuns.length,
			totalImpressions: impressionsById.size,
			totalOutcomes: outcomes.length,
			matchedOutcomes,
			unmatchedOutcomes,
			duplicateOutcomes,
		},
		groups,
	};
}

function analyzeGroup(
	impressions: ImpressionWithContext[],
	outcomesByImpression: Map<string, Map<OutcomeName, ExportOutcome>>,
	asOfMs: number,
	maturityDays: RecommendationOutcomeAnalysis["maturityDays"],
	minimumSampleSize: number,
): OutcomeAnalysisGroup {
	const first = impressions[0];
	const metrics = {
		saved: getMetric(impressions, outcomesByImpression, asOfMs, maturityDays.saved, [
			"saved",
		]),
		started: getMetric(
			impressions,
			outcomesByImpression,
			asOfMs,
			maturityDays.started,
			["started"],
		),
		terminal: getMetric(
			impressions,
			outcomesByImpression,
			asOfMs,
			maturityDays.terminal,
			["finished", "left"],
		),
		rated: getMetric(impressions, outcomesByImpression, asOfMs, maturityDays.rated, [
			"rated",
		]),
	};
	let finished = 0;
	let left = 0;
	let ratingTotal = 0;
	let ratingCount = 0;
	let direct = 0;
	let recentImpression = 0;

	for (const impression of impressions) {
		const ageDays = getAgeDays(impression.shownAt, asOfMs);
		const impressionOutcomes = outcomesByImpression.get(impression.id);

		if (!impressionOutcomes) {
			continue;
		}

		if (ageDays >= maturityDays.terminal) {
			finished += impressionOutcomes.has("finished") ? 1 : 0;
			left += impressionOutcomes.has("left") ? 1 : 0;
		}

		const ratedOutcome = impressionOutcomes.get("rated");

		if (
			ageDays >= maturityDays.rated &&
			ratedOutcome &&
			typeof ratedOutcome.rating === "number" &&
			Number.isFinite(ratedOutcome.rating)
		) {
			ratingTotal += ratedOutcome.rating;
			ratingCount += 1;
		}

		for (const outcome of impressionOutcomes.values()) {
			if (outcome.attributionMethod === "direct") {
				direct += 1;
			} else if (outcome.attributionMethod === "recent_impression") {
				recentImpression += 1;
			}
		}
	}

	return {
		modelVersion: first.modelVersion,
		surface: first.surface,
		impressions: impressions.length,
		metrics,
		terminalBreakdown: { finished, left },
		meanRating: ratingCount > 0 ? ratingTotal / ratingCount : null,
		attribution: { direct, recentImpression },
		comparisonReady: Object.values(metrics).every(
			(metric) => metric.eligibleImpressions >= minimumSampleSize,
		),
	};
}

function getMetric(
	impressions: ImpressionWithContext[],
	outcomesByImpression: Map<string, Map<OutcomeName, ExportOutcome>>,
	asOfMs: number,
	maturityDays: number,
	successOutcomes: OutcomeName[],
): BinomialOutcomeMetric {
	let eligibleImpressions = 0;
	let successes = 0;

	for (const impression of impressions) {
		if (getAgeDays(impression.shownAt, asOfMs) < maturityDays) {
			continue;
		}

		eligibleImpressions += 1;
		const outcomes = outcomesByImpression.get(impression.id);

		if (successOutcomes.some((outcome) => outcomes?.has(outcome))) {
			successes += 1;
		}
	}

	return {
		successes,
		eligibleImpressions,
		rate:
			eligibleImpressions > 0 ? successes / eligibleImpressions : null,
		wilson95: getWilsonInterval(successes, eligibleImpressions),
	};
}

export function getWilsonInterval(successes: number, trials: number) {
	if (trials === 0) {
		return null;
	}

	const z = 1.96;
	const proportion = successes / trials;
	const denominator = 1 + (z * z) / trials;
	const center = (proportion + (z * z) / (2 * trials)) / denominator;
	const margin =
		(z /
			denominator) *
		Math.sqrt(
			(proportion * (1 - proportion)) / trials +
				(z * z) / (4 * trials * trials),
		);

	return {
		lower: Math.max(0, center - margin),
		upper: Math.min(1, center + margin),
	};
}

function getAgeDays(shownAt: string, asOfMs: number) {
	return (asOfMs - Date.parse(shownAt)) / (24 * 60 * 60 * 1000);
}

function parseDate(value: string, field: string) {
	const parsed = Date.parse(value);

	if (!Number.isFinite(parsed)) {
		throw new Error(`${field} must be a valid date.`);
	}

	return parsed;
}

function validateNonNegativeInteger(value: number, field: string) {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${field} must be a non-negative integer.`);
	}
}

function validateNonNegativeNumber(value: number, field: string) {
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${field} must be a non-negative number.`);
	}
}
