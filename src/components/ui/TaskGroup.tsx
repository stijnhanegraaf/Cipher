"use client";

import { TaskGroup as TaskGroupType, TaskItem as TaskItemType } from "@/lib/view-models";

const statusConfig: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  open: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/30", icon: "○", label: "Open" },
  in_progress: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30", icon: "◐", label: "In progress" },
  done: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30", icon: "●", label: "Done" },
  blocked: { color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30", icon: "⊘", label: "Blocked" },
};

const priorityConfig: Record<string, string> = {
  high: "text-red-500 dark:text-red-400",
  medium: "text-amber-500 dark:text-amber-400",
  low: "text-neutral-400 dark:text-neutral-500",
};

export function TaskItemRow({ item }: { item: TaskItemType }) {
  const status = statusConfig[item.status] || statusConfig.open;
  const priority = item.priority ? priorityConfig[item.priority] : undefined;

  return (
    <div className="flex items-start gap-3 py-2 group">
      <span className={`${status.color} text-sm mt-0.5 select-none`} title={status.label}>
        {status.icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${item.status === "done" ? "line-through text-neutral-400 dark:text-neutral-500" : "text-neutral-800 dark:text-neutral-200"}`}>
          {item.text}
        </p>
        {item.links && item.links.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {item.links.map((link, i) => (
              <a key={i} href="#" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">{link.label}</a>
            ))}
          </div>
        )}
      </div>
      {priority && (
        <span className={`text-xs font-medium ${priority} shrink-0 mt-0.5`}>
          {item.priority}
        </span>
      )}
    </div>
  );
}

export function TaskGroupComponent({ group }: { group: TaskGroupType }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
        {group.label}
      </h3>
      <div className="space-y-0.5">
        {group.items.map((item) => (
          <TaskItemRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}