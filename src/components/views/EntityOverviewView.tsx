"use client";

import { motion } from "framer-motion";
import { stagger, fadeSlideUp } from "@/lib/motion";
import { EntityOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini } from "@/components/ui";

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

  return (
    <motion.div
      variants={stagger.container(0.1)}
      initial="hidden"
      animate="show"
      className="space-y-6"
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
    </motion.div>
  );
}