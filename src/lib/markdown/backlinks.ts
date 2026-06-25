/**
 * Pure (no-fs, no-React) backlinks helper.
 *
 * Finds every [[wiki-link]] in source content whose resolved target basename
 * matches a given target name, and extracts a short context window around
 * each occurrence.
 *
 * Uses the same WIKILINK_RE and normalize logic as vault-reader so
 * escaped-pipe/table cases behave identically to extractLinks.
 */
import { WIKILINK_RE, parseWikiTarget } from "./wikilink";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MentionSnippet {
  /** char offset of the matched [[link]] in content */
  offset: number;
  /** trimmed one-line context window around the link, link markup stripped */
  snippet: string;
  /** the alias/label as displayed in the link, or the bare target */
  matchedText: string;
}

// ─── Normalizer (mirrors resolveLink:836 in vault-reader.ts) ─────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s-]+/g, " ").trim();
}

/** Return the last path segment without .md extension, normalized. */
function lastSegmentNormalized(target: string): string {
  const seg = target.split("/").pop() ?? target;
  return normalize(seg.replace(/\.md$/i, ""));
}

// ─── Snippet extractor ────────────────────────────────────────────────────────

const DEFAULT_RADIUS = 90;

/**
 * Find every [[wiki-link]] in `content` whose resolved target basename
 * (case-insensitive, space/hyphen-normalized) equals `targetName`, and
 * return a short context window around each.
 *
 * - `targetName` is the basename WITHOUT extension (e.g. "q3-plan").
 * - `radius` chars on each side (default 90).
 * - The [[...]] markup is stripped to its display text in the snippet.
 * - Returns [] when no mention found or inputs are empty. Never throws.
 */
export function extractMentionSnippets(
  content: string,
  targetName: string,
  radius = DEFAULT_RADIUS,
): MentionSnippet[] {
  try {
    if (!content || !targetName) return [];
    const normalTarget = normalize(targetName);
    if (!normalTarget) return [];

    const results: MentionSnippet[] = [];
    const re = new RegExp(WIKILINK_RE.source, WIKILINK_RE.flags);

    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const rawTarget = match[1].trim().replace(/\\+$/, "");
      const rawLabel = match[2]
        ? match[2].trim().replace(/\\+$/, "")
        : null;

      if (!rawTarget) continue;

      const parsed = parseWikiTarget(rawTarget + (rawLabel ? "|" + rawLabel : ""));
      const baseSegment = lastSegmentNormalized(parsed.target);
      if (baseSegment !== normalTarget) continue;

      const matchedText = rawLabel ?? parsed.target.split("/").pop() ?? parsed.target;
      const offset = match.index;
      const matchLen = match[0].length;

      const snippet = buildSnippet(content, offset, matchLen, matchedText, radius);
      results.push({ offset, snippet, matchedText });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Convenience: return the first snippet, or "" when there is none.
 */
export function extractMentionSnippet(
  content: string,
  targetName: string,
  radius = DEFAULT_RADIUS,
): string {
  try {
    const all = extractMentionSnippets(content, targetName, radius);
    return all[0]?.snippet ?? "";
  } catch {
    return "";
  }
}

// ─── Window builder ───────────────────────────────────────────────────────────

function buildSnippet(
  content: string,
  offset: number,
  matchLen: number,
  displayText: string,
  radius: number,
): string {
  const total = content.length;

  // Raw window boundaries (before clamping)
  let start = Math.max(0, offset - radius);
  let end = Math.min(total, offset + matchLen + radius);

  // Expand/shrink to a sentence or line boundary when possible.
  // For the leading edge: walk LEFT to find a previous newline or ". " (sentence end).
  const leftClipped = start > 0;
  if (leftClipped) {
    const searchLeft = content.lastIndexOf("\n", offset - 1);
    const sentLeft = content.lastIndexOf(". ", offset - 1);
    const boundary = Math.max(searchLeft, sentLeft);
    if (boundary !== -1 && boundary > start) {
      // Move start to just after the boundary marker
      start = boundary + (content[boundary] === "." ? 2 : 1);
    }
  }

  // For the trailing edge: walk RIGHT to find next newline or ". ".
  const rightClipped = end < total;
  if (rightClipped) {
    const nlRight = content.indexOf("\n", offset + matchLen);
    const sentRight = content.indexOf(". ", offset + matchLen);
    let boundary = -1;
    if (nlRight !== -1 && sentRight !== -1) {
      boundary = Math.min(nlRight, sentRight);
    } else {
      boundary = nlRight !== -1 ? nlRight : sentRight;
    }
    if (boundary !== -1 && boundary < end) {
      end = boundary + (content[boundary] === "." ? 2 : 1);
    }
  }

  // Extract window and strip [[wiki-link]] markup to display text
  let window = content.slice(start, end);

  // Replace the [[link]] token in the window with the display text
  window = window.replace(/\[\[([^\]]+?)\]\]/g, (_m, inner) => {
    const p = parseWikiTarget(inner);
    if (p.alias) return p.alias;
    const seg = p.target.split("/").pop() ?? p.target;
    return seg;
  });

  // Collapse all whitespace (newlines etc.) to single spaces
  window = window.replace(/\s+/g, " ").trim();

  // Ellipsize when we clipped from the original content
  const didClipLeft = start > 0;
  const didClipRight = end < total;

  if (didClipLeft) window = "…" + window;
  if (didClipRight) window = window + "…";

  return window;
}
