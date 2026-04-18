/**
 * GET /api/vault/folders — lists vault folders for pin selection.
 */
import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "@/lib/vault-reader";

// Cache the folder list for 60s to keep typing fast.
let _cache: { root: string; builtAt: number; folders: string[] } | null = null;
const TTL_MS = 60 * 1000;

async function listAllFolders(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > 5) return;
    let entries: import("fs").Dirent[];
    try { entries = await readdir(absDir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".obsidian") continue;
      const relNext = rel ? `${rel}/${entry.name}` : entry.name;
      out.push(relNext);
      await walk(join(absDir, entry.name), relNext, depth + 1);
    }
  }
  await walk(root, "", 0);
  return out;
}

export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return NextResponse.json({ folders: [] });
  const now = Date.now();
  if (!_cache || _cache.root !== root || now - _cache.builtAt > TTL_MS) {
    _cache = { root, builtAt: now, folders: await listAllFolders(root) };
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  let folders = _cache.folders;
  if (q) folders = folders.filter((f) => f.toLowerCase().includes(q));
  folders = folders
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 20);
  return NextResponse.json({ folders });
}
