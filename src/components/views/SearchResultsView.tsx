"use client";

import { SearchResultsData } from "@/lib/view-models";
import { Badge } from "@/components/ui";

export function SearchResultsView({ data, view }: { data: SearchResultsData; view: any }) {
  const search = data as SearchResultsData;

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        Results for &ldquo;{search.query}&rdquo;
      </p>

      <div className="space-y-2">
        {search.results.map((result, i) => (
          <a
            key={i}
            href="#"
            className="block p-3 rounded-xl hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">{result.label}</p>
                {result.excerpt && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{result.excerpt}</p>
                )}
              </div>
              {result.kind && (
                <Badge variant="secondary">{result.kind.replace(/_/g, " ")}</Badge>
              )}
            </div>
          </a>
        ))}
      </div>

      {search.suggestedViews && search.suggestedViews.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">Related views</p>
          <div className="flex flex-wrap gap-2">
            {search.suggestedViews.map((sv, i) => (
              <Badge key={i} variant="outline">{sv.label}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}