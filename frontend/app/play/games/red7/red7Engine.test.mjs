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
