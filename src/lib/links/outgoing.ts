/**
 * outgoing.ts — pure helpers for computing outgoing links from a single note.
 *
 * No filesystem access, no server-only imports. The resolver is injected so
 * this module is trivially testable without mocking fs.
 */

export interface OutgoingLink {
  /** Raw wiki-link body, e.g. "projects/foo" or "Foo#Section" */
  target: string;
  /** Display label (alias or target) from extractLinks */
  label: string;
  /** Resolved vault-relative path, or null when broken */
  resolvedPath: string | null;
  /** true when resolvedPath is not null */
  broken: boolean;
}

/**
 * Compute resolved/broken outgoing links for a single note's extracted links.
 *
 * @param links   Array of `{ path, label }` objects from `extractLinks`.
 * @param resolve Injected resolver — `resolveLink` in production; a fake Map
 *                in tests. Must return a vault-relative path or null.
 *
 * Deduplication rules:
 * - Two links resolving to the same path → first wins (by resolvedPath key).
 * - Two broken links with the same target (case-insensitive) → first wins.
 * - Two broken links with different targets → both kept.
 *
 * Order: first-appearance in the `links` array.
 */
export async function computeOutgoingLinks(
  links: Array<{ path: string; label: string }>,
  resolve: (target: string) => Promise<string | null>,
): Promise<OutgoingLink[]> {
  const out: OutgoingLink[] = [];
  const seen = new Set<string>();

  for (const { path: target, label } of links) {
    const resolvedPath = await resolve(target);
    // Resolved links dedupe by resolved path; broken links dedupe by lowercase target.
    const key = resolvedPath !== null ? resolvedPath : `broken:${target.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ target, label, resolvedPath, broken: resolvedPath === null });
  }

  return out;
}

/**
 * Remove links that point back to the current note (anchor-insensitive).
 *
 * A self-link is one whose `resolvedPath`, stripped of any `#anchor`, equals
 * `selfPath` stripped of any `#anchor`. Unresolved (broken) links are never
 * self-links and are always kept.
 */
export function dropSelfLinks(
  links: OutgoingLink[],
  selfPath: string,
): OutgoingLink[] {
  const selfBase = selfPath.replace(/#.*$/, "");
  return links.filter((l) => {
    if (l.resolvedPath === null) return true; // broken links are never self
    return l.resolvedPath.replace(/#.*$/, "") !== selfBase;
  });
}
