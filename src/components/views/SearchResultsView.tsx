"use client";

import { motion } from "framer-motion";
import { SearchResultsData } from "@/lib/view-models";
import { Badge } from "@/components/ui";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

// Kind → display label & color
const kindConfig: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "error" }> = {
  canonical_note:    { label: "Note",   variant: "secondary" },
  entity:            { label: "Entity", variant: "default" },
  topic:             { label: "Topic",  variant: "default" },
  derived_index:     { label: "Index",  variant: "default" },
  runtime_status:    { label: "Status", variant: "warning" },
  generated_summary: { label: "Summary", variant: "default" },
};

// Group results by kind for cleaner display
function groupByKind(results: SearchResultsData["results"]) {
  const groups: Record<string, SearchResultsData["results"]> = {};
  for (const r of results) {
    const kind = r.kind || "other";
    if (!groups[kind]) groups[kind] = [];
    groups[kind].push(r);
  }
  return groups;
}

export function SearchResultsView({ data, view }: { data: SearchResultsData; view: any }) {
  const search = data as SearchResultsData;
  const groups = groupByKind(search.results);
  const kindOrder = ["canonical_note", "entity", "topic", "derived_index", "runtime_status", "generated_summary", "other"];

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Search context */}
      <motion.div variants={fadeUp} transition={{ duration: 0.3 }} className="flex items-center gap-2.5">
        <svg className="w-4 h-4 text-neutral-400 dark:text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          Results for <span className="font-semibold text-neutral-900 dark:text-neutral-100">&ldquo;{search.query}&rdquo;</span>
        </span>
        <Badge variant="default">{search.results.length} results</Badge>
      </motion.div>

      {/* Grouped results */}
      {kindOrder.map((kind) => {
        const items = groups[kind];
        if (!items || items.length === 0) return null;
        const config = kindConfig[kind] || { label: kind, variant: "default" as const };

        return (
          <motion.div key={kind} variants={fadeUp} transition={{ duration: 0.3 }} className="space-y-1.5">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            <div className="space-y-1">
              {items.map((result, i) => (
                <motion.a
                  key={i}
                  href="#"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150 group"
                >
                  <div className="mt-0.5 shrink-0">
                    <svg className="w-4 h-4 text-neutral-300 dark:text-neutral-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                      {result.label}
                    </p>
                    {result.excerpt && (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2 leading-relaxed">{result.excerpt}</p>
                    )}
                  </div>
                  <svg className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600 group-hover:text-blue-400 dark:group-hover:text-blue-500 shrink-0 mt-0.5 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.a>
              ))}
            </div>
          </motion.div>
        );
      })}

      {/* Suggested views */}
      {search.suggestedViews && search.suggestedViews.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.3 }} className="pt-2">
          <p className="text-[11px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-[0.08em] mb-2.5">
            Related views
          </p>
          <div className="flex flex-wrap gap-2">
            {search.suggestedViews.map((sv, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/60 transition-colors cursor-pointer"
              >
                {sv.label}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </motion.button>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}