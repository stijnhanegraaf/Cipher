import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock child_process at the module level so detectCli never shells out.
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return { ...actual, stat: vi.fn() };
});

import { execFile as execFileCb } from "child_process";
import { stat } from "fs/promises";
import { detectCli } from "./detect-cli";

const mockExecFile = execFileCb as unknown as ReturnType<typeof vi.fn>;
const mockStat = stat as unknown as ReturnType<typeof vi.fn>;

// execFile is promisify'd inside the module; we need to mock the callback form.
// The promisify wrapper calls execFile(cmd, args, opts, callback).
// We simulate that by making execFile invoke the last argument.
function mockExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
      cb(null, { stdout, stderr: "" });
    }
  );
}

function mockExecFileEnoent() {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: NodeJS.ErrnoException) => void) => {
      const err = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
      cb(err as NodeJS.ErrnoException);
    }
  );
}

function mockExecFileNonZero(output: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: unknown, cb: (err: Error & { stdout?: string; stderr?: string }) => void) => {
      const err = Object.assign(new Error("exit code 1"), { stdout: output, stderr: "" });
      cb(err);
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("detectCli", () => {
  it("returns available=true and parses semver from stdout", async () => {
    mockExecFileSuccess("ollama version 0.6.1\n");
    const result = await detectCli("ollama");
    expect(result.available).toBe(true);
    expect(result.version).toBe("0.6.1");
    expect(result.path).toBe("ollama");
  });

  it("parses claude version string", async () => {
    mockExecFileSuccess("Claude Code 1.2.3\n");
    const result = await detectCli("claude");
    expect(result.available).toBe(true);
    expect(result.version).toBe("1.2.3");
  });

  it("returns available=false when binary is not on PATH (ENOENT)", async () => {
    mockExecFileEnoent();
    const result = await detectCli("claude");
    expect(result.available).toBe(false);
    expect(result.version).toBeUndefined();
  });

  it("returns available=true when binary exits non-zero but has output", async () => {
    mockExecFileNonZero("claude 0.9.0 (dev)");
    const result = await detectCli("claude");
    expect(result.available).toBe(true);
    expect(result.version).toBe("0.9.0");
  });

  it("uses cliPath override instead of PATH binary when path is valid", async () => {
    // stat resolves (file exists)
    mockStat.mockResolvedValue({ isFile: () => true });
    mockExecFileSuccess("claude 1.0.0\n");
    const result = await detectCli("claude", "/usr/local/bin/claude");
    expect(result.available).toBe(true);
    expect(result.path).toBe("/usr/local/bin/claude");
  });

  it("returns available=false when cliPath does not exist", async () => {
    mockStat.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    const result = await detectCli("claude", "/nonexistent/claude");
    expect(result.available).toBe(false);
  });

  it("returns available=false when cliPath points to a directory", async () => {
    mockStat.mockResolvedValue({ isFile: () => false });
    const result = await detectCli("claude", "/usr/local/bin");
    expect(result.available).toBe(false);
  });

  it("never uses shell: the invocation goes through execFile, not exec", async () => {
    mockExecFileSuccess("ollama 0.6.1");
    await detectCli("ollama");
    // Verify execFile was called, not exec (which would indicate shell usage).
    expect(mockExecFile).toHaveBeenCalledTimes(1);
    // The mock receives (cmd, args, opts, callback) — args must be an array.
    const args = mockExecFile.mock.calls[0][1];
    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain("--version");
  });
});
