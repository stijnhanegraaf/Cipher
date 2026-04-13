"use client";

import { motion } from "framer-motion";

// ─── Badge ───────────────────────────────────────────────────────────
interface BadgeProps {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "error";
  children: React.ReactNode;
  className?: string;
}

const badgeVariants: Record<string, string> = {
  default:   "bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200/80 dark:border-neutral-700/80",
  secondary: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/80 dark:border-blue-800/60",
  outline:   "bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600",
  success:   "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60",
  warning:   "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/60",
  error:     "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200/80 dark:border-red-800/60",
};

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${badgeVariants[variant] || badgeVariants.default} ${className}`}
    >
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
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  stale: "bg-neutral-400",
  fresh: "bg-emerald-500",
};

export function MetricRow({ label, value, status, change, changeType }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-neutral-100 dark:border-neutral-800/60 last:border-0">
      <div className="flex items-center gap-2.5">
        {status && (
          <span className={`w-2 h-2 rounded-full ${statusDotColors[status] || "bg-neutral-400"}`} />
        )}
        <span className="text-sm text-neutral-500 dark:text-neutral-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{value}</span>
        {change && (
          <span
            className={`text-xs font-medium ${
              changeType === "positive"
                ? "text-emerald-600 dark:text-emerald-400"
                : changeType === "negative"
                  ? "text-red-600 dark:text-red-400"
                  : "text-neutral-400 dark:text-neutral-500"
            }`}
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="flex items-center gap-3">
        {emoji && <span className="text-2xl">{emoji}</span>}
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 tracking-tight">{title}</h1>
        <Badge variant="secondary">{kind}</Badge>
      </div>
      <p className="text-[15px] leading-relaxed text-neutral-600 dark:text-neutral-400">{summary}</p>
      {whyNow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/40"
        >
          <svg className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
          </svg>
          <p className="text-sm text-blue-700 dark:text-blue-300 leading-snug">{whyNow}</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── SectionBlock ────────────────────────────────────────────────────
interface SectionBlockProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function SectionBlock({ title, subtitle, children }: SectionBlockProps) {
  return (
    <div className="space-y-2.5">
      <div>
        <h3 className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.08em]">{title}</h3>
        {subtitle && <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{subtitle}</p>}
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
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: i * 0.04, ease: "easeOut" }}
          className="flex items-center gap-2.5 py-2 px-3 -mx-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150 group"
        >
          <svg
            className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 shrink-0 transition-colors"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate transition-colors">
            {item.label}
          </span>
          {item.kind && (
            <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">{item.kind}</Badge>
          )}
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
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-neutral-200 dark:bg-neutral-700/60" />
      <div className="space-y-3">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className="relative flex items-start gap-3"
          >
            {/* Dot on the line */}
            <div className="absolute -left-5 top-1.5 w-[7px] h-[7px] rounded-full bg-blue-500 dark:bg-blue-400 ring-2 ring-white dark:ring-neutral-900" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">{item.date}</span>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-snug">{item.label}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── CalloutBox ───────────────────────────────────────────────────────
interface CalloutBoxProps {
  tone: "info" | "warning" | "success" | "error" | "neutral";
  title?: string;
  body: string;
}

const calloutStyles: Record<string, { bg: string; border: string; text: string; iconBg: string; iconColor: string }> = {
  info:     { bg: "bg-blue-50/70 dark:bg-blue-950/30",       border: "border-blue-200/70 dark:border-blue-800/50",      text: "text-blue-800 dark:text-blue-200",           iconBg: "bg-blue-100 dark:bg-blue-900/50",     iconColor: "text-blue-600 dark:text-blue-300" },
  warning:  { bg: "bg-amber-50/70 dark:bg-amber-950/30",     border: "border-amber-200/70 dark:border-amber-800/50",    text: "text-amber-800 dark:text-amber-200",         iconBg: "bg-amber-100 dark:bg-amber-900/50",   iconColor: "text-amber-600 dark:text-amber-300" },
  success:  { bg: "bg-emerald-50/70 dark:bg-emerald-950/30",  border: "border-emerald-200/70 dark:border-emerald-800/50",text: "text-emerald-800 dark:text-emerald-200",     iconBg: "bg-emerald-100 dark:bg-emerald-900/50",iconColor: "text-emerald-600 dark:text-emerald-300" },
  error:    { bg: "bg-red-50/70 dark:bg-red-950/30",          border: "border-red-200/70 dark:border-red-800/50",        text: "text-red-800 dark:text-red-200",             iconBg: "bg-red-100 dark:bg-red-900/50",       iconColor: "text-red-600 dark:text-red-300" },
  neutral:  { bg: "bg-neutral-50 dark:bg-neutral-800/50",     border: "border-neutral-200/70 dark:border-neutral-700/60",text: "text-neutral-700 dark:text-neutral-300",    iconBg: "bg-neutral-100 dark:bg-neutral-700",   iconColor: "text-neutral-500 dark:text-neutral-400" },
};

const calloutIcons: Record<string, React.ReactNode> = {
  info: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
    </svg>
  ),
  warning: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 2L2 20h20L12 2z" />
    </svg>
  ),
  success: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  neutral: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01" />
    </svg>
  ),
};

export function CalloutBox({ tone, title, body }: CalloutBoxProps) {
  const style = calloutStyles[tone] || calloutStyles.neutral;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex items-start gap-3 p-3.5 rounded-xl ${style.bg} border ${style.border}`}
    >
      <div className={`flex items-center justify-center w-6 h-6 rounded-lg shrink-0 ${style.iconBg} ${style.iconColor}`}>
        {calloutIcons[tone]}
      </div>
      <div className="min-w-0">
        {title && <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-0.5">{title}</p>}
        <p className={`text-sm leading-relaxed ${style.text}`}>{body}</p>
      </div>
    </motion.div>
  );
}

// ─── SourceList ───────────────────────────────────────────────────────
interface SourceItem {
  label: string;
  path: string;
  kind?: string;
  relevance?: string;
}

export function SourceList({ sources }: { sources: SourceItem[] }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.08em] mb-2">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, i) => (
          <motion.a
            key={i}
            href="#"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: i * 0.03 }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-neutral-50 dark:bg-neutral-800/80 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700/80 transition-colors border border-neutral-200/60 dark:border-neutral-700/60"
          >
            <svg className="w-3 h-3 shrink-0 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {source.label}
            {source.relevance === "high" && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400" />
            )}
          </motion.a>
        ))}
      </div>
    </div>
  );
}

// ─── ActionBar ────────────────────────────────────────────────────────
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
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 transition-colors cursor-pointer"
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