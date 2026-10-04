import type {
	RecommendationFeedback,
	RecommendationGame,
	TasteProfile,
} from "./types.ts";
import { buildTasteClusters } from "./clusters.ts";

export function getPreferenceWeight(game: RecommendationGame) {
	if (game.rating !== null) {
		return (game.rating - 3) * 0.75;
	}

	if (game.status === "finished") {
		return 0.5;
	}

	if (game.status === "left") {
		return -0.5;
	}

	if (game.status === "playing") {
		return 0.35;
	}

	return 0;
}

export function buildTasteProfile(
	games: RecommendationGame[],
	feedback: RecommendationFeedback[] = [],
): TasteProfile {
	const feedbackByGame = getLatestFeedbackByGame(feedback);
	const genreTotals = new Map<string, number>();
	const themeTotals = new Map<string, number>();
	const keywordTotals = new Map<string, number>();
	const gameModeTotals = new Map<string, number>();
	const playerPerspectiveTotals = new Map<string, number>();
	const platformTotals = new Map<string, number>();
	const positiveGames: TasteProfile["positiveGames"] = [];
	let usefulSignalCount = 0;

	for (const game of games) {
		const directFeedback = feedbackByGame.get(game.id)?.action;
		const feedbackWeight =
			directFeedback === "more_like_this"
				? 2
				: directFeedback === "not_for_me"
					? -2
					: 0;
		const weight = getPreferenceWeight(game) + feedbackWeight;

		if (weight === 0) {
			continue;
		}

		usefulSignalCount += 1;

		addWeightedLabels(genreTotals, game.genres, weight);
		addWeightedLabels(themeTotals, game.themes ?? [], weight);
		addWeightedLabels(keywordTotals, game.keywords ?? [], weight);
		addWeightedLabels(gameModeTotals, game.gameModes ?? [], weight);
		addWeightedLabels(
			playerPerspectiveTotals,
			game.playerPerspectives ?? [],
			weight,
		);

		if (game.platform && game.platform !== "-") {
			platformTotals.set(
				game.platform,
				(platformTotals.get(game.platform) ?? 0) + Math.max(weight, 0),
			);
		}

		if (weight > 0) {
			positiveGames.push({
				id: game.id,
				title: game.title,
				genres: uniqueNormalized(game.genres),
				themes: uniqueNormalized(game.themes ?? []),
				keywords: uniqueNormalized(game.keywords ?? []),
				gameModes: uniqueNormalized(game.gameModes ?? []),
				playerPerspectives: uniqueNormalized(
					game.playerPerspectives ?? [],
				),
				weight,
			});
		}
	}

	const sortedPositiveGames = positiveGames.sort(
		(left, right) =>
			right.weight - left.weight ||
			left.title.localeCompare(right.title) ||
			left.id.localeCompare(right.id),
	);

	return {
		confidence:
			usefulSignalCount >= 8
				? "established"
				: usefulSignalCount >= 3
					? "developing"
					: "learning",
		genreWeights: normalizeSignedWeights(genreTotals),
		themeWeights: normalizeSignedWeights(themeTotals),
		keywordWeights: normalizeSignedWeights(keywordTotals),
		gameModeWeights: normalizeSignedWeights(gameModeTotals),
		playerPerspectiveWeights: normalizeSignedWeights(
			playerPerspectiveTotals,
		),
		platformWeights: normalizePositiveWeights(platformTotals),
		positiveGames: sortedPositiveGames,
		tasteClusters: buildTasteClusters(sortedPositiveGames),
		usefulSignalCount,
	};
}

function addWeightedLabels(
	totals: Map<string, number>,
	values: string[],
	weight: number,
) {
	for (const value of uniqueNormalized(values)) {
		totals.set(value, (totals.get(value) ?? 0) + weight);
	}
}

export function getLatestFeedbackByGame(feedback: RecommendationFeedback[]) {
	const latest = new Map<string, RecommendationFeedback>();

	for (const item of feedback) {
		const current = latest.get(item.gameId);

		if (!current || item.createdAt > current.createdAt) {
			latest.set(item.gameId, item);
		}
	}

	return latest;
}

export function getLatestFeedbackByIgdbId(
	feedback: RecommendationFeedback[],
) {
	const latest = new Map<number, RecommendationFeedback>();

	for (const item of feedback) {
		if (!item.igdbId) {
			continue;
		}

		const current = latest.get(item.igdbId);

		if (!current || item.createdAt > current.createdAt) {
			latest.set(item.igdbId, item);
		}
	}

	return latest;
}

function normalizeSignedWeights(values: Map<string, number>) {
	const largestMagnitude = Math.max(
		0,
		...Array.from(values.values(), (value) => Math.abs(value)),
	);

	if (largestMagnitude === 0) {
		return {};
	}

	return Object.fromEntries(
		Array.from(values, ([key, value]) => [key, value / largestMagnitude]),
	);
}

function normalizePositiveWeights(values: Map<string, number>) {
	const largest = Math.max(0, ...values.values());

	if (largest === 0) {
		return {};
	}

	return Object.fromEntries(
		Array.from(values, ([key, value]) => [key, value / largest]),
	);
}

export function normalizeLabel(value: string) {
	return value.trim().toLocaleLowerCase();
}

function uniqueNormalized(values: string[]) {
	return Array.from(new Set(values.map(normalizeLabel).filter(Boolean)));
}
