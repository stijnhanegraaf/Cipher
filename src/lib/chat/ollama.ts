/**
 * Thin HTTP wrapper around a locally running Ollama instance.
 *
 * Exposes three async primitives used by the /api/chat pipeline:
 *   - listTags()   — GET /api/tags, used for health / model detection.
 *   - embed()      — POST /api/embeddings, single-prompt embedding.
 *   - streamChat() — POST /api/chat with stream:true, yields text deltas.
 *
 * Base URL is hard-coded for v1 (see spec § Model & config). Model names
 * are passed in by the caller — this module stays model-agnostic.
 */

import "server-only";

const OLLAMA_BASE = "http://localhost:11434";

export interface OllamaTag {
  name: string;
  modified_at: string;
  size: number;
}

export interface OllamaTagsResponse {
  models: OllamaTag[];
}

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatStreamChunk {
  model: string;
  created_at: string;
  message?: { role: string; content: string };
  done: boolean;
}

interface OllamaEmbeddingsResponse {
  embedding: number[];
}

export class OllamaDownError extends Error {
  constructor() { super("Ollama is not reachable at " + OLLAMA_BASE); this.name = "OllamaDownError"; }
}

export class OllamaModelMissingError extends Error {
  constructor(public model: string) { super(`Model "${model}" is not pulled`); this.name = "OllamaModelMissingError"; }
}

/** GET /api/tags — returns the list of locally pulled models. Throws OllamaDownError on connection failure. */
export async function listTags(): Promise<OllamaTagsResponse> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/tags`, { cache: "no-store" });
  } catch {
    throw new OllamaDownError();
  }
  if (!res.ok) throw new OllamaDownError();
  return (await res.json()) as OllamaTagsResponse;
}

/** POST /api/embeddings — one prompt, one vector. Throws OllamaDownError / OllamaModelMissingError. */
export async function embed(model: string, prompt: string): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt }),
    });
  } catch {
    throw new OllamaDownError();
  }
  if (res.status === 404) throw new OllamaModelMissingError(model);
  if (!res.ok) throw new Error(`Ollama /api/embeddings failed: ${res.status}`);
  const json = (await res.json()) as OllamaEmbeddingsResponse;
  if (!Array.isArray(json.embedding)) throw new Error("Ollama returned malformed embedding");
  return json.embedding;
}

/**
 * POST /api/chat with stream:true. Returns an AsyncIterable<string> that
 * yields incremental content deltas from `message.content`. Throws
 * OllamaDownError on connection failure and OllamaModelMissingError on 404.
 */
export async function* streamChat(model: string, messages: OllamaMessage[]): AsyncIterable<string> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, messages, stream: true }),
    });
  } catch {
    throw new OllamaDownError();
  }
  if (res.status === 404) throw new OllamaModelMissingError(model);
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
      let chunk: OllamaChatStreamChunk;
      try { chunk = JSON.parse(line) as OllamaChatStreamChunk; } catch { continue; }
      if (chunk.message?.content) yield chunk.message.content;
      if (chunk.done) return;
    }
  }
}
