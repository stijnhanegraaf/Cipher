/**
 * GET /api/resolve — resolves a wiki-link target to its vault path.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveLink, getVaultPath, readVaultFile } from "@/lib/vault-reader";
import { parseWikiTarget } from "@/lib/markdown/wikilink";
import { validateAnchor, type AnchorValidation } from "@/lib/markdown/anchors";
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
 * Response: `{ input, resolved: string | null, anchor: AnchorInfo }`. Status codes:
 * 200 on success (including `resolved: null` when the link doesn't match),
 * 400 when `path` is missing, 409 when no vault is connected, 500 on
 * unexpected failure.
 *
 * `anchor` shape: `{ kind: "none"|"block"|"heading"; valid: boolean; value: string }`.
 * When there is no anchor in the input, kind is "none" and valid is true.
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

    // ── Anchor validation ──────────────────────────────────────────────
    // Parse the raw anchor from the input (parseWikiTarget handles "^block" vs heading).
    const { anchor: rawAnchor } = parseWikiTarget(input);

    let anchorInfo: AnchorValidation;
    if (!rawAnchor) {
      anchorInfo = { kind: "none", valid: true, value: "" };
    } else if (resolved) {
      // Strip the trailing "#anchor" that resolveLink appends to the resolved path.
      const resolvedPath = resolved.split("#")[0];
      const file = await readVaultFile(resolvedPath);
      anchorInfo = file
        ? validateAnchor(file.content, rawAnchor)
        : { kind: rawAnchor.startsWith("^") ? "block" : "heading", valid: false, value: rawAnchor.startsWith("^") ? rawAnchor.slice(1) : rawAnchor };
    } else {
      // Unresolved file — anchor cannot be valid.
      anchorInfo = { kind: rawAnchor.startsWith("^") ? "block" : "heading", valid: false, value: rawAnchor.startsWith("^") ? rawAnchor.slice(1) : rawAnchor };
    }

    return NextResponse.json({ input, resolved, anchor: anchorInfo });
  } catch (error) {
    log.error("resolve", "API error", error);
    return NextResponse.json(
      { resolved: null, error: error instanceof Error ? error.message : "Resolve failed" },
      { status: 500 }
    );
  }
}
