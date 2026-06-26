import { describe, it, expect } from "vitest";
import { computeOutgoingLinks, dropSelfLinks } from "./outgoing";

/** Build a resolver from a record of target → resolved path (or null). */
function resolver(map: Record<string, string | null>) {
  return (t: string): Promise<string | null> => Promise.resolve(map[t] ?? null);
}

describe("computeOutgoingLinks", () => {
  it("marks a resolvable link resolved with its resolvedPath and broken:false", async () => {
    const result = await computeOutgoingLinks(
      [{ path: "foo", label: "Foo" }],
      resolver({ foo: "wiki/foo.md" }),
    );
    expect(result).toEqual([
      { target: "foo", label: "Foo", resolvedPath: "wiki/foo.md", broken: false },
    ]);
  });

  it("marks an unresolvable link broken with resolvedPath:null and broken:true", async () => {
    const result = await computeOutgoingLinks(
      [{ path: "ghost", label: "Ghost" }],
      resolver({}),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ resolvedPath: null, broken: true });
  });

  it("dedupes two links that resolve to the same path, keeping first-appearance label", async () => {
    const result = await computeOutgoingLinks(
      [
        { path: "a", label: "A" },
        { path: "wiki/a", label: "Alias" },
      ],
      resolver({ a: "wiki/a.md", "wiki/a": "wiki/a.md" }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("A");
    expect(result[0].resolvedPath).toBe("wiki/a.md");
  });

  it("dedupes two broken targets that differ only in case (case-insensitive dedupe)", async () => {
    const result = await computeOutgoingLinks(
      [
        { path: "X", label: "X" },
        { path: "x", label: "x" },
        { path: "y", label: "y" },
      ],
      resolver({}),
    );
    // X and x collapse into one; y is separate
    expect(result).toHaveLength(2);
    expect(result[0].target).toBe("X");
    expect(result[1].target).toBe("y");
  });

  it("keeps two broken links with different targets as separate entries", async () => {
    const result = await computeOutgoingLinks(
      [
        { path: "alpha", label: "Alpha" },
        { path: "beta", label: "Beta" },
      ],
      resolver({}),
    );
    expect(result).toHaveLength(2);
  });

  it("preserves first-appearance order", async () => {
    const result = await computeOutgoingLinks(
      [
        { path: "b", label: "B" },
        { path: "a", label: "A" },
      ],
      resolver({ a: "a.md", b: "b.md" }),
    );
    expect(result.map((x) => x.target)).toEqual(["b", "a"]);
  });

  it("returns an empty array when given no links", async () => {
    const result = await computeOutgoingLinks([], resolver({}));
    expect(result).toEqual([]);
  });
});

describe("dropSelfLinks", () => {
  it("removes a link resolving to the current note (exact path)", () => {
    const links = [
      { target: "self", label: "self", resolvedPath: "wiki/n.md", broken: false },
      { target: "other", label: "o", resolvedPath: "wiki/o.md", broken: false },
    ];
    const result = dropSelfLinks(links, "wiki/n.md");
    expect(result.map((l) => l.target)).toEqual(["other"]);
  });

  it("drops a self-link whose resolvedPath has a trailing anchor (anchor-insensitive)", () => {
    const links = [
      { target: "self#Sec", label: "self", resolvedPath: "wiki/n.md#Sec", broken: false },
      { target: "other", label: "o", resolvedPath: "wiki/o.md", broken: false },
    ];
    const result = dropSelfLinks(links, "wiki/n.md");
    expect(result.map((l) => l.target)).toEqual(["other"]);
  });

  it("keeps broken (unresolved) links even when target matches selfPath", () => {
    const links = [
      { target: "wiki/n.md", label: "self?", resolvedPath: null, broken: true },
    ];
    const result = dropSelfLinks(links, "wiki/n.md");
    expect(result).toHaveLength(1);
  });

  it("returns all links when none are self-links", () => {
    const links = [
      { target: "a", label: "A", resolvedPath: "a.md", broken: false },
      { target: "b", label: "B", resolvedPath: "b.md", broken: false },
    ];
    expect(dropSelfLinks(links, "self.md")).toHaveLength(2);
  });
});
