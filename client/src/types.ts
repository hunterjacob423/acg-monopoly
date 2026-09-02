/** Plain-object view of the server schema, produced by state.toJSON(). */
export interface PlayerView {
  id: string; name: string; money: number; position: number;
  connected: boolean; inJail: boolean; jailTurns: number; jailCards: number;
  bankrupt: boolean; isHost: boolean; colour: string;
}

export interface PropertyView {
  tile: number; ownerId: string; houses: number; mortgaged: boolean;
}

export interface TradeView {
  id: string; fromId: string; toId: string;
  offerTiles: number[]; requestTiles: number[];
  offerMoney: number; requestMoney: number;
}

export interface Snapshot {
  roomCode: string;
  phase: "lobby" | "rolling" | "deciding" | "acting" | "ended";
  players: Record<string, PlayerView>;
  properties: Record<string, PropertyView>;
  turnOrder: string[];
  currentTurn: number;
  die1: number; die2: number; doubles: number;
  pendingPurchase: number;
  winnerId: string;
  trades: Record<string, TradeView>;
  log: string[];
}
