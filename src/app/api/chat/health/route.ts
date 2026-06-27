/**
 * GET /api/chat/health — reachability + model list for the active provider,
 * plus which backend semantic search will use.
 */

import { NextResponse } from "next/server";
import { getActiveProvider, resolveEmbedder, embedLabel } from "@/lib/chat/providers";
import { readLLMSettings } from "@/lib/llm-settings";
import { detectCli } from "@/lib/chat/detect-cli";

export async function GET() {
  const { provider, settings } = await getActiveProvider();
  const status = await provider.status();
  const embedder = await resolveEmbedder(settings);
  const source = embedder?.id ?? "keyword-only";

  // Report CLI availability when the active provider is in CLI mode.
  let cliInfo: { available: boolean; version?: string; path?: string } | undefined;
  const llmSettings = await readLLMSettings();
  if (llmSettings.provider === "anthropic" && llmSettings.anthropic.mode === "cli") {
    cliInfo = await detectCli("claude", llmSettings.anthropic.cliPath);
  } else if (llmSettings.provider === "ollama-local" && llmSettings.ollamaLocal.mode === "cli") {
    cliInfo = await detectCli("ollama", llmSettings.ollamaLocal.cliPath);
  }

  return NextResponse.json({
    provider: provider.id,
    providerLabel: provider.label,
    ok: status.ok,
    needsKey: status.needsKey ?? false,
    models: status.models,
    defaultModel: status.defaultModel,
    embed: {
      ok: embedder !== null,
      source,
      label: embedLabel(source),
    },
    ...(cliInfo !== undefined ? { cli: cliInfo } : {}),
  });
}
