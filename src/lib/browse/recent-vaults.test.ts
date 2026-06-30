import { describe, it, expect } from "vitest";
import { addRecentVault, removeRecentVault } from "./recent-vaults";

const mk = (path: string, name: string, lastOpened: number) => ({
  path,
  name,
  lastOpened,
});

describe("addRecentVault", () => {
  it("new entry goes first", () => {
    const list = [mk("/a", "A", 1)];
    const result = addRecentVault(list, mk("/b", "B", 2));
    expect(result[0].path).toBe("/b");
    expect(result[1].path).toBe("/a");
  });

  it("existing path moves to front, not duplicated", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2)];
    const result = addRecentVault(list, mk("/b", "B updated", 3));
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("/b");
    expect(result[1].path).toBe("/a");
  });

  it("lastOpened is updated when existing path moves to front", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2)];
    const result = addRecentVault(list, mk("/b", "B", 999));
    expect(result[0].lastOpened).toBe(999);
  });

  it("capped to 8 dropping oldest (last item)", () => {
    const list = Array.from({ length: 8 }, (_, i) =>
      mk(`/vault-${i}`, `Vault ${i}`, i)
    );
    const result = addRecentVault(list, mk("/new", "New", 100));
    expect(result).toHaveLength(8);
    expect(result[0].path).toBe("/new");
    // /vault-7 was last in the original list, so it is dropped
    expect(result.some((v) => v.path === "/vault-7")).toBe(false);
  });

  it("default cap is 8", () => {
    const list = Array.from({ length: 9 }, (_, i) =>
      mk(`/vault-${i}`, `Vault ${i}`, i)
    );
    const result = addRecentVault(list, mk("/new", "New", 100));
    expect(result).toHaveLength(8);
  });

  it("custom cap is respected", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2)];
    const result = addRecentVault(list, mk("/c", "C", 3), 2);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("/c");
    expect(result[1].path).toBe("/a");
  });

  it("input list is not mutated", () => {
    const list = [mk("/a", "A", 1)];
    const snapshot = [...list];
    addRecentVault(list, mk("/b", "B", 2));
    expect(list).toEqual(snapshot);
  });

  it("works on empty list", () => {
    const result = addRecentVault([], mk("/a", "A", 1));
    expect(result).toEqual([mk("/a", "A", 1)]);
  });
});

describe("removeRecentVault", () => {
  it("drops the entry with the given path", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2), mk("/c", "C", 3)];
    const result = removeRecentVault(list, "/b");
    expect(result).toHaveLength(2);
    expect(result.some((v) => v.path === "/b")).toBe(false);
  });

  it("preserves order of remaining entries", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2), mk("/c", "C", 3)];
    const result = removeRecentVault(list, "/b");
    expect(result[0].path).toBe("/a");
    expect(result[1].path).toBe("/c");
  });

  it("no-op if path not found", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2)];
    const result = removeRecentVault(list, "/z");
    expect(result).toHaveLength(2);
  });

  it("input list is not mutated", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2)];
    const snapshot = [...list];
    removeRecentVault(list, "/a");
    expect(list).toEqual(snapshot);
  });

  it("empty list returns empty list", () => {
    expect(removeRecentVault([], "/a")).toEqual([]);
  });

  it("removes first entry", () => {
    const list = [mk("/a", "A", 1), mk("/b", "B", 2)];
    const result = removeRecentVault(list, "/a");
    expect(result).toEqual([mk("/b", "B", 2)]);
  });
});
