"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springs } from "@/lib/motion";

interface IndexEntry {
  name: string;
  path: string;
  type?: string;
  status?: string;
}

interface VaultDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (query: string) => void;
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

export function VaultDrawer({ open, onClose, onNavigate }: VaultDrawerProps) {
  const [entities, setEntities] = useState<IndexEntry[]>([]);
  const [projects, setProjects] = useState<IndexEntry[]>([]);
  const [research, setResearch] = useState<IndexEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"entities" | "projects" | "research">("entities");

  useEffect(() => {
    if (open) {
      fetch("/api/query")
        .then((r) => r.json())
        .then((data) => {
          setEntities(data.entities || []);
          setProjects(data.projects || []);
          setResearch(data.research || []);
        })
        .catch(() => {});
    }
  }, [open]);

  const tabs = [
    { key: "entities" as const, label: "Entities", count: entities.length },
    { key: "projects" as const, label: "Projects", count: projects.length },
    { key: "research" as const, label: "Research", count: research.length },
  ];

  const items =
    activeTab === "entities"
      ? entities
      : activeTab === "projects"
        ? projects
        : research;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
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
          {/* Drawer */}
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
              width: 320,
              backgroundColor: colors.level2,
              borderLeft: `1px solid ${colors.borderStandard}`,
              zIndex: 41,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Header */}
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

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: `1px solid ${colors.borderStandard}`,
              }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    background: "transparent",
                    border: "none",
                    borderBottom:
                      activeTab === tab.key
                        ? `2px solid ${colors.brandIndigo}`
                        : "2px solid transparent",
                    color:
                      activeTab === tab.key
                        ? colors.primaryText
                        : colors.tertiaryText,
                    fontSize: 13,
                    fontWeight: activeTab === tab.key ? 510 : 400,
                    cursor: "pointer",
                    fontFamily: '"Inter Variable", "Inter", -apple-system, system-ui, sans-serif',
                    fontFeatureSettings: '"cv01", "ss03"',
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  {tab.label}
                  <span
                    style={{
                      fontSize: 11,
                      marginLeft: 4,
                      opacity: activeTab === tab.key ? 0.7 : 0.4,
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Items */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 8,
              }}
            >
              {items.length === 0 && (
                <div
                  style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    color: colors.tertiaryText,
                    fontSize: 13,
                  }}
                >
                  No items found
                </div>
              )}
              {items.map((item, i) => (
                <motion.button
                  key={item.name}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  onClick={() => {
                    onNavigate(
                      activeTab === "entities"
                        ? `show me ${item.name}`
                        : activeTab === "projects"
                          ? `show project ${item.name}`
                          : `show research on ${item.name}`
                    );
                    onClose();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "10px 12px",
                    background: "transparent",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                    color: colors.primaryText,
                    fontSize: 14,
                    fontWeight: 400,
                    letterSpacing: -0.165,
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
                  <span>{item.name}</span>
                  {item.status && (
                    <span
                      style={{
                        fontSize: 11,
                        color: colors.tertiaryText,
                        textTransform: "uppercase" as const,
                        letterSpacing: 0.5,
                      }}
                    >
                      {item.status}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}