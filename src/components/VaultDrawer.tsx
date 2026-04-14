"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springs } from "@/lib/motion";

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
}

const colors = {
  bg: "#08090a",
  level2: "#111215",
  level3: "#181a1f",
  borderStandard: "rgba(255,255,255,0.08)",
  borderSubtle: "rgba(255,255,255,0.05)",
  primaryText: "#f0f0f3",
  secondaryText: "#8b8d97",
  tertiaryText: "#5e6068",
  brandIndigo: "#5e6ad2",
};

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

export function VaultDrawer({ open, onClose, onNavigate, onOpenFile }: VaultDrawerProps) {
  const [sections, setSections] = useState<VaultSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetch("/api/vault/structure")
        .then((r) => r.json())
        .then((data) => {
          setSections(data.sections || []);
          setLoading(false);
        })
        .catch(() => {
          fetch("/api/query")
            .then((r) => r.json())
            .then((data) => {
              const s: VaultSection[] = [];
              if (data.entities?.length) s.push({ key: "entities", label: "Entities", icon: sectionIcons.entities, items: data.entities });
              if (data.projects?.length) s.push({ key: "projects", label: "Projects", icon: sectionIcons.projects, items: data.projects });
              if (data.research?.length) s.push({ key: "research", label: "Research", icon: sectionIcons.research, items: data.research.map((r: any) => ({ name: r.name, path: r.dir })) });
              setSections(s);
              setLoading(false);
            })
            .catch(() => setLoading(false));
        });
    }
  }, [open]);

  const queryFor = (section: string, item: VaultItem) => {
    switch (section) {
      case "entities": return `show me ${item.name}`;
      case "projects": return `show project ${item.name}`;
      case "research": return `show research on ${item.name}`;
      case "work": return `show ${item.name}`;
      case "system": return `show system ${item.name}`;
      case "knowledge": return `tell me about ${item.name}`;
      case "journal": return `show journal ${item.name}`;
      case "memory": return `show ${item.name}`;
      default: return `show me ${item.name}`;
    }
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
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.6)",
              zIndex: 40,
            }}
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={springs.gentle}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              width: 340,
              backgroundColor: colors.level2,
              borderLeft: `1px solid ${colors.borderStandard}`,
              zIndex: 41,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: `1px solid ${colors.borderStandard}`,
              }}
            >
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 510,
                  letterSpacing: -0.165,
                  color: colors.primaryText,
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
              >
                Vault
              </span>
              <button
                onClick={onClose}
                style={{
                  background: "transparent",
                  border: "none",
                  color: colors.tertiaryText,
                  cursor: "pointer",
                  padding: 4,
                  fontSize: 18,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                scrollbarWidth: "thin",
              }}
            >
              {loading && (
                <div style={{ padding: 32, textAlign: "center", color: colors.tertiaryText, fontSize: 13 }}>
                  Loading vault…
                </div>
              )}

              {!loading && sections.length === 0 && (
                <div style={{ padding: 32, textAlign: "center", color: colors.tertiaryText, fontSize: 13 }}>
                  No vault content found
                </div>
              )}

              {sections.map((section, si) => {
                const isCollapsed = collapsed[section.key];
                return (
                  <div key={section.key}>
                    <button
                      onClick={() => toggleSection(section.key)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        width: "100%",
                        padding: "12px 16px 6px",
                        background: "transparent",
                        border: "none",
                        color: colors.tertiaryText,
                        fontSize: 11,
                        fontWeight: 510,
                        textTransform: "uppercase" as const,
                        letterSpacing: 0.5,
                        fontFeatureSettings: '"cv01", "ss03"',
                        cursor: "pointer",
                        fontFamily: '"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
                        transition: "color 0.15s",
                      }}
                    >
                      {sectionIcons[section.key] || sectionIcons.entities}
                      {section.label}
                      <span style={{ opacity: 0.5, fontSize: 10 }}>{section.items.length}</span>
                      <svg
                        width={10}
                        height={10}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                          marginLeft: "auto",
                          transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          transition: "transform 0.15s ease",
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
                          {section.items.map((item, i) => (
                            <motion.button
                              key={item.path + item.name}
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.02, duration: 0.2 }}
                              onClick={() => {
                                if (section.key === "entities" || section.key === "projects" || section.key === "research") {
                                  onNavigate(queryFor(section.key, item));
                                } else {
                                  onOpenFile(item.path);
                                }
                                onClose();
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                width: "100%",
                                padding: "8px 16px 8px 32px",
                                background: "transparent",
                                border: "none",
                                borderRadius: 4,
                                cursor: "pointer",
                                color: colors.primaryText,
                                fontSize: 13,
                                fontWeight: 400,
                                letterSpacing: -0.1,
                                fontFeatureSettings: '"cv01", "ss03"',
                                fontFamily: '"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
                                textAlign: "left" as const,
                                transition: "background-color 0.15s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = "transparent";
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                                {item.name}
                              </span>
                              {item.type && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    color: colors.tertiaryText,
                                    marginLeft: 8,
                                    flexShrink: 0,
                                  }}
                                >
                                  {item.type}
                                </span>
                              )}
                            </motion.button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {si < sections.length - 1 && (
                      <div
                        style={{
                          height: 1,
                          backgroundColor: colors.borderSubtle,
                          margin: "8px 16px",
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}