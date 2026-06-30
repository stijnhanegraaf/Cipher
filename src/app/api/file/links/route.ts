/**
 * GET /api/file/links?path=<vault-path>
 *
 * Returns the outgoing wiki-links for a single vault file, tagged as resolved
 * or broken. Broken links (targets that don't exist in the vault) are the
 * key differentiator from the graph-derived backlinks API.
 *
 * Status: 200 on success, 400 when path param is missing,
 *         404 when the file doesn't exist, 409 when no vault is connected,
 *         500 on unexpected failure.
 *
 * Mirrors the read/resolve/status pattern of /api/file/route.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { readVaultFile, resolveLink, getVaultPath, extractLinks } from "@/lib/vault-reader";
import { computeOutgoingLinks, dropSelfLinks } from "@/lib/links/outgoing";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  try {
    if (!getVaultPath()) {
      return NextResponse.json(
        { error: "No vault connected", links: [] },
        { status: 409 },
      );
    }

    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'path' query parameter", links: [] },
        { status: 400 },
      );
    }

    // Read the file; fall back to wiki-link resolution like /api/file does.
    let file = await readVaultFile(path);
    if (!file) {
      const resolvedPath = await resolveLink(path);
      if (resolvedPath) {
        file = await readVaultFile(resolvedPath);
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: "File not found", path, links: [] },
        { status: 404 },
      );
    }

    const rawLinks = extractLinks(file.content);
    const allOutgoing = await computeOutgoingLinks(rawLinks, resolveLink);
    const links = dropSelfLinks(allOutgoing, file.path);

    return NextResponse.json({ path: file.path, links });
  } catch (error) {
    log.error("file-links", "GET error", error);
    return NextResponse.json(
      {
        error: "Failed to get outgoing links",
        detail: error instanceof Error ? error.message : String(error),
        links: [],
      },
      { status: 500 },
    );
  }
}
