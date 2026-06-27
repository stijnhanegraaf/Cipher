"use client";

/**
 * chat-store.tsx — global chat store (context provider + useChat hook).
 *
 * Owns the conversation + the in-flight NDJSON stream + AbortController.
 * Mounted above the router in AppShell so the store outlives the /chat page.
 * The stream keeps writing to the store after navigation; the /chat page
 * re-attaches on return by reading the live partial state.
 *
 * Persistence: localStorage `cipher-chat-history-v2`.
 * SSR-safe: never read in render or useState initializer — hydrated post-mount.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type { QATurn, QATurnCitation } from "@/components/chat/QACard";
import { log } from "@/lib/log";

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "cipher-chat-history-v2";
const HISTORY_CAP = 50;

// ── State ─────────────────────────────────────────────────────────────────────

export interface ChatStoreState {
  /** Finalized turns (status: done | error). */
  turns: QATurn[];
  /** Whether a stream is currently in flight. */
  streaming: boolean;
  /** Accumulated text of the in-flight answer. */
  partial: string;
  partialId: string | null;
  partialQuery: string | null;
  partialCreatedAt: number | null;
  partialCitations: QATurnCitation[];
  partialEnvelope: QATurn["envelope"] | null;
  /**
   * Pending error from an in-stream `error` event.
   * Not yet finalized — the API always follows `error` with `done`.
   */
  partialError: { code: string; message: string } | null;
  /** Network-level (fetch) error message. Cleared on next send/newChat. */
  error: string | null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export type ChatAction =
  | { type: "SEND_START"; id: string; query: string; createdAt: number }
  | { type: "TOKEN"; text: string }
  | { type: "CITATION"; citation: QATurnCitation }
  | { type: "ENVELOPE"; envelope: QATurn["envelope"] }
  | { type: "DONE" }
  | { type: "ERROR"; code: string; message: string }
  | { type: "NET_ERROR"; message: string }
  | { type: "NEW_CHAT" }
  | { type: "HYDRATE"; turns: QATurn[] };

const INITIAL_STATE: ChatStoreState = {
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

// ── Pure reducer (exported for unit tests) ────────────────────────────────────

export function chatReducer(
  state: ChatStoreState,
  action: ChatAction
): ChatStoreState {
  switch (action.type) {
    case "SEND_START":
      return {
        ...state,
        streaming: true,
        partial: "",
        partialId: action.id,
        partialQuery: action.query,
        partialCreatedAt: action.createdAt,
        partialCitations: [],
        partialEnvelope: null,
        partialError: null,
        error: null,
      };

    case "TOKEN":
      return { ...state, partial: state.partial + action.text };

    case "CITATION":
      return {
        ...state,
        partialCitations: [...state.partialCitations, action.citation],
      };

    case "ENVELOPE":
      return { ...state, partialEnvelope: action.envelope };

    case "ERROR":
      // Pending error — DONE follows and finalizes the turn with this error.
      return {
        ...state,
        partialError: { code: action.code, message: action.message },
      };

    case "DONE": {
      if (!state.partialId) return { ...state, streaming: false };
      const finalTurn: QATurn = {
        id: state.partialId,
        query: state.partialQuery ?? "",
        createdAt: state.partialCreatedAt ?? Date.now(),
        text: state.partial,
        citations: state.partialCitations,
        envelope: state.partialEnvelope ?? undefined,
        status: state.partialError ? "error" : "done",
        error: state.partialError ?? undefined,
      };
      return {
        ...state,
        turns: [...state.turns, finalTurn].slice(-HISTORY_CAP),
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
    }

    case "NET_ERROR": {
      // Network-level failure: finalize the in-flight turn with an error.
      if (!state.partialId) {
        return { ...state, streaming: false, error: action.message };
      }
      const errorTurn: QATurn = {
        id: state.partialId,
        query: state.partialQuery ?? "",
        createdAt: state.partialCreatedAt ?? Date.now(),
        text: state.partial,
        citations: state.partialCitations,
        status: "error",
        error: { code: "unknown", message: action.message },
      };
      return {
        ...state,
        turns: [...state.turns, errorTurn].slice(-HISTORY_CAP),
        streaming: false,
        partial: "",
        partialId: null,
        partialQuery: null,
        partialCreatedAt: null,
        partialCitations: [],
        partialEnvelope: null,
        partialError: null,
        error: action.message,
      };
    }

    case "NEW_CHAT":
      return { ...INITIAL_STATE };

    case "HYDRATE":
      return { ...state, turns: action.turns };

    default:
      return state;
  }
}

// ── Persistence helpers ───────────────────────────────────────────────────────

interface StoredTurn {
  id: string;
  query: string;
  createdAt: number;
  text: string;
  citations: QATurnCitation[];
  error?: { code: string; message: string };
  envelopeJson?: string;
}

interface StoredConversation {
  turns: StoredTurn[];
  /** Partial in-flight turn at the time of last persist. On reload it is
   *  shown as a completed turn (the stream itself won't resume). */
  partial?: {
    id: string;
    query: string;
    createdAt: number;
    text: string;
    citations: QATurnCitation[];
  };
}

function serializeTurn(t: QATurn): StoredTurn {
  return {
    id: t.id,
    query: t.query,
    createdAt: t.createdAt,
    text: t.text,
    citations: t.citations,
    error: t.error,
    envelopeJson: t.envelope ? JSON.stringify(t.envelope) : undefined,
  };
}

function deserializeTurn(s: StoredTurn): QATurn {
  return {
    id: s.id,
    query: s.query,
    createdAt: s.createdAt,
    text: s.text,
    citations: s.citations,
    status: s.error ? "error" : "done",
    error: s.error,
    envelope: s.envelopeJson
      ? (JSON.parse(s.envelopeJson) as QATurn["envelope"])
      : undefined,
  };
}

function persistState(state: ChatStoreState): void {
  // Don't overwrite stored history with an empty snapshot. The first post-mount
  // render holds INITIAL_STATE (empty) before HYDRATE runs; persisting it here
  // would clobber the saved conversation for a tick. newChat() clears storage
  // explicitly via removeItem, so skipping the empty write loses nothing.
  if (state.turns.length === 0 && !state.streaming && !state.error && !state.partialId) return;
  try {
    const stored: StoredConversation = {
      turns: state.turns.map(serializeTurn),
    };
    // Persist partial if a stream is in flight, so a page-reload shows the
    // accumulated text as the last answer (stream won't resume after reload).
    if (state.streaming && state.partialId && state.partialQuery) {
      stored.partial = {
        id: state.partialId,
        query: state.partialQuery,
        createdAt: state.partialCreatedAt ?? Date.now(),
        text: state.partial,
        citations: state.partialCitations,
      };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    log.warn("chat-store", "persist failed", err);
  }
}

function loadState(): QATurn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredConversation;
    const turns = (stored.turns ?? []).map(deserializeTurn);
    // Restore the partial turn from a previous session as a completed turn.
    if (stored.partial && stored.partial.text) {
      turns.push({
        id: stored.partial.id,
        query: stored.partial.query,
        createdAt: stored.partial.createdAt,
        text: stored.partial.text,
        citations: stored.partial.citations,
        status: "done",
      });
    }
    return turns;
  } catch (err) {
    log.warn("chat-store", "hydrate failed", err);
    return [];
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface ChatContextValue {
  /** Finalized turns (status: done | error). */
  turns: QATurn[];
  /** Whether a stream is currently in flight. */
  streaming: boolean;
  /** Accumulated text of the in-flight answer. */
  partial: string;
  partialId: string | null;
  partialQuery: string | null;
  partialCreatedAt: number | null;
  partialCitations: QATurnCitation[];
  partialEnvelope: QATurn["envelope"] | null;
  /** Network-level error message (cleared on next send/newChat). */
  error: string | null;
  send: (query: string, model?: string) => void;
  stop: () => void;
  newChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ── Stream event type (matches /api/chat NDJSON output) ───────────────────────

type StreamEvent =
  | { type: "envelope"; envelope: QATurn["envelope"] }
  | { type: "token"; text: string }
  | { type: "citation"; id: number; path: string; heading?: string; snippet: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

// ── Provider ──────────────────────────────────────────────────────────────────

export function ChatStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, INITIAL_STATE);

  // Keep a ref to the latest state so the stable `send` callback can read it
  // without becoming stale or triggering re-creation.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // AbortController for the in-flight fetch (lives outside React state so
  // aborting does not cause a re-render).
  const abortRef = useRef<AbortController | null>(null);

  // Post-mount hydration from localStorage. Empty deps [] is intentional —
  // this runs once on mount to populate from storage (SSR-safe: reading
  // localStorage during render would cause a hydration mismatch).
  useEffect(() => {
    const turns = loadState();
    if (turns.length > 0) {
      dispatch({ type: "HYDRATE", turns });
    }
  }, []);

  // Persist state after every change.
  useEffect(() => {
    persistState(state);
  }, [state]);

  const send = useCallback((query: string, model?: string) => {
    if (!query.trim() || stateRef.current.streaming) return;

    const id = `t_${Date.now()}`;
    const createdAt = Date.now();
    dispatch({ type: "SEND_START", id, query, createdAt });

    // stateRef is render-stale at call time, and SEND_START only touches the
    // streaming/partial fields (never `turns`), so this reads the correct prior
    // context regardless of dispatch ordering.
    const priorHistory = stateRef.current.turns
      .filter((t) => t.status === "done")
      .slice(-4)
      .flatMap((t) => [
        { role: "user" as const, content: t.query },
        { role: "assistant" as const, content: t.text || "" },
      ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    void (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query, history: priorHistory, model }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: StreamEvent;
            try {
              ev = JSON.parse(line) as StreamEvent;
            } catch {
              continue;
            }

            switch (ev.type) {
              case "token":
                dispatch({ type: "TOKEN", text: ev.text });
                break;
              case "citation":
                dispatch({
                  type: "CITATION",
                  citation: {
                    id: ev.id,
                    path: ev.path,
                    heading: ev.heading,
                    snippet: ev.snippet,
                  },
                });
                break;
              case "envelope":
                dispatch({ type: "ENVELOPE", envelope: ev.envelope });
                break;
              case "error":
                dispatch({ type: "ERROR", code: ev.code, message: ev.message });
                break;
              case "done":
                dispatch({ type: "DONE" });
                break;
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User-initiated stop — finalize with whatever was accumulated.
          dispatch({ type: "DONE" });
        } else {
          log.error("chat-store", "stream failed", err);
          dispatch({
            type: "NET_ERROR",
            message: "Something went wrong. Check the server logs.",
          });
        }
      } finally {
        abortRef.current = null;
      }
    })();
  }, []); // stable — reads stateRef for current state

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "NEW_CHAT" });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({
      turns: state.turns,
      streaming: state.streaming,
      partial: state.partial,
      partialId: state.partialId,
      partialQuery: state.partialQuery,
      partialCreatedAt: state.partialCreatedAt,
      partialCitations: state.partialCitations,
      partialEnvelope: state.partialEnvelope,
      error: state.error,
      send,
      stop,
      newChat,
    }),
    [state, send, stop, newChat]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatStoreProvider");
  return ctx;
}
