/**
 * Builds the "Topic Overview" ViewModel for a project or research topic —
 * pulls executive summary + deep dive + open questions, aggregates.
 */

import type { ViewModel, TopicOverviewData, LinkRef, TimelineItem, SourceRef, IndexEntry, ResearchProject } from "../view-models";
import {
  readVaultFile,
  getSection,
  extractLinks,
  parseCheckboxes,
  getProjectIndex,
  getResearchProjects,
} from "../vault-reader";
import { uid, stripLinks, sourceRef, normalizeLinks, nameFromPath } from "./shared";

export async function buildTopicOverview(query?: string): Promise<ViewModel> {
  const q = (query || "").toLowerCase();

  // Load indexes for dynamic matching
  const [projectFiles, researchDirs] = await Promise.all([
    getProjectIndex(),
    getResearchProjects(),
  ]);

  const projectNames = projectFiles.map(nameFromPath).filter((n) => n && n !== "projects" && n !== "ideas");
  const researchNames = researchDirs.map(nameFromPath);

  let topicTitle = "";
  let summary = "";
  let primaryFile = "";
  const additionalFiles: string[] = [];
  const keyQuestions: string[] = [];
  const nextSteps: string[] = [];
  const relatedNotes: LinkRef[] = [];
  const timeline: TimelineItem[] = [];
  let currentState: string | undefined;
  let whyNow: string | undefined;

  // ─── Try matching against research projects ────────────────────────
  const researchMatch = researchDirs.find((d) => {
    const name = nameFromPath(d);
    return q.includes(name.replace(/-/g, " ")) || name.replace(/-/g, " ").includes(q) || q.includes(name);
  });

  if (researchMatch) {
    const researchName = nameFromPath(researchMatch);
    const execSummary = await readVaultFile(`${researchMatch.dir}/executive-summary.md`);
    const deepDive = await readVaultFile(`${researchMatch.dir}/deep-dive.md`);
    const openQuestions = await readVaultFile(`${researchMatch.dir}/open-questions.md`);

    primaryFile = `${researchMatch.dir}/executive-summary.md`;
    topicTitle = researchName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " Research";
    summary = "Deep research analysis with competitive positioning and outlook.";

    if (execSummary) {
      // Extract "The Answer" or "Key Findings" as summary
      const answerSection = getSection(execSummary, "The Answer") || getSection(execSummary, "Key Findings");
      if (answerSection) {
        const firstMeaningful = answerSection.body.split("\n")
          .find((l) => l.trim().length > 20 && !l.trim().startsWith("#") && !l.trim().startsWith(">"));
        if (firstMeaningful) summary = stripLinks(firstMeaningful.trim());
      }

      // Extract key findings as key questions
      const keySection = getSection(execSummary, "Key Findings") || getSection(execSummary, "Critical Tension");
      if (keySection) {
        for (const line of keySection.body.split("\n")) {
          if (line.trim().startsWith("- **") || line.trim().startsWith("- ")) {
            const text = line.trim().replace(/^-\s*/, "").replace(/\*\*/g, "");
            if (text.length > 15 && keyQuestions.length < 8) keyQuestions.push(text);
          }
        }
      }

      // Extract links
      const links = extractLinks(execSummary.content);
      for (const link of links.slice(0, 5)) {
        relatedNotes.push({ label: link.label, path: link.path, kind: "research" });
      }
    }

    if (openQuestions) {
      const cbItems = parseCheckboxes(openQuestions.content);
      for (const cb of cbItems) {
        if (!cb.checked && keyQuestions.length < 8) {
          keyQuestions.push(stripLinks(cb.text));
        }
      }
    }

    // Add research file references
    relatedNotes.push(
      { label: "Executive Summary", path: `${researchMatch.dir}/executive-summary.md`, kind: "research" },
      { label: "Deep Dive", path: `${researchMatch.dir}/deep-dive.md`, kind: "research" },
      { label: "Key Players", path: `${researchMatch.dir}/key-players.md`, kind: "research" },
    );

    if (deepDive) additionalFiles.push(`${researchMatch.dir}/deep-dive.md`);
    if (openQuestions) additionalFiles.push(`${researchMatch.dir}/open-questions.md`);

  } else {
    // ─── Try matching against project files ──────────────────────────
    const projectMatch = projectFiles.find((f) => {
      const name = nameFromPath(f);
      return q.includes(name) || name.includes(q) || q.split(/\s+/).every((word) => name.includes(word));
    });

    if (projectMatch) {
      const projectFile = await readVaultFile(projectMatch.path);
      primaryFile = projectMatch.path;
      topicTitle = projectFile?.sections[0]?.heading ||
        nameFromPath(projectMatch).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

      if (projectFile) {
        // Extract summary from "Idea" or first section
        const ideaSection = getSection(projectFile, "Idea") || getSection(projectFile, "Summary") || projectFile.sections[1];
        if (ideaSection) {
          const firstLine = ideaSection.body.split("\n")
            .find((l) => l.trim().length > 20 && !l.trim().startsWith("#"));
          if (firstLine) summary = stripLinks(firstLine.trim());
        }

        // Extract current state
        const currentStateSection = getSection(projectFile, "Current state") || getSection(projectFile, "Current research");
        if (currentStateSection) {
          currentState = currentStateSection.body.split("\n")
            .filter((l) => l.trim().length > 5)
            .slice(0, 3)
            .map((l) => l.trim().replace(/^[-*]\s*/, ""))
            .join("; ");
        }

        // Extract key questions
        const questionsSection = getSection(projectFile, "Key questions") || getSection(projectFile, "Open questions");
        if (questionsSection) {
          const cbItems = parseCheckboxes(questionsSection.body);
          for (const cb of cbItems) {
            if (!cb.checked && keyQuestions.length < 5) keyQuestions.push(stripLinks(cb.text));
          }
        }

        // Extract next steps
        const nextSection = getSection(projectFile, "Next") || getSection(projectFile, "Next steps") || getSection(projectFile, "What I would do next");
        if (nextSection) {
          for (const line of nextSection.body.split("\n")) {
            if (line.trim().startsWith("- ") && nextSteps.length < 5) {
              nextSteps.push(stripLinks(line.trim().replace(/^-\s*/, "")));
            }
          }
        }

        // Extract related links
        const links = extractLinks(projectFile.content);
        for (const link of links.slice(0, 8)) {
          relatedNotes.push({ label: link.label, path: link.path, kind: "topic" });
        }

        // Extract "why now" from product thesis
        const thesisSection = getSection(projectFile, "Product thesis") || getSection(projectFile, "Best product principles");
        if (thesisSection) {
          whyNow = thesisSection.body.split("\n")
            .find((l) => l.trim().length > 20 && !l.trim().startsWith("#"));
          if (whyNow) whyNow = stripLinks(whyNow.trim());
        }
      }
    } else {
      topicTitle = "Topic Not Found";
      summary = `No project or research matching "${query}". Try searching instead.`;
      primaryFile = "";
    }
  }

  // Normalize links so every pill in the UI clicks through.
  const normalizedRelated = await normalizeLinks(relatedNotes);

  const data: TopicOverviewData = {
    topicType: researchMatch ? "research" : "project",
    currentState,
    summary: summary || "Project details from the vault.",
    whyNow,
    keyQuestions: keyQuestions.length > 0 ? keyQuestions.slice(0, 6) : undefined,
    nextSteps: nextSteps.length > 0 ? nextSteps.slice(0, 5) : undefined,
    relatedNotes: normalizedRelated.length > 0 ? normalizedRelated : undefined,
    relatedEntities: normalizedRelated
      .filter((n) => n.kind === "entity" || n.path.includes("entities"))
      .slice(0, 5),
    timeline: timeline.length > 0 ? timeline : undefined,
  };

  const sources: SourceRef[] = [];
  if (primaryFile) {
    sources.push(sourceRef(
      nameFromPath(primaryFile).replace(/-/g, " ") || primaryFile,
      primaryFile,
      "topic"
    ));
  }
  for (const f of additionalFiles) {
    sources.push(sourceRef(
      nameFromPath(f).replace(/-/g, " ") || f,
      f,
      "topic"
    ));
  }

  return {
    type: "topic_overview",
    viewId: uid("view_topic"),
    title: topicTitle,
    layout: "stack",
    data,
    sources,
    actions: primaryFile ? [
      { id: uid("act"), type: "open_note", label: "Open in Obsidian", target: { path: primaryFile }, safety: "safe" },
    ] : undefined,
    sourceFile: primaryFile || undefined,
    meta: { confidence: primaryFile ? 0.88 : 0.3, freshness: "recent", generatedAt: new Date().toISOString(), primarySourceCount: sources.length },
  };
}

