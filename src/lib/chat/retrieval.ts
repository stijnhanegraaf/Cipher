/**
 * Hybrid retrieval over the per-vault embedding index.
 *
 * Pipeline:
 *   1. Load the existing on-disk index (never triggers a rebuild).
 *   2. If the index is missing/empty and an embedder is reachable, return
 *      { chunks: [], needsIndexing: true } so the caller can prompt the user
 *      to run an explicit index build instead of auto-triggering one.
 *   3. Keyword shortlist — top 40 chunks by fuzzyScore against chunk.text.
 *   4. Embed the query once.
 *   5. Cosine-sort the shortlist, take top 8.
 *   6. Token-budget truncate: cap total to ~3000 tokens, longest first.
 *
 * Returns the retained chunks in cosine-sorted order (best first).
 */

import "server-only";
import { fuzzyScore } from "@/lib/fuzzy";
import { cosine, loadExistingIndex, type IndexChunk } from "./embeddings";
import { resolveEmbedder } from "./providers";
import { readLLMSettings } from "@/lib/llm-settings";
import { log } from "@/lib/log";
import { extractTags } from "@/lib/markdown/tags";
import type { Graph } from "@/lib/vault-graph";

export interface RetrievedChunk {
  id: string;
  path: string;
  heading?: string;
  text: string;
  score: number; // cosine similarity (+ tag boost)
  /** Basename or frontmatter title, carried from index. */
  title?: string;
  /** Normalized tags carried from index — used for context labels + citation. */
  tags?: string[];
}

export interface RetrieveResult {
  chunks: RetrievedChunk[];
  /**
   * True when an embedder is reachable but the vault index is missing or empty.
   * The caller should prompt the user to run "Index vault" instead of proceeding
   * with an empty context.
   */
  needsIndexing: boolean;
}

const SHORTLIST_SIZE = 40;
const FINAL_TOP_N = 8;
const TOKEN_BUDGET = 3000;
const GRAPH_EXPAND_MAX = 4;
const TAG_BOOST_PER_OVERLAP = 0.05;

// ─── Graph expansion ──────────────────────────────────────────────────────────

/**
 * Pure function: given the vault-relative paths of the cosine top-K chunks,
 * return additional IndexChunks from notes that are wiki-linked to or from
 * those top notes (one hop only). Excludes paths already in `topPaths`.
 * Caps output at `max` chunks.
 *
 * `pool` is the full candidate chunk list (keyword shortlist or whole index).
 */
export function expandViaGraph(
  topPaths: string[],
  pool: IndexChunk[],
  graph: Graph,
  max: number,
): IndexChunk[] {
  const topPathSet = new Set(topPaths);

  // Collect linked and backlinked note paths (one-hop).
  const linkedPaths = new Set<string>();
  for (const edge of graph.edges) {
    if (topPathSet.has(edge.source)) linkedPaths.add(edge.target);
    if (topPathSet.has(edge.target)) linkedPaths.add(edge.source);
  }
  // Remove paths already in the top-K so we only add NEW context.
  for (const p of topPathSet) linkedPaths.delete(p);

  // Pick the best chunk per linked path, capped at `max`.
  const seenPaths = new Set<string>();
  const expanded: IndexChunk[] = [];
  for (const chunk of pool) {
    if (!linkedPaths.has(chunk.path)) continue;
    if (seenPaths.has(chunk.path)) continue; // one chunk per linked note
    seenPaths.add(chunk.path);
    expanded.push(chunk);
    if (expanded.length >= max) break;
  }
  return expanded;
}

// ─── Tag boost ────────────────────────────────────────────────────────────────

/**
 * Pure function: compute a small score boost based on tag overlap between
 * the query's inline tags and a chunk's note tags.
 *
 * Returns a non-negative number added to the chunk's cosine similarity so
 * that a tag-matching chunk ranks above an equal-cosine non-matching one.
 */
export function computeTagBoost(queryTags: string[], chunkTags: string[]): number {
  if (queryTags.length === 0 || chunkTags.length === 0) return 0;
  const chunkTagSet = new Set(chunkTags);
  let overlap = 0;
  for (const t of queryTags) {
    if (chunkTagSet.has(t)) overlap++;
  }
  return overlap * TAG_BOOST_PER_OVERLAP;
}

export async function retrieve(query: string): Promise<RetrieveResult> {
  const settings = await readLLMSettings();
  const embedder = await resolveEmbedder(settings);

  // Degraded path: no embedder reachable. Rank by keyword alone against
  // whatever chunks the existing (possibly stale) index has, else bail.
  if (!embedder) {
    log.info("chat/retrieval", "no embedder available; using keyword-only ranking");
    return { chunks: await keywordOnly(query), needsIndexing: false };
  }


  const index = await loadExistingIndex();

  // Index is missing or empty — signal the caller to prompt for indexing.
  if (!index || index.chunks.length === 0) {
    log.info("chat/retrieval", "no index found; returning needs-indexing signal");
    return { chunks: [], needsIndexing: true };
  }

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

  // 2. Embed the query. On failure, degrade to keyword-only for this request.
  let qVec: number[];
  try {
    qVec = await embedder.embed(query);
  } catch (err) {
    log.warn("chat/retrieval", `query embed failed via ${embedder.id}; falling back to keyword-only`, err);
    const top = scored.slice(0, FINAL_TOP_N).map((c) => ({ c, sim: 0 }));
    return {
      chunks: truncateToBudget(top, TOKEN_BUDGET).map(({ c, sim }) => ({
        id: c.id, path: c.path, heading: c.heading, text: c.text, score: sim,
        title: c.title, tags: c.tags,
      })),
      needsIndexing: false,
    };
  }

  // 3. Cosine rerank with tag boost.
  const queryTags = extractTags(query, {});
  const baseRanked = pool
    .map((c) => ({ c, sim: cosine(qVec, c.vec) + computeTagBoost(queryTags, c.tags ?? []) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, FINAL_TOP_N);

  // 3b. Graph expansion: pull in chunks from notes linked to/from top hits.
  const topPaths = baseRanked.map((r) => r.c.path);
  const allRanked = [...baseRanked];
  try {
    const { buildGraph } = await import("@/lib/vault-graph");
    const graph = await buildGraph();
    const expanded = expandViaGraph(topPaths, pool, graph, GRAPH_EXPAND_MAX);
    const seenPaths = new Set(topPaths);
    for (const ec of expanded) {
      if (!seenPaths.has(ec.path)) {
        seenPaths.add(ec.path);
        allRanked.push({ c: ec, sim: 0 });
      }
    }
  } catch {
    // Graph unavailable (no vault, test environment, etc.) — skip expansion.
  }

  // 4. Token budget.
  const withinBudget = truncateToBudget(allRanked, TOKEN_BUDGET);

  return {
    chunks: withinBudget.map(({ c, sim }) => ({
      id: c.id,
      path: c.path,
      heading: c.heading,
      text: c.text,
      score: sim,
      title: c.title,
      tags: c.tags,
    })),
    needsIndexing: false,
  };
}

async function keywordOnly(query: string): Promise<RetrievedChunk[]> {
  // Without an embedder we can't build or refresh an index; read whatever is
  // already on disk and rank by fuzzy score. If nothing exists, return empty.
  const index = await loadExistingIndex();
  if (!index || index.chunks.length === 0) return [];
  const scored = index.chunks
    .map((c) => ({ c, s: fuzzyScore(query, c.text) }))
    .filter((x) => x.s !== Infinity)
    .sort((a, b) => a.s - b.s)
    .slice(0, FINAL_TOP_N)
    .map(({ c }) => ({ c, sim: 0 }));
  return truncateToBudget(scored, TOKEN_BUDGET).map(({ c, sim }) => ({
    id: c.id, path: c.path, heading: c.heading, text: c.text, score: sim,
    title: c.title, tags: c.tags,
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
