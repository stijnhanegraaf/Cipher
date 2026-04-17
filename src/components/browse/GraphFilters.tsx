"use client";

import type { Graph } from "@/lib/vault-graph";

interface Props {
  graph: Graph;
  visibleFolders: Set<string>;
  onToggleFolder: (folder: string) => void;
  onAllFolders: () => void;
  orphansOnly: boolean;
  onToggleOrphans: () => void;
  searchTerm: string;
  onSearchChange: (term: string) => void;
}

export function GraphFilters({
  graph,
  visibleFolders,
  onToggleFolder,
  onAllFolders,
  orphansOnly,
  onToggleOrphans,
  searchTerm,
  onSearchChange,
}: Props) {
  const folderCounts = new Map<string, number>();
  for (const n of graph.nodes) {
    folderCounts.set(n.folder, (folderCounts.get(n.folder) ?? 0) + 1);
  }

  const folders = graph.folders.filter((f) => (folderCounts.get(f) ?? 0) > 0);

  const totalVisible = graph.nodes.filter((n) => {
    if (visibleFolders.size > 0 && !visibleFolders.has(n.folder)) return false;
    if (orphansOnly && n.backlinks + n.outlinks > 0) return false;
    if (searchTerm && !n.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  }).length;

  return (
    <aside
      style={{
        width: 220,
        flexShrink: 0,
        background: "var(--bg-panel)",
        borderRight: "1px solid var(--border-subtle)",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Search */}
      <div style={{ padding: 16, borderBottom: "1px solid var(--border-subtle)" }}>
        <input
          type="text"
          placeholder="Search nodes…"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="focus-ring"
          style={{
            width: "100%",
            height: 32,
            padding: "0 10px",
            background: "var(--bg-surface-alpha-2)",
            border: "1px solid var(--border-standard)",
            borderRadius: 6,
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Folders */}
        <div>
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 10 }}
          >
            <span
              className="mono-label"
              style={{ color: "var(--text-tertiary)", letterSpacing: "0.04em" }}
            >
              Folders
            </span>
            <button
              type="button"
              onClick={onAllFolders}
              className="mono-label focus-ring"
              style={{
                color: "var(--text-quaternary)",
                letterSpacing: "0.04em",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: 4,
              }}
            >
              {visibleFolders.size === 0 ? "none" : "all"}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {folders.map((f) => {
              const count = folderCounts.get(f) ?? 0;
              const active = visibleFolders.size === 0 || visibleFolders.has(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onToggleFolder(f)}
                  className="app-row focus-ring flex items-center gap-2.5 rounded-[6px]"
                  style={{
                    height: 28,
                    padding: "0 8px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background var(--motion-hover) var(--ease-default)",
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      border: "1.5px solid var(--border-standard)",
                      background: active ? "var(--accent-brand)" : "transparent",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {active && (
                      <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span
                    className="small"
                    style={{
                      color: "var(--text-secondary)",
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f || "(root)"}
                  </span>
                  <span
                    className="mono-label"
                    style={{
                      color: "var(--text-quaternary)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters */}
        <div>
          <div
            className="mono-label"
            style={{ color: "var(--text-tertiary)", letterSpacing: "0.04em", marginBottom: 10 }}
          >
            Filters
          </div>
          <label
            className="flex items-center gap-2.5 cursor-pointer"
            style={{ padding: "6px 8px", borderRadius: 6 }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                border: "1.5px solid var(--border-standard)",
                background: orphansOnly ? "var(--accent-brand)" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {orphansOnly && (
                <svg width={8} height={8} viewBox="0 0 24 24" fill="none" stroke="var(--text-on-brand)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </span>
            <input
              type="checkbox"
              checked={orphansOnly}
              onChange={onToggleOrphans}
              style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
            />
            <span className="small" style={{ color: "var(--text-secondary)" }}>
              Orphans only
            </span>
          </label>
        </div>

        {/* Stats */}
        <div
          style={{
            paddingTop: 16,
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <StatRow label="Nodes visible" value={totalVisible} total={graph.nodes.length} />
          <StatRow label="Edges" value={graph.edges.length} />
        </div>
      </div>
    </aside>
  );
}

function StatRow({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="mono-label" style={{ color: "var(--text-quaternary)", letterSpacing: "0.04em" }}>
        {label}
      </span>
      <span
        className="mono-label"
        style={{
          color: "var(--text-tertiary)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.04em",
        }}
      >
        {value}
        {total != null && <span style={{ opacity: 0.5 }}> / {total}</span>}
      </span>
    </div>
  );
}
