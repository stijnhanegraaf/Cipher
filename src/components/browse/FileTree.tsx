"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tree, type NodeApi, type NodeRendererProps, type TreeApi } from "react-arborist";
import { fetchChildren, type TreeChild } from "@/lib/browse/vault-tree-client";
import { fileKindForExt } from "@/lib/browse/file-kind";
import { FileKindIcon } from "./FileKindIcon";

interface NodeData {
  id: string;
  name: string;
  path: string;
  type: "folder" | "file";
  ext: string;
  children?: NodeData[];
}

function toNode(c: TreeChild): NodeData {
  return {
    id: c.path || "(root)",
    name: c.name,
    path: c.path,
    type: c.type,
    ext: c.ext,
    children: c.type === "folder" ? undefined : undefined,
  };
}

interface Props {
  initialPath: string;
  selectedFilePath: string | null;
  expandState: Record<string, boolean>;
  onExpandChange: (next: Record<string, boolean>) => void;
  onSelectFile: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onOpenFull: (path: string) => void;
  width: number;
  height: number;
}

export function FileTree({
  initialPath,
  selectedFilePath,
  expandState,
  onExpandChange,
  onSelectFile,
  onSelectFolder,
  onOpenFull,
  width,
  height,
}: Props) {
  const [roots, setRoots] = useState<NodeData[]>([]);
  const [filter, setFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const treeRef = useRef<TreeApi<NodeData> | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChildren(initialPath)
      .then((kids) => { if (alive) setRoots(kids.map(toNode)); })
      .catch(() => { if (alive) setRoots([]); });
    return () => { alive = false; };
  }, [initialPath]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFilter(filter), 80);
    return () => clearTimeout(t);
  }, [filter]);

  const loadChildrenFor = useCallback(async (node: NodeData): Promise<NodeData[]> => {
    const kids = await fetchChildren(node.path);
    return kids.map(toNode);
  }, []);

  const onToggle = useCallback(async (id: string) => {
    const node = findNode(roots, id);
    if (!node) return;
    if (node.type === "folder" && node.children === undefined) {
      const kids = await loadChildrenFor(node);
      setRoots((prev) => replaceNode(prev, id, (n) => ({ ...n, children: kids })));
    }
    onExpandChange({ ...expandState, [id]: !expandState[id] });
  }, [roots, expandState, onExpandChange, loadChildrenFor]);

  const filtered = useMemo(() => {
    const needle = debouncedFilter.trim().toLowerCase();
    if (!needle) return roots;
    return filterTree(roots, needle);
  }, [roots, debouncedFilter]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      const focused = treeRef.current?.focusedNode?.data;
      if (focused?.type === "file") {
        e.preventDefault();
        onOpenFull(focused.path);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }} onKeyDown={handleKeyDown}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--border-subtle)" }}>
        <input
          type="text"
          placeholder="Filter…  (/)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setFilter(""); }}
          style={{
            width: "100%", height: 28, padding: "0 8px", fontSize: 12,
            borderRadius: 6, border: "1px solid var(--border-standard)",
            background: "var(--bg-surface)", color: "var(--text-primary)", outline: "none",
          }}
        />
      </div>
      <Tree<NodeData>
        ref={treeRef as React.RefObject<TreeApi<NodeData>>}
        data={filtered}
        openByDefault={false}
        width={width}
        height={Math.max(0, height - 44)}
        rowHeight={24}
        indent={16}
        selection={selectedFilePath ?? undefined}
        onToggle={onToggle}
        onSelect={(nodes: NodeApi<NodeData>[]) => {
          const n = nodes[0]; if (!n) return;
          if (n.data.type === "file") onSelectFile(n.data.path);
          else onSelectFolder(n.data.path);
        }}
      >
        {Row}
      </Tree>
    </div>
  );
}

function Row({ node, style, dragHandle }: NodeRendererProps<NodeData>) {
  const isFolder = node.data.type === "folder";
  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        display: "flex", alignItems: "center", gap: 4,
        padding: "0 6px",
        cursor: "pointer",
        color: node.isSelected ? "var(--text-primary)" : "var(--text-secondary)",
        background: node.isSelected ? "var(--bg-surface-alpha-4)" : "transparent",
        fontSize: 13,
        borderRadius: 4,
      }}
      onClick={() => { if (isFolder) node.toggle(); else node.select(); }}
    >
      <span style={{ width: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--text-quaternary)" }}>
        {isFolder ? (
          <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: node.isOpen ? "rotate(90deg)" : "none", transition: "transform var(--motion-hover) var(--ease-default)" }}>
            <polyline points="9 6 15 12 9 18" />
          </svg>
        ) : null}
      </span>
      <span style={{ width: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", color: isFolder ? "var(--text-tertiary)" : "var(--text-quaternary)", flexShrink: 0 }}>
        <FileKindIcon kind={isFolder ? "folder" : fileKindForExt(node.data.ext)} size={14} />
      </span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{node.data.name}</span>
    </div>
  );
}

function findNode(nodes: NodeData[], id: string): NodeData | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const r = findNode(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

function replaceNode(nodes: NodeData[], id: string, patch: (n: NodeData) => NodeData): NodeData[] {
  return nodes.map((n) => {
    if (n.id === id) return patch(n);
    if (n.children) return { ...n, children: replaceNode(n.children, id, patch) };
    return n;
  });
}

function filterTree(nodes: NodeData[], needle: string): NodeData[] {
  const out: NodeData[] = [];
  for (const n of nodes) {
    const selfMatch = n.name.toLowerCase().includes(needle);
    const kids = n.children ? filterTree(n.children, needle) : [];
    if (selfMatch || kids.length > 0) {
      out.push({ ...n, children: n.children ? kids : undefined });
    }
  }
  return out;
}
