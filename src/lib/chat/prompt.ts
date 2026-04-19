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
}

/** Returns the messages array to pass to ollama.streamChat. */
export function buildPrompt({ query, history, chunks }: BuildPromptArgs): OllamaMessage[] {
  const notesBlock = chunks.length === 0
    ? "(none)"
    : chunks.map((c, i) => {
        const label = c.heading ? `${c.path} — ${c.heading}` : c.path;
        return `[${i + 1}] ${label}\n    ${oneLine(c.text)}`;
      }).join("\n");

  const system: OllamaMessage = {
    role: "system",
    content: `${SYSTEM_PROMPT}\n\nNOTES:\n${notesBlock}`,
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

// ─── Citation parsing ─────────────────────────────────────────────────

export interface ParsedCitation {
  id: number;          // 1-indexed, matches chunk position in retrieve() output
  path: string;
  heading?: string;
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
    out.push({ id, path: c.path, heading: c.heading, snippet });
  }
  return out;
}
