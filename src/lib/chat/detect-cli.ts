/**
 * detectCli — probe whether a CLI binary is available on PATH (or at cliPath).
 *
 * Uses execFile (no shell) to avoid any injection risk.
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";

const execFile = promisify(execFileCb);

export interface CliDetectResult {
  available: boolean;
  version?: string;
  path?: string;
}

/**
 * Probe the binary by running `<binary> --version`.
 *
 * @param binary  - Name of the binary as found on PATH (e.g. "claude", "ollama").
 * @param cliPath - Optional absolute path override; takes precedence over PATH.
 */
export async function detectCli(binary: string, cliPath?: string): Promise<CliDetectResult> {
  const cmd = cliPath ?? binary;

  // If cliPath is given, verify it exists as a file before probing.
  if (cliPath) {
    try {
      const s = await stat(cliPath);
      if (!s.isFile()) return { available: false };
    } catch {
      return { available: false };
    }
  }

  try {
    const { stdout, stderr } = await execFile(cmd, ["--version"], { timeout: 5000 });
    const raw = (stdout || stderr || "").trim();
    // Extract a semver-like version string from the output.
    const match = raw.match(/(\d+\.\d+[\.\d]*)/);
    const version = match ? match[1] : raw.split("\n")[0].trim() || undefined;
    return { available: true, version: version || undefined, path: cmd };
  } catch (err) {
    // ENOENT = binary not found; timeout/non-zero = also unavailable.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { available: false };
    // Binary found but --version failed (non-zero exit). Still counts as available.
    // Some CLIs exit non-zero for --version; check if there's output.
    const anyOutput = (err as { stdout?: string; stderr?: string }).stdout
      ?? (err as { stdout?: string; stderr?: string }).stderr ?? "";
    if (anyOutput.trim()) {
      const match = anyOutput.trim().match(/(\d+\.\d+[\.\d]*)/);
      const version = match ? match[1] : anyOutput.trim().split("\n")[0].trim() || undefined;
      return { available: true, version: version || undefined, path: cmd };
    }
    return { available: false };
  }
}
