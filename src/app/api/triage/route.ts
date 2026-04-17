import { NextResponse } from "next/server";
import { buildTriage } from "@/lib/triage-builder";
import { getVaultPath } from "@/lib/vault-reader";

// ─── GET /api/triage ───────────────────────────────────────────────────
// Returns the Triage Inbox payload: a ranked, unified list of items the
// user should look at right now — tasks, mentions, activity, highlights.

export async function GET() {
  try {
    if (!getVaultPath()) {
      return NextResponse.json(
        { error: "No vault connected", rows: [], counts: null },
        { status: 409 }
      );
    }
    const payload = await buildTriage();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Triage API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build triage" },
      { status: 500 }
    );
  }
}
