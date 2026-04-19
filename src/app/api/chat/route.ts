/**
 * POST /api/chat — streaming NDJSON chat endpoint.
 *
 * Pipeline:
 *   1. detectIntent(query)
 *        if matched → emit { type:"envelope", envelope } → { type:"done" } → return.
 *   2. Otherwise LLM path:
 *        a. ensureIndex() — streams index-progress events while building.
 *        b. retrieve(query) → top 8 chunks.
 *        c. buildPrompt(...) → messages.
 *        d. ollama.streamChat() → { type:"token", text } per delta.
 *        e. On stream close → parse [^N] citations → emit one per unique id.
 *        f. Emit { type:"done" }.
 *
 * Errors map to one of: ollama-down | model-missing | empty-vault | unknown.
 * Each error ends the stream with a single { type:"error", ... } then close.
 */

import { detectIntent } from "@/lib/intent-detector";
import { buildView } from "@/lib/view-builder";
import type { ResponseEnvelope } from "@/lib/view-models";
import { retrieve } from "@/lib/chat/retrieval";
import { buildPrompt, parseCitations, type ChatHistoryTurn } from "@/lib/chat/prompt";
import {
  getActiveProvider,
  ProviderDownError,
  ProviderModelMissingError,
  ProviderAuthError,
} from "@/lib/chat/providers";
import { EmptyVaultError } from "@/lib/chat/embeddings";
import { log } from "@/lib/log";

const DEFAULT_MODEL = process.env.CIPHER_CHAT_MODEL || "llama3.2:3b";

interface ChatRequest {
  query: string;
  history: ChatHistoryTurn[];
  model?: string;
}

type ChatEvent =
  | { type: "envelope"; envelope: ResponseEnvelope }
  | { type: "index-progress"; done: number; total: number }
  | { type: "token"; text: string }
  | { type: "citation"; id: number; path: string; heading?: string; snippet: string }
  | { type: "done" }
  | { type: "error"; code: "ollama-down" | "model-missing" | "empty-vault" | "unknown"; message: string };

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const query = (body.query || "").trim();
  const history = Array.isArray(body.history) ? body.history.slice(-4) : [];
  const model = (typeof body.model === "string" && body.model.trim()) || DEFAULT_MODEL;
  if (!query) return new Response("empty query", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: ChatEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };

      try {
        // ── Intent router first. ─────────────────────────────────────
        const intent = await detectIntent(query);
        const ROUTED = new Set([
          "current_work",
          "entity_overview",
          "timeline_synthesis",
          "system_status",
          "browse_entities",
          "browse_projects",
          "browse_research",
          "topic_overview",
          "search_results",
        ]);
        if (ROUTED.has(intent.viewType) && intent.confidence >= 0.7) {
          const view = await buildView(intent.viewType, query, intent.entityName);
          const envelope: ResponseEnvelope = {
            version: "v1",
            request: {
              id: `req_${Date.now()}`,
              intent: intent.intent,
              mode: "structured",
              query,
              entityName: intent.entityName,
            },
            response: {
              title: view.title || "",
              summary: "",
              text: "",
              views: [view],
            },
          };
          emit({ type: "envelope", envelope });
          emit({ type: "done" });
          controller.close();
          return;
        }

        // ── LLM path. ────────────────────────────────────────────────
        const chunks = await retrieve(query, (done, total) => {
          emit({ type: "index-progress", done, total });
        });

        const messages = buildPrompt({ query, history, chunks });
        const { provider } = await getActiveProvider();
        const collected: string[] = [];
        for await (const delta of provider.streamChat(model, messages)) {
          collected.push(delta);
          emit({ type: "token", text: delta });
        }
        const full = collected.join("");
        for (const c of parseCitations(full, chunks)) {
          emit({ type: "citation", id: c.id, path: c.path, heading: c.heading, snippet: c.snippet });
        }
        emit({ type: "done" });
        controller.close();
      } catch (err) {
        if (err instanceof ProviderDownError) {
          emit({ type: "error", code: "ollama-down", message: `Can't reach ${err.providerId}. Check your network, or update the key in the model picker.` });
        } else if (err instanceof ProviderAuthError) {
          emit({ type: "error", code: "model-missing", message: `${err.providerId} rejected the API key. Paste a new one in the model picker.` });
        } else if (err instanceof ProviderModelMissingError) {
          emit({ type: "error", code: "model-missing", message: `Model \`${err.model}\` not available on ${err.providerId}.` });
        } else if (err instanceof EmptyVaultError) {
          emit({ type: "error", code: "empty-vault", message: "No notes in the vault yet — add a `.md` file first." });
        } else {
          log.error("api/chat", "unknown failure", err);
          emit({ type: "error", code: "unknown", message: "Chat failed unexpectedly. Try again — if it keeps happening, restart the app." });
        }
        emit({ type: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
