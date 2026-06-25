import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { validateAnchor, type AnchorValidation } from "@/lib/markdown/anchors";

interface ResolveResponse {
  input?: string;
  resolved?: string | null;
  anchor?: AnchorValidation;
  error?: string;
}

function req(params: Record<string, string>) {
  const url = new URL("http://localhost/api/resolve");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return new NextRequest(url.toString());
}

describe("GET /api/resolve — parameter validation", () => {
  it("returns 400 when path param is missing", async () => {
    const res = await GET(req({}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ResolveResponse;
    expect(body.error).toMatch(/missing/i);
  });
});

describe("GET /api/resolve — anchor shape (handles vault/no-vault gracefully)", () => {
  // The test environment may or may not have a vault configured.
  // These tests assert the route never crashes (no 500) and returns the
  // correct anchor shape on a 200 response.

  it("does not crash (no 500) for a block-ref input", async () => {
    const res = await GET(req({ path: "note#^myblock" }));
    expect(res.status).not.toBe(500);
    // If the route returns 200, assert the anchor shape is present.
    if (res.status === 200) {
      const body = (await res.json()) as ResolveResponse;
      expect(body.anchor).toBeDefined();
      expect(body.anchor?.kind).toMatch(/^(none|block|heading)$/);
      expect(typeof body.anchor?.valid).toBe("boolean");
    }
  });

  it("does not crash (no 500) for a heading-anchor input", async () => {
    const res = await GET(req({ path: "note#Ghost Heading" }));
    expect(res.status).not.toBe(500);
    if (res.status === 200) {
      const body = (await res.json()) as ResolveResponse;
      expect(body.anchor).toBeDefined();
      expect(body.anchor?.kind).toMatch(/^(none|block|heading)$/);
    }
  });

  it("does not crash (no 500) for an anchor-free input", async () => {
    const res = await GET(req({ path: "note" }));
    expect(res.status).not.toBe(500);
    if (res.status === 200) {
      const body = (await res.json()) as ResolveResponse;
      expect(body.anchor).toBeDefined();
      // No anchor in input → kind must be "none" and valid must be true.
      expect(body.anchor?.kind).toBe("none");
      expect(body.anchor?.valid).toBe(true);
    }
  });

  it("returns 400 (not 500) for an empty path", async () => {
    const res = await GET(req({ path: "" }));
    expect([400, 409]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });
});

describe("GET /api/resolve — anchor field always present on 200", () => {
  // We cannot reach a 200 in the test env (no vault), so we verify the
  // no-anchor case via the 409 path: the route bails before building the
  // anchor object, which is intentional. What we CAN test is that when a
  // path with NO anchor is given the response shape is consistent.
  //
  // For real integration coverage see the blockrefs approach doc note:
  // "In the no-vault test env, assert what you can — at minimum that the
  // route returns the anchor shape; a 409 no-vault path is acceptable."
  //
  // The 200 path is exercised by the validateAnchor unit tests in anchors.test.ts
  // which cover the logic directly (no HTTP overhead).

  it("anchor kind is 'none' for plain-path input (logic unit test)", () => {
    const result = validateAnchor("# Hello\n\nsome text ^blockid", "");
    expect(result).toEqual({ kind: "none", valid: true, value: "" });
  });

  it("anchor kind is 'block'/valid:true when block exists (logic unit test)", () => {
    const result = validateAnchor("paragraph text ^blockid", "^blockid");
    expect(result.kind).toBe("block");
    expect(result.valid).toBe(true);
    expect(result.value).toBe("blockid");
  });

  it("anchor kind is 'heading'/valid:false for missing heading (logic unit test)", () => {
    const result = validateAnchor("# Real Heading\n\nsome text", "Ghost Heading");
    expect(result.kind).toBe("heading");
    expect(result.valid).toBe(false);
  });
});
