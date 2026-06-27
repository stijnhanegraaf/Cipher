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
    ollamaLocal: {
      hasKey: !!s.ollamaLocal.apiKey,
      baseUrl: s.ollamaLocal.baseUrl ?? null,
      mode: s.ollamaLocal.mode ?? "api",
      cliPath: s.ollamaLocal.cliPath ?? null,
    },
    ollamaCloud: {
      hasKey: !!s.ollamaCloud.apiKey,
      baseUrl: s.ollamaCloud.baseUrl ?? null,
      mode: s.ollamaCloud.mode ?? "api",
      cliPath: s.ollamaCloud.cliPath ?? null,
    },
    openai: {
      hasKey: !!s.openai.apiKey,
      baseUrl: s.openai.baseUrl ?? null,
      mode: s.openai.mode ?? "api",
      cliPath: s.openai.cliPath ?? null,
    },
    anthropic: {
      hasKey: !!s.anthropic.apiKey,
      baseUrl: s.anthropic.baseUrl ?? null,
      mode: s.anthropic.mode ?? "api",
      cliPath: s.anthropic.cliPath ?? null,
    },
  });
}

interface ProviderPatch {
  apiKey?: string;
  baseUrl?: string;
  mode?: "api" | "cli";
  cliPath?: string;
}

interface PatchBody {
  provider?: ProviderId;
  ollamaLocal?: ProviderPatch;
  ollamaCloud?: ProviderPatch;
  openai?: ProviderPatch;
  anthropic?: ProviderPatch;
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
