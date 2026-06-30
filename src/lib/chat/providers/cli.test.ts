import { describe, it, expect } from "vitest";
import {
  buildClaudeCliArgs,
  buildOllamaCliArgs,
  composePrompt,
  parseCliChunk,
} from "./cli";
import type { ChatMessage } from "./types";

// ─── buildClaudeCliArgs ───────────────────────────────────────────────────────

describe("buildClaudeCliArgs", () => {
  it("returns the expected argv for a given model", () => {
    const args = buildClaudeCliArgs("claude-sonnet-4-6");
    expect(args).toEqual(["-p", "--model", "claude-sonnet-4-6", "--output-format", "text"]);
  });

  it("wires the model into --model arg", () => {
    const args = buildClaudeCliArgs("claude-opus-4-7");
    const idx = args.indexOf("--model");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("claude-opus-4-7");
  });

  it("includes headless flag -p", () => {
    expect(buildClaudeCliArgs("any-model")).toContain("-p");
  });

  it("includes --output-format text", () => {
    const args = buildClaudeCliArgs("any-model");
    const idx = args.indexOf("--output-format");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("text");
  });

  it("SECURITY: prompt text is NOT present in argv for any model", () => {
    const prompt = "Tell me a secret";
    const args = buildClaudeCliArgs("claude-haiku-4-5");
    // The prompt is never passed to this function — verify no leakage.
    for (const arg of args) {
      expect(arg).not.toContain(prompt);
    }
    // Additionally verify the function signature only takes model, not prompt.
    expect(args.join(" ")).not.toContain("Tell me");
  });

  it("SECURITY: model name with shell metacharacters does not break arg array", () => {
    // Even if someone passes a model with shell chars, they're safe as array args.
    const evilModel = "model; rm -rf /";
    const args = buildClaudeCliArgs(evilModel);
    // It's in the array as a literal string — no shell expansion occurs.
    expect(args[args.indexOf("--model") + 1]).toBe(evilModel);
    // But this is safe because spawn is called with shell:false.
  });
});

// ─── buildOllamaCliArgs ───────────────────────────────────────────────────────

describe("buildOllamaCliArgs", () => {
  it("returns ['run', model]", () => {
    expect(buildOllamaCliArgs("llama3.2:3b")).toEqual(["run", "llama3.2:3b"]);
  });

  it("wires the model as the second element", () => {
    const args = buildOllamaCliArgs("mistral");
    expect(args[0]).toBe("run");
    expect(args[1]).toBe("mistral");
  });

  it("SECURITY: prompt text is NOT present in argv", () => {
    const args = buildOllamaCliArgs("llama3.2:3b");
    expect(args).toHaveLength(2);
    // No prompt, no user input anywhere in the args.
    expect(args.join(" ")).toBe("run llama3.2:3b");
  });
});

// ─── composePrompt ────────────────────────────────────────────────────────────

describe("composePrompt", () => {
  it("includes user message content", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "Hello there" }];
    const prompt = composePrompt(msgs);
    expect(prompt).toContain("Hello there");
  });

  it("includes system message content at the top", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hi" },
    ];
    const prompt = composePrompt(msgs);
    const sysIdx = prompt.indexOf("You are a helpful assistant.");
    const userIdx = prompt.indexOf("Hi");
    expect(sysIdx).toBeGreaterThan(-1);
    expect(userIdx).toBeGreaterThan(-1);
    expect(sysIdx).toBeLessThan(userIdx);
  });

  it("flattens multiple system messages", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "Instruction one." },
      { role: "system", content: "Instruction two." },
      { role: "user", content: "Question" },
    ];
    const prompt = composePrompt(msgs);
    expect(prompt).toContain("Instruction one.");
    expect(prompt).toContain("Instruction two.");
  });

  it("includes assistant turns", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "What day is it?" },
      { role: "assistant", content: "It is Monday." },
      { role: "user", content: "Thanks" },
    ];
    const prompt = composePrompt(msgs);
    expect(prompt).toContain("It is Monday.");
    expect(prompt).toContain("Thanks");
  });

  it("handles empty messages array", () => {
    expect(composePrompt([])).toBe("");
  });

  it("returns a string (pure, no side effects)", () => {
    const msgs: ChatMessage[] = [{ role: "user", content: "test" }];
    const a = composePrompt(msgs);
    const b = composePrompt(msgs);
    expect(a).toBe(b);
  });
});

// ─── parseCliChunk ────────────────────────────────────────────────────────────

describe("parseCliChunk", () => {
  it("passes text through unchanged", () => {
    expect(parseCliChunk("hello world")).toBe("hello world");
  });

  it("passes partial lines through", () => {
    expect(parseCliChunk("partial line without newline")).toBe("partial line without newline");
  });

  it("passes newlines through", () => {
    expect(parseCliChunk("line1\nline2\n")).toBe("line1\nline2\n");
  });

  it("returns empty string for empty input", () => {
    expect(parseCliChunk("")).toBe("");
  });
});

// ─── Security: no prompt in argv (integration-style) ─────────────────────────

describe("SECURITY: prompt isolation", () => {
  it("claude args array never contains user content", () => {
    // Simulate what would happen if someone tried to inject via model name.
    const args = buildClaudeCliArgs("claude-sonnet-4-6");
    const userPromptChunk = "sensitive data";
    // Prompt is composed separately and written to stdin — never in args.
    const prompt = composePrompt([{ role: "user", content: userPromptChunk }]);
    // Verify the args don't contain the prompt.
    expect(args.join("\0")).not.toContain(userPromptChunk);
    // Verify the prompt IS in the composed string (for stdin).
    expect(prompt).toContain(userPromptChunk);
  });

  it("ollama args array never contains user content", () => {
    const args = buildOllamaCliArgs("llama3.2:3b");
    const userPromptChunk = "secret query";
    const prompt = composePrompt([{ role: "user", content: userPromptChunk }]);
    expect(args.join("\0")).not.toContain(userPromptChunk);
    expect(prompt).toContain(userPromptChunk);
  });
});
