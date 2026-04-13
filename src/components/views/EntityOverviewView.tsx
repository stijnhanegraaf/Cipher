"use client";

import { motion } from "framer-motion";
import { EntityOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, Badge } from "@/components/ui";

const entityEmoji: Record<string, string> = {
  company: "🏢",
  person: "👤",
  tool: "🔧",
  project: "📁",
  concept: "💡",
  place: "📍",
};

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function EntityOverviewView({ data, view }: { data: EntityOverviewData; view: any }) {
  const entity = data as EntityOverviewData;
  const emoji = entityEmoji[entity.entityType] || "📎";

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
          title={view?.title || "Entity"}
          kind={entity.entityType}
          summary={entity.summary}
          whyNow={entity.whyNow}
          emoji={emoji}
        />
      </motion.div>

      {/* Connected entities */}
      {entity.relatedEntities && entity.relatedEntities.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Connected">
            <LinkList items={entity.relatedEntities!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Related notes */}
      {entity.relatedNotes && entity.relatedNotes.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Notes">
            <LinkList items={entity.relatedNotes!} />
          </SectionBlock>
        </motion.div>
      )}

      {/* Timeline */}
      {entity.timeline && entity.timeline.length > 0 && (
        <motion.div variants={fadeUp} transition={{ duration: 0.35 }}>
          <SectionBlock title="Recent activity">
            <TimelineMini items={entity.timeline} />
          </SectionBlock>
        </motion.div>
      )}
    </motion.div>
  );
}