import { cardsEqual } from "./red7Engine.ts";
import type {
  Red7AdvancedRules,
  Red7Card,
  Red7PalettePlay,
  Red7Player,
  Red7PublicState,
} from "./red7Types";

export type PendingAdvancedEffect =
  | { type: "seven"; playIndex: number; cards: Red7Card[] }
  | { type: "five"; playIndex: number; cards: Red7Card[] }
  | {
      type: "one";
      playIndex: number;
      targets: Array<{ player: Red7Player; cards: Red7Card[] }>;
    };

export function roomAdvancedRules(state: Red7PublicState): Red7AdvancedRules {
  return {
    seven: state.room.advancedSeven,
    five: state.room.advancedFive,
    three: state.room.advancedThree,
    one: state.room.advancedOne,
  };
}

export function getAdvancedTurnState(
  state: Red7PublicState,
  playerId: string | null,
  plays: Red7PalettePlay[],
): { palette: Red7Card[]; pending: PendingAdvancedEffect | null } {
  const me = state.players.find((player) => player.id === playerId);
  if (!me) return { palette: [], pending: null };

  const rules = roomAdvancedRules(state);
  let hand = [...state.privateState.cards];
  let palette = [...me.palette];
  const opponentPalettes = new Map(
    state.players.map((player) => [player.id, [...player.palette]]),
  );

  for (let index = 0; index < plays.length; index += 1) {
    const play = plays[index];
    hand = removeCard(hand, play.card);
    palette.push(play.card);

    if (play.card.value === 7 && rules.seven) {
      if (play.effect?.type !== "seven") {
        return { palette, pending: { type: "seven", playIndex: index, cards: palette } };
      }
      palette = removeCard(palette, play.effect.card);
    }

    if (play.card.value === 5 && rules.five && hand.length > 0) {
      if (!plays[index + 1]) {
        return { palette, pending: { type: "five", playIndex: index, cards: hand } };
      }
    }

    if (play.card.value === 1 && rules.one) {
      const targets = state.players
        .filter(
          (player) =>
            player.id !== me.id &&
            player.active &&
            player.role === "seated" &&
            !player.eliminated,
        )
        .map((player) => ({
          player,
          cards: opponentPalettes.get(player.id) ?? [],
        }))
        .filter(
          (target) =>
            target.cards.length > 0 && target.cards.length >= palette.length,
        );

      if (targets.length > 0 && play.effect?.type !== "one") {
        return { palette, pending: { type: "one", playIndex: index, targets } };
      }
      if (play.effect?.type === "one") {
        const targetPalette = opponentPalettes.get(play.effect.playerId) ?? [];
        opponentPalettes.set(
          play.effect.playerId,
          removeCard(targetPalette, play.effect.card),
        );
      }
    }
  }

  return { palette, pending: null };
}

function removeCard(cards: Red7Card[], target: Red7Card) {
  const index = cards.findIndex((card) => cardsEqual(card, target));
  if (index < 0) return cards;
  return [...cards.slice(0, index), ...cards.slice(index + 1)];
}
