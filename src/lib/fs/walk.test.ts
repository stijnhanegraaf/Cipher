import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { walkFiles, walkDirs } from "./walk";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "cipher-walk-"));
  await mkdir(join(root, "a/b"), { recursive: true });
  await mkdir(join(root, "node_modules/pkg"), { recursive: true });
  await mkdir(join(root, ".obsidian"), { recursive: true });
  await writeFile(join(root, "top.md"), "x");
  await writeFile(join(root, "a/one.md"), "x");
  await writeFile(join(root, "a/b/two.md"), "x");
  await writeFile(join(root, "a/note.txt"), "x");
  await writeFile(join(root, "node_modules/pkg/dep.md"), "x");
  await writeFile(join(root, ".obsidian/config.md"), "x");
  await writeFile(join(root, ".hidden.md"), "x");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("walkFiles", () => {
  it("lists .md files recursively as relative paths, sorted", async () => {
    const files = (await walkFiles(root, { extensions: [".md"] })).sort();
    expect(files).toEqual(["a/b/two.md", "a/one.md", "top.md"]);
  });

  it("ignores node_modules/.obsidian and dotfiles", async () => {
    const files = await walkFiles(root, { extensions: [".md"] });
    expect(files.some((f) => f.includes("node_modules"))).toBe(false);
    expect(files.some((f) => f.includes(".obsidian"))).toBe(false);
    expect(files).not.toContain(".hidden.md");
  });

  it("includes all files when extensions omitted", async () => {
    const files = await walkFiles(root);
    expect(files).toContain("a/note.txt");
  });

  it("respects maxDepth (0 = root only)", async () => {
    const files = await walkFiles(root, { extensions: [".md"], maxDepth: 0 });
    expect(files).toEqual(["top.md"]);
  });

  it("returns [] for a missing directory", async () => {
    expect(await walkFiles(join(root, "nope"))).toEqual([]);
  });
});

describe("walkDirs", () => {
  it("lists directories recursively, skipping ignored + dot dirs", async () => {
    const dirs = (await walkDirs(root)).sort();
    expect(dirs).toEqual(["a", "a/b"]);
  });
});
