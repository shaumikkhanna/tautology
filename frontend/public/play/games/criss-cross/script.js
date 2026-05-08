const gridSize = 5;
const grid = document.getElementById("grid");
const statusLine = document.getElementById("status");
const rollSound = new Audio("sounds/dice-roll.mp3");
let currentRoll = [];
let placing = false;
let previewing = false;
let tentativeCell = null;
let highlighted = [];
let turn = 1;

function clearPreview() {
	document.querySelectorAll(".grid-cell.preview").forEach((cell) => {
		cell.textContent = "";
		cell.classList.remove("preview");
	});
	highlighted = [];
}

function clearTentative() {
	if (tentativeCell) {
		tentativeCell.textContent = "";
		tentativeCell.classList.remove("tentative");
		tentativeCell = null;
	}
}

function cancelPlacement() {
	clearPreview();
	clearTentative();
	previewing = false;
	tentativeCell = null;
	highlighted = [];
}

function launchConfetti() {
	const canvas = document.getElementById("confetti-canvas");

	confetti.create(canvas, {
		resize: true,
		useWorker: true,
	})({
		particleCount: 150,
		spread: 80,
		origin: { y: 0.6 },
	});
}

// Create top-controls container
const topControls = document.createElement("div");
topControls.className = "top-controls";

// Create Roll Dice button
const rollButton = document.createElement("button");
rollButton.textContent = `Roll Dice (1 of 12)`;
rollButton.className = "roll-button";
rollButton.id = "roll-button";

// Create Info button
const infoButton = document.createElement("button");
infoButton.textContent = "i";
infoButton.className = "info-button-inline";
infoButton.id = "info-button";

// Add both buttons to the container
topControls.appendChild(rollButton);
topControls.appendChild(infoButton);

// Insert into DOM before the status line
document.querySelector(".game-container").insertBefore(topControls, statusLine);

rollButton.onclick = () => {
	if (placing || previewing || turn > 12) return;

	const die1 = Math.floor(Math.random() * 6) + 1;
	const die2 = Math.floor(Math.random() * 6) + 1;
	currentRoll = [die1, die2];

	rollSound.currentTime = 0;
	rollSound.play();

	const die1Img = document.getElementById("die1");
	const die2Img = document.getElementById("die2");

	die1Img.classList.add("rolling");
	die2Img.classList.add("rolling");

	setTimeout(() => {
		die1Img.src = `images/dice-${die1}.png`;
		die2Img.src = `images/dice-${die2}.png`;
		die1Img.classList.remove("rolling");
		die2Img.classList.remove("rolling");

		// Check if placement is even possible
		if (canPlaceCurrentRoll()) {
			console.log(`Current roll: ${currentRoll}`);
			placing = true;
			previewing = false;
			statusLine.textContent = `Place the ${die1}`;
		} else {
			console.log(`No valid placements for roll: ${currentRoll}`);
			statusLine.textContent = `No valid placements left :( Roll again.`;

			// Advance turn even if placement wasn't possible
			advanceTurn();
		}
	}, 300);
};

// Build grid
for (let r = 0; r < gridSize; r++) {
	for (let c = 0; c < gridSize; c++) {
		const cell = document.createElement("div");
		cell.className = "grid-cell";
		cell.dataset.row = r;
		cell.dataset.col = c;
		cell.onclick = () => handleClick(cell);
		cell.onmouseenter = () => {
			if (placing && !previewing && !cell.textContent) {
				cell.textContent = currentRoll[0];
				cell.classList.add("preview");
			}
		};
		cell.onmouseleave = () => {
			if (placing && !previewing && cell.classList.contains("preview")) {
				cell.textContent = "";
				cell.classList.remove("preview");
			}
		};
		grid.appendChild(cell);
	}
}

function showPreview(cell) {
	if (!placing || previewing || cell.textContent) return;

	clearPreview(); // Always clear old previews
	cell.textContent = currentRoll[0];
	cell.classList.add("preview");
}

function highlightAllFirstDieSpots() {
	clearPreview();
	for (let r = 0; r < gridSize; r++) {
		for (let c = 0; c < gridSize; c++) {
			const cell = document.querySelector(
				`.grid-cell[data-row='${r}'][data-col='${c}']`
			);
			if (!cell.textContent) {
				cell.textContent = currentRoll[0];
				cell.classList.add("preview");
			}
		}
	}
}

function handleClick(cell) {
	const row = parseInt(cell.dataset.row);
	const col = parseInt(cell.dataset.col);

	if (!placing) return;

	// Step 1: place first die
	if (!previewing && cell.classList.contains("preview")) {
		clearPreview();
		cell.textContent = currentRoll[0];
		cell.classList.remove("preview");
		cell.classList.add("tentative");
		tentativeCell = cell;

		const validSecond = showAdjacentOptions(row, col); // returns true if there are options

		if (validSecond) {
			previewing = true;
			statusLine.textContent = `Now place the ${currentRoll[1]}`;
		} else {
			// Invalid first placement, cancel
			statusLine.textContent = `No space for ${currentRoll[1]} next to this cell. Try another.`;
			clearTentative();
		}
		return;
	}

	// Step 2: confirm second die
	if (previewing && cell.classList.contains("preview")) {
		cell.textContent = currentRoll[1];
		cell.classList.remove("preview");
		if (tentativeCell) tentativeCell.classList.remove("tentative");

		clearPreview();

		tentativeCell = null;
		previewing = false;
		placing = false;

		statusLine.textContent = `Ready for next roll`;
		advanceTurn();
		return;
	}

	// Invalid click
	cancelPlacement();
	statusLine.textContent = "Placement canceled. Place again.";
}

function advanceTurn() {
	turn++;
	if (turn <= 12) {
		rollButton.textContent = `Roll Dice (${turn} of 12)`;
	} else {
		rollButton.textContent = `All Rolls Done`;
		scoreGrid();
	}
}

function showAdjacentOptions(r, c) {
	clearPreview();
	let valid = false;

	const directions = [
		[-1, 0],
		[1, 0], // vertical
		[0, -1],
		[0, 1], // horizontal
	];

	for (const [dr, dc] of directions) {
		const nr = r + dr;
		const nc = c + dc;
		if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
			const neighbor = document.querySelector(
				`.grid-cell[data-row='${nr}'][data-col='${nc}']`
			);
			if (neighbor && !neighbor.textContent) {
				neighbor.textContent = currentRoll[1];
				neighbor.classList.add("preview");
				highlighted.push(neighbor);
				valid = true;
			}
		}
	}

	return valid;
}

function canPlaceCurrentRoll() {
	for (let r = 0; r < gridSize; r++) {
		for (let c = 0; c < gridSize; c++) {
			const cell = document.querySelector(
				`.grid-cell[data-row='${r}'][data-col='${c}']`
			);
			if (cell.textContent) continue;

			// Check 4 adjacent directions
			const directions = [
				[-1, 0],
				[1, 0],
				[0, -1],
				[0, 1],
			];

			for (const [dr, dc] of directions) {
				const nr = r + dr;
				const nc = c + dc;
				if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
					const neighbor = document.querySelector(
						`.grid-cell[data-row='${nr}'][data-col='${nc}']`
					);
					if (neighbor && !neighbor.textContent) {
						return true; // Found a valid pair of adjacent empty cells
					}
				}
			}
		}
	}
	return false;
}

function scoreGrid() {
	const scoring = {
		2: 2,
		3: 4,
		4: 8,
		5: 10,
	};

	const rowScoresContainer = document.getElementById("row-scores");
	const colScoresContainer = document.getElementById("column-scores");
	rowScoresContainer.innerHTML = "";
	colScoresContainer.innerHTML = "";

	function scoreLine(values) {
		let score = 0;
		let current = values[0];
		let count = 1;

		for (let i = 1; i <= values.length; i++) {
			if (values[i] === current && current !== "") {
				count++;
			} else {
				if (count >= 2) {
					score += scoring[Math.min(count, 5)];
				}
				current = values[i];
				count = 1;
			}
		}
		return score;
	}

	const rowScores = [];
	const colScores = [];
	let total = 0;

	// Compute all scores first
	for (let r = 0; r < gridSize; r++) {
		let row = [];
		for (let c = 0; c < gridSize; c++) {
			const cell = document.querySelector(
				`.grid-cell[data-row='${r}'][data-col='${c}']`
			);
			row.push(cell.textContent.trim());
		}
		const score = scoreLine(row);
		rowScores.push(score);
		total += score;
	}
	for (let c = 0; c < gridSize; c++) {
		let col = [];
		for (let r = 0; r < gridSize; r++) {
			const cell = document.querySelector(
				`.grid-cell[data-row='${r}'][data-col='${c}']`
			);
			col.push(cell.textContent.trim());
		}
		const score = scoreLine(col);
		colScores.push(score);
		total += score;
	}

	// Show scores one-by-one with delay
	const delay = 500; // ms
	let index = 0;

	function showNextScore() {
		if (index < rowScores.length) {
			const span = document.createElement("span");
			span.textContent = rowScores[index];
			rowScoresContainer.appendChild(span);
		} else if (index < rowScores.length + colScores.length) {
			const span = document.createElement("span");
			span.textContent = colScores[index - rowScores.length];
			colScoresContainer.appendChild(span);
		} else {
			// All scores shown — show final modal
			showFinalScorePopup(total);
			return;
		}
		index++;
		setTimeout(showNextScore, delay);
	}

	showNextScore();
}

function showFinalScorePopup(score) {
	const modal = document.getElementById("score-modal");
	const scoreText = modal.querySelector(".final-score-text");
	const highscoreList = document.getElementById("highscore-list");
	const newHighscoreMsg = document.getElementById("new-highscore-message");

	// Show modal
	scoreText.textContent = `Final Score: ${score}`;
	modal.classList.remove("hidden");

	// Get and update highscores
	let highscores = JSON.parse(
		localStorage.getItem("criss_highscores") || "[]"
	);
	highscores.push(score);
	highscores.sort((a, b) => b - a);
	highscores = highscores.slice(0, 5);
	localStorage.setItem("criss_highscores", JSON.stringify(highscores));

	// Render highscore list
	highscoreList.innerHTML = "";
	for (let i = 0; i < 5; i++) {
		const li = document.createElement("li");

		const rankSpan = document.createElement("span");
		rankSpan.textContent = `${i + 1}.`;
		rankSpan.classList.add("rank");

		const scoreSpan = document.createElement("span");
		scoreSpan.textContent = highscores[i] != null ? highscores[i] : "—";
		scoreSpan.classList.add("score");

		if (highscores[i] === score) {
			scoreSpan.classList.add("highlighted-score");
		}

		li.appendChild(rankSpan);
		li.appendChild(scoreSpan);
		highscoreList.appendChild(li);
	}

	// Show message if this is the new #1 highscore
	if (score === highscores[0]) {
		newHighscoreMsg.textContent = "New #1 Highscore!";
		newHighscoreMsg.classList.remove("hidden");
		launchConfetti();
	} else {
		newHighscoreMsg.classList.add("hidden");
	}

	// Button handlers
	document.getElementById("close-modal").onclick = () => {
		modal.classList.add("hidden");
		rollButton.textContent = "Play Again";
		rollButton.onclick = () => location.reload();
	};

	document.getElementById("play-again").onclick = () => {
		location.reload();
	};
}

document.getElementById("info-button").onclick = () => {
	document.getElementById("how-to-play-modal").classList.remove("hidden");
};

document.getElementById("info-button-popup").onclick = () => {
	document.getElementById("how-to-play-modal").classList.remove("hidden");
};

document.getElementById("close-info").onclick = () => {
	document.getElementById("how-to-play-modal").classList.add("hidden");
};
