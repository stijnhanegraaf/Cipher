import { describe, it, expect } from "vitest";
import { parseTable } from "@/lib/vault-reader";
import {
  emojiToStatus,
  parseOverallStatus,
  parseLatestStatus,
  parseAuditRows,
} from "./parse";

// ─── emojiToStatus ───────────────────────────────────────────────────

describe("emojiToStatus", () => {
  it("maps 🟢 to ok", () => expect(emojiToStatus("🟢")).toBe("ok"));
  it("maps 🟡 to warn", () => expect(emojiToStatus("🟡")).toBe("warn"));
  it("maps 🔴 to error", () => expect(emojiToStatus("🔴")).toBe("error"));
  it("maps empty string to unknown", () => expect(emojiToStatus("")).toBe("unknown"));
  it("maps unrecognised text to unknown", () => expect(emojiToStatus("junk")).toBe("unknown"));
  it("maps emoji embedded in longer string", () => expect(emojiToStatus("status: 🟡 warn")).toBe("warn"));
});

// ─── parseOverallStatus ──────────────────────────────────────────────

describe("parseOverallStatus", () => {
  it("parses warn from ## Right now: 🟡", () => {
    expect(parseOverallStatus("## Right now: 🟡\nsome body")).toBe("warn");
  });
  it("parses ok from ## Right now: 🟢", () => {
    expect(parseOverallStatus("## Right now: 🟢\nsome body")).toBe("ok");
  });
  it("parses error from ## Right now: 🔴", () => {
    expect(parseOverallStatus("## Right now: 🔴\nsome body")).toBe("error");
  });
  it("returns unknown when section is missing — NOT green (fixes default-to-green bug)", () => {
    expect(parseOverallStatus("No right-now section here")).toBe("unknown");
  });
  it("returns unknown for empty body", () => {
    expect(parseOverallStatus("")).toBe("unknown");
  });
});

// ─── parseLatestStatus ───────────────────────────────────────────────

describe("parseLatestStatus", () => {
  it("parses error from ## Status section", () => {
    const body = "# Audit Name\n\n## Status\n🔴 Something is broken\n";
    expect(parseLatestStatus(body)).toBe("error");
  });
  it("parses ok from ## Status section", () => {
    const body = "## Status\n🟢 All good\n";
    expect(parseLatestStatus(body)).toBe("ok");
  });
  it("returns unknown when ## Status section is absent", () => {
    expect(parseLatestStatus("No status section")).toBe("unknown");
  });
});

// ─── parseAuditRows ──────────────────────────────────────────────────

// Canonical table (Audit | Cadence | Last Run | Status | Details).
const CANONICAL_MD = `
| Audit | Cadence | Last Run | Status | Details |
|---|---|---|---|---|
| Security scan | weekly | 2024-01-15 | 🟢 | All clear |
| Dependency check | monthly | 2024-01-10 | 🟡 | 3 outdated |
| Data backup | daily | - | 🔴 | Failed |
`.trim();

// Same columns but in a DIFFERENT order — proves header-name resolution.
const SWAPPED_MD = `
| Details | Status | Audit | Last Run | Cadence |
|---|---|---|---|---|
| All clear | 🟢 | Security scan | 2024-01-15 | weekly |
| 3 outdated | 🟡 | Dependency check | 2024-01-10 | monthly |
| Failed | 🔴 | Data backup | - | daily |
`.trim();

// Table missing the Details column entirely.
const NO_DETAILS_MD = `
| Audit | Last Run | Status |
|---|---|---|
| My audit | 2024-02-01 | 🟢 |
`.trim();

describe("parseAuditRows", () => {
  it("parses canonical table correctly", () => {
    const rows = parseAuditRows(parseTable(CANONICAL_MD));
    expect(rows).toHaveLength(3);

    expect(rows[0]).toEqual({ name: "Security scan", status: "ok", lastRun: "2024-01-15", details: "All clear" });
    expect(rows[1]).toEqual({ name: "Dependency check", status: "warn", lastRun: "2024-01-10", details: "3 outdated" });
    expect(rows[2]).toEqual({ name: "Data backup", status: "error", lastRun: "", details: "Failed" });
  });

  it("produces identical results from header-order-swapped table (proves name resolution)", () => {
    const canonical = parseAuditRows(parseTable(CANONICAL_MD));
    const swapped = parseAuditRows(parseTable(SWAPPED_MD));
    expect(swapped).toEqual(canonical);
  });

  it("normalises '-' lastRun to empty string", () => {
    const rows = parseAuditRows(parseTable(CANONICAL_MD));
    expect(rows[2].lastRun).toBe("");
  });

  it("returns empty string for details when Details column is absent", () => {
    const rows = parseAuditRows(parseTable(NO_DETAILS_MD));
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toBe("");
    expect(rows[0].name).toBe("My audit");
    expect(rows[0].status).toBe("ok");
  });

  it("returns [] for empty table input", () => {
    expect(parseAuditRows(parseTable(""))).toEqual([]);
  });

  it("returns [] for non-table input", () => {
    expect(parseAuditRows(parseTable("just some prose"))).toEqual([]);
  });

  it("defaults missing status emoji to unknown — NOT green (key regression guard)", () => {
    const md = `
| Audit | Status |
|---|---|
| No-emoji audit |  |
`.trim();
    const rows = parseAuditRows(parseTable(md));
    expect(rows[0].status).toBe("unknown");
  });
});
