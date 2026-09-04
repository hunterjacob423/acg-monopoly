import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

/**
 * Everything in here is broadcast to every client automatically. Anything a player
 * must NOT see (deck order, for instance) is kept as a plain field on the Room instead.
 */

export class Player extends Schema {
  /** Colyseus sessionId. Also the key in GameState.players. */
  @type("string") id = "";
  @type("string") name = "";
  @type("int32") money = 0;
  @type("uint8") position = 0;
  @type("boolean") connected = true;
  @type("boolean") inJail = false;
  /** Turns spent in jail so far (0-3). */
  @type("uint8") jailTurns = 0;
  @type("uint8") jailCards = 0;
  @type("boolean") bankrupt = false;
  @type("boolean") isHost = false;
  /** Board token colour, assigned on join. */
  @type("string") colour = "";
  /** Playing piece id from shared/tokens.ts. Seeded on join, changed in the lobby. */
  @type("string") token = "";
}

export class Property extends Schema {
  @type("uint8") tile = 0;
  /** sessionId of the owner, or "" while the bank holds it. */
  @type("string") ownerId = "";
  /** 0-4 houses; 5 means a hotel. */
  @type("uint8") houses = 0;
  @type("boolean") mortgaged = false;
}

/**
 * A trade offer awaiting an answer from the recipient. Both parties can see it,
 * so it lives in the synced schema; the server still re-validates on accept,
 * because ownership or money may have changed since it was proposed.
 */
export class Trade extends Schema {
  @type("string") id = "";
  @type("string") fromId = "";
  @type("string") toId = "";
  /** Board indices the proposer is giving away. */
  @type(["uint8"]) offerTiles = new ArraySchema<number>();
  /** Board indices the proposer is asking for. */
  @type(["uint8"]) requestTiles = new ArraySchema<number>();
  @type("int32") offerMoney = 0;
  @type("int32") requestMoney = 0;
}

/**
 * One line of player chat. In the synced schema rather than a plain broadcast so
 * that a refresh or a reconnect does not lose the conversation, exactly as the
 * event log does not lose itself.
 */
export class ChatLine extends Schema {
  /** sessionId of the sender. Kept so the client can colour the name. */
  @type("string") id = "";
  /** Copied at the time of speaking, so a line still has a name behind it after
   *  the player has left and their Player record is gone. */
  @type("string") name = "";
  @type("string") text = "";
}

export class GameState extends Schema {
  @type("string") roomCode = "";
  /** "lobby" | "rolling" | "deciding" | "acting" | "ended" */
  @type("string") phase = "lobby";

  @type({ map: Player }) players = new MapSchema<Player>();
  /** Keyed by tile index as a string. Only ownable tiles are present. */
  @type({ map: Property }) properties = new MapSchema<Property>();

  /** sessionIds in turn order, fixed when the game starts. */
  @type(["string"]) turnOrder = new ArraySchema<string>();
  @type("uint8") currentTurn = 0;

  @type("uint8") die1 = 0;
  @type("uint8") die2 = 0;
  /** Consecutive doubles this turn; 3 sends you to jail. */
  @type("uint8") doubles = 0;

  /** Tile awaiting a buy/decline decision, or -1. */
  @type("int8") pendingPurchase = -1;
  @type("string") winnerId = "";

  /** Open trade offers, keyed by trade id. Removed once accepted or refused. */
  @type({ map: Trade }) trades = new MapSchema<Trade>();

  /** Rolling log, newest last, capped at 40 entries. */
  @type(["string"]) log = new ArraySchema<string>();

  /** Player chat, newest last, capped at 50 lines. */
  @type([ChatLine]) chat = new ArraySchema<ChatLine>();

  get currentPlayerId(): string {
    return this.turnOrder[this.currentTurn] ?? "";
  }
}
