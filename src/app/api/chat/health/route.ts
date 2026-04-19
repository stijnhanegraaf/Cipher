/**
 * GET /api/chat/health
 *
 * Checks Ollama reachability, lists available tags, and confirms the
 * default chat + embedding models are pulled. Returns `models` so the UI
 * can render a model picker without a second call.
 */

import { NextResponse } from "next/server";
import { listTags } from "@/lib/chat/ollama";
import { EMBED_MODEL } from "@/lib/chat/embeddings";

const DEFAULT_CHAT_MODEL = process.env.CIPHER_CHAT_MODEL || "llama3.2:3b";

const hasTag = (names: Set<string>, target: string) =>
  names.has(target) || [...names].some((n) => n === target || n.startsWith(target + ":") || n.split(":")[0] === target);

export async function GET() {
  try {
    const tags = await listTags();
    const allNames = tags.models.map((m) => m.name);
    const names = new Set(allNames);
    // Chat-capable models = everything that isn't the embedding model.
    const chatModels = allNames.filter((n) => !n.startsWith(EMBED_MODEL));
    return NextResponse.json({
      ok: true,
      model: DEFAULT_CHAT_MODEL,
      hasModel: hasTag(names, DEFAULT_CHAT_MODEL),
      hasEmbedModel: hasTag(names, EMBED_MODEL),
      models: chatModels,
    });
  } catch {
    return NextResponse.json({
      ok: false,
      model: DEFAULT_CHAT_MODEL,
      hasModel: false,
      hasEmbedModel: false,
      models: [],
    });
  }
}
