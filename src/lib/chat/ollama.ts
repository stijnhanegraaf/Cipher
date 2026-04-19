/**
 * Thin HTTP wrapper around either a local Ollama instance or Ollama Cloud.
 *
 * The base URL + Bearer header come from `<vault>/.cipher/ollama.json`
 * via `readOllamaSettings()`. Both modes speak the same API surface
 * (/api/tags, /api/embeddings, /api/chat).
 */

import "server-only";
import { readOllamaSettings, resolveBase, resolveHeaders } from "@/lib/ollama-settings";

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
  constructor(base: string) { super("Ollama is not reachable at " + base); this.name = "OllamaDownError"; }
}

export class OllamaModelMissingError extends Error {
  constructor(public model: string) { super(`Model "${model}" is not pulled`); this.name = "OllamaModelMissingError"; }
}

async function resolveEndpoint() {
  const s = await readOllamaSettings();
  return { base: resolveBase(s), headers: resolveHeaders(s), mode: s.mode };
}

export async function listTags(): Promise<OllamaTagsResponse> {
  const { base, headers } = await resolveEndpoint();
  let res: Response;
  try {
    res = await fetch(`${base}/api/tags`, { cache: "no-store", headers });
  } catch {
    throw new OllamaDownError(base);
  }
  if (!res.ok) throw new OllamaDownError(base);
  return (await res.json()) as OllamaTagsResponse;
}

export async function embed(model: string, prompt: string): Promise<number[]> {
  const { base, headers } = await resolveEndpoint();
  let res: Response;
  try {
    res = await fetch(`${base}/api/embeddings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, prompt }),
    });
  } catch {
    throw new OllamaDownError(base);
  }
  if (res.status === 404) throw new OllamaModelMissingError(model);
  if (!res.ok) throw new Error(`Ollama /api/embeddings failed: ${res.status}`);
  const json = (await res.json()) as OllamaEmbeddingsResponse;
  if (!Array.isArray(json.embedding)) throw new Error("Ollama returned malformed embedding");
  return json.embedding;
}

export async function* streamChat(model: string, messages: OllamaMessage[]): AsyncIterable<string> {
  const { base, headers } = await resolveEndpoint();
  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, stream: true }),
    });
  } catch {
    throw new OllamaDownError(base);
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
