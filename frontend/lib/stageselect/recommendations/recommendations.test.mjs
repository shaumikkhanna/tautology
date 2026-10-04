import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFacetFilter,
  buildFacetRetrievalQueries,
  buildTasteProfile,
  genreJaccard,
  getPreferenceWeight,
  getDiscoverCandidateSource,
  mergeFacetCandidateResults,
  recommendDiscover,
  recommendPlayNext,
} from "./index.ts";

const library = [
  game({
    id: "hades",
    title: "Hades",
    status: "finished",
    platform: "Nintendo Switch",
    genres: ["Action", "Roguelike"],
    rating: 5,
  }),
  game({
    id: "dead-cells",
    title: "Dead Cells",
    status: "finished",
    platform: "Nintendo Switch",
    genres: ["Action", "Roguelike"],
    rating: 4.5,
  }),
  game({
    id: "slow-rpg",
    title: "Slow RPG",
    status: "left",
    platform: "PC",
    genres: ["Role-playing", "Turn-based strategy"],
    rating: 1,
  }),
  game({
    id: "rogue-queue",
    title: "Rogue Queue",
    status: "backlogged",
    platform: "Nintendo Switch",
    genres: ["Action", "Roguelike"],
  }),
  game({
    id: "rpg-queue",
    title: "RPG Queue",
    status: "backlogged",
    platform: "PC",
    genres: ["Role-playing", "Turn-based strategy"],
  }),
  game({
    id: "puzzle-queue",
    title: "Puzzle Queue",
    status: "wishlisted",
    platform: "Nintendo Switch",
    genres: ["Puzzle"],
  }),
];

test("ratings create centered positive and negative preference weights", () => {
  assert.equal(getPreferenceWeight(library[0]), 1.5);
  assert.equal(getPreferenceWeight(library[2]), -1.5);
  assert.equal(
    getPreferenceWeight(game({ status: "finished", rating: null })),
    0.5,
  );
});

test("taste profile preserves positive and negative genre evidence", () => {
  const profile = buildTasteProfile(library);

  assert.equal(profile.confidence, "developing");
  assert.ok(profile.genreWeights.action > 0);
  assert.ok(profile.genreWeights["role-playing"] < 0);
  assert.equal(profile.platformWeights["Nintendo Switch"], 1);
  assert.equal(profile.positiveGames[0].title, "Hades");
});

test("preference profile learns themes, modes, and perspectives", () => {
  const profile = buildTasteProfile([
    game({
      id: "positive",
      status: "finished",
      rating: 5,
      genres: ["Action"],
      themes: ["Mythology"],
      keywords: ["Roguelike"],
      gameModes: ["Single player"],
      playerPerspectives: ["Isometric"],
    }),
    game({
      id: "negative",
      status: "left",
      rating: 1,
      genres: ["Strategy"],
      themes: ["Horror"],
      keywords: ["Grinding"],
      gameModes: ["Multiplayer"],
      playerPerspectives: ["First person"],
    }),
  ]);

  assert.ok(profile.themeWeights.mythology > 0);
  assert.ok(profile.themeWeights.horror < 0);
  assert.ok(profile.gameModeWeights["single player"] > 0);
  assert.ok(profile.playerPerspectiveWeights.isometric > 0);
  assert.ok(profile.keywordWeights.grinding < 0);
});

test("taste groups wait for enough positive evidence", () => {
  assert.deepEqual(buildTasteProfile(library).tasteClusters, []);
});

test("taste groups separate distinct interests and retain supporting games", () => {
  const clusteredLibrary = [
    ...clusterGames("action", ["Action", "Roguelike"], "Mythology"),
    ...clusterGames("cozy", ["Simulation", "Puzzle"], "Cozy"),
  ];
  const profile = buildTasteProfile(clusteredLibrary);
  const reversedProfile = buildTasteProfile([...clusteredLibrary].reverse());

  assert.equal(profile.tasteClusters.length, 2);
  assert.deepEqual(profile.tasteClusters, reversedProfile.tasteClusters);
  assert.ok(
    profile.tasteClusters.some(
      (cluster) =>
        cluster.facets.some((facet) => facet.label === "action") &&
        cluster.supportingGames.every((game) => game.id.startsWith("action")),
    ),
  );
  assert.ok(
    profile.tasteClusters.some(
      (cluster) =>
        cluster.facets.some((facet) => facet.label === "simulation") &&
        cluster.supportingGames.every((game) => game.id.startsWith("cozy")),
    ),
  );
  assert.ok(
    profile.tasteClusters.every(
      (cluster) => cluster.label && cluster.supportingGames.length > 0,
    ),
  );
});

test("facet retrieval uses positive weighted evidence and combines facets", () => {
  const queries = buildFacetRetrievalQueries([
    {
      weight: 2,
      genres: [{ id: 1, name: "Action" }],
      themes: [{ id: 10, name: "Mythology" }],
      game_modes: [{ id: 20, name: "Single player" }],
    },
    {
      weight: -3,
      genres: [{ id: 2, name: "Strategy" }],
      themes: [{ id: 11, name: "Horror" }],
    },
  ]);
  const facets = queries.flatMap((query) => query.facets);

  assert.ok(facets.some((facet) => facet.label === "Action"));
  assert.ok(facets.some((facet) => facet.label === "Mythology"));
  assert.equal(facets.some((facet) => facet.label === "Strategy"), false);
  assert.equal(facets.some((facet) => facet.label === "Horror"), false);
  assert.match(buildFacetFilter(queries[0]), /genres = \(1\)/);
  assert.match(buildFacetFilter(queries[0]), /themes = \(10\)/);
});

test("facet candidate merging deduplicates games and preserves provenance", () => {
  const queries = [
    {
      key: "first",
      facets: [{ field: "genres", id: 1, label: "Action", score: 2 }],
    },
    {
      key: "second",
      facets: [{ field: "themes", id: 10, label: "Mythology", score: 2 }],
    },
  ];
  const merged = mergeFacetCandidateResults(
    queries,
    new Map([
      ["first", [{ id: 100, title: "Candidate" }, { id: 999 }]],
      ["second", [{ id: 100, title: "Candidate" }]],
    ]),
    new Set([999]),
  );

  assert.deepEqual(Array.from(merged.candidatesById.keys()), [100]);
  assert.deepEqual(
    Array.from(merged.matchedFacetsByCandidate.get(100)),
    ["Action", "Mythology"],
  );
});

test("play-next ranking favors positively matched games", () => {
  const result = recommendPlayNext(library, { adventure: 0, limit: 3 });

  assert.equal(result.recommendations[0].game.id, "rogue-queue");
  assert.ok(
    result.recommendations[0].explanations.some((reason) =>
      reason.includes("Roguelike"),
    ),
  );
  assert.equal(result.recommendations.at(-1).game.id, "rpg-queue");
});

test("platform filter is a hard eligibility constraint", () => {
  const result = recommendPlayNext(library, { platform: "PC" });

  assert.deepEqual(
    result.recommendations.map((item) => item.game.id),
    ["rpg-queue"],
  );
});

test("direct feedback changes the taste profile and candidate eligibility", () => {
  const moreLike = recommendPlayNext(library, {
    feedback: [
      {
        gameId: "puzzle-queue",
        action: "more_like_this",
        createdAt: "2026-09-21T10:00:00.000Z",
      },
    ],
  });
  const rejected = recommendPlayNext(library, {
    feedback: [
      {
        gameId: "rogue-queue",
        action: "not_for_me",
        createdAt: "2026-09-21T10:00:00.000Z",
      },
    ],
  });

  assert.ok(moreLike.profile.genreWeights.puzzle > 0);
  assert.ok(
    moreLike.recommendations.find(
      (item) => item.game.id === "puzzle-queue",
    ).score.relevance >
      recommendPlayNext(library).recommendations.find(
        (item) => item.game.id === "puzzle-queue",
      ).score.relevance,
  );
  assert.equal(
    rejected.recommendations.some((item) => item.game.id === "rogue-queue"),
    false,
  );
});

test("the newest feedback event wins when a user changes their mind", () => {
  const result = recommendPlayNext(library, {
    feedback: [
      {
        gameId: "rogue-queue",
        action: "not_for_me",
        createdAt: "2026-09-21T10:00:00.000Z",
      },
      {
        gameId: "rogue-queue",
        action: "more_like_this",
        createdAt: "2026-09-21T11:00:00.000Z",
      },
    ],
  });

  assert.equal(
    result.recommendations.some((item) => item.game.id === "rogue-queue"),
    true,
  );
});

test("adventure setting increases diversity after the first result", () => {
  const extraLibrary = [
    ...library,
    game({
      id: "rogue-queue-two",
      title: "Rogue Queue Two",
      status: "backlogged",
      platform: "Nintendo Switch",
      genres: ["Action", "Roguelike"],
    }),
  ];
  const familiar = recommendPlayNext(extraLibrary, {
    adventure: 0,
    limit: 2,
  });
  const adventurous = recommendPlayNext(extraLibrary, {
    adventure: 100,
    limit: 2,
  });

  assert.equal(familiar.recommendations[0].game.id, "rogue-queue");
  assert.equal(adventurous.recommendations[0].game.id, "rogue-queue");
  assert.equal(familiar.recommendations[1].game.id, "rogue-queue-two");
  assert.notEqual(adventurous.recommendations[1].game.id, "rogue-queue-two");
});

test("genre Jaccard similarity is normalized and case-insensitive", () => {
  assert.equal(genreJaccard(["Action", "RPG"], ["action", "Puzzle"]), 1 / 3);
  assert.equal(genreJaccard([], []), 0);
});

test("discover ranking favors profile and platform matches", () => {
  const recommendations = recommendDiscover(
    library,
    [
      {
        id: "discover-action",
        title: "Discover Action",
        genres: ["Action", "Roguelike"],
        platforms: ["Nintendo Switch"],
        popularityScore: 800,
        relatedSeedTitles: ["Hades"],
      },
      {
        id: "discover-rpg",
        title: "Discover RPG",
        genres: ["Role-playing", "Turn-based strategy"],
        platforms: ["PC"],
        popularityScore: 800,
        relatedSeedTitles: ["Slow RPG"],
      },
    ],
    { adventure: 0 },
  );

  assert.equal(recommendations[0].game.id, "discover-action");
  assert.ok(
    recommendations[0].explanations.some((reason) => reason.includes("Hades")),
  );
});

test("semantic similarity breaks otherwise equal discover candidates", () => {
  const candidates = [
    {
      id: "semantic-low",
      title: "A Semantic Low",
      genres: ["Action"],
      platforms: ["Nintendo Switch"],
      popularityScore: 100,
      relatedSeedTitles: [],
      semanticPositiveSimilarity: 0.2,
      semanticSignalCount: 4,
    },
    {
      id: "semantic-high",
      title: "Z Semantic High",
      genres: ["Action"],
      platforms: ["Nintendo Switch"],
      popularityScore: 100,
      relatedSeedTitles: [],
      semanticPositiveSimilarity: 0.9,
      semanticSignalCount: 4,
    },
  ];
  const recommendations = recommendDiscover(library, candidates, {
    adventure: 0,
  });

  assert.equal(recommendations[0].game.id, "semantic-high");
  assert.equal(recommendations[0].score.semanticCoverage, 1);
  assert.ok(
    recommendations[0].explanations.some((reason) =>
      reason.includes("description and play style"),
    ),
  );
});

test("missing embeddings preserve structured relevance exactly", () => {
  const candidate = {
    id: "structured-only",
    title: "Structured Only",
    genres: ["Action"],
    platforms: ["Nintendo Switch"],
    popularityScore: 100,
    relatedSeedTitles: [],
  };
  const withoutFields = recommendDiscover(library, [candidate], {
    adventure: 0,
  })[0];
  const explicitMissing = recommendDiscover(
    library,
    [
      {
        ...candidate,
        semanticPositiveSimilarity: null,
        semanticNegativeSimilarity: null,
        semanticSignalCount: 0,
      },
    ],
    { adventure: 0 },
  )[0];

  assert.equal(withoutFields.score.semanticCoverage, 0);
  assert.equal(withoutFields.score.relevance, explicitMissing.score.relevance);
});

test("discover platform filtering is applied before reranking", () => {
  const recommendations = recommendDiscover(
    library,
    [
      {
        id: "switch",
        title: "Switch Game",
        genres: ["Action"],
        platforms: ["Nintendo Switch"],
        popularityScore: 10,
        relatedSeedTitles: [],
      },
      {
        id: "pc",
        title: "PC Game",
        genres: ["Action"],
        platforms: ["PC"],
        popularityScore: 10,
        relatedSeedTitles: [],
      },
    ],
    { platform: "PC" },
  );

  assert.deepEqual(recommendations.map((item) => item.game.id), ["pc"]);
});

test("discover ranking uses richer facets when genres are equally useful", () => {
  const facetLibrary = [
    game({
      id: "liked",
      status: "finished",
      rating: 5,
      genres: ["Action"],
      themes: ["Mythology"],
    }),
    game({
      id: "disliked",
      status: "left",
      rating: 1,
      genres: ["Action"],
      themes: ["Horror"],
    }),
  ];
  const recommendations = recommendDiscover(
    facetLibrary,
    [
      {
        id: "mythology",
        title: "Mythology Game",
        genres: ["Action"],
        themes: ["Mythology"],
        platforms: ["PC"],
        popularityScore: 100,
        relatedSeedTitles: [],
        matchedPreferenceFacets: ["Mythology"],
      },
      {
        id: "horror",
        title: "Horror Game",
        genres: ["Action"],
        themes: ["Horror"],
        platforms: ["PC"],
        popularityScore: 100,
        relatedSeedTitles: [],
        matchedPreferenceFacets: [],
      },
    ],
    { adventure: 0 },
  );

  assert.equal(recommendations[0].game.id, "mythology");
  assert.ok(
    recommendations[0].explanations.some((reason) =>
      reason.includes("Mythology"),
    ),
  );
});

test("discover dismissal hides a candidate without changing preferences", () => {
  const candidate = {
    id: "outside",
    igdbId: 123,
    title: "Outside Game",
    genres: ["Action"],
    platforms: ["Nintendo Switch"],
    popularityScore: 100,
    relatedSeedTitles: [],
  };
  const dismissed = recommendDiscover(library, [candidate], {
    feedback: [
      {
        gameId: "cached-outside",
        igdbId: 123,
        action: "dismissed",
        createdAt: "2026-09-22T10:00:00.000Z",
      },
    ],
    feedbackGames: [
      game({
        id: "cached-outside",
        genres: ["Puzzle"],
        status: "wishlisted",
      }),
    ],
  });
  const baselineProfile = buildTasteProfile(library);
  const dismissedProfile = buildTasteProfile(library, [
    {
      gameId: "cached-outside",
      action: "dismissed",
      createdAt: "2026-09-22T10:00:00.000Z",
    },
  ]);

  assert.deepEqual(dismissed, []);
  assert.deepEqual(dismissedProfile.genreWeights, baselineProfile.genreWeights);
});

test("outside-library preference feedback contributes through cached game metadata", () => {
  const positiveFeedback = {
    gameId: "cached-puzzle",
    igdbId: 456,
    action: "more_like_this",
    createdAt: "2026-09-22T10:00:00.000Z",
  };
  const recommendations = recommendDiscover(
    library,
    [
      {
        id: "puzzle-discovery",
        igdbId: 789,
        title: "Puzzle Discovery",
        genres: ["Puzzle"],
        platforms: ["Nintendo Switch"],
        popularityScore: 10,
        relatedSeedTitles: [],
      },
      {
        id: "neutral-discovery",
        igdbId: 790,
        title: "Neutral Discovery",
        genres: ["Simulator"],
        platforms: ["Nintendo Switch"],
        popularityScore: 10,
        relatedSeedTitles: [],
      },
    ],
    {
      adventure: 0,
      feedback: [positiveFeedback],
      feedbackGames: [
        game({
          id: "cached-puzzle",
          genres: ["Puzzle"],
          status: "wishlisted",
        }),
      ],
    },
  );

  assert.equal(recommendations[0].game.id, "puzzle-discovery");
});

test("candidate source labels reflect stored retrieval evidence", () => {
  assert.equal(
    getDiscoverCandidateSource({
      relatedSeedTitles: ["Hades"],
      matchedPreferenceFacets: ["Action"],
    }),
    "similar_games+preference_facets",
  );
  assert.equal(
    getDiscoverCandidateSource({
      relatedSeedTitles: [],
      matchedPreferenceFacets: ["Mythology"],
    }),
    "preference_facets",
  );
  assert.equal(
    getDiscoverCandidateSource({
      relatedSeedTitles: ["Hades"],
      matchedPreferenceFacets: [],
    }),
    "similar_games",
  );
});

function game(overrides = {}) {
  return {
    id: "game",
    title: "Game",
    status: "backlogged",
    platform: "PC",
    genres: [],
    rating: null,
    releaseYear: 2024,
    ...overrides,
  };
}

function clusterGames(prefix, genres, theme) {
  return Array.from({ length: 4 }, (_, index) =>
    game({
      id: `${prefix}-${index}`,
      title: `${prefix} ${index}`,
      status: "finished",
      genres,
      themes: [theme],
      gameModes: ["Single player"],
      rating: 5,
    }),
  );
}
