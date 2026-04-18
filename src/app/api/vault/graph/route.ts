/**
 * GET /api/vault/graph — returns the vault's node-edge graph.
 */
import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/vault-graph";
import { getVaultPath } from "@/lib/vault-reader";
import { log } from "@/lib/log";

// ─── GET /api/vault/graph ──────────────────────────────────────────────
// Returns the full graph for the active vault: nodes, edges, folders.
// Cached per vault in vault-graph.ts; first call is ~slow (walks vault +
// resolves every link). Subsequent calls are instant.

/**
 * `GET /api/vault/graph` — node-edge graph for the active vault.
 *
 * Response: `{ nodes, edges, folders }`. First call walks the vault and
 * resolves every wiki-link (slow); subsequent calls hit the per-vault
 * cache until `invalidateGraphCache()` clears it. Status: 200 on
 * success, 409 when no vault is connected, 500 on unexpected failure.
 */
export async function GET() {
  try {
    if (!getVaultPath()) {
      return NextResponse.json(
        { error: "No vault connected", nodes: [], edges: [], folders: [] },
        { status: 409 }
      );
    }
    const graph = await buildGraph();
    return NextResponse.json(graph);
  } catch (error) {
    log.error("vault-graph", "API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build graph" },
      { status: 500 }
    );
  }
}
