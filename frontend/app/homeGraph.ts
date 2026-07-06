export type GraphPoint = {
  x: number;
  y: number;
};

export type GraphVertex = GraphPoint & {
  id: number;
  solutionColor: number;
};

export type GraphEdge = {
  source: number;
  target: number;
};

export type FourColorGraph = {
  edges: GraphEdge[];
  seed: number;
  vertices: GraphVertex[];
};

type Face = [number, number, number];

const MIN_VERTICES = 12;
const MAX_VERTICES = 16;
const MIN_DENSITY = 0.3;
const MAX_DENSITY = 0.35;

export function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateFourColorGraph(seed = randomSeed()): FourColorGraph {
  const random = createSeededRandom(seed);
  const vertexCount =
    MIN_VERTICES + Math.floor(random() * (MAX_VERTICES - MIN_VERTICES + 1));
  const rimSize = random() < 0.55 ? 5 : 7;
  const vertices: GraphVertex[] = [];
  const edges: GraphEdge[] = [];
  const protectedEdges = new Set<string>();
  const faces: Face[] = [];

  vertices.push({
    id: 0,
    x: 0.5,
    y: 0.5,
    solutionColor: 3,
  });

  const rotation = random() * Math.PI * 2;
  const stretchX = 0.85 + random() * 0.16;
  const stretchY = 0.82 + random() * 0.18;

  for (let index = 0; index < rimSize; index += 1) {
    const angle = rotation + (index / rimSize) * Math.PI * 2;
    const id = index + 1;
    const solutionColor =
      index === rimSize - 1 ? 2 : index % 2;

    vertices.push({
      id,
      x: 0.5 + Math.cos(angle) * 0.39 * stretchX,
      y: 0.5 + Math.sin(angle) * 0.39 * stretchY,
      solutionColor,
    });

    addEdge(edges, protectedEdges, 0, id, true);
  }

  for (let index = 0; index < rimSize; index += 1) {
    const current = index + 1;
    const next = ((index + 1) % rimSize) + 1;
    addEdge(edges, protectedEdges, current, next, true);
    faces.push([0, current, next]);
  }

  while (vertices.length < vertexCount) {
    const faceIndex = Math.floor(random() * faces.length);
    const face = faces.splice(faceIndex, 1)[0];
    const id = vertices.length;
    const faceVertices = face.map((vertexId) => vertices[vertexId]);
    const usedColors = new Set(
      faceVertices.map((vertex) => vertex.solutionColor),
    );
    const availableColors = [0, 1, 2, 3].filter(
      (color) => !usedColors.has(color),
    );
    const solutionColor =
      availableColors[Math.floor(random() * availableColors.length)];
    const jitter = 0.014;

    vertices.push({
      id,
      x:
        faceVertices.reduce((sum, vertex) => sum + vertex.x, 0) / 3 +
        (random() - 0.5) * jitter,
      y:
        faceVertices.reduce((sum, vertex) => sum + vertex.y, 0) / 3 +
        (random() - 0.5) * jitter,
      solutionColor,
    });

    for (const vertexId of face) {
      addEdge(edges, protectedEdges, id, vertexId, false);
    }

    faces.push(
      [face[0], face[1], id],
      [face[1], face[2], id],
      [face[2], face[0], id],
    );
  }

  const possibleEdges = (vertexCount * (vertexCount - 1)) / 2;
  const minimumEdgeCount = Math.ceil(possibleEdges * MIN_DENSITY);
  const maximumEdgeCount = Math.floor(possibleEdges * MAX_DENSITY);
  const targetEdgeCount =
    minimumEdgeCount +
    Math.floor(random() * (maximumEdgeCount - minimumEdgeCount + 1));
  const removableEdges = shuffle(
    edges.filter(
      (edge) => !protectedEdges.has(edgeKey(edge.source, edge.target)),
    ),
    random,
  );

  for (const edge of removableEdges) {
    if (edges.length <= targetEdgeCount) {
      break;
    }

    const edgeIndex = edges.findIndex(
      (candidate) =>
        candidate.source === edge.source && candidate.target === edge.target,
    );
    const [removed] = edges.splice(edgeIndex, 1);

    if (!isConnected(vertexCount, edges)) {
      edges.splice(edgeIndex, 0, removed);
    }
  }

  return relabelGraph({ vertices, edges, seed }, random);
}

export function graphDensity(graph: Pick<FourColorGraph, "vertices" | "edges">) {
  const possibleEdges =
    (graph.vertices.length * (graph.vertices.length - 1)) / 2;
  return graph.edges.length / possibleEdges;
}

export function isConnected(vertexCount: number, edges: GraphEdge[]) {
  if (vertexCount === 0) {
    return true;
  }

  const adjacency = buildAdjacency(vertexCount, edges);
  const visited = new Set([0]);
  const queue = [0];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency[current]) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited.size === vertexCount;
}

export function isProperColoring(
  colors: number[],
  edges: GraphEdge[],
  requireComplete = true,
) {
  if (requireComplete && colors.some((color) => color < 0)) {
    return false;
  }

  return edges.every(({ source, target }) => {
    const sourceColor = colors[source];
    const targetColor = colors[target];
    return sourceColor < 0 || targetColor < 0 || sourceColor !== targetColor;
  });
}

export function nextVertexColor(color: number, startColor = 0) {
  const normalizedStart = ((startColor % 4) + 4) % 4;

  if (color < 0) {
    return normalizedStart;
  }

  const nextColor = (color + 1) % 4;
  return nextColor === normalizedStart ? -1 : nextColor;
}

export function isThreeColorable(
  graph: Pick<FourColorGraph, "vertices" | "edges">,
) {
  const adjacency = buildAdjacency(graph.vertices.length, graph.edges);
  const colors = Array(graph.vertices.length).fill(-1);

  const search = (coloredCount: number): boolean => {
    if (coloredCount === colors.length) {
      return true;
    }

    let nextVertex = -1;
    let bestSaturation = -1;
    let bestDegree = -1;

    for (let vertex = 0; vertex < colors.length; vertex += 1) {
      if (colors[vertex] >= 0) {
        continue;
      }

      const neighborColors = new Set(
        adjacency[vertex]
          .map((neighbor) => colors[neighbor])
          .filter((color) => color >= 0),
      );

      if (
        neighborColors.size > bestSaturation ||
        (neighborColors.size === bestSaturation &&
          adjacency[vertex].length > bestDegree)
      ) {
        nextVertex = vertex;
        bestSaturation = neighborColors.size;
        bestDegree = adjacency[vertex].length;
      }
    }

    const forbidden = new Set(
      adjacency[nextVertex]
        .map((neighbor) => colors[neighbor])
        .filter((color) => color >= 0),
    );

    for (let color = 0; color < 3; color += 1) {
      if (forbidden.has(color)) {
        continue;
      }

      colors[nextVertex] = color;
      if (search(coloredCount + 1)) {
        return true;
      }
      colors[nextVertex] = -1;
    }

    return false;
  };

  return search(0);
}

function randomSeed() {
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }

  return Math.floor(Math.random() * 4294967296);
}

function addEdge(
  edges: GraphEdge[],
  protectedEdges: Set<string>,
  left: number,
  right: number,
  isProtected: boolean,
) {
  const source = Math.min(left, right);
  const target = Math.max(left, right);
  edges.push({ source, target });

  if (isProtected) {
    protectedEdges.add(edgeKey(source, target));
  }
}

function edgeKey(left: number, right: number) {
  return `${Math.min(left, right)}-${Math.max(left, right)}`;
}

function buildAdjacency(vertexCount: number, edges: GraphEdge[]) {
  const adjacency = Array.from({ length: vertexCount }, () => [] as number[]);

  for (const { source, target } of edges) {
    adjacency[source].push(target);
    adjacency[target].push(source);
  }

  return adjacency;
}

function shuffle<T>(values: T[], random: () => number) {
  const result = [...values];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function relabelGraph(graph: FourColorGraph, random: () => number) {
  const oldIds = shuffle(
    graph.vertices.map((vertex) => vertex.id),
    random,
  );
  const newIdByOldId = new Map(
    oldIds.map((oldId, newId) => [oldId, newId]),
  );
  const vertices = oldIds.map((oldId, newId) => ({
    ...graph.vertices[oldId],
    id: newId,
  }));
  const edges = graph.edges
    .map(({ source, target }) => {
      const relabeledSource = newIdByOldId.get(source)!;
      const relabeledTarget = newIdByOldId.get(target)!;
      return {
        source: Math.min(relabeledSource, relabeledTarget),
        target: Math.max(relabeledSource, relabeledTarget),
      };
    })
    .sort((left, right) =>
      left.source === right.source
        ? left.target - right.target
        : left.source - right.source,
    );

  return { ...graph, vertices, edges };
}
