/**
 * Builds the "System Status" ViewModel from status.md + open-loops.md
 * + the vault-health scanner (broken links, stale notes, activity).
 */

import type { ViewModel, SystemStatusData, StatusItem } from "../view-models";
import {
  parseCheckboxes,
  parseKeyValuePairs,
  getSection,
  readSystemStatus,
  readOpenLoops,
} from "../vault-reader";
import { uid, stripLinks, toStatus, sourceRef } from "./shared";
import { log } from "../log";

export async function buildSystemStatus(): Promise<ViewModel> {
  const { file: statusFile } = await readSystemStatus();
  const { file: loopsFile } = await readOpenLoops();

  const checks: StatusItem[] = [];
  let overallStatus: "ok" | "warn" | "error" | "stale" | "fresh" = "ok";
  let overallLabel = "Healthy";

  if (statusFile) {
    // Parse "At a glance" — key-value pairs
    const glanceSection = getSection(statusFile, "At a glance");
    if (glanceSection) {
      const cbItems = parseCheckboxes(glanceSection.body);
      if (cbItems.length > 0) {
        for (const item of cbItems) {
          const text = stripLinks(item.text);
          const status: "ok" | "warn" | "error" | "stale" | "fresh" = item.checked ? "ok" : "warn";
          let detail = item.checked ? "Active" : "Needs attention";
          if (/\berror\b/i.test(text)) detail = "Error detected";
          else if (/\bstale\b|\bold\b|\boutdated\b/i.test(text)) detail = "May be outdated";
          else if (/\bhealthy\b|\bgreen\b/i.test(text)) detail = "Healthy";
          checks.push({ label: text, status, detail });
        }
      } else {
        const kvs = parseKeyValuePairs(glanceSection.body);
        for (const [key, value] of Object.entries(kvs)) {
          const status = toStatus(value);
          if (status === "warn" || status === "error") overallStatus = status;
          checks.push({ label: key, status, detail: value });
        }
      }
    }

    // Parse "Runtime" section
    const runtimeSection = getSection(statusFile, "Runtime");
    if (runtimeSection) {
      for (const line of runtimeSection.body.split("\n")) {
        const clean = line.trim();
        // Lines like: `main` = direct chat
        const match = clean.match(/^`?(\w+)`?\s*[=–—]\s*(.+)/);
        if (match) {
          checks.push({ label: match[1], status: "ok", detail: match[2].trim() });
        }
        // Also handle - `agent` = description
        const bulletMatch = clean.match(/^[-*]\s*`?(\w+)`?\s*[=–—]\s*(.+)/);
        if (bulletMatch) {
          checks.push({ label: bulletMatch[1], status: "ok", detail: bulletMatch[2].trim() });
        }
      }
    }

    // Parse "Cron state" section
    const cronSection = getSection(statusFile, "Cron state");
    if (cronSection) {
      const kvs = parseKeyValuePairs(cronSection.body);
      for (const [key, value] of Object.entries(kvs)) {
        const status = toStatus(value);
        checks.push({ label: key, status, detail: value });
      }
      const cbItems = parseCheckboxes(cronSection.body);
      for (const item of cbItems) {
        checks.push({
          label: stripLinks(item.text),
          status: item.checked ? "ok" : "warn",
        });
      }
    }

    // Determine overall status
    if (checks.some((c) => c.status === "error")) {
      overallStatus = "error";
      overallLabel = "Issues detected";
    } else if (checks.some((c) => c.status === "warn")) {
      overallStatus = "warn";
      overallLabel = "Healthy with active maintenance";
    }
  }

  // Add attention items from open loops
  const attention: string[] = [];
  if (loopsFile) {
    // Add section-level items as attention items
    for (const section of loopsFile.sections) {
      const lines = section.body
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter((l) => l.length > 10 && !l.startsWith("#") && !l.startsWith("---"));
      for (const line of lines) {
        attention.push(stripLinks(line));
      }
    }
    // Also pick up unchecked items
    const checkboxes = parseCheckboxes(loopsFile.content);
    for (const cb of checkboxes) {
      if (!cb.checked) {
        const text = stripLinks(cb.text);
        if (!attention.some((a) => a.includes(text.slice(0, 20)))) {
          attention.push(text);
        }
      }
    }
  }

  // Vault-wide health metrics (broken links, stale notes, 30-day activity).
  // Best-effort — if the scan fails we still return the existing checks.
  let health: import("../view-models").VaultHealthMetrics | undefined;
  try {
    const { buildVaultHealth } = await import("../vault-health");
    health = (await buildVaultHealth()) ?? undefined;
    if (health) {
      if (health.brokenLinks.count > 0) {
        checks.push({
          label: "Broken links",
          status: health.brokenLinks.count > 20 ? "error" : "warn",
          detail: `${health.brokenLinks.count} unresolved wiki-links`,
        });
        if (overallStatus === "ok") overallStatus = "warn";
      }
      if (health.staleNotes.count > 0) {
        checks.push({
          label: "Stale notes",
          status: health.staleNotes.count > 50 ? "warn" : "ok",
          detail: `${health.staleNotes.count} untouched for 30+ days`,
        });
      }
    }
  } catch (e) {
    log.warn("view-builder", "vault health scan failed", e);
  }

  const data: SystemStatusData = {
    overall: { label: overallLabel, status: overallStatus },
    checks,
    attention: attention.length > 0 ? attention.slice(0, 8) : undefined,
    health,
  };

  return {
    type: "system_status",
    viewId: uid("view_sys"),
    title: "System Health",
    layout: "stack",
    data,
    sources: [
      ...(statusFile ? [sourceRef("System Status", statusFile.path, "system")] : []),
      ...(loopsFile ? [sourceRef("Open Loops", loopsFile.path, "system")] : []),
    ],
    actions: statusFile
      ? [{ id: uid("act"), type: "open_note", label: "Open System Status", target: { path: statusFile.path }, safety: "safe" }]
      : [],
    sourceFile: statusFile?.path,
    meta: { confidence: 0.95, freshness: "fresh", generatedAt: new Date().toISOString(), primarySourceCount: 2 },
  };
}

