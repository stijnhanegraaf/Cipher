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
      variants={stagger.container(0.1)}
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
        <motion.div variants={fadeSlideUp} className="flex items-center justify-center py-8">
          <p
            className="text-[13px]"
            style={{
              color: "#62666d",
              fontFamily: "'Inter Variable', sans-serif",
              fontFeatureSettings: '"cv01", "ss03"',
            }}
          >
            No additional data available for this entity.
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}