/**
 * GET /api/vault/index — flat vault index for the ⌘K palette.
 *
 * Returns every .md file's basename + folder, plus the probed entity
 * and project indexes and hub files. Cached per-vault for 60s so repeat
 * palette opens are instant.
 */
import { NextResponse } from "next/server";
import {
  getVaultPath,
  getEntityIndex,
  getProjectIndex,
  getHubFiles,
} from "@/lib/vault-reader";
import { walkFiles } from "@/lib/fs/walk";

export interface VaultIndex {
  files: { path: string; name: string; folder: string }[];
  entities: { path: string; name: string }[];
  projects: { path: string; name: string }[];
  hubs: { path: string; name: string }[];
}

const _cache = new Map<string, { builtAt: number; index: VaultIndex }>();
const TTL_MS = 60 * 1000;

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
    walkFiles(root, { extensions: [".md"] }),
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
