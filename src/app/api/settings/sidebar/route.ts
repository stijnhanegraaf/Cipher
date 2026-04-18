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

/**
 * `GET /api/settings/sidebar` — read the current sidebar configuration.
 *
 * Response: `SidebarConfig` ({ version, pins[] }). Always 200; returns
 * an empty pin list when no vault is connected or the file is absent.
 */
export async function GET() {
  const config = await readSidebarSettings();
  return NextResponse.json(config);
}

/**
 * `PUT /api/settings/sidebar` — replace the sidebar configuration.
 *
 * Body: `SidebarConfig`. Writes atomically (tmp + rename). Status:
 * 200 on success, 400 on invalid JSON / schema, 409 when no vault is
 * connected, 500 on unexpected failure.
 */
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
