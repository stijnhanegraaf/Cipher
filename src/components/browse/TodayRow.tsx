"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PriorityGlyph } from "@/components/browse/PriorityGlyph";
import { useSheet } from "@/lib/hooks/useSheet";
import type { TodayTask } from "@/lib/today-builder";

interface Props {
  task: TodayTask;
  /** Fires when the task is checked off. Parent owns optimistic state + API call + undo. */
  onToggle: (task: TodayTask) => void;
  /** True when this row is visually checked-off + about to fade out. */
  pendingCheck?: boolean;
  /** Forwards chat-query intent for the "Ask about" hover action. */
  onAsk?: (query: string) => void;
}

/**
 * TodayRow — 40px task row.
 *
 * Columns: checkbox · priority glyph · title · right meta (path + rel time) ·
 * hover actions. Checkbox click toggles via parent handler (stopPropagation).
 * Row body click opens the source file as a sheet.
 */
export function TodayRow({ task, onToggle, pendingCheck = false, onAsk }: Props) {
  const router = useRouter();
  const sheet = useSheet();
  const [hovered, setHovered] = useState(false);

  const openSheet = useCallback(() => sheet.open(task.path), [sheet, task.path]);
  const openFull = useCallback(() => router.push(`/file/${task.path}`), [router, task.path]);
  const handleAsk = useCallback(() => onAsk?.(`tell me about ${task.text.slice(0, 80)}`), [onAsk, task.text]);

  const handleCheckbox = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(task);
    },
    [onToggle, task]
  );

  const checked = pendingCheck;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openSheet}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openSheet();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="app-row focus-ring"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        height: 40,
        padding: "0 16px",
        cursor: "pointer",
        textAlign: "left",
        borderBottom: "1px solid var(--border-subtle)",
        opacity: checked ? 0.5 : 1,
        transition: "opacity 180ms cubic-bezier(0.25, 0.1, 0.25, 1)",
      }}
    >
      {/* Checkbox */}
      <span
        role="checkbox"
        aria-checked={checked}
        aria-label="Mark complete"
        onClick={handleCheckbox}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            onToggle(task);
          }
        }}
        tabIndex={0}
        style={{
          width: 14,
          height: 14,
          borderRadius: 3,
          border: `1.5px solid ${checked ? "var(--accent-brand)" : "var(--border-standard)"}`,
          background: checked ? "var(--accent-brand)" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          cursor: "pointer",
          transition: "border-color var(--motion-hover) var(--ease-default), background var(--motion-hover) var(--ease-default)",
        }}
      >
        {checked && (
          <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </span>

      {/* Priority glyph */}
      <span style={{ flexShrink: 0, opacity: checked ? 0.3 : 1, transition: "opacity 180ms" }}>
        <PriorityGlyph priority={task.priority} size={14} />
      </span>

      {/* Title */}
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          lineHeight: 1.4,
          color: task.status === "blocked" ? "var(--text-tertiary)" : "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textDecoration: checked ? "line-through" : "none",
          textDecorationColor: "var(--text-quaternary)",
        }}
      >
        {task.status === "blocked" && (
          <span
            className="mono-label"
            style={{
              marginRight: 8,
              padding: "1px 4px",
              background: "color-mix(in srgb, var(--status-blocked) 15%, transparent)",
              color: "var(--status-blocked)",
              borderRadius: 3,
              letterSpacing: "0.04em",
            }}
          >
            BLK
          </span>
        )}
        {task.text}
      </span>

      {/* Meta / hover actions */}
      {!hovered && (
        <span
          className="mono-label"
          style={{
            color: "var(--text-quaternary)",
            letterSpacing: "0.02em",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {relTime(task.mtime)}
        </span>
      )}
      {hovered && (
        <span
          style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <RowIconButton label="Open full" onClick={openFull}>
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M7 7h10v10" />
            </svg>
          </RowIconButton>
          {onAsk && (
            <RowIconButton label="Ask about" onClick={handleAsk}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </RowIconButton>
          )}
        </span>
      )}
    </div>
  );
}

function RowIconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 4,
        background: "transparent",
        border: "none",
        color: "var(--text-tertiary)",
        cursor: "pointer",
        transition: "background var(--motion-hover) var(--ease-default)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--bg-surface-alpha-4)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-tertiary)";
      }}
    >
      {children}
    </button>
  );
}

function relTime(ms: number): string {
  if (!ms) return "";
  const now = Date.now();
  const diff = now - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return `${Math.floor(diff / 604_800_000)}w ago`;
}
