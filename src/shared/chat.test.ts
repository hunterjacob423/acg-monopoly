import test from "node:test";
import assert from "node:assert/strict";
import { cleanChatText, CHAT_MAX_LENGTH } from "./chat";

test("chat: an ordinary message comes through untouched", () => {
  const said = "Anyone want to trade for Mayfair?";
  assert.equal(cleanChatText(said), said);
});

test("chat: trimmed, and an empty message is nothing", () => {
  assert.equal(cleanChatText("  hello  "), "hello");
  assert.equal(cleanChatText("   "), "");
  assert.equal(cleanChatText(""), "");
});

test("chat: a message stays one line however it was typed", () => {
  // Without this a player could push everyone else's chat off the screen.
  assert.equal(cleanChatText("one\ntwo\r\nthree\tfour"), "one two three four");
  assert.equal(cleanChatText("lots\n\n\n\n\nof\n\n\n\nnewlines"), "lots of newlines");
});

test("chat: invisible and direction-changing characters are stripped", () => {
  // These render as nothing but can hide text, or visually reverse what follows.
  assert.equal(cleanChatText("he\u200Bllo"), "he llo");
  assert.equal(cleanChatText("safe\u202Etxet desrever"), "safe txet desrever");
  assert.equal(cleanChatText("be\u0007ll"), "be ll");
  assert.equal(cleanChatText("\uFEFFhello"), "hello");
});

test("chat: an overlong message is cut, not refused", () => {
  const cleaned = cleanChatText("a".repeat(CHAT_MAX_LENGTH + 500));
  assert.equal(cleaned.length, CHAT_MAX_LENGTH);
});

test("chat: anything that is not a string is nothing", () => {
  // A modified client can send whatever it likes, including no text at all.
  for (const junk of [undefined, null, 42, {}, [], true]) {
    assert.equal(cleanChatText(junk), "", String(junk));
  }
});

test("chat: emoji and accents survive", () => {
  assert.equal(cleanChatText("café \u{1F3A9} déjà vu"), "café \u{1F3A9} déjà vu");
});
