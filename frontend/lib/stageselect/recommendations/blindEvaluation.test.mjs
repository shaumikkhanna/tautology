import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBlindRankingComparison,
  globalProfileVariant,
  multiInterestVariant,
} from "./index.ts";

const controls = { adventure: 50, platform: "all" };

test("blind comparison skips identical visible rankings", () => {
  const games = [game(1), game(2), game(3)];

  assert.equal(buildBlindRankingComparison(games, games, controls), null);
});

test("blind comparison is deterministic and conceals side assignment", () => {
  const globalGames = [game(1), game(2), game(3)];
  const multiInterestGames = [game(2), game(1), game(3)];
  const first = buildBlindRankingComparison(
    globalGames,
    multiInterestGames,
    controls,
  );
  const second = buildBlindRankingComparison(
    globalGames,
    multiInterestGames,
    controls,
  );

  assert.deepEqual(first, second);
  assert.match(first.comparisonKey, /^blind-v1-[0-9a-f]{8}$/);
  assert.deepEqual(
    new Set([first.leftVariant, first.rightVariant]),
    new Set([globalProfileVariant, multiInterestVariant]),
  );
  assert.notEqual(first.leftVariant, first.rightVariant);
});

test("blind comparison limits lists and removes duplicate games", () => {
  const comparison = buildBlindRankingComparison(
    [game(1), game(1), game(2), game(3), game(4), game(5), game(6), game(7)],
    [game(7), game(6), game(5), game(4), game(3), game(2), game(1)],
    controls,
  );

  assert.equal(comparison.leftGames.length, 6);
  assert.equal(comparison.rightGames.length, 6);
  assert.equal(
    new Set(comparison.leftGames.map((item) => item.igdbId)).size,
    comparison.leftGames.length,
  );
});

test("controls produce a separate reproducible comparison key", () => {
  const globalGames = [game(1), game(2)];
  const multiInterestGames = [game(2), game(1)];
  const familiar = buildBlindRankingComparison(globalGames, multiInterestGames, {
    adventure: 0,
    platform: "all",
  });
  const adventurous = buildBlindRankingComparison(
    globalGames,
    multiInterestGames,
    { adventure: 100, platform: "all" },
  );

  assert.notEqual(familiar.comparisonKey, adventurous.comparisonKey);
});

function game(igdbId) {
  return { igdbId, title: `Game ${igdbId}` };
}
