import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..", "..");
const sourcePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, "all_crosswords.json");
const destinationPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(scriptDir, "..", "content", "crosswords", "archive.json");

const sourcePuzzles = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

if (!Array.isArray(sourcePuzzles)) {
  throw new Error("Source crossword file must be a JSON array.");
}

const archive = sourcePuzzles.map((puzzle, index) => normalizePuzzle(puzzle, index));

validateCrossings(archive);
fs.writeFileSync(destinationPath, `${JSON.stringify(archive, null, 2)}\n`);

console.log(
  `Imported ${archive.length} crossword puzzle(s) from ${path.relative(
    repoRoot,
    sourcePath,
  )} to ${path.relative(repoRoot, destinationPath)}.`,
);

function normalizePuzzle(puzzle, index) {
  const clues = { across: [], down: [] };
  const numberedCells = new Map();

  for (const direction of ["across", "down"]) {
    const segments = getSegments(puzzle, direction);
    const sourceClues = puzzle.clues?.[direction] ?? [];

    if (segments.length !== sourceClues.length) {
      throw new Error(
        `${puzzle.title} ${direction}: found ${segments.length} grid segment(s) for ${sourceClues.length} clue(s).`,
      );
    }

    clues[direction] = sourceClues.map((clue, clueIndex) => {
      const segment = segments[clueIndex];
      const start = { row: segment.row, col: segment.col };
      numberedCells.set(keyFor(start), { ...start, number: clue.number });

      return {
        id: `${clue.number}${direction[0]}`,
        number: clue.number,
        direction,
        start,
        clue: clue.enumeration ? `${clue.clue} (${clue.enumeration})` : clue.clue,
        answer: clue.answer,
        reasoning: clue.explanation || "",
      };
    });
  }

  return {
    id: slugFromTitle(puzzle.title, index),
    title: puzzle.title,
    rows: puzzle.rows,
    cols: puzzle.cols,
    blackCells: [],
    numberedCells: Array.from(numberedCells.values()).sort(
      (a, b) => a.row - b.row || a.col - b.col || a.number - b.number,
    ),
    dividers: (puzzle.bars ?? []).map(([from, to]) => ({
      from: { row: from[0], col: from[1] },
      to: { row: to[0], col: to[1] },
    })),
    clues,
  };
}

function getSegments(puzzle, direction) {
  const bars = new Set((puzzle.bars ?? []).map(([from, to]) => edgeKey(from, to)));
  const segments = [];

  for (let row = 0; row < puzzle.rows; row += 1) {
    for (let col = 0; col < puzzle.cols; col += 1) {
      const previous = direction === "across" ? [row, col - 1] : [row - 1, col];
      const hasPrevious = previous[0] >= 0 && previous[1] >= 0;
      const startsSegment =
        !hasPrevious || bars.has(edgeKey(previous, [row, col]));

      let endRow = row;
      let endCol = col;
      let length = 1;

      while (true) {
        const next =
          direction === "across" ? [endRow, endCol + 1] : [endRow + 1, endCol];

        if (next[0] >= puzzle.rows || next[1] >= puzzle.cols) {
          break;
        }

        if (bars.has(edgeKey([endRow, endCol], next))) {
          break;
        }

        length += 1;
        endRow = next[0];
        endCol = next[1];
      }

      if (startsSegment && length > 1) {
        segments.push({ row, col, length });
      }
    }
  }

  return segments;
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

function slugFromTitle(title, index) {
  const match = String(title).match(/([A-Za-z]+) (\d{1,2}), (\d{4})/);

  if (!match) {
    return `cryptic-crossword-${index + 1}`;
  }

  const months = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  return `cryptic-crossword-${match[3]}-${
    months[match[1].toLowerCase()]
  }-${String(match[2]).padStart(2, "0")}`;
}

function edgeKey(from, to) {
  return [arrayKey(from), arrayKey(to)].sort().join("|");
}

function arrayKey(cell) {
  return `${cell[0]},${cell[1]}`;
}

function keyFor(cell) {
  return `${cell.row},${cell.col}`;
}

function answerLetters(answer) {
  return String(answer).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
