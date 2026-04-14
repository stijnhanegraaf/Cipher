"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { CurrentWorkData } from "@/lib/view-models";
import { TaskGroupComponent, Badge } from "@/components/ui";

// Design tokens
const tokens = {
  text: {
    primary: "#f7f8f8",
    secondary: "#d0d6e0",
    tertiary: "#8a8f98",
    quaternary: "#62666d",
  },
  brand: { indigo: "#5e6ad2", violet: "#7170ff" },
  border: { subtle: "rgba(255,255,255,0.05)", standard: "rgba(255,255,255,0.08)", solid: "#23252a" },
};

export function CurrentWorkView({ data, view, onToggle }: { data: CurrentWorkData; view: any; onToggle?: (itemId: string, checked: boolean) => void }) {
  const workData = data as CurrentWorkData;

  return (
    <motion.div
      variants={stagger.container(0.04)}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Highlights strip */}
      {workData.highlights && workData.highlights.length > 0 && (
        <motion.div variants={fadeSlideUp} className="flex flex-wrap gap-2">
          {workData.highlights.map((h, i) => (
            <Badge key={i} variant="outline">{h}</Badge>
          ))}
        </motion.div>
      )}

      {/* Task groups */}
      {workData.groups.length === 0 ? (
        <motion.div variants={fadeSlideUp} className="flex flex-col items-center justify-center py-12">
          <svg
            width={24}
            height={24}
            fill="none"
            stroke="#62666d"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            style={{ marginBottom: 12 }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <p
            className="text-[15px]"
            style={{
              color: "#8a8f98",
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
              lineHeight: 1.6,
            }}
          >
            No tasks to show right now.
          </p>
        </motion.div>
      ) : (
        workData.groups.map((group, i) => (
          <motion.div key={i} variants={stagger.item}>
            <TaskGroupComponent group={group} index={i} onToggle={onToggle} />
          </motion.div>
        ))
      )}

      {/* Period links */}
      {workData.periodLinks && (
        <motion.div variants={fadeSlideUp} className="flex items-center gap-4 pt-2">
          {workData.periodLinks.week && (
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-[13px] font-[510] transition-colors duration-150 hover:brightness-125"
              style={{
                color: tokens.brand.violet,
                fontFamily: "'Inter Variable', sans-serif",
                fontFeatureSettings: '"cv01", "ss03"',
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {workData.periodLinks.week.label}
            </a>
          )}
          {workData.periodLinks.month && (
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-[13px] font-[510] transition-colors duration-150 hover:brightness-125"
              style={{
                color: tokens.brand.violet,
                fontFamily: "'Inter Variable', sans-serif",
                fontFeatureSettings: '"cv01", "ss03"',
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {workData.periodLinks.month.label}
            </a>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}