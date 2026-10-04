import { recommendationVersions } from "./version.ts";

export const globalProfileVariant = "hybrid-global-profile" as const;
export const multiInterestVariant = "hybrid-multi-interest" as const;

export type BlindRankingVariant =
	| typeof globalProfileVariant
	| typeof multiInterestVariant;

export type BlindRankingGame = {
	igdbId: number;
	title: string;
};

export type BlindRankingComparison = {
	comparisonKey: string;
	leftVariant: BlindRankingVariant;
	rightVariant: BlindRankingVariant;
	leftGames: BlindRankingGame[];
	rightGames: BlindRankingGame[];
};

export function buildBlindRankingComparison(
	globalProfileGames: BlindRankingGame[],
	multiInterestGames: BlindRankingGame[],
	controls: { adventure: number; platform: string },
): BlindRankingComparison | null {
	const leftInput = uniqueGames(globalProfileGames).slice(0, 6);
	const rightInput = uniqueGames(multiInterestGames).slice(0, 6);

	if (
		leftInput.length === 0 ||
		rightInput.length === 0 ||
		leftInput.map((game) => game.igdbId).join(",") ===
			rightInput.map((game) => game.igdbId).join(",")
	) {
		return null;
	}

	const identity = [
		recommendationVersions.model,
		controls.adventure,
		controls.platform,
		leftInput.map((game) => game.igdbId).join(","),
		rightInput.map((game) => game.igdbId).join(","),
	].join("|");
	const comparisonKey = `blind-v1-${stableHash(identity)}`;
	const globalOnLeft = Number.parseInt(stableHash(`${identity}|side`), 16) % 2 === 0;

	return {
		comparisonKey,
		leftVariant: globalOnLeft ? globalProfileVariant : multiInterestVariant,
		rightVariant: globalOnLeft ? multiInterestVariant : globalProfileVariant,
		leftGames: globalOnLeft ? leftInput : rightInput,
		rightGames: globalOnLeft ? rightInput : leftInput,
	};
}

function uniqueGames(games: BlindRankingGame[]) {
	return Array.from(
		new Map(
			games
				.filter(
					(game) =>
						Number.isInteger(game.igdbId) &&
						game.igdbId > 0 &&
						game.title.trim().length > 0,
				)
				.map((game) => [game.igdbId, game]),
		).values(),
	);
}

function stableHash(value: string) {
	let hash = 0x811c9dc5;

	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return (hash >>> 0).toString(16).padStart(8, "0");
}
