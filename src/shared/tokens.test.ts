import { test } from "node:test";
import assert from "node:assert/strict";
import { TOKENS, firstFreeToken, isTokenId, tokenGlyph } from "./tokens";

test("there are at least as many pieces as the room allows players", () => {
  // MonopolyRoom sets maxClients = 6; fewer pieces would leave someone without one.
  assert.ok(TOKENS.length >= 6);
});

test("piece ids are unique", () => {
  const ids = TOKENS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("isTokenId accepts real pieces and rejects anything else", () => {
  assert.equal(isTokenId("hat"), true);
  assert.equal(isTokenId("spaceship"), false);
  assert.equal(isTokenId(""), false);
});

test("firstFreeToken skips pieces that are taken", () => {
  assert.equal(firstFreeToken([]), TOKENS[0].id);
  assert.equal(firstFreeToken([TOKENS[0].id]), TOKENS[1].id);
  assert.equal(firstFreeToken([TOKENS[0].id, TOKENS[1].id]), TOKENS[2].id);
});

test("firstFreeToken still returns a piece when every one is taken", () => {
  // Cannot happen while maxClients matches TOKENS.length, but the caller assigns
  // unconditionally, so it must never hand back undefined.
  const all = TOKENS.map((t) => t.id);
  assert.ok(isTokenId(firstFreeToken(all)));
});

test("tokenGlyph falls back rather than rendering nothing", () => {
  assert.equal(tokenGlyph("hat"), "🎩");
  assert.equal(tokenGlyph("no-such-piece"), "●");
});
