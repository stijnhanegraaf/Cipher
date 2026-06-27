/**
 * CLI provider — wraps local `claude` / `ollama` binaries.
 *
 * SECURITY CONTRACT (all of these are enforced, never bypassed):
 *   - spawn(cmd, argsArray) — never shell: true, never a shell string.
 *   - Prompt text is written to child stdin ONLY — never in argv.
 *   - cliPath is validated to be a file on disk before spawning.
 *   - No string interpolation into command arguments.
 */

import "server-only";
import { spawn } from "child_process";
import { stat } from "fs/promises";
import { detectCli } from "@/lib/chat/detect-cli";
import type { ChatMessage, ChatProvider, ProviderStatus } from "./types";
import { ProviderDownError, ProviderModelMissingError } from "./types";

// ─── Pure builders (injection-safe: model wired into argv; prompt via stdin) ─

/**
 * Build argv for `claude` CLI.
 * Prompt is sent via stdin — it is NEVER in these args.
 * `-p` = headless/print mode (non-interactive).
 * `--output-format text` = plain text output, no ANSI.
 */
export function buildClaudeCliArgs(model: string): string[] {
  return ["-p", "--model", model, "--output-format", "text"];
}

/**
 * Build argv for `ollama run` CLI.
 * Prompt is sent via stdin — it is NEVER in these args.
 */
export function buildOllamaCliArgs(model: string): string[] {
  return ["run", model];
}

// ─── Prompt composer ─────────────────────────────────────────────────────────

/**
 * Flatten a messages array into a single stdin prompt string.
 * System messages become a block at the top; then user/assistant turns follow.
 */
export function composePrompt(messages: ChatMessage[]): string {
  const parts: string[] = [];

  const systemMsgs = messages.filter((m) => m.role === "system");
  const convo = messages.filter((m) => m.role !== "system");

  if (systemMsgs.length > 0) {
    parts.push(systemMsgs.map((m) => m.content).join("\n\n"));
    parts.push(""); // blank line separator
  }

  for (const msg of convo) {
    if (msg.role === "user") {
      parts.push(`User: ${msg.content}`);
    } else if (msg.role === "assistant") {
      parts.push(`Assistant: ${msg.content}`);
    }
  }

  return parts.join("\n");
}

// ─── Chunk parser ─────────────────────────────────────────────────────────────

/**
 * Parse a raw stdout chunk from the CLI.
 * Both claude (--output-format text) and ollama (run) emit plain text to stdout.
 * This is a pass-through — the text IS the content delta.
 */
export function parseCliChunk(raw: string): string {
  return raw;
}

// ─── CLI path validation ──────────────────────────────────────────────────────

async function resolveCmd(kind: "claude" | "ollama", cliPath?: string): Promise<string> {
  if (cliPath) {
    // Validate cliPath is an existing file before using it.
    let s: Awaited<ReturnType<typeof stat>>;
    try {
      s = await stat(cliPath);
    } catch {
      throw new ProviderDownError(kind, cliPath);
    }
    if (!s.isFile()) throw new ProviderDownError(kind, cliPath);
    return cliPath;
  }
  return kind === "claude" ? "claude" : "ollama";
}

// ─── Provider factory ─────────────────────────────────────────────────────────

const STATIC_MODELS_CLAUDE = [
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];

export function createCliProvider(
  kind: "claude" | "ollama",
  cliPath?: string
): ChatProvider {
  const id = kind === "claude" ? "anthropic" : "ollama-local";
  const label = kind === "claude" ? "Anthropic Claude (CLI)" : "Ollama (CLI)";
  const binaryName = kind === "claude" ? "claude" : "ollama";

  return {
    id,
    label,

    async status(): Promise<ProviderStatus> {
      const detected = await detectCli(binaryName, cliPath);
      if (!detected.available) {
        return {
          ok: false,
          models: kind === "claude" ? STATIC_MODELS_CLAUDE : [],
          defaultModel: kind === "claude" ? "claude-sonnet-4-6" : "",
        };
      }
      // For Claude CLI, use the static model list (no API to enumerate).
      if (kind === "claude") {
        return {
          ok: true,
          models: STATIC_MODELS_CLAUDE,
          defaultModel: "claude-sonnet-4-6",
        };
      }
      // For Ollama CLI, try to list models via `ollama list`.
      try {
        const cmd = await resolveCmd(kind, cliPath);
        const models = await listOllamaCliModels(cmd);
        return {
          ok: true,
          models,
          defaultModel: models[0] ?? "llama3.2:3b",
        };
      } catch {
        return { ok: true, models: [], defaultModel: "llama3.2:3b" };
      }
    },

    async *streamChat(model: string, messages: ChatMessage[]): AsyncIterable<string> {
      const cmd = await resolveCmd(kind, cliPath);
      const args = kind === "claude"
        ? buildClaudeCliArgs(model)
        : buildOllamaCliArgs(model);
      const prompt = composePrompt(messages);

      yield* spawnAndStream(id, cmd, args, prompt);
    },
  };
}

// ─── Spawn + stream helper ────────────────────────────────────────────────────

async function* spawnAndStream(
  providerId: string,
  cmd: string,
  args: string[],
  stdinData: string
): AsyncIterable<string> {
  const child = spawn(cmd, args, {
    shell: false, // NEVER use shell — injection-safety guarantee
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Write prompt via stdin only — NEVER in args.
  child.stdin.write(stdinData, "utf-8");
  child.stdin.end();

  let stderrBuf = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrBuf += chunk.toString("utf-8");
  });

  const queue: string[] = [];
  let done = false;
  let error: Error | null = null;
  let resolve: (() => void) | null = null;

  const notify = () => { if (resolve) { resolve(); resolve = null; } };

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = parseCliChunk(chunk.toString("utf-8"));
    if (text) { queue.push(text); notify(); }
  });

  child.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      error = new ProviderDownError(providerId, cmd);
    } else {
      error = err;
    }
    done = true;
    notify();
  });

  child.on("close", (code: number | null) => {
    if (code !== 0 && code !== null) {
      if (!error) {
        // Non-zero exit — check stderr for clues.
        const stderr = stderrBuf.toLowerCase();
        if (stderr.includes("model") && (stderr.includes("not found") || stderr.includes("pull"))) {
          error = new ProviderModelMissingError(providerId, "requested model");
        } else {
          error = new ProviderDownError(providerId, cmd);
        }
      }
    }
    done = true;
    notify();
  });

  try {
    while (true) {
      // Drain any buffered chunks.
      while (queue.length > 0) {
        yield queue.shift()!;
      }
      if (done) {
        // Final drain after process exits.
        while (queue.length > 0) {
          yield queue.shift()!;
        }
        break;
      }
      // Wait for the next data/close/error event.
      await new Promise<void>((res) => { resolve = res; });
    }
  } finally {
    // Generator cleanup: kill the child if the caller abandoned the iterator.
    if (!done) {
      child.kill("SIGTERM");
    }
  }

  if (error) throw error;
}

// ─── Ollama CLI model list ────────────────────────────────────────────────────

async function listOllamaCliModels(cmd: string): Promise<string[]> {
  return new Promise((resolve) => {
    // Run `ollama list` — injection-safe: no user input in args.
    const child = spawn(cmd, ["list"], { shell: false, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout?.on("data", (c: Buffer) => { out += c.toString("utf-8"); });
    child.on("close", () => {
      const lines = out.trim().split("\n").slice(1); // skip header row
      const models = lines
        .map((l) => l.split(/\s+/)[0])
        .filter((n): n is string => !!n && !n.startsWith("nomic-embed-text"));
      resolve(models);
    });
    child.on("error", () => resolve([]));
  });
}
