import { NextResponse } from "next/server";

type DictionaryApiEntry = {
	word?: string;
	phonetic?: string;
	meanings?: Array<{
		partOfSpeech?: string;
		synonyms?: string[];
		antonyms?: string[];
		definitions?: Array<{
			definition?: string;
			example?: string;
			synonyms?: string[];
			antonyms?: string[];
		}>;
	}>;
	sourceUrls?: string[];
};

type WikidataSearchResult = {
	id?: string;
	label?: string;
	description?: string;
	concepturi?: string;
	url?: string;
	aliases?: string[];
};

type WikidataPayload = {
	search?: WikidataSearchResult[];
};

type WikipediaSearchResult = {
	pageid?: number;
	title?: string;
	snippet?: string;
};

type WikipediaPayload = {
	query?: {
		search?: WikipediaSearchResult[];
	};
};

type DictionaryResult = {
	word: string;
	phonetic: string | null;
	meanings: Array<{
		partOfSpeech: string;
		definitions: Array<{
			text: string;
			example: string | null;
			synonyms: string[];
			antonyms: string[];
		}>;
		synonyms: string[];
		antonyms: string[];
	}>;
	sourceUrls: string[];
};

type EntityResult = {
	id: string;
	label: string;
	description: string | null;
	url: string;
	aliases: string[];
	source: "Wikidata" | "Wikipedia";
};

const dictionaryBaseUrl =
	"https://api.dictionaryapi.dev/api/v2/entries/en";
const wikidataSearchUrl = "https://www.wikidata.org/w/api.php";
const wikipediaSearchUrl = "https://en.wikipedia.org/w/api.php";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const query = searchParams.get("q")?.trim();

	if (!query) {
		return NextResponse.json(
			{ error: "Search query is required." },
			{ status: 400 },
		);
	}

	const [dictionary, entities] = await Promise.all([
		fetchDictionaryResults(query),
		fetchWikidataResults(query),
	]);

	return NextResponse.json({
		query,
		dictionary,
		entities,
	});
}

async function fetchDictionaryResults(query: string) {
	const dictionaryUrl = `${dictionaryBaseUrl}/${encodeURIComponent(query)}`;

	try {
		const response = await fetch(dictionaryUrl, {
			next: { revalidate: 60 * 60 * 24 },
		});

		if (response.status === 404) {
			return {
				results: [] as DictionaryResult[],
				error: null,
			};
		}

		if (!response.ok) {
			return {
				results: [] as DictionaryResult[],
				error: getDictionaryStatusMessage(response.status),
			};
		}

		const payload = (await response.json()) as DictionaryApiEntry[];

		return {
			results: payload.map(normalizeDictionaryEntry),
			error: null,
		};
	} catch (error) {
		return {
			results: [] as DictionaryResult[],
			error:
				error instanceof Error
					? error.message
					: "Dictionary lookup failed.",
		};
	}
}

function getDictionaryStatusMessage(status: number) {
	if (status === 522) {
		return "The dictionary source timed out. Try again in a moment.";
	}

	if (status >= 500) {
		return "The dictionary source is temporarily unavailable. Try again in a moment.";
	}

	return `Dictionary lookup failed with ${status}.`;
}

async function fetchWikidataResults(query: string) {
	const searchUrl = new URL(wikidataSearchUrl);
	searchUrl.searchParams.set("action", "wbsearchentities");
	searchUrl.searchParams.set("format", "json");
	searchUrl.searchParams.set("language", "en");
	searchUrl.searchParams.set("uselang", "en");
	searchUrl.searchParams.set("limit", "8");
	searchUrl.searchParams.set("search", query);

	try {
		const response = await fetch(searchUrl, {
			headers: {
				"User-Agent":
					"toomuchmaths-lookup/0.1 (https://toomuchmaths.com)",
			},
			next: { revalidate: 60 * 60 * 12 },
		});

		if (!response.ok) {
			throw new Error(`Wikidata lookup failed with ${response.status}.`);
		}

		const payload = (await response.json()) as WikidataPayload;

		const wikidataResults = (payload.search ?? [])
			.map(normalizeWikidataResult)
			.filter((result) => result !== null);
		const wikipediaResults = await fetchWikipediaResults(query);

		return {
			results: mergeEntityResults(wikidataResults, wikipediaResults.results),
			error: wikipediaResults.error ?? null,
		};
	} catch (error) {
		const wikipediaResults = await fetchWikipediaResults(query);

		return {
			results: wikipediaResults.results,
			error:
				wikipediaResults.error ??
				(error instanceof Error
					? error.message
					: "Entity lookup failed."),
		};
	}
}

async function fetchWikipediaResults(query: string) {
	const searchUrl = new URL(wikipediaSearchUrl);
	searchUrl.searchParams.set("action", "query");
	searchUrl.searchParams.set("format", "json");
	searchUrl.searchParams.set("list", "search");
	searchUrl.searchParams.set("srlimit", "6");
	searchUrl.searchParams.set("srsearch", query);

	try {
		const response = await fetch(searchUrl, {
			headers: {
				"User-Agent":
					"toomuchmaths-lookup/0.1 (https://toomuchmaths.com)",
			},
			next: { revalidate: 60 * 60 * 12 },
		});

		if (!response.ok) {
			throw new Error(`Wikipedia lookup failed with ${response.status}.`);
		}

		const payload = (await response.json()) as WikipediaPayload;

		return {
			results: (payload.query?.search ?? [])
				.map(normalizeWikipediaResult)
				.filter((result) => result !== null),
			error: null,
		};
	} catch (error) {
		return {
			results: [] as EntityResult[],
			error:
				error instanceof Error
					? error.message
					: "Wikipedia lookup failed.",
		};
	}
}

function normalizeDictionaryEntry(entry: DictionaryApiEntry): DictionaryResult {
	const sourceUrls = Array.from(new Set(entry.sourceUrls ?? []));

	return {
		word: entry.word ?? "",
		phonetic: entry.phonetic ?? null,
		sourceUrls,
		meanings: (entry.meanings ?? []).map((meaning) => ({
			partOfSpeech: meaning.partOfSpeech ?? "word",
			synonyms: uniqueStrings(meaning.synonyms ?? []).slice(0, 12),
			antonyms: uniqueStrings(meaning.antonyms ?? []).slice(0, 12),
			definitions: (meaning.definitions ?? [])
				.map((definition) => ({
					text: definition.definition ?? "",
					example: definition.example ?? null,
					synonyms: uniqueStrings(definition.synonyms ?? []).slice(
						0,
						12,
					),
					antonyms: uniqueStrings(definition.antonyms ?? []).slice(
						0,
						12,
					),
				}))
				.filter((definition) => definition.text)
				.slice(0, 4),
		})),
	};
}

function normalizeWikidataResult(
	result: WikidataSearchResult,
): EntityResult | null {
	if (!result.id || !result.label) {
		return null;
	}

	return {
		id: result.id,
		label: result.label,
		description: result.description ?? null,
		url:
			result.concepturi ??
			(result.url ? `https:${result.url}` : `https://www.wikidata.org/wiki/${result.id}`),
		aliases: uniqueStrings(result.aliases ?? []).slice(0, 8),
		source: "Wikidata",
	};
}

function normalizeWikipediaResult(
	result: WikipediaSearchResult,
): EntityResult | null {
	if (!result.pageid || !result.title) {
		return null;
	}

	return {
		id: `Wikipedia:${result.pageid}`,
		label: result.title,
		description: result.snippet ? stripHtmlSnippet(result.snippet) : null,
		url: `https://en.wikipedia.org/?curid=${result.pageid}`,
		aliases: [],
		source: "Wikipedia",
	};
}

function mergeEntityResults(
	primaryResults: EntityResult[],
	fallbackResults: EntityResult[],
) {
	const seenLabels = new Set<string>();
	const merged: EntityResult[] = [];

	for (const result of [...primaryResults, ...fallbackResults]) {
		const key = result.label.toLowerCase();

		if (seenLabels.has(key)) {
			continue;
		}

		seenLabels.add(key);
		merged.push(result);
	}

	return merged.slice(0, 10);
}

function stripHtmlSnippet(value: string) {
	return value
		.replace(/<[^>]*>/g, "")
		.replace(/&quot;/g, "\"")
		.replace(/&#039;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}

function uniqueStrings(values: string[]) {
	return Array.from(
		new Set(
			values
				.map((value) => value.trim())
				.filter((value) => value.length > 0),
		),
	);
}
