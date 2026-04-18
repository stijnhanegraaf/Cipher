import "server-only";
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import {
  getVaultPath,
  getVaultLayout,
  readVaultFile,
  extractLinks,
  resolveLink,
} from "./vault-reader";
import type {
  VaultHealthMetrics,
  BrokenLinkSample,
  StaleNoteSample,
  FolderCount,
  HubNote,
} from "./view-models";

// Cached per-vault with a short TTL. The walk is O(n * avg_links) where we
// resolve every wiki-link in every file; for ~250 files × ~5 links that's
// ~1250 resolves — cheap but not free, so 60s cache is plenty.
const _cache = new Map<string, { builtAt: number; metrics: VaultHealthMetrics }>();
const TTL_MS = 60 * 1000;

const STALE_DAYS = 30;
const SAMPLE_CAP = 8;
const FULL_CAP = 200;
const HUB_CAP = 10;

/**
 * Folders we consider "active" for stale-note reporting. Derived from the
 * probed vault layout at call time, so any vault structure works.
 */
function activeFolders(): string[] {
  const layout = getVaultLayout();
  if (!layout) return [];
  const dirs = [
    layout.projectsDir,
    layout.workDir,
    layout.entitiesDir,
    layout.researchDir,
    layout.systemDir,
  ].filter((d): d is string => !!d);
  // Also include the parent of entitiesDir / researchDir when they sit
  // under a common umbrella (e.g. wiki/knowledge/entities + research) —
  // so notes in the umbrella root are tracked too.
  const umbrellas = new Set<string>();
  for (const d of dirs) {
    const parent = d.includes("/") ? d.split("/").slice(0, -1).join("/") : "";
    if (parent && parent !== layout.root && parent !== "wiki") umbrellas.add(parent);
  }
  return Array.from(new Set([...dirs, ...umbrellas]));
}

async function walkMd(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > 8) return;
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".obsidian") continue;
        await walk(join(absDir, entry.name), rel ? `${rel}/${entry.name}` : entry.name, depth + 1);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        out.push(rel ? `${rel}/${entry.name}` : entry.name);
      }
    }
  }
  await walk(root, "", 0);
  return out;
}

function titleFromPath(p: string): string {
  return (p.split("/").pop() || p).replace(/\.md$/i, "").replace(/[-_]+/g, " ");
}

function topFolder(p: string): string {
  return p.includes("/") ? p.split("/")[0] : "(root)";
}

function isActive(path: string, active: string[]): boolean {
  return active.some((f) => path.startsWith(f));
}

/**
 * Walk the vault once, produce comprehensive health metrics for the
 * dashboard: activity histogram + week total, broken-link full list,
 * stale-note full list, top hubs by backlink count, folder distribution,
 * orphan count, total links.
 */
export async function buildVaultHealth(): Promise<VaultHealthMetrics | null> {
  const root = getVaultPath();
  if (!root) return null;

  const cached = _cache.get(root);
  if (cached && Date.now() - cached.builtAt < TTL_MS) return cached.metrics;

  const paths = await walkMd(root);
  if (paths.length === 0) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const days: number[] = new Array(30).fill(0);
  const active = activeFolders();

  const brokenAll: BrokenLinkSample[] = [];
  const staleAll: StaleNoteSample[] = [];

  // Degree tracking for hubs + orphans. Backlinks are counted when a
  // link is resolved to a target in the vault.
  const backlinks = new Map<string, number>();
  const outlinks = new Map<string, number>();
  const titles = new Map<string, string>();

  // Folder distribution.
  const folderCounts = new Map<string, number>();
  for (const p of paths) {
    const f = topFolder(p);
    folderCounts.set(f, (folderCounts.get(f) ?? 0) + 1);
    titles.set(p, titleFromPath(p));
  }

  let totalLinks = 0;

  for (const path of paths) {
    // Activity + stale.
    let mtime = 0;
    try {
      const s = await stat(join(root, path));
      mtime = s.mtimeMs;
    } catch {
      /* skip */
    }
    if (mtime) {
      const ageMs = now - mtime;
      const ageDays = Math.floor(ageMs / dayMs);
      if (ageDays < 30) days[29 - ageDays]++;
      if (isActive(path, active) && ageDays >= STALE_DAYS) {
        if (staleAll.length < FULL_CAP) {
          staleAll.push({ path, title: titles.get(path) ?? path, daysStale: ageDays });
        }
      }
    }

    // Links.
    const file = await readVaultFile(path);
    if (!file) continue;
    const links = extractLinks(file.content);
    for (const link of links) {
      totalLinks++;
      const target = await resolveLink(link.path);
      if (target) {
        outlinks.set(path, (outlinks.get(path) ?? 0) + 1);
        backlinks.set(target, (backlinks.get(target) ?? 0) + 1);
      } else {
        if (brokenAll.length < FULL_CAP) {
          brokenAll.push({ from: path, label: link.path, target: link.path });
        }
      }
    }
  }

  // Orphans: in-set with zero in and zero out.
  let orphans = 0;
  for (const p of paths) {
    const b = backlinks.get(p) ?? 0;
    const o = outlinks.get(p) ?? 0;
    if (b === 0 && o === 0) orphans++;
  }

  // Hubs: top-N by backlink count.
  const hubs: HubNote[] = Array.from(backlinks.entries())
    .map(([p, b]) => ({ path: p, title: titles.get(p) ?? p, backlinks: b }))
    .sort((a, b) => b.backlinks - a.backlinks)
    .slice(0, HUB_CAP);

  // Sort stale by age desc.
  staleAll.sort((a, b) => b.daysStale - a.daysStale);

  // Activity totals.
  const total = days.reduce((s, d) => s + d, 0);
  const peak = days.reduce((m, d) => (d > m ? d : m), 0);
  const week = days.slice(-7).reduce((s, d) => s + d, 0);

  // Folder distribution → sorted array.
  const folders: FolderCount[] = Array.from(folderCounts.entries())
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => b.count - a.count);

  // Backlink-count distribution across every note. Bucketed to 5 tiers.
  const buckets = [
    { bucket: "Orphan",    range: "0",     count: 0 },
    { bucket: "Light",     range: "1–2",   count: 0 },
    { bucket: "Linked",    range: "3–5",   count: 0 },
    { bucket: "Connected", range: "6–10",  count: 0 },
    { bucket: "Hub",       range: "11+",   count: 0 },
  ];
  for (const p of paths) {
    const b = backlinks.get(p) ?? 0;
    if (b === 0) buckets[0].count++;
    else if (b <= 2) buckets[1].count++;
    else if (b <= 5) buckets[2].count++;
    else if (b <= 10) buckets[3].count++;
    else buckets[4].count++;
  }

  const metrics: VaultHealthMetrics = {
    brokenLinks: {
      count: brokenAll.length,
      samples: brokenAll.slice(0, SAMPLE_CAP),
      all: brokenAll,
    },
    staleNotes: {
      count: staleAll.length,
      samples: staleAll.slice(0, SAMPLE_CAP),
      all: staleAll,
    },
    activity: { days, total, peak, week },
    totalFiles: paths.length,
    totalLinks,
    orphans,
    hubs,
    folders,
    linkDistribution: buckets,
  };

  _cache.set(root, { builtAt: now, metrics });
  return metrics;
}

export function invalidateHealthCache(): void {
  _cache.clear();
}
