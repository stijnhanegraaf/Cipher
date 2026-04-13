"use client";

import { EntityOverviewData } from "@/lib/view-models";
import { EntityHeader, SectionBlock, LinkList, TimelineMini, CalloutBox } from "@/components/ui";

export function EntityOverviewView({ data, view }: { data: EntityOverviewData; view: any }) {
  const entity = data as EntityOverviewData;

  return (
    <div className="space-y-5">
      <EntityHeader
        title={view?.title || "Entity"}
        kind={entity.entityType}
        summary={entity.summary}
        whyNow={entity.whyNow}
      />

      {entity.whyNow && (
        <CalloutBox tone="info" title="Why now" body={entity.whyNow} />
      )}

      {entity.relatedNotes && entity.relatedNotes.length > 0 && (
        <SectionBlock title="Related Notes">
          <LinkList items={entity.relatedNotes!} />
        </SectionBlock>
      )}

      {entity.relatedEntities && entity.relatedEntities.length > 0 && (
        <SectionBlock title="Connected">
          <LinkList items={entity.relatedEntities!} />
        </SectionBlock>
      )}

      {entity.timeline && entity.timeline.length > 0 && (
        <SectionBlock title="Recent">
          <TimelineMini items={entity.timeline} />
        </SectionBlock>
      )}
    </div>
  );
}