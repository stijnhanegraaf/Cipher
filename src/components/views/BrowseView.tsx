"use client";

import { motion } from "framer-motion";
import { springs } from "@/lib/motion";
import { Badge } from "@/components/ui";

interface BrowseItem {
  name: string;
  path?: string;
  type?: string;
  description?: string;
}

interface BrowseData {
  title: string;
  kind: "entities" | "projects" | "research";
  items: BrowseItem[];
}

const tokens = {
  text: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },
  brand: {
    indigo: "#5e6ad2",
    violet: "#7170ff",
  },
};

const kindIcons: Record<string, React.ReactNode> = {
  entities: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  projects: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  research: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
};

export function BrowseView({ data }: { data: BrowseData }) {
  const icon = kindIcons[data.kind] || kindIcons.projects;

  return (
    <div>
      {/* Section label */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 510,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: tokens.text.quaternary,
          marginBottom: 16,
          fontFamily: "'Inter Variable', 'Inter', sans-serif",
          fontFeatureSettings: '"cv01", "ss03"',
        }}
      >
        {data.kind === "entities" ? "Entities" : data.kind === "projects" ? "Projects" : "Research"}
      </div>

      {data.items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <div style={{ opacity: 0.3, marginBottom: 12 }}>{icon}</div>
          <p style={{ color: tokens.text.quaternary, fontSize: 14 }}>No {data.kind} found</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {data.items.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springs.gentle, delay: i * 0.04 }}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <div style={{ color: tokens.text.tertiary, flexShrink: 0 }}>
                {icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 400,
                    lineHeight: 1.5,
                    color: tokens.text.primary,
                    margin: 0,
                    fontFamily: "'Inter Variable', 'Inter', sans-serif",
                    fontFeatureSettings: '"cv01", "ss03"',
                  }}
                >
                  {item.name}
                </p>
                {item.description && (
                  <p
                    style={{
                      fontSize: 13,
                      color: tokens.text.quaternary,
                      margin: 0,
                      fontFamily: "'Inter Variable', 'Inter', sans-serif",
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {item.description}
                  </p>
                )}
              </div>
              {item.type && (
                <Badge variant={item.type === "active" ? "success" : "default"} dot>{item.type}</Badge>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}