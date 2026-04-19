/**
 * GET /api/vault/index — flat vault index for the ⌘K palette.
 *
 * Returns every .md file's basename + folder, plus the probed entity
 * and project indexes and hub files. Cached per-vault for 60s so repeat
 * palette opens are instant.
 */
import { NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join, extname } from "path";
import {
  getVaultPath,
  getEntityIndex,
  getProjectIndex,
  getHubFiles,
} from "@/lib/vault-reader";

export interface VaultIndex {
  files: { path: string; name: string; folder: string }[];
  entities: { path: string; name: string }[];
  projects: { path: string; name: string }[];
  hubs: { path: string; name: string }[];
}

const _cache = new Map<string, { builtAt: number; index: VaultIndex }>();
const TTL_MS = 60 * 1000;

async function walkMd(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > 8) return;
    let entries: import("fs").Dirent[];
    try { entries = await readdir(absDir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === ".obsidian") continue;
        await walk(join(absDir, e.name), rel ? `${rel}/${e.name}` : e.name, depth + 1);
      } else if (e.isFile() && extname(e.name).toLowerCase() === ".md") {
        out.push(rel ? `${rel}/${e.name}` : e.name);
      }
    }
  }
  await walk(root, "", 0);
  return out;
}

export async function GET() {
  const root = getVaultPath();
  if (!root) {
    return NextResponse.json({ files: [], entities: [], projects: [], hubs: [] } satisfies VaultIndex);
  }
  const cached = _cache.get(root);
  if (cached && Date.now() - cached.builtAt < TTL_MS) {
    return NextResponse.json(cached.index);
  }
  const [paths, entities, projects, hubs] = await Promise.all([
    walkMd(root),
    getEntityIndex(),
    getProjectIndex(),
    getHubFiles(),
  ]);
  const files = paths.map((p) => ({
    path: p,
    name: (p.split("/").pop() ?? p).replace(/\.md$/i, ""),
    folder: p.includes("/") ? p.split("/").slice(0, -1).join("/") : "",
  }));
  const index: VaultIndex = {
    files,
    entities: entities.map((e) => ({ path: e.path, name: e.name })),
    projects: projects.map((p) => ({ path: p.path, name: p.name })),
    hubs: hubs.filter((h) => !!h.file).map((h) => ({ path: h.path, name: h.name })),
  };
  _cache.set(root, { builtAt: Date.now(), index });
  return NextResponse.json(index);
}
