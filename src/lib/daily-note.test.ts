import { describe, it, expect } from "vitest";
import { formatDailyDate, dailyNotePath, parseDateParam, defaultTemplate } from "./daily-note";
import { parseFrontmatter } from "@/lib/markdown/frontmatter";

// ─── formatDailyDate ─────────────────────────────────────────────────────────

describe("formatDailyDate", () => {
  it("formats a date with zero-padded single-digit month and day", () => {
    // January 5 → "2026-01-05"
    const d = new Date(2026, 0, 5); // local midnight, month 0 = January
    expect(formatDailyDate(d)).toBe("2026-01-05");
  });

  it("uses LOCAL time components, not UTC", () => {
    // Construct a Date in local time — getFullYear/getMonth/getDate match it.
    const d = new Date(2026, 5, 27); // June 27, 2026 local
    expect(formatDailyDate(d)).toBe("2026-06-27");
  });

  it("zero-pads single-digit month and day", () => {
    const d = new Date(2026, 2, 3); // March 3
    expect(formatDailyDate(d)).toBe("2026-03-03");
  });

  it("handles December 31", () => {
    const d = new Date(2026, 11, 31); // December 31
    expect(formatDailyDate(d)).toBe("2026-12-31");
  });
});

// ─── dailyNotePath ────────────────────────────────────────────────────────────

describe("dailyNotePath", () => {
  const d = new Date(2026, 5, 27); // June 27, 2026

  it("joins a flat journal dir with the date basename", () => {
    expect(dailyNotePath("journal", d)).toBe("journal/2026-06-27.md");
  });

  it("works with a nested dir (e.g. wiki/journal)", () => {
    expect(dailyNotePath("wiki/journal", d)).toBe("wiki/journal/2026-06-27.md");
  });

  it("appends the .md extension", () => {
    expect(dailyNotePath("daily", d)).toMatch(/\.md$/);
  });
});

// ─── parseDateParam ───────────────────────────────────────────────────────────

describe("parseDateParam", () => {
  it("accepts a valid YYYY-MM-DD string", () => {
    const result = parseDateParam("2026-06-27");
    expect(result).not.toBeNull();
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(5); // June = 5
    expect(result?.getDate()).toBe(27);
  });

  it("rejects a non-string (number)", () => {
    expect(parseDateParam(42)).toBeNull();
  });

  it("rejects undefined", () => {
    expect(parseDateParam(undefined)).toBeNull();
  });

  it("rejects null", () => {
    expect(parseDateParam(null)).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(parseDateParam("")).toBeNull();
  });

  it("rejects a wrong-format string", () => {
    expect(parseDateParam("27-06-2026")).toBeNull();
  });

  it("rejects an invalid month (2026-13-01)", () => {
    // Month 13 doesn't exist
    expect(parseDateParam("2026-13-01")).toBeNull();
  });

  it("rejects a rolled-over date (2026-02-30)", () => {
    // Feb 30 → rolls to Mar 2 or 3; round-trip check catches this
    expect(parseDateParam("2026-02-30")).toBeNull();
  });

  it("rejects a non-date string of correct length", () => {
    expect(parseDateParam("not-a-date")).toBeNull();
  });

  it("round-trips valid dates", () => {
    const cases = ["2026-01-01", "2026-12-31", "2024-02-29"]; // 2024 is a leap year
    for (const s of cases) {
      const result = parseDateParam(s);
      expect(result).not.toBeNull();
      if (result) expect(formatDailyDate(result)).toBe(s);
    }
  });
});

// ─── defaultTemplate ──────────────────────────────────────────────────────────

describe("defaultTemplate", () => {
  const d = new Date(2026, 5, 27); // June 27, 2026

  it("starts with frontmatter fences", () => {
    const t = defaultTemplate(d);
    expect(t.startsWith("---\n")).toBe(true);
  });

  it("contains the ISO date in frontmatter", () => {
    const t = defaultTemplate(d);
    expect(t).toContain("date: 2026-06-27");
  });

  it("contains a heading with the ISO date", () => {
    const t = defaultTemplate(d);
    expect(t).toContain("# 2026-06-27");
  });

  it("parses cleanly via parseFrontmatter and has type: daily", () => {
    const t = defaultTemplate(d);
    const { frontmatter, content } = parseFrontmatter(t);
    expect(frontmatter.type).toBe("daily");
    expect(frontmatter.date).toBe("2026-06-27");
    // Content should contain the heading
    expect(content).toContain("# 2026-06-27");
  });
});
