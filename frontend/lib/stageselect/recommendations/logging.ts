export type RecommendationCandidateSource =
	| "library_queue"
	| "similar_games"
	| "preference_facets"
	| "similar_games+preference_facets"
	| "related_fallback";

export function getDiscoverCandidateSource(game: {
	relatedSeedTitles: string[];
	matchedPreferenceFacets: string[];
}): RecommendationCandidateSource {
	const hasSimilarity = game.relatedSeedTitles.length > 0;
	const hasFacets = game.matchedPreferenceFacets.length > 0;

	if (hasSimilarity && hasFacets) {
		return "similar_games+preference_facets";
	}

	if (hasSimilarity) {
		return "similar_games";
	}

	if (hasFacets) {
		return "preference_facets";
	}

	return "related_fallback";
}
