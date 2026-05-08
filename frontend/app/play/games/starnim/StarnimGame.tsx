"use client";

import { useMemo, useState } from "react";
import { apiUrl } from "@/lib/api";
import styles from "./starnim.module.css";

type Point = {
  x: number;
  y: number;
};

type Winner = "player" | "computer" | null;

const SIZE = 600;
const CENTER = SIZE / 2;
const RADIUS = 250;

export function StarnimGame() {
  const [nodeCountInput, setNodeCountInput] = useState("7");
  const [difficulty, setDifficulty] = useState(0.75);
  const [nodeStates, setNodeStates] = useState<boolean[] | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
  const [winner, setWinner] = useState<Winner>(null);
  const [message, setMessage] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const points = useMemo(
    () => (nodeStates ? generatePoints(nodeStates.length) : []),
    [nodeStates],
  );

  function startGame() {
    const nodeCount = Number(nodeCountInput);

    if (!Number.isInteger(nodeCount) || nodeCount < 3 || nodeCount % 2 === 0) {
      setMessage("Enter an odd number of nodes, 3 or higher.");
      return;
    }

    setNodeStates(Array.from({ length: nodeCount }, () => false));
    setSelectedNodes([]);
    setWinner(null);
    setMessage("");
  }

  function resetGame() {
    setNodeStates(null);
    setSelectedNodes([]);
    setWinner(null);
    setMessage("");
  }

  function toggleNode(index: number) {
    if (!nodeStates || nodeStates[index] || winner || isThinking) {
      return;
    }

    if (selectedNodes.includes(index)) {
      setSelectedNodes(selectedNodes.filter((node) => node !== index));
      setMessage("");
      return;
    }

    if (selectedNodes.length === 0) {
      setSelectedNodes([index]);
      setMessage("");
      return;
    }

    if (selectedNodes.length === 1 && areNodesConnected(index, selectedNodes[0], nodeStates.length)) {
      setSelectedNodes([...selectedNodes, index]);
      setMessage("");
      return;
    }

    setMessage("You can take one node, or two connected nodes.");
  }

  function submitMove() {
    if (!nodeStates || selectedNodes.length === 0 || winner || isThinking) {
      return;
    }

    const nextStates = applyMove(nodeStates, selectedNodes);
    setNodeStates(nextStates);
    setSelectedNodes([]);

    if (isGameOver(nextStates)) {
      setWinner("player");
      setMessage("You took the last node.");
    } else {
      setMessage("");
    }
  }

  async function requestComputerMove() {
    if (!nodeStates || winner || isThinking) {
      return;
    }

    setIsThinking(true);
    setSelectedNodes([]);
    setMessage("Computer is thinking...");

    try {
      const response = await fetch(apiUrl("/api/games/starnim/computer-move"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          node_states: nodeStates,
          difficulty,
        }),
      });

      if (!response.ok) {
        throw new Error("Computer move failed.");
      }

      const data = (await response.json()) as { move?: number[] };
      const move = data.move ?? [];

      if (!move.length) {
        throw new Error("No valid computer move was returned.");
      }

      const nextStates = applyMove(nodeStates, move);
      setNodeStates(nextStates);

      if (isGameOver(nextStates)) {
        setWinner("computer");
        setMessage("The computer took the last node.");
      } else {
        setMessage(`Computer took ${move.map((node) => node + 1).join(", ")}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Computer move failed.");
    } finally {
      setIsThinking(false);
    }
  }

  if (!nodeStates) {
    return (
      <main className={styles.page}>
        <HomeLink />
        <section className={styles.startPanel}>
          <h1>Star Nim</h1>
          <label>
            Nodes
            <input
              type="number"
              min="3"
              step="2"
              value={nodeCountInput}
              onChange={(event) => setNodeCountInput(event.target.value)}
            />
          </label>
          <label>
            Difficulty
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.25"
              value={difficulty}
              onChange={(event) => setDifficulty(Number(event.target.value))}
            />
            <span>{difficultyLabel(difficulty)}</span>
          </label>
          <button type="button" onClick={startGame}>
            Start
          </button>
          {message ? <p className={styles.message}>{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <HomeLink />
      <section className={styles.gameLayout}>
        <svg className={styles.board} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label="Starnim board">
          {points.map((point, index) => {
            const oppositeA = (index + Math.floor(nodeStates.length / 2)) % nodeStates.length;
            const oppositeB = (index + Math.ceil(nodeStates.length / 2)) % nodeStates.length;

            return [oppositeA, oppositeB].map((target) => (
              <line
                key={`${index}-${target}`}
                x1={point.x}
                y1={point.y}
                x2={points[target].x}
                y2={points[target].y}
                className={styles.edge}
              />
            ));
          })}

          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="20"
              className={[
                styles.node,
                nodeStates[index] ? styles.removed : "",
                selectedNodes.includes(index) ? styles.selected : "",
              ].join(" ")}
              onClick={() => toggleNode(index)}
            />
          ))}
        </svg>

        <aside className={styles.controls}>
          <h1>Star Nim</h1>
          <button type="button" onClick={submitMove} disabled={!selectedNodes.length || isThinking || Boolean(winner)}>
            Submit Move
          </button>
          <button type="button" onClick={requestComputerMove} disabled={isThinking || Boolean(winner)}>
            Computer Move
          </button>
          <button type="button" onClick={resetGame}>
            Reset Game
          </button>
          {winner ? (
            <p className={winner === "player" ? styles.win : styles.loss}>
              {winner === "player" ? "You win." : "Computer wins."}
            </p>
          ) : null}
          {message ? <p className={styles.message}>{message}</p> : null}
        </aside>
      </section>
    </main>
  );
}

function HomeLink() {
  return (
    <a className={styles.homeLink} href="/" aria-label="Tautology home">
      P or not P
    </a>
  );
}

function generatePoints(nodeCount: number): Point[] {
  return Array.from({ length: nodeCount }, (_, index) => {
    const angle = (2 * Math.PI * index) / nodeCount;
    return {
      x: Math.round(CENTER + RADIUS * Math.cos(angle)),
      y: Math.round(CENTER + RADIUS * Math.sin(angle)),
    };
  });
}

function areNodesConnected(first: number, second: number, nodeCount: number) {
  const floorJump = Math.floor(nodeCount / 2);
  const ceilJump = Math.ceil(nodeCount / 2);
  return (
    (first + floorJump) % nodeCount === second ||
    (first + ceilJump) % nodeCount === second ||
    (second + floorJump) % nodeCount === first ||
    (second + ceilJump) % nodeCount === first
  );
}

function applyMove(nodeStates: boolean[], move: number[]) {
  const nextStates = [...nodeStates];
  move.forEach((node) => {
    nextStates[node] = true;
  });
  return nextStates;
}

function isGameOver(nodeStates: boolean[]) {
  return nodeStates.every(Boolean);
}

function difficultyLabel(difficulty: number) {
  if (difficulty === 0.5) {
    return "Easy";
  }
  if (difficulty === 1) {
    return "Impossible";
  }
  return "Medium";
}
