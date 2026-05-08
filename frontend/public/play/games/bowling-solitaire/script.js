document.addEventListener("DOMContentLoaded", () => {
	// All variables, functions, and event listeners inside here:

	let frameNumber = 1;
	let bowlUsed = false;
	let knockedPins = new Set();
	let scoreHistory = [];

	let selectedBall = null;
	let selectedPileId = null;
	let selectedPins = new Set();

	let pinsKnockedInCurrentBowl = 0;
	let currentFrameBowlPins = [];

	const PIN_ADJACENCY = {
		1: [2, 3],
		2: [1, 3, 4, 5],
		3: [1, 2, 5, 6],
		4: [2, 5, 7, 8],
		5: [2, 3, 4, 6, 8, 9],
		6: [3, 5, 9, 10],
		7: [4, 8],
		8: [4, 5, 7, 9],
		9: [5, 6, 8, 10],
		10: [6, 9],
	};

	const ALWAYS_VISIBLE_PINS = [1, 2, 3, 4, 6, 7, 10];

	function shuffle(array) {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}

	function getCardValue(card) {
		const face = card.slice(0, -1);
		return face === "A" ? 1 : parseInt(face);
	}

	function arePinsConnected(pinIndexes) {
		if (pinIndexes.length <= 1) return true;

		const visited = new Set();
		const queue = [pinIndexes[0]];
		visited.add(pinIndexes[0]);

		while (queue.length > 0) {
			const current = queue.shift();
			const neighbors = PIN_ADJACENCY[current] || [];

			for (let neighbor of neighbors) {
				if (pinIndexes.includes(neighbor) && !visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}

		return visited.size === pinIndexes.length;
	}

	function isPinVisible(pin, knockedDownSet) {
		// Pins that are always visible
		if (ALWAYS_VISIBLE_PINS.includes(pin)) return true;

		switch (pin) {
			case 5:
				return (
					(knockedDownSet.has(1) &&
						(knockedDownSet.has(2) || knockedDownSet.has(3))) ||
					(knockedDownSet.has(2) && knockedDownSet.has(4)) ||
					(knockedDownSet.has(3) && knockedDownSet.has(6))
				);

			case 8:
				return (
					(knockedDownSet.has(4) &&
						(knockedDownSet.has(5) || knockedDownSet.has(7))) ||
					(knockedDownSet.has(5) &&
						(knockedDownSet.has(4) || knockedDownSet.has(9)))
				);

			case 9:
				return (
					(knockedDownSet.has(6) &&
						(knockedDownSet.has(5) || knockedDownSet.has(10))) ||
					(knockedDownSet.has(5) &&
						(knockedDownSet.has(6) || knockedDownSet.has(8)))
				);

			default:
				return false;
		}
	}

	function isValidMove(ballCard, pinIndexes, pinCards) {
		if (!ballCard) {
			return { valid: false, error: "No bowling ball card selected." };
		}

		if (pinIndexes.length === 0) {
			return { valid: false, error: "No pins selected." };
		}

		if (pinIndexes.length > 3) {
			return { valid: false, error: "You can select at most 3 pins." };
		}

		// Check sum condition
		const ballValue = getCardValue(ballCard);
		let sum = 0;
		for (let i of pinIndexes) {
			const cardName = pinCards[i - 1]; // i is 1-based
			sum += getCardValue(cardName);
		}

		if (sum % 10 !== ballValue % 10) {
			return {
				valid: false,
				error: `The sum of the selected pins (${sum}) does not match the bowling card (${ballValue}) modulo 10.`,
			};
		}

		// Check connection condition
		if (!arePinsConnected(pinIndexes)) {
			return {
				valid: false,
				error: "The selected pins are not connected. Pins must be adjacent in the bowling layout.",
			};
		}

		// At least one pin must be visible
		const knockedSet = new Set();
		document.querySelectorAll(".pin.hidden").forEach((pinDiv) => {
			const pinId = parseInt(pinDiv.id.replace("pin-", ""));
			knockedSet.add(pinId);
		});

		const hasVisiblePin = pinIndexes.some((pin) =>
			isPinVisible(pin, knockedSet)
		);

		if (!hasVisiblePin) {
			return {
				valid: false,
				error: "At least one of the selected pins must be visible from the front.",
			};
		}

		// All checks passed
		return { valid: true };
	}

	function showTopCard(pile, pileId) {
		const pileDiv = document.getElementById(pileId);
		pileDiv.innerHTML = "";
		pileDiv.style.position = "relative";

		// Show each card in the stack
		pile.forEach((card, i) => {
			const img = document.createElement("img");
			img.src =
				i === pile.length - 1 ? `cards/${card}.svg` : `cards/back.svg`;
			img.alt = i === pile.length - 1 ? card : "Back";
			img.classList.add("stacked-card");
			img.style.left = `-${(pile.length - 1 - i) * 14}px`; // shift each left
			img.style.zIndex = `${i}`;
			pileDiv.appendChild(img);
		});
	}

	function startNewFrame() {
		bowlUsed = false;
		selectedBall = null;
		selectedPileId = null;
		selectedPins.clear();
		knockedPins.clear();
		pinsKnockedInCurrentBowl = 0;
		currentFrameBowlPins = [];

		document.querySelectorAll(".pin").forEach((p) => {
			p.classList.remove("hidden", "selected");
			p.innerHTML = "";
		});

		document.querySelectorAll(".ball-pile").forEach((p) => {
			p.innerHTML = "";
			p.classList.remove("selected");
		});

		const suits = ["D", "H"];
		const values = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
		let deck = [];
		for (let suit of suits) {
			for (let value of values) deck.push(`${value}${suit}`);
		}

		shuffle(deck);

		const pinCards = deck.slice(0, 10);
		const pile1 = deck.slice(10, 15);
		const pile2 = deck.slice(15, 18);
		const pile3 = deck.slice(18, 20);

		window.gameState = { pinCards, pile1, pile2, pile3 };

		pinCards.forEach((card, index) => {
			const pin = document.getElementById(`pin-${index + 1}`);
			const img = document.createElement("img");
			img.src = `cards/${card}.svg`;
			img.alt = card;
			pin.appendChild(img);
		});

		showTopCard(pile1, "pile-1");
		showTopCard(pile2, "pile-2");
		showTopCard(pile3, "pile-3");
	}

	function calculateTotalScores(frames) {
		let totals = [];
		let total = 0;

		for (let i = 0; i < frames.length; i++) {
			const f = frames[i];
			let frameScore = 0;

			if (f.strike) {
				// Need next 2 bowls
				let bonus = 0;
				if (i + 1 < frames.length) {
					const next = frames[i + 1];
					if (next.strike) {
						bonus += next.bowl1 ?? 0;
						const next2 = frames[i + 2];
						bonus += next2?.bowl1 ?? 0;
					} else {
						bonus += (next.bowl1 ?? 0) + (next.bowl2 ?? 0);
					}
				}
				frameScore = 10 + bonus;
			} else if (f.spare) {
				// Need next 1 bowl
				let bonus = 0;
				if (i + 1 < frames.length) {
					bonus += frames[i + 1].bowl1 ?? 0;
				}
				frameScore = 10 + bonus;
			} else {
				// Open frame
				frameScore = (f.bowl1 ?? 0) + (f.bowl2 ?? 0);
			}

			total += frameScore;
			totals.push(total);
		}

		return totals;
	}

	function updateScorecard() {
		const tbody = document.querySelector("#scorecard tbody");
		tbody.innerHTML = "";

		const totals = calculateTotalScores(scoreHistory);

		scoreHistory.forEach((f, i) => {
			const tr = document.createElement("tr");

			const bowl1 = f.bowl1 !== null ? f.bowl1 : "-";
			const bowl2 = f.bowl2 !== null ? f.bowl2 : "-";
			const bowl3 = f.bowl3 !== null ? f.bowl3 : "-";

			tr.innerHTML = `
      <td>${f.frame}</td>
      <td>${bowl1}</td>
      <td>${bowl2}</td>
      <td>${bowl3}</td>
      <td>${f.type}</td>
      <td>${f.pins}</td>
      <td>${totals[i]}</td>
    `;

			tbody.appendChild(tr);
		});
	}

	// Event Listeners
	["pile-1", "pile-2", "pile-3"].forEach((pileId) => {
		const pileDiv = document.getElementById(pileId);
		pileDiv.addEventListener("click", () => {
			if (selectedPileId === pileId) {
				pileDiv.classList.remove("selected");
				selectedBall = null;
				selectedPileId = null;
			} else {
				document
					.querySelectorAll(".ball-pile")
					.forEach((p) => p.classList.remove("selected"));
				pileDiv.classList.add("selected");

				selectedPileId = pileId;
				const pile =
					window.gameState[
						pileId === "pile-1"
							? "pile1"
							: pileId === "pile-2"
							? "pile2"
							: "pile3"
					];
				selectedBall = pile[pile.length - 1];
			}
		});
	});

	for (let i = 1; i <= 10; i++) {
		const pin = document.getElementById(`pin-${i}`);
		pin.addEventListener("click", () => {
			if (pin.classList.contains("hidden")) return;
			if (selectedPins.has(i)) {
				selectedPins.delete(i);
				pin.classList.remove("selected");
			} else {
				selectedPins.add(i);
				pin.classList.add("selected");
			}
		});
	}

	document.getElementById("submit-move").addEventListener("click", () => {
		if (!selectedBall || selectedPins.size === 0 || !selectedPileId) {
			alert("Select a bowling ball and some pins first.");
			return;
		}

		const result = isValidMove(
			selectedBall,
			Array.from(selectedPins),
			window.gameState.pinCards
		);

		if (result.valid) {
			pinsKnockedInCurrentBowl += selectedPins.size;

			// Remove knocked pins
			selectedPins.forEach((i) => {
				const pin = document.getElementById(`pin-${i}`);
				pin.classList.add("hidden");
				pin.innerHTML = "";
			});

			// Remove the top card from the selected pile
			const pileKey =
				selectedPileId === "pile-1"
					? "pile1"
					: selectedPileId === "pile-2"
					? "pile2"
					: "pile3";
			const pile = window.gameState[pileKey];
			pile.pop();

			// Re-render the pile with stacked cards
			showTopCard(pile, selectedPileId);

			// Clear selections
			selectedPins.clear();
			selectedBall = null;
			selectedPileId = null;
			document
				.querySelectorAll(".pin")
				.forEach((p) => p.classList.remove("selected"));
			document
				.querySelectorAll(".ball-pile")
				.forEach((p) => p.classList.remove("selected"));
		} else {
			alert(result.error);
		}
	});

	document.getElementById("end-bowl").addEventListener("click", () => {
		if (bowlUsed) {
			alert("You can only end the bowl once per frame.");
			return;
		}

		bowlUsed = true;
		currentFrameBowlPins.push(pinsKnockedInCurrentBowl);
		pinsKnockedInCurrentBowl = 0;

		["pile1", "pile2", "pile3"].forEach((key, i) => {
			const pile = window.gameState[key];
			if (pile.length > 0) pile.pop();

			// Re-render pile using showTopCard
			const pileId = `pile-${i + 1}`;
			showTopCard(pile, pileId);
		});

		selectedBall = null;
		selectedPileId = null;

		document
			.querySelectorAll(".ball-pile")
			.forEach((p) => p.classList.remove("selected"));
	});

	document.getElementById("end-frame").addEventListener("click", () => {
		currentFrameBowlPins.push(pinsKnockedInCurrentBowl);

		const pinsDown = knockedPins.size;
		const isStrike = pinsDown === 10 && !bowlUsed;
		const isSpare = pinsDown === 10 && bowlUsed;

		const frameScore = {
			frame: frameNumber,
			pins: knockedPins.size,
			strike: isStrike,
			spare: isSpare,
			bowl1: currentFrameBowlPins[0] ?? null,
			bowl2: currentFrameBowlPins[1] ?? null,
			bowl3: currentFrameBowlPins[2] ?? null,
			type: isStrike ? "Strike" : isSpare ? "Spare" : "Open",
		};

		console.log(frameScore);

		scoreHistory.push(frameScore);
		updateScorecard();

		frameNumber++;
		document.getElementById("frame-number").textContent = frameNumber;

		// Special rule: extra bowl(s) if 10th frame and spare/strike
		if (frameNumber === 10 && (isStrike || isSpare)) {
			// Keep frameNumber at 10
			alert("Bonus bowl granted! Play your extra ball(s).");
			// You can add bonus bowl logic here later
		} else if (frameNumber === 10) {
			alert("Game over!");
		}

		startNewFrame();
	});

	document.getElementById("info-button").addEventListener("click", () => {
		document.getElementById("rules-popup").classList.add("active");
	});

	document.getElementById("close-popup").addEventListener("click", () => {
		document.getElementById("rules-popup").classList.remove("active");
	});

	// 🔥 Start the game!
	startNewFrame();
});
