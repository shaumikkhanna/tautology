import { facetJaccard } from "./diversify.ts";
import {
	evaluationFixtureVersion,
	recommendationEvaluationCases,
	type EvaluationCandidate,
	type RecommendationEvaluationCase,
} from "./evaluation.fixtures.ts";
import { recommendDiscover, rankDiscoverCandidates } from "./scoring.ts";
import {
	buildTasteProfile,
	getLatestFeedbackByIgdbId,
	normalizeLabel,
} from "./signals.ts";
import type {
	PlayNextOptions,
	RecommendationFeedback,
	RecommendationGame,
} from "./types.ts";
import { recommendationVersions } from "./version.ts";

export type EvaluationRankingInput = {
	library: RecommendationGame[];
	candidates: EvaluationCandidate[];
	feedback: RecommendationFeedback[];
	feedbackGames: RecommendationGame[];
	options: Pick<PlayNextOptions, "platform">;
};

export type EvaluationVariant = {
	id: string;
	label: string;
	rank(input: EvaluationRankingInput): EvaluationCandidate[];
};

export type EvaluationMetrics = {
	recallAtK: number;
	ndcgAtK: number;
	mrr: number;
	catalogueCoverage: number;
	intraListDiversity: number;
	novelty: number;
	platformEligibilityRate: number;
	duplicateViolations: number;
	exclusionViolations: number;
};

export type EvaluationVariantResult = {
	id: string;
	label: string;
	metrics: EvaluationMetrics;
	cases: Array<{
		id: string;
		rankedGameIds: string[];
		recallAtK: number;
		ndcgAtK: number;
		reciprocalRank: number;
	}>;
};

export type RecommendationEvaluationReport = {
	fixtureVersion: string;
	modelVersion: string;
	k: number;
	caseCount: number;
	variants: EvaluationVariantResult[];
};

export const recommendationEvaluationVariants: EvaluationVariant[] = [
	{
		id: "compatible-popularity",
		label: "Compatible popularity",
		rank: ({ candidates }) =>
			[...candidates].sort(
				(left, right) =>
					right.popularityScore - left.popularityScore ||
					left.title.localeCompare(right.title),
			),
	},
	{
		id: "genre-overlap",
		label: "Positive genre overlap",
		rank: ({ library, candidates, feedback, feedbackGames }) => {
			const profile = buildTasteProfile(
				mergeProfileGames(library, feedbackGames),
				feedback,
			);

			return [...candidates].sort((left, right) => {
				const scoreDifference =
					getPositiveGenreOverlap(right.genres, profile.genreWeights) -
					getPositiveGenreOverlap(left.genres, profile.genreWeights);

				return (
					scoreDifference ||
					right.popularityScore - left.popularityScore ||
					left.title.localeCompare(right.title)
				);
			});
		},
	},
	{
		id: "structured-content",
		label: "Structured content",
		rank: ({ library, candidates, feedback, feedbackGames, options }) =>
			rankDiscoverCandidates(library, candidates, {
				...options,
				feedback,
				feedbackGames,
				useSemantic: false,
				useTasteClusters: false,
			}).map((item) => item.game),
	},
	{
		id: "hybrid-semantic-content",
		label: "Structured content + semantic similarity (global profile)",
		rank: ({ library, candidates, feedback, feedbackGames, options }) =>
			rankDiscoverCandidates(library, candidates, {
				...options,
				feedback,
				feedbackGames,
				useSemantic: true,
				useTasteClusters: false,
			}).map((item) => item.game),
	},
	{
		id: "hybrid-multi-interest-content",
		label: "Hybrid content + multi-interest affinity",
		rank: ({ library, candidates, feedback, feedbackGames, options }) =>
			rankDiscoverCandidates(library, candidates, {
				...options,
				feedback,
				feedbackGames,
				useSemantic: true,
				useTasteClusters: true,
			}).map((item) => item.game),
	},
	{
		id: "hybrid-multi-interest-mmr",
		label: "Hybrid multi-interest + diversity (adventurous)",
		rank: ({ library, candidates, feedback, feedbackGames, options }) =>
			recommendDiscover(library, candidates, {
				...options,
				adventure: 100,
				feedback,
				feedbackGames,
				limit: candidates.length,
				useSemantic: true,
				useTasteClusters: true,
			}).map((item) => item.game),
	},
];

export function evaluateRecommendations(
	cases: RecommendationEvaluationCase[] = recommendationEvaluationCases,
	options: { k?: number; variants?: EvaluationVariant[] } = {},
): RecommendationEvaluationReport {
	const k = options.k ?? 3;
	const variants = options.variants ?? recommendationEvaluationVariants;

	if (!Number.isInteger(k) || k < 1) {
		throw new Error("Evaluation K must be a positive integer.");
	}

	if (cases.length === 0) {
		throw new Error("At least one evaluation case is required.");
	}

	for (const evaluationCase of cases) {
		validateEvaluationCase(evaluationCase);
	}

	return {
		fixtureVersion: evaluationFixtureVersion,
		modelVersion: recommendationVersions.model,
		k,
		caseCount: cases.length,
		variants: variants.map((variant) =>
			evaluateVariant(variant, cases, k),
		),
	};
}

function evaluateVariant(
	variant: EvaluationVariant,
	cases: RecommendationEvaluationCase[],
	k: number,
): EvaluationVariantResult {
	const recommendedCatalogue = new Set<string>();
	const eligibleCatalogue = new Set<string>();
	let diversityTotal = 0;
	let noveltyTotal = 0;
	let platformEligible = 0;
	let recommendationCount = 0;
	let duplicateViolations = 0;
	let exclusionViolations = 0;

	const caseResults = cases.map((evaluationCase) => {
		const eligibleCandidates = getEligibleCandidates(evaluationCase);
		const eligibleIds = new Set(eligibleCandidates.map((item) => item.id));
		const relevantIds = new Set(evaluationCase.relevantGameIds);
		const ranked = variant.rank({
			library: evaluationCase.library,
			candidates: eligibleCandidates,
			feedback: evaluationCase.feedback ?? [],
			feedbackGames: evaluationCase.feedbackGames ?? [],
			options: evaluationCase.options ?? {},
		});
		const topK = ranked.slice(0, k);
		const seen = new Set<string>();

		for (const candidate of evaluationCase.candidates) {
			if (eligibleIds.has(candidate.id)) {
				eligibleCatalogue.add(candidate.id);
			}
		}

		for (const candidate of topK) {
			recommendationCount += 1;

			if (eligibleIds.has(candidate.id)) {
				recommendedCatalogue.add(candidate.id);
			}

			if (seen.has(candidate.id)) {
				duplicateViolations += 1;
			}

			seen.add(candidate.id);

			if (!eligibleIds.has(candidate.id)) {
				exclusionViolations += 1;
			}

			if (isPlatformEligible(candidate, evaluationCase.options?.platform)) {
				platformEligible += 1;
			}
		}

		diversityTotal += getIntraListDiversity(topK);
		noveltyTotal += getNovelty(topK, eligibleCandidates);

		return {
			id: evaluationCase.id,
			rankedGameIds: ranked.map((item) => item.id),
			recallAtK: getRecallAtK(topK, relevantIds),
			ndcgAtK: getNdcgAtK(topK, relevantIds, k),
			reciprocalRank: getReciprocalRank(ranked, relevantIds),
		};
	});

	return {
		id: variant.id,
		label: variant.label,
		metrics: {
			recallAtK: mean(caseResults.map((item) => item.recallAtK)),
			ndcgAtK: mean(caseResults.map((item) => item.ndcgAtK)),
			mrr: mean(caseResults.map((item) => item.reciprocalRank)),
			catalogueCoverage:
				eligibleCatalogue.size > 0
					? recommendedCatalogue.size / eligibleCatalogue.size
					: 0,
			intraListDiversity: diversityTotal / cases.length,
			novelty: noveltyTotal / cases.length,
			platformEligibilityRate:
				recommendationCount > 0
					? platformEligible / recommendationCount
					: 1,
			duplicateViolations,
			exclusionViolations,
		},
		cases: caseResults,
	};
}

export function getEligibleCandidates(
	evaluationCase: RecommendationEvaluationCase,
) {
	const libraryIds = new Set(evaluationCase.library.map((item) => item.id));
	const excludedIds = new Set(evaluationCase.excludedGameIds ?? []);
	const feedbackByIgdbId = getLatestFeedbackByIgdbId(
		evaluationCase.feedback ?? [],
	);

	return evaluationCase.candidates.filter((candidate) => {
		const feedbackAction = feedbackByIgdbId.get(candidate.igdbId)?.action;

		return (
			!libraryIds.has(candidate.id) &&
			!excludedIds.has(candidate.id) &&
			feedbackAction !== "not_for_me" &&
			feedbackAction !== "dismissed" &&
			isPlatformEligible(candidate, evaluationCase.options?.platform)
		);
	});
}

function validateEvaluationCase(evaluationCase: RecommendationEvaluationCase) {
	const candidateIds = evaluationCase.candidates.map((item) => item.id);
	const relevantIds = new Set(evaluationCase.relevantGameIds);
	const eligibleIds = new Set(
		getEligibleCandidates(evaluationCase).map((item) => item.id),
	);

	if (!evaluationCase.id || relevantIds.size === 0) {
		throw new Error("Every evaluation case needs an id and relevant item.");
	}

	if (new Set(candidateIds).size !== candidateIds.length) {
		throw new Error(`${evaluationCase.id} contains duplicate candidate ids.`);
	}

	for (const relevantId of relevantIds) {
		if (!eligibleIds.has(relevantId)) {
			throw new Error(
				`${evaluationCase.id} has an ineligible relevant item: ${relevantId}.`,
			);
		}
	}
}

function getPositiveGenreOverlap(
	genres: string[],
	weights: Record<string, number>,
) {
	if (genres.length === 0) {
		return 0;
	}

	return (
		genres.reduce(
			(sum, genre) =>
				sum + Math.max(0, weights[normalizeLabel(genre)] ?? 0),
			0,
		) / genres.length
	);
}

function mergeProfileGames(
	library: RecommendationGame[],
	feedbackGames: RecommendationGame[],
) {
	return Array.from(
		new Map(
			[...feedbackGames, ...library].map((game) => [game.id, game]),
		).values(),
	);
}

function getRecallAtK(
	ranked: EvaluationCandidate[],
	relevantIds: Set<string>,
) {
	const retrieved = new Set(
		ranked.filter((item) => relevantIds.has(item.id)).map((item) => item.id),
	).size;

	return retrieved / relevantIds.size;
}

function getNdcgAtK(
	ranked: EvaluationCandidate[],
	relevantIds: Set<string>,
	k: number,
) {
	const seenRelevantIds = new Set<string>();
	const dcg = ranked.reduce((sum, item, index) => {
		if (!relevantIds.has(item.id) || seenRelevantIds.has(item.id)) {
			return sum;
		}

		seenRelevantIds.add(item.id);
		return sum + 1 / Math.log2(index + 2);
	}, 0);
	const idealCount = Math.min(relevantIds.size, k);
	let idealDcg = 0;

	for (let index = 0; index < idealCount; index += 1) {
		idealDcg += 1 / Math.log2(index + 2);
	}

	return idealDcg > 0 ? dcg / idealDcg : 0;
}

function getReciprocalRank(
	ranked: EvaluationCandidate[],
	relevantIds: Set<string>,
) {
	const firstRelevantIndex = ranked.findIndex((item) => relevantIds.has(item.id));

	return firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0;
}

function getIntraListDiversity(ranked: EvaluationCandidate[]) {
	if (ranked.length < 2) {
		return 0;
	}

	let distanceTotal = 0;
	let pairCount = 0;

	for (let left = 0; left < ranked.length; left += 1) {
		for (let right = left + 1; right < ranked.length; right += 1) {
			distanceTotal += 1 - facetJaccard(ranked[left], ranked[right]);
			pairCount += 1;
		}
	}

	return pairCount > 0 ? distanceTotal / pairCount : 0;
}

function getNovelty(
	ranked: EvaluationCandidate[],
	eligibleCandidates: EvaluationCandidate[],
) {
	if (ranked.length === 0) {
		return 0;
	}

	const maxPopularity = Math.max(
		1,
		...eligibleCandidates.map((item) => Math.log1p(item.popularityScore)),
	);

	return mean(
		ranked.map(
			(item) =>
				1 - Math.log1p(item.popularityScore) / maxPopularity,
		),
	);
}

function isPlatformEligible(
	candidate: EvaluationCandidate,
	platform = "all",
) {
	return platform === "all" || candidate.platforms.includes(platform);
}

function mean(values: number[]) {
	return values.length > 0
		? values.reduce((sum, value) => sum + value, 0) / values.length
		: 0;
}
