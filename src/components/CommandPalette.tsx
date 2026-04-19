"use client";

/**
 * Command K command palette with fuzzy-scored actions + grouped sections.
 * Keyboard: up/down/jk navigate, Enter runs, Esc closes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Kbd } from "@/components/ui";
import { useListNavigation } from "@/lib/hooks/useListNavigation";
import { rankScore } from "@/lib/fuzzy";
import { useVaultIndex } from "@/lib/hooks/useVaultIndex";
import { useRecentFiles, type RecentEntry } from "@/lib/hooks/useRecentFiles";
import { useSidebarPins } from "@/lib/hooks/useSidebarPins";
import { useSheet } from "@/lib/hooks/useSheet";
import { useRouter } from "next/navigation";
import { PinIcon } from "@/components/ui/PinIcon";
import type { PinEntry } from "@/lib/settings";

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

export type PaletteResult =
  | { kind: "recent"; path: string; name: string; folder: string; entry: RecentEntry }
  | { kind: "pin"; pin: PinEntry }
  | { kind: "file"; path: string; name: string; folder: string; bonus: { recent: boolean; frequent: boolean } }
  | { kind: "entity"; path: string; name: string }
  | { kind: "project"; path: string; name: string }
  | { kind: "heading"; slug: string; label: string; filePath: string }
  | { kind: "command"; action: PaletteAction }
  | { kind: "fallback-chat"; query: string };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
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

  const router = useRouter();
  const sheet = useSheet();
  const { index } = useVaultIndex();
  const { entries: recentEntries, push: pushRecent } = useRecentFiles();
  const { pins } = useSidebarPins();

  const activateResult = useCallback((result: PaletteResult, newTab: boolean) => {
    switch (result.kind) {
      case "recent":
      case "file":
        if (newTab) router.push(`/file/${result.path}`);
        else sheet.open(result.path);
        pushRecent(result.path);
        return;
      case "pin":
        router.push("/browse");
        return;
      case "entity":
      case "project":
        if (newTab) router.push(`/file/${result.path}`);
        else sheet.open(result.path);
        pushRecent(result.path);
        return;
      case "heading":
        sheet.open(result.filePath, result.slug);
        return;
      case "command":
        result.action.run();
        return;
      case "fallback-chat":
        router.push(`/chat?q=${encodeURIComponent(result.query)}`);
        return;
    }
  }, [router, sheet, pushRecent]);

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

  // ── Empty state (query === "") ────────────────────────────────────
  const emptyResults: PaletteResult[] = useMemo(() => {
    const out: PaletteResult[] = [];
    // Recent files (up to 5).
    for (const entry of recentEntries.slice(0, 5)) {
      const f = index.files.find((x) => x.path === entry.path);
      if (f) out.push({ kind: "recent", path: f.path, name: f.name, folder: f.folder, entry });
      else out.push({ kind: "recent", path: entry.path, name: entry.path.split("/").pop()?.replace(/\.md$/i, "") ?? entry.path, folder: entry.path.includes("/") ? entry.path.split("/").slice(0, -1).join("/") : "", entry });
    }
    // Pins.
    for (const pin of pins) out.push({ kind: "pin", pin });
    // Commands.
    for (const action of actions) out.push({ kind: "command", action });
    return out;
  }, [recentEntries, index.files, pins, actions]);

  // ── Typed state (query.length > 0) ─────────────────────────────────
  const { prefix, body } = useMemo(() => {
    const q = query;
    if (q.startsWith(">")) return { prefix: ">" as const, body: q.slice(1) };
    if (q.startsWith("@")) return { prefix: "@" as const, body: q.slice(1) };
    if (q.startsWith("#")) return { prefix: "#" as const, body: q.slice(1) };
    return { prefix: null as null, body: q };
  }, [query]);

  const openFilePath = sheet.path;

  // Cache of headings for the currently-open sheet file — fetched once per path.
  const [sheetHeadings, setSheetHeadings] = useState<{ path: string; headings: { slug: string; label: string }[] } | null>(null);
  useEffect(() => {
    if (prefix !== "#" || !openFilePath) return;
    if (sheetHeadings?.path === openFilePath) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/file?path=${encodeURIComponent(openFilePath)}`);
        if (!res.ok) return;
        const body = await res.json();
        const sections: { heading: string }[] = body?.sections ?? [];
        const headings = sections.map((s) => ({
          slug: s.heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
          label: s.heading,
        }));
        if (!cancelled) setSheetHeadings({ path: openFilePath, headings });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [prefix, openFilePath, sheetHeadings?.path]);

  // Build candidate rows per prefix, then rank by rankScore.
  const typedResults: PaletteResult[] = useMemo(() => {
    if (query.trim() === "") return [];
    const bodyTrim = body.trim();
    const candidates: { result: PaletteResult; searchText: string; bonus?: { recent: boolean; frequent: boolean } }[] = [];

    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    const now = Date.now();
    const recentMap = new Map(recentEntries.map((e) => [e.path, e]));

    const fileBonus = (path: string) => {
      const e = recentMap.get(path);
      if (!e) return { recent: false, frequent: false };
      const recent = now - e.openedAt < DAY;
      const frequent = e.count >= 3 && now - e.openedAt < WEEK;
      return { recent, frequent };
    };

    if (prefix === ">") {
      for (const action of actions) candidates.push({ result: { kind: "command", action }, searchText: action.label });
    } else if (prefix === "@") {
      for (const e of index.entities) candidates.push({ result: { kind: "entity", path: e.path, name: e.name }, searchText: e.name });
      for (const p of index.projects) candidates.push({ result: { kind: "project", path: p.path, name: p.name }, searchText: p.name });
    } else if (prefix === "#") {
      // Headings inside the currently-open sheet only. If no sheet, return an info row.
      if (!openFilePath) {
        candidates.push({ result: { kind: "fallback-chat", query: "Open a file first to jump to headings" }, searchText: "" });
      } else if (sheetHeadings?.path === openFilePath) {
        for (const h of sheetHeadings.headings) {
          candidates.push({
            result: { kind: "heading", slug: h.slug, label: h.label, filePath: openFilePath },
            searchText: h.label,
          });
        }
      }
    } else {
      // Default merged scope.
      for (const f of index.files) candidates.push({ result: { kind: "file", path: f.path, name: f.name, folder: f.folder, bonus: fileBonus(f.path) }, searchText: f.name, bonus: fileBonus(f.path) });
      for (const p of pins) candidates.push({ result: { kind: "pin", pin: p }, searchText: p.label });
      for (const e of index.entities) candidates.push({ result: { kind: "entity", path: e.path, name: e.name }, searchText: e.name });
      for (const p of index.projects) candidates.push({ result: { kind: "project", path: p.path, name: p.name }, searchText: p.name });
      for (const action of actions) candidates.push({ result: { kind: "command", action }, searchText: action.label });
    }

    // Rank.
    const ranked = candidates
      .map((c) => ({ ...c, score: rankScore(bodyTrim, c.searchText, c.bonus) }))
      .filter((c) => c.score !== null)
      .sort((a, b) => (b.score! - a.score!));

    const results = ranked.slice(0, 50).map((r) => r.result);
    if (results.length === 0 && bodyTrim.length > 0 && prefix !== "#") {
      results.push({ kind: "fallback-chat", query: bodyTrim });
    }
    return results;
  }, [query, body, prefix, actions, index.entities, index.projects, index.files, pins, recentEntries, openFilePath, sheetHeadings]);

  const listItems: PaletteResult[] = query.trim() === "" ? emptyResults : typedResults;
  const { activeIndex, setActiveIndex, listProps, itemProps } = useListNavigation({
    items: listItems,
    enabled: open,
    onSelect: (result) => {
      activateResult(result, false);
      onClose();
    },
  });

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
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const next = nextPrefix(prefix);
                    setQuery(next === null ? "" : next);
                    setActiveIndex(0);
                    return;
                  }
                  if (e.key === "Backspace" && e.currentTarget.selectionStart === 0 && prefix !== null) {
                    e.preventDefault();
                    setQuery("");
                    setActiveIndex(0);
                  }
                }}
                placeholder={prefixPlaceholder(prefix)}
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
              {query.trim() === "" ? (
                <EmptyStateGroups
                  results={emptyResults}
                  activeIndex={activeIndex}
                  itemProps={itemProps}
                  onActivate={(r, newTab) => {
                    activateResult(r, newTab);
                    onClose();
                  }}
                />
              ) : (
                <TypedStateList
                  results={typedResults}
                  activeIndex={activeIndex}
                  itemProps={itemProps}
                  onActivate={(r, newTab) => {
                    activateResult(r, newTab);
                    onClose();
                  }}
                />
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
                  <span className="ml-1">open</span>
                </span>
                <span className="flex items-center gap-1">
                  <Kbd>Tab</Kbd>
                  <span className="ml-1">prefix</span>
                </span>
              </div>
              <div className="micro text-text-quaternary">
                {listItems.length} {listItems.length === 1 ? "result" : "results"}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

interface EmptyStateGroupsProps {
  results: PaletteResult[];
  activeIndex: number;
  itemProps: (i: number) => React.HTMLAttributes<HTMLElement>;
  onActivate: (r: PaletteResult, newTab: boolean) => void;
}

function EmptyStateGroups({ results, activeIndex, itemProps, onActivate }: EmptyStateGroupsProps) {
  const recents = results.filter((r) => r.kind === "recent");
  const pins = results.filter((r) => r.kind === "pin");
  const commands = results.filter((r) => r.kind === "command");
  const sections: { label: string; count?: number; items: PaletteResult[] }[] = [];
  if (recents.length) sections.push({ label: "Recent", count: recents.length, items: recents });
  if (pins.length) sections.push({ label: "Pinned", count: pins.length, items: pins });
  if (commands.length) sections.push({ label: "Commands", items: commands });

  let flatIndex = 0;
  return (
    <>
      {sections.map((section) => {
        const sectionStart = flatIndex;
        flatIndex += section.items.length;
        return (
          <div key={section.label}>
            <div className="flex items-center justify-between px-4 pt-3 pb-1 micro uppercase tracking-[0.08em] text-text-quaternary">
              <span>{section.label}</span>
              {section.count !== undefined && (
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{section.count}</span>
              )}
            </div>
            {section.items.map((result, i) => {
              const idx = sectionStart + i;
              const ip = itemProps(idx);
              const active = idx === activeIndex;
              return (
                <PaletteRow
                  key={resultKey(result)}
                  {...ip}
                  result={result}
                  active={active}
                  onPointerUp={(e) => { if (e.button === 0) onActivate(result, e.metaKey || e.ctrlKey); }}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}

function resultKey(r: PaletteResult): string {
  switch (r.kind) {
    case "recent": return `recent:${r.path}`;
    case "pin": return `pin:${r.pin.id}`;
    case "file": return `file:${r.path}`;
    case "entity": return `entity:${r.path}`;
    case "project": return `project:${r.path}`;
    case "heading": return `heading:${r.filePath}#${r.slug}`;
    case "command": return `command:${r.action.id}`;
    case "fallback-chat": return "fallback-chat";
  }
}

interface TypedStateListProps {
  results: PaletteResult[];
  activeIndex: number;
  itemProps: (i: number) => React.HTMLAttributes<HTMLElement>;
  onActivate: (r: PaletteResult, newTab: boolean) => void;
}
function TypedStateList({ results, activeIndex, itemProps, onActivate }: TypedStateListProps) {
  if (results.length === 0) return null;
  return (
    <>
      {results.map((result, idx) => {
        const ip = itemProps(idx);
        const active = idx === activeIndex;
        return (
          <PaletteRow
            key={resultKey(result)}
            {...ip}
            result={result}
            active={active}
            onPointerUp={(e) => { if (e.button === 0) onActivate(result, e.metaKey || e.ctrlKey); }}
          />
        );
      })}
    </>
  );
}

function nextPrefix(p: ">" | "@" | "#" | null): string | null {
  switch (p) {
    case null: return ">";
    case ">": return "@";
    case "@": return "#";
    case "#": return null;
  }
}

function prefixPlaceholder(prefix: ">" | "@" | "#" | null): string {
  switch (prefix) {
    case ">": return "Run a command…";
    case "@": return "Find an entity or project…";
    case "#": return "Jump to a heading in the open file…";
    default: return "Search files, pins, commands…";
  }
}

interface PaletteRowProps extends React.HTMLAttributes<HTMLButtonElement> {
  result: PaletteResult;
  active: boolean;
}
function PaletteRow({ result, active, ...rest }: PaletteRowProps) {
  const label = rowLabel(result);
  const secondary = rowSecondary(result);
  return (
    <button
      type="button"
      tabIndex={-1}
      {...rest}
      className="w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-75"
      style={{
        background: active ? "var(--bg-surface-alpha-4)" : "transparent",
        borderLeft: active ? "2px solid var(--accent-brand)" : "2px solid transparent",
        cursor: "pointer",
      }}
    >
      <span className="shrink-0 text-text-tertiary flex items-center justify-center" style={{ width: 16, height: 16 }}>
        {rowIcon(result)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="caption-large text-text-primary truncate">{label}</div>
        {secondary && <div className="caption text-text-quaternary truncate">{secondary}</div>}
      </div>
    </button>
  );
}

function rowLabel(r: PaletteResult): string {
  switch (r.kind) {
    case "recent": case "file": return r.name;
    case "pin": return r.pin.label;
    case "entity": case "project": return r.name;
    case "heading": return r.label;
    case "command": return r.action.label;
    case "fallback-chat": return `Ask chat: "${r.query}"`;
  }
}

function rowSecondary(r: PaletteResult): string | null {
  switch (r.kind) {
    case "recent": case "file": return r.folder || null;
    case "pin": return r.pin.path;
    case "entity": return "entity";
    case "project": return "project";
    case "heading": return r.filePath;
    case "command": return r.action.description ?? null;
    case "fallback-chat": return "open /chat";
  }
}

function rowIcon(r: PaletteResult): React.ReactNode {
  switch (r.kind) {
    case "recent": case "file":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>;
    case "pin":
      return <PinIcon name={r.pin.icon} />;
    case "entity":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/></svg>;
    case "project":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>;
    case "heading":
      return <span className="mono-label">#</span>;
    case "command":
      return r.action.icon ?? <span>→</span>;
    case "fallback-chat":
      return <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>;
  }
}
