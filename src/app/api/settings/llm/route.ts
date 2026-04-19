/**
 * GET  /api/settings/llm — read LLM connection settings (keys redacted).
 * POST /api/settings/llm — patch provider + per-provider config.
 */

import { NextResponse } from "next/server";
import { readLLMSettings, updateLLMSettings, type ProviderId } from "@/lib/llm-settings";
import { log } from "@/lib/log";

const VALID: ProviderId[] = ["ollama-local", "ollama-cloud", "openai", "anthropic"];

export async function GET() {
  const s = await readLLMSettings();
  return NextResponse.json({
    provider: s.provider,
    ollamaLocal: { hasKey: !!s.ollamaLocal.apiKey, baseUrl: s.ollamaLocal.baseUrl ?? null },
    ollamaCloud: { hasKey: !!s.ollamaCloud.apiKey, baseUrl: s.ollamaCloud.baseUrl ?? null },
    openai: { hasKey: !!s.openai.apiKey, baseUrl: s.openai.baseUrl ?? null },
    anthropic: { hasKey: !!s.anthropic.apiKey, baseUrl: s.anthropic.baseUrl ?? null },
  });
}

interface PatchBody {
  provider?: ProviderId;
  ollamaLocal?: { apiKey?: string; baseUrl?: string };
  ollamaCloud?: { apiKey?: string; baseUrl?: string };
  openai?: { apiKey?: string; baseUrl?: string };
  anthropic?: { apiKey?: string; baseUrl?: string };
}

export async function POST(req: Request) {
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.provider && !VALID.includes(body.provider)) {
    return NextResponse.json({ error: "invalid provider" }, { status: 400 });
  }
  try {
    const next = await updateLLMSettings(body);
    return NextResponse.json({ ok: true, provider: next.provider });
  } catch (err) {
    log.error("llm-settings", "write failed", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
