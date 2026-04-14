import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";

// POST /api/vault — set vault path in .env.local
export async function POST(request: NextRequest) {
  try {
    const { path: vaultPath } = await request.json();

    if (!vaultPath || typeof vaultPath !== "string") {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    // Write VAULT_PATH to .env.local
    const envPath = join(process.cwd(), ".env.local");
    let envContent = "";

    try {
      envContent = await readFile(envPath, "utf-8");
    } catch {
      // File doesn't exist yet
    }

    // Replace or add VAULT_PATH line
    const lines = envContent.split("\n").filter((l) => !l.startsWith("VAULT_PATH="));
    lines.push(`VAULT_PATH=${vaultPath}`);

    await writeFile(envPath, lines.join("\n") + "\n");

    return NextResponse.json({
      success: true,
      path: vaultPath,
      note: "Restart the dev server for changes to take effect",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save vault path", detail: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}