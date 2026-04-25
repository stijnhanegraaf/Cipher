"use client";

/**
 * Miller-columns explorer over the vault graph.
 *
 * Renders one 240px column per trail level (trail[0] is always root).
 * Clicking a folder truncates the trail to its column index and pushes,
 * so stacking never runs away. Arrow keys move the focus row; left/right
 * pop/push the trail; `/` focuses a per-column filter; `⌘↵` opens the
 * full-route. Selected file drives a 360px FilePreviewPanel neighbour.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { Graph, GraphNode } from "@/lib/vault-graph";
import { buildTree, type TreeIndex } from "@/lib/vault-tree";
import { fuzzyScore } from "@/lib/fuzzy";
import { FilePreviewPanel, type LinkRow } from "@/components/browse/FilePreviewPanel";

interface Props {
  graph: Graph;
  onOpen: (path: string) => void;
}

type ColumnPath = string;

const COLUMN_WIDTH = 240;

/** Build relative-time labels for file mtime. */
function relTime(mtime: number): string {
  const now = Date.now();
  const diff = Math.max(0, now - mtime);
  const h = diff / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(diff / 6e4))}m`;
  if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 7) return `${Math.round(d)}d`;
  const w = d / 7;
  if (w < 5) return `${Math.round(w)}w`;
  return `${Math.round(d / 30)}mo`;
}

function folderDisplayName(path: ColumnPath): string {
  if (path === "") return "VAULT";
  const seg = path.split("/").pop() ?? path;
  return seg.toUpperCase();
}

export function StructureColumns({ graph, onOpen }: Props) {
  const router = useRouter();
  const tree: TreeIndex = useMemo(() => buildTree(graph), [graph]);
  const [trail, setTrail] = useState<ColumnPath[]>([""]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [filterByColumn, setFilterByColumn] = useState<Record<ColumnPath, string>>({});
  // Focused row per column — {kind, name} where name is folder name OR file id.
  const [focus, setFocus] = useState<{ col: number; row: number }>({ col: 0, row: 0 });
  const [filterFocusedCol, setFilterFocusedCol] = useState<number | null>(null);
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const stripRef = useRef<HTMLDivElement | null>(null);

  const node = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of graph.nodes) map.set(n.id, n);
    return map;
  }, [graph.nodes]);

  /** Rows for a given column, merged (folders first, then files), with filter applied as fade. */
  function rowsFor(
    folder: ColumnPath
  ): Array<{ kind: "folder"; name: string; path: string; count: number; dim: boolean }
       | { kind: "file"; node: GraphNode; dim: boolean }> {
    const subFolders = tree.foldersByParent.get(folder) ?? [];
    const files = tree.filesByFolder.get(folder) ?? [];
    const filter = (filterByColumn[folder] ?? "").trim();
    const matches = (label: string) => filter === "" ? true : fuzzyScore(filter, label) !== Infinity;
    const out: Array<
      | { kind: "folder"; name: string; path: string; count: number; dim: boolean }
      | { kind: "file"; node: GraphNode; dim: boolean }
    > = [];
    for (const name of subFolders) {
      const path = folder === "" ? name : `${folder}/${name}`;
      out.push({
        kind: "folder",
        name,
        path,
        count: tree.countsByFolder.get(path) ?? 0,
        dim: !matches(name),
      });
    }
    for (const f of files) {
      out.push({ kind: "file", node: f, dim: !matches(f.title) });
    }
    return out;
  }

  const columns = trail;
  const activeColIdx = columns.length - 1;

  // Clicking a folder at column N: truncate trail to N+1, push new folder.
  const pushFolder = useCallback((colIdx: number, folderPath: ColumnPath) => {
    setTrail((prev) => [...prev.slice(0, colIdx + 1), folderPath]);
    setSelectedFile(null);
    setFocus({ col: colIdx + 1, row: 0 });
    setFilterFocusedCol(null);
  }, []);

  const popTrail = useCallback(() => {
    setTrail((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
    setSelectedFile(null);
    setFocus((f) => ({ col: Math.max(0, f.col - 1), row: 0 }));
    setFilterFocusedCol(null);
  }, []);

  /** Parent-callable: from a backlink/outlink click, re-aim the trail at the target file. */
  const navigateToPath = useCallback(
    (path: string) => {
      const folder = (() => {
        const i = path.lastIndexOf("/");
        return i === -1 ? "" : path.slice(0, i);
      })();
      const parts = folder === "" ? [""] : ["", ...folder.split("/").reduce<string[]>((acc, p) => {
        acc.push(acc.length === 0 ? p : `${acc[acc.length - 1]}/${p}`);
        return acc;
      }, [])];
      setTrail(parts);
      setSelectedFile(path);
      setFocus({ col: parts.length - 1, row: 0 });
      setFilterFocusedCol(null);
    },
    []
  );

  // Scroll active column into view when trail grows.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollTo({ left: activeColIdx * COLUMN_WIDTH, behavior: "smooth" });
  }, [activeColIdx]);

  // Global keyboard handling. Scoped to the strip via tabIndex on the wrapper.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // When filter input has focus, let it handle typing; only intercept Esc.
    if (filterFocusedCol !== null) {
      if (e.key === "Escape") {
        e.preventDefault();
        setFilterByColumn((prev) => ({ ...prev, [columns[filterFocusedCol]]: "" }));
        setFilterFocusedCol(null);
      }
      return;
    }

    const rows = rowsFor(columns[activeColIdx]);
    const currentRow = Math.min(focus.row, Math.max(0, rows.length - 1));

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocus({ col: activeColIdx, row: Math.min(rows.length - 1, currentRow + 1) });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocus({ col: activeColIdx, row: Math.max(0, currentRow - 1) });
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const row = rows[currentRow];
      if (row && row.kind === "folder") pushFolder(activeColIdx, row.path);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      popTrail();
    } else if (e.key === "Enter") {
      const row = rows[currentRow];
      if (!row) return;
      if (row.kind === "file") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          router.push(`/file/${row.node.id}`);
        } else {
          onOpen(row.node.id);
        }
      } else {
        e.preventDefault();
        pushFolder(activeColIdx, row.path);
      }
    } else if (e.key === "/") {
      e.preventDefault();
      setFilterFocusedCol(activeColIdx);
      // next tick — input will mount
      requestAnimationFrame(() => filterInputRef.current?.focus());
    } else if (e.key === "Escape") {
      e.preventDefault();
      setTrail([""]);
      setSelectedFile(null);
      setFocus({ col: 0, row: 0 });
      setFilterByColumn({});
    }
  };

  const wrapperStyle: CSSProperties = {
    display: "flex",
    flex: 1,
    minHeight: 0,
    background: "var(--bg-marketing)",
    outline: "none",
  };
  const stripStyle: CSSProperties = {
    display: "flex",
    flex: 1,
    minHeight: 0,
    overflowX: "auto",
    overflowY: "hidden",
    scrollSnapType: "x mandatory",
  };

  return (
    <div style={wrapperStyle} tabIndex={0} onKeyDown={onKeyDown} aria-label="Structure columns">
      <div ref={stripRef} style={stripStyle}>
        {columns.map((folder, colIdx) => {
          const rows = rowsFor(folder);
          const isActive = colIdx === activeColIdx;
          const filterActive = filterFocusedCol === colIdx;
          const filterValue = filterByColumn[folder] ?? "";
          const activeChildFolder = colIdx < columns.length - 1 ? columns[colIdx + 1] : null;
          return (
            <div
              key={`${colIdx}:${folder}`}
              style={{
                flex: "0 0 240px",
                width: 240,
                height: "100%",
                borderRight: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                scrollSnapAlign: "start",
              }}
            >
              {/* Sticky header — folder label OR filter input. */}
              <div
                style={{
                  flexShrink: 0,
                  height: 24,
                  padding: "0 12px",
                  display: "flex",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border-subtle)",
                  background: "var(--bg-marketing)",
                }}
              >
                {filterActive ? (
                  <input
                    ref={filterInputRef}
                    type="text"
                    value={filterValue}
                    placeholder="filter…"
                    onChange={(e) =>
                      setFilterByColumn((prev) => ({ ...prev, [folder]: e.target.value }))
                    }
                    onBlur={() => setFilterFocusedCol(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setFilterByColumn((prev) => ({ ...prev, [folder]: "" }));
                        setFilterFocusedCol(null);
                      }
                    }}
                    className="mono-label"
                    style={{
                      width: "100%",
                      height: 20,
                      border: "none",
                      outline: "none",
                      background: "transparent",
                      color: "var(--text-primary)",
                      fontSize: 10,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  />
                ) : (
                  <span
                    className="mono-label"
                    style={{
                      color: "var(--text-quaternary)",
                      letterSpacing: "0.08em",
                      fontSize: 10,
                    }}
                  >
                    {folderDisplayName(folder)}
                  </span>
                )}
              </div>

              {/* Rows */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {rows.length === 0 && folder === "" && (
                  <div
                    className="caption-large"
                    style={{ padding: "12px", color: "var(--text-quaternary)" }}
                  >
                    No folders in vault.
                  </div>
                )}
                {rows.map((row, rowIdx) => {
                  const rowActive = isActive && rowIdx === Math.min(focus.row, rows.length - 1);
                  const isAncestorRow =
                    row.kind === "folder" && activeChildFolder !== null && row.path === activeChildFolder;
                  const rowSelectedFile =
                    row.kind === "file" && selectedFile === row.node.id;
                  const showRail = rowActive || rowSelectedFile || isAncestorRow;
                  // Dimmed rows de-emphasise via the token, not opacity — opacity can
                  // drop text below WCAG contrast on the lightest surfaces.
                  const baseColor: string = row.dim
                    ? "var(--text-quaternary)"
                    : rowActive || isAncestorRow || rowSelectedFile
                      ? "var(--text-primary)"
                      : "var(--text-secondary)";
                  const weight = rowActive || isAncestorRow || rowSelectedFile ? 500 : 400;
                  if (row.kind === "folder") {
                    return (
                      <div
                        key={`f:${row.path}`}
                        role="button"
                        tabIndex={-1}
                        aria-current={rowActive ? "true" : undefined}
                        data-rail={showRail || undefined}
                        data-dim={row.dim || undefined}
                        className="miller-row focus-ring"
                        onClick={() => pushFolder(colIdx, row.path)}
                      >
                        <FolderIcon />
                        <span
                          className="caption-large"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: baseColor,
                            fontWeight: weight,
                          }}
                        >
                          {row.name}
                        </span>
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            fontSize: 11,
                            color: "var(--text-quaternary)",
                          }}
                        >
                          {row.count}
                        </span>
                        <Chevron />
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`file:${row.node.id}`}
                      role="button"
                      tabIndex={-1}
                      aria-current={rowActive ? "true" : undefined}
                      data-rail={showRail || undefined}
                      data-dim={row.dim || undefined}
                      className="miller-row focus-ring"
                      onClick={() => {
                        // Files have no depth — collapse any deeper columns,
                        // matching macOS Finder behaviour.
                        setTrail((prev) => prev.slice(0, colIdx + 1));
                        setSelectedFile(row.node.id);
                        setFocus({ col: colIdx, row: rowIdx });
                      }}
                      onDoubleClick={() => onOpen(row.node.id)}
                    >
                      <FileIcon />
                      <span
                        className="caption-large"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: baseColor,
                          fontWeight: weight,
                        }}
                      >
                        {row.node.title}
                      </span>
                      <span
                        style={{
                          fontVariantNumeric: "tabular-nums",
                          fontSize: 11,
                          color: "var(--text-quaternary)",
                        }}
                      >
                        {relTime(row.node.mtime)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Preview panel pinned after columns. */}
        {(() => {
          const back: LinkRow[] = [];
          const out: LinkRow[] = [];
          if (selectedFile) {
            for (const e of graph.edges) {
              if (e.target === selectedFile) {
                const n = node.get(e.source);
                if (n) back.push({ path: n.id, title: n.title });
              } else if (e.source === selectedFile) {
                const n = node.get(e.target);
                if (n) out.push({ path: n.id, title: n.title });
              }
            }
          }
          return (
            <FilePreviewPanel
              path={selectedFile}
              node={selectedFile ? node.get(selectedFile) ?? null : null}
              backlinkRows={back}
              outlinkRows={out}
              onOpen={onOpen}
              onNavigate={navigateToPath}
            />
          );
        })()}
      </div>
    </div>
  );
}

function FolderIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      style={{ color: "var(--text-quaternary)", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M2 4h4l1 1h5v6H2z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      style={{ color: "var(--text-quaternary)", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M3 2h5l3 3v7H3z" />
      <path d="M8 2v3h3" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{ color: "var(--text-quaternary)", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M3 2l4 3-4 3" />
    </svg>
  );
}
