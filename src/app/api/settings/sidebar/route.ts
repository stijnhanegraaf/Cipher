/**
 * GET /api/settings/sidebar — reads sidebar pins/customisation.
 * PUT /api/settings/sidebar — writes sidebar settings to <vault>/.cipher/.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  readSidebarSettings,
  writeSidebarSettings,
  type SidebarConfig,
} from "@/lib/settings";

export async function GET() {
  const config = await readSidebarSettings();
  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    await writeSidebarSettings(body as SidebarConfig);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Write failed";
    const code = msg === "No vault connected" ? 409 : msg.startsWith("Invalid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
  return NextResponse.json({ ok: true });
}
