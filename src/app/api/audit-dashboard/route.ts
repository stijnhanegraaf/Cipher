/**
 * GET /api/audit-dashboard
 *
 * Thin handler — all logic lives in the data spine.
 *
 * Response shapes:
 *   409  { error: "No vault connected" }               — no vault path set
 *   200  { available: false }                          — vault connected but no audits folder
 *   200  { available: true, overallStatus, audits }    — audits folder + dashboard.md found
 */

import { NextResponse } from "next/server";
import { getVaultPath, readAuditDashboard } from "@/lib/vault-reader";
import { log } from "@/lib/log";

export async function GET() {
  try {
    const vaultPath = getVaultPath();
    if (!vaultPath) {
      return NextResponse.json(
        { error: "No vault connected" },
        { status: 409 }
      );
    }

    const result = await readAuditDashboard();

    if (!result.available) {
      return NextResponse.json({ available: false });
    }

    return NextResponse.json({
      available: true,
      overallStatus: result.data.overallStatus,
      audits: result.data.audits,
    });
  } catch (error) {
    log.error("audit-dashboard", "API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit dashboard" },
      { status: 500 }
    );
  }
}
