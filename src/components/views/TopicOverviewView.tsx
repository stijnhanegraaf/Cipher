"use client";

/** Renders TopicOverviewData in the chat-summary variant. */

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { TopicOverviewData, ViewModel } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, StatusDot, MarkdownRenderer } from "@/components/ui";

const topicEmoji: Record<string, string> = {
  project: "📁",
  concept: "💡",
  area: "🎯",
  system: "⚙️",
};

export function TopicOverviewView({ data, view, onNavigate }: { data: unknown; view: ViewModel; onNavigate?: (path: string) => void }) {
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
          onNavigate={onNavigate}
        />
      </motion.div>

      {/* Current state */}
      {topic.currentState && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Current state">
            <div
              className="flex items-start gap-3 px-5 py-4 rounded-[8px]"
              style={{
                background: "color-mix(in srgb, var(--status-done) 4%, transparent)",
                borderLeft: "2px solid var(--status-done)",
              }}
            >
              <div className="mt-[7px] shrink-0">
                <StatusDot status="fresh" size={6} />
              </div>
              <div className="small text-text-secondary">
                <MarkdownRenderer content={topic.currentState} onNavigate={onNavigate} />
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
                  className="flex items-start gap-3 px-5 py-4 rounded-[8px]"
                  style={{
                    background: "color-mix(in srgb, var(--status-warning) 4%, transparent)",
                    borderLeft: "2px solid var(--status-warning)",
                  }}
                >
                  <svg
                    className="w-4 h-4 shrink-0 mt-0.5"
                    style={{ color: "var(--status-warning)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="caption-large text-text-secondary" style={{ lineHeight: 1.6 }}>
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
                  className="flex items-start gap-3 px-5 py-4 rounded-[8px]"
                  style={{
                    background: "color-mix(in srgb, var(--status-done) 4%, transparent)",
                    borderLeft: "2px solid var(--status-done)",
                  }}
                >
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full micro shrink-0 mt-0.5"
                    style={{
                      background: "color-mix(in srgb, var(--status-done) 12%, transparent)",
                      color: "var(--status-done)",
                      fontWeight: 590,
                    }}
                  >
                    {i + 1}
                  </span>
                  <p className="caption-large text-text-secondary" style={{ lineHeight: 1.6 }}>
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
            <LinkList items={topic.relatedNotes!} onNavigate={onNavigate} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Connected entities */}
      {topic.relatedEntities && topic.relatedEntities.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Connected">
            <LinkList items={topic.relatedEntities!} onNavigate={onNavigate} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Timeline */}
      {topic.timeline && topic.timeline.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Recent activity">
            <TimelineMini items={topic.timeline} onNavigate={onNavigate} />
          </SectionBlock>
        </motion.div>
      )}
    </motion.div>
  );
}
