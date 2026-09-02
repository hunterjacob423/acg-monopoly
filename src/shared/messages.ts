/**
 * The complete client -> server message vocabulary. The server accepts nothing else,
 * and every handler re-validates that the sender is allowed to do this right now.
 */
export interface ClientMessages {
  start: void;                                  // host only, in lobby
  roll: void;                                   // current player, phase "rolling"
  buy: void;                                    // current player, phase "deciding"
  decline: void;                                // current player, phase "deciding"
  endTurn: void;                                // current player, phase "acting"
  payFine: void;                                // current player, in jail
  build: { tile: number };                      // add a house/hotel
  sell: { tile: number };                       // sell a house/hotel back at half price
  mortgage: { tile: number };
  unmortgage: { tile: number };
  declareBankruptcy: void;

  /** Offer a swap of property and cash to another player. */
  proposeTrade: {
    toId: string;
    offerTiles: number[];
    requestTiles: number[];
    offerMoney: number;
    requestMoney: number;
  };
  acceptTrade: { tradeId: string };   // recipient only
  rejectTrade: { tradeId: string };   // recipient only
  cancelTrade: { tradeId: string };   // proposer withdraws
  /** Type-ahead for the trade screen; answered with `propertyResults`. */
  searchProperty: { query: string };
}

export type ClientMessageType = keyof ClientMessages;

/** Server -> client one-off notifications (state itself syncs automatically). */
export interface ServerMessages {
  error: { message: string };
  card: { deck: "chance" | "chest"; text: string };
  /** Board indices matching a searchProperty query, in alphabetical order. */
  propertyResults: { tiles: number[] };
}

/** Join options, validated in onAuth/onJoin. */
export interface JoinOptions {
  roomCode: string;
  name: string;
  passcode?: string;
}

export type Phase = "lobby" | "rolling" | "deciding" | "acting" | "ended";
