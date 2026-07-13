"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { StageSelectGameSearchResult } from "@/lib/igdb/types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { stageselectReviewStatuses } from "@/lib/stageselect/api";

const statuses = [
	{ value: "finished", label: "Finished" },
	{ value: "left", label: "Left" },
	{ value: "playing", label: "Playing" },
	{ value: "backlogged", label: "Backlogged" },
	{ value: "wishlisted", label: "Wishlist" },
];

const ratingOptions = Array.from({ length: 10 }, (_item, index) =>
	String((index + 1) / 2),
);

const tabs = [
	{ value: "search", label: "Search" },
	{ value: "library", label: "Library" },
	{ value: "stats", label: "Stats" },
];

const libraryPageSize = 24;
const defaultRatingMin = 0;
const defaultRatingMax = 5;
const defaultReleaseMin = 0;
const defaultReleaseMax = 9999;

type Profile = Pick<Tables<"profiles">, "display_name">;

type GameRecord = Pick<
	Tables<"stageselect_games">,
	"id" | "igdb_id" | "title" | "release_date" | "cover_url" | "platforms"
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
	igdbId: number;
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

type ChartRow = {
	label: string;
	value: number;
	className?: string;
};

type StageSelectThemeMode = "dark" | "light";
type StageSelectThemeVars = CSSProperties &
	Record<`--stage-${string}`, string>;

const ratingBarClasses = [
	"bg-[#ef4444]",
	"bg-[#f97316]",
	"bg-[#f59e0b]",
	"bg-[#eab308]",
	"bg-[#84cc16]",
	"bg-[#22c55e]",
	"bg-[#14b8a6]",
	"bg-[#06b6d4]",
	"bg-[#3b82f6]",
	"bg-[#8b5cf6]",
];

const stageSelectThemes: Record<StageSelectThemeMode, StageSelectThemeVars> = {
	dark: {
		"--stage-bg": "#151310",
		"--stage-text": "#f2ead0",
		"--stage-border": "#4d4634",
		"--stage-muted": "#b8aa78",
		"--stage-heading": "#fff6d6",
		"--stage-subtle": "#d0c59a",
		"--stage-panel": "#211e19",
		"--stage-control-border": "#5b5139",
		"--stage-hover": "#332e24",
		"--stage-divider": "#3a3428",
		"--stage-focus-ring": "#5b5139",
		"--stage-accent": "#ffcc00",
		"--stage-accent-text": "#151310",
		"--stage-accent-hover": "#d6cc9b",
		"--stage-hover-border": "#ffcc00",
		"--stage-card": "#1c1914",
		"--stage-cover": "#2d281f",
		"--stage-faint": "#8f835f",
		"--stage-strong": "#e6d9ad",
		"--stage-overlay": "rgba(5, 4, 3, 0.7)",
		"--stage-rating-bg": "#4b3d16",
		"--stage-rating-text": "#ffe08a",
		"--stage-star-empty-fill": "#2d281f",
		"--stage-star-empty-stroke": "#8f835f",
		"--stage-star-fill": "#ffcc00",
		"--stage-star-stroke": "#ffe08a",
		"--stage-star-half-stroke": "#151310",
		"--stage-info-bg": "#2f2448",
		"--stage-info-border": "#5b3f8a",
		"--stage-info-text": "#d8b4fe",
		"--stage-success-bg": "#153b2c",
		"--stage-success-border": "#1f6f4a",
		"--stage-success-text": "#86efac",
		"--stage-danger-bg": "#3b1212",
		"--stage-danger-border": "#7f1d1d",
		"--stage-danger-text": "#fecaca",
		"--stage-danger-hover": "#551b1b",
		"--stage-danger-message": "#ff9b8f",
	},
	light: {
		"--stage-bg": "#f6f7f9",
		"--stage-text": "#20242c",
		"--stage-border": "#d8dde5",
		"--stage-muted": "#667085",
		"--stage-heading": "#111827",
		"--stage-subtle": "#4b5563",
		"--stage-panel": "#ffffff",
		"--stage-control-border": "#cfd6e0",
		"--stage-hover": "#f0f3f7",
		"--stage-divider": "#e5e7eb",
		"--stage-focus-ring": "#dce3ee",
		"--stage-accent": "#20242c",
		"--stage-accent-text": "#ffffff",
		"--stage-accent-hover": "#394150",
		"--stage-hover-border": "#b8c2d1",
		"--stage-card": "#fbfcfd",
		"--stage-cover": "#e8ecf2",
		"--stage-faint": "#98a2b3",
		"--stage-strong": "#394150",
		"--stage-overlay": "rgba(17, 24, 39, 0.45)",
		"--stage-rating-bg": "#fff7df",
		"--stage-rating-text": "#9a6700",
		"--stage-star-empty-fill": "#eef0f3",
		"--stage-star-empty-stroke": "#98a2b3",
		"--stage-star-fill": "#f7b731",
		"--stage-star-stroke": "#b77900",
		"--stage-star-half-stroke": "#8a5a00",
		"--stage-info-bg": "#eef2ff",
		"--stage-info-border": "#c7d2fe",
		"--stage-info-text": "#3730a3",
		"--stage-success-bg": "#ecfdf3",
		"--stage-success-border": "#abefc6",
		"--stage-success-text": "#027a48",
		"--stage-danger-bg": "#fff1f3",
		"--stage-danger-border": "#fecdd3",
		"--stage-danger-text": "#be123c",
		"--stage-danger-hover": "#ffe4e6",
		"--stage-danger-message": "#be123c",
	},
};

const themeAwareClasses = {
	toggle: {
		dark: "border-[#5b5139] bg-[#211e19]",
		light: "border-[#cfd6e0] bg-white",
	},
	toggleOption: {
		activeDark: "bg-[#3a3428] text-[#ffcc00]",
		activeLight: "bg-[#f0f3f7] text-[#20242c]",
		inactive: "text-[var(--stage-muted)] hover:bg-[var(--stage-hover)] hover:text-[var(--stage-text)]",
	},
};

function cx(...classes: Array<string | false | null | undefined>) {
	return classes.filter(Boolean).join(" ");
}

export function StageSelectApp() {
	const supabase = useMemo(() => createBrowserSupabaseClient(), []);
	const [themeMode, setThemeMode] = useState<StageSelectThemeMode>("dark");
	const [session, setSession] = useState<Session | null>(null);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [library, setLibrary] = useState<LibraryItem[]>([]);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmNewPassword, setConfirmNewPassword] = useState("");
	const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<
		StageSelectGameSearchResult[]
	>([]);
	const [reviewModal, setReviewModal] = useState<ReviewModalState | null>(
		null,
	);
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
	const [isEditReviewOpen, setIsEditReviewOpen] = useState(false);
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
	const [isExportingData, setIsExportingData] = useState(false);
	const [activeTab, setActiveTab] = useState("search");
	const [librarySearchQuery, setLibrarySearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [platformFilter, setPlatformFilter] = useState("all");
	const [ratingMinFilter, setRatingMinFilter] = useState(defaultRatingMin);
	const [ratingMaxFilter, setRatingMaxFilter] = useState(defaultRatingMax);
	const [releaseMinFilter, setReleaseMinFilter] =
		useState(defaultReleaseMin);
	const [releaseMaxFilter, setReleaseMaxFilter] =
		useState(defaultReleaseMax);
	const [reviewFilter, setReviewFilter] = useState("all");
	const [sortMode, setSortMode] = useState("title");
	const [libraryVisibleCount, setLibraryVisibleCount] =
		useState(libraryPageSize);

	useEffect(() => {
		const savedTheme = window.localStorage.getItem("stageselect-theme");

		if (savedTheme === "dark" || savedTheme === "light") {
			setThemeMode(savedTheme);
		}
	}, []);

	useEffect(() => {
		window.localStorage.setItem("stageselect-theme", themeMode);
	}, [themeMode]);

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

			const [
				{ data: profileData, error: profileError },
				libraryResponse,
			] = await Promise.all([
				supabase
					.from("profiles")
					.select("display_name")
					.eq("id", nextSession.user.id)
					.maybeSingle(),
				supabase
					.from("stageselect_user_games")
					.select(
						"id, game_id, status, platform, stageselect_games(id, igdb_id, title, release_date, cover_url, platforms)",
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
						igdbId: game.igdb_id,
						title: game.title,
						platform: item.platform ?? "-",
						platformOptions: getLibraryPlatformOptions(
							jsonToStringArray(game.platforms),
							item.platform,
						),
						rating:
							reviewsByGame.get(item.game_id)?.rating === null ||
							reviewsByGame.get(item.game_id)?.rating ===
								undefined
								? "-"
								: String(
										reviewsByGame.get(item.game_id)?.rating,
									),
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
				setAuthMessage(
					nextSession ? "Signed in." : "Sign up or log in.",
				);
				if (!nextSession) {
					setNewPassword("");
					setConfirmNewPassword("");
					setIsChangePasswordOpen(false);
				}
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

	const releaseYearBounds = useMemo(() => {
		const years = library
			.map((item) => getSortableYear(item.releaseYear))
			.filter((year) => year > 0);

		if (years.length === 0) {
			const fallbackYear = new Date().getFullYear();

			return { min: 1970, max: fallbackYear };
		}

		return {
			min: Math.min(...years),
			max: Math.max(...years),
		};
	}, [library]);

	const libraryByIgdbId = useMemo(() => {
		return new Map(library.map((item) => [item.igdbId, item]));
	}, [library]);

	const visibleLibrary = useMemo(() => {
		const normalizedSearchQuery = librarySearchQuery.trim().toLowerCase();

		return library
			.filter((item) => {
				if (!normalizedSearchQuery) {
					return true;
				}

				return [
					item.title,
					item.platform,
					getStatusLabel(item.status),
					item.releaseYear,
					item.review,
				]
					.join(" ")
					.toLowerCase()
					.includes(normalizedSearchQuery);
			})
			.filter(
				(item) =>
					statusFilter === "all" || item.status === statusFilter,
			)
			.filter(
				(item) =>
					platformFilter === "all" ||
					item.platform === platformFilter,
			)
			.filter((item) => {
				const releaseYear = getSortableYear(item.releaseYear);

				if (releaseYear < 0) {
					return (
						releaseMinFilter === defaultReleaseMin &&
						releaseMaxFilter === defaultReleaseMax
					);
				}

				return (
					releaseYear >= releaseMinFilter &&
					releaseYear <= releaseMaxFilter
				);
			})
			.filter((item) => {
				const rating = getSortableRating(item.rating);

				if (rating < 0) {
					return ratingMinFilter === defaultRatingMin;
				}

				return rating >= ratingMinFilter && rating <= ratingMaxFilter;
			})
			.filter((item) => {
				if (reviewFilter === "reviewed") {
					return Boolean(item.review);
				}

				if (reviewFilter === "unreviewed") {
					return !item.review;
				}

				return true;
			})
			.sort((a, b) => {
				if (sortMode === "rating") {
					return (
						getSortableRating(b.rating) -
						getSortableRating(a.rating)
					);
				}

				if (sortMode === "rating-asc") {
					return (
						getSortableRating(a.rating) -
						getSortableRating(b.rating)
					);
				}

				if (sortMode === "release-desc") {
					return (
						getSortableYear(b.releaseYear) -
						getSortableYear(a.releaseYear)
					);
				}

				if (sortMode === "release-asc") {
					return (
						getSortableYear(a.releaseYear) -
						getSortableYear(b.releaseYear)
					);
				}

				if (sortMode === "status") {
					return a.status.localeCompare(b.status);
				}

				if (sortMode === "platform") {
					return a.platform.localeCompare(b.platform);
				}

				return a.title.localeCompare(b.title);
			});
	}, [
		library,
		librarySearchQuery,
		platformFilter,
		ratingMaxFilter,
		ratingMinFilter,
		releaseMaxFilter,
		releaseMinFilter,
		reviewFilter,
		sortMode,
		statusFilter,
	]);

	const pagedLibrary = useMemo(() => {
		return visibleLibrary.slice(0, libraryVisibleCount);
	}, [libraryVisibleCount, visibleLibrary]);

	const libraryStats = useMemo(() => {
		const ratedGames = library.filter(
			(item) => getSortableRating(item.rating) > 0,
		);
		const finishedGames = library.filter(
			(item) => item.status === "finished",
		);
		const leftGames = library.filter((item) => item.status === "left");
		const queueGames = library.filter(
			(item) =>
				item.status === "backlogged" || item.status === "wishlisted",
		);
		const fiveStarGames = library.filter(
			(item) => getSortableRating(item.rating) === 5,
		);
		const platformRows = getCountRows(
			library
				.map((item) => item.platform)
				.filter((platform) => platform !== "-"),
		);
		const ratingPlatformLabels = new Set(
			platformRows
				.filter((row) => row.value >= 5)
				.map((row) => row.label),
		);
		const decidedGames = finishedGames.length + leftGames.length;
		const averageRating =
			ratedGames.length > 0
				? ratedGames.reduce(
						(total, item) => total + getSortableRating(item.rating),
						0,
					) / ratedGames.length
				: 0;

		return {
			totalGames: library.length,
			reviewedGames: library.filter((item) => Boolean(item.review))
				.length,
			ratedGames: ratedGames.length,
			averageRating,
			finishedGames: finishedGames.length,
			queueGames: queueGames.length,
			fiveStarGames: fiveStarGames.length,
			decidedGames,
			finishRate:
				decidedGames > 0
					? Math.round((finishedGames.length / decidedGames) * 100)
					: 0,
			favoritePlatform: platformRows[0]?.label ?? "-",
			topRatedTitles: [...ratedGames]
				.sort(
					(a, b) =>
						getSortableRating(b.rating) -
							getSortableRating(a.rating) ||
						a.title.localeCompare(b.title),
				)
				.slice(0, 3),
			statusRows: statuses.map((status) => ({
				label: status.label,
				value: library.filter((item) => item.status === status.value)
					.length,
				className: getStatusBarClass(status.value),
			})),
			platformRows: platformRows.slice(0, 8),
			ratingByPlatformRows: getAverageRatingRows(
				ratedGames.filter((item) =>
					ratingPlatformLabels.has(item.platform),
				),
				(item) => item.platform,
				getPlatformBarClass,
			),
			ratingByStatusRows: getAverageRatingRows(
				ratedGames,
				(item) => getStatusLabel(item.status),
				(label) =>
					getStatusBarClass(
						statuses.find((status) => status.label === label)
							?.value ?? "",
					),
			),
			ratingRows: ratingOptions
				.map((rating, index) => ({
					label: `${rating} stars`,
					value: library.filter(
						(item) =>
							getSortableRating(item.rating) === Number(rating),
					).length,
					className: ratingBarClasses[index],
				}))
				.reverse()
				.concat({
					label: "Unrated",
					value: library.filter(
						(item) => getSortableRating(item.rating) < 0,
					).length,
					className: "bg-[#94a3b8]",
				}),
		};
	}, [library]);

	useEffect(() => {
		setLibraryVisibleCount(libraryPageSize);
	}, [
		librarySearchQuery,
		platformFilter,
		ratingMaxFilter,
		ratingMinFilter,
		releaseMaxFilter,
		releaseMinFilter,
		reviewFilter,
		sortMode,
		statusFilter,
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

	async function changePassword(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!supabase || !session) {
			setAuthMessage("Log in before changing your password.");
			return;
		}

		if (newPassword.length < 6) {
			setAuthMessage("New password must be at least 6 characters.");
			return;
		}

		if (newPassword !== confirmNewPassword) {
			setAuthMessage("New passwords do not match.");
			return;
		}

		setIsAuthLoading(true);
		setAuthMessage("Changing password...");

		const { error } = await supabase.auth.updateUser({
			password: newPassword,
		});

		if (error) {
			setAuthMessage(error.message);
		} else {
			setNewPassword("");
			setConfirmNewPassword("");
			setIsChangePasswordOpen(false);
			setAuthMessage("Password changed.");
		}

		setIsAuthLoading(false);
	}

	async function downloadUserData() {
		if (!session) {
			setAuthMessage("Log in before exporting your data.");
			return;
		}

		setIsExportingData(true);
		setAuthMessage("Preparing JSON export...");

		const response = await fetchWithSession(
			session,
			"/api/projects/stageselect/export",
			{ method: "GET" },
		);

		if (!response.ok) {
			const payload = (await response.json()) as { error?: string };

			setAuthMessage(payload.error ?? "Could not export your data.");
			setIsExportingData(false);
			return;
		}

		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		const link = document.createElement("a");
		const date = new Date().toISOString().slice(0, 10);

		link.href = objectUrl;
		link.download = `stageselect-export-${date}.json`;
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(objectUrl);

		setAuthMessage("JSON export downloaded.");
		setIsExportingData(false);
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

	function beginStatusAction(
		game: StageSelectGameSearchResult,
		status: string,
	) {
		if (!session) {
			setSearchMessage("Log in before adding games to your library.");
			return;
		}

		const existingGame = libraryByIgdbId.get(game.igdbId);

		if (existingGame) {
			openLibraryModal(existingGame);
			setSearchMessage(`${game.title} is already in your library.`);
			return;
		}

		setReviewModal({ game, status });
		setReviewRating("");
		setReviewBody("");
		setSelectedPlatform(game.platforms[0] ?? "");
		setReviewMessage("");
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

		if (!platform.trim()) {
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
		setSearchMessage(`${game.title} saved as ${getStatusLabel(status)}.`);
		setIsSavingGame(false);
	}

	function openLibraryModal(game: LibraryItem) {
		setLibraryModal({ game });
		setEditStatus(game.status);
		setEditPlatform(game.platform === "-" ? "" : game.platform);
		setEditRating(game.rating === "-" ? "" : game.rating);
		setEditReview(game.review);
		setIsEditReviewOpen(false);
		setLibraryActionMessage("");
	}

	async function updateLibraryGame() {
		if (!supabase || !session || !libraryModal) {
			return;
		}

		if (!editPlatform.trim()) {
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

			setLibraryActionMessage(
				payload.error ?? "Could not remove this game.",
			);
			setIsSavingGame(false);
			return;
		}

		await loadUserData(session);
		setLibraryModal(null);
		setIsSavingGame(false);
	}

	return (
		<main
			className="flex w-full flex-1 justify-center bg-[var(--stage-bg)] px-4 py-8 text-[var(--stage-text)] sm:py-10"
			style={stageSelectThemes[themeMode]}
		>
			<div className="flex w-full max-w-6xl flex-col gap-8">
				<section className="grid gap-6 border-b border-[var(--stage-border)] pb-8 lg:grid-cols-[minmax(0,1fr)_340px]">
					<div>
						<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
							/projects/stageselect
						</p>
						<h1 className="mt-3 font-mono text-4xl font-bold uppercase tracking-normal text-[var(--stage-heading)] sm:text-5xl">
							StageSelect
						</h1>
						<p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--stage-subtle)] sm:text-base">
							Keep the backlog honest, remember what clicked, and
							give every finished game a little closing ceremony.
						</p>
						<div
							aria-label="StageSelect color mode"
							className={cx(
								"mt-4 inline-flex items-center border p-0.5 font-mono text-[11px] font-bold",
								themeAwareClasses.toggle[themeMode],
							)}
							role="group"
						>
							<button
								aria-pressed={themeMode === "light"}
								aria-label="Use light mode"
								className={cx(
									"grid h-5 w-6 place-items-center transition",
									themeMode === "light"
										? themeAwareClasses.toggleOption
												.activeLight
										: themeAwareClasses.toggleOption
												.inactive,
								)}
								onClick={() => setThemeMode("light")}
								type="button"
							>
								<span aria-hidden="true">☼</span>
							</button>
							<button
								aria-pressed={themeMode === "dark"}
								aria-label="Use dark mode"
								className={cx(
									"grid h-5 w-6 place-items-center transition",
									themeMode === "dark"
										? themeAwareClasses.toggleOption
												.activeDark
										: themeAwareClasses.toggleOption
												.inactive,
								)}
								onClick={() => setThemeMode("dark")}
								type="button"
							>
								<span aria-hidden="true">☾</span>
							</button>
						</div>
					</div>

					<div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-panel)] p-4 shadow-sm">
						<div className="flex items-center justify-between gap-3">
							<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
								Account
							</p>
							{session ? (
								<span className="rounded-full border border-[var(--stage-success-border)] bg-[var(--stage-success-bg)] px-3 py-1 text-xs font-medium text-[var(--stage-success-text)]">
									Signed in
								</span>
							) : null}
						</div>

						{session ? (
							<div className="mt-4 grid gap-4">
								<div>
									<p className="text-sm text-[var(--stage-muted)]">
										Logged in as
									</p>
									<p className="mt-1 break-all text-sm font-medium text-[var(--stage-heading)]">
										{profile?.display_name ??
											session.user.email}
									</p>
									{profile?.display_name ? (
										<p className="mt-1 break-all text-xs text-[var(--stage-muted)]">
											{session.user.email}
										</p>
									) : null}
								</div>
								<button
									className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isAuthLoading || isExportingData}
									onClick={downloadUserData}
									type="button"
								>
									{isExportingData
										? "Preparing"
										: "Download JSON"}
								</button>
								{isChangePasswordOpen ? (
									<form
										className="grid gap-3 border-t border-[var(--stage-divider)] pt-4"
										onSubmit={changePassword}
									>
										<input
											aria-label="New password"
											autoComplete="new-password"
											className="w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
											disabled={isAuthLoading}
											minLength={6}
											onChange={(event) =>
												setNewPassword(
													event.target.value,
												)
											}
											placeholder="new password"
											type="password"
											value={newPassword}
										/>
										<input
											aria-label="Confirm new password"
											autoComplete="new-password"
											className="w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
											disabled={isAuthLoading}
											minLength={6}
											onChange={(event) =>
												setConfirmNewPassword(
													event.target.value,
												)
											}
											placeholder="confirm new password"
											type="password"
											value={confirmNewPassword}
										/>
										<div className="grid grid-cols-2 gap-3">
											<button
												className="rounded-md bg-[var(--stage-accent)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-accent-text)] shadow-sm transition hover:bg-[var(--stage-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
												disabled={
													isAuthLoading ||
													!newPassword ||
													!confirmNewPassword
												}
												type="submit"
											>
												{isAuthLoading
													? "Changing"
													: "Save password"}
											</button>
											<button
												className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:cursor-not-allowed disabled:opacity-60"
												disabled={isAuthLoading}
												onClick={() => {
													setNewPassword("");
													setConfirmNewPassword("");
													setIsChangePasswordOpen(
														false,
													);
													setAuthMessage(
														"Signed in.",
													);
												}}
												type="button"
											>
												Cancel
											</button>
										</div>
									</form>
								) : (
									<button
										className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:cursor-not-allowed disabled:opacity-60"
										disabled={
											isAuthLoading || isExportingData
										}
										onClick={() => {
											setIsChangePasswordOpen(true);
											setAuthMessage(
												"Enter and confirm your new password.",
											);
										}}
										type="button"
									>
										Change password
									</button>
								)}
								<button
									className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isAuthLoading || isExportingData}
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
									className="w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
									onChange={(event) =>
										setEmail(event.target.value)
									}
									placeholder="email@example.com"
									type="email"
									value={email}
								/>
								<input
									aria-label="Password"
									className="w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
									onChange={(event) =>
										setPassword(event.target.value)
									}
									placeholder="password"
									type="password"
									value={password}
								/>
								<div className="grid grid-cols-2 gap-3">
									<button
										className="rounded-md bg-[var(--stage-accent)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-accent-text)] shadow-sm transition hover:bg-[var(--stage-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
										disabled={
											isAuthLoading || !email || !password
										}
										onClick={signUp}
										type="button"
									>
										Sign up
									</button>
									<button
										className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:cursor-not-allowed disabled:opacity-60"
										disabled={
											isAuthLoading || !email || !password
										}
										onClick={logIn}
										type="button"
									>
										Log in
									</button>
								</div>
							</div>
						)}

						<p className="mt-3 min-h-5 text-xs text-[var(--stage-muted)]">
							{authMessage}
						</p>
					</div>
				</section>

				<section>
					<div className="flex flex-wrap gap-2 border-b border-[var(--stage-border)]">
						{tabs.map((tab) => (
							<button
								className={[
									"border-b-2 px-4 py-3 font-mono text-xs font-bold uppercase transition",
									activeTab === tab.value
										? "border-[var(--stage-accent)] text-[var(--stage-heading)]"
										: "border-transparent text-[var(--stage-muted)] hover:text-[var(--stage-text)]",
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
							<div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-sm">
								<form
									className="flex flex-col gap-3 sm:flex-row sm:items-end"
									onSubmit={searchGames}
								>
									<label className="flex-1">
										<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
											Search IGDB
										</span>
										<input
											className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-base text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
											onChange={(event) =>
												setSearchQuery(
													event.target.value,
												)
											}
											placeholder="Search for a game"
											type="search"
											value={searchQuery}
										/>
									</label>
									<button
										className="rounded-md bg-[var(--stage-accent)] px-5 py-3 font-mono text-xs font-bold uppercase text-[var(--stage-accent-text)] shadow-sm transition hover:bg-[var(--stage-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
										disabled={
											isSearching || !searchQuery.trim()
										}
										type="submit"
									>
										{isSearching ? "Searching" : "Search"}
									</button>
								</form>

								<p className="mt-3 text-sm text-[var(--stage-muted)]">
									{searchMessage}
								</p>

								<div className="mt-6 grid gap-4">
									{searchResults.length > 0 ? (
										searchResults.map((game) => {
											const libraryGame =
												libraryByIgdbId.get(
													game.igdbId,
												);

											return (
												<article
													className={[
														"grid gap-4 rounded-lg border border-[var(--stage-border)] bg-[var(--stage-card)] p-4 transition hover:border-[var(--stage-hover-border)] sm:grid-cols-[88px_minmax(0,1fr)]",
														libraryGame
															? "cursor-pointer hover:shadow-sm"
															: "",
													].join(" ")}
													key={game.igdbId}
													onClick={() => {
														if (libraryGame) {
															openLibraryModal(
																libraryGame,
															);
															setSearchMessage(
																`${game.title} is already in your library.`,
															);
														}
													}}
													onKeyDown={(event) => {
														if (
															libraryGame &&
															(event.key ===
																"Enter" ||
																event.key ===
																	" ")
														) {
															event.preventDefault();
															openLibraryModal(
																libraryGame,
															);
															setSearchMessage(
																`${game.title} is already in your library.`,
															);
														}
													}}
													role={
														libraryGame
															? "button"
															: undefined
													}
													tabIndex={
														libraryGame
															? 0
															: undefined
													}
												>
													{game.coverUrl ? (
														<img
															alt=""
															className="h-28 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-cover)] object-cover sm:w-[88px]"
															src={game.coverUrl}
														/>
													) : (
														<div className="flex h-28 items-center justify-center rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-cover)] font-mono text-xs uppercase text-[var(--stage-muted)]">
															Cover
														</div>
													)}
													<div>
														<div className="flex flex-wrap items-start justify-between gap-3">
															<div>
																<h2 className="font-mono text-xl font-bold uppercase tracking-normal text-[var(--stage-heading)]">
																	{game.title}
																</h2>
																<p className="mt-1 text-sm text-[var(--stage-muted)]">
																	{formatGameMeta(
																		game,
																	)}
																</p>
															</div>
															{game.genres[0] ? (
																<span className="rounded-full border border-[var(--stage-info-border)] bg-[var(--stage-info-bg)] px-3 py-1 font-mono text-xs uppercase text-[var(--stage-info-text)]">
																	{
																		game
																			.genres[0]
																	}
																</span>
															) : null}
															{libraryGame ? (
																<span className="rounded-full border border-[var(--stage-success-border)] bg-[var(--stage-success-bg)] px-3 py-1 font-mono text-xs uppercase text-[var(--stage-success-text)]">
																	In library
																</span>
															) : null}
														</div>
														{game.summary ? (
															<p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--stage-subtle)]">
																{game.summary}
															</p>
														) : null}
														<div className="mt-4 flex flex-wrap gap-2">
															{statuses.map(
																(status) => (
																	<button
																		className={[
																			"rounded-full px-3 py-1 font-mono text-xs uppercase transition disabled:cursor-not-allowed disabled:opacity-60",
																			getStatusChipClass(
																				status.value,
																				themeMode,
																			),
																		].join(
																			" ",
																		)}
																		disabled={
																			isSavingGame
																		}
																		key={
																			status.value
																		}
																		onClick={(
																			event,
																		) => {
																			event.stopPropagation();
																			beginStatusAction(
																				game,
																				status.value,
																			);
																		}}
																		type="button"
																	>
																		{
																			status.label
																		}
																	</button>
																),
															)}
														</div>
													</div>
												</article>
											);
										})
									) : (
										<div className="rounded-lg border border-dashed border-[var(--stage-control-border)] bg-[var(--stage-card)] px-4 py-8 text-center text-sm text-[var(--stage-muted)]">
											Results will appear here with cover
											art, platforms, genres, and quick
											status actions.
										</div>
									)}
								</div>
							</div>
						) : activeTab === "library" ? (
							<div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-sm">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
									<div>
										<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
											My games
										</p>
										<h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[var(--stage-heading)]">
											Library
										</h2>
									</div>
									<div className="flex flex-wrap gap-2">
										<select
											aria-label="Filter library by platform"
											className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
											onChange={(event) =>
												setPlatformFilter(
													event.target.value,
												)
											}
											value={platformFilter}
										>
											<option value="all">
												All platforms
											</option>
											{platformOptions.map((platform) => (
												<option
													key={platform}
													value={platform}
												>
													{platform}
												</option>
											))}
										</select>
										<select
											aria-label="Filter library by status"
											className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
											onChange={(event) =>
												setStatusFilter(
													event.target.value,
												)
											}
											value={statusFilter}
										>
											<option value="all">
												All statuses
											</option>
											{statuses.map((status) => (
												<option
													key={status.value}
													value={status.value}
												>
													{status.label}
												</option>
											))}
										</select>
										<select
											aria-label="Filter library by review"
											className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
											onChange={(event) =>
												setReviewFilter(
													event.target.value,
												)
											}
											value={reviewFilter}
										>
											<option value="all">
												All reviews
											</option>
											<option value="reviewed">
												Reviewed
											</option>
											<option value="unreviewed">
												No review
											</option>
										</select>
										<select
											aria-label="Sort library"
											className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
											onChange={(event) =>
												setSortMode(event.target.value)
											}
											value={sortMode}
										>
											<option value="title">Title</option>
											<option value="rating">
												Rating high
											</option>
											<option value="rating-asc">
												Rating low
											</option>
											<option value="release-desc">
												Newest
											</option>
											<option value="release-asc">
												Oldest
											</option>
											<option value="status">
												Status
											</option>
											<option value="platform">
												Platform
											</option>
										</select>
									</div>
								</div>

								<div className="mt-2 flex flex-col gap-3 sm:flex-row sm:justify-end sm:gap-5">
									<RangeFilter
										label="Rating"
										max={defaultRatingMax}
										min={defaultRatingMin}
										onMaxChange={(value) =>
											setRatingMaxFilter(
												Math.max(value, ratingMinFilter),
											)
										}
										onMinChange={(value) =>
											setRatingMinFilter(
												Math.min(value, ratingMaxFilter),
											)
										}
										step={0.5}
										tickStep={0.5}
										valueMax={ratingMaxFilter}
										valueMin={ratingMinFilter}
										valueText={`${formatRatingFilter(ratingMinFilter)} to ${formatRatingFilter(ratingMaxFilter)}`}
									/>

									<RangeFilter
										label="Year"
										max={releaseYearBounds.max}
										min={releaseYearBounds.min}
										onMaxChange={(value) =>
											setReleaseMaxFilter(
												Math.max(
													value,
													getVisibleReleaseMin(
														releaseMinFilter,
														releaseYearBounds.min,
													),
												),
											)
										}
										onMinChange={(value) =>
											setReleaseMinFilter(
												Math.min(
													value,
													getVisibleReleaseMax(
														releaseMaxFilter,
														releaseYearBounds.max,
													),
												),
											)
										}
										step={1}
										tickStep={getYearTickStep(
											releaseYearBounds.min,
											releaseYearBounds.max,
										)}
										valueMax={getVisibleReleaseMax(
											releaseMaxFilter,
											releaseYearBounds.max,
										)}
										valueMin={getVisibleReleaseMin(
											releaseMinFilter,
											releaseYearBounds.min,
										)}
										valueText={`${getVisibleReleaseMin(releaseMinFilter, releaseYearBounds.min)} to ${getVisibleReleaseMax(releaseMaxFilter, releaseYearBounds.max)}`}
									/>
								</div>

								<p className="mt-4 text-sm text-[var(--stage-muted)]">
									{libraryMessage}
								</p>

								<label className="mt-3 block w-full">
									<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
										Search library
									</span>
									<input
										aria-label="Search library"
										className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-sm font-medium text-[var(--stage-strong)] outline-none transition placeholder:text-[var(--stage-faint)] focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
										onChange={(event) =>
											setLibrarySearchQuery(
												event.target.value,
											)
										}
										placeholder="Search title, platform, status, year, review"
										type="search"
										value={librarySearchQuery}
									/>
								</label>

								<div className="mt-5">
									{visibleLibrary.length > 0 ? (
										<>
											<div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--stage-muted)]">
												<span>
													Showing{" "}
													{pagedLibrary.length} of{" "}
													{visibleLibrary.length}
												</span>
												{pagedLibrary.length >
												libraryPageSize ? (
													<button
														className="font-mono font-bold uppercase text-[var(--stage-text)] transition hover:text-[var(--stage-heading)] disabled:cursor-not-allowed disabled:opacity-50"
														disabled={
															pagedLibrary.length >=
															visibleLibrary.length
														}
														onClick={() =>
															setLibraryVisibleCount(
																libraryPageSize,
															)
														}
														type="button"
													>
														Reset
													</button>
												) : null}
											</div>
											<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
												{pagedLibrary.map((game) => (
													<button
														className="overflow-hidden rounded-lg border border-[var(--stage-border)] bg-[var(--stage-card)] text-left transition hover:-translate-y-0.5 hover:border-[var(--stage-hover-border)] hover:shadow-sm"
														key={game.id}
														onClick={() =>
															openLibraryModal(
																game,
															)
														}
														type="button"
													>
														<div className="grid grid-cols-[96px_minmax(0,1fr)] items-start">
															{game.coverUrl ? (
																<img
																	alt=""
																	className="aspect-[3/4] w-full bg-[var(--stage-cover)] object-contain p-1"
																	src={
																		game.coverUrl
																	}
																/>
															) : (
																<div className="flex aspect-[3/4] w-full items-center justify-center bg-[var(--stage-cover)] font-mono text-xs uppercase text-[var(--stage-muted)]">
																	Cover
																</div>
															)}
															<div className="p-3">
																<div className="grid gap-2">
																	<h3 className="font-mono text-sm font-bold uppercase tracking-normal text-[var(--stage-heading)]">
																		{
																			game.title
																		}
																	</h3>
																	<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
																		{
																			game.releaseYear
																		}
																	</p>
																	<span className="w-fit rounded-full border border-[var(--stage-border)] bg-[var(--stage-panel)] px-2 py-1 text-xs text-[var(--stage-strong)]">
																		<StarRating
																			rating={
																				game.rating
																			}
																		/>
																	</span>
																</div>
																<div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--stage-subtle)]">
																	<span
																		className={[
																			"rounded-full px-2 py-1 font-mono uppercase",
																			getStatusChipClass(
																				game.status,
																				themeMode,
																			),
																		].join(
																			" ",
																		)}
																	>
																		{getStatusLabel(
																			game.status,
																		)}
																	</span>
																	<span
																		className={[
																			"rounded-full px-2 py-1",
																			getPlatformChipClass(
																				game.platform,
																				themeMode,
																			),
																		].join(
																			" ",
																		)}
																	>
																		{
																			game.platform
																		}
																	</span>
																</div>
																{game.review ? (
																	<p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--stage-muted)]">
																		{
																			game.review
																		}
																	</p>
																) : null}
															</div>
														</div>
													</button>
												))}
											</div>
											{pagedLibrary.length <
											visibleLibrary.length ? (
												<div className="mt-5 flex justify-center">
													<button
														className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-4 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)]"
														onClick={() =>
															setLibraryVisibleCount(
																(count) =>
																	Math.min(
																		count +
																			libraryPageSize,
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
										<div className="rounded-lg border border-dashed border-[var(--stage-control-border)] bg-[var(--stage-card)] px-4 py-8 text-center text-sm text-[var(--stage-muted)]">
											{isLibraryLoading
												? "Loading..."
												: "No games match this library view yet."}
										</div>
									)}
								</div>
							</div>
						) : (
							<div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-sm">
								<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
									<div>
										<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
											Mini dashboard
										</p>
										<h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[var(--stage-heading)]">
											Stats
										</h2>
									</div>
									<p className="text-sm text-[var(--stage-muted)]">
										{session
											? `${libraryStats.totalGames} saved game${libraryStats.totalGames === 1 ? "" : "s"}`
											: "Log in to load your stats."}
									</p>
								</div>

								{libraryStats.totalGames > 0 ? (
									<>
										<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
											<StatTile
												label="Games"
												value={String(
													libraryStats.totalGames,
												)}
											/>
											<StatTile
												label="Rated"
												value={String(
													libraryStats.ratedGames,
												)}
											/>
											<StatTile
												label="Reviewed"
												value={String(
													libraryStats.reviewedGames,
												)}
											/>
											<StatTile
												label="Avg rating"
												value={
													libraryStats.averageRating >
													0
														? libraryStats.averageRating.toFixed(
																1,
															)
														: "-"
												}
											/>
											<StatTile
												label="Finished"
												value={String(
													libraryStats.finishedGames,
												)}
											/>
											<StatTile
												label="The queue"
												value={String(
													libraryStats.queueGames,
												)}
											/>
											<StatTile
												label="Finish rate"
												value={
													libraryStats.decidedGames >
													0
														? `${libraryStats.finishRate}%`
														: "-"
												}
											/>
											<StatTile
												label="Five-star club"
												value={String(
													libraryStats.fiveStarGames,
												)}
											/>
										</div>

										<div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
											<ChartPanel title="By status">
												<BarChart
													rows={
														libraryStats.statusRows
													}
												/>
											</ChartPanel>
											<ChartPanel title="By platform">
												<BarChart
													rows={
														libraryStats.platformRows
													}
												/>
											</ChartPanel>
											<div className="lg:col-span-2">
												<ChartPanel title="Every rating">
													<BarChart
														rows={
															libraryStats.ratingRows
														}
													/>
												</ChartPanel>
											</div>
											<ChartPanel title="Rating by platform">
												<BarChart
													maxValue={5}
													rows={
														libraryStats.ratingByPlatformRows
													}
													valueSuffix="/5"
												/>
											</ChartPanel>
											<ChartPanel title="Rating by status">
												<BarChart
													maxValue={5}
													rows={
														libraryStats.ratingByStatusRows
													}
													valueSuffix="/5"
												/>
											</ChartPanel>
										</div>

										<div className="mt-4 grid gap-4 lg:grid-cols-2">
											<ChartPanel title="Your home turf">
												<div className="rounded-lg bg-[var(--stage-panel)] p-4">
													<p className="text-xs uppercase text-[var(--stage-muted)]">
														Most-played platform
													</p>
													<p className="mt-2 font-mono text-2xl font-bold uppercase text-[var(--stage-heading)]">
														{
															libraryStats.favoritePlatform
														}
													</p>
													<p className="mt-2 text-sm leading-6 text-[var(--stage-muted)]">
														The platform showing up
														most often across your
														saved games.
													</p>
												</div>
											</ChartPanel>
											<ChartPanel title="Top shelf">
												{libraryStats.topRatedTitles
													.length > 0 ? (
													<div className="grid gap-2">
														{libraryStats.topRatedTitles.map(
															(game, index) => (
																<div
																	className="flex items-center justify-between gap-4 rounded-lg bg-[var(--stage-panel)] px-4 py-3"
																	key={
																		game.id
																	}
																>
																	<div className="min-w-0">
																		<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
																			#
																			{index +
																				1}
																		</p>
																		<p className="truncate text-sm font-medium text-[var(--stage-heading)]">
																			{
																				game.title
																			}
																		</p>
																	</div>
																	<StarRating
																		rating={
																			game.rating
																		}
																	/>
																</div>
															),
														)}
													</div>
												) : (
													<p className="text-sm text-[var(--stage-muted)]">
														Rate a game to start
														your top shelf.
													</p>
												)}
											</ChartPanel>
										</div>
									</>
								) : (
									<div className="mt-5 rounded-lg border border-dashed border-[var(--stage-control-border)] bg-[var(--stage-card)] px-4 py-8 text-center text-sm text-[var(--stage-muted)]">
										{isLibraryLoading
											? "Loading..."
											: "Save games to build your dashboard."}
									</div>
								)}
							</div>
						)}
					</div>
				</section>
			</div>

			{reviewModal ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--stage-overlay)] px-4 py-8">
					<div className="w-full max-w-lg rounded-xl border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-xl">
						<div className="flex items-start justify-between gap-4">
							<div>
								<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
									{getStatusLabel(reviewModal.status)}
								</p>
								<h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[var(--stage-heading)]">
									{reviewModal.game.title}
								</h2>
							</div>
							<button
								className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
								onClick={() => setReviewModal(null)}
								type="button"
							>
								Close
							</button>
						</div>

						<label className="mt-5 block">
							<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
								Platform
							</span>
							<select
								className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
								onChange={(event) =>
									setSelectedPlatform(event.target.value)
								}
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

						{stageselectReviewStatuses.has(reviewModal.status) ? (
							<>
								<label className="mt-4 block">
									<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
										Stars
									</span>
									<select
										className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
										onChange={(event) =>
											setReviewRating(event.target.value)
										}
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
									<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
										Review
									</span>
									<textarea
										className="mt-2 min-h-32 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
										onChange={(event) =>
											setReviewBody(event.target.value)
										}
										placeholder="Optional notes, thoughts, or verdict."
										value={reviewBody}
									/>
								</label>
							</>
						) : null}

						{reviewMessage ? (
							<p className="mt-3 text-sm text-[var(--stage-danger-message)]">
								{reviewMessage}
							</p>
						) : null}

						<div className="mt-5 flex flex-wrap justify-end gap-3">
							<button
								className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-4 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)]"
								onClick={() => setReviewModal(null)}
								type="button"
							>
								Cancel
							</button>
							<button
								className="rounded-md bg-[var(--stage-accent)] px-4 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-accent-text)] shadow-sm transition hover:bg-[var(--stage-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
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
								{isSavingGame
									? "Saving"
									: `Save ${getStatusLabel(reviewModal.status)}`}
							</button>
						</div>
					</div>
				</div>
			) : null}

			{libraryModal ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--stage-overlay)] px-4 py-8">
					<div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-xl">
						<div className="grid gap-5 sm:grid-cols-[150px_minmax(0,1fr)]">
							{libraryModal.game.coverUrl ? (
								<img
									alt=""
									className="aspect-[3/4] w-full rounded-lg bg-[var(--stage-cover)] object-contain p-2"
									src={libraryModal.game.coverUrl}
								/>
							) : (
								<div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-[var(--stage-cover)] font-mono text-xs uppercase text-[var(--stage-muted)]">
									Cover
								</div>
							)}

							<div>
								<div className="flex items-start justify-between gap-4">
									<div>
										<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
											{libraryModal.game.releaseYear}
										</p>
										<h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[var(--stage-heading)]">
											{libraryModal.game.title}
										</h2>
									</div>
									<button
										className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
										onClick={() => setLibraryModal(null)}
										type="button"
									>
										Close
									</button>
								</div>

								{libraryModal.game.review ? (
									<div className="mt-4 rounded-lg bg-[var(--stage-bg)] p-4">
										<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
											My review
										</p>
										<p className="mt-2 text-sm leading-6 text-[var(--stage-strong)]">
											{libraryModal.game.review}
										</p>
									</div>
								) : null}
							</div>
						</div>

						<div className="mt-5 grid gap-4 sm:grid-cols-3">
							<label>
								<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
									Status
								</span>
								<select
									className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
									onChange={(event) =>
										setEditStatus(event.target.value)
									}
									value={editStatus}
								>
									{statuses.map((status) => (
										<option
											key={status.value}
											value={status.value}
										>
											{status.label}
										</option>
									))}
								</select>
							</label>

							<label>
								<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
									Platform
								</span>
								<select
									className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
									onChange={(event) =>
										setEditPlatform(event.target.value)
									}
									value={editPlatform}
								>
									<option value="">Choose platform</option>
									{libraryModal.game.platformOptions.map(
										(platform) => (
											<option
												key={platform}
												value={platform}
											>
												{platform}
											</option>
										),
									)}
								</select>
							</label>

							<label>
								<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
									Stars
								</span>
								<select
									className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
									onChange={(event) =>
										setEditRating(event.target.value)
									}
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

						<div className="mt-4">
							<button
								aria-expanded={isEditReviewOpen}
								className="flex w-full items-center justify-between rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-card)] px-3 py-2 text-left font-mono text-xs font-bold uppercase text-[var(--stage-strong)] transition hover:bg-[var(--stage-hover)]"
								onClick={() =>
									setIsEditReviewOpen((isOpen) => !isOpen)
								}
								type="button"
							>
								<span>
									{libraryModal.game.review
										? "Edit review"
										: "Add review"}
								</span>
								<span aria-hidden="true">
									{isEditReviewOpen ? "v" : ">"}
								</span>
							</button>

							{isEditReviewOpen ? (
								<label className="mt-3 block">
									<span className="font-mono text-xs uppercase text-[var(--stage-muted)]">
										Review
									</span>
									<textarea
										className="mt-2 min-h-32 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-3 text-sm text-[var(--stage-text)] outline-none transition focus:border-[var(--stage-accent)] focus:ring-2 focus:ring-[var(--stage-focus-ring)]"
										onChange={(event) =>
											setEditReview(event.target.value)
										}
										value={editReview}
									/>
								</label>
							) : null}
						</div>

						{libraryActionMessage ? (
							<p className="mt-3 text-sm text-[var(--stage-danger-message)]">
								{libraryActionMessage}
							</p>
						) : null}

						<div className="mt-5 flex flex-wrap justify-between gap-3">
							<button
								className="rounded-md border border-[var(--stage-danger-border)] bg-[var(--stage-danger-bg)] px-4 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-danger-text)] transition hover:bg-[var(--stage-danger-hover)] disabled:cursor-not-allowed disabled:opacity-60"
								disabled={isSavingGame}
								onClick={removeLibraryGame}
								type="button"
							>
								Remove
							</button>
							<div className="flex flex-wrap gap-3">
								<button
									className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-4 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)]"
									onClick={() => setLibraryModal(null)}
									type="button"
								>
									Cancel
								</button>
								<button
									className="rounded-md border border-[var(--stage-success-border)] bg-[var(--stage-success-bg)] px-4 py-2 font-mono text-xs font-bold uppercase text-[var(--stage-success-text)] shadow-sm transition hover:bg-[var(--stage-hover)] disabled:cursor-not-allowed disabled:opacity-60"
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

function StatTile({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-card)] p-4">
			<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
				{label}
			</p>
			<p className="mt-2 font-mono text-3xl font-bold tracking-normal text-[var(--stage-heading)]">
				{value}
			</p>
		</div>
	);
}

function ChartPanel({
	children,
	title,
}: {
	children: ReactNode;
	title: string;
}) {
	return (
		<section className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-card)] p-4">
			<h3 className="font-mono text-sm font-bold uppercase tracking-normal text-[var(--stage-heading)]">
				{title}
			</h3>
			<div className="mt-4">{children}</div>
		</section>
	);
}

function RangeFilter({
	label,
	max,
	min,
	onMaxChange,
	onMinChange,
	step,
	tickStep,
	valueMax,
	valueMin,
	valueText,
}: {
	label: string;
	max: number;
	min: number;
	onMaxChange: (value: number) => void;
	onMinChange: (value: number) => void;
	step: number;
	tickStep: number;
	valueMax: number;
	valueMin: number;
	valueText: string;
}) {
	const ticks = getRangeTicks(min, max, tickStep);
	const inputListId = `stageselect-${label.toLowerCase()}-ticks`;
	const rangeStart = getRangePercent(valueMin, min, max);
	const rangeEnd = getRangePercent(valueMax, min, max);

	return (
		<div className="w-full sm:w-64">
			<div className="flex items-center justify-between gap-3">
				<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-muted)]">
					{label}
				</p>
				<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-strong)]">
					{valueText}
				</p>
			</div>
			<div className="relative mt-2 h-7">
				<div className="absolute left-0 right-0 top-3 h-1 rounded-full bg-[var(--stage-divider)]" />
				<div
					className="absolute top-3 h-1 rounded-full bg-[var(--stage-accent)]"
					style={{
						left: `${rangeStart}%`,
						right: `${100 - rangeEnd}%`,
					}}
				/>
				<div className="absolute left-0 right-0 top-2.5 flex justify-between">
					{ticks.map((tick) => (
						<span
							aria-hidden="true"
							className="h-2 w-px bg-[#b8c2d1]"
							key={tick}
						/>
					))}
				</div>
				<input
					aria-label={`${label} minimum`}
					className="pointer-events-none absolute inset-x-0 top-0 z-20 h-7 w-full appearance-none bg-transparent accent-[var(--stage-accent)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
					list={inputListId}
					max={max}
					min={min}
					onChange={(event) =>
						onMinChange(Number(event.target.value))
					}
					step={step}
					type="range"
					value={valueMin}
				/>
				<input
					aria-label={`${label} maximum`}
					className="pointer-events-none absolute inset-x-0 top-0 z-30 h-7 w-full appearance-none bg-transparent accent-[var(--stage-accent)] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30"
					list={inputListId}
					max={max}
					min={min}
					onChange={(event) =>
						onMaxChange(Number(event.target.value))
					}
					step={step}
					type="range"
					value={valueMax}
				/>
				<datalist id={inputListId}>
					{ticks.map((tick) => (
						<option
							key={tick}
							value={tick}
						/>
					))}
				</datalist>
			</div>
		</div>
	);
}

function getRangePercent(value: number, min: number, max: number) {
	if (max <= min) {
		return 0;
	}

	return ((value - min) / (max - min)) * 100;
}

function getRangeTicks(min: number, max: number, step: number) {
	const ticks: number[] = [];

	for (let tick = min; tick <= max; tick += step) {
		ticks.push(Number(tick.toFixed(2)));
	}

	if (ticks[ticks.length - 1] !== max) {
		ticks.push(max);
	}

	return ticks;
}

function getYearTickStep(min: number, max: number) {
	const range = max - min;

	if (range <= 12) {
		return 1;
	}

	if (range <= 40) {
		return 5;
	}

	return 10;
}

function BarChart({
	maxValue: maxValueOverride,
	rows,
	valueSuffix = "",
}: {
	maxValue?: number;
	rows: ChartRow[];
	valueSuffix?: string;
}) {
	const maxValue =
		maxValueOverride ?? Math.max(1, ...rows.map((row) => row.value));

	return (
		<div className="grid gap-3">
			{rows.length > 0 ? (
				rows.map((row) => (
					<div className="grid gap-1" key={row.label}>
						<div className="flex items-center justify-between gap-3 text-xs">
							<span className="truncate text-[var(--stage-strong)]">
								{row.label}
							</span>
							<span className="font-mono font-bold text-[var(--stage-heading)]">
								{formatChartValue(row.value)}
								{valueSuffix}
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-[var(--stage-cover)]">
							<div
								className={[
									"h-full rounded-full",
									row.className ?? "bg-[var(--stage-faint)]",
								].join(" ")}
								style={{
									width: `${(row.value / maxValue) * 100}%`,
								}}
							/>
						</div>
					</div>
				))
			) : (
				<p className="text-sm text-[var(--stage-muted)]">No data yet.</p>
			)}
		</div>
	);
}

function getAverageRatingRows(
	items: LibraryItem[],
	getLabel: (item: LibraryItem) => string,
	getClassName: (label: string, index: number) => string,
) {
	const groups = new Map<string, { count: number; total: number }>();

	items.forEach((item) => {
		const label = getLabel(item);
		const rating = getSortableRating(item.rating);

		if (!label || label === "-" || rating <= 0) {
			return;
		}

		const group = groups.get(label) ?? { count: 0, total: 0 };

		group.count += 1;
		group.total += rating;
		groups.set(label, group);
	});

	return Array.from(groups, ([label, group], index) => ({
		label,
		value: Number((group.total / group.count).toFixed(1)),
		className: getClassName(label, index),
	})).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getCountRows(values: string[]) {
	const counts = new Map<string, number>();

	values.forEach((value) => {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	});

	return Array.from(counts, ([label, value]) => ({
		label,
		value,
		className: "bg-[#2dd4bf]",
	})).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function getSortableRating(rating: string) {
	const value = Number(rating);

	return Number.isFinite(value) ? value : -1;
}

function getSortableYear(releaseYear: string) {
	const value = Number(releaseYear);

	return Number.isFinite(value) ? value : -1;
}

function StarRating({ rating }: { rating: string }) {
	const value = Number(rating);

	if (!Number.isFinite(value)) {
		return <span aria-label="No rating">-</span>;
	}

	const roundedValue = Math.max(0, Math.min(5, value));

	return (
		<span
			aria-label={`${roundedValue} out of 5 stars`}
			className="inline-flex items-center gap-1.5"
			title={`${roundedValue} / 5`}
		>
			<span className="flex items-center gap-0.5">
				{Array.from({ length: 5 }, (_item, index) => {
					const fill = Math.max(0, Math.min(1, roundedValue - index));

					return <StarIcon fill={fill} key={index} />;
				})}
			</span>
			<span className="rounded bg-[var(--stage-rating-bg)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--stage-rating-text)]">
				{formatRating(roundedValue)}
			</span>
		</span>
	);
}

function StarIcon({ fill }: { fill: number }) {
	const clippedPercentage = `${(1 - fill) * 100}%`;

	return (
		<svg
			aria-hidden="true"
			className="h-4 w-4 shrink-0"
			viewBox="0 0 16 16"
		>
			<path
				d="M8 1.4 10 5.5l4.5.7-3.2 3.2.8 4.5L8 11.8l-4.1 2.1.8-4.5-3.2-3.2 4.5-.7L8 1.4Z"
				fill="var(--stage-star-empty-fill)"
				stroke="var(--stage-star-empty-stroke)"
				strokeLinejoin="round"
				strokeWidth="1"
			/>
			{fill > 0 ? (
				<path
					d="M8 1.4 10 5.5l4.5.7-3.2 3.2.8 4.5L8 11.8l-4.1 2.1.8-4.5-3.2-3.2 4.5-.7L8 1.4Z"
					fill="var(--stage-star-fill)"
					stroke="var(--stage-star-stroke)"
					strokeLinejoin="round"
					strokeWidth="1"
					style={{ clipPath: `inset(0 ${clippedPercentage} 0 0)` }}
				/>
			) : null}
			{fill === 0.5 ? (
				<line
					stroke="var(--stage-star-half-stroke)"
					strokeLinecap="round"
					strokeWidth="1"
					x1="8"
					x2="8"
					y1="3.2"
					y2="12.2"
				/>
			) : null}
		</svg>
	);
}

function formatRating(rating: number) {
	return Number.isInteger(rating) ? rating.toFixed(1) : String(rating);
}

function formatRatingFilter(rating: number) {
	return rating === 0 ? "Unrated" : `${formatRating(rating)} stars`;
}

function formatChartValue(value: number) {
	return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function getVisibleReleaseMin(value: number, fallback: number) {
	return value === defaultReleaseMin ? fallback : value;
}

function getVisibleReleaseMax(value: number, fallback: number) {
	return value === defaultReleaseMax ? fallback : value;
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

function getStatusChipClass(
	statusValue: string,
	themeMode: StageSelectThemeMode,
) {
	const lightClasses: Record<string, string> = {
		finished: "bg-[#ecfdf3] text-[#027a48]",
		left: "bg-[#fffaeb] text-[#b54708]",
		playing: "bg-[#eff8ff] text-[#175cd3]",
		backlogged: "bg-[#fff1f3] text-[#c01048]",
		wishlisted: "bg-[#f5f3ff] text-[#6941c6]",
	};
	const darkClasses: Record<string, string> = {
		finished: "border border-[#1f6f4a] bg-[#153b2c] text-[#86efac]",
		left: "border border-[#855b19] bg-[#3d2c12] text-[#fbbf24]",
		playing: "border border-[#256d85] bg-[#142f3b] text-[#67e8f9]",
		backlogged: "border border-[#7f1d1d] bg-[#3b1212] text-[#fca5a5]",
		wishlisted: "border border-[#5b3f8a] bg-[#2f2448] text-[#d8b4fe]",
	};

	if (themeMode === "light") {
		return lightClasses[statusValue] ?? "bg-white text-[#394150]";
	}

	return darkClasses[statusValue] ?? "border border-[var(--stage-control-border)] bg-[var(--stage-panel)] text-[var(--stage-strong)]";
}

function getStatusBarClass(statusValue: string) {
	const classes: Record<string, string> = {
		finished: "bg-[#22c55e]",
		left: "bg-[#f59e0b]",
		playing: "bg-[#06b6d4]",
		backlogged: "bg-[#ef4444]",
		wishlisted: "bg-[#a78bfa]",
	};

	return classes[statusValue] ?? "bg-[var(--stage-faint)]";
}

function getPlatformChipClass(
	platform: string,
	themeMode: StageSelectThemeMode = "dark",
) {
	const normalized = platform.toLowerCase();

	if (
		normalized.includes("xbox") ||
		normalized.includes("microsoft windows") ||
		normalized === "pc"
	) {
		if (themeMode === "light") {
			return "bg-[#ecfdf3] text-[#047857]";
		}

		return "border border-[#1f6f4a] bg-[#153b2c] text-[#86efac]";
	}

	if (normalized.includes("playstation") || normalized.includes("ps5")) {
		if (themeMode === "light") {
			return "bg-[#eff6ff] text-[#1d4ed8]";
		}

		return "border border-[#256d85] bg-[#142f3b] text-[#67e8f9]";
	}

	if (
		normalized.includes("nintendo") ||
		normalized.includes("switch") ||
		normalized.includes("wii") ||
		normalized.includes("game boy")
	) {
		if (themeMode === "light") {
			return "bg-[#fff1f2] text-[#be123c]";
		}

		return "border border-[#7f1d1d] bg-[#3b1212] text-[#fca5a5]";
	}

	if (normalized.includes("mac") || normalized.includes("ios")) {
		if (themeMode === "light") {
			return "bg-[#f1f5f9] text-[#475569]";
		}

		return "border border-[#6b6250] bg-[var(--stage-cover)] text-[var(--stage-text)]";
	}

	if (normalized.includes("linux")) {
		if (themeMode === "light") {
			return "bg-[#fefce8] text-[#a16207]";
		}

		return "border border-[#855b19] bg-[#3d2c12] text-[#fbbf24]";
	}

	if (themeMode === "light") {
		return "bg-[#f6f7f9] text-[#4b5563]";
	}

	return "border border-[var(--stage-control-border)] bg-[var(--stage-panel)] text-[var(--stage-subtle)]";
}

function getPlatformBarClass(platform: string, index: number) {
	const chipClass = getPlatformChipClass(platform);

	if (chipClass.includes("86efac")) {
		return "bg-[#22c55e]";
	}

	if (chipClass.includes("67e8f9")) {
		return "bg-[#06b6d4]";
	}

	if (chipClass.includes("fca5a5")) {
		return "bg-[#ef4444]";
	}

	if (chipClass.includes("f2ead0")) {
		return "bg-[var(--stage-faint)]";
	}

	if (chipClass.includes("fbbf24")) {
		return "bg-[#eab308]";
	}

	const fallbackClasses = [
		"bg-[#2dd4bf]",
		"bg-[#a78bfa]",
		"bg-[#f97316]",
		"bg-[#06b6d4]",
		"bg-[#84cc16]",
	];

	return fallbackClasses[index % fallbackClasses.length];
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
