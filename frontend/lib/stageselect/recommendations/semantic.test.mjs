import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendationDocument,
  cosineSimilarity,
  getRecommendationDocumentFields,
  getSemanticScore,
  gteSmallEmbeddingModel,
  semanticDocumentVersion,
  validateEmbeddingBatch,
} from "./semantic.ts";

test("canonical documents normalize whitespace, ordering, and duplicates", () => {
  const document = buildRecommendationDocument({
    title: "  Example   Game ",
    summary: "A game\nwith   deliberate choices.",
    releaseYear: 2025,
    platforms: ["PC", "Nintendo Switch", "pc"],
    genres: ["RPG", "Action"],
    themes: ["Fantasy"],
    keywords: ["Choices", "Party"],
    gameModes: ["Single player"],
    playerPerspectives: ["Isometric"],
  });

  assert.equal(
    document,
    [
      "Title: Example Game",
      "Summary: A game with deliberate choices.",
      "Release year: 2025",
      "Platforms: Nintendo Switch, PC",
      "Genres: Action, RPG",
      "Themes: Fantasy",
      "Keywords: Choices, Party",
      "Game modes: Single player",
      "Player perspectives: Isometric",
    ].join("\n"),
  );
});

test("document hashes are stable and sensitive to semantic metadata", async () => {
  const first = await getRecommendationDocumentFields({
    title: "Example",
    genres: ["Puzzle", "Adventure"],
  });
  const reordered = await getRecommendationDocumentFields({
    title: "Example",
    genres: ["Adventure", "Puzzle"],
  });
  const changed = await getRecommendationDocumentFields({
    title: "Example",
    genres: ["Action"],
  });

  assert.equal(semanticDocumentVersion, "game-metadata-v1");
  assert.equal(first.recommendation_document_hash.length, 64);
  assert.deepEqual(first, reordered);
  assert.notEqual(
    first.recommendation_document_hash,
    changed.recommendation_document_hash,
  );
});

test("embedding validation enforces batch size, dimensions, and finite values", () => {
  const provider = { dimensions: 3 };

  assert.deepEqual(
    validateEmbeddingBatch(provider, ["one"], [[0.1, 0.2, 0.3]]),
    [[0.1, 0.2, 0.3]],
  );
  assert.throws(
    () => validateEmbeddingBatch(provider, ["one", "two"], [[0, 0, 0]]),
    /2 inputs/,
  );
  assert.throws(
    () => validateEmbeddingBatch(provider, ["one"], [[0, 0]]),
    /3 finite values/,
  );
});

test("cosine similarity handles aligned, opposite, orthogonal, and zero vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 0]), 0);
});

test("semantic scoring is neutral without coverage and bounded with evidence", () => {
  assert.deepEqual(getSemanticScore({}), {
    coverage: 0,
    negative: 0,
    preference: 0.5,
  });

  const sparse = getSemanticScore({
    semanticPositiveSimilarity: 0.8,
    semanticSignalCount: 1,
  });
  const established = getSemanticScore({
    semanticPositiveSimilarity: 0.8,
    semanticSignalCount: 3,
  });

  assert.equal(sparse.coverage, 1);
  assert.ok(sparse.preference > 0.5);
  assert.ok(sparse.preference < established.preference);
  assert.ok(established.preference <= 1);
});

test("negative semantic evidence lowers preference without becoming a hard exclusion", () => {
  const positiveOnly = getSemanticScore({
    semanticPositiveSimilarity: 0.75,
    semanticSignalCount: 4,
  });
  const withNegative = getSemanticScore({
    semanticPositiveSimilarity: 0.75,
    semanticNegativeSimilarity: 0.8,
    semanticSignalCount: 4,
  });

  assert.ok(withNegative.preference < positiveOnly.preference);
  assert.ok(withNegative.preference >= 0);
  assert.ok(withNegative.negative > 0.5);
});

test("the selected Edge Runtime model contract remains explicit", () => {
  assert.deepEqual(gteSmallEmbeddingModel, {
    model: "gte-small",
    version: "supabase-gte-small-mean-normalized-v1",
    dimensions: 384,
  });
});
