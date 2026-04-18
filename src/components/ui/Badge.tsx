"use client";

import { motion } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { HoverCard } from "./HoverCard";
import { fadeSlideUp } from "@/lib/motion";

// ─── Badge ──────────────────────────────────────────────────────────
// Linear-style pill badge: transparent bg, subtle border, 9999px radius
interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "indigo" | "outline";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

// Variant styles: brand/status color tints are theme-constant (same rgba in light/dark).
// Theme-aware colors (border-solid, text hierarchy) flow through CSS variables.
const badgeVariantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default: "bg-transparent text-text-secondary",
  success: "",
  warning: "",
  error:   "",
  indigo:  "text-accent-violet",
  outline: "bg-transparent text-text-tertiary",
};

const badgeVariantStyles: Record<NonNullable<BadgeProps["variant"]>, React.CSSProperties> = {
  default: { border: "1px solid var(--border-solid-primary)" },
  success: {
    color: "var(--status-done)",
    background: "color-mix(in srgb, var(--status-done) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--status-done) 20%, transparent)",
  },
  warning: {
    color: "var(--status-warning)",
    background: "color-mix(in srgb, var(--status-warning) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--status-warning) 20%, transparent)",
  },
  error: {
    color: "var(--status-blocked)",
    background: "color-mix(in srgb, var(--status-blocked) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--status-blocked) 20%, transparent)",
  },
  indigo: {
    background: "color-mix(in srgb, var(--accent-brand) 12%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent-brand) 20%, transparent)",
  },
  outline: { border: "1px solid var(--border-subtle)" },
};

const badgeDotColors: Partial<Record<NonNullable<BadgeProps["variant"]>, string>> = {
  success: "var(--status-done)",
  warning: "var(--status-warning)",
  error:   "var(--status-blocked)",
};

export function Badge({ variant = "default", children, className = "", dot }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[9999px] label-medium ${badgeVariantClasses[variant]} ${className}`}
      style={badgeVariantStyles[variant]}
    >
      {dot && badgeDotColors[variant] && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: badgeDotColors[variant] }}
        />
      )}
      {children}
    </span>
  );
}

// ─── MetricRow ───────────────────────────────────────────────────────
interface MetricRowProps {
  label: string;
  value: string;
  status?: "ok" | "warn" | "error" | "stale" | "fresh";
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
}

const statusDotColors: Record<string, string> = {
  ok: "var(--status-done)",
  warn: "var(--status-warning)",
  error: "var(--status-blocked)",
  stale: "var(--text-quaternary)",
  fresh: "var(--status-done)",
};

export function MetricRow({ label, value, status, change, changeType }: MetricRowProps) {
  const changeColor =
    changeType === "positive"
      ? "var(--status-done)"
      : changeType === "negative"
        ? "var(--status-blocked)"
        : "var(--text-quaternary)";

  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2.5">
        {status && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: statusDotColors[status] || "var(--text-quaternary)" }}
          />
        )}
        <span className="small text-text-tertiary">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="small-semibold text-text-primary">{value}</span>
        {change && (
          <span className="label-medium" style={{ color: changeColor }}>
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── EntityHeader ─────────────────────────────────────────────────────
interface EntityHeaderProps {
  title: string;
  kind: string;
  summary: string;
  whyNow?: string;
  emoji?: string;
  onNavigate?: (path: string) => void;
}

export function EntityHeader({ title, kind, summary, whyNow, emoji, onNavigate }: EntityHeaderProps) {
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        {emoji && <span className="text-2xl">{emoji}</span>}
        <h1 className="heading-2 text-text-primary">{title}</h1>
        <Badge variant="outline">{kind}</Badge>
      </div>
      <div className="small text-text-secondary">
        <MarkdownRenderer content={summary} onNavigate={onNavigate} />
      </div>
      {whyNow && (
        <div
          className="flex items-start gap-3 px-6 py-4 rounded-[8px]"
          style={{
            background: "color-mix(in srgb, var(--accent-brand) 6%, transparent)",
            borderLeft: "2px solid var(--accent-brand)",
          }}
        >
          <div className="caption-large text-text-secondary" style={{ lineHeight: 1.6 }}>
            <MarkdownRenderer content={whyNow} onNavigate={onNavigate} />
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── SectionBlock ────────────────────────────────────────────────────
// Small-caps labels at 11px weight 510, uppercase tracking
interface SectionBlockProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function SectionBlock({ title, subtitle, children }: SectionBlockProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="micro uppercase tracking-[0.08em] text-text-quaternary">{title}</h3>
        {subtitle && <p className="label text-text-quaternary mt-1">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── LinkList ─────────────────────────────────────────────────────────
interface LinkItem {
  label: string;
  path: string;
  kind?: string;
}

export function LinkList({ items, onNavigate }: { items: LinkItem[]; onNavigate?: (path: string) => void }) {
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => {
        const clickable = !!(onNavigate && item.path);
        const commonClass = "app-row flex items-center gap-2.5 py-2 px-3 -mx-3 rounded-[6px] transition-colors duration-150 text-text-secondary";
        const content = (
          <>
            <svg
              className="w-3.5 h-3.5 shrink-0 text-text-quaternary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="caption-large truncate">{item.label}</span>
            {item.kind && <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">{item.kind}</Badge>}
          </>
        );
        if (!clickable) {
          return (
            <div key={i} className={commonClass} style={{ cursor: "default" }}>
              {content}
            </div>
          );
        }
        return (
          <a
            key={i}
            href={`vault://${item.path}`}
            onClick={(e) => {
              e.preventDefault();
              onNavigate!(item.path);
            }}
            className={`${commonClass} cursor-pointer hover:bg-[var(--bg-surface-alpha-2)]`}
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

// ─── TimelineMini ─────────────────────────────────────────────────────
interface TimelineMiniItem {
  date: string;
  label: string;
  path?: string;
}

export function TimelineMini({ items, onNavigate }: { items: TimelineMiniItem[]; onNavigate?: (path: string) => void }) {
  return (
    <div className="relative pl-5">
      {/* Vertical line — 1.5px for visual weight with 9px dots */}
      <div
        className="absolute left-[8px] top-2 bottom-2"
        style={{ width: "1.5px", background: "var(--border-standard)" }}
      />
      <div className="space-y-3">
        {items.map((item, i) => {
          const clickable = !!(item.path && onNavigate);
          const body = (
            <>
              <div
                className="absolute -left-[21px] top-[5px] w-[9px] h-[9px] rounded-full"
                style={{
                  background: "var(--accent-brand)",
                  boxShadow: "0 0 0 2px var(--bg-surface)",
                }}
              />
              <div className="flex-1 min-w-0">
                <span className="micro mono-label text-text-quaternary">{item.date}</span>
                <p className="caption-large text-text-secondary" style={{ lineHeight: 1.5 }}>
                  {item.label}
                </p>
              </div>
            </>
          );
          if (!clickable) {
            return (
              <div key={i} className="relative flex items-start gap-3">
                {body}
              </div>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate!(item.path!)}
              className="app-row relative flex items-start gap-3 w-full text-left py-1 -my-1 rounded-[6px] cursor-pointer hover:bg-[var(--bg-surface-alpha-2)]"
              style={{ background: "transparent", border: "none" }}
            >
              {body}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── CalloutBox ───────────────────────────────────────────────────────
// Subtle callout cards with accent borders
interface CalloutBoxProps {
  tone: "info" | "warning" | "success" | "error" | "neutral";
  title?: string;
  body: string;
}

const calloutToneStyles: Record<string, { bg: string; border: string }> = {
  info:    { bg: "color-mix(in srgb, var(--accent-brand) 6%, transparent)",        border: "var(--accent-brand)" },
  warning: { bg: "color-mix(in srgb, var(--status-warning) 6%, transparent)",      border: "var(--status-warning)" },
  success: { bg: "color-mix(in srgb, var(--status-done) 6%, transparent)",         border: "var(--status-done)" },
  error:   { bg: "color-mix(in srgb, var(--status-blocked) 6%, transparent)",      border: "var(--status-blocked)" },
  neutral: { bg: "var(--bg-surface-alpha-2)",                                      border: "var(--border-solid-primary)" },
};

export function CalloutBox({ tone, title, body, onNavigate }: CalloutBoxProps & { onNavigate?: (path: string) => void }) {
  const style = calloutToneStyles[tone] || calloutToneStyles.neutral;
  const textClass = tone === "neutral" ? "text-text-tertiary" : "text-text-secondary";

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      className="flex items-start gap-3 p-4 rounded-[8px]"
      style={{ background: style.bg, borderLeft: `2px solid ${style.border}` }}
    >
      <div className="min-w-0">
        {title && <p className="caption-medium text-text-primary mb-0.5" style={{ fontWeight: 590 }}>{title}</p>}
        <div className={`caption-large ${textClass}`} style={{ lineHeight: 1.6 }}>
          <MarkdownRenderer content={body} onNavigate={onNavigate} />
        </div>
      </div>
    </motion.div>
  );
}

// ─── SourceList ───────────────────────────────────────────────────────
// Clean source citations in quaternary text
interface SourceItem {
  label: string;
  path: string;
  kind?: string;
  relevance?: string;
}

export function SourceList({ sources, onNavigate }: { sources: SourceItem[]; onNavigate?: (path: string) => void }) {
  return (
    <div>
      <p className="micro uppercase tracking-[0.08em] text-text-quaternary mb-2">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, i) => {
          const inner = (
            <>
              <svg className="w-3 h-3 shrink-0 text-text-quaternary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {source.label}
              {source.relevance === "high" && (
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent-brand)" }} />
              )}
            </>
          );
          const card = (
            <HoverCard
              key={i}
              content={
                <div className="flex flex-col gap-1">
                  <div className="caption-medium text-text-primary truncate">{source.label}</div>
                  <div className="mono-label text-text-quaternary truncate">
                    {source.path}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {source.kind && (
                      <span className="micro uppercase tracking-[0.08em] text-text-tertiary">
                        {source.kind}
                      </span>
                    )}
                    {source.relevance && (
                      <span
                        className="micro"
                        style={{
                          color: source.relevance === "high" ? "var(--accent-brand)" : "var(--text-quaternary)",
                        }}
                      >
                        {source.relevance} relevance
                      </span>
                    )}
                  </div>
                </div>
              }
            >
              {onNavigate ? (
                <button
                  type="button"
                  onClick={() => onNavigate(source.path)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] label-medium transition-colors duration-150 text-text-tertiary hover:text-text-secondary hover:bg-[var(--bg-surface-alpha-4)] cursor-pointer"
                  style={{
                    background: "var(--bg-surface-alpha-2)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {inner}
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] label-medium text-text-tertiary"
                  style={{
                    background: "var(--bg-surface-alpha-2)",
                    border: "1px solid var(--border-subtle)",
                    cursor: "default",
                  }}
                >
                  {inner}
                </span>
              )}
            </HoverCard>
          );
          return card;
        })}
      </div>
    </div>
  );
}

// ─── ActionBar ────────────────────────────────────────────────────────
// Ghost buttons with rgba(255,255,255,0.02) bg
interface ActionItem {
  id: string;
  type: string;
  label: string;
  safety?: string;
  target?: { path?: string };
}

interface ActionBarProps {
  actions: ActionItem[];
  /** Consumer handler. Receives the clicked action so callers can route by id/type. */
  onAction?: (action: ActionItem) => void;
  /** Fallback: navigate to the target path when onAction isn't provided. */
  onNavigate?: (path: string) => void;
  /** Last-resort fallback: fire a natural-language query built from the label. */
  onAsk?: (query: string) => void;
}

export function ActionBar({ actions, onAction, onNavigate, onAsk }: ActionBarProps) {
  if (!actions || actions.length === 0) return null;

  const handleClick = (action: ActionItem) => {
    if (onAction) {
      onAction(action);
      return;
    }
    if (action.type === "open_note" && action.target?.path && onNavigate) {
      onNavigate(action.target.path);
      return;
    }
    // Last resort: ask the chat with the button label. Means no click is ever dead.
    if (onAsk) onAsk(action.label);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => handleClick(action)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] label-medium cursor-pointer transition-colors duration-150 text-text-secondary hover:bg-[var(--bg-surface-alpha-4)] hover:text-text-primary"
          style={{
            background: "var(--bg-surface-alpha-2)",
            border: "1px solid var(--border-standard)",
          }}
        >
          {action.label}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ))}
    </div>
  );
}
