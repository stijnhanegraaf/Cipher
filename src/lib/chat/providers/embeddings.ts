/**
 * Embedding backends and provider resolution.
 *
 * Picks an embedder per request in this order:
 *   1. Active chat provider has embeddings (OpenAI, Ollama local, Ollama Cloud).
 *   2. Else, Ollama local reachable on localhost:11434.
 *   3. Else, Ollama Cloud has an API key configured.
 *   4. Else, null — retrieval degrades to keyword-only.
 */

import "server-only";
import type { LLMSettings, ProviderConfig } from "@/lib/llm-settings";

export type EmbedderId = "openai" | "ollama-local" | "ollama-cloud";

export interface Embedder {
  id: EmbedderId;
  model: string;
  dim: number;
  embed(text: string): Promise<number[]>;
}

// ── OpenAI ────────────────────────────────────────────────────────────

interface OpenAIEmbeddingResponse {
  data: { embedding: number[] }[];
}

export function createOpenAIEmbedder(cfg: ProviderConfig): Embedder | null {
  if (!cfg.apiKey) return null;
  const base = (cfg.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
  const model = "text-embedding-3-small";
  return {
    id: "openai",
    model,
    dim: 1536,
    async embed(text: string): Promise<number[]> {
      const res = await fetch(`${base}/v1/embeddings`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({ model, input: text }),
      });
      if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
      const json = (await res.json()) as OpenAIEmbeddingResponse;
      const vec = json.data?.[0]?.embedding;
      if (!Array.isArray(vec)) throw new Error("Malformed OpenAI embedding response");
      return vec;
    },
  };
}

// ── Ollama (local or cloud) ───────────────────────────────────────────

interface OllamaEmbeddingsResponse { embedding: number[] }

function createOllamaEmbedder(
  id: "ollama-local" | "ollama-cloud",
  cfg: ProviderConfig,
): Embedder {
  const base = (cfg.baseUrl ?? (id === "ollama-cloud" ? "https://ollama.com" : "http://localhost:11434")).replace(/\/+$/, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (id === "ollama-cloud" && cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const model = "nomic-embed-text";
  return {
    id,
    model,
    dim: 768,
    async embed(text: string): Promise<number[]> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/embeddings`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, prompt: text }),
        });
      } catch {
        throw new Error(`Ollama (${id}) not reachable for embeddings at ${base}`);
      }
      if (!res.ok) throw new Error(`Ollama embeddings failed: ${res.status}`);
      const json = (await res.json()) as OllamaEmbeddingsResponse;
      if (!Array.isArray(json.embedding)) throw new Error("Malformed Ollama embedding response");
      return json.embedding;
    },
  };
}

// ── Reachability probes ───────────────────────────────────────────────

async function ollamaLocalReachable(cfg: ProviderConfig): Promise<boolean> {
  const base = (cfg.baseUrl ?? "http://localhost:11434").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1000);
  try {
    const res = await fetch(`${base}/api/tags`, { cache: "no-store", signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ── Resolver ──────────────────────────────────────────────────────────

export async function resolveEmbedder(settings: LLMSettings): Promise<Embedder | null> {
  // 1. Active chat provider has embeddings.
  switch (settings.provider) {
    case "openai": {
      const e = createOpenAIEmbedder(settings.openai);
      if (e) return e;
      break;
    }
    case "ollama-local": {
      if (await ollamaLocalReachable(settings.ollamaLocal)) {
        return createOllamaEmbedder("ollama-local", settings.ollamaLocal);
      }
      break;
    }
    case "ollama-cloud": {
      if (settings.ollamaCloud.apiKey) {
        return createOllamaEmbedder("ollama-cloud", settings.ollamaCloud);
      }
      break;
    }
    case "anthropic":
      break; // no embeddings API
  }

  // 2. Ollama local reachable.
  if (await ollamaLocalReachable(settings.ollamaLocal)) {
    return createOllamaEmbedder("ollama-local", settings.ollamaLocal);
  }

  // 3. Ollama Cloud configured.
  if (settings.ollamaCloud.apiKey) {
    return createOllamaEmbedder("ollama-cloud", settings.ollamaCloud);
  }

  // 4. None.
  return null;
}

// ── UI labels ─────────────────────────────────────────────────────────

export function embedLabel(source: EmbedderId | "keyword-only"): string {
  switch (source) {
    case "openai": return "Using OpenAI embeddings";
    case "ollama-local": return "Using Ollama (local)";
    case "ollama-cloud": return "Using Ollama Cloud";
    case "keyword-only": return "Search falls back to keywords";
  }
}
