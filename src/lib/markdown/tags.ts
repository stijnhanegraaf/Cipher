/**
 * Pure tag-extraction utilities for Obsidian-style markdown notes.
 *
 * No filesystem access, no React — Node-testable and safe to import in
 * any context (client, server, build scripts).
 *
 * Sources of truth:
 *   - `normalizeTag`  — canonical form for comparison and URL segments.
 *   - `extractTags`   — collects from frontmatter + body, deduped, normalized.
 *   - `primaryTag`    — first tag in the extracted list (or "").
 *
 * Inline scan uses `buildFenceMask` from anchors.ts so that `#tag` inside
 * ``` or ~~~ fenced blocks is never collected.
 */

import { buildFenceMask } from "./anchors";

// ─── normalizeTag ─────────────────────────────────────────────────────────────

/**
 * Normalize a raw tag string to its canonical comparison/URL form.
 *
 * Steps (in order):
 *   1. Strip a single leading `#`.
 *   2. Trim surrounding whitespace.
 *   3. Lowercase.
 *   4. Collapse every internal run of whitespace to a single `-`.
 *   5. Keep nested `/` (Obsidian hierarchical tags), `_`, `-`.
 *
 * Returns `""` for inputs that produce no valid characters after normalisation
 * (e.g. `"#!!"` or `""`). Callers should drop empty results.
 */
export function normalizeTag(raw: string): string {
  // Strip one leading '#'
  let s = raw.startsWith("#") ? raw.slice(1) : raw;
  // Trim surrounding whitespace
  s = s.trim();
  // Lowercase
  s = s.toLowerCase();
  // Collapse internal whitespace runs to '-'
  s = s.replace(/\s+/g, "-");
  // Remove any character that is not a letter, digit, hyphen, underscore, or slash.
  // Using a simple ASCII+common-unicode approach that satisfies the tests.
  // We keep: word chars (\w = [A-Za-z0-9_]), hyphens, slashes, and
  // non-ASCII Unicode letters/digits (via keeping anything >= 0x80).
  s = s.replace(/[^\w\-/-￿]/g, "");
  return s;
}

// ─── inline tag regex ─────────────────────────────────────────────────────────

/**
 * Matches an inline `#tag` where:
 *   - Preceded by start-of-string, start-of-line, or whitespace (not mid-word).
 *   - First char after `#` MUST be a Unicode letter (rejects `#123`, `#fff`, etc.).
 *   - Subsequent chars may be letters, digits, `_`, `/`, `-`.
 *
 * The `u` flag enables `\p{L}` / `\p{N}` Unicode categories.
 * The `g` flag allows repeated `exec` calls.
 * The `m` flag makes `^` match start-of-line so `#tag` at the start of a
 * content line is accepted even when the content string has no preceding char.
 */
const INLINE_TAG_RE = /(?:^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/gmu;

/**
 * CSS hex color pattern: exactly 3, 4, 6, or 8 hex digits (case-insensitive).
 * `#fff`, `#aabbcc`, `#abc`, `#aabbccdd` etc. are rejected as tag candidates.
 */
const HEX_COLOR_RE = /^[0-9a-f]{3}$|^[0-9a-f]{4}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i;

// ─── extractTags ─────────────────────────────────────────────────────────────

/**
 * Extract the deduped, normalized tag set for a note.
 *
 * Ordering: frontmatter tags first (declaration order), then inline `#tag`
 * occurrences (first-seen order). Duplicates are dropped on first-seen basis.
 *
 * Frontmatter sources (checked in order, first non-empty wins):
 *   - `tags` key: `string[]` | `string` (space- and/or comma-separated).
 *   - `tag` key (singular alias): same forms as above.
 *
 * Inline scan:
 *   - Skips lines inside fenced code blocks (``` or ~~~) via `buildFenceMask`.
 *   - Skips markdown anchor links `[text](#anchor)` by pre-stripping them.
 *   - Requires the leading-letter rule so `#fff` hex codes and `#123` are
 *     rejected.
 *
 * @param content    The note body (after frontmatter has been stripped by the
 *                   caller — though the function is tolerant if it isn't).
 * @param frontmatter Parsed frontmatter record from `parseFrontmatter`.
 */
export function extractTags(
  content: string,
  frontmatter: Record<string, unknown>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  function addTag(raw: string): void {
    const normalized = normalizeTag(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  // ── 1. Frontmatter tags ───────────────────────────────────────────────────
  // Try `tags` first, fall back to `tag` alias.
  const rawFm = frontmatter["tags"] ?? frontmatter["tag"];

  if (Array.isArray(rawFm)) {
    for (const entry of rawFm) {
      if (typeof entry === "string" && entry.trim()) {
        addTag(entry);
      }
    }
  } else if (typeof rawFm === "string" && rawFm.trim()) {
    // Split on commas and/or whitespace, filter empties.
    const parts = rawFm.split(/[\s,]+/).filter(Boolean);
    for (const part of parts) {
      addTag(part);
    }
  }

  // ── 2. Inline body tags ───────────────────────────────────────────────────
  if (content) {
    const lines = content.split(/\r?\n/);
    const mask = buildFenceMask(lines);

    // Build a cleaned version of the content for inline scanning:
    // - Zero out fenced lines (replace with blank) so the regex never sees them.
    // - Strip markdown anchor links [text](#anchor) to avoid treating #anchor as a tag.
    const cleanedLines = lines.map((line, i) => {
      if (mask[i]) return "";
      // Remove markdown anchor link patterns: [label](#anchor)
      return line.replace(/\[[^\]]*\]\(#[^)]*\)/g, "");
    });
    const cleanedContent = cleanedLines.join("\n");

    // Reset lastIndex before iterating (regex is reused with /g flag).
    INLINE_TAG_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = INLINE_TAG_RE.exec(cleanedContent)) !== null) {
      const candidate = m[1];
      // Reject CSS hex color codes: #fff, #aabbcc, #abc, #aabbccdd, etc.
      if (!HEX_COLOR_RE.test(candidate)) {
        addTag(candidate);
      }
    }
  }

  return result;
}

// ─── primaryTag ──────────────────────────────────────────────────────────────

/**
 * Return the primary tag for a note — the first entry in the extracted tag
 * list, or `""` when the note has no tags.
 *
 * This is the tag used for graph coloring and other single-tag surfaces.
 */
export function primaryTag(tags: string[]): string {
  return tags[0] ?? "";
}
