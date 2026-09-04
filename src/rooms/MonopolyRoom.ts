import { Room, Client, CloseCode } from "@colyseus/core";
import { GameState, Player, Property, Trade, ChatLine } from "./schema/GameState";
import {
  BOARD, GO_SALARY, JAIL_FINE, JAIL_INDEX, OWNABLE, STARTING_MONEY,
} from "../shared/board";
import type { JoinOptions } from "../shared/messages";
import { firstFreeToken, isTokenId } from "../shared/tokens";
import { CHANCE, COMMUNITY_CHEST, shuffle, type Card, type CardEffects } from "../game/cards";
import { cleanChatText, CHAT_MIN_GAP_MS } from "../shared/chat";
import { move, moveBackwards, searchByPrefix, findByName } from "../game/BoardGraph";
import { Queue, CircularQueue } from "../structures/Queue";
import { Stack } from "../structures/Stack";
import { HashTable } from "../structures/HashTable";
import { Leaderboard } from "../persistence/Leaderboard";
import { bubbleSort } from "../structures/sorting";
import {
  buildError, houseAndHotelCount, mortgageValue, netWorth, rentFor, sellError,
  tradeError, unmortgageCost, type TradeSide,
} from "../game/rules";

const TOKEN_COLOURS = ["#e6394a", "#2f7de1", "#22a95b", "#f0a92a", "#9b4fd1", "#16bcc4"];
const RECONNECT_GRACE_SECONDS = 120;

export class MonopolyRoom extends Room<{ state: GameState }> {
  maxClients = 6;

  /**
   * Server-only. Never added to the schema, so clients cannot read the deck order.
   *
   * Draw piles are QUEUES because Monopoly draws from the top and returns the used
   * card to the bottom — first in, first out. Discards go on a STACK, since the
   * most recently used card sits on top of the pile and the whole pile is turned
   * over (reshuffled) when the draw queue empties.
   */
  private chanceDeck = new Queue<Card>();
  private chestDeck = new Queue<Card>();
  private chanceDiscard = new Stack<Card>();
  private chestDiscard = new Stack<Card>();

  /**
   * Turn order as a circular queue: ending a turn dequeues the current player and
   * enqueues them at the back, so the rotation repeats with no wrapping index.
   */
  private turnQueue = new CircularQueue<string>();

  /**
   * The server's own player index, keyed by session ID. Every incoming message
   * needs this lookup, and the hash table gives it in O(1) average.
   *
   * The MapSchema in GameState is the NETWORK representation — it exists to be
   * synchronised to clients. This is the engine's own index; game logic reads
   * from here so it does not depend on the transport layer's data structures.
   */
  private playerIndex = new HashTable<Player>();

  private leaderboard = new Leaderboard();

  onCreate(options: JoinOptions) {
    this.setState(new GameState());
    this.state.roomCode = (options.roomCode ?? "").toUpperCase();

    // NOTE: deliberately NOT setPrivate() — a private room is excluded from matchmaking
    // altogether, so nobody could ever join by room code. The code plus CLASS_PASSCODE
    // is the access control.

    for (const tile of OWNABLE) {
      const p = new Property();
      p.tile = tile;
      this.state.properties.set(String(tile), p);
    }
    for (const card of shuffle(CHANCE)) this.chanceDeck.enqueue(card);
    for (const card of shuffle(COMMUNITY_CHEST)) this.chestDeck.enqueue(card);

    this.onMessage("start", (client) => this.handleStart(client));
    this.onMessage("roll", (client) => this.handleRoll(client));
    this.onMessage("buy", (client) => this.handleBuy(client));
    this.onMessage("decline", (client) => this.handleDecline(client));
    this.onMessage("endTurn", (client) => this.handleEndTurn(client));
    this.onMessage("payFine", (client) => this.handlePayFine(client));
    this.onMessage("build", (client, msg: { tile: number }) => this.handleBuild(client, msg?.tile));
    this.onMessage("sell", (client, msg: { tile: number }) => this.handleSell(client, msg?.tile));
    this.onMessage("mortgage", (client, msg: { tile: number }) => this.handleMortgage(client, msg?.tile));
    this.onMessage("unmortgage", (client, msg: { tile: number }) => this.handleUnmortgage(client, msg?.tile));
    this.onMessage("declareBankruptcy", (client) => this.handleBankruptcyRequest(client));
    this.onMessage("proposeTrade", (client, msg) => this.handleProposeTrade(client, msg));
    this.onMessage("acceptTrade", (client, msg: { tradeId: string }) => this.handleAcceptTrade(client, msg?.tradeId));
    this.onMessage("rejectTrade", (client, msg: { tradeId: string }) => this.handleTradeRefusal(client, msg?.tradeId, "rejected"));
    this.onMessage("cancelTrade", (client, msg: { tradeId: string }) => this.handleTradeRefusal(client, msg?.tradeId, "withdrew"));
    this.onMessage("searchProperty", (client, msg: { query: string }) => this.handleSearchProperty(client, msg?.query));
    this.onMessage("chooseToken", (client, msg: { token: string }) => this.handleChooseToken(client, msg?.token));
    this.onMessage("chat", (client, msg: { text: string }) => this.handleChat(client, msg?.text));
  }

  // ---------------------------------------------------------------- join / leave

  onJoin(client: Client, options: JoinOptions) {
    // Passcode is checked here rather than in onAuth so the check does not depend on
    // which Colyseus auth API version is in use.
    const required = process.env.CLASS_PASSCODE;
    if (required && options?.passcode !== required) {
      throw new Error("Wrong passcode.");
    }
    if (this.state.phase !== "lobby") {
      throw new Error("That game has already started.");
    }

    const player = new Player();
    player.id = client.sessionId;
    player.name = (options?.name || "Player").slice(0, 16);
    player.money = STARTING_MONEY;
    player.colour = TOKEN_COLOURS[this.state.players.size % TOKEN_COLOURS.length];
    // Seat everyone with a free piece immediately, so a player who never opens the
    // picker still has one. maxClients matches the number of pieces, so this always
    // finds an unclaimed piece.
    player.token = firstFreeToken(this.takenTokens());
    player.isHost = this.state.players.size === 0;
    this.state.players.set(client.sessionId, player);
    this.playerIndex.set(client.sessionId, player);
    this.log(`${player.name} joined.`);
  }

  async onLeave(client: Client, code?: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    // A deliberate leave (tab closed via room.leave()) is not worth holding a seat for.
    const consented = code === CloseCode.CONSENTED;
    if (consented || this.state.phase === "lobby") {
      this.removePlayer(client.sessionId);
      return;
    }

    player.connected = false;
    this.log(`${player.name} disconnected.`);
    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
      player.connected = true;
      this.log(`${player.name} reconnected.`);
    } catch {
      this.log(`${player.name} did not come back and is out.`);
      this.bankrupt(player.id, ""); // properties go back to the bank
    }
  }

  private removePlayer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    this.log(`${player.name} left.`);
    this.state.players.delete(sessionId);
    this.playerIndex.delete(sessionId);
    this.lastSpokeAt.delete(sessionId);
    this.clearTradesFor(sessionId);
    // Hand the host badge to whoever is left.
    if (player.isHost) {
      const next = [...this.state.players.values()][0];
      if (next) next.isHost = true;
    }
  }

  // ---------------------------------------------------------------- guards

  /** Returns the player if it is their turn and the phase is allowed, else null. */
  private requireTurn(client: Client, phases: string[]): Player | null {
    const player = this.state.players.get(client.sessionId);
    if (!player) return null;
    if (this.state.currentPlayerId !== client.sessionId) {
      return this.deny(client, "It is not your turn.");
    }
    if (!phases.includes(this.state.phase)) {
      return this.deny(client, "You cannot do that right now.");
    }
    if (player.bankrupt) return this.deny(client, "You are out of the game.");
    return player;
  }

  private deny(client: Client, message: string): null {
    client.send("error", { message });
    return null;
  }

  // ---------------------------------------------------------------- turn flow

  private handleStart(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player?.isHost) return this.deny(client, "Only the host can start the game.");
    if (this.state.phase !== "lobby") return this.deny(client, "Already started.");
    if (this.state.players.size < 2) return this.deny(client, "You need at least two players.");

    this.turnQueue = new CircularQueue(shuffle([...this.state.players.keys()]));
    this.publishTurnOrder();
    this.state.phase = "rolling";
    this.log(`Game started. ${this.name(this.state.currentPlayerId)} goes first.`);
  }

  /**
   * When each player last spoke, for the rate limit. A plain map on the room
   * rather than a field on Player: it is bookkeeping, and nothing about it needs
   * to reach the clients.
   */
  private lastSpokeAt = new Map<string, number>();

  /**
   * Chat is open in every phase, including the lobby and after the game has
   * ended, and to bankrupt players — being out of the game is no reason to be
   * unable to talk to the room.
   */
  private handleChat(client: Client, raw: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const text = cleanChatText(raw);
    if (!text) return; // Nothing worth saying; not worth an error either.

    const now = Date.now();
    const last = this.lastSpokeAt.get(client.sessionId) ?? 0;
    if (now - last < CHAT_MIN_GAP_MS) {
      return this.deny(client, "One message at a time — wait a moment.");
    }
    this.lastSpokeAt.set(client.sessionId, now);

    const line = new ChatLine();
    line.id = player.id;
    line.name = player.name;
    line.text = text;
    this.state.chat.push(line);
    while (this.state.chat.length > 50) this.state.chat.shift();
  }

  /** Pieces may only be swapped in the lobby, and no two players may share one. */
  private handleChooseToken(client: Client, token: string) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (this.state.phase !== "lobby") return this.deny(client, "The game has already started.");
    if (!isTokenId(token)) return this.deny(client, "That is not a playing piece.");
    if (this.takenTokens(player.id).includes(token)) {
      return this.deny(client, "Someone else has taken that piece.");
    }
    player.token = token;
  }

  /** Pieces currently spoken for, ignoring one player's own so re-picking is a no-op. */
  private takenTokens(exceptId = ""): string[] {
    const taken: string[] = [];
    this.state.players.forEach((p) => {
      if (p.id !== exceptId && p.token) taken.push(p.token);
    });
    return taken;
  }

  private handleRoll(client: Client) {
    const player = this.requireTurn(client, ["rolling"]);
    if (!player) return;
    if (player.money < 0) return this.deny(client, "Settle your debt before rolling.");

    const die1 = 1 + Math.floor(Math.random() * 6);
    const die2 = 1 + Math.floor(Math.random() * 6);
    this.state.die1 = die1;
    this.state.die2 = die2;
    // Before anything that moves a piece: the clients hold the piece still until
    // the dice have settled, and messages arrive in the order they were sent.
    this.broadcast("dice", { playerId: player.id, die1, die2 });
    const isDouble = die1 === die2;

    if (player.inJail) {
      if (isDouble) {
        player.inJail = false;
        player.jailTurns = 0;
        this.log(`${player.name} rolled a double and left jail.`);
        this.advancePlayer(player, die1 + die2);
      } else {
        player.jailTurns++;
        if (player.jailTurns >= 3) {
          this.charge(player.id, JAIL_FINE, "");
          player.inJail = false;
          player.jailTurns = 0;
          this.log(`${player.name} paid £${JAIL_FINE} after three failed attempts.`);
          this.advancePlayer(player, die1 + die2);
        } else {
          this.log(`${player.name} failed to roll a double (${die1}+${die2}).`);
          this.state.phase = "acting";
        }
      }
      return;
    }

    if (isDouble) {
      this.state.doubles++;
      if (this.state.doubles >= 3) {
        this.log(`${player.name} rolled three doubles and goes to jail.`);
        this.sendToJail(player);
        this.state.phase = "acting";
        return;
      }
    } else {
      this.state.doubles = 0;
    }

    this.advancePlayer(player, die1 + die2);
  }

  private handleEndTurn(client: Client) {
    const player = this.requireTurn(client, ["acting"]);
    if (!player) return;
    if (player.money < 0) {
      return this.deny(client, "You are in debt — sell, mortgage, or declare bankruptcy.");
    }

    // Rolling a double earns another roll, unless it landed you in jail.
    if (this.state.doubles > 0 && !player.inJail) {
      this.state.phase = "rolling";
      this.log(`${player.name} rolled a double and goes again.`);
      return;
    }
    this.nextTurn();
  }

  private nextTurn() {
    this.state.doubles = 0;
    this.state.pendingPurchase = -1;

    // Rotate the queue until an active player reaches the front. Bounded by the
    // queue length so an all-bankrupt table cannot loop forever.
    for (let attempts = 0; attempts < this.turnQueue.size; attempts++) {
      const nextId = this.turnQueue.rotate();
      const candidate = nextId ? this.playerIndex.get(nextId) : undefined;
      if (candidate && !candidate.bankrupt) {
        this.publishTurnOrder();
        this.state.phase = "rolling";
        this.log(`${candidate.name}'s turn.`);
        return;
      }
    }
    this.checkForWinner();
  }

  /**
   * Copy the queue's order into the synced schema so clients can see it.
   * The front of the queue is always the current player, so currentTurn is 0.
   */
  private publishTurnOrder() {
    this.state.turnOrder.splice(0, this.state.turnOrder.length);
    for (const id of this.turnQueue.toArray()) this.state.turnOrder.push(id);
    this.state.currentTurn = 0;
  }

  // ---------------------------------------------------------------- movement

  /** Move `steps` forward, collecting salary on passing GO, then resolve the tile. */
  /**
   * The single place a piece's position changes, so every move can be narrated to
   * the clients for animation. `steps` is signed for a walk around the board and 0
   * for a jump — a card teleport, or being sent to jail. The broadcast is purely
   * presentational; the position in the synced state remains the authority.
   */
  private setPosition(player: Player, to: number, steps: number) {
    const from = player.position;
    player.position = to;
    if (from !== to) {
      this.broadcast("move", { playerId: player.id, from, to, steps });
    }
  }

  private advancePlayer(player: Player, steps: number) {
    // Follows `next` pointers around the board ring; passedGo is reported by the
    // walk itself rather than inferred from comparing index numbers.
    const result = move(player.position, steps);
    if (result.passedGo) {
      player.money += GO_SALARY;
      this.log(`${player.name} passed GO and collected £${GO_SALARY}.`);
    }
    this.setPosition(player, result.landedOn, steps);
    this.resolveTile(player, steps);
  }

  /** Jump straight to a tile (cards), optionally paying salary if GO is passed. */
  private teleport(player: Player, tile: number, collectGo: boolean) {
    if (collectGo && tile < player.position) {
      player.money += GO_SALARY;
      this.log(`${player.name} passed GO and collected £${GO_SALARY}.`);
    }
    this.setPosition(player, tile, 0);
    this.resolveTile(player, this.state.die1 + this.state.die2);
  }

  private sendToJail(player: Player) {
    this.setPosition(player, JAIL_INDEX, 0);
    player.inJail = true;
    player.jailTurns = 0;
    this.state.doubles = 0;
  }

  private resolveTile(player: Player, diceTotal: number) {
    const tile = BOARD[player.position];
    this.log(`${player.name} landed on ${tile.name}.`);
    this.state.phase = "acting";

    switch (tile.kind) {
      case "gotojail":
        this.sendToJail(player);
        this.log(`${player.name} was sent to jail.`);
        return;

      case "tax":
        this.charge(player.id, tile.tax ?? 0, "");
        this.log(`${player.name} paid £${tile.tax} in tax.`);
        return;

      case "chance":
        return this.drawCard(player, "chance");

      case "chest":
        return this.drawCard(player, "chest");

      case "street":
      case "station":
      case "utility": {
        const prop = this.state.properties.get(String(player.position))!;
        if (!prop.ownerId) {
          if (player.money >= (tile.price ?? 0)) {
            this.state.pendingPurchase = player.position;
            this.state.phase = "deciding";
          } else {
            this.log(`${player.name} cannot afford ${tile.name}.`);
          }
          return;
        }
        if (prop.ownerId === player.id || prop.mortgaged) return;

        const rent = rentFor(this.state, player.position, diceTotal);
        if (rent > 0) {
          this.charge(player.id, rent, prop.ownerId);
          this.log(`${player.name} paid £${rent} rent to ${this.name(prop.ownerId)}.`);
        }
        return;
      }

      default:
        return; // go, jail (just visiting), free parking
    }
  }

  // ---------------------------------------------------------------- cards

  private drawCard(player: Player, deck: "chance" | "chest") {
    const draw = deck === "chance" ? this.chanceDeck : this.chestDeck;
    const discard = deck === "chance" ? this.chanceDiscard : this.chestDiscard;

    // Draw pile exhausted: turn the discard stack over, shuffle it, and refill.
    if (draw.isEmpty()) {
      const recycled: Card[] = [];
      while (!discard.isEmpty()) recycled.push(discard.pop()!);
      for (const card of shuffle(recycled)) draw.enqueue(card);
    }

    const card = draw.dequeue()!;
    discard.push(card);

    this.broadcast("card", { deck, playerId: player.id, text: card.text });
    this.log(`${player.name}: ${card.text}`);
    card.effect(this.effectsFor(player));
  }

  private effectsFor(player: Player): CardEffects {
    return {
      moveTo: (tile, collectGo) => this.teleport(player, tile, collectGo),
      moveBy: (delta) => {
        const to = delta < 0
          ? moveBackwards(player.position, -delta)
          : move(player.position, delta).landedOn;
        this.setPosition(player, to, delta);
        this.resolveTile(player, this.state.die1 + this.state.die2);
      },
      gain: (amount) => { player.money += amount; },
      pay: (amount) => this.charge(player.id, amount, ""),
      payEachPlayer: (amount) => {
        this.state.players.forEach((other) => {
          if (other.id !== player.id && !other.bankrupt) this.charge(player.id, amount, other.id);
        });
      },
      collectFromEachPlayer: (amount) => {
        this.state.players.forEach((other) => {
          if (other.id !== player.id && !other.bankrupt) this.charge(other.id, amount, player.id);
        });
      },
      goToJail: () => this.sendToJail(player),
      grantJailCard: () => { player.jailCards++; },
      repairs: (perHouse, perHotel) => {
        const { houses, hotels } = houseAndHotelCount(this.state, player.id);
        this.charge(player.id, houses * perHouse + hotels * perHotel, "");
      },
    };
  }

  // ---------------------------------------------------------------- money

  /**
   * Move money from one player to a creditor ("" = the bank). Balances are allowed to go
   * negative: the debtor then has to raise cash before they can roll or end their turn.
   */
  private charge(debtorId: string, amount: number, creditorId: string) {
    if (amount <= 0) return;
    const debtor = this.state.players.get(debtorId);
    if (!debtor || debtor.bankrupt) return;

    debtor.money -= amount;
    if (creditorId) {
      const creditor = this.state.players.get(creditorId);
      if (creditor) creditor.money += amount;
    }

    if (debtor.money < 0) {
      if (netWorth(this.state, debtorId) < 0) {
        this.log(`${debtor.name} cannot cover £${-debtor.money} and is bankrupt.`);
        this.bankrupt(debtorId, creditorId);
      } else {
        this.log(`${debtor.name} owes £${-debtor.money} and must raise cash.`);
      }
    }
  }

  private bankrupt(playerId: string, creditorId: string) {
    const player = this.state.players.get(playerId);
    if (!player || player.bankrupt) return;
    player.bankrupt = true;
    player.inJail = false;

    // Houses always go back to the bank at half price first.
    this.state.properties.forEach((prop) => {
      if (prop.ownerId !== playerId) return;
      if (prop.houses > 0) {
        player.money += prop.houses * Math.floor((BOARD[prop.tile].houseCost ?? 0) / 2);
        prop.houses = 0;
      }
      prop.ownerId = creditorId; // "" hands it back to the bank
      if (creditorId) prop.mortgaged = prop.mortgaged; // mortgages carry over to the new owner
      else prop.mortgaged = false;
    });

    const creditor = creditorId ? this.state.players.get(creditorId) : undefined;
    if (creditor && player.money > 0) creditor.money += player.money;
    player.money = 0;
    this.turnQueue.remove((id) => id === playerId);
    this.clearTradesFor(playerId);
    this.log(`${player.name} is out of the game.`);

    // Advance the turn if the bankrupt player was holding it, then ALWAYS check
    // for a winner. Previously nextTurn() short-circuited this: it found the one
    // remaining player, set the phase back to "rolling", and the game never ended.
    if (this.state.currentPlayerId === playerId) this.nextTurn();
    this.checkForWinner();
  }

  private checkForWinner() {
    if (this.state.phase === "lobby" || this.state.phase === "ended") return;

    const alive = [...this.state.players.values()].filter((p) => !p.bankrupt);
    if (alive.length === 1) {
      this.state.phase = "ended";
      this.state.winnerId = alive[0].id;
      this.log(`${alive[0].name} wins.`);
      this.recordResult(alive[0]);
    } else if (alive.length === 0) {
      // Should be unreachable, but ending with no winner beats hanging forever.
      this.state.phase = "ended";
      this.log("Everyone is bankrupt. No winner.");
    }
  }

  /**
   * Write the finished game to the leaderboard file.
   *
   * Final standings are ranked with bubble sort: at most 6 entries, sorted once,
   * where the O(n^2) cost is irrelevant next to the file write that follows.
   */
  private recordResult(winner: Player) {
    const standings = bubbleSort(
      [...this.state.players.values()].map((p) => ({
        name: p.name,
        netWorth: p.bankrupt ? 0 : netWorth(this.state, p.id),
      })),
      (a, b) => b.netWorth - a.netWorth,
    );

    this.leaderboard.recordMatch({
      playedAt: new Date().toISOString(),
      roomCode: this.state.roomCode,
      winner: winner.name,
      standings,
    });
  }

  // ---------------------------------------------------------------- player actions

  private handleBuy(client: Client) {
    const player = this.requireTurn(client, ["deciding"]);
    if (!player) return;
    const tile = this.state.pendingPurchase;
    const def = BOARD[tile];
    const prop = this.state.properties.get(String(tile));
    if (tile < 0 || !prop || prop.ownerId) return this.deny(client, "Nothing to buy.");
    if (player.money < (def.price ?? 0)) return this.deny(client, "You cannot afford that.");

    player.money -= def.price ?? 0;
    prop.ownerId = player.id;
    this.state.pendingPurchase = -1;
    this.state.phase = "acting";
    this.log(`${player.name} bought ${def.name} for £${def.price}.`);
  }

  private handleDecline(client: Client) {
    const player = this.requireTurn(client, ["deciding"]);
    if (!player) return;
    // No auction implemented yet: the property simply stays with the bank.
    this.log(`${player.name} declined ${BOARD[this.state.pendingPurchase]?.name}.`);
    this.state.pendingPurchase = -1;
    this.state.phase = "acting";
  }

  private handlePayFine(client: Client) {
    const player = this.requireTurn(client, ["rolling"]);
    if (!player) return;
    if (!player.inJail) return this.deny(client, "You are not in jail.");

    if (player.jailCards > 0) {
      player.jailCards--;
      this.log(`${player.name} used a Get Out of Jail Free card.`);
    } else {
      if (player.money < JAIL_FINE) return this.deny(client, "You cannot afford the fine.");
      this.charge(player.id, JAIL_FINE, "");
      this.log(`${player.name} paid the £${JAIL_FINE} fine.`);
    }
    player.inJail = false;
    player.jailTurns = 0;
  }

  private handleBuild(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const error = buildError(this.state, player.id, tile);
    if (error) return this.deny(client, error);

    const prop = this.state.properties.get(String(tile))!;
    player.money -= BOARD[tile].houseCost ?? 0;
    prop.houses++;
    this.log(`${player.name} built on ${BOARD[tile].name} (now ${prop.houses === 5 ? "a hotel" : prop.houses + " house(s)"}).`);
  }

  private handleSell(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const error = sellError(this.state, player.id, tile);
    if (error) return this.deny(client, error);

    const prop = this.state.properties.get(String(tile))!;
    prop.houses--;
    player.money += Math.floor((BOARD[tile].houseCost ?? 0) / 2);
    this.log(`${player.name} sold a house on ${BOARD[tile].name}.`);
  }

  private handleMortgage(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    const prop = this.state.properties.get(String(tile));
    if (!player || !prop) return;
    if (prop.ownerId !== player.id) return this.deny(client, "You do not own that.");
    if (prop.mortgaged) return this.deny(client, "Already mortgaged.");
    if (prop.houses > 0) return this.deny(client, "Sell the houses first.");

    prop.mortgaged = true;
    player.money += mortgageValue(tile);
    this.log(`${player.name} mortgaged ${BOARD[tile].name} for £${mortgageValue(tile)}.`);
  }

  private handleUnmortgage(client: Client, tile: number) {
    const player = this.state.players.get(client.sessionId);
    const prop = this.state.properties.get(String(tile));
    if (!player || !prop) return;
    if (prop.ownerId !== player.id) return this.deny(client, "You do not own that.");
    if (!prop.mortgaged) return this.deny(client, "That is not mortgaged.");
    const cost = unmortgageCost(tile);
    if (player.money < cost) return this.deny(client, "You cannot afford to lift the mortgage.");

    prop.mortgaged = false;
    player.money -= cost;
    this.log(`${player.name} lifted the mortgage on ${BOARD[tile].name} for £${cost}.`);
  }

  private handleBankruptcyRequest(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.bankrupt) return;
    if (player.money >= 0) return this.deny(client, "You are not in debt.");
    this.bankrupt(player.id, "");
  }

  // ---------------------------------------------------------------- trading

  private nextTradeId = 1;

  private handleProposeTrade(client: Client, msg: {
    toId: string; offerTiles: number[]; requestTiles: number[];
    offerMoney: number; requestMoney: number;
  }) {
    const proposer = this.playerIndex.get(client.sessionId);
    if (!proposer) return;
    if (this.state.phase === "lobby" || this.state.phase === "ended") {
      return this.deny(client, "You can only trade during a game.");
    }

    // Never trust the shape of an incoming message: it arrives as JSON from a
    // client we do not control, so coerce it before the rules ever see it.
    const from: TradeSide = {
      playerId: proposer.id,
      tiles: toTileList(msg?.offerTiles),
      money: Math.floor(Number(msg?.offerMoney) || 0),
    };
    const to: TradeSide = {
      playerId: String(msg?.toId ?? ""),
      tiles: toTileList(msg?.requestTiles),
      money: Math.floor(Number(msg?.requestMoney) || 0),
    };

    const error = tradeError(this.state, from, to);
    if (error) return this.deny(client, error);

    // One open offer per pair at a time, so a player cannot be buried in offers.
    const existing = [...this.state.trades.values()].find(
      (t) => (t.fromId === from.playerId && t.toId === to.playerId) ||
             (t.fromId === to.playerId && t.toId === from.playerId));
    if (existing) return this.deny(client, "There is already an offer open with that player.");

    const trade = new Trade();
    trade.id = `t${this.nextTradeId++}`;
    trade.fromId = from.playerId;
    trade.toId = to.playerId;
    for (const t of from.tiles) trade.offerTiles.push(t);
    for (const t of to.tiles) trade.requestTiles.push(t);
    trade.offerMoney = from.money;
    trade.requestMoney = to.money;
    this.state.trades.set(trade.id, trade);

    this.log(`${proposer.name} offered ${this.name(to.playerId)} a trade.`);
  }

  private handleAcceptTrade(client: Client, tradeId: string) {
    const trade = this.state.trades.get(String(tradeId ?? ""));
    if (!trade) return this.deny(client, "That offer is no longer open.");
    if (trade.toId !== client.sessionId) return this.deny(client, "That offer was not made to you.");

    const from: TradeSide = {
      playerId: trade.fromId,
      tiles: [...trade.offerTiles],
      money: trade.offerMoney,
    };
    const to: TradeSide = {
      playerId: trade.toId,
      tiles: [...trade.requestTiles],
      money: trade.requestMoney,
    };

    // Re-validate: the proposer may have spent the cash or built on a property
    // in the time the offer sat open.
    const error = tradeError(this.state, from, to);
    if (error) {
      this.state.trades.delete(trade.id);
      return this.deny(client, `That offer is no longer valid — ${error}`);
    }

    const proposer = this.playerIndex.get(trade.fromId)!;
    const recipient = this.playerIndex.get(trade.toId)!;

    for (const tile of from.tiles) this.state.properties.get(String(tile))!.ownerId = recipient.id;
    for (const tile of to.tiles) this.state.properties.get(String(tile))!.ownerId = proposer.id;
    proposer.money += to.money - from.money;
    recipient.money += from.money - to.money;

    this.state.trades.delete(trade.id);
    this.log(`${recipient.name} accepted ${proposer.name}'s trade.`);
  }

  private handleTradeRefusal(client: Client, tradeId: string, verb: "rejected" | "withdrew") {
    const trade = this.state.trades.get(String(tradeId ?? ""));
    if (!trade) return;
    const allowed = verb === "rejected" ? trade.toId : trade.fromId;
    if (allowed !== client.sessionId) return this.deny(client, "That offer is not yours to close.");

    this.state.trades.delete(trade.id);
    this.log(verb === "rejected"
      ? `${this.name(trade.toId)} rejected ${this.name(trade.fromId)}'s trade.`
      : `${this.name(trade.fromId)} withdrew a trade offer.`);
  }

  /**
   * Type-ahead for the trade screen, answered from the BST index in BoardGraph:
   * an exact-name hit first, otherwise every property starting with the query,
   * already in alphabetical order from the tree's in-order traversal.
   */
  private handleSearchProperty(client: Client, query: string) {
    const q = String(query ?? "").trim();
    if (q.length === 0) return client.send("propertyResults", { tiles: [] });

    const exact = findByName(q);
    const tiles = exact ? [exact.index] : searchByPrefix(q).map((t) => t.index);
    client.send("propertyResults", { tiles: tiles.slice(0, 12) });
  }

  /** Drop any offers involving a player who has left or gone bankrupt. */
  private clearTradesFor(playerId: string) {
    for (const trade of [...this.state.trades.values()]) {
      if (trade.fromId === playerId || trade.toId === playerId) {
        this.state.trades.delete(trade.id);
      }
    }
  }

  // ---------------------------------------------------------------- helpers

  /** O(1) average through the hash table rather than the network schema map. */
  private name(id: string): string {
    return this.playerIndex.get(id)?.name ?? "the bank";
  }

  private log(line: string) {
    this.state.log.push(line);
    while (this.state.log.length > 40) this.state.log.shift();
  }
}

/** Coerce an untrusted array of board indices into whole numbers in range. */
function toTileList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((v) => Math.floor(Number(v)))
    .filter((n) => Number.isInteger(n) && n >= 0 && n < 40)
    .slice(0, 28);
}
