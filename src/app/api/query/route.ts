import { NextRequest, NextResponse } from "next/server";
import { detectIntent } from "@/lib/intent-detector";
import { buildView } from "@/lib/view-builder";
import type { ResponseEnvelope, Intent, ViewType } from "@/lib/view-models";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const query = body.query;

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
    const intentResult = detectIntent(query);

    // Build the view from real vault data
    const view = await buildView(intentResult.viewType, query);

    // Build the response envelope
    const response: ResponseEnvelope = {
      version: "v1",
      request: {
        id: `req_${Date.now()}`,
        intent: intentResult.intent,
        mode: intentResult.intent === "search_results" ? "structured" : "mixed",
        query,
      },
      response: {
        title: view.title || "Results",
        summary: generateSummary(view, intentResult.viewType),
        text: intentResult.intent !== "search_results" ? generateText(view, intentResult.viewType) : undefined,
        views: [view],
        sources: view.sources,
        actions: view.actions,
        meta: view.meta,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Query API error:", error);
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