import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { stat } from "fs/promises";
import { getVaultPath } from "@/lib/vault-reader";
import { safeJoin } from "@/lib/fs/safe-join";

export async function POST(req: NextRequest) {
  if (process.platform !== "darwin") {
    return NextResponse.json({ error: "reveal only supported on macOS" }, { status: 501 });
  }
  const root = getVaultPath();
  if (!root) return NextResponse.json({ error: "no vault" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { path?: string };
  const rel = (body.path ?? "").replace(/^\/+/, "");
  const abs = safeJoin(root, rel);
  if (!abs) return NextResponse.json({ error: "path escapes vault" }, { status: 400 });

  try { await stat(abs); } catch { return NextResponse.json({ error: "not found" }, { status: 404 }); }

  spawn("open", ["-R", abs], { detached: true, stdio: "ignore" }).unref();
  return NextResponse.json({ ok: true });
}
