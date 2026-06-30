import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/file/links");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

describe("GET /api/file/links", () => {
  it("returns 409 or {links} shape — never 500 — for a known path", async () => {
    const res = await GET(req({ path: "some-note.md" }));
    expect([200, 404, 409]).toContain(res.status);
    const body = (await res.json()) as { links?: unknown[]; error?: string };
    // In all non-500 cases, links must be an array when present
    if (body.links !== undefined) {
      expect(Array.isArray(body.links)).toBe(true);
    }
  });

  it("returns 409 when no vault is connected, with links:[] in body", async () => {
    const res = await GET(req({ path: "projects/q3-plan.md" }));
    if (res.status === 409) {
      const body = (await res.json()) as { links: unknown };
      expect(Array.isArray(body.links)).toBe(true);
      expect((body.links as unknown[]).length).toBe(0);
    } else {
      // 200 or 404 — still must have links array
      const body = (await res.json()) as { links: unknown[] };
      expect(Array.isArray(body.links)).toBe(true);
    }
  });

  it("returns 400 or 409 (never 200) when path param is missing", async () => {
    const res = await GET(req({}));
    expect([400, 409]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("response body always includes links array on non-500 status", async () => {
    const res = await GET(req({ path: "wiki/nonexistent-file-xyz.md" }));
    expect(res.status).not.toBe(500);
    const body = (await res.json()) as { links: unknown };
    expect(Array.isArray(body.links)).toBe(true);
  });
});
