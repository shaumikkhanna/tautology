"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ConnectionsPuzzle,
  decodePuzzle,
  encodePuzzle,
  extractGameCode,
  normalizeAllowedText,
  UNLIMITED_MISTAKES,
} from "./connectionsEncoding";
import styles from "./connections.module.css";

type ConnectionsGameProps = {
  initialCode?: string;
};

type Cell = {
  word: string;
  category: number;
};

type SolvedGroup = {
  category: number;
  words: string[];
};

type View = "home" | "create" | "play";

const CATEGORY_COLORS = ["yellow", "green", "blue", "purple"] as const;
const CATEGORY_BACKGROUNDS = [
  "rgb(249, 223, 109)",
  "rgb(160, 195, 90)",
  "rgb(176, 196, 239)",
  "rgb(187, 129, 197)",
];
const CATEGORY_LABELS = ["Yellow", "Green", "Blue", "Purple"];
const MISTAKE_OPTIONS = Array.from({ length: 8 }, (_, index) => index + 1);
const CONNECTIONS_PLAY_PATH = "/play/games/connections";
const SHAKE_DURATION_MS = 260;
const EMPTY_CELLS = Array.from({ length: 16 }, (_, index) => ({
  word: "",
  category: index % 4,
}));

export function ConnectionsGame({ initialCode }: ConnectionsGameProps) {
  const searchParams = useSearchParams();
  const queryCode = searchParams.get("gamecode") ?? searchParams.get("code") ?? "";
  const requestedCode = initialCode ?? queryCode;
  const [view, setView] = useState<View>(requestedCode ? "play" : "home");

  return (
    <main className={styles.page}>
      <HomeLink />
      {view === "home" ? <StartScreen onCreate={() => setView("create")} /> : null}
      {view === "create" ? <CreateScreen onBack={() => setView("home")} /> : null}
      {view === "play" ? (
        <PlayScreen
          code={requestedCode}
          onBack={() => {
            if (requestedCode) {
              window.location.href = CONNECTIONS_PLAY_PATH;
            } else {
              setView("home");
            }
          }}
        />
      ) : null}
    </main>
  );
}

function StartScreen({
  onCreate,
}: {
  onCreate: () => void;
}) {
  const [input, setInput] = useState("");
  const [message, setMessage] = useState("");

  function submitPlay() {
    const code = extractGameCode(input);
    if (!code) {
      setMessage("Paste a game link or code.");
      return;
    }

    window.location.href = `${CONNECTIONS_PLAY_PATH}/play/${encodeURIComponent(code)}`;
  }

  return (
    <section className={styles.panel}>
      <h1>Connections</h1>
      <div className={styles.homeActions}>
        <button type="button" onClick={onCreate}>
          Create a Game
        </button>
        <label>
          <span>Game link or code</span>
          <input
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setMessage("");
            }}
            placeholder="Paste link"
          />
        </label>
        <button type="button" onClick={submitPlay}>
          Play Game
        </button>
      </div>
      {message ? <p className={styles.message}>{message}</p> : null}
    </section>
  );
}

function CreateScreen({ onBack }: { onBack: () => void }) {
  const [puzzleName, setPuzzleName] = useState("");
  const [puzzleDescription, setPuzzleDescription] = useState("");
  const [mistakesAllowed, setMistakesAllowed] = useState(UNLIMITED_MISTAKES);
  const [allowHints, setAllowHints] = useState(true);
  const [cells, setCells] = useState<Cell[]>(EMPTY_CELLS);
  const [categories, setCategories] = useState(["", "", "", ""]);
  const [shareLink, setShareLink] = useState("");
  const [message, setMessage] = useState("");

  function updateCell(index: number, patch: Partial<Cell>) {
    setCells((current) => current.map((cell, cellIndex) => (cellIndex === index ? { ...cell, ...patch } : cell)));
    setShareLink("");
  }

  function submitGame() {
    const validationMessage = validatePuzzleDraft(cells, categories);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    try {
      const puzzle = buildPuzzleDraft({
        allowHints,
        categories,
        cells,
        mistakesAllowed,
        puzzleDescription,
        puzzleName,
      });
      const code = encodePuzzle(puzzle);
      setShareLink(`${window.location.origin}${CONNECTIONS_PLAY_PATH}/play/${code}`);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not encode this puzzle.");
    }
  }

  return (
    <section className={styles.createPanel}>
      <header className={styles.screenHeader}>
        <div>
          <p>Create</p>
          <h1>Connections</h1>
        </div>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </header>

      <div className={styles.settingsGrid}>
        <label>
          <span>Puzzle name</span>
          <input value={puzzleName} onChange={(event) => setPuzzleName(normalizeAllowedText(event.target.value))} />
        </label>
        <label>
          <span>Description</span>
          <textarea
            value={puzzleDescription}
            onChange={(event) => setPuzzleDescription(normalizeAllowedText(event.target.value))}
          />
        </label>
        <label>
          <span>Mistakes</span>
          <select value={mistakesAllowed} onChange={(event) => setMistakesAllowed(Number(event.target.value))}>
            <option value={UNLIMITED_MISTAKES}>Unlimited</option>
            {MISTAKE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={allowHints} onChange={(event) => setAllowHints(event.target.checked)} />
          <span>Show one away</span>
        </label>
      </div>

      <div className={styles.categoryInputs}>
        {CATEGORY_LABELS.map((label, index) => (
          <label key={label} className={styles[CATEGORY_COLORS[index]]}>
            <span>{label} category</span>
            <input
              value={categories[index]}
              onChange={(event) => {
                setCategories((current) =>
                  current.map((category, categoryIndex) =>
                    categoryIndex === index ? normalizeAllowedText(event.target.value) : category,
                  ),
                );
                setShareLink("");
              }}
            />
          </label>
        ))}
      </div>

      <div className={styles.createGrid}>
        {cells.map((cell, index) => (
          <div key={index} className={styles.createCell}>
            <input
              value={cell.word}
              onChange={(event) => updateCell(index, { word: normalizeAllowedText(event.target.value) })}
              placeholder={`Word ${index + 1}`}
              style={{ backgroundColor: categoryBackground(cell.category) }}
            />
            <button
              type="button"
              aria-label="Change category"
              className={styles.colorToggle}
              style={{ backgroundColor: categoryBackground(cell.category) }}
              onClick={() => updateCell(index, { category: (cell.category + 1) % 4 })}
            />
          </div>
        ))}
      </div>

      <button type="button" className={styles.primaryAction} onClick={submitGame}>
        Create
      </button>
      {message ? <p className={styles.message}>{message}</p> : null}
      {shareLink ? (
        <div className={styles.shareBox}>
          <p>Game URL</p>
          <a href={shareLink}>{shareLink}</a>
        </div>
      ) : null}
    </section>
  );
}

function PlayScreen({ code, onBack }: { code: string; onBack: () => void }) {
  const decoded = useMemo(() => {
    try {
      return {
        puzzle: decodePuzzle(extractGameCode(code)),
        error: "",
      };
    } catch (decodeError) {
      return {
        puzzle: null,
        error: decodeError instanceof Error ? decodeError.message : "Could not read this puzzle code.",
      };
    }
  }, [code]);
  const puzzle = decoded.puzzle;
  const [remaining, setRemaining] = useState<ConnectionsPuzzle["puzzle"]>([]);
  const [solved, setSolved] = useState<SolvedGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [lives, setLives] = useState(UNLIMITED_MISTAKES);
  const [message, setMessage] = useState("");
  const [isOneAway, setIsOneAway] = useState(false);
  const [shakingWords, setShakingWords] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (!puzzle) {
      return;
    }

    setRemaining(shuffle(puzzle.puzzle));
    setSolved([]);
    setSelected([]);
    setLives(puzzle.mistakesAllowed);
    setMessage("");
    setIsOneAway(false);
    setShakingWords([]);
    setGameOver(false);
  }, [puzzle]);

  if (!puzzle) {
    return (
      <section className={styles.panel}>
        <h1>Connections</h1>
        <p className={styles.message}>{decoded.error}</p>
        <button type="button" onClick={onBack}>
          Back
        </button>
      </section>
    );
  }

  const activePuzzle = puzzle;

  function toggleWord(word: string) {
    if (gameOver) {
      return;
    }

    setSelected((current) => {
      if (current.includes(word)) {
        return current.filter((item) => item !== word);
      }

      if (current.length === 4) {
        setMessage("You can only select four words.");
        return current;
      }

      setMessage("");
      setIsOneAway(false);
      return [...current, word];
    });
  }

  function submitSelection() {
    if (selected.length !== 4) {
      setMessage("Select exactly four words.");
      setIsOneAway(false);
      return;
    }

    const selectedItems = remaining.filter((item) => selected.includes(item.word));
    const category = selectedItems[0]?.category;
    const allSame = selectedItems.every((item) => item.category === category);

    if (allSame && category !== undefined) {
      setSolved((current) => [...current, { category, words: selectedItems.map((item) => item.word) }]);
      setRemaining((current) => current.filter((item) => !selected.includes(item.word)));
      setSelected([]);
      setMessage("");
      setIsOneAway(false);

      if (solved.length === 3) {
        setGameOver(true);
        setMessage("Congratulations, you win.");
      }
      return;
    }

    const counts = selectedItems.reduce<Record<number, number>>((accumulator, item) => {
      accumulator[item.category] = (accumulator[item.category] ?? 0) + 1;
      return accumulator;
    }, {});
    const nextLives = lives === UNLIMITED_MISTAKES ? UNLIMITED_MISTAKES : lives - 1;
    setLives(nextLives);
    setShakingWords(selected);
    window.setTimeout(() => setShakingWords([]), SHAKE_DURATION_MS);

    if (nextLives <= 0) {
      revealAnswers();
      setMessage("Nice try.");
      setIsOneAway(false);
    } else if (activePuzzle.allowHints && Object.values(counts).some((count) => count === 3)) {
      setMessage("One away...");
      setIsOneAway(true);
    } else {
      setMessage("Try again.");
      setIsOneAway(false);
    }
  }

  function revealAnswers() {
    const groups = CATEGORY_COLORS.map((_, category) => ({
      category,
      words: activePuzzle.puzzle.filter((item) => item.category === category).map((item) => item.word),
    }));
    setSolved(groups);
    setRemaining([]);
    setSelected([]);
    setIsOneAway(false);
    setShakingWords([]);
    setGameOver(true);
  }

  return (
    <section className={styles.playPanel}>
      <header className={styles.playHeader}>
        <button type="button" onClick={onBack}>
          Back
        </button>
        <div className={styles.playIntro}>
          <h1>{activePuzzle.puzzleName}</h1>
          {activePuzzle.puzzleDescription ? <p>{activePuzzle.puzzleDescription}</p> : null}
        </div>
      </header>

      <div className={styles.solvedGroups}>
        {solved.map((group) => (
          <div key={group.category} className={styles.solvedGroup} style={{ backgroundColor: categoryBackground(group.category) }}>
            <h2>{activePuzzle.categories[group.category]}</h2>
            <p>{group.words.join(", ")}</p>
          </div>
        ))}
      </div>

      <div className={styles.playGrid}>
        {remaining.map((item) => (
          <button
            key={item.word}
            type="button"
            className={classNames([
              selected.includes(item.word) ? styles.selectedTile : undefined,
              shakingWords.includes(item.word) ? styles.shakeTile : undefined,
            ])}
            onClick={() => toggleWord(item.word)}
          >
            {item.word}
          </button>
        ))}
      </div>

      <div className={styles.lives}>{lives === UNLIMITED_MISTAKES ? "" : `Mistakes left: ${Math.max(0, lives)}`}</div>
      {message ? <p className={isOneAway ? styles.oneAwayMessage : styles.message}>{message}</p> : null}
      <div className={styles.buttonRow}>
        <button type="button" onClick={submitSelection} disabled={gameOver}>
          Submit
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected([]);
            setIsOneAway(false);
            setShakingWords([]);
            setMessage("");
          }}
          disabled={gameOver}
        >
          Deselect All
        </button>
        <button type="button" onClick={() => setRemaining((current) => shuffle(current))} disabled={gameOver}>
          Shuffle
        </button>
        <button type="button" onClick={revealAnswers}>
          Reveal
        </button>
      </div>
    </section>
  );
}

function HomeLink() {
  return (
    <a className={styles.homeLink} href="/" aria-label="Tautology home">
      P or not P
    </a>
  );
}

function categoryBackground(category: number) {
  return CATEGORY_BACKGROUNDS[category];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function validatePuzzleDraft(cells: Cell[], categories: string[]) {
  const words = cells.map((cell) => cell.word.trim()).filter(Boolean);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const categoryCounts = CATEGORY_COLORS.map((_, category) => cells.filter((cell) => cell.category === category).length);

  if (words.length !== 16) {
    return "Fill in all sixteen words.";
  }

  if (uniqueWords.size !== 16) {
    return "All words must be unique.";
  }

  if (!categoryCounts.every((count) => count === 4)) {
    return "Each category must have exactly four words.";
  }

  if (categories.some((category) => !category.trim())) {
    return "Fill in all four category names.";
  }

  return "";
}

function buildPuzzleDraft({
  allowHints,
  categories,
  cells,
  mistakesAllowed,
  puzzleDescription,
  puzzleName,
}: {
  allowHints: boolean;
  categories: string[];
  cells: Cell[];
  mistakesAllowed: number;
  puzzleDescription: string;
  puzzleName: string;
}): ConnectionsPuzzle {
  return {
    puzzleName: puzzleName.trim() || "CONNECTIONS",
    puzzleDescription: puzzleDescription.trim(),
    mistakesAllowed,
    allowHints,
    puzzle: cells.map((cell) => ({ word: cell.word.trim(), category: cell.category })),
    categories: Object.fromEntries(categories.map((category, index) => [index, category.trim()])),
  };
}

function classNames(classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}
