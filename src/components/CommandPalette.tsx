"use client";

/**
 * Command K command palette with fuzzy-scored actions + grouped sections.
 * Keyboard: up/down/jk navigate, Enter runs, Esc closes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Kbd } from "@/components/ui";
import { useListNavigation } from "@/lib/hooks/useListNavigation";

export interface PaletteAction {
  id: string;
  /** Short primary label shown in the row. */
  label: string;
  /** Optional group header — items are grouped by this string in render order. */
  group?: string;
  /** Optional subtitle / description shown in lower-contrast text. */
  description?: string;
  /** Optional keyboard shortcut hint — rendered as <Kbd> chips right-aligned. */
  shortcut?: string[];
  /** Optional leading icon. */
  icon?: React.ReactNode;
  /** Run when the row is activated (Enter or click). */
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}

/**
 * Simple fuzzy match — every query char must appear in order in the haystack.
 * Returns a score (lower is better) for ranking; Infinity means no match.
 */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Reward adjacent matches; penalize gaps.
      score += lastMatch === -1 ? ti : ti - lastMatch;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : Infinity;
}

/**
 * Command palette (⌘K).
 * Linear-style: multi-layer shadow, 12px radius, group labels, keyboard-first.
 * Uses useListNavigation for arrow / j / k / Enter / Home / End.
 */
export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset query every time the palette reopens — no stale filter from the previous session.
  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus the input on next tick so it works even if the element was freshly mounted.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Rank actions by fuzzy match. When query is empty, preserve original order so
  // each group stays in the author-intended sequence.
  const filtered = useMemo(() => {
    if (!query.trim()) return actions;
    return actions
      .map((a) => {
        const label = fuzzyScore(query, a.label);
        const desc = a.description ? fuzzyScore(query, a.description) : Infinity;
        const group = a.group ? fuzzyScore(query, a.group) : Infinity;
        return { action: a, score: Math.min(label, desc, group) };
      })
      .filter((r) => r.score !== Infinity)
      .sort((a, b) => a.score - b.score)
      .map((r) => r.action);
  }, [actions, query]);

  const { activeIndex, setActiveIndex, listProps, itemProps } = useListNavigation({
    items: filtered,
    enabled: open,
    onSelect: (action) => {
      action.run();
      onClose();
    },
  });

  // Group rendering — preserve first-occurrence order of group names in filtered list.
  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, PaletteAction[]>();
    for (const a of filtered) {
      const g = a.group ?? "Other";
      if (!byGroup.has(g)) {
        order.push(g);
        byGroup.set(g, []);
      }
      byGroup.get(g)!.push(a);
    }
    return order.map((g) => ({ name: g, items: byGroup.get(g)! }));
  }, [filtered]);

  // Escape closes the palette (useListNavigation handles arrow keys + Enter).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0 z-[400]"
            style={{ backgroundColor: "var(--overlay)" }}
          />
          {/* Dialog */}
          <motion.div
            role="dialog"
            aria-label="Command palette"
            aria-modal="true"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed left-1/2 top-[15vh] -translate-x-1/2 z-[401] w-[560px] max-w-[calc(100vw-32px)] overflow-hidden flex flex-col"
            style={{
              borderRadius: "var(--radius-panel)",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-standard)",
              boxShadow: "var(--shadow-dialog)",
              maxHeight: "min(70vh, 560px)",
            }}
          >
            {/* Search input */}
            <div
              className="flex items-center gap-2 px-4"
              style={{
                height: "var(--row-h-default)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <svg
                className="w-4 h-4 shrink-0 text-text-quaternary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Search commands, queries, actions…"
                className="flex-1 body text-text-primary bg-transparent border-0"
                autoComplete="off"
                spellCheck={false}
              />
              <Kbd>esc</Kbd>
            </div>

            {/* Results */}
            <div
              {...listProps}
              className="flex-1 overflow-y-auto py-1"
              style={{ scrollbarWidth: "thin" }}
            >
              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center caption-large text-text-quaternary">
                  No results for &ldquo;{query}&rdquo;
                </div>
              ) : (
                groups.map((g, gi) => {
                  // Compute per-group starting index for mapping back to useListNavigation's flat index.
                  let flatIndex = 0;
                  for (let i = 0; i < gi; i++) flatIndex += groups[i].items.length;
                  return (
                    <div key={g.name}>
                      <div className="px-4 pt-3 pb-1 micro uppercase tracking-[0.08em] text-text-quaternary">
                        {g.name}
                      </div>
                      {g.items.map((action, i) => {
                        const idx = flatIndex + i;
                        const ip = itemProps(idx);
                        const active = idx === activeIndex;
                        return (
                          <button
                            key={action.id}
                            type="button"
                            tabIndex={-1}
                            {...ip}
                            onPointerUp={(e) => {
                              // Pointer events don't fire on Enter, so this avoids double-firing
                              // with useListNavigation's global Enter handler.
                              if (e.button !== 0) return;
                              action.run();
                              onClose();
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-75"
                            style={{
                              background: active ? "var(--bg-surface-alpha-4)" : "transparent",
                              borderLeft: active ? "2px solid var(--accent-brand)" : "2px solid transparent",
                              cursor: "pointer",
                            }}
                          >
                            {action.icon && (
                              <span className="shrink-0 text-text-tertiary flex items-center justify-center" style={{ width: 16, height: 16 }}>
                                {action.icon}
                              </span>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="caption-large text-text-primary truncate">{action.label}</div>
                              {action.description && (
                                <div className="caption text-text-quaternary truncate">{action.description}</div>
                              )}
                            </div>
                            {action.shortcut && action.shortcut.length > 0 && (
                              <div className="flex items-center gap-1 shrink-0">
                                {action.shortcut.map((k, ki) => (
                                  <Kbd key={ki}>{k}</Kbd>
                                ))}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer with hint */}
            <div
              className="flex items-center justify-between px-4"
              style={{
                height: 36,
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--bg-surface-alpha-2)",
              }}
            >
              <div className="flex items-center gap-3 micro text-text-quaternary">
                <span className="flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  <span className="ml-1">navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>↵</Kbd>
                  <span className="ml-1">select</span>
                </span>
              </div>
              <div className="micro text-text-quaternary">
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
