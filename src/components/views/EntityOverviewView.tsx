"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { EntityOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, MarkdownRenderer } from "@/components/ui";

const entityEmoji: Record<string, string> = {
  company: "🏢",
  person: "👤",
  tool: "🔧",
  project: "📁",
  concept: "💡",
  place: "📍",
};

export function EntityOverviewView({ data, view }: { data: EntityOverviewData; view: any }) {
  const entity = data as EntityOverviewData;
  const emoji = entityEmoji[entity.entityType] || "📎";

  // Empty state check
  const hasContent = entity.relatedEntities?.length || entity.relatedNotes?.length || entity.timeline?.length;

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
          title={view?.title || "Entity"}
          kind={entity.entityType}
          summary={entity.summary}
          whyNow={entity.whyNow}
          emoji={emoji}
        />
      </motion.div>

      {/* Connected entities */}
      {entity.relatedEntities && entity.relatedEntities.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Connected">
            <LinkList items={entity.relatedEntities!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Related notes */}
      {entity.relatedNotes && entity.relatedNotes.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Notes">
            <LinkList items={entity.relatedNotes!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Timeline */}
      {entity.timeline && entity.timeline.length > 0 && (
        <motion.div variants={fadeSlideUp}>
          <SectionBlock title="Recent activity">
            <TimelineMini items={entity.timeline} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Empty state */}
      {!hasContent && (
        <motion.div variants={fadeSlideUp} className="flex flex-col items-center justify-center py-16">
          <motion.svg
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.3, scale: 1 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            width={48}
            height={48}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#62666d"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginBottom: 16 }}
          >
            <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.16m0 .16l-.004-.16m.004.16v-.16m0 .16l-.004-.16M9.004 19.128a9.38 9.38 0 01-2.625.372 9.337 9.337 0 01-4.121-.952 4.125 4.125 0 017.533-2.493M9.004 19.128v-.16m0 .16l.004-.16m-.004.16v-.16m0 .16l.004-.16M12 8.25a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" />
          </motion.svg>
          <p
            className="text-[14px]"
            style={{
              color: "#62666d",
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
              lineHeight: 1.6,
            }}
          >
            No additional data available for this entity.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}