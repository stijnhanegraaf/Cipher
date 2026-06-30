/**
 * GET /api/canvas?path= — reads a vault .canvas file and returns its
 * parsed ParsedCanvas structure.
 *
 * Mirrors /api/file: getVaultPath → safeJoin (400 on missing/escape)
 * → readFile → parseCanvas → return JSON. 404 on ENOENT.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getVaultPath } from "@/lib/vault-reader";
import { safeJoin } from "@/lib/fs/safe-join";
import { parseCanvas } from "@/lib/canvas/parse-canvas";
import { log } from "@/lib/log";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'path' query parameter" },
        { status: 400 },
      );
    }

    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json({ error: "No vault connected" }, { status: 409 });
    }

    const absPath = safeJoin(vaultRoot, path);
    if (!absPath) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    let raw: string;
    try {
      raw = await readFile(absPath, "utf-8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") {
        return NextResponse.json({ error: "File not found", path }, { status: 404 });
      }
      throw err;
    }

    const parsed = parseCanvas(raw);
    return NextResponse.json(parsed);
  } catch (error) {
    log.error("canvas", "GET error", error);
    return NextResponse.json(
      { error: "Failed to read canvas", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
