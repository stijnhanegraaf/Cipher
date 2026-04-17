import { NextResponse } from "next/server";
import { buildGraph } from "@/lib/vault-graph";
import { getVaultPath } from "@/lib/vault-reader";

// ─── GET /api/vault/graph ──────────────────────────────────────────────
// Returns the full graph for the active vault: nodes, edges, folders.
// Cached per vault in vault-graph.ts; first call is ~slow (walks vault +
// resolves every link). Subsequent calls are instant.

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
    console.error("Graph API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build graph" },
      { status: 500 }
    );
  }
}
