"use client";

/**
 * ChatInterface — reads conversation state + stream from the global chat store
 * (ChatStoreProvider, mounted in AppShell above the router).
 *
 * On mount it re-attaches to any in-flight stream by rendering the live
 * `partial` from the store — no restart, no double-send.
 *
 * Local state: model choice, LLM health banner, "New chat" button animation.
 * Everything else (turns, streaming, partial, send/stop/newChat) comes from useChat().
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell, PageAction } from "@/components/PageShell";
import { ChatEmptyState } from "@/components/chat/ChatEmptyState";
import { Composer, type ComposerHandle } from "@/components/chat/Composer";
import { QACard, type QATurn } from "@/components/chat/QACard";
import { ModelPicker } from "@/components/chat/ModelPicker";
import { IconStack } from "@/components/ui/IconStack";
import { useChat } from "@/lib/chat/chat-store";

const MODEL_KEY = "cipher-chat-model";
const DEFAULT_MODEL = process.env.NEXT_PUBLIC_CIPHER_CHAT_MODEL || "llama3.2:3b";

interface LlmHealth {
  ok: boolean;
  needsKey: boolean;
  providerLabel: string;
}

export function ChatInterface() {
  const {
    turns,
    streaming,
    partial,
    partialId,
    partialQuery,
    partialCreatedAt,
    partialCitations,
    partialEnvelope,
    send,
    stop,
    newChat,
  } = useChat();

  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [llmHealth, setLlmHealth] = useState<LlmHealth | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const searchParams = useSearchParams();
  const autoFiredRef = useRef(false);

  // ── LLM health check for the empty-state banner. ─────────────────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/health")
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = (await res.json()) as { ok: boolean; needsKey?: boolean; providerLabel?: string };
        if (!cancelled) {
          setLlmHealth({
            ok: !!data.ok,
            needsKey: !!data.needsKey,
            providerLabel: data.providerLabel ?? "LLM",
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLlmHealth({ ok: false, needsKey: false, providerLabel: "LLM" });
      });
    return () => { cancelled = true; };
  }, []);

  // ── Hydrate model preference from localStorage (SSR-safe). ───────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount hydration of model pref from localStorage (SSR-safe; same pattern as AppShell theme/recents)
      if (saved) setModel(saved);
    } catch { /* ignore */ }
  }, []);

  const selectModel = useCallback((m: string) => {
    setModel(m);
    try { localStorage.setItem(MODEL_KEY, m); } catch { /* ignore */ }
  }, []);

  // ── submit wraps the store's send() with the current model. ──────────
  const submit = useCallback((query: string) => {
    send(query, model);
  }, [send, model]);

  // ── Deep-link auto-fire: /chat?q=<encoded>. ──────────────────────────
  useEffect(() => {
    if (autoFiredRef.current) return;
    const q = searchParams.get("q");
    if (q && q.trim()) {
      autoFiredRef.current = true;
      submit(q);
    }
  }, [searchParams, submit]);

  // ── "New chat" button animation state. ───────────────────────────────
  const [newChatFired, setNewChatFired] = useState(false);
  const handleNewChat = useCallback(() => {
    newChat();
    setNewChatFired(true);
    window.setTimeout(() => setNewChatFired(false), 400);
  }, [newChat]);

  // ── Build a virtual streaming turn from the partial state. ───────────
  // This allows ChatInterface to show the live answer while navigated away and
  // returned, without needing to restart the stream.
  // partialCreatedAt is always non-null when partialId is set (SEND_START
  // assigns them together). Fall back to 0 (not Date.now) to stay pure in render.
  const streamingTurn: QATurn | null =
    streaming && partialId && partialQuery
      ? {
          id: partialId,
          query: partialQuery,
          createdAt: partialCreatedAt ?? 0,
          text: partial,
          citations: partialCitations,
          envelope: partialEnvelope ?? undefined,
          status: "streaming",
        }
      : null;

  const allTurns: QATurn[] = streamingTurn
    ? [...turns, streamingTurn]
    : turns;

  return (
    <PageShell
      title="Chat"
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ModelPicker current={model} onChange={selectModel} />
          {allTurns.length > 0 && (
            <PageAction label="New chat" onClick={handleNewChat}>
              <IconStack
                fired={newChatFired}
                idle={
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                  </svg>
                }
                success={
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                }
              />
            </PageAction>
          )}
        </div>
      }
    >
      {allTurns.length === 0 ? (
        <ChatEmptyState
          onSubmit={submit}
          banner={
            llmHealth !== null && (!llmHealth.ok || llmHealth.needsKey) ? (
              <div
                className="caption"
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  background: "color-mix(in srgb, var(--status-warning) 8%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--status-warning) 30%, transparent)",
                  color: "var(--text-secondary)",
                  maxWidth: 560,
                  width: "100%",
                  textAlign: "center",
                }}
              >
                {llmHealth.needsKey
                  ? `${llmHealth.providerLabel} requires an API key — configure it in Settings.`
                  : `${llmHealth.providerLabel} is unreachable. Check your connection or configure a provider in Settings.`}
              </div>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <div
              style={{
                maxWidth: 720,
                margin: "0 auto",
                padding: "24px 32px 120px",
                display: "flex",
                flexDirection: "column",
                gap: 24,
              }}
            >
              {allTurns.map((t) => (
                <QACard key={t.id} turn={t} />
              ))}
            </div>
          </div>
          <div
            style={{
              flexShrink: 0,
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--bg-glass, var(--bg-marketing))",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            }}
          >
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 32px 20px" }}>
              {streaming && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={stop}
                    className="mono-label focus-ring"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--border-standard)",
                      background: "var(--bg-surface)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      fontSize: 11,
                      letterSpacing: "0.04em",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ width: 8, height: 8, borderRadius: 2, background: "var(--status-danger)" }}
                    />
                    STOP
                  </button>
                </div>
              )}
              <Composer ref={composerRef} onSubmit={submit} disabled={streaming} />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
