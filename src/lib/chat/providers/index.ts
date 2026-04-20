/**
 * Provider router — reads llm-settings and returns the active chat provider.
 *
 * Embedding backends are resolved separately via `resolveEmbedder()` in
 * `./embeddings` (the active chat provider is preferred; Ollama is a fallback).
 */

import "server-only";
import { readLLMSettings, type LLMSettings, type ProviderId } from "@/lib/llm-settings";
import type { ChatProvider } from "./types";
import { createOllamaProvider } from "./ollama";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";

export { ProviderDownError, ProviderModelMissingError, ProviderAuthError } from "./types";
export type { ChatMessage, ChatProvider, ProviderStatus } from "./types";
export { resolveEmbedder, embedLabel, type Embedder, type EmbedderId } from "./embeddings";

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
