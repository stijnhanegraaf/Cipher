import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/vault/backlinks");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

describe("GET /api/vault/backlinks", () => {
  // The test environment MAY have a vault configured (e.g. ~/Developer/Obsidian on
  // the dev machine). The route never returns 500 for a known path — it returns
  // 200 + { backlinks: [] } when there are no inbound edges, or 409 when no vault.

  it("returns {backlinks} shape on success or 409 on no-vault — never 500", async () => {
    const res = await GET(req({ path: "some-note.md" }));
    // 200 (vault found, 0 backlinks) or 409 (no vault) — never 500
    expect([200, 409]).toContain(res.status);
    const body = (await res.json()) as { backlinks?: unknown[]; error?: string };
    if (res.status === 200) {
      expect(Array.isArray(body.backlinks)).toBe(true);
    } else {
      expect(typeof body.error).toBe("string");
      expect(Array.isArray(body.backlinks)).toBe(true);
    }
  });

  it("returns 400 when path param is missing (vault check comes first, so 400 or 409)", async () => {
    const res = await GET(req({}));
    // 400 (missing path) or 409 (no vault) — never a 200
    expect([400, 409]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("response includes backlinks:[] in 409 body when no vault", async () => {
    const res = await GET(req({ path: "projects/q3-plan.md" }));
    if (res.status === 409) {
      const body = (await res.json()) as { backlinks: unknown };
      expect(Array.isArray(body.backlinks)).toBe(true);
      expect((body.backlinks as unknown[]).length).toBe(0);
    } else {
      // 200 — still must have backlinks array
      const body = (await res.json()) as { backlinks: unknown[] };
      expect(Array.isArray(body.backlinks)).toBe(true);
    }
  });
});
