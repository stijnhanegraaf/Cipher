/**
 * GET /api/search?q=<query>&mode=exact|semantic
 *
 * Unified search endpoint with optional semantic re-ranking.
 *
 * mode=exact (default):
 *   Runs buildSearchResults — identical to the /api/query exact path.
 *   Never touches embeddings; always returns results.
 *
 * mode=semantic:
 *   1. Resolves the embedder (settings-aware).
 *   2. No embedder → transparent degrade: runs buildSearchResults, tags source="keyword-only".
 *   3. Embedder present → calls retrieve() (keyword shortlist → cosine rerank).
 *      Zero chunks returned → transparent degrade: same as above.
 *      Results → chunksToSearchResults → SearchResultsData.
 *
 * Response: { data: SearchResultsData, source: EmbedderId | "keyword-only" }
 * Errors:   400 when q is blank.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/chat/retrieval";
import { resolveEmbedder, type EmbedderId } from "@/lib/chat/providers/embeddings";
import { readLLMSettings } from "@/lib/llm-settings";
import { buildSearchResults } from "@/lib/builders/search";
import { chunksToSearchResults } from "@/lib/builders/semantic-search";

type SearchSource = EmbedderId | "keyword-only";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const mode = searchParams.get("mode") ?? "exact";

  if (!q) {
    return NextResponse.json(
      { error: "Query parameter `q` is required" },
      { status: 400 },
    );
  }

  // ── Exact mode (default) ───────────────────────────────────────────
  if (mode !== "semantic") {
    const vm = await buildSearchResults(q);
    return NextResponse.json({ data: vm.data, source: "keyword-only" as SearchSource });
  }

  // ── Semantic mode ──────────────────────────────────────────────────
  const settings = await readLLMSettings();
  const embedder = await resolveEmbedder(settings);

  // No embedder reachable: transparent degrade to exact keyword search.
  if (!embedder) {
    const vm = await buildSearchResults(q);
    return NextResponse.json({ data: vm.data, source: "keyword-only" as SearchSource });
  }

  const source: SearchSource = embedder.id;
  const chunks = await retrieve(q);

  // Zero chunks (empty index, no matches): transparent degrade to exact.
  if (chunks.length === 0) {
    const vm = await buildSearchResults(q);
    return NextResponse.json({ data: vm.data, source: "keyword-only" as SearchSource });
  }

  const data = chunksToSearchResults(q, chunks);
  return NextResponse.json({ data, source });
}
