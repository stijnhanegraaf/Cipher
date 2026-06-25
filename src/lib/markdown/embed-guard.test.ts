import { describe, it, expect } from "vitest";
import { checkGuard, MAX_EMBED_DEPTH } from "./embed-guard";

describe("checkGuard — depth boundary", () => {
  it("depth 0 with empty chain → ok", () => {
    expect(checkGuard(0, [], "a.md")).toEqual({ ok: true });
  });

  it("depth MAX-1 with empty chain → ok", () => {
    expect(checkGuard(MAX_EMBED_DEPTH - 1, [], "a.md")).toEqual({ ok: true });
  });

  it("depth MAX → depth-exceeded", () => {
    const result = checkGuard(MAX_EMBED_DEPTH, [], "a.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("depth");
  });

  it("depth MAX+1 → depth-exceeded", () => {
    const result = checkGuard(MAX_EMBED_DEPTH + 1, [], "a.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("depth");
  });
});

describe("checkGuard — cycle detection", () => {
  it("target not in ancestors → ok", () => {
    expect(checkGuard(1, ["a.md", "b.md"], "c.md")).toEqual({ ok: true });
  });

  it("self-embed: target equals first ancestor → cycle", () => {
    const result = checkGuard(1, ["a.md"], "a.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cycle");
  });

  it("A→B→A two-hop cycle: target appears earlier in chain → cycle", () => {
    const result = checkGuard(2, ["a.md", "b.md"], "a.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cycle");
  });

  it("target is last ancestor → cycle", () => {
    const result = checkGuard(1, ["a.md", "b.md", "c.md"], "c.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("cycle");
  });

  it("depth check wins over cycle check (both failing)", () => {
    // When depth >= MAX and target is also a cycle, reason should be "depth"
    // because depth is checked first.
    const result = checkGuard(MAX_EMBED_DEPTH, ["a.md"], "a.md");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("depth");
  });
});
