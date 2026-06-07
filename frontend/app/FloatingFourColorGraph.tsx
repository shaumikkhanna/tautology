"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  generateFourColorGraph,
  isProperColoring,
  nextVertexColor,
  type FourColorGraph,
  type GraphPoint,
} from "./homeGraph";
import styles from "./homeGraph.module.css";

const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 620;
const NODE_RADIUS = 17;

type MotionNode = GraphPoint & {
  restX: number;
  restY: number;
  velocityX: number;
  velocityY: number;
};

type Phase = "active" | "celebrating" | "solved";

export function FloatingFourColorGraph() {
  const [graph, setGraph] = useState<FourColorGraph | null>(null);
  const [positions, setPositions] = useState<GraphPoint[]>([]);
  const [colors, setColors] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>("active");
  const [pulse, setPulse] = useState<{ id: number; nonce: number } | null>(
    null,
  );
  const [edgePulse, setEdgePulse] = useState<{
    key: string;
    nonce: number;
  } | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const motionNodes = useRef<MotionNode[]>([]);
  const pulseNonce = useRef(0);
  const pulseFrame = useRef<number | null>(null);
  const edgePulseNonce = useRef(0);
  const edgePulseFrame = useRef<number | null>(null);

  useEffect(() => {
    const generatedGraph = generateFourColorGraph();
    const initialNodes = generatedGraph.vertices.map((vertex) => {
      const x = 90 + vertex.x * (VIEWBOX_WIDTH - 180);
      const y = 55 + vertex.y * (VIEWBOX_HEIGHT - 110);

      return {
        x,
        y,
        restX: x,
        restY: y,
        velocityX: 0,
        velocityY: 0,
      };
    });

    motionNodes.current = initialNodes;
    setGraph(generatedGraph);
    setPositions(initialNodes.map(({ x, y }) => ({ x, y })));
    setColors(Array(generatedGraph.vertices.length).fill(-1));
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!graph || positions.length === 0 || phase === "solved") {
      return;
    }

    let animationFrame = 0;
    let previousTime = performance.now();
    const edgeLengths = graph.edges.map(({ source, target }) => {
      const sourceNode = motionNodes.current[source];
      const targetNode = motionNodes.current[target];
      return clamp(
        Math.hypot(
          targetNode.restX - sourceNode.restX,
          targetNode.restY - sourceNode.restY,
        ),
        92,
        205,
      );
    });

    const animate = (time: number) => {
      const nodes = motionNodes.current;
      const timeStep = Math.min((time - previousTime) / 16.67, 2);
      previousTime = time;

      for (let left = 0; left < nodes.length; left += 1) {
        for (let right = left + 1; right < nodes.length; right += 1) {
          const deltaX = nodes[right].x - nodes[left].x;
          const deltaY = nodes[right].y - nodes[left].y;
          const distanceSquared = Math.max(
            deltaX * deltaX + deltaY * deltaY,
            625,
          );
          const distance = Math.sqrt(distanceSquared);
          const force = 290 / distanceSquared;
          const forceX = (deltaX / distance) * force;
          const forceY = (deltaY / distance) * force;

          nodes[left].velocityX -= forceX * timeStep;
          nodes[left].velocityY -= forceY * timeStep;
          nodes[right].velocityX += forceX * timeStep;
          nodes[right].velocityY += forceY * timeStep;
        }
      }

      graph.edges.forEach(({ source, target }, edgeIndex) => {
        const sourceNode = nodes[source];
        const targetNode = nodes[target];
        const deltaX = targetNode.x - sourceNode.x;
        const deltaY = targetNode.y - sourceNode.y;
        const distance = Math.max(Math.hypot(deltaX, deltaY), 1);
        const springForce = (distance - edgeLengths[edgeIndex]) * 0.0032;
        const forceX = (deltaX / distance) * springForce;
        const forceY = (deltaY / distance) * springForce;

        sourceNode.velocityX += forceX * timeStep;
        sourceNode.velocityY += forceY * timeStep;
        targetNode.velocityX -= forceX * timeStep;
        targetNode.velocityY -= forceY * timeStep;
      });

      nodes.forEach((node, index) => {
        const centerForce = phase === "celebrating" ? -0.0006 : 0.00045;
        node.velocityX +=
          (VIEWBOX_WIDTH / 2 - node.x) * centerForce * timeStep;
        node.velocityY +=
          (VIEWBOX_HEIGHT / 2 - node.y) * centerForce * timeStep;

        if (!reducedMotion && phase === "active") {
          node.velocityX +=
            Math.sin(time * 0.00037 + index * 1.91) * 0.0035 * timeStep;
          node.velocityY +=
            Math.cos(time * 0.00031 + index * 1.47) * 0.0035 * timeStep;
        }

        const damping = phase === "celebrating" ? 0.94 : 0.986;
        node.velocityX *= Math.pow(damping, timeStep);
        node.velocityY *= Math.pow(damping, timeStep);
        node.x += node.velocityX * timeStep;
        node.y += node.velocityY * timeStep;

        if (node.x < 42 || node.x > VIEWBOX_WIDTH - 42) {
          node.x = clamp(node.x, 42, VIEWBOX_WIDTH - 42);
          node.velocityX *= -0.55;
        }
        if (node.y < 38 || node.y > VIEWBOX_HEIGHT - 38) {
          node.y = clamp(node.y, 38, VIEWBOX_HEIGHT - 38);
          node.velocityY *= -0.55;
        }
      });

      setPositions(nodes.map(({ x, y }) => ({ x, y })));
      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [graph, phase, positions.length, reducedMotion]);

  useEffect(() => {
    if (phase !== "celebrating") {
      return;
    }

    const settleDelay = reducedMotion ? 320 : 1450;
    const timeout = window.setTimeout(() => {
      motionNodes.current.forEach((node) => {
        node.velocityX = 0;
        node.velocityY = 0;
      });
      setPhase("solved");
    }, settleDelay);

    return () => window.clearTimeout(timeout);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (
      graph &&
      phase === "active" &&
      colors.length === graph.vertices.length &&
      isProperColoring(colors, graph.edges)
    ) {
      setPhase("celebrating");
    }
  }, [colors, graph, phase]);

  useEffect(
    () => () => {
      if (pulseFrame.current !== null) {
        cancelAnimationFrame(pulseFrame.current);
      }
      if (edgePulseFrame.current !== null) {
        cancelAnimationFrame(edgePulseFrame.current);
      }
    },
    [],
  );

  const jiggleEdge = (source: number, target: number) => {
    if (!graph || phase !== "active") {
      return;
    }

    const sourceNode = motionNodes.current[source];
    const targetNode = motionNodes.current[target];
    const deltaX = targetNode.x - sourceNode.x;
    const deltaY = targetNode.y - sourceNode.y;
    const distance = Math.max(Math.hypot(deltaX, deltaY), 1);
    const direction = Math.random() < 0.5 ? -1 : 1;
    const impulse = (reducedMotion ? 0.8 : 3.6) * direction;
    const perpendicularX = (-deltaY / distance) * impulse;
    const perpendicularY = (deltaX / distance) * impulse;

    sourceNode.velocityX += perpendicularX;
    sourceNode.velocityY += perpendicularY;
    targetNode.velocityX -= perpendicularX;
    targetNode.velocityY -= perpendicularY;

    const edgeKey = `${source}-${target}`;
    edgePulseNonce.current += 1;
    setEdgePulse(null);
    edgePulseFrame.current = requestAnimationFrame(() => {
      setEdgePulse({ key: edgeKey, nonce: edgePulseNonce.current });
    });
  };

  const cycleVertex = (vertexId: number) => {
    if (!graph || phase !== "active") {
      return;
    }

    const angle = Math.random() * Math.PI * 2;
    const impulse = reducedMotion ? 0.65 : 2.8;
    const node = motionNodes.current[vertexId];
    node.velocityX += Math.cos(angle) * impulse;
    node.velocityY += Math.sin(angle) * impulse;

    pulseNonce.current += 1;
    setPulse(null);
    pulseFrame.current = requestAnimationFrame(() => {
      setPulse({ id: vertexId, nonce: pulseNonce.current });
    });

    setColors((currentColors) => {
      const nextColors = [...currentColors];
      nextColors[vertexId] = nextVertexColor(nextColors[vertexId]);

      return nextColors;
    });
  };

  const handleVertexKeyDown = (
    event: KeyboardEvent<SVGGElement>,
    vertexId: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      cycleVertex(vertexId);
    }
  };

  const handleEdgeKeyDown = (
    event: KeyboardEvent<SVGLineElement>,
    source: number,
    target: number,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      jiggleEdge(source, target);
    }
  };

  return (
    <section
      className={`${styles.stage} ${styles[phase]}`}
      aria-label="Interactive four-color graph"
    >
      {graph && positions.length === graph.vertices.length ? (
        <svg
          className={styles.graph}
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          role="group"
          aria-label="Color every connected pair of vertices differently"
        >
          <g className={styles.edges}>
            {graph.edges.map(({ source, target }) => (
              <g key={`${source}-${target}`}>
                <line
                  className={styles.edgeControl}
                  x1={positions[source].x}
                  y1={positions[source].y}
                  x2={positions[target].x}
                  y2={positions[target].y}
                  role="button"
                  tabIndex={phase === "active" ? 0 : -1}
                  aria-label={`Edge between vertices ${source + 1} and ${
                    target + 1
                  }`}
                  aria-disabled={phase !== "active"}
                  onClick={() => jiggleEdge(source, target)}
                  onKeyDown={(event) =>
                    handleEdgeKeyDown(event, source, target)
                  }
                />
                <line
                  className={[
                    styles.edgeLine,
                    edgePulse?.key === `${source}-${target}`
                      ? styles.edgePulsing
                      : "",
                  ].join(" ")}
                  x1={positions[source].x}
                  y1={positions[source].y}
                  x2={positions[target].x}
                  y2={positions[target].y}
                  aria-hidden="true"
                />
              </g>
            ))}
          </g>

          {phase !== "active" ? (
            <g className={styles.successRings} aria-hidden="true">
              <circle cx={VIEWBOX_WIDTH / 2} cy={VIEWBOX_HEIGHT / 2} r="90" />
              <circle cx={VIEWBOX_WIDTH / 2} cy={VIEWBOX_HEIGHT / 2} r="90" />
            </g>
          ) : null}

          <g className={styles.vertices}>
            {graph.vertices.map((vertex) => {
              const color = colors[vertex.id] ?? -1;
              const isPulsing = pulse?.id === vertex.id;

              return (
                <g
                  key={vertex.id}
                  className={[
                    styles.vertex,
                    color >= 0 ? styles[`color${color}`] : styles.uncolored,
                    isPulsing ? styles.pulsing : "",
                  ].join(" ")}
                  transform={`translate(${positions[vertex.id].x} ${positions[vertex.id].y})`}
                  role="button"
                  tabIndex={phase === "active" ? 0 : -1}
                  aria-label={`Vertex ${vertex.id + 1}, ${
                    color < 0 ? "uncolored" : `color ${color + 1}`
                  }`}
                  aria-disabled={phase !== "active"}
                  onClick={() => cycleVertex(vertex.id)}
                  onKeyDown={(event) =>
                    handleVertexKeyDown(event, vertex.id)
                  }
                >
                  <circle className={styles.hitTarget} r="29" />
                  <circle className={styles.nodePulse} r={NODE_RADIUS + 4} />
                  <circle className={styles.node} r={NODE_RADIUS} />
                </g>
              );
            })}
          </g>
        </svg>
      ) : null}
    </section>
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
