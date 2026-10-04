export type IgdbGame = {
  id: number;
  name: string;
  slug?: string;
  summary?: string;
  first_release_date?: number;
  cover?: {
    url?: string;
  };
  platforms?: Array<{
    name?: string;
  }>;
  genres?: Array<{
		id?: number;
    name?: string;
  }>;
	themes?: Array<{
		id?: number;
		name?: string;
	}>;
	keywords?: Array<{
		id?: number;
		name?: string;
	}>;
	game_modes?: Array<{
		id?: number;
		name?: string;
	}>;
	player_perspectives?: Array<{
		id?: number;
		name?: string;
	}>;
	similar_games?: number[];
  category?: number;
	game_type?: number;
	total_rating?: number;
  total_rating_count?: number;
  follows?: number;
  hypes?: number;
};

export type StageSelectGameSearchResult = {
  igdbId: number;
  title: string;
  slug?: string;
  summary?: string;
  coverUrl?: string;
  releaseYear?: number;
  platforms: string[];
  genres: string[];
	themes: string[];
	keywords: string[];
	gameModes: string[];
	playerPerspectives: string[];
	similarGameIgdbIds: number[];
  category?: number;
	gameType?: number;
	totalRating?: number;
	totalRatingCount: number;
  popularityScore: number;
};

export type StageSelectDiscoverCandidate = StageSelectGameSearchResult & {
	relatedSeedTitles: string[];
	matchedPreferenceFacets: string[];
	semanticPositiveSimilarity?: number | null;
	semanticNegativeSimilarity?: number | null;
	semanticSignalCount?: number;
};
