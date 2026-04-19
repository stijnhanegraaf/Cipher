/**
 * GET  /api/settings/ollama — return connection config (key redacted to bool).
 * POST /api/settings/ollama — save { mode, apiKey?, baseUrl? }.
 */

import { NextResponse } from "next/server";
import { readOllamaSettings, writeOllamaSettings, type OllamaSettings } from "@/lib/ollama-settings";
import { log } from "@/lib/log";

export async function GET() {
  const s = await readOllamaSettings();
  return NextResponse.json({
    mode: s.mode,
    hasKey: !!s.apiKey,
    baseUrl: s.baseUrl ?? null,
  });
}

export async function POST(req: Request) {
  let body: Partial<OllamaSettings>;
  try {
    body = (await req.json()) as Partial<OllamaSettings>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.mode !== "local" && body.mode !== "cloud") {
    return NextResponse.json({ error: "mode must be 'local' or 'cloud'" }, { status: 400 });
  }
  const next: OllamaSettings = {
    mode: body.mode,
    apiKey: typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined,
    baseUrl: typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : undefined,
  };
  try {
    await writeOllamaSettings(next);
    return NextResponse.json({ ok: true, mode: next.mode, hasKey: !!next.apiKey });
  } catch (err) {
    log.error("ollama-settings", "write failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
