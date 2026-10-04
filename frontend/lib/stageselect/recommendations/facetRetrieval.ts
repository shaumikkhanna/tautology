export type RetrievalFacetField =
	| "genres"
	| "themes"
	| "keywords"
	| "game_modes"
	| "player_perspectives";

export type RetrievalFacet = {
	field: RetrievalFacetField;
	id: number;
	label: string;
	score: number;
};

export type FacetRetrievalQuery = {
	key: string;
	facets: RetrievalFacet[];
};

type NamedFacet = { id?: number; name?: string };

export type WeightedFacetSeed = {
	weight: number;
	genres?: NamedFacet[];
	themes?: NamedFacet[];
	keywords?: NamedFacet[];
	game_modes?: NamedFacet[];
	player_perspectives?: NamedFacet[];
};

const facetFields: RetrievalFacetField[] = [
	"genres",
	"themes",
	"game_modes",
	"player_perspectives",
	"keywords",
];

export function buildFacetRetrievalQueries(
	seeds: WeightedFacetSeed[],
	limit = 6,
) {
	const ranked = Object.fromEntries(
		facetFields.map((field) => [field, rankFacets(seeds, field)]),
	) as Record<RetrievalFacetField, RetrievalFacet[]>;
	const [genre, secondGenre] = ranked.genres;
	const [theme] = ranked.themes;
	const [gameMode] = ranked.game_modes;
	const [perspective] = ranked.player_perspectives;
	const [keyword] = ranked.keywords;
	const combinations: Array<Array<RetrievalFacet | undefined>> = [
		[genre, theme],
		[genre, gameMode],
		[secondGenre, theme],
		[theme, keyword],
		[genre, perspective],
		[genre, secondGenre],
	];
	const broadQueries: Array<Array<RetrievalFacet | undefined>> = [
		[genre],
		[secondGenre],
		[theme],
		[gameMode],
	];
	const queries: FacetRetrievalQuery[] = [];
	const seen = new Set<string>();

	for (const proposed of [...combinations, ...broadQueries]) {
		const facets = proposed.filter(
			(facet): facet is RetrievalFacet => Boolean(facet),
		);

		if (facets.length === 0) {
			continue;
		}

		const signature = facets
			.map((facet) => `${facet.field}:${facet.id}`)
			.sort()
			.join("|");

		if (seen.has(signature)) {
			continue;
		}

		seen.add(signature);
		queries.push({ key: `preference-facets-${queries.length}`, facets });

		if (queries.length >= limit) {
			break;
		}
	}

	return queries;
}

export function buildFacetFilter(query: FacetRetrievalQuery) {
	const idsByField = new Map<RetrievalFacetField, number[]>();

	for (const facet of query.facets) {
		const ids = idsByField.get(facet.field) ?? [];
		ids.push(facet.id);
		idsByField.set(facet.field, ids);
	}

	return Array.from(idsByField, ([field, ids]) => {
		const uniqueIds = Array.from(new Set(ids));
		const operand =
			uniqueIds.length > 1
				? `[${uniqueIds.join(",")}]`
				: `(${uniqueIds[0]})`;

		return `${field} = ${operand}`;
	}).join(" & ");
}

export function mergeFacetCandidateResults<T extends { id: number }>(
	queries: FacetRetrievalQuery[],
	resultsByQuery: Map<string, T[]>,
	excludedIds: Set<number> = new Set(),
) {
	const candidatesById = new Map<number, T>();
	const matchedFacetsByCandidate = new Map<number, Set<string>>();

	for (const query of queries) {
		for (const candidate of resultsByQuery.get(query.key) ?? []) {
			if (excludedIds.has(candidate.id)) {
				continue;
			}

			candidatesById.set(candidate.id, candidate);
			const labels =
				matchedFacetsByCandidate.get(candidate.id) ?? new Set<string>();

			for (const facet of query.facets) {
				labels.add(facet.label);
			}

			matchedFacetsByCandidate.set(candidate.id, labels);
		}
	}

	return { candidatesById, matchedFacetsByCandidate };
}

function rankFacets(
	seeds: WeightedFacetSeed[],
	field: RetrievalFacetField,
) {
	const totals = new Map<number, { label: string; score: number }>();

	for (const seed of seeds) {
		const seenForSeed = new Set<number>();

		for (const facet of seed[field] ?? []) {
			if (
				!Number.isInteger(facet.id) ||
				!facet.id ||
				!facet.name ||
				seenForSeed.has(facet.id)
			) {
				continue;
			}

			seenForSeed.add(facet.id);
			const current = totals.get(facet.id) ?? {
				label: facet.name,
				score: 0,
			};
			current.score += seed.weight;
			totals.set(facet.id, current);
		}
	}

	return Array.from(totals, ([id, value]) => ({
		field,
		id,
		label: value.label,
		score: value.score,
	}))
		.filter((facet) => facet.score > 0)
		.sort(
			(left, right) =>
				right.score - left.score || left.label.localeCompare(right.label),
		);
}
