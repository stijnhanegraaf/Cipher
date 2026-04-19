/**
 * LLM provider settings persisted to <vault>/.cipher/llm.json.
 *
 * Supports four active providers; only one is active at a time.
 *   - ollama-local: http://localhost:11434, no auth
 *   - ollama-cloud: https://ollama.com, Bearer <apiKey>
 *   - openai:       https://api.openai.com, Bearer <apiKey>
 *   - anthropic:    https://api.anthropic.com, x-api-key header
 *
 * API keys live per-provider so switching doesn't wipe stored keys.
 * GET /api/settings/llm returns hasKey booleans, never the keys themselves.
 */

import "server-only";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getVaultPath } from "./vault-reader";
import { log } from "./log";

export type ProviderId = "ollama-local" | "ollama-cloud" | "openai" | "anthropic";

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface LLMSettings {
  provider: ProviderId;
  ollamaLocal: ProviderConfig;
  ollamaCloud: ProviderConfig;
  openai: ProviderConfig;
  anthropic: ProviderConfig;
}

const FILE_REL = ".cipher/llm.json";

const DEFAULT: LLMSettings = {
  provider: "ollama-local",
  ollamaLocal: {},
  ollamaCloud: {},
  openai: {},
  anthropic: {},
};

const VALID_PROVIDERS: ProviderId[] = ["ollama-local", "ollama-cloud", "openai", "anthropic"];

export async function readLLMSettings(): Promise<LLMSettings> {
  const root = getVaultPath();
  if (!root) return DEFAULT;
  try {
    const raw = await readFile(join(root, FILE_REL), "utf-8");
    const parsed = JSON.parse(raw);
    const provider: ProviderId = VALID_PROVIDERS.includes(parsed?.provider) ? parsed.provider : "ollama-local";
    const coerce = (x: unknown): ProviderConfig => {
      if (!x || typeof x !== "object") return {};
      const o = x as Record<string, unknown>;
      return {
        apiKey: typeof o.apiKey === "string" ? o.apiKey : undefined,
        baseUrl: typeof o.baseUrl === "string" ? o.baseUrl : undefined,
      };
    };
    return {
      provider,
      ollamaLocal: coerce(parsed.ollamaLocal),
      ollamaCloud: coerce(parsed.ollamaCloud),
      openai: coerce(parsed.openai),
      anthropic: coerce(parsed.anthropic),
    };
  } catch {
    return DEFAULT;
  }
}

export async function writeLLMSettings(next: LLMSettings): Promise<void> {
  const root = getVaultPath();
  if (!root) throw new Error("No vault connected");
  const dir = join(root, ".cipher");
  const file = join(dir, "llm.json");
  const tmp = file + ".tmp";
  await mkdir(dir, { recursive: true });
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf-8");
  await rename(tmp, file);
  log.info("llm-settings", "saved", { provider: next.provider });
}

/** Update a single provider's config + switch active. */
export async function updateLLMSettings(patch: {
  provider?: ProviderId;
  ollamaLocal?: Partial<ProviderConfig>;
  ollamaCloud?: Partial<ProviderConfig>;
  openai?: Partial<ProviderConfig>;
  anthropic?: Partial<ProviderConfig>;
}): Promise<LLMSettings> {
  const current = await readLLMSettings();
  const merge = (a: ProviderConfig, b?: Partial<ProviderConfig>): ProviderConfig => ({
    apiKey: b?.apiKey !== undefined ? b.apiKey || undefined : a.apiKey,
    baseUrl: b?.baseUrl !== undefined ? b.baseUrl || undefined : a.baseUrl,
  });
  const next: LLMSettings = {
    provider: patch.provider ?? current.provider,
    ollamaLocal: merge(current.ollamaLocal, patch.ollamaLocal),
    ollamaCloud: merge(current.ollamaCloud, patch.ollamaCloud),
    openai: merge(current.openai, patch.openai),
    anthropic: merge(current.anthropic, patch.anthropic),
  };
  await writeLLMSettings(next);
  return next;
}
