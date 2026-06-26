import { describe, it, expect } from "vitest";
import { SEARCH_KIND_ORDER, SEARCH_KIND_LABEL, toSearchKind } from "./search-kinds";

/** All outputs kindFromPath can produce (shared.ts:101-111). */
const KIND_FROM_PATH_OUTPUTS = [
  "entity",
  "project",
  "research",
  "system",
  "work",
  "personal",
  "journal",
  "memory",
  "note",
] as const;

describe("SEARCH_KIND_ORDER", () => {
  it("drift guard: SEARCH_KIND_ORDER contains every kindFromPath output", () => {
    const orderSet = new Set(SEARCH_KIND_ORDER as readonly string[]);
    for (const k of KIND_FROM_PATH_OUTPUTS) {
      expect(orderSet.has(k), `SEARCH_KIND_ORDER missing kind '${k}'`).toBe(true);
    }
  });

  it("ends with 'other' as the catch-all bucket", () => {
    expect(SEARCH_KIND_ORDER[SEARCH_KIND_ORDER.length - 1]).toBe("other");
  });

  it("has no duplicate entries", () => {
    const unique = new Set(SEARCH_KIND_ORDER);
    expect(unique.size).toBe(SEARCH_KIND_ORDER.length);
  });
});

describe("SEARCH_KIND_LABEL", () => {
  it("has a label for every entry in SEARCH_KIND_ORDER", () => {
    for (const k of SEARCH_KIND_ORDER) {
      expect(SEARCH_KIND_LABEL[k], `missing label for '${k}'`).toBeTruthy();
    }
  });
});

describe("toSearchKind", () => {
  it.each(KIND_FROM_PATH_OUTPUTS)("passes through known kind '%s'", (kind) => {
    expect(toSearchKind(kind)).toBe(kind);
  });

  it("maps undefined to 'other'", () => {
    expect(toSearchKind(undefined)).toBe("other");
  });

  it("maps unknown string to 'other'", () => {
    expect(toSearchKind("canonical_note")).toBe("other");
  });

  it("maps empty string to 'other'", () => {
    expect(toSearchKind("")).toBe("other");
  });

  it("maps old view vocab 'topic' to 'other'", () => {
    expect(toSearchKind("topic")).toBe("other");
  });

  it("maps old view vocab 'derived_index' to 'other'", () => {
    expect(toSearchKind("derived_index")).toBe("other");
  });

  it("maps old view vocab 'runtime_status' to 'other'", () => {
    expect(toSearchKind("runtime_status")).toBe("other");
  });

  it("regression: 'canonical_note' (old view vocab) must NOT pass through — goes to 'other'", () => {
    expect(toSearchKind("canonical_note")).toBe("other");
  });
});
