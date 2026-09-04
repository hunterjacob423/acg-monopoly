/**
 * Cleaning for player chat.
 *
 * Kept here as a pure function rather than inline in the room so it can be
 * tested without a network, and so there is exactly one place that decides what
 * a message may contain. Everything a client sends is untrusted: the text is
 * typed by a person, but nothing stops a modified client sending a megabyte of
 * newlines, or characters that would disturb everyone else's chat panel.
 */

/** Longest message kept. Longer ones are cut rather than refused. */
export const CHAT_MAX_LENGTH = 200;

/** Shortest gap between one player's messages, in milliseconds. */
export const CHAT_MIN_GAP_MS = 600;

/**
 * Characters that are not text: C0 and C1 control codes, the zero-width and
 * bidirectional-override marks, and the byte-order mark. They render as nothing
 * at all, but can hide text or visually reverse the text around them, so a
 * message could read one way in the chat panel and another in the source.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/**
 * Returns the message as it should be stored, or "" if there is nothing worth
 * storing. All whitespace collapses to single spaces, so one message stays one
 * line however it was typed — otherwise a player could push everyone else's
 * chat off the screen with newlines.
 *
 * Deliberately NOT a word filter. Nothing here judges what a message says; that
 * is for whoever is running the room, who can see every message.
 */
export function cleanChatText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(INVISIBLE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}
