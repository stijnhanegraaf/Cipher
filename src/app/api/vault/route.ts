import { NextRequest, NextResponse } from "next/server";
import { writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";

// POST /api/vault — set vault path
export async function POST(request: NextRequest) {
  try {
    const { path: vaultPath } = await request.json();

    if (!vaultPath || typeof vaultPath !== "string") {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    // Validate the path exists
    const { existsSync } = require("fs");
    if (!existsSync(vaultPath)) {
      return NextResponse.json({ error: "Path does not exist", path: vaultPath }, { status: 400 });
    }

    // Write VAULT_PATH to .env.local
    const envPath = join(process.cwd(), ".env.local");
    let envContent = "";

    try {
      envContent = await readFile(envPath, "utf-8");
    } catch {
      // File doesn't exist yet
    }

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

// GET /api/vault — check current vault config
export async function GET() {
  const envPath = join(process.cwd(), ".env.local");
  let configuredPath = "";
  let envExists = false;

  try {
    const envContent = await readFile(envPath, "utf-8");
    envExists = true;
    const match = envContent.match(/^VAULT_PATH=(.+)$/m);
    if (match) configuredPath = match[1].trim();
  } catch {
    // no .env.local
  }

  const { existsSync } = require("fs");
  const autoDetect = process.env.VAULT_PATH || "";
  const activePath = configuredPath || autoDetect;
  const connected = activePath ? existsSync(activePath) : false;

  return NextResponse.json({
    configuredPath,
    autoDetectPath: autoDetect,
    activePath,
    connected,
    envExists,
  });
}