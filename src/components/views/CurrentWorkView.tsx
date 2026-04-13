"use client";

import { motion } from "framer-motion";
import { CurrentWorkData } from "@/lib/view-models";
import { TaskGroupComponent, Badge } from "@/components/ui";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function CurrentWorkView({ data, view }: { data: CurrentWorkData; view: any }) {
  const workData = data as CurrentWorkData;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Highlights strip */}
      {workData.highlights && workData.highlights.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }} className="flex flex-wrap gap-2">
          {workData.highlights.map((h, i) => (
            <Badge key={i} variant="default">{h}</Badge>
          ))}
        </motion.div>
      )}

      {/* Task groups */}
      {workData.groups.map((group, i) => (
        <motion.div key={i} variants={fadeUp} transition={{ duration: 0.35, delay: i * 0.08 }}>
          <TaskGroupComponent group={group} index={i} />
        </motion.div>
      ))}

      {/* Period links */}
      {workData.periodLinks && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }} className="flex items-center gap-3 pt-1">
          {workData.periodLinks.week && (
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {workData.periodLinks.week.label}
            </a>
          )}
          {workData.periodLinks.month && (
            <a
              href="#"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {workData.periodLinks.month.label}
            </a>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}