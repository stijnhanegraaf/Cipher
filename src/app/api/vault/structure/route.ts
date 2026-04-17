import { NextResponse } from "next/server";
import {
  getEntityIndex,
  getProjectIndex,
  getResearchProjects,
  getVaultLayout,
  getVaultPath,
} from "@/lib/vault-reader";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Returns the active vault's top-level structure for the drawer.
 * Sections are driven by the probed layout — only folders that actually exist
 * are included. Works for any Obsidian vault, not just the legacy wiki tree.
 */
export async function GET() {
  try {
    const vaultPath = getVaultPath();
    if (!vaultPath || !existsSync(vaultPath)) {
      return NextResponse.json({ sections: [] });
    }

    const layout = getVaultLayout();
    if (!layout) return NextResponse.json({ sections: [] });

    const [entities, projects, research] = await Promise.all([
      getEntityIndex().catch(() => []),
      getProjectIndex().catch(() => []),
      getResearchProjects().catch(() => []),
    ]);

    function listMdFiles(dir: string, skipNames: string[] = []): { name: string; path: string }[] {
      const absDir = join(vaultPath as string, dir);
      try {
        if (!existsSync(absDir)) return [];
        return readdirSync(absDir)
          .filter((f: string) => f.endsWith(".md") && !skipNames.includes(f.replace(".md", "")))
          .map((f: string) => ({
            name: f.replace(".md", "").replace(/-/g, " "),
            path: `${dir}/${f}`,
          }));
      } catch {
        return [];
      }
    }

    const sections: Array<{ key: string; label: string; items: Array<Record<string, unknown>> }> = [];

    if (layout.workDir) {
      sections.push({
        key: "work",
        label: "Work",
        items: listMdFiles(layout.workDir).slice(0, 20),
      });
    }
    if (layout.systemDir) {
      sections.push({
        key: "system",
        label: "System",
        items: listMdFiles(layout.systemDir),
      });
    }
    if (entities.length > 0) {
      sections.push({
        key: "entities",
        label: "Entities",
        items: entities.map((e: any) => ({ name: e.name, path: e.path, type: e.type })),
      });
    }
    if (projects.length > 0) {
      sections.push({
        key: "projects",
        label: "Projects",
        items: projects.map((p: any) => ({ name: p.name, path: p.path })),
      });
    }
    if (research.length > 0) {
      sections.push({
        key: "research",
        label: "Research",
        items: research.map((r: any) => ({ name: r.name, path: r.dir })),
      });
    }
    if (layout.journalDir) {
      sections.push({
        key: "journal",
        label: "Journal",
        items: listMdFiles(layout.journalDir)
          .sort((a, b) => b.name.localeCompare(a.name))
          .slice(0, 15),
      });
    }

    // Keep only non-empty sections.
    return NextResponse.json({ sections: sections.filter((s) => s.items.length > 0) });
  } catch (error) {
    console.error("Vault structure API error:", error);
    return NextResponse.json(
      { error: "Failed to load vault structure", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
