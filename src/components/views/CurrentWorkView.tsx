"use client";

import { CurrentWorkData } from "@/lib/view-models";
import { TaskGroupComponent, Badge } from "@/components/ui";

export function CurrentWorkView({ data, view }: { data: CurrentWorkData; view: any }) {
  const workData = data as CurrentWorkData;

  return (
    <div className="space-y-5">
      {workData.highlights && workData.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {workData.highlights.map((h, i) => (
            <Badge key={i} variant="default">{h}</Badge>
          ))}
        </div>
      )}

      {workData.groups.map((group, i) => (
        <TaskGroupComponent key={i} group={group} />
      ))}

      {workData.periodLinks && (
        <div className="flex items-center gap-3 pt-2">
          {workData.periodLinks.week && (
            <a href="#" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              {workData.periodLinks.week.label}
            </a>
          )}
          {workData.periodLinks.month && (
            <a href="#" className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              {workData.periodLinks.month.label}
            </a>
          )}
        </div>
      )}
    </div>
  );
}