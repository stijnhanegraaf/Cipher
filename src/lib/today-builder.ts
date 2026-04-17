import "server-only";
import { readdir, stat } from "fs/promises";
import { extname, join } from "path";
import {
  readVaultFile,
  parseCheckboxes,
  getVaultPath,
  getVaultLayout,
} from "./vault-reader";

// ─── Types ────────────────────────────────────────────────────────────

export type TodayBucket = "today" | "upNext";

export type TaskPriority = "high" | "medium" | "low";
export type TaskStatus = "open" | "in_progress" | "blocked";

export interface TodayTask {
  id: string;
  bucket: TodayBucket;
  text: string;
  status: TaskStatus;
  priority: TaskPriority;
  path: string;
  lineIndex: number;
  mtime: number;
  /** Lower is more urgent; used for stable sort. */
  rank: number;
}

export interface TodayPayload {
  today: TodayTask[];
  upNext: TodayTask[];
  counts: {
    today: number;
    upNext: number;
    blocked: number;
    highPriority: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

function stripWikiLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p).trim();
}

function inferStatus(text: string): TaskStatus {
  if (/\bblocked\b|\bwaiting\b/i.test(text)) return "blocked";
  if (/\bin.?progress\b|\bactive\b|\bdoing\b/i.test(text)) return "in_progress";
  return "open";
}

function inferPriority(text: string): TaskPriority {
  if (/\bhigh\b|\burgent\b|\bcritical\b|\bp0\b|\bp1\b/i.test(text)) return "high";
  if (/\bmedium\b|\bmed\b|\bp2\b/i.test(text)) return "medium";
  return "low";
}

/**
 * Decide whether a task lives in the "today" bucket.
 *
 * A task is in Today if any of:
 *  - has high priority,
 *  - text contains @today (case-insensitive),
 *  - the source file is named today.md / open.md / now.md (any folder) AND
 *    its mtime is within the last 24h,
 *  - status is blocked (blocked always surfaces).
 */
export function isTodayCandidate(
  text: string,
  priority: TaskPriority,
  status: TaskStatus,
  sourcePath: string,
  sourceMtime: number,
  now: number = Date.now()
): boolean {
  if (priority === "high") return true;
  if (/@today\b/i.test(text)) return true;
  if (status === "blocked") return true;
  const basename = (sourcePath.split("/").pop() || "").toLowerCase();
  if (
    (basename === "today.md" || basename === "open.md" || basename === "now.md") &&
    now - sourceMtime <= 24 * 60 * 60 * 1000
  ) {
    return true;
  }
  return false;
}

/**
 * Rank function for sort: lower == more urgent.
 *   blocked high: 0, blocked medium: 1, blocked low: 2,
 *   in_progress high: 3, medium 4, low 5,
 *   open high: 6, medium 7, low 8.
 */
export function rankTask(status: TaskStatus, priority: TaskPriority): number {
  const statusWeight = status === "blocked" ? 0 : status === "in_progress" ? 3 : 6;
  const priorityWeight = priority === "high" ? 0 : priority === "medium" ? 1 : 2;
  return statusWeight + priorityWeight;
}
