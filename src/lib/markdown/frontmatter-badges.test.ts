import { describe, it, expect } from "vitest";
import { getBadgeVariant, selectFrontmatterBadges } from "./frontmatter-badges";

// ─── getBadgeVariant ──────────────────────────────────────────────────────────

describe("getBadgeVariant", () => {
  it("returns success for 'active'", () => {
    expect(getBadgeVariant("status", "active")).toBe("success");
  });

  it("returns success for 'done'", () => {
    expect(getBadgeVariant("status", "done")).toBe("success");
  });

  it("returns success for 'complete'", () => {
    expect(getBadgeVariant("status", "complete")).toBe("success");
  });

  it("returns success for 'healthy'", () => {
    expect(getBadgeVariant("status", "healthy")).toBe("success");
  });

  it("returns success for 'ok'", () => {
    expect(getBadgeVariant("status", "ok")).toBe("success");
  });

  it("returns success for 'fresh'", () => {
    expect(getBadgeVariant("status", "fresh")).toBe("success");
  });

  it("returns success for 'live'", () => {
    expect(getBadgeVariant("status", "live")).toBe("success");
  });

  it("returns success for 'Active' (case-insensitive)", () => {
    expect(getBadgeVariant("status", "Active")).toBe("success");
  });

  it("returns warning for 'stale'", () => {
    expect(getBadgeVariant("status", "stale")).toBe("warning");
  });

  it("returns warning for 'deprecated'", () => {
    expect(getBadgeVariant("status", "deprecated")).toBe("warning");
  });

  it("returns warning for 'archived'", () => {
    expect(getBadgeVariant("status", "archived")).toBe("warning");
  });

  it("returns warning for 'inactive'", () => {
    expect(getBadgeVariant("status", "inactive")).toBe("warning");
  });

  it("returns indigo for 'project'", () => {
    expect(getBadgeVariant("type", "project")).toBe("indigo");
  });

  it("returns indigo for 'entity'", () => {
    expect(getBadgeVariant("type", "entity")).toBe("indigo");
  });

  it("returns indigo for 'system'", () => {
    expect(getBadgeVariant("type", "system")).toBe("indigo");
  });

  it("returns indigo for 'area'", () => {
    expect(getBadgeVariant("type", "area")).toBe("indigo");
  });

  it("returns outline for an unknown value", () => {
    expect(getBadgeVariant("status", "in-progress")).toBe("outline");
  });

  it("returns outline for an empty value", () => {
    expect(getBadgeVariant("status", "")).toBe("outline");
  });
});

// ─── selectFrontmatterBadges ──────────────────────────────────────────────────

describe("selectFrontmatterBadges", () => {
  it("returns empty array for empty frontmatter", () => {
    expect(selectFrontmatterBadges({})).toEqual([]);
  });

  it("returns empty array when no badge keys are present", () => {
    expect(selectFrontmatterBadges({ title: "My Note", date: "2024-01-01" })).toEqual([]);
  });

  it("picks 'type' key with correct variant", () => {
    const badges = selectFrontmatterBadges({ type: "project" });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "type", value: "project", variant: "indigo" });
  });

  it("picks 'status' key with correct variant", () => {
    const badges = selectFrontmatterBadges({ status: "active" });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "status", value: "active", variant: "success" });
  });

  it("picks 'area' key", () => {
    const badges = selectFrontmatterBadges({ area: "work" });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "area", value: "work" });
  });

  it("picks 'kind' key", () => {
    const badges = selectFrontmatterBadges({ kind: "entity" });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "kind", value: "entity", variant: "indigo" });
  });

  it("picks 'priority' key", () => {
    const badges = selectFrontmatterBadges({ priority: "high" });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "priority", value: "high" });
  });

  it("picks 'freshness' key", () => {
    const badges = selectFrontmatterBadges({ freshness: "stale" });
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ key: "freshness", value: "stale", variant: "warning" });
  });

  it("respects badge key order: type, area, status, kind, priority, freshness", () => {
    const badges = selectFrontmatterBadges({
      freshness: "fresh",
      status: "active",
      type: "project",
    });
    const keys = badges.map((b) => b.key);
    expect(keys).toEqual(["type", "status", "freshness"]);
  });

  it("ignores badge keys whose values are not strings", () => {
    const badges = selectFrontmatterBadges({ status: 42, type: null });
    expect(badges).toEqual([]);
  });

  it("coerces string values — includes all present badge keys", () => {
    const badges = selectFrontmatterBadges({ type: "project", status: "done" });
    expect(badges).toHaveLength(2);
  });

  it("skips keys with empty string value", () => {
    const badges = selectFrontmatterBadges({ status: "" });
    expect(badges).toHaveLength(0);
  });
});
