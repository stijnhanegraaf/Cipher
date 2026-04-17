import { NextRequest, NextResponse } from "next/server";
import { existsSync, statSync } from "fs";
import { basename } from "path";
import { getVaultPath, setVaultPath } from "@/lib/vault-reader";

/**
 * POST /api/vault — hot-swap the active vault.
 * No file writes, no server restart — updates the in-memory current vault.
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

/** GET /api/vault — current active vault and connection state. */
export async function GET() {
  const activePath = getVaultPath();
  const connected = activePath ? existsSync(activePath) : false;

  return NextResponse.json({
    activePath: activePath || "",
    name: activePath ? basename(activePath) : "",
    connected,
  });
}

/** DELETE /api/vault — disconnect without swapping to another. */
export async function DELETE() {
  setVaultPath(null);
  return NextResponse.json({ success: true });
}
