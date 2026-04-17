import { NextResponse } from "next/server";
import { buildToday } from "@/lib/today-builder";
import { getVaultPath } from "@/lib/vault-reader";

// GET /api/today — returns { today, upNext, counts } for the TodayPage.

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
    console.error("Today API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to build today" },
      { status: 500 }
    );
  }
}
