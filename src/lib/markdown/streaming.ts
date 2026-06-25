/**
 * streaming.ts — pure helpers for streaming-safe Markdown sanitization.
 *
 * These run on every incremental token batch while the LLM stream is active.
 * They must be monotonic-prefix-safe: feeding a longer prefix never removes
 * content that was already stable in a shorter prefix.
 *
 * Citation markers ([^N]) are converted to private-use sentinels FIRST,
 * before any other transform, so remark-gfm cannot interpret them as GFM
 * footnotes (remark-gfm 4.x parses [^N] as footnote refs by default).
 *
 * Sentinel encoding: {digits}
 */

// Private-use area sentinels (never appear in normal markdown).
export const CITATION_SENTINEL_OPEN = "";
export const CITATION_SENTINEL_CLOSE = "";

const CITATION_RE = /\[\^(\d+)\]/g;

/**
 * protectCitations — replace [^N] markers with private-use sentinels.
 * Exported so StreamingMarkdown can call it for BOTH active and done states.
 * The sanitizer skips it when active:false (to return raw verbatim), but the
 * component always needs citations to render as buttons regardless of stream state.
 */
export function protectCitations(raw: string): string {
  return raw.replace(CITATION_RE, `${CITATION_SENTINEL_OPEN}$1${CITATION_SENTINEL_CLOSE}`);
}

/**
 * closeOpenFences — if the text has an unclosed code fence (``` or ~~~),
 * append a matching closer on its own line. Complete fences are untouched.
 */
export function closeOpenFences(raw: string): string {
  const lines = raw.split("\n");
  let inFence = false;
  let fenceMarker = "";

  for (const line of lines) {
    const backtickMatch = /^(`{3,})(.*)$/.exec(line);
    const tildeMatch = /^(~{3,})(.*)$/.exec(line);
    const match = backtickMatch ?? tildeMatch;

    if (!match) continue;

    const marker = match[1];
    if (!inFence) {
      // Opening fence: record marker type (``` or ~~~) and length
      inFence = true;
      fenceMarker = marker[0].repeat(marker.length); // normalize to correct char
    } else {
      // A line that starts with the same fence char and enough markers closes it
      if (line.startsWith(fenceMarker[0])) {
        const closeMatch = new RegExp(`^[${fenceMarker[0]}]{${fenceMarker.length},}\\s*$`).exec(line);
        if (closeMatch) {
          inFence = false;
          fenceMarker = "";
        }
      }
    }
  }

  if (inFence) {
    return raw + "\n" + fenceMarker[0].repeat(fenceMarker.length);
  }

  return raw;
}

/**
 * sanitizeStreamingMarkdown — apply 6 ordered fixes to keep mid-stream
 * markdown from flickering. When active===false (stream done), returns
 * raw verbatim so the finished answer matches file-reader output exactly.
 *
 * Step order is load-bearing:
 *   1. Protect [^N] citations → sentinel (MUST be first, before remark-gfm sees text)
 *   2. Close open code fences
 *   3. Drop dangling single backtick (inline code)
 *   4. Trim unmatched emphasis (* _ ** __ ~~)
 *   5. Defang half-typed link [text](
 *   6. Strip lone $ / $$
 */
export function sanitizeStreamingMarkdown(
  raw: string,
  opts: { active: boolean },
): string {
  if (!opts.active) return raw;

  // Step 1: Protect citation markers [^N] → sentinel
  let s = raw.replace(CITATION_RE, `${CITATION_SENTINEL_OPEN}$1${CITATION_SENTINEL_CLOSE}`);

  // Step 2: Close open code fences
  s = closeOpenFences(s);

  // Step 3: Drop dangling single backtick outside fences
  s = dropDanglingBacktick(s);

  // Step 4: Trim unmatched emphasis delimiters at the tail
  s = trimUnmatchedEmphasis(s);

  // Step 5: Defang half-open link [text](
  s = defangHalfLink(s);

  // Step 6: Strip lone $ or $$ at end
  s = stripLoneMath(s);

  return s;
}

// ─── Step 3: Dangling inline-code backtick ───────────────────────────────────

function dropDanglingBacktick(s: string): string {
  // Count backticks not inside fences on the last incomplete line
  // Simple heuristic: if the string ends with a single ` not part of a pair,
  // remove it. We look at the string outside of fenced blocks.
  // Find the last line boundary and count unescaped ` on it.

  // Check if string ends with odd number of backticks (single, dangling)
  // We only trim a trailing single ` — not ``` (that's a fence handled by step 2).
  const trailingBacktick = /(?<!`)`(?!`)$/.exec(s);
  if (!trailingBacktick) return s;

  // Count backtick pairs in the string: if total count of ` is odd, we have a dangling one
  // Count all single backticks (not part of ```)
  const singleBacktickRe = /(?<!`)`(?!`)/g;
  const matches = [...s.matchAll(singleBacktickRe)];
  if (matches.length % 2 === 1) {
    // Odd count — drop the trailing one
    return s.slice(0, trailingBacktick.index);
  }
  return s;
}

// ─── Step 4: Trim unmatched emphasis at tail ─────────────────────────────────

function trimUnmatchedEmphasis(s: string): string {
  // Handle emphasis delimiters that are open at the end of the string.
  // We trim (not close) them to avoid a one-frame flash of empty <strong> etc.
  // Order matters: check longer sequences first (** before *).
  s = trimTrailingDelimiter(s, "~~");
  s = trimTrailingDelimiter(s, "**");
  s = trimTrailingDelimiter(s, "__");
  s = trimTrailingDelimiter(s, "*");
  s = trimTrailingDelimiter(s, "_");
  return s;
}

function trimTrailingDelimiter(s: string, delim: string): string {
  // Count how many times this delimiter appears in text (not inside code blocks)
  // If odd, the trailing one is unmatched — remove it.
  const escaped = delim.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Build regex that matches the delimiter not preceded/followed by itself (for single chars)
  // For multi-char delimiters, we match exactly.
  let re: RegExp;
  if (delim === "*") {
    // Single * but not **
    re = /(?<!\*)\*(?!\*)/g;
  } else if (delim === "_") {
    // Single _ but not __
    re = /(?<!_)_(?!_)/g;
  } else {
    re = new RegExp(escaped, "g");
  }

  const matches = [...s.matchAll(re)];
  if (matches.length % 2 === 0) return s; // balanced

  // Odd count — find and remove the trailing delimiter
  const trailingRe =
    delim === "*"
      ? /(?<!\*)\*(?!\*)(?=\s*$)/
      : delim === "_"
        ? /(?<!_)_(?!_)(?=\s*$)/
        : new RegExp(`${escaped}(?=\\s*$)`);

  return s.replace(trailingRe, "");
}

// ─── Step 5: Defang half-open link ───────────────────────────────────────────

function defangHalfLink(s: string): string {
  // If text ends with [label]( with no closing ), neutralize it by
  // replacing the trailing ( with escaped paren.
  // Also handle a bare unmatched [ at end.
  if (/\[[^\]]*\]\($/.test(s)) {
    return s.replace(/\($/, "\\(");
  }
  // Trailing unmatched [ (mid-label)
  if (/\[[^\]]*$/.test(s) && !s.endsWith("]")) {
    // Don't touch citation sentinels - they're already handled
    // Only defang if it looks like a link start, not a citation
    const lastBracket = s.lastIndexOf("[");
    if (lastBracket !== -1) {
      const after = s.slice(lastBracket);
      // If it's not a citation marker pattern, escape the [
      if (!/^\[\^/.test(after)) {
        return s.slice(0, lastBracket) + "\\[" + s.slice(lastBracket + 1);
      }
    }
  }
  return s;
}

// ─── Step 6: Strip lone $ or $$ ──────────────────────────────────────────────

function stripLoneMath(s: string): string {
  // Check $$ (block math) first - count occurrences
  const doubleMatches = [...s.matchAll(/\$\$/g)];
  if (doubleMatches.length % 2 === 1) {
    // Odd number of $$ - strip the last $$ opener
    const lastDouble = s.lastIndexOf("$$");
    return s.slice(0, lastDouble);
  }

  // Count single $ (not part of $$) by removing $$ pairs first
  const withoutDouble = s.replace(/\$\$/g, "");
  const singleMatches = [...withoutDouble.matchAll(/\$/g)];
  if (singleMatches.length % 2 === 1) {
    // Odd number of single $ - strip the last single $
    // Find last $ in original string that isn't part of $$
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i] === "$") {
        // Make sure it's not part of $$
        const isDoublePrev = i > 0 && s[i - 1] === "$";
        const isDoubleNext = i < s.length - 1 && s[i + 1] === "$";
        if (!isDoublePrev && !isDoubleNext) {
          return s.slice(0, i) + s.slice(i + 1);
        }
      }
    }
  }

  return s;
}
