import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendationOutcomeEvents } from "./outcomes.ts";

test("a recommendation save is recorded separately from wishlist status", () => {
  assert.deepEqual(
    buildRecommendationOutcomeEvents({ saved: true, status: "wishlisted" }),
    [{ outcome: "saved", rating: null }],
  );
  assert.deepEqual(
    buildRecommendationOutcomeEvents({ status: "wishlisted" }),
    [],
  );
});

test("playing and a rating produce distinct downstream outcomes", () => {
  assert.deepEqual(
    buildRecommendationOutcomeEvents({ status: "playing", rating: 4.5 }),
    [
      { outcome: "started", rating: null },
      { outcome: "rated", rating: 4.5 },
    ],
  );
});

test("terminal statuses are represented without interpreting sentiment", () => {
  assert.deepEqual(buildRecommendationOutcomeEvents({ status: "finished" }), [
    { outcome: "finished", rating: null },
  ]);
  assert.deepEqual(buildRecommendationOutcomeEvents({ status: "left" }), [
    { outcome: "left", rating: null },
  ]);
});

test("invalid or absent ratings do not produce rating outcomes", () => {
  assert.deepEqual(buildRecommendationOutcomeEvents({ rating: null }), []);
  assert.deepEqual(buildRecommendationOutcomeEvents({ rating: 0 }), []);
  assert.deepEqual(buildRecommendationOutcomeEvents({ rating: 5.5 }), []);
});
