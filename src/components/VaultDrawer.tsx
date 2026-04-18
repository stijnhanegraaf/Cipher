"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { transition } from "@/lib/motion";

interface VaultSection {
  key: string;
  label: string;
  icon: React.ReactNode;
  items: VaultItem[];
}

interface VaultItem {
  name: string;
  path: string;
  type?: string;
  status?: string;
}

interface VaultDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (query: string) => void;
  onOpenFile: (path: string) => void;
  /** When set, drawer renders rooted at this folder. Wired in Task A6. */
  scopedPath?: string;
  /** Called when the user clicks the breadcrumb "← All folders" link in scoped mode. */
  onClearScope?: () => void;
  /** When set, folders show a hover-revealed pin icon that calls this. */
  onPinFolder?: (path: string, label: string) => void;
}

const sectionIcons: Record<string, React.ReactNode> = {
  work: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  system: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  entities: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  projects: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  research: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  knowledge: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  journal: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  memory: (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  ),
};

export function VaultDrawer({ open, onClose, onNavigate, onOpenFile, scopedPath, onClearScope, onPinFolder }: VaultDrawerProps) {
  const isInScope = (itemPath: string): boolean => {
    if (!scopedPath) return true;
    return itemPath === scopedPath || itemPath.startsWith(scopedPath + "/");
  };
  const [sections, setSections] = useState<VaultSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Primary: probed structure endpoint.
        const res = await fetch("/api/vault/structure");
        if (!res.ok) throw new Error(`structure ${res.status}`);
        const data = await res.json();
        if (!cancelled) setSections(data.sections || []);
      } catch {
        // Fallback: flat query result, grouped into a single "Files" section so
        // the drawer still shows something useful instead of an empty spinner.
        try {
          const res = await fetch("/api/query");
          if (!res.ok) throw new Error(`query ${res.status}`);
          const data = await res.json();
          const s: VaultSection[] = [];
          if (data.entities?.length) s.push({ key: "entities", label: "Entities", icon: sectionIcons.entities, items: data.entities });
          if (data.projects?.length) s.push({ key: "projects", label: "Projects", icon: sectionIcons.projects, items: data.projects });
          if (data.research?.length) s.push({ key: "research", label: "Research", icon: sectionIcons.research, items: data.research.map((r: any) => ({ name: r.name, path: r.dir })) });
          if (!cancelled) setSections(s);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load vault");
        }
      } finally {
        // Always clear loading — double failure included.
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const queryFor = (section: string, item: VaultItem) => {
    switch (section) {
      case "entities": return `show me ${item.name}`;
      case "projects": return `show project ${item.name}`;
      case "research": return `show research on ${item.name}`;
      case "work":     return `show ${item.name}`;
      case "system":   return `show system ${item.name}`;
      case "knowledge":return `tell me about ${item.name}`;
      case "journal":  return `show journal ${item.name}`;
      case "memory":   return `show ${item.name}`;
      default:         return `show me ${item.name}`;
    }
  };

  // Single dispatch rule: if the item carries a file path, open it.
  // Otherwise run a natural-language query derived from its name.
  const dispatchItem = (section: string, item: VaultItem) => {
    if (item.path && /\.md$/i.test(item.path)) {
      onOpenFile(item.path);
    } else {
      onNavigate(queryFor(section, item));
    }
    onClose();
  };

  const toggleSection = (key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={onClose}
            className="fixed inset-0 z-40"
            style={{
              backgroundColor: "color-mix(in srgb, var(--bg-marketing) 60%, transparent)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[41] flex flex-col overflow-hidden"
            style={{
              width: 340,
              backgroundColor: "var(--bg-panel)",
              borderLeft: "1px solid var(--border-standard)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-standard)" }}
            >
              <span className="small-medium text-text-primary">Vault</span>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-text-quaternary hover:text-text-primary cursor-pointer flex items-center justify-center transition-colors duration-150"
                style={{
                  background: "transparent",
                  border: "none",
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div
              className="flex-1 overflow-y-auto"
              style={{ scrollbarWidth: "thin" }}
            >
              {scopedPath && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 16px",
                    borderBottom: "1px solid var(--border-subtle)",
                    background: "var(--bg-surface-alpha-2)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onClearScope?.()}
                    className="focus-ring mono-label"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-brand)",
                      cursor: "pointer",
                      padding: 0,
                      letterSpacing: "0.04em",
                    }}
                  >
                    ← All folders
                  </button>
                  <span className="mono-label" style={{ color: "var(--text-quaternary)" }}>·</span>
                  <span className="caption" style={{ color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {scopedPath}
                  </span>
                </div>
              )}
              {loading && (
                <div className="p-8 text-center caption text-text-quaternary">
                  Loading vault…
                </div>
              )}

              {!loading && error && (
                <div className="p-8 text-center caption" style={{ color: "var(--status-blocked)" }}>
                  Could not load vault — {error}
                </div>
              )}

              {!loading && !error && sections.length === 0 && (
                <div className="p-8 text-center caption text-text-quaternary">
                  No vault content found
                </div>
              )}

              {(() => {
                const visibleSections = sections
                  .map((section) => ({ ...section, items: section.items.filter((item) => isInScope(item.path)) }))
                  .filter((section) => section.items.length > 0);
                return visibleSections.map((section, si) => {
                  const isCollapsed = collapsed[section.key];
                  return (
                    <div key={section.key}>
                      <button
                        onClick={() => toggleSection(section.key)}
                        className="flex items-center gap-2 w-full pt-4 px-4 pb-2 micro uppercase text-text-quaternary cursor-pointer transition-colors duration-150"
                        style={{
                          background: "transparent",
                          border: "none",
                          letterSpacing: 0.5,
                        }}
                      >
                        {sectionIcons[section.key] || sectionIcons.entities}
                        {section.label}
                        <span className="tiny" style={{ opacity: 0.5 }}>{section.items.length}</span>
                        <svg
                          width={10}
                          height={10}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="ml-auto transition-transform duration-150"
                          style={{
                            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>

                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{ overflow: "hidden" }}
                          >
                            {section.items.map((item) => {
                              const isFolderItem = !item.path.toLowerCase().endsWith(".md");
                              return (
                                <div
                                  key={item.path + item.name}
                                  className="app-row flex items-center justify-between w-full py-2 pr-4 pl-8 caption text-text-primary text-left transition-colors duration-150 hover:bg-[var(--bg-surface-alpha-4)]"
                                  style={{ borderRadius: 4 }}
                                >
                                  <button
                                    onClick={() => dispatchItem(section.key, item)}
                                    className="flex items-center flex-1 min-w-0 cursor-pointer text-left"
                                    style={{
                                      background: "transparent",
                                      border: "none",
                                      color: "inherit",
                                      font: "inherit",
                                      padding: 0,
                                    }}
                                  >
                                    <span className="truncate">{item.name}</span>
                                    {item.type && (
                                      <span className="tiny text-text-quaternary ml-2 shrink-0">
                                        {item.type}
                                      </span>
                                    )}
                                  </button>
                                  {isFolderItem && onPinFolder && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onPinFolder(item.path, item.name);
                                      }}
                                      aria-label={`Pin ${item.name}`}
                                      title="Pin to sidebar"
                                      className="focus-ring recent-remove"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        width: 20,
                                        height: 20,
                                        borderRadius: "var(--radius-small)",
                                        background: "transparent",
                                        border: "none",
                                        color: "var(--text-quaternary)",
                                        cursor: "pointer",
                                        flexShrink: 0,
                                        marginLeft: 8,
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.background = "var(--hover-control)";
                                        e.currentTarget.style.color = "var(--text-primary)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = "var(--text-quaternary)";
                                      }}
                                    >
                                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {si < visibleSections.length - 1 && (
                        <div
                          className="mx-4 my-2"
                          style={{ height: 1, backgroundColor: "var(--border-subtle)" }}
                        />
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
