import type {
	DiscoverRecommendation,
	PlayNextRecommendation,
	RecommendationFeedbackAction,
	TasteProfile,
	BlindRankingComparison,
} from "@/lib/stageselect/recommendations";
import type {
	StageSelectDiscoverCandidate,
	StageSelectGameSearchResult,
} from "@/lib/igdb/types";

type RecommendationSection = "play-next" | "discover";

type DisplayRecommendation = PlayNextRecommendation & {
	coverUrl: string | null;
};

type DisplayDiscoverRecommendation = DiscoverRecommendation<
	StageSelectDiscoverCandidate & { id: string }
>;

type HiddenDiscovery = {
	action: "dismissed" | "not_for_me";
	game: StageSelectDiscoverCandidate;
};

type RecommendationsPanelProps = {
	activeSection: RecommendationSection;
	adventure: number;
	blindComparison: BlindRankingComparison | null;
	discoverMessage: string;
	discoverRecommendations: DisplayDiscoverRecommendation[];
	feedbackByIgdbId: Record<number, RecommendationFeedbackAction>;
	feedbackMessage: string;
	feedbackPendingGameId: string;
	hiddenDiscoveries: HiddenDiscovery[];
	isLoading: boolean;
	isDiscoverLoading: boolean;
	isSignedIn: boolean;
	onAdventureChange: (value: number) => void;
	onFeedback: (
		game: StageSelectDiscoverCandidate,
		action: RecommendationFeedbackAction,
	) => void;
	onOpenGame: (gameId: string) => void;
	onRefreshDiscover: () => void;
	onSaveDiscover: (game: StageSelectGameSearchResult) => void;
	onSaveRankingEvaluation: (choice: "left" | "right" | "tie") => void;
	onSectionChange: (section: RecommendationSection) => void;
	onPlatformChange: (platform: string) => void;
	platform: string;
	platformOptions: string[];
	profile: TasteProfile;
	rankingEvaluationChoice?: "left" | "right" | "tie";
	rankingEvaluationMessage: string;
	rankingEvaluationPending: boolean;
	recommendations: DisplayRecommendation[];
};

export function RecommendationsPanel({
	activeSection,
	adventure,
	blindComparison,
	discoverMessage,
	discoverRecommendations,
	feedbackByIgdbId,
	feedbackMessage,
	feedbackPendingGameId,
	hiddenDiscoveries,
	isLoading,
	isDiscoverLoading,
	isSignedIn,
	onAdventureChange,
	onFeedback,
	onOpenGame,
	onRefreshDiscover,
	onSaveDiscover,
	onSaveRankingEvaluation,
	onSectionChange,
	onPlatformChange,
	platform,
	platformOptions,
	profile,
	rankingEvaluationChoice,
	rankingEvaluationMessage,
	rankingEvaluationPending,
	recommendations,
}: RecommendationsPanelProps) {
	const isDiscover = activeSection === "discover";
	const topGenres = Object.entries(profile.genreWeights)
		.filter(([, weight]) => weight > 0)
		.sort((left, right) => right[1] - left[1])
		.slice(0, 5);
	const topOtherFacets = [
		...Object.entries(profile.themeWeights).map(([label, weight]) => ({
			label,
			weight,
			type: "Theme",
		})),
		...Object.entries(profile.gameModeWeights).map(([label, weight]) => ({
			label,
			weight,
			type: "Mode",
		})),
		...Object.entries(profile.playerPerspectiveWeights).map(
			([label, weight]) => ({ label, weight, type: "Perspective" }),
		),
	]
		.filter((item) => item.weight > 0)
		.sort((left, right) => right.weight - left.weight)
		.slice(0, 5);

	return (
		<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
			<section className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-sm">
				<div
					aria-label="Recommendation sections"
					className="mb-5 grid grid-cols-2 rounded-lg border border-[var(--stage-control-border)] bg-[var(--stage-card)] p-1"
					role="tablist"
				>
					{[
						{ value: "play-next" as const, label: "Play Next" },
						{ value: "discover" as const, label: "Discover" },
					].map((section) => (
						<button
							aria-selected={activeSection === section.value}
							className={sectionTabClass(activeSection === section.value)}
							key={section.value}
							onClick={() => onSectionChange(section.value)}
							role="tab"
							type="button"
						>
							{section.label}
						</button>
					))}
				</div>

				<div className="flex flex-col gap-4 border-b border-[var(--stage-divider)] pb-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
							Recommendations / {isDiscover ? "Discover" : "Play next"}
						</p>
						<h2 className="mt-2 font-mono text-2xl font-bold uppercase tracking-normal text-[var(--stage-heading)]">
							{isDiscover ? "Outside your library" : "Your next stage"}
						</h2>
						<p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--stage-muted)]">
							{isDiscover
								? "Games retrieved from IGDB similarity links and preference facets, excluding titles already in your library."
								: "A ranking of games already in your queue using ratings, outcomes, metadata, and platform habits."}
						</p>
					</div>

					<div className="flex min-w-44 flex-col gap-2">
						<label>
							<span className="font-mono text-[10px] font-bold uppercase text-[var(--stage-muted)]">
								Platform
							</span>
							<select
								className="mt-2 w-full rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 text-xs font-medium text-[var(--stage-strong)]"
								onChange={(event) => onPlatformChange(event.target.value)}
								value={platform}
							>
								<option value="all">Any platform</option>
								{platformOptions.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</label>
						{isDiscover ? (
							<button
								className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-[10px] font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:opacity-60"
								disabled={isDiscoverLoading || !isSignedIn}
								onClick={onRefreshDiscover}
								type="button"
							>
								{isDiscoverLoading ? "Loading" : "Refresh candidates"}
							</button>
						) : null}
					</div>
				</div>

				<AdventureControl
					adventure={adventure}
					onAdventureChange={onAdventureChange}
				/>

				{isDiscover && feedbackMessage ? (
					<p
						aria-live="polite"
						className="mt-4 rounded-md border border-[var(--stage-info-border)] bg-[var(--stage-info-bg)] px-3 py-2 text-xs text-[var(--stage-info-text)]"
					>
						{feedbackMessage}
					</p>
				) : null}

				{isDiscover ? (
					<>
						<DiscoverSection
							discoverMessage={discoverMessage}
							feedbackByIgdbId={feedbackByIgdbId}
							feedbackPendingGameId={feedbackPendingGameId}
							isDiscoverLoading={isDiscoverLoading}
							isSignedIn={isSignedIn}
							onFeedback={onFeedback}
							onSaveDiscover={onSaveDiscover}
							platform={platform}
							recommendations={discoverRecommendations}
						/>
						{blindComparison ? (
							<BlindRankingCheck
								choice={rankingEvaluationChoice}
								comparison={blindComparison}
								isPending={rankingEvaluationPending}
								message={rankingEvaluationMessage}
								onChoose={onSaveRankingEvaluation}
							/>
						) : null}
					</>
				) : (
					<PlayNextSection
						isLoading={isLoading}
						isSignedIn={isSignedIn}
						onOpenGame={onOpenGame}
						platform={platform}
						recommendations={recommendations}
					/>
				)}
			</section>

			<PreferenceAside
				activeSection={activeSection}
				feedbackPendingGameId={feedbackPendingGameId}
				hiddenDiscoveries={hiddenDiscoveries}
				onFeedback={onFeedback}
				profile={profile}
				topGenres={topGenres}
				topOtherFacets={topOtherFacets}
			/>
		</div>
	);
}

function BlindRankingCheck({
	choice,
	comparison,
	isPending,
	message,
	onChoose,
}: {
	choice?: "left" | "right" | "tie";
	comparison: BlindRankingComparison;
	isPending: boolean;
	message: string;
	onChoose: (choice: "left" | "right" | "tie") => void;
}) {
	return (
		<details className="mt-6 rounded-lg border border-[var(--stage-control-border)] bg-[var(--stage-card)] p-4">
			<summary className="cursor-pointer font-mono text-xs font-bold uppercase text-[var(--stage-strong)]">
				Compare ranking approaches
			</summary>
			<p className="mt-3 max-w-2xl text-xs leading-5 text-[var(--stage-muted)]">
				Optional blind check: choose the ordered list that better reflects what
				you would explore. The approaches are randomly assigned to A and B and
				remain hidden while you judge them.
			</p>
			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<BlindRankingList label="List A" games={comparison.leftGames} />
				<BlindRankingList label="List B" games={comparison.rightGames} />
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				{[
					{ value: "left" as const, label: "Prefer A" },
					{ value: "right" as const, label: "Prefer B" },
					{ value: "tie" as const, label: "About equal" },
				].map((option) => (
					<button
						aria-pressed={choice === option.value}
						className={comparisonChoiceClass(choice === option.value)}
						disabled={isPending}
						key={option.value}
						onClick={() => onChoose(option.value)}
						type="button"
					>
						{option.label}
					</button>
				))}
			</div>
			{message ? (
				<p aria-live="polite" className="mt-3 text-xs text-[var(--stage-muted)]">
					{message}
				</p>
			) : null}
		</details>
	);
}

function BlindRankingList({
	games,
	label,
}: {
	games: BlindRankingComparison["leftGames"];
	label: string;
}) {
	return (
		<div className="rounded-md border border-[var(--stage-border)] bg-[var(--stage-panel)] p-3">
			<h3 className="font-mono text-xs font-bold uppercase text-[var(--stage-heading)]">
				{label}
			</h3>
			<ol className="mt-2 grid gap-1.5 text-xs text-[var(--stage-subtle)]">
				{games.map((game, index) => (
					<li className="flex gap-2" key={game.igdbId}>
						<span className="w-4 shrink-0 text-right font-mono text-[var(--stage-faint)]">
							{index + 1}.
						</span>
						<span>{game.title}</span>
					</li>
				))}
			</ol>
		</div>
	);
}

function AdventureControl({
	adventure,
	onAdventureChange,
}: {
	adventure: number;
	onAdventureChange: (value: number) => void;
}) {
	return (
		<label className="mt-5 block rounded-lg border border-[var(--stage-control-border)] bg-[var(--stage-card)] p-4">
			<span className="flex items-center justify-between gap-4 font-mono text-[10px] font-bold uppercase text-[var(--stage-muted)]">
				<span>Familiar</span>
				<span className="text-[var(--stage-strong)]">
					{adventure === 0
						? "Comfort picks"
						: adventure === 50
							? "Balanced"
							: "More variety"}
				</span>
				<span>Adventurous</span>
			</span>
			<input
				aria-label="Recommendation adventure level"
				aria-valuetext={getAdventureLabel(adventure)}
				className="mt-3 w-full accent-[var(--stage-accent)]"
				list="stageselect-adventure-levels"
				max="100"
				min="0"
				onChange={(event) => onAdventureChange(Number(event.target.value))}
				step="50"
				type="range"
				value={adventure}
			/>
			<datalist id="stageselect-adventure-levels">
				<option value="0">Familiar</option>
				<option value="50">Balanced</option>
				<option value="100">Adventurous</option>
			</datalist>
			<div
				aria-hidden="true"
				className="mt-1 grid grid-cols-3 font-mono text-[9px] font-bold uppercase text-[var(--stage-faint)]"
			>
				<span>Familiar</span>
				<span className="text-center">Balanced</span>
				<span className="text-right">Adventurous</span>
			</div>
		</label>
	);
}

function PlayNextSection({
	isLoading,
	isSignedIn,
	onOpenGame,
	platform,
	recommendations,
}: {
	isLoading: boolean;
	isSignedIn: boolean;
	onOpenGame: (gameId: string) => void;
	platform: string;
	recommendations: DisplayRecommendation[];
}) {
	return (
		<div className="mt-5 grid gap-4 sm:grid-cols-2">
			{recommendations.length > 0 ? (
				recommendations.map((recommendation, index) => (
					<article
						className="overflow-hidden rounded-lg border border-[var(--stage-border)] bg-[var(--stage-card)]"
						key={recommendation.game.id}
					>
						<div className="grid grid-cols-[88px_minmax(0,1fr)]">
							{recommendation.coverUrl ? (
								<img
									alt=""
									className="aspect-[3/4] h-full w-full bg-[var(--stage-cover)] object-contain p-1"
									decoding="async"
									loading="lazy"
									src={recommendation.coverUrl}
								/>
							) : (
								<div className="flex aspect-[3/4] items-center justify-center bg-[var(--stage-cover)] font-mono text-[10px] uppercase text-[var(--stage-muted)]">
									Cover
								</div>
							)}
							<div className="p-3">
								<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
									Pick {index + 1} · {recommendation.matchLabel}
								</p>
								<h3 className="mt-1 font-mono text-sm font-bold uppercase text-[var(--stage-heading)]">
									{recommendation.game.title}
								</h3>
								<p className="mt-2 text-xs text-[var(--stage-muted)]">
									{recommendation.game.platform}
								</p>
							</div>
						</div>
						<div className="border-t border-[var(--stage-divider)] p-3">
							<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-muted)]">
								Why this?
							</p>
							<ul className="mt-2 grid gap-1 text-xs leading-5 text-[var(--stage-subtle)]">
								{recommendation.explanations.map((reason) => (
									<li key={reason}>— {reason}</li>
								))}
							</ul>
							<button
								className="mt-3 rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-[10px] font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)]"
								onClick={() => onOpenGame(recommendation.game.id)}
								type="button"
							>
								Open entry
							</button>
						</div>
					</article>
				))
			) : (
				<div className="rounded-lg border border-dashed border-[var(--stage-control-border)] bg-[var(--stage-card)] px-4 py-10 text-center text-sm leading-6 text-[var(--stage-muted)] sm:col-span-2">
					{getPlayNextEmptyMessage(isSignedIn, isLoading, platform)}
				</div>
			)}
		</div>
	);
}

function DiscoverSection({
	discoverMessage,
	feedbackByIgdbId,
	feedbackPendingGameId,
	isDiscoverLoading,
	isSignedIn,
	onFeedback,
	onSaveDiscover,
	platform,
	recommendations,
}: {
	discoverMessage: string;
	feedbackByIgdbId: Record<number, RecommendationFeedbackAction>;
	feedbackPendingGameId: string;
	isDiscoverLoading: boolean;
	isSignedIn: boolean;
	onFeedback: (
		game: StageSelectDiscoverCandidate,
		action: RecommendationFeedbackAction,
	) => void;
	onSaveDiscover: (game: StageSelectGameSearchResult) => void;
	platform: string;
	recommendations: DisplayDiscoverRecommendation[];
}) {
	return (
		<div className="mt-5">
			{isSignedIn ? (
				<p className="text-xs text-[var(--stage-muted)]">{discoverMessage}</p>
			) : null}
			<p className="mt-3 rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-card)] px-3 py-2 text-xs leading-5 text-[var(--stage-subtle)]">
				“More like this” changes preference weights. “Not for me” is a
				negative signal. “Don’t show” only hides that title.
			</p>

			{recommendations.length > 0 ? (
				<div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{recommendations.map((recommendation) => {
						const game = recommendation.game;
						const currentAction = feedbackByIgdbId[game.igdbId];
						const isPending = feedbackPendingGameId === String(game.igdbId);

						return (
							<article
								className="overflow-hidden rounded-lg border border-[var(--stage-border)] bg-[var(--stage-card)]"
								key={game.igdbId}
							>
								{game.coverUrl ? (
									<img
										alt=""
										className="aspect-[16/9] w-full bg-[var(--stage-cover)] object-contain p-2"
										decoding="async"
										loading="lazy"
										src={game.coverUrl}
									/>
								) : (
									<div className="flex aspect-[16/9] items-center justify-center bg-[var(--stage-cover)] font-mono text-[10px] uppercase text-[var(--stage-muted)]">
										Cover
									</div>
								)}
								<div className="p-3">
									<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
										{recommendation.matchLabel}
									</p>
									<h3 className="mt-1 font-mono text-sm font-bold uppercase text-[var(--stage-heading)]">
										{game.title}
									</h3>
									<p className="mt-2 text-xs text-[var(--stage-muted)]">
										{formatDiscoverMeta(game)}
									</p>
									<ul className="mt-3 grid gap-1 text-xs leading-5 text-[var(--stage-subtle)]">
										{recommendation.explanations.map((reason) => (
											<li key={reason}>— {reason}</li>
										))}
									</ul>
									<div className="mt-3 flex flex-wrap gap-2">
										<button
											aria-pressed={currentAction === "more_like_this"}
											className={feedbackButtonClass(
												currentAction === "more_like_this",
											)}
											disabled={isPending}
											onClick={() => onFeedback(game, "more_like_this")}
											type="button"
										>
											More like this
										</button>
										<button
											className="rounded-md border border-[var(--stage-danger-border)] bg-[var(--stage-danger-bg)] px-3 py-2 font-mono text-[10px] font-bold uppercase text-[var(--stage-danger-text)] transition hover:bg-[var(--stage-danger-hover)] disabled:opacity-60"
											disabled={isPending}
											onClick={() => onFeedback(game, "not_for_me")}
											type="button"
										>
											Not for me
										</button>
										<button
											className="rounded-md border border-[var(--stage-control-border)] bg-[var(--stage-panel)] px-3 py-2 font-mono text-[10px] font-bold uppercase text-[var(--stage-text)] transition hover:bg-[var(--stage-hover)] disabled:opacity-60"
											disabled={isPending}
											onClick={() => onFeedback(game, "dismissed")}
											type="button"
										>
											Don’t show
										</button>
										<button
											className="rounded-md bg-[var(--stage-accent)] px-3 py-2 font-mono text-[10px] font-bold uppercase text-[var(--stage-accent-text)] transition hover:bg-[var(--stage-accent-hover)]"
											onClick={() => onSaveDiscover(game)}
											type="button"
										>
											Add to wishlist
										</button>
									</div>
								</div>
							</article>
						);
					})}
				</div>
			) : (
				<div className="mt-4 rounded-lg border border-dashed border-[var(--stage-control-border)] bg-[var(--stage-card)] px-4 py-10 text-center text-sm leading-6 text-[var(--stage-muted)]">
					{getDiscoverEmptyMessage(
						isSignedIn,
						isDiscoverLoading,
						platform,
					)}
				</div>
			)}
		</div>
	);
}

function PreferenceAside({
	activeSection,
	feedbackPendingGameId,
	hiddenDiscoveries,
	onFeedback,
	profile,
	topGenres,
	topOtherFacets,
}: {
	activeSection: RecommendationSection;
	feedbackPendingGameId: string;
	hiddenDiscoveries: HiddenDiscovery[];
	onFeedback: (
		game: StageSelectDiscoverCandidate,
		action: RecommendationFeedbackAction,
	) => void;
	profile: TasteProfile;
	topGenres: Array<[string, number]>;
	topOtherFacets: Array<{ label: string; weight: number; type: string }>;
}) {
	return (
		<aside className="rounded-lg border border-[var(--stage-border)] bg-[var(--stage-panel)] p-5 shadow-sm">
			<p className="font-mono text-xs uppercase text-[var(--stage-muted)]">
				Preference profile
			</p>
			<h2 className="mt-2 font-mono text-xl font-bold uppercase text-[var(--stage-heading)]">
				{formatConfidence(profile.confidence)}
			</h2>
			<p className="mt-2 text-sm leading-6 text-[var(--stage-muted)]">
				Built from {profile.usefulSignalCount} useful preference signal
				{profile.usefulSignalCount === 1 ? "" : "s"}.
			</p>

			{topGenres.length > 0 ? (
				<div className="mt-5">
					<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
						Strongest genre signals
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{topGenres.map(([genre]) => (
							<span
								className="rounded-full border border-[var(--stage-info-border)] bg-[var(--stage-info-bg)] px-3 py-1 text-xs text-[var(--stage-info-text)]"
								key={genre}
							>
								{capitalize(genre)}
							</span>
						))}
					</div>
				</div>
			) : (
				<p className="mt-5 rounded-lg bg-[var(--stage-card)] p-3 text-xs leading-5 text-[var(--stage-muted)]">
					Rate or finish a few games to reveal your strongest genre patterns.
				</p>
			)}

			{topOtherFacets.length > 0 ? (
				<div className="mt-5">
					<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
						Other preference signals
					</p>
					<div className="mt-3 flex flex-wrap gap-2">
						{topOtherFacets.map((facet) => (
							<span
								className="rounded-full border border-[var(--stage-control-border)] bg-[var(--stage-card)] px-3 py-1 text-xs text-[var(--stage-subtle)]"
								key={`${facet.type}:${facet.label}`}
								title={facet.type}
							>
								{capitalize(facet.label)}
							</span>
						))}
					</div>
				</div>
			) : null}

			{profile.tasteClusters.length > 0 ? (
				<div className="mt-5 border-t border-[var(--stage-divider)] pt-4">
					<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
						Taste groups
					</p>
					<p className="mt-2 text-xs leading-5 text-[var(--stage-muted)]">
						Distinct patterns across games with positive signals.
					</p>
					<div className="mt-3 grid gap-3">
						{profile.tasteClusters.map((cluster) => (
							<div
								className="rounded-lg border border-[var(--stage-control-border)] bg-[var(--stage-card)] p-3"
								key={cluster.id}
							>
								<h3 className="font-mono text-xs font-bold uppercase text-[var(--stage-strong)]">
									{cluster.label}
								</h3>
								<div className="mt-2 flex flex-wrap gap-1.5">
									{cluster.facets.slice(0, 3).map((facet) => (
										<span
											className="rounded-full border border-[var(--stage-control-border)] px-2 py-0.5 text-[10px] text-[var(--stage-subtle)]"
											key={`${facet.type}:${facet.label}`}
											title={capitalize(facet.type)}
										>
											{capitalize(facet.label)}
										</span>
									))}
								</div>
								<p className="mt-2 text-[11px] leading-4 text-[var(--stage-muted)]">
									Supported by {formatSupportingGames(cluster.supportingGames)}.
								</p>
							</div>
						))}
					</div>
				</div>
			) : profile.positiveGames.length >= 3 ? (
				<p className="mt-5 border-t border-[var(--stage-divider)] pt-4 text-xs leading-5 text-[var(--stage-muted)]">
					Taste groups appear after at least eight positively weighted games
					provide enough distinct metadata.
				</p>
			) : null}

			{activeSection === "discover" && hiddenDiscoveries.length > 0 ? (
				<div className="mt-5 border-t border-[var(--stage-divider)] pt-4">
					<p className="font-mono text-[10px] font-bold uppercase text-[var(--stage-faint)]">
						Hidden from Discover
					</p>
					<div className="mt-2 grid gap-2">
						{hiddenDiscoveries.map(({ action, game }) => (
							<div
								className="flex items-center justify-between gap-2 text-xs text-[var(--stage-muted)]"
								key={game.igdbId}
							>
								<span className="min-w-0 truncate" title={game.title}>
									{game.title}
								</span>
								<button
									className="shrink-0 font-mono text-[10px] font-bold uppercase text-[var(--stage-text)] underline-offset-2 hover:underline disabled:opacity-60"
									disabled={
										feedbackPendingGameId === String(game.igdbId)
									}
									onClick={() => onFeedback(game, action)}
									type="button"
								>
									Undo
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}

			<div className="mt-5 border-t border-[var(--stage-divider)] pt-4 text-xs leading-5 text-[var(--stage-muted)]">
				Recommendations combine structured library signals with semantic
				similarity when coverage is available. Established profiles also use
				distinct taste groups; structured scoring remains the fallback.
			</div>
		</aside>
	);
}

function getPlayNextEmptyMessage(
	isSignedIn: boolean,
	isLoading: boolean,
	platform: string,
) {
	if (!isSignedIn) {
		return "Log in to generate recommendations from your library.";
	}

	if (isLoading) {
		return "Reading your library...";
	}

	if (platform !== "all") {
		return "No playing, backlogged, or wishlisted games match this platform.";
	}

	return "Add games to Playing, Backlog, or Wishlist to build your Play Next queue.";
}

function getDiscoverEmptyMessage(
	isSignedIn: boolean,
	isLoading: boolean,
	platform: string,
) {
	if (!isSignedIn) {
		return "Log in to discover games outside your library.";
	}

	if (isLoading) {
		return "Loading discovery candidates...";
	}

	if (platform !== "all") {
		return "No discovery candidates match this platform.";
	}

	return "No discovery candidates are currently available.";
}

function formatConfidence(confidence: TasteProfile["confidence"]) {
	if (confidence === "established") {
		return "High data confidence";
	}

	if (confidence === "developing") {
		return "Moderate data confidence";
	}

	return "Low data confidence";
}

function capitalize(value: string) {
	return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function formatSupportingGames(
	games: TasteProfile["tasteClusters"][number]["supportingGames"],
) {
	return games.map((game) => game.title).join(", ");
}

function formatDiscoverMeta(game: StageSelectDiscoverCandidate) {
	return [
		game.releaseYear ? String(game.releaseYear) : null,
		game.genres.slice(0, 2).join(" / ") || null,
	]
		.filter(Boolean)
		.join(" · ");
}

function getAdventureLabel(value: number) {
	if (value === 0) {
		return "Familiar";
	}

	if (value === 50) {
		return "Balanced";
	}

	return "Adventurous";
}

function feedbackButtonClass(isActive: boolean) {
	return [
		"rounded-md border px-3 py-2 font-mono text-[10px] font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-60",
		isActive
			? "border-[var(--stage-success-border)] bg-[var(--stage-success-bg)] text-[var(--stage-success-text)]"
			: "border-[var(--stage-control-border)] bg-[var(--stage-panel)] text-[var(--stage-text)] hover:bg-[var(--stage-hover)]",
	].join(" ");
}

function comparisonChoiceClass(isActive: boolean) {
	return [
		"rounded-md border px-3 py-2 font-mono text-[10px] font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-60",
		isActive
			? "border-[var(--stage-success-border)] bg-[var(--stage-success-bg)] text-[var(--stage-success-text)]"
			: "border-[var(--stage-control-border)] bg-[var(--stage-panel)] text-[var(--stage-text)] hover:bg-[var(--stage-hover)]",
	].join(" ");
}

function sectionTabClass(isActive: boolean) {
	return [
		"rounded-md px-3 py-2 font-mono text-xs font-bold uppercase transition",
		isActive
			? "bg-[var(--stage-accent)] text-[var(--stage-accent-text)]"
			: "text-[var(--stage-muted)] hover:bg-[var(--stage-hover)] hover:text-[var(--stage-text)]",
	].join(" ");
}
