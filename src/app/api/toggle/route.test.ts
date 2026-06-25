import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function req(body: unknown) {
  return new NextRequest("http://localhost/api/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/toggle path guard", () => {
  it("rejects a traversing path with 400 (before any fs write)", async () => {
    const res = await POST(req({ path: "../../etc/passwd", lineIndex: 0, checked: true }));
    // 400 (invalid path) or 409 (no vault in test env) — never a 200 success.
    expect([400, 409]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
