/**
 * OpenAI provider — Chat Completions API with SSE streaming.
 */

import "server-only";
import type { ProviderConfig } from "@/lib/llm-settings";
import type { ChatMessage, ChatProvider, ProviderStatus } from "./types";
import { ProviderAuthError, ProviderDownError, ProviderModelMissingError } from "./types";

const STATIC_MODELS = [
  "gpt-4.1",
  "gpt-4o",
  "gpt-4o-mini",
  "o3-mini",
];

export function createOpenAIProvider(cfg: ProviderConfig): ChatProvider {
  const base = (cfg.baseUrl ?? "https://api.openai.com").replace(/\/+$/, "");
  const key = cfg.apiKey;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;

  return {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    async status(): Promise<ProviderStatus> {
      if (!key) return { ok: false, models: STATIC_MODELS, defaultModel: "gpt-4o-mini", needsKey: true };
      try {
        const res = await fetch(`${base}/v1/models`, { cache: "no-store", headers });
        if (res.status === 401) return { ok: false, models: STATIC_MODELS, defaultModel: "gpt-4o-mini", needsKey: true };
        if (!res.ok) return { ok: false, models: STATIC_MODELS, defaultModel: "gpt-4o-mini" };
        const json = (await res.json()) as { data: { id: string }[] };
        const discovered = json.data.map((m) => m.id).filter((id) => /^gpt-|^o[0-9]/.test(id));
        // Prefer discovered but keep static as fallback hint.
        const models = discovered.length ? discovered.sort() : STATIC_MODELS;
        return { ok: true, models, defaultModel: models.includes("gpt-4o-mini") ? "gpt-4o-mini" : models[0] };
      } catch {
        return { ok: false, models: STATIC_MODELS, defaultModel: "gpt-4o-mini" };
      }
    },
    async *streamChat(model: string, messages: ChatMessage[]): AsyncIterable<string> {
      if (!key) throw new ProviderAuthError("openai");
      let res: Response;
      try {
        res = await fetch(`${base}/v1/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, messages, stream: true }),
        });
      } catch {
        throw new ProviderDownError("openai", base);
      }
      if (res.status === 401) throw new ProviderAuthError("openai");
      if (res.status === 404) throw new ProviderModelMissingError("openai", model);
      if (!res.ok || !res.body) throw new Error(`OpenAI stream failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const raw = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const line = raw.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const parsed = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const text = parsed.choices?.[0]?.delta?.content;
            if (text) yield text;
          } catch { /* skip */ }
        }
      }
    },
  };
}
