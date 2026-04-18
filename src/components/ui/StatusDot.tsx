"use client";

/** StatusDot — coloured dot indicating freshness/status, with tooltip. */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springs, easings } from "@/lib/motion";

// ─── Checkbox rendering helper ────────────────────────────────────────
// Renders Obsidian-style checkboxes: checked = filled circle, unchecked = empty circle
export function CheckboxIndicator({ checked, onChange }: { checked: boolean; onChange?: () => void }) {
  return (
    <span
      onClick={onChange ? (e) => { e.preventDefault(); e.stopPropagation(); onChange(); } : undefined}
      className="inline-flex items-center justify-center shrink-0 mr-2 transition-colors duration-150"
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: checked ? "none" : "1.5px solid var(--border-standard)",
        backgroundColor: checked ? "var(--accent-brand)" : "transparent",
        cursor: onChange ? "pointer" : "default",
      }}
    >
      {checked && (
        <svg
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

// ─── StatusDot primitive ─────────────────────────────────────────────
// Unified status indicator. Sweep-2 clean: no hover scale, no whileTap scale,
// critically-damped spring on the one genuine physical toggle (checkbox fill).
export function StatusDot({
  status,
  size = 6,
  checked,
  interactive = false,
  onClick,
}: {
  status: "ok" | "warn" | "error" | "stale" | "fresh" | "in_progress" | "open" | "done" | "blocked" | string;
  size?: number;
  checked?: boolean;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const colorMap: Record<string, string> = {
    ok:          "var(--status-done)",
    fresh:       "var(--status-done)",
    done:        "var(--status-done)",
    in_progress: "var(--status-in-progress)",
    warn:        "var(--status-in-progress)",
    blocked:     "var(--status-blocked)",
    error:       "var(--status-blocked)",
    stale:       "var(--text-quaternary)",
    open:        "var(--status-open)",
  };

  const color = colorMap[status] || "var(--text-quaternary)";
  const isDone = checked !== undefined ? checked : status === "done";
  const [hovered, setHovered] = useState(false);

  const dotColor = interactive ? (isDone ? "var(--accent-brand)" : "transparent") : color;
  const borderColor = interactive
    ? (isDone ? "var(--accent-brand)" : "var(--border-standard)")
    : color;

  return (
    <span
      className="inline-flex items-center justify-center shrink-0 relative overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        backgroundColor: dotColor,
        border: interactive
          ? `1.5px solid ${hovered && !isDone ? "var(--border-solid-primary)" : borderColor}`
          : "none",
        cursor: interactive ? "pointer" : "default",
        transition: "border-color 120ms cubic-bezier(0.25, 0.1, 0.25, 1), background-color 120ms cubic-bezier(0.25, 0.1, 0.25, 1)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        if (!interactive || !onClick) return;
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Indigo fill expanding from center on check — the one physical-feeling toggle */}
      {interactive && (
        <motion.span
          className="absolute"
          style={{
            borderRadius: 4,
            backgroundColor: "var(--accent-brand)",
            top: "50%",
            left: "50%",
            x: "-50%",
            y: "-50%",
          }}
          animate={{
            width: isDone ? size : 0,
            height: isDone ? size : 0,
          }}
          transition={springs.soft}
        />
      )}
      {/* Checkmark — simple fade, 120ms */}
      <AnimatePresence>
        {interactive && isDone && (
          <motion.svg
            key="check"
            width={Math.max(size * 0.6, 8)}
            height={Math.max(size * 0.6, 8)}
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: easings.standard }}
            className="relative z-[1]"
          >
            <path d="M20 6L9 17l-5-5" />
          </motion.svg>
        )}
      </AnimatePresence>
    </span>
  );
}
