import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

function req(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/vault/tags");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

describe("GET /api/vault/tags", () => {
  // The test environment MAY have a vault configured. The route never
  // returns 500 for a known path — it returns 200 + { tags: [] } when
  // there are no tags, or 409 when no vault.

  it("bare GET returns {tags} shape — 200 or 409, never 500", async () => {
    const res = await GET(req());
    expect([200, 409]).toContain(res.status);
    const body = (await res.json()) as { tags?: unknown[]; error?: string };
    expect(Array.isArray(body.tags)).toBe(true);
  });

  it("?tag= returns {tag,notes} shape — 200 or 409, never 500", async () => {
    const res = await GET(req({ tag: "design" }));
    expect([200, 409]).toContain(res.status);
    const body = (await res.json()) as { tag?: string; notes?: unknown[]; error?: string };
    expect(Array.isArray(body.notes)).toBe(true);
  });

  it("409 body includes empty tags array when no vault", async () => {
    const res = await GET(req());
    if (res.status === 409) {
      const body = (await res.json()) as { tags: unknown };
      expect(Array.isArray(body.tags)).toBe(true);
      expect((body.tags as unknown[]).length).toBe(0);
    } else {
      const body = (await res.json()) as { tags: unknown[] };
      expect(Array.isArray(body.tags)).toBe(true);
    }
  });

  it("409 body includes empty notes array for ?tag= when no vault", async () => {
    const res = await GET(req({ tag: "some-tag" }));
    if (res.status === 409) {
      const body = (await res.json()) as { notes: unknown };
      expect(Array.isArray(body.notes)).toBe(true);
      expect((body.notes as unknown[]).length).toBe(0);
    } else {
      const body = (await res.json()) as { notes: unknown[] };
      expect(Array.isArray(body.notes)).toBe(true);
    }
  });
});
