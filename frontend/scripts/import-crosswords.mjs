import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..", "..");
const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "crosswords", "puzzles");
const destinationPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(scriptDir, "..", "content", "crosswords", "archive.json");

const sourcePuzzles = readSourcePuzzles(sourcePath);
const usedIds = new Set();
const archive = sourcePuzzles.map((puzzle, index) => {
  const normalized = normalizePuzzle(puzzle, index);

  if (usedIds.has(normalized.id)) {
    throw new Error(`${normalized.id}: duplicate puzzle id.`);
  }

  usedIds.add(normalized.id);
  return normalized;
});

validateCrossings(archive);
fs.writeFileSync(destinationPath, `${JSON.stringify(archive, null, 2)}\n`);

console.log(
  `Imported ${archive.length} crossword puzzle(s) from ${path.relative(
    repoRoot,
    sourcePath,
  )} to ${path.relative(repoRoot, destinationPath)}.`,
);

function readSourcePuzzles(inputPath) {
  const stat = fs.statSync(inputPath);

  if (!stat.isDirectory()) {
    throw new Error("Crossword source must be a directory of JSON puzzle files.");
  }

  return fs
    .readdirSync(inputPath)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort(comparePuzzleFileNames)
    .map((fileName) =>
      JSON.parse(fs.readFileSync(path.join(inputPath, fileName), "utf8")),
    );
}

function comparePuzzleFileNames(left, right) {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function normalizePuzzle(source, index) {
  if (
    source?.schemaVersion !== "1.0" ||
    !source.puzzle ||
    !source.grid ||
    !Array.isArray(source.entries)
  ) {
    throw new Error(
      `Puzzle file ${index + 1}: expected crossword schema version 1.0.`,
    );
  }

  if (source.puzzle.variant !== "barred") {
    throw new Error(
      `${source.puzzle.id ?? index + 1}: unsupported variant ${source.puzzle.variant}.`,
    );
  }

  const clues = { across: [], down: [] };
  const blackCells = [];
  const numberedCells = [];

  for (const cell of source.grid.cells ?? []) {
    if (cell.type === "block") {
      blackCells.push({ row: cell.row, col: cell.column });
    } else if (cell.type !== "letter") {
      throw new Error(
        `${source.puzzle.id}: unsupported cell type ${cell.type}.`,
      );
    }

    if (cell.rebus !== null && cell.rebus !== undefined) {
      throw new Error(`${source.puzzle.id}: rebus cells are not supported.`);
    }

    if (Number.isInteger(cell.number)) {
      numberedCells.push({
        row: cell.row,
        col: cell.column,
        number: cell.number,
      });
    }
  }

  for (const entry of source.entries) {
    if (entry.direction !== "across" && entry.direction !== "down") {
      throw new Error(
        `${source.puzzle.id} ${entry.id}: unsupported direction ${entry.direction}.`,
      );
    }

    const answer = entry.answer?.normalized || entry.answer?.display || "";
    const cells = entry.cells ?? [];

    if (cells.length !== answerLetters(answer).length) {
      throw new Error(
        `${source.puzzle.id} ${entry.id}: answer length does not match its cells.`,
      );
    }

    assertStraightEntry(source.puzzle.id, entry);
    clues[entry.direction].push({
      id: String(entry.id).toLowerCase(),
      number: entry.number,
      direction: entry.direction,
      start: {
        row: entry.start.row,
        col: entry.start.column,
      },
      clue: entry.clue?.text || "",
      answer,
      reasoning: entry.explanation?.raw || "",
    });
  }

  return {
    id: requiredId(source.puzzle.id, index),
    title: source.puzzle.title || `Crossword #${source.puzzle.id}`,
    author: source.puzzle.author || undefined,
    publishedDate: source.puzzle.publishedDate || undefined,
    rows: source.grid.rows,
    cols: source.grid.columns,
    blackCells,
    numberedCells: numberedCells.sort(
      (a, b) => a.row - b.row || a.col - b.col || a.number - b.number,
    ),
    dividers: (source.grid.bars ?? []).map((bar) => dividerFromBar(source, bar)),
    clues,
  };
}

function dividerFromBar(source, bar) {
  const from = { row: bar.row, col: bar.column };

  if (bar.edge === "right") {
    return { from, to: { row: bar.row, col: bar.column + 1 } };
  }

  if (bar.edge === "bottom") {
    return { from, to: { row: bar.row + 1, col: bar.column } };
  }

  throw new Error(
    `${source.puzzle.id}: unsupported bar edge ${String(bar.edge)}.`,
  );
}

function assertStraightEntry(puzzleId, entry) {
  entry.cells.forEach((cell, index) => {
    const expectedRow =
      entry.start.row + (entry.direction === "down" ? index : 0);
    const expectedColumn =
      entry.start.column + (entry.direction === "across" ? index : 0);

    if (cell.row !== expectedRow || cell.column !== expectedColumn) {
      throw new Error(
        `${puzzleId} ${entry.id}: entry cells must be straight and contiguous.`,
      );
    }
  });
}

function validateCrossings(archive) {
  for (const puzzle of archive) {
    const solution = new Map();

    for (const direction of ["across", "down"]) {
      for (const clue of puzzle.clues[direction]) {
        const letters = answerLetters(clue.answer);

        for (let index = 0; index < letters.length; index += 1) {
          const row = clue.start.row + (direction === "down" ? index : 0);
          const col = clue.start.col + (direction === "across" ? index : 0);
          const cellKey = `${row},${col}`;

          if (row >= puzzle.rows || col >= puzzle.cols) {
            throw new Error(`${puzzle.id} ${clue.id}: answer runs out of bounds.`);
          }

          if (solution.has(cellKey) && solution.get(cellKey) !== letters[index]) {
            throw new Error(
              `${puzzle.id} ${clue.id}: crossing mismatch at ${cellKey}.`,
            );
          }

          solution.set(cellKey, letters[index]);
        }
      }
    }
  }
}

function requiredId(value, index) {
  const id = String(value ?? "").trim();

  if (!id) {
    throw new Error(`Puzzle file ${index + 1}: puzzle.id is required.`);
  }

  return id;
}

function answerLetters(answer) {
  return String(answer).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
