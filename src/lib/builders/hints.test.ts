import { describe, it, expect } from "vitest";
import { buildHints } from "./hints";

describe("buildHints", () => {
  it("dedups, trims, and caps to 5 each", () => {
    const r = buildHints(
      [" Alice ", "Alice", "Bob", "C", "D", "E", "F"],
      ["P1", "P1", "P2"]
    );
    expect(r.entities).toEqual(["Alice", "Bob", "C", "D", "E"]);
    expect(r.projects).toEqual(["P1", "P2"]);
  });
  it("drops empties", () => {
    expect(buildHints(["", "  ", "X"], [])).toEqual({ entities: ["X"], projects: [] });
  });
});
