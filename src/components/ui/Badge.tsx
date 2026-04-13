"use client";

import { motion } from "framer-motion";

interface BadgeProps {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "error";
  children: React.ReactNode;
  className?: string;
}

const variants: Record<string, string> = {
  default: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700",
  secondary: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  outline: "bg-transparent text-neutral-600 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600",
  success: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800",
  warning: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  error: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800",
};

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  );
}

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
    <div className="flex items-center justify-between py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0">
      <div className="flex items-center gap-2">
        {status && <span className={`w-2 h-2 rounded-full ${statusDotColors[status] || "bg-neutral-400"}`} />}
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{value}</span>
        {change && (
          <span className={`text-xs ${changeType === "positive" ? "text-emerald-600 dark:text-emerald-400" : changeType === "negative" ? "text-red-600 dark:text-red-400" : "text-neutral-500 dark:text-neutral-400"}`}>
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

export function EntityHeader({ title, kind, summary, whyNow }: { title: string; kind: string; summary: string; whyNow?: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">{title}</h1>
        <Badge variant="secondary">{kind}</Badge>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">{summary}</p>
      {whyNow && (
        <p className="text-xs text-blue-600 dark:text-blue-400 italic">{whyNow}</p>
      )}
    </div>
  );
}

export function SectionBlock({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function LinkList({ items }: { items: { label: string; path: string; kind?: string }[] }) {
  return (
    <div className="space-y-1">
      {items.map((item, i) => (
        <a
          key={i}
          href="#"
          className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150 group"
        >
          <svg className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500 group-hover:text-blue-500 dark:group-hover:text-blue-400 shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm text-neutral-700 dark:text-neutral-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate transition-colors">{item.label}</span>
          {item.kind && (
            <Badge variant="outline" className="ml-auto shrink-0">{item.kind}</Badge>
          )}
        </a>
      ))}
    </div>
  );
}

export function TimelineMini({ items }: { items: { date: string; label: string }[] }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="text-xs font-mono text-neutral-400 dark:text-neutral-500 w-20 shrink-0 pt-0.5">{item.date}</span>
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function CalloutBox({ tone, title, body }: { tone: "info" | "warning" | "success" | "error" | "neutral"; title?: string; body: string }) {
  const toneStyles: Record<string, { bg: string; border: string; icon: string }> = {
    info: { bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-200 dark:border-blue-800", icon: "ℹ" },
    warning: { bg: "bg-amber-50 dark:bg-amber-950/20", border: "border-amber-200 dark:border-amber-800", icon: "⚠" },
    success: { bg: "bg-emerald-50 dark:bg-emerald-950/20", border: "border-emerald-200 dark:border-emerald-800", icon: "✓" },
    error: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-800", icon: "✕" },
    neutral: { bg: "bg-neutral-50 dark:bg-neutral-800/50", border: "border-neutral-200 dark:border-neutral-700", icon: "•" },
  };
  const style = toneStyles[tone] || toneStyles.neutral;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl ${style.bg} border ${style.border}`}>
      <span className="text-sm shrink-0 mt-0.5">{style.icon}</span>
      <div>
        {title && <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</p>}
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{body}</p>
      </div>
    </div>
  );
}

export function SourceList({ sources }: { sources: { label: string; path: string; kind?: string; relevance?: string }[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-2">Sources</p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source, i) => (
          <a key={i} href="#" className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors border border-neutral-200/60 dark:border-neutral-700/60">
            <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            {source.label}
          </a>
        ))}
      </div>
    </div>
  );
}

export function ActionBar({ actions }: { actions: { id: string; type: string; label: string; safety?: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50 border border-blue-200 dark:border-blue-800 transition-colors"
        >
          {action.label}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>
      ))}
    </div>
  );
}