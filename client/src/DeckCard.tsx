import { useEffect, useState } from "react";
import type { CardEvent } from "./useGame";
import type { Snapshot } from "./types";

const DECKS = {
  chance: { title: "Chance", mark: "?" },
  chest: { title: "Community Chest", mark: "🧰" },
} as const;

export type DeckId = keyof typeof DECKS;

/**
 * The two draw piles in the middle of the board, as on a real one. Positioned by
 * CSS on the board's diagonal; the pile a card is coming from lifts while it is
 * being drawn.
 */
export function DeckPiles({ drawing }: { drawing: DeckId | null }) {
  return (
    <>
      {(Object.keys(DECKS) as DeckId[]).map((id) => (
        <div key={id} className={`pile ${id}${drawing === id ? " drawing" : ""}`} aria-hidden="true">
          <span className="pile-mark">{DECKS[id].mark}</span>
          <span className="pile-label">{DECKS[id].title}</span>
        </div>
      ))}
    </>
  );
}

/**
 * The card just drawn, pulled off its pile and turned face up in the middle of
 * the board. Every player sees it, because the server broadcasts the draw to the
 * whole room rather than only telling the player who landed on the tile.
 *
 * It stays up until dismissed. Nothing times out, so a card cannot disappear
 * before the rest of the table has read it, and each player clears their own.
 */
export function DeckCard({ card, state, onDismiss }: {
  card: CardEvent | null; state: Snapshot; onDismiss: () => void;
}) {
  // Kept mounted through the return-to-pile animation, or the card would vanish
  // instantly instead of travelling back.
  const [showing, setShowing] = useState<CardEvent | null>(card);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (card) {
      setShowing(card);
      // A frame later, so the browser paints the start position on the pile and
      // the change away from it actually transitions.
      const t = setTimeout(() => setShown(true), 20);
      return () => clearTimeout(t);
    }
    setShown(false);
    const t = setTimeout(() => setShowing(null), 470);
    return () => clearTimeout(t);
  }, [card]);

  if (!showing) return null;

  const deck = DECKS[showing.deck];
  const who = state.players[showing.playerId]?.name ?? "Someone";

  return (
    <div className={`deck-card ${showing.deck}${shown ? " shown" : ""}`}>
      <div className="deck-head">
        <span className="deck-mark">{deck.mark}</span>
        <span className="deck-title">{deck.title}</span>
      </div>
      <p className="deck-text">{showing.text}</p>
      <div className="deck-foot">
        <span className="deck-who">Drawn by {who}</span>
        <button className="deck-dismiss" onClick={onDismiss} autoFocus>Continue</button>
      </div>
    </div>
  );
}
