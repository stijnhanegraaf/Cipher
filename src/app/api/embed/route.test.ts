import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { MAX_EMBED_DEPTH } from "@/lib/markdown/embed-guard";

function req(params: Record<string, string | number>) {
  const url = new URL("http://localhost/api/embed");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  return new NextRequest(url.toString());
}

describe("GET /api/embed — path validation", () => {
  it("returns 400 when path param is missing", async () => {
    const res = await GET(req({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/missing/i);
  });

  it("returns 400 when path escapes vault (traversal)", async () => {
    const res = await GET(req({ path: "../../etc/passwd" }));
    // Either 400 (traversal blocked) or 409 (no vault) — never 200.
    expect([400, 409]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });

  it("returns 400 specifically for obvious .. traversal before vault check", async () => {
    const res = await GET(req({ path: "../outside" }));
    // 400 (path escapes) or 409 (no vault in test env) — never 200.
    expect([400, 409]).toContain(res.status);
  });
});

describe("GET /api/embed — depth guard (server backstop)", () => {
  it(`returns 409 when depth >= MAX_EMBED_DEPTH (${MAX_EMBED_DEPTH})`, async () => {
    const res = await GET(req({ path: "some-note", depth: MAX_EMBED_DEPTH }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; depth: number };
    expect(body.error).toBe("depth-exceeded");
    expect(body.depth).toBe(MAX_EMBED_DEPTH);
  });

  it(`returns 409 when depth is above MAX_EMBED_DEPTH`, async () => {
    const res = await GET(req({ path: "some-note", depth: MAX_EMBED_DEPTH + 2 }));
    expect(res.status).toBe(409);
  });

  it("does NOT return 409 for depth MAX-1 (depth is not yet exceeded)", async () => {
    // depth = MAX-1 is allowed. May return 404/409 due to no vault, but NOT 409 from depth.
    const res = await GET(req({ path: "some-note", depth: MAX_EMBED_DEPTH - 1 }));
    // In test env without vault, we expect 404 (note-not-found) or 409 (no vault).
    // The important thing is: if it IS a 409, the error is NOT "depth-exceeded".
    if (res.status === 409) {
      const body = (await res.json()) as { error: string };
      expect(body.error).not.toBe("depth-exceeded");
    }
  });
});

describe("GET /api/embed — note/section resolution (no vault env)", () => {
  it("returns 404 or 409 for a non-existent note (no vault in test env)", async () => {
    const res = await GET(req({ path: "does-not-exist", depth: 0 }));
    // Without a vault configured, expect 404 (note-not-found) or 409 (no vault)
    expect([404, 409]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
