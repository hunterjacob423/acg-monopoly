import { useEffect, useState } from "react";
import type { CardEvent } from "./useGame";
import type { Snapshot } from "./types";

const DECKS = {
  chance: { title: "Chance", mark: "?" },
  chest: { title: "Community Chest", mark: "🧰" },
} as const;

/**
 * The card just drawn, turned face up in the middle of the board. Every player
 * sees it, because the server broadcasts the draw to the whole room rather than
 * only telling the player who landed on the tile.
 */
export function DeckCard({ card, state, onDismiss }: {
  card: CardEvent | null; state: Snapshot; onDismiss: () => void;
}) {
  // Kept on screen for the length of the turn-away, or the card would vanish
  // instantly instead of folding back down.
  const [showing, setShowing] = useState<CardEvent | null>(card);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (card) {
      setShowing(card);
      // A frame later, so the browser paints the face-down start position and the
      // change to it actually transitions.
      const t = setTimeout(() => setShown(true), 20);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setShowing(null), 340);
    return () => clearTimeout(t);
  }, [card]);

  if (!showing) return null;

  const deck = DECKS[showing.deck];
  const who = state.players[showing.playerId]?.name ?? "Someone";

  return (
    <div
      className={`deck-card ${showing.deck}${shown ? " shown" : ""}`}
      onClick={onDismiss}
      title="Click to dismiss"
    >
      <div className="deck-head">
        <span className="deck-mark">{deck.mark}</span>
        <span className="deck-title">{deck.title}</span>
      </div>
      <p className="deck-text">{showing.text}</p>
      <div className="deck-who">Drawn by {who}</div>
    </div>
  );
}
