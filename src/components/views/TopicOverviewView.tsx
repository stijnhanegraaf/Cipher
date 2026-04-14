"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { TopicOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, StatusDot, MarkdownRenderer } from "@/components/ui";

// Design tokens
const tokens = {
  text: { primary: "#f7f8f8", secondary: "#d0d6e0", tertiary: "#8a8f98", quaternary: "#62666d" },
  brand: { indigo: "#5e6ad2", violet: "#7170ff" },
  status: { emerald: "#10b981", warning: "#f59e0b" },
  border: { subtle: "rgba(255,255,255,0.05)", standard: "rgba(255,255,255,0.08)" },
};

const topicEmoji: Record<string, string> = {
  project: "📁",
  concept: "💡",
  area: "🎯",
  system: "⚙️",
};

export function TopicOverviewView({ data, view }: { data: TopicOverviewData; view: any }) {
  const topic = data as TopicOverviewData;
  const emoji = topicEmoji[topic.topicType] || "📄";

  return (
    <motion.div
      variants={stagger.container(0.04)}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Hero header */}
      <motion.div variants={fadeSlideUp}>
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
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Current state">
            <div
              className="flex items-start gap-3 px-6 py-4 rounded-[8px]"
              style={{
                background: "rgba(16,185,129,0.04)",
                borderLeft: `2px solid ${tokens.status.emerald}`,
              }}
            >
              <div className="mt-[7px] shrink-0">
                <StatusDot status="fresh" size={6} />
              </div>
              <div
                className="text-[15px] leading-[1.6] tracking-[-0.165px]"
                style={{
                  color: tokens.text.secondary,
                  fontFamily: "'Inter Variable', sans-serif",
                  fontFeatureSettings: '"cv01", "ss03"',
                }}
              >
                <MarkdownRenderer content={topic.currentState} />
              </div>
            </div>
          </SectionBlock>
        </motion.div>
      )}

      {/* Key questions */}
      {topic.keyQuestions && topic.keyQuestions.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Open questions">
            <div className="space-y-3">
              {topic.keyQuestions.map((q, i) => (
                <motion.div
                  key={i}
                  variants={fadeSlideUp}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-start gap-3 px-6 py-4 rounded-[8px]"
                  style={{
                    background: "rgba(245,158,11,0.04)",
                    borderLeft: `2px solid ${tokens.status.warning}`,
                  }}
                >
                  <svg
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: tokens.status.warning }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p
                    className="text-[14px] leading-[1.6]"
                    style={{
                      color: tokens.text.secondary,
                      fontFamily: "'Inter Variable', sans-serif",
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {q}
                  </p>
                </motion.div>
              ))}
            </div>
          </SectionBlock>
        </motion.div>
      )}

      {/* Next steps */}
      {topic.nextSteps && topic.nextSteps.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Next steps">
            <div className="space-y-3">
              {topic.nextSteps.map((s, i) => (
                <motion.div
                  key={i}
                  variants={fadeSlideUp}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-start gap-3 px-6 py-4 rounded-[8px]"
                  style={{
                    background: "rgba(16,185,129,0.04)",
                    borderLeft: `2px solid ${tokens.status.emerald}`,
                  }}
                >
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-[590] shrink-0 mt-0.5"
                    style={{
                      background: "rgba(16,185,129,0.12)",
                      color: tokens.status.emerald,
                      fontFamily: "'Inter Variable', sans-serif",
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {i + 1}
                  </span>
                  <p
                    className="text-[14px] leading-[1.6]"
                    style={{
                      color: tokens.text.secondary,
                      fontFamily: "'Inter Variable', sans-serif",
                      fontFeatureSettings: '"cv01", "ss03"',
                    }}
                  >
                    {s}
                  </p>
                </motion.div>
              ))}
            </div>
          </SectionBlock>
        </motion.div>
      )}

      {/* Related notes */}
      {topic.relatedNotes && topic.relatedNotes.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Notes">
            <LinkList items={topic.relatedNotes!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Connected entities */}
      {topic.relatedEntities && topic.relatedEntities.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Connected">
            <LinkList items={topic.relatedEntities!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Timeline */}
      {topic.timeline && topic.timeline.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Recent activity">
            <TimelineMini items={topic.timeline} />
          </SectionBlock>
        </motion.div>
      )}
    </motion.div>
  );
}