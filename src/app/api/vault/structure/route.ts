import { NextResponse } from "next/server";
import {
  getEntityIndex,
  getProjectIndex,
  getResearchProjects,
  getVaultPath,
} from "@/lib/vault-reader";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

export async function GET() {
  try {
    const vaultPath = getVaultPath();
    if (!vaultPath || !existsSync(vaultPath)) {
      return NextResponse.json({ sections: [] });
    }

    const [entities, projects, research] = await Promise.all([
      getEntityIndex().catch(() => []),
      getProjectIndex().catch(() => []),
      getResearchProjects().catch(() => []),
    ]);

    // Helper: list .md files in a vault directory, skip hub files
    function listMdFiles(dir: string, skipNames: string[] = []): { name: string; path: string }[] {
      const absDir = join(vaultPath, dir);
      try {
        if (!existsSync(absDir)) return [];
        return readdirSync(absDir)
          .filter((f: string) => f.endsWith(".md") && !skipNames.includes(f.replace(".md", "")))
          .map((f: string) => ({
            name: f.replace(".md", "").replace(/-/g, " "),
            path: dir + "/" + f,
          }));
      } catch {
        return [];
      }
    }

    const allSections = [
      {
        key: "work",
        label: "Work",
        items: [
          { name: "Open tasks", path: "wiki/work/open.md" },
          { name: "Waiting for", path: "wiki/work/waiting-for.md" },
          { name: "Work log", path: "wiki/work/work.md" },
          { name: "Workflow", path: "wiki/work/workflow.md" },
        ],
      },
      {
        key: "system",
        label: "System",
        items: listMdFiles("wiki/system", ["system"]),
      },
      {
        key: "entities",
        label: "Entities",
        items: entities.map((e: any) => ({ name: e.name, path: e.path, type: e.type })),
      },
      {
        key: "projects",
        label: "Projects",
        items: projects.map((p: any) => ({ name: p.name, path: p.path })),
      },
      {
        key: "research",
        label: "Research",
        items: research.map((r: any) => ({ name: r.name, path: r.dir })),
      },
      {
        key: "knowledge",
        label: "Knowledge",
        items: listMdFiles("wiki/knowledge", ["knowledge"]).filter(
          (item) => !item.path.includes("/research/")
        ),
      },
      {
        key: "journal",
        label: "Journal",
        items: listMdFiles("wiki/journal", ["journal", "brain-log"])
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, 15),
      },
      {
        key: "memory",
        label: "Memory",
        items: listMdFiles("wiki/memory", ["memory"]),
      },
    ];

    // Filter out empty sections
    const sections = allSections.filter((s) => s.items && s.items.length > 0);

    return NextResponse.json({ sections });
  } catch (error) {
    console.error("Vault structure API error:", error);
    return NextResponse.json(
      { error: "Failed to load vault structure", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}