"use client";

import { useEffect, useMemo, useState } from "react";

type DictionaryId = "scrabble" | "general";
type MatchMode = "perfect" | "all";

type DictionaryPayload = {
	id: DictionaryId;
	wordsByLength: Record<string, string[]>;
};

type WordEntry = {
	word: string;
	counts: Uint8Array;
};

type PreparedDictionary = {
	entriesByLength: Map<number, WordEntry[]>;
	maxLength: number;
};

type ResultGroup = {
	length: number;
	words: string[];
};

type PatternUnit = {
	kind: "bag" | "sequence";
	length: number;
	text?: string;
	counts?: Uint8Array;
	wildcards: number;
};

type ParsedPattern = {
	displayValue: string;
	freeCounts: Uint8Array;
	freeWildcards: number;
	requiredCounts: Uint8Array;
	requiredWildcards: number;
	totalLength: number;
	prefixUnits: PatternUnit[];
	suffixUnits: PatternUnit[];
	floatingUnits: PatternUnit[];
};

const dictionaryOptions: Array<{
	id: DictionaryId;
	label: string;
}> = [
	{ id: "scrabble", label: "Scrabble" },
	{ id: "general", label: "General" },
];

const matchOptions: Array<{
	id: MatchMode;
	label: string;
}> = [
	{ id: "perfect", label: "Perfect match" },
	{ id: "all", label: "All matches" },
];

const initialVisibleCount = 10;
const showMoreCount = 20;
const notationSections = [
	{
		label: "Plain letters",
		description:
			"Plain letters are loose tiles. They can appear anywhere unless you anchor them.",
		examples: [
			[
				"LISTEN",
				"matches LISTEN, SILENT, and INLETS in exact match mode",
			],
			[
				"TORE",
				"finds shorter matches from T, O, R, and E in all-matches mode",
			],
		],
	},
	{
		label: "?",
		description:
			"A question mark is one unknown letter. Add one ? for each unknown position.",
		examples: [
			["CAB??", "5-letter words using C, A, B, and any two letters"],
			["????", "any 4-letter word"],
			[
				"CAT^???",
				"6-letter words whose first three letters are an anagram of C, A, T",
			],
		],
	},
	{
		label: '"..."',
		description:
			"Quotes keep letters in the exact order shown. Quoted pieces must occupy their own letters and cannot overlap other quoted or grouped pieces.",
		examples: [
			['LEN"IST"', "matches ENLIST and LISTEN but not SILENT"],
			['"AP""LE"(?S)', "matches STAPLE with AP and LE in order"],
			['TS"?AP"', "matches STRAP but not TARPS or TAPS"],
		],
	},
	{
		label: "(...)",
		description:
			"Parentheses keep a group together, but the letters inside that group may be rearranged. A ? inside the group stays inside that contiguous group.",
		examples: [
			["S(CEH)A", "matches ACHES but not CHASE"],
			['"AP""LE"(?S)', "keeps the ?S group together, so APPLES is excluded"],
			["LNE(?ST)", "matches STOLEN but not SILENT"],
		],
	},
	{
		label: "^",
		description:
			"A caret anchors everything before it to the start of the word. It does not add extra length by itself.",
		examples: [
			["ER^????", "6-letter words starting with an anagram of ER"],
			['"PRE"^????', "7-letter words starting with PRE exactly"],
		],
	},
	{
		label: "$",
		description:
			"A dollar sign anchors everything after it to the end of the word. It also does not add extra length by itself.",
		examples: [
			[
				'NIC$"EST"',
				"6-letter words using NIC, then ending with EST exactly, such as NICEST and INCEST",
			],
			['???$"ING"', "6-letter words ending with ING"],
			["???$SET", "6-letter words ending with an anagram of SET"],
		],
	},
];

export function AnagramSolver() {
	const [letters, setLetters] = useState("");
	const [dictionaryId, setDictionaryId] = useState<DictionaryId>("scrabble");
	const [matchMode, setMatchMode] = useState<MatchMode>("perfect");
	const [isHelpOpen, setIsHelpOpen] = useState(false);
	const [dictionaries, setDictionaries] = useState<
		Partial<Record<DictionaryId, PreparedDictionary>>
	>({});
	const [loadingId, setLoadingId] = useState<DictionaryId | null>(null);
	const [loadError, setLoadError] = useState("");
	const [visibleByLength, setVisibleByLength] = useState<
		Record<number, number>
	>({});

	const parsedPattern = useMemo(() => parsePattern(letters), [letters]);
	const activeDictionary = dictionaries[dictionaryId];

	useEffect(() => {
		let cancelled = false;

		if (dictionaries[dictionaryId]) {
			return;
		}

		setLoadingId(dictionaryId);
		setLoadError("");

		fetch(`/anagram-dictionaries/${dictionaryId}.json`)
			.then((response) => {
				if (!response.ok) {
					throw new Error(
						`Could not load ${dictionaryId} dictionary.`,
					);
				}

				return response.json() as Promise<DictionaryPayload>;
			})
			.then((payload) => {
				if (cancelled) {
					return;
				}

				setDictionaries((current) => ({
					...current,
					[dictionaryId]: prepareDictionary(payload),
				}));
			})
			.catch((error: unknown) => {
				if (cancelled) {
					return;
				}

				setLoadError(
					error instanceof Error
						? error.message
						: "Could not load dictionary.",
				);
			})
			.finally(() => {
				if (!cancelled) {
					setLoadingId(null);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [dictionaryId, dictionaries]);

	useEffect(() => {
		setVisibleByLength({});
	}, [dictionaryId, matchMode, parsedPattern.displayValue]);

	const resultGroups = useMemo(() => {
		if (!activeDictionary || parsedPattern.totalLength === 0) {
			return [];
		}

		return findAnagrams(activeDictionary, parsedPattern, matchMode);
	}, [activeDictionary, matchMode, parsedPattern]);

	const hasTypedLetters = parsedPattern.totalLength > 0;
	const isLoading = loadingId === dictionaryId && !activeDictionary;
	const ignoredCharacterCount = Math.max(
		0,
		letters.length - parsedPattern.displayValue.length,
	);

	return (
		<section className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
			<div className="border-b-2 border-ink pb-5">
				<p className="font-mono text-xs uppercase text-rule">
					/tools/anagram-solver
				</p>
				<div className="mt-2 flex items-center justify-between gap-4">
					<h1 className="min-w-0 font-mono text-3xl font-bold uppercase tracking-normal text-ink sm:text-4xl">
						Anagram Solver
					</h1>
					<button
						type="button"
						aria-label="Show notation help"
						aria-expanded={isHelpOpen}
						onClick={() => setIsHelpOpen((current) => !current)}
						className="grid h-10 w-10 shrink-0 place-items-center border-2 border-ink bg-paperLight font-mono text-lg font-bold text-ink shadow-hard transition hover:-translate-y-0.5 hover:bg-brass"
					>
						i
					</button>
				</div>
			</div>

			{isHelpOpen ? (
				<div className="mt-5 border-2 border-ink bg-paperLight p-4 shadow-hard sm:p-5">
					<div className="flex items-start justify-between gap-4 border-b-2 border-ink pb-3">
						<div>
							<p className="font-mono text-xs uppercase text-rule">
								Notation
							</p>
							<h2 className="mt-1 font-mono text-xl font-bold uppercase tracking-normal text-ink">
								Pattern Reference
							</h2>
						</div>
						<button
							type="button"
							aria-label="Close notation help"
							onClick={() => setIsHelpOpen(false)}
							className="border-2 border-ink bg-paper px-3 py-2 font-mono text-xs font-bold uppercase text-ink transition hover:bg-brass"
						>
							Close
						</button>
					</div>
					<div className="mt-4 grid gap-4 sm:grid-cols-2">
						{notationSections.map((section) => (
							<section
								key={section.label}
								className="border-2 border-ink bg-paper p-3"
							>
								<h3 className="font-mono text-sm font-bold uppercase text-ink">
									{section.label}
								</h3>
								<p className="mt-2 text-sm leading-6 text-ink">
									{section.description}
								</p>
								<ul className="mt-3 space-y-2">
									{section.examples.map(
										([example, explanation]) => (
											<li
												key={example}
												className="grid gap-1 border-t border-rule pt-2 font-mono text-xs leading-5 text-rule"
											>
												<CodeChip>{example}</CodeChip>
												<span>{explanation}</span>
											</li>
										),
									)}
								</ul>
							</section>
						))}
					</div>
				</div>
			) : null}

			<div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
				<form className="border-2 border-ink bg-paperLight p-4 shadow-hard sm:p-5">
					<label
						htmlFor="letters"
						className="font-mono text-xs font-bold uppercase text-rule"
					>
						Letters
					</label>
					<textarea
						id="letters"
						value={letters}
						onChange={(event) => setLetters(event.target.value)}
						placeholder="Type letters here"
						rows={5}
						className="mt-2 block min-h-28 w-full resize-y border-2 border-ink bg-paper px-3 py-3 font-mono text-base uppercase tracking-normal text-ink outline-none focus:bg-brass sm:min-h-36 sm:text-lg"
					/>

					<div className="mt-5">
						<p className="font-mono text-xs font-bold uppercase text-rule">
							Dictionary
						</p>
						<div className="mt-2 grid grid-cols-2 border-2 border-ink">
							{dictionaryOptions.map((option) => (
								<button
									key={option.id}
									type="button"
									aria-pressed={dictionaryId === option.id}
									onClick={() => setDictionaryId(option.id)}
									className={[
										"px-3 py-3 font-mono text-xs font-bold uppercase text-ink transition sm:py-2 sm:text-sm",
										dictionaryId === option.id
											? "bg-soot text-paper"
											: "bg-paper hover:bg-brass",
									].join(" ")}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<div className="mt-5">
						<p className="font-mono text-xs font-bold uppercase text-rule">
							Match
						</p>
						<div className="mt-2 grid grid-cols-2 border-2 border-ink">
							{matchOptions.map((option) => (
								<button
									key={option.id}
									type="button"
									aria-pressed={matchMode === option.id}
									onClick={() => setMatchMode(option.id)}
									className={[
										"px-3 py-3 font-mono text-xs font-bold uppercase text-ink transition sm:py-2 sm:text-sm",
										matchMode === option.id
											? "bg-soot text-paper"
											: "bg-paper hover:bg-brass",
									].join(" ")}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<div className="mt-5 border-t-2 border-ink pt-4 font-mono text-xs uppercase leading-6 text-rule">
						<p>{parsedPattern.totalLength} pattern letters ready</p>
						{ignoredCharacterCount > 0 ? (
							<p>{ignoredCharacterCount} characters ignored</p>
						) : null}
					</div>
				</form>

				<div className="min-h-80 border-2 border-ink bg-paperLight p-4 shadow-hard sm:p-5">
					<div className="flex flex-col gap-3 border-b-2 border-ink pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
						<div className="min-w-0">
							<p className="font-mono text-xs uppercase text-rule">
								Results
							</p>
							<h2 className="mt-1 break-all font-mono text-xl font-bold uppercase tracking-normal text-ink sm:text-2xl">
								{hasTypedLetters
									? parsedPattern.displayValue.toUpperCase()
									: "Waiting"}
							</h2>
						</div>
						<p className="font-mono text-xs uppercase text-rule">
							{resultGroups.reduce(
								(total, group) => total + group.words.length,
								0,
							)}{" "}
							matches
						</p>
					</div>

					{isLoading ? (
						<EmptyState text="Loading dictionary..." />
					) : loadError ? (
						<EmptyState text={loadError} />
					) : !hasTypedLetters ? (
						<EmptyState text="Type some letters to begin." />
					) : resultGroups.length === 0 ? (
						<EmptyState text="No matches found." />
					) : (
						<div className="mt-5 space-y-6">
							{resultGroups.map((group) => {
								const visibleCount =
									visibleByLength[group.length] ??
									initialVisibleCount;
								const visibleWords = group.words.slice(
									0,
									visibleCount,
								);
								const hiddenCount =
									group.words.length - visibleWords.length;

								return (
									<section key={group.length}>
										<div className="flex items-baseline justify-between gap-4">
											<h3 className="font-mono text-sm font-bold uppercase text-ink">
												{group.length} letters
											</h3>
											<p className="font-mono text-xs uppercase text-rule">
												{group.words.length} found
											</p>
										</div>
										<ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
											{visibleWords.map((word) => (
												<li
													key={word}
													className="break-all border-2 border-ink bg-paper px-3 py-2 font-mono text-sm uppercase text-ink"
												>
													{word}
												</li>
											))}
										</ul>
										{hiddenCount > 0 ? (
											<button
												type="button"
												aria-label={`Show more ${group.length}-letter words`}
												onClick={() =>
													setVisibleByLength(
														(current) => ({
															...current,
															[group.length]:
																visibleWords.length +
																showMoreCount,
														}),
													)
												}
												className="mt-3 w-full border-2 border-ink bg-paper px-3 py-3 font-mono text-xs font-bold uppercase text-ink shadow-hard transition hover:-translate-y-0.5 hover:bg-brass sm:w-auto sm:py-2"
											>
												Show more
											</button>
										) : null}
									</section>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</section>
	);
}

function EmptyState({ text }: { text: string }) {
	return (
		<div className="flex min-h-56 items-center justify-center text-center font-mono text-sm uppercase text-rule">
			{text}
		</div>
	);
}

function CodeChip({ children }: { children: string }) {
	return (
		<code className="inline-block border border-ink bg-paper px-1 font-mono text-[0.8rem] leading-5 text-ink">
			{children}
		</code>
	);
}

function prepareDictionary(payload: DictionaryPayload): PreparedDictionary {
	const entriesByLength = new Map<number, WordEntry[]>();
	let maxLength = 0;

	for (const [lengthKey, words] of Object.entries(payload.wordsByLength)) {
		const length = Number(lengthKey);

		if (!Number.isFinite(length)) {
			continue;
		}

		entriesByLength.set(
			length,
			words.map((word) => ({
				word,
				counts: countLetters(word),
			})),
		);
		maxLength = Math.max(maxLength, length);
	}

	return { entriesByLength, maxLength };
}

function findAnagrams(
	dictionary: PreparedDictionary,
	pattern: ParsedPattern,
	matchMode: MatchMode,
): ResultGroup[] {
	const maxLength = Math.min(dictionary.maxLength, pattern.totalLength);
	const groups: ResultGroup[] = [];

	for (let length = maxLength; length >= 1; length -= 1) {
		if (matchMode === "perfect" && length !== pattern.totalLength) {
			continue;
		}

		const entries = dictionary.entriesByLength.get(length);

		if (!entries) {
			continue;
		}

		const words = entries
			.filter((entry) => matchesPattern(entry, pattern, matchMode))
			.map((entry) => entry.word);

		if (words.length > 0) {
			groups.push({ length, words });
		}
	}

	return groups;
}

function matchesPattern(
	entry: WordEntry,
	pattern: ParsedPattern,
	matchMode: MatchMode,
) {
	if (
		totalUnitLength(pattern.prefixUnits) +
			totalUnitLength(pattern.suffixUnits) >
		entry.word.length
	) {
		return false;
	}

	if (!matchesPlacedUnits(entry.word, pattern)) {
		return false;
	}

	const requiredLetters = copyCounts(pattern.requiredCounts);
	addCounts(requiredLetters, pattern.freeCounts);

	if (matchMode === "perfect") {
		return canMatchRequiredCounts(
			entry.counts,
			requiredLetters,
			pattern.requiredWildcards + pattern.freeWildcards,
		);
	}

	if (!containsRequiredCounts(entry.counts, pattern.requiredCounts)) {
		return false;
	}

	return canBuildFromAvailable(
		entry.counts,
		pattern.freeCounts,
		pattern.freeWildcards,
		pattern.requiredCounts,
		pattern.requiredWildcards,
	);
}

function parsePattern(value: string): ParsedPattern {
	const lowerValue = value.toLowerCase();
	const caretIndex = lowerValue.indexOf("^");
	const dollarIndex = lowerValue.indexOf("$");
	const hasCaret = caretIndex !== -1;
	const hasDollar = dollarIndex !== -1;
	const prefixSource = hasCaret ? lowerValue.slice(0, caretIndex) : "";
	const bodyStart = hasCaret ? caretIndex + 1 : 0;
	const bodyEnd =
		hasDollar && dollarIndex >= bodyStart ? dollarIndex : lowerValue.length;
	const bodySource = lowerValue.slice(bodyStart, bodyEnd);
	const suffixSource = hasDollar ? lowerValue.slice(dollarIndex + 1) : "";
	const prefixSegment = parseSegment(prefixSource, "anchored");
	const bodySegment = parseSegment(bodySource, "floating");
	const suffixSegment = parseSegment(suffixSource, "anchored");
	const requiredCounts = new Uint8Array(26);

	addUnitCounts(requiredCounts, prefixSegment.units);
	addUnitCounts(requiredCounts, bodySegment.units);
	addUnitCounts(requiredCounts, suffixSegment.units);

	return {
		displayValue: [
			prefixSegment.displayValue,
			hasCaret ? "^" : "",
			bodySegment.displayValue,
			hasDollar ? "$" : "",
			suffixSegment.displayValue,
		].join(""),
		freeCounts: bodySegment.freeCounts,
		freeWildcards: bodySegment.freeWildcards,
		requiredCounts,
		requiredWildcards:
			countUnitWildcards(prefixSegment.units) +
			countUnitWildcards(bodySegment.units) +
			countUnitWildcards(suffixSegment.units),
		totalLength:
			prefixSegment.totalLength +
			bodySegment.totalLength +
			suffixSegment.totalLength,
		prefixUnits: prefixSegment.units,
		suffixUnits: suffixSegment.units,
		floatingUnits: bodySegment.units,
	};
}

function parseSegment(source: string, mode: "anchored" | "floating") {
	const units: PatternUnit[] = [];
	const freeCounts = new Uint8Array(26);
	let freeWildcards = 0;
	let totalLength = 0;
	let displayValue = "";

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];

		if (character === '"') {
			const endIndex = source.indexOf('"', index + 1);
			const rawText = source.slice(
				index + 1,
				endIndex === -1 ? source.length : endIndex,
			);
			const unit = createSequenceUnit(rawText);

			if (unit) {
				units.push(unit);
				totalLength += unit.length;
				displayValue += `"${unit.text}"`;
			}

			index = endIndex === -1 ? source.length : endIndex;
			continue;
		}

		if (character === "(") {
			const endIndex = source.indexOf(")", index + 1);
			const rawText = source.slice(
				index + 1,
				endIndex === -1 ? source.length : endIndex,
			);
			const unit = createBagUnit(rawText);

			if (unit) {
				units.push(unit);
				totalLength += unit.length;
				displayValue += `(${unitToDisplayValue(unit)})`;
			}

			index = endIndex === -1 ? source.length : endIndex;
			continue;
		}

		if (isLetter(character) || character === "?") {
			let run = character;

			while (
				index + 1 < source.length &&
				(isLetter(source[index + 1]) || source[index + 1] === "?")
			) {
				index += 1;
				run += source[index];
			}

			const unit = createBagUnit(run);

			if (!unit) {
				continue;
			}

			totalLength += unit.length;
			displayValue += unitToDisplayValue(unit);

			if (mode === "anchored") {
				units.push(unit);
			} else {
				addCounts(freeCounts, unit.counts ?? new Uint8Array(26));
				freeWildcards += unit.wildcards;
			}
		}
	}

	return {
		displayValue,
		freeCounts,
		freeWildcards,
		totalLength,
		units,
	};
}

function createSequenceUnit(value: string): PatternUnit | null {
	const text = normalizePatternText(value);

	if (text.length === 0) {
		return null;
	}

	return {
		kind: "sequence",
		length: text.length,
		text,
		wildcards: countWildcards(text),
	};
}

function createBagUnit(value: string): PatternUnit | null {
	const text = normalizePatternText(value);

	if (text.length === 0) {
		return null;
	}

	return {
		kind: "bag",
		counts: countLetters(text),
		length: text.length,
		wildcards: countWildcards(text),
	};
}

function normalizePatternText(value: string) {
	return value
		.toLowerCase()
		.split("")
		.filter((character) => isLetter(character) || character === "?")
		.join("");
}

function unitToDisplayValue(unit: PatternUnit) {
	if (unit.kind === "sequence") {
		return unit.text ?? "";
	}

	const counts = unit.counts ?? new Uint8Array(26);
	let value = "";

	for (let index = 0; index < counts.length; index += 1) {
		value += String.fromCharCode(index + 97).repeat(counts[index]);
	}

	return `${value}${"?".repeat(unit.wildcards)}`;
}

function matchesPlacedUnits(word: string, pattern: ParsedPattern) {
	const occupied = Array.from({ length: word.length }, () => false);

	if (!placeAnchoredUnits(word, pattern.prefixUnits, 0, occupied)) {
		return false;
	}

	const suffixStart = word.length - totalUnitLength(pattern.suffixUnits);

	if (!placeAnchoredUnits(word, pattern.suffixUnits, suffixStart, occupied)) {
		return false;
	}

	return placeFloatingUnits(word, pattern.floatingUnits, occupied);
}

function placeAnchoredUnits(
	word: string,
	units: PatternUnit[],
	start: number,
	occupied: boolean[],
) {
	let cursor = start;

	for (const unit of units) {
		if (!canPlaceUnit(word, unit, cursor, occupied)) {
			return false;
		}

		markUnit(cursor, unit.length, occupied, true);
		cursor += unit.length;
	}

	return true;
}

function placeFloatingUnits(
	word: string,
	units: PatternUnit[],
	occupied: boolean[],
) {
	if (units.length === 0) {
		return true;
	}

	const sortedUnits = [...units].sort((a, b) => b.length - a.length);

	return placeFloatingUnitAtIndex(word, sortedUnits, occupied, 0);
}

function placeFloatingUnitAtIndex(
	word: string,
	units: PatternUnit[],
	occupied: boolean[],
	unitIndex: number,
) {
	if (unitIndex >= units.length) {
		return true;
	}

	const unit = units[unitIndex];

	for (let index = 0; index <= word.length - unit.length; index += 1) {
		if (!canPlaceUnit(word, unit, index, occupied)) {
			continue;
		}

		markUnit(index, unit.length, occupied, true);

		if (placeFloatingUnitAtIndex(word, units, occupied, unitIndex + 1)) {
			return true;
		}

		markUnit(index, unit.length, occupied, false);
	}

	return false;
}

function canPlaceUnit(
	word: string,
	unit: PatternUnit,
	start: number,
	occupied: boolean[],
) {
	if (start < 0 || start + unit.length > word.length) {
		return false;
	}

	for (let index = start; index < start + unit.length; index += 1) {
		if (occupied[index]) {
			return false;
		}
	}

	return matchesUnit(word.slice(start, start + unit.length), unit);
}

function markUnit(
	start: number,
	length: number,
	occupied: boolean[],
	isOccupied: boolean,
) {
	for (let index = start; index < start + length; index += 1) {
		occupied[index] = isOccupied;
	}
}

function matchesUnit(value: string, unit: PatternUnit) {
	if (value.length !== unit.length) {
		return false;
	}

	if (unit.kind === "sequence") {
		const text = unit.text ?? "";

		for (let index = 0; index < text.length; index += 1) {
			if (text[index] !== "?" && text[index] !== value[index]) {
				return false;
			}
		}

		return true;
	}

	return canMatchRequiredCounts(
		countLetters(value),
		unit.counts ?? new Uint8Array(26),
		unit.wildcards,
	);
}

function canMatchRequiredCounts(
	wordCounts: Uint8Array,
	requiredCounts: Uint8Array,
	wildcards: number,
) {
	let missingLetters = 0;

	for (let index = 0; index < wordCounts.length; index += 1) {
		if (requiredCounts[index] > wordCounts[index]) {
			return false;
		}

		missingLetters += wordCounts[index] - requiredCounts[index];
	}

	return missingLetters <= wildcards;
}

function containsRequiredCounts(
	wordCounts: Uint8Array,
	requiredCounts: Uint8Array,
) {
	for (let index = 0; index < wordCounts.length; index += 1) {
		if (requiredCounts[index] > wordCounts[index]) {
			return false;
		}
	}

	return true;
}

function canBuildFromAvailable(
	wordCounts: Uint8Array,
	freeCounts: Uint8Array,
	freeWildcards: number,
	requiredCounts: Uint8Array,
	requiredWildcards: number,
) {
	let wildcardBudget = freeWildcards + requiredWildcards;

	for (let index = 0; index < wordCounts.length; index += 1) {
		const required = requiredCounts[index];

		if (wordCounts[index] < required) {
			return false;
		}

		const optionalLetters = wordCounts[index] - required;
		const availableOptionalLetters = freeCounts[index];

		if (optionalLetters > availableOptionalLetters) {
			wildcardBudget -= optionalLetters - availableOptionalLetters;
		}
	}

	const requiredLength =
		sumCounts(requiredCounts) +
		requiredWildcards +
		sumCounts(freeCounts) +
		freeWildcards;

	return wildcardBudget >= 0 && sumCounts(wordCounts) <= requiredLength;
}

function addUnitCounts(counts: Uint8Array, units: PatternUnit[]) {
	for (const unit of units) {
		if (unit.counts) {
			addCounts(counts, unit.counts);
		}

		if (unit.kind === "sequence" && unit.text) {
			addCounts(counts, countLetters(unit.text));
		}
	}
}

function addCounts(target: Uint8Array, source: Uint8Array) {
	for (let index = 0; index < target.length; index += 1) {
		target[index] += source[index];
	}
}

function copyCounts(counts: Uint8Array) {
	const copy = new Uint8Array(26);
	addCounts(copy, counts);
	return copy;
}

function countUnitWildcards(units: PatternUnit[]) {
	return units.reduce((total, unit) => total + unit.wildcards, 0);
}

function countWildcards(value: string) {
	return value.split("").filter((character) => character === "?").length;
}

function totalUnitLength(units: PatternUnit[]) {
	return units.reduce((total, unit) => total + unit.length, 0);
}

function sumCounts(counts: Uint8Array) {
	return counts.reduce((total, count) => total + count, 0);
}

function isLetter(character: string) {
	return character >= "a" && character <= "z";
}

function countLetters(value: string) {
	const counts = new Uint8Array(26);

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];

		if (isLetter(character)) {
			counts[value.charCodeAt(index) - 97] += 1;
		}
	}

	return counts;
}
