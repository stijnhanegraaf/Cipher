/**
 * GET /api/today — returns TodayPayload aggregated from the vault.
 */
import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today-builder";
import { getVaultPath } from "@/lib/vault-reader";
import { log } from "@/lib/log";

// GET /api/today — returns { today, upNext, counts } for the TodayPage.

/**
 * `GET /api/today` — aggregated open tasks for the TodayPage.
 *
 * Response: `TodayPayload` ({ today, upNext, counts }). Status: 200 on
 * success, 409 when no vault is connected, 500 on unexpected failure.
 */
export async function GET() {
  try {
    if (!getVaultPath()) {
      return NextResponse.json(
        { error: "No vault connected", today: [], upNext: [], counts: null },
        { status: 409 }
      );
    }
    const payload = await buildToday();
    return NextResponse.json(payload);
  } catch (error) {
    log.error("today", "API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build today" },
      { status: 500 }
    );
  }
}
