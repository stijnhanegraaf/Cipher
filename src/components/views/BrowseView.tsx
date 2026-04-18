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

const kindIcons: Record<string, React.ReactNode> = {
  entities: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  projects: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  research: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
};

export function BrowseView({ data }: { data: BrowseData }) {
  const icon = kindIcons[data.kind] || kindIcons.projects;

  return (
    <div>
      {/* Section label */}
      <div className="micro uppercase tracking-[0.08em] text-text-quaternary mb-4">
        {data.kind === "entities" ? "Entities" : data.kind === "projects" ? "Projects" : "Research"}
      </div>

      {data.items.length === 0 ? (
        <div className="text-center py-8">
          <div className="mb-3 text-text-quaternary" style={{ opacity: 0.3 }}>{icon}</div>
          <p className="caption-large text-text-quaternary">No {data.kind} found</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {data.items.map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="app-row flex items-center gap-3 px-3 py-2.5 rounded-[6px] cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-surface-alpha-2)]"
            >
              <div className="text-text-tertiary shrink-0">{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="small text-text-primary m-0">{item.name}</p>
                {item.description && (
                  <p className="caption text-text-quaternary m-0">{item.description}</p>
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
