"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { TimelineSynthesisData, ViewModel } from "@/lib/view-models";
import { Badge, CalloutBox } from "@/components/ui";

// Theme color palette — dot + bg tint + border tint per cycling theme.
// Sourced from CSS tokens so light/dark adapts automatically.
const themeAccents = [
  { dot: "var(--accent-brand)",       bg: "color-mix(in srgb, var(--accent-brand) 6%, transparent)",   border: "color-mix(in srgb, var(--accent-brand) 15%, transparent)" },
  { dot: "var(--accent-violet)",      bg: "color-mix(in srgb, var(--accent-violet) 6%, transparent)",  border: "color-mix(in srgb, var(--accent-violet) 15%, transparent)" },
  { dot: "var(--status-done)",        bg: "color-mix(in srgb, var(--status-done) 6%, transparent)",    border: "color-mix(in srgb, var(--status-done) 15%, transparent)" },
  { dot: "var(--text-secondary)",     bg: "color-mix(in srgb, var(--text-secondary) 4%, transparent)", border: "color-mix(in srgb, var(--text-secondary) 8%, transparent)" },
  { dot: "var(--text-tertiary)",      bg: "color-mix(in srgb, var(--text-tertiary) 4%, transparent)",  border: "color-mix(in srgb, var(--text-tertiary) 8%, transparent)" },
];

export function TimelineView({ data, view, onNavigate }: { data: unknown; view: ViewModel; onNavigate?: (path: string) => void }) {
  const timeline = data as TimelineSynthesisData;

  return (
    <motion.div
      variants={stagger.container(0.12)}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Range badge */}
      <motion.div variants={fadeSlideUp} className="flex items-center gap-2">
        <Badge variant="indigo">{timeline.range.label}</Badge>
        <span className="label-medium text-text-quaternary">
          {timeline.themes.length} {timeline.themes.length === 1 ? "theme" : "themes"}
        </span>
      </motion.div>

      {/* Themes */}
      {timeline.themes.map((theme, i) => {
        const accent = themeAccents[i % themeAccents.length];
        return (
          <motion.div
            key={i}
            variants={fadeSlideUp}
            className="rounded-[8px] overflow-hidden"
            style={{
              background: accent.bg,
              border: `1px solid ${accent.border}`,
            }}
          >
            {/* Theme header */}
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-start gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                  style={{
                    background: accent.dot,
                    boxShadow: "0 0 0 2px var(--bg-surface)",
                  }}
                />
                <div>
                  <h3 className="caption-large text-text-primary" style={{ fontWeight: 590 }}>
                    {theme.label}
                  </h3>
                  <p className="caption text-text-tertiary mt-1" style={{ lineHeight: 1.5 }}>
                    {theme.summary}
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline items inside theme — 1.5px line, 9px dots for visual weight */}
            <div className="px-5 pb-4 pt-2">
              <div className="relative pl-5 ml-1.5">
                <div
                  className="absolute left-[4px] top-1 bottom-1"
                  style={{ width: "1.5px", background: "var(--border-standard)" }}
                />
                <div className="space-y-4">
                  {theme.items.map((item, j) => {
                    const clickable = !!(item.path && onNavigate);
                    const Wrapper: "button" | "div" = clickable ? "button" : "div";
                    return (
                      <motion.div
                        key={j}
                        variants={fadeSlideUp}
                        className="relative"
                      >
                        <Wrapper
                          type={clickable ? "button" : undefined}
                          onClick={clickable ? () => onNavigate!(item.path!) : undefined}
                          className={`flex items-start gap-3 w-full text-left py-1 -my-1 -mx-2 px-2 rounded-[4px] transition-colors duration-150 ${clickable ? "cursor-pointer hover:bg-[var(--bg-surface-alpha-2)]" : ""}`}
                          style={{ background: "transparent", border: "none" }}
                        >
                          <div className="absolute -left-[19px] top-[9px]">
                            <div
                              className="w-[9px] h-[9px] rounded-full"
                              style={{
                                background: accent.dot,
                                boxShadow: "0 0 0 2px var(--bg-surface)",
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="micro mono-label text-text-quaternary">
                              {item.date}
                            </span>
                            <p className="caption-large text-text-secondary mt-0.5" style={{ lineHeight: 1.5 }}>
                              {item.label}
                            </p>
                          </div>
                        </Wrapper>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}

      {/* Evidence gaps */}
      {timeline.proofGaps && timeline.proofGaps.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <CalloutBox
            tone="warning"
            title="Evidence gaps"
            body={timeline.proofGaps.join("; ") + "."}
            onNavigate={onNavigate}
          />
        </motion.div>
      )}
    </motion.div>
  );
}
