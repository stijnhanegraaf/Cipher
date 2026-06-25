import { describe, it, expect } from "vitest";
import { safeJoin } from "./safe-join";

const ROOT = "/vault/root";

describe("safeJoin", () => {
  it("joins a normal relative path", () => {
    expect(safeJoin(ROOT, "notes/a.md")).toBe("/vault/root/notes/a.md");
  });

  it("allows the root itself", () => {
    expect(safeJoin(ROOT, "")).toBe("/vault/root");
  });

  it("rejects parent-escape", () => {
    expect(safeJoin(ROOT, "../secret")).toBeNull();
    expect(safeJoin(ROOT, "notes/../../secret")).toBeNull();
    expect(safeJoin(ROOT, "../../etc/passwd")).toBeNull();
  });

  it("rejects a sibling prefix collision", () => {
    // /vault/root-evil must NOT be considered inside /vault/root
    expect(safeJoin(ROOT, "../root-evil/x")).toBeNull();
  });

  it("normalizes redundant segments that stay inside", () => {
    expect(safeJoin(ROOT, "notes/./a.md")).toBe("/vault/root/notes/a.md");
  });
});
