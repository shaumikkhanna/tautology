"use client";

import {
	type FormEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import styles from "./scorekeeper.module.css";

type Player = {
	id: string;
	name: string;
	score: number;
};

type ScoreChange = {
	playerId: string;
	playerName: string;
	amount: number;
};

type ConfirmationAction = "reset" | "new-game" | null;

const storageKey = "toomuchmaths-scorekeeper";

function createPlayer(name = ""): Player {
	return {
		id:
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random()}`,
		name,
		score: 0,
	};
}

export function Scorekeeper() {
	const [players, setPlayers] = useState<Player[]>(() => [
		createPlayer(""),
		createPlayer(""),
	]);
	const [hasStarted, setHasStarted] = useState(false);
	const [adjustments, setAdjustments] = useState<Record<string, string>>({});
	const [history, setHistory] = useState<ScoreChange[]>([]);
	const [newPlayerName, setNewPlayerName] = useState("");
	const [isHydrated, setIsHydrated] = useState(false);
	const [isPicking, setIsPicking] = useState(false);
	const [displayedPlayer, setDisplayedPlayer] = useState("");
	const [selectedPlayer, setSelectedPlayer] = useState("");
	const [dieValue, setDieValue] = useState(1);
	const [isRolling, setIsRolling] = useState(false);
	const [confirmationAction, setConfirmationAction] =
		useState<ConfirmationAction>(null);
	const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const rollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
	const rollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		try {
			const saved = window.localStorage.getItem(storageKey);

			if (saved) {
				const parsed = JSON.parse(saved) as {
					players?: Player[];
					hasStarted?: boolean;
				};
				const validPlayers = parsed.players?.filter(
					(player) =>
						typeof player.id === "string" &&
						typeof player.name === "string" &&
						typeof player.score === "number",
				);

				if (validPlayers && validPlayers.length > 0) {
					setPlayers(validPlayers);
					setHasStarted(Boolean(parsed.hasStarted));
				}
			}
		} catch {
			// A damaged local save should not prevent the tool from opening.
		} finally {
			setIsHydrated(true);
		}
	}, []);

	useEffect(() => {
		if (!isHydrated) {
			return;
		}

		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ players, hasStarted }),
		);
	}, [hasStarted, isHydrated, players]);

	useEffect(
		() => () => {
			if (pickTimer.current) {
				clearTimeout(pickTimer.current);
			}
			if (rollTimer.current) {
				clearInterval(rollTimer.current);
			}
			if (rollEndTimer.current) {
				clearTimeout(rollEndTimer.current);
			}
		},
		[],
	);

	const activePlayers = useMemo(
		() => players.filter((player) => player.name.trim()),
		[players],
	);
	const highestScore = Math.max(...activePlayers.map((player) => player.score));
	const leaders = activePlayers.filter(
		(player) => player.score === highestScore,
	);

	function updateSetupName(id: string, name: string) {
		setPlayers((current) =>
			current.map((player) =>
				player.id === id ? { ...player, name } : player,
			),
		);
	}

	function startGame(event: FormEvent) {
		event.preventDefault();
		const namedPlayers = players.filter((player) => player.name.trim());

		if (namedPlayers.length === 0) {
			return;
		}

		setPlayers(
			namedPlayers.map((player) => ({
				...player,
				name: player.name.trim(),
			})),
		);
		setHasStarted(true);
	}

	function changeScore(player: Player, amount: number) {
		if (!Number.isFinite(amount) || amount === 0) {
			return;
		}

		setPlayers((current) =>
			current.map((candidate) =>
				candidate.id === player.id
					? { ...candidate, score: candidate.score + amount }
					: candidate,
			),
		);
		setHistory((current) => [
			...current.slice(-19),
			{
				playerId: player.id,
				playerName: player.name,
				amount,
			},
		]);
		setAdjustments((current) => ({ ...current, [player.id]: "" }));
	}

	function submitAdjustment(event: FormEvent, player: Player) {
		event.preventDefault();
		changeScore(player, Number(adjustments[player.id]));
	}

	function undoLastChange() {
		const lastChange = history.at(-1);

		if (!lastChange) {
			return;
		}

		setPlayers((current) =>
			current.map((player) =>
				player.id === lastChange.playerId
					? { ...player, score: player.score - lastChange.amount }
					: player,
			),
		);
		setHistory((current) => current.slice(0, -1));
	}

	function resetScores() {
		setPlayers((current) =>
			current.map((player) => ({ ...player, score: 0 })),
		);
		setHistory([]);
		setSelectedPlayer("");
		setDisplayedPlayer("");
		setConfirmationAction(null);
	}

	function startNewGame() {
		setPlayers([createPlayer("Player 1"), createPlayer("Player 2")]);
		setHasStarted(false);
		setAdjustments({});
		setHistory([]);
		setNewPlayerName("");
		setSelectedPlayer("");
		setDisplayedPlayer("");
		setDieValue(1);
		setConfirmationAction(null);
	}

	function addPlayer(event: FormEvent) {
		event.preventDefault();
		const name =
			newPlayerName.trim() || `Player ${getNextPlayerNumber(players)}`;

		setPlayers((current) => [...current, createPlayer(name)]);
		setNewPlayerName("");
	}

	function removePlayer(id: string) {
		if (players.length === 1) {
			return;
		}

		setPlayers((current) => current.filter((player) => player.id !== id));
		setHistory((current) =>
			current.filter((change) => change.playerId !== id),
		);
	}

	function pickPlayer() {
		if (isPicking || activePlayers.length === 0) {
			return;
		}

		const winner =
			activePlayers[Math.floor(Math.random() * activePlayers.length)];
		const totalChanges = 24;
		let changeIndex = 0;
		let previousName = "";

		setSelectedPlayer("");
		setIsPicking(true);

		const showNextName = () => {
			if (changeIndex >= totalChanges) {
				setDisplayedPlayer(winner.name);
				setSelectedPlayer(winner.name);
				setIsPicking(false);
				return;
			}

			const candidates = activePlayers.filter(
				(player) =>
					activePlayers.length === 1 || player.name !== previousName,
			);
			const nextPlayer =
				candidates[Math.floor(Math.random() * candidates.length)];
			previousName = nextPlayer.name;
			setDisplayedPlayer(nextPlayer.name);

			const progress = changeIndex / totalChanges;
			const delay = 55 + Math.round(progress * progress * 260);
			changeIndex += 1;
			pickTimer.current = setTimeout(showNextName, delay);
		};

		showNextName();
	}

	function rollDie() {
		if (isRolling) {
			return;
		}

		setIsRolling(true);
		rollTimer.current = setInterval(() => {
			setDieValue(Math.floor(Math.random() * 6) + 1);
		}, 80);
		rollEndTimer.current = setTimeout(() => {
			if (rollTimer.current) {
				clearInterval(rollTimer.current);
			}
			setDieValue(Math.floor(Math.random() * 6) + 1);
			setIsRolling(false);
		}, 900);
	}

	if (!isHydrated) {
		return (
			<section className="mx-auto flex min-h-[60vh] w-full max-w-5xl items-center justify-center px-4 py-10 font-mono text-sm uppercase text-rule">
				Loading scorekeeper...
			</section>
		);
	}

	if (!hasStarted) {
		return (
			<section className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
				<PageHeading />
				<form
					onSubmit={startGame}
					className="mx-auto mt-8 max-w-xl border-2 border-ink bg-paperLight p-4 shadow-hard sm:p-6"
				>
					<p className="font-mono text-xs font-bold uppercase text-rule">
						Who is playing?
					</p>
					<div className="mt-4 space-y-3">
						{players.map((player, index) => (
							<div
								key={player.id}
								className="grid grid-cols-[auto_1fr_auto] items-center gap-2"
							>
								<span className="w-7 font-mono text-xs text-rule">
									{String(index + 1).padStart(2, "0")}
								</span>
								<input
									value={player.name}
									onChange={(event) =>
										updateSetupName(
											player.id,
											event.target.value,
										)
									}
									placeholder={`Player ${index + 1}`}
									maxLength={24}
									className="min-w-0 border-2 border-ink bg-paper px-3 py-3 font-mono text-base text-ink outline-none focus:bg-brass"
								/>
								<button
									type="button"
									aria-label={`Remove player ${index + 1}`}
									disabled={players.length <= 1}
									onClick={() => removePlayer(player.id)}
									className="h-12 w-12 border-2 border-ink bg-paper font-mono text-lg font-bold text-ink transition hover:bg-brass disabled:cursor-not-allowed disabled:opacity-30"
								>
									&times;
								</button>
							</div>
						))}
					</div>
					<div className="mt-5 grid gap-3 sm:grid-cols-2">
						<button
							type="button"
							onClick={() =>
								setPlayers((current) => [
									...current,
									createPlayer(
										`Player ${getNextPlayerNumber(current)}`,
									),
								])
							}
							className="border-2 border-ink bg-paper px-4 py-3 font-mono text-xs font-bold uppercase text-ink transition hover:bg-brass"
						>
							+ Add player
						</button>
						<button
							type="submit"
							disabled={activePlayers.length === 0}
							className="border-2 border-ink bg-soot px-4 py-3 font-mono text-xs font-bold uppercase text-paper shadow-hard transition hover:-translate-y-0.5 hover:bg-brass hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
						>
							Start keeping score
						</button>
					</div>
				</form>
			</section>
		);
	}

	return (
		<section className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 sm:py-10">
			<PageHeading />

			<div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-4">
				<p className="font-mono text-xs uppercase text-rule">
					{players.length} {players.length === 1 ? "player" : "players"}
					{leaders.length === 1
						? ` / ${leaders[0].name} leads`
						: leaders.length > 1
							? " / tied game"
							: ""}
				</p>
				<div className="flex flex-wrap gap-2">
					<button
						type="button"
						disabled={history.length === 0}
						onClick={undoLastChange}
						className="border-2 border-ink bg-paperLight px-3 py-2 font-mono text-xs font-bold uppercase text-ink transition hover:bg-brass disabled:cursor-not-allowed disabled:opacity-40"
					>
						Undo
					</button>
					<button
						type="button"
						onClick={() => setConfirmationAction("new-game")}
						className="border-2 border-ink bg-paperLight px-3 py-2 font-mono text-xs font-bold uppercase text-ink transition hover:bg-brass"
					>
						Reset
					</button>
					<button
						type="button"
						onClick={() => setConfirmationAction("reset")}
						className="border-2 border-ink bg-soot px-3 py-2 font-mono text-xs font-bold uppercase text-paper transition hover:bg-brass hover:text-ink"
					>
						New game
					</button>
				</div>
			</div>

			<div className="mt-6 grid gap-5 sm:grid-cols-2">
				{players.map((player) => {
					const isLeader =
						leaders.length === 1 && leaders[0].id === player.id;

					return (
						<article
							key={player.id}
							className={[
								"border-2 border-ink p-4 shadow-hard sm:p-5",
								isLeader ? "bg-brass" : "bg-paperLight",
							].join(" ")}
						>
							<div className="flex items-start justify-between gap-3 border-b-2 border-ink pb-3">
								<div className="min-w-0">
									<p className="font-mono text-xs uppercase text-rule">
										{isLeader ? "Current leader" : "Player"}
									</p>
									<h2 className="mt-1 truncate font-mono text-xl font-bold uppercase text-ink">
										{player.name}
									</h2>
								</div>
								<div className="flex shrink-0 items-start gap-3">
									<p className="font-mono text-4xl font-bold tabular-nums text-ink sm:text-5xl">
										{player.score}
									</p>
									<button
										type="button"
										aria-label={`Remove ${player.name}`}
										disabled={players.length <= 1}
										onClick={() => removePlayer(player.id)}
										className="grid h-8 w-8 place-items-center border-2 border-ink bg-paper font-mono text-lg font-bold leading-none text-ink transition hover:bg-soot hover:text-paper disabled:cursor-not-allowed disabled:opacity-30"
									>
										&times;
									</button>
								</div>
							</div>

							<form
								onSubmit={(event) =>
									submitAdjustment(event, player)
								}
								className="mt-4 grid grid-cols-[1fr_auto] gap-2"
							>
								<label className="sr-only" htmlFor={`score-${player.id}`}>
									Points to add to {player.name}
								</label>
								<input
									id={`score-${player.id}`}
									type="number"
									inputMode="numeric"
									value={adjustments[player.id] ?? ""}
									onChange={(event) =>
										setAdjustments((current) => ({
											...current,
											[player.id]: event.target.value,
										}))
									}
									placeholder="Points, e.g. 13"
									className="min-w-0 border-2 border-ink bg-paper px-3 py-3 font-mono text-base text-ink outline-none placeholder:text-rule focus:bg-white"
								/>
								<button
									type="submit"
									className="border-2 border-ink bg-soot px-4 py-3 font-mono text-xs font-bold uppercase text-paper transition hover:bg-brass hover:text-ink"
								>
									Add
								</button>
							</form>
							<div className="mt-2 grid grid-cols-4 gap-2">
								{[-1, 1, 5, 10].map((amount) => (
									<button
										key={amount}
										type="button"
										onClick={() => changeScore(player, amount)}
										className="border-2 border-ink bg-paper px-2 py-2 font-mono text-xs font-bold text-ink transition hover:bg-brass"
									>
										{amount > 0 ? `+${amount}` : amount}
									</button>
								))}
							</div>
						</article>
					);
				})}
			</div>

			<form
				onSubmit={addPlayer}
				className="mt-5 grid gap-2 border-2 border-ink bg-paperLight p-3 sm:grid-cols-[1fr_auto]"
			>
				<label className="sr-only" htmlFor="new-player">
					New player name
				</label>
				<input
					id="new-player"
					value={newPlayerName}
					maxLength={24}
					onChange={(event) => setNewPlayerName(event.target.value)}
					placeholder="Add another player"
					className="min-w-0 border-2 border-ink bg-paper px-3 py-3 font-mono text-sm text-ink outline-none focus:bg-brass"
				/>
				<button
					type="submit"
					className="border-2 border-ink bg-paper px-4 py-3 font-mono text-xs font-bold uppercase text-ink transition hover:bg-brass"
				>
					+ Add player
				</button>
			</form>

			<div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
				<section className="border-2 border-ink bg-paperLight p-4 shadow-hard sm:p-5">
					<div className="border-b-2 border-ink pb-3">
						<p className="font-mono text-xs uppercase text-rule">
							Random player
						</p>
						<h2 className="mt-1 font-mono text-xl font-bold uppercase text-ink">
							Pick Someone
						</h2>
					</div>
					<div className="flex min-h-[310px] flex-col justify-center">
						<div
							aria-hidden={isPicking}
							className={[
								styles.nameDraw,
								isPicking ? styles.nameDrawPicking : "",
								selectedPlayer ? styles.nameDrawWinner : "",
							].join(" ")}
						>
							<span className={styles.nameDrawLabel}>
								{isPicking
									? "Selecting"
									: selectedPlayer
										? "Selected"
										: "Ready"}
							</span>
							<span className={styles.nameDrawValue}>
								{displayedPlayer || "Press the button"}
							</span>
						</div>
						<p className="sr-only" aria-live="polite">
							{selectedPlayer
								? `${selectedPlayer} was selected.`
								: ""}
						</p>
						<button
							type="button"
							disabled={isPicking}
							onClick={pickPlayer}
							className="mt-7 w-full border-2 border-ink bg-soot px-5 py-4 font-mono text-sm font-bold uppercase text-paper shadow-hard transition hover:-translate-y-0.5 hover:bg-brass hover:text-ink disabled:cursor-wait disabled:opacity-60"
						>
							{isPicking ? "Choosing..." : "Pick a player"}
						</button>
					</div>
				</section>

				<section className="border-2 border-ink bg-paperLight p-4 shadow-hard sm:p-5">
					<div className="border-b-2 border-ink pb-3">
						<p className="font-mono text-xs uppercase text-rule">
							Chance
						</p>
						<h2 className="mt-1 font-mono text-xl font-bold uppercase text-ink">
							Roll a Die
						</h2>
					</div>
					<div className="flex min-h-[310px] flex-col items-center justify-center">
						<div
							aria-live="polite"
							aria-label={`Die shows ${dieValue}`}
							className={[
								styles.die,
								isRolling ? styles.dieRolling : "",
							].join(" ")}
						>
							{dieValue}
						</div>
						<button
							type="button"
							disabled={isRolling}
							onClick={rollDie}
							className="mt-7 w-full border-2 border-ink bg-soot px-5 py-4 font-mono text-sm font-bold uppercase text-paper shadow-hard transition hover:-translate-y-0.5 hover:bg-brass hover:text-ink disabled:cursor-wait disabled:opacity-60"
						>
							{isRolling ? "Rolling..." : "Roll d6"}
						</button>
					</div>
				</section>
			</div>

			{confirmationAction ? (
				<ConfirmationModal
					action={confirmationAction}
					onCancel={() => setConfirmationAction(null)}
					onConfirm={
						confirmationAction === "reset"
							? resetScores
							: startNewGame
					}
				/>
			) : null}
		</section>
	);
}

function ConfirmationModal({
	action,
	onCancel,
	onConfirm,
}: {
	action: Exclude<ConfirmationAction, null>;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const isNewGame = action === "new-game";

	return (
		<div
			className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) {
					onCancel();
				}
			}}
		>
			<section
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="confirmation-title"
				aria-describedby="confirmation-description"
				className="w-full max-w-md border-2 border-ink bg-paperLight p-5 shadow-hard sm:p-6"
			>
				<p className="font-mono text-xs font-bold uppercase text-rule">
					Please confirm
				</p>
				<h2
					id="confirmation-title"
					className="mt-2 font-mono text-2xl font-bold uppercase text-ink"
				>
					{isNewGame
						? "Reset the scorekeeper?"
						: "New game, same players?"}
				</h2>
				<p
					id="confirmation-description"
					className="mt-3 text-sm leading-6 text-ink"
				>
					{isNewGame
						? "Reset removes every current player and score, then returns you to player setup for a fresh group."
						: "Start another game with the same players. Everyone's score will return to zero."}
				</p>
				<div className="mt-6 grid grid-cols-2 gap-3">
					<button
						type="button"
						autoFocus
						onClick={onCancel}
						className="border-2 border-ink bg-paper px-4 py-3 font-mono text-xs font-bold uppercase text-ink transition hover:bg-brass"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className="border-2 border-ink bg-soot px-4 py-3 font-mono text-xs font-bold uppercase text-paper shadow-hard transition hover:-translate-y-0.5 hover:bg-brass hover:text-ink"
					>
						{isNewGame ? "Reset everything" : "Start new game"}
					</button>
				</div>
			</section>
		</div>
	);
}

function getNextPlayerNumber(players: Player[]) {
	const usedNumbers = new Set(
		players
			.map((player) => /^Player (\d+)$/i.exec(player.name.trim()))
			.filter((match): match is RegExpExecArray => match !== null)
			.map((match) => Number(match[1])),
	);
	let nextNumber = players.length + 1;

	while (usedNumbers.has(nextNumber)) {
		nextNumber += 1;
	}

	return nextNumber;
}

function PageHeading() {
	return (
		<div className="border-b-2 border-ink pb-5">
			<p className="font-mono text-xs uppercase text-rule">
				/tools/scorekeeper
			</p>
			<h1 className="mt-2 font-mono text-3xl font-bold uppercase text-ink sm:text-4xl">
				Scorekeeper
			</h1>
			<p className="mt-3 max-w-2xl text-base leading-7 text-ink">
				Keep the numbers, settle who goes next, and leave the arithmetic
				to the machine.
			</p>
		</div>
	);
}
