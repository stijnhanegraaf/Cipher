/**
 * GET /api/vault/folders — lists vault folders for pin selection.
 */
import { NextRequest, NextResponse } from "next/server";
import { getVaultPath } from "@/lib/vault-reader";
import { walkDirs } from "@/lib/fs/walk";

// Cache the folder list for 60s to keep typing fast.
let _cache: { root: string; builtAt: number; folders: string[] } | null = null;
const TTL_MS = 60 * 1000;

/**
 * `GET /api/vault/folders?q=<substring>` — folder autocomplete for the pin dialog.
 *
 * Walks every non-hidden directory up to depth 5 and caches per-vault
 * for 60s. Filters by case-insensitive substring, sorts shortest-first,
 * caps at 20 results. Always 200: `{ folders: [] }` when no vault is
 * connected.
 */
export async function GET(req: NextRequest) {
  const root = getVaultPath();
  if (!root) return NextResponse.json({ folders: [] });
  const now = Date.now();
  if (!_cache || _cache.root !== root || now - _cache.builtAt > TTL_MS) {
    _cache = { root, builtAt: now, folders: await walkDirs(root) };
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  let folders = _cache.folders;
  if (q) folders = folders.filter((f) => f.toLowerCase().includes(q));
  folders = folders
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 20);
  return NextResponse.json({ folders });
}
