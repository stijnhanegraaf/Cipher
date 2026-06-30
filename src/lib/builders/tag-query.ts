/**
 * Pure tag-query parser — extracts `#tag` tokens from a raw search query
 * BEFORE any length filter, so short tags like `#ai` are captured correctly.
 *
 * No filesystem access, no React. Safe to import anywhere.
 */

import { normalizeTag } from "@/lib/markdown/tags";

export interface TagQueryResult {
  /** Normalized tags pulled from the query (e.g. `["design", "ai"]`). */
  tags: string[];
  /** Remaining free-text after `#tag` tokens are removed, trimmed. */
  rest: string;
}

/**
 * Pull every `#token` out of `query`, normalize each via `normalizeTag`, and
 * return them alongside the leftover free-text.
 *
 * Rules:
 *   - A `#token` is `#` followed by one or more non-whitespace characters.
 *   - Each extracted token is run through `normalizeTag`; empty results are
 *     discarded (e.g. if someone types `##`).
 *   - Duplicate normalized tags are deduplicated (first-seen wins).
 *   - The `rest` is the query with all `#token` substrings removed, then
 *     trimmed of leading/trailing whitespace (internal runs collapse to single
 *     spaces).
 *
 * @example
 *   parseTagQuery("#design palette")
 *   // => { tags: ["design"], rest: "palette" }
 *
 *   parseTagQuery("#ai")
 *   // => { tags: ["ai"], rest: "" }   ← short tags NOT filtered by length
 */
export function parseTagQuery(query: string): TagQueryResult {
  const TAG_RE = /#(\S+)/g;

  const tags: string[] = [];
  const seen = new Set<string>();
  let rest = query;

  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(query)) !== null) {
    const normalized = normalizeTag(match[1]);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
  }

  // Remove all #token occurrences from the query to produce rest.
  rest = query.replace(/#\S+/g, " ").replace(/\s+/g, " ").trim();

  return { tags, rest };
}
