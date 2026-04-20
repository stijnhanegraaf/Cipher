/**
 * GET /api/chat/health — reachability + model list for the active provider,
 * plus which backend semantic search will use.
 */

import { NextResponse } from "next/server";
import { getActiveProvider, resolveEmbedder, embedLabel } from "@/lib/chat/providers";

export async function GET() {
  const { provider, settings } = await getActiveProvider();
  const status = await provider.status();
  const embedder = await resolveEmbedder(settings);
  const source = embedder?.id ?? "keyword-only";
  return NextResponse.json({
    provider: provider.id,
    providerLabel: provider.label,
    ok: status.ok,
    needsKey: status.needsKey ?? false,
    models: status.models,
    defaultModel: status.defaultModel,
    embed: {
      ok: embedder !== null,
      source,
      label: embedLabel(source),
    },
  });
}
