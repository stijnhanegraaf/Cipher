/**
 * Central view-type dispatcher. Re-exports every `build<X>()` so existing
 * imports of `@/lib/view-builder` keep working; the actual builders live
 * in `./builders/*` (one file per intent).
 */

import type { ViewModel, ViewType } from "./view-models";
import { buildCurrentWork } from "./builders/current-work";
import { buildEntityOverview } from "./builders/entity";
import { buildSystemStatus } from "./builders/system-status";
import { buildTimelineSynthesis } from "./builders/timeline";
import { buildTopicOverview } from "./builders/topic";
import { buildSearchResults } from "./builders/search";
import { buildBrowseIndex } from "./builders/browse";

export { buildCurrentWork } from "./builders/current-work";
export { buildEntityOverview } from "./builders/entity";
export { buildSystemStatus } from "./builders/system-status";
export { buildTimelineSynthesis } from "./builders/timeline";
export { buildTopicOverview } from "./builders/topic";
export { buildSearchResults } from "./builders/search";
export { buildBrowseIndex } from "./builders/browse";

/**
 * Central view-type dispatcher.
 *
 * Maps a `ViewType` to the appropriate `build<X>()` builder, forwarding
 * `query` (for topic / search) and `entityName` (for entity overview).
 * Every builder returns a ViewModel; this function never returns null.
 */
export async function buildView(
  viewType: ViewType,
  query?: string,
  entityName?: string,
): Promise<ViewModel> {
  switch (viewType) {
    case "current_work":
      return buildCurrentWork();
    case "entity_overview":
      return buildEntityOverview(entityName);
    case "system_status":
      return buildSystemStatus();
    case "timeline_synthesis":
      return buildTimelineSynthesis();
    case "topic_overview":
      return buildTopicOverview(query);
    case "search_results":
      return buildSearchResults(query || "");
    case "browse_entities":
      return buildBrowseIndex("entities");
    case "browse_projects":
      return buildBrowseIndex("projects");
    case "browse_research":
      return buildBrowseIndex("research");
  }
}
