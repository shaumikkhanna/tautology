import assert from "node:assert/strict";
import test from "node:test";
import {
  cardStrength,
  compareScores,
  previewAction,
  scorePalette,
  shouldDrawCard,
  winningPlayer,
} from "./red7Engine.ts";
import { getAdvancedTurnState } from "./red7Advanced.ts";

const card = (color, value) => ({ color, value });
const player = (id, palette) => ({
  id,
  userId: id,
  displayName: id,
  role: "seated",
  seat: 1,
  active: true,
  eliminated: false,
  palette,
  handCount: 7,
  lastSeenAt: "",
  joinedAt: "",
});
const advancedState = ({ hand, ownPalette = [], opponents = [], rules = {} }) => ({
  room: {
    id: "room",
    code: "room-code",
    hostUserId: "a",
    status: "playing",
    drawRule: true,
    advancedSeven: false,
    advancedFive: false,
    advancedThree: false,
    advancedOne: false,
    canvasColor: "red",
    revision: 1,
    winnerPlayerId: null,
    expiresAt: "",
    ...rules,
  },
  players: [player("a", ownPalette), ...opponents],
  privateState: { playerId: "a", cards: hand },
  round: { currentPlayerId: "a", turnOrder: ["a"], roundNumber: 1, deckCount: 10 },
});

test("card hierarchy compares value before color", () => {
  assert.ok(cardStrength(card("violet", 7)) > cardStrength(card("red", 6)));
  assert.ok(cardStrength(card("red", 4)) > cardStrength(card("orange", 4)));
});

test("scores all seven rules", () => {
  const palette = [
    card("red", 7),
    card("orange", 2),
    card("yellow", 2),
    card("green", 4),
    card("blue", 5),
    card("violet", 3),
  ];

  assert.deepEqual(scorePalette(palette, "red"), [1, 77]);
  assert.deepEqual(scorePalette(palette, "orange"), [2, 26]);
  assert.deepEqual(scorePalette(palette, "yellow"), [1, 77]);
  assert.deepEqual(scorePalette(palette, "green"), [3, 44]);
  assert.deepEqual(scorePalette(palette, "blue"), [6, 77]);
  assert.deepEqual(scorePalette(palette, "indigo"), [4, 53]);
  assert.deepEqual(scorePalette(palette, "violet"), [3, 31]);
});

test("indigo counts distinct values and chooses the strongest equal run", () => {
  const palette = [
    card("violet", 1),
    card("red", 2),
    card("orange", 2),
    card("yellow", 3),
    card("red", 5),
    card("violet", 6),
    card("blue", 7),
  ];

  assert.deepEqual(scorePalette(palette, "indigo"), [3, 73]);
});

test("group ties use the highest qualifying card", () => {
  const palette = [
    card("violet", 2),
    card("blue", 2),
    card("orange", 6),
    card("red", 6),
  ];

  assert.deepEqual(scorePalette(palette, "orange"), [2, 67]);
});

test("winning player uses count and then card hierarchy", () => {
  const players = [
    player("a", [card("violet", 2), card("blue", 4)]),
    player("b", [card("red", 2), card("green", 4)]),
  ];

  assert.equal(compareScores([2, 47], [2, 44]), 3);
  assert.equal(winningPlayer(players, "green"), "b");
});

test("empty Palettes are tied, so nobody is winning yet", () => {
  assert.equal(
    winningPlayer([player("a", []), player("b", [])], "red"),
    null,
  );
});

test("action preview applies Palette before a Canvas rule change", () => {
  const players = [
    player("a", [card("violet", 1)]),
    player("b", [card("red", 7)]),
  ];

  const preview = previewAction(players, "a", "red", {
    paletteCard: card("green", 6),
    canvasCard: card("green", 1),
  });

  assert.deepEqual(preview, { rule: "green", winning: true });
});

test("optional draw uses the Canvas value and final Palette size", () => {
  const canvasCard = card("blue", 5);

  assert.equal(
    shouldDrawCard({
      drawRule: true,
      canvasCard,
      finalPaletteSize: 4,
      deckCount: 10,
    }),
    true,
  );
  assert.equal(
    shouldDrawCard({
      drawRule: false,
      canvasCard,
      finalPaletteSize: 4,
      deckCount: 10,
    }),
    false,
  );
  assert.equal(
    shouldDrawCard({
      drawRule: true,
      canvasCard: null,
      finalPaletteSize: 0,
      deckCount: 10,
    }),
    false,
  );
  assert.equal(
    shouldDrawCard({
      drawRule: true,
      canvasCard,
      finalPaletteSize: 5,
      deckCount: 10,
    }),
    false,
  );
  assert.equal(
    shouldDrawCard({
      drawRule: true,
      canvasCard,
      finalPaletteSize: 4,
      deckCount: 0,
    }),
    false,
  );
});

test("advanced 7 waits for a destination and previews the removed Palette card", () => {
  const seven = card("red", 7);
  const oldCard = card("blue", 2);
  const state = advancedState({
    hand: [seven],
    ownPalette: [oldCard],
    rules: { advancedSeven: true },
  });

  const pending = getAdvancedTurnState(state, "a", [{ card: seven }]);
  assert.equal(pending.pending?.type, "seven");
  assert.deepEqual(pending.palette, [oldCard, seven]);

  const resolved = getAdvancedTurnState(state, "a", [{
    card: seven,
    effect: { type: "seven", card: oldCard, destination: "canvas" },
  }]);
  assert.equal(resolved.pending, null);
  assert.deepEqual(resolved.palette, [seven]);
});

test("advanced 5 keeps chaining while another hand card remains", () => {
  const firstFive = card("red", 5);
  const secondFive = card("blue", 5);
  const finalCard = card("green", 4);
  const state = advancedState({
    hand: [firstFive, secondFive, finalCard],
    rules: { advancedFive: true },
  });

  const first = getAdvancedTurnState(state, "a", [{ card: firstFive }]);
  assert.equal(first.pending?.type, "five");

  const second = getAdvancedTurnState(state, "a", [
    { card: firstFive },
    { card: secondFive },
  ]);
  assert.equal(second.pending?.type, "five");

  const complete = getAdvancedTurnState(state, "a", [
    { card: firstFive },
    { card: secondFive },
    { card: finalCard },
  ]);
  assert.equal(complete.pending, null);
});

test("advanced 1 allows equal or larger opponent Palettes only", () => {
  const one = card("violet", 1);
  const equal = player("b", [card("red", 2), card("blue", 3)]);
  const smaller = player("c", [card("orange", 4)]);
  const state = advancedState({
    hand: [one],
    ownPalette: [card("yellow", 6)],
    opponents: [equal, smaller],
    rules: { advancedOne: true },
  });

  const result = getAdvancedTurnState(state, "a", [{ card: one }]);
  assert.equal(result.pending?.type, "one");
  assert.deepEqual(result.pending?.targets.map(({ player }) => player.id), ["b"]);
});
