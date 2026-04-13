"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { SearchResultsData } from "@/lib/view-models";
import { Badge } from "@/components/ui";

// Design tokens
const tokens = {
  text: { primary: "#f7f8f8", secondary: "#d0d6e0", tertiary: "#8a8f98", quaternary: "#62666d" },
  brand: { indigo: "#5e6ad2", violet: "#7170ff" },
  border: { subtle: "rgba(255,255,255,0.05)", standard: "rgba(255,255,255,0.08)" },
};

const fontFamily = {
  inter: "'Inter Variable', 'SF Pro Display', -apple-system, system-ui, sans-serif",
};

// Kind → display label & badge variant
const kindConfig: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "indigo" | "outline" }> = {
  canonical_note:    { label: "Note",    variant: "indigo" },
  entity:            { label: "Entity",  variant: "outline" },
  topic:             { label: "Topic",   variant: "outline" },
  derived_index:     { label: "Index",   variant: "default" },
  runtime_status:    { label: "Status",  variant: "warning" },
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
      variants={stagger.container(0.06)}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Search context */}
      <motion.div variants={fadeSlideUp} className="flex items-center gap-2.5">
        <svg
          className="w-4 h-4 shrink-0"
          style={{ color: tokens.text.quaternary }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span
          className="text-[14px]"
          style={{
            color: tokens.text.tertiary,
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
          Results for{" "}
          <span
            className="font-[590]"
            style={{ color: tokens.text.primary }}
          >
            &ldquo;{search.query}&rdquo;
          </span>
        </span>
        <Badge variant="outline">{search.results.length} results</Badge>
      </motion.div>

      {/* Grouped results */}
      {kindOrder.map((kind) => {
        const items = groups[kind];
        if (!items || items.length === 0) return null;
        const config = kindConfig[kind] || { label: kind, variant: "outline" as const };

        return (
          <motion.div key={kind} variants={fadeSlideUp} className="space-y-1.5">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            <div className="space-y-0.5">
              {items.map((result, i) => (
                <motion.a
                  key={i}
                  href="#"
                  whileHover={{ x: 4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-3 p-3 rounded-[8px] transition-colors duration-150 group"
                  style={{ cursor: "pointer" }}
                >
                  <div className="mt-0.5 shrink-0">
                    <svg
                      className="w-4 h-4 transition-colors duration-150"
                      style={{ color: tokens.text.quaternary }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[14px] font-[510] truncate"
                      style={{
                        color: tokens.text.primary,
                        fontFamily: fontFamily.inter,
                        fontFeatureSettings: '"cv01", "ss03"',
                      }}
                    >
                      {result.label}
                    </p>
                    {result.excerpt && (
                      <p
                        className="text-[13px] mt-0.5 leading-[1.5]"
                        style={{
                          color: tokens.text.quaternary,
                          fontFamily: fontFamily.inter,
                          fontFeatureSettings: '"cv01", "ss03"',
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {result.excerpt}
                      </p>
                    )}
                  </div>
                  <svg
                    className="w-3.5 h-3.5 shrink-0 mt-0.5 transition-colors duration-150"
                    style={{ color: tokens.text.quaternary }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
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
        <motion.div variants={fadeSlideUp} className="pt-2">
          <p
            className="text-[11px] font-[510] uppercase tracking-[0.08em] mb-2.5"
            style={{
              color: tokens.text.quaternary,
              fontFamily: fontFamily.inter,
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            Related views
          </p>
          <div className="flex flex-wrap gap-2">
            {search.suggestedViews.map((sv, i) => (
              <motion.button
                key={i}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-[12px] font-[510] cursor-pointer transition-colors duration-150"
                style={{
                  background: "rgba(94,106,210,0.08)",
                  border: "1px solid rgba(94,106,210,0.15)",
                  color: tokens.brand.violet,
                  fontFamily: fontFamily.inter,
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
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