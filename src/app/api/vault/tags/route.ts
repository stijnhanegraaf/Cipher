/**
 * GET /api/vault/tags — tag index and per-tag note list.
 *
 * GET /api/vault/tags          → { tags: TagCount[] }
 * GET /api/vault/tags?tag=foo  → { tag: string; notes: TagEntry[] }
 *
 * Returns 409 when no vault is connected (with empty tag/notes shapes).
 */
import { NextRequest, NextResponse } from "next/server";
import { getVaultPath } from "@/lib/vault-reader";
import { collectTags, notesForTag } from "@/lib/vault-tags";
import { normalizeTag } from "@/lib/markdown/tags";
import { log } from "@/lib/log";

// ─── GET /api/vault/tags ─────────────────────────────────────────────────────

/**
 * `GET /api/vault/tags` — tag index for the active vault.
 * `GET /api/vault/tags?tag=<t>` — notes carrying that tag.
 *
 * Response shapes:
 *   - bare:   `{ tags: TagCount[] }`
 *   - ?tag=:  `{ tag: string; notes: TagEntry[] }`
 *
 * Status: 200 on success, 409 when no vault is connected, 500 on failure.
 */
export async function GET(request: NextRequest) {
  try {
    if (!getVaultPath()) {
      const { searchParams } = new URL(request.url);
      const tagParam = searchParams.get("tag");
      if (tagParam !== null) {
        return NextResponse.json(
          { error: "No vault connected", tag: normalizeTag(decodeURIComponent(tagParam)), notes: [] },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "No vault connected", tags: [] },
        { status: 409 }
      );
    }

    const { searchParams } = new URL(request.url);
    const tagParam = searchParams.get("tag");

    if (tagParam !== null) {
      // Single-tag lookup
      const decoded = decodeURIComponent(tagParam);
      const tag = normalizeTag(decoded);
      const notes = await notesForTag(tag);
      return NextResponse.json({ tag, notes });
    }

    // Index
    const tags = await collectTags();
    return NextResponse.json({ tags });
  } catch (error) {
    log.error("vault-tags", "API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tags" },
      { status: 500 }
    );
  }
}
