/**
 * embed-guard.ts — Recursion-safety guards for transclusion / embeds.
 *
 * Pure, no-React, node-testable. Two independent defenses:
 *   1. Depth counter: refuse to recurse past MAX_EMBED_DEPTH.
 *   2. Ancestor-path cycle detection: refuse to embed a note that is
 *      already in the chain of ancestor embeds.
 */

/** Maximum nesting depth for transclusions. */
export const MAX_EMBED_DEPTH = 4;

export type GuardOk = { ok: true };
export type GuardFail = { ok: false; reason: "depth" | "cycle" };
export type GuardResult = GuardOk | GuardFail;

/**
 * Check whether an embed is safe to render.
 *
 * @param depth     Current nesting depth (0 = top-level note).
 * @param ancestors The resolved vault paths of every ancestor embed in the
 *                  current render chain (not including the current document).
 * @param target    The resolved vault path being considered for embedding.
 * @returns `{ ok: true }` when safe, or `{ ok: false, reason }` when blocked.
 */
export function checkGuard(
  depth: number,
  ancestors: readonly string[],
  target: string,
): GuardResult {
  if (depth >= MAX_EMBED_DEPTH) {
    return { ok: false, reason: "depth" };
  }
  if (ancestors.includes(target)) {
    return { ok: false, reason: "cycle" };
  }
  return { ok: true };
}
