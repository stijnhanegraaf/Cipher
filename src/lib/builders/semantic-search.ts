/**
 * Pure mapper: RetrievedChunk[] → SearchResultsData.
 *
 * No I/O — unit-testable with Vitest. Consumed by /api/search route.
 */

import type { SearchResultsData } from "@/lib/view-models";
import type { RetrievedChunk } from "@/lib/chat/retrieval";
import { nameFromPath, kindFromPath } from "./shared";
import { toSearchKind } from "./search-kinds";

/** Max chars of chunk.text to include in the excerpt (heading prefix is additional). */
const EXCERPT_MAX = 140;

/**
 * Convert a list of retrieval chunks (cosine-sorted, best first) into the
 * standard SearchResultsData shape.
 *
 * - label: nameFromPath → hyphen-to-space, matching the exact-search path.
 * - excerpt: optional heading prefix + up to EXCERPT_MAX chars of chunk text.
 * - kind: toSearchKind(kindFromPath(path)) — same vocab as buildSearchResults.
 * - Dedup: path seen twice → keep the first entry (highest score, since
 *   retrieve() returns chunks cosine-sorted best-first).
 */
export function chunksToSearchResults(
  query: string,
  chunks: RetrievedChunk[],
): SearchResultsData {
  const seen = new Set<string>();
  const results: SearchResultsData["results"] = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.path)) continue;
    seen.add(chunk.path);

    const headingPrefix = chunk.heading ? `${chunk.heading} — ` : "";
    const textSnippet = chunk.text.slice(0, EXCERPT_MAX);
    const excerpt = headingPrefix + textSnippet;

    results.push({
      label: nameFromPath(chunk.path).replace(/-/g, " ") || chunk.path,
      path: chunk.path,
      excerpt,
      kind: toSearchKind(kindFromPath(chunk.path)),
    });
  }

  return { query, results };
}
