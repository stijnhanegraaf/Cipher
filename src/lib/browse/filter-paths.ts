/**
 * filterPaths — pure, synchronous filter over the flat vault file index.
 *
 * Used by FileTree when a filter is active so it can surface files in
 * collapsed or never-loaded subtrees (the old `filterTree` could only walk
 * already-expanded nodes). The vault index (`/api/vault/index`) covers all
 * .md files, which is intentionally consistent with the ⌘K palette.
 *
 * Ranking: basename match > path-only match; then shorter path; then
 * lexicographic — deterministic for stable rendering without React keys
 * depending on array index.
 */

export interface IndexedFile {
  path: string;
  name: string;
  folder: string;
}

/**
 * Filter `files` by `needle`. Returns a new sorted array; never mutates input.
 *
 * - `needle` is trimmed and lowercased before matching.
 * - Empty / whitespace-only needle returns `[]`.
 * - A file matches if its `name` OR `path` contains the normalised needle
 *   (case-insensitive). No minimum needle length: even single-char filters work.
 */
export function filterPaths(
  files: readonly IndexedFile[],
  needle: string,
): IndexedFile[] {
  const n = needle.trim().toLowerCase();
  if (!n) return [];

  const matched: IndexedFile[] = [];
  for (const f of files) {
    const nameHit = f.name.toLowerCase().includes(n);
    const pathHit = f.path.toLowerCase().includes(n);
    if (nameHit || pathHit) matched.push(f);
  }

  return matched.sort((a, b) => {
    // Rank basename hit (0) above path-only hit (1)
    const aRank = a.name.toLowerCase().includes(n) ? 0 : 1;
    const bRank = b.name.toLowerCase().includes(n) ? 0 : 1;
    if (aRank !== bRank) return aRank - bRank;
    // Shorter path first
    if (a.path.length !== b.path.length) return a.path.length - b.path.length;
    // Lexicographic tie-break — stable, deterministic
    return a.path.localeCompare(b.path);
  });
}
