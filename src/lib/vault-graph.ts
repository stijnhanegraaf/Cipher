/**
 * Builds the vault's node-edge graph: every .md file is a node, every
 * resolvable wiki-link is a directed edge. Cached per-vault.
 */
import "server-only";
import { stat } from "fs/promises";
import { join } from "path";
import { walkFiles } from "@/lib/fs/walk";
import {
  getVaultPath,
  readVaultFile,
  resolveLink,
  extractLinks,
} from "./vault-reader";
import { extractMentionSnippet } from "@/lib/markdown/backlinks";

// ─── Types ────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;         // vault-relative path (e.g. "wiki/knowledge/entities/foo.md")
  title: string;      // basename or frontmatter title
  folder: string;     // top-level folder segment, "" for root-level files
  backlinks: number;  // inbound edge count
  outlinks: number;   // outbound edge count
  mtime: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  folders: string[];  // deduped, sorted top-level folder names
}

// ─── Cache ────────────────────────────────────────────────────────────
// Built lazily per vault path. Invalidated when vault-reader.setVaultPath clears
// its caches — we check mtime of the vault root as a cheap heuristic.

const _graphCache = new Map<string, { graph: Graph; builtAt: number }>();

function cacheKey(root: string): string {
  return root;
}

// ─── Build ───────────────────────────────────────────────────────────

/**
 * Build the directed node-edge graph for the active vault.
 *
 * Every .md file becomes a node; every wiki-link that `resolveLink()`
 * can resolve becomes an edge (self-loops and duplicate edges dropped).
 * Cost is O(n × avg-links). Results are cached per-vault until
 * `invalidateGraphCache()` clears them. Returns an empty graph when no
 * vault is connected.
 */
export async function buildGraph(): Promise<Graph> {
  const root = getVaultPath();
  if (!root) return { nodes: [], edges: [], folders: [] };

  const key = cacheKey(root);
  const cached = _graphCache.get(key);
  if (cached) return cached.graph;

  // Phase 1: enumerate all .md files.
  const paths = await walkFiles(root, { extensions: [".md"] });

  // Phase 2: build the node set. Title from frontmatter, folder from first segment.
  const nodesById = new Map<string, GraphNode>();
  for (const path of paths) {
    const file = await readVaultFile(path);
    const name = path.split("/").pop()?.replace(/\.md$/i, "") || path;
    const title = (file?.frontmatter.title as string) || name;
    const folder = path.includes("/") ? path.split("/")[0] : "";
    let mtime = 0;
    try {
      const s = await stat(join(root, path));
      mtime = s.mtimeMs;
    } catch { /* ignore */ }
    nodesById.set(path, {
      id: path,
      title,
      folder,
      backlinks: 0,
      outlinks: 0,
      mtime,
    });
  }

  // Phase 3: compute edges by extracting links from each file and resolving them.
  const edges: GraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const [path, node] of nodesById) {
    const file = await readVaultFile(path);
    if (!file) continue;
    const links = extractLinks(file.content);
    for (const link of links) {
      const target = await resolveLink(link.path);
      if (!target) continue;
      if (target === path) continue; // self-loop
      const targetNode = nodesById.get(target);
      if (!targetNode) continue;
      const edgeKey = `${path}→${target}`;
      if (seenEdges.has(edgeKey)) continue;
      seenEdges.add(edgeKey);
      edges.push({ source: path, target });
      node.outlinks++;
      targetNode.backlinks++;
    }
  }

  const folders = Array.from(new Set(Array.from(nodesById.values()).map((n) => n.folder))).sort();

  const graph: Graph = {
    nodes: Array.from(nodesById.values()),
    edges,
    folders,
  };

  _graphCache.set(key, { graph, builtAt: Date.now() });
  return graph;
}

/**
 * Flush the cached graph. Call after vault changes — normally done
 * automatically on `setVaultPath()`, but invoke manually when mutating
 * vault content out-of-band.
 */
export function invalidateGraphCache(): void {
  _graphCache.clear();
}

// ─── Backlinks ────────────────────────────────────────────────────────────────

export interface Backlink {
  /** vault-relative .md path of the linking note */
  sourcePath: string;
  /** node.title (frontmatter title or basename) */
  sourceTitle: string;
  /** context snippet from the source note around the [[link]] */
  snippet: string;
}

/**
 * Backlinks (inbound linked-mentions) for a vault file, each with a
 * context snippet pulled from the source note around the [[link]].
 *
 * Uses the cached graph edges (buildGraph) to find sources, then reads
 * each source's content once and runs extractMentionSnippet against the
 * target's basename. Sorted by source mtime desc. Returns [] when the
 * path has no inbound edges or no vault is connected.
 */
export async function getBacklinks(targetPath: string): Promise<Backlink[]> {
  try {
    const root = getVaultPath();
    if (!root) return [];

    const graph = await buildGraph();

    // Find all edges pointing at targetPath
    const inbound = graph.edges.filter((e) => e.target === targetPath);
    if (inbound.length === 0) return [];

    // Build a lookup of node metadata (title, mtime) from the graph
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

    // Derive the target basename for snippet extraction (no extension)
    const targetBasename = targetPath.split("/").pop()?.replace(/\.md$/i, "") ?? targetPath;

    const results: Backlink[] = [];

    for (const edge of inbound) {
      const file = await readVaultFile(edge.source);
      if (!file) continue;

      const node = nodeMap.get(edge.source);
      const sourceTitle = node?.title ?? edge.source.split("/").pop()?.replace(/\.md$/i, "") ?? edge.source;
      const snippet = extractMentionSnippet(file.content, targetBasename);

      results.push({
        sourcePath: edge.source,
        sourceTitle,
        snippet,
      });
    }

    // Sort by source mtime descending (most recently modified first)
    results.sort((a, b) => {
      const mtimeA = nodeMap.get(a.sourcePath)?.mtime ?? 0;
      const mtimeB = nodeMap.get(b.sourcePath)?.mtime ?? 0;
      return mtimeB - mtimeA;
    });

    return results;
  } catch {
    return [];
  }
}
