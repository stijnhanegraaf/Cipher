/**
 * GET /api/vault/backlinks?path=<vault-path> — returns inbound backlinks
 * with context snippets for the given file.
 *
 * The `path` param is first resolved via `resolveLink` so wiki-link bodies
 * work too (mirrors the pattern in /api/file/route.ts:44).
 *
 * Modeled on /api/vault/graph/route.ts (same 409/500 shape).
 */
import { NextRequest, NextResponse } from "next/server";
import { getVaultPath, resolveLink } from "@/lib/vault-reader";
import { getBacklinks } from "@/lib/vault-graph";
import { log } from "@/lib/log";

// ─── GET /api/vault/backlinks ─────────────────────────────────────────────────

/**
 * `GET /api/vault/backlinks?path=<vault-path>` — inbound linked-mentions
 * for the given file, each with a context snippet from the source note.
 *
 * Response: `{ backlinks: Backlink[] }`.
 * Status: 200 on success, 409 when no vault is connected, 500 on failure.
 */
export async function GET(request: NextRequest) {
  try {
    if (!getVaultPath()) {
      return NextResponse.json(
        { error: "No vault connected", backlinks: [] },
        { status: 409 }
      );
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'path' query parameter", backlinks: [] },
        { status: 400 }
      );
    }

    // Resolve via resolveLink first so wiki-link bodies also work
    const resolvedPath = (await resolveLink(path)) ?? path;

    const backlinks = await getBacklinks(resolvedPath);
    return NextResponse.json({ backlinks });
  } catch (error) {
    log.error("vault-backlinks", "API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get backlinks" },
      { status: 500 }
    );
  }
}
