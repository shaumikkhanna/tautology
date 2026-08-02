"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getLoginPath } from "@/lib/auth/redirects";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
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

type FlashcardSet = Pick<Tables<"flashcard_sets">, "id" | "title">;

type DefinitionOption = {
	id: string;
	label: string;
	text: string;
};

const sourceLinkClassName =
	`${styles.sourceLink} font-mono text-xs font-bold uppercase`;

export function LookupTool() {
	const supabase = useMemo(() => createBrowserSupabaseClient(), []);
	const [query, setQuery] = useState("");
	const [payload, setPayload] = useState<LookupPayload | null>(null);
	const [message, setMessage] = useState("Search a word, name, acronym, or clue.");
	const [isSearching, setIsSearching] = useState(false);
	const [session, setSession] = useState<Session | null>(null);
	const [cardSets, setCardSets] = useState<FlashcardSet[]>([]);
	const [activeSaveKey, setActiveSaveKey] = useState<string | null>(null);
	const [selectedDefinitionIds, setSelectedDefinitionIds] = useState<string[]>([]);
	const [selectedSaveSetId, setSelectedSaveSetId] = useState("");
	const [saveMessage, setSaveMessage] = useState("");
	const [isSavingCard, setIsSavingCard] = useState(false);
	const loginPath = getLoginPath("/tools/lookup");

	const loadFlashcardSets = useCallback(
		async (nextSession: Session | null) => {
			if (!supabase || !nextSession) {
				setCardSets([]);
				setSelectedSaveSetId("");
				return;
			}

			const { data, error } = await supabase
				.from("flashcard_sets")
				.select("id, title")
				.eq("user_id", nextSession.user.id)
				.order("updated_at", { ascending: false });

			if (error) {
				setCardSets([]);
				setSelectedSaveSetId("");
				setSaveMessage("Flashcard sets could not be loaded.");
				return;
			}

			const nextSets = (data ?? []) as FlashcardSet[];

			setCardSets(nextSets);
			setSelectedSaveSetId((currentSetId) => {
				if (nextSets.some((set) => set.id === currentSetId)) {
					return currentSetId;
				}

				return nextSets[0]?.id ?? "";
			});
		},
		[supabase],
	);

	useEffect(() => {
		if (!supabase) {
			return;
		}

		let isMounted = true;

		supabase.auth.getSession().then(({ data }) => {
			if (!isMounted) {
				return;
			}

			setSession(data.session);
			void loadFlashcardSets(data.session);
		});

		const { data: listener } = supabase.auth.onAuthStateChange(
			(_event, nextSession) => {
				setSession(nextSession);
				void loadFlashcardSets(nextSession);
			},
		);

		return () => {
			isMounted = false;
			listener.subscription.unsubscribe();
		};
	}, [loadFlashcardSets, supabase]);

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
			setActiveSaveKey(null);
			setSaveMessage("");
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

	function openSavePanel(entry: DictionaryResult, entryKey: string) {
		const definitionOptions = getDefinitionOptions(entry);

		setActiveSaveKey(entryKey);
		setSelectedDefinitionIds(
			definitionOptions[0] ? [definitionOptions[0].id] : [],
		);
		setSaveMessage(
			session
				? "Pick the meanings to save as the answer."
				: "Log in to save Lookup results into Flashcards.",
		);
	}

	function toggleDefinition(definitionId: string) {
		setSelectedDefinitionIds((currentIds) => {
			if (currentIds.includes(definitionId)) {
				return currentIds.filter((currentId) => currentId !== definitionId);
			}

			return [...currentIds, definitionId];
		});
	}

	async function saveEntryToFlashcards(entry: DictionaryResult) {
		if (!supabase || !session) {
			setSaveMessage("Log in first, then you can save words to Flashcards.");
			return;
		}

		if (!selectedSaveSetId) {
			setSaveMessage("Choose a card set first.");
			return;
		}

		const definitionOptions = getDefinitionOptions(entry);
		const selectedDefinitions = definitionOptions.filter((option) =>
			selectedDefinitionIds.includes(option.id),
		);

		if (selectedDefinitions.length === 0) {
			setSaveMessage("Choose at least one meaning.");
			return;
		}

		setIsSavingCard(true);

		const { error } = await supabase.from("flashcards").insert({
			set_id: selectedSaveSetId,
			user_id: session.user.id,
			question: capitalizeFirstLetter(entry.word),
			answer: selectedDefinitions
				.map((definition) => `${definition.label}: ${definition.text}`)
				.join("\n\n"),
		});

		if (error) {
			setSaveMessage("Could not save that flashcard.");
		} else {
			setSaveMessage("Saved to Flashcards.");
		}

		setIsSavingCard(false);
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
									entryKey={`${entry.word}-${index}`}
									onSearchWord={searchWord}
									onOpenSave={openSavePanel}
									onToggleDefinition={toggleDefinition}
									onSave={saveEntryToFlashcards}
									onCancelSave={() => setActiveSaveKey(null)}
									isSaveOpen={activeSaveKey === `${entry.word}-${index}`}
									session={session}
									cardSets={cardSets}
									selectedDefinitionIds={selectedDefinitionIds}
									selectedSetId={selectedSaveSetId}
									onSelectedSetChange={setSelectedSaveSetId}
									saveMessage={saveMessage}
									isSaving={isSavingCard}
									loginPath={loginPath}
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
	entryKey,
	onSearchWord,
	onOpenSave,
	onToggleDefinition,
	onSave,
	onCancelSave,
	isSaveOpen,
	session,
	cardSets,
	selectedDefinitionIds,
	selectedSetId,
	onSelectedSetChange,
	saveMessage,
	isSaving,
	loginPath,
}: {
	entry: DictionaryResult;
	entryKey: string;
	onSearchWord: (word: string) => void;
	onOpenSave: (entry: DictionaryResult, entryKey: string) => void;
	onToggleDefinition: (definitionId: string) => void;
	onSave: (entry: DictionaryResult) => void;
	onCancelSave: () => void;
	isSaveOpen: boolean;
	session: Session | null;
	cardSets: FlashcardSet[];
	selectedDefinitionIds: string[];
	selectedSetId: string;
	onSelectedSetChange: (setId: string) => void;
	saveMessage: string;
	isSaving: boolean;
	loginPath: string;
}) {
	const definitionOptions = getDefinitionOptions(entry);

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

			<SourceLinks
				urls={entry.sourceUrls}
				onSave={() => onOpenSave(entry, entryKey)}
			/>

			{isSaveOpen ? (
				<div className={styles.savePanel}>
					{session ? (
						<>
							<div className={styles.savePanelHeader}>
								<div>
									<p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
										Flashcards
									</p>
									<h4 className={`${styles.cardTitle} font-mono text-base font-bold uppercase tracking-normal`}>
										Save {entry.word}
									</h4>
								</div>
								<button
									type="button"
									onClick={onCancelSave}
									className={`${sourceLinkClassName} ${styles.sourceButton}`}
								>
									Close
								</button>
							</div>
							{cardSets.length > 0 ? (
								<>
									<label className={`${styles.saveField} ${styles.label} font-mono text-xs font-bold uppercase`}>
										Card Set
										<select
											value={selectedSetId}
											onChange={(event) =>
												onSelectedSetChange(event.target.value)
											}
											className={`${styles.select} text-base`}
										>
											{cardSets.map((set) => (
												<option key={set.id} value={set.id}>
													{set.title}
												</option>
											))}
										</select>
									</label>
									<div className={styles.definitionChoices}>
										{definitionOptions.map((definition) => (
											<label
												key={definition.id}
												className={styles.definitionChoice}
											>
												<input
													type="checkbox"
													checked={selectedDefinitionIds.includes(
														definition.id,
													)}
													onChange={() => onToggleDefinition(definition.id)}
												/>
												<span>
													<span className={`${styles.metaLabel} block font-mono text-xs font-bold uppercase`}>
														{definition.label}
													</span>
													<span>{definition.text}</span>
												</span>
											</label>
										))}
									</div>
									<div className={styles.saveActions}>
										<button
											type="button"
											onClick={() => onSave(entry)}
											disabled={isSaving}
											className={`${styles.button} font-mono text-sm font-bold uppercase`}
										>
											{isSaving ? "Saving" : "Save Card"}
										</button>
									</div>
								</>
							) : (
								<p className={styles.saveNote}>
									Create a card set in Flashcards first, then come back here to save definitions into it.
								</p>
							)}
						</>
					) : (
						<div>
							<p className={`${styles.eyebrow} font-mono text-xs uppercase`}>
								Flashcards
							</p>
							<p className={styles.saveNote}>
								Save lets you choose one or more meanings and turn this word into a flashcard. Log in first so the card can be saved to one of your sets.
							</p>
							<a href={loginPath} className={sourceLinkClassName}>
								Log In
							</a>
						</div>
					)}
					{saveMessage ? (
						<p className={`${styles.saveMessage} font-mono text-xs`}>
							{saveMessage}
						</p>
					) : null}
				</div>
			) : null}
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

function SourceLinks({
	urls,
	onSave,
}: {
	urls: string[];
	onSave?: () => void;
}) {
	if (urls.length === 0 && !onSave) {
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
			{onSave ? (
				<button
					type="button"
					onClick={onSave}
					className={`${sourceLinkClassName} ${styles.sourceButton}`}
				>
					Save
				</button>
			) : null}
		</div>
	);
}

function getDefinitionOptions(entry: DictionaryResult): DefinitionOption[] {
	return entry.meanings.flatMap((meaning, meaningIndex) =>
		meaning.definitions.map((definition, definitionIndex) => ({
			id: `${meaningIndex}-${definitionIndex}`,
			label: `${meaning.partOfSpeech} ${definitionIndex + 1}`,
			text: definition.text,
		})),
	);
}

function capitalizeFirstLetter(value: string) {
	return value.replace(/^(\s*)([a-z])/, (_match, prefix: string, letter: string) =>
		`${prefix}${letter.toUpperCase()}`,
	);
}
