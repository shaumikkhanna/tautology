"use client";

import { FormEvent, useState } from "react";
import styles from "./lookup.module.css";

type LookupPayload = {
	query: string;
	dictionary: {
		results: DictionaryResult[];
		error: string | null;
	};
	entities: {
		results: EntityResult[];
		error: string | null;
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

const sourceLinkClassName =
	`${styles.sourceLink} font-mono text-xs font-bold uppercase`;

export function LookupTool() {
	const [query, setQuery] = useState("");
	const [payload, setPayload] = useState<LookupPayload | null>(null);
	const [message, setMessage] = useState("Search a word, name, acronym, or clue.");
	const [isSearching, setIsSearching] = useState(false);

	async function searchLookup(event?: FormEvent<HTMLFormElement>, nextQuery = query) {
		event?.preventDefault();

		const trimmedQuery = nextQuery.trim();

		if (!trimmedQuery) {
			setMessage("Enter something to look up.");
			setPayload(null);
			return;
		}

		setIsSearching(true);
		setMessage("Searching dictionary and Wikidata...");

		try {
			const response = await fetch(
				`/api/tools/lookup?q=${encodeURIComponent(trimmedQuery)}`,
			);
			const data = (await response.json()) as LookupPayload | { error?: string };

			if (!response.ok) {
				throw new Error(
					"error" in data && data.error
						? data.error
						: "Lookup failed.",
				);
			}

			setPayload(data as LookupPayload);
			setMessage(`Results for "${trimmedQuery}".`);
		} catch (error) {
			setPayload(null);
			setMessage(
				error instanceof Error ? error.message : "Lookup failed.",
			);
		} finally {
			setIsSearching(false);
		}
	}

	function searchWord(nextQuery: string) {
		setQuery(nextQuery);
		window.scrollTo({ top: 0, behavior: "smooth" });
		void searchLookup(undefined, nextQuery);
	}

	const dictionaryResults = payload?.dictionary.results ?? [];
	const entityResults = payload?.entities.results ?? [];
	const hasResults = dictionaryResults.length > 0 || entityResults.length > 0;

	return (
		<section className={styles.lookupPage}>
			<div className={styles.lookupInner}>
				<div className={styles.hero}>
					<p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
						/tools/lookup
					</p>
					<h1 className={`${styles.title} font-mono text-3xl font-bold uppercase tracking-normal sm:text-4xl`}>
						Lookup
					</h1>
					<p className={styles.lede}>
						A small search box for ordinary words and proper nouns. It checks a dictionary for definitions and Wikidata for people, places, acronyms, organizations, characters, and other entities.
					</p>
				</div>

				<form
					onSubmit={searchLookup}
					className={styles.searchForm}
				>
					<label
						htmlFor="lookup-query"
						className={`${styles.label} font-mono text-xs font-bold uppercase`}
					>
						Search
					</label>
					<div className={styles.searchRow}>
						<input
							id="lookup-query"
							type="search"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className={`${styles.input} font-mono text-base`}
						/>
						<button
							type="submit"
							disabled={isSearching || !query.trim()}
							className={`${styles.button} font-mono text-sm font-bold uppercase`}
						>
							{isSearching ? "Searching" : "Look Up"}
						</button>
					</div>
				</form>

				<p className={`${styles.message} font-mono text-sm`}>
					{message}
				</p>

				{payload ? (
					<div className={styles.resultsGrid}>
						<ResultPanel
							title="Dictionary"
							error={payload.dictionary.error}
							emptyText="No dictionary entry found."
						>
							{dictionaryResults.map((entry, index) => (
								<DictionaryCard
									key={`${entry.word}-${index}`}
									entry={entry}
									onSearchWord={searchWord}
								/>
							))}
						</ResultPanel>

						<ResultPanel
							title="Entities"
							error={payload.entities.error}
							emptyText="No entity results found."
						>
							{entityResults.map((entity) => (
								<EntityCard key={entity.id} entity={entity} />
							))}
						</ResultPanel>
					</div>
				) : null}

				{payload && !hasResults ? (
					<p className={styles.noResults}>
						Try a shorter phrase, a direct name, or a nearby clue. This first version uses live source searches, so phrasing still matters.
					</p>
				) : null}
			</div>
		</section>
	);
}

function ResultPanel({
	title,
	error,
	emptyText,
	children,
}: {
	title: string;
	error: string | null;
	emptyText: string;
	children: React.ReactNode;
}) {
	const hasChildren = Array.isArray(children)
		? children.length > 0
		: Boolean(children);

	return (
		<section className={styles.panel}>
			<div className={styles.panelHeader}>
				<p className={`${styles.eyebrow} font-mono text-xs uppercase`}>Source</p>
				<h2 className={`${styles.panelTitle} font-mono text-2xl font-bold uppercase tracking-normal`}>
					{title}
				</h2>
			</div>

			{error ? (
				<p className={styles.error}>
					{error}
				</p>
			) : null}

			<div className={styles.cardStack}>
				{hasChildren ? (
					children
				) : (
					<p className={styles.empty}>{emptyText}</p>
				)}
			</div>
		</section>
	);
}

function DictionaryCard({
	entry,
	onSearchWord,
}: {
	entry: DictionaryResult;
	onSearchWord: (word: string) => void;
}) {
	return (
		<article className={styles.card}>
			<div className={styles.termHeader}>
				<h3 className={`${styles.cardTitle} font-mono text-xl font-bold uppercase tracking-normal`}>
					{entry.word}
				</h3>
				{entry.phonetic ? (
					<p className={`${styles.muted} font-mono text-sm`}>{entry.phonetic}</p>
				) : null}
			</div>

			<div className={styles.meanings}>
				{entry.meanings.map((meaning, index) => (
					<section
						key={`${meaning.partOfSpeech}-${index}`}
						className={styles.meaningSection}
					>
						<h4 className={`${styles.partOfSpeech} font-mono text-sm font-bold uppercase`}>
							{meaning.partOfSpeech}
						</h4>
						<ol className={styles.definitionList}>
							{meaning.definitions.map((definition, definitionIndex) => (
								<li
									key={`${definition.text}-${definitionIndex}`}
									className={styles.definitionItem}
								>
									<span className={`${styles.definitionNumber} font-mono`}>
										{definitionIndex + 1}
									</span>
									<div className={styles.definitionBody}>
										<p>{definition.text}</p>
										{definition.example ? (
											<div className={styles.sentenceBox}>
												<p className={`${styles.metaLabel} font-mono text-xs font-bold uppercase`}>
													Use it in a sentence
												</p>
												<p className={styles.sentence}>
													{definition.example}
												</p>
											</div>
										) : null}
										<WordList
											label="Synonyms"
											words={definition.synonyms}
											onSearchWord={onSearchWord}
										/>
									</div>
								</li>
							))}
						</ol>
						<WordList
							label="Synonyms"
							words={meaning.synonyms}
							onSearchWord={onSearchWord}
						/>
						<WordList
							label="Antonyms"
							words={meaning.antonyms}
							onSearchWord={onSearchWord}
						/>
					</section>
				))}
			</div>

			<SourceLinks urls={entry.sourceUrls} />
		</article>
	);
}

function EntityCard({ entity }: { entity: EntityResult }) {
	return (
		<article className={styles.card}>
			<div className={styles.entityHeader}>
				<h3 className={`${styles.cardTitle} font-mono text-xl font-bold uppercase tracking-normal`}>
					{entity.label}
				</h3>
				<p className={`${styles.muted} font-mono text-xs uppercase`}>
					{entity.source}
				</p>
			</div>
			{entity.description ? (
				<p className={styles.entityDescription}>
					{entity.description}
				</p>
			) : null}
			<WordList label="Aliases" words={entity.aliases} />
			<a
				href={entity.url}
				target="_blank"
				rel="noreferrer"
				className={`${sourceLinkClassName} ${styles.entitySourceLink}`}
			>
				Open Source
			</a>
		</article>
	);
}

function WordList({
	label,
	words,
	onSearchWord,
}: {
	label: string;
	words: string[];
	onSearchWord?: (word: string) => void;
}) {
	if (words.length === 0) {
		return null;
	}

	return (
		<div className={styles.chips}>
			<span className={`${styles.chipLabel} font-mono text-xs font-bold uppercase`}>
				{label}
			</span>
			{words.map((word) => (
				onSearchWord ? (
					<button
						key={word}
						type="button"
						onClick={() => onSearchWord(word)}
						className={styles.chipButton}
					>
						{word}
					</button>
				) : (
					<span key={word} className={styles.chip}>
						{word}
					</span>
				)
			))}
		</div>
	);
}

function SourceLinks({ urls }: { urls: string[] }) {
	if (urls.length === 0) {
		return null;
	}

	return (
		<div className={styles.sourceLinks}>
			{urls.map((url, index) => (
				<a
					key={url}
					href={url}
					target="_blank"
					rel="noreferrer"
					className={sourceLinkClassName}
				>
					Source {index + 1}
				</a>
			))}
		</div>
	);
}
