import { NextRequest, NextResponse } from "next/server";
import { readVaultFile, resolveLink, getVaultPath } from "@/lib/vault-reader";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

// ─── GET /api/file?path=wiki/work/open.md ─────────────────────────────
// Returns raw markdown content + parsed metadata for a vault file

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || typeof path !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'path' query parameter" },
        { status: 400 }
      );
    }

    // Try reading the file directly first
    let file = await readVaultFile(path);

    // If not found, try resolving as a wiki link (e.g., "open" → "wiki/work/open.md")
    if (!file) {
      const resolvedPath = await resolveLink(path);
      if (resolvedPath) {
        file = await readVaultFile(resolvedPath);
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: "File not found", path },
        { status: 404 }
      );
    }

    // Determine title: from frontmatter "title" key, or first heading, or filename
    let title: string;
    if (file.frontmatter.title && typeof file.frontmatter.title === "string") {
      title = file.frontmatter.title;
    } else if (file.sections.length > 0) {
      title = file.sections[0].heading;
    } else {
      title = path.split("/").pop()?.replace(/\.md$/, "") || path;
    }

    return NextResponse.json({
      path: file.path,
      title,
      frontmatter: file.frontmatter,
      content: file.content,
      sections: file.sections.map((s) => ({
        heading: s.heading,
        level: s.level,
        body: s.body,
      })),
    });
  } catch (error) {
    console.error("File API error:", error);
    return NextResponse.json(
      { error: "Failed to read file", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// ─── PUT /api/file ─────────────────────────────────────────────────────
// Write content back to a vault file
// Body: { path: string, content: string } or { path: string, lineIndex: number, newText: string }

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { path: relPath, content, lineIndex, newText } = body;

    if (!relPath || typeof relPath !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'path'" }, { status: 400 });
    }

    const vaultRoot = getVaultPath();
    if (!vaultRoot) {
      return NextResponse.json({ error: "No vault connected" }, { status: 409 });
    }
    const absPath = join(vaultRoot, relPath);

    if (content !== undefined && typeof content === "string") {
      // Full content write
      await writeFile(absPath, content, "utf-8");
      return NextResponse.json({ success: true, path: relPath });
    } else if (typeof lineIndex === "number" && typeof newText === "string") {
      // Line-level edit (for task item inline editing)
      let fileContent: string;
      try {
        fileContent = await readFile(absPath, "utf-8");
      } catch {
        return NextResponse.json({ error: "File not found", path: relPath }, { status: 404 });
      }
      const lines = fileContent.split("\n");
      if (lineIndex < 0 || lineIndex >= lines.length) {
        return NextResponse.json({ error: "Line index out of range" }, { status: 400 });
      }
      // Replace the task text portion of the line
      const line = lines[lineIndex];
      lines[lineIndex] = line.replace(/(- \[[ x]\] )(.+)/, `$1${newText}`);
      await writeFile(absPath, lines.join("\n"), "utf-8");
      return NextResponse.json({ success: true, path: relPath, lineIndex });
    } else {
      return NextResponse.json({ error: "Provide 'content' or 'lineIndex'+'newText'" }, { status: 400 });
    }
  } catch (error) {
    console.error("File PUT error:", error);
    return NextResponse.json(
      { error: "Failed to write file", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}