"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { CurrentWorkData, TaskGroup as TaskGroupType } from "@/lib/view-models";
import { TaskGroupComponent, Badge } from "@/components/ui";

type StatusFilter = "all" | "open" | "in_progress" | "blocked" | "done";

const filterOrder: StatusFilter[] = ["all", "open", "in_progress", "blocked", "done"];
const filterLabels: Record<StatusFilter, string> = {
  all: "All",
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export function CurrentWorkView({ data, view, onToggle, onAsk, onNavigate }: { data: CurrentWorkData; view: any; onToggle?: (itemId: string, checked: boolean) => void; onAsk?: (query: string) => void; onNavigate?: (path: string) => void }) {
  const workData = data as CurrentWorkData;
  const [filter, setFilter] = useState<StatusFilter>("all");

  // Aggregate counts across all groups so the filter chips show totals.
  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: 0, open: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const g of workData.groups) {
      for (const item of g.items) {
        c.all++;
        if (item.status in c) c[item.status as StatusFilter]++;
      }
    }
    return c;
  }, [workData.groups]);

  // Apply the filter to each group — groups with zero matching items are hidden.
  const filteredGroups: TaskGroupType[] = useMemo(() => {
    if (filter === "all") return workData.groups;
    return workData.groups
      .map((g) => ({ ...g, items: g.items.filter((it) => it.status === filter) }))
      .filter((g) => g.items.length > 0);
  }, [workData.groups, filter]);

  return (
    <motion.div
      variants={stagger.groupContainer(0)}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Filter chips — client-side, no network. Only render when there's
          something to filter (more than just "all" items). */}
      {counts.all > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filterOrder.map((key) => {
            if (key !== "all" && counts[key] === 0) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className="filter-chip"
                data-active={filter === key ? "true" : undefined}
                aria-pressed={filter === key}
              >
                <span>{filterLabels[key]}</span>
                <span className="mono-label" style={{ opacity: 0.6, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums" }}>
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Highlights strip */}
      {workData.highlights && workData.highlights.length > 0 && (
        <motion.div variants={fadeSlideUp} className="flex flex-wrap gap-2">
          {workData.highlights.map((h, i) => (
            <Badge key={i} variant="outline">{h}</Badge>
          ))}
        </motion.div>
      )}

      {/* Task groups */}
      {filteredGroups.length === 0 ? (
        <motion.div variants={fadeSlideUp} className="flex flex-col items-center justify-center py-16">
          <motion.svg
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            width={48}
            height={48}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mb-4 text-text-quaternary"
          >
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </motion.svg>
          <p className="caption-large text-text-quaternary mb-3" style={{ lineHeight: 1.6 }}>
            {filter === "all" ? "Nothing on the list right now." : `No ${filterLabels[filter].toLowerCase()} items.`}
          </p>
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] caption-medium text-text-primary cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-surface-alpha-4)]"
              style={{
                background: "var(--bg-surface-alpha-2)",
                border: "1px solid var(--border-standard)",
              }}
            >
              Show all
            </button>
          )}
          {filter === "all" && onAsk && (
            <button
              onClick={() => onAsk("capture a new task")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] caption-medium text-text-primary cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-surface-alpha-4)]"
              style={{
                background: "var(--bg-surface-alpha-2)",
                border: "1px solid var(--border-standard)",
              }}
            >
              Capture one
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </motion.div>
      ) : (
        filteredGroups.map((group, i) => (
          <motion.div key={i} variants={fadeSlideUp}>
            <TaskGroupComponent group={group} index={i} onToggle={onToggle} onNavigate={onNavigate} onAsk={onAsk} />
          </motion.div>
        ))
      )}

      {/* Period links — route via onAsk so the chat pipeline resolves the query
          consistently (same as typing "show tasks this week"). Falls back to a
          hash link when no handler is wired, so the CTA never looks dead. */}
      {workData.periodLinks && (
        <motion.div variants={fadeSlideUp} className="flex items-center gap-4 pt-2">
          {workData.periodLinks.week && (
            <button
              type="button"
              onClick={() => onAsk?.("show work from this week")}
              className="inline-flex items-center gap-1.5 caption-medium text-accent-violet transition-colors duration-150 hover:text-accent-hover cursor-pointer"
              style={{ background: "none", border: "none", padding: 0 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {workData.periodLinks.week.label}
            </button>
          )}
          {workData.periodLinks.month && (
            <button
              type="button"
              onClick={() => onAsk?.("show work from this month")}
              className="inline-flex items-center gap-1.5 caption-medium text-accent-violet transition-colors duration-150 hover:text-accent-hover cursor-pointer"
              style={{ background: "none", border: "none", padding: 0 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {workData.periodLinks.month.label}
            </button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
