"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fadeSlideUp } from "@/lib/motion";
import { TaskGroup as TaskGroupType, TaskItem as TaskItemType } from "@/lib/view-models";
import { StatusDot } from "@/components/ui";

// ─── Design tokens ───────────────────────────────────────────────────
const tokens = {
  bg: {
    marketing: "#08090a",
    panel: "#0f1011",
    surface: "#191a1b",
    secondary: "#28282c",
  },
  text: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },
  brand: {
    indigo: "#5e6ad2",
    violet: "#7170ff",
    hover: "#828fff",
  },
  status: {
    success: "#27a644",
    emerald: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    infoBlue: "#3b82f6",
  },
  border: {
    subtle: "rgba(255,255,255,0.05)",
    standard: "rgba(255,255,255,0.08)",
    solid: "#23252a",
  },
};

// ─── Status configuration ────────────────────────────────────────────
const statusConfig: Record<string, { color: string; bgColor: string; label: string; dotStatus: string }> = {
  open: {
    color: tokens.status.infoBlue,
    bgColor: "rgba(59,130,246,0.12)",
    label: "Open",
    dotStatus: "open",
  },
  in_progress: {
    color: tokens.status.warning,
    bgColor: "rgba(245,158,11,0.12)",
    label: "In progress",
    dotStatus: "in_progress",
  },
  done: {
    color: tokens.status.emerald,
    bgColor: "rgba(16,185,129,0.12)",
    label: "Done",
    dotStatus: "done",
  },
  blocked: {
    color: tokens.status.error,
    bgColor: "rgba(239,68,68,0.12)",
    label: "Blocked",
    dotStatus: "blocked",
  },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  high:   { color: tokens.status.error,     label: "High" },
  medium: { color: tokens.status.warning,   label: "Medium" },
  low:    { color: tokens.text.quaternary,   label: "Low" },
};

// ─── Inline Edit Component ───────────────────────────────────────────
function InlineEdit({ text, onSave, onCancel }: { text: string; onSave: (newText: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      style={{ overflow: "hidden" }}
    >
      <div style={{ marginTop: 4 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            minHeight: 60,
            padding: "8px 10px",
            fontSize: 14,
            lineHeight: 1.5,
            fontFamily: '"Inter Variable", sans-serif',
            fontFeatureSettings: '"cv01", "ss03"',
            color: tokens.text.primary,
            backgroundColor: "#0f1011",
            border: `1px solid rgba(255,255,255,0.08)`,
            borderRadius: 6,
            resize: "vertical",
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(value);
          }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <button
            onClick={() => onSave(value)}
            style={{
              fontSize: 11,
              fontWeight: 510,
              fontFamily: '"Inter Variable", sans-serif',
              fontFeatureSettings: '"cv01", "ss03"',
              color: tokens.text.primary,
              background: "rgba(255,255,255,0.06)",
              border: `1px solid rgba(255,255,255,0.08)`,
              borderRadius: 4,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            onClick={onCancel}
            style={{
              fontSize: 11,
              fontWeight: 510,
              fontFamily: '"Inter Variable", sans-serif',
              fontFeatureSettings: '"cv01", "ss03"',
              color: tokens.text.quaternary,
              background: "transparent",
              border: "none",
              borderRadius: 4,
              padding: "3px 10px",
              cursor: "pointer",
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
export function TaskItemRow({ item, index = 0, onToggle, filePath, lineIndex }: { item: TaskItemType; index?: number; onToggle?: (itemId: string, checked: boolean) => void; filePath?: string; lineIndex?: number }) {
  const status = statusConfig[item.status] || statusConfig.open;
  const priority = item.priority ? priorityConfig[item.priority] : undefined;
  const isToggleable = item.status === "open" || item.status === "done";
  const [isDone, setIsDone] = useState(item.status === "done");
  const [flash, setFlash] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleToggle = useCallback(() => {
    if (!isToggleable || !onToggle) return;
    const newDone = !isDone;
    setIsDone(newDone);
    setFlash(true);
    setTimeout(() => setFlash(false), 400);
    onToggle(item.id, newDone);
  }, [isDone, isToggleable, onToggle, item.id]);

  const handleEditSave = useCallback(async (newText: string) => {
    if (!filePath || lineIndex === undefined) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath, lineIndex, newText }),
      });
      if (res.ok) {
        // Refresh would need to happen at parent level; for now close editor
        setEditing(false);
      }
    } catch {
      // Silently fail for now
    }
    setSaving(false);
  }, [filePath, lineIndex]);

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      transition={{ delay: index * 0.04 }}
      className="group"
    >
      {/* Row with green flash background */}
      <motion.div
        className="flex items-start gap-3 py-3 rounded-[6px] -mx-2 px-2"
        style={{ cursor: isToggleable ? "pointer" : "default", position: "relative" }}
        onClick={handleToggle}
        onMouseEnter={(e) => { if (isToggleable) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"; }}
        onMouseLeave={(e) => { if (isToggleable) e.currentTarget.style.backgroundColor = "transparent"; }}
      >
        {/* Green flash overlay */}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 6,
                backgroundColor: "rgba(16,185,129,0.06)",
                pointerEvents: "none",
              }}
            />
          )}
        </AnimatePresence>

        {/* Status dot — animated checkbox circle */}
        <div className="pt-1.5 shrink-0">
          <StatusDot
            status={status.dotStatus}
            size={6}
            checked={isDone}
            interactive={isToggleable}
            onClick={handleToggle}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0" style={{ position: "relative" }}>
          <p
            className="text-[15px] leading-[1.6] tracking-[-0.165px]"
            style={{
              color: isDone ? tokens.text.quaternary : tokens.text.primary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
              transition: "color 0.3s, opacity 0.3s",
              opacity: isDone ? 0.5 : 1,
            }}
          >
            {/* Strikethrough with animated clip */}
            <span style={{ position: "relative", display: "inline" }}>
              {item.text}
              <motion.span
                initial={{ scaleX: isDone ? 1 : 0 }}
                animate={{ scaleX: isDone ? 1 : 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  width: "100%",
                  height: "1px",
                  backgroundColor: tokens.text.quaternary,
                  transformOrigin: "left center",
                  pointerEvents: "none",
                }}
              />
            </span>
          </p>
          {item.links && item.links.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1.5">
              {item.links.map((link, i) => (
                <a
                  key={i}
                  href="#"
                  className="inline-flex items-center gap-1 text-[13px] font-[510] transition-colors duration-150 hover:brightness-125"
                  style={{
                    color: tokens.brand.violet,
                    fontFamily: "'Inter Variable', sans-serif",
                    fontFeatureSettings: '"cv01", "ss03"',
                  }}
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
              {item.related.map((rel, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded-[2px] text-[11px] font-[510]"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    color: tokens.text.quaternary,
                    fontFamily: "'Inter Variable', sans-serif",
                    fontFeatureSettings: '"cv01", "ss03"',
                  }}
                >
                  {rel.kind && <span style={{ marginRight: 4, opacity: 0.6 }}>{rel.kind}</span>}
                  {rel.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Priority */}
        {priority && (
          <span
            className="text-[11px] font-[510] uppercase tracking-[0.08em] shrink-0 mt-1.5"
            style={{
              color: priority.color,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            {priority.label}
          </span>
        )}

        {/* Edit label — appears on hover */}
        {filePath && (
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0 mt-1"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            style={{
              fontSize: 11,
              fontWeight: 510,
              color: tokens.text.quaternary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px 4px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = tokens.brand.violet; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = tokens.text.quaternary; }}
          >
            edit
          </button>
        )}
      </motion.div>

      {/* Inline edit textarea */}
      <AnimatePresence>
        {editing && (
          <InlineEdit
            text={item.text}
            onSave={handleEditSave}
            onCancel={() => setEditing(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── TaskGroupComponent ──────────────────────────────────────────────
export function TaskGroupComponent({ group, index = 0, onToggle, filePath }: { group: TaskGroupType; index?: number; onToggle?: (itemId: string, checked: boolean) => void; filePath?: string }) {
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      transition={{ delay: (index || 0) * 0.04 }}
      className="rounded-[8px] overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: `1px solid rgba(255,255,255,0.08)`,
      }}
    >
      {/* Group header — section label style */}
      <div className="px-6 pt-6 pb-2">
        <h3
          className="text-[11px] font-[510] uppercase tracking-[0.08em]"
          style={{
            color: tokens.text.quaternary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {group.label}
        </h3>
      </div>

      {/* Task list */}
      <div className="px-4 pb-4">
        {group.items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col items-center justify-center py-12"
          >
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#62666d"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginBottom: 8, opacity: 0.3 }}
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p
              className="text-[14px]"
              style={{
                color: "#62666d",
                fontFamily: "'Inter Variable', sans-serif",
                fontFeatureSettings: '"cv01", "ss03"',
              }}
            >
              No items
            </p>
          </motion.div>
        ) : (
          group.items.map((item, i) => (
            <TaskItemRow key={item.id} item={item} index={i} onToggle={onToggle} filePath={filePath} lineIndex={item.lineIndex} />
          ))
        )}
      </div>
    </motion.div>
  );
}