import assert from "node:assert/strict";
import test from "node:test";
import {
  generateFourColorGraph,
  graphDensity,
  isConnected,
  isProperColoring,
  isThreeColorable,
  nextVertexColor,
} from "./homeGraph.ts";

test("seeded generation is deterministic", () => {
  assert.deepEqual(
    generateFourColorGraph(20260607),
    generateFourColorGraph(20260607),
  );
});

test("generated graphs satisfy the homepage guarantees", () => {
  for (let seed = 1; seed <= 250; seed += 1) {
    const graph = generateFourColorGraph(seed);
    const edgeKeys = graph.edges.map(
      ({ source, target }) => `${source}-${target}`,
    );
    const solution = graph.vertices.map((vertex) => vertex.solutionColor);

    assert.ok(
      graph.vertices.length >= 12 && graph.vertices.length <= 16,
      `seed ${seed} has ${graph.vertices.length} vertices`,
    );
    assert.ok(
      graphDensity(graph) >= 0.3 && graphDensity(graph) <= 0.35,
      `seed ${seed} has density ${graphDensity(graph)}`,
    );
    assert.ok(
      graph.edges.length <= graph.vertices.length * 3 - 6,
      `seed ${seed} exceeds the planar edge bound`,
    );
    assert.equal(new Set(edgeKeys).size, graph.edges.length);
    assert.ok(
      graph.edges.every(
        ({ source, target }) =>
          source >= 0 &&
          target < graph.vertices.length &&
          source < target,
      ),
    );
    assert.equal(isConnected(graph.vertices.length, graph.edges), true);
    assert.equal(isProperColoring(solution, graph.edges), true);
    assert.equal(isThreeColorable(graph), false);
  }
});

test("color validation rejects gaps and conflicts", () => {
  const graph = generateFourColorGraph(17);
  const solution = graph.vertices.map((vertex) => vertex.solutionColor);
  const incomplete = [...solution];
  const conflicting = [...solution];
  const edge = graph.edges[0];

  incomplete[0] = -1;
  conflicting[edge.target] = conflicting[edge.source];

  assert.equal(isProperColoring(incomplete, graph.edges), false);
  assert.equal(isProperColoring(incomplete, graph.edges, false), true);
  assert.equal(isProperColoring(conflicting, graph.edges), false);
  assert.equal(isProperColoring(solution, graph.edges), true);
});

test("vertex colors cycle through four colors and back to uncolored", () => {
  const cycle = [];
  let color = -1;

  for (let step = 0; step < 5; step += 1) {
    color = nextVertexColor(color);
    cycle.push(color);
  }

  assert.deepEqual(cycle, [0, 1, 2, 3, -1]);
});

test("vertex color cycle can start from a per-vertex offset", () => {
  const cycle = [];
  let color = -1;

  for (let step = 0; step < 5; step += 1) {
    color = nextVertexColor(color, 1);
    cycle.push(color);
  }

  assert.deepEqual(cycle, [1, 2, 3, 0, -1]);
});
