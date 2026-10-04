import type { TasteCluster, TasteProfile } from "./types.ts";

const minimumGamesForClustering = 8;
const maximumIterations = 6;
const facetWeights = {
	genre: 1,
	theme: 0.8,
	mode: 0.65,
	perspective: 0.45,
	keyword: 0.3,
} as const;

type PositiveGame = TasteProfile["positiveGames"][number];
type FacetType = TasteCluster["facets"][number]["type"];

type VectorGame = PositiveGame & {
	features: Map<string, { label: string; type: FacetType; weight: number }>;
};

type ClusterableGame = {
	genres: string[];
	themes?: string[];
	keywords?: string[];
	gameModes?: string[];
	playerPerspectives?: string[];
};

/**
 * Builds two to four deterministic taste groups with weighted k-medoids. Games
 * are the medoids, so every cluster remains anchored to real user evidence.
 */
export function buildTasteClusters(
	positiveGames: PositiveGame[],
): TasteCluster[] {
	if (positiveGames.length < minimumGamesForClustering) {
		return [];
	}

	const games = positiveGames
		.map((game) => ({ ...game, features: getFeatureVector(game) }))
		.filter((game) => game.features.size > 0)
		.sort(compareGames);
	const distinctVectorCount = new Set(
		games.map((game) => Array.from(game.features.keys()).sort().join("|")),
	).size;
	const clusterCount = Math.min(
		getClusterCount(games.length),
		distinctVectorCount,
	);

	if (games.length < minimumGamesForClustering || clusterCount < 2) {
		return [];
	}

	let medoids = initializeMedoids(games, clusterCount);
	let assignments = assignGames(games, medoids);

	for (let iteration = 0; iteration < maximumIterations; iteration += 1) {
		const nextMedoids = medoids.map((medoid, clusterIndex) =>
			selectMedoid(getClusterMembers(games, assignments, clusterIndex)) ??
			medoid,
		);

		if (nextMedoids.every((medoid, index) => medoid.id === medoids[index].id)) {
			break;
		}

		medoids = nextMedoids;
		assignments = assignGames(games, medoids);
	}

	const totalWeight = games.reduce((sum, game) => sum + game.weight, 0);
	const clusters = medoids.flatMap((_, clusterIndex) => {
		const members = games.filter(
			(_game, gameIndex) => assignments[gameIndex] === clusterIndex,
		);

		return members.length > 0
			? [createCluster(members, totalWeight)]
			: [];
	});

	return clusters
		.sort(
			(left, right) =>
				right.share - left.share || left.label.localeCompare(right.label),
		)
		.map((cluster, index) => ({ ...cluster, id: `taste-${index + 1}` }));
}

export function getTasteClusterMatch(
	game: ClusterableGame,
	clusters: TasteCluster[],
) {
	let bestMatch: { cluster: TasteCluster; score: number } | null = null;

	for (const cluster of clusters) {
		const groups = [
			getAffinityGroup("genre", game.genres, cluster, 0.45),
			getAffinityGroup("theme", game.themes ?? [], cluster, 0.25),
			getAffinityGroup("mode", game.gameModes ?? [], cluster, 0.15),
			getAffinityGroup(
				"perspective",
				game.playerPerspectives ?? [],
				cluster,
				0.1,
			),
			getAffinityGroup("keyword", game.keywords ?? [], cluster, 0.05),
		].filter(
			(group): group is { score: number; weight: number } => Boolean(group),
		);
		const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);

		if (totalWeight === 0) {
			continue;
		}

		const score =
			groups.reduce(
				(sum, group) => sum + group.score * group.weight,
				0,
			) / totalWeight;

		if (!bestMatch || score > bestMatch.score) {
			bestMatch = { cluster, score };
		}
	}

	return bestMatch;
}

function getClusterMembers(
	games: VectorGame[],
	assignments: number[],
	clusterIndex: number,
) {
	return games.filter(
		(_game, gameIndex) => assignments[gameIndex] === clusterIndex,
	);
}

function getClusterCount(gameCount: number) {
	if (gameCount >= 28) {
		return 4;
	}

	if (gameCount >= 16) {
		return 3;
	}

	return 2;
}

function initializeMedoids(games: VectorGame[], clusterCount: number) {
	const medoids = [games[0]];

	while (medoids.length < clusterCount) {
		const next = games
			.filter((game) => !medoids.some((medoid) => medoid.id === game.id))
			.map((game) => ({
				game,
				distance: Math.min(
					...medoids.map((medoid) => facetDistance(game, medoid)),
				),
			}))
			.sort(
				(left, right) =>
					right.distance - left.distance || compareGames(left.game, right.game),
			)[0]?.game;

		if (!next) {
			break;
		}

		medoids.push(next);
	}

	return medoids;
}

function assignGames(games: VectorGame[], medoids: VectorGame[]) {
	return games.map((game) => {
		let bestIndex = 0;
		let bestDistance = Number.POSITIVE_INFINITY;

		for (const [index, medoid] of medoids.entries()) {
			const distance = facetDistance(game, medoid);

			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = index;
			}
		}

		return bestIndex;
	});
}

function selectMedoid(games: VectorGame[]) {
	return [...games].sort((left, right) => {
		const leftCost = games.reduce(
			(sum, game) => sum + facetDistance(left, game) * game.weight,
			0,
		);
		const rightCost = games.reduce(
			(sum, game) => sum + facetDistance(right, game) * game.weight,
			0,
		);

		return leftCost - rightCost || compareGames(left, right);
	})[0];
}

function createCluster(members: VectorGame[], totalWeight: number): TasteCluster {
	const facetTotals = new Map<
		string,
		{ label: string; type: FacetType; weight: number }
	>();

	for (const game of members) {
		for (const [key, facet] of game.features) {
			const current = facetTotals.get(key);
			facetTotals.set(key, {
				...facet,
				weight: (current?.weight ?? 0) + game.weight * facet.weight,
			});
		}
	}

	const rankedFacets = Array.from(facetTotals, ([key, facet]) => ({
		...facet,
		key,
	})).sort(
		(left, right) =>
			right.weight - left.weight || left.label.localeCompare(right.label),
	);
	const largestFacetWeight = rankedFacets[0]?.weight ?? 1;
	const facets = rankedFacets.slice(0, 4).map((facet) => ({
		label: facet.label,
		type: facet.type,
		weight: facet.weight / largestFacetWeight,
	}));
	const clusterWeight = members.reduce((sum, game) => sum + game.weight, 0);

	return {
		id: "",
		label: facets
			.slice(0, 2)
			.map((facet) => capitalize(facet.label))
			.join(" + "),
		share: totalWeight > 0 ? clusterWeight / totalWeight : 0,
		facetWeights: Object.fromEntries(
			rankedFacets.map((facet) => [
				facet.key,
				facet.weight / largestFacetWeight,
			]),
		),
		facets,
		supportingGames: [...members]
			.sort(compareGames)
			.slice(0, 3)
			.map(({ id, title, weight }) => ({ id, title, weight })),
	};
}

function getAffinityGroup(
	type: FacetType,
	labels: string[],
	cluster: TasteCluster,
	weight: number,
) {
	if (
		labels.length === 0 ||
		!Object.keys(cluster.facetWeights).some((key) => key.startsWith(`${type}:`))
	) {
		return null;
	}

	return {
		score:
			labels.reduce(
				(sum, label) =>
					sum +
					(cluster.facetWeights[`${type}:${normalizeLabel(label)}`] ?? 0),
				0,
			) / labels.length,
		weight,
	};
}

function getFeatureVector(game: PositiveGame) {
	const features = new Map<
		string,
		{ label: string; type: FacetType; weight: number }
	>();

	addFeatures(features, "genre", game.genres);
	addFeatures(features, "theme", game.themes);
	addFeatures(features, "mode", game.gameModes);
	addFeatures(features, "perspective", game.playerPerspectives);
	addFeatures(features, "keyword", game.keywords);

	return features;
}

function addFeatures(
	features: Map<string, { label: string; type: FacetType; weight: number }>,
	type: FacetType,
	labels: string[],
) {
	for (const label of labels) {
		features.set(`${type}:${label}`, {
			label,
			type,
			weight: facetWeights[type],
		});
	}
}

function facetDistance(left: VectorGame, right: VectorGame) {
	const keys = new Set([...left.features.keys(), ...right.features.keys()]);
	let intersection = 0;
	let union = 0;

	for (const key of keys) {
		const leftWeight = left.features.get(key)?.weight ?? 0;
		const rightWeight = right.features.get(key)?.weight ?? 0;
		intersection += Math.min(leftWeight, rightWeight);
		union += Math.max(leftWeight, rightWeight);
	}

	return union === 0 ? 1 : 1 - intersection / union;
}

function compareGames(left: PositiveGame, right: PositiveGame) {
	return (
		right.weight - left.weight ||
		left.title.localeCompare(right.title) ||
		left.id.localeCompare(right.id)
	);
}

function capitalize(value: string) {
	return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function normalizeLabel(value: string) {
	return value.trim().toLocaleLowerCase();
}
