"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ResponseEnvelope } from "@/lib/view-models";
import { detectIntent, getMockResponse } from "@/lib/mock-data";
import { ViewRenderer } from "@/components/views/ViewRenderer";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: ResponseEnvelope;
}

const quickActions = [
  { label: "What matters now", intent: "current_work", icon: "⚡" },
  { label: "System health", intent: "system_status", icon: "🩺" },
  { label: "What changed this month", intent: "timeline_synthesis", icon: "📅" },
  { label: "About Tebi", intent: "entity_overview", icon: "🏢" },
  { label: "AI Visual Brain Frontend", intent: "topic_overview", icon: "🧠" },
  { label: "Search review prep", intent: "search_results", icon: "🔍" },
];

// ── Animation presets ──────────────────────────────────────────────

const fadeInUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
};

const stagger = {
  container: { transition: { staggerChildren: 0.06 } },
  item: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

// ── Component ──────────────────────────────────────────────────────

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // Track scroll position to auto-follow
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

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "24px";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }, [input]);

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

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "24px";
    }

    // Simulate AI processing delay
    await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 700));

    const intent = detectIntent(userMessage);
    const response = getMockResponse(intent);

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

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-950">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="shrink-0 border-b border-neutral-200/60 dark:border-neutral-800/60 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-2xl">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-sm shadow-violet-500/20">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h1 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Brain
            </h1>
          </div>
          <AnimatePresence>
            {messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={handleClear}
                className="text-[13px] font-medium text-neutral-400 dark:text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors px-3 py-1.5 -mr-3 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Clear
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* ── Messages area ───────────────────────────────────── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scroll-smooth">
        <div className="max-w-3xl mx-auto px-5 py-8">
          <AnimatePresence mode="popLayout">
            {showWelcome && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20, transition: { duration: 0.25 } }}
                transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="flex flex-col items-center justify-center pt-24 sm:pt-32 pb-12"
              >
                {/* Logo */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="w-[72px] h-[72px] rounded-[22px] bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center mb-8 shadow-xl shadow-violet-500/25 dark:shadow-violet-500/15"
                >
                  <svg
                    className="w-9 h-9 text-white"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </motion.div>

                {/* Title */}
                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-[28px] sm:text-[32px] font-bold tracking-tight text-neutral-900 dark:text-neutral-50 mb-3"
                >
                  Brain
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="text-[15px] sm:text-base text-neutral-400 dark:text-neutral-500 text-center max-w-md leading-relaxed mb-10"
                >
                  Ask about your work, systems, people, or projects.
                  <br />
                  <span className="text-neutral-500 dark:text-neutral-400">
                    I&apos;ll find the right view.
                  </span>
                </motion.p>

                {/* Quick actions */}
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full max-w-lg"
                >
                  {quickActions.map((action, i) => (
                    <motion.button
                      key={action.intent}
                      onClick={() => handleSubmit(action.label)}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: 0.45 + i * 0.05,
                        duration: 0.3,
                        ease: [0.25, 0.46, 0.45, 0.94],
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[13px] sm:text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800/80 hover:border-neutral-300 dark:hover:border-neutral-700 shadow-sm hover:shadow-md transition-shadow duration-200 text-left"
                    >
                      <span className="text-[17px] leading-none">{action.icon}</span>
                      <span className="truncate">{action.label}</span>
                    </motion.button>
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Message list ──────────────────────────────────── */}
          <div className="space-y-8">
            {messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.25, 0.46, 0.45, 0.94],
                  delay: 0.05,
                }}
                layout
              >
                {msg.role === "user" ? (
                  /* ── User bubble ────────────────────────────── */
                  <div className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-md">
                      <div className="bg-gradient-to-br from-violet-600 to-blue-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5 shadow-md shadow-violet-500/15">
                        <p className="text-[14px] leading-relaxed">{msg.content}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Assistant response ──────────────────────── */
                  <div className="w-full">
                    {msg.content && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        className="text-[14px] sm:text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400 mb-5"
                      >
                        {msg.content}
                      </motion.p>
                    )}
                    {msg.response?.response.views.map((view, viewIndex) => (
                      <motion.div
                        key={view.viewId}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.4,
                          delay: 0.15 + viewIndex * 0.08,
                          ease: [0.25, 0.46, 0.45, 0.94],
                        }}
                      >
                        <ViewRenderer view={view} index={viewIndex} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}

            {/* ── Typing indicator ───────────────────────────────── */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.25 }}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center shadow-sm shadow-violet-500/20">
                    <svg
                      className="w-3.5 h-3.5 text-white"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-[5px] h-[5px] rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-[5px] h-[5px] rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-[5px] h-[5px] rounded-full bg-neutral-400 dark:bg-neutral-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* ── Chat input bar ────────────────────────────────────── */}
      <div className="shrink-0 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-2xl border-t border-neutral-200/50 dark:border-neutral-800/50">
        <div className="max-w-3xl mx-auto px-5 pt-4 pb-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
          >
            <div className="relative flex items-end bg-neutral-100 dark:bg-neutral-800/80 rounded-3xl border border-neutral-200/80 dark:border-neutral-700/60 shadow-sm shadow-neutral-900/5 dark:shadow-none focus-within:border-neutral-300 dark:focus-within:border-neutral-600 focus-within:shadow-md focus-within:shadow-neutral-900/5 dark:focus-within:shadow-none transition-all duration-200">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about work, people, projects, systems…"
                rows={1}
                className="flex-1 resize-none bg-transparent px-5 py-3.5 pr-14 text-[15px] leading-relaxed text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none"
                style={{ minHeight: "24px", maxHeight: "150px" }}
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={!input.trim() || isProcessing}
                className="absolute right-3 bottom-2.5 w-9 h-9 rounded-2xl bg-violet-600 dark:bg-violet-500 text-white flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed hover:bg-violet-700 dark:hover:bg-violet-600 active:scale-95 transition-all duration-150 shadow-sm shadow-violet-600/25"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                  />
                </svg>
              </button>
            </div>
          </form>
          <p className="text-center text-[11px] text-neutral-400 dark:text-neutral-600 mt-2.5 tracking-wide">
            Brain reads from your Obsidian vault · Read-only prototype
          </p>
        </div>
      </div>
    </div>
  );
}