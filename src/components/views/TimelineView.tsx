"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { TimelineSynthesisData } from "@/lib/view-models";
import { Badge, CalloutBox } from "@/components/ui";

// Design tokens
const tokens = {
  text: { primary: "#f7f8f8", secondary: "#d0d6e0", tertiary: "#8a8f98", quaternary: "#62666d" },
  brand: { indigo: "#5e6ad2", violet: "#7170ff" },
  bg: { surface: "#191a1b" },
  border: { subtle: "rgba(255,255,255,0.05)", standard: "rgba(255,255,255,0.08)" },
};

// Theme color palette
const themeAccents = [
  { dot: "#5e6ad2", bg: "rgba(94,106,210,0.06)",  border: "rgba(94,106,210,0.15)" },
  { dot: "#7170ff", bg: "rgba(113,112,255,0.06)",  border: "rgba(113,112,255,0.15)" },
  { dot: "#10b981", bg: "rgba(16,185,129,0.06)",   border: "rgba(16,185,129,0.15)" },
  { dot: "#d0d6e0", bg: "rgba(208,214,224,0.04)",  border: "rgba(208,214,224,0.08)" },
  { dot: "#8a8f98", bg: "rgba(138,143,152,0.04)",   border: "rgba(138,143,152,0.08)" },
];

const fontFamily = {
  inter: "'Inter Variable', 'SF Pro Display', -apple-system, system-ui, sans-serif",
  mono: "'Berkeley Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

export function TimelineView({ data, view }: { data: TimelineSynthesisData; view: any }) {
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
        <span
          className="text-[12px] font-[510]"
          style={{
            color: tokens.text.quaternary,
            fontFamily: fontFamily.inter,
            fontFeatureSettings: '"cv01", "ss03"',
          }}
        >
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
            <div className="px-5 pt-5 pb-2">
              <div className="flex items-start gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                  style={{
                    background: accent.dot,
                    boxShadow: `0 0 0 2px ${tokens.bg.surface}`,
                  }}
                />
                <div>
                  <h3
                    className="text-[14px] font-[590] tracking-[-0.13px]"
                    style={{
                      color: tokens.text.primary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {theme.label}
                  </h3>
                  <p
                    className="text-[13px] mt-1 leading-[1.5]"
                    style={{
                      color: tokens.text.tertiary,
                      fontFamily: fontFamily.inter,
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {theme.summary}
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline items inside theme */}
            <div className="px-5 pb-5 pt-2">
              <div className="relative pl-5 ml-1.5">
                {/* Vertical timeline line */}
                <div
                  className="absolute left-[3px] top-1 bottom-1 w-px"
                  style={{ background: tokens.border.standard }}
                />
                <div className="space-y-4">
                  {theme.items.map((item, j) => (
                    <motion.div
                      key={j}
                      variants={fadeSlideUp}
                      transition={{ delay: i * 0.1 + j * 0.06 }}
                      className="relative flex items-start gap-3"
                    >
                      {/* Dot on line */}
                      <div className="absolute -left-5 top-1.5">
                        <div
                          className="w-[7px] h-[7px] rounded-full"
                          style={{
                            background: accent.dot,
                            boxShadow: `0 0 0 2px ${tokens.bg.surface}`,
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span
                          className="text-[11px] font-[510]"
                          style={{
                            color: tokens.text.quaternary,
                            fontFamily: fontFamily.mono,
                          }}
                        >
                          {item.date}
                        </span>
                        <p
                          className="text-[14px] leading-[1.5] mt-0.5"
                          style={{
                            color: tokens.text.secondary,
                            fontFamily: fontFamily.inter,
                            fontFeatureSettings: '"cv01", "ss03"',
                          }}
                        >
                          {item.label}
                        </p>
                      </div>
                    </motion.div>
                  ))}
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
          />
        </motion.div>
      )}
    </motion.div>
  );
}