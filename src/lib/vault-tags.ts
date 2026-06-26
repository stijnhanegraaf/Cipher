/**
 * Builds and caches the vault's tag-to-notes index.
 *
 * Every .md file is walked; tags are extracted via extractTags() from
 * frontmatter + body. Results are cached per-vault until
 * `invalidateTagCache()` is called. Returns empty collections when no
 * vault is connected.
 */
import "server-only";
import { stat } from "fs/promises";
import { join } from "path";
import { walkFiles } from "@/lib/fs/walk";
import { getVaultPath, readVaultFile } from "./vault-reader";
import { extractTags, normalizeTag } from "@/lib/markdown/tags";

// ─── Types ────────────────────────────────────────────────────────────

export interface TagEntry {
  path: string;
  title: string;
  mtime: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

// ─── Cache ────────────────────────────────────────────────────────────
// Built lazily per vault path. Invalidated when vault-reader.setVaultPath
// clears its caches, or when a write occurs via invalidateAfterWrite.

const _tagCache = new Map<string, { index: Map<string, TagEntry[]>; builtAt: number }>();

function cacheKey(root: string): string {
  return root;
}

// ─── Build ────────────────────────────────────────────────────────────

async function buildTagIndex(): Promise<Map<string, TagEntry[]>> {
  const root = getVaultPath();
  if (!root) return new Map();

  const key = cacheKey(root);
  const cached = _tagCache.get(key);
  if (cached) return cached.index;

  const paths = await walkFiles(root, { extensions: [".md"] });

  const index = new Map<string, TagEntry[]>();

  for (const relPath of paths) {
    const file = await readVaultFile(relPath);
    if (!file) continue;

    const name = relPath.split("/").pop()?.replace(/\.md$/i, "") || relPath;
    const title = (file.frontmatter.title as string) || name;

    let mtime = 0;
    try {
      const s = await stat(join(root, relPath));
      mtime = s.mtimeMs;
    } catch { /* ignore */ }

    const tags = extractTags(file.content, file.frontmatter);
    const entry: TagEntry = { path: relPath, title, mtime };

    for (const tag of tags) {
      const existing = index.get(tag);
      if (existing) {
        existing.push(entry);
      } else {
        index.set(tag, [entry]);
      }
    }
  }

  _tagCache.set(key, { index, builtAt: Date.now() });
  return index;
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * All tags in the vault with note counts, sorted by count desc then name.
 * Returns [] when no vault is connected.
 */
export async function collectTags(): Promise<TagCount[]> {
  const index = await buildTagIndex();
  const counts: TagCount[] = [];
  for (const [tag, entries] of index) {
    counts.push({ tag, count: entries.length });
  }
  counts.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  return counts;
}

/**
 * Notes carrying `tag` (exact normalized match), sorted by mtime desc.
 * Returns [] when no vault is connected or when no notes carry the tag.
 *
 * @param tag  Raw or normalized tag string — normalized before lookup.
 */
export async function notesForTag(tag: string): Promise<TagEntry[]> {
  const normalized = normalizeTag(tag);
  if (!normalized) return [];
  const index = await buildTagIndex();
  const entries = index.get(normalized) ?? [];
  return [...entries].sort((a, b) => b.mtime - a.mtime);
}

/**
 * Flush the cached tag index. Call after vault changes — normally done
 * automatically on `setVaultPath()` and `invalidateAfterWrite()`.
 */
export function invalidateTagCache(): void {
  _tagCache.clear();
}
