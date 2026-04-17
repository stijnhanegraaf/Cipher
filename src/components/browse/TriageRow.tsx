"use client";

import { TriageRow as TriageRowType } from "@/lib/triage-builder";
import { PriorityGlyph } from "./PriorityGlyph";
import { StatusDot } from "@/components/ui";
import { formatFreshness } from "@/lib/format";

/**
 * TriageRow — one 40px row in the triage list.
 *
 * Layout: [leading glyph] [status dot] [title/excerpt] ... [meta] ... [hover actions]
 * Row is a <button> so it inherits Tab focus and keyboard Enter.
 */

interface Props {
  row: TriageRowType;
  onOpen: (path: string) => void;
  onAsk?: (query: string) => void;
}

export function TriageRow({ row, onOpen, onAsk }: Props) {
  const title = rowTitle(row);
  const path = rowPath(row);
  const meta = rowMeta(row);
  const clickable = !!path;

  return (
    <button
      type="button"
      onClick={clickable ? () => onOpen(path!) : undefined}
      disabled={!clickable}
      className="app-row focus-ring group flex items-center gap-3 w-full text-left"
      style={{
        height: 40,
        padding: "0 12px",
        background: "transparent",
        border: "none",
        borderBottom: "1px solid var(--border-subtle)",
        cursor: clickable ? "pointer" : "default",
        transition: "background-color var(--motion-hover) var(--ease-default)",
      }}
    >
      {/* Leading glyph — priority (task) or kind icon */}
      <span style={{ width: 14, height: 14, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {row.kind === "task"
          ? <PriorityGlyph priority={row.priority} size={14} />
          : <KindIcon kind={row.kind} />}
      </span>

      {/* Status column */}
      <span style={{ width: 14, height: 14, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {row.kind === "task"
          ? <StatusDot status={row.status === "blocked" ? "blocked" : row.status === "in_progress" ? "in_progress" : "open"} size={8} />
          : null}
      </span>

      {/* Title / body */}
      <span
        className="small"
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: row.kind === "task" && row.status === "blocked" ? "var(--text-tertiary)" : "var(--text-primary)",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        {title}
      </span>

      {/* Trailing meta (file path + relative time), hidden when row has inline-hover actions showing */}
      <span
        className="mono-label group-hover:opacity-0 transition-opacity duration-150"
        style={{
          color: "var(--text-quaternary)",
          letterSpacing: "0.02em",
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 280,
        }}
      >
        {meta}
      </span>

      {/* Hover actions — appear on row hover/focus. Click-through to open is the default; these are peers. */}
      {clickable && (
        <span
          className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex items-center gap-1 transition-opacity duration-150"
          style={{ flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <HoverIconButton
            label="Open"
            onClick={() => onOpen(path!)}
            icon={
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M7 7h10v10" />
              </svg>
            }
          />
          {onAsk && (
            <HoverIconButton
              label="Ask about this"
              onClick={() => onAsk(`tell me about ${title.slice(0, 80)}`)}
              icon={
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              }
            />
          )}
        </span>
      )}
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function rowTitle(row: TriageRowType): string {
  switch (row.kind) {
    case "task": return row.text;
    case "highlight": return row.summary;
    case "mention": return `${row.fromTitle} mentions ${row.toEntity}`;
    case "activity": return row.title;
  }
}

function rowPath(row: TriageRowType): string | null {
  switch (row.kind) {
    case "task": return row.path;
    case "highlight": return row.path;
    case "mention": return row.fromPath;
    case "activity": return row.path;
  }
}

function rowMeta(row: TriageRowType): string {
  const rel = relTime(rowMtime(row));
  switch (row.kind) {
    case "task": {
      const parts = [shortPath(row.path)];
      if (rel) parts.push(rel);
      return parts.join(" · ");
    }
    case "highlight": return row.path ? `${shortPath(row.source)} · highlight` : "highlight";
    case "mention": return `${shortPath(row.fromPath)} · ${rel}`;
    case "activity": return `${shortPath(row.path)} · ${row.change} · ${rel}`;
  }
}

function rowMtime(row: TriageRowType): number {
  switch (row.kind) {
    case "task": return row.mtime;
    case "highlight": return row.generatedAt;
    case "mention": return row.mtime;
    case "activity": return row.mtime;
  }
}

function shortPath(p: string): string {
  if (!p) return "";
  const parts = p.split("/");
  if (parts.length <= 2) return p.replace(/\.md$/i, "");
  return `${parts[0]}/…/${parts[parts.length - 1].replace(/\.md$/i, "")}`;
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

// ─── Inline sub-components ────────────────────────────────────────────

function KindIcon({ kind }: { kind: "highlight" | "mention" | "activity" }) {
  if (kind === "highlight") {
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--accent-brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.4 7.4H22l-6.2 4.6 2.4 7.4L12 16.8 5.8 21.4l2.4-7.4L2 9.4h7.6z" />
      </svg>
    );
  }
  if (kind === "mention") {
    return (
      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-4 8" />
      </svg>
    );
  }
  // activity
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function HoverIconButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring inline-flex items-center justify-center rounded-[4px] transition-colors duration-150"
      style={{
        width: 24,
        height: 24,
        background: "transparent",
        border: "none",
        color: "var(--text-tertiary)",
        cursor: "pointer",
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
      {icon}
    </button>
  );
}
