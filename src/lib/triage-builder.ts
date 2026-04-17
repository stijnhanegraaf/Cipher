import "server-only";
import { stat, readdir } from "fs/promises";
import { join, extname } from "path";
import {
  readVaultFile,
  parseCheckboxes,
  getVaultPath,
  getVaultLayout,
  resolveLink,
} from "./vault-reader";

// ─── TriageRow types ──────────────────────────────────────────────────
// One unified row model. All four kinds render through the same row
// component; the `kind` discriminator selects the icon + trailing meta.

export type TriageRow =
  | {
      kind: "task";
      id: string;
      priority: "high" | "medium" | "low";
      status: "open" | "in_progress" | "blocked";
      text: string;
      path: string;
      lineIndex: number;
      mtime: number;
    }
  | {
      kind: "highlight";
      id: string;
      summary: string;
      source: string;
      path: string | null;
      generatedAt: number;
    }
  | {
      kind: "mention";
      id: string;
      fromPath: string;
      fromTitle: string;
      toEntity: string;
      excerpt: string;
      mtime: number;
    }
  | {
      kind: "activity";
      id: string;
      path: string;
      title: string;
      change: "new" | "edited";
      mtime: number;
    };

export interface TriagePayload {
  rows: TriageRow[];
  counts: {
    all: number;
    open: number;
    blocked: number;
    changed24h: number;
    mentions: number;
    highlights: number;
  };
}

// ─── Task row extraction ──────────────────────────────────────────────
// Reuses parseCheckboxes. Infers priority + status from text tokens.

function inferStatus(text: string, checked: boolean): "open" | "in_progress" | "blocked" {
  if (/\bblocked\b|\bwaiting\b/i.test(text)) return "blocked";
  if (/\bin.?progress\b|\bactive\b|\bdoing\b/i.test(text)) return "in_progress";
  return "open";
}

function inferPriority(text: string): "high" | "medium" | "low" {
  if (/\bhigh\b|\burgent\b|\bcritical\b|\bp0\b|\bp1\b/i.test(text)) return "high";
  if (/\bmedium\b|\bmed\b|\bp2\b/i.test(text)) return "medium";
  return "low";
}

function stripWikiLinks(text: string): string {
  return text.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_, p, l) => l || p);
}

async function collectTasks(workDir: string | null): Promise<TriageRow[]> {
  if (!workDir) return [];
  const root = getVaultPath();
  if (!root) return [];

  const rows: TriageRow[] = [];
  const files = await safeListMd(join(root, workDir));

  for (const rel of files) {
    const vaultRel = workDir + "/" + rel;
    const file = await readVaultFile(vaultRel);
    if (!file) continue;
    const checkboxes = parseCheckboxes(file.content);
    for (const cb of checkboxes) {
      if (cb.checked) continue; // only open / in_progress / blocked surface in triage
      rows.push({
        kind: "task",
        id: `t-${vaultRel}-${cb.lineIndex}`,
        priority: inferPriority(cb.text),
        status: inferStatus(cb.text, cb.checked),
        text: stripWikiLinks(cb.text).trim(),
        path: vaultRel,
        lineIndex: cb.lineIndex,
        mtime: file.mtime,
      });
    }
  }
  return rows;
}

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

// ─── Recent activity ──────────────────────────────────────────────────
// Walks the vault shallowly (depth ≤4), picks files mtime'd within N days,
// returns as activity rows.

type ActivityRow = Extract<TriageRow, { kind: "activity" }>;

async function collectActivity(maxDepth = 4, maxAgeDays = 14): Promise<ActivityRow[]> {
  const root = getVaultPath();
  if (!root) return [];
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const rows: ActivityRow[] = [];

  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: Array<{ name: string; isFile: boolean; isDir: boolean }> = [];
    try {
      const raw = await readdir(absDir, { withFileTypes: true });
      entries = raw
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ name: e.name, isFile: e.isFile(), isDir: e.isDirectory() }));
    } catch {
      return;
    }
    for (const entry of entries) {
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isFile && extname(entry.name).toLowerCase() === ".md") {
        try {
          const s = await stat(join(absDir, entry.name));
          if (s.mtimeMs < cutoff) continue;
          const title = entry.name.replace(/\.md$/i, "");
          const change: "new" | "edited" = (s.birthtimeMs && s.mtimeMs - s.birthtimeMs < 60 * 1000) ? "new" : "edited";
          rows.push({
            kind: "activity",
            id: `a-${nextRel}`,
            path: nextRel,
            title,
            change,
            mtime: s.mtimeMs,
          });
        } catch {
          /* skip */
        }
      } else if (entry.isDir) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".obsidian") continue;
        await walk(join(absDir, entry.name), nextRel, depth + 1);
      }
    }
  }

  await walk(root, "", 0);
  return rows.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
}

// ─── Mentions ────────────────────────────────────────────────────────
// Very lightweight: looks at entity names from vault layout's entitiesDir,
// greps each one across the most-recently-modified files for wiki-link
// references. Returns (fromFile, toEntity) pairs.

async function collectMentions(entitiesDir: string | null, activityPaths: string[]): Promise<TriageRow[]> {
  if (!entitiesDir) return [];
  const root = getVaultPath();
  if (!root) return [];

  const entityFiles = await safeListMd(join(root, entitiesDir));
  const entityNames = entityFiles.map((f) => f.replace(/\.md$/i, ""));
  if (entityNames.length === 0) return [];

  const rows: TriageRow[] = [];
  const seen = new Set<string>();

  for (const rel of activityPaths.slice(0, 20)) {
    const file = await readVaultFile(rel);
    if (!file) continue;
    const title = (file.frontmatter.title as string) || rel.split("/").pop()?.replace(/\.md$/i, "") || rel;
    for (const name of entityNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\[\\[\\s*${escaped}\\b[^\\]]*\\]\\]`, "i");
      if (re.test(file.content)) {
        const key = `${rel}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const m = file.content.match(new RegExp(`(.{0,80}\\[\\[\\s*${escaped}\\b[^\\]]*\\]\\].{0,80})`, "i"));
        rows.push({
          kind: "mention",
          id: `m-${key}`,
          fromPath: rel,
          fromTitle: title,
          toEntity: name,
          excerpt: (m?.[1] || "").replace(/\s+/g, " ").trim(),
          mtime: file.mtime,
        });
      }
    }
  }
  return rows.slice(0, 15);
}

// ─── Highlights ──────────────────────────────────────────────────────
// Looks for a `highlights` or `weekly` style file in the work folder and
// surfaces its bullets as highlight rows. Minimal first pass — graceful
// when the file doesn't exist.

async function collectHighlights(workDir: string | null): Promise<TriageRow[]> {
  if (!workDir) return [];
  const root = getVaultPath();
  if (!root) return [];

  const candidates = [
    `${workDir}/highlights.md`,
    `${workDir}/weekly.md`,
    `${workDir}/this-week.md`,
  ];
  for (const cand of candidates) {
    const resolved = await resolveLink(cand);
    if (!resolved) continue;
    const file = await readVaultFile(resolved);
    if (!file) continue;
    const bullets = file.content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, "").trim())
      .filter((l) => l.length > 10)
      .slice(0, 4);
    return bullets.map((summary, i) => ({
      kind: "highlight" as const,
      id: `h-${resolved}-${i}`,
      summary: stripWikiLinks(summary),
      source: resolved.split("/").pop()?.replace(/\.md$/i, "") || "highlights",
      path: resolved,
      generatedAt: file.mtime,
    }));
  }
  return [];
}

// ─── Aggregate ────────────────────────────────────────────────────────
// Single entry for the /api/triage endpoint. Orders by urgency so the
// default view is scan-ready.

const urgencyOrder: Record<TriageRow["kind"], number> = {
  task: 0,
  mention: 1,
  activity: 2,
  highlight: 3,
};

export async function buildTriage(): Promise<TriagePayload> {
  const layout = getVaultLayout();
  const [tasks, activity, highlights] = await Promise.all([
    collectTasks(layout?.workDir ?? null),
    collectActivity(),
    collectHighlights(layout?.workDir ?? null),
  ]);
  const mentions = await collectMentions(layout?.entitiesDir ?? null, activity.map((a) => (a.kind === "activity" ? a.path : "")).filter(Boolean));

  const combined: TriageRow[] = [...tasks, ...mentions, ...activity, ...highlights];

  // Sort: blocked tasks first, then high-priority open, then in_progress,
  // then mentions (by recency), activity (by recency), highlights last.
  combined.sort((a, b) => {
    if (a.kind === "task" && b.kind === "task") {
      if (a.status !== b.status) {
        const rank = { blocked: 0, in_progress: 1, open: 2 } as const;
        return rank[a.status] - rank[b.status];
      }
      const pri = { high: 0, medium: 1, low: 2 } as const;
      if (a.priority !== b.priority) return pri[a.priority] - pri[b.priority];
      return b.mtime - a.mtime;
    }
    if (urgencyOrder[a.kind] !== urgencyOrder[b.kind]) {
      return urgencyOrder[a.kind] - urgencyOrder[b.kind];
    }
    const ma = "mtime" in a ? a.mtime : 0;
    const mb = "mtime" in b ? b.mtime : 0;
    return mb - ma;
  });

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const counts = {
    all: combined.length,
    open: combined.filter((r) => r.kind === "task" && r.status === "open").length,
    blocked: combined.filter((r) => r.kind === "task" && r.status === "blocked").length,
    changed24h: combined.filter((r) => "mtime" in r && r.mtime >= dayAgo).length,
    mentions: combined.filter((r) => r.kind === "mention").length,
    highlights: combined.filter((r) => r.kind === "highlight").length,
  };

  return { rows: combined.slice(0, 80), counts };
}
