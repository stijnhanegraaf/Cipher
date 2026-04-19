/**
 * GET /api/chat/health — reachability + model list for the active provider.
 *
 * Also reports whether Ollama-local is up (needed for embeddings even
 * when the chat provider is OpenAI or Anthropic).
 */

import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/chat/providers";
import { createOllamaProvider } from "@/lib/chat/providers/ollama";

export async function GET() {
  const { provider, settings } = await getActiveProvider();
  const status = await provider.status();
  const embedProvider = createOllamaProvider("ollama-local", settings.ollamaLocal);
  const embedStatus = await embedProvider.status();
  return NextResponse.json({
    provider: provider.id,
    providerLabel: provider.label,
    ok: status.ok,
    needsKey: status.needsKey ?? false,
    models: status.models,
    defaultModel: status.defaultModel,
    embedOk: embedStatus.ok,
  });
}
