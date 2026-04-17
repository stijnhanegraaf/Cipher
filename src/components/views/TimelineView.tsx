"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { TimelineSynthesisData } from "@/lib/view-models";
import { Badge, CalloutBox } from "@/components/ui";

// Theme color palette — dot + bg tint + border tint per cycling theme
const themeAccents = [
  { dot: "#5e6ad2", bg: "rgba(94,106,210,0.06)",  border: "rgba(94,106,210,0.15)" },
  { dot: "#7170ff", bg: "rgba(113,112,255,0.06)",  border: "rgba(113,112,255,0.15)" },
  { dot: "#10b981", bg: "rgba(16,185,129,0.06)",   border: "rgba(16,185,129,0.15)" },
  { dot: "#d0d6e0", bg: "rgba(208,214,224,0.04)",  border: "rgba(208,214,224,0.08)" },
  { dot: "#8a8f98", bg: "rgba(138,143,152,0.04)",   border: "rgba(138,143,152,0.08)" },
];

export function TimelineView({ data, view, onNavigate }: { data: TimelineSynthesisData; view: any; onNavigate?: (path: string) => void }) {
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
