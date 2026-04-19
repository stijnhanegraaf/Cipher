/**
 * Anthropic provider — Messages API with SSE streaming.
 *
 * Model IDs follow Anthropic's current naming (claude-<family>-<version>).
 * Embeddings are not supported by Anthropic — callers should fall back to
 * a different provider for the retrieval index.
 */

import "server-only";
import type { ProviderConfig } from "@/lib/llm-settings";
import type { ChatMessage, ChatProvider, ProviderStatus } from "./types";
import { ProviderAuthError, ProviderDownError, ProviderModelMissingError } from "./types";

const STATIC_MODELS = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

const API_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

export function createAnthropicProvider(cfg: ProviderConfig): ChatProvider {
  const base = (cfg.baseUrl ?? "https://api.anthropic.com").replace(/\/+$/, "");
  const key = cfg.apiKey;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": API_VERSION,
  };
  if (key) headers["x-api-key"] = key;

  return {
    id: "anthropic",
    label: "Anthropic (Claude)",
    async status(): Promise<ProviderStatus> {
      // Anthropic has no public /models endpoint without auth; trust static list.
      if (!key) return { ok: false, models: STATIC_MODELS, defaultModel: "claude-sonnet-4-6", needsKey: true };
      // Probe with a cheap call? Skip — just trust key presence. Any auth
      // errors surface on the first streamChat attempt.
      return { ok: true, models: STATIC_MODELS, defaultModel: "claude-sonnet-4-6" };
    },
    async *streamChat(model: string, messages: ChatMessage[]): AsyncIterable<string> {
      if (!key) throw new ProviderAuthError("anthropic");

      // Anthropic requires a top-level `system` param; user/assistant messages only in `messages`.
      const systemMsgs = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const convo = messages.filter((m) => m.role !== "system").map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));

      let res: Response;
      try {
        res = await fetch(`${base}/v1/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model,
            max_tokens: MAX_TOKENS,
            system: systemMsgs || undefined,
            messages: convo,
            stream: true,
          }),
        });
      } catch {
        throw new ProviderDownError("anthropic", base);
      }
      if (res.status === 401 || res.status === 403) throw new ProviderAuthError("anthropic");
      if (res.status === 404) throw new ProviderModelMissingError("anthropic", model);
      if (!res.ok || !res.body) throw new Error(`Anthropic stream failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // SSE: events separated by blank lines; each event has `event:` + `data:`.
        let boundary: number;
        while ((boundary = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, boundary);
          buf = buf.slice(boundary + 2);
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("data:")) dataLine = line.slice(5).trim();
          }
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta" && parsed.delta.text) {
              yield parsed.delta.text;
            }
            if (parsed.type === "message_stop") return;
          } catch { /* skip */ }
        }
      }
    },
  };
}
