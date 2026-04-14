import { NextRequest, NextResponse } from "next/server";
import { detectIntent } from "@/lib/intent-detector";
import { buildView } from "@/lib/view-builder";
import { getEntityIndex, getProjectIndex, getResearchProjects } from "@/lib/vault-reader";
import type { ResponseEnvelope, Intent, ViewType } from "@/lib/view-models";

// ─── GET /api/query — vault metadata ──────────────────────────────────

export async function GET() {
  try {
    const [entities, projects, research] = await Promise.all([
      getEntityIndex(),
      getProjectIndex(),
      getResearchProjects(),
    ]);

    const { getVaultPath } = await import("@/lib/vault-reader");
    const vaultPath = getVaultPath();
    const { existsSync } = require('fs');
    const vaultConnected = existsSync(vaultPath);

    return NextResponse.json({
      version: "v1",
      vault: {
        path: vaultPath,
        connected: vaultConnected,
      },
      entities,
      projects,
      research,
    });
  } catch (error) {
    console.error("Query API GET error:", error);
    return NextResponse.json(
      { error: "Failed to load vault metadata", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ─── POST /api/query — process a query ─────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, entityName } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        {
          version: "v1",
          request: { id: `req_err_${Date.now()}`, intent: "search_results" as Intent, mode: "structured" },
          response: {
            title: "Error",
            summary: "Please provide a query string.",
            views: [],
          },
        } satisfies ResponseEnvelope,
        { status: 400 }
      );
    }

    // Detect intent from query
    const intentResult = await detectIntent(query);

    // If entityName is provided and intent would be entity_overview, use that entity
    const effectiveViewType: ViewType =
      entityName && intentResult.viewType === "entity_overview"
        ? "entity_overview"
        : intentResult.viewType;

    // Build the view from real vault data, passing entityName through
    const view = await buildView(effectiveViewType, query, entityName);

    // Build the response envelope
    const response: ResponseEnvelope = {
      version: "v1",
      request: {
        id: `req_${Date.now()}`,
        intent: intentResult.intent,
        mode: intentResult.intent === "search_results" ? "structured" : "mixed",
        query,
        entityName,
      },
      response: {
        title: view.title || "Results",
        summary: generateSummary(view, effectiveViewType),
        text: intentResult.intent !== "search_results" ? generateText(view, effectiveViewType) : undefined,
        views: [view],
        sources: view.sources,
        actions: view.actions,
        meta: view.meta,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Query API error:", error);
    const detail = error instanceof Error ? error.message : "Something went wrong processing your query.";
    return NextResponse.json(
      {
        version: "v1",
        request: { id: `req_err_${Date.now()}`, intent: "search_results" as Intent, mode: "structured" },
        response: {
          title: "Error",
          summary: "Something went wrong processing your query.",
          views: [],
        },
      } satisfies ResponseEnvelope,
      { status: 500 }
    );
  }
}

function generateSummary(view: import("@/lib/view-models").ViewModel, viewType: ViewType): string {
  const data = view.data;
  switch (viewType) {
    case "current_work": {
      const d = data as import("@/lib/view-models").CurrentWorkData;
      const total = d.groups.reduce((s, g) => s + g.items.length, 0);
      const open = d.groups.reduce((s, g) => s + g.items.filter((i) => i.status === "open").length, 0);
      const done = d.groups.reduce((s, g) => s + g.items.filter((i) => i.status === "done").length, 0);
      return `${total} tasks across ${d.groups.length} areas. ${open} open, ${done} completed.`;
    }
    case "entity_overview": {
      const d = data as import("@/lib/view-models").EntityOverviewData;
      return d.summary.slice(0, 150) + (d.summary.length > 150 ? "…" : "");
    }
    case "system_status": {
      const d = data as import("@/lib/view-models").SystemStatusData;
      return `System status: ${d.overall.label}. ${d.checks.length} checks.`;
    }
    case "timeline_synthesis": {
      const d = data as import("@/lib/view-models").TimelineSynthesisData;
      return `${d.themes.length} themes in ${d.range.label}.`;
    }
    case "browse_entities":
    case "browse_projects":
    case "browse_research": {
      const d = data as import("@/lib/view-models").BrowseIndexData;
      return `${d.items.length} ${d.indexType} found.`;
    }
    case "topic_overview": {
      const d = data as import("@/lib/view-models").TopicOverviewData;
      return d.summary.slice(0, 150) + (d.summary.length > 150 ? "…" : "");
    }
    case "search_results": {
      const d = data as import("@/lib/view-models").SearchResultsData;
      return `Found ${d.results.length} results for "${d.query}".`;
    }
    default:
      return "Results from your vault.";
  }
}

function generateText(view: import("@/lib/view-models").ViewModel, viewType: ViewType): string | undefined {
  const data = view.data;
  switch (viewType) {
    case "current_work": {
      const d = data as import("@/lib/view-models").CurrentWorkData;
      const areas = d.groups.map((g) => g.label).join(", ");
      return `Here's your current work landscape. Active areas: ${areas}.`;
    }
    case "system_status": {
      const d = data as import("@/lib/view-models").SystemStatusData;
      const warnCount = d.checks.filter((c) => c.status === "warn").length;
      return warnCount > 0
        ? `System is mostly healthy with ${warnCount} area(s) needing attention.`
        : "All systems are running smoothly.";
    }
    case "timeline_synthesis": {
      const d = data as import("@/lib/view-models").TimelineSynthesisData;
      const themeNames = d.themes.map((t) => t.label).join(", ");
      return `Themes this period: ${themeNames}.`;
    }
    default:
      return undefined;
  }
}