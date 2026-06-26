/**
 * Single source of truth for search-result kind vocabulary.
 * Producer (buildSearchResults via kindFromPath) and both view
 * renderers import from here so the grouping never drifts again.
 */

export const SEARCH_KIND_ORDER = [
  "entity",
  "project",
  "research",
  "system",
  "work",
  "journal",
  "personal",
  "memory",
  "note",
  "other",
] as const;

export type SearchKind = (typeof SEARCH_KIND_ORDER)[number];

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  entity: "Entities",
  project: "Projects",
  research: "Research",
  system: "System",
  work: "Work",
  journal: "Journal",
  personal: "Personal",
  memory: "Memory",
  note: "Notes",
  other: "Other",
};

/**
 * Coerce any builder-produced kind string into a known SearchKind.
 * Unknown / undefined -> "other" so results are NEVER dropped.
 */
export function toSearchKind(kind: string | undefined): SearchKind {
  return (SEARCH_KIND_ORDER as readonly string[]).includes(kind ?? "")
    ? (kind as SearchKind)
    : "other";
}
