"use client";

/**
 * ChatInterface — shell that owns history state + /api/chat NDJSON
 * consumption. Visual bits live in components/chat/*.
 *
 * Persists turns to localStorage["cipher-chat-history-v1"] (cap 20).
 * Supports /chat?q=<query> deep-link auto-fire.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { Composer, type ComposerHandle } from "@/components/chat/Composer";
import { QACard, type QATurn, type QATurnCitation } from "@/components/chat/QACard";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { log } from "@/lib/log";

const STORAGE_KEY = "cipher-chat-history-v1";
const MODEL_KEY = "cipher-chat-model";
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_CIPHER_CHAT_MODEL || "llama3.2:3b";
const HISTORY_CAP = 20;

interface StoredTurn {
  id: string;
  query: string;
  createdAt: number;
  text: string;
  citations: QATurnCitation[];
  error?: { code: string; message: string };
  /** Envelope intent match — stored but not serialized for simplicity when null. */
  envelopeJson?: string;
}

type StreamEvent =
  | { type: "envelope"; envelope: unknown }
  | { type: "index-progress"; done: number; total: number }
  | { type: "token"; text: string }
  | { type: "citation"; id: number; path: string; heading?: string; snippet: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export function ChatInterface() {
  const [turns, setTurns] = useState<QATurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const composerRef = useRef<ComposerHandle>(null);
  const searchParams = useSearchParams();
  const autoFiredRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY);
      if (saved) setModel(saved);
    } catch { /* ignore */ }
  }, []);

  const selectModel = useCallback((m: string) => {
    setModel(m);
    try { localStorage.setItem(MODEL_KEY, m); } catch { /* ignore */ }
  }, []);

  // ── Hydrate history from localStorage on mount. ─────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredTurn[];
      const hydrated: QATurn[] = stored.map((s) => ({
        id: s.id,
        query: s.query,
        createdAt: s.createdAt,
        text: s.text,
        citations: s.citations,
        status: s.error ? "error" : "done",
        error: s.error,
        envelope: s.envelopeJson ? (JSON.parse(s.envelopeJson) as QATurn["envelope"]) : undefined,
      }));
      setTurns(hydrated);
    } catch (err) {
      log.warn("chat", "history hydrate failed", err);
    }
  }, []);

  // ── Persist on every turn-list change. ──────────────────────────────
  useEffect(() => {
    try {
      const toStore: StoredTurn[] = turns
        .filter((t) => t.status !== "streaming")
        .slice(-HISTORY_CAP)
        .map((t) => ({
          id: t.id,
          query: t.query,
          createdAt: t.createdAt,
          text: t.text,
          citations: t.citations,
          error: t.error,
          envelopeJson: t.envelope ? JSON.stringify(t.envelope) : undefined,
        }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch (err) {
      log.warn("chat", "history persist failed", err);
    }
  }, [turns]);

  // ── Submit handler: POST /api/chat and consume NDJSON stream. ───────
  const submit = useCallback(async (query: string) => {
    if (!query.trim() || streaming) return;
    const id = `t_${Date.now()}`;
    const turn: QATurn = {
      id,
      query,
      createdAt: Date.now(),
      text: "",
      citations: [],
      status: "streaming",
    };
    const priorHistory = turns
      .filter((t) => t.status === "done")
      .slice(-4)
      .flatMap((t) => [
        { role: "user" as const, content: t.query },
        { role: "assistant" as const, content: t.text || "" },
      ]);

    setTurns((prev) => [...prev, turn]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, history: priorHistory, model }),
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
          try { ev = JSON.parse(line) as StreamEvent; } catch { continue; }
          applyEvent(id, ev);
        }
      }
    } catch (err) {
      log.error("chat", "stream failed", err);
      setTurns((prev) => prev.map((t) => (t.id === id ? {
        ...t,
        status: "error",
        error: { code: "unknown", message: "Something went wrong. Check the server logs." },
      } : t)));
    } finally {
      setStreaming(false);
    }
  }, [turns, streaming, model]);

  const applyEvent = (id: string, ev: StreamEvent) => {
    setTurns((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      switch (ev.type) {
        case "envelope":
          return { ...t, envelope: ev.envelope as QATurn["envelope"], status: "done" };
        case "index-progress":
          return { ...t, indexProgress: { done: ev.done, total: ev.total } };
        case "token":
          return { ...t, text: t.text + ev.text };
        case "citation":
          return { ...t, citations: [...t.citations, { id: ev.id, path: ev.path, heading: ev.heading, snippet: ev.snippet }] };
        case "done":
          return { ...t, status: t.error ? "error" : "done" };
        case "error":
          return { ...t, status: "error", error: { code: ev.code, message: ev.message } };
        default:
          return t;
      }
    }));
  };

  // ── Deep-link auto-fire: /chat?q=<encoded>. ─────────────────────────
  useEffect(() => {
    if (autoFiredRef.current) return;
    const q = searchParams.get("q");
    if (q && q.trim()) {
      autoFiredRef.current = true;
      submit(q);
    }
  }, [searchParams, submit]);

  const clearChat = useCallback(() => {
    setTurns([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <PageShell
      title="Chat"
      contentMaxWidth={720}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ModelPicker current={model} onChange={selectModel} />
          {turns.length > 0 && (
            <PageAction label="Clear chat" onClick={clearChat}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
              </svg>
            </PageAction>
          )}
        </div>
      }
    >
      {turns.length === 0 ? (
        <ChatEmptyState onSubmit={submit} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px 32px 120px",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {turns.map((t) => (
              <QACard key={t.id} turn={t} />
            ))}
          </div>
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-glass, var(--bg-marketing))",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              padding: "16px 32px 20px",
            }}
          >
            <Composer ref={composerRef} onSubmit={submit} disabled={streaming} />
          </div>
        </div>
      )}
    </PageShell>
  );
}
