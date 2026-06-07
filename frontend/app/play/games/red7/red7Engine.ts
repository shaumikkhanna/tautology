import {
  RED7_COLORS,
  type Red7Card,
  type Red7Player,
  type Red7Rule,
  type Red7TurnAction,
} from "./red7Types.ts";

const COLOR_STRENGTH = new Map(
  RED7_COLORS.map((color, index) => [color, RED7_COLORS.length - index]),
);

export function cardStrength(card: Red7Card) {
  return card.value * 10 + (COLOR_STRENGTH.get(card.color) ?? 0);
}

export function compareCards(left: Red7Card, right: Red7Card) {
  return cardStrength(left) - cardStrength(right);
}

export function scorePalette(
  palette: Red7Card[],
  rule: Red7Rule,
): [count: number, highCard: number] {
  if (palette.length === 0) {
    return [0, 0];
  }

  if (rule === "red") {
    return [1, Math.max(...palette.map(cardStrength))];
  }

  if (rule === "orange") {
    return strongestGroup(palette, (card) => String(card.value));
  }

  if (rule === "yellow") {
    return strongestGroup(palette, (card) => card.color);
  }

  if (rule === "green") {
    return scoreCards(palette.filter((card) => card.value % 2 === 0));
  }

  if (rule === "blue") {
    const strongestByColor = new Map<Red7Rule, Red7Card>();
    for (const card of palette) {
      const current = strongestByColor.get(card.color);
      if (!current || compareCards(card, current) > 0) {
        strongestByColor.set(card.color, card);
      }
    }
    return scoreCards([...strongestByColor.values()]);
  }

  if (rule === "violet") {
    return scoreCards(palette.filter((card) => card.value < 4));
  }

  return scoreIndigo(palette);
}

export function compareScores(
  left: [number, number],
  right: [number, number],
) {
  return left[0] === right[0] ? left[1] - right[1] : left[0] - right[0];
}

export function winningPlayer(
  players: Pick<Red7Player, "id" | "palette" | "eliminated" | "active" | "role">[],
  rule: Red7Rule,
) {
  const ranked = players
    .filter(
      (player) =>
        player.active && player.role === "seated" && !player.eliminated,
    )
    .map((player) => ({
      id: player.id,
      score: scorePalette(player.palette, rule),
    }))
    .sort((left, right) => compareScores(right.score, left.score));

  if (ranked.length === 0) {
    return null;
  }

  if (
    ranked.length > 1 &&
    compareScores(ranked[0].score, ranked[1].score) === 0
  ) {
    return null;
  }

  return ranked[0].id;
}

export function previewAction(
  players: Red7Player[],
  playerId: string,
  currentRule: Red7Rule,
  action: Red7TurnAction,
) {
  const nextRule = action.canvasCard?.color ?? currentRule;
  const nextPlayers = players.map((player) =>
    player.id === playerId && action.paletteCard
      ? { ...player, palette: [...player.palette, action.paletteCard] }
      : player,
  );

  return {
    rule: nextRule,
    winning: winningPlayer(nextPlayers, nextRule) === playerId,
  };
}

export function cardsEqual(left: Red7Card, right: Red7Card) {
  return left.color === right.color && left.value === right.value;
}

export function shouldDrawCard({
  drawRule,
  canvasCard,
  finalPaletteSize,
  deckCount,
}: {
  drawRule: boolean;
  canvasCard: Red7Card | null;
  finalPaletteSize: number;
  deckCount: number;
}) {
  return Boolean(
    drawRule &&
      canvasCard &&
      canvasCard.value > finalPaletteSize &&
      deckCount > 0,
  );
}

export function ruleLabel(rule: Red7Rule) {
  const labels: Record<Red7Rule, string> = {
    red: "Highest card",
    orange: "Most cards of one number",
    yellow: "Most cards of one color",
    green: "Most even cards",
    blue: "Most different colors",
    indigo: "Longest numerical run",
    violet: "Most cards below 4",
  };
  return labels[rule];
}

function scoreCards(cards: Red7Card[]): [number, number] {
  return [
    cards.length,
    cards.length > 0 ? Math.max(...cards.map(cardStrength)) : 0,
  ];
}

function strongestGroup(
  palette: Red7Card[],
  keyForCard: (card: Red7Card) => string,
): [number, number] {
  const groups = new Map<string, Red7Card[]>();

  for (const card of palette) {
    const key = keyForCard(card);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }

  return [...groups.values()]
    .map(scoreCards)
    .reduce(
      (best, score) => (compareScores(score, best) > 0 ? score : best),
      [0, 0] as [number, number],
    );
}

function scoreIndigo(palette: Red7Card[]): [number, number] {
  let best: [number, number] = [0, 0];

  for (let start = 1; start <= 7; start += 1) {
    for (let end = start; end <= 7; end += 1) {
      const cardsInRange = palette.filter(
        (card) => card.value >= start && card.value <= end,
      );
      const distinctValues = new Set(cardsInRange.map((card) => card.value));
      if (distinctValues.size !== end - start + 1) {
        continue;
      }

      const score: [number, number] = [
        distinctValues.size,
        Math.max(...cardsInRange.map(cardStrength)),
      ];
      if (compareScores(score, best) > 0) {
        best = score;
      }
    }
  }

  return best;
}
