import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { setVaultPath } from "./vault-reader";
import { readLLMSettings, updateLLMSettings, writeLLMSettings } from "./llm-settings";

// llm-settings persists to <vault>/.cipher/llm.json — give each test a fresh vault.
let root: string;
const roots: string[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cipher-llm-"));
  roots.push(root);
  setVaultPath(root);
});

afterAll(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })));
});

describe("llm-settings mode/cliPath", () => {
  it("round-trips mode + cliPath for anthropic", async () => {
    await updateLLMSettings({ anthropic: { mode: "cli", cliPath: "/usr/local/bin/claude" } });
    const s = await readLLMSettings();
    expect(s.anthropic.mode).toBe("cli");
    expect(s.anthropic.cliPath).toBe("/usr/local/bin/claude");
  });

  it("round-trips mode for ollama-local", async () => {
    await updateLLMSettings({ ollamaLocal: { mode: "cli" } });
    const s = await readLLMSettings();
    expect(s.ollamaLocal.mode).toBe("cli");
  });

  it("coerce rejects an invalid mode → undefined", async () => {
    await updateLLMSettings({}); // creates a valid baseline .cipher/llm.json
    // Hand-write a corrupt mode/cliPath into the persisted JSON, then read back through coerce.
    const file = join(root, ".cipher", "llm.json");
    const raw = JSON.parse(await readFile(file, "utf-8"));
    raw.anthropic = { mode: "banana", cliPath: 5 };
    await writeFile(file, JSON.stringify(raw), "utf-8");
    const s = await readLLMSettings();
    expect(s.anthropic.mode).toBeUndefined(); // invalid mode dropped
    expect(s.anthropic.cliPath).toBeUndefined(); // non-string cliPath dropped
  });

  it("defaults: a fresh vault has no mode set (API by default)", async () => {
    const s = await readLLMSettings();
    expect(s.anthropic.mode).toBeUndefined();
    expect(s.ollamaLocal.mode).toBeUndefined();
  });

  it("switching one provider's config preserves the others' keys", async () => {
    await updateLLMSettings({ openai: { apiKey: "sk-openai" }, anthropic: { apiKey: "sk-anthropic" } });
    await updateLLMSettings({ anthropic: { mode: "cli" } }); // change only anthropic mode
    const s = await readLLMSettings();
    expect(s.openai.apiKey).toBe("sk-openai"); // untouched
    expect(s.anthropic.apiKey).toBe("sk-anthropic"); // key preserved across the mode change
    expect(s.anthropic.mode).toBe("cli");
  });

  it("writeLLMSettings + readLLMSettings persists the active provider", async () => {
    await writeLLMSettings({
      provider: "anthropic",
      ollamaLocal: { mode: "cli" },
      ollamaCloud: {},
      openai: {},
      anthropic: { apiKey: "sk-x", mode: "api" },
    });
    const s = await readLLMSettings();
    expect(s.provider).toBe("anthropic");
    expect(s.ollamaLocal.mode).toBe("cli");
    expect(s.anthropic.mode).toBe("api");
  });
});
