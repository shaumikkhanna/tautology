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

let money = 10000;
let initialMoney = 10000;
let tokensUsed = 0;
const bids = {};
let round = 1;
const roiTracker = {};
let logText = "";
let gameEnded = false;
spaces.forEach((s) => (roiTracker[s.label] = { invested: 0, returned: 0 }));

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
	tokensUsedSpan.textContent = tokensUsed;
	moneySpan.textContent = formatMoney(money);
	roundSpan.textContent = round;
}

function renderBoard() {
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

			if (bids[space.label]) div.classList.add("selected");

			const betInfo = bids[space.label]
				? `<div class="bet-amount">₹${formatMoney(
						bids[space.label]
				  )}</div>`
				: "";

			div.innerHTML = `
				<strong>${space.label}</strong><br/>
				(${space.payout}:1)
				${betInfo}
			`;

			div.onclick = () => {
				if (gameEnded) return;

				const currentBet = bids[space.label] || 0;
				const isNewBet = !bids.hasOwnProperty(space.label);

				if (isNewBet && tokensUsed >= 3) {
					alert("You can only place tokens on up to 3 spaces.");
					return;
				}

				currentBetLabel = space.label;
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

async function rollDice() {
	if (tokensUsed === 0 || gameEnded) return alert("Place at least one bid.");

	appendLog(`\n\n<b>Round ${round}</b>`);
	appendLog(`🎲 Rolling the dice...`);

	const diceSound = document.getElementById("dice-sound");
	diceSound.currentTime = 0;
	diceSound.play();

	const dice1Img = document.getElementById("dice1");
	const dice2Img = document.getElementById("dice2");

	// Animate rolling
	for (let i = 0; i < 8; i++) {
		const temp1 = Math.ceil(Math.random() * 6);
		const temp2 = Math.ceil(Math.random() * 6);
		dice1Img.src = `images/dice-${temp1}.png`;
		dice2Img.src = `images/dice-${temp2}.png`;
		dice1Img.style.transform = `rotate(${Math.random() * 360}deg)`;
		dice2Img.style.transform = `rotate(${Math.random() * 360}deg)`;
		await delay(100);
	}

	// Final roll
	const d1 = Math.ceil(Math.random() * 6);
	const d2 = Math.ceil(Math.random() * 6);
	const total = d1 + d2;

	dice1Img.src = `images/dice-${d1}.png`;
	dice2Img.src = `images/dice-${d2}.png`;
	dice1Img.style.transform = `rotate(0deg)`;
	dice2Img.style.transform = `rotate(0deg)`;

	appendLog(`→ You rolled: ${d1} + ${d2} = ${total}`);
	await delay(1000);

	let winnings = 0;
	let losses = 0;
	let result = "";
	for (const label in bids) {
		const payout = getPayout(label, total);
		const invested = bids[label];
		roiTracker[label].invested += invested;
		if (payout > 0) {
			const gain = payout * invested;
			winnings += gain - invested;
			roiTracker[label].returned += gain;
			result += `✅ [${label}] paid ₹${formatMoney(gain - invested)}\n`;
		} else {
			losses += invested;
			money -= invested;
			result += `❌ [${label}] lost ₹${formatMoney(invested)}\n`;
		}
	}

	const net = winnings - losses;
	money += winnings;
	result += `💰 Net winnings this round: ₹${formatMoney(net)}\n`;
	result += `💼 New balance: ₹${formatMoney(money - net)} + ₹${formatMoney(
		net
	)} = ₹${formatMoney(money)}\n---`;
	appendLog(result);

	resetRound(true);
	round++;
	if (round > 10) endGame();
	updateDisplay();
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
	Object.keys(bids).forEach((k) => delete bids[k]);
	tokensUsed = 0;
	renderBoard();
	updateDisplay();
}

function endGame() {
	gameEnded = true;
	rollBtn.disabled = true;
	resetBtn.disabled = true;
	let net = money - initialMoney;
	appendLog(`\n🎉 <b>Game Over</b>`);
	appendLog(
		`You ${net >= 0 ? "won" : "lost"} ₹${formatMoney(Math.abs(net))}`
	);
	appendLog(`\nSummary of Bets:`);

	for (const label in roiTracker) {
		const { invested, returned } = roiTracker[label];
		if (invested > 0) {
			const payout = spaces.find((s) => s.label === label).payout;
			const numBets = invested / 1000;
			const actualHits = returned / (payout * 1000);
			const theoreticalProb = getTheoreticalProbability(label);
			const expectedHits =
				(round - 1) *
				theoreticalProb *
				(numBets / Math.min(numBets, 3));

			appendLog(`${label}: You bet ${numBets} time(s).`);
			// appendLog(`  ↳ Expected hits: ${expectedHits.toFixed(2)}`);
			appendLog(`  ↳ Actual hits: ${actualHits.toFixed(0)}`);
			appendLog(
				`  ↳ Theoretical probability: ${(theoreticalProb * 100).toFixed(
					1
				)}%`
			);
		}
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

popupConfirm.onclick = () => {
	const value = parseInt(popupInput.value);
	const currentBet = bids[currentBetLabel] || 0;
	const newTokensUsed = bids[currentBetLabel] ? tokensUsed : tokensUsed + 1;

	// Calculate total so far (excluding current space)
	let totalSoFar = 0;
	for (const label in bids) {
		if (label !== currentBetLabel) totalSoFar += bids[label];
	}
	const proposedTotal = totalSoFar + value;

	const roundLimit = money >= 0 ? money + 10000 : 10000;

	if (isNaN(value) || value <= 0 || value % 1000 !== 0) {
		alert("Enter a valid amount in ₹1000 multiples.");
		return;
	}

	if (proposedTotal > roundLimit) {
		alert(`You can bet only ₹${formatMoney(roundLimit)} this round.`);
		return;
	}

	if (!bids[currentBetLabel]) tokensUsed++;
	bids[currentBetLabel] = value;

	updateDisplay();
	renderBoard();
	popup.classList.add("hidden");
};

popupCancel.onclick = () => {
	popup.classList.add("hidden");
};

appendLog(`Welcome to Dicey Dice!
You start with ₹10,000 and 3 tokens. You can bet on outcomes like totals from 2–12 or properties like Over 7, Odd, Even.
Each bet can be any multiple of ₹1,000—even if you don't have enough money!
Choose up to 3 spots each round. The game runs for 10 rounds. Highest money wins!
---`);

window.addEventListener("DOMContentLoaded", () => {
	updateDisplay();
	renderBoard();
});
