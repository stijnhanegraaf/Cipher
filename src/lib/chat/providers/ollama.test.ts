import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOllamaProvider } from "./ollama";
import type { ProviderConfig } from "@/lib/llm-settings";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** A fetch mock that hangs indefinitely but aborts correctly via AbortSignal. */
function hangingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      );
    }
  });
}

// ─── Timeout tests ───────────────────────────────────────────────────────────

describe("ollama status() — timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves to ok:false when /api/tags never responds (local)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch);

    const cfg: ProviderConfig = { baseUrl: "http://localhost:11434" };
    const provider = createOllamaProvider("ollama-local", cfg);

    const statusPromise = provider.status();
    // Advance fake clock past the 1500 ms abort window and flush microtasks.
    await vi.runAllTimersAsync();

    const result = await statusPromise;
    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
    expect(result.defaultModel).toBe("llama3.2:3b");
  });

  it("resolves to ok:false when /api/tags never responds (cloud with key)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(hangingFetch);

    const cfg: ProviderConfig = { apiKey: "test-key", baseUrl: "https://ollama.com" };
    const provider = createOllamaProvider("ollama-cloud", cfg);

    const statusPromise = provider.status();
    await vi.runAllTimersAsync();

    const result = await statusPromise;
    expect(result.ok).toBe(false);
    expect(result.models).toEqual([]);
  });
});

// ─── Success path tests ───────────────────────────────────────────────────────

describe("ollama status() — success path", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok:true with the model list when reachable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { name: "llama3.2:3b", modified_at: "", size: 0 },
            { name: "mistral:7b", modified_at: "", size: 0 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const cfg: ProviderConfig = { baseUrl: "http://localhost:11434" };
    const provider = createOllamaProvider("ollama-local", cfg);
    const result = await provider.status();

    expect(result.ok).toBe(true);
    expect(result.models).toContain("llama3.2:3b");
    expect(result.models).toContain("mistral:7b");
    expect(result.defaultModel).toBe("llama3.2:3b");
  });

  it("filters out nomic-embed-text models", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: [
            { name: "llama3.2:3b", modified_at: "", size: 0 },
            { name: "nomic-embed-text:latest", modified_at: "", size: 0 },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const cfg: ProviderConfig = {};
    const provider = createOllamaProvider("ollama-local", cfg);
    const result = await provider.status();

    expect(result.ok).toBe(true);
    expect(result.models).not.toContain("nomic-embed-text:latest");
    expect(result.models).toContain("llama3.2:3b");
  });

  it("returns ok:false with needsKey:true when 401 is returned", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 })
    );

    const cfg: ProviderConfig = { apiKey: "bad-key" };
    const provider = createOllamaProvider("ollama-cloud", cfg);
    const result = await provider.status();

    expect(result.ok).toBe(false);
    expect(result.needsKey).toBe(true);
  });
});

// ─── needsKey shortcut (no fetch needed) ────────────────────────────────────

describe("ollama status() — needsKey shortcut", () => {
  it("returns needsKey:true for ollama-cloud with no apiKey (no fetch)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const cfg: ProviderConfig = {};
    const provider = createOllamaProvider("ollama-cloud", cfg);
    const result = await provider.status();

    expect(result.ok).toBe(false);
    expect(result.needsKey).toBe(true);
    // fetch must NOT have been called — the shortcut returns before network access.
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.restoreAllMocks();
  });
});
