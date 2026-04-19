/**
 * Provider router — reads llm-settings and returns the active provider.
 *
 * Also exports a dedicated `embedWithOllamaLocal()` function that the
 * retrieval pipeline uses unconditionally (Anthropic has no embeddings
 * API; running Ollama locally for nomic-embed-text is the cheap universal
 * option per the spec).
 */

import "server-only";
import { readLLMSettings, type LLMSettings, type ProviderId } from "@/lib/llm-settings";
import type { ChatProvider } from "./types";
import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";

export { ProviderDownError, ProviderModelMissingError, ProviderAuthError } from "./types";
export type { ChatMessage, ChatProvider, ProviderStatus } from "./types";

export function createProvider(id: ProviderId, settings: LLMSettings): ChatProvider {
  switch (id) {
    case "ollama-local": return createOllamaProvider("ollama-local", settings.ollamaLocal);
    case "ollama-cloud": return createOllamaProvider("ollama-cloud", settings.ollamaCloud);
    case "openai": return createOpenAIProvider(settings.openai);
    case "anthropic": return createAnthropicProvider(settings.anthropic);
  }
}

export async function getActiveProvider(): Promise<{ provider: ChatProvider; settings: LLMSettings }> {
  const settings = await readLLMSettings();
  return { provider: createProvider(settings.provider, settings), settings };
}

// ── Dedicated Ollama-local embedding ─────────────────────────────────
// Retrieval always runs through local Ollama regardless of chat provider.
// Falls back to skipping embedding if Ollama isn't running.

interface OllamaEmbeddingsResponse { embedding: number[] }

export async function embedWithOllamaLocal(model: string, prompt: string): Promise<number[]> {
  const base = "http://localhost:11434";
  let res: Response;
  try {
    res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt }),
    });
  } catch {
    throw new Error("Ollama not reachable for embeddings. Start it with `ollama serve`.");
  }
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  const json = (await res.json()) as OllamaEmbeddingsResponse;
  if (!Array.isArray(json.embedding)) throw new Error("Malformed embedding response");
  return json.embedding;
}
