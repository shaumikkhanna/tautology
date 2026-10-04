import type {
	DiscoverCandidateBase,
	PlayNextOptions,
	RecommendationFeedback,
	RecommendationGame,
} from "./types.ts";

export const evaluationFixtureVersion = "synthetic-tastes-v1";

export type EvaluationCandidate = DiscoverCandidateBase & {
	igdbId: number;
};

export type RecommendationEvaluationCase = {
	id: string;
	description: string;
	library: RecommendationGame[];
	candidates: EvaluationCandidate[];
	relevantGameIds: string[];
	excludedGameIds?: string[];
	feedback?: RecommendationFeedback[];
	feedbackGames?: RecommendationGame[];
	options?: Pick<PlayNextOptions, "platform">;
};

export const recommendationEvaluationCases: RecommendationEvaluationCase[] = [
	{
		id: "single-genre-specialist",
		description: "A Switch player with a strong action-roguelike history.",
		library: [
			libraryGame("sg-hades", "Ash Labyrinth", {
				genres: ["Action", "Roguelike"],
				themes: ["Mythology"],
				rating: 5,
			}),
			libraryGame("sg-cells", "Iron Cells", {
				genres: ["Action", "Roguelike"],
				rating: 4.5,
			}),
			libraryGame("sg-slow", "Patient Kingdom", {
				genres: ["Role-playing", "Turn-based strategy"],
				platform: "PC",
				rating: 1,
				status: "left",
			}),
		],
		candidates: [
			candidate(1100, "sg-hades", "Ash Labyrinth", {
				genres: ["Action", "Roguelike"],
				themes: ["Mythology"],
				popularityScore: 2600,
			}),
			candidate(1101, "sg-ember-loop", "Ember Loop", {
				genres: ["Action", "Roguelike"],
				themes: ["Mythology"],
				popularityScore: 180,
			}),
			candidate(1106, "sg-cinder-run", "Cinder Run", {
				genres: ["Action", "Roguelike"],
				themes: ["Mythology"],
				popularityScore: 170,
			}),
			candidate(1107, "sg-shadow-loop", "Shadow Loop", {
				genres: ["Action", "Roguelike"],
				themes: ["Mythology"],
				popularityScore: 160,
			}),
			candidate(1102, "sg-stadium", "Global Stadium", {
				genres: ["Sport"],
				popularityScore: 1400,
			}),
			candidate(1103, "sg-tactics", "Clockwork Tactics", {
				genres: ["Strategy", "Role-playing"],
				popularityScore: 420,
			}),
			candidate(1104, "sg-builder", "Island Builder", {
				genres: ["Simulator"],
				popularityScore: 850,
			}),
		],
		relevantGameIds: ["sg-ember-loop"],
		options: { platform: "Nintendo Switch" },
	},
	{
		id: "two-cluster-user",
		description: "A player split between fast mythology games and narrative puzzles.",
		library: [
			libraryGame("tc-action", "Mythic Sprint", {
				genres: ["Action"],
				themes: ["Mythology"],
				gameModes: ["Single player"],
				rating: 5,
			}),
			libraryGame("tc-puzzle", "Paper Rooms", {
				genres: ["Puzzle", "Adventure"],
				themes: ["Mystery"],
				keywords: ["Narrative"],
				rating: 4.5,
			}),
		],
		candidates: [
			candidate(1201, "tc-echo-maze", "Echo Maze", {
				genres: ["Puzzle", "Adventure"],
				themes: ["Mystery"],
				keywords: ["Narrative"],
				popularityScore: 90,
			}),
			candidate(1202, "tc-divine-dash", "Divine Dash", {
				genres: ["Action"],
				themes: ["Mythology"],
				gameModes: ["Single player"],
				popularityScore: 130,
			}),
			candidate(1203, "tc-arena", "Arena Prime", {
				genres: ["Action"],
				themes: ["Science fiction"],
				gameModes: ["Multiplayer"],
				popularityScore: 1700,
			}),
			candidate(1204, "tc-manager", "Club Manager", {
				genres: ["Simulator", "Sport"],
				popularityScore: 1100,
			}),
			candidate(1205, "tc-horror", "Night Signal", {
				genres: ["Adventure"],
				themes: ["Horror"],
				popularityScore: 700,
			}),
		],
		relevantGameIds: ["tc-echo-maze", "tc-divine-dash"],
		excludedGameIds: ["tc-horror"],
	},
	{
		id: "contrarian-low-rater",
		description: "A generally critical player whose few positive signals are niche tactics games.",
		library: [
			libraryGame("cl-tactics", "Obscure Orders", {
				genres: ["Strategy", "Turn-based strategy"],
				themes: ["Historical"],
				rating: 3.5,
			}),
			libraryGame("cl-action", "Blockbuster Force", {
				genres: ["Action", "Shooter"],
				themes: ["Science fiction"],
				rating: 1,
				status: "left",
			}),
			libraryGame("cl-sport", "Annual League", {
				genres: ["Sport"],
				rating: 1.5,
				status: "left",
			}),
		],
		candidates: [
			candidate(1301, "cl-border-tactics", "Border Tactics", {
				genres: ["Strategy", "Turn-based strategy"],
				themes: ["Historical"],
				popularityScore: 45,
			}),
			candidate(1302, "cl-galaxy-shot", "Galaxy Shot", {
				genres: ["Action", "Shooter"],
				themes: ["Science fiction"],
				popularityScore: 1900,
			}),
			candidate(1303, "cl-racing", "Infinite Racing", {
				genres: ["Racing"],
				popularityScore: 1250,
			}),
			candidate(1304, "cl-card", "Quiet Cards", {
				genres: ["Card & Board Game"],
				popularityScore: 140,
			}),
		],
		relevantGameIds: ["cl-border-tactics"],
	},
	{
		id: "wishlist-cold-start",
		description: "A new user with wishlist intent but no rating or completion signal.",
		library: [
			libraryGame("wc-wish-one", "Possible Journey", {
				genres: ["Adventure"],
				rating: null,
				status: "wishlisted",
			}),
			libraryGame("wc-wish-two", "Possible Puzzle", {
				genres: ["Puzzle"],
				rating: null,
				status: "wishlisted",
			}),
		],
		candidates: [
			candidate(1401, "wc-popular", "Widely Played", {
				genres: ["Adventure"],
				popularityScore: 1600,
			}),
			candidate(1402, "wc-mid", "Steady Choice", {
				genres: ["Puzzle"],
				popularityScore: 700,
			}),
			candidate(1403, "wc-niche", "Small Experiment", {
				genres: ["Indie"],
				popularityScore: 30,
			}),
			candidate(1404, "wc-sport", "Big Match", {
				genres: ["Sport"],
				popularityScore: 1200,
			}),
		],
		relevantGameIds: ["wc-popular"],
	},
	{
		id: "strong-negative-feedback",
		description: "An action player who explicitly rejected a horror recommendation.",
		library: [
			libraryGame("nf-action", "Bright Blades", {
				genres: ["Action"],
				themes: ["Fantasy"],
				rating: 5,
			}),
		],
		feedbackGames: [
			libraryGame("nf-rejected-cache", "Rejected Night", {
				genres: ["Action"],
				themes: ["Horror"],
				rating: null,
				status: "wishlisted",
			}),
		],
		feedback: [
			{
				gameId: "nf-rejected-cache",
				igdbId: 1502,
				action: "not_for_me",
				createdAt: "2026-09-01T10:00:00.000Z",
			},
		],
		candidates: [
			candidate(1501, "nf-sun-strike", "Sun Strike", {
				genres: ["Action"],
				themes: ["Fantasy"],
				popularityScore: 210,
			}),
			candidate(1502, "nf-rejected-night", "Rejected Night", {
				genres: ["Action"],
				themes: ["Horror"],
				popularityScore: 2100,
			}),
			candidate(1503, "nf-horror-two", "Dark Corridor", {
				genres: ["Adventure"],
				themes: ["Horror"],
				popularityScore: 900,
			}),
			candidate(1504, "nf-builder", "Gentle Builder", {
				genres: ["Simulator"],
				themes: ["Sandbox"],
				popularityScore: 550,
			}),
		],
		relevantGameIds: ["nf-sun-strike"],
	},
	{
		id: "platform-restricted",
		description: "A PC-only evaluation where incompatible strong matches must not leak in.",
		library: [
			libraryGame("pr-rpg", "Desktop Realms", {
				genres: ["Role-playing"],
				themes: ["Fantasy"],
				platform: "PC",
				rating: 5,
			}),
		],
		candidates: [
			candidate(1601, "pr-pc-rpg", "PC Realms", {
				genres: ["Role-playing"],
				themes: ["Fantasy"],
				platforms: ["PC"],
				popularityScore: 160,
			}),
			candidate(1602, "pr-console-rpg", "Console Realms", {
				genres: ["Role-playing"],
				themes: ["Fantasy"],
				platforms: ["PlayStation 5"],
				popularityScore: 2400,
			}),
			candidate(1603, "pr-pc-sim", "PC Workshop", {
				genres: ["Simulator"],
				platforms: ["PC"],
				popularityScore: 1000,
			}),
			candidate(1604, "pr-pc-action", "PC Frontline", {
				genres: ["Action"],
				platforms: ["PC"],
				popularityScore: 1300,
			}),
		],
		relevantGameIds: ["pr-pc-rpg"],
		options: { platform: "PC" },
	},
];

function libraryGame(
	id: string,
	title: string,
	overrides: Partial<RecommendationGame> = {},
): RecommendationGame {
	return {
		id,
		title,
		status: "finished",
		platform: "Nintendo Switch",
		genres: [],
		themes: [],
		keywords: [],
		gameModes: ["Single player"],
		playerPerspectives: [],
		rating: null,
		releaseYear: 2024,
		...overrides,
	};
}

function candidate(
	igdbId: number,
	id: string,
	title: string,
	overrides: Partial<EvaluationCandidate> = {},
): EvaluationCandidate {
	return {
		id,
		igdbId,
		title,
		genres: [],
		themes: [],
		keywords: [],
		gameModes: ["Single player"],
		playerPerspectives: [],
		platforms: ["Nintendo Switch", "PC"],
		popularityScore: 0,
		relatedSeedTitles: [],
		matchedPreferenceFacets: [],
		...overrides,
	};
}
