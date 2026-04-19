/**
 * Ollama provider — covers both local (localhost:11434) and cloud
 * (ollama.com). Shape of both endpoints is identical (/api/tags,
 * /api/embeddings, /api/chat), they only differ in base URL + auth.
 */

import "server-only";
import type { ProviderConfig } from "@/lib/llm-settings";
import type { ChatMessage, ChatProvider, ProviderStatus } from "./types";
import { ProviderDownError, ProviderModelMissingError } from "./types";

interface OllamaChatChunk {
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaTagsResponse {
  models: { name: string; modified_at: string; size: number }[];
}

export function createOllamaProvider(
  id: "ollama-local" | "ollama-cloud",
  cfg: ProviderConfig
): ChatProvider {
  const base = (cfg.baseUrl ?? (id === "ollama-cloud" ? "https://ollama.com" : "http://localhost:11434")).replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (id === "ollama-cloud" && cfg.apiKey) headers["Authorization"] = `Bearer ${cfg.apiKey}`;
  const label = id === "ollama-cloud" ? "Ollama Cloud" : "Ollama (local)";

  return {
    id,
    label,
    async status(): Promise<ProviderStatus> {
      try {
        const res = await fetch(`${base}/api/tags`, { cache: "no-store", headers });
        if (!res.ok) return { ok: false, models: [], defaultModel: "llama3.2:3b" };
        const json = (await res.json()) as OllamaTagsResponse;
        const models = json.models.map((m) => m.name).filter((n) => !n.startsWith("nomic-embed-text"));
        return {
          ok: true,
          models,
          defaultModel: models[0] ?? "llama3.2:3b",
          needsKey: id === "ollama-cloud" && !cfg.apiKey,
        };
      } catch {
        return { ok: false, models: [], defaultModel: "llama3.2:3b" };
      }
    },
    async *streamChat(model: string, messages: ChatMessage[]): AsyncIterable<string> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/chat`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, messages, stream: true }),
        });
      } catch {
        throw new ProviderDownError(id, base);
      }
      if (res.status === 404) throw new ProviderModelMissingError(id, model);
      if (!res.ok || !res.body) throw new Error(`Ollama /api/chat failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let chunk: OllamaChatChunk;
          try { chunk = JSON.parse(line) as OllamaChatChunk; } catch { continue; }
          if (chunk.message?.content) yield chunk.message.content;
          if (chunk.done) return;
        }
      }
    },
  };
}
