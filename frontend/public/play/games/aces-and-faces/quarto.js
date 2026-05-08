const suits = ["S", "H", "D", "C"];
const ranks = ["A", "J", "Q", "K"];

const cards = [];
let id = 0;
for (let r = 0; r < 4; r++) {
	for (let s = 0; s < 4; s++) {
		const name = `${ranks[r]}${suits[s]}`;
		const traits = [
			r >= 2 ? 1 : 0, // Ruler
			suits[s] === "S" || suits[s] === "C" ? 1 : 0, // Black
			r === 1 || r === 3 ? 1 : 0, // Man (J,K)
			suits[s] === "H" || suits[s] === "C" ? 1 : 0, // Round
		];
		cards.push({ id: id++, name, traits });
	}
}

const urlParams = new URLSearchParams(window.location.search);
const mode = urlParams.get("mode"); // "pass" or "single"

const grid = document.getElementById("grid");
const cardBank = document.getElementById("cardBank");
const instructionBox = document.getElementById("instructionBox");
const message = document.getElementById("message");
const playAgainBtn = document.getElementById("playAgainBtn");

const boardState = new Array(16).fill(null);
let currentPlayer = mode === "single" ? "You" : "Lata";
const humanPlayer = "You";
const cpuPlayer = "CPU";
let phase = "pick"; // 'pick' or 'place'
let selectedCard = null;
let turnCount = 0;

// Render card bank
function renderCardBank() {
	cardBank.innerHTML = "";
	cards.forEach((card) => {
		if (boardState.includes(card)) return; // already placed

		const img = document.createElement("img");
		img.src = `cards/${card.name}.svg`;
		img.className = "card";
		img.draggable = false;
		img.dataset.id = card.id;

		img.addEventListener("click", () => {
			if (phase === "pick" && !selectedCard) {
				selectedCard = card;
				img.classList.add("selected");
				phase = "place"; // <-- ADD THIS LINE to switch phase
				updateInstruction();
				renderCardBank();
			}
		});

		if (phase === "pick") {
			img.style.cursor = "pointer";
			if (selectedCard && selectedCard.id === card.id) {
				img.classList.add("selected");
			}
		} else {
			// In 'place' phase, gray out all except the selected card
			if (selectedCard && selectedCard.id === card.id) {
				img.classList.add("selected");
				img.style.opacity = "1";
			} else {
				img.style.opacity = "0.3";
				img.style.pointerEvents = "none";
			}
		}

		cardBank.appendChild(img);
	});
}

// Render board
for (let i = 0; i < 16; i++) {
	const cell = document.createElement("div");
	cell.className = "cell";
	cell.dataset.index = i;

	cell.addEventListener("click", () => {
		if (mode === "single" && currentPlayer !== humanPlayer) return;
		if (phase !== "place" || !selectedCard || message.textContent !== "")
			return;
		if (cell.children.length > 0) return;

		const img = document.createElement("img");
		img.src = `cards/${selectedCard.name}.svg`;
		img.className = "card";
		img.draggable = false;

		cell.appendChild(img);
		const index = parseInt(cell.dataset.index);
		boardState[index] = selectedCard;

		// Remove placed card from list
		const cardIdx = cards.findIndex((c) => c.id === selectedCard.id);
		if (cardIdx !== -1) cards.splice(cardIdx, 1);

		if (checkWin()) {
			return;
		}

		if (mode === "single") {
			// Switch from the player who just placed (currentPlayer) to the one who will pick
			currentPlayer =
				currentPlayer === humanPlayer ? cpuPlayer : humanPlayer;
			phase = "pick";
			selectedCard = null;
			turnCount++;
			updateInstruction();
			renderCardBank();
		} else {
			// Default pass-and-play logic
			currentPlayer = currentPlayer === "Lata" ? "Raj" : "Lata";
			phase = "pick";
			selectedCard = null;
			turnCount++;
			updateInstruction();
			renderCardBank();
		}
	});

	grid.appendChild(cell);
}

function updateInstruction() {
	if (message.textContent !== "") return;

	if (phase === "pick") {
		if (mode === "single") {
			if (currentPlayer === humanPlayer) {
				instructionBox.textContent = `CPU is picking a card for you to place...`;
				setTimeout(cpuPickCard, 500);
			} else {
				instructionBox.textContent = `You, pick a card for CPU to place.`;
			}
		} else {
			const other = currentPlayer === "Lata" ? "Raj" : "Lata";
			instructionBox.textContent = `${other}, pick a card for ${currentPlayer} to place.`;
		}
	} else if (phase === "place") {
		instructionBox.textContent = `${currentPlayer}, place the selected card.`;

		if (mode === "single" && currentPlayer === cpuPlayer) {
			setTimeout(cpuPlaceCard, 500);
		}
	}
}

function cpuPickCard() {
	setTimeout(() => {
		const availableCards = cards.filter(
			(card) => !boardState.includes(card)
		);
		if (availableCards.length === 0) return;

		const emptyIndices = boardState
			.map((c, i) => (c === null ? i : null))
			.filter((i) => i !== null);

		let shuffledCards = [...availableCards];
		// Fisher–Yates shuffle to ensure random order
		for (let i = shuffledCards.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffledCards[i], shuffledCards[j]] = [
				shuffledCards[j],
				shuffledCards[i],
			];
		}

		let safeCard = null;

		for (const card of shuffledCards) {
			let causesImmediateWin = false;
			for (const index of emptyIndices) {
				boardState[index] = card; // simulate placing
				if (checkWinSimulation()) {
					causesImmediateWin = true;
					boardState[index] = null; // revert
					break;
				}
				boardState[index] = null; // revert
			}
			if (!causesImmediateWin) {
				safeCard = card;
				break;
			}
		}

		const choice =
			safeCard ||
			availableCards[Math.floor(Math.random() * availableCards.length)];
		selectedCard = choice;
		currentPlayer = humanPlayer; // CPU picked for human
		phase = "place";
		renderCardBank();
		updateInstruction();
	}, 2000);
}

function checkWinSimulation() {
	const lines = [
		[0, 1, 2, 3],
		[4, 5, 6, 7],
		[8, 9, 10, 11],
		[12, 13, 14, 15],
		[0, 4, 8, 12],
		[1, 5, 9, 13],
		[2, 6, 10, 14],
		[3, 7, 11, 15],
		[0, 5, 10, 15],
		[3, 6, 9, 12],
	];

	for (const line of lines) {
		const cards = line.map((i) => boardState[i]);
		if (cards.every((c) => c !== null)) {
			for (let trait = 0; trait < 4; trait++) {
				const values = cards.map((c) => c.traits[trait]);
				if (values.every((v) => v === values[0])) {
					return true;
				}
			}
		}
	}
	return false;
}

function cpuPlaceCard() {
	setTimeout(() => {
		const emptyIndices = boardState
			.map((c, i) => (c === null ? i : null))
			.filter((i) => i !== null);

		if (emptyIndices.length === 0 || !selectedCard) return;

		// Try to find a winning move
		let winningIndex = null;
		for (const index of emptyIndices) {
			boardState[index] = selectedCard; // Temporarily place the card
			if (checkWinSimulation()) {
				winningIndex = index;
				boardState[index] = null; // Revert
				break;
			}
			boardState[index] = null; // Revert
		}

		// Use winning move if found, else random
		const index =
			winningIndex !== null
				? winningIndex
				: emptyIndices[Math.floor(Math.random() * emptyIndices.length)];

		const cell = grid.children[index];
		const img = document.createElement("img");
		img.src = `cards/${selectedCard.name}.svg`;
		img.className = "card";
		img.draggable = false;
		cell.appendChild(img);

		boardState[index] = selectedCard;

		// Remove placed card from list
		const cardIdx = cards.findIndex((c) => c.id === selectedCard.id);
		if (cardIdx !== -1) cards.splice(cardIdx, 1);

		if (checkWin()) return;

		// Now it's human's turn to pick a card for CPU
		currentPlayer = humanPlayer;
		selectedCard = null;
		phase = "pick";
		renderCardBank();
		updateInstruction();
	}, 2000); // 2 seconds
}

// Initial render
updateInstruction();
renderCardBank();

// Check for win
function checkWin() {
	const lines = [
		// Rows
		[0, 1, 2, 3],
		[4, 5, 6, 7],
		[8, 9, 10, 11],
		[12, 13, 14, 15],
		// Columns
		[0, 4, 8, 12],
		[1, 5, 9, 13],
		[2, 6, 10, 14],
		[3, 7, 11, 15],
		// Diagonals
		[0, 5, 10, 15],
		[3, 6, 9, 12],
	];

	for (const line of lines) {
		const cards = line.map((i) => boardState[i]);
		if (cards.every((c) => c !== null)) {
			for (let trait = 0; trait < 4; trait++) {
				const values = cards.map((c) => c.traits[trait]);
				if (values.every((v) => v === values[0])) {
					for (const i of line) {
						grid.children[i].classList.add("winner");
					}

					const traitLabels = [
						["Followers", "Rulers"],
						["Red", "Black"],
						["Women", "Men"],
						["Pointy", "Round"],
					];
					const sharedValue = values[0];
					const traitName = traitLabels[trait][sharedValue];
					message.textContent = `${currentPlayer} wins! Selected cards are all ${traitName}!`;
					instructionBox.textContent = "";
					playAgainBtn.style.display = "inline-block";
					return true;
				}
			}
		}
	}
	return false;
}

playAgainBtn.addEventListener("click", () => {
	location.reload();
});
