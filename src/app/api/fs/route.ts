/**
 * GET /api/fs?path=<abs-path>
 *
 * Local filesystem directory browser used by VaultConnectDialog so the user
 * can pick a vault folder without typing the absolute path.
 *
 * Only LOCAL-DEV use — cipher is a single-user tool that talks to the same
 * machine the browser runs on. Reads directory listings only, no writes.
 * Hidden entries (starting with '.') are filtered out.
 */

import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { homedir } from "os";
import { resolve, join, dirname } from "path";

function safe(absPath: string): string {
  return resolve(absPath);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("path") || homedir();
  const cwd = safe(raw);

  try {
    const info = await stat(cwd);
    if (!info.isDirectory()) {
      return NextResponse.json({ error: "Not a directory", cwd }, { status: 400 });
    }
    const entries = await readdir(cwd, { withFileTypes: true });
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => ({ name: e.name, path: join(cwd, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      cwd,
      parent: cwd === "/" ? null : dirname(cwd),
      home: homedir(),
      dirs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Read failed", cwd },
      { status: 400 }
    );
  }
}
