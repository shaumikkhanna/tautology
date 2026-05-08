const spaces = [
	{ label: "2", payout: 30 },
	{ label: "3", payout: 15 },
	{ label: "11", payout: 15 },
	{ label: "4", payout: 10 },
	{ label: "10", payout: 10 },
	{ label: "5", payout: 7 },
	{ label: "9", payout: 7 },
	{ label: "6", payout: 6 },
	{ label: "8", payout: 6 },
	{ label: "7", payout: 5 },
	{ label: "12", payout: 30 },
	{ label: "Under 7", payout: 2 },
	{ label: "Over 7", payout: 2 },
	{ label: "Odd", payout: 2 },
	{ label: "Even", payout: 2 },
];

let currentBetLabel = null;
const popup = document.getElementById("popup");
const popupLabel = document.getElementById("popup-label");
const popupInput = document.getElementById("popup-input");
const popupConfirm = document.getElementById("popup-confirm");
const popupCancel = document.getElementById("popup-cancel");

const initialMoney = 10000;

let players = Array.from({ length: window.numPlayers }, (_, i) => {
	const roiTracker = {};
	spaces.forEach((s) => (roiTracker[s.label] = { invested: 0, returned: 0 }));
	return {
		name: `Player ${i + 1}`,
		money: initialMoney,
		bids: {},
		tokensUsed: 0,
		roiTracker: roiTracker,
	};
});

let currentPlayerIndex = 0;
let round = 1;
let logText = "";
let gameEnded = false;

const boardDiv = document.getElementById("board");
const moneySpan = document.getElementById("money");
const tokensUsedSpan = document.getElementById("tokens-used");
const roundSpan = document.getElementById("round");
const log = document.getElementById("log");
const rollBtn = document.getElementById("roll-btn");
const resetBtn = document.getElementById("reset-btn");

function formatMoney(amount) {
	return amount.toLocaleString("en-IN");
}

function updateDisplay() {
	const player = players[currentPlayerIndex];
	tokensUsedSpan.textContent = player.tokensUsed;
	moneySpan.textContent = formatMoney(player.money);
	roundSpan.textContent = round;
}

function createPlayerButtons() {
	const container = document.getElementById("player-buttons");
	container.innerHTML = "";
	for (let i = 0; i < numPlayers; i++) {
		const btn = document.createElement("button");
		btn.id = `player-btn-${i}`;
		btn.textContent = `Player ${i + 1}`;
		btn.onclick = () => switchPlayer(i);
		container.appendChild(btn);
	}
}

function renderBoard() {
	const player = players[currentPlayerIndex];
	boardDiv.innerHTML = "";
	spaces
		.sort((a, b) => b.payout - a.payout)
		.forEach((space) => {
			const div = document.createElement("div");
			const lightness = 90 - space.payout * 1.5;
			div.className = "space";
			div.style.fontSize = "1.8rem";
			div.style.padding = "12px 8px";
			div.style.flex = `1 1 ${80 + space.payout * 3}px`;
			div.style.minHeight = "90px"; // taller blocks
			div.style.backgroundColor = `hsl(30, 100%, ${lightness}%)`;
			if (player.bids[space.label]) div.classList.add("selected");
			let betInfo = "";
			players.forEach((p, i) => {
				if (p.bids[space.label]) {
					betInfo += `<div class="bet-amount">Player ${
						i + 1
					}: ₹${formatMoney(p.bids[space.label])}</div>`;
				}
			});

			div.innerHTML = `
				<strong>${space.label}</strong><br/>
				(${space.payout}:1)
				${betInfo}
			`;
			div.onclick = () => {
				if (gameEnded) return;

				const currentBet = player.bids[space.label] || 0;
				const isNewBet = !player.bids.hasOwnProperty(space.label);

				if (isNewBet && player.tokensUsed >= 3) {
					alert("You can only place tokens on up to 3 spaces.");
					return;
				}

				currentBetLabel = space.label;

				const money = player.money;
				const roundLimit = money >= 0 ? money + 10000 : 10000;

				popupInput.value = currentBet || 1000;
				popupLabel.innerHTML = `
		How much do you want to bet on <b>${space.label}</b>?<br>
		(Current bet: ₹${formatMoney(currentBet)})<br>
		<span style="color: gray; font-size: 0.9rem;">
			Total bet limit (this round): ₹${formatMoney(roundLimit)}.
		</span>
	`;
				popup.classList.remove("hidden");
			};
			boardDiv.appendChild(div);
		});
}

function updateDisplay() {
	const statsContainer = document.getElementById("player-stats");
	statsContainer.innerHTML = "";

	players.forEach((player, index) => {
		const div = document.createElement("div");
		div.className = "status";
		div.innerHTML = `
			<b>${player.name}:</b>
			Tokens: ${player.tokensUsed}/3 |
			Money: ₹${formatMoney(player.money)}
		`;
		statsContainer.appendChild(div);
	});

	roundSpan.textContent = round;
}

popupConfirm.onclick = () => {
	const value = parseInt(popupInput.value);
	const player = players[currentPlayerIndex];

	if (!isNaN(value) && value > 0 && value % 1000 === 0) {
		const isNewBet = !player.bids.hasOwnProperty(currentBetLabel);
		const currentTotal = Object.values(player.bids).reduce(
			(sum, val) => sum + val,
			0
		);
		const existing = player.bids[currentBetLabel] || 0;
		const newTotal = currentTotal - existing + value;
		const money = player.money;
		const limit = money >= 0 ? money + 10000 : 10000;

		if (newTotal > limit) {
			popupInput.classList.add("invalid-input");
			return;
		}

		popupInput.classList.remove("invalid-input");

		if (isNewBet && player.tokensUsed >= 3) {
			alert("You can only place tokens on up to 3 spaces.");
			return;
		}

		if (isNewBet) player.tokensUsed++;
		player.bids[currentBetLabel] = value;
		updateDisplay();
		renderBoard();
		highlightActivePlayer();
		popup.classList.add("hidden");
		rollBtn.disabled = !allPlayersReady();
	} else {
		alert("Enter a valid amount in ₹1000 multiples.");
	}
};

popupCancel.onclick = () => {
	popup.classList.add("hidden");
};

async function rollDice() {
	if (!allPlayersReady() || gameEnded)
		return alert("All players must place bets.");

	appendLog(`\n\n<b>Round ${round}</b>`);
	appendLog(`🎲 Rolling the dice...`);

	const diceSound = document.getElementById("dice-sound");
	diceSound.currentTime = 0;
	diceSound.play();

	// Animate dice rolling
	const dice1Img = document.getElementById("dice1");
	const dice2Img = document.getElementById("dice2");

	for (let i = 0; i < 8; i++) {
		const temp1 = Math.ceil(Math.random() * 6);
		const temp2 = Math.ceil(Math.random() * 6);
		dice1Img.src = `images/dice-${temp1}.png`;
		dice2Img.src = `images/dice-${temp2}.png`;
		dice1Img.style.transform = `rotate(${Math.random() * 360}deg)`;
		dice2Img.style.transform = `rotate(${Math.random() * 360}deg)`;
		await delay(100); // 100ms between frames
	}

	// Final result
	const d1 = Math.ceil(Math.random() * 6);
	const d2 = Math.ceil(Math.random() * 6);
	const total = d1 + d2;

	dice1Img.src = `images/dice-${d1}.png`;
	dice2Img.src = `images/dice-${d2}.png`;
	dice1Img.style.transform = `rotate(0deg)`;
	dice2Img.style.transform = `rotate(0deg)`;

	appendLog(`→ Dice rolled: ${d1} + ${d2} = ${total}`);
	await delay(1000);

	// Go through all players
	players.forEach((player, index) => {
		let winnings = 0;
		let losses = 0;
		let result = `\n🎯 <b>${player.name}</b>\n`;

		for (const label in player.bids) {
			const payout = getPayout(label, total);
			const invested = player.bids[label];
			player.roiTracker[label].invested += invested;

			if (payout > 0) {
				const gain = payout * invested;
				winnings += gain - invested;
				player.roiTracker[label].returned += gain;
				result += `✅ [${label}] paid ₹${formatMoney(
					gain - invested
				)}\n`;
			} else {
				losses += invested;
				player.money -= invested;
				result += `❌ [${label}] lost ₹${formatMoney(invested)}\n`;
			}
		}

		const net = winnings - losses;
		player.money += winnings;
		result += `💰 Net winnings: ₹${formatMoney(net)}\n`;
		result += `💼 New balance: ₹${formatMoney(player.money)}\n---`;

		appendLog(result);
	});

	// Reset for next round
	players.forEach((p) => {
		p.bids = {};
		p.tokensUsed = 0;
	});
	round++;
	if (round > 10) endGame();

	updateDisplay();
	renderBoard();
	createPlayerButtons();
	switchPlayer(0);
	rollBtn.disabled = true;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function appendLog(text) {
	logText += text + "\n";
	log.innerHTML = logText;
	log.scrollTop = log.scrollHeight;
}

function getPayout(label, roll) {
	if (label === "Over 7") return roll > 7 ? 2 : 0;
	if (label === "Under 7") return roll < 7 ? 2 : 0;
	if (label === "Odd") return roll % 2 !== 0 ? 2 : 0;
	if (label === "Even") return roll % 2 === 0 ? 2 : 0;
	const val = parseInt(label);
	return val === roll ? spaces.find((s) => s.label === label).payout : 0;
}

function resetRound(soft = false) {
	const player = players[currentPlayerIndex];
	player.bids = {};
	player.tokensUsed = 0;
	renderBoard();
	updateDisplay();
	rollBtn.disabled = !allPlayersReady();
}

function switchPlayer(index) {
	if (index < 0 || index >= players.length) return;
	currentPlayerIndex = index;
	updateDisplay();
	renderBoard();
	highlightActivePlayer();
}

function highlightActivePlayer() {
	for (let i = 0; i < players.length; i++) {
		const btn = document.getElementById(`player-btn-${i}`);
		if (!btn) continue;

		// Highlight current player
		btn.classList.toggle("active-player", i === currentPlayerIndex);

		// Turn green if they have placed at least one token
		btn.classList.toggle("has-bet", players[i].tokensUsed > 0);
	}
}

function getTheoreticalProbability(label) {
	const probMap = {
		"2": 1 / 36,
		"3": 2 / 36,
		"4": 3 / 36,
		"5": 4 / 36,
		"6": 5 / 36,
		"7": 6 / 36,
		"8": 5 / 36,
		"9": 4 / 36,
		"10": 3 / 36,
		"11": 2 / 36,
		"12": 1 / 36,
		"Over 7": 15 / 36,
		"Under 7": 15 / 36,
		"Odd": 18 / 36,
		"Even": 18 / 36,
	};
	return probMap[label] || 0;
}

function endGame() {
	gameEnded = true;
	rollBtn.disabled = true;
	resetBtn.disabled = true;

	appendLog(`\n🎉 <b>Game Over</b>`);

	players.forEach((player, index) => {
		const net = player.money - initialMoney;
		appendLog(`\n📊 <b>${player.name}</b>`);
		appendLog(
			`You ${net >= 0 ? "won" : "lost"} ₹${formatMoney(Math.abs(net))}`
		);
		appendLog(`Final balance: ₹${formatMoney(player.money)}`);
		appendLog(`Summary of Bets:`);

		for (const label in player.roiTracker) {
			const { invested, returned } = player.roiTracker[label];
			if (invested > 0) {
				const payout = spaces.find((s) => s.label === label).payout;
				const numBets = invested / 1000;
				const actualHits = returned / (payout * 1000);
				const theoreticalProb = getTheoreticalProbability(label);
				const expectedHits =
					(round - 1) *
					theoreticalProb *
					(numBets / Math.min(numBets, 3)); // assumes full tokens each round

				appendLog(`${label}: You bet ${numBets} time(s).`);
				appendLog(`  ↳ Actual hits: ${actualHits.toFixed(0)}`);
				appendLog(
					`  ↳ Theoretical probability: ${(
						theoreticalProb * 100
					).toFixed(1)}%`
				);
			}
		}
	});
}

function allPlayersReady() {
	return players.every((p) => p.tokensUsed > 0);
}

appendLog(`Welcome to Dicey Dice!
You start with ₹10,000 and 3 tokens. You can bet on outcomes like totals from 2–12 or properties like Over 7, Odd, Even.
Each bet can be any multiple of ₹1,000—even if you don't have enough money!
Choose up to 3 spots each round. The game runs for 10 rounds. Highest money wins!
---`);

window.addEventListener("DOMContentLoaded", () => {
	updateDisplay();
	renderBoard();
	createPlayerButtons?.();
	switchPlayer?.(0);
	rollBtn.disabled = true;
});
