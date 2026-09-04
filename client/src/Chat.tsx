import { useEffect, useRef, useState } from "react";
import { CHAT_MAX_LENGTH } from "@shared/chat";
import type { Snapshot } from "./types";

/**
 * Room chat. The messages live in the synced state, so this is only a view over
 * them plus a box to add one — there is no local list to keep in step, and a
 * refresh mid-game comes back with the conversation intact.
 */
export function Chat({ state, selfId, send }: {
  state: Snapshot;
  selfId: string;
  send: (type: string, payload?: unknown) => void;
}) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const count = state.chat.length;

  // Follow the conversation, but only when the reader is already at the bottom:
  // scrolling up to re-read something should not be yanked away by a new message.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [count]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    send("chat", { text });
    // Cleared straight away rather than on an acknowledgement: the server may
    // reject this one for arriving too soon, and holding the box hostage to a
    // round trip makes a laggy connection feel broken.
    setDraft("");
  };

  return (
    <section className="chat">
      <h3>Chat</h3>

      <div className="chat-lines" ref={listRef}>
        {state.chat.length === 0 && <p className="muted chat-empty">Say something.</p>}
        {state.chat.map((line, i) => (
          <div key={i} className={`chat-line${line.id === selfId ? " mine" : ""}`}>
            <span className="chat-who" style={{ color: state.players[line.id]?.colour }}>
              {line.name}
            </span>
            {/* React escapes this, so a message cannot inject markup. */}
            <span className="chat-text">{line.text}</span>
          </div>
        ))}
      </div>

      <form className="chat-box" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          placeholder="Message the room…"
          aria-label="Chat message"
        />
        <button type="submit" disabled={!draft.trim()}>Send</button>
      </form>
    </section>
  );
}
