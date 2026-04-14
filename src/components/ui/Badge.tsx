"use client";

import { motion } from "framer-motion";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { fadeSlideUp } from "@/lib/motion";

// ─── Design tokens (from DESIGN.md) ────────────────────────────────
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
  },
  border: {
    subtle: "rgba(255,255,255,0.05)",
    standard: "rgba(255,255,255,0.08)",
    solid: "#23252a",
  },
};

// ─── Badge ──────────────────────────────────────────────────────────
// Linear-style pill badge: transparent bg, subtle border, 9999px radius
interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "indigo" | "outline";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const badgeVariantStyles: Record<string, React.CSSProperties> = {
  default: {
    background: "transparent",
    color: tokens.text.secondary,
    border: `1px solid ${tokens.border.solid}`,
  },
  success: {
    background: "rgba(16,185,129,0.12)",
    color: tokens.status.emerald,
    border: "1px solid rgba(16,185,129,0.2)",
  },
  warning: {
    background: "rgba(245,158,11,0.12)",
    color: tokens.status.warning,
    border: "1px solid rgba(245,158,11,0.2)",
  },
  error: {
    background: "rgba(239,68,68,0.12)",
    color: tokens.status.error,
    border: "1px solid rgba(239,68,68,0.2)",
  },
  indigo: {
    background: "rgba(94,106,210,0.12)",
    color: tokens.brand.violet,
    border: "1px solid rgba(94,106,210,0.2)",
  },
  outline: {
    background: "transparent",
    color: tokens.text.tertiary,
    border: `1px solid ${tokens.border.subtle}`,
  },
};

export function Badge({ variant = "default", children, className = "", dot }: BadgeProps) {
  const style = badgeVariantStyles[variant] || badgeVariantStyles.default;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[9999px] text-[12px] font-[510] ${className}`}
      style={{
        ...style,
        fontFamily: "'Inter Variable', 'SF Pro Display', -apple-system, system-ui, sans-serif",
        fontFeatureSettings: '"cv01", "ss03"',
        letterSpacing: "normal",
        lineHeight: "1.4",
      }}
    >
      {dot && variant === "success" && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.status.emerald }} />
      )}
      {dot && variant === "warning" && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.status.warning }} />
      )}
      {dot && variant === "error" && (
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.status.error }} />
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
  ok: tokens.status.success,
  warn: tokens.status.warning,
  error: tokens.status.error,
  stale: tokens.text.quaternary,
  fresh: tokens.status.emerald,
};

export function MetricRow({ label, value, status, change, changeType }: MetricRowProps) {
  return (
    <div
      className="flex items-center justify-between py-3"
      style={{ borderBottom: `1px solid ${tokens.border.subtle}` }}
    >
      <div className="flex items-center gap-2.5">
        {status && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: statusDotColors[status] || tokens.text.quaternary }}
          />
        )}
        <span
          className="text-[15px]"
          style={{
            color: tokens.text.tertiary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="text-[15px] font-[590]"
          style={{
            color: tokens.text.primary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {value}
        </span>
        {change && (
          <span
            className="text-[12px] font-[510]"
            style={{
              color:
                changeType === "positive"
                  ? tokens.status.emerald
                  : changeType === "negative"
                    ? tokens.status.error
                    : tokens.text.quaternary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
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
}

export function EntityHeader({ title, kind, summary, whyNow, emoji }: EntityHeaderProps) {
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        {emoji && <span className="text-2xl">{emoji}</span>}
        <h1
          className="text-[20px] font-[590] tracking-[-0.24px]"
          style={{
            color: tokens.text.primary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
            lineHeight: "1.33",
          }}
        >
          {title}
        </h1>
        <Badge variant="outline">{kind}</Badge>
      </div>
      <div
        className="text-[15px] leading-[1.6] tracking-[-0.165px]"
        style={{
          color: tokens.text.tertiary,
          fontFamily: "'Inter Variable', sans-serif",
          fontFeatureSettings: '"cv01", "ss03"',
        }}
      >
        <MarkdownRenderer content={summary} />
      </div>
      {whyNow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-start gap-3 px-6 py-4 rounded-[8px]"
          style={{
            background: "rgba(94,106,210,0.06)",
            borderLeft: `2px solid ${tokens.brand.indigo}`,
          }}
        >
          <div
            className="text-[14px] leading-[1.6]"
            style={{
              color: tokens.text.secondary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            <MarkdownRenderer content={whyNow} />
          </div>
        </motion.div>
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
        <h3
          className="text-[11px] font-[510] uppercase tracking-[0.08em]"
          style={{
            color: tokens.text.quaternary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="text-[12px] mt-1"
            style={{
              color: tokens.text.quaternary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            {subtitle}
          </p>
        )}
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

export function LinkList({ items }: { items: LinkItem[] }) {
  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <motion.a
          key={i}
          href="#"
          variants={fadeSlideUp}
          initial="hidden"
          animate="show"
          transition={{ delay: i * 0.04 }}
          className="flex items-center gap-2.5 py-2 px-3 -mx-3 rounded-[6px] transition-colors duration-150 group"
          style={{ color: tokens.text.secondary }}
        >
          <svg
            className="w-3.5 h-3.5 shrink-0 transition-colors"
            style={{ color: tokens.text.quaternary }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span
            className="text-[14px] font-[510] truncate transition-colors"
            style={{
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            {item.label}
          </span>
          {item.kind && <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">{item.kind}</Badge>}
        </motion.a>
      ))}
    </div>
  );
}

// ─── TimelineMini ─────────────────────────────────────────────────────
interface TimelineMiniItem {
  date: string;
  label: string;
  path?: string;
}

export function TimelineMini({ items }: { items: TimelineMiniItem[] }) {
  return (
    <div className="relative pl-5">
      {/* Vertical line */}
      <div
        className="absolute left-[7px] top-2 bottom-2 w-px"
        style={{ background: tokens.border.standard }}
      />
      <div className="space-y-3">
        {items.map((item, i) => (
          <motion.div
            key={i}
            variants={fadeSlideUp}
            initial="hidden"
            animate="show"
            transition={{ delay: i * 0.05 }}
            className="relative flex items-start gap-3"
          >
            {/* Dot on the line */}
            <div
              className="absolute -left-5 top-1.5 w-[7px] h-[7px] rounded-full"
              style={{ background: tokens.brand.indigo, boxShadow: `0 0 0 2px ${tokens.bg.surface}` }}
            />
            <div className="flex-1 min-w-0">
              <span
                className="text-[11px] font-[510]"
                style={{
                  color: tokens.text.quaternary,
                  fontFamily: "'Berkeley Mono', ui-monospace, 'SF Mono', Menlo, monospace",
                }}
              >
                {item.date}
              </span>
              <p
                className="text-[14px] leading-[1.5]"
                style={{
                  color: tokens.text.secondary,
                  fontFamily: "'Inter Variable', sans-serif",
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
              >
                {item.label}
              </p>
            </div>
          </motion.div>
        ))}
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

const calloutToneStyles: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  info: {
    bg: "rgba(94,106,210,0.06)",
    border: tokens.brand.indigo,
    text: tokens.text.secondary,
    accent: tokens.brand.violet,
  },
  warning: {
    bg: "rgba(245,158,11,0.06)",
    border: tokens.status.warning,
    text: tokens.text.secondary,
    accent: tokens.status.warning,
  },
  success: {
    bg: "rgba(16,185,129,0.06)",
    border: tokens.status.emerald,
    text: tokens.text.secondary,
    accent: tokens.status.emerald,
  },
  error: {
    bg: "rgba(239,68,68,0.06)",
    border: tokens.status.error,
    text: tokens.text.secondary,
    accent: tokens.status.error,
  },
  neutral: {
    bg: "rgba(255,255,255,0.02)",
    border: tokens.border.solid,
    text: tokens.text.tertiary,
    accent: tokens.text.quaternary,
  },
};

export function CalloutBox({ tone, title, body }: CalloutBoxProps) {
  const style = calloutToneStyles[tone] || calloutToneStyles.neutral;

  return (
    <motion.div
      variants={fadeSlideUp}
      initial="hidden"
      animate="show"
      className="flex items-start gap-3 p-4 rounded-[8px]"
      style={{
        background: style.bg,
        borderLeft: `2px solid ${style.border}`,
      }}
    >
      <div className="min-w-0">
        {title && (
          <p
            className="text-[13px] font-[590] mb-0.5"
            style={{
              color: tokens.text.primary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            {title}
          </p>
        )}
        <div
          className="text-[14px] leading-[1.6]"
          style={{
            color: style.text,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          <MarkdownRenderer content={body} />
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
      <p
        className="text-[11px] font-[510] uppercase tracking-[0.08em] mb-2"
        style={{
          color: tokens.text.quaternary,
          fontFamily: "'Inter Variable', sans-serif",
          fontFeatureSettings: '"cv01", "ss03"',
        }}
      >
        Sources
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, i) => (
          <motion.button
            key={i}
            onClick={() => onNavigate?.(source.path)}
            variants={fadeSlideUp}
            initial="hidden"
            animate="show"
            transition={{ delay: i * 0.03 }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[12px] font-[510] transition-colors duration-150 hover:brightness-125"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${tokens.border.subtle}`,
              color: tokens.text.tertiary,
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
              cursor: onNavigate ? "pointer" : "default",
            }}
          >
            <svg className="w-3 h-3 shrink-0" style={{ color: tokens.text.quaternary }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {source.label}
            {source.relevance === "high" && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: tokens.brand.indigo }} />
            )}
          </motion.button>
        ))}
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
}

export function ActionBar({ actions }: { actions: ActionItem[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <motion.button
          key={action.id}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-[510] cursor-pointer transition-colors duration-150 hover:brightness-125"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: `1px solid ${tokens.border.standard}`,
            color: tokens.text.secondary,
            fontFamily: "'Inter Variable', sans-serif",
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          {action.label}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </motion.button>
      ))}
    </div>
  );
}