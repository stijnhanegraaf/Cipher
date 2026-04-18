/**
 * Builds the vault's node-edge graph: every .md file is a node, every
 * resolvable wiki-link is a directed edge. Cached per-vault.
 */
import "server-only";
import { readdir, stat } from "fs/promises";
import { extname, join } from "path";
import {
  getVaultPath,
  readVaultFile,
  resolveLink,
  extractLinks,
} from "./vault-reader";

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

// ─── Walk ────────────────────────────────────────────────────────────

async function walkMd(root: string, maxDepth = 6): Promise<string[]> {
  const out: string[] = [];
  async function walk(absDir: string, rel: string, depth: number) {
    if (depth > maxDepth) return;
    let entries: Array<{ name: string; isFile: boolean; isDir: boolean }>;
    try {
      const raw = await readdir(absDir, { withFileTypes: true });
      entries = raw
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({ name: e.name, isFile: e.isFile(), isDir: e.isDirectory() }));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDir) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".obsidian") continue;
        await walk(join(absDir, entry.name), rel ? `${rel}/${entry.name}` : entry.name, depth + 1);
      } else if (entry.isFile && extname(entry.name).toLowerCase() === ".md") {
        out.push(rel ? `${rel}/${entry.name}` : entry.name);
      }
    }
  }
  await walk(root, "", 0);
  return out;
}

// ─── Build ───────────────────────────────────────────────────────────

export async function buildGraph(): Promise<Graph> {
  const root = getVaultPath();
  if (!root) return { nodes: [], edges: [], folders: [] };

  const key = cacheKey(root);
  const cached = _graphCache.get(key);
  if (cached) return cached.graph;

  // Phase 1: enumerate all .md files.
  const paths = await walkMd(root);

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

/** Clear cached graph. Called from setVaultPath in vault-reader. */
export function invalidateGraphCache(): void {
  _graphCache.clear();
}
