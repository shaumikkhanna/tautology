import { getTasteClusterMatch } from "./clusters.ts";
import { diversifyRecommendations } from "./diversify.ts";
import { getSemanticScore } from "./semantic.ts";
import {
	buildTasteProfile,
	getLatestFeedbackByGame,
	getLatestFeedbackByIgdbId,
	normalizeLabel,
} from "./signals.ts";
import type {
	DiscoverCandidateBase,
	DiscoverRecommendation,
	PlayNextOptions,
	PlayNextRecommendation,
	RecommendationGame,
	RecommendationScore,
	TasteClusterMatch,
	TasteProfile,
} from "./types.ts";

const queueStatuses = new Set(["playing", "backlogged", "wishlisted"]);

type FacetedGame = {
	genres: string[];
	themes?: string[];
	keywords?: string[];
	gameModes?: string[];
	playerPerspectives?: string[];
};

export function recommendPlayNext(
	library: RecommendationGame[],
	options: PlayNextOptions = {},
) {
	const feedback = options.feedback ?? [];
	const feedbackByGame = getLatestFeedbackByGame(feedback);
	const profile = buildTasteProfile(
		mergeProfileGames(library, options.feedbackGames ?? []),
		feedback,
	);
	const platform = options.platform ?? "all";
	const candidates = library
		.filter((game) => queueStatuses.has(game.status))
		.filter(
			(game) => feedbackByGame.get(game.id)?.action !== "not_for_me",
		)
		.filter((game) => platform === "all" || game.platform === platform)
		.map((game) =>
			scoreCandidate(
				game,
				profile,
				options.useSemantic !== false,
				options.useTasteClusters !== false,
			),
		)
		.sort(
			(a, b) =>
				b.score.relevance - a.score.relevance ||
				a.game.title.localeCompare(b.game.title),
		);

	return {
		profile,
		recommendations: diversifyRecommendations(
			candidates,
			options.adventure ?? 35,
			options.limit ?? 6,
		),
	};
}

export function scoreCandidate(
	game: RecommendationGame,
	profile: TasteProfile,
	useSemantic = true,
	useTasteClusters = true,
): PlayNextRecommendation {
	const { score, tasteClusterMatch } = getScore(
		game,
		profile,
		useSemantic,
		useTasteClusters,
	);
	const explanations = getExplanations(
		game,
		profile,
		score,
		tasteClusterMatch,
	);

	return {
		game,
		score,
		explanations,
		tasteClusterMatch,
		matchLabel:
			score.relevance >= 0.72
				? "Strong match"
				: score.relevance >= 0.48
					? "Worth exploring"
					: "Best available",
	};
}

function getScore(
	game: RecommendationGame,
	profile: TasteProfile,
	useSemantic: boolean,
	useTasteClusters: boolean,
) {
	const { facets, genre } = getFacetScore(game, profile);
	const tasteClusterMatch = useTasteClusters
		? toTasteClusterMatch(getTasteClusterMatch(game, profile.tasteClusters))
		: null;
	const personalizedFacets = combineFacetScores(
		facets,
		tasteClusterMatch?.score,
	);
	const platform = profile.platformWeights[game.platform] ?? 0;
	const intent =
		game.status === "playing"
			? 1
			: game.status === "backlogged"
				? 0.65
				: 0.4;
	const hasPreferenceData = hasFacetPreferenceData(profile);
	const structuredRelevance = hasPreferenceData
		? 0.58 * personalizedFacets + 0.24 * platform + 0.18 * intent
		: 0.65 * intent + 0.35 * platform;
	const semantic = getSemanticScore(useSemantic ? game : {});
	const relevance = combineHybridScore(structuredRelevance, semantic);

	return {
		score: {
			genre,
			facets,
			clusterAffinity: tasteClusterMatch?.score ?? 0,
			intent,
			platform,
			quality: 0,
			semantic: semantic.preference,
			semanticNegative: semantic.negative,
			semanticCoverage: semantic.coverage,
			relevance: clamp(relevance, 0, 1),
		},
		tasteClusterMatch,
	};
}

export function recommendDiscover<TGame extends DiscoverCandidateBase>(
	library: RecommendationGame[],
	candidates: TGame[],
	options: PlayNextOptions = {},
) {
	return diversifyRecommendations(
		rankDiscoverCandidates(library, candidates, options),
		options.adventure ?? 50,
		options.limit ?? 12,
	);
}

export function rankDiscoverCandidates<TGame extends DiscoverCandidateBase>(
	library: RecommendationGame[],
	candidates: TGame[],
	options: PlayNextOptions = {},
) {
	const feedback = options.feedback ?? [];
	const feedbackByIgdbId = getLatestFeedbackByIgdbId(feedback);
	const profile = buildTasteProfile(
		mergeProfileGames(library, options.feedbackGames ?? []),
		feedback,
	);
	const platformFilter = options.platform ?? "all";
	const maxPopularity = Math.max(
		1,
		...candidates.map((game) => Math.log1p(game.popularityScore)),
	);
	const ranked: Array<DiscoverRecommendation<TGame>> = candidates
		.filter((game) => {
			const action = game.igdbId
				? feedbackByIgdbId.get(game.igdbId)?.action
				: undefined;

			return action !== "not_for_me" && action !== "dismissed";
		})
		.filter(
			(game) =>
				platformFilter === "all" || game.platforms.includes(platformFilter),
		)
		.map<DiscoverRecommendation<TGame>>((game) => {
			const { facets, genre } = getFacetScore(game, profile);
			const tasteClusterMatch =
				options.useTasteClusters === false
					? null
					: toTasteClusterMatch(
							getTasteClusterMatch(game, profile.tasteClusters),
						);
			const personalizedFacets = combineFacetScores(
				facets,
				tasteClusterMatch?.score,
			);
			const platform = Math.max(
				0,
				...game.platforms.map(
					(item) => profile.platformWeights[item] ?? 0,
				),
			);
			const quality = Math.log1p(game.popularityScore) / maxPopularity;
			const structuredRelevance = clamp(
				0.65 * personalizedFacets + 0.2 * platform + 0.15 * quality,
				0,
				1,
			);
			const semantic = getSemanticScore(
				options.useSemantic === false ? {} : game,
			);
			const relevance = combineHybridScore(structuredRelevance, semantic);
			const score: RecommendationScore = {
				genre,
				facets,
				clusterAffinity: tasteClusterMatch?.score ?? 0,
				intent: 0,
				platform,
				quality,
				semantic: semantic.preference,
				semanticNegative: semantic.negative,
				semanticCoverage: semantic.coverage,
				relevance,
			};
			const explanations = getDiscoverExplanations(
				game,
				profile,
				score,
				tasteClusterMatch,
			);

			return {
				game,
				score,
				explanations,
				tasteClusterMatch,
				matchLabel:
					relevance >= 0.72
						? "Strong match"
						: relevance >= 0.5
							? "Related match"
							: "Broader option",
			};
		})
		.sort(
			(a, b) =>
				b.score.relevance - a.score.relevance ||
				a.game.title.localeCompare(b.game.title),
		);

	return ranked;
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

function getDiscoverExplanations<TGame extends DiscoverCandidateBase>(
	game: TGame,
	profile: TasteProfile,
	score: RecommendationScore,
	tasteClusterMatch: TasteClusterMatch | null,
) {
	const reasons: string[] = [];
	const matchedFacets = getMatchedFacets(game, profile);
	const retrievalFacets = game.matchedPreferenceFacets ?? [];

	if (matchedFacets.length > 0) {
		reasons.push(
			`Matches ${formatList(matchedFacets.slice(0, 2))} in your profile.`,
		);
	}

	if (tasteClusterMatch && tasteClusterMatch.score >= 0.65) {
		reasons.push(`Matches your ${tasteClusterMatch.label} taste group.`);
	}

	if (score.semanticCoverage === 1 && score.semantic >= 0.65) {
		reasons.push("Similar in description and play style to games you value.");
	}

	if (retrievalFacets.length > 0) {
		reasons.push(
			`Retrieved using ${formatList(retrievalFacets.slice(0, 2))}.`,
		);
	}

	if (game.relatedSeedTitles.length > 0) {
		reasons.push(
			`IGDB relates it to ${formatList(game.relatedSeedTitles.slice(0, 2))}.`,
		);
	}

	if (score.platform >= 0.5) {
		const preferredPlatform = game.platforms.find(
			(item) => (profile.platformWeights[item] ?? 0) >= 0.5,
		);

		if (preferredPlatform) {
			reasons.push(
				`Available on ${preferredPlatform}, a platform you use often.`,
			);
		}
	}

	if (reasons.length === 0) {
		reasons.push("Included as a broader option from related-game data.");
	}

	return reasons.slice(0, 3);
}

function getExplanations(
	game: RecommendationGame,
	profile: TasteProfile,
	score: RecommendationScore,
	tasteClusterMatch: TasteClusterMatch | null,
) {
	const reasons: string[] = [];
	const matchedFacets = getMatchedFacets(game, profile);

	if (matchedFacets.length > 0) {
		reasons.push(
			`Matches your preference for ${formatList(matchedFacets.slice(0, 2))}.`,
		);
	}

	if (tasteClusterMatch && tasteClusterMatch.score >= 0.65) {
		reasons.push(`Matches your ${tasteClusterMatch.label} taste group.`);
	}

	if (score.semanticCoverage === 1 && score.semantic >= 0.65) {
		reasons.push("Similar in description and play style to games you value.");
	}

	const seed = profile.positiveGames.find(
		(item) =>
			item.id !== game.id &&
			item.genres.some((genre) =>
				game.genres.map(normalizeLabel).includes(genre),
			),
	);

	if (seed) {
		reasons.push(`Shares some of the appeal of ${seed.title}.`);
	}

	if (score.platform >= 0.5) {
		reasons.push(`${game.platform} is one of your regular platforms.`);
	}

	if (game.status === "playing") {
		reasons.push("You already have this in progress.");
	} else if (game.status === "backlogged") {
		reasons.push("This is ready and waiting in your backlog.");
	} else {
		reasons.push("This is already on your wishlist.");
	}

	return reasons.slice(0, 3);
}

function getFacetScore(game: FacetedGame, profile: TasteProfile) {
	const genre = getLabelAffinity(game.genres, profile.genreWeights);
	const groups = [
		{ score: genre, hasData: hasWeights(profile.genreWeights), weight: 0.45 },
		{
			score: getLabelAffinity(game.themes ?? [], profile.themeWeights),
			hasData: hasWeights(profile.themeWeights),
			weight: 0.25,
		},
		{
			score: getLabelAffinity(game.gameModes ?? [], profile.gameModeWeights),
			hasData: hasWeights(profile.gameModeWeights),
			weight: 0.15,
		},
		{
			score: getLabelAffinity(
				game.playerPerspectives ?? [],
				profile.playerPerspectiveWeights,
			),
			hasData: hasWeights(profile.playerPerspectiveWeights),
			weight: 0.1,
		},
		{
			score: getLabelAffinity(game.keywords ?? [], profile.keywordWeights),
			hasData: hasWeights(profile.keywordWeights),
			weight: 0.05,
		},
	].filter((group) => group.hasData);
	const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
	const facets =
		totalWeight > 0
			? groups.reduce(
					(sum, group) => sum + group.score * group.weight,
					0,
				) / totalWeight
			: 0.5;

	return { facets, genre };
}

function getLabelAffinity(
	labels: string[],
	weights: Record<string, number>,
) {
	const values = labels
		.map((label) => weights[normalizeLabel(label)] ?? 0)
		.filter((weight) => weight !== 0);
	const raw =
		values.length > 0
			? values.reduce((sum, value) => sum + value, 0) / values.length
			: 0;

	return (raw + 1) / 2;
}

function getMatchedFacets(game: FacetedGame, profile: TasteProfile) {
	return [
		...getPositiveLabels(game.genres, profile.genreWeights),
		...getPositiveLabels(game.themes ?? [], profile.themeWeights),
		...getPositiveLabels(game.gameModes ?? [], profile.gameModeWeights),
		...getPositiveLabels(
			game.playerPerspectives ?? [],
			profile.playerPerspectiveWeights,
		),
		...getPositiveLabels(game.keywords ?? [], profile.keywordWeights),
	]
		.sort((left, right) => right.weight - left.weight)
		.map((item) => item.label);
}

function getPositiveLabels(
	labels: string[],
	weights: Record<string, number>,
) {
	return labels
		.map((label) => ({
			label,
			weight: weights[normalizeLabel(label)] ?? 0,
		}))
		.filter((item) => item.weight > 0);
}

function hasFacetPreferenceData(profile: TasteProfile) {
	return [
		profile.genreWeights,
		profile.themeWeights,
		profile.keywordWeights,
		profile.gameModeWeights,
		profile.playerPerspectiveWeights,
	].some(hasWeights);
}

function hasWeights(weights: Record<string, number>) {
	return Object.keys(weights).length > 0;
}

function formatList(values: string[]) {
	const formatted = values.map(
		(value) => value.charAt(0).toLocaleUpperCase() + value.slice(1),
	);

	return formatted.length === 2
		? `${formatted[0]} and ${formatted[1]}`
		: formatted[0];
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function combineHybridScore(
	structuredRelevance: number,
	semantic: ReturnType<typeof getSemanticScore>,
) {
	if (semantic.coverage === 0) {
		return structuredRelevance;
	}

	return clamp(0.78 * structuredRelevance + 0.22 * semantic.preference, 0, 1);
}

function combineFacetScores(globalFacets: number, clusterAffinity?: number) {
	return clusterAffinity === undefined
		? globalFacets
		: 0.7 * globalFacets + 0.3 * clusterAffinity;
}

function toTasteClusterMatch(
	match: ReturnType<typeof getTasteClusterMatch>,
): TasteClusterMatch | null {
	if (!match) {
		return null;
	}

	return {
		id: match.cluster.id,
		label: match.cluster.label,
		score: match.score,
		supportingGames: match.cluster.supportingGames.map((game) => game.title),
	};
}
