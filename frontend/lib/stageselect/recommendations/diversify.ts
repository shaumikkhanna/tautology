import { normalizeLabel } from "./signals.ts";

export function diversifyRecommendations<
	T extends {
		game: {
			genres: string[];
			themes?: string[];
			keywords?: string[];
			gameModes?: string[];
			playerPerspectives?: string[];
		};
		score: { relevance: number };
	},
>(
	candidates: T[],
	adventure: number,
	limit: number,
) {
	const remaining = [...candidates];
	const selected: T[] = [];
	const normalizedAdventure = clamp(adventure, 0, 100) / 100;
	const relevanceWeight = 0.9 - normalizedAdventure * 0.35;

	while (remaining.length > 0 && selected.length < limit) {
		let bestIndex = 0;
		let bestScore = Number.NEGATIVE_INFINITY;

		for (let index = 0; index < remaining.length; index += 1) {
			const candidate = remaining[index];
			const redundancy = Math.max(
				0,
				...selected.map((item) =>
					facetJaccard(candidate.game, item.game),
				),
			);
			const mmrScore =
				relevanceWeight * candidate.score.relevance -
				(1 - relevanceWeight) * redundancy;

			if (mmrScore > bestScore) {
				bestScore = mmrScore;
				bestIndex = index;
			}
		}

		selected.push(remaining.splice(bestIndex, 1)[0]);
	}

	return selected;
}

export function facetJaccard(
	left: {
		genres: string[];
		themes?: string[];
		keywords?: string[];
		gameModes?: string[];
		playerPerspectives?: string[];
	},
	right: {
		genres: string[];
		themes?: string[];
		keywords?: string[];
		gameModes?: string[];
		playerPerspectives?: string[];
	},
) {
	return setJaccard(toFacetSet(left), toFacetSet(right));
}

function toFacetSet(game: {
	genres: string[];
	themes?: string[];
	keywords?: string[];
	gameModes?: string[];
	playerPerspectives?: string[];
}) {
	return new Set([
		...prefixedLabels("genre", game.genres),
		...prefixedLabels("theme", game.themes ?? []),
		...prefixedLabels("keyword", game.keywords ?? []),
		...prefixedLabels("mode", game.gameModes ?? []),
		...prefixedLabels("perspective", game.playerPerspectives ?? []),
	]);
}

function prefixedLabels(prefix: string, values: string[]) {
	return values
		.map(normalizeLabel)
		.filter(Boolean)
		.map((value) => `${prefix}:${value}`);
}

export function genreJaccard(left: string[], right: string[]) {
	const leftSet = new Set(left.map(normalizeLabel).filter(Boolean));
	const rightSet = new Set(right.map(normalizeLabel).filter(Boolean));

	return setJaccard(leftSet, rightSet);
}

function setJaccard(leftSet: Set<string>, rightSet: Set<string>) {
	const union = new Set([...leftSet, ...rightSet]);

	if (union.size === 0) {
		return 0;
	}

	let intersectionSize = 0;

	for (const value of leftSet) {
		if (rightSet.has(value)) {
			intersectionSize += 1;
		}
	}

	return intersectionSize / union.size;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
