/**
 * Hybrid retrieval over the per-vault embedding index.
 *
 * Pipeline:
 *   1. Keyword shortlist — top 40 chunks by fuzzyScore against chunk.text.
 *   2. Embed the query once.
 *   3. Cosine-sort the shortlist, take top 8.
 *   4. Token-budget truncate: cap total to ~3000 tokens, longest first.
 *
 * Returns the retained chunks in cosine-sorted order (best first).
 */

import "server-only";
import { fuzzyScore } from "@/lib/fuzzy";
import { cosine, ensureIndex, EMBED_MODEL, type IndexChunk, type IndexProgress } from "./embeddings";
import { embedWithOllamaLocal as embed } from "./providers";

export interface RetrievedChunk {
  id: string;
  path: string;
  heading?: string;
  text: string;
  score: number; // cosine similarity
}

const SHORTLIST_SIZE = 40;
const FINAL_TOP_N = 8;
const TOKEN_BUDGET = 3000;

export async function retrieve(query: string, onProgress?: IndexProgress): Promise<RetrievedChunk[]> {
  const index = await ensureIndex(onProgress);
  if (index.chunks.length === 0) return [];

  // 1. Keyword shortlist.
  const scored = index.chunks
    .map((c) => ({ c, s: fuzzyScore(query, c.text) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s)
    .slice(0, SHORTLIST_SIZE)
    .map((x) => x.c);

  // If fuzzy produced nothing (rare — short/unusual queries), fall back to
  // scoring the whole corpus with cosine. Cheap at vault scale.
  const pool: IndexChunk[] = scored.length > 0 ? scored : index.chunks;

  // 2. Embed the query.
  const qVec = await embed(EMBED_MODEL, query);

  // 3. Cosine rerank.
  const ranked = pool
    .map((c) => ({ c, sim: cosine(qVec, c.vec) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, FINAL_TOP_N);

  // 4. Token budget.
  const withinBudget = truncateToBudget(ranked.map((r) => ({ c: r.c, sim: r.sim })), TOKEN_BUDGET);

  return withinBudget.map(({ c, sim }) => ({
    id: c.id,
    path: c.path,
    heading: c.heading,
    text: c.text,
    score: sim,
  }));
}

// ─── Token budget ─────────────────────────────────────────────────────

interface Ranked { c: IndexChunk; sim: number }

/** Crude token estimator — 1 token ≈ 4 characters. Good enough for budget gating. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Trim chunk texts so the total token count fits the budget.
 *
 * Strategy: walk best-first, accepting chunks until the budget is
 * exhausted. A chunk that would overshoot is truncated at a word
 * boundary to whatever remaining tokens allow, then we stop.
 */
export function truncateToBudget(chunks: Ranked[], budget: number): Ranked[] {
  const out: Ranked[] = [];
  let used = 0;
  for (const r of chunks) {
    const cost = estimateTokens(r.c.text);
    if (used + cost <= budget) {
      out.push(r);
      used += cost;
      continue;
    }
    const remaining = budget - used;
    if (remaining <= 50) break; // not worth including a sliver
    const targetChars = remaining * 4;
    const words = r.c.text.split(/\s+/);
    let acc = "";
    for (const w of words) {
      if ((acc.length + w.length + 1) > targetChars) break;
      acc += (acc ? " " : "") + w;
    }
    out.push({ c: { ...r.c, text: acc }, sim: r.sim });
    break;
  }
  return out;
}
