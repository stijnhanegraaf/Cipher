"use client";

import { motion } from "framer-motion";
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

// ─── TaskItemRow ──────────────────────────────────────────────────────
export function TaskItemRow({ item, index = 0 }: { item: TaskItemType; index?: number }) {
  const status = statusConfig[item.status] || statusConfig.open;
  const priority = item.priority ? priorityConfig[item.priority] : undefined;

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      transition={{ delay: index * 0.04 }}
      className="flex items-start gap-3 py-3 group rounded-[6px] transition-colors duration-150 -mx-2 px-2"
      style={{ cursor: "default" }}
    >
      {/* Status dot — 6px circle */}
      <div className="pt-1.5 shrink-0">
        <StatusDot status={status.dotStatus} size={6} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] leading-[1.5]"
          style={{
            color: item.status === "done" ? tokens.text.quaternary : tokens.text.primary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
            ...(item.status === "done" ? { textDecoration: "line-through" } : {}),
          }}
        >
          {item.text}
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
          className="text-[11px] font-[510] uppercase tracking-[0.06em] shrink-0 mt-1.5"
          style={{
            color: priority.color,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {priority.label}
        </span>
      )}
    </motion.div>
  );
}

// ─── TaskGroupComponent ──────────────────────────────────────────────
// Cards on dark surfaces with rgba backgrounds, subtle borders
export function TaskGroupComponent({ group, index = 0 }: { group: TaskGroupType; index?: number }) {
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      transition={{ delay: (index || 0) * 0.08 }}
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
        {group.items.map((item, i) => (
          <TaskItemRow key={item.id} item={item} index={i} />
        ))}
      </div>
    </motion.div>
  );
}