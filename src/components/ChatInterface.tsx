"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { ResponseEnvelope, CurrentWorkData, TaskItem } from "@/lib/view-models";
import { USE_REAL_DATA, fetchRealData } from "@/lib/mock-data";
import { getMockResponse } from "@/lib/mock-data";
import { detectIntent, detectToggleIntent } from "@/lib/intent-detector";
import { ViewRenderer } from "@/components/views/ViewRenderer";
import { Avatar } from "@/components/ui";
import { ChatEmptyState } from "@/components/ChatEmptyState";
import { fadeSlideUp } from "@/lib/motion";
import { useKeyboardShortcuts } from "@/lib/hooks/useKeyboardShortcuts";
import { useUser } from "@/lib/hooks/useUser";
import { useVault } from "@/lib/hooks/useVault";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ResponseEnvelope;
  /** Track which messages have finished their word-by-word reveal */
  textRevealed?: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Design tokens (from DESIGN.md — single source of truth)
// ────────────────────────────────────────────────────────────────────

// Theme-aware token indirection — values point to CSS custom properties
// defined in globals.css, so light/dark mode switching is automatic.
// Status/brand colors that are constant across themes stay as hex.
const palette = {
  bg: "var(--bg-marketing)",
  panelDark: "var(--bg-panel)",
  level3: "var(--bg-surface)",
  secondarySurface: "var(--bg-elevated)",
  primaryText: "var(--text-primary)",
  secondaryText: "var(--text-secondary)",
  tertiaryText: "var(--text-tertiary)",
  quaternaryText: "var(--text-quaternary)",
  brandIndigo: "var(--accent-brand)",
  accentViolet: "var(--accent-violet)",
  accentHover: "var(--accent-hover)",
  successGreen: "var(--success)",
  emerald: "var(--success-pill)",
  borderSubtle: "var(--border-subtle)",
  borderStandard: "var(--border-standard)",
  pillBorder: "var(--border-solid-primary)",
} as const;

// ────────────────────────────────────────────────────────────────────
// AnimatedText — single-shot fade
// ────────────────────────────────────────────────────────────────────

/**
 * Whole-message fade, 140ms. Linear doesn't do typewriter reveals.
 * The message appears — you read it. Reveal callback fires next tick
 * so view cards can animate in right after the copy lands.
 */
function AnimatedText({ text, onComplete }: { text: string; onComplete?: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => onComplete?.(), 140);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span
      key={text}
      style={{
        display: "inline",
        animation: "cipher-text-fade 140ms cubic-bezier(0.25, 0.1, 0.25, 1) both",
      }}
    >
      {text}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export function ChatInterface() {
  const user = useUser();
  const vault = useVault();
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [revealedMessages, setRevealedMessages] = useState<Set<string>>(new Set());

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isAtBottom) scrollToBottom();
  }, [messages, isAtBottom, scrollToBottom]);

  // Track scroll to auto-follow
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const threshold = 80;
      setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const handleToggle = async (itemId: string, checked: boolean) => {
    // Find the item in messages, get sourceFile and lineIndex
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.response) continue;
      for (const view of msg.response.response.views) {
        if (view.type !== "current_work") continue;
        const data = view.data as CurrentWorkData;
        for (const group of data.groups) {
          for (const item of group.items) {
            if (item.id !== itemId) continue;
            if (item.lineIndex === undefined || !view.sourceFile) return;

            // Optimistic update
            const newStatus = checked ? "done" as const : "open" as const;
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== msg.id || !m.response) return m;
                const newResponse = { ...m.response };
                const newViews = newResponse.response.views.map((v) => {
                  if (v.viewId !== view.viewId) return v;
                  const vData = { ...(v.data as CurrentWorkData) };
                  vData.groups = vData.groups.map((g) => ({
                    ...g,
                    items: g.items.map((it) =>
                      it.id === itemId ? { ...it, status: newStatus } : it
                    ),
                  }));
                  return { ...v, data: vData };
                });
                newResponse.response = { ...newResponse.response, views: newViews };
                return { ...m, response: newResponse };
              })
            );

            // Server request
            try {
              const res = await fetch("/api/toggle", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: view.sourceFile, lineIndex: item.lineIndex, checked }),
              });
              if (!res.ok) {
                // Revert on failure
                const revertStatus = !checked ? "done" as const : "open" as const;
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== msg.id || !m.response) return m;
                    const newResponse = { ...m.response };
                    const newViews = newResponse.response.views.map((v) => {
                      if (v.viewId !== view.viewId) return v;
                      const vData = { ...(v.data as CurrentWorkData) };
                      vData.groups = vData.groups.map((g) => ({
                        ...g,
                        items: g.items.map((it) =>
                          it.id === itemId ? { ...it, status: revertStatus } : it
                        ),
                      }));
                      return { ...v, data: vData };
                    });
                    newResponse.response = { ...newResponse.response, views: newViews };
                    return { ...m, response: newResponse };
                  })
                );
              }
            } catch {
              // Revert on error
              const revertStatus = !checked ? "done" as const : "open" as const;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== msg.id || !m.response) return m;
                  const newResponse = { ...m.response };
                  const newViews = newResponse.response.views.map((v) => {
                    if (v.viewId !== view.viewId) return v;
                    const vData = { ...(v.data as CurrentWorkData) };
                    vData.groups = vData.groups.map((g) => ({
                      ...g,
                      items: g.items.map((it) =>
                        it.id === itemId ? { ...it, status: revertStatus } : it
                      ),
                    }));
                    return { ...v, data: vData };
                  });
                  newResponse.response = { ...newResponse.response, views: newViews };
                  return { ...m, response: newResponse };
                })
              );
            }
            return;
          }
        }
      }
    }
  };

  // ── A3: Natural language todo toggling ──────────────────────────────

  const findTaskInView = (taskName: string): { msgId: string; viewId: string; itemId: string; sourceFile: string; lineIndex: number; itemText: string } | null => {
    const lower = taskName.toLowerCase();
    for (const msg of messages) {
      if (msg.role !== "assistant" || !msg.response) continue;
      for (const view of msg.response.response.views) {
        if (view.type !== "current_work") continue;
        const data = view.data as CurrentWorkData;
        for (const group of data.groups) {
          for (const item of group.items) {
            if (item.status === "done" && lower.includes("done")) continue; // skip already done
            const itemText = item.text.toLowerCase();
            // Exact or substring match
            if (itemText === lower || itemText.includes(lower) || lower.includes(itemText)) {
              if (item.lineIndex !== undefined && view.sourceFile) {
                return { msgId: msg.id, viewId: view.viewId, itemId: item.id, sourceFile: view.sourceFile, lineIndex: item.lineIndex, itemText: item.text };
              }
            }
          }
        }
      }
    }
    return null;
  };

  const handleSubmit = useCallback(async (query?: string) => {
    const userMessage = query || input.trim();
    if (!userMessage || isProcessing) return;

    // ── A3: Check for toggle intent before sending to AI ──
    const toggleIntent = detectToggleIntent(userMessage);
    if (toggleIntent) {
      const match = findTaskInView(toggleIntent.taskName);
      if (match) {
        // Add user message
        const userMsg: Message = {
          id: `msg_${Date.now()}_user`,
          role: "user",
          content: userMessage,
        };
        setMessages((prev) => [...prev, userMsg]);

        // Optimistic toggle
        const checked = toggleIntent.checked;
        const newStatus = checked ? "done" as const : "open" as const;
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== match.msgId || !m.response) return m;
            const newResponse = { ...m.response };
            const newViews = newResponse.response.views.map((v) => {
              if (v.viewId !== match.viewId) return v;
              const vData = { ...(v.data as CurrentWorkData) };
              vData.groups = vData.groups.map((g) => ({
                ...g,
                items: g.items.map((it) =>
                  it.id === match.itemId ? { ...it, status: newStatus } : it
                ),
              }));
              return { ...v, data: vData };
            });
            newResponse.response = { ...newResponse.response, views: newViews };
            return { ...m, response: newResponse };
          })
        );

        // Server request
        fetch("/api/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: match.sourceFile, lineIndex: match.lineIndex, checked }),
        }).catch(() => {});

        // Add confirmation message
        const confirmMsg: Message = {
          id: `msg_${Date.now()}_assistant`,
          role: "assistant",
          content: checked ? `✓ Marked "${match.itemText}" as done` : `✓ Reopened "${match.itemText}"`,
        };
        setMessages((prev) => [...prev, confirmMsg]);
        return;
      }
      // If no match found, fall through to normal AI query
    }

    setShowWelcome(false);

    // Store recent query
    try {
      const stored = localStorage.getItem("cipher-recent");
      const recent: string[] = stored ? JSON.parse(stored) : [];
      const updated = [userMessage, ...recent.filter((q: string) => q !== userMessage)].slice(0, 5);
      localStorage.setItem("cipher-recent", JSON.stringify(updated));
    } catch {}
    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: "user",
      content: userMessage,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);

    if (inputRef.current) inputRef.current.value = "";

    let response: ResponseEnvelope;

    try {
      if (USE_REAL_DATA) {
        // Try the real API first
        const realData = await fetchRealData(userMessage);
        if (realData) {
          response = realData;
        } else {
          // Fallback to mock data on failure
          const intent = await detectIntent(userMessage);
          response = getMockResponse(intent.viewType);
        }
      } else {
        // Use mock data
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 700));
        const intent = await detectIntent(userMessage);
        response = getMockResponse(intent.viewType);
      }
    } catch (err) {
      console.error("handleSubmit fetch error:", err);
      // Fallback to mock on error
      try {
        const intent = await detectIntent(userMessage);
        response = getMockResponse(intent.viewType);
      } catch {
        response = getMockResponse("search_results");
      }
    }

    const assistantMsg: Message = {
      id: `msg_${Date.now()}_assistant`,
      role: "assistant",
      content: response.response.text || response.response.summary,
      response,
      textRevealed: false,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsProcessing(false);

    // Scroll to the start of the AI response
    requestAnimationFrame(() => {
      const msgElements = document.querySelectorAll('[data-msg-role="assistant"]');
      const last = msgElements[msgElements.length - 1];
      if (last && scrollContainerRef.current) {
        last.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isProcessing, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClear = useCallback(() => {
    setMessages([]);
    setShowWelcome(true);
    setInput("");
    setIsProcessing(false);
  }, []);

  // Auto-fire query from ?q= URL param on mount (deep-link /chat?q=<encoded>).
  const searchParams = useSearchParams();
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (autoFiredRef.current) return;
    const q = searchParams.get("q");
    if (q && q.trim()) {
      autoFiredRef.current = true;
      handleSubmit(q);
    }
  }, [searchParams, handleSubmit]);

  // Global keyboard shortcuts — Linear-style.
  // `/` focuses the chat input (unless already typing).
  // `Esc` clears the current conversation and returns to the welcome screen.
  // Memoized so the hook doesn't re-register every render.
  const shortcuts = useMemo(
    () => [
      {
        key: "/",
        handler: () => {
          inputRef.current?.focus();
        },
        description: "Focus chat",
      },
      {
        key: "Escape",
        // Allow Esc even from inside the textarea — it's the universal "get me out" key.
        when: () => true,
        handler: () => {
          // If user is typing, prefer clearing the input first over resetting everything.
          if (input.length > 0) {
            setInput("");
            return;
          }
          // If we're on the welcome screen with an empty input, blur to release focus.
          if (showWelcome && messages.length === 0) {
            inputRef.current?.blur();
            return;
          }
          handleClear();
        },
        description: "Return home",
      },
    ],
    // handleClear is referentially stable enough for the hook's effect-dep comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, showWelcome, messages.length]
  );
  useKeyboardShortcuts(shortcuts);

  const handleTextRevealComplete = (msgId: string) => {
    setRevealedMessages((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      return next;
    });
  };

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        minHeight: 0,
        background: palette.bg,
        color: palette.primaryText,
      }}
    >
      {/* ── Top bar — empty on desktop, placeholder for mobile actions ─── */}
      <div
        style={{
          flexShrink: 0,
          height: 48,
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "color-mix(in srgb, var(--bg-marketing) 85%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
        }}
      >
        <div />
        <div />
      </div>

      {/* ── Messages area ────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "thin",
          scrollbarColor: `${palette.quaternaryText} transparent`,
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            padding: "0 32px 120px",
            minHeight: showWelcome ? "calc(100vh - 88px)" : undefined,
            display: showWelcome ? "flex" : undefined,
            flexDirection: showWelcome ? "column" : undefined,
            justifyContent: showWelcome ? "center" : undefined,
          }}
        >
          {/* ── Empty state ───────────────────────────────────────── */}
          {showWelcome && messages.length === 0 && vault.connected && (
            <ChatEmptyState onSubmit={(q) => handleSubmit(q)} />
          )}

          {showWelcome && messages.length === 0 && !vault.loading && !vault.connected && (
            /* ────────────────────────────────────────────────
               No vault: centered takeover wizard.
               Single task, single focal point. Nothing else renders.
               ──────────────────────────────────────────────── */
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 80,
                paddingBottom: 80,
                gap: 24,
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 11,
                  background: palette.brandIndigo,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 8px 24px rgba(94,106,210,0.25), 0 0 0 1px rgba(255,255,255,0.06) inset",
                }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                style={{ textAlign: "center", maxWidth: 420 }}
              >
                <h1
                  style={{
                    fontSize: 32,
                    fontWeight: 560,
                    letterSpacing: -0.8,
                    lineHeight: 1.1,
                    color: palette.primaryText,
                    margin: 0,
                    marginBottom: 8,
                  }}
                >
                  Connect your vault
                </h1>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: palette.tertiaryText,
                    margin: 0,
                  }}
                >
                  Point Cipher at a folder of markdown notes. Your Obsidian vault, research notes, anything.
                </p>
              </motion.div>
              <motion.form
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const pathInput = (form.elements[0] as HTMLInputElement).value.trim();
                  if (!pathInput) return;
                  setVaultError(null);
                  const result = await vault.connect(pathInput);
                  if (!result.ok) {
                    setVaultError(result.error ?? "Could not connect");
                  }
                }}
                style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: 6,
                    borderRadius: 8,
                    background: palette.level3,
                    border: `1px solid ${palette.borderStandard}`,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    placeholder="~/Documents/Obsidian"
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "none",
                      background: "transparent",
                      color: palette.primaryText,
                      fontSize: 13,
                      fontFamily: "var(--font-mono)",
                      outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "8px 14px",
                      borderRadius: 6,
                      border: "none",
                      background: palette.brandIndigo,
                      color: "var(--text-on-brand)",
                      fontSize: 13,
                      fontWeight: 510,
                      letterSpacing: -0.1,
                      cursor: "pointer",
                      transition: "background-color 0.15s",
                    }}
                  >
                    Connect
                  </button>
                </div>
                {vaultError && (
                  <p style={{ fontSize: 12, color: "var(--status-blocked)", margin: 0, textAlign: "center" }}>
                    {vaultError}
                  </p>
                )}
              </motion.form>
            </div>
          )}

          {/* ── Message list ────────────────────────────────────────── */}
          {messages.length > 0 && (
            <div style={{ paddingTop: 32, paddingBottom: 32 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {messages.map((msg) => (
                  <motion.div
                    key={msg.id}
                    variants={fadeSlideUp}
                    initial="hidden"
                    animate="show"
                  >
                    {msg.role === "user" ? (
                      /* ── User message ──────────────────────────────────── */
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, alignItems: "flex-start" }}>
                        <div
                          style={{
                            maxWidth: "75%",
                            backgroundColor: palette.brandIndigo,
                            borderRadius: 12,
                            borderBottomRightRadius: 4,
                            padding: "10px 16px",
                            boxShadow: `rgba(0,0,0,0.2) 0px 0px 0px 1px`,
                          }}
                        >
                          <p
                            style={{
                              fontSize: 15,
                              fontWeight: 400,
                              lineHeight: 1.5,
                              color: "var(--text-on-brand)",
                              margin: 0,
                            }}
                          >
                            {msg.content}
                          </p>
                        </div>
                        {/* User avatar — neutral tone, paired with AI's brand tone */}
                        <div style={{ marginTop: 2 }}>
                          <Avatar initial={user.initial} tone="neutral" label={`${user.name} avatar`} />
                        </div>
                      </div>
                    ) : (
                      /* ── AI response ─────────────────────────────────────── */
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }} data-msg-role="assistant">
                        {/* Cipher avatar — brand tone, initial-based (Linear "AI as peer" treatment) */}
                        <div style={{ marginTop: 2 }}>
                          <Avatar initial="C" tone="brand" label="Cipher" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* A1: Conversational AI text with A2: word-by-word animation */}
                          {msg.content && (
                            <div style={{ marginBottom: 16 }}>
                              <p
                                style={{
                                  fontSize: 15,
                                  fontWeight: 400,
                                  lineHeight: 1.6,
                                  color: palette.secondaryText,
                                  margin: 0,
                                }}
                              >
                                <AnimatedText
                                  text={msg.content}
                                  onComplete={() => handleTextRevealComplete(msg.id)}
                                />
                              </p>
                            </div>
                          )}
                          {/* View cards — animate in after text reveal */}
                          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            {msg.response?.response.views.map((view, viewIndex) => {
                              const isRevealed = revealedMessages.has(msg.id);
                              return (
                                <motion.div
                                  key={view.viewId}
                                  initial={{ opacity: 0, y: 4 }}
                                  animate={isRevealed ? { opacity: 1, y: 0 } : { opacity: 0, y: 4 }}
                                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                >
                                  <ViewRenderer
                                    view={view}
                                    index={viewIndex}
                                    onToggle={handleToggle}
                                    onAsk={handleSubmit}
                                    variant="chat-summary"
                                  />
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* ── Typing indicator ─────────────────────────────────────── */}
                <AnimatePresence>
                  {isProcessing && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                      style={{ display: "flex", alignItems: "center", gap: 8 }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: palette.brandIndigo,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, height: 12 }}>
                        {/* Opacity-only breathe, 800ms cycle, staggered. Single dimension of motion. */}
                        {[0, 200, 400].map((delay) => (
                          <span
                            key={delay}
                            style={{
                              width: 4,
                              height: 4,
                              borderRadius: "50%",
                              backgroundColor: palette.quaternaryText,
                              animation: "wave-pulse 1.2s ease-in-out infinite",
                              animationDelay: `${delay}ms`,
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat input ─────────────────────────────────────────────── */}
      {/* Only show the persistent input once the conversation has started.
          On the empty state ChatEmptyState owns the input. */}
      {messages.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            backgroundColor: "rgba(8,9,10,0.85)",
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            borderTop: `1px solid ${palette.borderSubtle}`,
          }}
        >
          <div style={{ maxWidth: 880, margin: "0 auto", padding: "20px 32px 24px" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit();
              }}
            >
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-end",
                  backgroundColor: palette.level3,
                  border: `1px solid ${palette.borderStandard}`,
                  borderRadius: 12,
                  transition: "border-color 0.2s, box-shadow 0.2s",
                  boxShadow: "rgba(0,0,0,0.4) 0px 2px 4px",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything — tasks, notes, people, systems…"
                  rows={1}
                  disabled={isProcessing}
                  style={{
                    flex: 1,
                    resize: "none",
                    background: "transparent",
                    border: "none",
                    padding: "12px 52px 12px 16px",
                    fontSize: 15,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    color: palette.primaryText,
                    height: 48,
                    overflowY: "auto",
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isProcessing}
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 8,
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: input.trim() && !isProcessing ? palette.brandIndigo : "rgba(255,255,255,0.05)",
                    border: "none",
                    cursor: input.trim() && !isProcessing ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background-color 0.15s",
                    opacity: input.trim() && !isProcessing ? 1 : 0.3,
                  }}
                >
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={input.trim() && !isProcessing ? "var(--text-on-brand)" : palette.tertiaryText}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Global overrides ─────────────────────────────────────── */}
      <style>{`
        /* Typing indicator — opacity-only breathe, single axis.
           Linear doesn't bounce. */
        @keyframes wave-pulse {
          0%, 100% { opacity: 0.3; }
          50%      { opacity: 1; }
        }
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.35; }
        }
        /* AI reply fade — single pass, 140ms. No typewriter. */
        @keyframes cipher-text-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        textarea::placeholder {
          color: var(--text-tertiary);
          opacity: 1;
        }
        textarea::-webkit-input-placeholder {
          color: var(--text-tertiary);
          opacity: 1;
        }
        textarea::-moz-placeholder {
          color: var(--text-tertiary);
          opacity: 1;
        }
        textarea:focus::placeholder {
          color: var(--text-quaternary);
        }
      `}</style>
    </div>
  );
}
