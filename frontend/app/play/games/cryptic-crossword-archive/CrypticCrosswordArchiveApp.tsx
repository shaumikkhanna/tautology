"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type {
  CrosswordClue,
  CrosswordDirection,
  CrosswordProgressPayload,
  CrosswordPuzzle,
  CrosswordSummary,
} from "@/lib/crosswords/types";
import {
  calculateCrosswordStats,
  emptyCrosswordStats,
  type CrosswordStats,
} from "@/lib/crosswords/stats";
import styles from "./crypticCrossword.module.css";

type ProgressRow = {
  crossword_id: string;
  grid_state: Record<string, string>;
  elapsed_seconds: number;
  checked_count: number;
  revealed_count: number;
  completed_at: string | null;
  perfect: boolean;
};

const devProgressStorageKey = "tautology.crosswords.devProgress";
const isDevelopmentMode = process.env.NODE_ENV !== "production";
const keyboardRows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export function CrypticCrosswordArchiveApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const checkedAccessUserIdRef = useRef<string | null>(null);
  const redeemedInviteRef = useRef("");
  const skipNextAutosaveRef = useRef(false);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [authMessage, setAuthMessage] = useState("Checking account...");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [isDevBypass, setIsDevBypass] = useState(false);
  const [canUseLocalDevBypass, setCanUseLocalDevBypass] = useState(false);
  const [isAccessLoading, setIsAccessLoading] = useState(true);
  const [archive, setArchive] = useState<CrosswordSummary[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);
  const [stats, setStats] = useState<CrosswordStats>(emptyCrosswordStats);
  const [puzzle, setPuzzle] = useState<CrosswordPuzzle | null>(null);
  const [gridState, setGridState] = useState<Record<string, string>>({});
  const [checkedWrongKeys, setCheckedWrongKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedKey, setSelectedKey] = useState("");
  const [activeDirection, setActiveDirection] =
    useState<CrosswordDirection>("across");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [checkedCount, setCheckedCount] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCanUseLocalDevBypass(isLocalBrowserHost());

    const code = new URLSearchParams(window.location.search).get("invite");

    if (code) {
      setInviteCode(code);
      setAuthMessage("Invite detected. Sign up or log in to unlock access.");
    }
  }, []);

  const redeemInviteIfPresent = useCallback(
    async (nextSession: Session) => {
      if (!inviteCode || redeemedInviteRef.current === inviteCode) {
        return;
      }

      setAuthMessage("Redeeming invite...");

      const response = await fetchWithSession(
        nextSession,
        "/api/games/crosswords/invites/redeem",
        {
          method: "POST",
          body: JSON.stringify({ code: inviteCode }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setAuthMessage(payload?.error ?? "Could not redeem invite.");
        return;
      }

      redeemedInviteRef.current = inviteCode;
      setInviteCode("");
      window.history.replaceState(
        null,
        "",
        "/play/games/cryptic-crossword-archive",
      );
      setAuthMessage("Invite accepted.");
    },
    [inviteCode],
  );

  const loadDevData = useCallback(async () => {
    setIsAccessLoading(true);
    setIsDevBypass(true);
    setIsApproved(true);
    setStatusMessage("");

    const archiveResponse = await fetch("/api/games/crosswords/archive", {
      headers: getDevBypassHeaders(),
    });

    if (!archiveResponse.ok) {
      setStatusMessage("Could not load the local crossword archive.");
      setIsAccessLoading(false);
      return;
    }

    const archivePayload = (await archiveResponse.json()) as {
      crosswords?: CrosswordSummary[];
    };
    const progress = readDevProgress();

    setArchive(archivePayload.crosswords ?? []);
    setProgressRows(progress);
    setStats(calculateCrosswordStats(progress));
    setAuthMessage("Local dev archive open.");
    setIsAccessLoading(false);
  }, []);

  const loadProtectedData = useCallback(
    async (nextSession: Session) => {
      setIsAccessLoading(true);
      setStatusMessage("");

      const accessResponse = await fetchWithSession(
        nextSession,
        "/api/games/crosswords/access",
      );

      if (!accessResponse.ok) {
        setIsApproved(false);
        setAuthMessage("Could not check crossword access.");
        setIsAccessLoading(false);
        return;
      }

      const accessPayload = (await accessResponse.json()) as {
        approved?: boolean;
      };
      const approved = Boolean(accessPayload.approved);
      checkedAccessUserIdRef.current = nextSession.user.id;
      setIsApproved(approved);

      if (!approved) {
        setAuthMessage("Crossword access is pending approval.");
        setArchive([]);
        setProgressRows([]);
        setStats(emptyCrosswordStats);
        setIsAccessLoading(false);
        return;
      }

      const [archiveResponse, progressResponse] = await Promise.all([
        fetchWithSession(nextSession, "/api/games/crosswords/archive"),
        fetchWithSession(nextSession, "/api/games/crosswords/progress"),
      ]);

      if (!archiveResponse.ok || !progressResponse.ok) {
        setStatusMessage("Could not load the crossword archive.");
        setIsAccessLoading(false);
        return;
      }

      const archivePayload = (await archiveResponse.json()) as {
        crosswords?: CrosswordSummary[];
      };
      const progressPayload = (await progressResponse.json()) as {
        progress?: ProgressRow[];
        stats?: CrosswordStats;
      };

      setArchive(archivePayload.crosswords ?? []);
      setProgressRows(progressPayload.progress ?? []);
      setStats(progressPayload.stats ?? emptyCrosswordStats);
      setAuthMessage("Signed in and approved.");
      setIsAccessLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (!supabase) {
      setAuthMessage(
        isDevelopmentMode
          ? "Supabase auth is not configured."
          : "Add the Supabase publishable key to enable auth.",
      );
      setIsAccessLoading(false);
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      if (data.session) {
        await redeemInviteIfPresent(data.session);
        loadProtectedData(data.session);
      } else {
        setAuthMessage("Sign up or log in to request access.");
        setIsAccessLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        const nextUserId = nextSession?.user.id ?? null;
        const alreadyCheckedSameUser =
          Boolean(nextUserId) && checkedAccessUserIdRef.current === nextUserId;

        setSession(nextSession);

        if (alreadyCheckedSameUser) {
          return;
        }

        setPuzzle(null);

        if (nextSession) {
          redeemInviteIfPresent(nextSession).then(() => {
            loadProtectedData(nextSession);
          });
        } else {
          checkedAccessUserIdRef.current = null;
          setIsApproved(false);
          setIsDevBypass(false);
          setArchive([]);
          setProgressRows([]);
          setStats(emptyCrosswordStats);
          setAuthMessage("Sign up or log in to request access.");
          setIsAccessLoading(false);
        }
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProtectedData, redeemInviteIfPresent, supabase]);

  const progressByCrossword = useMemo(() => {
    return new Map(progressRows.map((row) => [row.crossword_id, row]));
  }, [progressRows]);

  const puzzleModel = useMemo(() => {
    return puzzle ? buildPuzzleModel(puzzle) : null;
  }, [puzzle]);

  const selectedCell = selectedKey ? parseKey(selectedKey) : null;
  const activeClue = useMemo(() => {
    if (!puzzleModel || !selectedCell) {
      return null;
    }

    return findClueForCell(puzzleModel, selectedCell, activeDirection);
  }, [activeDirection, puzzleModel, selectedCell]);
  const activeEntryKeys = useMemo(() => {
    if (!activeClue || !puzzleModel) {
      return new Set<string>();
    }

    return new Set(getClueKeys(activeClue));
  }, [activeClue, puzzleModel]);
  const saveTick = Math.floor(elapsedSeconds / 15);

  useEffect(() => {
    if (!puzzle || completedAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [completedAt, puzzle]);

  useEffect(() => {
    if (!puzzle || completedAt || !puzzleModel) {
      return;
    }

    if (!isGridComplete(gridState, puzzleModel.solutionByKey)) {
      return;
    }

    const solvedAt = new Date().toISOString();
    setCompletedAt(solvedAt);
    setStatusMessage("Solved. Reasonings unlocked.");
  }, [completedAt, gridState, puzzle, puzzleModel]);

  useEffect(() => {
    if (!puzzle || !isApproved || (!session && !isDevBypass)) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      if (skipNextAutosaveRef.current) {
        skipNextAutosaveRef.current = false;
        return;
      }

      const payload = {
        crosswordId: puzzle.id,
        gridState,
        elapsedSeconds,
        checkedCount,
        revealedCount,
        completedAt,
        perfect: Boolean(completedAt) && checkedCount === 0 && revealedCount === 0,
      };

      if (isDevBypass) {
        const progress = saveDevProgress(payload);
        setProgressRows((current) => {
          const next = [
            progress,
            ...current.filter(
              (item) => item.crossword_id !== progress.crossword_id,
            ),
          ];
          setStats(calculateCrosswordStats(next));
          return next;
        });
        return;
      }

      if (!session) {
        return;
      }

      setIsSaving(true);
      saveProgress(session, puzzle.id, payload)
        .then((progress) => {
          if (cancelled || !progress) {
            return;
          }

          setProgressRows((current) => {
            const next = [
              progress,
              ...current.filter(
                (item) => item.crossword_id !== progress.crossword_id,
              ),
            ];
            setStats(calculateCrosswordStats(next));
            return next;
          });
        })
        .finally(() => {
          if (!cancelled) {
            setIsSaving(false);
          }
        });
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    checkedCount,
    completedAt,
    gridState,
    isApproved,
    isDevBypass,
    puzzle,
    revealedCount,
    saveTick,
    session,
  ]);

  async function signUp() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured yet.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Creating account...");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/play/games/cryptic-crossword-archive${
          inviteCode ? `?invite=${encodeURIComponent(inviteCode)}` : ""
        }`,
      },
    });

    setAuthMessage(
      error
        ? error.message
        : "Check your email, then ask to be approved for crosswords.",
    );
    setIsAuthLoading(false);
  }

  async function logIn() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured yet.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Logging in...");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setAuthMessage(error.message);
    } else {
      setEmail("");
      setPassword("");
    }

    setIsAuthLoading(false);
  }

  async function logOut() {
    if (!supabase) {
      return;
    }

    setIsAuthLoading(true);
    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthMessage(error.message);
      setIsAuthLoading(false);
      return;
    }

    setSession(null);
    setIsApproved(false);
    setIsDevBypass(false);
    setIsAccessLoading(false);
    setArchive([]);
    setProgressRows([]);
    setStats(emptyCrosswordStats);
    checkedAccessUserIdRef.current = null;
    setPuzzle(null);
    setGridState({});
    setCompletedAt(null);
    setAuthMessage("Signed out.");
    setIsAuthLoading(false);
  }

  async function openPuzzle(crosswordId: string) {
    if (!session && !isDevBypass) {
      return;
    }

    setStatusMessage("Loading crossword...");

    const response = isDevBypass
      ? await fetch(`/api/games/crosswords/archive/${crosswordId}`, {
          headers: getDevBypassHeaders(),
        })
      : await fetchWithSession(
          session as Session,
          `/api/games/crosswords/archive/${crosswordId}`,
        );

    if (!response.ok) {
      setStatusMessage("Could not load this crossword.");
      return;
    }

    const payload = (await response.json()) as { crossword?: CrosswordPuzzle };
    const nextPuzzle = payload.crossword;

    if (!nextPuzzle) {
      setStatusMessage("Crossword was not found.");
      return;
    }

    const progress = progressByCrossword.get(crosswordId);
    const firstCell = findFirstOpenCell(nextPuzzle);

    setPuzzle(nextPuzzle);
    setGridState(progress?.grid_state ?? {});
    setCheckedWrongKeys(new Set());
    setElapsedSeconds(progress?.elapsed_seconds ?? 0);
    setCheckedCount(progress?.checked_count ?? 0);
    setRevealedCount(progress?.revealed_count ?? 0);
    setCompletedAt(progress?.completed_at ?? null);
    setSelectedKey(firstCell ? keyFor(firstCell.row, firstCell.col) : "");
    setActiveDirection("across");
    setStatusMessage("");
  }

  function setLetter(letter: string) {
    if (!puzzle || completedAt || !selectedCell || !puzzleModel) {
      return;
    }

    setGridState((current) => ({
      ...current,
      [selectedKey]: letter,
    }));
    clearCheckedWrongKeys([selectedKey]);

    moveWithinEntry(1);
  }

  function clearLetter() {
    if (!selectedKey) {
      return;
    }

    setGridState((current) => {
      const next = { ...current };
      delete next[selectedKey];
      return next;
    });
    clearCheckedWrongKeys([selectedKey]);
  }

  function clearCheckedWrongKeys(keys: string[]) {
    setCheckedWrongKeys((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.delete(key));
      return next;
    });
  }

  function updateCheckedWrongKeys(checkedKeys: string[], wrongKeys: string[]) {
    setCheckedWrongKeys((current) => {
      const next = new Set(current);
      checkedKeys.forEach((key) => next.delete(key));
      wrongKeys.forEach((key) => next.add(key));
      return next;
    });
  }

  function moveWithinEntry(delta: number) {
    if (!activeClue || !selectedKey) {
      return;
    }

    const keys = getClueKeys(activeClue);
    const index = keys.indexOf(selectedKey);
    const nextKey = keys[index + delta];

    if (nextKey) {
      setSelectedKey(nextKey);
    }
  }

  function handleGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!puzzle || !selectedCell || !puzzleModel) {
      return;
    }

    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      setLetter(event.key.toUpperCase());
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      if (gridState[selectedKey]) {
        clearLetter();
      } else {
        moveWithinEntry(-1);
      }
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      toggleActiveDirection();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      selectAdjacentClue(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveDirection("across");
      moveByDelta(0, event.key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveDirection("down");
      moveByDelta(event.key === "ArrowDown" ? 1 : -1, 0);
    }
  }

  function toggleActiveDirection() {
    setActiveDirection((direction) =>
      direction === "across" ? "down" : "across",
    );
  }

  function selectAdjacentClue(delta: number) {
    if (!puzzle) {
      return;
    }

    const clues = [...puzzle.clues.across, ...puzzle.clues.down];
    if (clues.length === 0) {
      return;
    }

    const currentIndex = activeClue
      ? clues.findIndex((clue) => clue.id === activeClue.id)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? delta > 0
          ? 0
          : clues.length - 1
        : (currentIndex + delta + clues.length) % clues.length;

    selectClue(clues[nextIndex]);
  }

  function moveByDelta(rowDelta: number, colDelta: number) {
    if (!puzzle || !puzzleModel || !selectedCell) {
      return;
    }

    let previous = selectedCell;
    let row = previous.row + rowDelta;
    let col = previous.col + colDelta;

    while (row >= 0 && row < puzzle.rows && col >= 0 && col < puzzle.cols) {
      if (
        hasDividerBetween(
          keyFor(previous.row, previous.col),
          keyFor(row, col),
          puzzleModel.dividerKeys,
        )
      ) {
        return;
      }

      const key = keyFor(row, col);
      if (puzzleModel.openKeys.has(key)) {
        setSelectedKey(key);
        return;
      }

      previous = { row, col };
      row += rowDelta;
      col += colDelta;
    }
  }

  function selectCell(row: number, col: number) {
    const key = keyFor(row, col);
    if (!puzzleModel?.openKeys.has(key)) {
      return;
    }

    if (selectedKey === key) {
      setActiveDirection((direction) =>
        direction === "across" ? "down" : "across",
      );
    } else {
      setSelectedKey(key);
    }
  }

  function selectClue(clue: CrosswordClue) {
    setActiveDirection(clue.direction);
    setSelectedKey(keyFor(clue.start.row, clue.start.col));
  }

  function checkLetter() {
    if (completedAt || !selectedKey || !puzzleModel) {
      return;
    }

    setCheckedCount((count) => count + 1);
    const isCorrect =
      gridState[selectedKey] === puzzleModel.solutionByKey.get(selectedKey);
    updateCheckedWrongKeys([selectedKey], isCorrect ? [] : [selectedKey]);
    setStatusMessage(isCorrect ? "Letter is correct." : "Letter is not correct yet.");
  }

  function revealLetter() {
    if (completedAt || !selectedKey || !puzzleModel) {
      return;
    }

    const answer = puzzleModel.solutionByKey.get(selectedKey);
    if (!answer) {
      return;
    }

    setGridState((current) => ({ ...current, [selectedKey]: answer }));
    clearCheckedWrongKeys([selectedKey]);
    setRevealedCount((count) => count + 1);
    setStatusMessage("Letter revealed.");
  }

  function checkWord() {
    if (completedAt || !activeClue || !puzzleModel) {
      return;
    }

    setCheckedCount((count) => count + 1);
    const keys = getClueKeys(activeClue);
    const wrongKeys = getWrongFilledKeys(
      keys,
      gridState,
      puzzleModel.solutionByKey,
    );
    const correct = wrongKeys.length === 0 && keys.every((key) => gridState[key]);
    updateCheckedWrongKeys(keys, wrongKeys);
    setStatusMessage(correct ? "Word is correct." : "Word is not correct yet.");
  }

  function revealWord() {
    if (completedAt || !activeClue || !puzzleModel) {
      return;
    }

    setGridState((current) => ({
      ...current,
      ...Object.fromEntries(
        getClueKeys(activeClue).map((key) => [
          key,
          puzzleModel.solutionByKey.get(key) ?? "",
        ]),
      ),
    }));
    clearCheckedWrongKeys(getClueKeys(activeClue));
    setRevealedCount((count) => count + 1);
    setStatusMessage("Word revealed.");
  }

  function checkGrid() {
    if (completedAt || !puzzleModel) {
      return;
    }

    setCheckedCount((count) => count + 1);
    const keys = Array.from(puzzleModel.solutionByKey.keys());
    const wrongKeys = getWrongFilledKeys(
      keys,
      gridState,
      puzzleModel.solutionByKey,
    );
    const correct = isGridComplete(gridState, puzzleModel.solutionByKey);
    updateCheckedWrongKeys(keys, wrongKeys);
    setStatusMessage(
      correct ? "Grid is correct." : "Grid is not correct yet.",
    );
  }

  function revealGrid() {
    if (completedAt || !puzzleModel) {
      return;
    }

    setGridState(Object.fromEntries(puzzleModel.solutionByKey));
    setCheckedWrongKeys(new Set());
    setRevealedCount((count) => count + 1);
    setCompletedAt(new Date().toISOString());
    setStatusMessage("Grid revealed. Reasonings unlocked.");
  }

  async function resetPuzzle() {
    if (!puzzle || (!session && !isDevBypass)) {
      return;
    }

    const confirmed = window.confirm(
      "Reset this puzzle? This clears your grid and removes this puzzle from your stats.",
    );

    if (!confirmed) {
      return;
    }

    skipNextAutosaveRef.current = true;
    setIsSaving(true);
    setStatusMessage("Resetting puzzle...");

    const response = isDevBypass
      ? resetDevProgress(puzzle.id)
      : session
        ? await fetchWithSession(
            session,
            `/api/games/crosswords/progress/${puzzle.id}`,
            { method: "DELETE" },
          )
        : new Response(null, { status: 401 });

    setIsSaving(false);

    if (!response.ok) {
      setStatusMessage("Could not reset this puzzle.");
      return;
    }

    setGridState({});
    setCheckedWrongKeys(new Set());
    setElapsedSeconds(0);
    setCheckedCount(0);
    setRevealedCount(0);
    setCompletedAt(null);
    setProgressRows((current) => {
      const next = current.filter((item) => item.crossword_id !== puzzle.id);
      setStats(calculateCrosswordStats(next));
      return next;
    });
    const firstCell = findFirstOpenCell(puzzle);
    setSelectedKey(firstCell ? keyFor(firstCell.row, firstCell.col) : "");
    setActiveDirection("across");
    setStatusMessage("Puzzle reset.");
  }

  return (
    <main className={styles.page}>
      <a className={styles.homeLink} href="/" aria-label="Tautology home">
        P or not P
      </a>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>/games/cryptic-crossword-archive</p>
            <h1 className={styles.title}>Cryptic Crossword Archive</h1>
          </div>
          {session ? (
            <div className={styles.accountBox}>
              <span>{session.user.email}</span>
              <button
                className={styles.secondaryButton}
                disabled={isAuthLoading}
                onClick={logOut}
                type="button"
              >
                {isAuthLoading ? "Signing out" : "Log out"}
              </button>
            </div>
          ) : isDevBypass ? (
            <div className={styles.accountBox}>
              <span>Local dev archive</span>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setIsDevBypass(false);
                  setIsApproved(false);
                  setArchive([]);
                  setProgressRows([]);
                  setStats(emptyCrosswordStats);
                  setPuzzle(null);
                  setAuthMessage("Sign up or log in to request access.");
                }}
                type="button"
              >
                Exit dev
              </button>
            </div>
          ) : null}
        </header>

        {!session && !isDevBypass ? (
          <section className={styles.panel}>
            <p className={styles.metaLabel}>Private archive</p>
            <h2>Sign up or log in</h2>
            <div className={styles.authGrid}>
              <input
                aria-label="Email"
                className={styles.input}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@example.com"
                type="email"
                value={email}
              />
              <input
                aria-label="Password"
                className={styles.input}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="password"
                type="password"
                value={password}
              />
              <button
                className={styles.button}
                disabled={isAuthLoading || !email || !password}
                onClick={logIn}
                type="button"
              >
                Log in
              </button>
              <button
                className={styles.secondaryButton}
                disabled={isAuthLoading || !email || !password}
                onClick={signUp}
                type="button"
              >
                Sign up
              </button>
              {canUseLocalDevBypass ? (
                <button
                  className={styles.secondaryButton}
                  onClick={loadDevData}
                  type="button"
                >
                  Open local dev archive
                </button>
              ) : null}
            </div>
            <p className={styles.message}>{authMessage}</p>
          </section>
        ) : isAccessLoading ? (
          <section className={styles.panel}>
            <p>Checking crossword access...</p>
          </section>
        ) : !isApproved ? (
          <section className={styles.panel}>
            <p className={styles.metaLabel}>Signed in</p>
            <h2>Access pending</h2>
            <p>
              Your account is signed in, but it needs manual approval before
              the crossword archive opens.
            </p>
            <button
              className={styles.secondaryButton}
              disabled={isAccessLoading}
              onClick={() => {
                if (session) {
                  checkedAccessUserIdRef.current = null;
                  loadProtectedData(session);
                }
              }}
              type="button"
            >
              Check again
            </button>
            <p className={styles.message}>{authMessage}</p>
          </section>
        ) : puzzle && puzzleModel ? (
          <section className={styles.playerPanel}>
            <div className={styles.playerTop}>
              <div>
                <p className={styles.metaLabel}>Solving</p>
                <h2>{puzzle.title}</h2>
              </div>
              <div className={styles.timer}>{formatSeconds(elapsedSeconds)}</div>
              <button
                className={styles.secondaryButton}
                onClick={() => setPuzzle(null)}
                type="button"
              >
                Archive
              </button>
            </div>

            <div className={styles.playerLayout}>
              <div className={styles.boardColumn}>
                <div
                  className={styles.grid}
                  onKeyDown={handleGridKeyDown}
                  style={{
                    aspectRatio: `${puzzle.cols} / ${puzzle.rows}`,
                    gridTemplateColumns: `repeat(${puzzle.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${puzzle.rows}, minmax(0, 1fr))`,
                  }}
                  tabIndex={0}
                >
                  {Array.from({ length: puzzle.rows * puzzle.cols }, (_, index) => {
                    const row = Math.floor(index / puzzle.cols);
                    const col = index % puzzle.cols;
                    const key = keyFor(row, col);
                    const isBlack = puzzleModel.blackKeys.has(key);
                    const number = puzzleModel.numberByKey.get(key);
                    const isSelected = selectedKey === key;
                    const isEntry = activeEntryKeys.has(key);

                    return (
                      <button
                        className={[
                          styles.cell,
                          isBlack ? styles.blackCell : "",
                          isEntry ? styles.entryCell : "",
                          checkedWrongKeys.has(key) ? styles.wrongCell : "",
                          isSelected ? styles.selectedCell : "",
                        ].join(" ")}
                        disabled={isBlack}
                        key={key}
                        onClick={() => selectCell(row, col)}
                        style={getDividerStyle(key, puzzleModel.dividerKeys)}
                        type="button"
                      >
                        {number ? (
                          <span className={styles.number}>{number}</span>
                        ) : null}
                        {!isBlack ? gridState[key] ?? "" : ""}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.controls}>
                  <button className={styles.secondaryButton} disabled={Boolean(completedAt)} onClick={checkLetter} type="button">
                    Check letter
                  </button>
                  <button className={styles.secondaryButton} disabled={Boolean(completedAt)} onClick={checkWord} type="button">
                    Check word
                  </button>
                  <button className={styles.secondaryButton} disabled={Boolean(completedAt)} onClick={checkGrid} type="button">
                    Check grid
                  </button>
                  <button className={styles.dangerButton} disabled={Boolean(completedAt)} onClick={revealLetter} type="button">
                    Reveal letter
                  </button>
                  <button className={styles.dangerButton} disabled={Boolean(completedAt)} onClick={revealWord} type="button">
                    Reveal word
                  </button>
                  <button className={styles.dangerButton} disabled={Boolean(completedAt)} onClick={revealGrid} type="button">
                    Reveal grid
                  </button>
                  <button className={styles.dangerButton} onClick={resetPuzzle} type="button">
                    Reset puzzle
                  </button>
                </div>
                <div className={styles.mobileKeyboard}>
                  {keyboardRows.map((row) => (
                    <div className={styles.keyboardRow} key={row}>
                      {row.split("").map((letter) => (
                        <button
                          className={styles.keyboardButton}
                          disabled={Boolean(completedAt)}
                          key={letter}
                          onClick={() => setLetter(letter)}
                          type="button"
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className={styles.keyboardRow}>
                    <button
                      className={styles.keyboardWideButton}
                      disabled={Boolean(completedAt)}
                      onClick={toggleActiveDirection}
                      type="button"
                    >
                      {activeDirection === "across" ? "Across" : "Down"}
                    </button>
                    <button
                      className={styles.keyboardWideButton}
                      disabled={Boolean(completedAt)}
                      onClick={clearLetter}
                      type="button"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className={styles.message}>
                  {statusMessage || (isSaving ? "Saving..." : "Autosave ready.")}
                </p>
              </div>

              <div className={styles.clues}>
                <ClueList
                  activeClue={activeClue}
                  clues={puzzle.clues.across}
                  gridState={gridState}
                  title="Across"
                  onSelect={selectClue}
                />
                <ClueList
                  activeClue={activeClue}
                  clues={puzzle.clues.down}
                  gridState={gridState}
                  title="Down"
                  onSelect={selectClue}
                />
              </div>
            </div>

            {completedAt ? (
              <>
                <div className={styles.solveSummary}>
                  <div>
                    <span className={styles.metaLabel}>Time</span>
                    <strong>{formatSeconds(elapsedSeconds)}</strong>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Status</span>
                    <strong>
                      {checkedCount === 0 && revealedCount === 0
                        ? "Clean solve"
                        : "Aided solve"}
                    </strong>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Checks</span>
                    <strong>{checkedCount}</strong>
                  </div>
                  <div>
                    <span className={styles.metaLabel}>Reveals</span>
                    <strong>{revealedCount}</strong>
                  </div>
                </div>
                <div className={styles.reasonings}>
                  <h3>Reasonings</h3>
                  {[...puzzle.clues.across, ...puzzle.clues.down].map((clue) => (
                    <div className={styles.reasoningItem} key={clue.id}>
                      <strong>
                        {clue.number}
                        {clue.direction === "across" ? "A" : "D"} {clue.answer}
                      </strong>
                      <p>{clue.reasoning}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : (
          <section className={styles.archivePanel}>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.metaLabel}>Solved</span>
                <strong>{stats.solvedCount}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.metaLabel}>Perfect</span>
                <strong>{stats.perfectCount}</strong>
              </div>
              <div className={styles.stat}>
                <span className={styles.metaLabel}>Perfect avg</span>
                <strong>
                  {stats.averageCompletedSeconds === null
                    ? "-"
                    : formatSeconds(stats.averageCompletedSeconds)}
                </strong>
                <span className={styles.statDetail}>
                  SD{" "}
                  {stats.standardDeviationCompletedSeconds === null
                    ? "-"
                    : formatSeconds(stats.standardDeviationCompletedSeconds)}
                </span>
              </div>
            </div>
            <div className={styles.list}>
              {archive.map((item) => {
                const progress = progressByCrossword.get(item.id);
                const flagTone = getSolvedFlagTone(progress);

                return (
                  <button
                    className={styles.archiveItem}
                    key={item.id}
                    onClick={() => openPuzzle(item.id)}
                    type="button"
                  >
                    <span className={styles.archiveItemTop}>
                      <strong>{item.title}</strong>
                      {flagTone ? (
                        <span
                          aria-label={
                            flagTone === "gold" ? "Solved without help" : "Solved with help"
                          }
                          className={[
                            styles.solvedFlag,
                            flagTone === "gold"
                              ? styles.goldenFlag
                              : styles.greenFlag,
                          ].join(" ")}
                        />
                      ) : null}
                    </span>
                    <span>
                      {progress?.completed_at
                        ? `Solved in ${formatSeconds(progress.elapsed_seconds)}`
                        : progress
                          ? `In progress at ${formatSeconds(progress.elapsed_seconds)}`
                          : "Not started"}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={styles.message}>{statusMessage}</p>
          </section>
        )}
      </div>
    </main>
  );
}

function ClueList({
  activeClue,
  clues,
  gridState,
  onSelect,
  title,
}: {
  activeClue: CrosswordClue | null;
  clues: CrosswordClue[];
  gridState: Record<string, string>;
  onSelect: (clue: CrosswordClue) => void;
  title: string;
}) {
  const activeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    activeButtonRef.current?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeClue?.id]);

  return (
    <div className={styles.clueColumn}>
      <h3>{title}</h3>
      {clues.map((clue) => {
        const isActive = activeClue?.id === clue.id;

        return (
          <button
            className={[
              styles.clueButton,
              isClueFilled(clue, gridState) ? styles.filledClue : "",
              isActive ? styles.activeClue : "",
            ].join(" ")}
            key={clue.id}
            onClick={() => onSelect(clue)}
            ref={isActive ? activeButtonRef : null}
            type="button"
          >
            <strong>{clue.number}.</strong> {clue.clue}
          </button>
        );
      })}
    </div>
  );
}

function isClueFilled(clue: CrosswordClue, gridState: Record<string, string>) {
  return getClueKeys(clue).every((key) => Boolean(gridState[key]));
}

function getWrongFilledKeys(
  keys: string[],
  gridState: Record<string, string>,
  solutionByKey: Map<string, string>,
) {
  return keys.filter(
    (key) => gridState[key] && gridState[key] !== solutionByKey.get(key),
  );
}

async function fetchWithSession(
  session: Session,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  return fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });
}

async function saveProgress(
  session: Session,
  crosswordId: string,
  payload: CrosswordProgressPayload,
) {
  const response = await fetchWithSession(session, `/api/games/crosswords/progress/${crosswordId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { progress?: ProgressRow };
  return data.progress ?? null;
}

function getDevBypassHeaders() {
  return { "x-crossword-dev-bypass": "1" };
}

function isLocalBrowserHost() {
  if (!isDevelopmentMode || typeof window === "undefined") {
    return false;
  }

  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function readDevProgress(): ProgressRow[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawProgress = window.localStorage.getItem(devProgressStorageKey);
    const progress = rawProgress ? JSON.parse(rawProgress) : [];
    return Array.isArray(progress) ? progress : [];
  } catch {
    return [];
  }
}

function writeDevProgress(progress: ProgressRow[]) {
  window.localStorage.setItem(devProgressStorageKey, JSON.stringify(progress));
}

function saveDevProgress(payload: CrosswordProgressPayload): ProgressRow {
  const progress: ProgressRow = {
    crossword_id: payload.crosswordId,
    grid_state: payload.gridState,
    elapsed_seconds: payload.elapsedSeconds,
    checked_count: payload.checkedCount,
    revealed_count: payload.revealedCount,
    completed_at: payload.completedAt,
    perfect:
      Boolean(payload.completedAt) &&
      payload.checkedCount === 0 &&
      payload.revealedCount === 0,
  };
  const next = [
    progress,
    ...readDevProgress().filter(
      (item) => item.crossword_id !== progress.crossword_id,
    ),
  ];
  writeDevProgress(next);
  return progress;
}

function resetDevProgress(crosswordId: string) {
  writeDevProgress(
    readDevProgress().filter((item) => item.crossword_id !== crosswordId),
  );

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function buildPuzzleModel(puzzle: CrosswordPuzzle) {
  const blackKeys = new Set(puzzle.blackCells.map((cell) => keyFor(cell.row, cell.col)));
  const openKeys = new Set<string>();
  const numberByKey = new Map(
    puzzle.numberedCells.map((cell) => [keyFor(cell.row, cell.col), cell.number]),
  );
  const dividerKeys = new Set<string>();
  const solutionByKey = new Map<string, string>();
  const clueCells = new Map<string, CrosswordClue[]>();

  puzzle.dividers.forEach((divider) => {
    dividerKeys.add(`${keyFor(divider.from.row, divider.from.col)}|${keyFor(divider.to.row, divider.to.col)}`);
  });

  for (let row = 0; row < puzzle.rows; row++) {
    for (let col = 0; col < puzzle.cols; col++) {
      const key = keyFor(row, col);
      if (!blackKeys.has(key)) {
        openKeys.add(key);
      }
    }
  }

  [...puzzle.clues.across, ...puzzle.clues.down].forEach((clue) => {
    getClueKeys(clue).forEach((key, index) => {
      solutionByKey.set(key, answerLetters(clue.answer)[index] ?? "");
      clueCells.set(key, [...(clueCells.get(key) ?? []), clue]);
    });
  });

  return { blackKeys, clueCells, dividerKeys, numberByKey, openKeys, solutionByKey };
}

function findClueForCell(
  model: ReturnType<typeof buildPuzzleModel>,
  cell: { row: number; col: number },
  direction: CrosswordDirection,
) {
  const clues = model.clueCells.get(keyFor(cell.row, cell.col)) ?? [];
  return clues.find((clue) => clue.direction === direction) ?? clues[0] ?? null;
}

function getClueKeys(clue: CrosswordClue) {
  return Array.from({ length: answerLetters(clue.answer).length }, (_, index) =>
    keyFor(
      clue.start.row + (clue.direction === "down" ? index : 0),
      clue.start.col + (clue.direction === "across" ? index : 0),
    ),
  );
}

function answerLetters(answer: string) {
  return answer.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function getSolvedFlagTone(progress?: ProgressRow) {
  if (!progress?.completed_at) {
    return null;
  }

  return progress.checked_count === 0 && progress.revealed_count === 0
    ? "gold"
    : "green";
}

function isGridComplete(
  gridState: Record<string, string>,
  solutionByKey: Map<string, string>,
) {
  return Array.from(solutionByKey).every(
    ([key, value]) => gridState[key] === value,
  );
}

function findFirstOpenCell(puzzle: CrosswordPuzzle) {
  const blackKeys = new Set(puzzle.blackCells.map((cell) => keyFor(cell.row, cell.col)));

  for (let row = 0; row < puzzle.rows; row++) {
    for (let col = 0; col < puzzle.cols; col++) {
      if (!blackKeys.has(keyFor(row, col))) {
        return { row, col };
      }
    }
  }

  return null;
}

function getDividerStyle(key: string, dividerKeys: Set<string>) {
  const { row, col } = parseKey(key);
  const right = keyFor(row, col + 1);
  const down = keyFor(row + 1, col);

  return {
    borderRightWidth:
      dividerKeys.has(`${key}|${right}`) || dividerKeys.has(`${right}|${key}`)
        ? "4px"
        : undefined,
    borderBottomWidth:
      dividerKeys.has(`${key}|${down}`) || dividerKeys.has(`${down}|${key}`)
        ? "4px"
        : undefined,
  };
}

function hasDividerBetween(fromKey: string, toKey: string, dividerKeys: Set<string>) {
  return (
    dividerKeys.has(`${fromKey}|${toKey}`) ||
    dividerKeys.has(`${toKey}|${fromKey}`)
  );
}

function keyFor(row: number, col: number) {
  return `${row},${col}`;
}

function parseKey(key: string) {
  const [row, col] = key.split(",").map(Number);
  return { row, col };
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
