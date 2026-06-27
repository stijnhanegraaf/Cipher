/**
 * force-graph-data — pure adapter: vault Graph → react-force-graph-2d data shape.
 *
 * Pure module (no DOM, no browser APIs). Suitable for unit tests.
 */

import type { Graph } from "@/lib/vault-graph";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Node data we pass to react-force-graph-2d. */
export interface FGNodeData {
  /** Unique id — the vault-relative path (e.g. "wiki/foo.md"). */
  id: string;
  /** Same as id; kept separate so canvas paint can grab it without confusion. */
  path: string;
  /** Display title (frontmatter or basename). */
  title: string;
  /** Primary tag (used for color). Empty string for untagged nodes. */
  tag: string;
  /** All tags for this node. */
  tags: readonly string[];
  /**
   * Degree = inbound backlinks + outbound edges.
   * Computed from the Graph structure: backlinks from GraphNode.backlinks,
   * outbound from a fresh count over graph.edges.
   */
  degree: number;
}

/** Link data we pass to react-force-graph-2d. */
export interface FGLinkData {
  source: string;
  target: string;
}

/** Full data object for react-force-graph-2d. */
export interface ForceGraphData {
  nodes: FGNodeData[];
  links: FGLinkData[];
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

/**
 * Convert a vault Graph to the react-force-graph-2d data shape.
 *
 * - Every node is preserved (including orphans with no edges).
 * - Node id = vault-relative path (stable across renders).
 * - degree = node.backlinks + outbound count computed from edges.
 */
export function toForceGraphData(graph: Graph): ForceGraphData {
  // Compute per-node outdegree from edges (don't rely on GraphNode.outlinks
  // being pre-populated; this makes the adapter self-contained and testable).
  const outdegreeMap = new Map<string, number>();
  for (const edge of graph.edges) {
    outdegreeMap.set(edge.source, (outdegreeMap.get(edge.source) ?? 0) + 1);
  }

  const nodes: FGNodeData[] = graph.nodes.map((n) => ({
    id: n.id,
    path: n.id,
    title: n.title,
    tag: n.tag,
    tags: n.tags,
    degree: n.backlinks + (outdegreeMap.get(n.id) ?? 0),
  }));

  const links: FGLinkData[] = graph.edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  return { nodes, links };
}
