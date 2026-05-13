import archive from "@/content/crosswords/archive.json";
import type { CrosswordPuzzle, CrosswordSummary } from "./types";

const puzzles = archive as CrosswordPuzzle[];

export function getCrosswordSummaries(): CrosswordSummary[] {
  return puzzles.map((puzzle) => ({
    id: puzzle.id,
    title: puzzle.title,
    rows: puzzle.rows,
    cols: puzzle.cols,
    clueCount: puzzle.clues.across.length + puzzle.clues.down.length,
  }));
}

export function getCrosswordPuzzle(crosswordId: string) {
  return puzzles.find((puzzle) => puzzle.id === crosswordId) ?? null;
}

export function getCrosswordIds() {
  return puzzles.map((puzzle) => puzzle.id);
}
