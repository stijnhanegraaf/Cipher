import { NextRequest, NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { getVaultPath } from "@/lib/vault-reader";

interface TreeChild {
  name: string;
  path: string;          // vault-relative, forward-slash
  type: "folder" | "file";
  ext: string;           // "" for folders
  size: number;          // 0 for folders
  mtime: number;         // ms since epoch
}

const CACHE = new Map<string, { at: number; data: TreeChild[] }>();
const TTL_MS = 30_000;

function safeJoin(root: string, rel: string): string | null {
  const abs = join(root, rel);
  const normalisedRoot = root.endsWith("/") ? root : root + "/";
  if (abs !== root && !abs.startsWith(normalisedRoot)) return null;
  return abs;
}

export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return NextResponse.json({ error: "no vault" }, { status: 404 });
  const rel = (req.nextUrl.searchParams.get("path") ?? "").replace(/^\/+/, "");
  const abs = safeJoin(root, rel);
  if (!abs) return NextResponse.json({ error: "path escapes vault" }, { status: 400 });

  const cacheKey = `${root}::${rel}`;
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ path: rel, children: cached.data });
  }

  let entries;
  try {
    entries = await readdir(abs, { withFileTypes: true });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const children: TreeChild[] = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const childAbs = join(abs, e.name);
    let s;
    try { s = await stat(childAbs); } catch { continue; }
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    children.push({
      name: e.name,
      path: childRel,
      type: e.isDirectory() ? "folder" : "file",
      ext: e.isDirectory() ? "" : extname(e.name).toLowerCase().replace(/^\./, ""),
      size: e.isDirectory() ? 0 : s.size,
      mtime: s.mtimeMs,
    });
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  CACHE.set(cacheKey, { at: Date.now(), data: children });
  return NextResponse.json({ path: rel, children });
}

export function invalidateVaultTreeCache() {
  CACHE.clear();
}
