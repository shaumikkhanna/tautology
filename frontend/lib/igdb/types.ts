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
    name?: string;
  }>;
  category?: number;
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
  category?: number;
  popularityScore: number;
};
