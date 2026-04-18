/**
 * GET /api/resolve — resolves a wiki-link target to its vault path.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveLink, getVaultPath } from "@/lib/vault-reader";
import { log } from "@/lib/log";

// ─── GET /api/resolve?path=<any-link-input> ───────────────────────────
// Resolves a user-facing link reference (short name, wiki label, relative path)
// to an absolute vault-relative .md path. Returns { resolved: string | null }.
//
// The client uses this before opening DetailPage so clicking a broken wiki-link
// surfaces a friendly "not found" UI instead of a raw 404 fetch page.

/**
 * `GET /api/resolve?path=<link>` — resolve any wiki-link input to a
 * vault-relative `.md` path.
 *
 * Response: `{ input, resolved: string | null }`. Status codes:
 * 200 on success (including `resolved: null` when the link doesn't match),
 * 400 when `path` is missing, 409 when no vault is connected, 500 on
 * unexpected failure.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const input = searchParams.get("path");

    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'path' query parameter" },
        { status: 400 }
      );
    }

    if (!getVaultPath()) {
      return NextResponse.json({ resolved: null, error: "No vault connected" }, { status: 409 });
    }

    const resolved = await resolveLink(input);
    return NextResponse.json({ input, resolved });
  } catch (error) {
    log.error("resolve", "API error", error);
    return NextResponse.json(
      { resolved: null, error: error instanceof Error ? error.message : "Resolve failed" },
      { status: 500 }
    );
  }
}
