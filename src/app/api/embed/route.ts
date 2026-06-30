/**
 * GET /api/embed — resolve a note embed and return the extracted section.
 *
 * Query parameters:
 *   path   — raw wiki-link target (required; no anchor).
 *   anchor — heading text or block id (optional; block ids should NOT include
 *             the leading `^` — pass `block=1` to indicate block mode).
 *   block  — "1" when anchor is a block id (default "0").
 *   depth  — current nesting depth from the client (default 0); used as a
 *             server-side backstop to refuse pathological recursion.
 *
 * Responses:
 *   200  { resolvedPath, body, anchorType }
 *   400  missing/invalid `path`, or path escapes vault
 *   404  { error: "note-not-found" | "section-not-found", target, anchor? }
 *   409  { error: "depth-exceeded", depth }  (no vault connected OR depth cap)
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveLink, readVaultFile, getVaultPath } from "@/lib/vault-reader";
import { safeJoin } from "@/lib/fs/safe-join";
import { extractSection } from "@/lib/markdown/anchors";
import { MAX_EMBED_DEPTH } from "@/lib/markdown/embed-guard";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawPath = searchParams.get("path");
    const anchor = searchParams.get("anchor") ?? "";
    const isBlock = searchParams.get("block") === "1";
    const depth = parseInt(searchParams.get("depth") ?? "0", 10);

    // ── Validate required param ────────────────────────────────────────
    if (!rawPath) {
      return NextResponse.json(
        { error: "Missing required query parameter: path" },
        { status: 400 },
      );
    }

    // ── Server-side depth backstop ─────────────────────────────────────
    if (depth >= MAX_EMBED_DEPTH) {
      return NextResponse.json(
        { error: "depth-exceeded", depth },
        { status: 409 },
      );
    }

    // ── Vault connection check ─────────────────────────────────────────
    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json(
        { error: "No vault connected" },
        { status: 409 },
      );
    }

    // ── Path traversal guard (safeJoin before resolveLink) ─────────────
    // Strip any leading slashes and attempt a containment check. We only
    // need to reject obvious `..` traversal at this stage; resolveLink
    // handles the actual file lookup inside the vault.
    const sanitised = rawPath.replace(/^\/+/, "");
    const absCheck = safeJoin(vaultRoot, sanitised.replace(/#.*$/, ""));
    if (!absCheck) {
      return NextResponse.json(
        { error: "Path escapes vault", target: rawPath },
        { status: 400 },
      );
    }

    // ── Resolve wiki-link target ───────────────────────────────────────
    // resolveLink preserves `#anchor` on the returned path, but we want
    // to supply anchor separately, so pass the bare path (no anchor).
    const resolved = await resolveLink(sanitised.replace(/#.*$/, ""));
    if (!resolved) {
      return NextResponse.json(
        { error: "note-not-found", target: rawPath },
        { status: 404 },
      );
    }

    // Strip any anchor that resolveLink may have appended.
    const resolvedPath = resolved.replace(/#.*$/, "");

    // ── Read vault file ────────────────────────────────────────────────
    const file = await readVaultFile(resolvedPath);
    if (!file) {
      return NextResponse.json(
        { error: "note-not-found", target: rawPath },
        { status: 404 },
      );
    }

    // ── Extract section ────────────────────────────────────────────────
    const body = extractSection(file.content, anchor, isBlock);

    if (anchor && body === "") {
      return NextResponse.json(
        { error: "section-not-found", target: rawPath, anchor },
        { status: 404 },
      );
    }

    const anchorType: "whole" | "heading" | "block" = anchor === ""
      ? "whole"
      : isBlock
        ? "block"
        : "heading";

    return NextResponse.json({ resolvedPath, body, anchorType });
  } catch (err) {
    log.error("embed", "API error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Embed failed" },
      { status: 500 },
    );
  }
}
