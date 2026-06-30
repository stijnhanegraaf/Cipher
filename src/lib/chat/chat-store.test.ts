/**
 * Pure reducer tests for chatReducer.
 *
 * Coverage:
 *  1. SEND_START — initializes the in-flight partial turn.
 *  2. TOKEN — appends to the partial text.
 *  3. CITATION — accumulates citations.
 *  4. ENVELOPE — sets the partial envelope.
 *  5. DONE — finalizes the turn (text + citations move to turns[]).
 *  6. ERROR then DONE — finalizes with error status.
 *  7. NET_ERROR — finalizes with unknown error (no DONE follows).
 *  8. NEW_CHAT — clears all state.
 *  9. HYDRATE — restores turns without touching partial state.
 */

import { describe, it, expect } from "vitest";
import { chatReducer, type ChatStoreState, type ChatAction } from "./chat-store";
import type { QATurn, QATurnCitation } from "@/components/chat/QACard";

// Helper: build a minimal initial state.
const BASE: ChatStoreState = {
  turns: [],
  streaming: false,
  partial: "",
  partialId: null,
  partialQuery: null,
  partialCreatedAt: null,
  partialCitations: [],
  partialEnvelope: null,
  partialError: null,
  error: null,
};

const AFTER_START: ChatStoreState = chatReducer(BASE, {
  type: "SEND_START",
  id: "t_1",
  query: "What is Cipher?",
  createdAt: 1000,
});

describe("chatReducer — SEND_START", () => {
  it("sets streaming to true", () => {
    expect(AFTER_START.streaming).toBe(true);
  });

  it("records the partial id, query, createdAt", () => {
    expect(AFTER_START.partialId).toBe("t_1");
    expect(AFTER_START.partialQuery).toBe("What is Cipher?");
    expect(AFTER_START.partialCreatedAt).toBe(1000);
  });

  it("resets partial text and citations", () => {
    expect(AFTER_START.partial).toBe("");
    expect(AFTER_START.partialCitations).toEqual([]);
  });

  it("clears any prior error", () => {
    const withError: ChatStoreState = { ...BASE, error: "old error" };
    const next = chatReducer(withError, { type: "SEND_START", id: "t_2", query: "q", createdAt: 0 });
    expect(next.error).toBeNull();
  });
});

describe("chatReducer — TOKEN", () => {
  it("appends token to partial text", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "TOKEN", text: "Hello" });
    s = chatReducer(s, { type: "TOKEN", text: " world" });
    expect(s.partial).toBe("Hello world");
  });

  it("does not affect turns", () => {
    const s = chatReducer(AFTER_START, { type: "TOKEN", text: "hi" });
    expect(s.turns).toHaveLength(0);
  });
});

describe("chatReducer — CITATION", () => {
  it("accumulates citations in order", () => {
    const cit1: QATurnCitation = { id: 1, path: "/a.md", snippet: "snip a" };
    const cit2: QATurnCitation = { id: 2, path: "/b.md", snippet: "snip b" };
    let s = AFTER_START;
    s = chatReducer(s, { type: "CITATION", citation: cit1 });
    s = chatReducer(s, { type: "CITATION", citation: cit2 });
    expect(s.partialCitations).toEqual([cit1, cit2]);
  });
});

describe("chatReducer — DONE (success)", () => {
  it("moves the partial turn into turns[]", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "TOKEN", text: "answer" });
    const cit: QATurnCitation = { id: 1, path: "/a.md", snippet: "s" };
    s = chatReducer(s, { type: "CITATION", citation: cit });
    s = chatReducer(s, { type: "DONE" });

    expect(s.turns).toHaveLength(1);
    const turn = s.turns[0] as QATurn;
    expect(turn.id).toBe("t_1");
    expect(turn.query).toBe("What is Cipher?");
    expect(turn.text).toBe("answer");
    expect(turn.citations).toEqual([cit]);
    expect(turn.status).toBe("done");
    expect(turn.error).toBeUndefined();
  });

  it("clears partial state after DONE", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "TOKEN", text: "text" });
    s = chatReducer(s, { type: "DONE" });

    expect(s.streaming).toBe(false);
    expect(s.partial).toBe("");
    expect(s.partialId).toBeNull();
    expect(s.partialQuery).toBeNull();
    expect(s.partialCreatedAt).toBeNull();
    expect(s.partialCitations).toEqual([]);
  });

  it("DONE on already-finalized state is a no-op (no partialId)", () => {
    const s = chatReducer(BASE, { type: "DONE" });
    expect(s.streaming).toBe(false);
    expect(s.turns).toHaveLength(0);
  });
});

describe("chatReducer — ERROR then DONE", () => {
  it("sets partialError (streaming still true) on ERROR", () => {
    const s = chatReducer(AFTER_START, {
      type: "ERROR",
      code: "needs-indexing",
      message: "Index the vault first.",
    });
    expect(s.partialError).toEqual({ code: "needs-indexing", message: "Index the vault first." });
    expect(s.streaming).toBe(true); // not finalized yet
  });

  it("finalizes the turn with error status on DONE", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "ERROR", code: "needs-indexing", message: "Index!" });
    s = chatReducer(s, { type: "DONE" });

    expect(s.turns).toHaveLength(1);
    const turn = s.turns[0] as QATurn;
    expect(turn.status).toBe("error");
    expect(turn.error).toEqual({ code: "needs-indexing", message: "Index!" });
    expect(s.streaming).toBe(false);
    expect(s.partialError).toBeNull();
  });
});

describe("chatReducer — NET_ERROR", () => {
  it("finalizes the in-flight turn with an unknown error", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "TOKEN", text: "partial" });
    s = chatReducer(s, { type: "NET_ERROR", message: "Something went wrong." });

    expect(s.turns).toHaveLength(1);
    const turn = s.turns[0] as QATurn;
    expect(turn.status).toBe("error");
    expect(turn.error?.code).toBe("unknown");
    expect(turn.text).toBe("partial"); // accumulated text preserved
    expect(s.streaming).toBe(false);
    expect(s.error).toBe("Something went wrong.");
  });

  it("NET_ERROR without in-flight turn only sets error field", () => {
    const s = chatReducer(BASE, { type: "NET_ERROR", message: "oops" });
    expect(s.turns).toHaveLength(0);
    expect(s.streaming).toBe(false);
    expect(s.error).toBe("oops");
  });
});

describe("chatReducer — NEW_CHAT", () => {
  it("clears all state (turns, partial, streaming, error)", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "TOKEN", text: "some" });
    // Add a completed turn too
    const withTurn: ChatStoreState = {
      ...s,
      turns: [{ id: "t_0", query: "q", createdAt: 0, text: "a", citations: [], status: "done" }],
      error: "old-err",
    };
    const cleared = chatReducer(withTurn, { type: "NEW_CHAT" });

    expect(cleared.turns).toHaveLength(0);
    expect(cleared.streaming).toBe(false);
    expect(cleared.partial).toBe("");
    expect(cleared.partialId).toBeNull();
    expect(cleared.error).toBeNull();
  });
});

describe("chatReducer — HYDRATE", () => {
  it("restores turns without touching in-flight partial state", () => {
    // Start a stream first
    let s = AFTER_START;
    s = chatReducer(s, { type: "TOKEN", text: "streaming…" });

    const storedTurns: QATurn[] = [
      { id: "old_1", query: "q1", createdAt: 100, text: "a1", citations: [], status: "done" },
    ];
    const hydrated = chatReducer(s, { type: "HYDRATE", turns: storedTurns });

    expect(hydrated.turns).toEqual(storedTurns);
    // In-flight partial untouched
    expect(hydrated.streaming).toBe(true);
    expect(hydrated.partial).toBe("streaming…");
    expect(hydrated.partialId).toBe("t_1");
  });
});

describe("chatReducer — HISTORY_CAP (50)", () => {
  it("slices turns to last 50 on DONE", () => {
    // Build a state with 50 existing turns
    const existingTurns: QATurn[] = Array.from({ length: 50 }, (_, i) => ({
      id: `old_${i}`,
      query: `q${i}`,
      createdAt: i,
      text: `a${i}`,
      citations: [],
      status: "done" as const,
    }));
    const s: ChatStoreState = {
      ...AFTER_START,
      turns: existingTurns,
    };
    const withToken = chatReducer(s, { type: "TOKEN", text: "new" });
    const done = chatReducer(withToken, { type: "DONE" });

    expect(done.turns).toHaveLength(50);
    // The oldest turn should have been dropped
    expect(done.turns[0]?.id).toBe("old_1");
    expect(done.turns[49]?.id).toBe("t_1");
  });
});

describe("chatReducer — ENVELOPE", () => {
  // Use a type cast so we can test reducer behaviour without importing the
  // full ResponseEnvelope shape (which requires ViewType / ViewData sub-types).
  const fakeEnvelope = { version: "v1" } as unknown as NonNullable<QATurn["envelope"]>;

  it("sets the partialEnvelope", () => {
    const s = chatReducer(AFTER_START, { type: "ENVELOPE", envelope: fakeEnvelope });
    expect(s.partialEnvelope).toBe(fakeEnvelope);
  });

  it("envelope is included in finalized turn", () => {
    let s = AFTER_START;
    s = chatReducer(s, { type: "ENVELOPE", envelope: fakeEnvelope });
    s = chatReducer(s, { type: "DONE" });
    expect(s.turns[0]?.envelope).toBe(fakeEnvelope);
  });
});

// ── Type-safety: ChatAction covers all action types ────────────────────────────

const _exhaustiveCheck: ChatAction = { type: "NEW_CHAT" };
void _exhaustiveCheck; // suppress "unused" warning
