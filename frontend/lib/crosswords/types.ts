export type CrosswordCellRef = {
  row: number;
  col: number;
};

export type CrosswordDivider = {
  from: CrosswordCellRef;
  to: CrosswordCellRef;
};

export type CrosswordNumberedCell = CrosswordCellRef & {
  number: number;
};

export type CrosswordDirection = "across" | "down";

export type CrosswordClue = {
  id: string;
  number: number;
  direction: CrosswordDirection;
  start: CrosswordCellRef;
  clue: string;
  answer: string;
  reasoning: string;
};

export type CrosswordPuzzle = {
  id: string;
  title: string;
  rows: number;
  cols: number;
  blackCells: CrosswordCellRef[];
  numberedCells: CrosswordNumberedCell[];
  dividers: CrosswordDivider[];
  clues: {
    across: CrosswordClue[];
    down: CrosswordClue[];
  };
};

export type CrosswordSummary = Pick<
  CrosswordPuzzle,
  "id" | "title" | "rows" | "cols"
> & {
  clueCount: number;
};

export type CrosswordProgressPayload = {
  crosswordId: string;
  gridState: Record<string, string>;
  elapsedSeconds: number;
  checkedCount: number;
  revealedCount: number;
  completedAt: string | null;
  perfect: boolean;
};
