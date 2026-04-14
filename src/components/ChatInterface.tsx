"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ResponseEnvelope } from "@/lib/view-models";
import { USE_REAL_DATA, fetchRealData } from "@/lib/mock-data";
import { getMockResponse } from "@/lib/mock-data";
import { detectIntent } from "@/lib/intent-detector";
import { ViewRenderer } from "@/components/views/ViewRenderer";
import { MarkdownRenderer } from "@/components/ui";
import { DetailPage } from "@/components/DetailPage";
import { fadeSlideUp, stagger } from "@/lib/motion";

// ────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ResponseEnvelope;
}

// ────────────────────────────────────────────────────────────────────
// Design tokens (from DESIGN.md — single source of truth)
// ────────────────────────────────────────────────────────────────────

const colors = {
  bg: "#08090a",
  panelDark: "#0f1011",
  level3: "#191a1b",
  secondarySurface: "#28282c",
  primaryText: "#f7f8f8",
  secondaryText: "#d0d6e0",
  tertiaryText: "#8a8f98",
  quaternaryText: "#62666d",
  brandIndigo: "#5e6ad2",
  accentViolet: "#7170ff",
  accentHover: "#828fff",
  successGreen: "#27a644",
  emerald: "#10b981",
  borderSubtle: "rgba(255,255,255,0.05)",
  borderStandard: "rgba(255,255,255,0.08)",
  pillBorder: "#23252a",
} as const;

// ────────────────────────────────────────────────────────────────────
// Quick actions
// ────────────────────────────────────────────────────────────────────

const quickActions = [
  { label: "What matters now", intent: "current_work" },
  { label: "System health", intent: "system_status" },
  { label: "What changed this month", intent: "timeline_synthesis" },
  { label: "About Tebi", intent: "entity_overview" },
  { label: "AI Visual Brain Frontend", intent: "topic_overview" },
  { label: "Search review prep", intent: "search_results" },
];

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [detailPath, setDetailPath] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

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

  // Textarea is fixed height — no auto-resize needed

  const handleSubmit = async (query?: string) => {
    const userMessage = query || input.trim();
    if (!userMessage || isProcessing) return;

    setShowWelcome(false);
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

    const assistantMsg: Message = {
      id: `msg_${Date.now()}_assistant`,
      role: "assistant",
      content: response.response.text || response.response.summary,
      response,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setIsProcessing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setShowWelcome(true);
    setInput("");
    setIsProcessing(false);
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
        backgroundColor: colors.bg,
        fontFamily: '"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
        fontFeatureSettings: '"cv01", "ss03"',
        color: colors.primaryText,
        position: "relative",
      }}
    >
      <AnimatePresence>
        {detailPath && (
          <DetailPage
            key={detailPath}
            path={detailPath}
            onBack={() => setDetailPath(null)}
            onNavigate={setDetailPath}
          />
        )}
      </AnimatePresence>
      {/* ── Header ────────────────────────────────────────────────── */}
      <header
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${colors.borderSubtle}`,
          backgroundColor: "rgba(8,9,10,0.8)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px",
            height: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Brain icon */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: colors.brandIndigo,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width={16}
                height={16}
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
            <span
              style={{
                fontSize: 15,
                fontWeight: 510,
                letterSpacing: -0.165,
                color: colors.primaryText,
                fontFeatureSettings: '"cv01", "ss03"',
              }}
            >
              Brain
            </span>
          </div>
          <AnimatePresence>
            {messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={handleClear}
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  color: colors.quaternaryText,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: 6,
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = colors.secondaryText;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = colors.quaternaryText;
                }}
              >
                Clear
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── Messages area ────────────────────────────────────────── */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          scrollbarWidth: "thin",
          scrollbarColor: `${colors.quaternaryText} transparent`,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px 120px" }}>
          <AnimatePresence mode="popLayout">
            {showWelcome && (
              <motion.div
                key="welcome"
                variants={fadeSlideUp}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
                transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingTop: 200,
                  paddingBottom: 64,
                }}
              >
                {/* ── Brain headline ──────────────────────────────── */}
                <motion.h1
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  style={{
                    fontSize: 64,
                    fontWeight: 510,
                    letterSpacing: -1.408,
                    lineHeight: 1.0,
                    color: colors.primaryText,
                    fontFeatureSettings: '"cv01", "ss03"',
                    margin: 0,
                    marginBottom: 16,
                  }}
                >
                  Brain
                </motion.h1>

                {/* ── Tagline ──────────────────────────────────────── */}
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                  style={{
                    fontSize: 16,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    color: colors.tertiaryText,
                    fontFeatureSettings: '"cv01", "ss03"',
                    textAlign: "center",
                    maxWidth: 400,
                    margin: 0,
                    marginBottom: 48,
                  }}
                >
                  Ask about your work, systems, people, or projects.
                  I&apos;ll find the right view.
                </motion.p>

                {/* ── Quick-action pills ─────────────────────────────── */}
                <motion.div
                  variants={stagger.container(0.04)}
                  initial="hidden"
                  animate="show"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    justifyContent: "center",
                    maxWidth: 520,
                  }}
                >
                  {quickActions.map((action) => (
                    <motion.button
                      key={action.intent}
                      variants={stagger.item}
                      whileHover={{
                        backgroundColor: "rgba(255,255,255,0.06)",
                        borderColor: "rgba(255,255,255,0.14)",
                        scale: 1.02,
                      }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleSubmit(action.label)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0,
                        padding: "10px 18px",
                        borderRadius: 9999,
                        fontSize: 14,
                        fontWeight: 510,
                        letterSpacing: "-0.13",
                        lineHeight: 1.5,
                        color: colors.secondaryText,
                        backgroundColor: "rgba(255,255,255,0.02)",
                        border: `1px solid ${colors.pillBorder}`,
                        cursor: "pointer",
                        fontFeatureSettings: '"cv01", "ss03"',
                        transition: "background-color 0.2s, border-color 0.2s, transform 0.15s",
                      }}
                    >
                      {action.label}
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Message list ────────────────────────────────────────── */}
          <div style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  variants={fadeSlideUp}
                  initial="hidden"
                  animate="show"
                  layout
                >
                  {msg.role === "user" ? (
                    /* ── User message ──────────────────────────────────── */
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div
                        style={{
                          maxWidth: "85%",
                          backgroundColor: colors.brandIndigo,
                          borderRadius: 12,
                          borderBottomRightRadius: 4,
                          padding: "12px 18px",
                          boxShadow: `rgba(0,0,0,0.2) 0px 0px 0px 1px`,
                        }}
                      >
                        <p
                          style={{
                            fontSize: 15,
                            fontWeight: 400,
                            lineHeight: 1.6,
                            color: "#ffffff",
                            margin: 0,
                            fontFeatureSettings: '"cv01", "ss03"',
                          }}
                        >
                          {msg.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* ── AI response ─────────────────────────────────────── */
                    <div style={{ width: "100%" }}>
                      {msg.content && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                          style={{
                            marginBottom: 24,
                          }}
                        >
                          <MarkdownRenderer content={msg.content} onNavigate={setDetailPath} />
                        </motion.div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {msg.response?.response.views.map((view, viewIndex) => (
                          <ViewRenderer key={view.viewId} view={view} index={viewIndex} onNavigate={setDetailPath} />
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* ── Typing indicator ─────────────────────────────────────── */}
              <AnimatePresence>
                {isProcessing && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.25 }}
                    style={{ display: "flex", alignItems: "center", gap: 10 }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: colors.brandIndigo,
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
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {[0, 150, 300].map((delay) => (
                        <span
                          key={delay}
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            backgroundColor: colors.quaternaryText,
                            animation: "dot-pulse 1.4s ease-in-out infinite",
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
        </div>
      </div>

      {/* ── Chat input ─────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          backgroundColor: "rgba(8,9,10,0.85)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          borderTop: `1px solid ${colors.borderSubtle}`,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 24px 24px" }}>
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
                backgroundColor: colors.level3,
                border: `1px solid ${colors.borderStandard}`,
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
                placeholder="Ask about work, people, projects, systems…"
                rows={1}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  resize: "none",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  padding: "14px 52px 14px 16px",
                  fontSize: 16,
                  fontWeight: 400,
                  lineHeight: 1.5,
                  color: colors.primaryText,
                  fontFamily: '"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
                  fontFeatureSettings: '"cv01", "ss03"',
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
                  backgroundColor: input.trim() && !isProcessing ? colors.brandIndigo : "rgba(255,255,255,0.05)",
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
                  stroke={input.trim() && !isProcessing ? "#ffffff" : colors.tertiaryText}
                  strokeWidth={2.5}
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

      {/* ── Global overrides ─────────────────────────────────────── */}
      <style>{`
        @keyframes dot-pulse {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        textarea::placeholder {
          color: #8a8f98;
          opacity: 1;
        }
        textarea::-webkit-input-placeholder {
          color: #8a8f98;
          opacity: 1;
        }
        textarea::-moz-placeholder {
          color: #8a8f98;
          opacity: 1;
        }
        textarea:focus::placeholder {
          color: #62666d;
        }
      `}</style>
    </div>
  );
}