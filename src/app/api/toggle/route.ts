/**
 * POST /api/toggle — flips a markdown checkbox at a given file + line.
 */
import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "@/lib/vault-reader";

/**
 * `POST /api/toggle` — flip a markdown checkbox in a vault file.
 *
 * Body: `{ path, lineIndex, checked }`. Rewrites the line in place
 * (`- [ ]` ↔ `- [x]`) and persists. Status: 200 on success, 400 when
 * the body is invalid or the line is out of range, 404 when the file
 * doesn't exist, 409 when no vault is connected, 500 otherwise.
 */
export async function POST(request: NextRequest) {
  try {
    const { path: relPath, lineIndex, checked } = await request.json();

    if (!relPath || typeof lineIndex !== "number") {
      return NextResponse.json({ error: "path and lineIndex required" }, { status: 400 });
    }

    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json({ error: "No vault connected" }, { status: 409 });
    }
    const absPath = join(vaultRoot, relPath);
    let content: string;

    try {
      content = await readFile(absPath, "utf-8");
    } catch {
      return NextResponse.json({ error: "File not found", path: relPath }, { status: 404 });
    }

    const lines = content.split("\n");
    const line = lines[lineIndex];

    if (!line) {
      return NextResponse.json({ error: "Line index out of range" }, { status: 400 });
    }

    if (checked) {
      // Change - [ ] to - [x]
      lines[lineIndex] = line.replace(/- \[ \]/, "- [x]");
    } else {
      // Change - [x] to - [ ]
      lines[lineIndex] = line.replace(/- \[x\]/i, "- [ ]");
    }

    await writeFile(absPath, lines.join("\n"), "utf-8");

    return NextResponse.json({
      success: true,
      path: relPath,
      lineIndex,
      checked,
      line: lines[lineIndex],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to toggle checkbox", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}