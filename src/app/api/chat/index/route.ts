/**
 * GET  /api/chat/index — index status snapshot.
 *   Response: { built: boolean; count: number; stale: boolean }
 *
 * POST /api/chat/index — trigger an incremental vault index build.
 *   Streams NDJSON progress events while building:
 *     { type: "index-progress"; done: number; total: number }
 *   Ends with:
 *     { type: "done" }
 *   Errors end with:
 *     { type: "error"; code: string; message: string }
 *   followed by { type: "done" }.
 */

import "server-only";
import { NextResponse } from "next/server";
import { ensureIndex, getIndexStatus, EmptyVaultError } from "@/lib/chat/embeddings";
import { resolveEmbedder } from "@/lib/chat/providers/embeddings";
import { readLLMSettings } from "@/lib/llm-settings";
import { log } from "@/lib/log";

export async function GET() {
  const status = await getIndexStatus();
  return NextResponse.json(status);
}

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
      };

      try {
        const settings = await readLLMSettings();
        const embedder = await resolveEmbedder(settings);

        if (!embedder) {
          emit({
            type: "error",
            code: "no-embedder",
            message: "No embedding backend is reachable. Check the model picker — Ollama must be running or a cloud provider must be configured.",
          });
          emit({ type: "done" });
          controller.close();
          return;
        }

        await ensureIndex(embedder, (done, total) => {
          emit({ type: "index-progress", done, total });
        });

        emit({ type: "done" });
        controller.close();
      } catch (err) {
        if (err instanceof EmptyVaultError) {
          emit({
            type: "error",
            code: "empty-vault",
            message: "No .md files in the vault yet — add a note first.",
          });
        } else {
          log.error("api/chat/index", "index build failed", err);
          emit({
            type: "error",
            code: "unknown",
            message: "Index build failed unexpectedly. Check the server logs.",
          });
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
