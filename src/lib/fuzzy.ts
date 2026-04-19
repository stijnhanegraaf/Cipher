/**
 * Shared fuzzy scoring + ranking helpers for the ⌘K palette.
 *
 * fuzzyScore: classic subsequence match with adjacency reward — every
 * query char must appear in order in the target. Lower = better; Infinity
 * means no match. Matches the pre-existing CommandPalette signature so
 * the old consumer behaviour is preserved byte-for-byte.
 *
 * rankScore: spec-driven combined score — higher = better — using prefix,
 * word-boundary, fuzzy, and recency/frequency bonuses. Used by the new
 * typed-state flat list. Returns null when no match at all.
 */

export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += lastMatch === -1 ? ti : ti - lastMatch;
      lastMatch = ti;
      qi++;
    }
  }
  return qi === q.length ? score : Infinity;
}

export interface RankBonus {
  /** True if opened in the last 24h. */
  recent?: boolean;
  /** True if opened ≥ 3 times in the last 7 days. */
  frequent?: boolean;
}

/**
 * Higher-is-better score for the typed-state flat list.
 *
 * weights:
 *   +4 exact prefix (target starts with query)
 *   +2 word-boundary (query matches a word start)
 *   +1 fuzzy substring hits (each consecutive subsequence match)
 *   +3 recency-bonus  (opened in last 24h)
 *   +2 frequency-bonus (opened ≥ 3 times in last 7 days)
 *
 * Returns null when no subsequence match exists at all.
 */
export function rankScore(query: string, target: string, bonus: RankBonus = {}): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  // Subsequence match check (same as fuzzyScore).
  let qi = 0;
  let consecutiveHits = 0;
  let maxRun = 0;
  let run = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      consecutiveHits++;
      run++;
      maxRun = Math.max(maxRun, run);
      qi++;
    } else {
      run = 0;
    }
  }
  if (qi < q.length) return null;

  let score = consecutiveHits;  // +1 per match char

  if (t.startsWith(q)) score += 4;

  // Word-boundary: query appears at the start of any space/dash/slash-delimited word.
  const words = t.split(/[\s\-_/.]+/);
  if (words.some((w) => w.startsWith(q))) score += 2;

  if (bonus.recent) score += 3;
  if (bonus.frequent) score += 2;

  return score;
}
