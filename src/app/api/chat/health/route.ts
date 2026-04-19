/**
 * GET /api/chat/health
 *
 * Lightweight check: is Ollama reachable, and are the required models
 * present? Returns model names so the client can render the correct
 * `ollama pull <name>` hint on the empty state.
 */

import { NextResponse } from "next/server";
import { listTags } from "@/lib/chat/ollama";
import { EMBED_MODEL } from "@/lib/chat/embeddings";

const CHAT_MODEL = process.env.CIPHER_CHAT_MODEL || "llama3.2:3b";

export async function GET() {
  try {
    const tags = await listTags();
    const names = new Set(tags.models.map((m) => m.name));
    const hasModel = [...names].some((n) => n === CHAT_MODEL || n.startsWith(CHAT_MODEL + ":") || n.split(":")[0] === CHAT_MODEL);
    const hasEmbedModel = [...names].some((n) => n === EMBED_MODEL || n.startsWith(EMBED_MODEL + ":") || n.split(":")[0] === EMBED_MODEL);
    return NextResponse.json({ ok: true, model: CHAT_MODEL, hasModel, hasEmbedModel });
  } catch {
    return NextResponse.json({ ok: false, model: CHAT_MODEL, hasModel: false, hasEmbedModel: false });
  }
}
