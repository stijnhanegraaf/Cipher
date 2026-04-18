/**
 * GET /api/vault — returns the active vault path + meta.
 * POST /api/vault — sets a new vault path (hot-swap).
 * DELETE /api/vault — clears the active vault.
 */
import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "fs";
import { basename } from "path";
import { getVaultPath, setVaultPath } from "@/lib/vault-reader";

/**
 * `POST /api/vault` — hot-swap the active vault path.
 *
 * Body: `{ path }`. Expands leading `~` and validates the path exists
 * and is a directory before swapping. Clears in-memory caches
 * (layout / parsed files / basename index) so subsequent reads hit the
 * new vault. Status: 200 success, 400 when path missing / invalid,
 * 500 on unexpected failure.
 */
export async function POST(request: NextRequest) {
  try {
    const { path: rawPath } = await request.json();

    if (!rawPath || typeof rawPath !== "string") {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    const vaultPath = rawPath.trim().replace(/^~/, process.env.HOME || "~");

    if (!existsSync(vaultPath)) {
      return NextResponse.json({ error: "Path does not exist", path: vaultPath }, { status: 400 });
    }
    if (!statSync(vaultPath).isDirectory()) {
      return NextResponse.json({ error: "Path is not a directory", path: vaultPath }, { status: 400 });
    }

    setVaultPath(vaultPath);

    return NextResponse.json({
      success: true,
      path: vaultPath,
      name: basename(vaultPath),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to switch vault", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * `GET /api/vault` — current active vault path and connection state.
 *
 * Response: `{ activePath, name, connected }`. `connected` reflects a
 * live `existsSync` check so stale paths report false.
 */
export async function GET() {
  const activePath = getVaultPath();
  const connected = activePath ? existsSync(activePath) : false;

  return NextResponse.json({
    activePath: activePath || "",
    name: activePath ? basename(activePath) : "",
    connected,
  });
}

/**
 * `DELETE /api/vault` — disconnect the active vault without swapping to
 * another. Clears all in-memory caches; reads after this return null
 * until a new `POST /api/vault` call connects a vault. Always 200.
 */
export async function DELETE() {
  setVaultPath(null);
  return NextResponse.json({ success: true });
}
