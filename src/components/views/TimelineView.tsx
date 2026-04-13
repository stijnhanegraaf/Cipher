"use client";

import { TimelineSynthesisData } from "@/lib/view-models";
import { SectionBlock, CalloutBox, Badge } from "@/components/ui";

export function TimelineView({ data, view }: { data: TimelineSynthesisData; view: any }) {
  const timeline = data as TimelineSynthesisData;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Badge variant="default">{timeline.range.label}</Badge>
      </div>

      {timeline.themes.map((theme, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{theme.label}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{theme.summary}</p>
              <div className="mt-2 ml-2 space-y-1.5 border-l-2 border-neutral-200 dark:border-neutral-700 pl-3">
                {theme.items.map((item, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <span className="text-xs text-neutral-400 dark:text-neutral-500 font-mono shrink-0 pt-0.5">{item.date}</span>
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-800 dark:text-neutral-200">{item.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}

      {timeline.proofGaps && timeline.proofGaps.length > 0 && (
        <CalloutBox
          tone="warning"
          title="Evidence gaps"
          body={timeline.proofGaps.join("; ") + "."}
        />
      )}
    </div>
  );
}