/**
 * Shared helpers used by every view-builder — id generation, link
 * normalization, status/priority inference, theme detection, path
 * resolution against the probed vault layout.
 */

import type {
  LinkRef,
  Priority,
  SourceRef,
  TaskItem,
  IndexEntry,
  ResearchProject,
} from "../view-models";
import { resolveLink, getVaultLayout } from "../vault-reader";

let counter = 0;
export function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${++counter}`;
}

export function inferTaskStatus(checked: boolean, text: string): TaskItem["status"] {
  if (checked) return "done";
  if (/\bblocked\b/i.test(text)) return "blocked";
  if (/\bin.?progress\b|\bactive\b|\bdoing\b/i.test(text)) return "in_progress";
  return "open";
}

export function inferPriority(text: string): Priority | undefined {
  if (/\bhigh\b|\burgent\b|\bcritical\b/i.test(text)) return "high";
  if (/\blow\b|\bminor\b/i.test(text)) return "low";
  return undefined;
}

export function extractLinksFromCheckbox(text: string): LinkRef[] {
  const links: LinkRef[] = [];
  const re = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    links.push({
      path: match[1].trim(),
      label: (match[2] || match[1]).trim(),
    });
  }
  return links;
}

/**
 * Resolve every LinkRef's `path` through the vault resolver.
 *
 * Downstream consumers (DetailPage, MarkdownRenderer) always receive an
 * absolute vault path — raw wiki labels that don't resolve are dropped.
 * Deduplicates by resolved path so the same target under different labels
 * doesn't render twice.
 */
export async function normalizeLinks<T extends { path: string; label: string }>(links: T[]): Promise<T[]> {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (!link.path) continue;
    const isAbsolute = link.path.includes("/") && link.path.toLowerCase().endsWith(".md");
    let resolvedPath: string | null = link.path;
    if (!isAbsolute) {
      resolvedPath = await resolveLink(link.path);
    }
    if (!resolvedPath) continue;
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    out.push({ ...link, path: resolvedPath });
  }
  return out;
}

export function stripLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p);
}

export function toStatus(s: string): "ok" | "warn" | "error" | "stale" | "fresh" {
  const lower = s.toLowerCase();
  if (lower.includes("error") || lower.includes("fail") || lower.includes("critical")) return "error";
  if (lower.includes("warn") || lower.includes("degraded") || lower.includes("needs")) return "warn";
  if (lower.includes("ok") || lower.includes("green") || lower.includes("healthy") || lower.includes("good") || lower.includes("passing") || lower.includes("active")) return "ok";
  if (lower.includes("stale") || lower.includes("old") || lower.includes("outdated")) return "stale";
  return "ok";
}

/**
 * Build a SourceRef for citation / "open note" actions. All builders use
 * this so the provenance shape stays consistent across views.
 */
export function sourceRef(label: string, path: string, role?: string, relevance?: string): SourceRef {
  return {
    label,
    path,
    kind: "canonical_note" as const,
    role,
    relevance: (relevance || "high") as "high" | "medium" | "low",
  };
}

export function kindFromPath(path: string): string {
  if (path.includes("/entities/")) return "entity";
  if (path.includes("/projects/")) return "project";
  if (path.includes("/research/")) return "research";
  if (path.includes("/system/")) return "system";
  if (path.includes("/work/")) return "work";
  if (path.includes("/private/")) return "personal";
  if (path.includes("/journal/")) return "journal";
  if (path.includes("/memory/")) return "memory";
  return "note";
}

export function nameFromPath(entry: string | IndexEntry | ResearchProject): string {
  if (typeof entry === "string") return entry.split("/").pop()?.replace(/\.md$/, "") || "";
  return entry.name;
}

/**
 * Infer a theme label from arbitrary entry body — generic, vault-agnostic.
 * Priority: first markdown heading, then first wiki-link, then first #tag.
 * Falls back to null when nothing useful surfaces (caller picks a default).
 */
export function inferTheme(body: string | undefined): string | null {
  if (!body) return null;
  const headingMatch = body.match(/^#{2,4}\s+(.+?)\s*$/m);
  if (headingMatch) return headingMatch[1].trim().slice(0, 40);
  const wikiMatch = body.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
  if (wikiMatch) return wikiMatch[1].trim().slice(0, 40);
  const tagMatch = body.match(/(?:^|\s)#([a-zA-Z][\w-]+)/);
  if (tagMatch) {
    return tagMatch[1].split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").slice(0, 40);
  }
  return null;
}

/**
 * Resolve an expected "monthly work log" path from the probed vault layout.
 * Defaults to `<workDir>/log/<year>/<month>.md` when the layout has a
 * workDir. Legacy `wiki/work/log/...` fallback for older vaults.
 */
export function monthLogPath(year: number, monthName: string): string {
  const layout = getVaultLayout();
  const workDir = layout?.workDir;
  if (workDir) return `${workDir}/log/${year}/${monthName}.md`;
  return `wiki/work/log/${year}/${monthName}.md`;
}

/**
 * Resolve an expected "weekly work summary" path from the probed vault layout.
 */
export function weekLogPath(year: number, weekNum: number): string {
  const layout = getVaultLayout();
  const workDir = layout?.workDir;
  const weekStr = `W${String(weekNum).padStart(2, "0")}`;
  if (workDir) return `${workDir}/weeks/${year}/${weekStr}.md`;
  return `wiki/work/weeks/${year}/${weekStr}.md`;
}

export function currentMonthPaths(): { current: string; previous: string; currentLabel: string; previousLabel: string } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthNames = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
  ];
  const currentMonthName = monthNames[now.getMonth()];

  let prevYear = currentYear;
  let prevMonthIdx = now.getMonth() - 1;
  if (prevMonthIdx < 0) { prevMonthIdx = 11; prevYear--; }
  const prevMonthName = monthNames[prevMonthIdx];

  return {
    current: monthLogPath(currentYear, currentMonthName),
    previous: monthLogPath(prevYear, prevMonthName),
    currentLabel: `${currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1)} ${currentYear}`,
    previousLabel: `${prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)} ${prevYear}`,
  };
}
