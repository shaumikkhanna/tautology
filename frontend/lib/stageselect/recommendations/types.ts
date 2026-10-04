export type RecommendationStatus =
	| "finished"
	| "left"
	| "playing"
	| "backlogged"
	| "wishlisted";

export type RecommendationGame = {
	id: string;
	title: string;
	status: RecommendationStatus;
	platform: string;
	genres: string[];
	themes?: string[];
	keywords?: string[];
	gameModes?: string[];
	playerPerspectives?: string[];
	rating: number | null;
	releaseYear: number | null;
	semanticPositiveSimilarity?: number | null;
	semanticNegativeSimilarity?: number | null;
	semanticSignalCount?: number;
};

export type RecommendationFeedbackAction =
	| "more_like_this"
	| "not_for_me"
	| "saved"
	| "dismissed";

export type RecommendationFeedback = {
	gameId: string;
	igdbId?: number;
	recommendationId?: string;
	action: RecommendationFeedbackAction;
	createdAt: string;
};

export type TasteProfile = {
	confidence: "learning" | "developing" | "established";
	genreWeights: Record<string, number>;
	themeWeights: Record<string, number>;
	keywordWeights: Record<string, number>;
	gameModeWeights: Record<string, number>;
	playerPerspectiveWeights: Record<string, number>;
	platformWeights: Record<string, number>;
	positiveGames: Array<{
		id: string;
		title: string;
		genres: string[];
		themes: string[];
		keywords: string[];
		gameModes: string[];
		playerPerspectives: string[];
		weight: number;
	}>;
	tasteClusters: TasteCluster[];
	usefulSignalCount: number;
};

export type TasteCluster = {
	id: string;
	label: string;
	share: number;
	facetWeights: Record<string, number>;
	facets: Array<{
		label: string;
		type: "genre" | "theme" | "keyword" | "mode" | "perspective";
		weight: number;
	}>;
	supportingGames: Array<{
		id: string;
		title: string;
		weight: number;
	}>;
};

export type TasteClusterMatch = {
	id: string;
	label: string;
	score: number;
	supportingGames: string[];
};

export type RecommendationScore = {
	genre: number;
	facets: number;
	clusterAffinity: number;
	intent: number;
	platform: number;
	quality: number;
	semantic: number;
	semanticNegative: number;
	semanticCoverage: number;
	relevance: number;
};

export type PlayNextRecommendation = {
	game: RecommendationGame;
	score: RecommendationScore;
	explanations: string[];
	matchLabel: "Best available" | "Strong match" | "Worth exploring";
	tasteClusterMatch: TasteClusterMatch | null;
};

export type DiscoverCandidateBase = {
	id: string;
	igdbId?: number;
	title: string;
	genres: string[];
	themes?: string[];
	keywords?: string[];
	gameModes?: string[];
	playerPerspectives?: string[];
	platforms: string[];
	popularityScore: number;
	relatedSeedTitles: string[];
	matchedPreferenceFacets?: string[];
	semanticPositiveSimilarity?: number | null;
	semanticNegativeSimilarity?: number | null;
	semanticSignalCount?: number;
};

export type DiscoverRecommendation<TGame extends DiscoverCandidateBase> = {
	game: TGame;
	score: RecommendationScore;
	explanations: string[];
	matchLabel: "Strong match" | "Related match" | "Broader option";
	tasteClusterMatch: TasteClusterMatch | null;
};

export type PlayNextOptions = {
	adventure?: number;
	feedback?: RecommendationFeedback[];
	feedbackGames?: RecommendationGame[];
	limit?: number;
	platform?: string;
	useSemantic?: boolean;
	useTasteClusters?: boolean;
};
