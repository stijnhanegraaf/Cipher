/**
 * Builds the "Browse Index" ViewModel — a flat listing of entities /
 * projects / research for the corresponding browse_* view types.
 */

import type { ViewModel, BrowseIndexData } from "../view-models";
import { getEntityIndex, getProjectIndex, getResearchProjects } from "../vault-reader";
import { uid } from "./shared";

export async function buildBrowseIndex(
  indexType: "entities" | "projects" | "research"
): Promise<ViewModel> {
  const [entityFiles, projectFiles, researchDirs] = await Promise.all([
    getEntityIndex(),
    getProjectIndex(),
    getResearchProjects(),
  ]);

  const titles: Record<string, string> = {
    entities: "Entities",
    projects: "Projects",
    research: "Research Projects",
  };

  let items: import("../view-models").IndexEntry[] = [];
  let researchItems: import("../view-models").ResearchProject[] | undefined;

  switch (indexType) {
    case "entities":
      items = entityFiles;
      break;
    case "projects":
      items = projectFiles;
      break;
    case "research":
      researchItems = researchDirs;
      items = researchDirs.map((d) => ({
        name: d.name,
        path: `${d.dir}/executive-summary.md`,
      }));
      break;
  }

  const data: import("../view-models").BrowseIndexData = {
    indexType,
    items,
    researchItems,
  };

  return {
    type: indexType === "entities" ? "browse_entities" : indexType === "projects" ? "browse_projects" : "browse_research",
    viewId: uid("view_browse"),
    title: titles[indexType],
    layout: "stack",
    data,
    sources: [],
    actions: [],
    meta: { confidence: 0.95, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: items.length },
  };
}

