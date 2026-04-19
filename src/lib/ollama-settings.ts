/**
 * Ollama connection settings persisted to `<vault>/.cipher/ollama.json`.
 *
 * Supports two modes:
 *   - local: http://localhost:11434, no auth.
 *   - cloud: https://ollama.com, Bearer <apiKey>.
 *
 * The API key lives in the vault (not localStorage) so it never leaves
 * the server. GET returns whether a key is set, never the key itself.
 */

import "server-only";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "./vault-reader";
import { log } from "./log";

export type OllamaMode = "local" | "cloud";

export interface OllamaSettings {
  mode: OllamaMode;
  apiKey?: string;
  /** Custom base URL override (defaults to mode-appropriate URL). */
  baseUrl?: string;
}

const FILE_REL = ".cipher/ollama.json";
const DEFAULT: OllamaSettings = { mode: "local" };

export const LOCAL_BASE = "http://localhost:11434";
export const CLOUD_BASE = "https://ollama.com";

export async function readOllamaSettings(): Promise<OllamaSettings> {
  const root = getVaultPath();
  if (!root) return DEFAULT;
  try {
    const raw = await readFile(join(root, FILE_REL), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed?.mode !== "local" && parsed?.mode !== "cloud") return DEFAULT;
    return {
      mode: parsed.mode,
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : undefined,
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : undefined,
    };
  } catch {
    return DEFAULT;
  }
}

export async function writeOllamaSettings(next: OllamaSettings): Promise<void> {
  const root = getVaultPath();
  if (!root) throw new Error("No vault connected");
  const dir = join(root, ".cipher");
  const file = join(dir, "ollama.json");
  const tmp = file + ".tmp";
  await mkdir(dir, { recursive: true });
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf-8");
  await rename(tmp, file);
  log.info("ollama-settings", "saved", { mode: next.mode, hasKey: !!next.apiKey });
}

export function resolveBase(s: OllamaSettings): string {
  if (s.baseUrl) return s.baseUrl.replace(/\/+$/, "");
  return s.mode === "cloud" ? CLOUD_BASE : LOCAL_BASE;
}

export function resolveHeaders(s: OllamaSettings): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (s.mode === "cloud" && s.apiKey) h["Authorization"] = `Bearer ${s.apiKey}`;
  return h;
}
