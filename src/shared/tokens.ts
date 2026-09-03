/**
 * The playing pieces. Imported by BOTH sides: the lobby offers this list and the
 * server validates a choice against the same one, so the two cannot drift.
 *
 * There are exactly as many pieces as `maxClients`, so every player can have one.
 */

export interface TokenPiece {
  id: string;
  label: string;
  /** Drawn on the board. Emoji rather than an image so there are no assets to ship. */
  glyph: string;
}

export const TOKENS: readonly TokenPiece[] = [
  { id: "hat",  label: "Top Hat",    glyph: "🎩" },
  { id: "dog",  label: "Dog",        glyph: "🐕" },
  { id: "cat",  label: "Cat",        glyph: "🐈" },
  { id: "car",  label: "Car",        glyph: "🚗" },
  { id: "ship", label: "Battleship", glyph: "🚢" },
  { id: "boot", label: "Boot",       glyph: "👢" },
] as const;

export function isTokenId(id: string): boolean {
  return TOKENS.some((t) => t.id === id);
}

/** Falls back to a dot, so a piece is never invisible if an id ever goes stale. */
export function tokenGlyph(id: string): string {
  return TOKENS.find((t) => t.id === id)?.glyph ?? "●";
}

/**
 * The first piece nobody has claimed. Used to seat a player on join so that
 * someone who never opens the picker still has a piece to play with.
 */
export function firstFreeToken(taken: readonly string[]): string {
  return TOKENS.find((t) => !taken.includes(t.id))?.id ?? TOKENS[0].id;
}
