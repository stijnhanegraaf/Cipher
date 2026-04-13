"use client";

import { motion } from "framer-motion";
import { TimelineSynthesisData } from "@/lib/view-models";
import { Badge, CalloutBox } from "@/components/ui";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

// Theme color palette for distinguishing themes visually
const themeColors = [
  { dot: "bg-blue-500 dark:bg-blue-400",    ring: "ring-blue-200/80 dark:ring-blue-800/50", bg: "bg-blue-50/60 dark:bg-blue-950/20",    border: "border-blue-200/60 dark:border-blue-800/30", text: "text-blue-700 dark:text-blue-300" },
  { dot: "bg-violet-500 dark:bg-violet-400",  ring: "ring-violet-200/80 dark:ring-violet-800/50", bg: "bg-violet-50/60 dark:bg-violet-950/20", border: "border-violet-200/60 dark:border-violet-800/30", text: "text-violet-700 dark:text-violet-300" },
  { dot: "bg-emerald-500 dark:bg-emerald-400", ring: "ring-emerald-200/80 dark:ring-emerald-800/50", bg: "bg-emerald-50/60 dark:bg-emerald-950/20", border: "border-emerald-200/60 dark:border-emerald-800/30", text: "text-emerald-700 dark:text-emerald-300" },
  { dot: "bg-amber-500 dark:bg-amber-400",    ring: "ring-amber-200/80 dark:ring-amber-800/50", bg: "bg-amber-50/60 dark:bg-amber-950/20",   border: "border-amber-200/60 dark:border-amber-800/30", text: "text-amber-700 dark:text-amber-300" },
  { dot: "bg-rose-500 dark:bg-rose-400",       ring: "ring-rose-200/80 dark:ring-rose-800/50", bg: "bg-rose-50/60 dark:bg-rose-950/20",     border: "border-rose-200/60 dark:border-rose-800/30", text: "text-rose-700 dark:text-rose-300" },
];

export function TimelineView({ data, view }: { data: TimelineSynthesisData; view: any }) {
  const timeline = data as TimelineSynthesisData;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Range badge */}
      <motion.div variants={fadeUp} transition={{ duration: 0.4 }} className="flex items-center gap-2">
        <Badge variant="secondary">{timeline.range.label}</Badge>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {timeline.themes.length} {timeline.themes.length === 1 ? "theme" : "themes"}
        </span>
      </motion.div>

      {/* Themes */}
      {timeline.themes.map((theme, i) => {
        const color = themeColors[i % themeColors.length];
        return (
          <motion.div
            key={i}
            variants={fadeUp}
            transition={{ duration: 0.4 }}
            className={`rounded-xl border ${color.border} ${color.bg} overflow-hidden`}
          >
            {/* Theme header */}
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-start gap-3">
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ring-2 ${color.ring} ${color.dot}`} />
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{theme.label}</h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 leading-relaxed">{theme.summary}</p>
                </div>
              </div>
            </div>

            {/* Timeline items inside theme */}
            <div className="px-4 pb-4 pt-1">
              <div className="relative pl-4 ml-1.5">
                {/* Vertical timeline line */}
                <div className="absolute left-[3px] top-1 bottom-1 w-px bg-neutral-200/80 dark:bg-neutral-700/40" />
                <div className="space-y-3">
                  {theme.items.map((item, j) => (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.1 + j * 0.06 }}
                      className="relative flex items-start gap-3"
                    >
                      {/* Dot on line */}
                      <div className="absolute -left-4 top-1.5">
                        <div className={`w-[7px] h-[7px] rounded-full ${color.dot} ring-2 ring-white dark:ring-neutral-900`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-mono text-neutral-400 dark:text-neutral-500">{item.date}</span>
                        <p className="text-sm text-neutral-800 dark:text-neutral-200 leading-snug">{item.label}</p>
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
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
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