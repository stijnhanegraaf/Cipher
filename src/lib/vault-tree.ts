/**
 * Derives a folder/file tree index from the vault Graph.
 *
 * Graph nodes carry only the top-level folder segment in `node.folder`,
 * so we re-derive the full hierarchy from `node.id` (vault-relative path).
 * One O(n) walk produces three maps keyed by full folder path:
 *   - foldersByParent: immediate sub-folder names (sorted a–z)
 *   - filesByFolder:   direct-child file nodes (sorted a–z by title)
 *   - countsByFolder:  RECURSIVE file count under that folder
 * Root is the empty string "".
 */

import type { Graph, GraphNode } from "./vault-graph";

export interface TreeIndex {
  /** folderPath → immediate child folder names (sorted a–z, case-insensitive). */
  foldersByParent: Map<string, string[]>;
  /** folderPath → file nodes directly inside that folder (sorted a–z by title, case-insensitive). */
  filesByFolder: Map<string, GraphNode[]>;
  /** folderPath → total file count under that folder (recursive). */
  countsByFolder: Map<string, number>;
}

/** Return the parent folder path of a vault file path. "work/projects/q3.md" → "work/projects". Root files → "". */
function parentFolder(id: string): string {
  const i = id.lastIndexOf("/");
  return i === -1 ? "" : id.slice(0, i);
}

/** Split "work/projects" into ["", "work", "work/projects"] so every ancestor is walked. */
function ancestorChain(folder: string): string[] {
  if (folder === "") return [""];
  const parts = folder.split("/");
  const out: string[] = [""];
  let acc = "";
  for (const p of parts) {
    acc = acc === "" ? p : `${acc}/${p}`;
    out.push(acc);
  }
  return out;
}

export function buildTree(graph: Graph): TreeIndex {
  const foldersByParentSet = new Map<string, Set<string>>();
  const filesByFolder = new Map<string, GraphNode[]>();
  const countsByFolder = new Map<string, number>();

  const ensureFolder = (path: string) => {
    if (!foldersByParentSet.has(path)) foldersByParentSet.set(path, new Set());
    if (!filesByFolder.has(path)) filesByFolder.set(path, []);
    if (!countsByFolder.has(path)) countsByFolder.set(path, 0);
  };

  ensureFolder("");

  for (const node of graph.nodes) {
    const folder = parentFolder(node.id);
    // Walk the full ancestor chain so every intermediate folder shows up,
    // and so recursive counts increment at each ancestor.
    const chain = ancestorChain(folder);
    for (let i = 0; i < chain.length; i++) {
      const p = chain[i];
      ensureFolder(p);
      countsByFolder.set(p, (countsByFolder.get(p) ?? 0) + 1);
      if (i > 0) {
        const parent = chain[i - 1];
        const name = chain[i].slice(parent === "" ? 0 : parent.length + 1);
        foldersByParentSet.get(parent)!.add(name);
      }
    }
    filesByFolder.get(folder)!.push(node);
  }

  // Sort sub-folder name lists + file lists.
  const foldersByParent = new Map<string, string[]>();
  for (const [parent, set] of foldersByParentSet) {
    const arr = Array.from(set).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    foldersByParent.set(parent, arr);
  }
  for (const [, files] of filesByFolder) {
    files.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
  }

  return { foldersByParent, filesByFolder, countsByFolder };
}
