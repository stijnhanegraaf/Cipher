/** GET /api/browse/hints — vault-derived suggestion chips for the chat empty state. */
import { NextResponse } from "next/server";
import { getVaultPath } from "@/lib/vault-reader";
import { getEntityIndex, getProjectIndex } from "@/lib/vault-indexes";
import { buildHints } from "@/lib/builders/hints";
import { log } from "@/lib/log";

export async function GET() {
  try {
    if (!getVaultPath()) {
      return NextResponse.json({ entities: [], projects: [] }, { status: 409 });
    }
    const [entities, projects] = await Promise.all([getEntityIndex(), getProjectIndex()]);
    // getEntityIndex/getProjectIndex both return IndexEntry[] (view-models.ts),
    // where `name: string` is required.
    return NextResponse.json(
      buildHints(entities.map((e) => e.name), projects.map((p) => p.name))
    );
  } catch (error) {
    log.error("hints", "API error", error);
    return NextResponse.json({ entities: [], projects: [] }, { status: 500 });
  }
}
