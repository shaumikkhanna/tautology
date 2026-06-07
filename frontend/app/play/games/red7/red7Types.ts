export const RED7_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "violet",
] as const;

export type Red7Rule = (typeof RED7_COLORS)[number];
export type Red7RoomStatus = "lobby" | "playing" | "finished";
export type Red7PlayerRole = "seated" | "spectator";

export type Red7Card = {
  color: Red7Rule;
  value: number;
};

export type Red7Room = {
  id: string;
  code: string;
  hostUserId: string;
  status: Red7RoomStatus;
  drawRule: boolean;
  canvasColor: Red7Rule;
  revision: number;
  winnerPlayerId: string | null;
  expiresAt: string;
};

export type Red7Player = {
  id: string;
  userId: string;
  displayName: string;
  role: Red7PlayerRole;
  seat: number | null;
  active: boolean;
  eliminated: boolean;
  palette: Red7Card[];
  handCount: number;
  lastSeenAt: string;
  joinedAt: string;
};

export type Red7PrivateState = {
  playerId: string;
  cards: Red7Card[];
};

export type Red7RoundState = {
  currentPlayerId: string | null;
  turnOrder: string[];
  roundNumber: number;
  deckCount: number;
};

export type Red7PublicState = {
  room: Red7Room;
  players: Red7Player[];
  privateState: Red7PrivateState;
  round: Red7RoundState;
};

export type Red7TurnAction = {
  paletteCard: Red7Card | null;
  canvasCard: Red7Card | null;
};
