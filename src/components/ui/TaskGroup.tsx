"use client";

import { motion } from "framer-motion";
import { TaskGroup as TaskGroupType, TaskItem as TaskItemType } from "@/lib/view-models";

// ─── Status configuration ────────────────────────────────────────────
const statusConfig: Record<string, { dot: string; bg: string; icon: string; label: string; ring: string }> = {
  open: {
    dot: "bg-blue-500 dark:bg-blue-400",
    bg: "bg-blue-50/60 dark:bg-blue-950/20",
    icon: "○",
    label: "Open",
    ring: "ring-blue-200/60 dark:ring-blue-800/40",
  },
  in_progress: {
    dot: "bg-amber-500 dark:bg-amber-400",
    bg: "bg-amber-50/60 dark:bg-amber-950/20",
    icon: "◐",
    label: "In progress",
    ring: "ring-amber-200/60 dark:ring-amber-800/40",
  },
  done: {
    dot: "bg-emerald-500 dark:bg-emerald-400",
    bg: "bg-emerald-50/60 dark:bg-emerald-950/20",
    icon: "●",
    label: "Done",
    ring: "ring-emerald-200/60 dark:ring-emerald-800/40",
  },
  blocked: {
    dot: "bg-red-500 dark:bg-red-400",
    bg: "bg-red-50/60 dark:bg-red-950/20",
    icon: "⊘",
    label: "Blocked",
    ring: "ring-red-200/60 dark:ring-red-800/40",
  },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  high:   { color: "text-red-500 dark:text-red-400", label: "High" },
  medium: { color: "text-amber-500 dark:text-amber-400", label: "Medium" },
  low:    { color: "text-neutral-400 dark:text-neutral-500", label: "Low" },
};

// ─── TaskItemRow ──────────────────────────────────────────────────────
export function TaskItemRow({ item, index = 0 }: { item: TaskItemType; index?: number }) {
  const status = statusConfig[item.status] || statusConfig.open;
  const priority = item.priority ? priorityConfig[item.priority] : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04, ease: "easeOut" }}
      className="flex items-start gap-3 py-2.5 group rounded-lg hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30 transition-colors duration-150 -mx-2 px-2"
    >
      {/* Status dot */}
      <div className="pt-1 shrink-0">
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${status.bg} ring-1 ${status.ring}`}>
          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-snug ${
            item.status === "done"
              ? "line-through text-neutral-400 dark:text-neutral-500"
              : "text-neutral-800 dark:text-neutral-200"
          }`}
        >
          {item.text}
        </p>
        {item.links && item.links.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1.5">
            {item.links.map((link, i) => (
              <a
                key={i}
                href="#"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
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
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400"
              >
                {rel.kind && <span className="mr-1 opacity-60">{rel.kind}</span>}
                {rel.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Priority */}
      {priority && (
        <span className={`text-[11px] font-bold uppercase tracking-wider shrink-0 mt-1 ${priority.color}`}>
          {priority.label}
        </span>
      )}
    </motion.div>
  );
}

// ─── TaskGroupComponent ──────────────────────────────────────────────
export function TaskGroupComponent({ group, index = 0 }: { group: TaskGroupType; index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: (index || 0) * 0.08, ease: "easeOut" }}
      className="rounded-xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/60 overflow-hidden"
    >
      {/* Group header */}
      <div className="px-4 pt-4 pb-2">
        <h3 className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.1em]">
          {group.label}
        </h3>
      </div>

      {/* Task list */}
      <div className="px-2 pb-2">
        {group.items.map((item, i) => (
          <TaskItemRow key={item.id} item={item} index={i} />
        ))}
      </div>
    </motion.div>
  );
}