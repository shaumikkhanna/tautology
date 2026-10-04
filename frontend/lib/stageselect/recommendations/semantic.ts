export const semanticDocumentVersion = "game-metadata-v1";

export type SemanticScoreInput = {
	semanticPositiveSimilarity?: number | null;
	semanticNegativeSimilarity?: number | null;
	semanticSignalCount?: number;
};

export type SemanticScore = {
	coverage: 0 | 1;
	negative: number;
	preference: number;
};

/**
 * Converts raw cosine summaries into a bounded ranking feature. Sparse profiles
 * are shrunk toward neutral so a single game cannot dominate the hybrid score.
 */
export function getSemanticScore(input: SemanticScoreInput): SemanticScore {
	const positive = validCosine(input.semanticPositiveSimilarity);
	const negative = validCosine(input.semanticNegativeSimilarity);

	if (positive === null && negative === null) {
		return { coverage: 0, negative: 0, preference: 0.5 };
	}

	const rawPreference =
		positive !== null && negative !== null
			? (positive - negative + 1) / 2
			: positive !== null
				? (positive + 1) / 2
				: (1 - negative!) / 2;
	const signalCount = Number.isInteger(input.semanticSignalCount)
		? Math.max(0, input.semanticSignalCount ?? 0)
		: 0;
	const reliability = Math.min(1, signalCount / 3);

	return {
		coverage: 1,
		negative: negative === null ? 0 : clamp((negative + 1) / 2, 0, 1),
		preference: clamp(0.5 + (rawPreference - 0.5) * reliability, 0, 1),
	};
}

function validCosine(value: number | null | undefined) {
	return typeof value === "number" && Number.isFinite(value)
		? clamp(value, -1, 1)
		: null;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export const gteSmallEmbeddingModel = {
	model: "gte-small",
	version: "supabase-gte-small-mean-normalized-v1",
	dimensions: 384,
} as const;

export type SemanticGameDocumentInput = {
	title: string;
	summary?: string | null;
	releaseYear?: number | null;
	platforms?: string[];
	genres?: string[];
	themes?: string[];
	keywords?: string[];
	gameModes?: string[];
	playerPerspectives?: string[];
};

export type EmbeddingProvider = {
	model: string;
	version: string;
	dimensions: number;
	embed(inputs: string[]): Promise<number[][]>;
};

export function buildRecommendationDocument(
	game: SemanticGameDocumentInput,
) {
	const title = normalizeText(game.title);

	if (!title) {
		throw new Error("A title is required for a recommendation document.");
	}

	const lines = [
		`Title: ${title}`,
		optionalLine("Summary", normalizeText(game.summary ?? "").slice(0, 1_500)),
		optionalLine(
			"Release year",
			game.releaseYear && Number.isInteger(game.releaseYear)
				? String(game.releaseYear)
				: "",
		),
		listLine("Platforms", game.platforms),
		listLine("Genres", game.genres),
		listLine("Themes", game.themes),
		listLine("Keywords", game.keywords, 40),
		listLine("Game modes", game.gameModes),
		listLine("Player perspectives", game.playerPerspectives),
	].filter((line): line is string => Boolean(line));

	return lines.join("\n");
}

export async function hashRecommendationDocument(document: string) {
	const input = `${semanticDocumentVersion}\n${document}`;
	const digest = await globalThis.crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);

	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

export async function getRecommendationDocumentFields(
	game: SemanticGameDocumentInput,
) {
	const recommendationDocument = buildRecommendationDocument(game);

	return {
		recommendation_document: recommendationDocument,
		recommendation_document_hash:
			await hashRecommendationDocument(recommendationDocument),
	};
}

export function validateEmbeddingBatch(
	provider: Pick<EmbeddingProvider, "dimensions">,
	inputs: string[],
	embeddings: number[][],
) {
	if (embeddings.length !== inputs.length) {
		throw new Error(
			`Embedding provider returned ${embeddings.length} vectors for ${inputs.length} inputs.`,
		);
	}

	for (const [index, embedding] of embeddings.entries()) {
		if (
			embedding.length !== provider.dimensions ||
			embedding.some((value) => !Number.isFinite(value))
		) {
			throw new Error(
				`Embedding ${index} must contain ${provider.dimensions} finite values.`,
			);
		}
	}

	return embeddings;
}

export function cosineSimilarity(left: number[], right: number[]) {
	if (left.length === 0 || left.length !== right.length) {
		throw new Error("Cosine similarity requires equal non-empty vectors.");
	}

	let dotProduct = 0;
	let leftMagnitude = 0;
	let rightMagnitude = 0;

	for (let index = 0; index < left.length; index += 1) {
		const leftValue = left[index];
		const rightValue = right[index];

		if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
			throw new Error("Cosine similarity requires finite vectors.");
		}

		dotProduct += leftValue * rightValue;
		leftMagnitude += leftValue * leftValue;
		rightMagnitude += rightValue * rightValue;
	}

	if (leftMagnitude === 0 || rightMagnitude === 0) {
		return 0;
	}

	return dotProduct / Math.sqrt(leftMagnitude * rightMagnitude);
}

function listLine(label: string, values: string[] = [], limit = 20) {
	const uniqueValues = new Map<string, string>();

	for (const value of values.map(normalizeText).filter(Boolean)) {
		const key = value.toLocaleLowerCase("en");

		if (!uniqueValues.has(key)) {
			uniqueValues.set(key, value);
		}
	}

	const normalizedValues = Array.from(uniqueValues.values())
		.sort((left, right) =>
			left.localeCompare(right, "en", { sensitivity: "base" }),
		)
		.slice(0, limit);

	return optionalLine(label, normalizedValues.join(", "));
}

function optionalLine(label: string, value: string) {
	return value ? `${label}: ${value}` : null;
}

function normalizeText(value: string) {
	return value.replace(/\s+/g, " ").trim();
}
