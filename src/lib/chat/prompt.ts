/**
 * Prompt assembly for the chat LLM path.
 *
 * Output is a flat OllamaMessage[] list:
 *   [{ role: "system", content: SYSTEM_PROMPT + "\n\nNOTES:\n..." },
 *    ...last-4 history turns,
 *    { role: "user", content: query }]
 *
 * Chunks are labelled [1]..[N] and carry their path + heading so citation
 * parsing can map [^N] markers back to source locations.
 */

import "server-only";
import type { ChatMessage as OllamaMessage } from "./providers";
import type { RetrievedChunk } from "./retrieval";
import { getVaultLayout } from "@/lib/vault-reader";
import { collectTags } from "@/lib/vault-tags";

export const SYSTEM_PROMPT = `You are Cipher, a research assistant grounded in the user's personal vault.
Answer the user's question using ONLY the provided notes. Cite each fact
with a marker like [^1] that matches a note index. If the notes do not
contain the answer, say so plainly — do not invent.`;

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface BuildPromptArgs {
  query: string;
  history: ChatHistoryTurn[];
  chunks: RetrievedChunk[];
  /** Pre-built vault structure summary from buildVaultStructureSummary(). */
  vaultSummary?: string;
}

/** Returns the messages array to pass to ollama.streamChat. */
export function buildPrompt({ query, history, chunks, vaultSummary }: BuildPromptArgs): OllamaMessage[] {
  // Prepend vault structure summary when available (budget-safe: it's compact).
  const systemBase = vaultSummary && vaultSummary.trim()
    ? `${SYSTEM_PROMPT}\n\n${vaultSummary}`
    : SYSTEM_PROMPT;

  const notesBlock = chunks.length === 0
    ? "(none)"
    : chunks.map((c, i) => {
        // Rich source label: path (title if different) + heading + top tags.
        const titlePart = c.title && c.title !== c.path.split("/").pop()?.replace(/\.md$/i, "")
          ? ` (${c.title})`
          : "";
        const headingPart = c.heading ? ` — ${c.heading}` : "";
        const tagPart = c.tags && c.tags.length > 0 ? ` [${c.tags.slice(0, 3).join(", ")}]` : "";
        return `[${i + 1}] ${c.path}${titlePart}${headingPart}${tagPart}\n    ${oneLine(c.text)}`;
      }).join("\n");

  const system: OllamaMessage = {
    role: "system",
    content: `${systemBase}\n\nNOTES:\n${notesBlock}`,
  };

  const trimmed = history.slice(-4).map<OllamaMessage>((t) => ({
    role: t.role,
    content: t.content,
  }));

  return [system, ...trimmed, { role: "user", content: query }];
}

function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ─── Vault structure summary ───────────────────────────────────────────

const MAX_SUMMARY_TAGS = 30;
const MAX_SUMMARY_NOTES = 60;
const MAX_SUMMARY_CHARS = 900; // hard cap to prevent context blowout

/**
 * Build a compact server-side summary of the vault's structure:
 *   - Folder roles (entities / projects / journal / …)
 *   - Top tags (by note count, capped)
 *   - Most-linked note titles (capped)
 *
 * Returns "" when no vault is connected. Never throws — errors are swallowed
 * so a missing/partial vault doesn't break the chat pipeline.
 */
export async function buildVaultStructureSummary(): Promise<string> {
  const parts: string[] = [];

  // 1. Folder roles.
  const layout = getVaultLayout();
  if (layout) {
    const roles: string[] = [];
    const roleMap: [string, string | null][] = [
      ["entities", layout.entitiesDir],
      ["projects", layout.projectsDir],
      ["journal", layout.journalDir],
      ["research", layout.researchDir],
      ["work", layout.workDir],
      ["system", layout.systemDir],
    ];
    for (const [role, dir] of roleMap) {
      if (dir) roles.push(`${role}:${dir}`);
    }
    if (roles.length > 0) {
      parts.push(`Vault folders: ${roles.join(" | ")}`);
    }
  }

  // 2. Top tags.
  try {
    const tags = await collectTags();
    const topTags = tags.slice(0, MAX_SUMMARY_TAGS).map((t) => `#${t.tag}`);
    if (topTags.length > 0) {
      parts.push(`Vault tags: ${topTags.join(" ")}`);
    }
  } catch {
    // Tags unavailable — skip section.
  }

  // 3. Most-linked note titles (requires the graph, which is cached).
  try {
    const { buildGraph } = await import("@/lib/vault-graph");
    const graph = await buildGraph();
    const titles = [...graph.nodes]
      .sort((a, b) => b.backlinks - a.backlinks)
      .slice(0, MAX_SUMMARY_NOTES)
      .map((n) => n.title);
    if (titles.length > 0) {
      parts.push(`Key notes (${titles.length}): ${titles.join(", ")}`);
    }
  } catch {
    // Graph unavailable — skip section.
  }

  if (parts.length === 0) return "";

  let summary = `[VAULT STRUCTURE]\n${parts.join("\n")}\n[/VAULT STRUCTURE]`;
  // Hard-truncate to prevent context blowout.
  if (summary.length > MAX_SUMMARY_CHARS) {
    summary = summary.slice(0, MAX_SUMMARY_CHARS - 3) + "...";
  }
  return summary;
}

// ─── Citation parsing ─────────────────────────────────────────────────

export interface ParsedCitation {
  id: number;          // 1-indexed, matches chunk position in retrieve() output
  path: string;
  heading?: string;
  /** Basename or frontmatter title — carried from the retrieved chunk. */
  title?: string;
  snippet: string;     // ≤ 180 chars, collapsed whitespace
}

/**
 * Scan `text` for unique [^N] markers and return one citation per unique
 * N that resolves to a retrieved chunk (1-indexed into `chunks`).
 */
export function parseCitations(text: string, chunks: RetrievedChunk[]): ParsedCitation[] {
  const seen = new Set<number>();
  const out: ParsedCitation[] = [];
  const re = /\[\^(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const id = parseInt(m[1], 10);
    if (!Number.isFinite(id) || id < 1 || id > chunks.length) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = chunks[id - 1];
    const snippet = oneLine(c.text).slice(0, 180);
    out.push({ id, path: c.path, heading: c.heading, title: c.title, snippet });
  }
  return out;
}
