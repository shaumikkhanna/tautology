import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const archivePath = path.join(scriptDir, "..", "content", "crosswords", "archive.json");
const puzzles = JSON.parse(fs.readFileSync(archivePath, "utf8"));
const errors = [];

if (!Array.isArray(puzzles)) {
  fail("Archive root must be an array.");
} else {
  validateArchive(puzzles);
}

if (errors.length > 0) {
  console.error(`Crossword archive validation failed with ${errors.length} issue(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Validated ${puzzles.length} crossword puzzle(s).`);

function validateArchive(archive) {
  const puzzleIds = new Set();

  archive.forEach((puzzle, puzzleIndex) => {
    const label = puzzle?.id || `puzzle at index ${puzzleIndex}`;

    if (!puzzle || typeof puzzle !== "object") {
      fail(`${label}: puzzle must be an object.`);
      return;
    }

    if (typeof puzzle.id !== "string" || puzzle.id.trim() === "") {
      fail(`${label}: id must be a non-empty string.`);
    } else if (puzzleIds.has(puzzle.id)) {
      fail(`${label}: duplicate puzzle id.`);
    } else {
      puzzleIds.add(puzzle.id);
    }

    if (!Number.isInteger(puzzle.rows) || puzzle.rows <= 0) {
      fail(`${label}: rows must be a positive integer.`);
    }

    if (!Number.isInteger(puzzle.cols) || puzzle.cols <= 0) {
      fail(`${label}: cols must be a positive integer.`);
    }

    const numberedKeys = new Map();
    for (const cell of puzzle.numberedCells ?? []) {
      validateCell(label, "numbered cell", puzzle, cell);
      if (!Number.isInteger(cell?.number) || cell.number <= 0) {
        fail(`${label}: numbered cell at ${cellLabel(cell)} needs a positive number.`);
      }
      const existingNumber = numberedKeys.get(keyFor(cell));
      if (existingNumber && existingNumber !== cell.number) {
        fail(`${label}: cell ${cellLabel(cell)} has multiple clue numbers.`);
      }
      numberedKeys.set(keyFor(cell), cell.number);
    }

    const blackKeys = new Set();
    for (const cell of puzzle.blackCells ?? []) {
      validateCell(label, "black cell", puzzle, cell);
      blackKeys.add(keyFor(cell));
    }

    const dividerKeys = new Set();
    for (const divider of puzzle.dividers ?? []) {
      validateCell(label, "divider.from", puzzle, divider?.from);
      validateCell(label, "divider.to", puzzle, divider?.to);

      if (!isAdjacent(divider?.from, divider?.to)) {
        fail(
          `${label}: divider ${cellLabel(divider?.from)} -> ${cellLabel(
            divider?.to,
          )} must connect adjacent cells.`,
        );
      }

      dividerKeys.add(edgeKey(divider?.from, divider?.to));
    }

    const clueIds = new Set();
    const clueStarts = new Set();
    const solutionByKey = new Map();

    for (const direction of ["across", "down"]) {
      const clues = puzzle.clues?.[direction];
      if (!Array.isArray(clues)) {
        fail(`${label}: clues.${direction} must be an array.`);
        continue;
      }

      for (const clue of clues) {
        const clueLabel = `${label} ${clue?.number}${direction[0]}`;

        if (typeof clue?.id !== "string" || clue.id.trim() === "") {
          fail(`${clueLabel}: clue id must be a non-empty string.`);
        } else if (clueIds.has(clue.id)) {
          fail(`${clueLabel}: duplicate clue id ${clue.id}.`);
        } else {
          clueIds.add(clue.id);
        }

        if (clue?.direction !== direction) {
          fail(`${clueLabel}: direction should be ${direction}.`);
        }

        validateCell(clueLabel, "start", puzzle, clue?.start);
        if (!numberedKeys.has(keyFor(clue?.start))) {
          fail(`${clueLabel}: start ${cellLabel(clue?.start)} has no numbered cell.`);
        }

        if (!isSegmentStart(puzzle, clue?.start, direction, dividerKeys)) {
          fail(`${clueLabel}: start ${cellLabel(clue?.start)} is not the start of a ${direction} segment.`);
        }

        const startKey = `${direction}:${keyFor(clue?.start)}`;
        if (clueStarts.has(startKey)) {
          fail(`${clueLabel}: duplicate ${direction} clue start ${cellLabel(clue?.start)}.`);
        }
        clueStarts.add(startKey);

        const answer = answerLetters(clue?.answer ?? "");
        if (!answer) {
          fail(`${clueLabel}: answer must contain at least one letter or number.`);
          continue;
        }

        const segment = segmentFromStart(puzzle, clue.start, direction, dividerKeys);
        if (segment.length !== answer.length) {
          fail(
            `${clueLabel}: answer length ${answer.length} does not fit ${segment.length}-cell segment from ${cellLabel(
              clue.start,
            )}.`,
          );
        }

        for (let index = 0; index < answer.length; index += 1) {
          const cell = {
            row: clue.start.row + (direction === "down" ? index : 0),
            col: clue.start.col + (direction === "across" ? index : 0),
          };
          const key = keyFor(cell);

          if (!isInBounds(puzzle, cell)) {
            fail(`${clueLabel}: answer runs out of bounds at ${cellLabel(cell)}.`);
            continue;
          }

          if (blackKeys.has(key)) {
            fail(`${clueLabel}: answer enters black cell ${cellLabel(cell)}.`);
          }

          const previous = solutionByKey.get(key);
          if (previous && previous !== answer[index]) {
            fail(
              `${clueLabel}: crossing mismatch at ${cellLabel(cell)} (${previous} vs ${answer[index]}).`,
            );
          }

          solutionByKey.set(key, answer[index]);
        }
      }
    }
  });
}

function segmentFromStart(puzzle, start, direction, dividerKeys) {
  const segment = [];
  let cell = { ...start };

  while (isInBounds(puzzle, cell)) {
    segment.push(cell);
    const next =
      direction === "across"
        ? { row: cell.row, col: cell.col + 1 }
        : { row: cell.row + 1, col: cell.col };

    if (!isInBounds(puzzle, next) || dividerKeys.has(edgeKey(cell, next))) {
      break;
    }

    cell = next;
  }

  return segment;
}

function isSegmentStart(puzzle, start, direction, dividerKeys) {
  if (!isInBounds(puzzle, start)) {
    return false;
  }

  const previous =
    direction === "across"
      ? { row: start.row, col: start.col - 1 }
      : { row: start.row - 1, col: start.col };

  return !isInBounds(puzzle, previous) || dividerKeys.has(edgeKey(previous, start));
}

function validateCell(puzzleLabel, itemLabel, puzzle, cell) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) {
    fail(`${puzzleLabel}: ${itemLabel} must have integer row and col.`);
    return;
  }

  if (!isInBounds(puzzle, cell)) {
    fail(`${puzzleLabel}: ${itemLabel} ${cellLabel(cell)} is out of bounds.`);
  }
}

function isInBounds(puzzle, cell) {
  return (
    cell &&
    Number.isInteger(cell.row) &&
    Number.isInteger(cell.col) &&
    cell.row >= 0 &&
    cell.row < puzzle.rows &&
    cell.col >= 0 &&
    cell.col < puzzle.cols
  );
}

function isAdjacent(a, b) {
  if (!a || !b) {
    return false;
  }

  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function edgeKey(a, b) {
  return [keyFor(a), keyFor(b)].sort().join("|");
}

function keyFor(cell) {
  return `${cell?.row},${cell?.col}`;
}

function cellLabel(cell) {
  return `(${cell?.row}, ${cell?.col})`;
}

function answerLetters(answer) {
  return String(answer).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function fail(message) {
  errors.push(message);
}
