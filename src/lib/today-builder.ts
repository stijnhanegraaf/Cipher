/**
 * Aggregates today + up-next open tasks from the vault's work folder(s).
 *
 * Returns a ranked list with bucket/status/priority. Consumed by
 * /api/today and /browse (TodayPage).
 */
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

// ─── Vault walk ──────────────────────────────────────────────────────
// Walks every .md file under a set of candidate folders, opens each file,
// parses open checkboxes, and converts to TodayTask[].

async function safeListMd(absDir: string): Promise<string[]> {
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isFile() && e.name.toLowerCase().endsWith(".md")) out.push(e.name);
    }
    return out;
  } catch {
    return [];
  }
}

async function walkTasksInDir(root: string, relDir: string): Promise<TodayTask[]> {
  const out: TodayTask[] = [];
  const absDir = relDir ? join(root, relDir) : root;
  const files = await safeListMd(absDir);
  for (const name of files) {
    const vaultRel = relDir ? `${relDir}/${name}` : name;
    const file = await readVaultFile(vaultRel);
    if (!file) continue;
    const mtime = file.mtime || 0;
    const checkboxes = parseCheckboxes(file.content);
    for (const cb of checkboxes) {
      if (cb.checked) continue;
      const text = stripWikiLinks(cb.text);
      const priority = inferPriority(cb.text);
      const status = inferStatus(cb.text);
      out.push({
        id: `t-${vaultRel}-${cb.lineIndex}`,
        bucket: "today", // filled in by split()
        text,
        status,
        priority,
        path: vaultRel,
        lineIndex: cb.lineIndex,
        mtime,
        rank: rankTask(status, priority),
      });
    }
  }
  return out;
}

/**
 * Aggregate open tasks across the vault's work folders into today + up-next.
 *
 * Probes the layout workDir, vault root, and any top-level folder that
 * contains a today.md / open.md / now.md file. Parses every `- [ ]`
 * checkbox, dedupes by source+line, splits via `isTodayCandidate()`, and
 * sorts by rank then mtime. Up-next is capped at 16 entries. Returns an
 * empty payload when no vault is connected.
 */
export async function buildToday(): Promise<TodayPayload> {
  const root = getVaultPath();
  if (!root) {
    return { today: [], upNext: [], counts: { today: 0, upNext: 0, blocked: 0, highPriority: 0 } };
  }
  const layout = getVaultLayout();

  // Candidate folders: layout.workDir if present, plus vault root
  // (for loose today.md/open.md files at root), plus any folder containing
  // a today.md/open.md/now.md file at the top level.
  const candidateDirs = new Set<string>();
  if (layout?.workDir) candidateDirs.add(layout.workDir);
  candidateDirs.add(""); // vault root

  // Also pick up any subfolder that has today.md / open.md / now.md at its top.
  try {
    const topLevel = await readdir(root, { withFileTypes: true });
    for (const entry of topLevel) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const inside = await readdir(join(root, entry.name)).catch(() => []);
      const names = new Set(inside.map((n) => n.toLowerCase()));
      if (names.has("today.md") || names.has("open.md") || names.has("now.md")) {
        candidateDirs.add(entry.name);
      }
    }
  } catch {
    /* ignore */
  }

  // Walk each candidate folder, collect tasks.
  const all: TodayTask[] = [];
  for (const dir of candidateDirs) {
    all.push(...(await walkTasksInDir(root, dir)));
  }

  // De-dup by id (same line can be reached via multiple candidate folders).
  const seen = new Set<string>();
  const deduped: TodayTask[] = [];
  for (const t of all) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    deduped.push(t);
  }

  // Split into today / up-next.
  const now = Date.now();
  const today: TodayTask[] = [];
  const upNext: TodayTask[] = [];
  for (const t of deduped) {
    if (isTodayCandidate(t.text, t.priority, t.status, t.path, t.mtime, now)) {
      today.push({ ...t, bucket: "today" });
    } else {
      upNext.push({ ...t, bucket: "upNext" });
    }
  }

  // Sort by rank, then mtime desc.
  const cmp = (a: TodayTask, b: TodayTask) => a.rank - b.rank || b.mtime - a.mtime;
  today.sort(cmp);
  upNext.sort(cmp);

  const counts = {
    today: today.length,
    upNext: upNext.length,
    blocked: deduped.filter((t) => t.status === "blocked").length,
    highPriority: deduped.filter((t) => t.priority === "high").length,
  };

  // Cap upNext at 16 (TodayPage shows 8, reveals up to 16 with "Show more").
  return { today, upNext: upNext.slice(0, 16), counts };
}
