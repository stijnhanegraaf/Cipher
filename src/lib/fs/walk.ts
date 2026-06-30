import { readdir } from "fs/promises";
import { join, extname } from "path";

export const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  ".obsidian",
  ".cipher",
]);

export interface WalkOptions {
  /** Max directory depth. Root entries are depth 0. Default 12. */
  maxDepth?: number;
  /** Lowercased extensions to include (e.g. [".md"]). Omit = all files. */
  extensions?: string[];
  /** Directory names to skip. Default DEFAULT_IGNORE_DIRS. */
  ignoreDirs?: Set<string>;
  /** Skip names starting with ".". Default true. */
  skipDotfiles?: boolean;
}

/**
 * Recursively list files under `root`, returning paths relative to `root`
 * (POSIX "/"-separated). One shared implementation replacing the
 * per-subsystem walkers. Never throws — unreadable dirs are skipped.
 */
export async function walkFiles(root: string, opts: WalkOptions = {}): Promise<string[]> {
  const maxDepth = opts.maxDepth ?? 12;
  const exts = opts.extensions?.map((e) => e.toLowerCase());
  const ignore = opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const skipDot = opts.skipDotfiles ?? true;
  const out: string[] = [];

  async function walk(absDir: string, rel: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (skipDot && e.name.startsWith(".")) continue;
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (ignore.has(e.name)) continue;
        await walk(join(absDir, e.name), nextRel, depth + 1);
      } else if (e.isFile()) {
        if (!exts || exts.includes(extname(e.name).toLowerCase())) {
          out.push(nextRel);
        }
      }
    }
  }

  await walk(root, "", 0);
  return out;
}

/** Recursively list directories under `root`, returning relative paths. */
export async function walkDirs(root: string, opts: WalkOptions = {}): Promise<string[]> {
  const maxDepth = opts.maxDepth ?? 12;
  const ignore = opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS;
  const skipDot = opts.skipDotfiles ?? true;
  const out: string[] = [];

  async function walk(absDir: string, rel: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import("fs").Dirent[];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (skipDot && e.name.startsWith(".")) continue;
      if (ignore.has(e.name)) continue;
      const nextRel = rel ? `${rel}/${e.name}` : e.name;
      out.push(nextRel);
      await walk(join(absDir, e.name), nextRel, depth + 1);
    }
  }

  await walk(root, "", 0);
  return out;
}
