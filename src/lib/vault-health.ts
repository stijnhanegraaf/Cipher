import "server-only";
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import {
  getVaultPath,
  readVaultFile,
  extractLinks,
  resolveLink,
} from "./vault-reader";
import type { VaultHealthMetrics, BrokenLinkSample, StaleNoteSample } from "./view-models";

// Simple in-memory cache keyed by vault path + rough TTL. Walking 500+
// files to resolve every wiki-link is heavy; cache for 60s.
const _cache = new Map<string, { builtAt: number; metrics: VaultHealthMetrics }>();
const TTL_MS = 60 * 1000;

const STALE_DAYS = 30;
const MAX_SAMPLES = 8;

/** Folders we consider "active" for stale-note reporting. */
const ACTIVE_FOLDERS = ["wiki/projects", "wiki/work", "wiki/knowledge", "wiki/system"];

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

function isActive(path: string): boolean {
  return ACTIVE_FOLDERS.some((f) => path.startsWith(f));
}

/**
 * Build vault-wide health metrics. Walks every .md file once, resolves every
 * wiki-link to detect broken targets, records mtime per file for stale-note
 * reporting and a 30-day activity histogram. Results are cached per vault
 * for 60s to keep repeated /api/query calls fast.
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

  const brokenSamples: BrokenLinkSample[] = [];
  let brokenCount = 0;

  const staleSamples: StaleNoteSample[] = [];
  let staleCount = 0;

  for (const path of paths) {
    // mtime for activity + stale.
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
      if (ageDays < 30) {
        // Index 0 = 29 days ago, index 29 = today.
        days[29 - ageDays]++;
      }
      if (isActive(path) && ageDays >= STALE_DAYS) {
        staleCount++;
        if (staleSamples.length < MAX_SAMPLES) {
          staleSamples.push({ path, title: titleFromPath(path), daysStale: ageDays });
        }
      }
    }

    // Broken links: extract + resolve.
    const file = await readVaultFile(path);
    if (!file) continue;
    const links = extractLinks(file.content);
    for (const link of links) {
      const target = await resolveLink(link.path);
      if (target) continue;
      brokenCount++;
      if (brokenSamples.length < MAX_SAMPLES) {
        brokenSamples.push({ from: path, label: link.path, target: link.path });
      }
    }
  }

  // Sort stale samples by age desc.
  staleSamples.sort((a, b) => b.daysStale - a.daysStale);

  const total = days.reduce((s, d) => s + d, 0);
  const peak = days.reduce((m, d) => (d > m ? d : m), 0);

  const metrics: VaultHealthMetrics = {
    brokenLinks: { count: brokenCount, samples: brokenSamples },
    staleNotes: { count: staleCount, samples: staleSamples },
    activity: { days, total, peak },
    totalFiles: paths.length,
  };

  _cache.set(root, { builtAt: now, metrics });
  return metrics;
}

/** Invalidation hook — should be called from setVaultPath. */
export function invalidateHealthCache(): void {
  _cache.clear();
}
