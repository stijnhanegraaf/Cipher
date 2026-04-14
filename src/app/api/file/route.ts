import { NextRequest, NextResponse } from "next/server";
import { readVaultFile, resolveLink } from "@/lib/vault-reader";

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