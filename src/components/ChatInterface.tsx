"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { ResponseEnvelope, ViewType, CurrentWorkData, ViewModel, TaskItem } from "@/lib/view-models";
import { USE_REAL_DATA, fetchRealData } from "@/lib/mock-data";
import { getMockResponse } from "@/lib/mock-data";
import { detectIntent, detectToggleIntent } from "@/lib/intent-detector";
import { ViewRenderer } from "@/components/views/ViewRenderer";
import { MarkdownRenderer } from "@/components/ui";
import { DetailPage } from "@/components/DetailPage";
import { VaultDrawer } from "@/components/VaultDrawer";
import { HintChip } from "@/components/HintChip";
import { Avatar } from "@/components/ui";
import { CommandPalette, type PaletteAction } from "@/components/CommandPalette";
import { Sidebar } from "@/components/Sidebar";
import { TriageInbox } from "@/components/browse/TriageInbox";
import { GraphView } from "@/components/browse/GraphView";
import { fadeSlideUp, stagger } from "@/lib/motion";
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
// Quick actions
// ────────────────────────────────────────────────────────────────────

// Three fully generic starter prompts — no vault-specific entity names.
// The command palette covers more specific routes once the user knows the vault's content.
const quickActions = [
  { label: "What matters now", intent: "current_work" },
  { label: "System health", intent: "system_status" },
  { label: "What changed this month", intent: "timeline_synthesis" },
];

// ────────────────────────────────────────────────────────────────────
// Quick reply pills per view type (A4)
// ────────────────────────────────────────────────────────────────────

interface QuickReply {
  label: string;
  query: string; // What to actually send — context-rich query
}

const QUICK_REPLIES: Record<string, (ctx: { title?: string; entityName?: string; sourceFile?: string }) => QuickReply[]> = {
  current_work: (ctx) => [
    { label: "Show details", query: `show details for ${ctx.title || "current work"}` },
    { label: "What's blocked?", query: "what's blocked or waiting for" },
    { label: "Mark done", query: "mark done" },
  ],
  entity_overview: (ctx) => [
    { label: "Go deeper", query: `tell me more about ${ctx.entityName || ctx.title || "this"}` },
    { label: "Open in Obsidian", query: `open ${ctx.entityName || ctx.title || ""} in obsidian` },
  ],
  topic_overview: (ctx) => [
    { label: "Tell me more", query: `tell me more about ${ctx.title || "this topic"}` },
    { label: "Show related", query: `show related to ${ctx.title || "this"}` },
  ],
  timeline_synthesis: (ctx) => [
    { label: "Tell me more", query: `more details on ${ctx.title || "timeline"}` },
    { label: "Show related", query: `what's related to ${ctx.title || "this"}` },
  ],
  system_status: (ctx) => [
    { label: "Tell me more", query: `more about ${ctx.title || "system status"}` },
    { label: "Show related", query: `open loops and issues` },
  ],
  search_results: (ctx) => [
    { label: "Tell me more", query: `tell me more about ${ctx.title || "these results"}` },
    { label: "Show related", query: `find more about ${ctx.title || "this"}` },
  ],
  browse_entities: () => [
    { label: "Show projects", query: "show me my projects" },
    { label: "Show research", query: "show me my research" },
  ],
  browse_projects: () => [
    { label: "Show entities", query: "show me my entities" },
    { label: "Show research", query: "show me my research" },
  ],
  browse_research: () => [
    { label: "Show entities", query: "show me my entities" },
    { label: "Show projects", query: "show me my projects" },
  ],
};

function getQuickReplies(views: ViewModel[], entityName?: string): QuickReply[] {
  if (views.length === 0) return [];
  const primary = views[0];
  const builder = QUICK_REPLIES[primary.type];
  if (!builder) return [{ label: "Tell me more", query: `tell me more about ${primary.title || "this"}` }];
  return builder({ title: primary.title, entityName, sourceFile: primary.sourceFile });
}

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

export function ChatInterface({ view = "chat" }: { view?: "chat" | "triage" | "graph" } = {}) {
  const user = useUser();
  const vault = useVault();
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [detailPath, setDetailPath] = useState<string | null>(null);
  // Navigation stack — push chat scrollY when opening a detail sheet, restore on Back.
  // Lets users return to the exact spot in the chat they were reading.
  const navStackRef = useRef<{ path: string; scrollY: number }[]>([]);

  // Open detail sheet. Capture the chat's current scroll position so we can
  // restore it when the user backs out.
  const openDetail = useCallback((path: string) => {
    const scrollY = scrollContainerRef.current?.scrollTop ?? 0;
    navStackRef.current.push({ path, scrollY });
    setDetailPath(path);
  }, []);

  // Close detail sheet. Pop the stack; if we still have a detail below, swap
  // to that (nested navigation). If empty, clear and restore chat scrollY.
  const closeDetail = useCallback(() => {
    navStackRef.current.pop();
    const prev = navStackRef.current[navStackRef.current.length - 1];
    if (prev) {
      setDetailPath(prev.path);
      return;
    }
    setDetailPath(null);
    // Restore chat scroll after the sheet has unmounted — defer to next frame.
    requestAnimationFrame(() => {
      const target = navStackRef.current.length === 0 ? null : navStackRef.current[0].scrollY;
      if (target != null && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = target;
      }
    });
  }, []);

  // Deep-navigate from inside a detail sheet — e.g. clicking a wiki-link.
  // Pushes a new entry onto the stack without capturing a fresh scrollY
  // (the chat scroll we want to restore is the one captured on first open).
  const navigateDetail = useCallback((path: string) => {
    navStackRef.current.push({ path, scrollY: navStackRef.current[0]?.scrollY ?? 0 });
    setDetailPath(path);
  }, []);
  const [vaultDrawerOpen, setVaultDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [revealedMessages, setRevealedMessages] = useState<Set<string>>(new Set());
  const [openTasks, setOpenTasks] = useState<TaskItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [recentQueries, setRecentQueries] = useState<string[]>([]);

  // Vault connection state comes from useVault() hook — no local fetch.

  // Fetch open tasks for home view
  useEffect(() => {
    fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "current work" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.response?.views) {
          for (const view of data.response.views) {
            if (view.type === "current_work" && view.data?.groups) {
              const items = view.data.groups.flatMap((g: any) => g.items).filter((i: TaskItem) => i.status !== "done");
              setOpenTasks(items.slice(0, 5));
              break;
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTasks(false));
  }, []);

  // Read recent queries from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("cipher-recent");
      if (stored) setRecentQueries(JSON.parse(stored));
    } catch {}
  }, []);

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

  const handleSubmit = async (query?: string) => {
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
      setRecentQueries(updated);
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

  // Global keyboard shortcuts — Linear-style.
  // `/` focuses the chat input (unless already typing).
  // `Esc` clears the current conversation and returns to the welcome screen.
  // `⌘K` / `Ctrl+K` opens the command palette.
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
          if (paletteOpen) {
            setPaletteOpen(false);
            return;
          }
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
      {
        key: "k",
        modifiers: ["meta"] as const,
        handler: () => setPaletteOpen((v) => !v),
        description: "Open command palette",
      },
      {
        key: "k",
        modifiers: ["ctrl"] as const,
        handler: () => setPaletteOpen((v) => !v),
        description: "Open command palette",
      },
    ],
    // handleClear is referentially stable enough for the hook's effect-dep comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, showWelcome, messages.length, paletteOpen]
  );
  useKeyboardShortcuts(shortcuts);

  // Palette actions — computed from current state so Recent Queries stays fresh.
  const handleToggleTheme = useCallback(() => {
    const html = document.documentElement;
    const isLight = html.classList.contains("light");
    if (isLight) {
      html.classList.remove("light");
      html.classList.add("dark");
      localStorage.setItem("brain-theme", "dark");
    } else {
      html.classList.add("light");
      html.classList.remove("dark");
      localStorage.setItem("brain-theme", "light");
    }
  }, []);

  const paletteActions = useMemo<PaletteAction[]>(() => {
    const navIcon = (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    );
    const actions: PaletteAction[] = [
      {
        id: "nav-home",
        group: "Navigation",
        label: "Home",
        description: "Return to welcome screen",
        icon: navIcon,
        shortcut: ["Esc"],
        run: handleClear,
      },
      {
        id: "nav-vault",
        group: "Navigation",
        label: "Open vault drawer",
        description: "Browse entities, projects, research",
        icon: navIcon,
        run: () => setVaultDrawerOpen(true),
      },
      {
        id: "ask-current-work",
        group: "Ask",
        label: "What matters now",
        description: "Show current work and open tasks",
        run: () => handleSubmit("what matters now"),
      },
      {
        id: "ask-system",
        group: "Ask",
        label: "System health",
        description: "Show system status and attention items",
        run: () => handleSubmit("system health"),
      },
      {
        id: "ask-changed",
        group: "Ask",
        label: "What changed this month",
        description: "Timeline synthesis for the month",
        run: () => handleSubmit("what changed this month"),
      },
      ...recentQueries.slice(0, 5).map((q, i): PaletteAction => ({
        id: `recent-${i}`,
        group: "Recent",
        label: q,
        run: () => handleSubmit(q),
      })),
      {
        id: "action-clear",
        group: "Actions",
        label: "Clear conversation",
        description: "Reset messages and return home",
        run: handleClear,
      },
      {
        id: "action-theme",
        group: "Actions",
        label: "Toggle theme",
        description: "Switch between light and dark mode",
        run: handleToggleTheme,
      },
      {
        id: "action-disconnect-vault",
        group: "Actions",
        label: "Disconnect vault",
        description: "Unlink the current vault and return to the connect screen",
        run: () => {
          vault.disconnect?.();
          handleClear();
        },
      },
    ];
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentQueries, handleToggleTheme]);

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

  // Derive the currently-active view kind so the sidebar highlights the
  // matching nav item (Tasks / Entities / Projects / System / Timeline).
  const activeKind = useMemo(() => {
    const last = messages[messages.length - 1];
    return last?.response?.response.views[0]?.type ?? null;
  }, [messages]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100dvh",
        backgroundColor: palette.bg,
        color: palette.primaryText,
        position: "relative",
      }}
    >
      {/* ── Persistent left sidebar ─────────────────────────────
          Hidden below 768px (hamburger falls back to palette ⌘K). */}
      <div className="sidebar-container">
        <Sidebar
          onAsk={handleSubmit}
          onHome={handleClear}
          onBrowse={() => setVaultDrawerOpen(true)}
          onPalette={() => setPaletteOpen(true)}
          onToggleTheme={handleToggleTheme}
          activeKind={activeKind}
          recentQueries={recentQueries}
        />
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          height: "100dvh",
        }}
      >
      <LayoutGroup>
      <AnimatePresence mode="wait">
        {detailPath && (
          <DetailPage
            key={detailPath}
            path={detailPath}
            onBack={closeDetail}
            onNavigate={navigateDetail}
            onAsk={(query) => {
              // Close the sheet, then fire the query in the chat.
              navStackRef.current = [];
              setDetailPath(null);
              handleSubmit(query);
            }}
            onHome={() => {
              navStackRef.current = [];
              setDetailPath(null);
              handleClear();
            }}
          />
        )}
      </AnimatePresence>
      </LayoutGroup>
      {/* ── Slim top bar — Cipher/vault now live in sidebar. ──
          Mobile: hamburger opens palette (escape hatch). Desktop: empty left. */}
      <div
        style={{
          flexShrink: 0,
          height: 48,
          borderBottom: `1px solid ${palette.borderSubtle}`,
          background: "color-mix(in srgb, var(--bg-marketing) 72%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          position: "sticky",
          top: 0,
          zIndex: 30,
        }}
      >
        {/* Mobile hamburger (visible only when sidebar is hidden) */}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Menu"
          className="sidebar-mobile-trigger focus-ring"
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 6,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: palette.tertiaryText,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </button>
        {/* Left spacer (breadcrumbs appear in DetailPage, not here). */}
        <div />
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            title="Command palette"
            className="focus-ring"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: 6, border: "none",
              background: "transparent", cursor: "pointer", color: palette.tertiaryText,
              fontSize: 12, fontWeight: 500,
              transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = palette.primaryText; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = palette.tertiaryText; }}
          >
            <kbd className="mono-label" style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              padding: "1px 5px", borderRadius: 4,
              border: `1px solid ${palette.borderStandard}`,
              background: palette.level3,
              fontSize: 11, color: palette.tertiaryText, letterSpacing: "0.04em",
            }}>
              ⌘K
            </kbd>
          </button>
          <div style={{ width: 1, height: 16, background: palette.borderSubtle, margin: "0 4px" }} />
          <button
            type="button"
            onClick={() => setVaultDrawerOpen(true)}
            title="Browse vault"
            className="focus-ring"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 8px", borderRadius: 6, border: "none",
              background: "transparent", cursor: "pointer", color: palette.tertiaryText,
              fontSize: 12, fontWeight: 510, letterSpacing: -0.1,
              transition: "background-color var(--motion-hover) var(--ease-default), color var(--motion-hover) var(--ease-default)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--bg-surface-alpha-2)"; e.currentTarget.style.color = palette.primaryText; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = palette.tertiaryText; }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
            </svg>
            Browse
          </button>
        </div>
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
        {(() => {
          const isWideView = showWelcome && vault.connected && (view === "triage" || view === "graph");
          return (
        <div
          style={{
            // Triage list + graph want edge-to-edge width; chat/welcome stays at 880px max for readability.
            maxWidth: isWideView ? "none" : 880,
            margin: "0 auto",
            padding: isWideView ? 0 : "0 32px 120px",
            minHeight: showWelcome ? "calc(100vh - 48px - 88px)" : undefined,
            display: showWelcome ? "flex" : undefined,
            flexDirection: showWelcome ? "column" : undefined,
            // Triage/graph anchor at top; chat welcome centers vertically.
            justifyContent: showWelcome
              ? (isWideView ? "flex-start" : "center")
              : undefined,
            height: showWelcome && view === "graph" && vault.connected ? "calc(100vh - 48px)" : undefined,
          }}
        >
          <AnimatePresence>
            {showWelcome && view === "triage" && vault.connected && (
              <motion.div
                key="triage"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  // Fill available vertical space so the triage list scrolls internally.
                  minHeight: "calc(100vh - 48px - 88px)",
                }}
              >
                <TriageInbox onOpen={openDetail} onAsk={handleSubmit} />
              </motion.div>
            )}
            {showWelcome && view === "graph" && vault.connected && (
              <motion.div
                key="graph"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                  // Graph is edge-to-edge and needs an explicit height so the
                  // canvas inside can fill it.
                  height: "calc(100vh - 48px - 88px)",
                }}
              >
                <GraphView onOpen={openDetail} />
              </motion.div>
            )}
            {showWelcome && !((view === "triage" || view === "graph") && vault.connected) && (
              <motion.div
                key="welcome"
                // Linear-style: content appears instantly on first paint.
                // Only animate on exit so the transition to chat feels intentional.
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.14 } }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                }}
              >
                {!vault.loading && !vault.connected ? (
                  /* ────────────────────────────────────────────────
                     STATE 1 — No vault: centered takeover wizard.
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
                ) : (
                  /* ────────────────────────────────────────────────
                     STATE 2 — Connected: no big hero. Dense,
                     Linear-style information surface. Single row of
                     starter chips + 2-col grid of Recent + Open.
                     The bottom input is the action surface, not a
                     giant headline.
                     ──────────────────────────────────────────────── */
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      paddingTop: 48,
                      paddingBottom: 48,
                      gap: 48,
                    }}
                  >
                    {/* Starter chips — clean filter-style, no chevrons */}
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                        <span
                          className="mono-label"
                          style={{
                            color: palette.quaternaryText,
                            letterSpacing: "0.04em",
                            marginRight: 6,
                          }}
                        >
                          Try
                        </span>
                        {quickActions.map((qa) => (
                          <button
                            key={qa.label}
                            onClick={() => handleSubmit(qa.label)}
                            className="welcome-chip"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "4px 10px",
                              borderRadius: 999,
                              border: `1px solid ${palette.borderStandard}`,
                              background: "transparent",
                              color: palette.secondaryText,
                              fontSize: 12,
                              fontWeight: 500,
                              letterSpacing: -0.05,
                              cursor: "pointer",
                              transition: "background-color 0.15s, border-color 0.15s, color 0.15s, transform 0.15s",
                            }}
                          >
                            {qa.label}
                          </button>
                        ))}
                      </div>
                    </motion.div>

                    {/* Dense 2-col grid — use minmax(0,1fr) so long
                        content truncates instead of blowing out the column. */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                      className="welcome-grid"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                        gap: 48,
                      }}
                    >
                      {/* Recent column */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                            paddingBottom: 8,
                            borderBottom: `1px solid ${palette.borderSubtle}`,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: palette.quaternaryText }}>
                              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
                            </svg>
                            <span className="mono-label" style={{ color: palette.tertiaryText, letterSpacing: "0.04em" }}>
                              Recent
                            </span>
                          </div>
                          {recentQueries.length > 0 && (
                            <span className="mono-label" style={{ color: palette.quaternaryText, fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}>
                              {recentQueries.length}
                            </span>
                          )}
                        </div>
                        {recentQueries.length === 0 ? (
                          <p style={{ fontSize: 12, color: palette.quaternaryText, margin: 0, padding: "6px 0" }}>
                            Your recent questions will appear here.
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {recentQueries.slice(0, 6).map((query, i) => (
                              <button
                                key={i}
                                onClick={() => handleSubmit(query)}
                                className="welcome-row"
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  padding: "8px 12px",
                                  height: 32,
                                  margin: "0 -10px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  textAlign: "left",
                                  color: palette.secondaryText,
                                  fontSize: 13,
                                  fontWeight: 400,
                                  lineHeight: 1.35,
                                  transition: "background-color 0.12s, color 0.12s",
                                  minWidth: 0,
                                  width: "calc(100% + 20px)",
                                }}
                              >
                                <span
                                  style={{
                                    width: 14, height: 14, borderRadius: "50%",
                                    background: "transparent",
                                    border: `1px solid ${palette.borderStandard}`,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  <span
                                    className="mono-label"
                                    style={{
                                      fontSize: 9,
                                      color: palette.quaternaryText,
                                      letterSpacing: 0,
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {i + 1}
                                  </span>
                                </span>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                                  {query}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Open tasks column */}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                            paddingBottom: 8,
                            borderBottom: `1px solid ${palette.borderSubtle}`,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ color: palette.quaternaryText }}>
                              <rect x="4" y="4" width="16" height="16" rx="3" />
                              <path d="M9 12l2 2 4-4" />
                            </svg>
                            <span className="mono-label" style={{ color: palette.tertiaryText, letterSpacing: "0.04em" }}>
                              Open tasks
                            </span>
                          </div>
                          {!loadingTasks && openTasks.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSubmit("What am I working on?")}
                              className="mono-label"
                              style={{
                                color: palette.quaternaryText,
                                fontVariantNumeric: "tabular-nums",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 0,
                                letterSpacing: "0.04em",
                                transition: "color 0.12s",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = palette.secondaryText; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = palette.quaternaryText; }}
                            >
                              View all
                              <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M12 5l7 7-7 7" />
                              </svg>
                            </button>
                          )}
                        </div>
                        {loadingTasks ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {[0, 1, 2, 3].map((i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", height: 32 }}>
                                <div
                                  className="animate-shimmer"
                                  style={{
                                    width: 14, height: 14, borderRadius: 4,
                                    border: `1px solid ${palette.borderStandard}`,
                                    flexShrink: 0, animationDelay: `${i * 0.12}s`,
                                  }}
                                />
                                <div
                                  className="animate-shimmer"
                                  style={{
                                    height: 11, width: `${50 + i * 10}%`, borderRadius: 3,
                                    animationDelay: `${i * 0.12}s`,
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        ) : openTasks.length === 0 ? (
                          <p style={{ fontSize: 12, color: palette.quaternaryText, margin: 0, padding: "6px 0" }}>
                            No open tasks.
                          </p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {openTasks.slice(0, 6).map((task) => {
                              const priorityColor = task.priority === "high"
                                ? "var(--status-blocked)"
                                : task.priority === "medium"
                                ? "var(--status-in-progress)"
                                : null;
                              return (
                                <button
                                  key={task.id}
                                  onClick={() => handleSubmit(`show details for ${task.text}`)}
                                  className="welcome-row"
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 12px",
                                  height: 32,
                                    margin: "0 -10px",
                                    borderRadius: 6,
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    transition: "background-color 0.12s",
                                    minWidth: 0,
                                    width: "calc(100% + 20px)",
                                  }}
                                >
                                  <span
                                    style={{
                                      width: 14, height: 14, borderRadius: 4,
                                      background: "transparent",
                                      border: `1.5px solid ${palette.quaternaryText}`,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 400,
                                      lineHeight: 1.35,
                                      color: palette.primaryText,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                      flex: 1,
                                      minWidth: 0,
                                    }}
                                  >
                                    {task.text}
                                  </span>
                                  {priorityColor && (
                                    <span
                                      style={{
                                        width: 5, height: 5, borderRadius: "50%",
                                        background: priorityColor, flexShrink: 0,
                                        boxShadow: `0 0 0 2px ${palette.panelDark}`,
                                      }}
                                    />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Message list ────────────────────────────────────────── */}
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
                                <ViewRenderer view={view} index={viewIndex} onNavigate={openDetail} onToggle={handleToggle} onAsk={handleSubmit} />
                              </motion.div>
                            );
                          })}
                        </div>
                        {/* A4: Quick reply pills after views */}
                        {msg.response && revealedMessages.has(msg.id) && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginTop: 24,
                              marginBottom: 8,
                            }}
                          >
                            {getQuickReplies(msg.response.response.views, msg.response.request?.entityName).map((reply) => (
                              <motion.button
                                key={reply.label}
                                whileHover={{
                                  backgroundColor: "rgba(255,255,255,0.06)",
                                  borderColor: "rgba(255,255,255,0.14)",
                                }}
                                onClick={() => handleSubmit(reply.query)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "6px 14px",
                                  borderRadius: 9999,
                                  fontSize: 13,
                                  fontWeight: 510,
                                  letterSpacing: "-0.13",
                                  lineHeight: 1.5,
                                  color: palette.tertiaryText,
                                  backgroundColor: "rgba(255,255,255,0.02)",
                                  border: `1px solid ${palette.pillBorder}`,
                                  cursor: "pointer",
                                  transition: "background-color 0.15s, border-color 0.15s",
                                }}
                              >
                                {reply.label}
                              </motion.button>
                            ))}
                          </motion.div>
                        )}
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
        </div>
          );
        })()}
      </div>

      {/* ── Chat input ─────────────────────────────────────────────── */}
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
        @media (max-width: 720px) {
          .welcome-grid {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
          }
        }
        /* Welcome chip — subtle, settles on hover. No motion.button overhead. */
        .welcome-chip:hover {
          background-color: var(--bg-surface-alpha-2);
          border-color: var(--border-solid-primary);
          color: var(--text-primary);
        }
        /* Row hover — subtle fill + 2px brand rail on the leading edge.
           Linear uses this exact pattern for list rows: gentle invitation, not a shout. */
        .welcome-row {
          position: relative;
        }
        .welcome-row::before {
          content: "";
          position: absolute;
          left: 0;
          top: 6px;
          bottom: 6px;
          width: 2px;
          border-radius: 2px;
          background: transparent;
          transition: background 0.12s ease-out;
        }
        .welcome-row:hover {
          background-color: var(--bg-surface-alpha-2);
          color: var(--text-primary);
        }
        .welcome-row:hover::before {
          background: var(--accent-brand);
        }
      `}</style>
      <VaultDrawer
        open={vaultDrawerOpen}
        onClose={() => setVaultDrawerOpen(false)}
        onNavigate={(query) => {
          setVaultDrawerOpen(false);
          handleSubmit(query);
        }}
        onOpenFile={(path) => {
          setVaultDrawerOpen(false);
          openDetail(path);
        }}
      />
      {/* Persistent shortcut hint — hides while typing, detail page open, drawer open, or palette open */}
      <HintChip hidden={input.length > 0 || !!detailPath || vaultDrawerOpen || paletteOpen} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />
      </div>
    </div>
  );
}