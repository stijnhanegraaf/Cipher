/**
 * POST /api/daily — create-or-open today's daily note.
 *
 * Create-or-open, NEVER clobbers. Two-layer safety:
 *   1. Pre-check via readVaultFile: if the file exists, return 200 open
 *      and touch NOTHING on disk (fast path).
 *   2. Atomic exclusive create: writeFile(..., { flag: "wx" }) — the OS
 *      rejects the write with EEXIST if the file appeared between steps 1
 *      and 2 (TOCTOU-safe). On EEXIST → 200 open, never overwrite.
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import { getVaultPath, getVaultLayout, readVaultFile } from "@/lib/vault-reader";
import { safeJoin } from "@/lib/fs/safe-join";
import { invalidateAfterWrite } from "@/lib/cache/write-invalidation";
import { parseDateParam, dailyNotePath, defaultTemplate } from "@/lib/daily-note";

export async function POST(request: NextRequest) {
  try {
    // 1. Vault must be connected.
    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json({ error: "No vault connected" }, { status: 409 });
    }

    // 2. Parse the client's local date from the request body.
    //    Falls back to server's current date when body.date is absent.
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // Malformed / empty body — treat as no date provided.
    }

    let date: Date;
    if (body.date !== undefined) {
      const parsed = parseDateParam(body.date);
      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid date — expected YYYY-MM-DD" },
          { status: 400 }
        );
      }
      date = parsed;
    } else {
      date = new Date();
    }

    // 3. Detect vault layout — need a journalDir.
    const layout = getVaultLayout();
    if (!layout?.journalDir) {
      return NextResponse.json(
        {
          error: "No journal folder",
          suggestion:
            "Create a folder named 'journal', 'daily', or 'daily-notes' in your vault, or add a .cipher/layout.json override.",
        },
        { status: 422 }
      );
    }

    // 4. Build the vault-relative path.
    const relPath = dailyNotePath(layout.journalDir, date);

    // 5. Guard against path traversal.
    const absPath = safeJoin(vaultRoot, relPath);
    if (!absPath) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // 6. Pre-check (fast open path): if the file already exists, open it
    //    without touching disk.
    const existing = await readVaultFile(relPath);
    if (existing) {
      return NextResponse.json({ path: relPath, created: false }, { status: 200 });
    }

    // 7. Ensure the journal directory exists (handles nested paths like wiki/journal).
    await mkdir(dirname(absPath), { recursive: true });

    // 8. Atomic exclusive create — fails with EEXIST if another process
    //    wrote the file between steps 6 and 8 (TOCTOU-safe).
    try {
      await writeFile(absPath, defaultTemplate(date), { encoding: "utf-8", flag: "wx" });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "EEXIST") {
        // Lost the race — open the existing file, do NOT clobber.
        return NextResponse.json({ path: relPath, created: false }, { status: 200 });
      }
      throw e;
    }

    // 9. Bust derived caches (tree, graph, health, tags).
    invalidateAfterWrite();

    return NextResponse.json({ path: relPath, created: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to create daily note",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
