"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeSlideUp, transition } from "@/lib/motion";
import { TaskGroup as TaskGroupType, TaskItem as TaskItemType } from "@/lib/view-models";
import { StatusDot } from "@/components/ui";

// ─── Status configuration ────────────────────────────────────────────
const statusConfig: Record<string, { color: string; bgColor: string; label: string; dotStatus: string }> = {
  open:        { color: "var(--status-open)",        bgColor: "color-mix(in srgb, var(--status-open) 12%, transparent)",        label: "Open",        dotStatus: "open" },
  in_progress: { color: "var(--status-in-progress)", bgColor: "color-mix(in srgb, var(--status-in-progress) 12%, transparent)", label: "In progress", dotStatus: "in_progress" },
  done:        { color: "var(--status-done)",        bgColor: "color-mix(in srgb, var(--status-done) 12%, transparent)",        label: "Done",        dotStatus: "done" },
  blocked:     { color: "var(--status-blocked)",     bgColor: "color-mix(in srgb, var(--status-blocked) 12%, transparent)",     label: "Blocked",     dotStatus: "blocked" },
};

// Priority bars — left-aligned colored accent, absence = low.
const priorityBars: Record<string, { color: string; heightPct: number }> = {
  high:   { color: "var(--status-blocked)",     heightPct: 100 },
  medium: { color: "var(--status-in-progress)", heightPct: 70 },
  low:    { color: "transparent",                heightPct: 0 },
};

// ─── Inline Edit Component ───────────────────────────────────────────
function InlineEdit({
  text,
  saving,
  error,
  onSave,
  onCancel,
}: {
  text: string;
  saving: boolean;
  error: string | null;
  onSave: (newText: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={transition.normal}
      style={{ overflow: "hidden" }}
    >
      <div className="mt-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          disabled={saving}
          className="w-full caption-large text-text-primary"
          style={{
            minHeight: 60,
            padding: "8px 10px",
            backgroundColor: "var(--bg-panel)",
            border: `1px solid ${error ? "var(--status-blocked)" : "var(--border-standard)"}`,
            borderRadius: 6,
            resize: "vertical",
            opacity: saving ? 0.6 : 1,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(value);
          }}
        />
        {error && (
          <p className="micro mt-1" style={{ color: "var(--status-blocked)" }}>
            {error}
          </p>
        )}
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={() => onSave(value)}
            disabled={saving}
            className="micro text-text-primary cursor-pointer"
            style={{
              background: "var(--bg-surface-alpha-5)",
              border: "1px solid var(--border-standard)",
              borderRadius: 4,
              padding: "4px 12px",
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={onCancel}
            disabled={saving}
            className="micro text-text-quaternary cursor-pointer"
            style={{
              background: "transparent",
              border: "none",
              borderRadius: 4,
              padding: "4px 12px",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── TaskItemRow ──────────────────────────────────────────────────────
export function TaskItemRow({ item, index = 0, onToggle, onNavigate, onAsk, filePath, lineIndex }: { item: TaskItemType; index?: number; onToggle?: (itemId: string, checked: boolean) => void; onNavigate?: (path: string) => void; onAsk?: (query: string) => void; filePath?: string; lineIndex?: number }) {
  const status = statusConfig[item.status] || statusConfig.open;
  const priorityBar = item.priority ? priorityBars[item.priority] : undefined;
  const isToggleable = item.status === "open" || item.status === "done";
  const [isDone, setIsDone] = useState(item.status === "done");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleToggle = useCallback(() => {
    if (!isToggleable || !onToggle) return;
    const newDone = !isDone;
    setIsDone(newDone);
    onToggle(item.id, newDone);
  }, [isDone, isToggleable, onToggle, item.id]);

  const handleEditSave = useCallback(async (newText: string) => {
    if (!filePath || lineIndex === undefined) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const res = await fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, lineIndex, newText }),
      });
      if (!res.ok) {
        let message = `Save failed (${res.status})`;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") message = body.error;
        } catch {}
        setEditError(message);
        return; // stay in edit mode, preserve text
      }
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Network error — couldn't save");
    } finally {
      setSaving(false);
    }
  }, [filePath, lineIndex]);

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      className="group"
    >
      <div
        className={`app-row relative flex items-start gap-3 py-2 px-3 -mx-3 rounded-[6px] transition-colors duration-150 ${isToggleable ? "cursor-pointer hover:bg-[var(--bg-surface-alpha-2)]" : ""}`}
        onClick={handleToggle}
      >
        {/* Priority bar — left edge, Linear-style P0/P1 indicator */}
        {priorityBar && priorityBar.heightPct > 0 && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-[2px]"
            style={{
              width: "3px",
              height: `${priorityBar.heightPct}%`,
              backgroundColor: priorityBar.color,
            }}
          />
        )}

        {/* Status dot — the one motion that genuinely helps (confirms the click) */}
        <div className="pt-0.5 shrink-0">
          <StatusDot
            status={status.dotStatus}
            size={18}
            checked={isDone}
            interactive={isToggleable}
            onClick={handleToggle}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 relative">
          <p
            className={`small ${isDone ? "text-text-quaternary" : "text-text-primary"}`}
            style={{
              transition: "color var(--motion-hover) var(--ease-default), opacity var(--motion-hover) var(--ease-default)",
              opacity: isDone ? 0.55 : 1,
              textDecoration: isDone ? "line-through" : "none",
              textDecorationColor: "var(--text-quaternary)",
            }}
          >
            {item.text}
          </p>
          {item.links && item.links.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {item.links.map((link, i) => (
                <a
                  key={i}
                  href={link.path ? `vault://${link.path}` : "#"}
                  onClick={(e) => {
                    if (onNavigate && link.path) {
                      e.preventDefault();
                      e.stopPropagation();
                      onNavigate(link.path);
                    }
                  }}
                  className="inline-flex items-center gap-1 caption-medium text-accent-violet transition-colors duration-150 hover:text-accent-hover"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  {link.label}
                </a>
              ))}
            </div>
          )}
          {item.related && item.related.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {item.related.map((rel, i) => {
                const inner = (
                  <>
                    {rel.kind && <span style={{ marginRight: 4, opacity: 0.6 }}>{rel.kind}</span>}
                    {rel.label}
                  </>
                );
                if (onAsk) {
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAsk(`tell me about ${rel.label}`);
                      }}
                      className="inline-flex items-center px-2 py-0.5 rounded-[4px] micro text-text-quaternary cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-surface-alpha-4)] hover:text-text-secondary"
                      style={{ background: "var(--bg-surface-alpha-2)", border: "none" }}
                    >
                      {inner}
                    </button>
                  );
                }
                return (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-[4px] micro text-text-quaternary"
                    style={{ background: "var(--bg-surface-alpha-2)" }}
                  >
                    {inner}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* Edit label — appears on hover */}
        {filePath && (
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 mt-1 micro text-text-quaternary hover:text-accent-violet cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            style={{
              background: "none",
              border: "none",
              padding: "2px 4px",
            }}
          >
            edit
          </button>
        )}
      </div>

      {/* Inline edit textarea */}
      <AnimatePresence>
        {editing && (
          <InlineEdit
            text={item.text}
            saving={saving}
            error={editError}
            onSave={handleEditSave}
            onCancel={() => {
              setEditing(false);
              setEditError(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Linear philosophy: don't reorder on toggle — items stay where the source file
// put them. Done items strike-through in place. If the vault file is re-read,
// the new order applies silently on the next render.

// ─── Dominant-status → background tint.
// Subtle — 0.02 alpha — readable only in aggregate, not jarring.
// Groups where most items are in_progress get a faint amber wash,
// mostly-blocked groups get a faint red wash, mostly-done groups
// get a faint emerald wash. Mixed/open groups stay neutral.
function getGroupTint(items: TaskItemType[]): string {
  if (!items || items.length === 0) return "var(--bg-surface-alpha-2)";
  const counts = { open: 0, in_progress: 0, done: 0, blocked: 0 } as Record<string, number>;
  for (const it of items) {
    counts[it.status] = (counts[it.status] ?? 0) + 1;
  }
  const total = items.length;
  // Subtle majority tint — uses color-mix to derive from status vars.
  if (counts.blocked / total >= 0.5)     return "color-mix(in srgb, var(--status-blocked) 3%, transparent)";
  if (counts.in_progress / total >= 0.5) return "color-mix(in srgb, var(--status-in-progress) 3%, transparent)";
  if (counts.done / total >= 0.7)        return "color-mix(in srgb, var(--status-done) 3%, transparent)";
  return "var(--bg-surface-alpha-2)";
}

// ─── TaskGroupComponent ──────────────────────────────────────────────
export function TaskGroupComponent({ group, index = 0, onToggle, onNavigate, onAsk, filePath }: { group: TaskGroupType; index?: number; onToggle?: (itemId: string, checked: boolean) => void; onNavigate?: (path: string) => void; onAsk?: (query: string) => void; filePath?: string }) {
  const tint = getGroupTint(group.items);
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      className="rounded-[8px] overflow-hidden"
      style={{
        background: tint,
        border: "1px solid var(--border-standard)",
      }}
    >
      {/* Group header — section label style */}
      <div className="px-6 pt-6 pb-2">
        <h3 className="micro uppercase tracking-[0.08em] text-text-quaternary">
          {group.label}
        </h3>
      </div>

      {/* Task list */}
      <div className="px-4 pb-4">
        {group.items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={transition.normal}
            className="flex flex-col items-center justify-center py-12"
          >
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mb-2 text-text-quaternary"
              style={{ opacity: 0.3 }}
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="caption-large text-text-quaternary">No items</p>
          </motion.div>
        ) : (
          group.items.map((item, i) => (
            <TaskItemRow key={item.id} item={item} index={i} onToggle={onToggle} onNavigate={onNavigate} onAsk={onAsk} filePath={filePath} lineIndex={item.lineIndex} />
          ))
        )}
      </div>
    </motion.div>
  );
}
