"use client";

import { motion } from "framer-motion";
import { TopicOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, Badge } from "@/components/ui";

const topicEmoji: Record<string, string> = {
  project: "📁",
  concept: "💡",
  area: "🎯",
  system: "⚙️",
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function TopicOverviewView({ data, view }: { data: TopicOverviewData; view: any }) {
  const topic = data as TopicOverviewData;
  const emoji = topicEmoji[topic.topicType] || "📄";

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Hero header */}
      <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
        <EntityHeader
          title={view?.title || "Topic"}
          kind={topic.topicType}
          summary={topic.summary}
          whyNow={topic.whyNow}
          emoji={emoji}
        />
      </motion.div>

      {/* Current state */}
      {topic.currentState && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Current state">
            <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200/60 dark:border-neutral-700/40">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 mt-2 shrink-0" />
              <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">{topic.currentState}</p>
            </div>
          </SectionBlock>
        </motion.div>
      )}

      {/* Key questions */}
      {topic.keyQuestions && topic.keyQuestions.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Open questions">
            <div className="space-y-2">
              {topic.keyQuestions.map((q, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30"
                >
                  <span className="text-amber-500 dark:text-amber-400 mt-0.5 shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-snug">{q}</p>
                </motion.div>
              ))}
            </div>
          </SectionBlock>
        </motion.div>
      )}

      {/* Next steps */}
      {topic.nextSteps && topic.nextSteps.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Next steps">
            <div className="space-y-2">
              {topic.nextSteps.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  className="flex items-start gap-3 px-3.5 py-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30"
                >
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 text-xs font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-snug">{s}</p>
                </motion.div>
              ))}
            </div>
          </SectionBlock>
        </motion.div>
      )}

      {/* Related notes */}
      {topic.relatedNotes && topic.relatedNotes.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Notes">
            <LinkList items={topic.relatedNotes!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Connected entities */}
      {topic.relatedEntities && topic.relatedEntities.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Connected">
            <LinkList items={topic.relatedEntities!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Timeline */}
      {topic.timeline && topic.timeline.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Recent activity">
            <TimelineMini items={topic.timeline} />
          </SectionBlock>
        </motion.div>
      )}
    </motion.div>
  );
}