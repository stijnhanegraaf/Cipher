"use client";

import { TopicOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, CalloutBox, Badge } from "@/components/ui";

export function TopicOverviewView({ data, view }: { data: TopicOverviewData; view: any }) {
  const topic = data as TopicOverviewData;

  return (
    <div className="space-y-5">
      <EntityHeader
        title={view?.title || "Topic"}
        kind={topic.topicType}
        summary={topic.summary}
        whyNow={topic.whyNow}
      />

      {topic.currentState && (
        <SectionBlock title="Current state">
          <p className="text-sm text-neutral-700 dark:text-neutral-300">{topic.currentState}</p>
        </SectionBlock>
      )}

      {topic.keyQuestions && topic.keyQuestions.length > 0 && (
        <SectionBlock title="Open questions">
          <ul className="space-y-2">
            {topic.keyQuestions.map((q, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="text-amber-500 mt-0.5 shrink-0">●</span>
                {q}
              </li>
            ))}
          </ul>
        </SectionBlock>
      )}

      {topic.nextSteps && topic.nextSteps.length > 0 && (
        <SectionBlock title="Next steps">
          <ul className="space-y-2">
            {topic.nextSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <span className="text-emerald-500 mt-0.5 shrink-0">→</span>
                {s}
              </li>
            ))}
          </ul>
        </SectionBlock>
      )}

      {topic.relatedNotes && topic.relatedNotes.length > 0 && (
        <SectionBlock title="Related Notes">
          <LinkList items={topic.relatedNotes!} />
        </SectionBlock>
      )}

      {topic.relatedEntities && topic.relatedEntities.length > 0 && (
        <SectionBlock title="Connected">
          <LinkList items={topic.relatedEntities!} />
        </SectionBlock>
      )}

      {topic.timeline && topic.timeline.length > 0 && (
        <SectionBlock title="Recent">
          <TimelineMini items={topic.timeline} />
        </SectionBlock>
      )}
    </div>
  );
}