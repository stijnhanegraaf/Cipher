/**
 * GET /api/audit-dashboard — returns audit dashboard data from the vault.
 *
 * Reads wiki/system/audits/dashboard.md and parses overall status + per-audit rows.
 * Also reads wiki/system/audits/latest-*.md files for real-time data.
 *
 * Response: { overallStatus, audits: [{ name, status, lastRun, details }] }
 */

import { NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "@/lib/vault-reader";
import { log } from "@/lib/log";

interface AuditEntry {
  name: string;
  status: string;
  lastRun: string;
  details: string;
}

interface AuditDashboardResponse {
  overallStatus: string;
  audits: AuditEntry[];
}

function parseStatusFromMarkdown(body: string): string {
  // Match emoji status markers
  const statusMatch = body.match(/^##\s+Status\s*\n\s*(🟢|🟡|🔴)/m);
  if (statusMatch) {
    const emoji = statusMatch[1];
    if (emoji === "🔴") return "red";
    if (emoji === "🟡") return "yellow";
    if (emoji === "🟢") return "green";
  }
  return "green";
}

function emojiToStatus(emoji: string): string {
  if (emoji === "🔴") return "red";
  if (emoji === "🟡") return "yellow";
  return "green";
}

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---")) return { frontmatter: {}, body: raw };
  const end = raw.indexOf("---", 3);
  if (end === -1) return { frontmatter: {}, body: raw };
  try {
    const fmText = raw.slice(3, end).trim();
    // Simple YAML parsing for frontmatter
    const frontmatter: Record<string, unknown> = {};
    for (const line of fmText.split("\n")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        let value: unknown = line.slice(colonIdx + 1).trim();
        // Remove quotes
        if (typeof value === "string" && value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        frontmatter[key] = value;
      }
    }
    return { frontmatter, body: raw.slice(end + 3).replace(/^\n+/, "") };
  } catch {
    return { frontmatter: {}, body: raw };
  }
}

function parseAuditRowsFromTable(body: string): AuditEntry[] {
  const audits: AuditEntry[] = [];
  // Parse markdown table rows
  const lines = body.split("\n");
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("| Audit |") || line.startsWith("|---|")) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith("|")) {
      const cells = line.split("|").filter(c => c.trim() !== "");
      if (cells.length >= 4) {
        const name = cells[0].trim();
        const _cadence = cells[1].trim();
        const lastRun = cells[2].trim();
        const statusEmoji = cells[3].trim();
        const details = cells.length >= 5 ? cells[4].trim() : "";

        audits.push({
          name,
          status: emojiToStatus(statusEmoji),
          lastRun: lastRun === "-" ? "" : lastRun,
          details,
        });
      }
    } else if (inTable && !line.startsWith("|")) {
      inTable = false;
    }
  }
  return audits;
}

function parseOverallStatus(body: string): string {
  const match = body.match(/^##\s+Right now:\s*(🟢|🟡|🔴)/m);
  if (match) {
    return emojiToStatus(match[1]);
  }
  return "green";
}

async function readLatestAudits(vaultPath: string): Promise<Map<string, string>> {
  const latestMap = new Map<string, string>();
  const auditsDir = join(vaultPath, "wiki/system/audits");

  try {
    const files = await readdir(auditsDir);
    const latestFiles = files.filter(f => f.startsWith("latest-") && f.endsWith(".md"));

    for (const file of latestFiles) {
      const name = file.replace("latest-", "").replace(".md", "");
      const content = await readFile(join(auditsDir, file), "utf8");
      const { body } = parseFrontmatter(content);
      latestMap.set(name, body);
    }
  } catch {
    // audits dir may not exist yet
  }

  return latestMap;
}

export async function GET() {
  try {
    const vaultPath = getVaultPath();
    if (!vaultPath) {
      return NextResponse.json(
        { error: "No vault connected", overallStatus: "unknown", audits: [] },
        { status: 409 }
      );
    }

    const dashboardPath = join(vaultPath, "wiki/system/audits/dashboard.md");
    let dashboardBody: string;

    try {
      const raw = await readFile(dashboardPath, "utf8");
      const parsed = parseFrontmatter(raw);
      dashboardBody = parsed.body;
    } catch {
      // Dashboard file doesn't exist yet, return empty
      return NextResponse.json({
        overallStatus: "unknown",
        audits: [],
      });
    }

    const overallStatus = parseOverallStatus(dashboardBody);
    const auditRows = parseAuditRowsFromTable(dashboardBody);

    // Enrich with real-time data from latest-*.md files
    const latestAudits = await readLatestAudits(vaultPath);

    const enrichedAudits = auditRows.map(audit => {
      const latestBody = latestAudits.get(audit.name);
      if (latestBody) {
        // Override status from latest file if available
        const latestStatus = parseStatusFromMarkdown(latestBody);
        return {
          ...audit,
          status: latestStatus,
        };
      }
      return audit;
    });

    const response: AuditDashboardResponse = {
      overallStatus,
      audits: enrichedAudits,
    };

    return NextResponse.json(response);
  } catch (error) {
    log.error("audit-dashboard", "API error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load audit dashboard" },
      { status: 500 }
    );
  }
}