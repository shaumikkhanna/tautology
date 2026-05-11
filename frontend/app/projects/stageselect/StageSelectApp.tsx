"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import type { StageSelectGameSearchResult } from "@/lib/igdb/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { stageselectReviewStatuses } from "@/lib/stageselect/api";

const statuses = [
  { value: "finished", label: "finished" },
  { value: "left", label: "left" },
  { value: "playing", label: "playing" },
  { value: "backlogged", label: "backlogged" },
  { value: "wishlisted", label: "wishlist" },
];

const ratingOptions = Array.from({ length: 10 }, (_item, index) =>
  String((index + 1) / 2),
);

const tabs = [
  { value: "search", label: "Search" },
  { value: "library", label: "Library" },
];

const libraryPageSize = 24;

type Profile = Pick<Tables<"profiles">, "display_name">;

type GameRecord = Pick<
  Tables<"stageselect_games">,
  "id" | "title" | "release_date" | "cover_url" | "platforms"
>;

type UserGameRecord = Pick<
  Tables<"stageselect_user_games">,
  "id" | "game_id" | "status" | "platform"
> & {
  stageselect_games: GameRecord | null;
};

type ReviewRecord = Pick<
  Tables<"stageselect_reviews">,
  "game_id" | "rating" | "body"
>;

type LibraryItem = {
  id: string;
  gameId: string;
  title: string;
  platform: string;
  platformOptions: string[];
  rating: string;
  review: string;
  status: string;
  releaseYear: string;
  coverUrl: string | null;
};

type ReviewModalState = {
  game: StageSelectGameSearchResult;
  status: string;
};

type LibraryModalState = {
  game: LibraryItem;
};

export function StageSelectApp() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    StageSelectGameSearchResult[]
  >([]);
  const [reviewModal, setReviewModal] = useState<ReviewModalState | null>(null);
  const [libraryModal, setLibraryModal] = useState<LibraryModalState | null>(
    null,
  );
  const [reviewRating, setReviewRating] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPlatform, setEditPlatform] = useState("");
  const [editRating, setEditRating] = useState("");
  const [editReview, setEditReview] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [libraryActionMessage, setLibraryActionMessage] = useState("");
  const [authMessage, setAuthMessage] = useState("Checking account...");
  const [searchMessage, setSearchMessage] = useState(
    "Search IGDB to find games.",
  );
  const [libraryMessage, setLibraryMessage] = useState(
    "Log in to load your library.",
  );
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSavingGame, setIsSavingGame] = useState(false);
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("search");
  const [statusFilter, setStatusFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [sortMode, setSortMode] = useState("title");
  const [libraryVisibleCount, setLibraryVisibleCount] =
    useState(libraryPageSize);

  const loadUserData = useCallback(
    async (nextSession: Session | null) => {
      if (!supabase || !nextSession) {
        setProfile(null);
        setLibrary([]);
        setLibraryMessage("Log in to load your library.");
        return;
      }

      setIsLibraryLoading(true);
      setLibraryMessage("Loading your library...");

      const [{ data: profileData, error: profileError }, libraryResponse] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", nextSession.user.id)
            .maybeSingle(),
          supabase
            .from("stageselect_user_games")
            .select(
              "id, game_id, status, platform, stageselect_games(id, title, release_date, cover_url, platforms)",
            )
            .eq("user_id", nextSession.user.id)
            .order("updated_at", { ascending: false }),
        ]);

      if (profileError) {
        setProfile(null);
      } else {
        setProfile(profileData as Profile | null);
      }

      if (libraryResponse.error) {
        setLibrary([]);
        setLibraryMessage(
          "Run the StageSelect Supabase migration to enable library data.",
        );
        setIsLibraryLoading(false);
        return;
      }

      const userGames = (libraryResponse.data ?? []) as UserGameRecord[];
      const gameIds = userGames.map((item) => item.game_id);
      let reviews: ReviewRecord[] = [];

      if (gameIds.length > 0) {
        const { data: reviewData } = await supabase
          .from("stageselect_reviews")
          .select("game_id, rating, body")
          .eq("user_id", nextSession.user.id)
          .in("game_id", gameIds);

        reviews = (reviewData ?? []) as ReviewRecord[];
      }

      const reviewsByGame = new Map(
        reviews.map((review) => [review.game_id, review]),
      );

      const nextLibrary = userGames
        .filter((item) => item.stageselect_games)
        .map((item) => {
          const game = item.stageselect_games as GameRecord;

          return {
            id: item.id,
            gameId: item.game_id,
            title: game.title,
            platform: item.platform ?? "-",
            platformOptions: getLibraryPlatformOptions(
              jsonToStringArray(game.platforms),
              item.platform,
            ),
            rating:
              reviewsByGame.get(item.game_id)?.rating === null ||
              reviewsByGame.get(item.game_id)?.rating === undefined
                ? "-"
                : String(reviewsByGame.get(item.game_id)?.rating),
            review: reviewsByGame.get(item.game_id)?.body ?? "",
            status: item.status,
            releaseYear: getReleaseYear(game.release_date),
            coverUrl: game.cover_url,
          };
        });

      setLibrary(nextLibrary);
      setLibraryMessage(
        nextLibrary.length > 0
          ? `${nextLibrary.length} game${nextLibrary.length === 1 ? "" : "s"} loaded.`
          : "Your library is empty. Search will add games here next.",
      );
      setIsLibraryLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase) {
      setAuthMessage("Add the Supabase publishable key to enable auth.");
      return;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      setSession(data.session);
      setAuthMessage(data.session ? "Signed in." : "Sign up or log in.");
      loadUserData(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setAuthMessage(nextSession ? "Signed in." : "Sign up or log in.");
        loadUserData(nextSession);
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadUserData, supabase]);

  const platformOptions = useMemo(() => {
    return Array.from(new Set(library.map((item) => item.platform))).sort();
  }, [library]);

  const visibleLibrary = useMemo(() => {
    return library
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter(
        (item) => platformFilter === "all" || item.platform === platformFilter,
      )
      .sort((a, b) => {
        if (sortMode === "rating") {
          return getSortableRating(b.rating) - getSortableRating(a.rating);
        }

        if (sortMode === "status") {
          return a.status.localeCompare(b.status);
        }

        return a.title.localeCompare(b.title);
      });
  }, [library, platformFilter, sortMode, statusFilter]);

  const pagedLibrary = useMemo(() => {
    return visibleLibrary.slice(0, libraryVisibleCount);
  }, [libraryVisibleCount, visibleLibrary]);

  useEffect(() => {
    setLibraryVisibleCount(libraryPageSize);
  }, [platformFilter, sortMode, statusFilter]);

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
        emailRedirectTo: `${window.location.origin}/projects/stageselect`,
      },
    });

    if (error) {
      setAuthMessage(error.message);
    } else {
      setAuthMessage("Check your email to confirm your account.");
    }

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
      setAuthMessage("Signed in.");
      setEmail("");
      setPassword("");
    }

    setIsAuthLoading(false);
  }

  async function logOut() {
    if (!supabase) {
      setAuthMessage("Supabase is not configured yet.");
      return;
    }

    setIsAuthLoading(true);
    setAuthMessage("Logging out...");

    const { error } = await supabase.auth.signOut();

    setAuthMessage(error ? error.message : "Signed out.");
    setIsAuthLoading(false);
  }

  async function searchGames(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchQuery.trim();

    if (!query) {
      setSearchMessage("Enter a game title to search.");
      return;
    }

    setIsSearching(true);
    setSearchMessage("Searching IGDB...");

    const response = await fetch(
      `/api/projects/stageselect/search?q=${encodeURIComponent(query)}`,
    );
    const payload = (await response.json()) as {
      results?: StageSelectGameSearchResult[];
      error?: string;
    };

    if (!response.ok) {
      setSearchResults([]);
      setSearchMessage(payload.error ?? "Search failed.");
      setIsSearching(false);
      return;
    }

    const results = payload.results ?? [];

    setSearchResults(results);
    setSearchMessage(
      results.length > 0
        ? `${results.length} result${results.length === 1 ? "" : "s"} found.`
        : "No games found.",
    );
    setIsSearching(false);
  }

  function beginStatusAction(game: StageSelectGameSearchResult, status: string) {
    if (!session) {
      setSearchMessage("Log in before adding games to your library.");
      return;
    }

    if (stageselectReviewStatuses.has(status)) {
      setReviewModal({ game, status });
      setReviewRating("");
      setReviewBody("");
      setSelectedPlatform(game.platforms[0] ?? "");
      setReviewMessage("");
      return;
    }

    saveGameToLibrary({
      game,
      status,
      platform: game.platforms[0] ?? "Unknown",
    });
  }

  async function saveGameToLibrary({
    game,
    status,
    rating,
    review,
    platform,
  }: {
    game: StageSelectGameSearchResult;
    status: string;
    platform: string;
    rating?: string;
    review?: string;
  }) {
    if (!supabase || !session) {
      setSearchMessage("Log in before adding games to your library.");
      return;
    }

    if (stageselectReviewStatuses.has(status) && !platform.trim()) {
      setReviewMessage("Choose a platform before saving.");
      return;
    }

    setIsSavingGame(true);
    setReviewMessage("");
    setSearchMessage(`Saving ${game.title}...`);

    const response = await fetchWithSession(
      session,
      "/api/projects/stageselect/library",
      {
        method: "POST",
        body: JSON.stringify({
          game,
          status,
          platform,
          rating,
          review,
        }),
      },
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };

      setSearchMessage(payload.error ?? "Could not save this game.");
      setIsSavingGame(false);
      return;
    }

    await loadUserData(session);
    setReviewModal(null);
    setActiveTab("library");
    setSearchMessage(
      `${game.title} saved as ${getStatusLabel(status)}.`,
    );
    setIsSavingGame(false);
  }

  function openLibraryModal(game: LibraryItem) {
    setLibraryModal({ game });
    setEditStatus(game.status);
    setEditPlatform(game.platform === "-" ? "" : game.platform);
    setEditRating(game.rating === "-" ? "" : game.rating);
    setEditReview(game.review);
    setLibraryActionMessage("");
  }

  async function updateLibraryGame() {
    if (!supabase || !session || !libraryModal) {
      return;
    }

    if (stageselectReviewStatuses.has(editStatus) && !editPlatform.trim()) {
      setLibraryActionMessage("Choose a platform before saving.");
      return;
    }

    setIsSavingGame(true);
    setLibraryActionMessage("Saving changes...");

    const response = await fetchWithSession(
      session,
      `/api/projects/stageselect/library/${libraryModal.game.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: editStatus,
          platform: editPlatform,
          rating: editRating,
          review: editReview,
        }),
      },
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };

      setLibraryActionMessage(payload.error ?? "Could not save changes.");
      setIsSavingGame(false);
      return;
    }

    await loadUserData(session);
    setLibraryModal(null);
    setIsSavingGame(false);
  }

  async function removeLibraryGame() {
    if (!supabase || !session || !libraryModal) {
      return;
    }

    setIsSavingGame(true);
    setLibraryActionMessage("Removing game...");

    const response = await fetchWithSession(
      session,
      `/api/projects/stageselect/library/${libraryModal.game.id}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };

      setLibraryActionMessage(payload.error ?? "Could not remove this game.");
      setIsSavingGame(false);
      return;
    }

    await loadUserData(session);
    setLibraryModal(null);
    setIsSavingGame(false);
  }

  return (
    <main className="flex w-full flex-1 justify-center bg-[#f6f7f9] px-4 py-8 text-[#20242c] sm:py-10">
      <div className="flex w-full max-w-6xl flex-col gap-8">
        <section className="grid gap-6 border-b border-[#d8dde5] pb-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <p className="font-mono text-xs uppercase text-[#667085]">
              /projects/stageselect
            </p>
            <h1 className="mt-3 font-mono text-4xl font-bold uppercase tracking-normal text-[#111827] sm:text-5xl">
              StageSelect
            </h1>
          </div>

          <div className="rounded-lg border border-[#d8dde5] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-xs uppercase text-[#667085]">
                Account
              </p>
              {session ? (
                <span className="rounded-full bg-[#edf7f2] px-3 py-1 text-xs font-medium text-[#166534]">
                  Signed in
                </span>
              ) : null}
            </div>

            {session ? (
              <div className="mt-4 grid gap-4">
                <div>
                  <p className="text-sm text-[#667085]">Logged in as</p>
                  <p className="mt-1 break-all text-sm font-medium text-[#111827]">
                    {profile?.display_name ?? session.user.email}
                  </p>
                  {profile?.display_name ? (
                    <p className="mt-1 break-all text-xs text-[#667085]">
                      {session.user.email}
                    </p>
                  ) : null}
                </div>
                <button
                  className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 font-mono text-xs font-bold uppercase text-[#20242c] transition hover:bg-[#f0f3f7] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isAuthLoading}
                  onClick={logOut}
                  type="button"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                <input
                  aria-label="Email"
                  className="w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="email@example.com"
                  type="email"
                  value={email}
                />
                <input
                  aria-label="Password"
                  className="w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="password"
                  type="password"
                  value={password}
                />
                <div className="grid grid-cols-2 gap-3">
                  <button
                    className="rounded-md bg-[#20242c] px-3 py-2 font-mono text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#394150] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isAuthLoading || !email || !password}
                    onClick={signUp}
                    type="button"
                  >
                    Sign up
                  </button>
                  <button
                    className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 font-mono text-xs font-bold uppercase text-[#20242c] transition hover:bg-[#f0f3f7] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isAuthLoading || !email || !password}
                    onClick={logIn}
                    type="button"
                  >
                    Log in
                  </button>
                </div>
              </div>
            )}

            <p className="mt-3 min-h-5 text-xs text-[#667085]">
              {authMessage}
            </p>
          </div>
        </section>

        <section>
          <div className="flex flex-wrap gap-2 border-b border-[#d8dde5]">
            {tabs.map((tab) => (
              <button
                className={[
                  "border-b-2 px-4 py-3 font-mono text-xs font-bold uppercase transition",
                  activeTab === tab.value
                    ? "border-[#20242c] text-[#111827]"
                    : "border-transparent text-[#667085] hover:text-[#20242c]",
                ].join(" ")}
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {activeTab === "search" ? (
            <div className="rounded-lg border border-[#d8dde5] bg-white p-5 shadow-sm">
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={searchGames}
            >
              <label className="flex-1">
                <span className="font-mono text-xs uppercase text-[#667085]">
                  Search IGDB
                </span>
                <input
                  className="mt-2 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-base text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search for a game"
                  type="search"
                  value={searchQuery}
                />
              </label>
              <button
                className="rounded-md bg-[#20242c] px-5 py-3 font-mono text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#394150] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSearching || !searchQuery.trim()}
                type="submit"
              >
                {isSearching ? "Searching" : "Search"}
              </button>
            </form>

            <p className="mt-3 text-sm text-[#667085]">{searchMessage}</p>

            <div className="mt-6 grid gap-4">
              {searchResults.length > 0 ? (
                searchResults.map((game) => (
                <article
                  className="grid gap-4 rounded-lg border border-[#d8dde5] bg-[#fbfcfd] p-4 transition hover:border-[#b8c2d1] sm:grid-cols-[88px_minmax(0,1fr)]"
                  key={game.igdbId}
                >
                  {game.coverUrl ? (
                    <img
                      alt=""
                      className="h-28 w-full rounded-md border border-[#cfd6e0] bg-[#e8ecf2] object-cover sm:w-[88px]"
                      src={game.coverUrl}
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-md border border-[#cfd6e0] bg-[#e8ecf2] font-mono text-xs uppercase text-[#667085]">
                      Cover
                    </div>
                  )}
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="font-mono text-xl font-bold uppercase tracking-normal text-[#111827]">
                          {game.title}
                        </h2>
                        <p className="mt-1 text-sm text-[#667085]">
                          {formatGameMeta(game)}
                        </p>
                      </div>
                      {game.genres[0] ? (
                        <span className="rounded-full bg-[#f5f3ff] px-3 py-1 font-mono text-xs uppercase text-[#5b21b6]">
                          {game.genres[0]}
                        </span>
                      ) : null}
                    </div>
                    {game.summary ? (
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#4b5563]">
                        {game.summary}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {statuses.map((status) => (
                        <button
                          className={[
                            "rounded-full px-3 py-1 font-mono text-xs uppercase transition disabled:cursor-not-allowed disabled:opacity-60",
                            getStatusChipClass(status.value),
                          ].join(" ")}
                          disabled={isSavingGame}
                          key={status.value}
                          onClick={() => beginStatusAction(game, status.value)}
                          type="button"
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[#cfd6e0] bg-[#fbfcfd] px-4 py-8 text-center text-sm text-[#667085]">
                  Results will appear here with cover art, platforms, genres,
                  and quick status actions.
                </div>
              )}
            </div>
            </div>
            ) : (
            <div className="rounded-lg border border-[#d8dde5] bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-mono text-xs uppercase text-[#667085]">
                    My games
                  </p>
                  <h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[#111827]">
                    Library
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="Filter library by platform"
                    className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-xs font-medium text-[#394150]"
                    onChange={(event) => setPlatformFilter(event.target.value)}
                    value={platformFilter}
                  >
                    <option value="all">All platforms</option>
                    {platformOptions.map((platform) => (
                      <option key={platform} value={platform}>
                        {platform}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter library by status"
                    className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-xs font-medium text-[#394150]"
                    onChange={(event) => setStatusFilter(event.target.value)}
                    value={statusFilter}
                  >
                    <option value="all">All statuses</option>
                    {statuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort library"
                    className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-xs font-medium text-[#394150]"
                    onChange={(event) => setSortMode(event.target.value)}
                    value={sortMode}
                  >
                    <option value="title">Title</option>
                    <option value="rating">Rating</option>
                    <option value="status">Status</option>
                  </select>
                </div>
              </div>

              <p className="mt-3 text-sm text-[#667085]">{libraryMessage}</p>

              <div className="mt-5">
                {visibleLibrary.length > 0 ? (
                  <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#667085]">
                      <span>
                        Showing {pagedLibrary.length} of {visibleLibrary.length}
                      </span>
                      {pagedLibrary.length > libraryPageSize ? (
                        <button
                          className="font-mono font-bold uppercase text-[#20242c] transition hover:text-[#111827] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={pagedLibrary.length >= visibleLibrary.length}
                          onClick={() => setLibraryVisibleCount(libraryPageSize)}
                          type="button"
                        >
                          Reset
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {pagedLibrary.map((game) => (
                      <button
                        className="overflow-hidden rounded-lg border border-[#d8dde5] bg-[#fbfcfd] text-left transition hover:-translate-y-0.5 hover:border-[#b8c2d1] hover:shadow-sm"
                        key={game.id}
                        onClick={() => openLibraryModal(game)}
                        type="button"
                      >
                        <div className="grid grid-cols-[88px_minmax(0,1fr)]">
                          {game.coverUrl ? (
                            <img
                              alt=""
                              className="h-full min-h-32 w-full bg-[#e8ecf2] object-cover"
                              src={game.coverUrl}
                            />
                          ) : (
                            <div className="flex h-full min-h-32 w-full items-center justify-center bg-[#e8ecf2] font-mono text-xs uppercase text-[#667085]">
                              Cover
                            </div>
                          )}
                          <div className="p-3">
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="font-mono text-sm font-bold uppercase tracking-normal text-[#111827]">
                              {game.title}
                            </h3>
                            <span className="rounded-full border border-[#d8dde5] bg-white px-2 py-1 text-xs text-[#394150]">
                              {game.rating === "-" ? "-" : `${game.rating}/5`}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#4b5563]">
                            <span
                              className={[
                                "rounded-full px-2 py-1",
                                getStatusChipClass(game.status),
                              ].join(" ")}
                            >
                              {getStatusLabel(game.status)}
                            </span>
                            <span
                              className={[
                                "rounded-full px-2 py-1",
                                getPlatformChipClass(game.platform),
                              ].join(" ")}
                            >
                              {game.platform}
                            </span>
                            <span className="rounded-full bg-white px-2 py-1 text-[#667085]">
                              {game.releaseYear}
                            </span>
                          </div>
                          {game.review ? (
                            <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#667085]">
                              {game.review}
                            </p>
                          ) : null}
                          </div>
                        </div>
                      </button>
                      ))}
                    </div>
                    {pagedLibrary.length < visibleLibrary.length ? (
                      <div className="mt-5 flex justify-center">
                        <button
                          className="rounded-md border border-[#cfd6e0] bg-white px-4 py-2 font-mono text-xs font-bold uppercase text-[#20242c] transition hover:bg-[#f0f3f7]"
                          onClick={() =>
                            setLibraryVisibleCount((count) =>
                              Math.min(
                                count + libraryPageSize,
                                visibleLibrary.length,
                              ),
                            )
                          }
                          type="button"
                        >
                          Show more
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#cfd6e0] bg-[#fbfcfd] px-4 py-8 text-center text-sm text-[#667085]">
                    {isLibraryLoading
                      ? "Loading..."
                      : "No games match this library view yet."}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        </section>
      </div>

      {reviewModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-8">
          <div className="w-full max-w-lg rounded-xl border border-[#d8dde5] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase text-[#667085]">
                  {getStatusLabel(reviewModal.status)}
                </p>
                <h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[#111827]">
                  {reviewModal.game.title}
                </h2>
              </div>
              <button
                className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-xs font-medium text-[#394150]"
                onClick={() => setReviewModal(null)}
                type="button"
              >
                Close
              </button>
            </div>

            <label className="mt-5 block">
              <span className="font-mono text-xs uppercase text-[#667085]">
                Platform
              </span>
              <select
                className="mt-2 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                onChange={(event) => setSelectedPlatform(event.target.value)}
                required
                value={selectedPlatform}
              >
                <option value="">Choose platform</option>
                {reviewModal.game.platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
                {reviewModal.game.platforms.length === 0 ? (
                  <option value="Unknown">Unknown</option>
                ) : null}
              </select>
            </label>

            <label className="mt-4 block">
              <span className="font-mono text-xs uppercase text-[#667085]">
                Stars
              </span>
              <select
                className="mt-2 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                onChange={(event) => setReviewRating(event.target.value)}
                value={reviewRating}
              >
                <option value="">No rating</option>
                {ratingOptions.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating} / 5
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <span className="font-mono text-xs uppercase text-[#667085]">
                Review
              </span>
              <textarea
                className="mt-2 min-h-32 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                onChange={(event) => setReviewBody(event.target.value)}
                placeholder="Optional notes, thoughts, or verdict."
                value={reviewBody}
              />
            </label>

            {reviewMessage ? (
              <p className="mt-3 text-sm text-[#b42318]">{reviewMessage}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button
                className="rounded-md border border-[#cfd6e0] bg-white px-4 py-2 font-mono text-xs font-bold uppercase text-[#20242c] transition hover:bg-[#f0f3f7]"
                onClick={() => setReviewModal(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#20242c] px-4 py-2 font-mono text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#394150] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSavingGame}
                onClick={() =>
                  saveGameToLibrary({
                    game: reviewModal.game,
                    status: reviewModal.status,
                    platform: selectedPlatform,
                    rating: reviewRating,
                    review: reviewBody,
                  })
                }
                type="button"
              >
                {isSavingGame ? "Saving" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {libraryModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/45 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-[#d8dde5] bg-white p-5 shadow-xl">
            <div className="grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
              {libraryModal.game.coverUrl ? (
                <img
                  alt=""
                  className="aspect-[3/4] w-full rounded-lg bg-[#e8ecf2] object-cover"
                  src={libraryModal.game.coverUrl}
                />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-[#e8ecf2] font-mono text-xs uppercase text-[#667085]">
                  Cover
                </div>
              )}

              <div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs uppercase text-[#667085]">
                      {libraryModal.game.releaseYear}
                    </p>
                    <h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[#111827]">
                      {libraryModal.game.title}
                    </h2>
                  </div>
                  <button
                    className="rounded-md border border-[#cfd6e0] bg-white px-3 py-2 text-xs font-medium text-[#394150]"
                    onClick={() => setLibraryModal(null)}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                {libraryModal.game.review ? (
                  <div className="mt-4 rounded-lg bg-[#f6f7f9] p-4">
                    <p className="font-mono text-xs uppercase text-[#667085]">
                      My review
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[#394150]">
                      {libraryModal.game.review}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label>
                <span className="font-mono text-xs uppercase text-[#667085]">
                  Status
                </span>
                <select
                  className="mt-2 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                  onChange={(event) => setEditStatus(event.target.value)}
                  value={editStatus}
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="font-mono text-xs uppercase text-[#667085]">
                  Platform
                </span>
                <select
                  className="mt-2 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                  onChange={(event) => setEditPlatform(event.target.value)}
                  value={editPlatform}
                >
                  <option value="">Choose platform</option>
                  {libraryModal.game.platformOptions.map((platform) => (
                    <option key={platform} value={platform}>
                      {platform}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="font-mono text-xs uppercase text-[#667085]">
                  Stars
                </span>
                <select
                  className="mt-2 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                  onChange={(event) => setEditRating(event.target.value)}
                  value={editRating}
                >
                  <option value="">No rating</option>
                  {ratingOptions.map((rating) => (
                    <option key={rating} value={rating}>
                      {rating} / 5
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-4 block">
              <span className="font-mono text-xs uppercase text-[#667085]">
                Review
              </span>
              <textarea
                className="mt-2 min-h-32 w-full rounded-md border border-[#cfd6e0] bg-white px-3 py-3 text-sm text-[#20242c] outline-none transition focus:border-[#7c8ca5] focus:ring-2 focus:ring-[#dce3ee]"
                onChange={(event) => setEditReview(event.target.value)}
                value={editReview}
              />
            </label>

            {libraryActionMessage ? (
              <p className="mt-3 text-sm text-[#b42318]">
                {libraryActionMessage}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-between gap-3">
              <button
                className="rounded-md border border-[#fecaca] bg-[#fff1f2] px-4 py-2 font-mono text-xs font-bold uppercase text-[#be123c] transition hover:bg-[#ffe4e6]"
                disabled={isSavingGame}
                onClick={removeLibraryGame}
                type="button"
              >
                Remove
              </button>
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-md border border-[#cfd6e0] bg-white px-4 py-2 font-mono text-xs font-bold uppercase text-[#20242c] transition hover:bg-[#f0f3f7]"
                  onClick={() => setLibraryModal(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-[#20242c] px-4 py-2 font-mono text-xs font-bold uppercase text-white shadow-sm transition hover:bg-[#394150] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isSavingGame}
                  onClick={updateLibraryGame}
                  type="button"
                >
                  {isSavingGame ? "Saving" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function getReleaseYear(releaseDate: string | null) {
  if (!releaseDate) {
    return "-";
  }

  return releaseDate.slice(0, 4);
}

function getSortableRating(rating: string) {
  const value = Number(rating);

  return Number.isFinite(value) ? value : -1;
}

function getLibraryPlatformOptions(
  platforms: string[],
  selectedPlatform: string | null,
) {
  const options = new Set<string>();

  if (selectedPlatform?.trim() && selectedPlatform !== "-") {
    options.add(selectedPlatform.trim());
  }

  platforms.forEach((platform) => {
    if (platform.trim()) {
      options.add(platform.trim());
    }
  });

  if (options.size === 0) {
    options.add("Unknown");
  }

  return Array.from(options).sort();
}

function jsonToStringArray(value: Json) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getStatusLabel(statusValue: string) {
  return (
    statuses.find((status) => status.value === statusValue)?.label ??
    statusValue
  );
}

function getStatusChipClass(statusValue: string) {
  const classes: Record<string, string> = {
    finished: "bg-[#ecfdf3] text-[#027a48]",
    left: "bg-[#fff1f3] text-[#c01048]",
    playing: "bg-[#eff8ff] text-[#175cd3]",
    backlogged: "bg-[#fffaeb] text-[#b54708]",
    wishlisted: "bg-[#f5f3ff] text-[#6941c6]",
  };

  return classes[statusValue] ?? "bg-white text-[#394150]";
}

function getPlatformChipClass(platform: string) {
  const normalized = platform.toLowerCase();

  if (
    normalized.includes("xbox") ||
    normalized.includes("microsoft windows") ||
    normalized === "pc"
  ) {
    return "bg-[#ecfdf3] text-[#047857]";
  }

  if (normalized.includes("playstation") || normalized.includes("ps5")) {
    return "bg-[#eff6ff] text-[#1d4ed8]";
  }

  if (
    normalized.includes("nintendo") ||
    normalized.includes("switch") ||
    normalized.includes("wii")
  ) {
    return "bg-[#fff1f2] text-[#be123c]";
  }

  if (normalized.includes("mac") || normalized.includes("ios")) {
    return "bg-[#f1f5f9] text-[#475569]";
  }

  if (normalized.includes("linux")) {
    return "bg-[#fefce8] text-[#a16207]";
  }

  return "bg-[#f6f7f9] text-[#4b5563]";
}

function formatGameMeta(game: StageSelectGameSearchResult) {
  const pieces = [
    game.releaseYear ? String(game.releaseYear) : null,
    game.platforms.slice(0, 3).join(", "),
  ].filter(Boolean);

  return pieces.length > 0 ? pieces.join(" / ") : "IGDB result";
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
