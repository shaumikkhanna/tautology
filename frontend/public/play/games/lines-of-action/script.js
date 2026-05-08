const board = document.getElementById("board");

const state = {
	currentPlayer: "black",
	selected: null,
	board: Array(8)
		.fill(null)
		.map(() => Array(8).fill(null)),
	movingPiece: null,
	winner: null, // ← NEW
};

// Initialize the board
function createBoard() {
	board.innerHTML = "";

	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			const cell = document.createElement("div");
			cell.classList.add("cell");
			if ((row + col) % 2 === 1) cell.classList.add("black");
			cell.dataset.row = row;
			cell.dataset.col = col;

			// Skip rendering the piece if it's the one currently moving
			const isMoving =
				state.movingPiece &&
				state.movingPiece.fromRow === row &&
				state.movingPiece.fromCol === col;

			const piece = state.board[row][col];
			if (piece && !isMoving) {
				const pieceEl = document.createElement("div");
				pieceEl.classList.add("piece", piece);
				cell.appendChild(pieceEl);
			}

			cell.addEventListener("click", () => onCellClick(row, col));
			board.appendChild(cell);
		}
	}
}

function setupPieces() {
	// Black: row 0 and row 7, cols 1–6
	for (let col = 1; col <= 6; col++) {
		state.board[0][col] = "black";
		state.board[7][col] = "black";
	}

	// White: col 0 and col 7, rows 1–6
	for (let row = 1; row <= 6; row++) {
		state.board[row][0] = "white";
		state.board[row][7] = "white";
	}
}

function onCellClick(row, col) {
	if (state.winner) return;

	const selectedPiece = state.board[row][col];

	// If selecting own piece
	if (selectedPiece === state.currentPlayer) {
		state.selected = { row, col };
		highlightMoves(row, col);
		return;
	}

	// If a piece is already selected, try to move
	if (state.selected) {
		const { row: fromRow, col: fromCol } = state.selected;
		const legalMoves = getLegalMoves(fromRow, fromCol);
		const isValid = legalMoves.some(
			(pos) => pos.row === row && pos.col === col
		);
		if (isValid) {
			movePiece(fromRow, fromCol, row, col);
			state.selected = null;
		} else {
			state.selected = null;
			createBoard(); // clear highlights
		}
	}
}

function switchPlayer() {
	if (state.winner) return;

	state.currentPlayer = state.currentPlayer === "black" ? "white" : "black";
	updateTurnIndicator();

	if (window.vsAI && state.currentPlayer === "white") {
		setTimeout(() => {
			if (!state.winner) computerMove();
		}, 300);
	}
}

function computerMove() {
	const moves = [];

	for (let row = 0; row < 8; row++) {
		for (let col = 0; col < 8; col++) {
			if (state.board[row][col] === "white") {
				const legal = getLegalMoves(row, col);
				for (const move of legal) {
					const score = evaluateMove(
						row,
						col,
						move.row,
						move.col,
						"white"
					);
					moves.push({
						fromRow: row,
						fromCol: col,
						toRow: move.row,
						toCol: move.col,
						score,
					});
				}
			}
		}
	}

	if (moves.length === 0) {
		alert("White has no legal moves!");
		return;
	}

	moves.sort((a, b) => b.score - a.score);
	const best = moves[0];
	movePiece(best.fromRow, best.fromCol, best.toRow, best.toCol);
}

function countGroups(player) {
	const visited = Array(8)
		.fill(null)
		.map(() => Array(8).fill(false));
	let groups = 0;

	for (let r = 0; r < 8; r++) {
		for (let c = 0; c < 8; c++) {
			if (state.board[r][c] === player && !visited[r][c]) {
				groups++;
				floodFill(r, c, player, visited);
			}
		}
	}

	return groups;
}

function floodFill(r, c, player, visited) {
	const queue = [{ r, c }];
	const dirs = [
		[-1, -1],
		[-1, 0],
		[-1, 1],
		[0, -1],
		[0, 1],
		[1, -1],
		[1, 0],
		[1, 1],
	];

	while (queue.length > 0) {
		const { r, c } = queue.pop();
		visited[r][c] = true;

		for (const [dr, dc] of dirs) {
			const nr = r + dr,
				nc = c + dc;
			if (
				inBounds(nr, nc) &&
				!visited[nr][nc] &&
				state.board[nr][nc] === player
			) {
				queue.push({ r: nr, c: nc });
				visited[nr][nc] = true;
			}
		}
	}
}

function scoreBoard(player) {
	let score = 0;
	const positions = [];

	for (let r = 0; r < 8; r++) {
		for (let c = 0; c < 8; c++) {
			if (state.board[r][c] === player) {
				positions.push([r, c]);
			}
		}
	}

	if (positions.length === 0) return -Infinity;

	const rows = positions.map((p) => p[0]);
	const cols = positions.map((p) => p[1]);
	const spread =
		Math.max(...rows) -
		Math.min(...rows) +
		(Math.max(...cols) - Math.min(...cols));
	score -= spread;

	const groupPenalty = countGroups(player) * 5;
	score -= groupPenalty;

	return score;
}

function evaluateMove(fromRow, fromCol, toRow, toCol, player) {
	// Deep clone board
	const backup = state.board.map((row) => row.slice());

	const captured = state.board[toRow][toCol];
	state.board[toRow][toCol] = state.board[fromRow][fromCol];
	state.board[fromRow][fromCol] = null;

	const score = scoreBoard(player);

	// Restore
	state.board[fromRow][fromCol] = state.board[toRow][toCol];
	state.board[toRow][toCol] = captured;

	return score;
}

function movePiece(fromRow, fromCol, toRow, toCol) {
	const color = state.board[fromRow][fromCol];

	// Mark piece as moving so it won't be rendered statically
	state.movingPiece = { fromRow, fromCol };

	// Draw board without static piece
	createBoard();

	// Create and animate moving piece
	const piece = document.createElement("div");
	piece.classList.add("moving-piece", color);

	const fromX = fromCol * 62 + 10;
	const fromY = fromRow * 62 + 10;
	const toX = toCol * 62 + 10;
	const toY = toRow * 62 + 10;

	piece.style.left = `${fromX}px`;
	piece.style.top = `${fromY}px`;
	board.appendChild(piece);

	// Trigger movement
	requestAnimationFrame(() => {
		piece.style.left = `${toX}px`;
		piece.style.top = `${toY}px`;
	});

	// After animation completes
	setTimeout(() => {
		if (piece.parentNode) piece.parentNode.removeChild(piece);
		state.movingPiece = null;

		if (state.board[toRow][toCol] && state.board[toRow][toCol] !== color) {
			state.board[toRow][toCol] = null;
		}
		state.board[toRow][toCol] = color;
		state.board[fromRow][fromCol] = null;

		createBoard();

		// ✅ Check for win for both players
		if (checkWin("black")) {
			state.winner = "black";
			document.getElementById("turn-indicator").textContent =
				"Black wins!";
			return;
		}
		if (checkWin("white")) {
			state.winner = "white";
			document.getElementById("turn-indicator").textContent =
				"White wins!";
			return;
		}

		switchPlayer();
	}, 450);
}

function countPiecesInLine(row, col, dRow, dCol) {
	let count = 0;

	// backward
	let r = row - dRow;
	let c = col - dCol;
	while (inBounds(r, c)) {
		if (state.board[r][c]) count++;
		r -= dRow;
		c -= dCol;
	}

	// forward
	r = row;
	c = col;
	while (inBounds(r, c)) {
		if (state.board[r][c]) count++;
		r += dRow;
		c += dCol;
	}

	return count;
}

function getLegalMoves(row, col) {
	const dirs = [
		[0, 1],
		[1, 0],
		[1, 1],
		[-1, 0],
		[0, -1],
		[-1, -1],
		[-1, 1],
		[1, -1],
	];
	const moves = [];

	for (const [dRow, dCol] of dirs) {
		const dist = countPiecesInLine(row, col, dRow, dCol);
		const destRow = row + dRow * dist;
		const destCol = col + dCol * dist;

		if (inBounds(destRow, destCol)) {
			const destPiece = state.board[destRow][destCol];
			if (!destPiece || destPiece !== state.currentPlayer) {
				moves.push({ row: destRow, col: destCol });
			}
		}
	}

	return moves;
}

function checkWin(player) {
	const visited = Array(8)
		.fill(null)
		.map(() => Array(8).fill(false));
	let total = 0;
	let found = false;
	let start = null;

	// Find all pieces and starting point
	for (let r = 0; r < 8; r++) {
		for (let c = 0; c < 8; c++) {
			if (state.board[r][c] === player) {
				total++;
				if (!found) {
					start = { r, c };
					found = true;
				}
			}
		}
	}

	if (!start) return false;

	// BFS to count connected components
	const queue = [start];
	visited[start.r][start.c] = true;
	let connected = 1;

	const directions = [
		[-1, -1],
		[-1, 0],
		[-1, 1],
		[0, -1],
		[0, 1],
		[1, -1],
		[1, 0],
		[1, 1],
	];

	while (queue.length > 0) {
		const { r, c } = queue.pop();
		for (const [dr, dc] of directions) {
			const nr = r + dr,
				nc = c + dc;
			if (
				inBounds(nr, nc) &&
				!visited[nr][nc] &&
				state.board[nr][nc] === player
			) {
				visited[nr][nc] = true;
				queue.push({ r: nr, c: nc });
				connected++;
			}
		}
	}

	return connected === total;
}

function updateTurnIndicator() {
	const el = document.getElementById("turn-indicator");
	el.textContent = `${capitalize(state.currentPlayer)}'s turn`;
}

function capitalize(word) {
	return word[0].toUpperCase() + word.slice(1);
}

function inBounds(r, c) {
	return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function highlightMoves(row, col) {
	createBoard(); // Clear board first

	const legalMoves = getLegalMoves(row, col);
	for (const { row: r, col: c } of legalMoves) {
		const index = r * 8 + c;
		const cell = board.children[index];
		cell.classList.add("highlight");
	}

	// Also highlight selected
	const selectedIndex = row * 8 + col;
	board.children[selectedIndex].classList.add("highlight");
}

let suggestedMove = null;

function showHint() {
	if (state.winner) return;

	const player = state.currentPlayer;
	const result = getHintMove(player);

	if (!result || !result.move) {
		alert("No legal moves available.");
		return;
	}

	suggestedMove = result.move;

	const msgEl = document.getElementById("hint-message");
	if (result.type === "win") {
		msgEl.textContent = "✅ You can make a winning a move.";
	} else if (result.type === "safe") {
		msgEl.textContent = "⚠️ There is a way out of this.";
	} else {
		msgEl.textContent = "➡️ There is a move for you.";
	}

	document.getElementById("hint-box").style.display = "block";
}

function getHintMove(player) {
	const moves = getAllLegalMoves(player);

	// Check for immediate winning move
	for (const move of moves) {
		applyMoveTemporarily(move, player);
		const win = checkWin(player);
		undoTemporaryMove(move, player);
		if (win) return { move, type: "win" };
	}

	// Step 1: Can opponent win right now?
	const opp = player === "black" ? "white" : "black";
	const oppThreatening = getAllLegalMoves(opp).some((m) => {
		applyMoveTemporarily(m, opp);
		const win = checkWin(opp);
		undoTemporaryMove(m, opp);
		return win;
	});

	// Step 2: If yes, try to block it
	if (oppThreatening) {
		const safeMoves = moves.filter((move) => {
			applyMoveTemporarily(move, player);
			const threatStillExists = getAllLegalMoves(opp).some((m) => {
				applyMoveTemporarily(m, opp);
				const win = checkWin(opp);
				undoTemporaryMove(m, opp);
				return win;
			});
			undoTemporaryMove(move, player);
			return !threatStillExists;
		});

		if (safeMoves.length > 0) return { move: safeMoves[0], type: "safe" };
	}

	// Step 3: fallback to best evaluated move
	let bestScore = -Infinity;
	let bestMove = null;

	for (const move of moves) {
		const score = evaluateMove(
			move.fromRow,
			move.fromCol,
			move.toRow,
			move.toCol,
			player
		);
		if (score > bestScore) {
			bestScore = score;
			bestMove = move;
		}
	}

	return bestMove ? { move: bestMove, type: "any" } : null;
}

function highlightSuggestedMove(move) {
	const fromIndex = move.fromRow * 8 + move.fromCol;
	const toIndex = move.toRow * 8 + move.toCol;

	board.children[fromIndex].classList.add("highlight-hint");
	board.children[toIndex].classList.add("highlight-hint");
}

document.getElementById("show-move-btn").addEventListener("click", () => {
	document.getElementById("hint-box").style.display = "none";
	if (suggestedMove) {
		createBoard(); // clear old highlights
		highlightSuggestedMove(suggestedMove);
	}
});

function getAllLegalMoves(player) {
	const moves = [];
	for (let r = 0; r < 8; r++) {
		for (let c = 0; c < 8; c++) {
			if (state.board[r][c] === player) {
				for (const move of getLegalMoves(r, c)) {
					moves.push({
						fromRow: r,
						fromCol: c,
						toRow: move.row,
						toCol: move.col,
					});
				}
			}
		}
	}
	return moves;
}

function applyMoveTemporarily(move, player) {
	move.captured = state.board[move.toRow][move.toCol];
	state.board[move.toRow][move.toCol] = player;
	state.board[move.fromRow][move.fromCol] = null;
}

function undoTemporaryMove(move, player) {
	state.board[move.fromRow][move.fromCol] = player;
	state.board[move.toRow][move.toCol] = move.captured;
}

setupPieces();
createBoard();
updateTurnIndicator();
